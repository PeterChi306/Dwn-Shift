/* DWN WORKS screen (2026-10-01): the overlay shown while the car sits on the
 * workshop's bay ring. Categories down the left, choices on the right, the
 * car in the middle under the bay lights with the camera framing whatever is
 * being changed. Every change applies live; "Drive out" keeps it.
 */
import {OPTIONS, RIMS, CALIPERS, GLOWS, STRIPES, PRESETS} from './carParts.js';
import {PAINTS, AMBIENTS} from './carBody.js';

/* Where the camera looks for each category: [yaw around the car (0 = front), pitch, distance, look height, look z]. */
const VIEWS = {
  presets: [.75, .16, 7.2, .55, 0], wing: [2.55, .22, 6.2, .9, -1.6], front: [.5, .1, 5.2, .35, 1.8], kit: [1.25, .1, 6.2, .45, 0],
  exhaust: [2.9, .06, 4.8, .4, -1.9], lights: [.32, .06, 4.4, .55, 1.9], wheels: [1.45, .04, 4.6, .4, 1.1], stance: [1.57, .02, 6.4, .45, 0],
  paint: [.85, .2, 7, .5, 0], livery: [.9, .48, 7, .5, 0], glow: [1.0, .02, 6.6, .2, 0], engine: [2.6, .14, 6.2, .6, -1], handling: [.75, .16, 7.2, .55, 0],
};
const CATS = [['presets', 'Builds'], ['wing', 'Wing'], ['front', 'Front aero'], ['kit', 'Body kit'], ['exhaust', 'Exhaust'], ['lights', 'Headlights'],
  ['wheels', 'Wheels'], ['stance', 'Stance'], ['paint', 'Paint'], ['livery', 'Livery'], ['glow', 'Underglow'], ['engine', 'Engine & sound'], ['handling', 'Handling']];

export class WorkshopUI {
  /** api: {build(), setBuild(b), paint(), setPaint(hex), ambient(), setAmbient(hex), sounds(), sound(), setSound(id), handling(), setHandling(id), modes, close()} */
  constructor(root, api) {
    this.api = api; this.cat = 'presets'; this.open = false; this.t = 0;
    const el = document.createElement('section'); el.id = 'dwnWorks'; el.hidden = true;
    el.innerHTML = `<header class="dw-top"><div><span class="world-eyebrow">DWN WORKS · SUNSET BOULEVARD</span><h2>Aurora <small id="dwBuildName">Factory</small></h2></div>
      <button class="dw-exit" id="dwExit">DRIVE OUT <kbd>ESC</kbd></button></header>
      <nav class="dw-cats" id="dwCats">${CATS.map(([k, n]) => `<button data-cat="${k}">${n}</button>`).join('')}</nav>
      <aside class="dw-panel" id="dwPanel"></aside>
      <footer class="dw-foot"><span>DRAG TO TURN THE CAR</span><span>CHANGES APPLY LIVE · SAVED WHEN YOU DRIVE OUT</span></footer>`;
    root.append(el); this.el = el;
    el.querySelector('#dwExit').onclick = () => api.close();
    el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => this.show(b.dataset.cat));
    this.spin = 0; this.drag = null;
    el.addEventListener('pointerdown', e => { if (e.target === el) { this.drag = e.clientX; el.setPointerCapture(e.pointerId); } });
    el.addEventListener('pointermove', e => { if (this.drag !== null) { this.spin -= (e.clientX - this.drag) * .006; this.drag = e.clientX; this.idle = 0; } });
    el.addEventListener('pointerup', () => this.drag = null);
  }
  show(cat = this.cat) {
    if (cat !== this.cat) this.spin = 0;
    this.cat = cat; this.open = true; this.el.hidden = false; this.idle = 0;
    this.el.querySelectorAll('[data-cat]').forEach(b => b.classList.toggle('on', b.dataset.cat === cat));
    const p = this.el.querySelector('#dwPanel'), b = this.api.build(), title = CATS.find(c => c[0] === cat)[1];
    const card = (key, val, name, sub, on) => `<button class="dw-card${on ? ' on' : ''}" data-k="${key}" data-v="${val}"><b>${name}</b>${sub ? `<small>${sub}</small>` : ''}</button>`;
    const sw = (key, list, cur) => `<div class="dw-swatches">${list.map(([n, hex]) => `<button class="dw-sw${(cur || null) === hex ? ' on' : ''}" data-k="${key}" data-v="${hex ?? ''}" title="${n}" style="--c:${hex || 'transparent'}"><i class="${hex ? '' : 'off'}"></i>${n}</button>`).join('')}</div>`;
    let html = `<h3>${title}</h3>`;
    if (cat === 'presets') html += `<p class="dw-tip">Complete builds. Pick one, then change anything.</p>` + PRESETS.map(q => `<button class="dw-card dw-preset" data-preset="${q.id}"><b>${q.name}</b><small>${q.blurb}</small></button>`).join('');
    else if (OPTIONS[cat] && cat !== 'livery') html += OPTIONS[cat].map(([v, n, s]) => card(cat, v, n, s, b[cat] === v)).join('');
    if (cat === 'wheels') html += `<h4>RIM COLOUR</h4>${sw('rim', [['Style', null], ...RIMS], b.rim)}<h4>CALIPERS</h4>${sw('caliper', [['Style', null], ...CALIPERS], b.caliper)}`;
    if (cat === 'paint') html += `${sw('paint', PAINTS, this.api.paint())}<h4>CABIN LIGHT</h4>${sw('ambient', AMBIENTS, this.api.ambient())}`;
    if (cat === 'livery') html += OPTIONS.livery.map(([v, n, s]) => card('livery', v, n, s, b.livery === v)).join('') + `<h4>STRIPE COLOUR</h4>${sw('stripe', STRIPES, b.stripe)}`;
    if (cat === 'glow') html += sw('glow', GLOWS, b.glow) + `<p class="dw-tip">Best after dark, and at a car meet.</p>`;
    if (cat === 'engine') { const cur = this.api.sound(); html += `<p class="dw-tip">The engine and its voice. Every engine fits the Aurora.</p><div class="dw-list">${this.api.sounds().map(c => `<button class="dw-card dw-row${c.id === cur ? ' on' : ''}" data-sound="${c.id}"><b>${c.name}</b><small>${c.layout || ''}</small></button>`).join('')}</div>`; }
    if (cat === 'handling') { const cur = this.api.handling(); html += Object.entries(this.api.modes).map(([k, m]) => `<button class="dw-card${k === cur ? ' on' : ''}" data-handling="${k}"><b>${m.label}</b><small>${{grip: 'Planted and quick. Slides on the handbrake, catches itself.', drift: 'Throttle and steering hold the angle. Made for sideways.', sim: 'Fewer aids. The rear will bite if you are clumsy.'}[k]}</small></button>`).join(''); }
    p.innerHTML = html;
    p.querySelectorAll('[data-k]').forEach(btn => btn.onclick = () => {
      const k = btn.dataset.k, v = btn.dataset.v || null;
      if (k === 'paint') this.api.setPaint(v); else if (k === 'ambient') this.api.setAmbient(v);
      else this.api.setBuild({...this.api.build(), [k]: v});
      this.name('Custom'); this.show(cat);
    });
    p.querySelectorAll('[data-preset]').forEach(btn => btn.onclick = () => {
      const q = PRESETS.find(x => x.id === btn.dataset.preset);
      this.api.setBuild({...q.build}); if (q.paint) this.api.setPaint(q.paint); if (q.handling) this.api.setHandling(q.handling);
      this.name(q.name); this.show(cat);
    });
    p.querySelectorAll('[data-sound]').forEach(btn => btn.onclick = () => { this.api.setSound(btn.dataset.sound); this.show(cat); });
    p.querySelectorAll('[data-handling]').forEach(btn => btn.onclick = () => { this.api.setHandling(btn.dataset.handling); this.show(cat); });
  }
  name(n) { try { localStorage.setItem('dwnBuildName', n); } catch {} this.el.querySelector('#dwBuildName').textContent = n; }
  hide() { this.open = false; this.el.hidden = true; }
  /** The camera for this frame: {from, to} in the car's frame. */
  camera(dt) {
    this.t += dt; this.idle = (this.idle || 0) + dt;
    const [yaw, pitch, dist, ly, lz] = VIEWS[this.cat] || VIEWS.presets;
    if (this.idle > 6 && this.drag === null) this.spin += dt * .08;
    this.cur ||= {yaw, pitch, dist, ly, lz};
    const k = 1 - Math.exp(-dt * 3), c = this.cur;
    c.yaw += ((yaw + this.spin) - c.yaw) * k; c.pitch += (pitch - c.pitch) * k; c.dist += (dist - c.dist) * k; c.ly += (ly - c.ly) * k; c.lz += (lz - c.lz) * k;
    const from = [Math.sin(c.yaw) * Math.cos(c.pitch) * c.dist, c.ly + Math.sin(c.pitch) * c.dist + .4, c.lz * .3 + Math.cos(c.yaw) * Math.cos(c.pitch) * c.dist];
    return {from, to: [0, c.ly, c.lz]};
  }
}
