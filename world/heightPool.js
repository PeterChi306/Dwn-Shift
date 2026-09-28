/* A few heightWorkers, started as the page begins loading so their road
 * models are built by the time anything asks for heights. */
export class HeightPool {
  constructor(url, n = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 2))) {
    this.workers = [];
    this.next = 0; this.waiting = new Map();
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./heightWorker.js', import.meta.url), {type: 'module'});
      w.onmessage = ({data}) => { const done = this.waiting.get(data.id); this.waiting.delete(data.id); done(data.heights); };
      w.postMessage({type: 'init', url});
      this.workers.push(w);
    }
  }
  /** Heights for interleaved [x0, z0, x1, z1, ...], split across the workers. */
  async heights(xz, pads = null) {
    const n = xz.length / 2, per = Math.ceil(n / this.workers.length), jobs = [];
    this.workers.forEach((w, k) => {
      const a = k * per, b = Math.min(n, a + per);
      if (a >= b) return;
      const id = this.next++, part = xz.slice(a * 2, b * 2);
      jobs.push(new Promise(res => this.waiting.set(id, h => res([a, h]))));
      w.postMessage({id, xz: part, pads}, [part.buffer]);
    });
    const out = new Float32Array(n);
    for (const [a, h] of await Promise.all(jobs)) out.set(h, a);
    return out;
  }
  dispose() { for (const w of this.workers) w.terminate(); this.workers = []; }
}
