#!/usr/bin/env python3
"""Run Dwn SHIFT:  python3 play.py   ->  opens http://localhost:8080
                  python3 play.py --share   ->  friends on your network can join your lobbies

Also the multiplayer lobby server (2026-10-01): a WebSocket at /lobby, standard
library only. Lobbies are rooms of up to 10 players with a short code; the
player who creates one is its host and owns its settings (traffic, time of
day, collisions, the meet point); if the host leaves, the longest-standing
player takes over. The server relays: each car's state ~15 times a second,
builds, chat and settings. Nothing is simulated here.

A small static server for the game:
  * never lets the browser cache anything (Cache-Control: no-store);
  * stamps index.html as it is served: every game script and module gets its
    file's modification time as a version (world.js?v=..., and an import-map
    entry for each world/*.js), so a browser can never mix old and new files.
    A stale module from an earlier server is what left the game stuck on its
    loading screen (and, before that, on the retired 2D simulator).
"""
import http.server, socketserver, os, re, json, webbrowser, threading, sys, socket, struct, hashlib, base64, random, time

PORT = int(os.environ.get('PORT', 8080))
SHARE = '--share' in sys.argv or os.environ.get('SHARE') == '1'
HOST = os.environ.get('HOST') or ('0.0.0.0' if SHARE else '127.0.0.1')
ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)


def stamp(html):
    v = lambda p: str(int(os.path.getmtime(os.path.join(ROOT, p))))
    for f in ('world.js', 'world.css', 'game.js', 'style.css'):
        html = re.sub(r'(["\'])' + re.escape(f) + r'(\?v=[^"\']*)?\1', lambda m: f'{m.group(1)}{f}?v={v(f)}{m.group(1)}', html)
    # Import map: every module under world/ at its current version.
    m = re.search(r'<script type="importmap">(.*?)</script>', html, re.S)
    if m:
        imap = json.loads(m.group(1))
        for name in sorted(os.listdir(os.path.join(ROOT, 'world'))):
            if name.endswith('.js'):
                imap['imports'][f'./world/{name}'] = f'./world/{name}?v={v("world/" + name)}'
        html = html[:m.start(1)] + json.dumps(imap) + html[m.end(1):]
    return html


# ------------------------------------------------------------------ lobbies
MAX_PLAYERS = 10
LOCK = threading.RLock()
LOBBIES = {}          # code -> {code, name, host, max, private, settings, members: [Client]}
CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'


def lan_addresses():
    out = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('10.255.255.255', 1)); out.append(s.getsockname()[0]); s.close()
    except OSError:
        pass
    return out


class Client:
    """One WebSocket connection: a player."""
    def __init__(self, sock):
        self.sock = sock; self.wlock = threading.Lock(); self.id = ''.join(random.choice('abcdefghijkmnpqrstuvwxyz23456789') for _ in range(6))
        self.name = 'Driver'; self.build = None; self.lobby = None; self.alive = True; self.joined = 0

    def send(self, obj):
        data = json.dumps(obj, separators=(',', ':')).encode('utf-8')
        n = len(data)
        head = bytes([0x81, n]) if n < 126 else bytes([0x81, 126]) + struct.pack('>H', n) if n < 65536 else bytes([0x81, 127]) + struct.pack('>Q', n)
        try:
            with self.wlock:
                self.sock.sendall(head + data)
        except OSError:
            self.alive = False

    def recv(self):
        """The next text message (str), or None when the socket closes."""
        def exact(k):
            b = b''
            while len(b) < k:
                chunk = self.sock.recv(k - len(b))
                if not chunk:
                    raise ConnectionError
                b += chunk
            return b
        msg = b''
        while True:
            h = exact(2)
            fin, op, masked, n = h[0] & 0x80, h[0] & 0x0f, h[1] & 0x80, h[1] & 0x7f
            if n == 126: n = struct.unpack('>H', exact(2))[0]
            elif n == 127: n = struct.unpack('>Q', exact(8))[0]
            if n > 1 << 20:
                raise ConnectionError
            mask = exact(4) if masked else b'\0\0\0\0'
            data = bytes(b ^ mask[i % 4] for i, b in enumerate(exact(n)))
            if op == 8:
                return None
            if op == 9:
                with self.wlock:
                    self.sock.sendall(bytes([0x8a, len(data)]) + data)
                continue
            if op == 10:
                continue
            msg += data
            if fin:
                return msg.decode('utf-8', 'replace')


def lobby_view(L):
    return {'code': L['code'], 'name': L['name'], 'host': L['host'], 'max': L['max'], 'private': L['private'], 'settings': L['settings'],
            'players': [{'id': c.id, 'name': c.name, 'build': c.build} for c in L['members']]}


def broadcast(L, obj, skip=None):
    for c in list(L['members']):
        if c is not skip:
            c.send(obj)


def leave(c):
    with LOCK:
        L = LOBBIES.get(c.lobby) if c.lobby else None
        c.lobby = None
        if not L:
            return
        if c in L['members']:
            L['members'].remove(c)
        if not L['members']:
            del LOBBIES[L['code']]
            return
        broadcast(L, {'t': 'peer-leave', 'id': c.id})
        if L['host'] == c.id:
            L['host'] = min(L['members'], key=lambda m: m.joined).id
            broadcast(L, {'t': 'host', 'id': L['host']})


def join(c, L):
    if len(L['members']) >= L['max']:
        c.send({'t': 'error', 'msg': 'That lobby is full (%d/%d).' % (len(L['members']), L['max'])}); return
    leave(c)
    c.lobby = L['code']; c.joined = time.time(); L['members'].append(c)
    c.send({'t': 'joined', 'you': c.id, 'lobby': lobby_view(L)})
    broadcast(L, {'t': 'peer-join', 'id': c.id, 'name': c.name, 'build': c.build}, skip=c)


def handle(c, m):
    t = m.get('t')
    if t == 'state':
        L = LOBBIES.get(c.lobby)
        if L:
            broadcast(L, {'t': 'state', 'id': c.id, 's': m.get('s')}, skip=c)
        return
    with LOCK:
        L = LOBBIES.get(c.lobby) if c.lobby else None
        if t == 'hello':
            c.name = str(m.get('name') or 'Driver')[:20].strip() or 'Driver'; c.build = m.get('build')
            c.send({'t': 'welcome', 'id': c.id, 'share': SHARE, 'lan': ['http://%s:%d/' % (a, PORT) for a in lan_addresses()] if SHARE else []})
        elif t == 'list':
            c.send({'t': 'lobbies', 'list': [{'code': L2['code'], 'name': L2['name'], 'players': len(L2['members']), 'max': L2['max'],
                     'host': next((p.name for p in L2['members'] if p.id == L2['host']), '')} for L2 in LOBBIES.values() if not L2['private']]})
        elif t == 'create':
            code = ''.join(random.choice(CODE_CHARS) for _ in range(5))
            while code in LOBBIES:
                code = ''.join(random.choice(CODE_CHARS) for _ in range(5))
            L2 = {'code': code, 'name': str(m.get('name') or c.name + "'s lobby")[:32], 'host': c.id, 'max': max(2, min(MAX_PLAYERS, int(m.get('max') or MAX_PLAYERS))),
                  'private': bool(m.get('private')), 'settings': m.get('settings') or {}, 'members': []}
            LOBBIES[code] = L2
            join(c, L2)
        elif t == 'join':
            L2 = LOBBIES.get(str(m.get('code') or '').upper().strip())
            if not L2:
                c.send({'t': 'error', 'msg': 'No lobby with that code.'})
            elif c.lobby != L2['code']:
                join(c, L2)
        elif t == 'leave':
            leave(c); c.send({'t': 'left'})
        elif not L:
            return
        elif t == 'build':
            c.build = m.get('build'); broadcast(L, {'t': 'build', 'id': c.id, 'build': c.build}, skip=c)
        elif t == 'name':
            c.name = str(m.get('name') or 'Driver')[:20]; broadcast(L, {'t': 'name', 'id': c.id, 'name': c.name})
        elif t == 'chat':
            text = str(m.get('text') or '')[:200].strip()
            if text:
                broadcast(L, {'t': 'chat', 'id': c.id, 'name': c.name, 'text': text})
        elif t in ('settings', 'clock', 'kick') and L['host'] != c.id:
            c.send({'t': 'error', 'msg': 'Only the host can do that.'})
        elif t == 'settings':
            L['settings'] = m.get('settings') or {}; broadcast(L, {'t': 'settings', 'settings': L['settings'], 'by': c.id})
        elif t == 'clock':
            broadcast(L, {'t': 'clock', 'hour': m.get('hour')}, skip=c)
        elif t == 'kick':
            victim = next((p for p in L['members'] if p.id == m.get('id') and p is not c), None)
            if victim:
                victim.send({'t': 'kicked'}); leave(victim)
        elif t == 'ping':
            c.send({'t': 'pong', 'at': m.get('at')})


def serve_lobby(handler):
    key = handler.headers.get('Sec-WebSocket-Key')
    if not key or handler.headers.get('Upgrade', '').lower() != 'websocket':
        handler.send_error(400); return
    accept = base64.b64encode(hashlib.sha1((key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
    handler.send_response_only(101)
    handler.send_header('Upgrade', 'websocket'); handler.send_header('Connection', 'Upgrade'); handler.send_header('Sec-WebSocket-Accept', accept)
    http.server.BaseHTTPRequestHandler.end_headers(handler)
    handler.wfile.flush()
    sock = handler.connection; sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1); sock.settimeout(None)
    c = Client(sock)
    try:
        while c.alive:
            raw = c.recv()
            if raw is None:
                break
            try:
                m = json.loads(raw)
            except ValueError:
                continue
            if isinstance(m, dict):
                handle(c, m)
    except (ConnectionError, OSError):
        pass
    finally:
        c.alive = False
        leave(c)
        try:
            sock.close()
        except OSError:
            pass
    handler.close_connection = True


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/lobby':
            serve_lobby(self)
            return
        if path in ('/', '/index.html'):
            body = stamp(open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, *args):
        pass


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == '__main__':
    with Server((HOST, PORT), Handler) as httpd:
        url = f'http://localhost:{PORT}'
        print(f'Dwn SHIFT is running at {url}  (Ctrl+C to stop)')
        if SHARE:
            for a in lan_addresses():
                print(f'  friends on your network: http://{a}:{PORT}/  (online lobbies: Menu > Online)')
        else:
            print('  lobbies are local to this computer; run with --share to let friends join')
        if not os.environ.get('NO_OPEN'):
            threading.Timer(.8, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nstopped')
