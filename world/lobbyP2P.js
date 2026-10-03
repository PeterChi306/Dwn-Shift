/* Lobbies without a server (2026-10-02). On a static host (the Vercel site)
 * there is no play.py to run /lobby, so the player who creates a lobby
 * becomes its server: this file is play.py's lobby logic in JavaScript
 * (LobbyServer) plus a WebRTC transport through the public PeerJS broker
 * (vendor/peerjs.min.js; 0.peerjs.com signals, STUN/TURN connect). The host
 * registers as `dwnshift-<CODE>`; friends dial that id with the code. Every
 * message is the same JSON the WebSocket server speaks, so world/online.js
 * cannot tell the difference.
 */
const PREFIX = 'dwnshift-', CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', MAX_PLAYERS = 10;

let loading = null;
/** Load PeerJS on first use. */
function peerLib() {
  if (window.peerjs?.Peer) return Promise.resolve(window.peerjs.Peer);
  return loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = new URL('../vendor/peerjs.min.js', import.meta.url).href;
    s.onload = () => window.peerjs?.Peer ? resolve(window.peerjs.Peer) : reject(new Error('PeerJS did not load'));
    s.onerror = () => reject(new Error('PeerJS did not load')); document.head.append(s);
  });
}
export const newCode = () => Array.from({length: 5}, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

/** play.py's lobby logic for ONE lobby, run by its host. Connections: {id, name, build, joined, send(obj)}. */
class LobbyServer {
  constructor(code) { this.code = code; this.L = null; this.conns = new Set(); this.next = 1; }
  view() { const L = this.L; return {code: L.code, name: L.name, host: L.host, max: L.max, private: L.private, settings: L.settings, players: L.members.map(c => ({id: c.id, name: c.name, build: c.build}))}; }
  broadcast(obj, skip = null) { for (const c of [...(this.L?.members || [])]) if (c !== skip) c.send(obj); }
  add(c) { c.id = 'p' + (this.next++); c.name = 'Driver'; c.build = null; c.lobby = false; this.conns.add(c); }
  drop(c) { this.leave(c); this.conns.delete(c); }
  leave(c) {
    const L = this.L; if (!L || !c.lobby) return; c.lobby = false;
    L.members = L.members.filter(m => m !== c);
    if (!L.members.length) { this.L = null; return; }
    this.broadcast({t: 'peer-leave', id: c.id});
    if (L.host === c.id) { L.host = L.members.reduce((a, b) => (a.joined <= b.joined ? a : b)).id; this.broadcast({t: 'host', id: L.host}); }
  }
  join(c) {
    const L = this.L;
    if (L.members.length >= L.max) { c.send({t: 'error', msg: `That lobby is full (${L.members.length}/${L.max}).`}); return; }
    c.lobby = true; c.joined = performance.now(); L.members.push(c);
    c.send({t: 'joined', you: c.id, lobby: this.view()});
    this.broadcast({t: 'peer-join', id: c.id, name: c.name, build: c.build}, c);
  }
  handle(c, m) {
    const t = m?.t, L = this.L;
    if (t === 'state') { if (L && c.lobby) this.broadcast({t: 'state', id: c.id, s: m.s}, c); return; }
    if (t === 'hello') { c.name = String(m.name || 'Driver').slice(0, 20).trim() || 'Driver'; c.build = m.build; c.send({t: 'welcome', id: c.id, share: false, lan: [], p2p: true}); }
    else if (t === 'list') c.send({t: 'lobbies', list: L && !L.private ? [{code: L.code, name: L.name, players: L.members.length, max: L.max, host: L.members.find(p => p.id === L.host)?.name || ''}] : []});
    else if (t === 'create') {
      if (!L) this.L = {code: this.code, name: String(m.name || c.name + "'s lobby").slice(0, 32), host: c.id, max: Math.max(2, Math.min(MAX_PLAYERS, +m.max || MAX_PLAYERS)), private: !!m.private, settings: m.settings || {}, members: []};
      this.join(c);
    } else if (t === 'join') {
      if (!this.L || String(m.code || '').toUpperCase().trim() !== this.code) c.send({t: 'error', msg: 'No lobby with that code.'});
      else if (!c.lobby) this.join(c);
    } else if (t === 'leave') { this.leave(c); c.send({t: 'left'}); }
    else if (!L || !c.lobby) return;
    else if (t === 'build') { c.build = m.build; this.broadcast({t: 'build', id: c.id, build: c.build}, c); }
    else if (t === 'name') { c.name = String(m.name || 'Driver').slice(0, 20); this.broadcast({t: 'name', id: c.id, name: c.name}); }
    else if (t === 'chat') { const text = String(m.text || '').slice(0, 200).trim(); if (text) this.broadcast({t: 'chat', id: c.id, name: c.name, text}); }
    else if (['settings', 'clock', 'kick'].includes(t) && L.host !== c.id) c.send({t: 'error', msg: 'Only the host can do that.'});
    else if (t === 'settings') { L.settings = m.settings || {}; this.broadcast({t: 'settings', settings: L.settings, by: c.id}); }
    else if (t === 'clock') this.broadcast({t: 'clock', hour: m.hour}, c);
    else if (t === 'kick') { const v = L.members.find(p => p.id === m.id && p !== c); if (v) { v.send({t: 'kicked'}); this.leave(v); v.close?.(); } }
    else if (t === 'ping') c.send({t: 'pong', at: m.at});
  }
}

/** Host a lobby: registers `dwnshift-<code>` and serves it. Resolves to a
 *  transport {send, close} for the host's own client (a loopback connection). */
export async function hostLobby(code, onMessage, onClose) {
  const Peer = await peerLib();
  const peer = new Peer(PREFIX + code, {debug: 0});
  await new Promise((res, rej) => { peer.once('open', res); peer.once('error', rej); });
  const server = new LobbyServer(code);
  // The host's own client talks to the server directly.
  const self = {send: obj => queueMicrotask(() => onMessage(obj))};
  server.add(self);
  peer.on('connection', dc => {
    const c = {send: obj => { if (dc.open) dc.send(JSON.stringify(obj)); }, close: () => dc.close()};
    dc.on('open', () => server.add(c));
    dc.on('data', d => { let m; try { m = typeof d === 'string' ? JSON.parse(d) : d; } catch { return; } server.handle(c, m); });
    dc.on('close', () => server.drop(c));
    dc.on('error', () => server.drop(c));
  });
  peer.on('disconnected', () => { try { peer.reconnect(); } catch {} });
  return {
    p2p: 'host',
    send: m => server.handle(self, m),
    close: () => { for (const c of server.conns) if (c !== self) c.send({t: 'left'}); peer.destroy(); onClose?.(); },
  };
}

/** Join a lobby hosted in someone's browser. Resolves to a transport {send, close}. */
export async function joinLobby(code, onMessage, onClose) {
  const Peer = await peerLib();
  const peer = new Peer({debug: 0});
  await new Promise((res, rej) => { peer.once('open', res); peer.once('error', rej); });
  const dc = peer.connect(PREFIX + String(code).toUpperCase().trim(), {serialization: 'raw', reliable: true});
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('No lobby with that code (or the host is offline).')), 12000);
    dc.on('open', () => { clearTimeout(t); res(); });
    dc.on('error', e => { clearTimeout(t); rej(e); });
    peer.on('error', e => { clearTimeout(t); rej(e.type === 'peer-unavailable' ? new Error('No lobby with that code (or the host is offline).') : e); });
  });
  dc.on('data', d => { let m; try { m = typeof d === 'string' ? JSON.parse(d) : d; } catch { return; } onMessage(m); });
  dc.on('close', () => { onClose?.(); peer.destroy(); });
  return {p2p: 'guest', send: m => { if (dc.open) dc.send(JSON.stringify(m)); }, close: () => { dc.close(); peer.destroy(); }};
}
