/* ================================================================
   DWNSHIFT — engine, drivetrain, audio synth, gauges, shifter
   ================================================================ */
"use strict";

/* ---------------- config ---------------- */

const DEFAULT_RATIOS = { R: -3.5, 1: 3.6, 2: 2.15, 3: 1.56, 4: 1.21, 5: 0.99, 6: 0.85 };

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
    curve: [[0, 90], [1500, 175], [4000, 295], [7000, 375], [9500, 415], [11500, 398],
            [12200, 368], [13000, 220]],
    mass: 930, finalDrive: 3.5, clutchCap: 560, cdA: 0.58, brakeMax: 15000,
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
    id: "veleno", name: "Veleno 6.5 V12", tag: "NA grand screamer", layout: "V12 · 6.5L",
    cyl: 12, idle: 900, max: 8900, cut: 9250, inertia: 0.20,
    curve: [[0, 140], [1000, 320], [3000, 480], [5000, 560], [7000, 600], [8000, 585],
            [8900, 540], [9600, 350]],
    mass: 1580, finalDrive: 3.4, clutchCap: 900, cdA: 0.62, brakeMax: 15000,
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
      formants: [[110, 0.9, 4.5], [480, 1.6, 5], [1150, 2.2, 5.5], [3000, 2.6, 6.5]],
      loadDrive: 0.55,
      noiseMul: 0.9, volTrim: 1.35, scream: 3000,
      drive: 0.75, pulseDepth: 0.15, pulseDiv: 1, raspMul: 1.4,
    },
  },
  {
    id: "kaminari", name: "Kaminari 13R", tag: "twin-rotor screamer", layout: "2-rotor · 1.3L",
    cyl: 4, idle: 850, max: 9000, cut: 9300, inertia: 0.13,  // near-zero rotating mass: revs instantly
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
    curve: [[0, 120], [700, 195], [1300, 255], [1900, 278], [2800, 258], [3600, 214],
            [4400, 150], [4800, 80]],
    mass: 1980, finalDrive: 3.9, clutchCap: 650, cdA: 0.75, brakeMax: 11000,
    asp: "turbo", pops: 0, boostMax: 0.75, spool: 1400, spoolRate: 3.0, psiMax: 26,
    tachMax: 5, redK: 4.4, kmhMax: 180, mphMax: 120, dial: "gear",
    sound: { layers: [["square", 1, 0.42], ["sawtooth", 0.5, 0.42], ["square", 1.51, 0.2], ["triangle", 3.02, 0.05]], noiseMul: 2.4, drive: 0.7, pulseDepth: 0.4, pulseDiv: 2, raspMul: 1.5 },
  },
  {
    id: "tempest", name: "Tempest MkIV", tag: "single big turbo", layout: "I6",
    cyl: 6, idle: 850, max: 7600, cut: 7800, inertia: 0.33,
    curve: [[0, 80], [1000, 148], [2500, 208], [4000, 238], [5500, 248], [6800, 236],
            [7600, 208], [8200, 130]],
    mass: 1450, finalDrive: 3.7, clutchCap: 700, cdA: 0.64, brakeMax: 12000,
    asp: "turbo", pops: 1, boostMax: 1.05, spool: 3400, spoolRate: 1.6, psiMax: 22,
    tachMax: 9, redK: 7.6, kmhMax: 320, mphMax: 200,
    sound: { layers: [["sawtooth", 1, 0.5], ["sawtooth", 2.02, 0.26], ["square", 0.5, 0.3], ["triangle", 4.04, 0.07]], noiseMul: 1.1, drive: 0.58, pulseDepth: 0.18, raspMul: 1.1 },
  },
  {
    id: "hellion", name: "Hellion 6.2 SC", tag: "supercharged muscle", layout: "V8",
    cyl: 8, idle: 680, max: 6400, cut: 6550, inertia: 0.44,
    curve: [[0, 150], [700, 318], [2000, 415], [3500, 468], [4800, 478], [5800, 452],
            [6400, 408], [6900, 280]],
    mass: 1760, finalDrive: 3.3, clutchCap: 820, cdA: 0.68, brakeMax: 12000,
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
    asp: "turbo", pops: 1.5, boostMax: 0.9, spool: 2200, spoolRate: 2.4, psiMax: 18,
    tachMax: 8, redK: 7, kmhMax: 320, mphMax: 200,
    sound: {
      layers: [["square", 0.5, 0.48, 0.2], ["sawtooth", 1, 0.4, 0.5], ["sawtooth", 1.49, 0.18],
               ["sawtooth", 2.01, 0.1, 0.3], ["triangle", 3.02, 0.06, 0.15]],
      noiseMul: 1.2, drive: 0.66, pulseDepth: 0.3, pulseDiv: 2, pulseType: "square",
      raspMul: 1.2, formants: [[150, 1, 4], [900, 1.8, 5]], loadDrive: 0.4,
    },
  },
  {
    id: "falkner", name: "Falkner S6", tag: "howling straight-six", layout: "I6 NA",
    cyl: 6, idle: 850, max: 8000, cut: 8250, inertia: 0.26,
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
    id: "hexen", name: "Hexen 5.2 FP", tag: "flat-plane screamer", layout: "V8 NA · flat-plane",
    cyl: 8, idle: 800, max: 8250, cut: 8500, inertia: 0.3,
    curve: [[0, 110], [800, 230], [3000, 380], [5000, 480], [6500, 530], [7500, 520],
            [8250, 480], [8900, 300]],
    mass: 1660, finalDrive: 3.73, clutchCap: 700, cdA: 0.65, brakeMax: 13000,
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
    id: "kaze", name: "Kaze 787", tag: "quad-rotor Le Mans legend", layout: "4-rotor · 2.6L",
    cyl: 8, idle: 1100, max: 9000, cut: 9300, inertia: 0.11,  // R26B: pure response
    curve: [[0, 120], [1500, 300], [3500, 450], [5000, 540], [6500, 608], [7800, 590],
            [9000, 555], [9700, 380]],
    mass: 830, finalDrive: 3.1, clutchCap: 800, cdA: 0.58, brakeMax: 16000,
    asp: "na", pops: 2.5, tachMax: 10, redK: 9, kmhMax: 360, mphMax: 240,
    dial: "gear", shiftLights: true,
    sound: {
      layers: [["sawtooth", 1, 0.4, 0.48], ["sawtooth", 2.02, 0.34, 0.5], ["sawtooth", 3.01, 0.14, 0.34],
               ["square", 0.5, 0.34, 0.12], ["sawtooth", 1.5, 0.08, 0.2]],
      noiseMul: 1.6, raspMul: 2.0, drive: 0.78, pulseDepth: 0.32, pulseType: "square",
      hunt: 1.8, idleBlat: true, scream: 3000, volTrim: 1.3,
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
    curve: [[0, 300], [800, 520], [2000, 760], [3000, 880], [4500, 900], [6000, 860],
            [7100, 780], [7600, 500]],
    mass: 1995, finalDrive: 2.0, clutchCap: 2600, cdA: 0.50, brakeMax: 17000,
    asp: "turbo", pops: 1, boostMax: 0.85, spool: 1800, spoolRate: 2.8, psiMax: 22,
    tachMax: 8, redK: 7.1, kmhMax: 520, mphMax: 320, dial: "classic",
    /* sixteen cylinders reads as a smooth, jet-like rush — half V12 silk,
       half turbine, with four turbos breathing over the top */
    sound: {
      layers: [["sine", 0.5, 0.42, 0.14], ["square", 0.5, 0.2, 0.08], ["sawtooth", 1, 0.44, 0.52],
               ["sawtooth", 1.004, 0.2, 0.28], ["sawtooth", 2.01, 0.1, 0.32],
               ["triangle", 3.02, 0.03, 0.2], ["sine", 4.5, 0, 0.12]],
      noiseMul: 1.0, drive: 0.6, pulseDepth: 0.12, raspMul: 0.9, volTrim: 1.15, scream: 2000,
      formants: [[100, 0.8, 4], [700, 1.5, 4.5], [2200, 2, 4]], loadDrive: 0.35,
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
  const tuned = !!m.tune;
  ENG.idle = c.idle;
  ENG.max = c.max + (tuned ? 400 : 0);            // race tune revs higher…
  ENG.cut = c.cut + (tuned ? 400 : 0);
  ENG.tqMul = tuned ? 1.25 : 1;                   // …and hits harder
  ENG.stall = Math.round(c.idle * 0.6); ENG.inertia = c.inertia; ENG.curve = c.curve;
  CAR.mass = c.mass;
  CAR.finalDrive = c.finalDrive * (m.gear || 1);  // workshop final drive
  CAR.ratios = c.ratios || DEFAULT_RATIOS;
  CAR.cdA = c.cdA; CAR.brakeMax = c.brakeMax; CAR.clutchCap = c.clutchCap;
  CAR.roll = Math.round(c.mass * 0.126);
}

const RATES = { thrUp: 4.6, thrDn: 5.6, brkUp: 7.5, brkDn: 6.0, cltUp: 9.0, cltDn: 2.0 };

/* ---------------- workshop modifications ---------------- */

const EXHAUSTS = {
  stock: {
    name: "Stock", desc: "Factory system. Clean and civil, as delivered.",
  },
  loud: {
    name: "Open Pipe", desc: "Barely muffled straight-through. Everything, much louder.",
    volMul: 1.45, driveAdd: 0.16, raspAdd: 0.45, popMul: 1.35,
  },
  screamer: {
    name: "Screamer", desc: "Thin-wall high-flow pipes. Rings bright and metallic up top.",
    volMul: 1.08, formantMul: 1.6, bright: 2400, raspAdd: 0.2, popMul: 1.1,
  },
  antilag: {
    name: "Anti-Lag", desc: "Fuel in the pipes. Bangs on every shift, flames, constant crackle.",
    volMul: 1.12, popMul: 1.7, burble: true, bright: 300, forcePops: 1.6,
  },
};

function curMod() {
  let m = S.mods[CC.id];
  if (!m) { m = { ex: "stock", pitch: 1, gear: 1, tune: false, abs: true }; S.mods[CC.id] = m; }
  if (m.gear === undefined) m.gear = 1;
  if (m.tune === undefined) m.tune = false;
  if (m.abs === undefined) m.abs = true;
  if (!EXHAUSTS[m.ex]) m.ex = "stock";     // repair saves hit by the old card bug
  return m;
}
function curEx() { return EXHAUSTS[curMod().ex] || EXHAUSTS.stock; }
/* effective pops rating — anti-lag makes any car bang */
function popsRating() {
  const ex = curEx();
  return ex.forcePops ? Math.max(CC.pops || 0, ex.forcePops) : (CC.pops || 0);
}

/* ---------------- state ---------------- */

const S = {
  mode: "auto", units: "kmh", muted: false,
  engineOn: false, cranking: false, stalled: false,
  rpm: 0, v: 0, odo: 0, boost: 0,
  gear: 0,                             // 0=N, 1..6, "R"
  autoSel: "P", autoGear: 1,
  in: { gas: 0, brake: 0, clutch: 0 }, // key/pointer targets
  throttle: 0, brake: 0, clutchPedal: 0,
  effThrottle: 0, engage: 0, locked: false,
  shiftCut: 0, shiftCool: 0, cutTimer: 0, blip: 0, catchT: 0,
  tunnel: false, flyby: false, flyX: -380, cabin: false, mods: {},
  spinV: 0, lockup: false,
  traffic: false, rain: false, passT: 2, splashT: 2,
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
  AU.popBus = ctx.createGain(); AU.popBus.gain.value = 1.3;
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

  // --- wind / road ---
  const wsrc = ctx.createBufferSource(); wsrc.buffer = nbuf; wsrc.loop = true; wsrc.playbackRate.value = 0.6;
  AU.wlp = ctx.createBiquadFilter(); AU.wlp.type = "lowpass"; AU.wlp.frequency.value = 250;
  AU.wGain = ctx.createGain(); AU.wGain.gain.value = 0;
  wsrc.connect(AU.wlp); AU.wlp.connect(AU.wGain); AU.wGain.connect(AU.master); wsrc.start();

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
  buildEngineVoice(CC);
  applyTunnel();
  applyCabin();
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
    const vr = Math.abs(S.v) * (-x) / r;           // closing speed toward listener
    dop = 343 / Math.max(80, 343 - vr);
    flyG = clamp(22 / r, 0.12, 1.5);
    flyP = clamp(x / 70, -0.95, 0.95);
    flyLp = clamp(26 / r, 0.45, 1);
  }
  AU.flyGain.gain.setTargetAtTime(flyG, t, 0.08);
  AU.flyPan.pan.setTargetAtTime(flyP, t, 0.08);

  const f0 = (rpm / 60) * (CC.cyl / 2) * curMod().pitch * dop;   // firing freq × pitch × Doppler
  const rFrac = clamp(rpm / ENG.max, 0, 1);
  const gCurve = Math.pow(rFrac, 1.6);             // how far "up the rev range" the voice is
  for (const L of AU.oscs) {
    // each voice wanders independently — fast flutter plus a slow random-walk
    // drift; coherent motion sounds digital, independent motion sounds alive
    L.dr = Math.max(-0.004, Math.min(0.004, (L.dr || 0) * 0.99 + (Math.random() - 0.5) * 0.0008));
    const jit = 1 + L.dr + (Math.random() - 0.5) * 0.004;
    L.o.frequency.setTargetAtTime(Math.max(8, f0 * L.mult * jit), t, k);
    if (L.gHi !== L.gLo)
      L.g.gain.setTargetAtTime(L.gLo + (L.gHi - L.gLo) * gCurve, t, 0.06);
  }

  const running = S.engineOn && !S.cranking;
  const load = S.effThrottle;
  const onCam = CC.camAt && rpm > CC.camAt;        // VTEC-style switchover
  const trim = (CC.sound.volTrim || 1) * (ex.volMul || 1);
  const blipBoost = S.blip > 0 ? 1.4 : 1;          // downshift blips shout
  const vol = running
    ? (CC.ev
        ? 0.02 + load * 0.14 + rFrac * 0.2        // EV: near-silent until it moves
        : 0.10 + load * 0.30 + rFrac * 0.13 + (onCam ? 0.04 : 0)) * trim * 0.8 * blipBoost
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
    (150 + load * 2700 + rpm * 0.45 + (onCam ? 1500 : 0) + (CC.sound.scream || 0) * rFrac * rFrac
      + (ex.bright || 0) + (S.blip > 0 ? 1500 : 0)) * flyLp,
    t, k);

  const nMul = CC.sound.noiseMul || 1;
  const boostHiss = CC.asp === "turbo" ? S.boost * 0.09 : 0;
  AU.nGain.gain.setTargetAtTime(running ? (load * 0.10 + rpm / 90000) * nMul + boostHiss : 0, t, k);
  AU.nbp.frequency.setTargetAtTime(500 + rpm * 0.35, t, k);

  // forced-induction whine
  let wf = 800, wg = 0;
  if (running && CC.asp === "super") {
    // gear whine swells in hard at high rpm — quiet around town, screaming up top
    wf = Math.min(9500, f0 * CC.whineMult);
    wg = Math.pow(rpm / ENG.max, 2.6) * (0.04 + load * 0.09);
  } else if (running && CC.asp === "turbo") {
    wf = (500 + S.boost * 4200 + rpm * 0.15) * dop;
    wg = S.boost * 0.085;
  } else if (running && CC.asp === "hybrid") {
    // EV inverter whine: tracks road speed, sings under boost and regen
    wf = (220 + Math.abs(S.v) * 55 + rpm * 0.04) * dop;
    wg = S.boost * 0.05 + (S.brake > 0.2 && Math.abs(S.v) > 2 ? 0.045 : 0);
  } else if (running && CC.ev) {
    // the whole car IS the whine — pure rising inverter note
    wf = (400 + rpm * 0.35) * dop;
    wg = 0.02 + load * 0.045 + rFrac * 0.035 + (S.brake > 0.2 && Math.abs(S.v) > 2 ? 0.04 : 0);
  }
  AU.whine.frequency.setTargetAtTime(wf, t, k);
  AU.whineG.gain.setTargetAtTime(wg, t, 0.05);

  const sp = Math.abs(S.v);
  AU.wGain.gain.setTargetAtTime(Math.min(0.20, sp * 0.0035), t, 0.1);
  AU.wlp.frequency.setTargetAtTime(220 + sp * 26, t, 0.1);

  AU.grindGain.gain.setTargetAtTime(S.grinding ? 0.22 : 0, t, 0.02);

  // tire screech — spinning rubber or locked wheels
  const scAmt = clamp(S.spinV / 9, 0, 1) + (S.lockup ? 0.55 : 0);
  const scAudible = Math.abs(S.v) > 2 || S.spinV > 1 ? 1 : 0;
  AU.scG.gain.setTargetAtTime(Math.min(0.3, scAmt * 0.26) * scAudible, t, 0.05);
  AU.scBp.frequency.setTargetAtTime(800 + S.spinV * 35 + Math.random() * 120, t, 0.05);

  // ambience beds
  AU.trHumG.gain.setTargetAtTime(S.traffic ? 0.06 : 0, t, 0.3);
  // in the tunnel the rain muffles down — it's raining OUTSIDE, echoing in
  AU.rainG.gain.setTargetAtTime(S.rain ? (S.tunnel ? 0.05 : 0.095) : 0, t, 0.4);
  AU.rainFl.frequency.setTargetAtTime(S.tunnel ? 650 : 5200, t, 0.3);
  AU.rainLoG.gain.setTargetAtTime(S.rain ? (S.tunnel ? 0.012 : 0.03) : 0, t, 0.4);
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

function sfxStarter(dur) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  // cranking lump: sawtooth chopped by a square LFO — whirr-whirr-whirr
  const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = 50;
  o.frequency.linearRampToValueAtTime(58, t + dur);          // motor labors up
  const am = ctx.createOscillator(); am.type = "square"; am.frequency.value = 6.3;
  const amG = ctx.createGain(); amG.gain.value = 0.55;
  const base = ctx.createGain(); base.gain.value = 0.55;
  const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 380;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.36, t + 0.06);
  g.gain.setValueAtTime(0.36, t + dur - 0.08);
  g.gain.linearRampToValueAtTime(0.001, t + dur);
  am.connect(amG); amG.connect(base.gain);
  o.connect(base); base.connect(f); f.connect(g); g.connect(AU.master);
  o.start(t); am.start(t); o.stop(t + dur + 0.05); am.stop(t + dur + 0.05);
  // thin starter-motor gear whine on top
  const w = ctx.createOscillator(); w.type = "sine"; w.frequency.value = 940;
  w.frequency.linearRampToValueAtTime(1240, t + dur);
  const wg = ctx.createGain();
  wg.gain.setValueAtTime(0.001, t);
  wg.gain.linearRampToValueAtTime(0.035, t + 0.08);
  wg.gain.linearRampToValueAtTime(0.001, t + dur);
  w.connect(wg); wg.connect(AU.master); w.start(t); w.stop(t + dur + 0.05);
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

/* soft two-note power-on chime for the EV */
function sfxChime() {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  [[660, 0], [990, 0.14]].forEach(([hz, dt]) => {
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t + dt);
    g.gain.linearRampToValueAtTime(0.14, t + dt + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.45);
    o.connect(g); g.connect(AU.master); o.start(t + dt); o.stop(t + dt + 0.5);
  });
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

/* single exhaust pop — the building block of crackle & burble */
function sfxPop(amp, when) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = when || ctx.currentTime;
  amp = Math.min(1.3, amp * 2.0);         // hot — the output compressor catches the peaks
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf;
  n.playbackRate.value = 0.5 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = "lowpass";
  f.frequency.value = 260 + Math.random() * 380;
  const g = ctx.createGain();
  g.gain.setValueAtTime(amp, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.05 + Math.random() * 0.05);
  n.connect(f); f.connect(g); g.connect(AU.popBus);
  n.start(t); n.stop(t + 0.12);
  // sharp crack transient on top — real pops snap before they boom
  const c = ctx.createBufferSource(); c.buffer = AU.noiseBuf; c.playbackRate.value = 1.6;
  const cf = ctx.createBiquadFilter(); cf.type = "bandpass"; cf.frequency.value = 2400; cf.Q.value = 0.8;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(amp * 0.5, t);
  cg.gain.exponentialRampToValueAtTime(0.001, t + 0.018);
  c.connect(cf); cf.connect(cg); cg.connect(AU.popBus);
  c.start(t); c.stop(t + 0.03);
  if (Math.random() < 0.55) {             // deeper bang under some pops
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(85, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.07);
    const og = ctx.createGain();
    og.gain.setValueAtTime(amp * 0.85, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(og); og.connect(AU.popBus); o.start(t); o.stop(t + 0.11);
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
    if (amp > 0.25) setTimeout(() => popFlame(amp > 0.5), dt * 1000);
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

function computeEngage() {
  if (S.gear === 0) return 0;
  if (S.mode === "clutch") {
    // bite point: engagement begins at 25% pedal release, full at 75%
    return clamp(((1 - S.clutchPedal) - 0.25) / 0.5, 0, 1);
  }
  if (S.shiftCut > 0) return 0;
  if (CC.ev) return 1;                       // direct drive — torque from zero rpm
  // manual / auto: centrifugal-style auto clutch — cannot stall
  return clamp((S.rpm - ENG.idle * 1.1) / (ENG.idle * 0.9), 0, 1);
}

function stepPhysics(dt) {
  // pedal smoothing (keyboard is binary; ramps make it analog)
  S.throttle += clamp(S.in.gas - S.throttle, -RATES.thrDn * dt, RATES.thrUp * dt);
  S.brake += clamp(S.in.brake - S.brake, -RATES.brkDn * dt, RATES.brkUp * dt);
  S.clutchPedal += clamp(S.in.clutch - S.clutchPedal, -RATES.cltDn * dt, RATES.cltUp * dt);

  S.shiftCut = Math.max(0, S.shiftCut - dt);
  S.shiftCool = Math.max(0, S.shiftCool - dt);
  S.cutTimer = Math.max(0, S.cutTimer - dt);
  const blipWas = S.blip;
  S.blip = Math.max(0, S.blip - dt);

  // rev limiter
  if (S.rpm > ENG.cut) S.cutTimer = 0.07;

  // idle governor keeps the engine alive at no throttle (free or lightly loaded)
  let gov = 0;
  if (S.engineOn && !CC.ev) gov = clamp((ENG.idle + 60 - S.rpm) / 380, 0, 0.4);
  let eff = Math.max(S.throttle, gov);
  // downshift rev-match: full-throttle stab while the box is between gears
  if (S.blip > 0) eff = Math.max(eff, Math.min(1, S.blip / 0.12));
  // startup flare — first fires push the revs up before the idle settles
  S.catchT = Math.max(0, S.catchT - dt);
  if (S.catchT > 0) eff = Math.max(eff, 0.55 * Math.min(1, S.catchT / 0.4));
  if (S.cutTimer > 0 || (S.shiftCut > 0 && S.blip <= 0) || !S.engineOn) eff = 0;
  S.effThrottle = eff;

  // crackle as the blip closes
  if (blipWas > 0 && S.blip <= 0 && popsRating() > 0 && Math.random() < 0.9)
    sfxCrackle(popsRating() * (curEx().popMul || 1));

  // gentle idle hunt — a real engine never sits perfectly still
  if (S.engineOn && !S.cranking && eff < 0.12 && S.rpm < ENG.idle * 1.5)
    S.rpm += (Math.random() - 0.5) * 16 * (CC.sound.hunt || 1);

  // rotary idle chop: soft blats out the pipe at idle
  if (CC.sound.idleBlat && S.engineOn && !S.cranking && eff < 0.1 &&
      S.rpm < ENG.idle * 1.35 && Math.random() < dt * 1.5)
    sfxPop(0.09 + Math.random() * 0.07);

  // forced induction
  if (CC.asp === "turbo" && S.engineOn) {
    // turbo needs exhaust flow: spools with rpm + load, bleeds fast off-throttle
    let tgt = eff * clamp((S.rpm - CC.spool * 0.5) / (CC.spool * 1.1), 0, 1);
    // anti-lag keeps the charger lit even off-throttle
    if (curEx().burble)
      tgt = Math.max(tgt, 0.55 * clamp((S.rpm - CC.spool * 0.4) / CC.spool, 0, 1));
    const rate = tgt > S.boost ? CC.spoolRate : 4.2;
    S.boost += (tgt - S.boost) * Math.min(1, rate * dt);
    if (S._prevBoostEff > 0.5 && eff < 0.15 && S.boost > 0.35) {
      sfxBlowoff();                    // throttle slammed shut under boost
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
  if (S.engineOn) Te = torqueAt(S.rpm) * boostMul * ENG.tqMul * eff - (16 + S.rpm * 0.011) * (1 - eff);
  else Te = -(20 + S.rpm * 0.02);

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
  S.lockup = aidsOff && S.brake > 0.85 && Math.abs(S.v) > 6;
  let braking = S.brake * CAR.brakeMax + (S.mode === "auto" && S.autoSel === "P" ? 20000 : 0);
  if (S.lockup) braking *= 0.72;             // locked rubber stops worse

  const omegaToRpm = 60 / (2 * Math.PI);
  let driveF = 0;

  if (ratio === 0 || cap < 1) {
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
      const Tc = cap * Math.sign(slip) * clamp(Math.abs(slip) / 30, 0.35, 1);
      S.rpm += ((Te - Tc) / ENG.inertia) * omegaToRpm * dt;
      driveF = (Tc * ratio * CAR.eff) / CAR.wheelR;
    }
  }

  // tire grip: aids on = quiet traction-control clamp; aids off = wheelspin,
  // flaring revs and screeching rubber
  const gripMax = CAR.mass * 9.81 * 0.52 * (CC.grip || (CC.awd ? 1.8 : 1));
  if (S.gear !== 0 && S.gear !== "R" && driveF > gripMax) {
    if (aidsOff) {
      S.spinV = Math.min(28, S.spinV + ((driveF - gripMax) / (CAR.mass * 0.055)) * dt);
      driveF = gripMax * 0.72;               // spinning rubber pushes less
    } else {
      driveF = gripMax * 1.15;               // TC lets it slip just a little
    }
  }
  S.spinV = Math.max(0, S.spinV - (6 + S.spinV * 1.5) * dt * (driveF >= gripMax * 0.7 ? 0.35 : 1.6));
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
  if (S.engineOn && S.rpm < 200 && S.mode !== "clutch" && !CC.ev) S.rpm = Math.max(S.rpm, 200);

  // lift-off crackle & overrun burble (gated by pops rating + exhaust mod)
  const pr = popsRating(), pMul = curEx().popMul || 1;
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

  // flyby spectator: the car sweeps past a trackside listener over and over
  if (S.flyby) {
    const prevX = S.flyX;
    S.flyX += Math.abs(S.v) * dt;
    if (prevX < 0 && S.flyX >= 0 && Math.abs(S.v) > 12)
      sfxWhoosh(Math.min(0.75, Math.abs(S.v) * 0.007));
    if (S.flyX > 380) S.flyX = -380;
  }

  // automatic gearbox logic
  if (S.mode === "auto" && S.autoSel === "D" && S.engineOn && S.shiftCool <= 0 && !CC.ev) {
    const span = ENG.max - ENG.idle;
    const up = ENG.idle + span * (0.24 + S.throttle * 0.60);
    const dn = ENG.idle + span * (0.08 + S.throttle * 0.18);
    if (S.rpm > up && S.autoGear < 6) autoShift(S.autoGear + 1);
    else if (S.rpm < dn && S.autoGear > 1) autoShift(S.autoGear - 1);
  }
}

function autoShift(g) {
  const down = g < S.autoGear;
  S.autoGear = g; S.gear = g;
  S.shiftCut = 0.22; S.shiftCool = 0.55;
  if (down && S.engineOn && Math.abs(S.v) > 3) {
    S.blip = 0.18; S.shiftCut = 0.26;    // rev-match blip between gears
    if (popsRating() >= 1) {             // the bark as the throttle stabs open
      sfxPop(0.45);
      if (popsRating() >= 2) popFlame(true);
    }
  }
  if (curEx().burble && S.engineOn && S.rpm > ENG.idle * 2)
    sfxCrackle(1.2);                     // anti-lag bang on every shift
  sfxClunk(0.35);
  flashGear();
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

function toggleIgnition() {
  initAudio();
  if (AU.ctx && AU.ctx.state === "suspended") AU.ctx.resume();

  if (S.cranking) return;
  const seq = (S.crankSeq = (S.crankSeq || 0) + 1);
  if (S.engineOn) {
    S.engineOn = false;
    sfxClunk(0.5);
    updateRunLamp();
    return;
  }
  // EV: no starter motor — just power up with a chime
  if (CC.ev) {
    S.engineOn = true; S.stalled = false;
    S.rpm = 0; S.sweep = 0;
    $("stallOverlay").classList.remove("show");
    $("lampStall").classList.remove("lit", "blink");
    sfxChime();
    updateRunLamp();
    return;
  }
  // crank
  S.cranking = true; S.stalled = false;
  $("stallOverlay").classList.remove("show");
  $("lampStall").classList.remove("lit", "blink");
  const btn = $("ignition");
  btn.classList.add("cranking");
  sfxStarter(0.75);
  const crank0 = performance.now();
  const crankAnim = () => {
    if (!S.cranking) return;
    S.rpm = 260 + Math.sin((performance.now() - crank0) / 45) * 60;
    requestAnimationFrame(crankAnim);
  };
  crankAnim();
  setTimeout(() => {
    if (S.crankSeq !== seq || !S.cranking) return;   // car was swapped mid-crank
    S.cranking = false;
    btn.classList.remove("cranking");
    S.engineOn = true;
    S.rpm = 260;                        // catches from cranking speed…
    S.catchT = 0.55;                    // …and flares up on first fires
    for (const ms of [90, 200, 340])    // rough first combustion pops
      setTimeout(() => { if (S.engineOn) sfxPop(0.10 + Math.random() * 0.08); }, ms);
    S.sweep = 0;                        // needle sweep
    updateRunLamp();
  }, 780);
}

function updateRunLamp() {
  $("ignition").classList.toggle("running", S.engineOn);
  $("lampRun").classList.toggle("lit", S.engineOn);
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
  return {
    face: cssVar("--face"), faceHi: mixUp(cssVar("--face")),
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
  restX: 100,
  x: 100, y: 150,
  dragging: false,
  gearMap: [[1, 2], [3, 4], [5, 6], [null, "R"]],
};

function buildGateSvg() {
  const svg = $("gateSvg");
  const slot = (x, y, w, h) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="rgba(0,0,0,0.42)" stroke="rgba(0,0,0,0.5)" stroke-width="1"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1" transform="translate(0,1.5)"/>`;
  let s = "";
  s += slot(GATE.cols[0] - 10, GATE.chanY - 9, GATE.cols[3] - GATE.cols[0] + 20, 18);
  for (let i = 0; i < 3; i++) s += slot(GATE.cols[i] - 9, GATE.topY - 10, 18, GATE.botY - GATE.topY + 20);
  s += slot(GATE.cols[3] - 9, GATE.chanY - 9, 18, GATE.botY - GATE.chanY + 19);
  svg.innerHTML = s;

  const labels = $("gateLabels");
  const L = [["1", 0, GATE.topY - 28], ["3", 1, GATE.topY - 28], ["5", 2, GATE.topY - 28],
             ["2", 0, GATE.botY + 28], ["4", 1, GATE.botY + 28], ["6", 2, GATE.botY + 28],
             ["R", 3, GATE.botY + 28]];
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
  if (!silentClunk) sfxClunk(g === 0 ? 0.4 : 0.9);
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

/* ←/→ throw straight to the previous/next gear: release, cross the
   channel to the right column, then engage — animated in two stages */
let kbSeqToken = 0;
function kbSeqGate(d) {
  if (S.mode !== "clutch" || GATE.dragging) return;
  const order = ["R", 0, 1, 2, 3, 4, 5, 6];
  const i = order.indexOf(S.gear);
  const j = clamp(i + d, 0, order.length - 1);
  if (i === j) return;
  const target = order[j];

  if (target === 0) {                        // back to neutral — no clutch needed
    setGear(0, true);
    setStick(GATE.cols[kbColIndex()], GATE.chanY, true);
    sfxClunk(0.3);
    return;
  }

  const ci = target === "R" ? 3 : GATE.gearMap.findIndex(p => p.includes(target));
  const slot = target === "R" ? 1 : (GATE.gearMap[ci][0] === target ? 0 : 1);
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

/* ↑/↓ engage or release a gear in the current column, same rules as dragging */
function kbShift(dir) {                      // dir -1 = up slot, +1 = down slot
  if (S.mode !== "clutch" || GATE.dragging) return;
  const ci = kbColIndex();

  if (S.gear !== 0) {
    // pulling back toward the channel releases to neutral (no clutch needed)
    const inTop = GATE.y < GATE.chanY;
    if ((inTop && dir === 1) || (!inTop && dir === -1)) {
      setGear(0, true);
      setStick(GATE.cols[ci], GATE.chanY, true);
      sfxClunk(0.3);
    }
    return;
  }

  const target = GATE.gearMap[ci][dir === -1 ? 0 : 1];
  if (target === null) return;               // no 7th gear
  const clutchOK = !S.engineOn || S.clutchPedal > 0.55;
  const reverseOK = target !== "R" || Math.abs(S.v) < 1.6;
  if (!clutchOK || !reverseOK) {
    // bounce off the mouth of the slot — grind
    gateGrind(true);
    setStick(GATE.cols[ci], GATE.chanY + dir * (GATE.chanHalf + 8), true);
    setTimeout(() => {
      gateGrind(false);
      if (S.gear === 0 && !GATE.dragging) setStick(GATE.cols[kbColIndex()], GATE.chanY, true);
    }, 260);
    return;
  }
  setGear(target);
  setStick(GATE.cols[ci], dir === -1 ? GATE.topY : GATE.botY, true);
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

const SEQ_ORDER = ["R", 0, 1, 2, 3, 4, 5, 6];

function buildSeqViz() {
  const viz = $("seqViz");
  viz.innerHTML = SEQ_ORDER.map(g =>
    `<div class="seq-cell" data-g="${g}"><span>${g === 0 ? "N" : g}</span><span class="bar"></span></div>`).join("");
}

function seqHighlight() {
  document.querySelectorAll(".seq-cell").forEach(el =>
    el.classList.toggle("on", el.dataset.g === String(S.gear)));
}

function seqShift(dir) {
  if (S.mode !== "manual") return;
  const i = SEQ_ORDER.indexOf(S.gear);
  const j = clamp(i + dir, 0, SEQ_ORDER.length - 1);
  if (i === j) return;
  const target = SEQ_ORDER[j];
  if (target === "R" && Math.abs(S.v) > 1.6) {      // refuse reverse at speed
    sfxClunk(0.3);
    return;
  }
  S.shiftCut = 0.18;
  setGear(target);
  if (dir < 0 && target !== 0 && target !== "R" && S.engineOn && Math.abs(S.v) > 3) {
    S.blip = 0.22; S.shiftCut = 0.26;    // heel-toe blip on the way down
    if (popsRating() >= 1) {             // the bark as the throttle stabs open
      sfxPop(0.5);
      if (popsRating() >= 2) popFlame(true);
    }
  }
  if (curEx().burble && S.engineOn && S.rpm > ENG.idle * 2)
    sfxCrackle(1.2);                     // anti-lag bang on every shift
  seqHighlight();
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
  const ids = big ? ["tipL", "tipR"] : [Math.random() < 0.5 ? "tipL" : "tipR"];
  for (const id of ids) {
    const el = $(id);
    el.classList.remove("fire"); void el.offsetWidth; el.classList.add("fire");
    setTimeout(() => el.classList.remove("fire"), 190);
  }
  if (big || Math.random() < 0.35) {
    const gl = $("fireglow");
    gl.classList.remove("on"); void gl.offsetWidth; gl.classList.add("on");
  }
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
    { auto: "SELECTOR", manual: "SEQUENTIAL BOX", clutch: "6-SPEED GATE" }[mode];
  $("consoleHint").innerHTML =
    { auto: "P · R · N · D", manual: "clutchless — revs are matched for you",
      clutch: "hold <kbd>SPACE</kbd> · drag the stick or use arrow keys" }[mode];
  $("bayModeNote").innerHTML =
    { auto: "Two pedals. Select <b>D</b> and go.",
      manual: "Shift with <kbd>Q</kbd>/<kbd>E</kbd> — no clutch needed.",
      clutch: "Clutch in, then drag the stick or tap the arrows. Slip it to launch — dump it and you'll stall." }[mode];

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
    <button class="car-chip" data-car="${c.id}">
      <span class="cc-name">${c.name}</span>
      <span class="cc-meta">${c.layout} · ${c.tag}</span>
      <span class="cc-badges">
        <i>${(c.max / 1000).toFixed(1)}k rpm</i>
        <i class="asp">${ASP_LABEL[c.asp]}</i>
      </span>
    </button>`).join("");
  document.querySelectorAll(".car-chip").forEach(b =>
    b.addEventListener("click", () => selectCar(b.dataset.car)));
}

function selectCar(id) {
  const car = CARS.find(c => c.id === id) || CARS[1];
  CC = car;
  applyCar(car);

  // full reset — new car arrives parked, engine off
  S.crankSeq = (S.crankSeq || 0) + 1;
  S.cranking = false; S.engineOn = false; S.stalled = false;
  S.rpm = 0; S.v = 0; S.boost = 0; S.locked = false;
  S.gear = 0; S.autoSel = "P"; S.autoGear = 1;
  S.shiftCut = 0; S.shiftCool = 0; S.cutTimer = 0; S.blip = 0; S.catchT = 0; S.sweep = -1;
  S.spinV = 0; S.lockup = false;
  S.needle.rpm = 0; S.needle.rpmV = 0; S.needle.spd = 0; S.needle.spdV = 0;

  $("ignition").classList.remove("cranking");
  updateRunLamp();
  $("stallOverlay").classList.remove("show");
  $("lampStall").classList.remove("lit", "blink");
  document.querySelectorAll(".prnd button").forEach(b =>
    b.classList.toggle("on", b.dataset.sel === "P"));
  document.querySelectorAll(".gate-labels span").forEach(el => el.classList.remove("on"));
  if (S.mode === "clutch") setStick(GATE.restX, GATE.chanY, false);
  if (S.mode === "manual") seqHighlight();
  flashGear();

  $("boostWrap").classList.toggle("hide", car.asp === "na" || car.asp === "ev");
  $("boostWrap").querySelector("label").textContent =
    car.asp === "hybrid" ? "E-BOOST %" : "BOOST PSI";
  $("shiftLights").classList.toggle("show", !!car.shiftLights);
  document.querySelectorAll(".car-chip").forEach(b =>
    b.classList.toggle("on", b.dataset.car === car.id));

  tachG.rebuild(); speedG.rebuild();
  if (AU.ready) buildEngineVoice(car);
  refreshWorkshop();
  save();
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
  $("wsPitch").addEventListener("input", () => {
    curMod().pitch = parseFloat($("wsPitch").value);
    $("wsPitchVal").textContent = fmtPitch();
    save();
  });
  $("wsGear").addEventListener("input", () => {
    curMod().gear = parseFloat($("wsGear").value);
    applyCar(CC);
    $("wsGearVal").textContent = CAR.finalDrive.toFixed(2);
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

function refreshWorkshop() {
  $("wsCar").textContent = CC.name;
  document.querySelectorAll("#wsExhausts .ws-card").forEach(b =>
    b.classList.toggle("on", b.dataset.ex === curMod().ex));
  $("cabinBtn").classList.toggle("on", S.cabin);
  $("trafBtn").classList.toggle("on", S.traffic);
  $("rainBtn").classList.toggle("on", S.rain);
  $("wsPitch").value = curMod().pitch;
  $("wsPitchVal").textContent = fmtPitch();
  $("wsGear").value = curMod().gear;
  $("wsGearVal").textContent = (CC.finalDrive * curMod().gear).toFixed(2);
  $("wsTune").classList.toggle("on", curMod().tune);
  const aidsOn = curMod().abs !== false;
  $("wsAids").classList.toggle("on", aidsOn);
  $("wsAids").querySelector(".ws-card-name").textContent =
    "DRIVER AIDS — " + (aidsOn ? "ON" : "OFF");
  $("modBtn").classList.toggle("on",
    curMod().ex !== "stock" || curMod().pitch !== 1 || curMod().gear !== 1 ||
    curMod().tune || !aidsOn);
}

function openWorkshop() { refreshWorkshop(); $("workshop").classList.add("open"); }
function closeWorkshop() { $("workshop").classList.remove("open"); }

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
  save();
}

function save() {
  try {
    localStorage.setItem("dwnshift", JSON.stringify({
      theme: document.body.dataset.theme, units: S.units, mode: S.mode, muted: S.muted,
      car: CC.id, tunnel: S.tunnel, flyby: S.flyby, cabin: S.cabin, mods: S.mods,
      traffic: S.traffic, rain: S.rain,
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
    switch (e.code) {
      case "KeyW": S.in.gas = down ? 1 : 0; return true;
      case "KeyS": S.in.brake = down ? 1 : 0; return true;
      case "ArrowUp":
        if (S.mode === "clutch") { if (down && !e.repeat) kbShift(-1); return true; }
        S.in.gas = down ? 1 : 0; return true;
      case "ArrowDown":
        if (S.mode === "clutch") { if (down && !e.repeat) kbShift(1); return true; }
        S.in.brake = down ? 1 : 0; return true;
      case "ArrowLeft":
        if (S.mode === "clutch") { if (down && !e.repeat) kbSeqGate(-1); return true; }
        return false;
      case "ArrowRight":
        if (S.mode === "clutch") { if (down && !e.repeat) kbSeqGate(1); return true; }
        return false;
      case "KeyT": if (down && !e.repeat) $("tunnelBtn").click(); return true;
      case "KeyF": if (down && !e.repeat) $("flybyBtn").click(); return true;
      case "KeyV": if (down && !e.repeat) $("cabinBtn").click(); return true;
      case "Space": case "KeyC":
        if (S.mode === "clutch") { S.in.clutch = down ? 1 : 0; return true; }
        return e.code === "Space";      // still swallow space (page scroll)
      case "KeyE": if (down && !e.repeat) seqShift(1); return true;
      case "KeyQ": if (down && !e.repeat) seqShift(-1); return true;
      case "KeyI": if (down && !e.repeat) toggleIgnition(); return true;
      case "Escape": if (down) closeWorkshop(); return false;
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

  $("ignition").addEventListener("click", toggleIgnition);

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
    save();
  });

  $("cabinBtn").addEventListener("click", () => {
    initAudio();
    if (AU.ctx && AU.ctx.state === "suspended") AU.ctx.resume();
    S.cabin = !S.cabin;
    $("cabinBtn").classList.toggle("on", S.cabin);
    applyCabin();
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
    applyTunnel();
    save();
  });

  $("muteBtn").addEventListener("click", () => {
    S.muted = !S.muted;
    $("muteBtn").classList.toggle("muted", S.muted);
    if (AU.ready) AU.master.gain.setTargetAtTime(S.muted ? 0 : 0.85, AU.ctx.currentTime, 0.05);
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

  acc += dt;
  while (acc >= STEP) { stepPhysics(STEP); acc -= STEP; }

  audioTick();

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
  if (saved.theme) document.body.dataset.theme = saved.theme;
  S.units = saved.units || "kmh";
  S.muted = !!saved.muted;
  $("muteBtn").classList.toggle("muted", S.muted);
  S.tunnel = !!saved.tunnel;
  $("tunnelBtn").classList.toggle("on", S.tunnel);
  S.flyby = !!saved.flyby;
  $("flybyBtn").classList.toggle("on", S.flyby);
  S.cabin = !!saved.cabin;
  $("cabinBtn").classList.toggle("on", S.cabin);
  S.traffic = !!saved.traffic;
  $("trafBtn").classList.toggle("on", S.traffic);
  S.rain = !!saved.rain;
  $("rainBtn").classList.toggle("on", S.rain);
  S.mods = saved.mods || {};

  CC = CARS.find(c => c.id === saved.car) || CARS[1];
  applyCar(CC);

  buildGauges();
  buildGarage();
  buildWorkshop();
  buildShiftLights();
  buildSeqViz();
  initShifter();
  initInput();
  refreshWorkshop();
  $("shiftLights").classList.toggle("show", !!CC.shiftLights);

  $("boostWrap").classList.toggle("hide", CC.asp === "na" || CC.asp === "ev");
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
