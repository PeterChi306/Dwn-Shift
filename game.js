/* ================================================================
   DWNSHIFT — engine, drivetrain, audio synth, gauges, shifter
   ================================================================ */
"use strict";

/* ---------------- config ---------------- */

const DEFAULT_RATIOS = { R: -3.5, 1: 3.6, 2: 2.15, 3: 1.56, 4: 1.21, 5: 0.99, 6: 0.85 };

/* number of forward gears in a ratio set */
function gearCount(ratios) {
  return Math.max(...Object.keys(ratios).filter(k => k !== "R").map(Number));
}

/* The garage. Each car defines its engine, drivetrain, gauge scales,
   aspiration (na / turbo / super) and a synthesized sound profile.
   Sound layer mult 1 = firing frequency (rpm/60 × cylinders/2). */
const CARS = [
  {
    id: "kestrel", name: "Kestrel 100", tag: "city hatch", layout: "I3",
    cyl: 3, idle: 900, max: 6600, cut: 6750, inertia: 0.22,
    curve: [[0, 55], [900, 86], [2200, 112], [3800, 121], [5200, 117], [6000, 104], [6900, 72]],
    mass: 1040, finalDrive: 4.2, clutchCap: 190, cdA: 0.62, brakeMax: 9000,
    asp: "na", pops: 0, tachMax: 7, redK: 6.6, kmhMax: 180, mphMax: 120,
    sound: { layers: [["sawtooth", 1, 0.42], ["square", 0.5, 0.38], ["triangle", 2.01, 0.16]], noiseMul: 0.8, drive: 0.55, pulseDepth: 0.2, pulseDiv: 1.5, raspMul: 0.9 },
  },
  {
    id: "peel", name: "Peel Pico", tag: "10 horsepower. all of them.", layout: "1-cyl · 49cc",
    cyl: 1, idle: 1700, max: 6800, cut: 7000, inertia: 0.05, noPop: true,
    curve: [[0, 7], [1700, 10], [3500, 13], [5200, 14], [6200, 12], [6800, 10], [7200, 6]],
    mass: 120, finalDrive: 4.8, clutchCap: 25, cdA: 0.8, brakeMax: 1500,
    asp: "na", pops: 0, tachMax: 7, redK: 6.8, kmhMax: 100, mphMax: 60, dial: "classic",
    /* a lawnmower with dreams: hard single-cylinder putt-putt-putt */
    sound: {
      layers: [["square", 1, 0.5], ["sawtooth", 2.01, 0.22], ["sine", 0.5, 0.2], ["triangle", 3.02, 0.08]],
      noiseMul: 1.3, drive: 0.62, pulseDepth: 0.55, pulseDiv: 1, pulseType: "square",
      raspMul: 1.3, hunt: 1.7, volTrim: 0.85,
    },
  },
  {
    id: "shirakawa", name: "Shirakawa 9R", tag: "high-rev screamer · cam switch", layout: "I4",
    cyl: 4, idle: 950, max: 9000, cut: 9200, inertia: 0.24, camAt: 6600,
    curve: [[0, 70], [1000, 118], [3000, 162], [5000, 178], [6400, 172], [6600, 208],
            [8200, 204], [9000, 186], [9600, 120]],
    mass: 1150, finalDrive: 4.4, clutchCap: 300, cdA: 0.60, brakeMax: 10500,
    asp: "na", pops: 1, tachMax: 10, redK: 9, kmhMax: 280, mphMax: 180,
    sound: { layers: [["sawtooth", 1, 0.5], ["sawtooth", 2.02, 0.3], ["square", 0.5, 0.22], ["triangle", 3.03, 0.14]], noiseMul: 1, drive: 0.56, pulseDepth: 0.15, raspMul: 1.1 },
  },
  {
    id: "strada", name: "Strada Corsa V10", tag: "formula screamer", layout: "V10",
    cyl: 10, idle: 1400, max: 12200, cut: 12500, inertia: 0.16,
    start: { rpm: 280, dur: 0.6,  fires: 4, flare: 1.0,  flareT: 0.9 },
    curve: [[0, 90], [1500, 175], [4000, 295], [7000, 375], [9500, 415], [11500, 398],
            [12200, 368], [13000, 220]],
    mass: 930, finalDrive: 3.5, clutchCap: 560, cdA: 0.58, brakeMax: 15000,
    grip: 1.9,                                    // slicks — launches at nearly 1g
    asp: "na", pops: 2, tachMax: 13, redK: 12.2, kmhMax: 360, mphMax: 240, shiftLights: true,
    sound: {
      layers: [["sawtooth", 1, 0.48], ["sawtooth", 1.98, 0.3, 0.42], ["sawtooth", 3.02, 0.1, 0.32],
               ["square", 0.5, 0.22, 0.06]],
      formants: [[400, 1.5, 3], [3200, 3, 6]],
      noiseMul: 0.9, volTrim: 1.1, scream: 2200, drive: 0.6, pulseDepth: 0.12, raspMul: 1.25,
      loadDrive: 0.35,
    },
  },
  {
    id: "t50", name: "Dunsfold T.50", tag: "12,100 rpm V12 · ground-effect fan", layout: "V12 · 3.9L NA · 986kg",
    cyl: 12, idle: 1000, max: 11500, cut: 12100, inertia: 0.09,   // lightest crank ever fitted to a road car
    start: { rpm: 270, dur: 0.52, fires: 4, flare: 0.98, flareT: 0.85 },
    curve: [[0, 140], [1500, 270], [4000, 370], [7000, 430], [9000, 466], [10500, 452],
            [11500, 425], [12400, 290]],
    mass: 986, finalDrive: 3.71, clutchCap: 700, cdA: 0.55, brakeMax: 14500, grip: 1.75,
    asp: "na", pops: 1.2, tachMax: 13, redK: 12.1, kmhMax: 360, mphMax: 220,
    shiftLights: true, dial: "classic", dash: { face: "light" },
    fan: true,                            // the 400mm turbine behind your head
    /* a 3.9L V12 that revs to twelve-one: not the chest-thump of the big
       twelves but a silvery, hyper-precise shriek — a scaled-down grand-prix
       engine. Light sub, dense uppers, huge scream, machine-tool tight
       (low jitter). And beneath it all, the fan: a smooth electric turbine
       whoosh that builds with speed and steps up hard under braking. */
    sound: {
      layers: [
        ["sine",     0.5,   0.28, 0.08],   // light sub — it's only 3.9 litres
        ["sawtooth", 0.997, 0.18, 0.26],   // unison low…
        ["sawtooth", 1,     0.44, 0.50],   // …center voice…
        ["sawtooth", 1.005, 0.20, 0.30],   // …unison high — tight chorus
        ["sawtooth", 1.5,   0.08, 0.24],   // V12 harmonic density
        ["sawtooth", 2.01,  0.12, 0.44],   // exhaust sharpens all the way up
        ["sawtooth", 3.02,  0.04, 0.34],   // intake howl
        ["triangle", 4.5,   0.0,  0.20],   // silky shimmer
        ["sine",     6.02,  0.0,  0.14],   // pure air at twelve grand
      ],
      formants: [[420, 1.4, 4], [2800, 2.6, 6], [4800, 2.2, 5]],
      loadDrive: 0.4, noiseMul: 0.95, volTrim: 1.15, scream: 4600,
      drive: 0.62, pulseDepth: 0.1, raspMul: 1.1, jitter: 0.8,
    },
  },
  {
    id: "veleno", name: "Maranello 812", tag: "front-engined V12 thoroughbred", layout: "V12 · 6.5L NA",
    cyl: 12, idle: 900, max: 8900, cut: 9250, inertia: 0.20,
    start: { rpm: 235, dur: 0.72, fires: 4, flare: 0.88, flareT: 0.9 },
    curve: [[0, 140], [1000, 320], [3000, 480], [5000, 560], [7000, 600], [8000, 585],
            [8900, 540], [9600, 350]],
    mass: 1580, finalDrive: 3.4, clutchCap: 900, cdA: 0.62, brakeMax: 15000,
    grip: 1.8,                                    // fat rear rubber — ~3s to 60
    asp: "na", pops: 2.2, tachMax: 10, redK: 8.9, kmhMax: 360, mphMax: 240, dial: "classic",
    shiftLights: true,
    /* voice morphs with rpm: silky sub burble at idle → bass-heavy rumble low
       down → metallic intake howl mid-range → razor-sharp F1 wail at the top.
       Formants model a straight-pipe system: chest boom, mid bark, metallic ring. */
    sound: {
      layers: [
        ["sine",     0.25,  0.16, 0.03],   // half-order swell beneath the idle
        ["sine",     0.5,   0.5,  0.16],   // sub burble — KEEPS body at redline
        ["square",   0.5,   0.28, 0.10],   // low-rev muscle, never fully leaves
        ["sine",     1,     0.2,  0.3 ],   // pure fundamental — round, elegant core
        ["sawtooth", 0.997, 0.18, 0.26],   // unison voice, detuned low…
        ["sawtooth", 1,     0.42, 0.55],   // …center voice, dominant to the top…
        ["sawtooth", 1.006, 0.24, 0.36],   // …unison voice, detuned high (3-voice chorus)
        ["sawtooth", 1.5,   0.1,  0.28],   // half-orders = V12 harmonic density
        ["sawtooth", 2.01,  0.12, 0.38],   // exhaust sharpens through mid-range
        ["sine",     2.5,   0.04, 0.22],   // round half-order, richness not harshness
        ["sawtooth", 3.02,  0.04, 0.30],   // metallic intake howl
        ["triangle", 3.5,   0.0,  0.22],   // silky upper shimmer
        ["triangle", 4.5,   0.0,  0.24],   // the wail — smooth, not razor
        ["sine",     6.02,  0.0,  0.12],   // pure air/sheen at the very top
      ],
      formants: [[110, 0.9, 4.5], [480, 1.6, 5], [1150, 2.2, 5.5], [3400, 2.6, 7]],
      loadDrive: 0.55,
      noiseMul: 0.9, volTrim: 1.35, scream: 3300,
      drive: 0.75, pulseDepth: 0.15, pulseDiv: 1, raspMul: 1.4,
    },
  },
  {
    id: "gintani", name: "Sant'Agata SVJ Gintani", tag: "straight-pipe V12 · fireworks", layout: "V12 · 6.5L open pipes",
    cyl: 12, idle: 950, max: 9000, cut: 9350, inertia: 0.19, shiftLights: true,
    start: { rpm: 232, dur: 0.92, fires: 5, flare: 1.0, flareT: 1.2, whine: 1290 },
    curve: [[0, 150], [1000, 335], [3000, 500], [5000, 585], [7000, 625], [8000, 610],
            [9000, 560], [9700, 360]],
    mass: 1525, finalDrive: 3.54, clutchCap: 950, cdA: 0.61, brakeMax: 15500, grip: 1.85,
    asp: "na", pops: 3.2, tachMax: 10, redK: 9, kmhMax: 360, mphMax: 240,
    startCap: true,          // the red flip-up cover over the starter
    twoStage: true,          // cover up, press once for electronics, again to crank
    /* the raging-bull V12 with the exhaust deleted — voiced like the real Gintani car:
       a wide 3-voice detuned unison core (thick, never sterile), half-order
       partials from the 12-cylinder firing overlap (the growl BETWEEN the
       notes), slightly inharmonic uppers for metallic valvetrain sizzle,
       heavy rasp and extra jitter so it breathes like machinery, and broad
       formant resonances — chest boom, mid bark, titanium ring. A bull. */
    sound: {
      layers: [
        ["sine",     0.5,   0.42, 0.16],   // sub chest — stays under everything
        ["square",   0.5,   0.3,  0.1 ],   // low-rev muscle
        ["sawtooth", 0.994, 0.24, 0.3 ],   // unison low…
        ["sawtooth", 1,     0.46, 0.55],   // …center voice…
        ["sawtooth", 1.008, 0.28, 0.36],   // …unison high — wide 3-voice chorus
        ["sawtooth", 1.503, 0.12, 0.3 ],   // half-order growl (firing overlap)
        ["sawtooth", 2.015, 0.16, 0.44],   // exhaust bite sharpens with revs
        ["sawtooth", 2.51,  0.05, 0.22],   // more between-note density
        ["sawtooth", 3.02,  0.06, 0.36],   // intake howl
        ["triangle", 4.03,  0.0,  0.24],   // upper shimmer
        ["sawtooth", 5.03,  0.0,  0.16],   // metallic sizzle at the top
        ["sine",     6.04,  0.0,  0.1 ],   // pure air over the wail
      ],
      formants: [[140, 0.9, 5], [620, 1.4, 6.5], [1500, 2.0, 6.5], [3600, 2.4, 7.5]],
      loadDrive: 0.7, noiseMul: 1.35, volTrim: 1.6, scream: 3600,
      drive: 0.9, pulseDepth: 0.22, raspMul: 2.0, jitter: 2.2, hunt: 1.3,
    },
  },
  {
    id: "huayrar", name: "San Cesario R", tag: "the best-sounding car in the world", layout: "V12 · 6.0L NA · open megaphone",
    cyl: 12, idle: 1100, max: 8750, cut: 9000, inertia: 0.10,  // race-spec V12, near-zero flywheel
    start: { rpm: 240, dur: 0.66, fires: 5, flare: 1.0,  flareT: 1.0 },
    curve: [[0, 150], [1200, 330], [3000, 545], [5500, 750], [7000, 745], [8250, 720],
            [8750, 680], [9400, 420]],
    mass: 1050, finalDrive: 3.8, clutchCap: 900, cdA: 0.72, brakeMax: 16000,
    grip: 2.4,                                    // slicks + a wing you could dine on
    asp: "na", pops: 2.4, tachMax: 10, redK: 8.75, kmhMax: 360, mphMax: 220,
    shiftLights: true, dial: "gear",
    shiftLag: 0.1,                       // dog box: paddle in, dogs slam home 100ms later
    gearWhine: 6,                        // straight-cut dog box — mesh scream rides the crank
    /* the track-only art piece with the bespoke 6.0 NA V12 and an inconel
       megaphone exhaust with no silencers whatsoever. It doesn't sound like a
       road car — it sounds like a 90s grand-prix grid: a savage midrange BARK
       that hardens into a shrieking, metallic scream, intake trumpets howling
       over the top, valvetrain sizzle everywhere, and under all of it the
       straight-cut gearbox singing its own note. Volume is the point. */
    sound: {
      layers: [
        ["sine",     0.5,   0.30, 0.10],   // light chest — 1050kg, no cruise manners
        ["square",   0.5,   0.20, 0.06],   // a little low-rev grit
        ["sawtooth", 0.995, 0.22, 0.30],   // unison low…
        ["sawtooth", 1,     0.46, 0.52],   // …center voice…
        ["sawtooth", 1.007, 0.24, 0.34],   // …unison high — wide race-V12 chorus
        ["sawtooth", 1.5,   0.10, 0.28],   // half-order growl between firings
        ["sawtooth", 2.01,  0.14, 0.48],   // megaphone bite — hardens with revs
        ["sawtooth", 2.5,   0.04, 0.24],   // between-note density
        ["sawtooth", 3.02,  0.06, 0.42],   // intake-trumpet shriek
        ["sawtooth", 4.03,  0.0,  0.30],   // metallic edge
        ["triangle", 5.04,  0.0,  0.22],   // upper shimmer
        ["sawtooth", 6.04,  0.0,  0.14],   // razor sizzle at the top
        ["sine",     8.05,  0.0,  0.10],   // pure air at nine grand
      ],
      formants: [[160, 0.9, 4.5], [800, 1.6, 6], [2200, 2.2, 6.5], [4600, 2.6, 8]],
      loadDrive: 0.65, noiseMul: 1.3, volTrim: 1.55, scream: 4200,
      drive: 0.85, pulseDepth: 0.14, raspMul: 1.7, jitter: 1.5, hunt: 1.2,
    },
  },
  {
    id: "huracan", name: "Sant'Agata V10 Evo", tag: "the everyday supercar scream", layout: "V10 · 5.2L NA",
    cyl: 10, idle: 1000, max: 8500, cut: 8700, inertia: 0.21, shiftLights: true, awd: true,
    start: { rpm: 250, dur: 0.74, fires: 4, flare: 0.92, flareT: 0.9 },
    curve: [[0, 190], [1000, 330], [3000, 470], [5000, 560], [6500, 600], [7500, 592],
            [8500, 545], [9200, 360]],
    mass: 1550, finalDrive: 3.54, clutchCap: 1500, cdA: 0.62, brakeMax: 15000, grip: 2.0,
    asp: "na", pops: 2.6, tachMax: 9, redK: 8.5, kmhMax: 340, mphMax: 210,
    dash: { accent: "#9ee800" },
    startCap: true,
    /* the 5.2 V10 next door to the SVJ, uneven-fire 90°: a low growl with a
       slight lope at idle, a snarling half-order midrange (the odd-even gap
       between firings), then the celebrated top-end — a hard, honking intake
       scream that hangs at the redline. Big lift-off fireworks. */
    sound: {
      layers: [
        ["sine",     0.5,   0.30, 0.12],   // sub growl
        ["square",   0.5,   0.26, 0.08],   // low-rev muscle
        ["sawtooth", 0.996, 0.22, 0.30],   // unison low…
        ["sawtooth", 1,     0.46, 0.54],   // …center voice…
        ["sawtooth", 1.007, 0.24, 0.34],   // …unison high
        ["sawtooth", 1.5,   0.11, 0.26],   // V10 half-order snarl
        ["sawtooth", 2.01,  0.12, 0.42],   // exhaust bite
        ["sawtooth", 2.5,   0.04, 0.20],   // between-note density
        ["sawtooth", 3.02,  0.05, 0.32],   // intake honk
        ["triangle", 4.03,  0.0,  0.20],   // upper shimmer
        ["sine",     6.02,  0.0,  0.12],   // air over the scream
      ],
      formants: [[180, 1.0, 4.5], [900, 1.8, 5.5], [2600, 2.4, 6.5]],
      loadDrive: 0.55, noiseMul: 1.15, volTrim: 1.3, scream: 3000,
      drive: 0.72, pulseDepth: 0.18, raspMul: 1.5, hunt: 1.2,
    },
  },
  {
    id: "revuelto", name: "Sant'Agata Revuelto", tag: "V12 hybrid flagship · 9,500 rpm", layout: "V12 · 6.5L NA + 3 e-motors",
    cyl: 12, idle: 950, max: 9250, cut: 9500, inertia: 0.15, shiftLights: true, awd: true,
    start: { rpm: 300, dur: 0.5,  fires: 3, flare: 0.7,  flareT: 0.6 },
    curve: [[0, 200], [1000, 400], [3000, 560], [5000, 650], [6750, 725], [8000, 712],
            [9250, 655], [9800, 420]],
    mass: 1820, finalDrive: 3.4, clutchCap: 1400, cdA: 0.60, brakeMax: 16000, grip: 2.1,
    asp: "na", pops: 2.6, tachMax: 10, redK: 9.25, kmhMax: 360, mphMax: 220,
    startCap: true,
    // 296-style hybrid: silent EV creep on the front axle motors up to ~130km/h,
    // then you light the V12 yourself (H / eDrive button)
    edrive: true, evCapKmh: 130, evForce: 8200, badge: "V12-H", fireLbl: "FIRE V12",
    dash: { accent: "#7ed957" },
    /* the new flagship: the SVJ's savagery moved a thousand rpm up the tach.
       Lighter crank, cleaner headers — less open-pipe chaos than the Gintani
       car, more of a hard, race-bred HOWL that keeps climbing to nine-five.
       Big midrange bark, screaming intake orders up top, and the party trick:
       it arrives in total silence, then twelve cylinders detonate on demand. */
    sound: {
      layers: [
        ["sine",     0.5,   0.36, 0.12],   // sub chest
        ["square",   0.5,   0.24, 0.08],   // low-rev muscle
        ["sawtooth", 0.995, 0.22, 0.28],   // unison low…
        ["sawtooth", 1,     0.46, 0.54],   // …center voice…
        ["sawtooth", 1.007, 0.26, 0.34],   // …unison high — 3-voice chorus
        ["sawtooth", 1.5,   0.11, 0.28],   // half-order growl
        ["sawtooth", 2.01,  0.14, 0.46],   // exhaust bite
        ["sawtooth", 2.5,   0.04, 0.20],   // between-note density
        ["sawtooth", 3.02,  0.06, 0.38],   // intake howl
        ["sawtooth", 4.03,  0.0,  0.26],   // metallic edge past 8k
        ["triangle", 5.04,  0.0,  0.20],   // upper shimmer
        ["sine",     6.02,  0.0,  0.12],   // pure air over the wail
      ],
      formants: [[150, 0.9, 4.5], [700, 1.5, 5.5], [1800, 2.1, 6], [3900, 2.5, 7]],
      loadDrive: 0.6, noiseMul: 1.2, volTrim: 1.4, scream: 3800,
      drive: 0.8, pulseDepth: 0.18, raspMul: 1.6, jitter: 1.4, hunt: 1.1,
    },
  },
  {
    id: "kaminari", name: "Kaminari 13R", tag: "twin-rotor screamer", layout: "2-rotor · 1.3L",
    cyl: 4, idle: 850, max: 9000, cut: 9300, inertia: 0.13,  // near-zero rotating mass: revs instantly
    start: { rpm: 300, dur: 0.86, fires: 2, flare: 0.85, flareT: 0.7, whine: 1420 },
    twoStage: true, ignKey: true,   // old rotary: key to ON, wait for the pump, then crank
    curve: [[0, 60], [1000, 105], [3000, 150], [5000, 175], [7000, 190], [8500, 196],
            [9000, 188], [9700, 130]],
    mass: 1180, finalDrive: 4.3, clutchCap: 260, cdA: 0.60, brakeMax: 10500,
    asp: "na", pops: 2, tachMax: 10, redK: 9, kmhMax: 260, mphMax: 160, dial: "gear",
    sound: {
      layers: [["sawtooth", 1, 0.34, 0.42], ["sawtooth", 2.02, 0.3, 0.46],
               ["sawtooth", 3.01, 0.12, 0.32], ["square", 0.5, 0.3, 0.1]],
      noiseMul: 1.4, raspMul: 1.6, drive: 0.62, volTrim: 1.05, scream: 2200,
      // the signature rotary idle: hard square-wave chop, wandering revs, soft blats
      pulseDepth: 0.45, pulseDiv: 2, pulseType: "square", hunt: 2.2, idleBlat: true,
    },
  },
  {
    id: "kodiak", name: "Kodiak TD", tag: "workhorse truck", layout: "I4 diesel",
    cyl: 4, idle: 750, max: 4400, cut: 4550, inertia: 0.55, noPop: true,
    twoStage: true, ignKey: true,   // diesel: glow plugs have to warm before it will fire
    curve: [[0, 120], [700, 195], [1300, 255], [1900, 278], [2800, 258], [3600, 214],
            [4400, 150], [4800, 80]],
    mass: 1980, finalDrive: 3.9, clutchCap: 650, cdA: 0.75, brakeMax: 11000,
    asp: "turbo", pops: 0, boostMax: 0.75, spool: 1400, spoolRate: 3.0, psiMax: 26,
    turboBreath: 2.0, breathHz: 1100,            // workhorse charge-air hiss
    tachMax: 5, redK: 4.4, kmhMax: 180, mphMax: 120, dial: "gear",
    sound: { layers: [["square", 1, 0.42], ["sawtooth", 0.5, 0.42], ["square", 1.51, 0.2], ["triangle", 3.02, 0.05]], noiseMul: 2.4, drive: 0.7, pulseDepth: 0.4, pulseDiv: 2, raspMul: 1.5 },
  },
  {
    id: "tempest", name: "Tempest MkIV", tag: "single big turbo", layout: "I6",
    cyl: 6, idle: 850, max: 7600, cut: 7800, inertia: 0.33,
    start: { rpm: 265, dur: 0.7,  fires: 3, flare: 0.6,  flareT: 0.55, grit: 1.2 },
    twoStage: true, ignKey: true,   // 90s ECU + fuel pump prime before the starter
    curve: [[0, 80], [1000, 148], [2500, 208], [4000, 238], [5500, 248], [6800, 236],
            [7600, 208], [8200, 130]],
    mass: 1450, finalDrive: 3.7, clutchCap: 700, cdA: 0.64, brakeMax: 12000,
    asp: "turbo", pops: 1, boostMax: 1.05, spool: 3400, spoolRate: 1.6, psiMax: 22,
    flutter: true, whistleMul: 1.6,      // big single: loud spool whistle, surge flutter
    turboChop: 0.55,                     // whistle chatters "sti-zu-zu-zu" on boost
    tachMax: 9, redK: 7.6, kmhMax: 320, mphMax: 200,
    sound: { layers: [["sawtooth", 1, 0.5], ["sawtooth", 2.02, 0.26], ["square", 0.5, 0.3], ["triangle", 4.04, 0.07]], noiseMul: 1.1, drive: 0.58, pulseDepth: 0.18, raspMul: 1.1 },
  },
  {
    id: "tempest3k", name: "Tempest 3000R", tag: "3000 hp drag missile", layout: "I6 · 98mm single",
    cyl: 6, idle: 1100, max: 9800, cut: 10200, inertia: 0.3, shiftLights: true,
    curve: [[0, 120], [1500, 260], [3000, 420], [5000, 560], [7000, 600], [8500, 580],
            [9800, 520], [10500, 300]],
    mass: 1580, finalDrive: 3.13, clutchCap: 2800, cdA: 0.62, brakeMax: 14000, grip: 2.0,
    asp: "turbo", pops: 2, boostMax: 3.0, spool: 4200, spoolRate: 1.1, psiMax: 55,
    flutter: true, whistleMul: 2.2, turboChop: 0.6,   // the turbo IS the soundtrack
    tachMax: 11, redK: 9.8, kmhMax: 420, mphMax: 260,
    /* nothing below four grand, then the world ends: monster single spools
       forever and quadruples the torque when it arrives */
    sound: {
      layers: [["sawtooth", 1, 0.5, 0.54], ["sawtooth", 2.02, 0.24, 0.4], ["square", 0.5, 0.3, 0.12],
               ["sawtooth", 1.5, 0.08, 0.22], ["triangle", 4.04, 0.04, 0.16]],
      noiseMul: 1.5, drive: 0.72, pulseDepth: 0.2, raspMul: 1.4, scream: 2800, volTrim: 1.25,
      formants: [[280, 1.2, 4.5], [1500, 2, 5], [3000, 2.2, 4.5]], loadDrive: 0.5,
    },
  },
  {
    id: "hellion", name: "Hellion 6.2 SC", tag: "supercharged muscle", layout: "V8",
    cyl: 8, idle: 680, max: 6400, cut: 6550, inertia: 0.44,
    start: { rpm: 230, dur: 0.66, fires: 3, flare: 0.75, flareT: 0.6, grit: 1.15 },
    twoStage: true, ignKey: true,   // ignition on, let the pump build, then crank
    curve: [[0, 150], [700, 318], [2000, 415], [3500, 468], [4800, 478], [5800, 452],
            [6400, 408], [6900, 280]],
    mass: 1760, finalDrive: 3.3, clutchCap: 820, cdA: 0.68, brakeMax: 12000,
    grip: 1.35,                                   // hooks harder, still loves to spin
    asp: "super", pops: 1, boostMax: 0.35, whineMult: 8.5, psiMax: 9,
    tachMax: 7, redK: 6.4, kmhMax: 320, mphMax: 200, dial: "classic",
    sound: { layers: [["square", 0.5, 0.5], ["sawtooth", 1, 0.38], ["sawtooth", 1.49, 0.2], ["triangle", 2.01, 0.1]], noiseMul: 1.3, drive: 0.62, pulseDepth: 0.32, pulseDiv: 2, pulseType: "square", hunt: 1.5, raspMul: 1.15 },
  },
  {
    id: "vandal", name: "Vandal 4.0 TT", tag: "twin-turbo bruiser", layout: "V8 · twin turbo",
    cyl: 8, idle: 700, max: 7000, cut: 7200, inertia: 0.38,
    curve: [[0, 180], [700, 340], [2000, 520], [3500, 580], [5000, 560], [6200, 520],
            [7000, 470], [7500, 300]],
    mass: 1740, finalDrive: 3.2, clutchCap: 950, cdA: 0.66, brakeMax: 13000,
    grip: 1.6,
    asp: "turbo", pops: 1.5, boostMax: 0.9, spool: 2200, spoolRate: 2.4, psiMax: 18,
    whistleMul: 0.45, whistleFreqMul: 0.8,       // twins barely whistle…
    turboBreath: 2.2, breathHz: 1500,            // …they breathe — "zshhh", like a bus
    tachMax: 8, redK: 7, kmhMax: 320, mphMax: 200,
    sound: {
      layers: [["square", 0.5, 0.48, 0.2], ["sawtooth", 1, 0.4, 0.5], ["sawtooth", 1.49, 0.18],
               ["sawtooth", 2.01, 0.1, 0.3], ["triangle", 3.02, 0.06, 0.15]],
      noiseMul: 1.2, drive: 0.66, pulseDepth: 0.3, pulseDiv: 2, pulseType: "square",
      raspMul: 1.2, formants: [[150, 1, 4], [900, 1.8, 5]], loadDrive: 0.4,
    },
  },
  {
    id: "affalter", name: "Affalterbach 63 S", tag: "hot-vee biturbo brawler", layout: "V8 · biturbo",
    cyl: 8, idle: 650, max: 7000, cut: 7200, inertia: 0.4,
    curve: [[0, 200], [700, 380], [2000, 700], [3500, 780], [5000, 750], [6200, 690],
            [7000, 600], [7500, 380]],
    mass: 1780, finalDrive: 3.06, clutchCap: 1600, cdA: 0.65, brakeMax: 13500, grip: 1.6,
    asp: "turbo", pops: 2.5, boostMax: 0.85, spool: 1700, spoolRate: 2.8, psiMax: 20,
    whistleMul: 0.5, whistleFreqMul: 0.85,       // hot-vee turbos hide in the valley…
    turboBreath: 2.0, breathHz: 1400,            // …you hear breath, not whistle
    tachMax: 8, redK: 7, kmhMax: 320, mphMax: 200, dial: "classic",
    /* thunderous cross-plane bark with a constant burble underneath —
       every lift of the throttle is a drum roll */
    sound: {
      layers: [["square", 0.5, 0.5, 0.2], ["sine", 0.5, 0.3, 0.12], ["sawtooth", 1, 0.42, 0.5],
               ["sawtooth", 1.49, 0.16, 0.2], ["sawtooth", 2.01, 0.08, 0.24]],
      noiseMul: 1.25, drive: 0.68, pulseDepth: 0.3, pulseDiv: 2, pulseType: "square",
      raspMul: 1.3, volTrim: 1.15, scream: 1600, hunt: 1.3,
      formants: [[130, 1, 4.5], [800, 1.8, 5], [2000, 1.6, 3]], loadDrive: 0.5,
    },
  },
  {
    id: "woking765", name: "Woking 765LT", tag: "longtail savage · flat-plane TT", layout: "V8 · 4.0L twin turbo",
    cyl: 8, idle: 800, max: 8100, cut: 8500, inertia: 0.22,   // LT flywheel — throttle like a switch
    curve: [[0, 110], [800, 230], [2500, 360], [4500, 400], [5500, 405], [7000, 400],
            [8100, 370], [8600, 240]],
    mass: 1420, finalDrive: 3.7, clutchCap: 1500, cdA: 0.60, brakeMax: 15000, grip: 1.75,
    asp: "turbo", pops: 2.8, boostMax: 0.9, spool: 2600, spoolRate: 2.3, psiMax: 21,
    flutter: true, whistleMul: 1.1, whistleFreqMul: 1.15,   // you HEAR these turbos…
    turboChop: 0.4, turboBreath: 1.4, breathHz: 1700,       // …flutter, chatter, gasp
    tachMax: 9, redK: 8.1, kmhMax: 340, mphMax: 210, shiftLights: true,
    dash: { accent: "#ff8000" },
    /* the longtail: a flat-plane twin-turbo V8 breathing through a titanium
       exhaust with barely any silencing. Not a musical engine — an ANGRY one:
       flinty, raspy, industrial, all whooshes and flutter and crackle, with a
       hard metallic yowl at the top. The turbos are half the soundtrack and
       every lift is a firefight out of the quad tips. */
    sound: {
      layers: [
        ["square",   0.5,   0.26, 0.08],   // gravel at idle
        ["sine",     0.5,   0.18, 0.05],   // a little chest under it
        ["sawtooth", 0.996, 0.18, 0.26],   // unison low…
        ["sawtooth", 1,     0.46, 0.50],   // …center voice…
        ["sawtooth", 1.006, 0.20, 0.28],   // …unison high
        ["sawtooth", 2.01,  0.16, 0.50],   // THE flat-plane order — dominant up top
        ["sawtooth", 3.02,  0.05, 0.36],   // titanium yowl
        ["sawtooth", 4.03,  0.0,  0.22],   // metallic edge
        ["triangle", 5.04,  0.0,  0.14],   // thin sparkle over the rasp
      ],
      formants: [[240, 1.1, 4], [1400, 2.0, 5.5], [3300, 2.5, 6.5]],
      loadDrive: 0.5, noiseMul: 1.3, volTrim: 1.2, scream: 3400,
      drive: 0.72, pulseDepth: 0.18, raspMul: 1.6, jitter: 1.2,
    },
  },
  {
    id: "falkner", name: "Falkner S6", tag: "howling straight-six", layout: "I6 NA",
    cyl: 6, idle: 850, max: 8000, cut: 8250, inertia: 0.26,
    twoStage: true, ignKey: true,
    curve: [[0, 80], [900, 160], [2500, 220], [4500, 262], [6000, 270], [7200, 258],
            [8000, 235], [8600, 150]],
    mass: 1360, finalDrive: 4.05, clutchCap: 340, cdA: 0.61, brakeMax: 11500,
    asp: "na", pops: 1, tachMax: 9, redK: 8, kmhMax: 280, mphMax: 180,
    sound: {
      layers: [["sawtooth", 1, 0.46, 0.52], ["sawtooth", 1.5, 0.14, 0.3], ["sawtooth", 2.01, 0.12, 0.34],
               ["square", 0.5, 0.26, 0.08], ["triangle", 3.02, 0.05, 0.22], ["sine", 4.5, 0, 0.1]],
      noiseMul: 1, drive: 0.6, pulseDepth: 0.14, raspMul: 1.15, scream: 2600, volTrim: 1.05,
      formants: [[350, 1.4, 4], [2400, 2.4, 5.5]], loadDrive: 0.3,
    },
  },
  {
    id: "bavaria", name: "Bavaria M58", tag: "twin-turbo six · check engine soon", layout: "I6 · twin turbo",
    cyl: 6, idle: 750, max: 7200, cut: 7400, inertia: 0.3, cel: true,
    twoStage: true, ignKey: true,   // old barrel lock — key to ON, then hold it over
    curve: [[0, 120], [800, 260], [2000, 480], [3500, 520], [5500, 500], [6500, 470],
            [7200, 420], [7700, 280]],
    mass: 1720, finalDrive: 3.46, clutchCap: 1000, cdA: 0.63, brakeMax: 13000, grip: 1.45,
    asp: "turbo", pops: 1.5, boostMax: 0.8, spool: 1900, spoolRate: 2.6, psiMax: 18,
    whistleMul: 0.6, whistleFreqMul: 0.9, turboBreath: 1.6, breathHz: 1300,
    tachMax: 8, redK: 7.2, kmhMax: 300, mphMax: 190,
    /* creamy straight-six snarl. runs perfectly. runs perfectly. runs perf—
       the check-engine light is part of the ownership experience (cel: true) */
    sound: {
      layers: [["sawtooth", 1, 0.46, 0.5], ["sawtooth", 1.5, 0.12, 0.28], ["sawtooth", 2.01, 0.1, 0.3],
               ["square", 0.5, 0.28, 0.1], ["triangle", 3.02, 0.04, 0.18]],
      noiseMul: 1.05, drive: 0.62, pulseDepth: 0.16, raspMul: 1.15, scream: 2400, volTrim: 1.05,
      formants: [[300, 1.3, 4], [1800, 2.2, 5]], loadDrive: 0.35,
    },
  },
  {
    id: "zuffen", name: "Zuffenhausen 4.0 RS", tag: "9k flat-six howl", layout: "F6 · 4.0L NA",
    cyl: 6, idle: 900, max: 9000, cut: 9250, inertia: 0.2, shiftLights: true,
    curve: [[0, 90], [1000, 200], [3000, 320], [5000, 400], [6500, 450], [8000, 465],
            [9000, 430], [9600, 280]],
    mass: 1430, finalDrive: 4.19, clutchCap: 600, cdA: 0.62, brakeMax: 14500, grip: 1.7,
    asp: "na", pops: 2, tachMax: 10, redK: 9, kmhMax: 320, mphMax: 200,
    /* mechanical clatter at idle blooming into that hard metallic
       intake howl only a flat-six makes at nine grand */
    sound: {
      layers: [["sawtooth", 1, 0.44, 0.52], ["sawtooth", 2.02, 0.22, 0.42], ["sawtooth", 3.01, 0.06, 0.26],
               ["square", 0.5, 0.26, 0.08], ["triangle", 4.5, 0, 0.14]],
      noiseMul: 1.2, drive: 0.6, pulseDepth: 0.14, raspMul: 1.35, scream: 3200, volTrim: 1.1,
      formants: [[380, 1.4, 4.5], [2600, 2.6, 6], [4200, 2.2, 4]], loadDrive: 0.4,
    },
  },
  {
    id: "hexen", name: "Hexen 5.2 FP", tag: "flat-plane screamer", layout: "V8 NA · flat-plane",
    cyl: 8, idle: 800, max: 8250, cut: 8500, inertia: 0.3,
    curve: [[0, 110], [800, 230], [3000, 380], [5000, 480], [6500, 530], [7500, 520],
            [8250, 480], [8900, 300]],
    mass: 1660, finalDrive: 3.73, clutchCap: 700, cdA: 0.65, brakeMax: 13000,
    grip: 1.5,
    asp: "na", pops: 2, tachMax: 9, redK: 8.25, kmhMax: 320, mphMax: 200,
    sound: {
      layers: [["sawtooth", 1, 0.44, 0.52], ["sawtooth", 2.02, 0.24, 0.44], ["sawtooth", 1.5, 0.08, 0.2],
               ["square", 0.5, 0.3, 0.1], ["triangle", 3.5, 0, 0.2]],
      noiseMul: 1.15, drive: 0.68, pulseDepth: 0.2, raspMul: 1.45, scream: 2800, volTrim: 1.1,
      formants: [[250, 1.2, 4], [1300, 2, 5], [3100, 2.6, 6]], loadDrive: 0.45,
    },
  },
  {
    id: "kirin", name: "Kirin V6-H", tag: "hybrid torque-fill", layout: "V6 · hybrid",
    cyl: 6, idle: 750, max: 8500, cut: 8800, inertia: 0.24, shiftLights: true,
    curve: [[0, 90], [800, 180], [2500, 280], [4500, 330], [6500, 345], [7800, 330],
            [8500, 300], [9100, 180]],
    mass: 1520, finalDrive: 3.6, clutchCap: 620, cdA: 0.60, brakeMax: 13500,
    grip: 1.8,                                    // e-motor torque-fill + sticky tires
    asp: "hybrid", pops: 1, boostMax: 0.5, psiMax: 100,
    tachMax: 10, redK: 8.5, kmhMax: 320, mphMax: 200,
    sound: {
      layers: [["sawtooth", 1, 0.44, 0.5], ["sawtooth", 2.02, 0.2, 0.4], ["square", 0.5, 0.3, 0.1],
               ["triangle", 3.02, 0.05, 0.25], ["sine", 6, 0, 0.08]],
      noiseMul: 1.05, drive: 0.62, pulseDepth: 0.16, raspMul: 1.2, scream: 2600, volTrim: 1.05,
      formants: [[200, 1, 3.5], [1200, 2, 5]], loadDrive: 0.4,
    },
  },
  {
    id: "cavallino", name: "Maranello 296", tag: "hybrid V6 · eDrive", layout: "V6 · twin turbo + e-motor",
    cyl: 6, idle: 900, max: 8500, cut: 8700, inertia: 0.19, shiftLights: true,
    curve: [[0, 260], [1500, 460], [3000, 590], [4500, 650], [6000, 665], [6500, 665],
            [7500, 645], [8000, 615], [8500, 570], [9200, 380]],
    // clutchCap must clear peak torque × full boost (665 × 1.78 ≈ 1180) or the
    // clutch slips at the top end and the revs hunt — that was the instability
    mass: 1545, finalDrive: 3.62, clutchCap: 1600, cdA: 0.58, brakeMax: 15500, grip: 1.85,
    asp: "turbo", pops: 0.8, boostMax: 0.78, spool: 2400, spoolRate: 2.6, psiMax: 26,
    whistleMul: 0.55, whistleFreqMul: 1.05, turboBreath: 1.0, breathHz: 1600,
    tachMax: 9, redK: 8.5, kmhMax: 340, mphMax: 210,
    // hybrid eDrive: silent electric running up to ~50mph. The V6 never fires
    // on its own — you choose the moment (H / eDrive button). See fireHybrid().
    edrive: true, evCapKmh: 80, evForce: 9600, badge: "eDRIVE",
    dash: { accent: "#f5c518", face: "dark" },
    /* the 120° hot-vee V6 Ferrari calls "the little V12": an even 240° firing
       order with equal-length headers gives a clean, SOPRANO wail — the voice
       lives in the upper harmonics, not the fundamental. A tight 3-voice
       chorus for body, then 2nd/3rd/4th-order sawtooths that take over as the
       revs climb, and pure high partials that turn to song above 6k. High
       formants (the tuned "hot tube" resonator), civil rasp, almost no burble
       — this engine sings, it doesn't shout. */
    sound: {
      layers: [
        ["sine",     0.5,   0.16, 0.04],   // light sub — just enough chest
        ["square",   0.5,   0.14, 0.03],   // faint low-rev muscle, gone up top
        ["sawtooth", 0.996, 0.18, 0.22],   // unison low…
        ["sawtooth", 1,     0.42, 0.44],   // …center voice…
        ["sawtooth", 1.005, 0.20, 0.26],   // …unison high — tight 3-voice chorus
        ["sawtooth", 1.5,   0.08, 0.20],   // half-order colour between firings
        ["sawtooth", 2.01,  0.16, 0.52],   // 2nd order — the wail's backbone
        ["sawtooth", 3.02,  0.06, 0.46],   // 3rd order — intake howl, huge up top
        ["sawtooth", 4.03,  0.0,  0.30],   // 4th order — metallic edge at 8k+
        ["triangle", 5.04,  0.0,  0.20],   // silky shimmer
        ["sine",     6.02,  0.0,  0.16],   // pure soprano air over the top
        ["sine",     8.04,  0.0,  0.09],   // glassy sparkle at the redline
      ],
      formants: [[260, 1.0, 3.5], [1900, 2.4, 6], [4300, 2.9, 7.5]],
      loadDrive: 0.4, noiseMul: 0.95, volTrim: 1.18, scream: 4400,
      drive: 0.6, pulseDepth: 0.12, raspMul: 1.2,
    },
  },
  {
    id: "f458", name: "Maranello 458 Spider", tag: "the last pure NA V8 · top down", layout: "V8 · 4.5L flat-plane",
    cyl: 8, idle: 900, max: 9000, cut: 9250, inertia: 0.17, shiftLights: true,
    start: { rpm: 265, dur: 0.68, fires: 4, flare: 0.95, flareT: 0.85 },
    curve: [[0, 170], [1000, 300], [3000, 430], [5000, 505], [6000, 540], [7500, 532],
            [8500, 508], [9000, 485], [9700, 330]],
    mass: 1505, finalDrive: 3.9, clutchCap: 1200, cdA: 0.61, brakeMax: 15000, grip: 1.7,
    asp: "na", pops: 2.2, tachMax: 10, redK: 9, kmhMax: 330, mphMax: 205,
    dial: "classic", dash: { accent: "#f2c200" },
    camAt: 6000,                          // the intake resonators open — the voice hardens
    /* the 4.5 flat-plane V8, roof off. A 180° crank fires left-right-left-
       right in perfect alternation — two inline-fours in lockstep — so the
       2nd order OWNS the voice. Gravelly baritone at idle, a hard metallic
       bark through the middle, then past six grand the intake resonators
       open (camAt) and it turns into that shrieking, wide-open WAAAAH to
       nine thousand. Sharp crackle on every lift. */
    sound: {
      layers: [
        ["sine",     0.5,   0.22, 0.05],   // chest at idle, gone up top
        ["square",   0.5,   0.24, 0.06],   // the gravel in the baritone
        ["sawtooth", 0.995, 0.20, 0.28],   // unison low…
        ["sawtooth", 1,     0.46, 0.50],   // …center voice…
        ["sawtooth", 1.006, 0.22, 0.30],   // …unison high — 3-voice chorus
        ["sawtooth", 1.5,   0.06, 0.16],   // flat-plane = even fire, little between-note
        ["sawtooth", 2.01,  0.18, 0.54],   // THE flat-plane order — dominant to 9k
        ["sawtooth", 3.02,  0.07, 0.44],   // intake scream
        ["sawtooth", 4.03,  0.0,  0.28],   // metallic edge at the top
        ["triangle", 5.04,  0.0,  0.18],   // silky sparkle
        ["sine",     6.02,  0.0,  0.14],   // open-air sheen over the wail
      ],
      formants: [[280, 1.1, 4], [1700, 2.3, 6], [4000, 2.8, 7]],
      loadDrive: 0.5, noiseMul: 1.1, volTrim: 1.28, scream: 4200,
      drive: 0.66, pulseDepth: 0.16, raspMul: 1.45,
    },
  },
  {
    id: "kaze", name: "Kaze 787", tag: "quad-rotor Le Mans legend", layout: "4-rotor · 2.6L",
    cyl: 8, idle: 1100, max: 9000, cut: 9300, inertia: 0.11,  // R26B: pure response
    start: { rpm: 320, dur: 0.72, fires: 3, flare: 0.95, flareT: 0.8, whine: 1500 },
    twoStage: true,          // race car: master switch, pump, THEN the button
    curve: [[0, 120], [1500, 300], [3500, 450], [5000, 540], [6500, 608], [7800, 590],
            [9000, 555], [9700, 380]],
    mass: 830, finalDrive: 3.1, clutchCap: 800, cdA: 0.58, brakeMax: 16000,
    grip: 2.3,                                    // Le Mans slicks
    asp: "na", pops: 2.5, tachMax: 10, redK: 9, kmhMax: 360, mphMax: 240,
    dial: "gear", shiftLights: true,
    sound: {
      layers: [["sawtooth", 1, 0.4, 0.48], ["sawtooth", 2.02, 0.34, 0.5], ["sawtooth", 3.01, 0.14, 0.34],
               ["square", 0.5, 0.34, 0.12], ["sawtooth", 1.5, 0.08, 0.2]],
      noiseMul: 1.6, raspMul: 2.0, drive: 0.78, pulseDepth: 0.45, pulseType: "square",
      hunt: 2.2, idleBlat: 2.4, idleVol: 0.26, scream: 3000, volTrim: 1.3,
      formants: [[300, 1.2, 4], [1600, 2.2, 6], [3400, 2.6, 7]], loadDrive: 0.5,
    },
  },
  {
    id: "ionia", name: "Ionia ZR", tag: "silent slingshot", layout: "dual-motor EV",
    ev: true, awd: true, grip: 2.9, noPop: true,               // launch-compound tires
    cyl: 2, idle: 0, max: 18000, cut: 18500, inertia: 0.09,
    curve: [[0, 1420], [4000, 1420], [8000, 1050], [12000, 700], [16000, 470], [19000, 300]],
    mass: 2100, finalDrive: 6.5,
    ratios: { R: -1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 },   // single-speed reduction
    clutchCap: 2400, cdA: 0.58, brakeMax: 16000,
    asp: "ev", pops: 0, tachMax: 19, redK: 18, kmhMax: 360, mphMax: 200,
    sound: {
      layers: [["sine", 6, 0.05, 0.2], ["sine", 9.02, 0.02, 0.12],
               ["triangle", 3.01, 0.06, 0.1], ["sine", 1.5, 0.1, 0.06]],
      noiseMul: 0.35, drive: 0.3, pulseDepth: 0.02, raspMul: 0.15, volTrim: 0.6, scream: 1500,
    },
  },
  {
    id: "molsheim", name: "Molsheim 16.4", tag: "quad-turbo hypercar", layout: "W16 · quad turbo",
    awd: true,
    cyl: 16, idle: 800, max: 7100, cut: 7300, inertia: 0.5,
    start: { rpm: 195, dur: 1.15, fires: 6, flare: 0.6,  flareT: 0.7,  whine: 900 },
    curve: [[0, 300], [800, 520], [2000, 760], [3000, 880], [4500, 900], [6000, 860],
            [7100, 780], [7600, 500]],
    mass: 1995, finalDrive: 2.0, clutchCap: 2600, cdA: 0.50, brakeMax: 17000,
    grip: 2.1,                                    // AWD launch — mid-2s to 60
    asp: "turbo", pops: 1, boostMax: 0.85, spool: 1400, spoolRate: 3.2, psiMax: 22,
    seqTurbo: { at: 3800, span: 1500, share: 0.45 },  // two turbos low, all four past 3800
    tachMax: 8, redK: 7.1, kmhMax: 520, mphMax: 320, dial: "classic",
    whistleFreqMul: 0.45, whistleMul: 1.2,       // quad turbos breathe LOW — "zohh"
    turboBreath: 1.6, breathHz: 650,
    /* sixteen cylinders reads as a deep, jet-like rush — f0Mul drops the
       whole voice a full octave, so even at the 7100rpm redline it stays a
       chest-deep freight-train roar instead of climbing into a scream */
    sound: {
      layers: [["sine", 0.25, 0.5, 0.6], ["sine", 0.5, 0.7, 0.75], ["square", 0.25, 0.14, 0.2],
               ["square", 0.5, 0.32, 0.34], ["sawtooth", 1, 0.36, 0.42], ["sawtooth", 1.004, 0.2, 0.24],
               ["sawtooth", 2.01, 0.04, 0.09], ["triangle", 3.02, 0.01, 0.04]],
      noiseMul: 0.9, drive: 0.74, pulseDepth: 0.2, pulseDiv: 2, raspMul: 0.85, volTrim: 1.5,
      scream: 800, lpMul: 0.55, f0Mul: 0.5,
      formants: [[55, 0.8, 6], [340, 1.3, 5], [1200, 1.8, 2.5]], loadDrive: 0.45,
    },
  },
  {
    id: "absolut", name: "Ängelholm Absolut", tag: "twin-turbo top-speed missile · 0-400-0", layout: "V8 · 5.0L flat-plane twin turbo",
    cyl: 8, idle: 820, max: 8500, cut: 8700, inertia: 0.15,   // flat crank, feathery response
    start: { rpm: 245, dur: 0.78, fires: 4, flare: 0.8,  flareT: 0.7 },
    curve: [[0, 300], [1500, 660], [3000, 940], [4500, 1020], [6000, 985], [7200, 890],
            [8500, 720], [9000, 480]],
    mass: 1420, finalDrive: 2.35, clutchCap: 2400, cdA: 0.42, brakeMax: 16500, grip: 1.9,
    asp: "turbo", pops: 2.2, boostMax: 0.68, spool: 2500, spoolRate: 2.3, psiMax: 25,
    flutter: true, whistleMul: 0.7, whistleFreqMul: 1.05, turboBreath: 1.3, breathHz: 1550,
    tachMax: 9, redK: 8.5, kmhMax: 540, mphMax: 330, shiftLights: true,
    dash: { accent: "#cfe0ee" },
    /* the 5.0 twin-turbo built to chase 330 mph: NOT a high shriek — the big
       turbos and long plumbing give it a deep, muscular, chest-heavy bark that
       hardens as it climbs, with the fundamental doing the heavy lifting and a
       constant turbo breath underneath. f0Mul drops the whole voice down. */
    sound: {
      layers: [
        ["square",   0.5,   0.34, 0.14],   // muscle/gravel at idle
        ["sine",     0.5,   0.24, 0.10],   // chest sub
        ["sawtooth", 0.996, 0.22, 0.30],   // unison low…
        ["sawtooth", 1,     0.50, 0.52],   // …dominant center voice
        ["sawtooth", 1.006, 0.22, 0.30],   // …unison high
        ["sawtooth", 1.5,   0.10, 0.22],   // half-order colour
        ["sawtooth", 2.01,  0.14, 0.34],   // 2nd order — present, not screaming
        ["sawtooth", 3.02,  0.04, 0.16],   // faint metallic edge only up top
      ],
      formants: [[150, 1.0, 4], [700, 1.8, 5], [1900, 2.0, 4.5]],
      loadDrive: 0.5, noiseMul: 1.2, volTrim: 1.15, scream: 2000,
      drive: 0.7, pulseDepth: 0.22, raspMul: 1.35, jitter: 1.0, f0Mul: 0.85,
    },
  },
];

let CC = CARS[1];                      // current car (Shirakawa by default)

/* live engine / chassis params — populated from the selected car */
const ENG = { idle: 950, max: 9000, cut: 9200, stall: 570, inertia: 0.24, curve: CC.curve, tqMul: 1 };
const CAR = {
  mass: 1150, wheelR: 0.312, finalDrive: 4.4, eff: 0.85,
  ratios: DEFAULT_RATIOS, cdA: 0.6, roll: 145, brakeMax: 10500, clutchCap: 300,
};

function applyCar(c) {
  const m = (S && S.mods && S.mods[c.id]) || {};
  // the starter itself changes car to car: the Sant'Agata cars wear the red
  // flip-up cover, and the older/ornerier stuff wants electronics first
  const ign = $("ignition");
  if (ign) {
    ign.classList.toggle("has-cap", !!c.startCap);
    ign.classList.toggle("has-key", !!c.ignKey);
    ign.classList.toggle("cap-open", !!(c.startCap && S && S.capOpen));
    ign.title = c.ignKey
      ? "Key to ON, then over to START (I)"
      : c.startCap
        ? "Flip the cover, then start (I)"
        : c.twoStage
          ? "Press for electronics, again to start (I)"
          : "Start / stop engine (I)";
  }
  const tuned = !!m.tune;
  ENG.idle = c.idle;
  ENG.max = c.max + (tuned ? 400 : 0);            // race tune revs higher…
  ENG.cut = c.cut + (tuned ? 400 : 0);
  ENG.tqMul = tuned ? 1.25 : 1;                   // …and hits harder
  // internal friction scales with engine size — a 49cc single doesn't fight
  // the same 16Nm of pumping losses a 6.5L V12 does
  ENG.fric = clamp(Math.max(...c.curve.map(p => p[1])) / 150, 0.12, 1);
  ENG.stall = Math.round(c.idle * 0.6);
  // rev speed: lighter effective flywheel = the revs climb faster. Combines the
  // car's built-in rev character with the workshop's rev-speed slider.
  const revScale = (c.revRate || 1) * (m.rev || 1);
  ENG.revScale = revScale;
  ENG.inertia = c.inertia / revScale;
  ENG.curve = c.curve;
  CAR.mass = c.mass;
  CAR.finalDrive = c.finalDrive * (m.gear || 1);  // workshop final drive
  CAR.ratios = c.ratios || DEFAULT_RATIOS;
  CAR.top = gearCount(CAR.ratios);
  CAR.cdA = c.cdA; CAR.brakeMax = c.brakeMax; CAR.clutchCap = c.clutchCap;
  CAR.roll = Math.round(c.mass * 0.126);
  applyDash(c);
}

/* custom cars carry their own dashboard palette — override the theme's gauge
   colours inline while one is selected, then hand control back to the theme */
function applyDash(c) {
  const b = document.body.style;
  const keys = ["--accent", "--accent-soft", "--accent-glow", "--redline",
                "--needle", "--face", "--face-ring", "--tick", "--tick-dim"];
  keys.forEach(k => b.removeProperty(k));
  const d = c && c.dash;
  if (!d) return;
  if (d.accent) {
    b.setProperty("--accent", d.accent);
    b.setProperty("--accent-soft", hexA(d.accent, 0.16));
    b.setProperty("--accent-glow", hexA(d.accent, 0.45));
    b.setProperty("--needle", d.accent);
  }
  if (d.face === "light") {
    b.setProperty("--face", "#ece1cb"); b.setProperty("--face-ring", "#d9cdb4");
    b.setProperty("--tick", "#3b3227"); b.setProperty("--tick-dim", "#a3937a");
  } else if (d.face === "dark") {
    b.setProperty("--face", "#0e0f12"); b.setProperty("--face-ring", "#1c1d22");
    b.setProperty("--tick", "#b9bbc2"); b.setProperty("--tick-dim", "#4c4e56");
  }
}

// "#rrggbb" + alpha → "rgba(r,g,b,a)"
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}

const RATES = { thrUp: 4.6, thrDn: 5.6, brkUp: 5.2, brkDn: 6.0, cltUp: 9.0, cltDn: 2.0 };

/* flyby pass speed: below 300 km/h the trackside car sweeps by at its true
   speed; above 300 the pass snaps past dramatically faster. Only the excess
   over 300 is amplified, so nothing at or below 300 km/h changes. */
function flybyV() {
  const raw = Math.abs(S.v), th = 300 / 3.6;      // 83.3 m/s
  return raw <= th ? raw : th + (raw - th) * 3.6;
}

/* ---------------- workshop modifications ---------------- */

const EXHAUSTS = {
  stock: {
    name: "Stock", desc: "Factory system. Clean and civil, as delivered.",
    look: "stock",
  },
  touring: {
    name: "Touring", desc: "Extra muffling, long tailpipes. Quieter than stock — deep and distant.",
    volMul: 0.78, bright: -260, raspAdd: -0.2, popMul: 0.5, look: "touring",
  },
  loud: {
    name: "Open Pipe", desc: "Barely muffled straight-through. Everything, much louder.",
    volMul: 1.45, driveAdd: 0.16, raspAdd: 0.45, popMul: 1.35, look: "open",
  },
  titanium: {
    name: "Full Titanium", desc: "Featherweight race system, burnt-blue tips. Dry metallic ring that hardens with revs.",
    volMul: 1.18, formantMul: 1.35, bright: 1800, raspAdd: 0.3, driveAdd: 0.06, popMul: 1.2, look: "ti",
  },
  screamer: {
    name: "Screamer", desc: "Thin-wall high-flow pipes. Rings bright and metallic up top.",
    volMul: 1.08, formantMul: 1.6, bright: 2400, raspAdd: 0.2, popMul: 1.1, look: "screamer",
  },
  decat: {
    name: "De-Cat Straight", desc: "Cats in the bin. Filthy, gravelly, louder everywhere. Smells like victory.",
    volMul: 1.3, driveAdd: 0.12, raspAdd: 0.55, bright: 600, popMul: 1.5, look: "decat",
  },
  antilag: {
    name: "Anti-Lag", desc: "Fuel in the pipes. Bangs on every shift, flames, constant crackle.",
    volMul: 1.12, popMul: 1.7, burble: true, bright: 300, forcePops: 1.6, look: "antilag",
  },
};

function curMod() {
  let m = S.mods[CC.id];
  if (!m) { m = { ex: "stock", pitch: 1, gear: 1, tune: false, abs: true }; S.mods[CC.id] = m; }
  if (m.gear === undefined) m.gear = 1;
  if (m.rev === undefined) m.rev = 1;
  if (m.vol === undefined) m.vol = 1;
  if (m.tone === undefined) m.tone = 0;
  if (m.pop === undefined) m.pop = 1;
  if (m.tune === undefined) m.tune = false;
  if (m.abs === undefined) m.abs = true;
  if (m.shift === undefined) m.shift = "stock";
  if (m.paddle === undefined) m.paddle = "carbon";  // default = the real recorded click
  if (!EXHAUSTS[m.ex]) m.ex = "stock";     // repair saves hit by the old card bug
  return m;
}
function curEx() { return EXHAUSTS[curMod().ex] || EXHAUSTS.stock; }
/* effective pops rating — anti-lag makes any car bang */
function popsRating() {
  const ex = curEx();
  return ex.forcePops ? Math.max(CC.pops || 0, ex.forcePops) : (CC.pops || 0);
}
/* combined pop loudness/frequency multiplier: exhaust choice × workshop slider */
function popEff() { return (curEx().popMul || 1) * curMod().pop; }

/* ---------------- state ---------------- */

const S = {
  mode: "auto", units: "kmh", muted: false, voice: true,
  engineOn: false, cranking: false, stalled: false,
  acc: false,        // electronics live, engine not turning (two-stage cars)
  capOpen: false,    // the red starter cover is flipped up
  powered: false, eDrive: "gas",       // eDrive cars: system-on flag + ev|gas motor
  rpm: 0, v: 0, odo: 0, boost: 0,
  gear: 0,                             // 0=N, 1..6, "R"
  autoSel: "P", autoGear: 1,
  in: { gas: 0, brake: 0, clutch: 0 }, // key/pointer targets
  throttle: 0, brake: 0, clutchPedal: 0,
  effThrottle: 0, engage: 0, locked: false,
  shiftCut: 0, shiftCool: 0, cutTimer: 0, blip: 0, catchT: 0, catchAmt: 0.55, pendShift: false,
  tunnel: false, flyby: false, flyX: -380, cabin: false, mods: {},
  ltTgt: { kmh: 100, mph: 60 },          // launch-timer target speed per unit system
  spinV: 0, lockup: false,
  traffic: false, rain: false, passT: 2, splashT: 2, wiperT: 0.7, wiperDir: 1,
  night: false, cricketT: 2, lampT: 1.5,
  cruise: { on: false, set: 0, i: 0 },
  station: null,
  sweep: -1,
  needle: { rpm: 0, rpmV: 0, spd: 0, spdV: 0 },
  grinding: false,
};

const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const cssVar = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();

function torqueAt(rpm) {
  const c = ENG.curve;
  if (rpm <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (rpm <= c[i][0]) {
      const t = (rpm - c[i - 1][0]) / (c[i][0] - c[i - 1][0]);
      return c[i - 1][1] + t * (c[i][1] - c[i - 1][1]);
    }
  }
  return c[c.length - 1][1];
}

/* ================================================================
   AUDIO — everything synthesized, no files
   ================================================================ */

const AU = { ctx: null, ready: false };

function initAudio() {
  if (AU.ready) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  AU.ctx = ctx;

  AU.master = ctx.createGain();
  AU.master.gain.value = S.muted ? 0 : 0.85;

  // --- output routing: dry + tunnel reverb (convolver) + slapback echo,
  //     glued by a final compressor so loud pops never clip ---
  AU.comp = ctx.createDynamicsCompressor();
  AU.comp.threshold.value = -12; AU.comp.ratio.value = 4;
  AU.comp.attack.value = 0.003; AU.comp.release.value = 0.25;
  AU.comp.connect(ctx.destination);

  // cabin stage: interior mode seals the highs behind glass and lets the
  // low end boom through the body structure
  AU.cabLp = ctx.createBiquadFilter(); AU.cabLp.type = "lowpass";
  AU.cabLp.frequency.value = 20000; AU.cabLp.Q.value = 0.7;
  AU.cabShelf = ctx.createBiquadFilter(); AU.cabShelf.type = "lowshelf";
  AU.cabShelf.frequency.value = 110; AU.cabShelf.gain.value = 0;
  AU.master.connect(AU.cabLp); AU.cabLp.connect(AU.cabShelf);

  // flyby stage: everything passes through a distance gain + position panner
  AU.flyGain = ctx.createGain(); AU.flyGain.gain.value = 1;
  AU.flyPan = ctx.createStereoPanner(); AU.flyPan.pan.value = 0;
  AU.cabShelf.connect(AU.flyGain); AU.flyGain.connect(AU.flyPan);

  AU.dry = ctx.createGain(); AU.dry.gain.value = 1;
  AU.flyPan.connect(AU.dry); AU.dry.connect(AU.comp);

  AU.conv = ctx.createConvolver(); AU.conv.buffer = makeTunnelIR(ctx);
  AU.wet = ctx.createGain(); AU.wet.gain.value = 0;
  AU.flyPan.connect(AU.conv); AU.conv.connect(AU.wet); AU.wet.connect(AU.comp);

  AU.echo = ctx.createDelay(0.6); AU.echo.delayTime.value = 0.24;
  AU.echoFb = ctx.createGain(); AU.echoFb.gain.value = 0.46;
  AU.echoWet = ctx.createGain(); AU.echoWet.gain.value = 0;
  AU.flyPan.connect(AU.echo);
  AU.echo.connect(AU.echoFb); AU.echoFb.connect(AU.echo);
  AU.echo.connect(AU.echoWet); AU.echoWet.connect(AU.comp);

  // pop bus: pops take the normal path PLUS their own hot sends into the
  // reverb and echo, so gunshot crackle rings down the tunnel harder than
  // the engine note does
  AU.popBus = ctx.createGain(); AU.popBus.gain.value = 1.7;
  AU.popBus.connect(AU.master);
  AU.popRev = ctx.createGain(); AU.popRev.gain.value = 0;
  AU.popBus.connect(AU.popRev); AU.popRev.connect(AU.conv);
  AU.popEcho = ctx.createGain(); AU.popEcho.gain.value = 0;
  AU.popBus.connect(AU.popEcho); AU.popEcho.connect(AU.echo);

  // --- engine voice chain: (per-car oscillators) → soft clip → lowpass ---
  AU.engGain = ctx.createGain(); AU.engGain.gain.value = 0;
  AU.lp = ctx.createBiquadFilter(); AU.lp.type = "lowpass"; AU.lp.frequency.value = 400; AU.lp.Q.value = 0.8;
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(512);
  for (let i = 0; i < 512; i++) { const x = i / 256 - 1; curve[i] = Math.tanh(2.4 * x); }
  shaper.curve = curve;
  AU.mixIn = ctx.createGain(); AU.mixIn.gain.value = 0.5;
  AU.mixIn.connect(shaper); shaper.connect(AU.lp);

  // exhaust formants: fixed pipe resonances the engine note sweeps through —
  // this is what makes it sound like hardware instead of a synthesizer
  AU.formants = [0, 1, 2, 3].map(() => {
    const p = ctx.createBiquadFilter();
    p.type = "peaking"; p.frequency.value = 1000; p.Q.value = 1; p.gain.value = 0;
    return p;
  });
  AU.lp.connect(AU.formants[0]);
  AU.formants[0].connect(AU.formants[1]);
  AU.formants[1].connect(AU.formants[2]);
  AU.formants[2].connect(AU.formants[3]);
  AU.formants[3].connect(AU.engGain);

  // stereo width: dry left, 13ms Haas-delayed right — the car wraps around you
  AU.panL = ctx.createStereoPanner(); AU.panL.pan.value = -0.22;
  AU.panR = ctx.createStereoPanner(); AU.panR.pan.value = 0.22;
  AU.wDelay = ctx.createDelay(0.05); AU.wDelay.delayTime.value = 0.013;
  AU.engGain.connect(AU.panL); AU.panL.connect(AU.master);
  AU.engGain.connect(AU.wDelay); AU.wDelay.connect(AU.panR); AU.panR.connect(AU.master);
  AU.oscs = [];

  // combustion throb: a firing-rate LFO rides the voice gain so you can hear
  // individual cylinders — lopey at idle, smoothing out as revs climb
  AU.pulse = ctx.createOscillator(); AU.pulse.type = "sawtooth"; AU.pulse.frequency.value = 20;
  AU.pulseG = ctx.createGain(); AU.pulseG.gain.value = 0;
  AU.pulse.connect(AU.pulseG); AU.pulseG.connect(AU.mixIn.gain); AU.pulse.start();

  // --- turbo whistle / supercharger gear whine ---
  AU.whine = ctx.createOscillator(); AU.whine.type = "sine"; AU.whine.frequency.value = 800;
  AU.whineG = ctx.createGain(); AU.whineG.gain.value = 0;
  AU.whine.connect(AU.whineG); AU.whineG.connect(AU.master); AU.whine.start();

  // second whistle for sequential setups — the high-rpm pair sings its own,
  // higher note that fades in as stage two comes online
  AU.whine2 = ctx.createOscillator(); AU.whine2.type = "sine"; AU.whine2.frequency.value = 1200;
  AU.whine2G = ctx.createGain(); AU.whine2G.gain.value = 0;
  AU.whine2.connect(AU.whine2G); AU.whine2G.connect(AU.master); AU.whine2.start();

  // whistle modulation: chops a big single's whistle into "zu-zu-zu" under
  // boost, and pulses the blower whine into "yiii-yiii" at the top of the tach
  AU.wChop = ctx.createOscillator(); AU.wChop.type = "square"; AU.wChop.frequency.value = 15;
  AU.wChopG = ctx.createGain(); AU.wChopG.gain.value = 0;
  AU.wChop.connect(AU.wChopG); AU.wChopG.connect(AU.whineG.gain); AU.wChop.start();

  // supercharger rotor-mesh scream: a detuned saw pair (slow beating = gear
  // mesh shimmer) plus octave partials, high-passed so only the metallic
  // "zing" survives — hangs over the V8 like a TRX at full send
  AU.scHp = ctx.createBiquadFilter(); AU.scHp.type = "highpass";
  AU.scHp.frequency.value = 900; AU.scHp.Q.value = 0.7;
  AU.scG = ctx.createGain(); AU.scG.gain.value = 0;
  AU.scHp.connect(AU.scG); AU.scG.connect(AU.master);
  AU.scOscs = [["sawtooth", 1, 0.5], ["sawtooth", 1.011, 0.35],
               ["sine", 2.02, 0.55], ["sine", 3.01, 0.2]].map(([type, mult, g]) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = 2000;
    const og = ctx.createGain(); og.gain.value = g;
    o.connect(og); og.connect(AU.scHp); o.start();
    return { o, mult };
  });

  // --- intake / combustion noise ---
  const nbuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = nbuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  AU.noiseBuf = nbuf;

  const nsrc = ctx.createBufferSource(); nsrc.buffer = nbuf; nsrc.loop = true;
  AU.nbp = ctx.createBiquadFilter(); AU.nbp.type = "bandpass"; AU.nbp.frequency.value = 900; AU.nbp.Q.value = 0.6;
  AU.nGain = ctx.createGain(); AU.nGain.gain.value = 0;
  nsrc.connect(AU.nbp); AU.nbp.connect(AU.nGain); AU.nGain.connect(AU.master); nsrc.start();

  // exhaust rasp: narrow noise band riding the firing frequency — reads as
  // combustion texture rather than synthesizer tone
  const rsrc = ctx.createBufferSource(); rsrc.buffer = nbuf; rsrc.loop = true; rsrc.playbackRate.value = 1.1;
  AU.raspBp = ctx.createBiquadFilter(); AU.raspBp.type = "bandpass"; AU.raspBp.frequency.value = 300; AU.raspBp.Q.value = 1.4;
  AU.raspG = ctx.createGain(); AU.raspG.gain.value = 0;
  rsrc.connect(AU.raspBp); AU.raspBp.connect(AU.raspG); AU.raspG.connect(AU.lp); rsrc.start();

  // turbo breath: broadband charge-air rush colored per car — the bus-like
  // "zshhh" of a big twin, the deep "zohh" of the quad
  const tbsrc = ctx.createBufferSource(); tbsrc.buffer = nbuf; tbsrc.loop = true; tbsrc.playbackRate.value = 1.05;
  AU.tbBp = ctx.createBiquadFilter(); AU.tbBp.type = "bandpass"; AU.tbBp.frequency.value = 1400; AU.tbBp.Q.value = 0.8;
  AU.tbG = ctx.createGain(); AU.tbG.gain.value = 0;
  tbsrc.connect(AU.tbBp); AU.tbBp.connect(AU.tbG); AU.tbG.connect(AU.master); tbsrc.start();

  // --- wind / road ---
  const wsrc = ctx.createBufferSource(); wsrc.buffer = nbuf; wsrc.loop = true; wsrc.playbackRate.value = 0.6;
  AU.wlp = ctx.createBiquadFilter(); AU.wlp.type = "lowpass"; AU.wlp.frequency.value = 250;
  AU.wGain = ctx.createGain(); AU.wGain.gain.value = 0;
  wsrc.connect(AU.wlp); AU.wlp.connect(AU.wGain); AU.wGain.connect(AU.master); wsrc.start();

  // high-speed wind rush — the loud mid-band turbulence that takes over the
  // cabin above ~60 mph; barely there below, unmistakable above
  const wrushSrc = ctx.createBufferSource(); wrushSrc.buffer = nbuf; wrushSrc.loop = true; wrushSrc.playbackRate.value = 1.1;
  AU.rushBp = ctx.createBiquadFilter(); AU.rushBp.type = "bandpass"; AU.rushBp.frequency.value = 700; AU.rushBp.Q.value = 0.5;
  AU.rushG = ctx.createGain(); AU.rushG.gain.value = 0;
  wrushSrc.connect(AU.rushBp); AU.rushBp.connect(AU.rushG); AU.rushG.connect(AU.master); wrushSrc.start();

  // --- tire screech (wheelspin / brake lockup) ---
  const ssrc = ctx.createBufferSource(); ssrc.buffer = nbuf; ssrc.loop = true; ssrc.playbackRate.value = 0.9;
  AU.scBp = ctx.createBiquadFilter(); AU.scBp.type = "bandpass"; AU.scBp.frequency.value = 950; AU.scBp.Q.value = 1.1;
  AU.scG = ctx.createGain(); AU.scG.gain.value = 0;
  ssrc.connect(AU.scBp); AU.scBp.connect(AU.scG); AU.scG.connect(AU.master); ssrc.start();

  // --- ambience bus: traffic & rain live outside the car mix, with a fixed
  //     send into the tunnel reverb so they echo when the tunnel is on ---
  AU.amb = ctx.createGain(); AU.amb.gain.value = 1;
  AU.ambLp = ctx.createBiquadFilter(); AU.ambLp.type = "lowpass"; AU.ambLp.frequency.value = 20000;
  AU.amb.connect(AU.ambLp); AU.ambLp.connect(AU.comp);
  const ambSend = ctx.createGain(); ambSend.gain.value = 0.9;
  AU.ambLp.connect(ambSend); ambSend.connect(AU.conv);

  // distant road hum (traffic bed)
  const th = ctx.createBufferSource(); th.buffer = nbuf; th.loop = true; th.playbackRate.value = 0.5;
  const thLp = ctx.createBiquadFilter(); thLp.type = "lowpass"; thLp.frequency.value = 240;
  AU.trHumG = ctx.createGain(); AU.trHumG.gain.value = 0;
  th.connect(thLp); thLp.connect(AU.trHumG); AU.trHumG.connect(AU.amb); th.start();

  // rain: bright hiss bed (muffles inside the tunnel) + low patter
  const rh = ctx.createBufferSource(); rh.buffer = nbuf; rh.loop = true; rh.playbackRate.value = 1.15;
  const rhHp = ctx.createBiquadFilter(); rhHp.type = "highpass"; rhHp.frequency.value = 1400;
  AU.rainFl = ctx.createBiquadFilter(); AU.rainFl.type = "lowpass"; AU.rainFl.frequency.value = 5200;
  AU.rainG = ctx.createGain(); AU.rainG.gain.value = 0;
  rh.connect(rhHp); rhHp.connect(AU.rainFl); AU.rainFl.connect(AU.rainG); AU.rainG.connect(AU.amb); rh.start();
  const rl = ctx.createBufferSource(); rl.buffer = nbuf; rl.loop = true; rl.playbackRate.value = 0.35;
  const rlLp = ctx.createBiquadFilter(); rlLp.type = "lowpass"; rlLp.frequency.value = 320;
  AU.rainLoG = ctx.createGain(); AU.rainLoG.gain.value = 0;
  rl.connect(rlLp); rlLp.connect(AU.rainLoG); AU.rainLoG.connect(AU.amb); rl.start();

  // wet-road tire spray — comes from OUR car, so it rides the main mix
  const sw = ctx.createBufferSource(); sw.buffer = nbuf; sw.loop = true; sw.playbackRate.value = 1.3;
  const swHp = ctx.createBiquadFilter(); swHp.type = "highpass"; swHp.frequency.value = 1700;
  AU.sprayG = ctx.createGain(); AU.sprayG.gain.value = 0;
  sw.connect(swHp); swHp.connect(AU.sprayG); AU.sprayG.connect(AU.master); sw.start();

  // --- echo mode: its OWN convolver at full wet (the shared tunnel one is
  //     gated by AU.wet, which strangled the effect) + a big fed-back slap ---
  AU.echoSend = ctx.createGain(); AU.echoSend.gain.value = 0;
  AU.echoConv = ctx.createConvolver(); AU.echoConv.buffer = AU.conv.buffer;
  const eConvG = ctx.createGain(); eConvG.gain.value = 1;
  AU.master.connect(AU.echoSend); AU.echoSend.connect(AU.echoConv);
  AU.echoConv.connect(eConvG); eConvG.connect(AU.comp);
  AU.echoSlap = ctx.createDelay(1.2); AU.echoSlap.delayTime.value = 0.4;
  AU.echoSlapG = ctx.createGain(); AU.echoSlapG.gain.value = 0;
  const eFb = ctx.createGain(); eFb.gain.value = 0.52;
  const eLp = ctx.createBiquadFilter(); eLp.type = "lowpass"; eLp.frequency.value = 2400;
  AU.master.connect(AU.echoSlapG); AU.echoSlapG.connect(AU.echoSlap);
  AU.echoSlap.connect(eLp); eLp.connect(eFb); eFb.connect(AU.echoSlap);
  eLp.connect(AU.comp);
  applyMusicEcho();

  // --- stereo mode: parallel Haas pair off the master ---
  AU.wideG = ctx.createGain(); AU.wideG.gain.value = 0;
  const wHp = ctx.createBiquadFilter(); wHp.type = "highpass"; wHp.frequency.value = 300;
  const wDel = ctx.createDelay(0.05); wDel.delayTime.value = 0.014;
  const wPanL = ctx.createStereoPanner(); wPanL.pan.value = -0.9;
  const wPanR = ctx.createStereoPanner(); wPanR.pan.value = 0.9;
  AU.master.connect(AU.wideG); AU.wideG.connect(wHp);
  wHp.connect(wPanL); wPanL.connect(AU.comp);
  wHp.connect(wDel); wDel.connect(wPanR); wPanR.connect(AU.comp);
  applyStereoWide();

  // --- gearbox grind (gated) ---
  const gsrc = ctx.createBufferSource(); gsrc.buffer = nbuf; gsrc.loop = true; gsrc.playbackRate.value = 1.7;
  const gbp = ctx.createBiquadFilter(); gbp.type = "bandpass"; gbp.frequency.value = 1300; gbp.Q.value = 2.2;
  const gsaw = ctx.createOscillator(); gsaw.type = "sawtooth"; gsaw.frequency.value = 145;
  const glfo = ctx.createOscillator(); glfo.frequency.value = 27;
  const glfoG = ctx.createGain(); glfoG.gain.value = 400;
  glfo.connect(glfoG); glfoG.connect(gbp.frequency);
  AU.grindGain = ctx.createGain(); AU.grindGain.gain.value = 0;
  gsrc.connect(gbp); gsaw.connect(gbp); gbp.connect(AU.grindGain); AU.grindGain.connect(AU.master);
  gsrc.start(); gsaw.start(); glfo.start();

  AU.ready = true;
  loadPshift();                          // the recorded paddle click
  buildEngineVoice(CC);
  applyTunnel();
  applyCabin();
  updateMasterGain();
  applyMusicEcho();
  applyStereoWide();
}

/* interior mode: windows-up filtering on the whole mix */
function applyCabin() {
  if (!AU.ready) return;
  const t = AU.ctx.currentTime, on = S.cabin;
  AU.cabLp.frequency.setTargetAtTime(on ? 1150 : 20000, t, 0.1);
  AU.cabShelf.gain.setTargetAtTime(on ? 5.5 : 0, t, 0.1);
  AU.ambLp.frequency.setTargetAtTime(on ? 650 : 20000, t, 0.1);  // outside world, doubly sealed
}

/* synthesized impulse response: long concrete-tube decay + early slap reflections */
function makeTunnelIR(ctx) {
  const sr = ctx.sampleRate, len = Math.floor(sr * 3.4);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.0) * 0.5;
    for (const [tm, g] of [[0.028, 0.8], [0.055, 0.6], [0.092, 0.45], [0.14, 0.32], [0.2, 0.22]]) {
      const at = Math.floor(tm * sr * (ch ? 1.06 : 1));
      for (let j = 0; j < 500 && at + j < len; j++)
        d[at + j] += (Math.random() * 2 - 1) * g * (1 - j / 500);
    }
  }
  return buf;
}

/* pipe resonances for the current car — Screamer shifts them up the spectrum */
function applyFormants() {
  if (!AU.ready) return;
  const fs = CC.sound.formants || [];
  const fm = curEx().formantMul || 1;
  AU.formants.forEach((p, i) => {
    const [fq, q, db] = fs[i] || [1000, 1, 0];
    p.frequency.value = fq * fm; p.Q.value = q; p.gain.value = db;
  });
}

function applyTunnel() {
  if (!AU.ready) return;
  const t = AU.ctx.currentTime, on = S.tunnel;
  // a touch of room tone stays on outside tunnels — bone-dry sounds digital
  AU.wet.gain.setTargetAtTime(on ? 0.9 : 0.14, t, 0.15);
  AU.echoWet.gain.setTargetAtTime(on ? 0.42 : 0, t, 0.15);
  AU.popRev.gain.setTargetAtTime(on ? 1.3 : 0.3, t, 0.15);
  AU.popEcho.gain.setTargetAtTime(on ? 0.9 : 0, t, 0.15);
}

/* swap the oscillator stack to the selected car's sound profile.
   Layers are [type, mult, gainLow, gainHigh?] — when gainHigh is given the
   layer crossfades with rpm, so the voice changes character as it climbs. */
function buildEngineVoice(car) {
  if (!AU.ready) return;
  for (const v of AU.oscs) {
    try { v.o.stop(); } catch (_) {}
    v.o.disconnect(); v.g.disconnect();
  }
  AU.oscs = [];
  AU.mixIn.gain.value = car.sound.drive || 0.5;   // saturation drive into the soft clip
  AU.pulse.type = car.sound.pulseType || "sawtooth";  // square = choppy rotary/V8 chop
  applyFormants();
  for (const [type, mult, gLo, gHi] of car.sound.layers) {
    const o = AU.ctx.createOscillator(); o.type = type; o.frequency.value = 30;
    const g = AU.ctx.createGain(); g.gain.value = gLo;
    o.connect(g); g.connect(AU.mixIn); o.start();
    AU.oscs.push({ o, g, mult, gLo, gHi: gHi === undefined ? gLo : gHi });
  }
}

function audioTick() {
  if (!AU.ready) return;
  const t = AU.ctx.currentTime, k = 0.03;
  const rpm = Math.max(S.rpm, 0);
  const ex = curEx();

  // flyby: true Doppler (we synthesize the frequencies, so just bend them),
  // plus distance attenuation, position pan, and air absorption
  let dop = 1, flyG = 1, flyP = 0, flyLp = 1;
  if (S.flyby) {
    const d = 14, x = S.flyX, r = Math.hypot(x, d);
    const vr = flybyV() * (-x) / r;                // closing speed toward listener (boosted past 200)
    dop = 343 / Math.max(80, 343 - vr);
    flyG = clamp(22 / r, 0.12, 1.5);
    flyP = clamp(x / 70, -0.95, 0.95);
    flyLp = clamp(26 / r, 0.45, 1);
  }
  AU.flyGain.gain.setTargetAtTime(flyG, t, 0.08);
  AU.flyPan.pan.setTargetAtTime(flyP, t, 0.08);

  // firing freq × per-car octave drop (f0Mul) × pitch mod × Doppler
  const cm = curMod();
  const f0 = (rpm / 60) * (CC.cyl / 2) * (CC.sound.f0Mul || 1) * cm.pitch * dop;
  const rFrac = clamp(rpm / ENG.max, 0, 1);
  const gCurve = Math.pow(rFrac, 1.6);             // how far "up the rev range" the voice is
  const jm = CC.sound.jitter || 1;       // per-car mechanical looseness
  for (const L of AU.oscs) {
    // each voice wanders independently — fast flutter plus a slow random-walk
    // drift; coherent motion sounds digital, independent motion sounds alive
    L.dr = Math.max(-0.004 * jm, Math.min(0.004 * jm, (L.dr || 0) * 0.99 + (Math.random() - 0.5) * 0.0008 * jm));
    const jit = 1 + L.dr + (Math.random() - 0.5) * 0.004 * jm;
    L.o.frequency.setTargetAtTime(Math.max(8, f0 * L.mult * jit), t, k);
    if (L.gHi !== L.gLo)
      L.g.gain.setTargetAtTime(L.gLo + (L.gHi - L.gLo) * gCurve, t, 0.06);
  }

  const running = S.engineOn && !S.cranking;
  const load = S.effThrottle;
  const onCam = CC.camAt && rpm > CC.camAt;        // VTEC-style switchover
  const trim = (CC.sound.volTrim || 1) * (ex.volMul || 1) * cm.vol;
  const blipBoost = S.blip > 0 ? 1.4 : 1;          // downshift blips shout
  // idleVol lifts the voice near idle and fades out as revs climb — the
  // quad-rotor idles LOUD, like the real thing at a standstill
  const idleLift = (CC.sound.idleVol || 0) * clamp(1.35 - rpm / (ENG.idle * 2.6), 0, 1);
  const vol = running
    ? (CC.ev
        ? 0.02 + load * 0.14 + rFrac * 0.2        // EV: near-silent until it moves
        : 0.10 + idleLift + load * 0.30 + rFrac * 0.13 + (onCam ? 0.04 : 0)) * trim * 0.8 * blipBoost
    : 0;
  AU.engGain.gain.setTargetAtTime(vol, t, 0.05);

  // combustion throb — strong at idle, smooths out with revs
  const drive = (CC.sound.drive || 0.5) + (ex.driveAdd || 0);
  // load-sensitive saturation: barks under power, settles on a lift
  const dl = CC.sound.loadDrive || 0;
  AU.mixIn.gain.setTargetAtTime(drive * (1 + dl * (load - 0.3)), t, 0.05);
  const pd = (CC.sound.pulseDepth || 0.15) * (1 - rFrac * 0.6);
  AU.pulse.frequency.setTargetAtTime(Math.max(3, f0 / (CC.sound.pulseDiv || 1)), t, k);
  AU.pulseG.gain.setTargetAtTime(running ? drive * pd * 0.5 : 0, t, 0.05);

  // exhaust rasp band riding the firing frequency
  AU.raspBp.frequency.setTargetAtTime(clamp(f0 * 1.5, 90, 5500), t, k);
  AU.raspG.gain.setTargetAtTime(
    running ? (0.02 + load * 0.10 + rFrac * 0.03) * (CC.sound.raspMul || 1) * (1 + (ex.raspAdd || 0)) : 0,
    t, k);
  // "scream" opens the filter with revs alone — the intake howl waking up
  AU.lp.frequency.setTargetAtTime(
    Math.max(110,
      ((150 + load * 2700 + rpm * 0.45 + (onCam ? 1500 : 0) + (CC.sound.scream || 0) * rFrac * rFrac
        + (ex.bright || 0) + (S.blip > 0 ? 1500 : 0)) * (CC.sound.lpMul || 1) + cm.tone) * flyLp),
    t, k);

  const nMul = CC.sound.noiseMul || 1;
  const boostHiss = CC.asp === "turbo" ? S.boost * 0.09 : 0;
  AU.nGain.gain.setTargetAtTime(running ? (load * 0.10 + rpm / 90000) * nMul + boostHiss : 0, t, k);
  AU.nbp.frequency.setTargetAtTime(500 + rpm * 0.35, t, k);

  // forced-induction whine
  let wf = 800, wg = 0, scg = 0, w2f = 1400, w2g = 0, tbF = 1400, tbG = 0, chopHz = 15, chopG = 0;
  if (running && CC.asp === "super") {
    // rotor-mesh scream rides the crank: present around town under load,
    // swelling into a full metallic wail up top — the blower IS the voice
    wf = Math.min(9500, f0 * CC.whineMult);
    // "yiii yiii" — flat-out near the red the whine surges in slow pulses
    wg = Math.pow(rFrac, 2.4) * (0.02 + load * 0.055);
    chopHz = 3.4;
    chopG = wg * (load > 0.6 && rFrac > 0.72 ? 0.55 : 0.12);
    scg = (0.006 + load * 0.045) * Math.pow(rFrac, 0.9)
        + Math.pow(rFrac, 2.2) * (0.02 + load * 0.08);
  } else if (running && CC.asp === "turbo") {
    wf = (500 + S.boost * 4200 + rpm * 0.15) * (CC.whistleFreqMul || 1) * dop;
    wg = S.boost * 0.085 * (CC.whistleMul || 1); // big singles whistle louder
    if (CC.turboChop) {                          // "sti-zu-zu-zu" — surge chatter
      chopHz = 14 + S.boost * 7;
      chopG = wg * CC.turboChop * clamp((S.boost - 0.3) / 0.5, 0, 1);
    }
    // charge-air breath, colored per car (bus-hiss twins, deep quad rush)
    tbF = ((CC.breathHz || 1400) + S.boost * 800) * dop;
    tbG = S.boost * 0.05 * (CC.turboBreath || 0) * (0.35 + load * 0.65);
    if (CC.seqTurbo) {                           // stage-two pair sings on top
      w2f = wf * 1.4;
      w2g = (S.seqStage || 0) * S.boost * 0.07;
    }
  } else if (running && CC.asp === "hybrid") {
    // EV inverter whine: tracks road speed, sings under boost and regen
    wf = (220 + Math.abs(S.v) * 55 + rpm * 0.04) * dop;
    wg = S.boost * 0.05 + (S.brake > 0.2 && Math.abs(S.v) > 2 ? 0.045 : 0);
  } else if (running && CC.ev) {
    // the whole car IS the whine — pure rising inverter note
    wf = (400 + rpm * 0.35) * dop;
    wg = 0.02 + load * 0.045 + rFrac * 0.035 + (S.brake > 0.2 && Math.abs(S.v) > 2 ? 0.04 : 0);
  } else if (CC.edrive && S.powered && S.eDrive === "ev") {
    // eDrive gliding: barely-there inverter whisper that tracks road speed
    const sp = Math.abs(S.v);
    wf = (300 + sp * 45) * dop;
    wg = 0.005 + S.throttle * 0.018 + (S.brake > 0.2 && sp > 2 ? 0.015 : 0);
  } else if (running && CC.gearWhine) {
    // straight-cut dog box: gear-mesh scream rides the crank — hard under
    // load, still singing on the overrun while the pipes crackle
    wf = Math.min(10500, f0 * CC.gearWhine) * dop;
    wg = (0.008 + load * 0.045 + (load < 0.15 && Math.abs(S.v) > 3 ? 0.03 : 0))
       * Math.pow(rFrac, 1.2);
  } else if (running && CC.fan) {
    // the ground-effect fan: a 48V turbine behind your head. A smooth whoosh
    // that builds with speed — and steps up HARD when braking mode sucks the
    // car onto the road (tonal whine + broadband air through the diffuser)
    const sp = Math.abs(S.v);
    const brk = S.brake > 0.3 && sp > 8 ? 1 : 0;
    wf = (620 + sp * 16 + brk * 320) * dop;
    wg = 0.014 + sp * 0.0012 + brk * 0.04;
    tbF = (1500 + sp * 22) * dop;
    tbG = 0.018 + sp * 0.0014 + brk * 0.055;
  }
  AU.whine.frequency.setTargetAtTime(wf, t, k);
  AU.whineG.gain.setTargetAtTime(wg, t, 0.05);
  AU.whine2.frequency.setTargetAtTime(Math.min(11000, w2f), t, k);
  AU.whine2G.gain.setTargetAtTime(w2g, t, 0.05);
  AU.wChop.frequency.setTargetAtTime(chopHz, t, k);
  AU.wChopG.gain.setTargetAtTime(chopG, t, 0.05);
  AU.tbBp.frequency.setTargetAtTime(tbF, t, k);
  AU.tbG.gain.setTargetAtTime(tbG, t, 0.05);
  for (const s of AU.scOscs)
    s.o.frequency.setTargetAtTime(Math.min(12000, wf * s.mult), t, k);
  AU.scG.gain.setTargetAtTime(scg, t, 0.05);

  const sp = Math.abs(S.v);
  // wind: gentle low rumble at town speeds, then the rush piles on hard past
  // ~60 mph (27 m/s) the way real wind noise suddenly owns the cabin
  const rush = clamp((sp - 24) / 28, 0, 1);
  AU.wGain.gain.setTargetAtTime(Math.min(0.20, sp * 0.0035) + rush * 0.14, t, 0.1);
  AU.wlp.frequency.setTargetAtTime(220 + sp * 26, t, 0.1);
  AU.rushG.gain.setTargetAtTime(Math.pow(rush, 1.5) * 0.5, t, 0.15);
  AU.rushBp.frequency.setTargetAtTime(500 + sp * 14, t, 0.2);

  AU.grindGain.gain.setTargetAtTime(S.grinding ? 0.22 : 0, t, 0.02);

  // tire screech — spinning rubber or locked wheels. Louder and squealier now,
  // so lit-up rubber (aids off) really howls, and a lockup barks under braking.
  const scAmt = clamp(S.spinV / 7, 0, 1) + (S.lockup ? 0.7 : 0);
  const scAudible = Math.abs(S.v) > 2 || S.spinV > 1 ? 1 : 0;
  AU.scG.gain.setTargetAtTime(Math.min(0.44, scAmt * 0.36) * scAudible, t, 0.04);
  AU.scBp.frequency.setTargetAtTime(760 + S.spinV * 40 + Math.random() * 150, t, 0.05);

  // ambience beds
  AU.trHumG.gain.setTargetAtTime(S.traffic ? 0.06 : 0, t, 0.3);
  // in the tunnel the rain roars OFF the walls — louder, wetter, ringing down
  // the concrete tube via the ambience reverb send
  AU.rainG.gain.setTargetAtTime(S.rain ? (S.tunnel ? 0.17 : 0.095) : 0, t, 0.4);
  AU.rainFl.frequency.setTargetAtTime(S.tunnel ? 1150 : 5200, t, 0.3);
  AU.rainLoG.gain.setTargetAtTime(S.rain ? (S.tunnel ? 0.055 : 0.03) : 0, t, 0.4);
  const spray = S.rain && !S.tunnel ? Math.min(0.15, Math.abs(S.v) * 0.0032) : 0;
  AU.sprayG.gain.setTargetAtTime(spray, t, 0.15);
}

/* a traffic car sweeping past: slow lazy whoosh when parked,
   sharp "husss" when we're the one doing the passing */
function sfxPassby(fast) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  const dur = fast ? 0.45 + Math.random() * 0.15 : 1.3 + Math.random() * 0.5;
  const peak = fast ? 0.30 + Math.random() * 0.1 : 0.19 + Math.random() * 0.07;
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.loop = true;
  n.playbackRate.value = 0.9;
  const f = ctx.createBiquadFilter(); f.type = "lowpass";
  f.frequency.setValueAtTime(400, t);
  f.frequency.linearRampToValueAtTime(fast ? 2600 : 1200, t + dur * 0.5);
  f.frequency.linearRampToValueAtTime(350, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(peak, t + dur * 0.45);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const p = ctx.createStereoPanner();
  const dir = Math.random() < 0.5 ? 1 : -1;
  p.pan.setValueAtTime(0.9 * dir, t);
  p.pan.linearRampToValueAtTime(-0.9 * dir, t + dur);
  n.connect(f); f.connect(g); g.connect(p); p.connect(AU.amb);
  n.start(t); n.stop(t + dur + 0.05);
}

/* driving through a puddle: sharp slosh, front then rear wheels */
/* roadside cricket — a short trill of sine pulses, panned somewhere out in
   the dark. Rides the ambience bus, so the cabin filter muffles it too. */
function sfxCricket() {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.value = 4100 + Math.random() * 800;
  const g = ctx.createGain(); g.gain.value = 0;
  const pulses = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < pulses; i++) {
    const t0 = t + i * 0.056;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.016 + Math.random() * 0.012, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
  }
  const p = ctx.createStereoPanner();
  p.pan.value = Math.random() * 1.6 - 0.8;
  o.connect(g); g.connect(p); p.connect(AU.amb);
  o.start(t); o.stop(t + pulses * 0.06 + 0.1);
}

function sfxSplash(amp) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  [[0, 1], [0.11, 0.55]].forEach(([dt, k]) => {
    const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 1.1;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 0.7;
    f.frequency.setValueAtTime(1500, t + dt);
    f.frequency.exponentialRampToValueAtTime(450, t + dt + 0.28);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t + dt);
    g.gain.linearRampToValueAtTime(amp * k, t + dt + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.3);
    n.connect(f); f.connect(g); g.connect(AU.master);
    n.start(t + dt); n.stop(t + dt + 0.35);
  });
}

/* windshield wiper — one full blade travel: a rubber-on-glass "swish" that
   pans across the screen, bookended by the soft motor "thunk" as the arm
   reaches its stop and reverses. Only heard inside the cabin in the rain. */
function sfxWiper(dir) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime, dur = 0.34;
  // rubber squeegee dragging over wet glass — filtered noise sweeping in pan
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.loop = true; n.playbackRate.value = 0.85;
  const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 0.9;
  f.frequency.setValueAtTime(680, t);
  f.frequency.linearRampToValueAtTime(1250, t + dur);           // rises as it sweeps up the glass
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.052, t + 0.05);
  g.gain.setValueAtTime(0.052, t + dur - 0.08);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const p = ctx.createStereoPanner();
  p.pan.setValueAtTime(0.7 * dir, t);
  p.pan.linearRampToValueAtTime(-0.7 * dir, t + dur);           // travels across the windshield
  n.connect(f); f.connect(g); g.connect(p); p.connect(AU.master);
  n.start(t); n.stop(t + dur + 0.04);

  // the soft "thunk" of the arm hitting its stop at the end of the wipe
  const th = ctx.createOscillator(); th.type = "sine";
  th.frequency.setValueAtTime(150, t + dur);
  th.frequency.exponentialRampToValueAtTime(60, t + dur + 0.07);
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.14, t + dur);
  tg.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.1);
  th.connect(tg); tg.connect(AU.master); th.start(t + dur); th.stop(t + dur + 0.12);
}

function sfxClunk(strength = 1) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(95, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.09);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5 * strength, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  o.connect(g); g.connect(AU.master); o.start(t); o.stop(t + 0.14);

  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 700;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.28 * strength, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  n.connect(f); f.connect(ng); ng.connect(AU.master); n.start(t); n.stop(t + 0.08);
}

/* every gear change routes through the workshop's shifter-feel choice —
   the lever set in clutch/gate driving, the paddle set in manual (seq) mode */
function sfxShift(strength = 1) {
  if (S.mode === "manual") {
    const p = curMod().paddle;
    if (p === "mech") sfxPaddleMech(strength);
    else if (p === "metal") sfxPaddleMetal(strength);
    else if (p === "carbon") sfxPaddleReal(strength);  // the real recorded click
    /* stock = silent — no click at all */
    return;
  }
  const s = curMod().shift;
  if (s === "click") sfxShiftClick(strength);
  else if (s === "metal") sfxShiftMetal(strength);
  else sfxClunk(strength);
}

/* ---- paddle-shifter voices (manual mode) ---- */

/* the real thing: an actual recorded paddle click (Sound/Pshift.wav — the
   original mp3 normalized up +23dB; the raw recording peaked at -23.6dBFS).
   Decoded into the WebAudio graph when possible (so it echoes in the tunnel
   and muffles in the cabin like everything else); otherwise plays through
   plain <audio> elements — which also means it works with the car OFF,
   before the audio engine has even booted. */
function sfxPaddleReal(strength = 1) {
  if (AU.ready && AU.pshiftBuf) {
    const ctx = AU.ctx;
    const s = ctx.createBufferSource(); s.buffer = AU.pshiftBuf;
    s.playbackRate.value = 0.97 + Math.random() * 0.06;  // never twice identical
    // the paddle lives INSIDE the cabin: windows up brings it closer and
    // louder, so in cabin mode it skips the windows-up filter entirely and
    // gains presence; outside, it's just one more sound in the open air
    const g = ctx.createGain();
    g.gain.value = (S.cabin ? 2.4 : 1.3) * strength;
    s.connect(g); g.connect(S.cabin ? AU.comp : AU.master); s.start();
    return;
  }
  if (!AU.pshiftEls)                     // engine not running / audio not booted
    AU.pshiftEls = [0, 1, 2].map(() => {
      const a = new Audio("Sound/Pshift.wav"); a.preload = "auto"; return a;
    });
  const a = AU.pshiftEls.find(x => x.paused) || AU.pshiftEls[0];
  a.volume = Math.min(1, (S.cabin ? 1.4 : 0.9) * strength);
  a.currentTime = 0;
  a.play().catch(() => {});
}

function loadPshift() {
  if (AU.pshiftBuf || AU.pshiftLoading) return;
  AU.pshiftLoading = true;
  fetch("Sound/Pshift.wav")
    .then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); })
    .then(b => AU.ctx.decodeAudioData(b))
    .then(buf => { AU.pshiftBuf = buf; })
    .catch(() => {
      if (!AU.pshiftEls)
        AU.pshiftEls = [0, 1, 2].map(() => {
          const a = new Audio("Sound/Pshift.wav"); a.preload = "auto"; return a;
        });
    });
}

/* dog-ring engagement — NOT the paddle, the GEARBOX: a hard steel CLACK as
   the dogs slam into the next ratio, a dense mechanical thud through the
   chassis, and a brief straight-cut zing */
function sfxDogEngage(strength = 1) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  // the steel-on-steel strike
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 1.9;
  const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1500; f.Q.value = 1.1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(1.1 * strength, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  n.connect(f); f.connect(g); g.connect(AU.master); n.start(t); n.stop(t + 0.07);
  // hard metallic ring — short, damped by the oil
  [[2100, 0.16, 0.09], [3300, 0.08, 0.06]].forEach(([hz, amp, dur]) => {
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.value = hz * (0.99 + Math.random() * 0.02);
    const og = ctx.createGain();
    og.gain.setValueAtTime(amp * strength, t + 0.006);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.006 + dur);
    o.connect(og); og.connect(AU.master); o.start(t + 0.006); o.stop(t + 0.006 + dur + 0.02);
  });
  // the thud through the tub — you feel this one
  const k = ctx.createOscillator(); k.type = "sine"; k.frequency.setValueAtTime(200, t);
  k.frequency.exponentialRampToValueAtTime(55, t + 0.09);
  const kg = ctx.createGain();
  kg.gain.setValueAtTime(0.7 * strength, t);
  kg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  k.connect(kg); kg.connect(AU.master); k.start(t); k.stop(t + 0.14);
}

/* exposed machined linkage, Pagani-grade: a LOUD, watch-precise double click
   — sharp snap transient, the detent slamming home, a bright spring ring and
   a solid mechanical knock you feel through the column */
function sfxPaddleMech(strength = 1) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  // broadband snap right at the front — the crack that makes it feel instant
  const s = ctx.createBufferSource(); s.buffer = AU.noiseBuf; s.playbackRate.value = 2.6;
  const sf = ctx.createBiquadFilter(); sf.type = "highpass"; sf.frequency.value = 1400;
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.85 * strength, t);
  sg.gain.exponentialRampToValueAtTime(0.001, t + 0.022);
  s.connect(sf); sf.connect(sg); sg.connect(AU.master); s.start(t); s.stop(t + 0.035);
  // the two-stage detent: pull… CLACK
  [[0, 3200, 0.7], [0.03, 4200, 0.95]].forEach(([dt, hz, amp]) => {
    const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 2.2;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = hz; f.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp * strength, t + dt);
    g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.04);
    n.connect(f); f.connect(g); g.connect(AU.master); n.start(t + dt); n.stop(t + dt + 0.055);
  });
  // bright spring ring — sings for a moment after the clack
  [[5600, 0.11], [7400, 0.05]].forEach(([hz, amp]) => {
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = hz;
    const og = ctx.createGain();
    og.gain.setValueAtTime(amp * strength, t + 0.03);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(og); og.connect(AU.master); o.start(t + 0.03); o.stop(t + 0.22);
  });
  // the knock through the steering column — weight behind the click
  const k = ctx.createOscillator(); k.type = "sine"; k.frequency.setValueAtTime(420, t + 0.03);
  k.frequency.exponentialRampToValueAtTime(140, t + 0.08);
  const kg = ctx.createGain();
  kg.gain.setValueAtTime(0.42 * strength, t + 0.03);
  kg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  k.connect(kg); kg.connect(AU.master); k.start(t + 0.03); k.stop(t + 0.12);
}

/* solid alloy paddle on the column: one BIG dense metal clack — real impact,
   a proper ring, and a deep stop-thump underneath */
function sfxPaddleMetal(strength = 1) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  // the impact
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 2;
  const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1900; f.Q.value = 1.3;
  const g = ctx.createGain();
  g.gain.setValueAtTime(1.0 * strength, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  n.connect(f); f.connect(g); g.connect(AU.master); n.start(t); n.stop(t + 0.08);
  // crisp top on the strike
  const h = ctx.createBufferSource(); h.buffer = AU.noiseBuf; h.playbackRate.value = 2.4;
  const hf = ctx.createBiquadFilter(); hf.type = "highpass"; hf.frequency.value = 3200;
  const hg = ctx.createGain();
  hg.gain.setValueAtTime(0.5 * strength, t);
  hg.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  h.connect(hf); hf.connect(hg); hg.connect(AU.master); h.start(t); h.stop(t + 0.045);
  // the alloy rings — louder, longer
  [[2600, 0.18], [3900, 0.1], [5200, 0.04]].forEach(([hz, amp]) => {
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.value = hz * (0.99 + Math.random() * 0.02);
    const og = ctx.createGain();
    og.gain.setValueAtTime(amp * strength, t + 0.008);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
    o.connect(og); og.connect(AU.master); o.start(t + 0.008); o.stop(t + 0.21);
  });
  // deep thump of the paddle hitting its stop
  const k = ctx.createOscillator(); k.type = "sine"; k.frequency.setValueAtTime(170, t);
  k.frequency.exponentialRampToValueAtTime(60, t + 0.08);
  const kg = ctx.createGain();
  kg.gain.setValueAtTime(0.55 * strength, t);
  kg.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
  k.connect(kg); kg.connect(AU.master); k.start(t); k.stop(t + 0.13);
}

/* crisp mechanical detent — "k-CHK", a short-shifter with a tight spring:
   release click, engage clack, and a small knuckle thump underneath */
function sfxShiftClick(strength = 1) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  [[0, 2600, 0.20], [0.045, 1700, 0.46]].forEach(([dt, hz, amp]) => {
    const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 1.6;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = hz; f.Q.value = 2.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp * strength, t + dt);
    g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.045);
    n.connect(f); f.connect(g); g.connect(AU.master);
    n.start(t + dt); n.stop(t + dt + 0.06);
  });
  const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(180, t + 0.045);
  o.frequency.exponentialRampToValueAtTime(70, t + 0.1);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.2 * strength, t + 0.045);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
  o.connect(og); og.connect(AU.master); o.start(t + 0.045); o.stop(t + 0.13);
}

/* open-gate metal snick — the ball knob through an exposed gate: a bright
   tick, the gate plate ringing (two detuned partials), and the lever's clack */
function sfxShiftMetal(strength = 1) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 2;
  const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 2800;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.45 * strength, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  n.connect(f); f.connect(g); g.connect(AU.master); n.start(t); n.stop(t + 0.07);
  [[3150, 0.085], [4680, 0.05]].forEach(([hz, amp]) => {
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.value = hz * (0.98 + Math.random() * 0.04);
    const og = ctx.createGain();
    og.gain.setValueAtTime(amp * strength, t + 0.01);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(og); og.connect(AU.master); o.start(t + 0.01); o.stop(t + 0.25);
  });
  const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.setValueAtTime(140, t);
  o2.frequency.exponentialRampToValueAtTime(60, t + 0.07);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.28 * strength, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  o2.connect(g2); g2.connect(AU.master); o2.start(t); o2.stop(t + 0.11);
}

/* the starter button itself: a proper tactile switch. A crisp plastic tick as
   the dome collapses under your thumb, a bright little snap on top, and a
   small solid knock underneath so it lands in the panel rather than on it. */
function sfxIgnClick(amp = 1) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  // the dome collapsing — tight highpassed noise tick
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 2.6;
  const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 2600;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5 * amp, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.022);
  n.connect(f); f.connect(g); g.connect(AU.master); n.start(t); n.stop(t + 0.04);
  // the bright snap — short, dry, no ring
  const o = ctx.createOscillator(); o.type = "square";
  o.frequency.setValueAtTime(2400, t);
  o.frequency.exponentialRampToValueAtTime(900, t + 0.02);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.16 * amp, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  o.connect(og); og.connect(AU.master); o.start(t); o.stop(t + 0.045);
  // the knock into the panel — the bit you feel
  const k = ctx.createOscillator(); k.type = "sine";
  k.frequency.setValueAtTime(320, t);
  k.frequency.exponentialRampToValueAtTime(110, t + 0.05);
  const kg = ctx.createGain();
  kg.gain.setValueAtTime(0.3 * amp, t);
  kg.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  k.connect(kg); kg.connect(AU.master); k.start(t); k.stop(t + 0.09);
}

/* an old barrel lock instead of a button: the wafers dragging round as the
   key turns, then the detent dropping into the next position with a solid,
   slightly loose clunk. Springing back from START is quicker and lighter. */
function sfxKeyTurn(dir = 1) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  const back = dir < 0;
  // wafers dragging through the barrel — a short gritty scrape
  const s = ctx.createBufferSource(); s.buffer = AU.noiseBuf;
  s.playbackRate.value = back ? 0.8 : 0.55;
  const sf = ctx.createBiquadFilter(); sf.type = "bandpass";
  sf.frequency.setValueAtTime(1500, t);
  sf.frequency.linearRampToValueAtTime(2600, t + 0.07);
  sf.Q.value = 2.6;
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.001, t);
  sg.gain.linearRampToValueAtTime(0.16, t + 0.015);
  sg.gain.exponentialRampToValueAtTime(0.001, t + (back ? 0.05 : 0.08));
  s.connect(sf); sf.connect(sg); sg.connect(AU.master); s.start(t); s.stop(t + 0.12);
  // the detent dropping home
  const dt = back ? 0.05 : 0.08;
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 1.8;
  const nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 1900; nf.Q.value = 1.1;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.4, t + dt);
  ng.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.03);
  n.connect(nf); nf.connect(ng); ng.connect(AU.master); n.start(t + dt); n.stop(t + dt + 0.05);
  // the lump of the mechanism landing — cheap, heavy, mechanical
  const k = ctx.createOscillator(); k.type = "sine";
  k.frequency.setValueAtTime(380, t + dt);
  k.frequency.exponentialRampToValueAtTime(120, t + dt + 0.05);
  const kg = ctx.createGain();
  kg.gain.setValueAtTime(0.3, t + dt);
  kg.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.08);
  k.connect(kg); kg.connect(AU.master); k.start(t + dt); k.stop(t + dt + 0.1);
  // a little steel ring off the barrel
  const o = ctx.createOscillator(); o.type = "triangle";
  o.frequency.value = back ? 1420 : 1180;
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.05, t + dt + 0.004);
  og.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.09);
  o.connect(og); og.connect(AU.master); o.start(t + dt + 0.004); o.stop(t + dt + 0.11);
}

/* the red cover: a sprung aluminium lid on a machined hinge. Flipping it up
   is a latch release, a light spring twang and the lid slapping its stop. */
function sfxCapFlip(open = true) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  // latch release
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 2.2;
  const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 3400; f.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.42, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  n.connect(f); f.connect(g); g.connect(AU.master); n.start(t); n.stop(t + 0.05);
  // spring twang — thin metal, quickly damped
  [[1750, 0.1], [2620, 0.05]].forEach(([hz, amp]) => {
    const o = ctx.createOscillator(); o.type = "triangle";
    o.frequency.setValueAtTime(hz, t);
    o.frequency.exponentialRampToValueAtTime(hz * (open ? 1.12 : 0.88), t + 0.09);
    const og = ctx.createGain();
    og.gain.setValueAtTime(amp, t + 0.004);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    o.connect(og); og.connect(AU.master); o.start(t + 0.004); o.stop(t + 0.13);
  });
  // the lid arriving at its stop a beat later
  const dt = open ? 0.11 : 0.07;
  const k = ctx.createOscillator(); k.type = "sine";
  k.frequency.setValueAtTime(520, t + dt);
  k.frequency.exponentialRampToValueAtTime(150, t + dt + 0.05);
  const kg = ctx.createGain();
  kg.gain.setValueAtTime(0.34, t + dt);
  kg.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.08);
  k.connect(kg); kg.connect(AU.master); k.start(t + dt); k.stop(t + dt + 0.1);
  const c = ctx.createBufferSource(); c.buffer = AU.noiseBuf; c.playbackRate.value = 1.7;
  const cf = ctx.createBiquadFilter(); cf.type = "bandpass"; cf.frequency.value = 2100; cf.Q.value = 0.9;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.3, t + dt);
  cg.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.035);
  c.connect(cf); cf.connect(cg); cg.connect(AU.master); c.start(t + dt); c.stop(t + dt + 0.05);
}

/* first press: electronics live. The main relay clacks in, the in-tank fuel
   pump spins up and primes with that rising whirr, then goes quiet as the
   rail comes up to pressure — the moment the car stops being furniture. */
/* ---- cluster voice callouts ----------------------------------------
   Spoken by the browser's own speech engine, so there's nothing to
   download and it follows the system voice. Kept low, slow and flat —
   it should sound like a car telling you something, not an assistant. */
function sayVoice(text, opt = {}) {
  if (!S.voice || S.muted) return;
  if (typeof speechSynthesis === "undefined") return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = opt.rate != null ? opt.rate : 0.94;
    u.pitch = opt.pitch != null ? opt.pitch : 0.72;   // dropped — flat and machine-ish
    u.volume = opt.volume != null ? opt.volume : 0.5;
    // prefer a plain system voice over anything chirpy
    const vs = speechSynthesis.getVoices() || [];
    const pick = vs.find(v => /daniel|alex|google uk english male|male/i.test(v.name))
              || vs.find(v => /en[-_]/i.test(v.lang));
    if (pick) u.voice = pick;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch (_) {}
}

// a clean cluster beep — the kind a self-test makes: sine core, a touch of
// third harmonic for the piezo edge, hard-gated so it never rings
function clusterBeep(at, hz = 2100, dur = 0.055, amp = 0.05) {
  const ctx = AU.ctx;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(amp, at + 0.006);
  g.gain.setValueAtTime(amp, at + dur - 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  g.connect(AU.master);
  [[1, 1], [3, 0.22], [5, 0.07]].forEach(([mul, lvl]) => {
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.value = hz * mul;
    const og = ctx.createGain(); og.gain.value = lvl;
    o.connect(og); og.connect(g); o.start(at); o.stop(at + dur + 0.02);
  });
}

/* first press: everything wakes up.

   Modelled on the real sequence, in order: the main relay throws, the
   cluster backlight energises, the ECU runs its lamp self-test and beeps,
   the in-tank pump primes the rail (the rising whirr, then quiet once it
   hits pressure), the drive-by-wire throttle sweeps itself end to end,
   secondary relays tick in behind, and the car says it's ready. */
function sfxAccOn(c) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  // a car old enough to have a barrel lock has no lamp self-test, no
  // drive-by-wire and nothing to say — it clicks, it primes, that's it
  const modern = !(c && c.ignKey);

  /* --- main relay: a hard, dry clack with a lump behind it --- */
  const r = ctx.createBufferSource(); r.buffer = AU.noiseBuf; r.playbackRate.value = 1.5;
  const rf = ctx.createBiquadFilter(); rf.type = "bandpass"; rf.frequency.value = 1300; rf.Q.value = 1.4;
  const rg = ctx.createGain();
  rg.gain.setValueAtTime(0.55, t);
  rg.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
  r.connect(rf); rf.connect(rg); rg.connect(AU.master); r.start(t); r.stop(t + 0.05);
  const rk = ctx.createOscillator(); rk.type = "sine";
  rk.frequency.setValueAtTime(260, t); rk.frequency.exponentialRampToValueAtTime(90, t + 0.06);
  const rkg = ctx.createGain();
  rkg.gain.setValueAtTime(0.36, t); rkg.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  rk.connect(rkg); rkg.connect(AU.master); rk.start(t); rk.stop(t + 0.1);

  /* --- the cluster coming up: a short energising swell, the electrical
         equivalent of a screen catching light --- */
  const en = ctx.createBufferSource(); en.buffer = AU.noiseBuf; en.playbackRate.value = 0.5;
  const enf = ctx.createBiquadFilter(); enf.type = "bandpass"; enf.Q.value = 0.9;
  enf.frequency.setValueAtTime(240, t + 0.02);
  enf.frequency.exponentialRampToValueAtTime(1500, t + 0.26);
  const eng = ctx.createGain();
  eng.gain.setValueAtTime(0.001, t + 0.02);
  eng.gain.linearRampToValueAtTime(0.05, t + 0.1);
  eng.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  en.connect(enf); enf.connect(eng); eng.connect(AU.master);
  en.start(t + 0.02); en.stop(t + 0.4);
  // the mains hum that lives under a live dashboard until you stop noticing it
  const hum = ctx.createOscillator(); hum.type = "triangle"; hum.frequency.value = 118;
  const humG = ctx.createGain();
  humG.gain.setValueAtTime(0.001, t + 0.03);
  humG.gain.linearRampToValueAtTime(0.018, t + 0.2);
  humG.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
  hum.connect(humG); humG.connect(AU.master); hum.start(t + 0.03); hum.stop(t + 1.6);

  /* --- ECU self-test: three quick beeps as the warning lamps sweep --- */
  if (modern) {
    clusterBeep(t + 0.16, 2100, 0.05, 0.05);
    clusterBeep(t + 0.28, 2100, 0.05, 0.05);
    clusterBeep(t + 0.40, 2794, 0.075, 0.055);    // the third one resolves upward
  }

  /* --- fuel pump priming the rail: rises, holds, drops off at pressure --- */
  const p0 = t + 0.12, pDur = 0.92;
  const p = ctx.createOscillator(); p.type = "sawtooth";
  p.frequency.setValueAtTime(150, p0);
  p.frequency.exponentialRampToValueAtTime(455, p0 + 0.24);
  p.frequency.setValueAtTime(455, p0 + pDur - 0.26);
  p.frequency.exponentialRampToValueAtTime(280, p0 + pDur);
  // a slight warble — the pump loading and unloading as the rail fills
  const warb = ctx.createOscillator(); warb.type = "sine"; warb.frequency.value = 11;
  const warbG = ctx.createGain(); warbG.gain.value = 16;
  warb.connect(warbG); warbG.connect(p.frequency);
  warb.start(p0); warb.stop(p0 + pDur + 0.05);
  const pf = ctx.createBiquadFilter(); pf.type = "bandpass"; pf.frequency.value = 900; pf.Q.value = 2.2;
  const pg = ctx.createGain();
  pg.gain.setValueAtTime(0.001, p0);
  pg.gain.linearRampToValueAtTime(0.08, p0 + 0.09);
  pg.gain.setValueAtTime(0.08, p0 + pDur - 0.3);
  pg.gain.exponentialRampToValueAtTime(0.001, p0 + pDur);
  p.connect(pf); pf.connect(pg); pg.connect(AU.master);
  p.start(p0); p.stop(p0 + pDur + 0.05);
  // the hiss of fuel actually moving with it
  const h = ctx.createBufferSource(); h.buffer = AU.noiseBuf; h.loop = true; h.playbackRate.value = 1.1;
  const hf = ctx.createBiquadFilter(); hf.type = "bandpass"; hf.frequency.value = 2400; hf.Q.value = 0.8;
  const hg = ctx.createGain();
  hg.gain.setValueAtTime(0.001, p0);
  hg.gain.linearRampToValueAtTime(0.03, p0 + 0.12);
  hg.gain.exponentialRampToValueAtTime(0.001, p0 + pDur);
  h.connect(hf); hf.connect(hg); hg.connect(AU.master);
  h.start(p0); h.stop(p0 + pDur + 0.05);

  /* --- drive-by-wire throttle sweeping itself open and shut --- */
  if (modern) {
  const sv = ctx.createOscillator(); sv.type = "sawtooth";
  const s0 = t + 0.42;
  sv.frequency.setValueAtTime(190, s0);
  sv.frequency.linearRampToValueAtTime(560, s0 + 0.14);
  sv.frequency.linearRampToValueAtTime(210, s0 + 0.3);
  const svf = ctx.createBiquadFilter(); svf.type = "bandpass"; svf.frequency.value = 1500; svf.Q.value = 3;
  const svg = ctx.createGain();
  svg.gain.setValueAtTime(0.001, s0);
  svg.gain.linearRampToValueAtTime(0.028, s0 + 0.04);
  svg.gain.setValueAtTime(0.028, s0 + 0.24);
  svg.gain.exponentialRampToValueAtTime(0.001, s0 + 0.32);
  sv.connect(svf); svf.connect(svg); svg.connect(AU.master);
  sv.start(s0); sv.stop(s0 + 0.36);
  }

  /* --- secondary relays ticking in behind everything else --- */
  [0.30, 0.47, 0.61, 0.82].forEach((dt, i) => {
    const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf;
    n.playbackRate.value = 1.3 + i * 0.25;
    const nf = ctx.createBiquadFilter(); nf.type = "bandpass";
    nf.frequency.value = 1500 + i * 420; nf.Q.value = 2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.11 - i * 0.015, t + dt);
    ng.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.022);
    n.connect(nf); nf.connect(ng); ng.connect(AU.master);
    n.start(t + dt); n.stop(t + dt + 0.035);
  });

  /* --- systems ready: a two-note resolve, then the callout. The old cars
         get a single dull warning chime instead, which is all they had. --- */
  if (modern) {
    clusterBeep(t + 1.02, 1568, 0.075, 0.045);
    clusterBeep(t + 1.12, 2093, 0.13, 0.05);
    setTimeout(() => sayVoice("Electronics on"), 1250);
  } else {
    clusterBeep(t + 0.55, 1046, 0.16, 0.035);
  }
}

/* ================================================================
   THE START
   Built from what physically happens rather than a generic whirr.

   A starter does not make one sound — it makes three at once. The
   solenoid throws the pinion into the ring gear (a hard clack). The
   motor then drags the engine over, and what you actually hear is
   ONE LUMP PER COMPRESSION STROKE: the piston comes up on a closed
   valve, the motor bogs, the pitch dips, the piston goes over and
   the motor surges again. That rate is (cylinders ÷ 2) × rpm ÷ 60 —
   which is why a V12 at 235rpm burrs at 23 lumps a second while a
   big four lopes at eight. Getting that rate right is most of what
   makes a start sound like the car it belongs to.

   Then it catches, and the first cylinders fire OUT OF RHYTHM —
   two or three ragged cracks before the whole thing joins up — and
   the engine runs away from the starter, which throws its pinion
   back out with a falling whine.
   ================================================================ */

// what the starter is up against, derived from the engine itself
function crankProfile(c) {
  const cyl = c.cyl || 6;
  const diesel = !!c.noPop && c.idle < 900;
  const p = {
    cyl,
    // big engines with heavy rotating mass turn over slower
    rpm: diesel ? 185 : cyl >= 12 ? 230 : cyl >= 8 ? 255 : cyl >= 6 ? 275 : 300,
    // and take longer to light — as does anything with a lot of inertia
    dur: 0.42 + cyl * 0.022 + (c.inertia || 0.3) * 0.7 + (diesel ? 0.5 : 0),
    fires: clamp(Math.round(cyl / 2.5), 2, 6),   // ragged cylinders before it joins up
    grit: diesel ? 1.7 : 1,                      // how much clatter rides the crank
    whine: diesel ? 780 : 1120 + cyl * 22,       // starter gear pitch
  };
  // a naturally aspirated engine with light internals flares hard on the
  // first fires — the throttle plates are shut, so it's all fuelling
  p.flare = diesel ? 0.34 : c.asp === "na" ? 0.95 : 0.62;
  p.flareT = diesel ? 0.5 : c.asp === "na" ? (cyl >= 10 ? 1.0 : 0.78) : 0.55;
  return Object.assign(p, c.start || {});
}

/* the crank itself — solenoid, motor, and the engine fighting back */
function sfxCrank(p, amp = 1) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  const dur = p.dur;
  const chug = (p.cyl / 2) * (p.rpm / 60);      // compressions per second

  /* --- the solenoid throwing the pinion into the ring gear --- */
  const sol = ctx.createBufferSource(); sol.buffer = AU.noiseBuf; sol.playbackRate.value = 1.6;
  const solF = ctx.createBiquadFilter(); solF.type = "bandpass";
  solF.frequency.value = 2300; solF.Q.value = 1.3;
  const solG = ctx.createGain();
  solG.gain.setValueAtTime(0.55 * amp, t);
  solG.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  sol.connect(solF); solF.connect(solG); solG.connect(AU.master);
  sol.start(t); sol.stop(t + 0.06);
  // gear teeth meshing — a hard, low clack you feel in the bellhousing
  const mesh = ctx.createOscillator(); mesh.type = "sine";
  mesh.frequency.setValueAtTime(240, t);
  mesh.frequency.exponentialRampToValueAtTime(78, t + 0.06);
  const meshG = ctx.createGain();
  meshG.gain.setValueAtTime(0.42 * amp, t);
  meshG.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  mesh.connect(meshG); meshG.connect(AU.master); mesh.start(t); mesh.stop(t + 0.11);

  /* --- the starter motor: a gear whine dragged down on every compression.
         The LFO runs at the compression rate and pulls BOTH the pitch and
         the level, which is the wow-wow-wow under everything else. --- */
  const lfo = ctx.createOscillator(); lfo.type = "sine";
  lfo.frequency.setValueAtTime(chug * 0.84, t);
  lfo.frequency.linearRampToValueAtTime(chug, t + dur);   // motor speeds up as it goes

  const wh = ctx.createOscillator(); wh.type = "sawtooth";
  wh.frequency.setValueAtTime(p.whine * 0.9, t + 0.03);
  wh.frequency.linearRampToValueAtTime(p.whine, t + dur);
  const whDepth = ctx.createGain(); whDepth.gain.value = p.whine * 0.075;  // ± the drag
  lfo.connect(whDepth); whDepth.connect(wh.frequency);
  const whF = ctx.createBiquadFilter(); whF.type = "bandpass";
  whF.frequency.value = p.whine * 1.15; whF.Q.value = 3.2;
  const whG = ctx.createGain();
  whG.gain.setValueAtTime(0.001, t + 0.02);
  whG.gain.linearRampToValueAtTime(0.05 * amp, t + 0.1);
  whG.gain.setValueAtTime(0.05 * amp, t + dur - 0.05);
  whG.gain.linearRampToValueAtTime(0.001, t + dur + 0.02);
  wh.connect(whF); whF.connect(whG); whG.connect(AU.master);
  wh.start(t + 0.02); wh.stop(t + dur + 0.06);
  lfo.start(t); lfo.stop(t + dur + 0.06);

  /* --- the armature drone underneath: the DC motor's own note --- */
  const arm = ctx.createOscillator(); arm.type = "sawtooth";
  arm.frequency.setValueAtTime(p.whine * 0.11, t + 0.02);
  arm.frequency.linearRampToValueAtTime(p.whine * 0.13, t + dur);
  const armF = ctx.createBiquadFilter(); armF.type = "lowpass";
  armF.frequency.value = 420; armF.Q.value = 0.7;
  const armG = ctx.createGain();
  armG.gain.setValueAtTime(0.001, t + 0.02);
  armG.gain.linearRampToValueAtTime(0.13 * amp, t + 0.09);
  armG.gain.setValueAtTime(0.13 * amp, t + dur - 0.06);
  armG.gain.linearRampToValueAtTime(0.001, t + dur + 0.02);
  arm.connect(armF); armF.connect(armG); armG.connect(AU.master);
  arm.start(t + 0.02); arm.stop(t + dur + 0.06);

  /* --- the compressions. One event per firing stroke, jittered, because
         no real starter is metronomic and that unevenness is most of the
         character. Rate accelerates slightly as the oil thins out. --- */
  let time = 0.035, i = 0;
  while (time < dur - 0.02 && i < 40) {
    const prog = time / dur;
    const lvl = amp * (0.62 + 0.38 * prog) * (0.85 + Math.random() * 0.3);
    const tt = t + time + (Math.random() - 0.5) * 0.008;
    // the lump: the engine being forced over on a closed valve
    const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf;
    n.playbackRate.value = 0.3 + Math.random() * 0.12;
    const nf = ctx.createBiquadFilter(); nf.type = "lowpass";
    nf.frequency.value = 230 + p.grit * 170;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.001, tt);
    ng.gain.linearRampToValueAtTime(0.3 * lvl, tt + 0.006);
    ng.gain.exponentialRampToValueAtTime(0.001, tt + 0.05);
    n.connect(nf); nf.connect(ng); ng.connect(AU.master);
    n.start(tt); n.stop(tt + 0.07);
    // the thud through the block
    const k = ctx.createOscillator(); k.type = "sine";
    k.frequency.setValueAtTime(84 + Math.random() * 14, tt);
    k.frequency.exponentialRampToValueAtTime(46, tt + 0.045);
    const kg = ctx.createGain();
    kg.gain.setValueAtTime(0.26 * lvl, tt);
    kg.gain.exponentialRampToValueAtTime(0.001, tt + 0.06);
    k.connect(kg); kg.connect(AU.master); k.start(tt); k.stop(tt + 0.08);
    // diesels and tired old engines clatter on top of every stroke
    if (p.grit > 1.2) {
      const c2 = ctx.createBufferSource(); c2.buffer = AU.noiseBuf; c2.playbackRate.value = 2.1;
      const cf = ctx.createBiquadFilter(); cf.type = "bandpass";
      cf.frequency.value = 2900; cf.Q.value = 1.6;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.07 * lvl * p.grit, tt + 0.004);
      cg.gain.exponentialRampToValueAtTime(0.001, tt + 0.03);
      c2.connect(cf); cf.connect(cg); cg.connect(AU.master);
      c2.start(tt + 0.004); c2.stop(tt + 0.04);
    }
    time += 1 / (chug * (0.84 + 0.16 * prog));
    i++;
  }
}

/* it catches: two or three cylinders light out of rhythm, the pinion is
   thrown back out as the engine runs away from the starter, and the intake
   takes its first real breath. This is the moment the car becomes alive. */
function sfxCatch(p, amp = 1) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  const hard = clamp(amp, 0.2, 2.2);

  /* --- the pinion kicked back out: a falling whine, gone in a blink --- */
  const bx = ctx.createOscillator(); bx.type = "sawtooth";
  bx.frequency.setValueAtTime(p.whine * 1.15, t);
  bx.frequency.exponentialRampToValueAtTime(p.whine * 0.22, t + 0.2);
  const bxF = ctx.createBiquadFilter(); bxF.type = "bandpass";
  bxF.frequency.value = p.whine; bxF.Q.value = 2.4;
  const bxG = ctx.createGain();
  bxG.gain.setValueAtTime(0.055, t);
  bxG.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  bx.connect(bxF); bxF.connect(bxG); bxG.connect(AU.master);
  bx.start(t); bx.stop(t + 0.25);

  /* --- the ragged first fires. Intervals close up as the crank speeds,
         amplitude climbs as more cylinders join in. --- */
  let dt = 0.0, gap = 0.082;
  for (let i = 0; i < (p.fires || 3); i++) {
    const lvl = hard * (0.5 + 0.5 * (i / Math.max(1, p.fires - 1))) * (0.8 + Math.random() * 0.4);
    const tt = t + dt + (Math.random() - 0.5) * 0.012;
    // the crack out of the pipe
    const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 1.5;
    const nf = ctx.createBiquadFilter(); nf.type = "highpass"; nf.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.34 * lvl, tt);
    ng.gain.exponentialRampToValueAtTime(0.001, tt + 0.055);
    n.connect(nf); nf.connect(ng); ng.connect(AU.master); n.start(tt); n.stop(tt + 0.07);
    // the body of the combustion — a fat, fast-falling low tone
    const o = ctx.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(150 + Math.random() * 50, tt);
    o.frequency.exponentialRampToValueAtTime(58, tt + 0.09);
    const of = ctx.createBiquadFilter(); of.type = "lowpass";
    of.frequency.setValueAtTime(2200, tt);
    of.frequency.exponentialRampToValueAtTime(500, tt + 0.1);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.4 * lvl, tt);
    og.gain.exponentialRampToValueAtTime(0.001, tt + 0.12);
    o.connect(of); of.connect(og); og.connect(AU.master); o.start(tt); o.stop(tt + 0.14);
    // and the punch in the chest
    const k = ctx.createOscillator(); k.type = "sine";
    k.frequency.setValueAtTime(120, tt);
    k.frequency.exponentialRampToValueAtTime(42, tt + 0.08);
    const kg = ctx.createGain();
    kg.gain.setValueAtTime(0.38 * lvl, tt);
    kg.gain.exponentialRampToValueAtTime(0.001, tt + 0.1);
    k.connect(kg); kg.connect(AU.master); k.start(tt); k.stop(tt + 0.12);
    dt += gap;
    gap *= 0.72;                              // the fires close up into a run
  }

  /* --- the intake taking its first proper breath as the revs fly up --- */
  const air = ctx.createBufferSource(); air.buffer = AU.noiseBuf; air.loop = true;
  air.playbackRate.value = 1.1;
  const af = ctx.createBiquadFilter(); af.type = "bandpass"; af.Q.value = 1.0;
  af.frequency.setValueAtTime(420, t);
  af.frequency.exponentialRampToValueAtTime(2300, t + 0.3);
  af.frequency.exponentialRampToValueAtTime(900, t + 0.75);
  const ag = ctx.createGain();
  ag.gain.setValueAtTime(0.001, t);
  ag.gain.linearRampToValueAtTime(0.1 * hard, t + 0.16);
  ag.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
  air.connect(af); af.connect(ag); ag.connect(AU.master);
  air.start(t); air.stop(t + 0.85);
}

function sfxBlowoff() {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  // psh-t-t-t-t — compressor-surge flutter, falling in pitch as pressure dumps
  [[0, 0.6], [0.07, 0.4], [0.13, 0.28], [0.19, 0.17], [0.26, 0.09]].forEach(([dt, amp], i) => {
    const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 1.45;
    const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 1900 - i * 260;
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t + dt);
    g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.1);
    n.connect(f); f.connect(g); g.connect(AU.master);
    n.start(t + dt); n.stop(t + dt + 0.13);
  });
}

/* second-stage turbos coming online: a quick rising intake hiss as the
   extra pair grabs its share of the exhaust flow */
function sfxSeqEngage() {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.loop = true; n.playbackRate.value = 1.2;
  const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.4;
  f.frequency.setValueAtTime(1100, t);
  f.frequency.exponentialRampToValueAtTime(3400, t + 0.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.14, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
  n.connect(f); f.connect(g); g.connect(AU.master);
  n.start(t); n.stop(t + 0.42);
}

/* stu-tu-tu-tu — big-single compressor surge: pressure slams back through the
   turbo and the blades chop the intake. Tonal whistle falling in pitch,
   amplitude-chopped by a slowing flutter, with breath under every pulse */
function sfxFlutter(boost) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  const k = Math.min(1, boost);
  const dur = 0.42 + k * 0.3;
  // turbine whistle sheds pitch as the wheel slows
  const o = ctx.createOscillator(); o.type = "sawtooth";
  o.frequency.setValueAtTime(1500 + k * 1300, t);
  o.frequency.exponentialRampToValueAtTime(520, t + dur);
  const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 2.2;
  f.frequency.setValueAtTime(2000 + k * 1200, t);
  f.frequency.exponentialRampToValueAtTime(700, t + dur);
  // the "zu zu zu": fast surge chop that slows as the surge dies
  const am = ctx.createOscillator(); am.type = "square";
  am.frequency.setValueAtTime(17, t);
  am.frequency.linearRampToValueAtTime(8, t + dur);
  const amG = ctx.createGain(); amG.gain.value = 0.5;
  const chop = ctx.createGain(); chop.gain.value = 0.5;
  am.connect(amG); amG.connect(chop.gain);
  // breath: each pulse pushes a puff of air out the intake
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.loop = true; n.playbackRate.value = 1.3;
  const nf = ctx.createBiquadFilter(); nf.type = "highpass"; nf.frequency.value = 1600;
  const ng = ctx.createGain(); ng.gain.value = 0.5;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.001, t);
  env.gain.linearRampToValueAtTime(0.24 + k * 0.14, t + 0.02);
  env.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(f); f.connect(chop);
  n.connect(nf); nf.connect(ng); ng.connect(chop);
  chop.connect(env); env.connect(AU.master);
  o.start(t); am.start(t); n.start(t);
  o.stop(t + dur + 0.05); am.stop(t + dur + 0.05); n.stop(t + dur + 0.05);
}

/* short UI tone — countdown beeps for the launch timer */
function sfxBeep(hz, dur, amp) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = hz;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(amp, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(AU.master); o.start(t); o.stop(t + dur + 0.05);
}

/* soft two-note power-on chime for the EV */
function sfxChime(amp = 1) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  [[660, 0], [990, 0.14]].forEach(([hz, dt]) => {
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t + dt);
    g.gain.linearRampToValueAtTime(0.14 * amp, t + dt + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.45);
    o.connect(g); g.connect(AU.master); o.start(t + dt); o.stop(t + dt + 0.5);
  });
}

/* the 296's own power-on: a soft ascending three-note motif — a C-major
   arpeggio in warm triangles with a pure octave shimmer over each note and
   a low swell underneath as the systems wake. Elegant, not gadgety. */
function sfxChimeFerrari(amp = 1) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  [[523.25, 0, 0.55], [659.25, 0.16, 0.55], [783.99, 0.32, 0.75]].forEach(([hz, dt, dur]) => {
    const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t + dt);
    g.gain.linearRampToValueAtTime(0.085 * amp, t + dt + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, t + dt + dur);
    o.connect(g); g.connect(AU.master); o.start(t + dt); o.stop(t + dt + dur + 0.05);
    const s = ctx.createOscillator(); s.type = "sine"; s.frequency.value = hz * 2;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.001, t + dt);
    sg.gain.linearRampToValueAtTime(0.022 * amp, t + dt + 0.09);
    sg.gain.exponentialRampToValueAtTime(0.001, t + dt + dur);
    s.connect(sg); sg.connect(AU.master); s.start(t + dt); s.stop(t + dt + dur + 0.05);
  });
  // the warm swell underneath — C3 rising to G3 as everything comes alive
  const b = ctx.createOscillator(); b.type = "sine"; b.frequency.setValueAtTime(130.8, t);
  b.frequency.linearRampToValueAtTime(196, t + 0.5);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.001, t);
  bg.gain.linearRampToValueAtTime(0.05 * amp, t + 0.3);
  bg.gain.exponentialRampToValueAtTime(0.001, t + 0.95);
  b.connect(bg); bg.connect(AU.master); b.start(t); b.stop(t + 1);
}

/* the hybrid transformation: the e-motor spins the V6 straight to speed and
   it catches almost politely — a soft intake breath and a brief, muted swell
   that hands over to the engine voice. No bark, no drama: seamless. */
function sfxHybridFire() {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  // soft intake breath as the throttles crack open
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 0.9;
  const nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.Q.value = 1.1;
  nf.frequency.setValueAtTime(400, t);
  nf.frequency.exponentialRampToValueAtTime(1600, t + 0.18);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.001, t);
  ng.gain.linearRampToValueAtTime(0.09, t + 0.05);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
  n.connect(nf); nf.connect(ng); ng.connect(AU.master); n.start(t); n.stop(t + 0.38);
  // muted first-fire swell — low, round, quickly folded into the running note
  const o = ctx.createOscillator(); o.type = "triangle";
  o.frequency.setValueAtTime(110, t);
  o.frequency.exponentialRampToValueAtTime(220, t + 0.13);
  o.frequency.exponentialRampToValueAtTime(160, t + 0.3);
  const of = ctx.createBiquadFilter(); of.type = "lowpass";
  of.frequency.setValueAtTime(600, t);
  of.frequency.linearRampToValueAtTime(1400, t + 0.14);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.001, t);
  og.gain.linearRampToValueAtTime(0.16, t + 0.05);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
  o.connect(of); of.connect(og); og.connect(AU.master); o.start(t); o.stop(t + 0.38);
}

/* wind blast as the car passes the flyby listener */
function sfxWhoosh(amp) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.loop = true; n.playbackRate.value = 0.8;
  const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(amp, t + 0.1);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
  n.connect(f); f.connect(g); g.connect(AU.master);
  n.start(t); n.stop(t + 0.7);
}

/* single exhaust pop — the building block of crackle & burble.
   soft = rounded idle chuff ("huo") — no crack, lower, longer */
function sfxPop(amp, when, soft) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = when || ctx.currentTime;
  amp = Math.min(1.7, amp * 2.6);         // hot — the output compressor catches the peaks
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf;
  n.playbackRate.value = (soft ? 0.35 : 0.5) + Math.random() * (soft ? 0.2 : 0.4);
  const f = ctx.createBiquadFilter(); f.type = "lowpass";
  f.frequency.value = soft ? 130 + Math.random() * 110 : 260 + Math.random() * 380;
  const g = ctx.createGain();
  g.gain.setValueAtTime(amp, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + (soft ? 0.09 : 0.05) + Math.random() * 0.05);
  n.connect(f); f.connect(g); g.connect(AU.popBus);
  n.start(t); n.stop(t + (soft ? 0.17 : 0.12));
  if (!soft) {
    // sharp crack transient on top — real pops snap before they boom
    const c = ctx.createBufferSource(); c.buffer = AU.noiseBuf; c.playbackRate.value = 1.6;
    const cf = ctx.createBiquadFilter(); cf.type = "bandpass"; cf.frequency.value = 2400; cf.Q.value = 0.8;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(amp * 0.75, t);   // snappier crack
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
    c.connect(cf); cf.connect(cg); cg.connect(AU.popBus);
    c.start(t); c.stop(t + 0.03);
  }
  if (soft || Math.random() < 0.7) {      // deeper bang under most pops
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(soft ? 68 : 90, t);
    o.frequency.exponentialRampToValueAtTime(soft ? 30 : 36, t + (soft ? 0.09 : 0.08));
    const og = ctx.createGain();
    og.gain.setValueAtTime(amp * 1.1, t);    // fuller chest-thump boom
    og.gain.exponentialRampToValueAtTime(0.001, t + (soft ? 0.12 : 0.11));
    o.connect(og); og.connect(AU.popBus); o.start(t); o.stop(t + (soft ? 0.14 : 0.13));
  }
}

/* burst of overrun crackle, with flames timed to the pops */
function sfxCrackle(intensity) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t0 = ctx.currentTime;
  const n = 3 + Math.floor(Math.random() * 3 + intensity);
  let dt = 0.015;
  for (let i = 0; i < n; i++) {
    const amp = (0.4 + Math.random() * 0.35) * Math.max(0.35, 1 - i * 0.12) * Math.min(1.7, intensity);
    sfxPop(amp, t0 + dt);
    if (amp > 0.16) setTimeout(() => popFlame(amp > 0.42), dt * 1000);
    dt += 0.045 + Math.random() * 0.09;
  }
}

function sfxBackfire() {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  for (const dt of [0, 0.07 + Math.random() * 0.05]) {
    const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf;
    n.playbackRate.value = 0.5;
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 260;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.75, t + dt);
    g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.11);
    n.connect(f); f.connect(g); g.connect(AU.popBus);
    n.start(t + dt); n.stop(t + dt + 0.14);
  }
}

/* ================================================================
   PHYSICS
   ================================================================ */

function currentRatio() {
  const g = S.gear;
  if (g === 0) return 0;
  return CAR.ratios[g] * CAR.finalDrive;
}

/* the engine-speed-equivalent (rpm) the driveline would sit at for gear `g`
   at the car's current road speed — used to rev-match a downshift instead
   of just stabbing full throttle and hoping it lands near the right note */
function matchRpm(g) {
  const ratio = (CAR.ratios[g] || 0) * CAR.finalDrive;
  if (!ratio) return ENG.idle;
  const rpm = (Math.abs(S.v) / CAR.wheelR) * Math.abs(ratio) * (60 / (2 * Math.PI));
  return clamp(rpm, ENG.idle, ENG.max * 0.98);
}

function computeEngage() {
  if (S.gear === 0) return 0;
  if (S.mode === "clutch") {
    // bite point: engagement begins at 25% pedal release, full at 75%
    return clamp(((1 - S.clutchPedal) - 0.25) / 0.5, 0, 1);
  }
  if (S.shiftCut > 0) return 0;
  if (CC.ev) return 1;                       // direct drive — torque from zero rpm
  // manual / auto: centrifugal-style auto clutch — cannot stall. A wide,
  // eased ramp (rather than a narrow linear one) spreads the bite over a
  // longer stretch of rpm so a gas-pedal launch builds speed continuously
  // instead of crawling, then snapping to full power once revs cross a
  // threshold.
  const raw = clamp((S.rpm - ENG.idle * 1.05) / (ENG.idle * 1.6), 0, 1);
  return raw * raw * (3 - 2 * raw);          // smoothstep
}

function stepPhysics(dt) {
  // pedal smoothing (keyboard is binary; ramps make it analog)
  S.throttle += clamp(S.in.gas - S.throttle, -RATES.thrDn * dt, RATES.thrUp * dt);
  S.brake += clamp(S.in.brake - S.brake, -RATES.brkDn * dt, RATES.brkUp * dt);
  // auto drive: blend the chauffeur's feet in under the player's
  if (AD.on) {
    S.throttle = Math.max(S.throttle, AD.gas);
    S.brake = Math.max(S.brake, AD.brake);
  }
  // clutch release is auto-feathered like a real driver's foot: fast through
  // the dead travel, then it holds the pedal at the engagement the ENGINE can
  // actually support (engine torque vs clutch capacity) and slips there until
  // the wheels catch up to the crank — only then does it drop the rest of the
  // travel. If the revs droop anyway, the foot eases the pedal back in.
  let cltDn = RATES.cltDn;
  const biting = S.mode === "clutch" && S.gear !== 0 && S.engineOn && !S.locked &&
                 S.clutchPedal < 0.85 && S.clutchPedal > 0.12;
  let biteSlip = 0, eNow = 0, eHold = 1;
  if (biting) {
    const br = currentRatio();
    const wheelRpm = (Math.abs(S.v) / CAR.wheelR) * Math.abs(br) * (60 / (2 * Math.PI));
    biteSlip = S.rpm - wheelRpm;
    eNow = clamp(((1 - S.clutchPedal) - 0.25) / 0.5, 0, 1);
    // the most engagement the engine can hold while the plates still slip
    eHold = clamp((torqueAt(Math.max(S.rpm, ENG.idle)) * ENG.tqMul * 0.9) / CAR.clutchCap, 0.04, 1);
    if (S.in.clutch < S.clutchPedal) {
      if (biteSlip < 120)            cltDn = RATES.cltDn * 2;          // matched — drop it
      else if (eNow < eHold * 0.85)  cltDn = 0.6 + Math.abs(S.v) * 0.3; // ease to the bite
      else                           cltDn = 0.03;                      // hold and slip
    }
  }
  S.clutchPedal += clamp(S.in.clutch - S.clutchPedal, -cltDn * dt, RATES.cltUp * dt);
  // catch reflex: over-engaged and drooping — back into the pedal, fast
  if (biting && S.in.clutch === 0 && biteSlip > 120 &&
      (eNow > eHold * 1.15 || S.rpm < ENG.stall * 1.4))
    S.clutchPedal = Math.min(0.8, S.clutchPedal + 5 * dt);

  // cruise control: a slow PI foot on the throttle. Any brake or clutch
  // input cancels it (like the real thing); throttle above the cruise
  // setting overrides it for an overtake, then it settles back.
  if (S.cruise.on) {
    const inGear = S.mode === "auto" ? S.autoSel === "D" : (S.gear !== 0 && S.gear !== "R");
    const evNow2 = CC.edrive && S.powered && S.eDrive === "ev";
    if ((!S.engineOn && !evNow2) || S.stalled || !inGear ||
        S.in.brake > 0.05 || S.brake > 0.3 || S.in.clutch > 0.3) {
      cruiseOff();
    } else {
      const err = S.cruise.set - Math.abs(S.v);
      S.cruise.i = clamp(S.cruise.i + err * 0.05 * dt, 0, 0.9);
      const ct = clamp(S.cruise.i + err * 0.11, 0, 0.92);
      S.throttle = Math.max(S.throttle, ct);
    }
  }

  S.shiftCut = Math.max(0, S.shiftCut - dt);
  S.shiftCool = Math.max(0, S.shiftCool - dt);
  S.cutTimer = Math.max(0, S.cutTimer - dt);
  const blipWas = S.blip;
  S.blip = Math.max(0, S.blip - dt);

  // rev limiter
  if (S.rpm > ENG.cut) S.cutTimer = 0.07;

  // idle governor keeps the engine alive at no throttle (free or lightly
  // loaded). Its authority grows as the revs sink below idle — tiny engines
  // (the Peel makes 10Nm against ~16Nm of internal friction) need most of
  // their throttle just to idle, which a healthy engine never notices.
  let gov = 0;
  if (S.engineOn && !CC.ev)
    gov = clamp((ENG.idle + 60 - S.rpm) / 380, 0,
                0.4 + 0.5 * clamp((ENG.idle * 0.9 - S.rpm) / (ENG.idle * 0.4), 0, 1));
  // launch assist: while the clutch is biting, feather in throttle the way a
  // real driver holds the revs against the load — gentle launches don't stall
  if (S.mode === "clutch" && S.engineOn && !S.cranking && !CC.ev &&
      S.gear !== 0 && S.engage > 0.03 && !S.locked)
    gov = Math.max(gov, clamp((ENG.idle * 1.45 - S.rpm) / (ENG.idle * 0.6), 0, 0.85));
  let eff = Math.max(S.throttle, gov);
  // downshift rev-match: blip just hard enough to catch the new gear's synced
  // rpm, easing off as it arrives — a real heel-toe stab, not a pinned throttle
  // that overshoots to redline and has to snap back down to match the wheels.
  if (S.blip > 0 && S.blipTarget != null) {
    const band = (ENG.max - ENG.idle) * 0.14;
    eff = Math.max(eff, clamp((S.blipTarget - S.rpm) / band, 0, 1));
  } else if (S.blip > 0) {
    eff = Math.max(eff, Math.min(1, S.blip / 0.12));
  }
  // startup flare — first fires push the revs up before the idle settles
  S.catchT = Math.max(0, S.catchT - dt);
  if (S.catchT > 0)
    eff = Math.max(eff, (S.catchAmt || 0.55) * Math.min(1, S.catchT / 0.4));
  if (S.cutTimer > 0 || (S.shiftCut > 0 && S.blip <= 0) || !S.engineOn) eff = 0;
  S.effThrottle = eff;

  // crackle as the blip closes
  if (blipWas > 0 && S.blip <= 0 && popsRating() > 0 && Math.random() < 0.9)
    sfxCrackle(popsRating() * popEff());

  // gentle idle hunt — a real engine never sits perfectly still
  if (S.engineOn && !S.cranking && eff < 0.12 && S.rpm < ENG.idle * 1.5)
    S.rpm += (Math.random() - 0.5) * 16 * (CC.sound.hunt || 1);

  // rotary idle chop: rounded chuffs on a steady cadence — "huo huo huo huo"
  // — rather than random crackle. idleBlat > 1 = louder and faster.
  const blat = CC.sound.idleBlat === true ? 1 : (CC.sound.idleBlat || 0);
  if (blat > 0 && S.engineOn && !S.cranking && eff < 0.1 && S.rpm < ENG.idle * 1.35) {
    S._blatT = (S._blatT || 0) - dt * blat;
    if (S._blatT <= 0) {
      S._blatT = 0.34 + Math.random() * 0.14;
      sfxPop((0.1 + Math.random() * 0.06) * (0.6 + blat * 0.55), 0, true);
    }
  } else S._blatT = 0.1;

  // forced induction
  if (CC.asp === "turbo" && S.engineOn) {
    // turbo needs exhaust flow: spools with rpm + load, bleeds fast off-throttle
    let tgt;
    if (CC.seqTurbo) {
      // sequential stages: the small pair lights almost off idle, the second
      // pair joins high in the rev range with a step you can hear
      const q = CC.seqTurbo;
      const s1 = clamp((S.rpm - CC.spool * 0.5) / (CC.spool * 0.9), 0, 1);
      const s2 = clamp((S.rpm - q.at) / q.span, 0, 1);
      S.seqStage = s2;
      tgt = eff * ((1 - q.share) * s1 + q.share * s2);
      if (s2 > 0.5 && (S._seqPrev || 0) <= 0.5 && eff > 0.4) sfxSeqEngage();
      S._seqPrev = s2;
    } else {
      tgt = eff * clamp((S.rpm - CC.spool * 0.5) / (CC.spool * 1.1), 0, 1);
    }
    // anti-lag keeps the charger lit even off-throttle
    if (curEx().burble)
      tgt = Math.max(tgt, 0.55 * clamp((S.rpm - CC.spool * 0.4) / CC.spool, 0, 1));
    const rate = tgt > S.boost ? CC.spoolRate : 4.2;
    S.boost += (tgt - S.boost) * Math.min(1, rate * dt);
    if (S._prevBoostEff > 0.5 && eff < 0.15 && S.boost > 0.35) {
      // throttle slammed shut under boost: big singles flutter, the rest psh
      CC.flutter ? sfxFlutter(S.boost) : sfxBlowoff();
      S.boost *= 0.22;
    }
    S._prevBoostEff = eff;
  } else if (CC.asp === "super" && S.engineOn) {
    // belt-driven: boost tracks rpm instantly, no lag
    S.boost += (S.throttle * (S.rpm / ENG.max) - S.boost) * Math.min(1, 12 * dt);
  } else if (CC.asp === "hybrid" && S.engineOn) {
    // electric torque-fill: instant, strongest where the engine is weakest
    const tgt = S.throttle * clamp(1.15 - S.rpm / (ENG.max * 0.75), 0.15, 1);
    S.boost += (tgt - S.boost) * Math.min(1, 14 * dt);
  } else {
    S.boost *= Math.max(0, 1 - 3 * dt);
  }
  const boostMul = 1 + (CC.boostMax || 0) * S.boost;

  // engine torque (drive minus internal braking)
  let Te = 0;
  if (S.engineOn) Te = torqueAt(S.rpm) * boostMul * ENG.tqMul * eff - (16 + S.rpm * 0.011) * (ENG.fric || 1) * (1 - eff);
  else Te = -(20 + S.rpm * 0.02) * (ENG.fric || 1);

  const engage = computeEngage();
  S.engage = engage;
  const ratio = currentRatio();
  const cap = CAR.clutchCap * engage;

  // resistances on the car
  let F = 0;
  const drag = 0.5 * 1.22 * CAR.cdA * S.v * Math.abs(S.v);
  const roll = Math.abs(S.v) > 0.05 ? CAR.roll * Math.sign(S.v) : 0;
  F -= drag + roll;

  // driver aids: with them off, hard braking locks the wheels
  const aidsOff = curMod().abs === false;
  S.lockup = aidsOff && S.brake > 0.9 && Math.abs(S.v) > 6;
  // brake pedal isn't grabby off the top: a soft-shaped curve means light
  // pressure trails the car gently and only a firm push delivers full stopping
  // power (real pedal feel, not an on/off switch)
  const brakeForce = Math.pow(S.brake, 1.7);
  let braking = brakeForce * CAR.brakeMax + (S.mode === "auto" && S.autoSel === "P" ? 20000 : 0);
  if (S.lockup) braking *= 0.68;             // locked rubber stops worse

  const omegaToRpm = 60 / (2 * Math.PI);
  let driveF = 0;
  const evNow = CC.edrive && S.powered && S.eDrive === "ev";

  if (evNow) {
    // ELECTRIC eDrive: direct e-motor to the wheels, no gearbox, silent V6.
    // Pull tapers to zero as it nears the cap, so top speed self-limits ~50mph.
    // The V6 NEVER fires on its own — the driver picks the moment (H key).
    S.rpm = 0; S.boost = 0; S.locked = false;
    const cap = (CC.evCapKmh || 80) / 3.6;                 // m/s
    const fwd = S.mode === "auto" ? S.autoSel === "D" : (S.gear !== 0 && S.gear !== "R");
    const rev = S.mode === "auto" ? S.autoSel === "R" : (S.gear === "R");
    if (fwd) driveF = S.throttle * (CC.evForce || 8000) * clamp((cap - S.v) / cap, 0, 1);
    else if (rev) driveF = -S.throttle * (CC.evForce || 8000) * 0.5 * clamp((cap * 0.4 + S.v) / (cap * 0.4), 0, 1);
  } else if (ratio === 0 || cap < 1) {
    // engine free-revving
    S.locked = false;
    if (S.engineOn || S.rpm > 1) {
      S.rpm += (Te / ENG.inertia) * omegaToRpm * dt;
    }
  } else {
    // wheelspin adds surface speed; a lockup stops the wheels dead
    const spinAdd = S.gear === "R" ? 0 : S.spinV;
    const wheelV = S.lockup ? 0 : S.v + spinAdd;
    const wheelRpm = (wheelV / CAR.wheelR) * ratio * omegaToRpm; // engine-equivalent
    const slip = S.rpm - wheelRpm;

    if (!S.locked && Math.abs(slip) < 45 && Math.abs(Te) < cap) S.locked = true;
    if (S.locked && Math.abs(Te) > cap) S.locked = false;

    if (S.locked) {
      S.rpm = wheelRpm;
      driveF = (Te * ratio * CAR.eff) / CAR.wheelR;
    } else {
      const Tc = cap * Math.sign(slip) * clamp(Math.abs(slip) / 90, 0.2, 1);
      S.rpm += ((Te - Tc) / ENG.inertia) * omegaToRpm * dt;
      driveF = (Tc * ratio * CAR.eff) / CAR.wheelR;
    }
  }

  // tire grip: aids on = quiet traction-control clamp; aids off = the tires
  // light up for real — the rears break away sooner, the revs flare, and the
  // rubber keeps spinning and screeching long after you'd expect it to hook up
  const gripCoef = aidsOff ? 0.43 : 0.52;    // no TC modulation → less usable grip
  const gripMax = CAR.mass * 9.81 * gripCoef * (CC.grip || (CC.awd ? 1.8 : 1));
  if ((evNow || (S.gear !== 0 && S.gear !== "R")) && driveF > gripMax) {
    if (aidsOff) {
      S.spinV = Math.min(36, S.spinV + ((driveF - gripMax) / (CAR.mass * 0.04)) * dt);
      driveF = gripMax * 0.58;               // lit-up rubber pushes far less
    } else {
      driveF = gripMax * 1.15;               // TC lets it slip just a little
    }
  }
  // aids off, spinning rubber is slow to recover; aids on it hooks up quickly
  const spinDecay = aidsOff ? (3 + S.spinV * 0.85) : (6 + S.spinV * 1.5);
  S.spinV = Math.max(0, S.spinV - spinDecay * dt * (driveF >= gripMax * 0.7 ? 0.3 : 1.6));
  F += driveF;

  // creep for the automatic's torque converter feel
  if (S.mode === "auto" && S.autoSel === "D" && S.engineOn && S.v < 1.8 && S.brake < 0.2)
    F += CAR.mass * 0.32 * (1 - S.v / 1.8);
  if (S.mode === "auto" && S.autoSel === "R" && S.engineOn && S.v > -1.5 && S.brake < 0.2)
    F -= CAR.mass * 0.29;

  // brakes always oppose motion, and can't reverse it
  let a = F / CAR.mass;
  if (braking > 0) {
    const bDecel = braking / CAR.mass;
    if (Math.abs(S.v) > 0.02) a -= Math.min(bDecel, Math.abs(S.v) / dt + Math.abs(a)) * Math.sign(S.v);
    else if (Math.abs(a) * CAR.mass < braking) a = 0;
  }
  S.v += a * dt;
  if (Math.abs(S.v) < 0.015 && S.brake > 0.1) S.v = 0;
  S.odo += Math.abs(S.v) * dt / 1000;

  S.rpm = clamp(S.rpm, 0, ENG.cut * 1.24);

  // stalling — only the full-clutch mode can stall
  if (S.engineOn && !S.cranking && S.mode === "clutch" && !CC.ev &&
      S.gear !== 0 && engage > 0.45 && S.rpm < ENG.stall) {
    stallEngine();
  }
  // …and if the revs collapse entirely (a lost cause even with the clutch
  // caught), it dies too — no zombie idle at zero rpm
  if (S.engineOn && !S.cranking && S.mode === "clutch" && !CC.ev &&
      S.rpm < Math.min(200, ENG.stall * 0.5) && S.catchT <= 0) {
    stallEngine();
  }
  if (S.engineOn && S.rpm < 200 && S.mode !== "clutch" && !CC.ev) S.rpm = Math.max(S.rpm, 200);

  // lift-off crackle & overrun burble (gated by pops rating + exhaust mod)
  const pr = popsRating(), pMul = popEff();
  if (S._lastEff > 0.6 && eff < 0.05 && S.rpm > ENG.max * 0.5) {
    if (pr >= 1) sfxCrackle(pr * pMul);
    else if (!CC.noPop && Math.random() < 0.5) sfxBackfire();
  }
  const burbleFloor = curEx().burble ? 0.26 : 0.42;   // anti-lag pops way down the range
  const onOverrun = S.engineOn && eff < 0.04 && S.engage > 0.6 &&
                    S.rpm > ENG.max * burbleFloor && Math.abs(S.v) > 4;
  if (onOverrun && pr > 0 && Math.random() < dt * 1.6 * pr * pMul) {
    sfxPop((0.3 + Math.random() * 0.35) * Math.min(1.4, pMul));
    popFlame(false);
  }
  S._lastEff = eff;

  // check-engine roulette: after a few minutes of running, the light pops on
  // (only the Bavarian does this), followed by the occasional misfire stumble
  if (CC.cel && S.engineOn && !S.cranking) {
    if (!S.celOn) {
      S.celT = (S.celT === undefined ? 60 : S.celT) - dt;
      if (S.celT <= 0) {
        S.celOn = true; S.celEver = true;
        sfxBackfire();
        $("lampCel").classList.add("lit", "blink");
        setTimeout(() => $("lampCel").classList.remove("blink"), 2600);
      }
    } else if (Math.random() < dt * 0.12 && S.rpm > ENG.idle * 1.2) {
      S.shiftCut = Math.max(S.shiftCut, 0.09);   // brief ignition drop — lurch
      sfxBackfire();
    }
  }

  // flyby spectator: the car sweeps past a trackside listener over and over
  if (S.flyby) {
    const prevX = S.flyX;
    S.flyX += flybyV() * dt;
    if (prevX < 0 && S.flyX >= 0 && Math.abs(S.v) > 12)
      sfxWhoosh(Math.min(0.75, Math.abs(S.v) * 0.007));
    if (S.flyX > 380) S.flyX = -380;
  }

  // automatic gearbox logic — a comfort auto, not a sport one: it short-shifts
  // early and lives in the tall gears for a smooth, quiet ride. A hard rev
  // ceiling (~4.5-5k) means it upshifts well before then no matter how hard you
  // push, so the revs stay low and civil like a real automatic.
  if (S.mode === "auto" && S.autoSel === "D" && S.engineOn && S.shiftCool <= 0 && !CC.ev) {
    const span = ENG.max - ENG.idle;
    const ceiling = Math.min(4800, ENG.idle + span * 0.5);   // never revs past ~4.5-5k
    const up = Math.min(ceiling, ENG.idle + span * (0.13 + S.throttle * 0.26));
    const dn = ENG.idle + span * (0.05 + S.throttle * 0.08);
    if (S.rpm > up && S.autoGear < CAR.top) autoShift(S.autoGear + 1);
    else if (S.rpm < dn && S.autoGear > 1) autoShift(S.autoGear - 1);
  }
}

function autoShift(g) {
  const down = g < S.autoGear;
  S.autoGear = g; S.gear = g;
  // torque-converter smooth: a brief torque interruption and NOTHING else. No
  // throttle blip — a blip keeps the throttle alive while the clutch is open
  // during the shift, which free-revs the engine (the "sudden high revs" bug).
  // With the blip gone, shiftCut cleanly cuts drive and the revs simply flow
  // onto the new gear's ratio, exactly like a real automatic.
  S.shiftCut = down ? 0.16 : 0.12; S.shiftCool = 0.7;
  S.blip = 0; S.blipTarget = null;
  sfxClunk(0.1);                          // barely-there thunk
  flashGear();
}

/* the Bavarian special: re-arm the check-engine light. Restarting the car
   "clears the code" — it always comes back a few minutes later. The lamp
   itself only exists on the Bavarian's dash. */
function armCel() {
  S.celOn = false;
  // first fault takes a short drive to appear; once the car has thrown a
  // code, every "fix" brings it back even sooner
  S.celT = S.celEver ? 12 + Math.random() * 18 : 25 + Math.random() * 35;
  const el = $("lampCel");
  el.classList.remove("lit", "blink");
  el.style.display = CC.cel ? "" : "none";
}

function stallEngine() {
  S.engineOn = false; S.stalled = true; S.locked = false;
  updateRunLamp();
  sfxClunk(1.4);
  $("stallOverlay").classList.add("show");
  $("lampStall").classList.add("lit", "blink");
}

/* ================================================================
   IGNITION
   ================================================================ */

/* every physical press of the button lands here. On the Sant'Agata cars the
   red cover has to come up first — that press costs you nothing but the flip.
   After that it's a real switch under your thumb, so it clicks. */
function ignitionPress() {
  initAudio();
  if (AU.ctx && AU.ctx.state === "suspended") AU.ctx.resume();

  if (CC.startCap && !S.capOpen) {
    S.capOpen = true;
    $("ignition").classList.add("cap-open");
    sfxCapFlip(true);
    return;
  }
  // key cars turn a barrel; everything else is a switch under your thumb
  if (!S.cranking) {
    if (CC.ignKey) sfxKeyTurn(S.engineOn ? -1 : 1);
    else sfxIgnClick();
  }
  toggleIgnition();
}

// drop the cover back over the button — done whenever the car goes dark
function closeStartCap() {
  if (!S.capOpen) return;
  S.capOpen = false;
  $("ignition").classList.remove("cap-open");
  if (CC.startCap) sfxCapFlip(false);
}

function toggleIgnition() {
  initAudio();
  if (AU.ctx && AU.ctx.state === "suspended") AU.ctx.resume();

  if (S.cranking) return;
  const seq = (S.crankSeq = (S.crankSeq || 0) + 1);

  // hybrid eDrive car: the key starts the V6 like any other car (just more
  // politely — modern hybrid quick-start). Booting into silent EV mode is the
  // eDrive button's job (toggleEdrive). Either way the key shuts it all down.
  if (CC.edrive) {
    if (S.powered) {                          // power everything down
      S.powered = false; S.engineOn = false; S.eDrive = "gas";
      S.rpm = 0; S.boost = 0; S.acc = false;
      sfxClunk(0.45);
      closeStartCap();
      updateRunLamp(); updateEdriveUi();
      return;
    }
    S.powered = true; S.eDrive = "gas";       // …then fall through to the crank
    updateEdriveUi();
  }

  if (S.engineOn) {
    S.engineOn = false; S.acc = false;
    sfxClunk(0.5);
    closeStartCap();
    updateRunLamp();
    return;
  }
  // EV: no starter motor — just power up with a chime
  if (CC.ev) {
    S.engineOn = true; S.stalled = false; S.acc = true;
    S.rpm = 0; S.sweep = 0;
    $("stallOverlay").classList.remove("show");
    $("lampStall").classList.remove("lit", "blink");
    sfxChime();
    setTimeout(() => sayVoice("Systems ready"), 700);
    updateRunLamp();
    return;
  }
  // two-stage cars — the SVJ, the older stuff, the diesel, the race car. The
  // first press only wakes it up: relay in, pump priming, needles sweeping the
  // dials and back. Everything is live and the starter is armed, but nothing
  // has turned yet. Press again and it goes.
  if (CC.twoStage && !S.acc) {
    S.acc = true; S.stalled = false;
    S.rpm = 0; S.sweep = 0;             // the welcome sweep across the gauges
    $("stallOverlay").classList.remove("show");
    $("lampStall").classList.remove("lit", "blink");
    sfxAccOn(CC);
    updateRunLamp();
    return;
  }

  // crank — hybrids quick-start: the e-motor spins it up faster and quieter
  const quiet = !!CC.edrive;
  const p = crankProfile(CC);
  if (quiet) { p.dur = 0.4; p.rpm *= 1.9; p.fires = 2; p.flare = 0.35; p.flareT = 0.35; }
  S.acc = true;
  S.cranking = true; S.stalled = false;
  $("stallOverlay").classList.remove("show");
  $("lampStall").classList.remove("lit", "blink");
  const btn = $("ignition");
  btn.classList.add("cranking");
  sfxCrank(p, quiet ? 0.35 : 1);
  // the needle actually sits at cranking speed, wavering on each compression
  const chugHz = (p.cyl / 2) * (p.rpm / 60);
  const crank0 = performance.now();
  const crankAnim = () => {
    if (!S.cranking) return;
    const el = (performance.now() - crank0) / 1000;
    S.rpm = p.rpm * (0.86 + 0.14 * Math.min(1, el / p.dur))
          + Math.sin(el * chugHz * 6.283) * p.rpm * 0.16;
    requestAnimationFrame(crankAnim);
  };
  crankAnim();
  setTimeout(() => {
    if (S.crankSeq !== seq || !S.cranking) return;   // car was swapped mid-crank
    S.cranking = false;
    btn.classList.remove("cranking");
    if (CC.ignKey) sfxKeyTurn(-1);      // sprung out of START, back to ON
    S.engineOn = true;
    armCel();                           // restart clears the code… for now
    S.rpm = p.rpm;                      // catches from cranking speed…
    S.catchAmt = p.flare;               // …and how hard it flares is the car's
    S.catchT = p.flareT;
    // open pipes make a meal of the first fires; a stock system barely coughs
    sfxCatch(p, quiet ? 0.35 : 0.5 + Math.min(1.6, popsRating() * 0.42));
    S.sweep = 0;                        // needle sweep
    updateRunLamp();
  }, p.dur * 1000);
}

function updateRunLamp() {
  const ign = $("ignition");
  ign.classList.toggle("running", S.engineOn || (CC.edrive && S.powered));
  // armed-but-not-running: amber pulse asking for the second press
  ign.classList.toggle("acc", S.acc && !S.engineOn && !S.cranking);
  $("lampRun").classList.toggle("lit", S.engineOn);
  $("lampEv").classList.toggle("lit", CC.edrive && S.powered && S.eDrive === "ev");
}

/* ---- hybrid eDrive: EV ⇄ V6 transformation (296-style) ---- */

// bring the V6 to life — the 296 signature: it always lights at 3500rpm in
// 1st, a quick flare that settles as the box takes over. Tap eDrive (or H).
function fireHybrid() {
  if (!CC.edrive || !S.powered || S.eDrive === "gas") return;
  S.eDrive = "gas"; S.engineOn = true; S.stalled = false;
  if (S.mode === "auto") {
    S.autoGear = 1;
    S.gear = S.autoSel === "D" ? 1 : S.autoSel === "R" ? "R" : 0;
  } else if (S.mode === "manual") S.gear = 1;
  S.rpm = 3500;                               // the fire-up flare
  S.shiftCool = 0.45;                         // a beat before the box reacts
  S.catchT = 0.1; S.catchAmt = 0.45;
  S.sweep = -1;
  sfxHybridFire();
  updateRunLamp(); updateEdriveUi();
}

// drop back to silent electric — only allowed inside the EV envelope (slow,
// light throttle), just like the real car
function toElectric() {
  if (!CC.edrive || !S.powered || S.eDrive === "ev") return;
  const cap = (CC.evCapKmh || 80) / 3.6;
  if (Math.abs(S.v) > cap * 1.03 || S.throttle > 0.25) {
    const b = $("edriveBtn"); b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake");
    return;                                   // too fast / on the gas — stay in V6
  }
  S.eDrive = "ev"; S.engineOn = false; S.rpm = 0; S.boost = 0;
  sfxChimeFerrari(0.7);                       // a quieter grace note mid-drive
  updateRunLamp(); updateEdriveUi();
}

function toggleEdrive() {
  if (!CC.edrive) return;
  if (!S.powered) {                           // off → boot straight into silent EV
    initAudio();
    if (AU.ctx && AU.ctx.state === "suspended") AU.ctx.resume();
    if (S.cranking) return;
    S.crankSeq = (S.crankSeq || 0) + 1;
    S.powered = true; S.engineOn = false; S.eDrive = "ev"; S.acc = true;
    S.stalled = false; S.rpm = 0; S.boost = 0; S.sweep = 0;
    $("stallOverlay").classList.remove("show");
    $("lampStall").classList.remove("lit", "blink");
    sfxChimeFerrari();                        // the full welcome on power-up
    setTimeout(() => sayVoice("Electric drive ready"), 900);
    updateRunLamp(); updateEdriveUi();
    return;
  }
  if (S.eDrive === "ev") fireHybrid(); else toElectric();
}

// button label / boost gauge follow the current motor
function updateEdriveUi() {
  const btn = $("edriveBtn");
  if (!CC.edrive) { btn.classList.add("hide"); return; }
  btn.classList.remove("hide");
  const onEv = S.eDrive === "ev" && S.powered;
  btn.classList.toggle("on-ev", onEv);
  $("edriveLbl").textContent = !S.powered ? "START EV" : onEv ? (CC.fireLbl || "FIRE V6") : "EV MODE";
  $("boostWrap").classList.toggle("hide", onEv || !S.powered);
}

/* ================================================================
   GAUGES (canvas)
   ================================================================ */

function makeGauge(canvas, optsFn) {
  const G = { canvas, ctx: canvas.getContext("2d"), face: null, opts: null, size: 0 };
  G.rebuild = () => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    G.size = rect.width;
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    G.dpr = dpr;
    G.opts = optsFn();
    G.face = document.createElement("canvas");
    G.face.width = canvas.width; G.face.height = canvas.height;
    drawFace(G);
  };
  return G;
}

const A0 = Math.PI * 0.75, A1 = Math.PI * 2.25;   // 270° sweep

function drawFace(G) {
  const { opts } = G;
  const ctx = G.face.getContext("2d");
  const w = G.face.width, cx = w / 2, cy = w / 2, R = w / 2;
  ctx.clearRect(0, 0, w, w);

  // dial base with vertical light falloff
  const bg = ctx.createRadialGradient(cx, cy * 0.7, R * 0.1, cx, cy, R);
  bg.addColorStop(0, opts.faceHi);
  bg.addColorStop(1, opts.face);
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

  // inner ring
  ctx.strokeStyle = opts.ring; ctx.lineWidth = R * 0.045;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.955, 0, Math.PI * 2); ctx.stroke();

  const span = A1 - A0, range = opts.max - opts.min;
  const ang = (v) => A0 + ((v - opts.min) / range) * span;

  // redline arc
  if (opts.redFrom != null) {
    ctx.strokeStyle = opts.redline; ctx.lineWidth = R * 0.035;
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.86, ang(opts.redFrom), A1); ctx.stroke();
  }

  // ticks
  for (let v = opts.min; v <= opts.max + 1e-6; v += opts.minor) {
    const a = ang(v);
    const major = Math.abs(v / opts.major - Math.round(v / opts.major)) < 1e-6;
    const inR = major ? 0.80 : 0.855;
    const red = opts.redFrom != null && v >= opts.redFrom;
    ctx.strokeStyle = red ? opts.redline : (major ? opts.tick : opts.tickDim);
    ctx.lineWidth = major ? R * 0.020 : R * 0.010;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R * inR, cy + Math.sin(a) * R * inR);
    ctx.lineTo(cx + Math.cos(a) * R * 0.91, cy + Math.sin(a) * R * 0.91);
    ctx.stroke();
  }

  // numerals — the classic dial uses an elegant serif face
  const dial = opts.dial || "sport";
  ctx.fillStyle = opts.tick;
  ctx.font = dial === "classic"
    ? `500 ${Math.round(R * 0.105)}px Georgia, "Times New Roman", serif`
    : `600 ${Math.round(R * 0.115)}px "JetBrains Mono", monospace`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (let v = opts.min; v <= opts.max + 1e-6; v += opts.label) {
    const a = ang(v);
    const red = opts.redFrom != null && v >= opts.redFrom;
    ctx.fillStyle = red ? opts.redline : opts.tick;
    ctx.fillText(String(opts.fmt ? opts.fmt(v) : v),
      cx + Math.cos(a) * R * 0.66, cy + Math.sin(a) * R * 0.66);
  }

  // caption
  ctx.fillStyle = opts.muted;
  ctx.font = `600 ${Math.round(R * (dial === "gear" ? 0.06 : 0.072))}px "Outfit", sans-serif`;
  ctx.fillText(opts.caption, cx, cy - R * (dial === "gear" ? 0.14 : 0.32));

  if (dial === "classic") {
    // polished chrome bezel ring
    const ring = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    ring.addColorStop(0, opts.hubHi); ring.addColorStop(0.5, opts.hub); ring.addColorStop(1, opts.hubHi);
    ctx.strokeStyle = ring; ctx.lineWidth = R * 0.055;
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.945, 0, Math.PI * 2); ctx.stroke();
    // fine decorative inner circle
    ctx.strokeStyle = opts.tickDim; ctx.lineWidth = R * 0.007;
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0, Math.PI * 2); ctx.stroke();
    // slotted screws at 3 and 9 o'clock
    for (const a of [0, Math.PI]) {
      const sx = cx + Math.cos(a) * R * 0.74, sy = cy + Math.sin(a) * R * 0.74;
      const sg = ctx.createRadialGradient(sx - R * 0.008, sy - R * 0.01, R * 0.002, sx, sy, R * 0.03);
      sg.addColorStop(0, opts.hubHi); sg.addColorStop(1, opts.hub);
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(sx, sy, R * 0.028, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = R * 0.007;
      ctx.beginPath();
      ctx.moveTo(sx - R * 0.02, sy - R * 0.012); ctx.lineTo(sx + R * 0.02, sy + R * 0.012);
      ctx.stroke();
    }
  }

  if (dial === "gear") {
    // exposed-mechanism window (the gears themselves render live each frame)
    const wx = cx, wy = cy - R * 0.36, wr = R * 0.17;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath(); ctx.arc(wx, wy, wr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = opts.ring; ctx.lineWidth = R * 0.02;
    ctx.beginPath(); ctx.arc(wx, wy, wr, 0, Math.PI * 2); ctx.stroke();
    // rivets around the rim
    ctx.fillStyle = opts.tickDim;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * R * 0.955, cy + Math.sin(a) * R * 0.955, R * 0.014, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/* small involute-ish gear for the mechanical dial window */
function drawGearWheel(ctx, x, y, r, teeth, rot, fill, rim) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot);
  const r0 = r * 0.8;
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2, w = (Math.PI * 2) / teeth;
    ctx.arc(0, 0, r0, a, a + w * 0.25);
    ctx.arc(0, 0, r, a + w * 0.35, a + w * 0.65);
    ctx.arc(0, 0, r0, a + w * 0.75, a + w);
  }
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = rim; ctx.lineWidth = r * 0.09;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = rim;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function renderGauge(G, value) {
  if (!G.face) return;
  const ctx = G.ctx, w = G.canvas.width, cx = w / 2, cy = w / 2, R = w / 2;
  const o = G.opts;
  ctx.clearRect(0, 0, w, w);
  ctx.drawImage(G.face, 0, 0);

  const frac = clamp((value - o.min) / (o.max - o.min), -0.02, 1.03);
  const a = A0 + frac * (A1 - A0);
  const dial = o.dial || "sport";

  // live arc glow
  ctx.strokeStyle = o.accentSoft; ctx.lineWidth = R * 0.05; ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.86, A0, Math.max(A0 + 0.01, a)); ctx.stroke();

  // internal mechanism — meshed gears spin with the needle
  if (dial === "gear") {
    const wx = cx, wy = cy - R * 0.36, wr = R * 0.165;
    ctx.save();
    ctx.beginPath(); ctx.arc(wx, wy, wr, 0, Math.PI * 2); ctx.clip();
    drawGearWheel(ctx, wx - wr * 0.35, wy + wr * 0.18, wr * 0.85, 9, frac * 12, o.hub, o.hubHi);
    drawGearWheel(ctx, wx + wr * 0.66, wy - wr * 0.48, wr * 0.5, 7, -frac * 12 * (9 / 7) + 0.24, o.hub, o.hubHi);
    ctx.restore();
  }

  // needle — shape depends on the dial style
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(a);
  ctx.shadowColor = o.accentGlow; ctx.shadowBlur = R * 0.09;
  ctx.fillStyle = o.needle;
  ctx.beginPath();
  if (dial === "classic") {
    // slim spear with a counterweight tail
    ctx.moveTo(-R * 0.18, -R * 0.012);
    ctx.lineTo(R * 0.70, -R * 0.008);
    ctx.lineTo(R * 0.78, 0);
    ctx.lineTo(R * 0.70, R * 0.008);
    ctx.lineTo(-R * 0.18, R * 0.012);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = o.hub;
    ctx.beginPath(); ctx.arc(-R * 0.15, 0, R * 0.036, 0, Math.PI * 2); ctx.fill();
  } else if (dial === "gear") {
    // chunky flat blade
    ctx.moveTo(-R * 0.10, -R * 0.028);
    ctx.lineTo(R * 0.74, -R * 0.013);
    ctx.lineTo(R * 0.74, R * 0.013);
    ctx.lineTo(-R * 0.10, R * 0.028);
    ctx.closePath(); ctx.fill();
  } else {
    ctx.moveTo(-R * 0.10, -R * 0.018);
    ctx.lineTo(R * 0.80, -R * 0.006);
    ctx.lineTo(R * 0.80, R * 0.006);
    ctx.lineTo(-R * 0.10, R * 0.018);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // hub
  const hub = ctx.createRadialGradient(cx - R * 0.02, cy - R * 0.03, R * 0.01, cx, cy, R * 0.09);
  hub.addColorStop(0, o.hubHi); hub.addColorStop(1, o.hub);
  ctx.fillStyle = hub;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.075, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = o.ring; ctx.lineWidth = R * 0.012; ctx.stroke();
}

function gaugeTheme() {
  // at night the dial disc is flat black — no sheen, only the markings lit
  const night = document.body.classList.contains("night");
  return {
    face: cssVar("--face"), faceHi: night ? cssVar("--face") : mixUp(cssVar("--face")),
    ring: cssVar("--face-ring"), tick: cssVar("--tick"), tickDim: cssVar("--tick-dim"),
    muted: cssVar("--muted"), needle: cssVar("--needle"), redline: cssVar("--redline"),
    accentSoft: cssVar("--accent-soft"), accentGlow: cssVar("--accent-glow"),
    hub: cssVar("--knob-dark"), hubHi: cssVar("--knob"),
  };
}
// slightly lighten a hex color for the dial's lit center
function mixUp(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (n >> 16) + 14), g = Math.min(255, ((n >> 8) & 255) + 14), b = Math.min(255, (n & 255) + 14);
  return `rgb(${r},${g},${b})`;
}

let tachG, speedG;

function buildGauges() {
  tachG = makeGauge($("tach"), () => ({
    ...gaugeTheme(),
    dial: CC.dial,
    min: 0, max: CC.tachMax,
    minor: CC.tachMax > 9 ? 0.5 : 0.25, major: 1,
    label: CC.tachMax > 10 ? 2 : 1,
    redFrom: CC.redK,
    caption: "RPM × 1000",
  }));
  speedG = makeGauge($("speedo"), () => {
    const mx = S.units === "kmh" ? CC.kmhMax : CC.mphMax;
    const lab = mx <= 200 ? 20 : 40;
    return { ...gaugeTheme(), dial: CC.dial, min: 0, max: mx, minor: lab / 4, major: lab / 2,
             label: lab, redFrom: null, caption: S.units === "kmh" ? "KM/H" : "MPH" };
  });
  tachG.rebuild(); speedG.rebuild();
}

/* ================================================================
   SHIFTER GATE (mouse / touch drag)
   ================================================================ */

const GATE = {
  cols: [40, 100, 160, 220],
  chanY: 150, chanHalf: 26,
  topY: 62, botY: 238,
  restX: 130,
  x: 130, y: 150,
  dragging: false,
  gearMap: [[1, 2], [3, 4], [5, 6], [null, "R"]],
};

/* lay the gate out for the current box: gears pair up in columns,
   reverse takes the last slot (its own column when the count is even) */
function buildGateLayout() {
  const top = CAR.top;
  const map = [];
  for (let g = 1; g <= top; g += 2) map.push([g, g + 1 <= top ? g + 1 : "R"]);
  if (top % 2 === 0) map.push([null, "R"]);
  const n = map.length;
  const sp = n > 1 ? Math.min(60, 180 / (n - 1)) : 0;
  GATE.cols = map.map((_, i) => 130 - ((n - 1) * sp) / 2 + i * sp);
  GATE.gearMap = map;
}

function buildGateSvg() {
  buildGateLayout();
  const svg = $("gateSvg");
  const slot = (x, y, w, h) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="rgba(0,0,0,0.42)" stroke="rgba(0,0,0,0.5)" stroke-width="1"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1" transform="translate(0,1.5)"/>`;
  const last = GATE.cols.length - 1;
  let s = "";
  s += slot(GATE.cols[0] - 10, GATE.chanY - 9, GATE.cols[last] - GATE.cols[0] + 20, 18);
  GATE.gearMap.forEach((pair, i) => {
    if (pair[0] !== null) s += slot(GATE.cols[i] - 9, GATE.topY - 10, 18, GATE.botY - GATE.topY + 20);
    else s += slot(GATE.cols[i] - 9, GATE.chanY - 9, 18, GATE.botY - GATE.chanY + 19);
  });
  svg.innerHTML = s;

  const labels = $("gateLabels");
  const L = [];
  GATE.gearMap.forEach((pair, i) => {
    if (pair[0] !== null) L.push([String(pair[0]), i, GATE.topY - 28]);
    if (pair[1] !== null) L.push([String(pair[1]), i, GATE.botY + 28]);
  });
  labels.innerHTML = L.map(([txt, c, y]) =>
    `<span data-g="${txt}" style="left:${GATE.cols[c]}px;top:${y}px">${txt}</span>`).join("");
}

function gateGrind(on) {
  if (on === S.grinding) return;
  S.grinding = on;
  $("gate").classList.toggle("shake", on);
}

function setStick(x, y, animate) {
  GATE.x = x; GATE.y = y;
  const stick = $("stick");
  const lean = (x - 130) * 0.055;
  stick.style.transition = animate ? "transform 0.28s cubic-bezier(0.22, 1.4, 0.36, 1)" : "none";
  stick.style.transform = `translate(${x}px, ${y}px)`;
  stick.querySelector(".stick-rod").style.transform = `rotate(${lean}deg)`;
  const shadow = $("bootShadow");
  shadow.style.left = x + "px"; shadow.style.top = y + "px";
}

function setGear(g, silentClunk) {
  if (g === S.gear) return;
  S.gear = g;
  S.locked = false;
  if (!silentClunk) sfxShift(g === 0 ? 0.4 : 0.9);
  flashGear();
  document.querySelectorAll(".gate-labels span").forEach(el =>
    el.classList.toggle("on", String(g) === el.dataset.g));
}

/* ---- keyboard control of the H-gate (clutch mode) ---- */

function kbColIndex() {
  let ci = 0, best = 1e9;
  GATE.cols.forEach((cx, i) => {
    const d = Math.abs(GATE.x - cx);
    if (d < best) { best = d; ci = i; }
  });
  return ci;
}

/* arrows shift sequentially with the clutch held: ← one gear down, → one gear
   up (…R ← N ← 1 ⇄ 2 ⇄ 3…). The stick animates the real throw — release,
   cross the channel, engage — and grinds off the slot without the clutch. */
let kbSeqToken = 0;
function kbSeqGate(d) {
  if (S.mode !== "clutch" || GATE.dragging) return;
  const order = seqOrder();
  const i = order.indexOf(S.gear);
  const j = clamp(i + d, 0, order.length - 1);
  if (i === j) return;
  const target = order[j];

  if (target === 0) {                        // back to neutral — no clutch needed
    setGear(0, true);
    setStick(GATE.cols[kbColIndex()], GATE.chanY, true);
    sfxShift(0.3);
    return;
  }

  const ci = GATE.gearMap.findIndex(p => p.includes(target));
  const slot = GATE.gearMap[ci][0] === target ? 0 : 1;
  const clutchOK = !S.engineOn || S.clutchPedal > 0.55;
  const reverseOK = target !== "R" || Math.abs(S.v) < 1.6;

  if (!clutchOK || !reverseOK) {             // bounce off the slot — grind
    if (S.gear !== 0) setGear(0, true);
    gateGrind(true);
    setStick(GATE.cols[ci], GATE.chanY + (slot ? 1 : -1) * (GATE.chanHalf + 8), true);
    const seq = ++kbSeqToken;
    setTimeout(() => {
      gateGrind(false);
      if (kbSeqToken === seq && S.gear === 0 && !GATE.dragging)
        setStick(GATE.cols[kbColIndex()], GATE.chanY, true);
    }, 260);
    return;
  }

  if (S.gear !== 0) setGear(0, true);
  setStick(GATE.cols[ci], GATE.chanY, true); // stage 1: through the channel
  const seq = ++kbSeqToken;
  setTimeout(() => {                         // stage 2: into the slot
    if (kbSeqToken !== seq || S.mode !== "clutch" || GATE.dragging) return;
    setGear(target);
    setStick(GATE.cols[ci], slot === 0 ? GATE.topY : GATE.botY, true);
  }, 140);
}

function initShifter() {
  buildGateSvg();
  setStick(GATE.restX, GATE.chanY, false);

  const gate = $("gate"), stick = $("stick");
  let pid = null, offX = 0, offY = 0;

  const toLocal = (e) => {
    const r = gate.getBoundingClientRect();
    return [(e.clientX - r.left) * (260 / r.width), (e.clientY - r.top) * (300 / r.height)];
  };

  stick.addEventListener("pointerdown", (e) => {
    if (S.mode !== "clutch") return;
    pid = e.pointerId;
    stick.setPointerCapture(pid);
    stick.classList.add("grabbing");
    GATE.dragging = true;
    const [lx, ly] = toLocal(e);
    offX = lx - GATE.x; offY = ly - GATE.y;
    e.preventDefault();
  });

  stick.addEventListener("pointermove", (e) => {
    if (!GATE.dragging || e.pointerId !== pid) return;
    const [lx, ly] = toLocal(e);
    let x = clamp(lx - offX, GATE.cols[0], GATE.cols[3]);
    let y = clamp(ly - offY, GATE.topY, GATE.botY);

    const inChannel = Math.abs(y - GATE.chanY) <= GATE.chanHalf;
    let grind = false;

    if (inChannel) {
      y = clamp(y, GATE.chanY - GATE.chanHalf, GATE.chanY + GATE.chanHalf);
      if (S.gear !== 0) setGear(0, true);
    } else {
      // must be lined up with a column to leave the channel
      let ci = 0, best = 1e9;
      GATE.cols.forEach((cx, i) => { const d = Math.abs(x - cx); if (d < best) { best = d; ci = i; } });
      if (best > 20) {
        y = GATE.chanY + Math.sign(y - GATE.chanY) * GATE.chanHalf;
      } else {
        x = GATE.cols[ci];
        const dir = y < GATE.chanY ? 0 : 1;
        const target = GATE.gearMap[ci][dir];

        if (target === null) {
          y = GATE.chanY - GATE.chanHalf;                      // no 7th gear
        } else {
          const clutchOK = !S.engineOn || S.clutchPedal > 0.55;
          const reverseOK = target !== "R" || Math.abs(S.v) < 1.6;
          if (!clutchOK || !reverseOK) {
            // blocked at the mouth of the slot — grind
            y = GATE.chanY + Math.sign(y - GATE.chanY) * (GATE.chanHalf + 7 + Math.random() * 3);
            grind = true;
          } else {
            const engagedAt = dir === 0 ? GATE.topY + 26 : GATE.botY - 26;
            const inSlot = dir === 0 ? y < engagedAt : y > engagedAt;
            if (inSlot && S.gear !== target) setGear(target);
            else if (!inSlot && S.gear !== 0) setGear(0, true);
          }
        }
      }
    }
    gateGrind(grind);
    setStick(x, y, false);
  });

  const release = (e) => {
    if (!GATE.dragging || (pid !== null && e.pointerId !== pid)) return;
    GATE.dragging = false; pid = null;
    stick.classList.remove("grabbing");
    gateGrind(false);
    if (S.gear === 0) {
      setStick(GATE.restX, GATE.chanY, true);       // spring home
    } else {
      // snap crisply into the engaged slot
      let ci = 0; GATE.cols.forEach((cx, i) => { if (Math.abs(GATE.x - cx) < 12) ci = i; });
      const dir = GATE.y < GATE.chanY ? 0 : 1;
      setStick(GATE.cols[ci], dir === 0 ? GATE.topY : GATE.botY, true);
    }
  };
  stick.addEventListener("pointerup", release);
  stick.addEventListener("pointercancel", release);
}

/* ================================================================
   SEQUENTIAL SHIFTING (manual mode)
   ================================================================ */

/* shift order for the current box: R, N, then every forward gear */
function seqOrder() {
  const o = ["R", 0];
  for (let g = 1; g <= CAR.top; g++) o.push(g);
  return o;
}

function buildSeqViz() {
  const viz = $("seqViz");
  viz.innerHTML = seqOrder().map(g =>
    `<div class="seq-cell" data-g="${g}"><span>${g === 0 ? "N" : g}</span><span class="bar"></span></div>`).join("");
}

function seqHighlight() {
  document.querySelectorAll(".seq-cell").forEach(el =>
    el.classList.toggle("on", el.dataset.g === String(S.gear)));
}

function seqShift(dir) {
  if (S.mode !== "manual") return;
  const order = seqOrder();
  const i = order.indexOf(S.gear);
  const j = clamp(i + dir, 0, order.length - 1);
  if (i === j) return;
  const target = order[j];
  if (target === "R" && Math.abs(S.v) > 1.6) {      // refuse reverse at speed
    sfxClunk(0.3);
    return;
  }
  flashSeqKey(dir);
  const lag = CC.shiftLag || 0;
  if (lag > 0) {
    // race dog box: the paddle registers the command, then the dogs take a
    // beat to travel — ignition stays cut until the next ratio slams home
    if (S.pendShift) return;             // one command at a time through the box
    S.pendShift = true;
    const car = CC.id;
    sfxShift(0.75);                      // paddle in — command registered
    S.shiftCut = 0.18 + lag;
    setTimeout(() => {
      S.pendShift = false;
      if (CC.id !== car || S.mode !== "manual") return;
      sfxDogEngage(0.95);                // the dogs slam into the next ratio
      seqEngage(target, dir, true);
    }, lag * 1000);
    return;
  }
  S.shiftCut = 0.18;
  seqEngage(target, dir, false);
}

/* the moment the next ratio actually engages (immediate on road cars,
   shiftLag seconds after the paddle on a dog box) */
function seqEngage(target, dir, silent) {
  setGear(target, silent);
  if (dir < 0 && target !== 0 && target !== "R" && S.engineOn && Math.abs(S.v) > 3) {
    S.blip = 0.32; S.blipTarget = matchRpm(target); S.shiftCut = 0.26;    // heel-toe blip on the way down
    if (popsRating() >= 1) {             // the bark as the throttle stabs open
      sfxPop(0.5);
      if (popsRating() >= 2) popFlame(true);
    }
  }
  if (curEx().burble && S.engineOn && S.rpm > ENG.idle * 2)
    sfxCrackle(1.2);                     // anti-lag bang on every shift
  seqHighlight();
}

function flashSeqKey(dir) {
  const key = dir > 0 ? "E" : "Q";
  document.querySelectorAll(".seq-key").forEach(el => {
    if (el.textContent.includes(key)) {
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 180);
    }
  });
}

/* ================================================================
   UI — modes, themes, units, lamps, readouts
   ================================================================ */

/* exhaust flame flash, synced to pops */
function popFlame(big) {
  if (!(popsRating() > 0)) return;
  const el = $("tipL");                    // one side-exit pipe now
  if (el) {
    el.classList.toggle("big", big);
    el.classList.remove("fire"); void el.offsetWidth; el.classList.add("fire");
    setTimeout(() => el.classList.remove("fire"), 300);
  }
  if (big || Math.random() < 0.55) {
    const gl = $("fireglow");
    gl.classList.toggle("big", big);
    gl.classList.remove("on"); void gl.offsetWidth; gl.classList.add("on");
  }
}

/* one visible blade travel, in sync with sfxWiper */
function wiperSweep(dir) {
  const w = $("wiperBlade");
  if (!w) return;
  const a0 = dir > 0 ? -52 : 52, a1 = dir > 0 ? 52 : -52;
  w.style.transition = "none";
  w.style.transform = `rotate(${a0}deg)`;
  void w.offsetWidth;                       // reflow so the start angle sticks
  w.style.transition = "transform 0.32s linear";
  w.style.transform = `rotate(${a1}deg)`;
}

/* the rain-on-glass overlay only exists when you're inside, in the wet */
function updateWiper() {
  $("wiper").classList.toggle("on", S.rain && S.cabin);
}

function flashGear() {
  const el = $("gearChar");
  el.classList.remove("pop");
  void el.offsetWidth;
  el.classList.add("pop");
}

function gearLabel() {
  if (S.mode === "auto") {
    if (S.autoSel !== "D") return [S.autoSel, { P: "park", R: "reverse", N: "neutral" }[S.autoSel]];
    return ["D", "gear " + S.autoGear];
  }
  if (S.gear === 0) return ["N", "neutral"];
  if (S.gear === "R") return ["R", "reverse"];
  return [String(S.gear), "gear"];
}

function setMode(mode) {
  S.mode = mode;
  S.gear = 0; S.autoSel = "P"; S.autoGear = 1; S.locked = false;
  S.in.clutch = 0;

  document.querySelectorAll(".mode-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.mode === mode);
    b.setAttribute("aria-selected", b.dataset.mode === mode);
  });
  requestAnimationFrame(positionGlider);

  $("gateWrap").style.display = mode === "clutch" ? "" : "none";
  $("seqPanel").style.display = mode === "manual" ? "" : "none";
  $("autoPanel").style.display = mode === "auto" ? "" : "none";
  $("pgClutch").classList.toggle("hidden", mode !== "clutch");

  $("consoleTitle").textContent =
    { auto: "SELECTOR", manual: "SEQUENTIAL BOX", clutch: CAR.top + "-SPEED GATE" }[mode];
  $("consoleHint").innerHTML =
    { auto: "P · R · N · D", manual: "clutchless — revs are matched for you",
      clutch: "hold <kbd>SPACE</kbd> · <kbd>←</kbd> gear down · <kbd>→</kbd> gear up" }[mode];
  $("bayModeNote").innerHTML =
    { auto: "Two pedals. Select <b>D</b> and go.",
      manual: "Shift with <kbd>Q</kbd>/<kbd>E</kbd> — no clutch needed.",
      clutch: "Clutch in (<kbd>SPACE</kbd>), <kbd>←</kbd>/<kbd>→</kbd> to shift (or drag the stick), then let the clutch out — it feathers the bite for you." }[mode];

  if (mode === "clutch") setStick(GATE.restX, GATE.chanY, false);
  if (mode === "manual") seqHighlight();
  document.querySelectorAll(".prnd button").forEach(b =>
    b.classList.toggle("on", b.dataset.sel === S.autoSel));
  document.querySelectorAll(".gate-labels span").forEach(el => el.classList.remove("on"));
  save();
}

function positionGlider() {
  const active = document.querySelector(".mode-btn.active");
  if (!active) return;
  const g = $("modeGlider");
  g.style.width = active.offsetWidth + "px";
  g.style.transform = `translateX(${active.offsetLeft - 4}px)`;
}

/* ---------------- garage ---------------- */

const ASP_LABEL = { na: "NA", turbo: "TURBO", super: "S/C", hybrid: "HYBRID", ev: "EV" };

function buildGarage() {
  $("garage").innerHTML = CARS.map(c => `
    <button class="car-chip${c.custom ? " car-custom" : ""}" data-car="${c.id}">
      <span class="cc-name">${esc(c.name)}</span>
      <span class="cc-meta">${esc(c.layout)} · ${esc(c.tag)}</span>
      <span class="cc-badges">
        <i>${(c.max / 1000).toFixed(1)}k rpm</i>
        <i class="asp">${esc(c.badge || ASP_LABEL[c.asp])}</i>
        ${c.custom ? '<i class="custom">CUSTOM</i>' : ""}
      </span>
      ${c.custom ? `<span class="cc-edit" data-edit="${c.id}" title="Edit build" role="button" aria-label="Edit build">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
      </span>` : ""}
    </button>`).join("") + `
    <button class="car-chip car-add car-soon" id="carAdd" title="Design your own — coming soon" disabled>
      <span class="cc-add-plus">+</span>
      <span class="cc-add-label">Build<br>your own</span>
      <span class="cc-soon">COMING SOON</span>
    </button>`;
  document.querySelectorAll(".car-chip[data-car]").forEach(b =>
    b.addEventListener("click", () => selectCar(b.dataset.car)));
  // the design studio is parked for now — the + card is inert, and the edit
  // pencil on saved builds is hidden until it returns (the cars still drive)
  document.querySelectorAll(".cc-edit").forEach(e => { e.style.display = "none"; });
}

// escape user-supplied strings before they hit innerHTML
function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function selectCar(id) {
  const car = CARS.find(c => c.id === id) || CARS[1];
  CC = car;
  S.capOpen = false;                     // new car arrives with the cover down
  applyCar(car);

  // full reset — new car arrives parked, engine off
  S.crankSeq = (S.crankSeq || 0) + 1;
  S.cranking = false; S.engineOn = false; S.stalled = false;
  S.acc = false; S.capOpen = false;
  S.powered = false; S.eDrive = "gas";
  S.rpm = 0; S.v = 0; S.boost = 0; S.locked = false;
  S.seqStage = 0; S._seqPrev = 0;
  armCel();
  S.gear = 0; S.autoSel = "P"; S.autoGear = 1;
  S.shiftCut = 0; S.shiftCool = 0; S.cutTimer = 0; S.blip = 0; S.catchT = 0; S.sweep = -1;
  S.pendShift = false;
  S.spinV = 0; S.lockup = false;
  S.needle.rpm = 0; S.needle.rpmV = 0; S.needle.spd = 0; S.needle.spdV = 0;

  $("ignition").classList.remove("cranking");
  updateRunLamp();
  $("stallOverlay").classList.remove("show");
  $("lampStall").classList.remove("lit", "blink");
  document.querySelectorAll(".prnd button").forEach(b =>
    b.classList.toggle("on", b.dataset.sel === "P"));
  document.querySelectorAll(".gate-labels span").forEach(el => el.classList.remove("on"));
  // the box itself changed — rebuild the gate and sequential ladder
  buildGateSvg();
  buildSeqViz();
  if (S.mode === "clutch") {
    $("consoleTitle").textContent = CAR.top + "-SPEED GATE";
    setStick(GATE.restX, GATE.chanY, false);
  }
  if (S.mode === "manual") seqHighlight();
  flashGear();

  $("boostWrap").classList.toggle("hide", car.asp === "na" || car.asp === "ev" || car.edrive);
  $("boostWrap").querySelector("label").textContent =
    car.asp === "hybrid" ? "E-BOOST %" : "BOOST PSI";
  updateEdriveUi();
  $("shiftLights").classList.toggle("show", !!car.shiftLights);
  document.querySelectorAll(".car-chip").forEach(b =>
    b.classList.toggle("on", b.dataset.car === car.id));

  tachG.rebuild(); speedG.rebuild();
  if (AU.ready) buildEngineVoice(car);
  refreshWorkshop();
  if (LT.phase !== "off") {                // new car: re-arm the sprint clock
    LT.phase = "hold"; LT.disp = 0;
    $("ltimer").classList.remove("done");
    $("ltBig").classList.remove("golive");
    ltShowBest();
  }
  save();
}

/* ---------------- design studio (build your own car) ---------------- */

// segmented-control helpers (buttons carry data-v)
function segVal(id) { const e = $(id).querySelector(".seg-on"); return e ? e.dataset.v : null; }
function segSet(id, v) {
  $(id).querySelectorAll("button").forEach(b => b.classList.toggle("seg-on", b.dataset.v === v));
}

let stEditId = null;   // id being edited, or null for a fresh build

/* ---- gearbox editor ---- */
const GEAR_DEFAULTS = {
  4: [3.2, 1.9, 1.3, 0.95],
  5: [3.4, 2.1, 1.5, 1.15, 0.9],
  6: [3.6, 2.15, 1.56, 1.21, 0.99, 0.85],
};

// render one slider per gear; taller = longer legs, shorter = quicker
function stRenderGears(count, ratios) {
  const wrap = $("stGears");
  wrap.innerHTML = "";
  for (let g = 1; g <= count; g++) {
    const v = (ratios && ratios[g]) || GEAR_DEFAULTS[count][g - 1];
    const row = document.createElement("div");
    row.className = "ws-pitch st-gear-row";
    row.innerHTML = `
      <div class="ws-pitch-head">
        <label><span class="st-gear-tag">${g}</span>${ordinal(g)} gear</label>
        <span class="mono" id="stGearVal${g}">${v.toFixed(2)}</span>
      </div>
      <input type="range" id="stGear${g}" min="0.6" max="4" step="0.01" value="${v}">
      <div class="ws-pitch-scale"><span>tall · fast</span><span>short · quick</span></div>`;
    wrap.appendChild(row);
    const inp = row.querySelector("input");
    // sliders read left→right as tall(0.6)→short(4); flip so "short·quick" is right
    inp.addEventListener("input", () => {
      $("stGearVal" + g).textContent = parseFloat(inp.value).toFixed(2);
    });
  }
}

function ordinal(n) { return n + (["th", "st", "nd", "rd"][n % 10] || "th"); }

function stReadGears(count) {
  const r = { R: -3.5 };
  for (let g = 1; g <= count; g++) r[g] = parseFloat($("stGear" + g).value);
  return r;
}

function stShowGearbox(show) {
  ["stGearHdr", "stGearCountRow", "stGears"].forEach(id => $(id).style.display = show ? "" : "none");
  document.querySelector(".st-gear-note").style.display = show ? "" : "none";
}

/* =========== live animated engine in the studio =========== */
const EVIZ = {
  cvs: null, ctx: null, raf: 0, running: false, revving: false,
  rpm: 900, idle: 900, redline: 7500, cyl: 4, revScale: 1, accent: "#e0a144",
  ev: false, last: 0, osc: null, og: null, olp: null,

  init() {
    this.cvs = $("stEngine"); this.ctx = this.cvs.getContext("2d");
  },
  config(o) { Object.assign(this, o); if (!this.revving) this.rpm = Math.max(this.rpm, this.idle); },
  setAccent(hex) { this.accent = hex; },

  start() {
    if (!this.ctx) this.init();
    this.running = true; this.rpm = this.idle; this.last = performance.now();
    cancelAnimationFrame(this.raf);
    const loop = (t) => { if (!this.running) return; this.tick(t); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  },
  stop() {
    this.running = false; this.revving = false;
    cancelAnimationFrame(this.raf);
    if (this.og) this.og.gain.setTargetAtTime(0, AU.ctx.currentTime, 0.05);
  },

  tick(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const span = Math.max(1200, this.redline - this.idle);
    if (this.revving) this.rpm += span * this.revScale * dt;      // climb rate = rev-speed knob
    else this.rpm -= span * 1.8 * dt;                             // engine braking back to idle
    this.rpm = clamp(this.rpm, this.idle, this.redline);
    this.draw();
    this.sound();
    $("stEngRpm").textContent = Math.round(this.rpm / 50) * 50;
  },

  sound() {
    if (!AU.ready) return;
    if (!this.osc) {
      const c = AU.ctx;
      this.osc = c.createOscillator(); this.osc.type = "sawtooth";
      this.olp = c.createBiquadFilter(); this.olp.type = "lowpass"; this.olp.frequency.value = 1400;
      this.og = c.createGain(); this.og.gain.value = 0;
      this.osc.connect(this.olp); this.olp.connect(this.og); this.og.connect(AU.master);
      this.osc.start();
    }
    const t = AU.ctx.currentTime;
    const f0 = this.ev ? 120 + this.rpm * 0.05
                       : (this.rpm / 60) * (this.cyl / 2) * 0.5;
    this.osc.frequency.setTargetAtTime(clamp(f0, 30, 4000), t, 0.03);
    this.olp.frequency.setTargetAtTime(400 + this.rpm * 0.3, t, 0.03);
    const rFrac = (this.rpm - this.idle) / Math.max(1, this.redline - this.idle);
    // silent at rest; voices only while it's actually spinning up or winding down
    const audible = this.revving || this.rpm > this.idle + 40;
    this.og.gain.setTargetAtTime(audible ? 0.02 + rFrac * 0.06 : 0, t, 0.05);
  },

  draw() {
    const ctx = this.ctx, W = this.cvs.width, H = this.cvs.height;
    ctx.clearRect(0, 0, W, H);
    const n = Math.min(12, Math.max(1, this.cyl));
    const rFrac = (this.rpm - this.idle) / Math.max(1, this.redline - this.idle);
    const crankY = H * 0.72, spread = W * 0.86, x0 = (W - spread) / 2;
    const step = n > 1 ? spread / (n - 1) : 0;
    const cx0 = n > 1 ? x0 : W / 2;
    const throw_ = H * 0.12, rodLen = H * 0.36, bore = Math.min(46, spread / n * 0.62);
    const phase = this.phase || 0;
    // visual crank speed: slow at idle, fast (but watchable) at redline
    const spinHz = 0.7 + rFrac * 7;
    this.phase = phase + spinHz * 2 * Math.PI * (1 / 60);

    // crankcase
    ctx.fillStyle = "#141821";
    roundRectPath(ctx, x0 - bore * 0.7, crankY - throw_ - 6, spread + bore * 1.4, H * 0.24, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 2; ctx.stroke();

    for (let i = 0; i < n; i++) {
      const cx = cx0 + step * i;
      const a = this.phase + i * (Math.PI * 2 / n);
      const pinX = cx + throw_ * Math.sin(a);
      const pinY = crankY - throw_ * Math.cos(a);
      const dx = throw_ * Math.sin(a);
      const pistonY = pinY - Math.sqrt(Math.max(0, rodLen * rodLen - dx * dx));
      const boreTop = crankY - throw_ - rodLen - bore * 0.7;
      const fire = Math.cos(a) > 0.86;           // near TDC

      // cylinder bore
      ctx.fillStyle = "#0c0f15";
      roundRectPath(ctx, cx - bore / 2, boreTop, bore, crankY - boreTop, 6);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1.5; ctx.stroke();

      // combustion flash
      if (fire && !this.ev) {
        const gl = ctx.createRadialGradient(cx, pistonY - bore * 0.4, 1, cx, pistonY - bore * 0.4, bore);
        gl.addColorStop(0, hexA(this.accent, 0.9)); gl.addColorStop(1, hexA(this.accent, 0));
        ctx.fillStyle = gl;
        ctx.fillRect(cx - bore, boreTop, bore * 2, bore * 1.4);
      }

      // connecting rod
      ctx.strokeStyle = "#5b6472"; ctx.lineWidth = Math.max(4, bore * 0.16);
      ctx.beginPath(); ctx.moveTo(cx, pistonY); ctx.lineTo(pinX, pinY); ctx.stroke();

      // piston
      const pg = ctx.createLinearGradient(0, pistonY - bore * 0.45, 0, pistonY + bore * 0.45);
      pg.addColorStop(0, "#dfe4ec"); pg.addColorStop(0.5, "#9aa2b0"); pg.addColorStop(1, "#5c6472");
      ctx.fillStyle = pg;
      roundRectPath(ctx, cx - bore * 0.44, pistonY - bore * 0.42, bore * 0.88, bore * 0.7, 4);
      ctx.fill();

      // crank pin
      ctx.fillStyle = this.accent;
      ctx.beginPath(); ctx.arc(pinX, pinY, Math.max(3, bore * 0.11), 0, Math.PI * 2); ctx.fill();
    }

    // crank main axis line + spinning flywheel at the right
    ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0 - bore, crankY); ctx.lineTo(x0 + spread + bore, crankY); ctx.stroke();
    const fx = x0 + spread + bore * 0.9, fr = H * 0.13;
    ctx.fillStyle = "#20252f";
    ctx.beginPath(); ctx.arc(fx, crankY, fr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = this.accent; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(fx, crankY, fr, 0, Math.PI * 2); ctx.stroke();
    ctx.save(); ctx.translate(fx, crankY); ctx.rotate(this.phase);
    ctx.strokeStyle = this.accent; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(fr * 0.85, 0); ctx.stroke();
    ctx.restore();
  },
};

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// pull the studio's live engine settings into the viz
function stSyncEngine() {
  const ev = segVal("stAsp") === "ev";
  EVIZ.config({
    cyl: parseInt(segVal("stCyl"), 10) || 4,
    idle: ev ? 400 : parseInt($("stIdle").value, 10),
    redline: ev ? 16000 : parseInt($("stRed").value, 10),
    revScale: parseFloat($("stRev").value),
    ev,
  });
}

/* torque curve from a redline + a power scalar. Knots are fixed fractions of
   the redline so the rpm axis is always strictly ascending (torqueAt needs it) */
function buildCustomCurve(idle, max, power, ev) {
  const T = 130 * power;
  if (ev) return [[0, T * 1.2], [max * 0.4, T * 1.1], [max * 0.7, T * 0.82],
                  [max, T * 0.5], [max + 800, T * 0.28]];
  return [[0, T * 0.42], [max * 0.12, T * 0.62], [max * 0.35, T * 0.9],
          [max * 0.62, T], [max * 0.85, T * 0.94], [max, T * 0.78], [max + 600, T * 0.5]];
}

/* synthesized voice from cylinder count + voice/character sliders */
function buildCustomSound(cyl, voice, char, ev) {
  if (ev) return {
    layers: [["sine", 6, 0.05, 0.2], ["sine", 9.02, 0.02, 0.12],
             ["triangle", 3.01, 0.06, 0.1], ["sine", 1.5, 0.1, 0.06]],
    f0Mul: voice, noiseMul: 0.35, drive: 0.3, pulseDepth: 0.02, raspMul: 0.15,
    volTrim: 0.7, scream: 1500,
  };
  const rotary = cyl <= 2;
  const layers = [
    ["sawtooth", 1, 0.5],
    ["square", 0.5, 0.22 + (cyl <= 4 ? 0.12 : 0)],
    ["sawtooth", 2.02, 0.14 + char * 0.22],
    ["triangle", 3.03, 0.05 + char * 0.14],
  ];
  if (cyl >= 8) layers.unshift(["sine", 0.25, 0.13]);
  if (cyl >= 6) layers.push(["sawtooth", 4.5, 0.0, 0.16]);
  return {
    layers, f0Mul: voice,
    noiseMul: 0.8 + char * 0.6,
    drive: 0.5 + char * 0.14,
    raspMul: 0.8 + char * 0.7,
    pulseDepth: rotary ? 0.5 : clamp(0.32 - cyl * 0.02, 0.08, 0.3),
    pulseDiv: rotary ? 1 : 1,
    pulseType: rotary ? "square" : "sawtooth",
    scream: 700 + (0.4 + char * 1.4) * 1400 + (cyl >= 6 ? 1000 : 0),
    volTrim: 1, jitter: rotary ? 1.5 : 1,
  };
}

/* assemble a full car object from studio params */
function makeCustomCar(p, id) {
  const ev = p.asp === "ev";
  const max = ev ? Math.max(p.red, 12000) : p.red;
  const cut = max + (ev ? 400 : 250);
  const idle = ev ? 0 : p.idle;
  const layout = ev ? "ELECTRIC"
    : (cyl => (cyl === 1 ? "single" : cyl <= 6 ? "I" + cyl : "V" + cyl))(p.cyl)
      + (p.asp === "turbo" ? " · TURBO" : p.asp === "super" ? " · S/C" : "");
  const kmhMax = Math.round(clamp(150 + p.power * 120 + max / 90, 120, 540) / 10) * 10;
  const car = {
    id, name: p.name, tag: "custom build", layout, custom: true,
    cyl: p.cyl, idle, max, cut,
    inertia: ev ? 0.14 : clamp(0.16 + p.cyl * 0.024, 0.16, 0.5),
    curve: buildCustomCurve(idle, max, p.power, ev),
    mass: Math.round(clamp(1400 - p.power * 130 + p.cyl * 22, 900, 2000)),
    finalDrive: ev ? 4.0 : clamp(4.6 - p.power * 0.55, 2.6, 4.8),
    clutchCap: Math.round(clamp(260 + p.power * 380, 120, 2600)),
    cdA: 0.6, brakeMax: Math.round(clamp(10000 + p.power * 2500, 9000, 16000)),
    grip: clamp(1 + p.power * 0.35, 1, 2),
    asp: p.asp, pops: ev ? 0 : p.pops,
    tachMax: ev ? 19 : Math.max(6, Math.ceil((max + 300) / 1000)),
    redK: ev ? 18 : +(max / 1000 * 0.97).toFixed(1),
    kmhMax, mphMax: Math.round(kmhMax / 1.609 / 10) * 10,
    dial: p.dial,
    sound: buildCustomSound(p.cyl, p.voice, p.char, ev),
    dash: { accent: p.accent, face: p.face, dial: p.dial },
    revRate: p.rev,
    shiftLights: max >= 8500,
  };
  car.ratios = ev ? { R: -1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 }
                  : (p.ratios || DEFAULT_RATIOS);
  if (p.asp === "turbo") {
    Object.assign(car, {
      boostMax: clamp(0.7 + p.power * 0.5, 0.6, 2.4), spool: 2600, spoolRate: 2.0,
      psiMax: Math.round(clamp(16 + p.power * 14, 12, 45)), whistleMul: 1.4,
      turboChop: 0.5, turboBreath: 1.2, breathHz: 1200,
    });
  } else if (p.asp === "super") {
    Object.assign(car, { boostMax: 0.35, whineMult: 8.5, psiMax: 9 });
  } else if (ev) {
    car.ev = true;
  }
  return car;
}

/* reflect the studio's live values into the little readouts */
function stRefreshLabels() {
  $("stIdleVal").textContent = (+$("stIdle").value).toLocaleString() + " rpm";
  $("stRedVal").textContent = (+$("stRed").value).toLocaleString() + " rpm";
  const v = +$("stVoice").value;
  $("stVoiceVal").textContent = v === 1 ? "stock"
    : (v < 1 ? "deep −" : "bright +") + Math.round(Math.abs(v - 1) * 100) + "%";
  $("stPowerVal").textContent = "×" + (+$("stPower").value).toFixed(1);
  const c = +$("stChar").value;
  $("stCharVal").textContent = c < 0.34 ? "silky" : c > 0.66 ? "gravelly" : "balanced";
  const pp = +$("stPops").value;
  $("stPopsVal").textContent = pp === 0 ? "none" : pp < 1.2 ? "some" : pp < 2.2 ? "lots" : "warzone";
  $("stRevVal").textContent = fmtRev(+$("stRev").value);
  const ev = segVal("stAsp") === "ev";
  ["stIdle", "stChar", "stPops", "stCyl"].forEach(id => {
    $(id).closest(".ws-pitch").style.opacity = ev ? 0.4 : 1;
  });
  stShowGearbox(!ev);                 // electrics are single-speed
  stSyncEngine();                     // keep the live engine in step
}

function stAccentSet(hex) {
  segSet("stAccent", hex);
  $("stAccentPick").value = hex;
  document.body.style.setProperty("--accent", hex);          // instant preview of the accent
  document.body.style.setProperty("--accent-soft", hexA(hex, 0.16));
  document.body.style.setProperty("--accent-glow", hexA(hex, 0.45));
  $("stAccentVal").textContent = hex;
  EVIZ.setAccent(hex);
}

function buildStudio() {
  // segmented groups: one-of selection
  ["stCyl", "stAsp", "stDial", "stFace"].forEach(id =>
    $(id).querySelectorAll("button").forEach(b =>
      b.addEventListener("click", () => { segSet(id, b.dataset.v); stRefreshLabels(); })));
  // accent presets + freeform picker
  $("stAccent").querySelectorAll("button").forEach(b =>
    b.addEventListener("click", () => stAccentSet(b.dataset.v)));
  $("stAccentPick").addEventListener("input", () => stAccentSet($("stAccentPick").value));
  // live labels
  ["stIdle", "stRed", "stVoice", "stPower", "stChar", "stPops", "stRev"].forEach(id =>
    $(id).addEventListener("input", stRefreshLabels));
  // gearbox: changing gear count re-renders the per-gear sliders
  $("stGearCount").querySelectorAll("button").forEach(b =>
    b.addEventListener("click", () => {
      segSet("stGearCount", b.dataset.v);
      stRenderGears(parseInt(b.dataset.v, 10));
    }));
  // hold-to-rev on the live engine (pointer + keyboard)
  const rev = $("stRevBtn"), on = (e) => { e && e.preventDefault(); revPreview(true); },
        off = () => revPreview(false);
  rev.addEventListener("pointerdown", on);
  rev.addEventListener("pointerup", off);
  rev.addEventListener("pointerleave", off);
  rev.addEventListener("pointercancel", off);
  $("stSave").addEventListener("click", saveStudio);
  $("stDelete").addEventListener("click", deleteStudio);
  $("stClose").addEventListener("click", closeStudio);
  $("studio").addEventListener("click", (e) => { if (e.target === $("studio")) closeStudio(); });
}

function revPreview(down) {
  if (down) { initAudio(); if (AU.ctx && AU.ctx.state === "suspended") AU.ctx.resume(); }
  EVIZ.revving = down;
  $("stRevBtn").classList.toggle("revving", down);
}

const STUDIO_DEFAULTS = {
  name: "", cyl: "4", asp: "na", idle: 900, red: 7500, voice: 1, rev: 1,
  power: 1, char: 0.5, pops: 1, gearCount: 6, ratios: null,
  dial: "sport", face: "dark", accent: "#e0a144",
};

function openStudio(editId) {
  stEditId = editId || null;
  const src = editId ? CARS.find(c => c.id === editId) : null;
  const g = src ? studioFromCar(src) : STUDIO_DEFAULTS;

  $("stName").value = g.name;
  segSet("stCyl", String(g.cyl));
  segSet("stAsp", g.asp);
  segSet("stDial", g.dial);
  segSet("stFace", g.face);
  segSet("stGearCount", String(g.gearCount));
  stRenderGears(g.gearCount, g.ratios);
  $("stIdle").value = g.idle; $("stRed").value = g.red; $("stVoice").value = g.voice;
  $("stRev").value = g.rev;
  $("stPower").value = g.power; $("stChar").value = g.char; $("stPops").value = g.pops;
  stAccentSet(g.accent);
  stRefreshLabels();

  $("stTitle").textContent = editId ? "EDIT BUILD" : "DESIGN STUDIO";
  $("stSaveLabel").textContent = editId ? "SAVE & DRIVE" : "BUILD & DRIVE";
  $("stDelete").classList.toggle("show", !!editId);

  $("studio").classList.add("open");
  EVIZ.start();
  setTimeout(() => $("stName").focus(), 60);
}

/* recover editable params from a saved custom car */
function studioFromCar(c) {
  const d = (c.dash || {});
  const gc = c.ratios ? gearCount(c.ratios) : 6;
  return {
    name: c.name, cyl: c.cyl, asp: c.asp,
    idle: c.idle || 900, red: c.asp === "ev" ? 7500 : c.max,
    voice: (c.sound && c.sound.f0Mul) || 1, rev: c.revRate || 1,
    power: c._power || 1, char: c._char != null ? c._char : 0.5,
    pops: c.pops || 0, gearCount: gc, ratios: c.ratios || null,
    dial: c.dial || "sport", face: d.face || "dark", accent: d.accent || "#e0a144",
  };
}

function closeStudio() {
  $("studio").classList.remove("open");
  EVIZ.stop();
  applyDash(CC);                     // undo any live accent preview
  requestAnimationFrame(() => { if (tachG) { tachG.rebuild(); speedG.rebuild(); } });
}

function readStudio() {
  const ev = segVal("stAsp") === "ev";
  let name = $("stName").value.trim();
  if (!name) name = ev ? "Custom EV" : "Custom Build";
  const gc = parseInt(segVal("stGearCount"), 10) || 6;
  return {
    name: name.slice(0, 22),
    cyl: parseInt(segVal("stCyl"), 10) || 4,
    asp: segVal("stAsp") || "na",
    idle: parseInt($("stIdle").value, 10),
    red: parseInt($("stRed").value, 10),
    voice: parseFloat($("stVoice").value),
    rev: parseFloat($("stRev").value),
    power: parseFloat($("stPower").value),
    char: parseFloat($("stChar").value),
    pops: parseFloat($("stPops").value),
    ratios: ev ? null : stReadGears(gc),
    dial: segVal("stDial") || "sport",
    face: segVal("stFace") || "dark",
    accent: $("stAccentPick").value,
  };
}

function saveStudio() {
  const p = readStudio();
  const id = stEditId || ("custom-" + Date.now().toString(36));
  const car = makeCustomCar(p, id);
  car._power = p.power; car._char = p.char;    // stash so edits round-trip cleanly
  const i = CARS.findIndex(c => c.id === id);
  if (i >= 0) CARS[i] = car; else CARS.push(car);
  saveCustomCars();
  buildGarage();
  EVIZ.stop();
  $("studio").classList.remove("open");
  selectCar(id);
  sfxClunk(0.6);
}

function deleteStudio() {
  if (!stEditId) return closeStudio();
  const i = CARS.findIndex(c => c.id === stEditId);
  if (i >= 0) CARS.splice(i, 1);
  saveCustomCars();
  const fallback = CC.id === stEditId ? CARS[1].id : CC.id;
  buildGarage();
  EVIZ.stop();
  $("studio").classList.remove("open");
  selectCar(fallback);
}

function saveCustomCars() {
  try { localStorage.setItem("dwnshift-custom",
    JSON.stringify(CARS.filter(c => c.custom))); } catch (_) {}
}

function loadCustomCars() {
  try {
    const arr = JSON.parse(localStorage.getItem("dwnshift-custom")) || [];
    for (const c of arr) if (c && c.id && !CARS.some(x => x.id === c.id)) CARS.push(c);
  } catch (_) {}
}

/* ---------------- workshop screen ---------------- */

function buildWorkshop() {
  $("wsExhausts").innerHTML = Object.entries(EXHAUSTS).map(([id, e]) => `
    <button class="ws-card" data-ex="${id}">
      <span class="ws-card-name">${e.name}</span>
      <span class="ws-card-desc">${e.desc}</span>
    </button>`).join("");
  document.querySelectorAll("#wsExhausts .ws-card").forEach(b =>
    b.addEventListener("click", () => {
      curMod().ex = b.dataset.ex;
      refreshWorkshop();
      applyFormants();
      sfxClunk(0.5);
      save();
    }));
  document.querySelectorAll("#wsShift .ws-card").forEach(b =>
    b.addEventListener("click", () => {
      curMod().shift = b.dataset.shift;
      refreshWorkshop();
      const s = b.dataset.shift;           // audition the new feel right away
      if (s === "click") sfxShiftClick(0.9);
      else if (s === "metal") sfxShiftMetal(0.9);
      else sfxClunk(0.9);
      save();
    }));
  document.querySelectorAll("#wsPaddle .ws-card").forEach(b =>
    b.addEventListener("click", () => {
      curMod().paddle = b.dataset.paddle;
      refreshWorkshop();
      const p = b.dataset.paddle;          // audition
      if (p === "mech") sfxPaddleMech(0.9);
      else if (p === "metal") sfxPaddleMetal(0.9);
      else if (p === "carbon") sfxPaddleReal(0.9);
      /* stock auditions as it drives: silence */
      save();
    }));
  $("wsPitch").addEventListener("input", () => {
    curMod().pitch = parseFloat($("wsPitch").value);
    $("wsPitchVal").textContent = fmtPitch();
    save();
  });
  $("wsVol").addEventListener("input", () => {
    curMod().vol = parseFloat($("wsVol").value);
    $("wsVolVal").textContent = fmtVol();
    save();
  });
  $("wsTone").addEventListener("input", () => {
    curMod().tone = parseInt($("wsTone").value, 10);
    $("wsToneVal").textContent = fmtTone();
    save();
  });
  $("wsPop").addEventListener("input", () => {
    curMod().pop = parseFloat($("wsPop").value);
    $("wsPopVal").textContent = fmtPop();
    save();
  });
  $("wsGear").addEventListener("input", () => {
    curMod().gear = parseFloat($("wsGear").value);
    applyCar(CC);
    $("wsGearVal").textContent = CAR.finalDrive.toFixed(2);
    save();
  });
  $("wsRev").addEventListener("input", () => {
    curMod().rev = parseFloat($("wsRev").value);
    applyCar(CC);
    $("wsRevVal").textContent = fmtRev(curMod().rev);
    save();
  });
  $("wsTune").addEventListener("click", () => {
    curMod().tune = !curMod().tune;
    applyCar(CC);
    refreshWorkshop();
    sfxClunk(0.6);
    save();
  });
  $("wsAids").addEventListener("click", () => {
    curMod().abs = curMod().abs === false;
    S.spinV = 0; S.lockup = false;
    refreshWorkshop();
    sfxClunk(0.4);
    save();
  });
  $("wsLtTgt").addEventListener("input", () => {
    S.ltTgt[S.units] = parseInt($("wsLtTgt").value, 10);
    $("wsLtVal").textContent = ltLabel();
    save();
  });
  $("wsLtGo").addEventListener("click", openLaunch);
  $("ltClose").addEventListener("click", closeLaunch);
  $("ltAgain").addEventListener("click", () => {
    LT.phase = "hold"; LT.disp = 0;
    $("ltimer").classList.remove("done");
    $("ltBig").classList.remove("golive");
  });
  $("wsClose").addEventListener("click", closeWorkshop);
  $("workshop").addEventListener("click", (e) => {
    if (e.target === $("workshop")) closeWorkshop();
  });
  $("modBtn").addEventListener("click", openWorkshop);
}

function fmtPitch() {
  const p = Math.round((curMod().pitch - 1) * 100);
  return (p >= 0 ? "+" : "") + p + "%";
}
function fmtVol() {
  const p = Math.round((curMod().vol - 1) * 100);
  return (p >= 0 ? "+" : "") + p + "%";
}
function fmtTone() {
  const v = curMod().tone;
  return v === 0 ? "stock" : (v > 0 ? "+" : "") + v + " Hz";
}
function fmtPop() { return "×" + curMod().pop.toFixed(1); }
function fmtRev(r) {
  if (Math.abs(r - 1) < 0.001) return "stock";
  const p = Math.round((r - 1) * 100);
  return (p >= 0 ? "+" : "") + p + "%";
}

function refreshWorkshop() {
  $("wsCar").textContent = CC.name;
  document.querySelectorAll("#wsExhausts .ws-card").forEach(b =>
    b.classList.toggle("on", b.dataset.ex === curMod().ex));
  document.querySelectorAll("#wsShift .ws-card").forEach(b =>
    b.classList.toggle("on", b.dataset.shift === curMod().shift));
  document.querySelectorAll("#wsPaddle .ws-card").forEach(b =>
    b.classList.toggle("on", b.dataset.paddle === curMod().paddle));
  $("cabinBtn").classList.toggle("on", S.cabin);
  $("trafBtn").classList.toggle("on", S.traffic);
  $("rainBtn").classList.toggle("on", S.rain);
  $("wsPitch").value = curMod().pitch;
  $("wsPitchVal").textContent = fmtPitch();
  $("wsVol").value = curMod().vol;
  $("wsVolVal").textContent = fmtVol();
  $("wsTone").value = curMod().tone;
  $("wsToneVal").textContent = fmtTone();
  $("wsPop").value = curMod().pop;
  $("wsPopVal").textContent = fmtPop();
  $("exhaust").dataset.look = curEx().look || "stock";   // tips match the system
  $("wsGear").value = curMod().gear;
  $("wsGearVal").textContent = (CC.finalDrive * curMod().gear).toFixed(2);
  $("wsRev").value = curMod().rev;
  $("wsRevVal").textContent = fmtRev(curMod().rev);
  const lt = $("wsLtTgt");                 // slider range follows the unit system
  lt.min = S.units === "kmh" ? 30 : 20;
  lt.max = S.units === "kmh" ? 300 : 190;
  lt.step = S.units === "kmh" ? 10 : 5;
  lt.value = S.ltTgt[S.units];
  $("wsLtVal").textContent = ltLabel();
  $("wsTune").classList.toggle("on", curMod().tune);
  const aidsOn = curMod().abs !== false;
  $("wsAids").classList.toggle("on", aidsOn);
  $("wsAids").querySelector(".ws-card-name").textContent =
    "DRIVER AIDS — " + (aidsOn ? "ON" : "OFF");
  $("modBtn").classList.toggle("on",
    curMod().ex !== "stock" || curMod().pitch !== 1 || curMod().gear !== 1 ||
    curMod().vol !== 1 || curMod().tone !== 0 || curMod().pop !== 1 ||
    curMod().rev !== 1 || curMod().tune || !aidsOn || curMod().shift !== "stock" ||
    curMod().paddle !== "stock");
}

function openWorkshop() { refreshWorkshop(); $("workshop").classList.add("open"); }
function closeWorkshop() { $("workshop").classList.remove("open"); }

/* ---------------- launch timer (0–60 / custom sprint) ---------------- */

const LT = { phase: "off", t: 0, disp: 0, time: 0, best: {} };
const UNIT_MS = { kmh: 3.6, mph: 2.237 };        // m/s → display units

function ltUnit() { return S.units === "kmh" ? "km/h" : "mph"; }
function ltKey() { return CC.id + "|" + S.units + "|" + S.ltTgt[S.units]; }
function ltLabel() { return "0–" + S.ltTgt[S.units] + " " + ltUnit(); }

function ltShowBest() {
  const b = LT.best[ltKey()];
  $("ltBest").textContent = b ? "best " + b.toFixed(2) + "s" : "best —";
}

function openLaunch() {
  initAudio();
  if (AU.ctx && AU.ctx.state === "suspended") AU.ctx.resume();
  closeWorkshop();
  LT.phase = "hold"; LT.time = 0; LT.disp = 0;
  $("ltimer").classList.add("show");
  $("ltimer").classList.remove("done");
  $("ltBig").classList.remove("golive");
  $("ltTarget").textContent = ltLabel();
  ltShowBest();
}

function closeLaunch() {
  LT.phase = "off";
  $("ltimer").classList.remove("show");
}

function ltTick(dt) {
  if (LT.phase === "off") return;
  const sp = Math.abs(S.v) * UNIT_MS[S.units];
  const tgt = S.ltTgt[S.units];
  const big = $("ltBig"), st = $("ltStatus");
  $("ltSpeed").textContent = Math.round(sp) + " " + ltUnit();

  switch (LT.phase) {
    case "hold":                                  // arm once the car is still
      if (Math.abs(S.v) < 0.2) { LT.phase = "count"; LT.t = 3; LT.disp = 0; }
      else { big.textContent = "––"; st.textContent = "come to a complete stop"; }
      break;
    case "count": {
      LT.t -= dt;
      if (Math.abs(S.v) > 0.6) {                  // rolled during the count
        LT.phase = "hold";
        sfxBeep(220, 0.25, 0.14);
        big.textContent = "––"; st.textContent = "jump start — stop and retry";
        break;
      }
      if (LT.t <= 0) {
        LT.phase = "go";
        sfxBeep(1320, 0.3, 0.16);
        big.textContent = "GO"; big.classList.add("golive");
        st.textContent = "launch!";
      } else {
        const n = Math.ceil(LT.t);
        if (n !== LT.disp) { LT.disp = n; sfxBeep(880, 0.09, 0.12); }
        big.textContent = String(n);
        st.textContent = "get ready";
      }
      break;
    }
    case "go":                                    // clock starts at first movement
      if (Math.abs(S.v) > 0.25) { LT.phase = "run"; LT.time = 0; big.classList.remove("golive"); }
      break;
    case "run":
      LT.time += dt;
      big.textContent = LT.time.toFixed(2);
      st.textContent = "to " + tgt + " " + ltUnit();
      if (sp >= tgt) {
        LT.phase = "done";
        const key = ltKey();
        const pb = !(LT.best[key] <= LT.time);    // also true when no best yet
        if (pb) { LT.best[key] = LT.time; save(); }
        big.textContent = LT.time.toFixed(2) + "s";
        big.classList.add("golive");
        st.textContent = pb ? "new best!" : "run complete";
        $("ltimer").classList.add("done");
        ltShowBest();
        sfxBeep(1560, 0.35, 0.16);
        setTimeout(() => sfxBeep(2080, 0.4, 0.14), 130);
      }
      break;
  }
}

/* ---------------- AUTO DRIVE — the chauffeur ----------------
   The car drives itself: pulls away, works the box up through the gears,
   surges, backs off, brakes hard into a phantom corner, downshifts with
   rev-match blips, and goes again. Touch a pedal and it hands straight
   back to you. */

const AD = {
  on: false,
  phase: "idle", t: 0,          // current behaviour + time left in it
  target: 0,                    // speed it's driving toward (m/s)
  gas: 0, brake: 0,             // the chauffeur's feet (blended in physics)
  shiftT: 0, startT: 0,
};

function adVmax() {              // the pace it's willing to drive this car at
  return (CC.kmhMax / 3.6) * 0.82;
}

function toggleAutodrive() {
  if (AD.on) { autodriveOff(); return; }
  if (S.mode === "clutch") setMode("auto");   // the chauffeur takes the automatic
  cruiseOff();
  AD.on = true;
  AD.phase = "pull"; AD.t = 0; AD.gas = 0; AD.brake = 0; AD.startT = 0;
  AD.target = adVmax() * (0.35 + Math.random() * 0.3);
  $("adBtn").classList.add("on");
  $("lampAuto").classList.add("lit");
}

function autodriveOff() {
  if (!AD.on) return;
  AD.on = false; AD.gas = 0; AD.brake = 0;
  $("adBtn").classList.remove("on");
  $("lampAuto").classList.remove("lit");
}

/* per-frame chauffeur brain */
function autodriveTick(dt) {
  if (!AD.on) return;

  // the driver touched a pedal — instant handover
  if (S.in.gas > 0.04 || S.in.brake > 0.04 || S.in.clutch > 0.3) { autodriveOff(); return; }

  // fire the engine if it isn't running (with a beat between attempts)
  AD.startT -= dt;
  if ((!S.engineOn || S.stalled) && !S.cranking) {
    AD.gas = 0; AD.brake = 0;
    if (AD.startT <= 0) { AD.startT = 1.2; ignitionPress(); }   // cover, electronics, crank
    return;
  }
  if (S.cranking) return;

  // get it into a forward gear
  if (S.mode === "auto") {
    if (S.autoSel !== "D" && Math.abs(S.v) < 2) {
      S.autoSel = "D"; S.autoGear = 1; S.gear = 1; S.locked = false;
      sfxClunk(0.5); flashGear();
      document.querySelectorAll(".prnd button").forEach(b =>
        b.classList.toggle("on", b.dataset.sel === "D"));
    }
  } else if (S.gear === 0 || S.gear === "R") {
    AD.shiftT -= dt;
    if (AD.shiftT <= 0) { AD.shiftT = 0.5; seqShift(1); }
    return;
  }

  const v = Math.abs(S.v), vmax = adVmax();

  // behaviour phases
  AD.t -= dt;
  if (AD.phase === "pull" && v > AD.target * 0.96) { AD.phase = "hold"; AD.t = 2.5 + Math.random() * 5; }
  if (AD.t <= 0) {
    const r = Math.random();
    if (AD.phase === "hold" || AD.phase === "pull") {
      if (r < 0.30) {                     // brake for the corner ahead
        AD.phase = "brake";
        AD.target = Math.max(6, v * (0.3 + Math.random() * 0.3));
      } else if (r < 0.55) {              // full send
        AD.phase = "pull";
        AD.target = vmax * (0.85 + Math.random() * 0.15);
      } else {                            // ease to a new cruising pace
        AD.phase = "pull";
        AD.target = vmax * (0.35 + Math.random() * 0.45);
      }
      AD.t = 4 + Math.random() * 6;
    } else if (AD.phase === "brake") {
      AD.phase = "hold"; AD.t = 1.5 + Math.random() * 3;
    }
  }
  if (AD.phase === "brake" && v <= AD.target + 0.5) { AD.phase = "hold"; AD.t = 1.5 + Math.random() * 3; }

  // feet: smooth, human pedal movements toward what the phase wants
  let wantGas = 0, wantBrake = 0;
  const err = AD.target - v;
  if (AD.phase === "brake") {
    wantBrake = clamp(0.35 + (v - AD.target) * 0.05, 0.3, 0.85);
  } else {
    // proportional throttle with a spirited right foot on big gaps
    wantGas = clamp(err * 0.16, 0, 1);
    if (AD.phase === "pull" && err > vmax * 0.25) wantGas = 1;
    if (err < -1.5) { wantGas = 0; wantBrake = clamp(-err * 0.04, 0, 0.3); }
  }
  AD.gas += clamp(wantGas - AD.gas, -3.2 * dt, 2.2 * dt);
  AD.brake += clamp(wantBrake - AD.brake, -4 * dt, 3 * dt);

  // gearwork in sequential mode: short-shift when cruising, wring it out on
  // a send, drop gears with rev-match blips under braking
  if (S.mode === "manual") {
    AD.shiftT -= dt;
    if (AD.shiftT <= 0 && typeof S.gear === "number" && S.gear >= 1) {
      const sendIt = AD.phase === "pull" && AD.target > vmax * 0.7;
      const upAt = ENG.max * (sendIt ? 0.96 : 0.62 + AD.gas * 0.2);
      if (S.rpm > upAt && S.gear < CAR.top && AD.gas > 0.25) {
        seqShift(1); AD.shiftT = 0.45;
      } else if (S.rpm < ENG.idle * 1.85 && S.gear > 1 && v > 3) {
        seqShift(-1); AD.shiftT = 0.55;   // blip. bark. lovely.
      }
    }
  }
}

/* ---------------- cruise control ---------------- */

function toggleCruise() {
  if (S.cruise.on) { cruiseOff(); return; }
  const evNow = CC.edrive && S.powered && S.eDrive === "ev";
  const inGear = S.mode === "auto" ? S.autoSel === "D" : (S.gear !== 0 && S.gear !== "R");
  // needs a running powertrain, a forward gear and ~25 km/h on the clock
  if ((!S.engineOn && !evNow) || !inGear || Math.abs(S.v) < 7) {
    const b = $("cruiseBtn");
    b.classList.add("deny");
    setTimeout(() => b.classList.remove("deny"), 320);
    return;
  }
  S.cruise.on = true;
  S.cruise.set = Math.abs(S.v);
  S.cruise.i = S.throttle;                 // hand over from the driver's foot
  updateCruiseUi();
}

function cruiseOff() {
  if (!S.cruise.on) return;
  S.cruise.on = false;
  updateCruiseUi();
}

function updateCruiseUi() {
  const kt = S.units === "kmh" ? 3.6 : 2.237;
  $("cruiseBtn").classList.toggle("on", S.cruise.on);
  $("cruiseBtn").textContent = S.cruise.on
    ? "CRUISE " + Math.round(S.cruise.set * kt) : "CRUISE";
  $("lampCruise").classList.toggle("lit", S.cruise.on);
}

/* ---------------- night drive (Saab night panel) ---------------- */

function setNight(on) {
  S.night = on;
  document.body.classList.toggle("night", on);
  $("nightBtn").classList.toggle("on", on);
  // dial faces are painted from CSS vars — repaint under the night palette
  requestAnimationFrame(() => { tachG.rebuild(); speedG.rebuild(); });
  save();
}

/* passing streetlights fall down the SIDES of the screen — you're driving
   between the posts, so their glow slides from top to bottom as you pass */
function streetlightSweep(speed) {
  S._nsSide = !S._nsSide;
  const el = $(S._nsSide ? "nsL" : "nsR");
  if (!el || !el.animate) return;
  const dur = clamp(30 / speed, 0.5, 2.2) * 1000;
  el.animate(
    [{ transform: "translateY(0)", opacity: 0 },
     { opacity: 0.85, offset: 0.45 },
     { transform: "translateY(165vh)", opacity: 0 }],
    { duration: dur, easing: "linear" });
}

/* ================================================================
   TAPE DECK — Spotify in a cassette shell. Uses Spotify's iframe API
   so the reels spin with actual playback and the cabin mix can duck
   the engine under the music.
   ================================================================ */

const MUS = {
  api: null, apiFailed: false, loading: false,
  ctrl: null, pending: null, playing: false,
  saved: [],        // recently played tapes (fallback shelf when not connected)
  names: {},        // uri → human title
  lib: null,        // the signed-in driver's own playlists [{uri, name}]
  // Web Playback SDK (Premium): in-page player with a real volume knob
  premium: false, player: null, dev: null, pendPlay: null, sdkLoading: false,
  vol: 0.7, echo: false, wide: false,
};

/* ---- Spotify sign-in (Authorization Code + PKCE, fully client-side) ----
   Site owner: paste your Spotify app's Client ID here (developer.spotify.com
   → create app → redirect URI = this site's URL). Players can also supply
   one at runtime via the in-deck setup screen; it's kept in localStorage. */
const SPOTIFY_CLIENT_ID = "1997bc60896541669853b0249b9c98db";

const SPA = {
  key: "dwnshift-spotify",
  read() { try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch (_) { return {}; } },
  write(v) { try { localStorage.setItem(this.key, JSON.stringify(v)); } catch (_) {} },
};
function spCid() { return SPOTIFY_CLIENT_ID || SPA.read().cid || ""; }
function spRedirectUri() { return location.origin + location.pathname; }
/* scopeV gates the grant: bumping SP_SCOPE_V forces one reconnect so old
   sessions pick up newly required scopes (v2 added streaming/playback) */
const SP_SCOPE_V = 2;
const SP_SCOPES = "playlist-read-private playlist-read-collaborative " +
  "streaming user-read-email user-read-private " +
  "user-read-playback-state user-modify-playback-state";
function spConnected() {
  const st = SPA.read();
  return !!st.refresh && st.scopeV === SP_SCOPE_V;
}

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function spConnect() {
  if (!spCid()) {                     // no app id yet — show the setup card
    $("spRedirect").textContent = spRedirectUri();
    $("spSetup").classList.remove("hide");
    return;
  }
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode(verifier)));
  const st = SPA.read(); st.verifier = verifier; SPA.write(st);
  location.href = "https://accounts.spotify.com/authorize?" + new URLSearchParams({
    client_id: spCid(), response_type: "code",
    redirect_uri: spRedirectUri(),
    scope: SP_SCOPES,
    code_challenge_method: "S256", code_challenge: challenge,
  });
}

async function spExchange(code) {
  const st = SPA.read();
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: spCid(), grant_type: "authorization_code", code,
      redirect_uri: spRedirectUri(), code_verifier: st.verifier || "",
    }),
  });
  if (!r.ok) throw new Error("token");
  const j = await r.json();
  st.token = j.access_token; st.refresh = j.refresh_token;
  st.exp = Date.now() + (j.expires_in - 60) * 1000;
  st.scopeV = SP_SCOPE_V;
  delete st.verifier;
  SPA.write(st);
}

async function spToken() {
  const st = SPA.read();
  if (st.token && Date.now() < st.exp) return st.token;
  if (!st.refresh) return null;
  try {
    const r = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: spCid(), grant_type: "refresh_token", refresh_token: st.refresh,
      }),
    });
    if (!r.ok) throw 0;
    const j = await r.json();
    st.token = j.access_token;
    if (j.refresh_token) st.refresh = j.refresh_token;
    st.exp = Date.now() + (j.expires_in - 60) * 1000;
    SPA.write(st);
    return st.token;
  } catch (_) {
    spSignout(true);                  // stale grant — back to "not connected"
    return null;
  }
}

async function spApi(path, method, body) {
  const call = async (tok) => fetch("https://api.spotify.com/v1" + path, {
    method: method || "GET",
    headers: {
      Authorization: "Bearer " + tok,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const tok = await spToken();
  if (!tok) return null;
  let r = await call(tok);
  if (r.status === 401) {             // token died early — force one refresh
    const st = SPA.read(); delete st.token; SPA.write(st);
    const t2 = await spToken();
    if (!t2) return null;
    r = await call(t2);
  }
  if (!r.ok) return null;
  return r.status === 204 ? true : r.json();
}

/* ---- Web Playback SDK: the deck becomes a real Spotify device (Premium),
   which is what makes an actual VOLUME knob possible ---- */
function ensureSdk() {
  if (MUS.player || MUS.sdkLoading || !spConnected() || !MUS.premium) return;
  MUS.sdkLoading = true;
  window.onSpotifyWebPlaybackSDKReady = () => {
    const p = new Spotify.Player({
      name: "DWNSHIFT tape deck",
      getOAuthToken: (cb) => { spToken().then(t => { if (t) cb(t); }); },
      volume: MUS.vol,
    });
    p.addListener("ready", ({ device_id }) => {
      MUS.dev = device_id;
      updateTransportUi();
      if (MUS.pendPlay) { const u = MUS.pendPlay; MUS.pendPlay = null; playOnDeck(u); }
    });
    p.addListener("not_ready", () => { MUS.dev = null; });
    p.addListener("player_state_changed", (st) => {
      if (!st) return;
      setPlaying(!st.paused);
      $("tpPlay").textContent = st.paused ? "PLAY" : "PAUSE";
      const tr = st.track_window && st.track_window.current_track;
      if (tr) $("casState").textContent =
        tr.name + " — " + tr.artists.map(a => a.name).join(", ");
    });
    // account_error = not actually Premium — fall back to the plain embed
    p.addListener("account_error", () => { MUS.premium = false; MUS.dev = null; updateTransportUi(); });
    p.addListener("initialization_error", () => { MUS.premium = false; updateTransportUi(); });
    p.addListener("authentication_error", () => {});
    p.connect();
    MUS.player = p;
  };
  const s = document.createElement("script");
  s.src = "https://sdk.scdn.co/spotify-player.js";
  s.async = true;
  document.head.appendChild(s);
}

/* tell Spotify to start this playlist on the deck's own device */
async function playOnDeck(uri) {
  const ok = await spApi("/me/player/play?device_id=" + MUS.dev, "PUT",
    { context_uri: "spotify:" + uri.replace("/", ":") });
  updateCasFace(ok ? "starting…" : "couldn't start — open any track once in Spotify, then retry");
}

function updateTransportUi() {
  // volume / echo / stereo are the app's own — always available. Only the
  // track keys need Spotify's player (Premium), so only they are gated.
  $("tpKeys").classList.toggle("hide", !(spConnected() && MUS.premium));
  $("tpVol").value = MUS.vol;
  $("tpEcho").classList.toggle("on", MUS.echo);
  $("tpWide").classList.toggle("on", MUS.wide);
}

/* pull the whole shelf: every playlist on the signed-in account */
async function spLoadLibrary() {
  $("spStatus").textContent = "loading your playlists…";
  const me = await spApi("/me");
  MUS.premium = !!(me && me.product === "premium");
  ensureSdk();
  let items = [], url = "/me/playlists?limit=50";
  while (url && items.length < 250) {
    const j = await spApi(url);
    if (!j) break;
    items = items.concat(j.items || []);
    url = j.next ? j.next.replace("https://api.spotify.com/v1", "") : null;
  }
  MUS.lib = items.filter(Boolean).map(p => ({ uri: "playlist/" + p.id, name: p.name }));
  for (const p of MUS.lib) MUS.names[p.uri] = p.name;
  renderStations();
  spUpdateAuthUi(me && me.display_name);
  updateTransportUi();
  save();
}

function spUpdateAuthUi(name) {
  const on = spConnected();
  $("spConnect").textContent = on ? "REFRESH PLAYLISTS" : "CONNECT SPOTIFY";
  $("spSignout").classList.toggle("hide", !on);
  $("spStatus").textContent = on
    ? (MUS.lib ? MUS.lib.length + " playlists" + (name ? " · " + name : "") : "connected")
    : "not connected — connect to load your playlists";
}

function spSignout(silent) {
  const st = SPA.read();
  SPA.write({ cid: st.cid });         // keep the app id, drop the tokens
  MUS.lib = null;
  renderStations();
  if (!silent) spUpdateAuthUi();
}

/* landing back from Spotify's consent page: trade the code for tokens,
   clean the URL, and open the deck on the freshly loaded shelf */
async function spHandleRedirect() {
  const q = new URLSearchParams(location.search);
  if (!q.has("code")) return;
  const code = q.get("code");
  history.replaceState({}, "", spRedirectUri());
  try {
    await spExchange(code);
    toggleCassette(true);
    await spLoadLibrary();
  } catch (_) {
    $("spStatus").textContent = "sign-in failed — try connecting again";
  }
}

function ensureSpotifyApi() {
  if (MUS.api || MUS.loading) return;
  MUS.loading = true;
  window.onSpotifyIframeApiReady = (IFrameAPI) => {
    MUS.api = IFrameAPI;
    if (MUS.pending) { const u = MUS.pending; MUS.pending = null; loadStation(u); }
  };
  const s = document.createElement("script");
  s.src = "https://open.spotify.com/embed/iframe-api/v1";
  s.async = true;
  s.onerror = () => {
    MUS.apiFailed = true;
    if (MUS.pending) { const u = MUS.pending; MUS.pending = null; loadStation(u); }
  };
  document.head.appendChild(s);
}

function stationName(uri) { return MUS.names[uri] || uri.split("/")[0].toUpperCase(); }

/* ask Spotify's public oEmbed endpoint for the playlist's real title */
function fetchStationName(uri) {
  if (MUS.names[uri]) return;
  fetch("https://open.spotify.com/oembed?url=" +
        encodeURIComponent("https://open.spotify.com/" + uri))
    .then(r => r.json())
    .then(j => {
      if (!j.title) return;
      MUS.names[uri] = j.title;
      renderStations(); updateCasFace();
      save();
    })
    .catch(() => {});
}

function renderStations() {
  // connected: the whole shelf from their Spotify. Otherwise: recent tapes.
  const shelf = MUS.lib && MUS.lib.length
    ? MUS.lib.map(p => p.uri)
    : MUS.saved;
  $("huPresets").innerHTML = shelf.map(uri =>
    `<button class="chip-btn mono${uri === S.station ? " on" : ""}" data-uri="${esc(uri)}">
       <span>${esc(stationName(uri))}</span>
     </button>`).join("");
  document.querySelectorAll("#huPresets .chip-btn").forEach(b =>
    b.addEventListener("click", () => loadStation(b.dataset.uri)));
}

function updateCasFace(stateTxt) {
  $("casLabel").textContent = S.station ? stationName(S.station) : "NO TAPE";
  if (stateTxt) $("casState").textContent = stateTxt;
  else if (S.station) $("casState").textContent = MUS.playing ? "playing" : "paused — press play";
}

function setPlaying(p) {
  if (MUS.playing === p) return;
  MUS.playing = p;
  $("cassette").classList.toggle("playing", p);
  updateCasFace();
  updateMasterGain();
}

function loadStation(uri) {
  S.station = uri;
  // remember it as one of the driver's tapes (most recent first, keep 6)
  MUS.saved = [uri, ...MUS.saved.filter(u => u !== uri)].slice(0, 6);
  if (!MUS.names[uri]) fetchStationName(uri);
  renderStations();
  updateCasFace("loading tape…");
  save();

  // Premium + SDK: play straight on the deck's own device — real volume knob
  if (MUS.premium && spConnected()) {
    if (MUS.dev) { playOnDeck(uri); return; }
    MUS.pendPlay = uri;
    ensureSdk();
    return;
  }

  const spUri = "spotify:" + uri.replace("/", ":");
  if (MUS.ctrl) { MUS.ctrl.loadUri(spUri); return; }
  if (MUS.api) {
    const host = document.createElement("div");
    $("huPlayer").innerHTML = "";
    $("huPlayer").appendChild(host);
    MUS.api.createController(host, { uri: spUri, height: 152 }, (ctrl) => {
      MUS.ctrl = ctrl;
      ctrl.addListener("ready", () => updateCasFace("ready — press play"));
      ctrl.addListener("playback_update", (e) => {
        if (e && e.data) setPlaying(!e.data.isPaused);
      });
    });
  } else if (MUS.apiFailed) {
    // API blocked — fall back to a plain embed (reels won't sync)
    const [type, id] = uri.split("/");
    $("huPlayer").innerHTML =
      `<iframe src="https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0"` +
      ` height="152" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"` +
      ` title="Spotify player"></iframe>`;
    updateCasFace("ready — press play");
  } else {
    MUS.pending = uri;
    ensureSpotifyApi();
  }
}

function toggleCassette(show) {
  const el = $("cassette");
  const open = show !== undefined ? show : !el.classList.contains("open");
  el.classList.toggle("open", open);
  $("musicBtn").classList.toggle("on", open);
  if (open) {
    ensureSpotifyApi();
    if (spConnected() && !MUS.lib) spLoadLibrary();   // first open: pull the shelf
    if (S.station && !$("huPlayer").firstElementChild) loadStation(S.station);
  }
}

/* echo mode: opens the whole cabin mix into a huge concrete space — long
   reverb tail plus a fed-back slap delay. (Spotify's own stream is DRM-boxed,
   so the space is built around the music rather than on it.) */
function applyMusicEcho() {
  if (!AU.ready || !AU.echoSend) return;
  const t = AU.ctx.currentTime, on = MUS.echo;
  AU.echoSend.gain.setTargetAtTime(on ? 1.1 : 0, t, 0.25);   // tunnel-grade wash
  AU.echoSlapG.gain.setTargetAtTime(on ? 0.8 : 0, t, 0.25);
}

/* stereo mode: Haas widener on the cabin mix — a 14ms right-ear copy of
   everything, highpassed so the bass stays anchored in the middle */
function applyStereoWide() {
  if (!AU.ready || !AU.wideG) return;
  AU.wideG.gain.setTargetAtTime(MUS.wide ? 0.55 : 0, AU.ctx.currentTime, 0.2);
}

/* the one volume knob: mute × music balance. The VOL slider is the app's
   own mix control — the higher it sits, the further the engine steps back
   under a playing tape (hardest with the windows up); Premium accounts
   additionally get true Spotify volume through the SDK player. */
function updateMasterGain() {
  if (!AU.ready) return;
  const duck = MUS.playing ? 1 - MUS.vol * (S.cabin ? 0.68 : 0.4) : 1;
  AU.master.gain.setTargetAtTime(S.muted ? 0 : 0.85 * duck, AU.ctx.currentTime, 0.25);
}

function setTheme(t) {
  document.body.dataset.theme = t;
  document.querySelectorAll(".swatch").forEach(s => s.classList.toggle("active", s.dataset.t === t));
  requestAnimationFrame(() => { tachG.rebuild(); speedG.rebuild(); });
  save();
}

function setUnits(u) {
  S.units = u;
  $("unitsBtn").textContent = u === "kmh" ? "KM/H" : "MPH";
  $("speedUnitLbl").textContent = u === "kmh" ? "km/h" : "mph";
  speedG.rebuild();
  refreshWorkshop();
  updateCruiseUi();
  if (LT.phase !== "off") { $("ltTarget").textContent = ltLabel(); ltShowBest(); }
  save();
}

function save() {
  try {
    localStorage.setItem("dwnshift", JSON.stringify({
      theme: document.body.dataset.theme, units: S.units, mode: S.mode, muted: S.muted,
      voice: S.voice,
      car: CC.id, tunnel: S.tunnel, flyby: S.flyby, cabin: S.cabin, mods: S.mods,
      traffic: S.traffic, rain: S.rain, lt: S.ltTgt, ltBest: LT.best,
      night: S.night, station: S.station,
      stations: MUS.saved, tapeNames: MUS.names,
      musVol: MUS.vol, musEcho: MUS.echo, musWide: MUS.wide,
      padV2: true,                       // paddle remap migration done
    }));
  } catch (_) {}
}

function load() {
  try { return JSON.parse(localStorage.getItem("dwnshift")) || {}; }
  catch (_) { return {}; }
}

/* ================================================================
   INPUT
   ================================================================ */

function initInput() {
  const keymap = (e, down) => {
    // typing in a text field (car name, Spotify link…) must never drive the car
    if (e.target && e.target.matches && e.target.matches("input, textarea, select")) return false;
    switch (e.code) {
      case "KeyW": S.in.gas = down ? 1 : 0; return true;
      case "KeyS": S.in.brake = down ? 1 : 0; return true;
      case "ArrowUp":
        if (S.mode === "clutch") { if (down && !e.repeat) kbSeqGate(1); return true; }
        S.in.gas = down ? 1 : 0; return true;
      case "ArrowDown":
        if (S.mode === "clutch") { if (down && !e.repeat) kbSeqGate(-1); return true; }
        S.in.brake = down ? 1 : 0; return true;
      case "ArrowLeft":
        if (S.mode === "clutch") { if (down && !e.repeat) kbSeqGate(-1); return true; }
        return false;
      case "ArrowRight":
        if (S.mode === "clutch") { if (down && !e.repeat) kbSeqGate(1); return true; }
        return false;
      case "KeyT": if (down && !e.repeat) $("tunnelBtn").click(); return true;
      case "KeyF": if (down && !e.repeat) $("flybyBtn").click(); return true;
      case "KeyN": if (down && !e.repeat) setNight(!S.night); return true;
      case "KeyK": if (down && !e.repeat) toggleCruise(); return true;
      case "KeyA": if (down && !e.repeat) toggleAutodrive(); return true;
      case "KeyM": if (down && !e.repeat) toggleCassette(); return true;
      case "KeyV": if (down && !e.repeat) $("cabinBtn").click(); return true;
      case "Space": case "KeyC":
        if (S.mode === "clutch") { S.in.clutch = down ? 1 : 0; return true; }
        return e.code === "Space";      // still swallow space (page scroll)
      case "KeyE": if (down && !e.repeat) seqShift(1); return true;
      case "KeyQ": if (down && !e.repeat) seqShift(-1); return true;
      case "KeyI": if (down && !e.repeat) ignitionPress(); return true;
      case "KeyH": if (down && !e.repeat) toggleEdrive(); return true;
      case "KeyL":
        if (down && !e.repeat) LT.phase === "off" ? openLaunch() : closeLaunch();
        return true;
      case "Escape": if (down) { closeWorkshop(); closeLaunch(); toggleCassette(false); } return false;
    }
    // number keys = analog pedal pressure while held: 1–9 → 10–90%, 0 → 100%
    const dig = /^(Digit|Numpad)([0-9])$/.exec(e.code);
    if (dig) {
      const val = dig[2] === "0" ? 1 : +dig[2] / 10;
      if (down) S.in.gas = val;
      else if (Math.abs(S.in.gas - val) < 0.001) S.in.gas = 0;
      return true;
    }
    return false;
  };
  window.addEventListener("keydown", (e) => { if (keymap(e, true)) e.preventDefault(); });
  window.addEventListener("keyup", (e) => { if (keymap(e, false)) e.preventDefault(); });
  window.addEventListener("blur", () => { S.in.gas = 0; S.in.brake = 0; S.in.clutch = 0; });

  // pedals: click & hold
  const bindPedal = (el, prop) => {
    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture(e.pointerId);
      S.in[prop] = 1;
      e.preventDefault();
    });
    const off = () => { S.in[prop] = 0; };
    el.addEventListener("pointerup", off);
    el.addEventListener("pointercancel", off);
  };
  bindPedal($("pedGas"), "gas");
  bindPedal($("pedBrake"), "brake");
  bindPedal($("pedClutch"), "clutch");

  $("ignition").addEventListener("click", ignitionPress);
  $("edriveBtn").addEventListener("click", toggleEdrive);

  document.querySelectorAll(".mode-btn").forEach(b =>
    b.addEventListener("click", () => setMode(b.dataset.mode)));

  document.querySelectorAll(".swatch").forEach(s =>
    s.addEventListener("click", () => setTheme(s.dataset.t)));

  $("unitsBtn").addEventListener("click", () => setUnits(S.units === "kmh" ? "mph" : "kmh"));

  $("trafBtn").addEventListener("click", () => {
    initAudio();
    if (AU.ctx && AU.ctx.state === "suspended") AU.ctx.resume();
    S.traffic = !S.traffic;
    $("trafBtn").classList.toggle("on", S.traffic);
    save();
  });

  $("rainBtn").addEventListener("click", () => {
    initAudio();
    if (AU.ctx && AU.ctx.state === "suspended") AU.ctx.resume();
    S.rain = !S.rain;
    $("rainBtn").classList.toggle("on", S.rain);
    updateWiper();
    save();
  });

  $("cabinBtn").addEventListener("click", () => {
    initAudio();
    if (AU.ctx && AU.ctx.state === "suspended") AU.ctx.resume();
    S.cabin = !S.cabin;
    $("cabinBtn").classList.toggle("on", S.cabin);
    applyCabin();
    updateMasterGain();          // windows up + tape playing = stereo over engine
    updateWiper();
    save();
  });

  $("nightBtn").addEventListener("click", () => setNight(!S.night));
  $("cruiseBtn").addEventListener("click", toggleCruise);

  $("musicBtn").addEventListener("click", () => toggleCassette());
  $("casClose").addEventListener("click", () => toggleCassette(false));
  $("cassette").addEventListener("click", (e) => {
    if (e.target === $("cassette")) toggleCassette(false);   // click the dark to close
  });
  $("spConnect").addEventListener("click", () =>
    spConnected() ? spLoadLibrary() : spConnect());
  $("spSignout").addEventListener("click", () => spSignout());
  $("spCidSave").addEventListener("click", () => {
    const cid = $("spCid").value.trim();
    if (!/^[a-f0-9]{32}$/i.test(cid)) {
      $("spCidSave").classList.add("deny");
      setTimeout(() => $("spCidSave").classList.remove("deny"), 320);
      return;
    }
    const st = SPA.read(); st.cid = cid; SPA.write(st);
    $("spSetup").classList.add("hide");
    spConnect();                       // straight into the sign-in dance
  });

  // tape transport (Premium — the deck is its own Spotify device)
  $("tpPlay").addEventListener("click", () => { if (MUS.player) MUS.player.togglePlay(); });
  $("tpPrev").addEventListener("click", () => { if (MUS.player) MUS.player.previousTrack(); });
  $("tpNext").addEventListener("click", () => { if (MUS.player) MUS.player.nextTrack(); });
  $("tpVol").addEventListener("input", () => {
    MUS.vol = +$("tpVol").value;
    if (MUS.player) MUS.player.setVolume(MUS.vol);
    updateMasterGain();                // balance shifts live, SDK or not
  });
  $("tpVol").addEventListener("change", save);
  $("tpEcho").addEventListener("click", () => {
    initAudio();
    if (AU.ctx && AU.ctx.state === "suspended") AU.ctx.resume();
    MUS.echo = !MUS.echo;
    $("tpEcho").classList.toggle("on", MUS.echo);
    applyMusicEcho();
    save();
  });
  $("tpWide").addEventListener("click", () => {
    initAudio();
    if (AU.ctx && AU.ctx.state === "suspended") AU.ctx.resume();
    MUS.wide = !MUS.wide;
    $("tpWide").classList.toggle("on", MUS.wide);
    applyStereoWide();
    save();
  });

  $("flybyBtn").addEventListener("click", () => {
    S.flyby = !S.flyby;
    S.flyX = -380;
    $("flybyBtn").classList.toggle("on", S.flyby);
    save();
  });

  $("tunnelBtn").addEventListener("click", () => {
    S.tunnel = !S.tunnel;
    $("tunnelBtn").classList.toggle("on", S.tunnel);
    document.body.classList.toggle("tunnel", S.tunnel);  // tunnel lights at night
    applyTunnel();
    save();
  });

  $("adBtn").addEventListener("click", toggleAutodrive);

  $("fsBtn").addEventListener("click", () => {
    const el = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    }
  });
  document.addEventListener("fullscreenchange", () =>
    $("fsBtn").classList.toggle("on", !!document.fullscreenElement));
  document.addEventListener("webkitfullscreenchange", () =>
    $("fsBtn").classList.toggle("on", !!document.webkitFullscreenElement));

  $("voiceBtn").addEventListener("click", () => {
    S.voice = !S.voice;
    $("voiceBtn").classList.toggle("on", S.voice);
    if (!S.voice) { if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); }
    else sayVoice("Voice callouts on");
    save();
  });

  $("muteBtn").addEventListener("click", () => {
    S.muted = !S.muted;
    $("muteBtn").classList.toggle("muted", S.muted);
    updateMasterGain();
    save();
  });

  document.querySelectorAll(".prnd button").forEach(b => {
    b.addEventListener("click", () => {
      const sel = b.dataset.sel;
      if ((sel === "R" || sel === "P") && Math.abs(S.v) > 1.6) {
        b.classList.add("deny");
        setTimeout(() => b.classList.remove("deny"), 320);
        sfxClunk(0.3);
        return;
      }
      S.autoSel = sel;
      S.gear = sel === "D" ? S.autoGear : (sel === "R" ? "R" : 0);
      if (sel === "D") S.autoGear = 1, S.gear = 1;
      S.locked = false;
      sfxClunk(0.5);
      flashGear();
      document.querySelectorAll(".prnd button").forEach(x => x.classList.toggle("on", x === b));
    });
  });

  window.addEventListener("resize", () => {
    positionGlider();
    tachG.rebuild(); speedG.rebuild();
  });

  initGamepad();
}

/* ================================================================
   CONTROLLER (Gamepad API) — Forza-style trigger throttle/brake,
   bumper paddle shifting. There's no steering axis anywhere in this
   sim (it's a stationary rig, not an open track), so the pad only
   drives the pedals and the shifter.
   ================================================================ */

const GP = { index: null, prevButtons: [] };

function initGamepad() {
  window.addEventListener("gamepadconnected", (e) => { GP.index = e.gamepad.index; });
  window.addEventListener("gamepaddisconnected", (e) => {
    if (GP.index === e.gamepad.index) GP.index = null;
  });
}

/* edge-triggered button: fires the callback once on press, not every
   frame it's held */
function gpPressed(gp, i, prev) {
  const now = !!(gp.buttons[i] && gp.buttons[i].pressed);
  const was = !!prev[i];
  prev[i] = now;
  return now && !was;
}

function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = GP.index != null ? pads[GP.index] : null;
  if (!gp) gp = Array.from(pads).find(p => p) || null;
  if (!gp) return;
  GP.index = gp.index;

  // triggers: analog buttons 7 (RT/gas) & 6 (LT/brake) on the standard
  // mapping, with an axis fallback for pads that report them as axes
  const rt = gp.buttons[7] ? gp.buttons[7].value : Math.max(0, gp.axes[5] || 0);
  const lt = gp.buttons[6] ? gp.buttons[6].value : Math.max(0, gp.axes[4] || 0);
  S.in.gas = rt;
  S.in.brake = lt;
  if (S.mode === "clutch")
    S.in.clutch = (gp.buttons[0] && gp.buttons[0].pressed) ? 1 : 0;  // A held = clutch pedal

  const prev = GP.prevButtons;
  // RB / LB = paddle shifters, exactly like a Forza-style sequential box
  if (gpPressed(gp, 5, prev)) {
    if (S.mode === "manual") seqShift(1);
    else if (S.mode === "clutch") kbSeqGate(1);
  }
  if (gpPressed(gp, 4, prev)) {
    if (S.mode === "manual") seqShift(-1);
    else if (S.mode === "clutch") kbSeqGate(-1);
  }
  if (gpPressed(gp, 9, prev)) ignitionPress();           // Start/Menu
  if (gpPressed(gp, 3, prev)) toggleEdrive();            // Y — eDrive cars only
  if (gpPressed(gp, 1, prev)) toggleCruise();            // B
}

/* ================================================================
   MAIN LOOP
   ================================================================ */

let lastT = 0, acc = 0;
const STEP = 1 / 120;
let lastGearChar = "";
let shiftLightEls = [];

function buildShiftLights() {
  $("shiftLights").innerHTML = Array.from({ length: 9 },
    (_, i) => `<i class="${i < 3 ? "g" : i < 6 ? "a" : "r"}"></i>`).join("");
  shiftLightEls = Array.from($("shiftLights").children);
}

function frame(now) {
  requestAnimationFrame(frame);
  if (!lastT) { lastT = now; return; }
  let dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;

  pollGamepad();

  acc += dt;
  while (acc >= STEP) { stepPhysics(STEP); acc -= STEP; }

  audioTick();
  ltTick(dt);

  /* --- ambience schedulers --- */
  if (AU.ready) {
    if (S.traffic) {
      S.passT -= dt;
      if (S.passT <= 0) {
        const sp = Math.abs(S.v);
        if (sp > 12) {              // we're passing them: husss.. husss..
          sfxPassby(true);
          S.passT = clamp(55 / sp, 0.5, 3) * (0.6 + Math.random() * 0.8);
        } else {                    // parked: they drift past us
          sfxPassby(false);
          S.passT = 2.5 + Math.random() * 3.5;
        }
      }
    }
    if (S.rain && !S.tunnel) {      // tunnel roads stay dry
      S.splashT -= dt;
      const sp = Math.abs(S.v);
      if (S.splashT <= 0 && sp > 3) {
        sfxSplash(Math.min(0.5, 0.15 + sp * 0.011));
        S.splashT = clamp(32 / sp, 0.7, 4) * (0.5 + Math.random());
      }
    }
    // night crickets — only audible parked or rolling gently; the engine
    // and wind bury them at speed anyway
    if (S.night && !S.tunnel && Math.abs(S.v) < 16) {
      S.cricketT -= dt;
      if (S.cricketT <= 0) {
        sfxCricket();
        S.cricketT = 0.9 + Math.random() * 2.8;
      }
    }
    // wipers slap back and forth whenever you're sat inside in the rain
    if (S.rain && S.cabin) {
      S.wiperT -= dt;
      if (S.wiperT <= 0) {
        sfxWiper(S.wiperDir);
        wiperSweep(S.wiperDir);
        S.wiperDir = -S.wiperDir;
        S.wiperT = 0.66;            // ~90 wipes/min, steady intermittent-fast
      }
    }
  }

  /* --- auto drive --- */
  autodriveTick(dt);

  /* --- night streetlights sweep past at speed; in a tunnel the ceiling
         lights come in a strict rhythm instead of scattered posts --- */
  if (S.night && Math.abs(S.v) > 6) {
    S.lampT -= dt;
    if (S.lampT <= 0) {
      streetlightSweep(Math.abs(S.v));
      S.lampT = S.tunnel
        ? clamp(42 / Math.abs(S.v), 0.4, 2.4)
        : clamp(95 / Math.abs(S.v), 0.8, 6) * (0.7 + Math.random() * 0.9);
    }
  } else S.lampT = Math.max(S.lampT, 1.2);

  /* --- dash clock --- */
  S._clkT = (S._clkT || 0) - dt;
  if (S._clkT <= 0) {
    S._clkT = 1;
    const d = new Date();
    $("clockNum").textContent =
      d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  /* --- needle springs (slight overshoot = satisfying) --- */
  let rpmTarget = S.rpm, spdTarget = Math.abs(S.v) * (S.units === "kmh" ? 3.6 : 2.237);
  if (S.sweep >= 0) {
    S.sweep += dt;
    const p = S.sweep / 0.95;
    if (p >= 1) S.sweep = -1;
    else {
      const s = Math.sin(Math.PI * Math.min(p, 1));
      rpmTarget = Math.max(rpmTarget, s * CC.tachMax * 1000);
      spdTarget = Math.max(spdTarget, s * (S.units === "kmh" ? CC.kmhMax : CC.mphMax));
    }
  }
  const N = S.needle, stiff = 180, damp = 15;
  N.rpmV += (rpmTarget - N.rpm) * stiff * dt; N.rpmV *= Math.exp(-damp * dt); N.rpm += N.rpmV * dt;
  N.spdV += (spdTarget - N.spd) * stiff * dt; N.spdV *= Math.exp(-damp * dt); N.spd += N.spdV * dt;

  renderGauge(tachG, N.rpm / 1000);
  renderGauge(speedG, N.spd);

  /* --- pedal visuals --- */
  $("pedGas").style.setProperty("--press", S.throttle.toFixed(3));
  $("pedBrake").style.setProperty("--press", S.brake.toFixed(3));
  $("pedClutch").style.setProperty("--press", S.clutchPedal.toFixed(3));

  /* --- readouts --- */
  $("speedNum").textContent = Math.round(Math.abs(S.v) * (S.units === "kmh" ? 3.6 : 2.237));
  $("rpmNum").textContent = Math.round(S.rpm);
  $("thrNum").textContent = Math.round(S.effThrottle * 100) + "%";
  $("odoNum").textContent = S.odo.toFixed(1);
  if (CC.asp === "hybrid") $("boostNum").textContent = String(Math.round(S.boost * 100));
  else if (CC.asp === "turbo" || CC.asp === "super")
    $("boostNum").textContent = (S.boost * CC.psiMax).toFixed(1);

  const [gc, gs] = gearLabel();
  if (gc !== lastGearChar) {
    $("gearChar").textContent = gc;
    lastGearChar = gc;
  }
  $("gearSub").textContent = gs;

  /* --- shift lights --- */
  if (CC.shiftLights && shiftLightEls.length) {
    const start = ENG.max * 0.68, end = ENG.cut * 0.99;
    let n = Math.ceil(9 * clamp((S.rpm - start) / (end - start), 0, 1));
    if (S.rpm > ENG.cut * 0.995)
      n = performance.now() % 160 < 80 ? 9 : 0;      // strobe on the limiter
    for (let i = 0; i < shiftLightEls.length; i++)
      shiftLightEls[i].classList.toggle("lit", i < n);
  }

  /* --- lamps --- */
  const over = S.rpm > ENG.cut * 1.03;
  $("lampRev").classList.toggle("lit", over);
  $("lampRev").classList.toggle("blink", over);
  $("lampShift").classList.toggle("lit", S.engineOn && S.rpm > ENG.max * 0.93 && !over);
  const slipping = S.spinV > 1 || S.lockup;
  $("lampGrip").classList.toggle("lit", slipping);
  $("lampGrip").classList.toggle("blink", slipping);

  /* --- redline / over-rev cockpit vibration --- */
  const cluster = $("cluster");
  if (over) {
    cluster.style.transform = `translate(${(Math.random() - 0.5) * 3}px, ${(Math.random() - 0.5) * 2.5}px)`;
  } else if (S.engineOn && S.rpm > ENG.max * 0.945) {
    cluster.style.transform = `translate(${(Math.random() - 0.5) * 1.2}px, 0)`;
  } else if (cluster.style.transform) {
    cluster.style.transform = "";
  }
}

/* ================================================================
   BOOT
   ================================================================ */

(function boot() {
  const saved = load();
  loadCustomCars();                       // merge saved custom builds into the garage
  if (saved.theme) document.body.dataset.theme = saved.theme;
  S.units = saved.units || "kmh";
  S.muted = !!saved.muted;
  $("muteBtn").classList.toggle("muted", S.muted);
  if (saved.voice != null) S.voice = !!saved.voice;
  $("voiceBtn").classList.toggle("on", S.voice);
  S.tunnel = !!saved.tunnel;
  $("tunnelBtn").classList.toggle("on", S.tunnel);
  document.body.classList.toggle("tunnel", S.tunnel);
  S.flyby = !!saved.flyby;
  $("flybyBtn").classList.toggle("on", S.flyby);
  S.cabin = !!saved.cabin;
  $("cabinBtn").classList.toggle("on", S.cabin);
  S.traffic = !!saved.traffic;
  $("trafBtn").classList.toggle("on", S.traffic);
  S.rain = !!saved.rain;
  $("rainBtn").classList.toggle("on", S.rain);
  updateWiper();
  // night palette must be on the body BEFORE the dial faces are painted
  S.night = !!saved.night;
  document.body.classList.toggle("night", S.night);
  $("nightBtn").classList.toggle("on", S.night);
  if (typeof saved.musVol === "number") MUS.vol = clamp(saved.musVol, 0, 1);
  $("tpVol").value = MUS.vol;
  MUS.echo = !!saved.musEcho;
  $("tpEcho").classList.toggle("on", MUS.echo);
  MUS.wide = !!saved.musWide;
  $("tpWide").classList.toggle("on", MUS.wide);
  S.station = saved.station || null;
  MUS.saved = Array.isArray(saved.stations) ? saved.stations : (S.station ? [S.station] : []);
  MUS.names = saved.tapeNames || {};
  renderStations();
  updateCasFace();
  spUpdateAuthUi();
  spHandleRedirect();                      // just back from Spotify sign-in?
  S.mods = saved.mods || {};
  // paddle sounds were remapped (stock = silent, carbon slot = the real
  // recorded click, now the default): migrate pre-remap saves once
  if (!saved.padV2)
    for (const id in S.mods)
      if (S.mods[id].paddle === "stock" || S.mods[id].paddle === undefined)
        S.mods[id].paddle = "carbon";
  if (saved.lt) S.ltTgt = { kmh: saved.lt.kmh || 100, mph: saved.lt.mph || 60 };
  LT.best = saved.ltBest || {};

  CC = CARS.find(c => c.id === saved.car) || CARS[1];
  applyCar(CC);
  armCel();

  buildGauges();
  buildGarage();
  buildWorkshop();
  buildStudio();
  buildShiftLights();
  buildSeqViz();
  initShifter();
  initInput();
  refreshWorkshop();
  $("shiftLights").classList.toggle("show", !!CC.shiftLights);

  $("boostWrap").classList.toggle("hide", CC.asp === "na" || CC.asp === "ev" || CC.edrive);
  updateEdriveUi();
  document.querySelectorAll(".car-chip").forEach(b =>
    b.classList.toggle("on", b.dataset.car === CC.id));

  document.querySelectorAll(".swatch").forEach(s =>
    s.classList.toggle("active", s.dataset.t === document.body.dataset.theme));
  $("unitsBtn").textContent = S.units === "kmh" ? "KM/H" : "MPH";
  $("speedUnitLbl").textContent = S.units === "kmh" ? "km/h" : "mph";

  setMode(saved.mode || "auto");

  // rebuild dial faces once web fonts arrive (numerals use JetBrains Mono)
  if (document.fonts && document.fonts.ready)
    document.fonts.ready.then(() => { tachG.rebuild(); speedG.rebuild(); positionGlider(); });

  requestAnimationFrame(frame);
})();
