#!/usr/bin/env python3
"""Run Dwn SHIFT:  python3 play.py   ->  opens http://localhost:8080

A small static server for the game:
  * never lets the browser cache anything (Cache-Control: no-store);
  * stamps index.html as it is served: every game script and module gets its
    file's modification time as a version (world.js?v=..., and an import-map
    entry for each world/*.js), so a browser can never mix old and new files.
    A stale module from an earlier server is what left the game stuck on its
    loading screen (and, before that, on the retired 2D simulator).
"""
import http.server, socketserver, os, re, json, webbrowser, threading

PORT = int(os.environ.get('PORT', 8080))
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


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def do_GET(self):
        path = self.path.split('?')[0]
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
    with Server(('127.0.0.1', PORT), Handler) as httpd:
        url = f'http://localhost:{PORT}'
        print(f'Dwn SHIFT is running at {url}  (Ctrl+C to stop)')
        if not os.environ.get('NO_OPEN'):
            threading.Timer(.8, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nstopped')
