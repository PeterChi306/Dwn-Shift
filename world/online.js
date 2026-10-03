/* Online lobbies (2026-10-01): up to 10 players cruising Los Santerra together.
 *
 * The server is play.py's /lobby WebSocket (it only relays). Where there is
 * none (a static host such as the Vercel site), lobbies go peer-to-peer: the
 * creator's browser runs the lobby (world/lobbyP2P.js) and friends join with
 * the code (2026-10-02). Each client
 * sends its car ~15 times a second; everyone else's car is drawn from those
 * snapshots, 120 ms in the past and interpolated, so motion stays smooth
 * through network jitter. Remote cars wear their owner's workshop build,
 * light their brake lamps and headlights, spin and steer their wheels, can be
 * bumped (unless the lobby is in ghost mode), carry a name tag, and make a
 * small engine noise when close — enough for a car meet to sound like one.
 * A player out of their car walks as a simple figure.
 *
 * The host owns the lobby's settings (traffic, time of day, how time passes,
 * collisions, the meet point); world.js applies them through `hooks`.
 */
import * as T from 'three';
import {hostLobby, joinLobby, newCode} from './lobbyP2P.js';
import {Cluster} from './carCluster.js';

const SEND_HZ = 15, DELAY = .12;
const COLORS = ['#4f86ff', '#ff5a4a', '#ffc23a', '#3ee08a', '#c46bff', '#ff8a2a', '#2fd6e0', '#ff4fae', '#a8e04a', '#e8e8e8'];

export class Online {
  /** hooks: {scene, physics, root, makeCar(info) -> vehicle, disposeCar(vehicle), local() -> state, notify(msg), apply(settings, why), onChange(), audio() -> {ctx, out} | null} */
  constructor(hooks) {
    this.h = hooks; this.ws = null; this.status = 'offline'; this.id = null; this.lobby = null; this.peers = new Map();
    this.lobbies = []; this.error = ''; this.lastSend = 0; this.lastClock = 0; this.share = null;
    this.name = load('dwnName') || 'Driver ' + Math.floor(100 + Math.random() * 900);
    // Name tags and chat live in the HUD layer.
    this.tags = document.createElement('div'); this.tags.className = 'online-tags'; hooks.root.append(this.tags);
    this.chatBox = document.createElement('div'); this.chatBox.className = 'online-chat'; this.chatBox.innerHTML = '<div class="online-log"></div><input class="online-input" maxlength="200" placeholder="Say something · Enter to send, Esc to close" hidden>';
    hooks.root.append(this.chatBox);
    this.input = this.chatBox.querySelector('input'); this.log = this.chatBox.querySelector('.online-log');
    this.input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { const t = this.input.value.trim(); if (t) this.send({t: 'chat', text: t}); this.closeChat(); }
      if (e.key === 'Escape') this.closeChat();
    });
    this.badge = document.createElement('div'); this.badge.className = 'online-badge'; this.badge.hidden = true; hooks.root.append(this.badge);
  }
  get connected() { return this.status === 'online' || this.status === 'p2p'; }
  get p2p() { return this.status === 'p2p'; }
  get inLobby() { return !!this.lobby; }
  get isHost() { return !!this.lobby && this.lobby.host === this.id; }
  get players() { return this.lobby ? this.lobby.players : []; }
  color(id) { const i = this.players.findIndex(p => p.id === id); return COLORS[(i < 0 ? 0 : i) % COLORS.length]; }

  /* ------------------------------------------------------------ connection */
  /** Connect to play.py's lobby server. Automatic retries back off (every 6 s at most); `now` (the Retry button) skips that. */
  connect(now = false) {
    if (this.ws && this.ws.readyState === 1) return Promise.resolve();
    if (this.ws && this.ws.readyState === 0 && this.pending) return this.pending;      // already dialling: wait for it
    if (!now && performance.now() - (this.lastTry || -1e9) < 6000) return Promise.resolve();
    this.lastTry = performance.now();
    this.status = 'connecting'; this.h.onChange();
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/lobby';
    return this.pending = new Promise(resolve => {
      let ws;
      try { ws = new WebSocket(url); } catch { this.status = 'offline'; this.error = 'This server has no lobby support (start the game with play.py).'; this.h.onChange(); resolve(); return; }
      this.ws = ws;
      ws.onopen = () => { this.status = 'online'; this.error = ''; this.send({t: 'hello', name: this.name, build: this.h.local().buildInfo}); this.send({t: 'list'}); this.h.onChange(); resolve(); };
      ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } this.receive(m); };
      let opened = false; ws.addEventListener('open', () => { opened = true; });
      ws.onclose = () => {
        const was = this.lobby; this.ws = null;
        if (!opened && !this.tx) {
          // No lobby server here (a static host): lobbies run peer-to-peer instead.
          this.status = 'p2p'; this.error = ''; this.h.onChange(); resolve(); return;
        }
        if (this.tx) { resolve(); return; }
        this.status = 'offline'; this.clearPeers(); this.lobby = null; this.badge.hidden = true;
        if (was) this.h.notify('Online · disconnected from the lobby server');
        else if (!this.error) this.error = 'Could not reach the lobby server.';
        this.h.onChange(); resolve();
      };
    });
  }
  send(m) { if (this.tx) this.tx.send(m); else if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); }
  setName(n) { this.name = (n || '').slice(0, 20).trim() || this.name; save('dwnName', this.name); this.send({t: 'name', name: this.name}); this.send({t: 'hello', name: this.name, build: this.h.local().buildInfo}); }
  async create(opts) {
    if (!await this.ready()) return;
    if (this.p2p) {
      // Peer-to-peer: this browser becomes the lobby's server.
      this.dropTx();
      for (let k = 0; k < 4 && !this.tx; k++) {
        try { this.tx = await hostLobby(newCode(), m => this.receive(m), () => this.p2pClosed()); }
        catch (e) { if (k === 3) { this.error = 'Could not open a lobby: ' + (e?.message || e); this.h.notify('Online · could not open the lobby'); this.h.onChange(); return; } }
      }
      this.send({t: 'hello', name: this.name, build: this.h.local().buildInfo});
    }
    this.send({t: 'create', ...opts});
  }
  async join(code) {
    if (!await this.ready()) return;
    if (this.p2p) {
      this.dropTx(); this.status = 'p2p'; this.error = ''; this.h.onChange();
      try { this.tx = await joinLobby(code, m => this.receive(m), () => this.p2pClosed()); }
      catch (e) { this.error = e?.message || 'Could not reach that lobby.'; this.h.notify('Online · ' + this.error); this.h.onChange(); return; }
      this.send({t: 'hello', name: this.name, build: this.h.local().buildInfo});
    }
    this.send({t: 'join', code});
  }
  async refresh() { if (await this.ready()) { if (this.p2p) { this.lobbies = this.tx ? this.lobbies : []; this.h.onChange(); } else this.send({t: 'list'}); } }
  dropTx() { const tx = this.tx; this.tx = null; try { tx?.close(); } catch {} }
  p2pClosed() { if (!this.tx) return; this.tx = null; const was = this.lobby; this.clearPeers(); this.lobby = null; this.badge.hidden = true; if (was) this.h.notify('Online · the lobby closed'); this.h.onChange(); }
  /** Connected (trying now if not); says so when the server cannot be reached. */
  async ready() {
    await this.connect(true);
    if (this.connected) return true;
    this.error = 'Could not get online. Check your internet connection and try again.';
    this.h.notify('Online · the lobby server is not reachable'); this.h.onChange(); return false;
  }
  leave() { this.send({t: 'leave'}); if (this.tx) { const tx = this.tx; this.tx = null; setTimeout(() => { try { tx.close(); } catch {} }, 300); } this.lobby = null; this.clearPeers(); this.badge.hidden = true; this.h.onChange(); }
  setSettings(settings) { if (!this.isHost) return; this.lobby.settings = settings; this.send({t: 'settings', settings}); this.h.apply(settings, 'host'); this.h.onChange(); }
  kick(id) { this.send({t: 'kick', id}); }
  sendBuild() { if (this.inLobby) this.send({t: 'build', build: this.h.local().buildInfo}); }

  receive(m) {
    switch (m.t) {
      case 'welcome': this.id = m.id; this.share = m.lan?.length ? m.lan[0] : null; this.shareOn = m.share; break;
      case 'lobbies': this.lobbies = m.list; break;
      case 'joined': {
        this.clearPeers(); this.id = m.you; this.lobby = m.lobby; this.error = '';
        for (const p of m.lobby.players) if (p.id !== this.id) this.addPeer(p);
        this.h.apply(m.lobby.settings || {}, this.isHost ? 'created' : 'joined');
        this.h.notify(this.isHost ? `Lobby ${m.lobby.code} created · invite friends with the code` : `Joined ${m.lobby.name} · ${m.lobby.players.length}/${m.lobby.max}`);
        this.say(null, this.isHost ? `You created ${m.lobby.name}. Code ${m.lobby.code}.` : `You joined ${m.lobby.name}.`);
        break;
      }
      case 'peer-join': if (this.lobby) { this.lobby.players.push({id: m.id, name: m.name, build: m.build}); this.addPeer(m); this.say(null, `${m.name} joined`); } break;
      case 'peer-leave': {
        const p = this.peers.get(m.id); if (p) { this.say(null, `${p.name} left`); this.removePeer(m.id); }
        if (this.lobby) this.lobby.players = this.lobby.players.filter(q => q.id !== m.id);
        break;
      }
      case 'host': if (this.lobby) { this.lobby.host = m.id; this.say(null, m.id === this.id ? 'You are the host now' : `${this.peers.get(m.id)?.name || 'Someone'} is the host now`); } break;
      case 'state': { const p = this.peers.get(m.id); if (p && Array.isArray(m.s)) this.snapshot(p, m.s); return; }
      case 'build': { const p = this.peers.get(m.id); if (p) { p.info = m.build; const q = this.lobby?.players.find(x => x.id === m.id); if (q) q.build = m.build; this.rebuild(p); } break; }
      case 'name': { const p = this.peers.get(m.id); if (p) { p.name = m.name; p.tag.querySelector('b').textContent = m.name; } const q = this.lobby?.players.find(x => x.id === m.id); if (q) q.name = m.name; break; }
      case 'chat': this.say(m.id === this.id ? 'You' : m.name, m.text, m.id); return;
      case 'settings': if (this.lobby) { this.lobby.settings = m.settings; if (m.by !== this.id) this.h.apply(m.settings, 'update'); } break;
      case 'clock': this.h.apply({hour: m.hour}, 'clock'); return;
      case 'kicked': this.lobby = null; this.clearPeers(); this.h.notify('The host removed you from the lobby'); break;
      case 'left': this.lobby = null; this.clearPeers(); break;
      case 'error': this.error = m.msg; this.h.notify(m.msg); break;
    }
    this.h.onChange();
  }

  /* --------------------------------------------------------------- peers */
  addPeer(p) {
    if (this.peers.has(p.id)) return;
    const tag = document.createElement('div'); tag.className = 'online-tag'; tag.innerHTML = `<i></i><b></b><small></small>`; tag.querySelector('b').textContent = p.name; this.tags.append(tag);
    const peer = {id: p.id, name: p.name, info: p.build, snaps: [], vehicle: null, body: null, tag, avatar: null, spin: 0, voice: null, last: null};
    this.peers.set(p.id, peer); this.rebuild(peer);
  }
  rebuild(peer) {
    const old = peer.vehicle;
    peer.vehicle = this.h.makeCar(peer.info || {});
    peer.vehicle.object.visible = false; this.h.scene.add(peer.vehicle.object);
    if (old) { peer.vehicle.object.position.copy(old.object.position); peer.vehicle.object.quaternion.copy(old.object.quaternion); peer.vehicle.object.visible = old.object.visible; this.h.scene.remove(old.object); this.h.disposeCar(old); }
    peer.tag.querySelector('i').style.background = this.color(peer.id);
  }
  removePeer(id) {
    const p = this.peers.get(id); if (!p) return;
    if (p.vehicle) { this.h.scene.remove(p.vehicle.object); this.h.disposeCar(p.vehicle); }
    if (p.avatar) this.h.scene.remove(p.avatar);
    this.seat(p, 'drv', null); this.seat(p, 'pass', null);
    if (p.body) this.h.physics.world.removeRigidBody(p.body);
    if (p.voice) { this.stopVoice(p); }
    p.tag.remove(); this.peers.delete(id);
  }
  clearPeers() { for (const id of [...this.peers.keys()]) this.removePeer(id); }
  snapshot(p, s) {
    p.snaps.push({t: performance.now() / 1000, s});
    if (p.snaps.length > 30) p.snaps.shift();
  }
  /** A peer's interpolated state at the render time, or null. */
  sample(p, now) {
    const S = p.snaps; if (!S.length) return null;
    const t = now - DELAY;
    let a = S[0], b = S[S.length - 1];
    for (let i = S.length - 1; i > 0; i--) if (S[i - 1].t <= t) { a = S[i - 1]; b = S[i]; break; }
    const span = b.t - a.t, k = span > 1e-4 ? Math.min(1.6, Math.max(0, (t - a.t) / span)) : 1;
    const A = a.s, B = b.s, lerp = i => A[i] + (B[i] - A[i]) * k;
    const qa = new T.Quaternion(A[3], A[4], A[5], A[6]), qb = new T.Quaternion(B[3], B[4], B[5], B[6]);
    return {x: lerp(0), y: lerp(1), z: lerp(2), q: qa.slerp(qb, Math.min(1, k)), v: lerp(7), steer: lerp(8), flags: B[9] | 0, rpm: (B[10] || 0) * 100, skid: B[11] || 0,
      walk: B[9] & 8 ? {x: B[12], y: B[13], z: B[14], yaw: B[15]} : null, gas: B[16] ?? .3, ride: B[9] & 128 && B[17] ? String(B[17]) : null, age: now - S[S.length - 1].t};
  }

  /* ------------------------------------------------------------- per frame */
  update(dt, {camera, night, collisions = true, me = null}) {
    const now = performance.now() / 1000;
    // Ours, out.
    if (this.inLobby && now - this.lastSend > 1 / SEND_HZ) {
      this.lastSend = now; const L = this.h.local();
      this.send({t: 'state', s: L.state});
      if (this.isHost && now - this.lastClock > 15) { this.lastClock = now; this.send({t: 'clock', hour: L.hour}); }
    }
    if (this.inLobby) {
      const n = this.players.length;
      this.badge.hidden = false; this.badge.innerHTML = `<i></i>ONLINE · ${esc(this.lobby.name)} · ${n}/${this.lobby.max} <span>${this.lobby.code}</span> <small>ENTER TO CHAT</small>`;
    }
    // Theirs, in.
    const W = innerWidth, H = innerHeight, v3 = new T.Vector3();
    this.listen(dt, camera);
    for (const p of this.peers.values()) {
      const st = this.sample(p, now), veh = p.vehicle;
      if (!st || !veh || st.age > 6) { if (veh) veh.object.visible = false; p.tag.style.display = 'none'; if (p.avatar) p.avatar.visible = false; this.seat(p, 'drv', null); this.seat(p, 'pass', null); continue; }
      const o = veh.object; o.visible = true; o.position.set(st.x, st.y, st.z); o.quaternion.copy(st.q); o.updateMatrixWorld();
      // Wheels: steer and roll.
      p.spin += st.v / (veh.body.radius || .36) * dt;
      for (const w of veh.wheels) { w.pivot.position.y = w.y; if (w.front) w.pivot.rotation.y = st.steer; w.spin.rotation.x = p.spin; }
      const b = veh.body;
      if (b.tail) b.tail.emissiveIntensity = st.flags & 1 ? 3.2 : night ? .9 : .45;
      if (b.head) b.head.emissiveIntensity = night ? 2.2 : .6;
      if (b.reverse) b.reverse.emissiveIntensity = st.flags & 4 ? 2.6 : 0;
      if (b.interior?.group) b.interior.group.visible = camera.position.distanceTo(o.position) < 40;
      // Riding in this car: its cluster comes alive with the driver's speed and revs.
      if (this.h.ridingId?.() === p.id && b.interior?.cluster) {
        if (!p.gauges || p.gauges.mesh !== b.interior.cluster) p.gauges = new Cluster(b.interior.cluster, b.interior.clusterStyle || 'plain');
        const kmh = Math.abs(st.v) * 3.6, h = new Date();
        p.gauges.update(dt, {speed: kmh, units: 'kmh', rpm: st.rpm, red: 8000, gear: st.flags & 4 ? 'R' : kmh < 1 ? 'N' : String(Math.min(7, 1 + Math.floor(kmh / 45))), brake: false, engine: false, clock: `${h.getHours()}:${String(h.getMinutes()).padStart(2, '0')}`, power: true});
      }
      // Something solid to bump into, unless the lobby is in ghost mode.
      this.collider(p, st, collisions && !st.walk, me);
      // On foot: a figure where they stand.
      // Seated figures (2026-10-03): the driver at their wheel, and whoever rides along in a passenger seat.
      this.seat(p, 'drv', st.walk ? null : o, [.36, .25, -.52]);
      const seatIn = st.ride ? (st.ride === this.id ? this.h.localCar?.() : this.peers.get(st.ride)?.vehicle?.object) : null;
      this.seat(p, 'pass', seatIn || null, [-.36, .25, -.52]);
      const withMe = st.ride === this.id;
      if (withMe !== !!p.withMe) { p.withMe = withMe; this.say(null, withMe ? `${p.name} hopped in` : `${p.name} got out`); this.h.notify(withMe ? `${p.name} is riding with you` : `${p.name} got out`); }
      if (st.walk && !st.ride) {
        if (!p.avatar) p.avatar = avatar(this.color(p.id)), this.h.scene.add(p.avatar);
        p.avatar.visible = true; p.avatar.position.set(st.walk.x, st.walk.y, st.walk.z); p.avatar.rotation.y = st.walk.yaw; p.avatar.scale.y = st.flags & 64 ? .6 : 1;
      } else if (p.avatar) p.avatar.visible = false;
      // Name tag over whoever (car or figure) they are.
      const at = st.ride && seatIn ? v3.set(seatIn.position.x, seatIn.position.y + 1.9, seatIn.position.z) : st.walk ? v3.set(st.walk.x, st.walk.y + 2.2, st.walk.z) : v3.set(st.x, st.y + 1.9, st.z);
      const d = camera.position.distanceTo(at); at.project(camera);
      if (at.z > 1 || d > 900) p.tag.style.display = 'none';
      else { p.tag.style.display = ''; p.tag.style.transform = `translate(${(at.x * .5 + .5) * W}px,${(-at.y * .5 + .5) * H}px) translate(-50%,-100%) scale(${Math.max(.62, Math.min(1, 40 / d))})`; p.tag.querySelector('small').textContent = d > 60 ? Math.round(d) + ' m' : ''; }
      this.voice(p, st, camera.position.distanceTo(o.position), o);
    }
  }
  /** Put peer p's seated figure `key` in `parent` (a car's object) at `at`, or take it out. */
  seat(p, key, parent, at) {
    let f = p[key];
    if (!parent) { if (f?.parent) f.parent.remove(f); return; }
    if (!f) f = p[key] = seated(this.color(p.id));
    if (f.parent !== parent) { parent.add(f); f.position.set(...at); }
  }
  collider(p, st, on, me) {
    const P = this.h.physics, R = P.R;
    // Spawned on top of each other (everyone starts at the Strip): stay a
    // ghost until the cars are apart, or the solver would launch both.
    const d = me ? Math.hypot(st.x - me.x, st.z - me.z) : 99;
    p.ghost = d < 4.5 ? true : d > 7 ? false : p.ghost;
    if (!on || p.ghost) { if (p.body) { P.world.removeRigidBody(p.body); p.body = null; } return; }
    if (!p.body) {
      p.body = P.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(st.x, st.y, st.z));
      P.world.createCollider(R.ColliderDesc.cuboid(1.03, .34, 2.16).setTranslation(0, .78, 0).setFriction(.3), p.body);
    }
    p.body.setNextKinematicTranslation({x: st.x, y: st.y, z: st.z}); p.body.setNextKinematicRotation({x: st.q.x, y: st.q.y, z: st.q.z, w: st.q.w});
  }
  /* -------------------------------------------------------------- sound
   * Other players' engines (2026-10-02): each car is a positional voice
   * (HRTF panner, inverse-distance law) built from its owner's engine — the
   * firing frequency from its cylinders and revs, a crank-order growl, a
   * throttle-driven rasp and a soft clipper — with air absorption over
   * distance, true Doppler from the closing speed, and a tunnel tail: when
   * you or they are inside a bore the voice also rings through a long
   * concrete reverb. Park in a tunnel, step out, and let a friend's V12 come
   * through flat out. */
  listen(dt, camera) {
    const A = this.h.audio(); if (!A) return;
    const L = A.ctx.listener, p = camera.position, f = new T.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), u = new T.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    if (L.positionX) { L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z; L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z; L.upX.value = u.x; L.upY.value = u.y; L.upZ.value = u.z; }
    else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
    // The listener's own velocity (for Doppler), smoothed.
    const lv = this.lisVel ||= new T.Vector3(), lp = this.lisPrev;
    if (lp && dt > 0) lv.lerp(new T.Vector3().subVectors(p, lp).divideScalar(dt), Math.min(1, dt * 6));
    this.lisPrev = p.clone();
    this.lisTunnel = !!this.h.inTunnel?.(p.x, p.y, p.z);
  }
  reverb(ctx) {
    if (this.verb?.ctx === ctx) return this.verb;
    const len = Math.floor(ctx.sampleRate * 2.8), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) { const t = i / ctx.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 2.3) * (1 + .6 * Math.sin(t * 46 + c)) * (t < .012 ? t / .012 : 1); } }
    const conv = ctx.createConvolver(); conv.buffer = ir; const out = ctx.createGain(); out.gain.value = .9; conv.connect(out); out.connect(this.h.audio().out);
    if (!this.noise) { const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1; this.noise = nb; }
    return this.verb = {ctx, conv};
  }
  stopVoice(p) { const V = p.voice; p.voice = null; if (!V) return; try { V.src.forEach(o => o.stop()); V.panner.disconnect(); V.wet.disconnect(); } catch {} }
  voice(p, st, d, obj) {
    const A = this.h.audio(); if (!A) return;
    const ctx = A.ctx, t = ctx.currentTime;
    if (d > 650) { if (p.voice) this.stopVoice(p); return; }
    if (!p.voice && d < 500) {
      const R = this.reverb(ctx), V = {};
      V.o1 = ctx.createOscillator(); V.o1.type = 'sawtooth';
      V.o2 = ctx.createOscillator(); V.o2.type = 'square';
      V.o3 = ctx.createOscillator(); V.o3.type = 'sawtooth';
      V.n = ctx.createBufferSource(); V.n.buffer = this.noise; V.n.loop = true;
      const g1 = ctx.createGain(), g2 = ctx.createGain(), g3 = ctx.createGain(); g1.gain.value = .5; g2.gain.value = .35; g3.gain.value = .16;
      V.rasp = ctx.createBiquadFilter(); V.rasp.type = 'bandpass'; V.rasp.Q.value = 3; V.ng = ctx.createGain(); V.ng.gain.value = 0;
      V.shape = ctx.createWaveShaper(); { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; c[i] = Math.tanh(x * 2.2); } V.shape.curve = c; }
      V.body = ctx.createBiquadFilter(); V.body.type = 'peaking'; V.body.frequency.value = 180; V.body.gain.value = 5; V.body.Q.value = .9;
      V.air = ctx.createBiquadFilter(); V.air.type = 'lowpass'; V.air.Q.value = .7;
      V.level = ctx.createGain(); V.level.gain.value = 0;
      V.panner = ctx.createPanner(); Object.assign(V.panner, {panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 7, rolloffFactor: 1.15, maxDistance: 800});
      V.wet = ctx.createGain(); V.wet.gain.value = 0;
      V.o1.connect(g1); V.o2.connect(g2); V.o3.connect(g3); V.n.connect(V.rasp); V.rasp.connect(V.ng);
      for (const g of [g1, g2, g3, V.ng]) g.connect(V.shape);
      V.shape.connect(V.body); V.body.connect(V.air); V.air.connect(V.level); V.level.connect(V.panner); V.panner.connect(A.out);
      V.level.connect(V.wet); V.wet.connect(R.conv);
      V.src = [V.o1, V.o2, V.o3, V.n]; V.src.forEach(o => o.start());
      p.voice = V;
    }
    const V = p.voice; if (!V) return;
    // Where it is and how fast it is closing on us.
    const P = obj.position, fwd = new T.Vector3(0, 0, 1).applyQuaternion(obj.quaternion), vs = fwd.multiplyScalar(st.v || 0);
    if (V.panner.positionX) { V.panner.positionX.setTargetAtTime(P.x, t, .02); V.panner.positionY.setTargetAtTime(P.y + .5, t, .02); V.panner.positionZ.setTargetAtTime(P.z, t, .02); }
    else V.panner.setPosition(P.x, P.y + .5, P.z);
    const lis = this.lisPrev || P, dir = new T.Vector3().subVectors(P, lis); const dist = Math.max(.5, dir.length()); dir.divideScalar(dist);
    const closing = -new T.Vector3().subVectors(vs, this.lisVel || new T.Vector3()).dot(dir);
    const dop = Math.min(1.6, Math.max(.62, 343 / Math.max(120, 343 - closing)));
    // The engine: its cylinders set the firing note.
    const E = this.h.engine?.(p.info?.sound) || {cyl: 8, max: 7500};
    const rpm = Math.max(700, st.rpm || 850), gas = Math.max(0, Math.min(1, st.gas ?? .3));
    const f = rpm / 60 * E.cyl / 2 * dop;
    V.o1.frequency.setTargetAtTime(f, t, .04); V.o2.frequency.setTargetAtTime(f / 2, t, .04); V.o3.frequency.setTargetAtTime(f * 2.003, t, .04);
    V.rasp.frequency.setTargetAtTime(Math.min(9000, f * 3.2), t, .05); V.ng.gain.setTargetAtTime(.08 + gas * .35, t, .06);
    // Riding in this car: you hear it through the bulkhead, not the open air.
    const inside = this.h.ridingId?.() === p.id;
    V.air.frequency.setTargetAtTime(inside ? 1500 + gas * 1800 : Math.max(700, Math.min(16000, (2500 + gas * 9000 + rpm * .6) / (1 + dist / 60))), t, .08);
    const lvl = (.2 + .75 * gas) * (.5 + .5 * Math.min(1, rpm / E.max));
    V.level.gain.setTargetAtTime(lvl, t, .08);
    // Tunnel: you, or they, inside a bore.
    const themIn = !!this.h.inTunnel?.(P.x, P.y, P.z), wet = this.lisTunnel ? 1 : themIn ? .55 : .05;
    // In a tunnel the reverberant field carries: it barely falls with distance (the panner already drops the direct sound).
    V.wet.gain.setTargetAtTime(wet * Math.min(1, 80 / dist) * .9, t, .15);
  }

  /* ---------------------------------------------------------------- chat */
  openChat() { if (!this.inLobby) return false; this.input.hidden = false; this.input.value = ''; this.input.focus(); this.chatBox.classList.add('typing'); return true; }
  closeChat() { this.input.hidden = true; this.input.blur(); this.chatBox.classList.remove('typing'); }
  get typing() { return !this.input.hidden; }
  say(name, text, id) {
    const row = document.createElement('div'); row.className = 'online-line' + (name ? '' : ' sys');
    if (name) { const b = document.createElement('b'); b.textContent = name; b.style.color = id ? this.color(id) : ''; row.append(b, ' '); }
    row.append(text); this.log.append(row);
    while (this.log.children.length > 8) this.log.firstChild.remove();
    setTimeout(() => row.classList.add('old'), 14000);
  }
}

/** A seated figure for a car seat (the cushion at the origin, facing +z):
 *  thighs forward, hands up toward the wheel, a band in the player's colour. */
function seated(color) {
  const g = new T.Group(), m = new T.MeshStandardMaterial({color: '#2a2e35', roughness: .7}), skin = new T.MeshStandardMaterial({color: '#c8a183', roughness: .8}),
    c = new T.MeshStandardMaterial({color, roughness: .5, emissive: color, emissiveIntensity: .25});
  const box = (w, h, d, x, y, z, rx, mat = m) => { const b = new T.Mesh(new T.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); b.rotation.x = rx; g.add(b); return b; };
  box(.36, .46, .2, 0, .32, -.13, -.28);                             // torso, leaning back into the shell
  box(.37, .07, .21, 0, .42, -.12, -.28, c);                         // colour band
  const head = new T.Mesh(new T.SphereGeometry(.105, 14, 10), skin); head.position.set(0, .66, -.2); head.scale.set(.9, 1.1, 1); g.add(head);
  for (const s of [-1, 1]) {
    box(.14, .12, .44, s * .1, .1, .1, -.08);                        // thighs
    box(.11, .4, .12, s * .1, -.02, .36, .5);                        // shins down to the pedals
    box(.08, .08, .34, s * .2, .36, .1, -.5);                        // forearms to the wheel
    const hand = new T.Mesh(new T.SphereGeometry(.04, 8, 6), skin); hand.position.set(s * .2, .45, .26); g.add(hand);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
/** A walking figure: body, head, a band in the player's colour. */
function avatar(color) {
  const g = new T.Group(), m = new T.MeshStandardMaterial({color: '#2a2e35', roughness: .7}), c = new T.MeshStandardMaterial({color, roughness: .5, emissive: color, emissiveIntensity: .25});
  const body = new T.Mesh(new T.CapsuleGeometry(.24, .9, 4, 10), m); body.position.y = .95;
  const head = new T.Mesh(new T.SphereGeometry(.16, 14, 10), new T.MeshStandardMaterial({color: '#c8a183', roughness: .8})); head.position.y = 1.7;
  const band = new T.Mesh(new T.CylinderGeometry(.25, .25, .12, 14), c); band.position.y = 1.18;
  g.add(body, head, band); g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
function load(k) { try { return localStorage.getItem(k); } catch { return null; } }
function save(k, v) { try { localStorage.setItem(k, v); } catch {} }
