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
    sound: {
      // a 1.0 triple thrums, it doesn't sing
      f0Mul: 0.8, air: 0, jitter: 1.6,
      layers: [["sawtooth", 1, 0.42], ["square", 0.5, 0.38], ["triangle", 2.01, 0.16]], noiseMul: 0.8, drive: 0.55, pulseDepth: 0.2, pulseDiv: 1.5, raspMul: 0.9 },
  },
  {
    id: "peel", name: "Peel Pico", tag: "10 horsepower. all of them.", layout: "1-cyl · 49cc",
    indicator: "relay",   // one relay, and you can hear it think
    cyl: 1, idle: 1700, max: 6800, cut: 7000, inertia: 0.05, noPop: true,
    curve: [[0, 7], [1700, 10], [3500, 13], [5200, 14], [6200, 12], [6800, 10], [7200, 6]],
    mass: 120, finalDrive: 4.8, clutchCap: 25, cdA: 0.8, brakeMax: 1500,
    asp: "na", pops: 0, tachMax: 7, redK: 6.8, kmhMax: 100, mphMax: 60, dial: "classic",
    /* a lawnmower with dreams: hard single-cylinder putt-putt-putt */
    sound: {
      // 49cc. it is supposed to be annoying.
      f0Mul: 1.0, air: 2, jitter: 1.7,
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
    sound: {
      // a screamer, but an inline-four is not a violin
      f0Mul: 0.92, air: 1.5, jitter: 1.2,
      layers: [["sawtooth", 1, 0.5], ["sawtooth", 2.02, 0.3], ["square", 0.5, 0.22], ["triangle", 3.03, 0.14]], noiseMul: 1, drive: 0.56, pulseDepth: 0.15, raspMul: 1.1 },
  },
  {
    id: "strada", name: "Strada Corsa V10", tag: "formula screamer", layout: "V10",
    race: true,   // formula car: no lights, no road registration
    cyl: 10, idle: 1400, max: 12200, cut: 12500, inertia: 0.16,
    bootRich: true,          // full supercar dash boot on the key
    start: { rpm: 280, dur: 0.6,  fires: 4, flare: 1.0,  flareT: 0.9 },
    curve: [[0, 90], [1500, 175], [4000, 295], [7000, 375], [9500, 415], [11500, 398],
            [12200, 368], [13000, 220]],
    shiftLag: 0.075,              // single-clutch ASG: it takes a proper beat, and you hear it
    mass: 930, finalDrive: 3.5, clutchCap: 560, cdA: 0.58, brakeMax: 15000,
    grip: 1.9,                                    // slicks — launches at nearly 1g
    tire: 1.6, rawCabin: 1,                       // open cockpit: there is no "inside"
    asp: "na", pops: 2, tachMax: 13, redK: 12.2, kmhMax: 360, mphMax: 240, shiftLights: true,
    sound: {
      // a formula engine IS this bright. all of it stays.
      f0Mul: 1.0, air: 3, jitter: 0.9,
      layers: [["sawtooth", 1, 0.48], ["sawtooth", 1.98, 0.3, 0.42], ["sawtooth", 3.02, 0.1, 0.32],
               ["square", 0.5, 0.22, 0.06]],
      formants: [[400, 1.5, 3], [3200, 3, 6]],
      noiseMul: 0.9, volTrim: 1.1, scream: 2200, drive: 0.6, pulseDepth: 0.12, raspMul: 1.25,
      loadDrive: 0.35,
    },
  },
  {
    id: "t50", name: "Dunsfold T.50", tag: "12,100 rpm V12 · ground-effect fan", layout: "V12 · 3.9L NA · 986kg",
    indicator: "luxury",   // obsessively damped, like the rest of it
    cyl: 12, idle: 1000, max: 11500, cut: 12100, inertia: 0.09,   // lightest crank ever fitted to a road car
    bootRich: true,          // full supercar dash boot on the key
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
      // 12,100rpm of hyper-precise shriek
      f0Mul: 1.0, air: 3, jitter: 0.8,
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
      drive: 0.62, pulseDepth: 0.1, raspMul: 1.1,
    },
  },
  {
    id: "veleno", name: "Maranello 812", tag: "front-engined V12 thoroughbred", layout: "V12 · 6.5L NA",
    indicator: "luxury",   // front-engined GT: deep and damped
    cyl: 12, idle: 900, max: 8900, cut: 9250, inertia: 0.20,
    bootRich: true,          // full supercar dash boot on the key
    start: { rpm: 235, dur: 0.72, fires: 4, flare: 0.88, flareT: 0.9 },
    curve: [[0, 140], [1000, 320], [3000, 480], [5000, 560], [7000, 600], [8000, 585],
            [8900, 540], [9600, 350]],
    shiftLag: 0.045,              // 7-speed twin-clutch behind the axle
    mass: 1580, finalDrive: 3.4, clutchCap: 900, cdA: 0.62, brakeMax: 15000,
    grip: 1.8,                                    // fat rear rubber — ~3s to 60
    asp: "na", pops: 2.2, tachMax: 10, redK: 8.9, kmhMax: 360, mphMax: 240, dial: "classic",
    shiftLights: true,
    /* voice morphs with rpm: silky sub burble at idle → bass-heavy rumble low
       down → metallic intake howl mid-range → razor-sharp F1 wail at the top.
       Formants model a straight-pipe system: chest boom, mid bark, metallic ring. */
    sound: {
      // still a screamer, an octave less brittle
      f0Mul: 0.95, air: 1.5, jitter: 1.0,
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
    id: "fiorano599", name: "Maranello 599 GTB", tag: "the last analogue V12 · F1 single-clutch", layout: "V12 · 6.0L NA",
    indicator: "luxury",     // mid-2000s front-engined GT
    crackle: "dry",          // no cats' worth of muffling, no turbos to soak it up
    ignKey: true,            // a starter button on the wheel, but an old-school ECU behind it
    twoStage: true,          // 2006: key on, listen to the pumps prime, THEN press it
    cyl: 12, idle: 950, max: 8400, cut: 8600, inertia: 0.21,   // a hair heavier than the 812's, and no more
    start: { rpm: 250, dur: 0.85, fires: 5, flare: 0.82, flareT: 1.0, grit: 0.9 },
    /* The F140 in its first, angriest state of tune. 620hp at 7600, and — the
       part that matters — 608Nm at 5600 and not much below it. This engine
       does not have the low-down shove a modern turbo V12 fakes; you have to
       take it to 6000 before anything happens, and that is exactly why it is
       remembered the way it is. */
    curve: [[0, 150], [1000, 340], [2500, 480], [4000, 560], [5600, 608], [7000, 602],
            [7600, 585], [8400, 505], [8800, 330]],
    /* The F1 SUPERFAST single-clutch: one clutch, opened and closed by a
       hydraulic robot, on a normal manual gearbox. It cannot overlap ratios
       the way a twin-clutch does, so every shift is a real interruption with
       a real mechanical event at the end of it — a bang through the whole
       car. Slower than a DCT on paper and infinitely better to listen to,
       which is the entire reason this car is here. */
    mechBox: true, shiftLag: 0.055,
    ratios: { R: -3.2, 1: 3.15, 2: 2.06, 3: 1.52, 4: 1.18, 5: 0.94, 6: 0.76 },
    mass: 1690, finalDrive: 4.19, clutchCap: 900, cdA: 0.66, brakeMax: 14500,
    grip: 1.55,                                   // 2006 rubber, and all the weight up front
    asp: "na", pops: 1.8, tachMax: 9, redK: 8.4, kmhMax: 340, mphMax: 210,
    dial: "classic", dash: { accent: "#d8b24a", face: "dark" },
    /* WHY THIS DOESN'T SOUND LIKE THE 812.

       Same family of engine, twenty years apart, and the difference is almost
       entirely things that were ADDED later. A modern V12 is sealed: long
       tuned runners, big pre-cats, a resonator in the airbox, active flaps in
       the exhaust, and rubber between the engine and everything else. All of
       that exists to remove exactly the noises this car still makes.

       So the voice here is built the other way round. The fundamental and the
       low orders carry less; the MECHANICAL content carries more — a hard
       upper-order edge that never fully smooths out, a wide-open half-order
       clatter, big induction noise, and a rasp that stays in the room instead
       of being tucked behind the note. Lower formants than the 812 (a shorter,
       fatter, less tuned exhaust rings lower), a much rougher jitter (older
       tolerances, older mounts), and nothing polished on top. It should sound
       like machinery doing something difficult, not like a car singing. */
    sound: {
      f0Mul: 0.92, air: 1.5, jitter: 1.35,       // mechanical, but the note still has to be clean
      layers: [
        ["square",   0.5,   0.28, 0.10],   // valvetrain/gear clatter at idle
        ["sine",     0.5,   0.22, 0.07],   // just enough chest
        ["sawtooth", 0.994, 0.24, 0.28],   // unison low — wider detune than modern
        ["sawtooth", 1,     0.46, 0.46],   // centre voice
        ["sawtooth", 1.008, 0.24, 0.28],   // unison high
        ["sawtooth", 1.5,   0.18, 0.30],   // half-order — the raw one, wide open
        ["sawtooth", 2.01,  0.20, 0.46],   // 2nd order — hard, never smooths
        ["sawtooth", 3.03,  0.10, 0.40],   // 3rd — induction snarl over the top
        ["square",   4.04,  0.04, 0.20],   // mechanical edge, deliberately unmusical
        ["triangle", 5.05,  0.0,  0.14],
      ],
      // a short, fat, barely-tuned 2006 exhaust rings LOW and broad
      formants: [[135, 0.9, 5], [640, 1.4, 5.5], [1750, 1.7, 5], [3600, 2.0, 3.5]],
      loadDrive: 0.55, noiseMul: 1.7, volTrim: 1.3, scream: 3000,
      drive: 0.74, pulseDepth: 0.3, raspMul: 1.75, hunt: 1.6,
    },
  },
  {
    id: "purosangue", name: "Maranello Purosangue", tag: "the V12 that carries four", layout: "V12 · 6.5L NA · AWD",
    indicator: "luxury",   // four doors and a family: the stalk is damped
    cyl: 12, idle: 850, max: 8250, cut: 8350, inertia: 0.30,   // heavier crank than the 812
    bootRich: true,          // full supercar dash boot on the key
    awd: true,               // front power take-off, driven off the crank nose
    start: { rpm: 230, dur: 0.66, fires: 4, flare: 0.72, flareT: 0.95 },
    /* 725 cv at 7750, 716 Nm at 6250 — the F140IA is the 812's engine with a
       longer, flatter delivery and a particulate filter in the way. 80% of
       torque is there by 2100rpm, which is the whole trick: it never feels
       like it's straining to move two tonnes. */
    curve: [[0, 200], [1000, 400], [2100, 570], [4000, 660], [6250, 716], [7750, 690],
            [8250, 630], [8800, 410]],
    // 8-speed DCT squeezed into six ratios; tall final drive, it's a GT
    ratios: { R: -3.2, 1: 3.4, 2: 2.2, 3: 1.6, 4: 1.24, 5: 1.0, 6: 0.82 },
    shiftLag: 0.05,               // 8-speed twin-clutch, unhurried about it
    mass: 2033, finalDrive: 3.6, clutchCap: 1500, cdA: 0.78, brakeMax: 17500,
    grip: 1.95,                                   // AWD off the line, but it's heavy
    asp: "na", pops: 1.4, tachMax: 9, redK: 8.25, kmhMax: 320, mphMax: 200,
    dial: "classic", shiftLights: true, dash: { accent: "#c0392b" },
    /* the same 65° V12 as the 812, heard through a car built to be lived in.
       Everything the 812 screams, this one SAYS: the chest-deep bottom end is
       actually bigger (more body, more mass to resonate through), the mid is
       just as hard, but the particulate filter and the long, quiet exhaust
       route shave the razor off the top — the wail is still there at eight
       grand, it's just wearing a coat. Lower scream, softer rasp, a touch of
       lpMul so the very top never turns metallic. */
    sound: {
      // a big GT, and the GPF takes the edge off
      f0Mul: 0.92, air: 0, jitter: 1.1,
      layers: [
        ["sine",     0.25,  0.18, 0.04],   // half-order swell under the idle
        ["sine",     0.5,   0.34, 0.13],   // deep chest — a big car's body
        ["square",   0.5,   0.20, 0.05],   // faint gravel, gone by 3k
        ["sawtooth", 0.996, 0.22, 0.28],   // unison low…
        ["sawtooth", 1,     0.46, 0.50],   // …center voice…
        ["sawtooth", 1.005, 0.22, 0.28],   // …unison high — tight V12 chorus
        ["sawtooth", 1.5,   0.10, 0.24],   // twelve-cylinder density between fires
        ["sawtooth", 2.01,  0.13, 0.36],   // exhaust hardens through the middle
        ["sine",     2.5,   0.04, 0.20],   // roundness, not harshness
        ["sawtooth", 3.02,  0.04, 0.24],   // intake howl — GPF-damped vs the 812
        ["triangle", 4.5,   0.0,  0.18],   // the wail, smoothed
        ["sine",     6.02,  0.0,  0.08],   // a whisper of air at the redline
      ],
      formants: [[100, 0.85, 4.5], [460, 1.5, 5], [1100, 2.0, 5], [3000, 2.3, 6]],
      loadDrive: 0.5, noiseMul: 0.85, volTrim: 1.18, scream: 2600,
      drive: 0.7, pulseDepth: 0.14, raspMul: 1.1, lpMul: 0.9,
    },
  },
  {
    id: "gintani", name: "Sant'Agata SVJ Gintani", tag: "straight-pipe V12 · fireworks", layout: "V12 · 6.5L open pipes",
    crackle: "hard",   // open pipes, no muffling left to soften anything
    cyl: 12, idle: 950, max: 9000, cut: 9350, inertia: 0.19, shiftLights: true,
    bootRich: true,          // full supercar dash boot on the key
    start: { rpm: 232, dur: 0.92, fires: 5, flare: 1.0, flareT: 1.2, whine: 1290 },
    curve: [[0, 150], [1000, 335], [3000, 500], [5000, 585], [7000, 625], [8000, 610],
            [9000, 560], [9700, 360]],
    shiftLag: 0.09,               // single-clutch ISR: a violent, obvious pause
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
      // open pipes, and you can hear every one
      f0Mul: 1.0, air: 2, jitter: 1.3,
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
      drive: 0.9, pulseDepth: 0.22, raspMul: 2.0, hunt: 1.3,
    },
  },
  {
    id: "huayrar", name: "San Cesario R", tag: "the best-sounding car in the world", layout: "V12 · 6.0L NA · open megaphone",
    race: true,   // track-only: never had indicators to begin with
    crackle: "dry",   // open megaphones ring rather than thump
    /* 6.0 bespoke race V12, 850hp at 8,250 and a 9,000 redline.

       `inertia` was at 0.075 and that was wrong, in the way that "technically
       defensible" is often wrong. Six litres of steel crank, twelve rods,
       twenty-four valves and a clutch pack is not a superbike; a race V12 is
       responsive relative to a ROAD V12, not relative to nothing. At 0.075
       the needle teleported and the whole car went past before you could hear
       any of it — and the point of this car is that you get to listen to it.
       0.15 still crosses the range in about a third of a second, which is
       fast enough to snap and slow enough that the climb is an EVENT with a
       shape you can follow. */
    cyl: 12, idle: 1150, max: 9000, cut: 9250, inertia: 0.15,
    bootRich: true,          // full supercar dash boot on the key
    start: { rpm: 240, dur: 0.66, fires: 5, flare: 1.0,  flareT: 1.0 },
    /* flat from 5,500 all the way to the power peak — this is a race engine
       with individual throttle bodies, not a road V12 that gives up at seven */
    curve: [[0, 150], [1200, 340], [3000, 560], [4500, 700], [5500, 750], [7000, 752],
            [8250, 748], [9000, 700], [9600, 430]],
    /* 3.35 rather than 3.8: taller gearing, so each ratio is a LONG pull
       instead of a blink. With 750Nm from 5,500 there is no need to gear it
       short, and the trade is the whole character — the R is not a car that
       should be through third before you have finished enjoying second. */
    mass: 1050, finalDrive: 3.35, clutchCap: 900, cdA: 0.72, brakeMax: 16000,
    grip: 2.4,                                    // slicks + a wing you could dine on
    tire: 1.65,                                   // and slicks HOWL, they don't squeal
    asp: "na", pops: 2.4, tachMax: 10, redK: 9, kmhMax: 360, mphMax: 220,
    shiftLights: true, dial: "gear",
    /* Non-synchronised dog ring sequential, and the single most important
       number on this car.

       The paddle does not change gear. It starts a mechanical sequence that
       takes real time: the ignition dies, a selector drum rotates and drags a
       fork across, the dogs find their windows, they SLAM into engagement,
       and only then does the ignition come back. That is roughly a fifth of a
       second in which the car is not driving you anywhere — and it is a fifth
       of a second full of NOISE, not silence. The gap is the gearbox.

       Which is why this is 0.135 and not the 0.05 it briefly was. Shortening
       it to what a modern seamless box does made the R shift like a DCT, and
       a DCT shift is precisely the thing this gearbox is not.
       See seqShift() for the three events that fill it. */
    shiftLag: 0.135,
    /* 9 rather than 7, and it changes what the box IS. gearWhine is the mesh
       ratio, so it sets the pitch directly — at 9 the mesh note lands up in
       the band the tub radiates best and stops being a whine you notice under
       the engine. It becomes the flat, hard, electronic EEEEE that is the
       first thing you hear in any onboard of this car, rising and falling with
       the revs and cutting straight through the V12. It also maxes the
       "modern box" term, which is right: this is a current HWA fine-pitch dog
       set, not a 1990s coarse-cut crash box that grumbles. */
    gearWhine: 9, gearWhineMul: 1.7,
    rawCabin: 1,                         // carbon tub, no headliner, engine on the bulkhead
    /* --- the interior ---
       A race interior is not a loud road interior, it is a different one, and
       the R is the car that proves it. From outside, this is the loudest thing
       in the garage (volTrim 2.0, and it is measured at 128dB). Climb in and
       the megaphones are behind you pointing AWAY, with a tub and a bulkhead
       in between — so the exhaust drops right back, and what fills the cabin
       instead is gear mesh, valvetrain and intake trumpets. Thin, hard and
       electronic rather than big and loud.

       So: the combustion voice comes down to 55%, the top end it does have
       comes back up (+5dB on the air shelf), the windows-up filter opens
       further still, and — the one that matters most — the rawCabin bass
       bonus is thrown away entirely. That +10.5dB low shelf is there for a
       car whose body panels resonate; a bare carbon tub is a thin stiff panel
       with no cavity behind it and it radiates almost nothing down there.
       This engine already has nothing below 152Hz (see `hp`); pretending the
       interior puts it back is what would make it sound like a road car with
       the exhaust removed instead of a race car. */
    cabinVoice: { eng: 0.55, air: 5, shelf: -1.5, lp: 1.5 },
    /* The track-only art piece: a bespoke 6.0 NA V12 built with HWA, breathing
       through an Inconel megaphone system of F1 construction with no silencer,
       no resonator and no catalyst anywhere in it.

       The thing that makes it sound the way it does is the thing everyone gets
       wrong about it. Twelve cylinders firing every 60 degrees of crank means
       900 exhaust pulses a second at the redline — the pulse rate crosses out
       of RHYTHM and into PITCH somewhere around 3,000rpm, and that transition
       from clatter to tone is the entire V12 signature. And thin-wall Inconel
       with nothing bolted to it has no volume anywhere for a long wave to live
       in, so there is almost nothing below 150Hz (see `hp`). The instinct is
       to make a hypercar big and low. Do that here and you get a very loud V8
       impression instead of the best-sounding car in the world.

       So: a savage midrange BARK that hardens into a shrieking metallic scream,
       intake trumpets howling over the top on the throttle rather than on the
       revs, valvetrain sizzle everywhere, and under all of it the straight-cut
       box singing its own note through the tub. Volume is the point. */
    sound: {
      // megaphone exhausts, wide open
      f0Mul: 1.0, air: 2.5, jitter: 1.1,
      hp: 152,                 // Inconel, thin-wall, unsilenced — nothing under this
      intakeLoad: 2.6,         // twelve open trumpets a foot behind your head
      layers: [
        ["sine",     0.5,   0.10, 0.03],   // barely any chest at all — see `hp`
        ["square",   0.5,   0.10, 0.03],   // a trace of low-rev grit
        ["sawtooth", 0.995, 0.24, 0.32],   // unison low…
        ["sawtooth", 1,     0.48, 0.54],   // …center voice…
        ["sawtooth", 1.007, 0.26, 0.36],   // …unison high — wide race-V12 chorus
        ["sawtooth", 1.5,   0.10, 0.26],   // half-order growl between firings
        ["sawtooth", 2.01,  0.18, 0.56],   // megaphone bite — hardens with revs
        ["sawtooth", 2.5,   0.05, 0.26],   // between-note density
        ["sawtooth", 3.02,  0.09, 0.50],   // intake-trumpet shriek
        ["sawtooth", 4.03,  0.02, 0.36],   // metallic edge
        ["triangle", 5.04,  0.0,  0.26],   // upper shimmer
        ["sawtooth", 6.04,  0.0,  0.17],   // razor sizzle at the top
        ["sine",     8.05,  0.0,  0.12],   // pure air at nine grand
      ],
      // pushed up the spectrum: a megaphone is a short, wide, undamped horn,
      // so its resonances sit high and ring hard. Nothing down at 160 to find.
      formants: [[210, 1.0, 3.5], [980, 1.7, 6.5], [2500, 2.3, 7], [5000, 2.7, 8.5]],
      // volTrim 2.0 — the highest in the garage by a distance, and it should
      // be. This is a 6-litre V12 with open megaphones and no silencer of any
      // kind; it is measured at 128dB. Everything else here has at least a
      // muffler between you and it. If it isn't the loudest thing in the
      // garage the file is lying about what the car is.
      loadDrive: 0.72, noiseMul: 1.6, volTrim: 2.0, scream: 4800,
      drive: 0.92, pulseDepth: 0.13, raspMul: 2.0, hunt: 1.2,
    },
  },
  {
    id: "gaydon", name: "Gaydon 6.5 V12", tag: "the highest-revving road car ever built", layout: "V12 · 6.5L NA",
    crackle: "dry",
    /* 11,100 rpm. In a car with a number plate. There is no other road engine
       within two thousand revs of it, and everything about how this thing
       sounds falls out of that one number: at the limiter it is firing 1,110
       times a second, which is a pitch — a high, pure, continuous A-ish
       scream, not a series of bangs. Titanium rods and a crank with nothing
       on the end of it, so `inertia` goes lower than anything else here. */
    cyl: 12, idle: 1250, max: 11100, cut: 11400, inertia: 0.065,
    bootRich: true,
    start: { rpm: 260, dur: 0.6, fires: 5, flare: 1.0, flareT: 1.0 },
    /* An F1 engine's torque curve, which is to say a modest one that simply
       does not stop. 900Nm-ish is not the story; 1,000hp at 10,500 is, and
       the only way to get there is revs. */
    curve: [[0, 130], [1500, 330], [3500, 480], [5500, 570], [7500, 620], [9000, 640],
            [10500, 630], [11100, 590], [11800, 340]],
    mass: 1270, finalDrive: 3.6, clutchCap: 950, cdA: 0.55, brakeMax: 16500,
    grip: 2.25, tire: 1.5,
    asp: "na", pops: 2.2, tachMax: 12, redK: 11.1, kmhMax: 360, mphMax: 225,
    shiftLights: true, dial: "gear",
    mechBox: true, shiftLag: 0.055,      // 7-speed single-clutch paddle box
    rawCabin: 0.85,   // the engine is a structural member. You sit bolted to it.
    /* A Cosworth 6.5 naturally aspirated V12 used as a stressed chassis
       member, which means it is not mounted to the car — it IS part of the
       car, and every crank order goes straight into the tub and into you.

       The voicing problem here is the same one the San Cesario R has, only
       further: with a 4.4-litre-per-1000rpm airflow and F1-derived exhaust
       primaries, there is essentially no low frequency content at all. What
       there is, is an absurd amount of energy between 1kHz and 6kHz. Any
       instinct to add weight to it is an instinct to make it sound like a
       lesser car, and the whole reason to have this in the garage is that it
       does not sound like a car at all — it sounds like a grand prix start
       happening in the next valley, and then arriving. */
    sound: {
      f0Mul: 1.0, air: 3.5, jitter: 0.85,      // F1 tolerances: it is not loose
      hp: 185,                                 // there is nothing down there. At all.
      intakeLoad: 2.8,                         // twelve trumpets, and a roof scoop
      layers: [
        ["sine",     0.5,   0.06, 0.02],
        ["sawtooth", 0.996, 0.22, 0.30],
        ["sawtooth", 1,     0.46, 0.56],
        ["sawtooth", 1.006, 0.24, 0.34],
        ["sawtooth", 1.5,   0.06, 0.16],       // barely any half-order — it's even-fire
        ["sawtooth", 2.01,  0.20, 0.60],       // the order that does the screaming
        ["sawtooth", 3.02,  0.12, 0.54],
        ["sawtooth", 4.03,  0.05, 0.42],
        ["triangle", 5.04,  0.02, 0.32],
        ["sawtooth", 6.04,  0.0,  0.24],
        ["sine",     8.05,  0.0,  0.16],
        ["sine",     10.06, 0.0,  0.10],       // still something up there at eleven grand
      ],
      formants: [[240, 1.0, 3], [1150, 1.8, 6.5], [2900, 2.4, 8], [5600, 2.8, 9]],
      loadDrive: 0.7, noiseMul: 1.5, volTrim: 1.6, scream: 5600,
      drive: 0.86, pulseDepth: 0.10, raspMul: 1.7, hunt: 1.1,
    },
  },
  {
    id: "motomachi", name: "Motomachi 4.8 V10", tag: "the needle was too fast for a real tacho", layout: "V10 · 4.8L NA",
    indicator: "crisp",
    crackle: "dry",
    /* The famous one: the rev needle could sweep 0–9,000 faster than an analog
       gauge could physically follow, so they gave up and fitted a digital
       tacho. `inertia` is what that sentence means in code. */
    cyl: 10, idle: 950, max: 9000, cut: 9500, inertia: 0.09, revRate: 1.15,
    bootRich: true,
    start: { rpm: 270, dur: 0.7, fires: 4, flare: 0.95, flareT: 0.95 },
    curve: [[0, 170], [1500, 340], [3000, 405], [4500, 440], [6800, 480], [8000, 470],
            [8700, 452], [9000, 435], [9600, 280]],
    mass: 1480, finalDrive: 3.42, clutchCap: 900, cdA: 0.60, brakeMax: 15500, grip: 1.8,
    asp: "na", pops: 2.2, tachMax: 10, redK: 9, kmhMax: 325, mphMax: 202,
    shiftLights: true,
    mechBox: true, shiftLag: 0.06,       // 6-speed single-clutch ASG in a rear transaxle
    /* The acoustics were not an afterthought here, they were the brief. The
       intake was designed by the company's musical-instruments division, with
       twelve individual surge chambers and a purpose-built duct that carries
       the induction pulses THROUGH the firewall and into the cabin — an
       engineered path, deliberately built so the driver hears the engine
       breathing rather than a filtered version of it. So this car gets real
       rawCabin despite being a fully trimmed road car with carpet and a
       stereo: the hole is there on purpose. */
    rawCabin: 0.55,
    /* A 72° V10 of 4.8 litres, so light and so small it fits where a V8 would
       and weighs less than the company's own V6. Equal-length titanium
       exhaust, a 4-2-1 collector and a triple exit.

       The note is the reason people who do not care about cars know this car.
       It is BRASSY rather than metallic — the odd harmonics are enormous and
       the even ones are not, which is the same thing that makes a trumpet a
       trumpet and not a flute. Under 3,000 it grumbles and honestly sounds a
       bit ordinary; from six it turns into a hard, howling, faintly angry
       sound that is much closer to a 1990s grand prix car than to any other
       road car ever sold. And there is very little bass in it — the low end
       people remember is the cabin duct, not the pipes. */
    sound: {
      f0Mul: 1.0, air: 3, jitter: 0.95,
      hp: 118,                 // equal-length titanium: light, tight, no boom
      intakeLoad: 2.2,         // that duct, aimed at your head
      layers: [
        ["sine",     0.5,   0.14, 0.04],       // just enough grumble at idle
        ["square",   0.5,   0.14, 0.04],
        ["sawtooth", 0.996, 0.22, 0.30],
        ["sawtooth", 1,     0.46, 0.52],
        ["sawtooth", 1.007, 0.23, 0.32],
        ["sawtooth", 1.5,   0.08, 0.18],       // 72° V10 — a hint of half-order, no more
        ["sawtooth", 2.01,  0.10, 0.34],
        ["sawtooth", 3.02,  0.13, 0.56],       // THE brass. Odd orders, dominant up top.
        ["sawtooth", 5.03,  0.05, 0.40],       // …and the next odd one, still loud
        ["sawtooth", 4.03,  0.02, 0.18],       // evens stay deliberately quiet
        ["triangle", 7.04,  0.0,  0.22],
        ["sine",     9.05,  0.0,  0.12],
      ],
      // a brass instrument's formant cluster, which is exactly what this is
      formants: [[190, 1.0, 3.5], [1250, 2.0, 7], [3100, 2.4, 7.5], [5200, 2.6, 6]],
      loadDrive: 0.6, noiseMul: 1.4, volTrim: 1.45, scream: 5000,
      drive: 0.8, pulseDepth: 0.15, raspMul: 1.5, hunt: 1.15,
    },
  },
  {
    id: "zonda", name: "San Cesario Zonda", tag: "7.3 AMG V12 · gated six-speed · no paddles", layout: "V12 · 7.3L NA",
    indicator: "relay",      // hand-built in 1999 with a real flasher can
    crackle: "hard",
    ignKey: true,
    /* Two presses. The first one is the ceremony — see sfxAccSpace(). The
       second one is the V12. Doing it in one go would waste the best part. */
    twoStage: true, boot: "space",
    /* NO PADDLES. NO AUTOMATIC. A Zonda is a gated six-speed and three pedals
       and an open-gate lever milled out of a billet, and offering any other
       way to drive it would be removing the entire point of the car. See
       forcedMode(). */
    gatedOnly: true,
    cyl: 12, idle: 800, max: 7500, cut: 7700, inertia: 0.42,   // 7.3 litres of iron and a big flywheel
    start: { rpm: 220, dur: 0.95, fires: 5, flare: 0.75, flareT: 1.1, grit: 1.3 },
    /* The M120: a 7.3-litre 60° V12 that started life in an S-class and was
       handed to AMG. Enormous, lazy, and utterly uninterested in revving —
       750Nm at 4000 and most of it from idle. You do not chase the redline in
       this car, you lean on the torque and change gear because you want to. */
    curve: [[0, 260], [1000, 560], [2000, 690], [3200, 735], [4000, 750], [5200, 720],
            [6500, 650], [7500, 540], [7900, 380]],
    ratios: { R: -3.1, 1: 3.0, 2: 1.94, 3: 1.42, 4: 1.09, 5: 0.87, 6: 0.72 },
    mass: 1250, finalDrive: 3.36, clutchCap: 1100, cdA: 0.63, brakeMax: 14000,
    grip: 1.5,                                    // 1250kg, all of that torque, and no traction control worth the name
    asp: "na", pops: 2.2, tachMax: 8, redK: 7.5, kmhMax: 345, mphMax: 215,
    dial: "classic", dash: { accent: "#c9a227", face: "dark" },
    /* A 60° V12 with equal firing, quad tailpipes in a cloverleaf, and almost
       no muffling at all. What makes it unmistakable is that it is BIG and
       LOW rather than fast and sharp — 7.3 litres, a long stroke, and a
       fundamental you feel before you hear. So: f0Mul well down, the
       half-order wide open (a 60° V12 with a short exhaust has a lot of it),
       heavy low formants for the sheer volume of air being moved, and a hard
       upper edge that only shows up when it is actually working. The jitter
       is high — this is a hand-built engine on hand-built mounts. */
    sound: {
      f0Mul: 0.7, air: 0.5, jitter: 1.9,
      layers: [
        ["square",   0.5,   0.36, 0.14],   // the low-order thunder
        ["sine",     0.5,   0.30, 0.10],   // 7.3 litres of chest
        ["sawtooth", 0.994, 0.26, 0.30],
        ["sawtooth", 1,     0.50, 0.50],
        ["sawtooth", 1.007, 0.26, 0.30],
        ["sawtooth", 1.5,   0.20, 0.32],   // half-order — wide open, quad pipes
        ["sawtooth", 2.01,  0.18, 0.44],   // hardens as it works
        ["sawtooth", 3.02,  0.07, 0.30],
        ["square",   4.03,  0.02, 0.14],
      ],
      formants: [[105, 0.9, 6], [480, 1.3, 5.5], [1400, 1.8, 4.5], [3200, 2.2, 3]],
      loadDrive: 0.5, noiseMul: 1.5, volTrim: 1.35, scream: 2400,
      drive: 0.78, pulseDepth: 0.34, raspMul: 1.6, hunt: 1.4,
    },
  },
  {
    id: "huracan", name: "Sant'Agata V10 Evo", tag: "the everyday supercar scream", layout: "V10 · 5.2L NA",
    cyl: 10, idle: 1000, max: 8500, cut: 8700, inertia: 0.21, shiftLights: true, awd: true,
    bootRich: true,          // full supercar dash boot on the key
    start: { rpm: 250, dur: 0.74, fires: 4, flare: 0.92, flareT: 0.9 },
    curve: [[0, 190], [1000, 330], [3000, 470], [5000, 560], [6500, 600], [7500, 592],
            [8500, 545], [9200, 360]],
    shiftLag: 0.045,              // 7-speed twin-clutch
    mass: 1550, finalDrive: 3.54, clutchCap: 1500, cdA: 0.62, brakeMax: 15000, grip: 2.0,
    asp: "na", pops: 2.6, tachMax: 9, redK: 8.5, kmhMax: 340, mphMax: 210,
    dash: { accent: "#9ee800" },
    startCap: true,
    /* the 5.2 V10 next door to the SVJ, uneven-fire 90°: a low growl with a
       slight lope at idle, a snarling half-order midrange (the odd-even gap
       between firings), then the celebrated top-end — a hard, honking intake
       scream that hangs at the redline. Big lift-off fireworks. */
    sound: {
      // the everyday scream, still a scream
      f0Mul: 1.0, air: 2, jitter: 1.1,
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
    id: "urus", name: "Sant'Agata Urus", tag: "2.2 tonnes and a hot-vee V8", layout: "V8 · 4.0L twin turbo",
    indicator: "crisp",
    crackle: "hard",   // big cross-plane V8, four fat pipes, and no shame at all
    cyl: 8, idle: 640, max: 6800, cut: 7000, inertia: 0.46,   // heavy crank, big flywheel
    startCap: true,          // the red flip-up cover, on an SUV, because of course
    start: { rpm: 250, dur: 0.78, fires: 4, flare: 0.8, flareT: 0.9, grit: 1.1 },
    curve: [[0, 240], [800, 500], [2250, 850], [3500, 850], [4500, 830], [5500, 760],
            [6800, 640], [7300, 400]],
    shiftLag: 0.06,               // 8-speed torque converter: smooth, and never instant
    mass: 2200, finalDrive: 3.2, clutchCap: 1900, cdA: 0.92, brakeMax: 17000,
    grip: 1.95, awd: true,        // all-wheel drive and 2.2 tonnes pressing down on it
    asp: "turbo", pops: 2.0, boostMax: 0.85, spool: 1900, spoolRate: 2.6, psiMax: 20,
    flutter: 0.35,                               // recirculated, but the vee still chuffs
    whistleMul: 0.4, whistleFreqMul: 0.8,        // hot-vee: the turbos are buried…
    turboBreath: 2.3, breathHz: 1300,            // …so you get breath, never whistle
    tachMax: 8, redK: 6.8, kmhMax: 305, mphMax: 190, vmaxKmh: 305,
    dash: { accent: "#ff6a00" },
    /* The one everybody has an opinion about, and the opinion is usually wrong.
       It is the same hot-vee 4.0 twin-turbo architecture as half of Germany,
       but it is bolted into a two-and-a-quarter-tonne box, and that box is the
       instrument. A big body with a big volume of air in it has a LOW
       fundamental resonance, and everything the engine does gets poured into
       it — so where a low sports saloon sounds tight and hard, this sounds
       enormous and slightly hollow, with a chest thump you feel in the seat
       before you hear it. Then it overruns, and four pipes the size of drain
       covers throw the whole thing back at the road behind you.

       It also revs to nothing — 6,800, and the interesting part is over by
       five. That is not a flaw to be tuned around, it is the character: this
       is a torque event, not a rev event, and 850Nm arriving flat from 2,250
       is what the car is actually about. */
    sound: {
      // as low as anything in the garage. A big box of air, resonating.
      f0Mul: 0.7, air: -2, jitter: 1.5,
      hp: 26,                  // full silencers, resonators, and a body to boom in
      intakeLoad: 0.8,         // it's turbocharged: the noise is boost, not trumpets
      layers: [
        ["sine",     0.5,   0.56, 0.26],   // the chest thump. This IS the car.
        ["square",   0.5,   0.46, 0.18],   // cross-plane burble under it
        ["sawtooth", 0.996, 0.16, 0.22],   // unison low…
        ["sawtooth", 1,     0.42, 0.50],   // …center voice…
        ["sawtooth", 1.006, 0.17, 0.24],   // …unison high
        ["sawtooth", 1.49,  0.16, 0.20],   // the cross-plane half-order lope
        ["sawtooth", 2.01,  0.09, 0.28],   // pipe bite, and not much of it
        ["triangle", 3.02,  0.03, 0.14],   // a little edge up top, no more
      ],
      // low and broad: the body cavity first, then the pipes, then a soft top
      formants: [[112, 0.9, 6], [740, 1.6, 4.5], [1900, 1.6, 2.5]],
      loadDrive: 0.45, noiseMul: 1.15, volTrim: 1.2, scream: 1300,
      drive: 0.7, pulseDepth: 0.34, pulseDiv: 2, pulseType: "square",
      raspMul: 1.15, hunt: 1.4,
    },
  },
  {
    id: "revuelto", name: "Sant'Agata Revuelto", tag: "V12 hybrid flagship · 9,500 rpm", layout: "V12 · 6.5L NA + 3 e-motors",
    cyl: 12, idle: 950, max: 9250, cut: 9500, inertia: 0.15, shiftLights: true, awd: true,
    bootRich: true,          // full supercar dash boot on the key
    start: { rpm: 300, dur: 0.5,  fires: 3, flare: 0.7,  flareT: 0.6 },
    curve: [[0, 200], [1000, 400], [3000, 560], [5000, 650], [6750, 725], [8000, 712],
            [9250, 655], [9800, 420]],
    shiftLag: 0.04,               // 8-speed twin-clutch, quickest of the lot
    mass: 1820, finalDrive: 3.4, clutchCap: 1400, cdA: 0.60, brakeMax: 16000, grip: 2.1,
    asp: "na", pops: 2.6, tachMax: 10, redK: 9.25, kmhMax: 360, mphMax: 220,
    startCap: true,
    // 296-style hybrid: silent EV creep on the front axle motors up to ~130km/h,
    // then you light the V12 yourself (H / eDrive button)
    edrive: true, evCapKmh: 130, evForce: 8200, badge: "V12-H", fireLbl: "FIRE V12",
    evBoot: "lambo",             // avionics bus, not a doorbell
    dash: { accent: "#7ed957" },
    /* the new flagship: the SVJ's savagery moved a thousand rpm up the tach.
       Lighter crank, cleaner headers — less open-pipe chaos than the Gintani
       car, more of a hard, race-bred HOWL that keeps climbing to nine-five.
       Big midrange bark, screaming intake orders up top, and the party trick:
       it arrives in total silence, then twelve cylinders detonate on demand. */
    sound: {
      // race-bred howl to nine-five
      f0Mul: 0.84, air: 0, jitter: 1.4,
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
      formants: [[118, 0.9, 5], [560, 1.5, 5.5], [1500, 2.1, 5], [3100, 2.5, 5]],
      loadDrive: 0.6, noiseMul: 1.2, volTrim: 1.4, scream: 2500,
      drive: 0.8, pulseDepth: 0.18, raspMul: 1.6, hunt: 1.1,
    },
  },
  {
    id: "kaminari", name: "Kaminari 13R", tag: "twin-rotor screamer", layout: "2-rotor · 1.3L",
    crackle: "wet",   // rotaries pool fuel and gurgle it out
    cyl: 4, idle: 850, max: 9000, cut: 9300, inertia: 0.13,  // near-zero rotating mass: revs instantly
    start: { rpm: 300, dur: 0.86, fires: 2, flare: 0.85, flareT: 0.7, whine: 1420 },
    twoStage: true, ignKey: true,   // old rotary: key to ON, wait for the pump, then crank
    curve: [[0, 60], [1000, 105], [3000, 150], [5000, 175], [7000, 190], [8500, 196],
            [9000, 188], [9700, 130]],
    mass: 1180, finalDrive: 4.3, clutchCap: 260, cdA: 0.60, brakeMax: 10500,
    asp: "na", pops: 2, tachMax: 10, redK: 9, kmhMax: 260, mphMax: 160, dial: "gear",
    sound: {
      // rotaries live up there and always have
      f0Mul: 1.0, air: 2.5, jitter: 1.3,
      layers: [["sawtooth", 1, 0.34, 0.42], ["sawtooth", 2.02, 0.3, 0.46],
               ["sawtooth", 3.01, 0.12, 0.32], ["square", 0.5, 0.3, 0.1]],
      noiseMul: 1.4, raspMul: 1.6, drive: 0.62, volTrim: 1.05, scream: 2200,
      // the signature rotary idle: hard square-wave chop, wandering revs, soft blats
      pulseDepth: 0.45, pulseDiv: 2, pulseType: "square", hunt: 2.2, idleBlat: true,
    },
  },
  {
    id: "kodiak", name: "Kodiak TD", tag: "workhorse truck", layout: "I4 diesel",
    indicator: "relay",   // a truck relay you can hear from outside
    crackle: "lazy",   // a diesel workhorse does not crackle
    cyl: 4, idle: 750, max: 4400, cut: 4550, inertia: 0.55, noPop: true,
    twoStage: true, ignKey: true,   // diesel: glow plugs have to warm before it will fire
    curve: [[0, 120], [700, 195], [1300, 255], [1900, 278], [2800, 258], [3600, 214],
            [4400, 150], [4800, 80]],
    mass: 1980, finalDrive: 3.9, clutchCap: 650, cdA: 0.75, brakeMax: 11000,
    asp: "turbo", pops: 0, boostMax: 0.75, spool: 1400, spoolRate: 3.0, psiMax: 26,
    flutter: 0.5,                        // no bypass valve on a work truck. it chuffs.
    whistleMul: 0.05, whistleFreqMul: 0.45,      // a truck turbo does not whistle. it woofles.
    turboBreath: 2.0, breathHz: 1100,            // workhorse charge-air hiss
    tachMax: 5, redK: 4.4, kmhMax: 180, mphMax: 120, dial: "gear",
    sound: {
      // a work diesel. it should sound like a bus. (0.58 put the fundamental
      // under 15Hz at idle, which is below hearing — this is as low as it can
      // go and still have a note down there at all)
      f0Mul: 0.66, air: -2, jitter: 2.0,
      layers: [["square", 1, 0.42], ["sawtooth", 0.5, 0.42], ["square", 1.51, 0.2], ["triangle", 3.02, 0.05]], noiseMul: 2.4, drive: 0.7, pulseDepth: 0.4, pulseDiv: 2, raspMul: 1.5 },
  },
  {
    id: "tempest", name: "Tempest MkIV", tag: "single big turbo", layout: "I6",
    crackle: "hard",   // one big single dumping fuel into a hot turbine — it BANGS
    cyl: 6, idle: 850, max: 7600, cut: 7800, inertia: 0.33,
    start: { rpm: 265, dur: 0.7,  fires: 3, flare: 0.85, flareT: 0.8, grit: 1.2 },
    twoStage: true, ignKey: true,   // 90s ECU + fuel pump prime before the starter
    curve: [[0, 80], [1000, 148], [2500, 208], [4000, 238], [5500, 248], [6800, 236],
            [7600, 208], [8200, 130]],
    mass: 1450, finalDrive: 3.7, clutchCap: 700, cdA: 0.64, brakeMax: 12000,
    asp: "turbo", pops: 1, boostMax: 1.05, spool: 3400, spoolRate: 1.6, psiMax: 22,
    /* The noise this car is famous for. A single big turbo on an iron straight
       six with no bypass valve anywhere in it: every time the throttle plate
       moves against boost, the air that was on its way into the engine has
       nowhere to go except back out through the compressor it just came
       through, and it does that in a stack of discrete stalls a few
       milliseconds apart — "stu-tu-tu-tu-tu". `flutterEager` is what makes it
       happen on part-throttle lifts and on every upshift rather than only on a
       full lift, and `flutterChat` is what makes it a long chatter instead of
       a couple of chuffs. This is the loudest thing the car does short of the
       exhaust, and on a stock-plumbed 90s single it is unmissable from inside. */
    flutter: 1, flutterEager: true, flutterChat: 1.6,
    whistleMul: 1.6,
    turboChop: 0.55,                     // whistle chatters "sti-zu-zu-zu" on boost
    tachMax: 9, redK: 7.6, kmhMax: 320, mphMax: 200,
    sound: {
      // iron block, cast manifold, one huge turbo
      f0Mul: 0.82, air: 0, jitter: 1.5,
      layers: [["sawtooth", 1, 0.5], ["sawtooth", 2.02, 0.26], ["square", 0.5, 0.3], ["triangle", 4.04, 0.07]], noiseMul: 1.1, drive: 0.58, pulseDepth: 0.18, raspMul: 1.1 },
  },
  {
    id: "tempest3k", name: "Tempest 3000R", tag: "3000 hp drag missile", layout: "I6 · 98mm single",
    race: true,   // drag car: a battery isolator and a big red button
    crackle: "hard",   // 3000hp and a 98mm single: gunshots, nothing subtle
    cyl: 6, idle: 1100, max: 9800, cut: 10200, inertia: 0.3, shiftLights: true,
    curve: [[0, 120], [1500, 260], [3000, 420], [5000, 560], [7000, 600], [8500, 580],
            [9800, 520], [10500, 300]],
    mass: 1580, finalDrive: 3.13, clutchCap: 2800, cdA: 0.62, brakeMax: 14000, grip: 2.0,
    tire: 1.35, rawCabin: 0.9,                    // gutted: a cage, a seat and a bare floor
    asp: "turbo", pops: 2, boostMax: 3.0, spool: 4200, spoolRate: 1.1, psiMax: 55,
    // 98mm of it. the turbo IS the soundtrack — and a wheel that big stalls
    // longer and slower than the road car's, so it chatters harder again
    flutter: 1, flutterEager: true, flutterChat: 1.9,
    whistleMul: 2.2, turboChop: 0.6,
    tachMax: 11, redK: 9.8, kmhMax: 420, mphMax: 260,
    /* nothing below four grand, then the world ends: monster single spools
       forever and quadruples the torque when it arrives */
    sound: {
      // 3000hp of drag motor idles like a threat
      f0Mul: 0.78, air: 0.5, jitter: 1.8,
      layers: [["sawtooth", 1, 0.5, 0.54], ["sawtooth", 2.02, 0.24, 0.4], ["square", 0.5, 0.3, 0.12],
               ["sawtooth", 1.5, 0.08, 0.22], ["triangle", 4.04, 0.04, 0.16]],
      noiseMul: 1.5, drive: 0.72, pulseDepth: 0.2, raspMul: 1.4, scream: 2800, volTrim: 1.25,
      formants: [[280, 1.2, 4.5], [1500, 2, 5], [3000, 2.2, 4.5]], loadDrive: 0.5,
    },
  },
  {
    id: "hellion", name: "Hellion 6.2 SC", tag: "supercharged muscle", layout: "V8",
    indicator: "relay",   // muscle car, real flasher can
    crackle: "lazy",   // blown muscle just lopes and putters
    cyl: 8, idle: 680, max: 6400, cut: 6550, inertia: 0.44,
    start: { rpm: 230, dur: 0.66, fires: 3, flare: 0.9,  flareT: 0.8, grit: 1.15 },
    twoStage: true, ignKey: true,   // ignition on, let the pump build, then crank
    curve: [[0, 150], [700, 318], [2000, 415], [3500, 468], [4800, 478], [5800, 452],
            [6400, 408], [6900, 280]],
    mass: 1760, finalDrive: 3.3, clutchCap: 820, cdA: 0.68, brakeMax: 12000,
    grip: 1.35,                                   // hooks harder, still loves to spin
    asp: "super", pops: 1, boostMax: 0.35, whineMult: 8.5, psiMax: 9,
    tachMax: 7, redK: 6.4, kmhMax: 320, mphMax: 200, dial: "classic",
    sound: {
      // 6.2 litres of pushrod V8. this is a bass drum.
      f0Mul: 0.7, air: -1, jitter: 1.6,
      layers: [["square", 0.5, 0.5], ["sawtooth", 1, 0.38], ["sawtooth", 1.49, 0.2], ["triangle", 2.01, 0.1]], noiseMul: 1.3, drive: 0.62, pulseDepth: 0.32, pulseDiv: 2, pulseType: "square", hunt: 1.5, raspMul: 1.15 },
  },
  {
    id: "vandal", name: "Vandal 4.0 TT", tag: "twin-turbo bruiser", layout: "V8 · twin turbo",
    crackle: "hard",   // twin-turbo V8 bruiser
    cyl: 8, idle: 700, max: 7000, cut: 7200, inertia: 0.38,
    curve: [[0, 180], [700, 340], [2000, 520], [3500, 580], [5000, 560], [6200, 520],
            [7000, 470], [7500, 300]],
    shiftLag: 0.055,              // torque-converter auto: the softest, longest hand-over
    mass: 1740, finalDrive: 3.2, clutchCap: 950, cdA: 0.66, brakeMax: 13000,
    grip: 1.6,
    asp: "turbo", pops: 1.5, boostMax: 0.9, spool: 2200, spoolRate: 2.4, psiMax: 18,
    flutter: 0.65,                       // aftermarket twins, and nothing about it is polite
    whistleMul: 0.45, whistleFreqMul: 0.8,       // twins barely whistle…
    turboBreath: 2.2, breathHz: 1500,            // …they breathe — "zshhh", like a bus
    tachMax: 8, redK: 7, kmhMax: 320, mphMax: 200,
    sound: {
      // 4 litres, two big turbos, no manners
      f0Mul: 0.76, air: 0, jitter: 1.5,
      layers: [["square", 0.5, 0.48, 0.2], ["sawtooth", 1, 0.4, 0.5], ["sawtooth", 1.49, 0.18],
               ["sawtooth", 2.01, 0.1, 0.3], ["triangle", 3.02, 0.06, 0.15]],
      noiseMul: 1.2, drive: 0.66, pulseDepth: 0.3, pulseDiv: 2, pulseType: "square",
      raspMul: 1.2, formants: [[150, 1, 4], [900, 1.8, 5]], loadDrive: 0.4,
    },
  },
  {
    id: "affalter", name: "Affalterbach 63 S", tag: "hot-vee biturbo brawler", layout: "V8 · biturbo",
    indicator: "crisp",
    cyl: 8, idle: 650, max: 7000, cut: 7200, inertia: 0.4,
    curve: [[0, 200], [700, 380], [2000, 700], [3500, 780], [5000, 750], [6200, 690],
            [7000, 600], [7500, 380]],
    shiftLag: 0.05,               // wet-clutch MCT — a shade lazier than a true DCT
    mass: 1780, finalDrive: 3.06, clutchCap: 1600, cdA: 0.65, brakeMax: 13500, grip: 1.6,
    asp: "turbo", pops: 2.5, boostMax: 0.85, spool: 1700, spoolRate: 2.8, psiMax: 20,
    flutter: 0.3,                                // recirculated, but the vee still chuffs
    whistleMul: 0.5, whistleFreqMul: 0.85,       // hot-vee turbos hide in the valley…
    turboBreath: 2.0, breathHz: 1400,            // …you hear breath, not whistle
    tachMax: 8, redK: 7, kmhMax: 320, mphMax: 200, dial: "classic",
    /* thunderous cross-plane bark with a constant burble underneath —
       every lift of the throttle is a drum roll */
    sound: {
      // a hot-vee AMG is chest-deep, not shrill
      f0Mul: 0.74, air: -1, jitter: 1.4,
      layers: [["square", 0.5, 0.5, 0.2], ["sine", 0.5, 0.3, 0.12], ["sawtooth", 1, 0.42, 0.5],
               ["sawtooth", 1.49, 0.16, 0.2], ["sawtooth", 2.01, 0.08, 0.24]],
      noiseMul: 1.25, drive: 0.68, pulseDepth: 0.3, pulseDiv: 2, pulseType: "square",
      raspMul: 1.3, volTrim: 1.15, scream: 1600, hunt: 1.3,
      formants: [[130, 1, 4.5], [800, 1.8, 5], [2000, 1.6, 3]], loadDrive: 0.5,
    },
  },
  {
    id: "woking765", name: "Woking 765LT", tag: "longtail savage · flat-plane TT", layout: "V8 · 4.0L twin turbo",
    indicator: "crisp",
    crackle: "dry",   // longtail race system: dry and vicious
    cyl: 8, idle: 800, max: 8100, cut: 8500, inertia: 0.22,   // LT flywheel — throttle like a switch
    bootRich: true,          // full supercar dash boot on the key
    curve: [[0, 110], [800, 230], [2500, 360], [4500, 400], [5500, 405], [7000, 400],
            [8100, 370], [8600, 240]],
    shiftLag: 0.04,               // 7-speed twin-clutch, pre-selected and instant
    mass: 1420, finalDrive: 3.7, clutchCap: 1500, cdA: 0.60, brakeMax: 15000, grip: 1.75,
    asp: "turbo", pops: 2.8, boostMax: 0.9, spool: 2600, spoolRate: 2.3, psiMax: 21,
    flutter: 0.75, whistleMul: 1.1, whistleFreqMul: 1.15,   // you HEAR these turbos…
    turboChop: 0.4, turboBreath: 1.4, breathHz: 1700,       // …flutter, chatter, gasp
    tachMax: 9, redK: 8.1, kmhMax: 340, mphMax: 210, shiftLights: true,
    dash: { accent: "#ff8000" },
    /* the longtail: a flat-plane twin-turbo V8 breathing through a titanium
       exhaust with barely any silencing. Not a musical engine — an ANGRY one:
       flinty, raspy, industrial, all whooshes and flutter and crackle, with a
       hard metallic yowl at the top. The turbos are half the soundtrack and
       every lift is a firefight out of the quad tips. */
    sound: {
      // flat-plane, so it stays sharp — just not thin
      f0Mul: 0.8, air: 0, jitter: 1.1,
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
      formants: [[185, 1.1, 4.5], [1080, 2.0, 5.5], [2600, 2.5, 5]],
      loadDrive: 0.5, noiseMul: 1.3, volTrim: 1.2, scream: 2300,
      drive: 0.72, pulseDepth: 0.18, raspMul: 1.6,
    },
  },
  {
    id: "falkner", name: "Falkner S6", tag: "howling straight-six", layout: "I6 NA",
    indicator: "crisp",
    cyl: 6, idle: 850, max: 8000, cut: 8250, inertia: 0.26,
    twoStage: true, ignKey: true,
    curve: [[0, 80], [900, 160], [2500, 220], [4500, 262], [6000, 270], [7200, 258],
            [8000, 235], [8600, 150]],
    mass: 1360, finalDrive: 4.05, clutchCap: 340, cdA: 0.61, brakeMax: 11500,
    asp: "na", pops: 1, tachMax: 9, redK: 8, kmhMax: 280, mphMax: 180,
    sound: {
      // a straight-six howls in the baritone
      f0Mul: 0.88, air: 1, jitter: 1.2,
      layers: [["sawtooth", 1, 0.46, 0.52], ["sawtooth", 1.5, 0.14, 0.3], ["sawtooth", 2.01, 0.12, 0.34],
               ["square", 0.5, 0.26, 0.08], ["triangle", 3.02, 0.05, 0.22], ["sine", 4.5, 0, 0.1]],
      noiseMul: 1, drive: 0.6, pulseDepth: 0.14, raspMul: 1.15, scream: 2600, volTrim: 1.05,
      formants: [[350, 1.4, 4], [2400, 2.4, 5.5]], loadDrive: 0.3,
    },
  },
  {
    id: "bavaria", name: "Bavaria M58", tag: "twin-turbo six · check engine soon", layout: "I6 · twin turbo",
    indicator: "crisp",
    crackle: "wet",   // tuned six on a rich map, gurgling on overrun
    cyl: 6, idle: 750, max: 7200, cut: 7400, inertia: 0.3, cel: true,
    twoStage: true, ignKey: true,   // old barrel lock — key to ON, then hold it over
    curve: [[0, 120], [800, 260], [2000, 480], [3500, 520], [5500, 500], [6500, 470],
            [7200, 420], [7700, 280]],
    shiftLag: 0.05,               // twin-clutch daily
    mass: 1720, finalDrive: 3.46, clutchCap: 1000, cdA: 0.63, brakeMax: 13000, grip: 1.45,
    asp: "turbo", pops: 1.5, boostMax: 0.8, spool: 1900, spoolRate: 2.6, psiMax: 18,
    flutter: 0.6,                        // tuned, and whatever valve it has gave up years ago
    whistleMul: 0.3, whistleFreqMul: 0.7, turboBreath: 1.6, breathHz: 1300,
    tachMax: 8, redK: 7.2, kmhMax: 300, mphMax: 190,
    /* creamy straight-six snarl. runs perfectly. runs perfectly. runs perf—
       the check-engine light is part of the ownership experience (cel: true) */
    sound: {
      // an iron-block six with two turbos on it
      f0Mul: 0.82, air: 0, jitter: 1.5,
      layers: [["sawtooth", 1, 0.46, 0.5], ["sawtooth", 1.5, 0.12, 0.28], ["sawtooth", 2.01, 0.1, 0.3],
               ["square", 0.5, 0.28, 0.1], ["triangle", 3.02, 0.04, 0.18]],
      noiseMul: 1.05, drive: 0.62, pulseDepth: 0.16, raspMul: 1.15, scream: 2400, volTrim: 1.05,
      formants: [[300, 1.3, 4], [1800, 2.2, 5]], loadDrive: 0.35,
    },
  },
  {
    id: "bavariaxm", name: "Bavaria XM", tag: "653 hp plug-in hybrid · 2.7 tonnes", layout: "V8 · 4.4L biturbo + e-motor",
    indicator: "luxury",   // big flagship SUV: soft, expensive clicks
    crackle: "wet",        // an M car with a map that gurgles on the overrun
    cyl: 8, idle: 700, max: 7000, cut: 7200, inertia: 0.46,   // heavy rotating mass
    awd: true,
    /* the S68: 483 hp on its own, and a 145 kW motor sitting in the bellhousing
       ahead of the 8-speed. Combined 653 hp / 800 Nm. The motor is why the
       curve can start at 450 Nm — it fills the whole bottom end while the two
       turbos are still waking up. */
    curve: [[0, 450], [800, 640], [1600, 800], [3600, 800], [4800, 760], [5800, 690],
            [7000, 580], [7500, 380]],
    ratios: { R: -3.3, 1: 3.6, 2: 2.2, 3: 1.55, 4: 1.15, 5: 0.92, 6: 0.75 },
    mass: 2750, finalDrive: 3.15, clutchCap: 1900, cdA: 0.92, brakeMax: 17000,
    grip: 1.7,                                    // AWD, but it weighs what it weighs
    vmaxKmh: 250,                                 // limited, like every M car
    asp: "turbo", pops: 1.8, boostMax: 0.72, spool: 1500, spoolRate: 3.0, psiMax: 22,
    whistleMul: 0.07, whistleFreqMul: 0.5,        // two tonnes of insulated SUV in the way…
    turboBreath: 1.9, breathHz: 1200,             // …so it breathes, and that is all it does
    tachMax: 8, redK: 7, kmhMax: 280, mphMax: 175,
    dash: { accent: "#e04a2f", face: "dark" },
    // 25.7 kWh under the floor: ~80 km of silence and 140 km/h on the motor
    // alone. It wakes in EV like the real one — the V8 is a separate decision.
    edrive: true, evCapKmh: 140, evForce: 12500, badge: "M HYBRID", fireLbl: "FIRE V8",
    evBoot: "bavaria",           // the one that hired a film composer
    battKwh: 25.7, tank: 69,
    /* a cross-plane 90° V8 with both turbos inside the vee, pushing through a
       long SUV exhaust and two particulate filters. Nothing about that says
       "sharp" — so the voice lives almost entirely in the bottom two octaves:
       a huge half-order woffle (the cross-plane lope), a thick fundamental,
       and upper orders that the turbines have already eaten. It's a bass
       instrument that gets angry, not a soprano. f0Mul drops the whole thing
       to sit where a 2.7-tonne car should. */
    sound: {
      // 2.7 tonnes. nothing about it is high.
      f0Mul: 0.8, air: -1, jitter: 1.2,
      layers: [
        ["sine",     0.5,   0.40, 0.16],   // the chest — this is most of the car
        ["square",   0.5,   0.34, 0.11],   // cross-plane gravel and lope
        ["sawtooth", 0.995, 0.22, 0.26],   // unison low…
        ["sawtooth", 1,     0.46, 0.50],   // …center voice…
        ["sawtooth", 1.007, 0.22, 0.28],   // …unison high — wide, lazy chorus
        ["sawtooth", 1.5,   0.18, 0.30],   // THE cross-plane half-order woffle
        ["sawtooth", 2.01,  0.10, 0.26],   // exhaust bite, turbo-damped
        ["sawtooth", 3.02,  0.03, 0.12],   // what little metallic edge survives
      ],
      formants: [[110, 0.9, 5], [560, 1.6, 5], [1500, 1.8, 3.5]],
      loadDrive: 0.55, noiseMul: 1.15, volTrim: 1.1, scream: 1500,
      drive: 0.7, pulseDepth: 0.3, pulseDiv: 2, pulseType: "square",
      raspMul: 1.2, lpMul: 0.85,
    },
  },
  {
    id: "zuffen", name: "Zuffenhausen 4.0 RS", tag: "9k flat-six howl", layout: "F6 · 4.0L NA",
    indicator: "crisp",   // the satisfying one — dry, tight, perfect
    crackle: "dry",   // thin race pipes, hot and metallic
    cyl: 6, idle: 900, max: 9000, cut: 9250, inertia: 0.2, shiftLights: true,
    curve: [[0, 90], [1000, 200], [3000, 320], [5000, 400], [6500, 450], [8000, 465],
            [9000, 430], [9600, 280]],
    shiftLag: 0.04,               // PDK: the crispest gap there is
    mass: 1430, finalDrive: 4.19, clutchCap: 600, cdA: 0.62, brakeMax: 14500, grip: 1.7,
    asp: "na", pops: 2, tachMax: 10, redK: 9, kmhMax: 320, mphMax: 200,
    /* mechanical clatter at idle blooming into that hard metallic
       intake howl only a flat-six makes at nine grand */
    sound: {
      // flat-six: keeps its bite, loses the fizz
      f0Mul: 0.93, air: 2, jitter: 1.0,
      layers: [["sawtooth", 1, 0.44, 0.52], ["sawtooth", 2.02, 0.22, 0.42], ["sawtooth", 3.01, 0.06, 0.26],
               ["square", 0.5, 0.26, 0.08], ["triangle", 4.5, 0, 0.14]],
      noiseMul: 1.2, drive: 0.6, pulseDepth: 0.14, raspMul: 1.35, scream: 3200, volTrim: 1.1,
      formants: [[380, 1.4, 4.5], [2600, 2.6, 6], [4200, 2.2, 4]], loadDrive: 0.4,
    },
  },
  {
    id: "hexen", name: "Hexen 5.2 FP", tag: "flat-plane screamer", layout: "V8 NA · flat-plane",
    crackle: "dry",   // flat-plane and race-piped: dry ticking
    cyl: 8, idle: 800, max: 8250, cut: 8500, inertia: 0.3,
    bootRich: true,          // full supercar dash boot on the key
    curve: [[0, 110], [800, 230], [3000, 380], [5000, 480], [6500, 530], [7500, 520],
            [8250, 480], [8900, 300]],
    shiftLag: 0.045,              // twin-clutch
    mass: 1660, finalDrive: 3.73, clutchCap: 700, cdA: 0.65, brakeMax: 13000,
    grip: 1.5,
    asp: "na", pops: 2, tachMax: 9, redK: 8.25, kmhMax: 320, mphMax: 200,
    sound: {
      // flat-plane, and meant to be metallic
      f0Mul: 0.94, air: 2, jitter: 1.1,
      layers: [["sawtooth", 1, 0.44, 0.52], ["sawtooth", 2.02, 0.24, 0.44], ["sawtooth", 1.5, 0.08, 0.2],
               ["square", 0.5, 0.3, 0.1], ["triangle", 3.5, 0, 0.2]],
      noiseMul: 1.15, drive: 0.68, pulseDepth: 0.2, raspMul: 1.45, scream: 2800, volTrim: 1.1,
      formants: [[250, 1.2, 4], [1300, 2, 5], [3100, 2.6, 6]], loadDrive: 0.45,
    },
  },
  {
    id: "kirin", name: "Kirin V6-H", tag: "hybrid torque-fill", layout: "V6 · hybrid",
    indicator: "ev",   // hybrid: the cluster speaker does it
    cyl: 6, idle: 750, max: 8500, cut: 8800, inertia: 0.24, shiftLights: true,
    curve: [[0, 90], [800, 180], [2500, 280], [4500, 330], [6500, 345], [7800, 330],
            [8500, 300], [9100, 180]],
    shiftLag: 0.045,              // 9-speed twin-clutch
    mass: 1520, finalDrive: 3.6, clutchCap: 620, cdA: 0.60, brakeMax: 13500,
    grip: 1.8,                                    // e-motor torque-fill + sticky tires
    asp: "hybrid", pops: 1, boostMax: 0.5, psiMax: 100,
    tachMax: 10, redK: 8.5, kmhMax: 320, mphMax: 200,
    sound: {
      // a road V6, not a race one
      f0Mul: 0.84, air: 0, jitter: 1.3,
      layers: [["sawtooth", 1, 0.44, 0.5], ["sawtooth", 2.02, 0.2, 0.4], ["square", 0.5, 0.3, 0.1],
               ["triangle", 3.02, 0.05, 0.25], ["sine", 6, 0, 0.08]],
      noiseMul: 1.05, drive: 0.62, pulseDepth: 0.16, raspMul: 1.2, scream: 2600, volTrim: 1.05,
      formants: [[200, 1, 3.5], [1200, 2, 5]], loadDrive: 0.4,
    },
  },
  {
    id: "cavallino", name: "Maranello 296", tag: "hybrid V6 · eDrive", layout: "V6 · twin turbo + e-motor",
    cyl: 6, idle: 900, max: 8500, cut: 8700, inertia: 0.19, shiftLights: true,
    bootRich: true,          // full supercar dash boot on the key
    curve: [[0, 260], [1500, 460], [3000, 590], [4500, 650], [6000, 665], [6500, 665],
            [7500, 645], [8000, 615], [8500, 570], [9200, 380]],
    // clutchCap must clear peak torque × full boost (665 × 1.78 ≈ 1180) or the
    // clutch slips at the top end and the revs hunt — that was the instability
    shiftLag: 0.04,               // 8-speed twin-clutch
    mass: 1545, finalDrive: 3.62, clutchCap: 1600, cdA: 0.58, brakeMax: 15500, grip: 1.85,
    asp: "turbo", pops: 0.8, boostMax: 0.78, spool: 2400, spoolRate: 2.6, psiMax: 26,
    whistleMul: 0.55, whistleFreqMul: 1.05, turboBreath: 1.0, breathHz: 1600,
    tachMax: 9, redK: 8.5, kmhMax: 340, mphMax: 210,
    // hybrid eDrive: silent electric running up to ~50mph. The V6 never fires
    // on its own — you choose the moment (H / eDrive button). See fireHybrid().
    edrive: true, evCapKmh: 80, evForce: 9600, badge: "eDRIVE", evBoot: "ferrari",
    dash: { accent: "#f5c518", face: "dark" },
    /* the 120° hot-vee V6 Ferrari calls "the little V12": an even 240° firing
       order with equal-length headers gives a clean, SOPRANO wail — the voice
       lives in the upper harmonics, not the fundamental. A tight 3-voice
       chorus for body, then 2nd/3rd/4th-order sawtooths that take over as the
       revs climb, and pure high partials that turn to song above 6k. High
       formants (the tuned "hot tube" resonator), civil rasp, almost no burble
       — this engine sings, it doesn't shout. */
    sound: {
      // a soprano by design
      f0Mul: 1.0, air: 1.5, jitter: 1.0,
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
    crackle: "dry",   // the famous 458 lift: sharp, dry, metallic
    cyl: 8, idle: 900, max: 9000, cut: 9250, inertia: 0.17, shiftLights: true,
    bootRich: true,          // full supercar dash boot on the key
    twoStage: true,          // press once to wake it, again to fire the V8
    start: { rpm: 265, dur: 0.68, fires: 4, flare: 0.95, flareT: 0.85 },
    curve: [[0, 170], [1000, 300], [3000, 430], [5000, 505], [6000, 540], [7500, 532],
            [8500, 508], [9000, 485], [9700, 330]],
    shiftLag: 0.045,              // 7-speed twin-clutch — the one that made this feel famous
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
      // the last NA flat-plane. let it shriek.
      f0Mul: 1.0, air: 2, jitter: 1.1,
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
    id: "sf90", name: "Maranello SF90", tag: "1000 cv plug-in hybrid · 3 e-motors", layout: "V8 · 4.0L biturbo + 3 e-motors",
    crackle: "hard",   // hot-vee turbos in the exhaust stream: it cracks hard
    firing: "flat",    // the F154 is a flat-plane — it screams, it doesn't lope
    cyl: 8, idle: 850, max: 8000, cut: 8200, inertia: 0.16, shiftLights: true, awd: true,
    bootRich: true,          // full supercar dash boot on the key
    start: { rpm: 280, dur: 0.62, fires: 4, flare: 0.9, flareT: 0.8 },
    /* the F154FA: 780 cv from the engine alone, and unlike the 458 the torque
       arrives in a wall — 800 Nm plateaued from 6000 and boost holding it flat
       through the middle. The e-motors fill everything under 2500 (see
       evForce), which is why the curve can start soft and still launch. */
    curve: [[0, 210], [1500, 480], [2500, 660], [4000, 780], [6000, 800], [7000, 785],
            [8000, 700], [8600, 460]],
    // the real car's 8-speed DCT is 30% closer-stacked than a 7-speed; the
    // garage runs 6 ratios everywhere, so these are squeezed to match the feel
    ratios: { R: -3.2, 1: 3.3, 2: 2.15, 3: 1.62, 4: 1.28, 5: 1.03, 6: 0.84 },
    shiftLag: 0.04,               // 8-speed twin-clutch
    mass: 1670, finalDrive: 3.7, clutchCap: 1750, cdA: 0.57, brakeMax: 16500, grip: 2.15,
    asp: "turbo", pops: 1.6, boostMax: 0.82, spool: 2300, spoolRate: 2.9, psiMax: 28,
    whistleMul: 0.6, whistleFreqMul: 1.0, turboBreath: 1.1, breathHz: 1500,
    tachMax: 9, redK: 8, kmhMax: 340, mphMax: 211,
    // plug-in hybrid: the two front e-motors alone move it in silence to
    // ~135 km/h, then you light the V8 yourself (H / eDrive button)
    edrive: true, evCapKmh: 135, evForce: 11000, badge: "eDRIVE", fireLbl: "FIRE V8",
    evBoot: "ferrari",
    dash: { accent: "#f5c518", face: "dark" },
    /* the 90° hot-vee flat-plane V8 with the turbos sitting INSIDE the vee.
       Same 180° crank as the 458, so the 2nd order still owns the voice — but
       two turbines in the exhaust stream eat the upper harmonics the naked 458
       screams with. The result is the 458's bark with the top end pressed flat:
       harder, deeper, industrial, with a whistle over the top and the wall of
       boost doing the work the revs used to. It shoves rather than shrieks. */
    sound: {
      // turbos already ate the top; don't fake it back
      f0Mul: 0.8, air: -1.5, jitter: 1.1,
      layers: [
        ["sine",     0.5,   0.28, 0.10],   // deep chest — the boosted bottom end
        ["square",   0.5,   0.26, 0.08],   // hot-vee gravel under the bark
        ["sawtooth", 0.995, 0.22, 0.26],   // unison low…
        ["sawtooth", 1,     0.48, 0.50],   // …center voice…
        ["sawtooth", 1.006, 0.24, 0.28],   // …unison high — 3-voice chorus
        ["sawtooth", 1.5,   0.05, 0.12],   // flat-plane even fire: little between-note
        ["sawtooth", 2.01,  0.22, 0.50],   // THE flat-plane order — still the backbone
        ["sawtooth", 3.02,  0.08, 0.30],   // intake howl, turbo-damped vs the 458
        ["sawtooth", 4.03,  0.0,  0.16],   // metallic edge, muted by the turbines
        ["triangle", 5.04,  0.0,  0.09],   // faint shimmer — the turbos ate the rest
      ],
      // turbos in the vee = a lower, tighter resonator set than the open 458
      formants: [[185, 1.0, 5], [1040, 2.0, 5.5], [2450, 2.4, 4]],
      loadDrive: 0.6, noiseMul: 1.2, volTrim: 1.24, scream: 2400,
      drive: 0.72, pulseDepth: 0.15, raspMul: 1.35,
    },
  },
  {
    id: "lemansh", name: "Circuit LMH-24", tag: "Le Mans hypercar · 3.5 V6 + front e-motor", layout: "V6 · 3.5L turbo + e-axle",
    race: true,              // prototype: no indicators, no registration, no arguing
    crackle: "war",          // a race turbo V6 on the overrun is not polite
    cyl: 6, idle: 1300, max: 8800, cut: 9000, inertia: 0.13,   // no flywheel worth the name
    start: { rpm: 340, dur: 0.5, fires: 3, flare: 1.15, flareT: 0.75, grit: 1.2 },
    curve: [[0, 190], [1500, 380], [3000, 560], [4500, 640], [6000, 660], [7200, 640],
            [8200, 590], [8800, 540], [9200, 360]],
    /* THE HANDOVER.

       A Le Mans hybrid leaves its pit box on the front e-axle alone and
       NOTHING else — the regulations require electric-only in the pit lane,
       and the envelope is exactly that: pit-lane speed, and not one km/h
       more. So there is no electric cruising mode to enjoy here the way there
       is in the road hybrids. You get sixteen km/h of silence, and then the
       V6 lights itself whether you asked it to or not.

       You can still fire it early by hand (H) — every driver does, sitting in
       the box waiting to be released. You simply cannot decline. See evAuto
       in stepPhysics(). */
    edrive: true, evAuto: true, evCapKmh: 16, evForce: 7200, evBoot: "race",
    badge: "HYBRID", fireLbl: "FIRE V6",
    /* Straight-cut, sequential, bolted rigidly to the back of the engine and
       to the tub, with a carbon bulkhead and no carpet, no headliner and no
       sound deadening between it and the driver's head. Nine — the mesh sits
       high and hard. Inside this car the gearbox is not an accompaniment to
       the engine, it IS the sound; the V6 is the thing underneath it. See the
       gearWhine branch in audioTick(). */
    gearWhine: 9, shiftLag: 0.085,
    tire: 1.6, rawCabin: 1,       // the closed cockpit is a drum, not a cabin
    ratios: { R: -2.6, 1: 2.9, 2: 2.05, 3: 1.62, 4: 1.32, 5: 1.09, 6: 0.92 },
    mass: 1040, finalDrive: 3.9, clutchCap: 1400, cdA: 0.72, brakeMax: 21000,
    grip: 2.45, awd: true,                        // e-axle on the front, slicks, real downforce
    asp: "turbo", pops: 2.4, boostMax: 0.8, spool: 2600, spoolRate: 2.9, psiMax: 24,
    flutter: 0.8,                                 // no bypass valve on a race turbo
    whistleMul: 0.8, whistleFreqMul: 0.95, turboBreath: 1.7, breathHz: 1500,
    tachMax: 10, redK: 8.8, kmhMax: 340, mphMax: 210, shiftLights: true,
    dial: "classic", dash: { accent: "#5fd0ff", face: "dark" },
    /* Deep, not shrill. A 3.5 race V6 is a small engine, but everything about
       how it is silenced (barely) and where it exhausts (straight out the
       back, short) pushes the voice DOWN — f0Mul takes the whole thing under
       an octave and a half, the fundamental does the work, and the low
       formants give it the chest a prototype has on a long straight at night.
       The upper orders are there but hard and dry rather than singing. */
    sound: {
      f0Mul: 0.72, air: -1, jitter: 1.5,
      layers: [
        ["square",   0.5,   0.36, 0.14],   // low-order grind
        ["sine",     0.5,   0.30, 0.12],   // the chest
        ["sawtooth", 0.995, 0.24, 0.30],
        ["sawtooth", 1,     0.52, 0.54],   // dominant fundamental — this is the voice
        ["sawtooth", 1.007, 0.24, 0.30],
        ["sawtooth", 1.5,   0.12, 0.24],
        ["sawtooth", 2.01,  0.16, 0.34],
        ["sawtooth", 3.02,  0.05, 0.18],
      ],
      formants: [[112, 1.0, 5.5], [520, 1.6, 5], [1500, 1.9, 4]],
      loadDrive: 0.55, noiseMul: 1.5, volTrim: 1.28, scream: 2200,
      drive: 0.76, pulseDepth: 0.26, raspMul: 1.5,
    },
  },
  {
    id: "kaze", name: "Kaze 787", tag: "quad-rotor Le Mans legend", layout: "4-rotor · 2.6L",
    race: true,   // Le Mans prototype — master, ignition, pump, GO
    crackle: "wet",   // four rotors, endlessly wet and burbly
    cyl: 8, idle: 1100, max: 9000, cut: 9300, inertia: 0.11,  // R26B: pure response
    bootRich: true,          // full supercar dash boot on the key
    start: { rpm: 320, dur: 0.72, fires: 3, flare: 0.95, flareT: 0.8, whine: 1500 },
    twoStage: true,          // race car: master switch, pump, THEN the button
    curve: [[0, 120], [1500, 300], [3500, 450], [5000, 540], [6500, 608], [7800, 590],
            [9000, 555], [9700, 380]],
    mass: 830, finalDrive: 3.1, clutchCap: 800, cdA: 0.58, brakeMax: 16000,
    grip: 2.3,                                    // Le Mans slicks
    tire: 1.6, rawCabin: 0.95,                    // a tub, a rollcage and four rotors behind it
    asp: "na", pops: 2.5, tachMax: 10, redK: 9, kmhMax: 360, mphMax: 240,
    dial: "gear", shiftLights: true,
    sound: {
      // four rotors. nothing else sounds like this.
      f0Mul: 1.0, air: 3, jitter: 1.4,
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
    screen: true,            // no dials at all — one panel across the whole dash
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
    indicator: "luxury",   // a quad-turbo grand tourer clicks like a bank vault
    awd: true,
    cyl: 16, idle: 800, max: 7100, cut: 7300, inertia: 0.5,
    bootRich: true,          // full supercar dash boot on the key
    start: { rpm: 195, dur: 1.15, fires: 6, flare: 0.8,  flareT: 0.85, whine: 900 },
    curve: [[0, 300], [800, 520], [2000, 760], [3000, 880], [4500, 900], [6000, 860],
            [7100, 780], [7600, 500]],
    shiftLag: 0.055,              // 7-speed twin-clutch moving 1500hp — deliberate
    mass: 1995, finalDrive: 2.0, clutchCap: 2600, cdA: 0.50, brakeMax: 17000,
    grip: 2.1,                                    // AWD launch — mid-2s to 60
    // 18 psi is the quoted figure, and it matters here because the rig's
    // boost is normalised 0..1 — the gauge multiplies by psiMax, so this is
    // the number that decides whether the needle tells the truth
    asp: "turbo", pops: 1, boostMax: 0.85, spool: 1400, spoolRate: 3.2, psiMax: 18,
    tachMax: 8, redK: 7.1, kmhMax: 520, mphMax: 320, dial: "classic",
    flutter: 0.2,                                // four of them, all politely plumbed
    whistleFreqMul: 0.45, whistleMul: 1.2,       // quad turbos breathe LOW — "zohh"
    turboBreath: 1.6, breathHz: 650,
    /* --- the quad-turbo rig ---
       Four turbochargers, plumbed as two sequential pairs, each with its own
       shaft that spins up and — far more importantly — coasts back down on
       its own time. See TURBO RIG for what every field does. This is the car
       the whole model was written for. */
    turboRig: {
      stages: [
        // the low pair: small, light, lit almost off idle and hard against
        // their wastegates by 2600 — the reason the car has all its torque
        // from 2000rpm and does not feel like it is waiting for anything
        { at: 800, span: 1250, sat: 2600, share: 0.54, inertia: 0.52,
          whineHz: 950, whineMul: 1.0, breathHz: 460 },
        /* the high pair: bigger wheels, more inertia, held shut by their
           control valves until there is enough exhaust to light them — and
           once lit they never let go. Bugatti quote 3800rpm as the point the
           second pair comes in, so the ramp is centred there rather than
           started there: at/span put the half-way point at 3825, which means
           the swell BEGINS below three thousand and is still filling at five.
           Centring it is the difference between "all four arrive at 3800" and
           "something happens at 3800", and only one of those is a sound. */
        { at: 2900, span: 1850, sat: 5600, share: 0.46, inertia: 0.92,
          whineHz: 1280, whineMul: 1.25, breathHz: 620 },
      ],
      spoolUp: 3.1, coast: 0.62, bleed: 8.5, windmill: 0.10,
      whine: { level: 0.150, hzMul: 1, spread: 0.007, wobble: 0.5, wobbleHz: 5.7, hp: 280 },
      /* the swell onto boost, turned well up on both layers that carry it.
         Four compressors filling eight litres is the loudest thing this car
         does that isn't an explosion, and the moment it is loudest is while
         pressure is still CLIMBING — so `rise` gets more than double the
         generic lean and a ceiling high enough to let it actually get there. */
      intake: { level: 0.145, hz: 340, q: 0.55, load: 0.78, rev: 0.28,
                rise: 0.58, riseMax: 0.95 },
      breath: { level: 0.235, q: 0.58, boostHz: 540, rise: 0.42, riseMax: 0.8 },
      // the whistle now owns this band, so the old broadband hiss steps back
      // out of its way rather than smearing it
      hiss:   { level: 0.018, hz: 3400, q: 0.5 },
      /* --- the whistle, in four versions ---
         Four turbochargers behind your head, and what they sound like changes
         completely across the range. The pitch spacing is deliberately
         uneven: 620 → 1350 is most of an octave for the first third of the
         shaft speed, then 1350 → 4400 is nearly two octaves for the last
         third. That is the "rises sharply" — it loafs, and then it goes.

         The `q` column is the other half of it. Down low the band is wide and
         breathy and you barely pick it out of the induction noise; by full
         boost it is tight enough to be a genuine note sitting on top of the
         engine. Clean and hard rather than loud. */
      /* Deliberately pitched DOWN from where a four-cylinder's turbo would
         sit, and deliberately noise-led rather than tone-led. Two reasons,
         and they are the same reason twice: these are big wheels moving an
         enormous volume of air, and big wheels are low. A small turbo on a
         hot hatch shrieks at four or five kHz; four large ones on an eight
         litre engine make a sound closer to a jet on a taxiway, and the note
         in it is buried in rushing air rather than sitting on top of it.

         `tone` is the whole difference between "expensive" and "electrical".
         It is the fraction of this layer that is oscillator rather than
         filtered air, and it now peaks at 0.55 instead of 0.86 — so even flat
         out, most of what you hear is air being moved and the blade note is
         something you notice inside it rather than a synth lead over the
         top. Turn `tone` up if it needs more edge; that is the knob, and it
         is the one that will make it sound cheap if it goes too far. */
      whistle: {
        level: 0.175, load: 0.62, wobble: 10, surge: 0.78,
        voices: [
          { at: 0.00, hz:  380, tone: 0.08, q: 2.0, lvl: 0.10 },  // idle: a breath with a note in it
          { at: 0.32, hz:  820, tone: 0.24, q: 4.2, lvl: 0.38 },  // moving, part throttle
          { at: 0.66, hz: 1650, tone: 0.40, q: 6.5, lvl: 0.88 },  // on song, second pair in
          { at: 0.92, hz: 2600, tone: 0.55, q: 8.5, lvl: 1.15 },  // full boost: hard, still deep
        ],
      },
      // the top note over the engine — also dropped, for the same reason
      spool: { level: 0.075, hz: [1700, 3900], q: 0.9 },
      /* sighDur/tailDur are the length of the thing. A quad-turbo 8-litre
         carries a huge volume of compressed air in its pipes, coolers and
         plenum, and dumping it takes real time — so the body runs about twice
         the generic length and the low tail more than twice, which puts the
         whole release out past two seconds instead of ending in one. The
         shafts are still coasting underneath it the entire time (see `coast`),
         so the whine falling away has something to fall away over. */
      release: { level: 1.18, sigh: 1.12, chuff: 0.55, tail: 1.22, psh: 1.48, chirp: 1.2,
                 sighDur: 2.1, tailDur: 2.3, decay: 0.85,
                 duck: 1.0, shift: 1.0, shiftAt: 0.16, shiftThrough: 4,
                 redlineAt: 0.88, redlineLift: 1.28 },
      /* --- the two recorded events ---
         The only car in the game with real recordings in its turbo voice, and
         only for the two moments a recording is better than the model: coming
         off the throttle up at the top of a gear, and the shifts through the
         short ratios. `releaseAt` is a fraction of the rev limit — 0.78 of
         7100 is about 5500, which is "near the red" in a car that pulls to
         seven. `shiftGears` are the gears being shifted INTO, so 2/3/4 covers
         the three shifts that still have full charge-pipe pressure behind
         them; by fifth the car is long-legged enough that it should stay
         synthesized.

         The gains are measured against a clip normalized to full scale (see
         TURBO_SAMPLES.norm), so 1.0 is already as loud as the mix can carry
         and anything above it is deliberately driving the master limiter.

         `cabin` then multiplies that again with the windows up, and it is set
         where it is on purpose: sealed in, these two events do not sit over
         the engine, they REPLACE it for a moment. Between this and `duck`
         (which pulls the engine bed to the floor for the length of the clip)
         there is a fifth of a second in here where the only thing you can
         hear in the car is four turbochargers dumping eighteen pounds, and
         then the W16 swells back up underneath the tail.

         If it ever needs backing off, `cabin` is the knob — take it to 3
         before touching anything else. Note that pushing it much HIGHER than
         this stops helping: past roughly 6× the limiter is squashing the
         recording itself flat, so it gets denser rather than louder. Beyond
         that point, deepen `duck` instead. */
      sample: { releaseAt: 0.78, releaseGain: 1.45,
                shiftGears: [2, 3, 4], shiftGain: 1.35,
                cabin: 4.4, duck: 1.0 },
      /* Sealed in with four turbochargers, the charger is not the loudest
         thing in here after the engine — it is the loudest thing in here,
         full stop. `cabinCont` brings the continuous layers (the rush, the
         whistle, the whine) up to where they sit over the W16 rather than on
         it, and `cabinMask` is the other half of the same effect: the
         combustion voice drops to 40% of itself at full boost, so what you
         get with the windows up is compressors and induction with sixteen
         cylinders rumbling somewhere underneath. See rigCabinMask() for why
         the engine coming down is the right lever rather than the turbo going
         further up, and note the mask scales with shaft speed — at idle this
         still sounds exactly like an eight-litre engine. */
      cabin: 2.85, cabinCont: 3.5, cabinMask: 0.6,
    },
    /* sixteen cylinders reads as a deep, jet-like rush — f0Mul drops the
       whole voice a full octave, so even at the 7100rpm redline it stays a
       chest-deep freight-train roar instead of climbing into a scream.

       Three zones, not two. Down low it is all sub and chuff — an 8-litre
       engine idling is a pressure wave, not a note. Through the middle the
       boost arrives and the square/saw content hardens into the shove. At
       the top it goes exotic and metallic — but look at the sub layers: they
       go UP, not down. A W16 at 7000rpm still has sixteen cylinders' worth of
       bottom end underneath the shriek, and losing that is exactly what makes
       a synthesized hypercar sound like a hot hatch with a big exhaust. */
    sound: {
      // sixteen cylinders as a freight train
      f0Mul: 0.5, air: -2, jitter: 1.0, hp: 14,
      layers: [
        // the chest: half-order and quarter-order sub, present everywhere and
        // strongest flat out
        ["sine",     0.25, 0.52, 0.60, 0.72],
        ["sine",     0.5,  0.72, 0.80, 0.88],
        ["sine",     0.125, 0.20, 0.24, 0.30],   // the floor you feel, not hear
        // the body: the square content that gives it the hard-edged shove
        ["square",   0.25, 0.13, 0.19, 0.22],
        ["square",   0.5,  0.30, 0.36, 0.36],
        // the voice proper — a detuned saw pair, opening up through the mid
        ["sawtooth", 1,    0.30, 0.42, 0.48],
        ["sawtooth", 1.004, 0.17, 0.25, 0.29],
        // the exotic top: near-silent at idle, singing over the lot of it at
        // the red — this is the part that only shows up when it is working
        ["sawtooth", 2.01, 0.02, 0.07, 0.13],
        ["triangle", 3.02, 0.005, 0.02, 0.055],
        ["sine",     4.03, 0,     0.006, 0.028],
      ],
      noiseMul: 0.9, drive: 0.74, pulseDepth: 0.2, pulseDiv: 2, raspMul: 0.95, volTrim: 1.5,
      scream: 900, lpMul: 0.58,
      // a low chest formant, a midrange body, and a hard upper band that only
      // opens under load — that upper one is the "exotic" and it is what makes
      // the tone change with the pedal instead of just with the tacho
      formants: [[52, 0.8, 6.5], [330, 1.3, 5], [1150, 1.9, 3]],
      loadDrive: 0.68,           // tone hangs off LOAD, not rpm — see audioTick
      intakeLoad: 0.55,          // the rig owns induction now; don't double it
    },
  },
  {
    id: "goodwood", name: "Goodwood Phantom", tag: "waftability · the quietest car there is", layout: "V12 · 6.75L biturbo",
    indicator: "luxury",   // a bank vault closing, twice a second
    cyl: 12, idle: 600, max: 5300, cut: 5500, inertia: 0.75,   // an enormous, unhurried flywheel
    /* 563 hp, but the number nobody quotes is the one that matters: 900 Nm at
       1700 rpm, and near enough all of it from 1000. The engine's whole job is
       to never be asked for anything. It makes peak torque below the rpm most
       cars idle at, so it simply never has to raise its voice. */
    curve: [[0, 560], [1000, 860], [1700, 900], [3200, 900], [4200, 830],
            [5300, 690], [5800, 420]],
    // ZF 8-speed, satellite-aided: it reads the road ahead and picks the tall
    // gear before the corner arrives. Tall everywhere, because it can be.
    ratios: { R: -3.0, 1: 3.2, 2: 1.9, 3: 1.3, 4: 1.0, 5: 0.8, 6: 0.64 },
    /* …and you are never told about any of it. There is no manual mode, no
       paddles, no sport gate, and no gear number anywhere on the dashboard —
       Rolls deletes all of that on purpose, because being aware of a gear
       change is itself a kind of noise. So this car is automatic-only, like
       the electric one, and its shifts are seamless: no clunk, no flash, and
       the briefest torque interruption in the garage. What you get is a
       single ratio that appears to run from rest to the governor. */
    autoOnly: true, seamless: true,
    mass: 2560, finalDrive: 2.81, clutchCap: 2000, cdA: 0.86, brakeMax: 16000,
    grip: 1.35, noPop: true,                      // it does not do fireworks
    vmaxKmh: 250,                                 // governed, of course
    asp: "turbo", pops: 0, boostMax: 0.55, spool: 900, spoolRate: 3.6, psiMax: 12,
    whistleMul: 0.04, whistleFreqMul: 0.45,       // you will not hear the turbos
    turboBreath: 0.35, breathHz: 900,
    tachMax: 6, redK: 5.3, kmhMax: 260, mphMax: 160,
    dial: "classic", dash: { face: "light", accent: "#7d6a4f" },
    // 130kg of insulation, double-skinned bulkheads, foam-filled tyres and
    // 6mm double-glazing. Inside, the world stops. See applyCabin().
    hush: 1,
    tank: 100,
    /* This one is a deliberate exercise in restraint. The real car measures
       ~57 dB at 100 km/h — the engine is a PRESENCE, not a sound: you feel a
       soft, distant weight somewhere ahead of the bulkhead and that's all.
       So: almost everything below 1.5× firing order, no upper orders at all
       (they'd be audible, and audible is the failure), a tiny volTrim, a
       lowpass multiplier that keeps the whole voice under a blanket, no
       rasp worth the name, and the smoothest jitter in the garage — twelve
       cylinders at 600 rpm should sound like nothing so much as a fridge. */
    sound: {
      // further down still. you should feel it, not hear it.
      f0Mul: 0.78, air: -3, jitter: 0.3,
      layers: [
        ["sine",     0.25,  0.16, 0.05],   // the swell you feel through the seat
        ["sine",     0.5,   0.30, 0.14],   // distant chest weight
        ["sine",     1,     0.26, 0.24],   // the firing order itself — a hum
        ["sawtooth", 0.998, 0.07, 0.09],   // …with the faintest edge on it
        ["sawtooth", 1.004, 0.07, 0.09],   //     (barely-detuned pair for width)
        ["triangle", 1.5,   0.04, 0.07],   // V12 density, heavily damped
        ["triangle", 2.01,  0.02, 0.05],   // a hint of exhaust and no more
      ],
      // no high formant at all: nothing up there is meant to reach you
      formants: [[70, 0.7, 5], [260, 1.1, 4]],
      loadDrive: 0.2, noiseMul: 0.3, volTrim: 0.34, scream: 300,
      drive: 0.4, pulseDepth: 0.05, raspMul: 0.18, lpMul: 0.4,
    },
  },
  {
    id: "absolut", name: "Ängelholm Absolut", tag: "twin-turbo top-speed missile · 0-400-0", layout: "V8 · 5.0L flat-plane twin turbo",
    indicator: "luxury",   // hand-built: everything is over-engineered
    crackle: "hard",   // big twins, long plumbing, huge reports
    cyl: 8, idle: 820, max: 8500, cut: 8700, inertia: 0.15,   // flat crank, feathery response
    bootRich: true,          // full supercar dash boot on the key
    start: { rpm: 245, dur: 0.78, fires: 4, flare: 0.8,  flareT: 0.7 },
    /* 5.065 litres, two turbos, and on E85 it is quoted at 1500 Nm at 5100 and
       1600 hp at 7800 — which are not two facts but one, because a curve that
       does both has to be almost dead flat from three thousand to the
       limiter. That is the whole character of the engine: it does not come on
       song anywhere, because it is never off it. These are the BASE numbers;
       the boost multiplier (boostMax 0.68) is what turns them into the real
       ones, so the shape here is deliberately lower and flatter than the
       published curve rather than a copy of it. */
    curve: [[0, 320], [1500, 620], [2700, 860], [4000, 880], [5100, 895],
            [6170, 890], [7000, 880], [7800, 870], [8500, 790], [9000, 520]],
    /* --- the LST: nine speeds, seven wet multi-disc clutches ---
       The real ratios, verbatim. They are not an arbitrary spread — look at
       the steps and they run 1.295, 1.268, 1.278 and then repeat, three
       ratios at a time, all the way up. That is the gearbox's actual
       architecture showing through: three gears fixed to the input shaft
       against three on the output plus three clutched, so the whole set is
       generated by a small repeating pattern rather than chosen gear by gear.
       Nothing else in the garage has steps this close, and that closeness IS
       the car — it never falls out of boost, because there is nowhere to fall
       to.

       Reverse is not published, so it is sized off first the way every other
       car here is. */
    ratios: { R: -4.0,
              1: 4.7200, 2: 3.6441, 3: 2.8744, 4: 2.2500, 5: 1.7371,
              6: 1.3702, 7: 1.0783, 8: 0.8325, 9: 0.6566 },
    /* Final drive is the one number that is NOT the real car's, and it can't
       be: this simulator runs one wheel radius for every car (0.312m) and a
       Jesko's rear tyre is 0.364m. So the final drive absorbs the difference,
       and it is chosen to reproduce the real car's SPEEDS rather than its
       printed ratio. It lands almost exactly right — first tops out at 77 km/h
       against the real car's 81, and ninth runs to ~544 at the limiter,
       inside Koenigsegg's own quoted 531–563 theoretical band.

       And ninth is a genuine overdrive, not a tall top: eighth runs out of
       breath against drag at about 439 km/h and ninth keeps pulling to ~524,
       arriving at its own limiter and its own terminal velocity at the same
       moment. That is what a car built around 0-400-0 is geared for. */
    shiftLag: 0.025,              // LST: 20–30ms, and it is the fastest thing here
    mass: 1390, finalDrive: 2.80, clutchCap: 2400, cdA: 0.523, brakeMax: 16500, grip: 1.9,
    asp: "turbo", pops: 2.2, boostMax: 0.68, spool: 2500, spoolRate: 2.3, psiMax: 25,
    flutter: 0.7, whistleMul: 0.7, whistleFreqMul: 1.05, turboBreath: 1.3, breathHz: 1550,
    tachMax: 9, redK: 8.5, kmhMax: 540, mphMax: 330, shiftLights: true,
    dash: { accent: "#cfe0ee" },
    /* the 5.0 twin-turbo built to chase 330 mph: NOT a high shriek — the big
       turbos and long plumbing give it a deep, muscular, chest-heavy bark that
       hardens as it climbs, with the fundamental doing the heavy lifting and a
       constant turbo breath underneath. f0Mul drops the whole voice down. */
    sound: {
      // big twins and long pipes: deep, not sharp
      f0Mul: 0.8, air: 1, jitter: 1.1,
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
      drive: 0.7, pulseDepth: 0.22, raspMul: 1.35,
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

/* ---------------- engine swap ----------------
   Chassis and engine are already separate data, so a swap is just: take the
   car you picked, throw away everything that belongs to the ENGINE, and bolt
   the donor's engine in its place. The result keeps the chassis' id, so the
   workshop mods, the save file and the garage highlight all still key off the
   car you actually chose.

   The split below is the whole feature. Anything about how the engine makes
   and delivers power moves with it (including the gauge scales — a 12,100 rpm
   V12 in a diesel truck needs the truck's tacho re-marked, or the needle just
   pins). Anything about the car AROUND the engine stays: mass, ratios, grip,
   brakes, aero, the dashboard, the shape of the exhaust tip. */
const ENGINE_FIELDS = [
  "cyl", "idle", "max", "cut", "inertia", "curve", "asp", "pops", "sound",
  "revRate", "start", "camAt", "cel", "noPop", "ev", "crackle", "firing",
  "boostMax", "spool", "spoolRate", "psiMax", "whistleMul", "whistleFreqMul",
  // flutter and its two companions travel together: how prone the plumbing is
  // to surging, when it surges, and how long it chatters for are all facts
  // about the charger and its pipework, not about the car around it
  "turboBreath", "breathHz", "turboChop", "whineMult",
  "flutter", "flutterEager", "flutterChat",
  "seqTurbo", "turboRig",              // the plumbing comes with the engine
  "tachMax", "redK", "shiftLights",
  "edrive", "evCapKmh", "evForce", "badge", "fireLbl",
];

/* the engine currently bolted into `chassis` — the car itself when stock */
function swapEngineInto(chassis) {
  const donorId = ((S && S.mods && S.mods[chassis.id]) || {}).swap;
  if (!donorId || donorId === chassis.id) return chassis;
  const donor = CARS.find(c => c.id === donorId);
  if (!donor) return chassis;

  const car = { ...chassis, swapFrom: donor.id };
  for (const k of ENGINE_FIELDS) {
    delete car[k];                       // clear first: an NA donor must not
    if (donor[k] !== undefined) car[k] = donor[k];   // inherit turbo plumbing
  }
  car.layout = donor.layout;
  car.tag = donor.name + " engine · swapped";

  // the lump itself has weight — a V12 in a city hatch sits on the nose and
  // you feel it, a small four in a big GT lightens it
  car.mass = Math.round(clamp(chassis.mass + (donor.cyl - chassis.cyl) * 14,
                              chassis.mass * 0.82, chassis.mass * 1.3));
  // a stock clutch will not hold a race V12. Size it to what the donor
  // actually makes, or the swap just smokes the plates and hunts.
  const peak = Math.max(...car.curve.map(p => p[1])) * (1 + (car.boostMax || 0));
  car.clutchCap = Math.max(chassis.clutchCap, Math.round(peak * 1.45));
  // top-speed marking follows whichever runs out first: the chassis' aero or
  // the engine's ability to pull the gearing
  car.kmhMax = Math.max(chassis.kmhMax, donor.kmhMax);
  car.mphMax = Math.max(chassis.mphMax, donor.mphMax);
  return car;
}

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
      ? "Key to ON, then hold it over to START (hold I)"
      : c.startCap
        ? "Flip the cover, then hold to start (hold I)"
        : c.twoStage
          ? "Press for electronics, then hold to start (hold I)"
          : "Hold to start / press to stop (I)";
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
                "--needle", "--face", "--face-ring", "--tick", "--tick-dim",
                "--dial-accent"];
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
    // a cream dial will happily swallow a pale needle and a pale gear
    // character. Anything painted ON the face has to be dark enough to
    // survive it, whatever theme the page happens to be wearing — so if
    // the car didn't name its own (dark) accent, we pick the ink for it.
    if (!d.accent) {
      b.setProperty("--needle", "#8c2f22");
      b.setProperty("--dial-accent", "#3b3227");
    }
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
    flameRich: true,          // long cold pipes: whatever survives is sooty
    crackle: "lazy",          // muffled to a soft putter
  },
  loud: {
    name: "Open Pipe", desc: "Barely muffled straight-through. Everything, much louder.",
    volMul: 1.45, driveAdd: 0.16, raspAdd: 0.45, popMul: 1.35, look: "open",
    flameRich: true,          // barely muffled and running rich — big orange torch
    crackle: "hard",          // nothing in the way: real cracks and bangs
  },
  titanium: {
    name: "Full Titanium", desc: "Featherweight race system, burnt-blue tips. Dry metallic ring that hardens with revs.",
    volMul: 1.18, formantMul: 1.35, bright: 1800, raspAdd: 0.3, driveAdd: 0.06, popMul: 1.2, look: "ti",
    flameLean: true,          // thin-wall Ti soaks up heat: burns clean blue/violet
    crackle: "dry",           // thin hot wall rings — klklklkl, not pap
  },
  screamer: {
    name: "Screamer", desc: "Thin-wall high-flow pipes. Rings bright and metallic up top.",
    volMul: 1.08, formantMul: 1.6, bright: 2400, raspAdd: 0.2, popMul: 1.1, look: "screamer",
    flameLean: true,          // high-flow and glowing hot — clean, thin flame front
    crackle: "dry",
  },
  decat: {
    name: "De-Cat Straight", desc: "Cats in the bin. Filthy, gravelly, louder everywhere. Smells like victory.",
    volMul: 1.3, driveAdd: 0.12, raspAdd: 0.55, bright: 600, popMul: 1.5, look: "decat",
    flameRich: true,          // no cats, filthy mixture — the sootiest flame of the lot
    crackle: "wet",           // rich and filthy: it gurgles before it cracks
  },
  antilag: {
    name: "Anti-Lag", desc: "Fuel in the pipes. Bangs on every shift, flames, constant crackle.",
    volMul: 1.12, popMul: 1.7, burble: true, bright: 300, forcePops: 1.6, look: "antilag",
    crackle: "war",           // fuel straight into a glowing pipe, constantly
  },
};

function curMod() {
  let m = S.mods[CC.id];
  if (!m) { m = { ex: "stock", pitch: 1, gear: 1, tune: false, abs: true }; S.mods[CC.id] = m; }
  // pitch used to be defaulted only when the entry was created from scratch,
  // so any mods object that arrived without one (an older save, or a shared
  // build link that omitted it) left the slider reading NaN
  if (m.pitch === undefined) m.pitch = 1;
  if (m.gear === undefined) m.gear = 1;
  if (m.rev === undefined) m.rev = 1;
  if (m.vol === undefined) m.vol = 1;
  if (m.tone === undefined) m.tone = 0;
  if (m.pop === undefined) m.pop = 1;
  if (m.swap === undefined) m.swap = "";       // "" = the engine it came with
  if (m.flame === undefined) m.flame = "auto";
  if (m.flameSize === undefined) m.flameSize = 1;
  if (m.tune === undefined) m.tune = false;
  if (m.abs === undefined) m.abs = true;
  if (m.grip === undefined) m.grip = false;    // the workshop's infinite-grip cheat
  if (m.shift === undefined) m.shift = "stock";
  if (m.paddle === undefined) m.paddle = "carbon";  // default = the real recorded click
  if (!EXHAUSTS[m.ex]) m.ex = "stock";     // repair saves hit by the old card bug
  return m;
}
function curEx() { return EXHAUSTS[curMod().ex] || EXHAUSTS.stock; }

/* ---------------- FACTORY STOCK ----------------
   Everything in this simulator is tuned for the version of a car you'd film,
   not the version you'd be sold. Open pipes, pops on every lift, rasp, the
   filter wide open. That's the fun setting, and it's the wrong setting if
   what you actually want to know is what the thing sounds like.

   STOCK is that switch. It doesn't change which exhaust is bolted on — the
   tip you picked still looks like the tip you picked — it changes the car
   back into one that has to pass a drive-by noise test: quieter, darker, far
   less saturated, the turbos hushed, and effectively no overrun theatre. The
   restraint is the point. A real 458 on a real road is a much smaller sound
   than the internet suggests, and most of what makes it good survives being
   turned down.

   It sits OVER the workshop rather than replacing it, so the pitch, tone and
   volume sliders still do what they say — they're just working on a factory
   car now. */
const STOCK = {
  vol: 0.7,        // a stock system is genuinely quieter, not just duller
  drive: 0.6,      // most of the snarl is saturation, and factory cars don't
  tone: 0.55,      // the lowpass sits way down: no top-end edge at all
  scream: 0.3,     // and the intake howl mostly stays in the airbox
  rasp: 0.35,
  pop: 0.12,       // "minimal" — a faint tick on a lift, never a bang
  whistle: 0.2,
  chuff: 0.8,
  air: -3.5,       // and one more shelf off the top
};
function stockOn() { return !!S.stock; }
/* the exhaust as far as the SOUND is concerned. In stock mode the pipe's
   acoustic character is bypassed (but not its appearance — see curEx). */
function exSound() { return stockOn() ? EXHAUSTS.stock : curEx(); }

/* effective pops rating — anti-lag makes any car bang */
function popsRating() {
  const ex = exSound();
  const base = ex.forcePops ? Math.max(CC.pops || 0, ex.forcePops) : (CC.pops || 0);
  // stock exhausts have the cats and the muffler volume to swallow almost all
  // of this, which drops every car below the thresholds that fire bangs and
  // flames and leaves only the faintest crackle
  return stockOn() ? base * 0.14 : base;
}
/* combined pop loudness/frequency multiplier: exhaust choice × workshop slider */
function popEff() {
  return (exSound().popMul || 1) * curMod().pop * (stockOn() ? STOCK.pop : 1);
}

/* ---------------- state ---------------- */

const S = {
  mode: "auto", units: "kmh", muted: false, voice: true,
  engineOn: false, cranking: false, stalled: false,
  acc: false,        // electronics live, engine not turning (two-stage cars)
  capOpen: false,    // the red starter cover is flipped up
  powered: false, eDrive: "gas",       // eDrive cars: system-on flag + ev|gas motor
  rpm: 0, v: 0, odo: 0, boost: 0,
  // --- turbo rig (see TURBO RIG) — shaft speed is a separate quantity from
  //     boost, and that is the whole idea
  tShaft: null, tSpd: 0, tStage: 0, tRise: 0,
  tLiftT: 99, tLiftBoost: 0, tRelease: 0,
  gear: 0,                             // 0=N, 1..6, "R"
  autoSel: "P", autoGear: 1,
  in: { gas: 0, brake: 0, clutch: 0 }, // key/pointer targets
  throttle: 0, brake: 0, clutchPedal: 0,
  effThrottle: 0, engage: 0, locked: false,
  shiftCut: 0, shiftCool: 0, cutTimer: 0, blip: 0, catchT: 0, catchAmt: 0.55, catchPeak: 2800, catchGuard: 0, parkLimit: 0, crankP: null, crankTimer: 0, settleT: 0, settleDur: 0, settleFrom: 0, fastIdle: 0, pendShift: false,
  tunnel: false, flyby: false, flyX: -380, cabin: false, stock: false, mods: {},
  space: "open",                     // where you're driving — see SPACES
  listen: "driver",                    // which microphone — see LISTEN
  ltTgt: { kmh: 100, mph: 60 },          // launch-timer target speed per unit system
  spinV: 0, slipR: 0, tracF: 0, tcCut: 0, lockup: false,
  traffic: false, rain: false, passT: 2, splashT: 2, wiperT: 0.7, wiperDir: 1,
  night: false, cricketT: 2, lampT: 1.5,
  dmgOn: false,                        // consequences mode — opt-in, see DMG
  fuel: 1,                             // 0..1 in the tank — only moves in consequences
  // --- electric car only (see the EV DASH section) ---
  evBoost: 0, evCool: 0,               // ludicrous-mode timer / cooldown, seconds
  evV8: false,                         // the fake exhaust note
  batt: 1,                             // 0..1 state of charge
  powerW: 0,                           // instantaneous drive power, watts (+ / regen −)
  simGear: 1, simRpm: 800, simCut: 0,  // the pretend gearbox behind the fake V8
  race: { master: false, ign: false, pump: false },   // race-car start-up panel
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
   THE ELECTRIC CAR
   ================================================================
   Three things make an EV a different machine rather than a quiet one, and
   all three live here:

   1. IT MAKES NO SOUND. Not a quiet sound — none. There is no combustion,
      no exhaust and (in this car) no inverter whine piped into the cabin, so
      the powertrain contributes literally nothing to the mix. What you hear
      accelerating is tyres and air, and that is the entire point of it.

   2. LUDICROUS. A five-second overboost. It's specified in POWER, not
      torque, which matters: power is what you feel at speed, and converting
      it to torque means the shove goes UP as the revs fall — exactly like
      the real thing pinning you at 60 and still pinning you at 120.

   3. THE FAKE V8. A complete pretend drivetrain — eight cylinders, six
      speeds, shift points, an overrun — running on top of a car that has
      none of those things. It's driven entirely off road speed, so it
      upshifts as you accelerate and blips as you slow, and it is of course
      completely fraudulent. That's the joke, and the real ones do it too. */

/* the pretend engine: a lazy, gravelly cross-plane V8 */
const V8SIM = {
  cyl: 8, idle: 750, max: 7000, cut: 7200,
  camAt: 0,
  ratios: [3.4, 2.05, 1.48, 1.12, 0.9, 0.74], final: 3.9,
  up: 6500, down: 2600,               // virtual shift points
  sound: {
    layers: [
      ["sine",     0.5,   0.34, 0.12],   // cross-plane chest
      ["square",   0.5,   0.3,  0.1 ],   // the burble/lope
      ["sawtooth", 0.995, 0.2,  0.26],
      ["sawtooth", 1,     0.46, 0.5 ],
      ["sawtooth", 1.007, 0.22, 0.28],
      ["sawtooth", 1.5,   0.14, 0.24],   // cross-plane half-order — the woffle
      ["sawtooth", 2.01,  0.12, 0.3 ],
      ["sawtooth", 3.02,  0.04, 0.18],
    ],
    formants: [[130, 0.9, 5], [620, 1.6, 5.5], [1700, 2.0, 4]],
    loadDrive: 0.5, noiseMul: 1.1, volTrim: 1.15, scream: 1800,
    drive: 0.7, pulseDepth: 0.3, pulseType: "sawtooth", raspMul: 1.4, jitter: 1.2,
  },
};

/* is this car actually electric right now? (a swapped-in V12 makes it not) */
function isEv() { return !!CC.ev; }
/* Some cars only come one way, and pretending otherwise is worse than not
   offering the choice. An EV has one ratio and nothing to shift. The Phantom
   has eight and will not admit to any of them. And a Zonda has a gated
   six-speed and a clutch pedal and that IS the car — putting paddles on it
   would be removing the point. So this returns the single mode a car is
   allowed to be in, and the others are locked out rather than quietly
   ignored. null means take your pick. */
function forcedMode() {
  if (isEv() || CC.autoOnly) return "auto";
  if (CC.gatedOnly) return "clutch";
  return null;
}
function autoOnly() { return forcedMode() === "auto"; }
/* …and whether its shifts are meant to be undetectable */
function seamless() { return !!CC.seamless; }
/* does this car wear the screen dash? (that's the shell, so it survives swaps) */
function hasScreen() { return !!CC.screen; }
/* the fake V8 only exists on an electric car, and only when switched on */
function v8SimOn() { return isEv() && S.evV8; }

/* what the ENGINE VOICE should sound like, and at what rpm — normally the
   car itself, but the fake V8 substitutes a whole different machine */
function voiceCar() { return v8SimOn() ? V8SIM : CC; }
function voiceRpm() { return v8SimOn() ? S.simRpm : Math.max(S.rpm, 0); }
function voiceMax() { return v8SimOn() ? V8SIM.max : ENG.max; }

/* ---- ludicrous mode ----
   +400 hp for five seconds, then twenty to think about what you've done.
   Converted from power to torque at the current motor speed, with a floor on
   the divisor so it can't divide by zero into infinity off the line, and a
   ceiling so a standing start doesn't simply detonate the tyres. */
const EV_BOOST_HP = 400, EV_BOOST_S = 5, EV_COOL_S = 20;

function evBoostNm(rpm) {
  if (S.evBoost <= 0) return 0;
  const w = Math.max(rpm, 1200) * (Math.PI / 30);       // rad/s
  return Math.min(760, EV_BOOST_HP * 745.7 / w);
}

function toggleEvBoost() {
  if (!isEv()) return;
  initAudio();
  if (AU.ctx && AU.ctx.state === "suspended") AU.ctx.resume();
  if (S.evBoost > 0 || S.evCool > 0) return;            // already lit, or recharging
  if (!S.engineOn) { sfxBeep(220, 0.2, 0.12); return; }
  if (S.batt <= 0.02) { sfxBeep(220, 0.3, 0.14); return; }
  S.evBoost = EV_BOOST_S;
  sfxEvBoost();
  sayEvent("ludicrous", "Ludicrous", { cool: 6 });
  updateEvUi();
}

function toggleEvV8() {
  if (!isEv()) return;
  initAudio();
  if (AU.ctx && AU.ctx.state === "suspended") AU.ctx.resume();
  S.evV8 = !S.evV8;
  S.simGear = 1; S.simRpm = V8SIM.idle; S.simCut = 0;
  buildEngineVoice(voiceCar());     // swap the whole oscillator stack over
  applyFormants();
  if (S.evV8) sfxEvV8On();
  else sfxClunk(0.35);
  updateEvUi();
  save();
}

/* the pretend gearbox. rpm comes from road speed through a virtual ratio, so
   it climbs as you accelerate, drops on an upshift, and falls back toward
   idle when you stop — all without touching the real drivetrain. */
function evSimTick(dt) {
  if (!v8SimOn()) return;
  const sp = Math.abs(S.v);
  const wheelRps = sp / CAR.wheelR / (2 * Math.PI);
  const rpmFor = (g) => wheelRps * V8SIM.ratios[g - 1] * V8SIM.final * 60;

  S.simCut = Math.max(0, S.simCut - dt);
  if (sp < 0.6) S.simGear = 1;                    // rolled to a stop: back to 1st
  else {
    if (S.simGear < 6 && rpmFor(S.simGear) > V8SIM.up) {
      S.simGear++;
      S.simCut = 0.11;                             // the ignition-cut lurch
      sfxShift(0.55);
      if (S.throttle > 0.3) sfxPop(0.4, undefined, "crack");   // the upshift bark
    } else if (S.simGear > 1 && rpmFor(S.simGear) < V8SIM.down) {
      S.simGear--;
      if (S.throttle < 0.1 && sp > 8) sfxCrackle(1.1);         // downshift crackle
    }
  }
  const target = sp < 0.6
    ? V8SIM.idle + S.throttle * (V8SIM.max - V8SIM.idle) * 0.85   // revving parked
    : clamp(rpmFor(S.simGear), V8SIM.idle, V8SIM.cut);
  // the flywheel it doesn't have: chase the target rather than snapping to it
  const rate = S.simCut > 0 ? 9 : (target > S.simRpm ? 5.5 : 3.4);
  S.simRpm += (target - S.simRpm) * Math.min(1, rate * dt);
  if (S.simCut > 0) S.simRpm -= 2600 * dt;
  S.simRpm = clamp(S.simRpm, V8SIM.idle * 0.8, V8SIM.cut);
}

/* ---- battery ----
   Lives in the consequences block now, along with the fuel tank, because
   with consequences off this car simply has an infinite pack — see
   battTick(). */

/* the little bit of theatre when ludicrous arms: a rising sweep and a thump,
   as close as an electric car gets to sounding pleased with itself */
function sfxEvBoost() {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = "sawtooth";
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(1750, t + 0.45);
  const f = ctx.createBiquadFilter(); f.type = "bandpass";
  f.frequency.setValueAtTime(400, t); f.Q.value = 3.5;
  f.frequency.exponentialRampToValueAtTime(3400, t + 0.45);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  o.connect(f); f.connect(g); g.connect(AU.sfx);
  o.start(t); o.stop(t + 0.65);
  const k = ctx.createOscillator(); k.type = "sine";
  k.frequency.setValueAtTime(88, t); k.frequency.exponentialRampToValueAtTime(34, t + 0.3);
  const kg = ctx.createGain();
  kg.gain.setValueAtTime(0.5, t); kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
  k.connect(kg); kg.connect(AU.sfx); k.start(t); k.stop(t + 0.36);
}

/* switching the fake note on: the speakers clearing their throat */
function sfxEvV8On() {
  if (!AU.ready) return;
  const t = AU.ctx.currentTime;
  sfxPop(0.28, t, "putter");
  sfxPop(0.22, t + 0.09, "putter");
  sfxPop(0.3, t + 0.2, "crack");
}

/* ================================================================
   AUDIO — everything synthesized, no files
   ================================================================ */

/* ================================================================
   COMBUSTION — the pulse train
   ================================================================
   Why a stack of oscillators can only ever get you so far: an engine is not
   a waveform. It is a train of separate explosions leaving a metal pipe.
   Sawtooths sweeping in pitch will read as a synthesizer no matter how much
   filtering goes on top, because the thing your ear is listening for — the
   individual chuff of each cylinder — was never there to begin with.

   So this generates the explosions themselves, on a worklet, sample by
   sample: one short pressure blast per cylinder per engine cycle, fired at
   that engine's real crank angles. On its own it is a raw, buzzy, unpleasant
   thing. It is not meant to be listened to. It is the EXCITATION — it goes
   straight into the same soft-clip, lowpass and pipe-formant chain as the
   oscillators, and only becomes an engine after the body has had it.

   The reason this matters more than any other single thing: firing order.
   A flat-plane V8 and a crossplane V8 have identical cylinder counts,
   identical rpm, identical harmonics. The ONLY difference between a 488 and
   a Mustang is which bank fires when — and no amount of oscillator tuning
   can express that, because it isn't a question of frequency content, it's a
   question of timing. Here it costs one array. See firingPlan().

   Delivered as a Blob URL rather than a file, because this whole thing ships
   as one script and there is nowhere to put a second one. */
const PULSE_WORKLET_SRC = `
class PulseEngine extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'cycleHz', defaultValue: 8, minValue: 0, maxValue: 600, automationRate: 'a-rate' },
      { name: 'level',   defaultValue: 0, minValue: 0, maxValue: 4,   automationRate: 'a-rate' },
      { name: 'decay',   defaultValue: 1, minValue: 0.2, maxValue: 4, automationRate: 'k-rate' },
      { name: 'noise',   defaultValue: 0.4, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'spread',  defaultValue: 1, minValue: 0, maxValue: 4,   automationRate: 'k-rate' }
    ];
  }
  constructor() {
    super();
    this.phase = 0;
    this.plan = [{ p: 0, bank: 0, amp: 1 }];
    this.trim = [1];
    this.live = [];
    this.dbuf = new Float32Array(2048); this.di = 0;
    this.x1 = [0, 0]; this.y1 = [0, 0];
    this.port.onmessage = (e) => {
      const d = e.data;
      if (!d || !d.plan) return;
      this.plan = d.plan;
      // no two cylinders are the same: compression, injector, header length.
      // Fixed at build time, so the unevenness is character and not noise.
      this.trim = d.plan.map(() => 0.84 + Math.random() * 0.32);
    };
  }
  process(inputs, outputs, params) {
    const out = outputs[0];
    if (!out || !out.length) return true;
    const L = out[0], R = out[1] || out[0], n = L.length;
    const cyA = params.cycleHz, lvA = params.level;
    const decay = params.decay[0], noise = params.noise[0], spread = params.spread[0];
    const sr = sampleRate;
    const dsamp = Math.max(1, Math.floor(spread * 0.0017 * sr));
    const plan = this.plan, trim = this.trim, live = this.live;

    for (let i = 0; i < n; i++) {
      const hz = cyA.length > 1 ? cyA[i] : cyA[0];
      const lvl = lvA.length > 1 ? lvA[i] : lvA[0];
      const prev = this.phase;
      let ph = prev + hz / sr;

      if (hz > 0.05 && lvl > 0.0002 && live.length < 48) {
        // a pulse can never outlast its own cycle, or the chuff smears into
        // a drone somewhere around 4000rpm and the engine turns back into a
        // synthesizer exactly when it should be getting angrier
        const tau = Math.min(decay * 0.0055, (1 / hz) * 0.15);
        const k0 = Math.exp(-1 / (Math.max(0.0009, tau) * sr));
        // The two banks are not the same instrument. Different header length,
        // different collector, different amount of pipe to the tip — so one
        // side is a shade quieter and a shade fatter than the other. On a
        // flat-plane that alternates A-B-A-B and just reads as width. On a
        // crossplane, where the banks group A-B-B-A-B-A-A-B, it stamps an
        // uneven loudness pattern across the cycle and drops a component an
        // octave down under the firing note. THAT is the burble, and unlike
        // the delay below it survives being summed to mono.
        const k1 = Math.exp(-1 / (Math.max(0.0009, tau * 1.35) * sr));
        for (let j = 0; j < plan.length; j++) {
          const ev = plan[j];
          if (!((prev < ev.p && ph >= ev.p) || (ph >= 1 && prev < ev.p + 1 && ph >= ev.p + 1))) continue;
          live.push({ a: ev.amp * trim[j] * (0.88 + Math.random() * 0.24) * (ev.bank ? 0.8 : 1),
                      k: ev.bank ? k1 : k0, e: 1, b: ev.bank, r: 0 });
        }
      }
      if (ph >= 1) ph -= 1;
      this.phase = ph;

      let a = 0, b = 0;
      for (let j = live.length - 1; j >= 0; j--) {
        const p = live[j];
        p.e *= p.k;
        if (p.e < 0.0006) { live.splice(j, 1); continue; }
        // the blast: a pressure step, roughened with combustion noise. The
        // step is nearly all DC and the DC blocker below turns it into the
        // crack — which is what a cylinder actually sounds like from outside.
        p.r += ((Math.random() * 2 - 1) - p.r) * 0.42;
        const s = p.a * p.e * (1 - noise + noise * p.r * 1.7);
        if (p.b) b += s; else a += s;
      }

      // bank two runs a longer header, so its pulses land a fraction late.
      // On a crossplane V8 that offset against the uneven bank grouping IS
      // the burble — it survives being summed to mono, which is the point.
      this.dbuf[this.di] = b;
      const rd = (this.di + this.dbuf.length - dsamp) % this.dbuf.length;
      const bd = this.dbuf[rd];
      this.di = (this.di + 1) % this.dbuf.length;

      const l = (a + bd * 0.55) * lvl, r = (bd + a * 0.55) * lvl;
      this.y1[0] = l - this.x1[0] + 0.9965 * this.y1[0]; this.x1[0] = l;
      this.y1[1] = r - this.x1[1] + 0.9965 * this.y1[1]; this.x1[1] = r;
      L[i] = this.y1[0];
      if (out[1]) R[i] = this.y1[1];
    }
    return true;
  }
}
registerProcessor('pulse-engine', PulseEngine);
`;

/* When each cylinder fires, as a fraction of one 720° engine cycle, and out
   of which bank. This table is the difference between the cars. */
function firingPlan(car) {
  // some cars only admit to being flat-plane in the tag line, so read both —
  // and `firing` overrides everything for the ones that say it nowhere
  const lay = ((car.layout || "") + " " + (car.tag || "")).toLowerCase();
  const flat = car.firing === "flat" || lay.includes("flat-plane");
  const cyl = Math.max(1, car.cyl || 4);
  const out = [];
  if (lay.includes("rotor")) {
    // No valves, no crossover, no reciprocating anything — just even blasts
    // straight out of a port. That evenness is why a rotary drones where a
    // piston engine thumps.
    for (let i = 0; i < cyl; i++) out.push({ p: i / cyl, bank: i % 2, amp: 1 });
  } else if (cyl === 8 && !flat) {
    // CROSSPLANE. The crank fires perfectly evenly every 90° — the lope is
    // not in the timing, it's in which side of the engine the noise comes
    // out of. Firing order 1-8-4-3-6-5-7-2 across banks 1357 / 2468 gives
    // A-B-B-A-B-A-A-B, so each bank fires in an uneven 180/180/90/270
    // pattern and the two headers argue with each other. That argument is
    // the American V8 burble, and it is the whole reason this table exists.
    const bk = [0, 1, 1, 0, 1, 0, 0, 1];
    for (let i = 0; i < 8; i++) out.push({ p: i / 8, bank: bk[i], amp: 1 });
  } else if (cyl === 10) {
    // A 90° vee on a 72° crank cannot fire evenly: the intervals alternate
    // 54° and 90° forever. That limp in the rhythm is the entire voice of a
    // V10 and no filter can fake it.
    let a = 0;
    for (let i = 0; i < 10; i++) { out.push({ p: a / 720, bank: i % 2, amp: 1 }); a += (i % 2) ? 90 : 54; }
  } else {
    for (let i = 0; i < cyl; i++) out.push({ p: i / cyl, bank: i % 2, amp: 1 });
  }
  return out;
}

/* how far apart the two exhaust banks sit, acoustically. A vee or a boxer
   has two genuinely separate pipes; a straight six has one, and the only
   spread it gets is runner length down a single header. */
function bankSpread(car) {
  const lay = (car.layout || "").toLowerCase();
  if (lay.includes("rotor")) return 0.25;
  if (lay.startsWith("i") || lay.includes("1-cyl")) return 0.4;
  return 1;
}

/* push the current voice's firing table and pulse character to the worklet */
function applyFiring(car) {
  if (!AU.pulseNode) return;
  AU.pulseNode.port.postMessage({ plan: firingPlan(car) });
  const P = AU.pulseNode.parameters;
  // a big lazy pushrod V8 blows a long fat pulse; a race V12 cracks. f0Mul
  // already encodes how deep-voiced a car is, so it doubles as displacement.
  const deep = 1 + (1 - (car.sound.f0Mul || 1)) * 1.6;
  P.get("decay").value = clamp((car.sound.chuffDecay || 1) * deep, 0.2, 4);
  P.get("spread").value = bankSpread(car);
}

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
  AU.comp.threshold.value = -14; AU.comp.ratio.value = 8;
  AU.comp.attack.value = 0.002; AU.comp.release.value = 0.22;
  AU.comp.knee.value = 6;
  // a second, faster stage catches the transients the first one rides over —
  // a bang is 2ms of peak, and without this it lands on the recording as a
  // hard clip rather than a loud pop
  AU.limiter = ctx.createDynamicsCompressor();
  AU.limiter.threshold.value = -2.5; AU.limiter.ratio.value = 20;
  AU.limiter.attack.value = 0.001; AU.limiter.release.value = 0.09;
  AU.limiter.knee.value = 0;
  AU.comp.connect(AU.limiter); AU.limiter.connect(ctx.destination);

  // cabin stage: interior mode seals the highs behind glass and lets the
  // low end boom through the body structure
  AU.cabLp = ctx.createBiquadFilter(); AU.cabLp.type = "lowpass";
  AU.cabLp.frequency.value = 20000; AU.cabLp.Q.value = 0.7;
  AU.cabShelf = ctx.createBiquadFilter(); AU.cabShelf.type = "lowshelf";
  AU.cabShelf.frequency.value = 110; AU.cabShelf.gain.value = 0;
  AU.master.connect(AU.cabLp); AU.cabLp.connect(AU.cabShelf);

  // flyby stage: everything passes through a distance gain + position panner
  AU.flyGain = ctx.createGain(); AU.flyGain.gain.value = 1;
  /* DIRECTIVITY. A car is not a point source, and a trackside pass is the one
     situation where that stops being a technicality. An engine radiates its
     intake noise forwards out of the airbox and its exhaust noise backwards
     out of the pipes, and those are different sounds — so as a car comes at
     you and then leaves, you do not hear one sound Doppler-shifting. You hear
     two, and the handover happens at the moment it passes.

     Coming at you it is all induction and top end: thin, hard, screaming,
     with the bass still travelling away from you down the road. The instant
     it is past, four open megaphones swing round to point at you and the
     whole thing drops into a bassy, raspy, enormous BARK. That flip is the
     sound everybody knows from trackside footage, and it is a spectral tilt
     plus a rebalance, not a pitch bend. See audioTick(). */
  AU.flyLo = ctx.createBiquadFilter(); AU.flyLo.type = "lowshelf";
  AU.flyLo.frequency.value = 260; AU.flyLo.gain.value = 0;
  AU.flyHi = ctx.createBiquadFilter(); AU.flyHi.type = "highshelf";
  AU.flyHi.frequency.value = 1900; AU.flyHi.gain.value = 0;
  AU.flyPan = ctx.createStereoPanner(); AU.flyPan.pan.value = 0;
  AU.cabShelf.connect(AU.flyGain);
  AU.flyGain.connect(AU.flyLo); AU.flyLo.connect(AU.flyHi); AU.flyHi.connect(AU.flyPan);

  // interior bus: the things that live INSIDE the car with you — the cluster
  // chimes, the warning beeps, the indicator, the seatbelt nag. These do not
  // belong behind the windows-up filter, because they are already behind the
  // windows with you. Sealing the car makes them clearer and louder, not
  // duller and quieter, so they skip the cabin stage entirely and their level
  // goes UP when you climb in. See applyCabin().
  // (innerMaster mirrors the master fader so mute and music ducking still
  // reach these — it's the cabin FILTER they skip, not the volume knob)
  AU.inner = ctx.createGain(); AU.inner.gain.value = 0.55;
  AU.innerMaster = ctx.createGain(); AU.innerMaster.gain.value = S.muted ? 0 : 0.85;
  AU.inner.connect(AU.innerMaster); AU.innerMaster.connect(AU.flyGain);

  AU.dry = ctx.createGain(); AU.dry.gain.value = 1;
  AU.flyPan.connect(AU.dry); AU.dry.connect(AU.comp);

  /* ================= THE WET SEND =================
     What is allowed to echo, and it is a short list: the engine.

     This used to tap the whole mix, one node upstream, which meant a tunnel
     echoed the indicator, the seatbelt chime, the wipers, the rain, the
     traffic and the cassette deck along with the car. That is not what a
     tunnel does. A tunnel is a hard surface reflecting the loudest thing
     near it back at you, and next to a running engine nothing else in this
     simulator is remotely loud enough to come back off a wall.

     It is also the difference between "the reverb is on" and "the car is in
     a tunnel". Reverberating the interface sounds is exactly what makes an
     effect audible AS an effect: the click you just made with your finger
     should not have a tail on it, because it did not happen in the tunnel,
     it happened in your car — or in your browser.

     So: the engine voice, the things bolted to the engine that sing with it
     (turbo, blower, induction, straight-cut gearbox), and the exhaust bangs,
     which get their own hotter send further down because a gunshot off
     concrete is the entire reason to drive into one. Nothing else. */
  AU.wetSend = ctx.createGain(); AU.wetSend.gain.value = 1;

  /* …and the way back in. The send is tapped off the raw engine, BEFORE the
     windows-up filter, because that is the truth of it: the noise that goes
     out to hit the wall left through the exhaust, not through the glass. But
     what comes BACK has to get into the car, and it gets in the same way
     everything else does. Without this the tunnel tail is brighter than the
     engine making it, which sounds like a reverb sitting on top of the mix
     rather than like a wall thirty feet away. Mirrors applyCabin(). */
  AU.wetOut = ctx.createGain(); AU.wetOut.gain.value = 1;
  AU.wetCabLp = ctx.createBiquadFilter(); AU.wetCabLp.type = "lowpass";
  AU.wetCabLp.frequency.value = 20000; AU.wetCabLp.Q.value = 0.7;
  AU.wetCabShelf = ctx.createBiquadFilter(); AU.wetCabShelf.type = "lowshelf";
  AU.wetCabShelf.frequency.value = 110; AU.wetCabShelf.gain.value = 0;
  AU.wetOut.connect(AU.wetCabLp); AU.wetCabLp.connect(AU.wetCabShelf);
  AU.wetCabShelf.connect(AU.comp);

  /* the engine's own machinery bus. These are not sound effects — they are
     the engine making noise through a different hole, so they belong on the
     wet send with it rather than with the door clicks. Reaches the room the
     ordinary way as well; see the AU.sfx comment below for the difference. */
  AU.engMech = ctx.createGain(); AU.engMech.gain.value = 1;
  /* --- the duck ---
     Everything continuous — the engine voice, the exhaust, the whole turbo
     rig — passes through this one gain on its way out, so that one node can
     briefly get out of the way of a transient.

     This exists because of a specific, unfixable-by-volume problem. The
     master chain ends in a compressor (2ms attack, 8:1) and a limiter (1ms,
     20:1). At full throttle the engine and the turbo rig already sit well
     past the compressor's threshold, so it is permanently in deep gain
     reduction — and a blow-off is a 4ms transient, which is precisely the
     shape those two exist to flatten. Turning the release up just feeds them
     more and they flatten more of it. You cannot win that fight with gain.

     So the release doesn't try. It goes out on the dry sfx bus, and it pulls
     THIS down for a fifth of a second on its way past. Which is also simply
     true: a bypass valve venting a foot behind your head really does bury the
     engine for a moment, and that momentary hole is most of why the sound is
     satisfying on a real recording. */
  AU.duck = ctx.createGain(); AU.duck.gain.value = 1;
  AU.engMech.connect(AU.duck);
  AU.duck.connect(AU.master); AU.duck.connect(AU.wetSend);

  AU.conv = ctx.createConvolver(); AU.conv.buffer = makeTunnelIR(ctx);
  AU.wet = ctx.createGain(); AU.wet.gain.value = 0;
  // the tube's own voice, on the wet path only: concrete has an axial mode
  // down around 100Hz that everything booms into, and it has swallowed the
  // top of the spectrum by the time the sound gets back to you. Without
  // these two the reverb reads as "more of the same, but blurry" instead of
  // as a large hard object around the car.
  AU.tunLo = ctx.createBiquadFilter(); AU.tunLo.type = "peaking";
  AU.tunLo.frequency.value = 104; AU.tunLo.Q.value = 1.1; AU.tunLo.gain.value = 5;
  AU.tunLp = ctx.createBiquadFilter(); AU.tunLp.type = "lowpass";
  AU.tunLp.frequency.value = 5200; AU.tunLp.Q.value = 0.6;
  AU.tunHp = ctx.createBiquadFilter(); AU.tunHp.type = "highpass";
  AU.tunHp.frequency.value = 55; AU.tunHp.Q.value = 0.7;   // no sub-bass mud in the tail
  AU.wetSend.connect(AU.conv);
  AU.conv.connect(AU.tunHp); AU.tunHp.connect(AU.tunLo); AU.tunLo.connect(AU.tunLp);
  AU.tunLp.connect(AU.wet); AU.wet.connect(AU.wetOut);

  AU.echo = ctx.createDelay(0.6); AU.echo.delayTime.value = 0.24;
  AU.echoFb = ctx.createGain(); AU.echoFb.gain.value = 0.46;
  AU.echoWet = ctx.createGain(); AU.echoWet.gain.value = 0;
  AU.wetSend.connect(AU.echo);
  AU.echo.connect(AU.echoFb); AU.echoFb.connect(AU.echo);
  AU.echo.connect(AU.echoWet); AU.echoWet.connect(AU.wetOut);

  /* the SPACE: a second, parallel version of all of the above for the place
     you are driving rather than for the tunnel you occasionally enter. It
     runs permanently at a low wet mix — see SPACES and applySpace(). Keeping
     it separate from the tunnel chain is the whole point: a hillclimb inside
     a tunnel is a real thing, and the two have to be able to coexist without
     one of them having to be switched off first. */
  AU.spConv = ctx.createConvolver();
  AU.spLo = ctx.createBiquadFilter(); AU.spLo.type = "peaking";
  AU.spLo.frequency.value = 150; AU.spLo.Q.value = 1; AU.spLo.gain.value = 0;
  AU.spLp = ctx.createBiquadFilter(); AU.spLp.type = "lowpass";
  AU.spLp.frequency.value = 6000; AU.spLp.Q.value = 0.6;
  AU.spHp = ctx.createBiquadFilter(); AU.spHp.type = "highpass";
  AU.spHp.frequency.value = 90; AU.spHp.Q.value = 0.7;   // outdoors keeps no sub
  AU.spWet = ctx.createGain(); AU.spWet.gain.value = 0;
  AU.wetSend.connect(AU.spConv);
  AU.spConv.connect(AU.spHp); AU.spHp.connect(AU.spLo); AU.spLo.connect(AU.spLp);
  AU.spLp.connect(AU.spWet); AU.spWet.connect(AU.wetOut);

  AU.spEcho = ctx.createDelay(0.6); AU.spEcho.delayTime.value = 0.1;
  AU.spFb = ctx.createGain(); AU.spFb.gain.value = 0;
  AU.spEchoWet = ctx.createGain(); AU.spEchoWet.gain.value = 0;
  AU.wetSend.connect(AU.spEcho);
  AU.spEcho.connect(AU.spFb); AU.spFb.connect(AU.spEcho);
  AU.spEcho.connect(AU.spEchoWet); AU.spEchoWet.connect(AU.wetOut);

  // pop bus: pops take the normal path PLUS their own hot sends into the
  // reverb and echo, so gunshot crackle rings down the tunnel harder than
  // the engine note does
  AU.popBus = ctx.createGain(); AU.popBus.gain.value = 1.35;
  AU.popBus.connect(AU.master);
  AU.popRev = ctx.createGain(); AU.popRev.gain.value = 0;
  AU.popBus.connect(AU.popRev); AU.popRev.connect(AU.conv);
  AU.popEcho = ctx.createGain(); AU.popEcho.gain.value = 0;
  AU.popBus.connect(AU.popEcho); AU.popEcho.connect(AU.echo);
  // a bang off a brick wall four metres away is the loudest thing in this
  // whole simulator, and it is the reason to drive an alley at all
  AU.popSp = ctx.createGain(); AU.popSp.gain.value = 0.8;
  AU.popBus.connect(AU.popSp); AU.popSp.connect(AU.spConv); AU.popSp.connect(AU.spEcho);

  /* sfx bus: EVERY one-shot component sound — doors, indicators, wipers,
     starters, clunks, the shifter, the tyres, the rain spray. Dry, always.

     These used to have hot sends into the convolver and the slap delay on
     the theory that "the whole car should ring down the concrete". It is a
     nice theory and it is wrong: an indicator relay is a 3cm plastic part
     under the dashboard making about as much noise as a fingernail, and
     putting a three-second concrete tail on it does not make the tunnel more
     convincing, it makes the tunnel sound like a plugin. Real tunnel
     recordings have exactly one thing echoing in them. */
  AU.sfx = ctx.createGain(); AU.sfx.gain.value = 1;
  AU.sfx.connect(AU.master);

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

  // --- where you're standing ---
  // Same engine, four microphones. A tailpipe is all bass and rasp with the
  // intake nowhere; over the open bonnet it's all mechanical clatter and
  // induction with the exhaust behind you; in the back seat it's the whole
  // thing through a bulkhead and a parcel shelf. This stage is that
  // microphone. See applyListen().
  AU.posLo = ctx.createBiquadFilter(); AU.posLo.type = "lowshelf";
  AU.posLo.frequency.value = 190; AU.posLo.gain.value = 0;
  AU.posHi = ctx.createBiquadFilter(); AU.posHi.type = "highshelf";
  AU.posHi.frequency.value = 2400; AU.posHi.gain.value = 0;
  AU.posLp = ctx.createBiquadFilter(); AU.posLp.type = "lowpass";
  AU.posLp.frequency.value = 20000; AU.posLp.Q.value = 0.6;
  // and the standing de-fizz: a permanent shelf off the very top of the
  // voice. Stacked sawtooths put a glassy edge up there that no real engine
  // has — it's the single thing that most makes a synthesized engine read as
  // synthesized. Per-car `air` can hand some of it back.
  AU.engAir = ctx.createBiquadFilter(); AU.engAir.type = "highshelf";
  AU.engAir.frequency.value = 3800; AU.engAir.gain.value = -4;

  /* the body highpass: how much of the bottom this particular car throws away
     before the sound ever reaches you. It is not a taste control — it is
     construction. A thin-wall Inconel race system with no silencers and no
     resonator has almost nothing left under 150Hz, because there is no volume
     anywhere in it for a long wave to exist in; a cast-iron saloon manifold
     into two silencer boxes has all of it and then some.

     Getting this wrong is the classic hypercar-sound mistake: the instinct is
     to make something fast sound BIG and LOW, and doing that to a race V12
     gets you a very loud V8 impression instead of the car.

     Per-car `sound.hp`. And it moves — see audioTick(): from inside a car with
     no deadening it comes back DOWN, because the low end that never made it
     through the air arrives through the tub under you instead. */
  AU.engHp = ctx.createBiquadFilter(); AU.engHp.type = "highpass";
  AU.engHp.frequency.value = 20; AU.engHp.Q.value = 0.55;

  AU.engGain.connect(AU.engHp); AU.engHp.connect(AU.posLo); AU.posLo.connect(AU.posHi);
  AU.posHi.connect(AU.engAir); AU.engAir.connect(AU.posLp);

  // stereo width: dry left, 13ms Haas-delayed right — the car wraps around you
  AU.panL = ctx.createStereoPanner(); AU.panL.pan.value = -0.22;
  AU.panR = ctx.createStereoPanner(); AU.panR.pan.value = 0.22;
  AU.wDelay = ctx.createDelay(0.05); AU.wDelay.delayTime.value = 0.013;
  AU.posLp.connect(AU.panL); AU.panL.connect(AU.master);
  AU.posLp.connect(AU.wDelay); AU.wDelay.connect(AU.panR); AU.panR.connect(AU.master);
  AU.posLp.connect(AU.wetSend);          // …and this is the thing that echoes
  AU.oscs = [];

  // --- the real thing: one blast per cylinder, at that engine's crank
  //     angles, straight into the body chain above. See PULSE_WORKLET_SRC.
  //     Loads asynchronously; if the browser has no worklet support the car
  //     still sounds exactly like it did before, just without the chuff.
  if (ctx.audioWorklet) {
    const url = URL.createObjectURL(new Blob([PULSE_WORKLET_SRC], { type: "application/javascript" }));
    ctx.audioWorklet.addModule(url).then(() => {
      const node = new AudioWorkletNode(ctx, "pulse-engine",
        { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      // deliberately UNDER the oscillator stack. The pulses are the texture
      // the tone was missing, not a replacement for it — and both sides share
      // the same soft clip downstream, so anything hotter than this just
      // squares the whole voice off and loses the dynamics it came to add.
      AU.chuffG = ctx.createGain(); AU.chuffG.gain.value = 0.3;
      node.connect(AU.chuffG); AU.chuffG.connect(AU.mixIn);
      AU.pulseNode = node;
      applyFiring(voiceCar());
    }).catch(() => {}).then(() => URL.revokeObjectURL(url));
  }

  // combustion throb: a firing-rate LFO rides the voice gain so you can hear
  // individual cylinders — lopey at idle, smoothing out as revs climb.
  // With the pulse train running this is largely redundant and mostly gets
  // in its way, so it steps back to a hint (see audioTick).
  AU.pulse = ctx.createOscillator(); AU.pulse.type = "sawtooth"; AU.pulse.frequency.value = 20;
  AU.pulseG = ctx.createGain(); AU.pulseG.gain.value = 0;
  AU.pulse.connect(AU.pulseG); AU.pulseG.connect(AU.mixIn.gain); AU.pulse.start();

  // --- turbo whistle / supercharger gear whine ---
  AU.whine = ctx.createOscillator(); AU.whine.type = "sine"; AU.whine.frequency.value = 800;
  AU.whineG = ctx.createGain(); AU.whineG.gain.value = 0;
  AU.whine.connect(AU.whineG); AU.whineG.connect(AU.engMech); AU.whine.start();

  // second whistle for sequential setups — the high-rpm pair sings its own,
  // higher note that fades in as stage two comes online
  AU.whine2 = ctx.createOscillator(); AU.whine2.type = "sine"; AU.whine2.frequency.value = 1200;
  AU.whine2G = ctx.createGain(); AU.whine2G.gain.value = 0;
  AU.whine2.connect(AU.whine2G); AU.whine2G.connect(AU.engMech); AU.whine2.start();

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
  AU.blowG = ctx.createGain(); AU.blowG.gain.value = 0;
  AU.scHp.connect(AU.blowG); AU.blowG.connect(AU.engMech);
  AU.scOscs = [["sawtooth", 1, 0.5], ["sawtooth", 1.011, 0.35],
               ["sine", 2.02, 0.55], ["sine", 3.01, 0.2]].map(([type, mult, g]) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = 2000;
    const og = ctx.createGain(); og.gain.value = g;
    o.connect(og); og.connect(AU.scHp); o.start();
    return { o, mult };
  });

  // --- straight-cut gearbox: the interior voice of a race car ---
  // Sit in a GT3 car and the gearbox does not hum, it SCREAMS — a hard,
  // piercing, almost synthetic note that sounds far more like an electric
  // motor than like anything mechanical, and which sits on top of the engine
  // rather than under it. A sine cannot do that; the sharpness comes from
  // the harmonics. Straight-cut teeth mesh with no helix angle to roll the
  // contact on and off, so each tooth SLAMS — the excitation is a hard edge,
  // rich in odd harmonics, and the casing resonance picks one band of them
  // and rings. That is the whole recipe: a buzzy stack through a narrow,
  // high-Q peak. Only cars with `gearWhine` ever open this up.
  AU.boxBp = ctx.createBiquadFilter(); AU.boxBp.type = "bandpass";
  AU.boxBp.frequency.value = 3000; AU.boxBp.Q.value = 2.6;   // the casing ringing
  AU.boxHp = ctx.createBiquadFilter(); AU.boxHp.type = "highpass";
  AU.boxHp.frequency.value = 800; AU.boxHp.Q.value = 0.7;    // no mud, it's all edge
  AU.boxG = ctx.createGain(); AU.boxG.gain.value = 0;
  AU.boxBp.connect(AU.boxHp); AU.boxHp.connect(AU.boxG); AU.boxG.connect(AU.engMech);
  // mesh fundamental, then the odd harmonics that do the cutting. The pair at
  // 1.004 beat slowly against each other — real gear sets are never perfect,
  // and that shimmer is what stops it sounding like a test tone.
  AU.boxOscs = [["sawtooth", 1, 0.5], ["sawtooth", 1.004, 0.34], ["square", 2, 0.3],
                ["sawtooth", 3, 0.16], ["square", 4, 0.07]].map(([type, mult, g]) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = 3000;
    const og = ctx.createGain(); og.gain.value = g;
    o.connect(og); og.connect(AU.boxBp); o.start();
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
  nsrc.connect(AU.nbp); AU.nbp.connect(AU.nGain); AU.nGain.connect(AU.engMech); nsrc.start();

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
  tbsrc.connect(AU.tbBp); AU.tbBp.connect(AU.tbG); AU.tbG.connect(AU.engMech); tbsrc.start();

  // --- the quad-turbo rig ---
  // Built unconditionally (a handful of oscillators is nothing) and silent
  // unless the car has a `turboRig`. See TURBO RIG.
  buildTurboRig(ctx);

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
  ssrc.connect(AU.scBp); AU.scBp.connect(AU.scG); AU.scG.connect(AU.sfx); ssrc.start();

  // --- ambience bus: traffic & rain live outside the car mix, with a fixed
  //     send into the tunnel reverb so they echo when the tunnel is on ---
  AU.amb = ctx.createGain(); AU.amb.gain.value = 1;
  AU.ambLp = ctx.createBiquadFilter(); AU.ambLp.type = "lowpass"; AU.ambLp.frequency.value = 20000;
  AU.amb.connect(AU.ambLp); AU.ambLp.connect(AU.comp);

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
  sw.connect(swHp); swHp.connect(AU.sprayG); AU.sprayG.connect(AU.sfx); sw.start();

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
  gsrc.connect(gbp); gsaw.connect(gbp); gbp.connect(AU.grindGain); AU.grindGain.connect(AU.sfx);
  gsrc.start(); gsaw.start(); glfo.start();

  AU.ready = true;
  loadPshift();                          // the recorded paddle click
  loadTurboSamples();                    // the Molsheim's two recorded turbo events
  buildEngineVoice(voiceCar());
  applyTunnel();
  applySpace(true);                      // the place you're driving, from the first frame
  applyListen();                         // …and applyCabin() with it
  applyCabin();
  updateMasterGain();
  applyMusicEcho();
  applyStereoWide();
}

/* ================================================================
   WHERE YOU'RE LISTENING FROM
   ================================================================
   The default is where you have always been: in the driver's seat, which is
   the compromise position every car is voiced around — some intake, some
   exhaust, the whole thing arriving as one sound.

   The other three are all worse places to sit and all more interesting.

     hood      Standing over the open bonnet. The exhaust is fifteen feet
               behind you, so the bass mostly isn't there; what IS there is
               induction roar, valve gear, injector tick and turbo. Bright,
               mechanical, close.
     exhaust   Down at the tailpipe. All bass, all rasp, every overrun pop
               going off in your face, and no intake at all. The loudest
               place to be and the least informative.
     rear      The back seat. Everything the driver hears, minus the top,
               plus the bulkhead and the parcel shelf. Boomy and distant —
               which is exactly why chauffeur cars are voiced for it.

   `eng`/`lo`/`hi`/`lp` shape the combustion voice itself; the rest are
   weightings applied in the audio tick to the sounds that don't run through
   the engine chain (pops, intake noise, turbo whistle, wind). */
const LISTEN = {
  driver:  { name: "DRIVER'S SEAT", tag: "how the car is voiced. The default.",
             inside: true,  eng: 1.00, lo:  0, hi:  0, lp: 20000,
             pop: 1.0, intake: 1.0, turbo: 1.0, wind: 1.0 },
  hood:    { name: "OVER THE BONNET", tag: "induction, valve gear and turbo. Almost no exhaust.",
             inside: false, eng: 1.20, lo: -6, hi: +5, lp: 20000,
             pop: 0.45, intake: 2.1, turbo: 2.0, wind: 0.5 },
  // …with one correction: on a turbo car the turbos are IN the exhaust
  // stream, bolted to the manifolds, and everything they do goes out of the
  // back of the car with everything else. Standing behind a big turbo car you
  // do not hear less turbo than the driver does — you hear the intake side
  // less, which is a different thing, and you hear the compressors bleed off
  // on every lift very clearly indeed. So intake stays buried and the turbo
  // itself sits close to where the driver has it.
  exhaust: { name: "AT THE TAILPIPE", tag: "all bass and rasp, every pop in your face, no intake.",
             inside: false, eng: 1.45, lo: +7, hi: +1, lp: 11000,
             pop: 2.2, intake: 0.3, turbo: 0.85, wind: 0.55 },
  rear:    { name: "BACK SEAT", tag: "through the bulkhead. Boomy, distant, chauffeur-side.",
             inside: true,  eng: 0.82, lo: +4, hi: -8, lp: 2600,
             pop: 0.7, intake: 0.45, turbo: 0.55, wind: 0.85 },
};

function ear() { return LISTEN[S.listen] || LISTEN.driver; }
/* is the microphone actually in the car? Two of the four aren't, and that
   settles every "does the cabin treatment apply" question below — you can be
   looking at the cabin and listening at the tailpipe, and the tailpipe wins. */
function insideEar() { return ear().inside; }

function setListen(pos) {
  if (!LISTEN[pos] || pos === S.listen) return;
  S.listen = pos;
  initAudio();
  if (AU.ctx && AU.ctx.state === "suspended") AU.ctx.resume();
  applyListen();
  refreshListenUi();
  sfxClunk(0.25);                     // the mic being moved and set down
  save();
}

function refreshListenUi() {
  document.querySelectorAll("#wsListen .ws-card").forEach(b =>
    b.classList.toggle("on", b.dataset.listen === S.listen));
  const note = $("wsListenNote");
  if (!note) return;
  note.textContent = insideEar()
    ? "You're inside the car, so " + (S.cabin ? "the cabin treatment applies." : "pressing V will seal it.")
    : "You're outside the car — the cabin toggle does nothing from here. A tailpipe is a tailpipe.";
}

function applyListen() {
  if (!AU.ready) return;
  const t = AU.ctx.currentTime, p = ear();
  AU.posLo.gain.setTargetAtTime(p.lo, t, 0.08);
  AU.posHi.gain.setTargetAtTime(p.hi, t, 0.08);
  AU.posLp.frequency.setTargetAtTime(p.lp, t, 0.08);
  // every bang goes off in the pipe, so a tailpipe ear gets all of it and a
  // bonnet ear gets the version that came round the side of the car
  AU.popBus.gain.setTargetAtTime(1.35 * p.pop, t, 0.08);
  applyCabin();                       // an outside ear hears no cabin at all
}

/* ---- hush: how hard this particular car seals ----
   Every car gets the same windows-up filtering in cabin view. One car gets
   something else. The Phantom carries 130kg of insulation, double-skinned
   bulkheads, foam-filled tyres and 6mm double glazing, and the whole point
   of it is that stepping inside is like a door closing on the world: the
   engine recedes to a suggestion, the wind stops, and the road disappears.
   `hush` (0..1 on the car) is how much of that treatment it gets, and it
   only ever applies from the inside — stand outside a Phantom and it still
   sounds like a 6.75-litre V12, because it is one. */
function hush() { return (inCabin() && CC.hush) ? CC.hush : 0; }
/* ---- rawCabin: the opposite of hush ----
   `hush` assumes the thing between you and the engine is trying to stop it.
   In a race car nothing is trying to stop anything. There is no headliner, no
   carpet, no glass in the quarters, no bulkhead insulation — just a carbon tub
   with the engine bolted to the back of it a metre behind your head. Climbing
   in does not seal the car, it puts you INSIDE the resonator.

   So for these cars the interior treatment runs backwards: the windows-up
   lowpass opens most of the way back up, the low end the open pipes never made
   in the air arrives instead through the structure, and the whole voice gets
   LOUDER rather than quieter. Which is exactly why onboard footage of a GT
   car is so much more violent than the trackside shot of the same lap.
   0 = a road car with carpet and glass. 1 = a tub with a race engine on it. */
function rawCabin() { return inCabin() ? (CC.rawCabin || 0) : 0; }
/* what the combustion voice gains by you climbing into a car like that */
function cabinLift() { return 1 + 0.55 * rawCabin(); }
/* "are we hearing this from inside the car" — the view being the cabin isn't
   enough; the ear has to be in there too */
function inCabin() { return S.cabin && insideEar(); }
/* what the engine voice, the wind and the road get multiplied by in here */
function hushEng() { return 1 - 0.72 * hush(); }
function hushAir() { return 1 - 0.62 * hush(); }

/* ---- per-car interior voicing ----
   `hush` and `rawCabin` between them cover the two ordinary cases: a car
   trying to keep the engine out, and a car with nothing between you and it.
   Neither describes a race car properly, because a race interior is not a
   loud road interior — it is a DIFFERENT interior, and the difference is
   spectral rather than a level.

   Sit in a car with no glass, no headliner, no carpet and a bare carbon tub
   and two things happen at once. There is nothing with any mass in it to
   radiate low frequency, so the bottom end simply is not there — a tub is a
   thin stiff panel, not a body shell with cavities. And there is nothing
   absorbent anywhere, so everything above a couple of kHz arrives intact and
   keeps arriving, off every hard surface in the car. That is why onboard audio
   sounds THIN and HARD rather than big: the low end you would get in a road
   car is missing and the top is unfiltered. It is also why the sound you
   notice most is not the engine, it's the gearbox.

     eng    trim on the combustion voice in here (a race interior is not
            where the exhaust is — the megaphones are pointing away from you)
     air    dB added to the engine's high shelf: the top that survives
     shelf  absolute low-shelf dB, replacing the rawCabin bass bonus
     lp     multiplier on the windows-up lowpass — how much top gets through */
function cabinVoice() { return (inCabin() && CC.cabinVoice) ? CC.cabinVoice : null; }
function cabinEngTrim() { const V = cabinVoice(); return V && V.eng !== undefined ? V.eng : 1; }
function cabinAirAdd() { const V = cabinVoice(); return (V && V.air) || 0; }

/* ---- the turbo owning the cabin ----
   On most turbo cars the engine is the loudest thing in the cabin and the
   charger is a layer on top of it. On a very few — a quad-turbo W16 being the
   type specimen — it is the other way round, and the reason is geometry rather
   than volume. The exhaust exits behind the axle and everything between you
   and it is trying to stop it: bulkhead, insulation, laminated glass. The
   turbochargers and their charge pipes are on the wrong side of all of that,
   bolted to the back wall of the cabin, and the bypass valves vent into the
   engine bay — which IS that wall. So sealing yourself in subtracts the engine
   and leaves the plumbing, and what you hear at full boost is induction and
   compressors with a W16 rumbling somewhere underneath.

   Hence a mask on the combustion voice rather than a boost on the turbo: past
   a point, turning the rig up just drives the limiter and squashes everything
   including the rig. Pulling the engine down instead leaves the turbo layers
   completely intact and simply removes what they were competing with.

   It scales with how hard the plumbing is actually working, which is the part
   that keeps it honest: at idle the engine is untouched and sounds like an
   eight-litre engine should, and it only recedes as the compressors come up.
   The mask is a cabin effect only — from outside, the exhaust wins, because
   out there nothing is standing between you and it. */
function rigCabinMask() {
  if (!inCabin()) return 1;
  const C = rigOf(CC);
  if (!C || !C.cabinMask) return 1;
  const act = clamp(Math.max(S.tSpd || 0, S.boost || 0), 0, 1);
  return 1 - C.cabinMask * act;
}

/* interior mode: windows-up filtering on the whole mix */
function applyCabin() {
  if (!AU.ready) return;
  const t = AU.ctx.currentTime, on = inCabin();
  const h = hush();
  // the cluster and the stalk get LOUDER when you climb in, not quieter —
  // they were always inside the car, it's the rest of the world that just
  // got shut out
  AU.inner.gain.setTargetAtTime(on ? 1.55 : 0.55, t, 0.12);
  // 1150Hz is "windows up". At full hush it drops to ~400 — the frequency
  // above which the Phantom simply does not let anything through. And at full
  // rawCabin it goes the other way to ~8k, because there is nothing in a
  // carbon tub for it to be stopped BY.
  const raw = CC.rawCabin || 0;
  // a car may override either half of the rawCabin treatment — see cabinVoice()
  const CV = CC.cabinVoice || {};
  const cabHz = (1150 - 750 * h) * (1 + 6 * raw) * (CV.lp || 1);
  const cabSh = CV.shelf === undefined ? (5.5 - 7 * h) + 5 * raw : CV.shelf;
  AU.cabLp.frequency.setTargetAtTime(on ? Math.min(20000, cabHz) : 20000, t, 0.1);
  // …and the low shelf comes DOWN rather than up, because the boom a normal
  // body panel resonates with is exactly what all that mass is there to stop.
  // A tub does the reverse: it is a drum skin with an engine on it, so the
  // bottom the pipes never made in the air comes back through the floor.
  AU.cabShelf.gain.setTargetAtTime(on ? cabSh : 0, t, 0.1);
  AU.ambLp.frequency.setTargetAtTime(on ? 650 - 420 * h : 20000, t, 0.1);  // outside world, doubly sealed
  // the tunnel tail comes back in through the same glass the engine does
  if (AU.wetCabLp) {
    AU.wetCabLp.frequency.setTargetAtTime(on ? Math.min(20000, cabHz) : 20000, t, 0.1);
    AU.wetCabShelf.gain.setTargetAtTime(on ? cabSh : 0, t, 0.1);
  }
}

/* ================================================================
   THE TUNNEL
   ================================================================
   A tunnel is not a room, and building it like one is why most game reverbs
   sound like a car park instead of a tube. Three things actually define it,
   and all three have to be there or none of them read:

     FLUTTER   Two parallel concrete walls about 7m apart. Sound crosses,
               bounces, crosses back — a fixed ~20ms round trip, over and
               over, hundreds of times, because concrete absorbs almost
               nothing. That repetition IS the tunnel. Alternating the
               polarity of the taps (a hard wall inverts nothing, but the
               path length difference puts each bounce half a period out
               against the last) is what turns a plain echo into the hollow
               metallic ring you actually recognise.

     FAR END   One late, isolated reflection off the mouth of the tunnel a
               hundred metres ahead, arriving well behind the tail — and
               then its own return off the end behind you. This is what
               makes it long rather than merely live.

     DECAY     Concrete keeps the bottom and slowly eats the top, so the tail
               gets darker as it fades rather than just quieter. A tail with
               a fixed spectrum is the giveaway.

   And the fourth thing, which isn't in the IR at all: the ENVELOPE. Crossing
   into a tunnel is a fast whoomp — 100ms and the walls are simply there.
   Coming out, the tail spills out behind you over half a second. Symmetric
   fades are the single most common tell. See applyTunnel(). */
function makeTunnelIR(ctx) {
  const sr = ctx.sampleRate, len = Math.floor(sr * 3.0);
  const buf = ctx.createBuffer(2, len, sr);
  const FLUT = 0.0204;                  // 7m of concrete, there and back
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    // the two ears are not the same distance from either wall, so their
    // flutters sit a few percent apart and beat against each other
    const wob = ch ? 1.041 : 1;

    // --- the diffuse bed: dense noise, low-passed as it decays so the tail
    //     darkens on the way out the way concrete makes it. This is the
    //     WASH, and it has to sit well under the flutter — a tunnel that is
    //     mostly wash is a car park.
    let lp = 0;
    for (let i = 0; i < len; i++) {
      lp += ((Math.random() * 2 - 1) - lp) * (0.34 - 0.26 * (i / len));
      d[i] = lp * Math.exp(-(i / sr) * 2.0) * 0.22;
    }

    // --- the flutter comb: the sound of the tunnel.
    //     Every bounce has to be the SAME SHAPE as the last one. Fill each
    //     tap with its own fresh noise and there is no repetition, just extra
    //     noise at regular intervals — which is the difference between a
    //     tunnel and a hiss. So the strike is deterministic and identical
    //     every time round, and only the smear behind it is random.
    let g = 0.9;
    for (let n = 1; n < 145; n++) {
      const at = Math.floor(FLUT * wob * n * sr);
      if (at >= len) break;
      const sgn = (n & 1) ? -1 : 1;      // alternating polarity — the hollow ring
      for (let j = 0; j < 5 && at + j < len; j++)
        d[at + j] += sgn * g * (1 - j / 5) * (j ? -0.4 : 1);
      // …plus what the wall adds each time round. It grows with every bounce,
      // and it's what eventually turns the ring back into a wash.
      const w = Math.min(600, 20 + n * 9);
      let s = 0;
      for (let j = 0; j < w && at + j < len; j++) {
        s += ((Math.random() * 2 - 1) - s) * 0.35;
        d[at + j] += sgn * g * 0.45 * s * (1 - j / w);
      }
      g *= 0.93;
    }

    // --- the far end, and the end behind you
    for (const [tm, gain, w] of [[0.186, 0.42, 1400], [0.372, 0.24, 2200], [0.61, 0.11, 3000]]) {
      const at = Math.floor(tm * sr * wob);
      let s = 0;
      for (let j = 0; j < w && at + j < len; j++) {
        s += ((Math.random() * 2 - 1) - s) * 0.22;      // arrives dull, it's been a long way
        d[at + j] += s * gain * (1 - j / w);
      }
    }
  }
  return buf;
}

/* ================================================================
   THE SPACE AROUND YOU
   ================================================================
   The tunnel is an event: you go in, the world changes, you come out. This is
   the other thing — the place you are driving, which is on the whole time and
   which you are not supposed to consciously notice. Bone-dry audio is the
   single most synthetic-sounding thing in a car sim, and "add reverb" is the
   single most common wrong fix, because a road is not a room.

   What you actually hear outdoors is EARLY REFLECTIONS off a small number of
   nearby hard surfaces, and almost no tail at all. Which surfaces, how far,
   and on which side is the entire character:

     ALLEY      Two brick walls four metres apart and six storeys tall. The
                round trip is ~25ms, which is short enough that the repeats
                fuse into a pitch rather than an echo — an alley RINGS, and
                it rings at roughly 40Hz times whatever it wants to. Nothing
                absorbs, so it is bright and obnoxious and very close.

     CITY       A street canyon: hard faces both sides but twenty-odd metres
                apart and broken up by every window, balcony and parked car
                between you and them. The slap is long enough to read as an
                echo (~120ms), it comes back scattered rather than as a
                strike, and glass and render eat the top on the way.

     HILLCLIMB  The interesting one, and the reason this exists. Goodwood is
                a narrow tree-lined run with a flint wall down ONE side and
                hay bales down the other. So it is not a symmetric space at
                all: you get a hard early strike off the wall on one ear and
                soft dark scatter off bales and leaves on the other. That
                asymmetry is exactly what onboard footage from a hillclimb
                sounds like, and it's why it reads as "outdoors, but tight"
                instead of as a small room.

   All three sit at a low wet mix permanently rather than being gated on and
   off. You should not be able to hear it being switched on; you should only
   hear it when it's missing. */
const SPACES = {
  open: {
    name: "OPEN ROAD", desc: "Nothing to bounce off for a hundred metres. Just the car and the air.",
    wet: 0,
  },
  alley: {
    name: "BACK ALLEY", desc: "Four metres of brick either side, six storeys up. Everything rings and nothing gets away.",
    widthM: 4.2, walls: 90, absorb: 0.965, tailS: 1.1, dark: 0.14,
    wet: 0.62, slap: 0.028, fb: 0.44, lp: 7200, lo: 4,
  },
  city: {
    name: "CITY STREET", desc: "A canyon of glass and render, twenty metres wide and broken up by every window in it.",
    widthM: 21, walls: 26, absorb: 0.9, tailS: 1.9, dark: 0.3, scatter: 3.2,
    wet: 0.36, slap: 0.122, fb: 0.3, lp: 3800, lo: 2.5,
  },
  hill: {
    name: "HILLCLIMB", desc: "A flint wall down one side, hay bales and trees down the other. Tight, dark and lopsided.",
    widthM: 11, walls: 9, absorb: 0.72, tailS: 0.85, dark: 0.5, scatter: 2.2, oneSided: true,
    wet: 0.34, slap: 0.064, fb: 0.2, lp: 2500, lo: 1,
  },
};

function curSpace() { return SPACES[S.space] || SPACES.open; }

/* Build the impulse for one of the above. Same principle as the tunnel IR:
   the repeats have to be the SAME SHAPE every time round or they read as
   noise at intervals rather than as a surface. What differs here is that
   there are only a handful of them before the whole thing has escaped
   upward — outdoors there is no ceiling, and that missing lid is most of
   why a street does not sound like a corridor. */
function makeSpaceIR(ctx, sp) {
  const sr = ctx.sampleRate, len = Math.max(1, Math.floor(sr * (sp.tailS || 1)));
  const buf = ctx.createBuffer(2, len, sr);
  const rt = (sp.widthM * 2) / 343;              // there and back across the gap
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const wob = ch ? 1.037 : 1;
    // the thin diffuse bed. Far quieter than the tunnel's, because most of
    // the energy went straight up and never came back.
    let lp = 0;
    for (let i = 0; i < len; i++) {
      lp += ((Math.random() * 2 - 1) - lp) * (0.4 - 0.3 * (i / len));
      d[i] = lp * Math.exp(-(i / sr) * (3.2 + 4 * (sp.dark || 0))) * 0.075;
    }
    // the wall strikes
    let g = 0.85;
    for (let n = 1; n <= (sp.walls || 20); n++) {
      const at = Math.floor(rt * wob * n * sr);
      if (at >= len) break;
      // A lopsided space (a wall on the left, bales on the right) puts the
      // hard strikes into one ear and lets the other ear have only the soft
      // scatter. Alternate the polarity as the tunnel does — the path-length
      // difference is what turns repeats into a ring instead of an echo.
      const side = sp.oneSided ? (ch === 0 ? 1 : 0.22) : 1;
      const sgn = (n & 1) ? -1 : 1;
      const strike = g * side;
      for (let j = 0; j < 4 && at + j < len; j++)
        d[at + j] += sgn * strike * (1 - j / 4) * (j ? -0.4 : 1);
      // …and the smear the surface adds. Brick adds almost none; render,
      // leaves and hay add a lot, which is what makes them read as soft.
      const w = Math.min(900, 14 + n * 11 * (sp.scatter || 1));
      let s = 0;
      for (let j = 0; j < w && at + j < len; j++) {
        s += ((Math.random() * 2 - 1) - s) * (0.4 - 0.25 * (sp.dark || 0));
        d[at + j] += sgn * strike * 0.5 * (sp.scatter || 0.5) * s * (1 - j / w);
      }
      g *= sp.absorb || 0.9;
    }
    // one far face down the road — the end of the alley, the building across
    // the junction, the bank on the outside of the corner ahead
    const at = Math.floor((sp.slap || 0.1) * 2.4 * sr * wob);
    let s = 0;
    for (let j = 0; j < 1800 && at + j < len; j++) {
      s += ((Math.random() * 2 - 1) - s) * 0.2;
      d[at + j] += s * 0.16 * (1 - j / 1800);
    }
  }
  return buf;
}

/* Set the current space. The wet mix never gets gated on and off the way the
   tunnel does — it fades in once and then stays, because a place does not
   start and stop. Inside a tunnel the outside world stops mattering, so the
   space ducks right down and lets the concrete have it. */
function applySpace(instant) {
  if (!AU.ready || !AU.spWet) return;
  const t = AU.ctx.currentTime, sp = curSpace();
  if (sp !== AU.spCur) {
    AU.spCur = sp;
    if (sp.wet > 0) AU.spConv.buffer = makeSpaceIR(AU.ctx, sp);
  }
  const duck = S.tunnel ? 0.12 : 1;         // the tube wins, every time
  const tc = instant ? 0.02 : 0.35;
  AU.spWet.gain.setTargetAtTime(sp.wet * duck, t, tc);
  AU.spEcho.delayTime.setTargetAtTime(sp.slap || 0.1, t, 0.2);
  AU.spFb.gain.setTargetAtTime(sp.fb || 0, t, 0.2);
  AU.spEchoWet.gain.setTargetAtTime((sp.wet > 0 ? 0.3 : 0) * duck, t, tc);
  AU.spLp.frequency.setTargetAtTime(sp.lp || 6000, t, tc);
  AU.spLo.gain.setTargetAtTime(sp.lo || 0, t, tc);
}

function setSpace(id) {
  if (!SPACES[id] || id === S.space) return;
  S.space = id;
  initAudio();
  if (AU.ctx && AU.ctx.state === "suspended") AU.ctx.resume();
  applySpace();
  refreshSpaceUi();
  save();
}

/* The note under the cards. It used to print the selected card's own
   description straight back at you, one line lower, which is the kind of
   thing that looks finished and reads as filler. It says something the cards
   don't instead: what the space is doing to the sound. */
const SPACE_NOTES = {
  open: "Only the car, and a hint of room tone so it isn't uncomfortably dry. Everything below is a surface to bounce off.",
  alley: "The round trip is 25ms — too fast to hear as an echo, so it fuses into a ring instead. Lift off and the bangs come back at you.",
  city: "Far enough that you hear the slap arrive separately, broken up enough that it comes back scattered rather than as a strike.",
  hill: "Hard reflection on one ear, soft scatter on the other. Wear headphones for this one — the lopsidedness is the whole effect.",
};

function refreshSpaceUi() {
  document.querySelectorAll("#wsSpace .ws-card").forEach(b =>
    b.classList.toggle("on", b.dataset.space === S.space));
  const note = $("wsSpaceNote");
  if (note) note.textContent = S.tunnel
    ? "You're in the tunnel — the concrete is louder than anything outside it, so this is doing almost nothing right now."
    : (SPACE_NOTES[S.space] || SPACE_NOTES.open);
}

/* pipe resonances for the current car — Screamer shifts them up the spectrum */
function applyFormants() {
  if (!AU.ready) return;
  const fs = voiceCar().sound.formants || [];
  const fm = exSound().formantMul || 1;
  AU.formants.forEach((p, i) => {
    const [fq, q, db] = fs[i] || [1000, 1, 0];
    p.frequency.value = fq * fm; p.Q.value = q; p.gain.value = db;
  });
}

function applyTunnel() {
  if (!AU.ready) return;
  const t = AU.ctx.currentTime, on = S.tunnel;
  // ASYMMETRIC. Going in, the walls arrive all at once — a hundred
  // milliseconds and you are inside. Coming out, the tail keeps ringing in
  // the tube behind you for half a second after the light hits the
  // windscreen. Fading both ways at the same speed is the thing that most
  // makes a tunnel sound like an effect being switched on.
  const IN = 0.035, OUT = 0.18;
  const tc = on ? IN : OUT;
  // a touch of room tone stays on outside tunnels — bone-dry sounds digital
  if (on) {
    // the whoomp: the mouth of a tunnel is louder than the middle of it,
    // because for that first moment you get the wall AND the open road
    AU.wet.gain.cancelScheduledValues(t);
    AU.wet.gain.setTargetAtTime(1.45, t, IN);
    AU.wet.gain.setTargetAtTime(1.05, t + 0.16, 0.22);
  } else {
    AU.wet.gain.cancelScheduledValues(t);
    AU.wet.gain.setTargetAtTime(0.14, t, OUT);
  }
  // the slap runs the length of the tube rather than round a room
  AU.echo.delayTime.setTargetAtTime(on ? 0.186 : 0.24, t, 0.2);
  AU.echoFb.gain.setTargetAtTime(on ? 0.58 : 0.46, t, 0.2);
  AU.echoWet.gain.setTargetAtTime(on ? 0.5 : 0, t, tc);
  // The pops used to get a hot private send into both the reverb AND the
  // slap, on top of the level they already reach the room at. In a tunnel
  // that stacked up into a wall of banging that buried the engine — which is
  // backwards, because the engine is the thing you came to hear. They still
  // ring down the tube more than anything else does, just not over the top
  // of the car making them.
  AU.popRev.gain.setTargetAtTime(on ? 0.45 : 0.16, t, tc);
  AU.popEcho.gain.setTargetAtTime(on ? 0.22 : 0, t, tc);
  // (the interface, the ambience and the cassette deck deliberately have no
  //  send at all — see the AU.wetSend comment in initAudio)
  // inside, the tube keeps the bottom and eats the top; outside, the "room
  // tone" is a small honest space and shouldn't boom at all
  AU.tunLo.gain.setTargetAtTime(on ? 6 : 0, t, tc);
  AU.tunLp.frequency.setTargetAtTime(on ? 4600 : 9000, t, tc);
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
  applyFiring(car);                               // …and this engine's firing order
  /* A layer is [wave, harmonic, gLo, gHi] — its level at the bottom of the
     range and its level at the top, crossfaded across the tacho. A fifth slot
     turns that into THREE zones: [wave, harmonic, gLo, gMid, gHi]. Two zones
     is enough for an engine whose character just gets louder, but it cannot
     describe an engine that changes shape twice — a big forced-induction
     motor that rumbles at the bottom, hardens through the middle as the
     turbos come in, and then turns exotic at the top while KEEPING its
     bottom end. So layers that need it get a mid-range waypoint, and
     everything already written stays a plain two-point fade. */
  for (const [type, mult, a, b, c] of car.sound.layers) {
    const o = AU.ctx.createOscillator(); o.type = type; o.frequency.value = 30;
    const g = AU.ctx.createGain(); g.gain.value = a;
    o.connect(g); g.connect(AU.mixIn); o.start();
    const three = c !== undefined;
    AU.oscs.push({ o, g, mult,
                   gLo: a,
                   gMid: three ? b : null,
                   gHi: three ? c : (b === undefined ? a : b) });
  }
}

/* ================================================================
   TURN SIGNALS
   ================================================================
   A car's indicator is the sound you hear more than any other and think
   about least, and every manufacturer voices it differently on purpose. Five
   families, and which one a car gets says as much about it as its engine:

     relay    A real bimetallic flasher: a strip of metal heating, bending,
              slamming a contact shut and springing back. Loud, warm, and
              slightly uneven — "TOCK ... tik". Anything old enough to have
              a key barrel gets this.
     luxury   The expensive one. Deep, damped, and wooden, with a resonance
              behind it like a switch in a cabinet — "tonk ... tonk". No
              relay is involved; it's a speaker imitating a nicer relay.
     crisp    Precise, tight and clean. The satisfying one — a watch escape-
              ment rather than a machine.
     digital  Modern supercar: two short pitched blips through the cluster
              speaker. Obviously synthesized, and obviously deliberate.
     ev       The electric car's: soft, warm and rounded, a low two-tone
              "boop ... bop". No mechanism at all, just a nice noise.

   Race cars get NOTHING — see RACE_CARS below. There is no indicator on a
   car with no road registration, so there's no lamp and no stalk either.

   These are interior sounds, so they use the pedal helpers (straight to the
   master, no tunnel echo) and get louder with the windows up. */

const IND = { side: 0, on: false, t: 0 };     // -1 left, 0 off, 1 right
const IND_PERIOD = 0.38;                      // ~79 flashes/min, near enough to legal

/* what this car's indicator sounds like — null if it hasn't got one */
function indVoice() {
  if (CC.race) return null;                   // no lights, no stalk, no sound
  if (CC.indicator) return CC.indicator;
  if (CC.ev || CC.edrive) return "ev";
  return CC.ignKey ? "relay" : "digital";     // key barrel = old enough for a real relay
}

function sfxIndicator(voice, on) {
  if (!AU.ready) return;
  const t = AU.ctx.currentTime;
  const k = on ? 1 : 0.72;                  // the return stroke is always softer
  // the relay is bolted to the back of the dash, a foot from your knee — it
  // rides the interior bus, which handles getting louder when you climb in
  const B = AU.inner;
  const noise = (at, lvl, o) => pedNoise(at, lvl, { ...o, bus: B });
  const tone = (at, lvl, o) => pedTone(at, lvl, { ...o, bus: B });

  switch (voice) {
    case "relay":
      // the contact slamming shut, then the strip itself ringing
      noise(t, 0.15 * k, { rate: 1.1, f: 900, q: 2, dec: 0.014 });
      tone(t, 0.13 * k, { f: on ? 184 : 210, f2: 92, dec: 0.028 });
      noise(t + 0.004, 0.035 * k, { rate: 1.7, f: 2600, q: 6, dec: 0.03 });
      break;
    case "luxury":
      // heavily damped, and the cabinet behind it rings for a moment
      noise(t, 0.07 * k, { rate: 0.5, type: "lowpass", f: 300, q: 0.8, dec: 0.05, at: 0.005 });
      tone(t, 0.14 * k, { f: on ? 268 : 244, f2: 118, dec: 0.075 });
      noise(t + 0.006, 0.05 * k, { rate: 0.9, f: 430, q: 7.5, dec: 0.1, at: 0.008 });
      break;
    case "crisp":
      // tight, dry and precise — nothing rings, nothing lingers
      noise(t, 0.14 * k, { rate: 1.9, f: on ? 2200 : 2600, q: 3, dec: 0.009 });
      tone(t, 0.1 * k, { f: on ? 150 : 168, f2: 96, dec: 0.022 });
      break;
    case "ev":
      // no mechanism at all: a warm rounded two-tone, soft on both edges
      tone(t, 0.13 * k, { f: on ? 615 : 512, f2: on ? 690 : 470, dec: 0.085, wave: "sine" });
      tone(t, 0.075 * k, { f: on ? 158 : 132, f2: on ? 172 : 122, dec: 0.075, wave: "sine" });
      break;
    default:   // digital
      tone(t, 0.1 * k, { f: on ? 1520 : 1240, f2: on ? 1500 : 1230, dec: 0.028, wave: "sine" });
      tone(t + 0.028, 0.075 * k, { f: on ? 2280 : 1860, f2: on ? 2260 : 1850, dec: 0.024, wave: "sine" });
      noise(t, 0.03 * k, { rate: 2, f: 3400, q: 4, dec: 0.006 });
  }
}

/* the stalk. Same side again cancels; the other side just swaps over. */
function setIndicator(side) {
  if (!indVoice()) return;                    // race car: there is no stalk
  initAudio();
  if (AU.ctx && AU.ctx.state === "suspended") AU.ctx.resume();
  IND.side = IND.side === side ? 0 : side;
  IND.on = false;
  IND.t = IND.side ? IND_PERIOD : 0;          // fire the first flash immediately
  if (!IND.side) updateIndicatorUi();
}

function indicatorTick(dt) {
  const voice = indVoice();
  if (!IND.side || !voice) {
    if (IND.on) { IND.on = false; updateIndicatorUi(); }
    return;
  }
  IND.t += dt;
  if (IND.t >= IND_PERIOD) {
    IND.t -= IND_PERIOD;
    IND.on = !IND.on;
    sfxIndicator(voice, IND.on);
    updateIndicatorUi();
  }
}

function updateIndicatorUi() {
  const has = !!indVoice();
  $("turnSig").classList.toggle("hide", !has);
  $("tsigL").classList.toggle("lit", has && IND.side === -1 && IND.on);
  $("tsigR").classList.toggle("lit", has && IND.side === 1 && IND.on);
  $("tsigL").classList.toggle("armed", has && IND.side === -1);
  $("tsigR").classList.toggle("armed", has && IND.side === 1);
  // the screen car repeats them up on the panel instead of in the lamp row
  if (hasScreen()) {
    $("evsIndL").classList.toggle("on", IND.side === -1 && IND.on);
    $("evsIndR").classList.toggle("on", IND.side === 1 && IND.on);
  }
}

/* ================================================================
   RACE-CAR START-UP
   ================================================================
   A race car has no key and no convenience. It has a panel of toggles that
   must be thrown in order, because each one feeds the next: the master
   isolator connects the battery, the ignition wakes the ECU, and only then
   is there anything to run the fuel pump. Throw them out of order and
   nothing happens, which is exactly what happens in the real car.

   Only once all three are live does the starter button do anything. */
const RACE_SWITCHES = ["master", "ign", "pump"];

function raceReady() { return RACE_SWITCHES.every(k => S.race[k]); }

function sfxRaceToggle(on) {
  if (!AU.ready) return;
  const t = AU.ctx.currentTime;
  const k = inCabin() ? 1.9 : 1;
  // a proper toggle is two events a few ms apart: the lever going over
  // centre, then the contact landing
  pedNoise(t, 0.16 * k, { rate: 2.1, f: on ? 1900 : 1650, q: 2.2, dec: 0.009 });
  pedNoise(t + 0.012, 0.13 * k, { rate: 0.6, type: "lowpass", f: 420, q: 0.9, dec: 0.045 });
  pedTone(t + 0.012, 0.12 * k, { f: on ? 208 : 178, f2: 84, dec: 0.05 });
  // the alloy switch panel ringing behind it
  pedNoise(t + 0.014, 0.04 * k, { rate: 1.5, f: 3100, q: 9, dec: 0.07 });
}

function sfxRaceDeny() {
  if (!AU.ready) return;
  const t = AU.ctx.currentTime;
  pedNoise(t, 0.09, { rate: 1.4, f: 700, q: 4, dec: 0.05 });   // a dead switch going nowhere
}

/* the pump priming: a hard whirr that rises, holds, then settles to the bed
   you stop hearing after ten seconds */
function sfxFuelPrime() {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = "sawtooth";
  o.frequency.setValueAtTime(72, t);
  o.frequency.exponentialRampToValueAtTime(168, t + 0.32);
  o.frequency.setValueAtTime(168, t + 1.5);
  o.frequency.exponentialRampToValueAtTime(126, t + 2.1);
  const f = ctx.createBiquadFilter(); f.type = "bandpass";
  f.frequency.value = 900; f.Q.value = 1.6;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.075, t + 0.18);
  g.gain.setValueAtTime(0.075, t + 1.5);
  g.gain.exponentialRampToValueAtTime(0.018, t + 2.2);
  o.connect(f); f.connect(g); g.connect(AU.master);
  o.start(t); o.stop(t + 2.3);
  // the hiss of fuel actually moving
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.loop = true;
  const nf = ctx.createBiquadFilter(); nf.type = "bandpass";
  nf.frequency.value = 2400; nf.Q.value = 0.9;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.linearRampToValueAtTime(0.02, t + 0.2);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
  n.connect(nf); nf.connect(ng); ng.connect(AU.master);
  n.start(t); n.stop(t + 2.3);
}

function raceSwitch(which) {
  if (!CC.race) return;
  initAudio();
  if (AU.ctx && AU.ctx.state === "suspended") AU.ctx.resume();
  const i = RACE_SWITCHES.indexOf(which);
  const on = !S.race[which];

  if (on) {
    // every switch downstream of a dead one does nothing at all
    if (RACE_SWITCHES.slice(0, i).some(k => !S.race[k])) { sfxRaceDeny(); return; }
    S.race[which] = true;
    sfxRaceToggle(true);
    if (which === "ign") {
      // IGNITION lights the car up — dash, relays, loom hum. No fans yet:
      // nothing is pumping anything.
      S.acc = true; S.stalled = false; S.rpm = 0; S.sweep = 0;
      $("stallOverlay").classList.remove("show");
      $("lampStall").classList.remove("lit", "blink");
      sfxAccOn(CC);
      accBedStart(1, false);
    }
    if (which === "pump") {
      // …and the PUMP is what makes it breathe: prime, then the coolant fans
      // and the blower spin up behind it. This is the moment the car stops
      // being a switched-on object and starts being a running one.
      sfxFuelPrime();
      accBedStart(1, true);
    }
  } else {
    // pulling a switch drops everything it was feeding
    for (const k of RACE_SWITCHES.slice(i)) S.race[k] = false;
    sfxRaceToggle(false);
    if (i <= RACE_SWITCHES.indexOf("ign")) {
      S.acc = false;
      if (S.engineOn || S.cranking) killRaceEngine();
      accBedStop(0.3);
    } else {
      // killing the pump alone: the fans wind down, the loom keeps humming
      if (S.engineOn || S.cranking) killRaceEngine();
      accBedStart(1, false);
    }
  }
  updateRunLamp();
  updateRaceUi();
}

function killRaceEngine() {
  S.crankSeq = (S.crankSeq || 0) + 1;
  clearTimeout(S.crankTimer); S.crankTimer = 0;
  S.engineOn = false; S.cranking = false; S.rpm = 0; S.boost = 0;
  $("ignition").classList.remove("cranking");
  sfxClunk(0.6);
}

function updateRaceUi() {
  const race = !!CC.race;
  $("racePanel").classList.toggle("hide", !race);
  if (!race) return;
  for (const k of RACE_SWITCHES) {
    const el = $("rsw" + k[0].toUpperCase() + k.slice(1));
    el.classList.toggle("on", !!S.race[k]);
    el.setAttribute("aria-pressed", String(!!S.race[k]));
  }
  $("racePanel").classList.toggle("armed", raceReady());
}

function resetRaceSwitches() {
  S.race = { master: false, ign: false, pump: false };
  updateRaceUi();
}

/* ================================================================
   PEDAL MECHANICS
   ================================================================
   A real car's pedals are noisy, and you only notice how noisy once they're
   missing. Three separate events per pedal, because that's what your foot
   actually produces:

     press    coming off the top stop — a click, then the pedal itself moving
     floor    hitting the bottom stop — a dull rubber-on-metal thud
     release  the return spring snapping it back against the upper stop

   The brake gets the extra one nobody thinks about until they hear it: the
   vacuum booster. Pressing pulls air through it (a soft falling "shhk"),
   releasing lets it refill (a shorter rising one). It's most of why a brake
   pedal sounds so different from a throttle.

   These live INSIDE the car, so they go straight to the master rather than
   the sfx bus — a pedal click has no business ringing down a tunnel — and
   they get a good deal louder with the windows up. */

function pedNoise(t, lvl, o) {
  const ctx = AU.ctx;
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf;
  n.playbackRate.value = o.rate || 1;
  const f = ctx.createBiquadFilter();
  f.type = o.type || "bandpass";
  f.frequency.setValueAtTime(o.f, t);
  f.Q.value = o.q === undefined ? 1 : o.q;
  if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dec);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(lvl, t + (o.at || 0.002));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dec);
  n.connect(f); f.connect(g); g.connect(o.bus || AU.master);
  n.start(t); n.stop(t + o.dec + 0.02);
}

function pedTone(t, lvl, o) {
  const ctx = AU.ctx;
  const s = ctx.createOscillator(); s.type = o.wave || "sine";
  s.frequency.setValueAtTime(o.f, t);
  s.frequency.exponentialRampToValueAtTime(o.f2, t + o.dec);
  const g = ctx.createGain();
  g.gain.setValueAtTime(lvl, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dec);
  s.connect(g); g.connect(o.bus || AU.master);
  s.start(t); s.stop(t + o.dec + 0.02);
}

/* which: "gas" | "brake" | "clutch"   event: "press" | "floor" | "release" */
function sfxPedal(which, event, force = 1) {
  if (!AU.ready) return;
  const t = AU.ctx.currentTime;
  // windows up puts your ear a foot from the pedal box
  const k = force * (inCabin() ? 2.3 : 1) * 0.9;

  if (which === "gas") {
    if (event === "press") {
      pedNoise(t, 0.05 * k, { rate: 1.5, f: 1500, q: 1.2, dec: 0.011 });
      pedTone(t, 0.05 * k, { f: 152, f2: 88, dec: 0.045 });
    } else if (event === "floor") {
      // the kickdown stop: soft, rubbery, and definitely the end of travel
      pedNoise(t, 0.07 * k, { rate: 0.55, type: "lowpass", f: 260, q: 0.8, dec: 0.06 });
      pedTone(t, 0.065 * k, { f: 92, f2: 48, dec: 0.075 });
    } else {
      // the return spring throwing it back at the top stop — sharper than the press
      pedNoise(t, 0.055 * k, { rate: 1.9, f: 2200, q: 1.5, dec: 0.009 });
      pedTone(t, 0.042 * k, { f: 196, f2: 104, dec: 0.038 });
    }
    return;
  }

  if (which === "brake") {
    if (event === "press") {
      pedNoise(t, 0.05 * k, { rate: 2.1, f: 2700, q: 2, dec: 0.007 });   // light switch
      // the booster drawing down — a falling breath, not a hiss
      pedNoise(t, 0.075 * k, { rate: 0.9, f: 900, f2: 300, q: 1.2, dec: 0.19, at: 0.02 });
      pedTone(t, 0.07 * k, { f: 124, f2: 60, dec: 0.07 });
    } else if (event === "floor") {
      pedNoise(t, 0.055 * k, { rate: 0.7, f: 470, q: 6, dec: 0.13, at: 0.01 });  // pivot creak
      pedTone(t, 0.075 * k, { f: 88, f2: 42, dec: 0.09 });
    } else {
      pedNoise(t, 0.06 * k, { rate: 0.9, f: 340, f2: 1100, q: 1.1, dec: 0.14, at: 0.012 });
      pedNoise(t, 0.04 * k, { rate: 2.3, f: 3000, q: 2, dec: 0.006 });
    }
    return;
  }

  // the clutch: the heaviest spring of the three, and the only one with a
  // release bearing behind it
  if (event === "press") {
    pedNoise(t, 0.05 * k, { rate: 0.8, f: 700, q: 3.2, dec: 0.09, at: 0.012 });
    pedTone(t, 0.05 * k, { f: 118, f2: 62, dec: 0.06 });
  } else if (event === "floor") {
    pedTone(t, 0.06 * k, { f: 84, f2: 44, dec: 0.08 });
  } else {
    pedNoise(t, 0.055 * k, { rate: 1.6, f: 1700, q: 1.4, dec: 0.014 });
    pedTone(t, 0.05 * k, { f: 168, f2: 92, dec: 0.05 });
  }
}

/* edge-detect the driver's foot. This watches S.in — the pedal INPUT, i.e.
   what the foot is doing — rather than the smoothed actuator position, so a
   stab registers the moment it happens instead of when the ramp catches up. */
const PED_ON = 0.06, PED_FLOOR = 0.93;
const PEDALS = [["gas", "gas"], ["brake", "brake"], ["clutch", "clutch"]];

function pedalSfxTick() {
  if (!AU.ready) return;
  if (!S._pedPrev) S._pedPrev = { gas: 0, brake: 0, clutch: 0 };
  for (const [key, which] of PEDALS) {
    const now = S.in[key] || 0, was = S._pedPrev[key];
    if (was < PED_ON && now >= PED_ON) sfxPedal(which, "press", clamp(now, 0.35, 1));
    else if (was >= PED_ON && now < PED_ON) sfxPedal(which, "release", 1);
    if (was < PED_FLOOR && now >= PED_FLOOR) sfxPedal(which, "floor", 1);
    S._pedPrev[key] = now;
  }
}

function audioTick() {
  if (!AU.ready) return;
  const t = AU.ctx.currentTime, k = 0.03;
  // the engine VOICE is not always this car's engine: with the fake V8
  // switched on, an electric car sings through a pretend eight instead
  const VC = voiceCar();
  const rpm = voiceRpm();
  const vMax = voiceMax();
  const ex = exSound();     // stock mode: the pipe stops colouring things

  // flyby: true Doppler (we synthesize the frequencies, so just bend them),
  // plus distance attenuation, position pan, and air absorption
  let dop = 1, flyG = 1, flyP = 0, flyLp = 1;
  // directivity: -1 = nose-on and coming, +1 = tailpipes-on and going.
  // 1 (dead ahead / dead behind) at both ends, and it swings through zero
  // over about 18m either side of the pass — which at 200km/h is a quarter
  // of a second, and that is exactly how abrupt the handover sounds.
  let flyDir = 0;
  if (S.flyby) {
    const d = 14, x = S.flyX, r = Math.hypot(x, d);
    const vr = flybyV() * (-x) / r;                // closing speed toward listener (boosted past 200)
    dop = 343 / Math.max(80, 343 - vr);
    flyG = clamp(22 / r, 0.12, 1.5);
    flyP = clamp(x / 70, -0.95, 0.95);
    flyLp = clamp(26 / r, 0.45, 1);
    flyDir = clamp(x / 18, -1, 1);
  }
  AU.flyGain.gain.setTargetAtTime(flyG, t, 0.08);
  AU.flyPan.pan.setTargetAtTime(flyP, t, 0.08);
  // the wet send is tapped upstream of the flyby stage, so it has to be told
  // about the distance itself — otherwise a car half a kilometre away still
  // rings the tunnel as hard as one going past your feet
  AU.wetSend.gain.setTargetAtTime(flyG, t, 0.08);
  /* The spectral half of the handover. Approaching, the bottom end is
     literally pointed away from you and has to diffract round the car to
     arrive at all, so it is DOWN, and the induction top is up. Once it's
     past, the pipes are aimed straight at your chest and it inverts. The
     tilt is deliberately big — 9dB either way — because on real trackside
     audio the difference between the two halves of a pass is enormous. */
  AU.flyLo.gain.setTargetAtTime(flyDir * 9, t, 0.05);
  AU.flyHi.gain.setTargetAtTime(-flyDir * 6, t, 0.05);
  // …and the level half. Intake noise leaves the front of the car, exhaust
  // and every overrun bang leave the back, so they swap places as it goes by.
  const dirIntake = S.flyby ? 1 - flyDir * 0.7 : 1;
  const dirEx     = S.flyby ? 1 + flyDir * 0.85 : 1;

  // firing freq × per-car octave drop (f0Mul) × pitch mod × Doppler
  const cm = curMod();
  const f0 = (rpm / 60) * (VC.cyl / 2) * (VC.sound.f0Mul || 1) * cm.pitch * dop;
  const rFrac = clamp(rpm / vMax, 0, 1);
  const gCurve = Math.pow(rFrac, 1.6);             // how far "up the rev range" the voice is
  const jm = VC.sound.jitter || 1;       // per-car mechanical looseness
  for (const L of AU.oscs) {
    // each voice wanders independently — fast flutter plus a slow random-walk
    // drift; coherent motion sounds digital, independent motion sounds alive
    L.dr = Math.max(-0.004 * jm, Math.min(0.004 * jm, (L.dr || 0) * 0.99 + (Math.random() - 0.5) * 0.0008 * jm));
    const jit = 1 + L.dr + (Math.random() - 0.5) * 0.004 * jm;
    L.o.frequency.setTargetAtTime(Math.max(8, f0 * L.mult * jit), t, k);
    if (L.gMid != null) {
      // three zones: bottom → middle → top, crossfaded, never switched. The
      // waypoint sits at half-revs, which on a big turbo motor is about where
      // it stops rumbling and starts shoving.
      const lvl = gCurve < 0.5
        ? L.gLo + (L.gMid - L.gLo) * (gCurve / 0.5)
        : L.gMid + (L.gHi - L.gMid) * ((gCurve - 0.5) / 0.5);
      L.g.gain.setTargetAtTime(lvl, t, 0.06);
    } else if (L.gHi !== L.gLo) {
      L.g.gain.setTargetAtTime(L.gLo + (L.gHi - L.gLo) * gCurve, t, 0.06);
    }
  }

  const running = S.engineOn && !S.cranking;
  const load = S.effThrottle;
  const onCam = VC.camAt && rpm > VC.camAt;        // VTEC-style switchover
  const trim = (VC.sound.volTrim || 1) * (ex.volMul || 1) * cm.vol
              * (stockOn() ? STOCK.vol : 1);
  const blipBoost = S.blip > 0 ? 1.4 : 1;          // downshift blips shout
  // idleVol lifts the voice near idle and fades out as revs climb — the
  // quad-rotor idles LOUD, like the real thing at a standstill
  const idleLift = (VC.sound.idleVol || 0) * clamp(1.35 - rpm / ((VC.idle || ENG.idle) * 2.6), 0, 1);
  // An electric car has no combustion voice at all — no firing, no exhaust,
  // no intake. What's left is a whisper of inverter (below) plus tyres and
  // air. The only other exception is the fake V8, and that isn't the car,
  // that's the stereo.
  const mute = isEv() && !v8SimOn();
  const hE = hushEng() * cabinLift();              // the Phantom's bulkhead — or the lack of one
  /* …and then the combustion voice ALONE gets the turbo mask on top of it.
     Deliberately not folded into hE: the turbo and intake layers are derived
     from hE further down (hT, hIn), so masking it there would pull the
     chargers down by exactly the amount we are trying to make them win by.
     This is the engine stepping back, not the whole car. */
  const hEng = hE * rigCabinMask() * cabinEngTrim();
  const P = ear();                                 // and where you're standing
  // the low end this car's construction never made, and the path it takes
  // back in when there's no interior between you and the engine
  const hpBase = VC.sound.hp || 20;
  AU.engHp.frequency.setTargetAtTime(hpBase * (1 - 0.78 * rawCabin()), t, 0.12);
  const vol = running && !mute
    ? (0.10 + idleLift + load * 0.30 + rFrac * 0.13 + (onCam ? 0.04 : 0)) * trim * 0.8 * blipBoost * hEng * P.eng
    : 0;
  // per-car de-fizz trim: `air` hands some of the top back to the engines
  // that genuinely are metallic up there (the flat-planes, the rotaries)
  // …plus whatever the interior hands back on top of it: in a car with no trim
  // in it, the top end is the part that survives the trip to your ears intact
  AU.engAir.gain.setTargetAtTime(
    -4 + (VC.sound.air || 0) + (stockOn() ? STOCK.air : 0) + cabinAirAdd(), t, 0.1);
  AU.engGain.gain.setTargetAtTime(vol, t, 0.05);

  // combustion throb — strong at idle, smooths out with revs
  const drive = ((VC.sound.drive || 0.5) + (ex.driveAdd || 0)) * (stockOn() ? STOCK.drive : 1);
  // load-sensitive saturation: barks under power, settles on a lift
  const dl = VC.sound.loadDrive || 0;
  AU.mixIn.gain.setTargetAtTime(drive * (1 + dl * (load - 0.3)), t, 0.05);
  const pd = (VC.sound.pulseDepth || 0.15) * (1 - rFrac * 0.6);
  AU.pulse.frequency.setTargetAtTime(Math.max(3, f0 / (VC.sound.pulseDiv || 1)), t, k);
  AU.pulseG.gain.setTargetAtTime(
    running && !mute ? drive * pd * (AU.pulseNode ? 0.16 : 0.5) : 0, t, 0.05);

  // --- combustion pulses. One engine cycle is two crank revolutions, so the
  //     cycle rate is rpm/120 and the firing table does the rest. It follows
  //     the same f0Mul / pitch / Doppler the oscillators do, so the chuff and
  //     the tone stay locked together instead of beating.
  if (AU.pulseNode) {
    const PP = AU.pulseNode.parameters;
    PP.get("cycleHz").setTargetAtTime(Math.max(0.4, (rpm / 120) * (VC.sound.f0Mul || 1) * cm.pitch * dop), t, k);
    // Coasting at 4000rpm has to sound nothing like pulling at 4000rpm — on
    // the overrun there is barely any combustion happening at all, just a
    // pump turning over. A fixed harmonic balance is precisely what makes an
    // engine read as a pitch-shifted sample, so almost all of the chuff
    // lives on the throttle. It also thins out with revs, because by the top
    // of the range the pulses have merged into the note anyway.
    const chuff = VC.sound.chuff === undefined ? 1 : VC.sound.chuff;
    // the chuff IS the exhaust, so where you stand matters more to it than to
    // anything else in the voice — but only about half as much as it does to
    // the pops, or standing at the pipe drives the whole chain into clipping
    PP.get("level").setTargetAtTime(
      running && !mute
        ? Math.min(1.5, (0.14 + load * 0.95) * (1 - rFrac * 0.45) * chuff * trim * hEng * (0.55 + P.pop * 0.45)
                        * (stockOn() ? STOCK.chuff : 1))
        : 0,
      t, 0.04);
    PP.get("noise").value = clamp(0.26 + load * 0.3, 0, 1);
  }

  // exhaust rasp band riding the firing frequency
  AU.raspBp.frequency.setTargetAtTime(clamp(f0 * 1.5, 90, 5500), t, k);
  AU.raspG.gain.setTargetAtTime(
    running && !mute ? (0.02 + load * 0.10 + rFrac * 0.03) * (VC.sound.raspMul || 1) * (1 + (ex.raspAdd || 0))
                     * hEng * P.pop * dirEx * (stockOn() ? STOCK.rasp : 1) : 0,
    t, k);
  // "scream" opens the filter with revs alone — the intake howl waking up.
  // The filter follows the VOICE, not the tacho: a car voiced an octave down
  // (f0Mul) has all its harmonics an octave down too, so leaving the filter
  // where a high-pitched engine wants it just lets through a lot of empty
  // top end — which is exactly what reads as synthetic.
  const oct = 0.55 + 0.45 * (VC.sound.f0Mul || 1);
  AU.lp.frequency.setTargetAtTime(
    Math.max(110,
      ((150 + load * 2700 + rpm * 0.45 + (onCam ? 1500 : 0)
        + (VC.sound.scream || 0) * rFrac * rFrac * (stockOn() ? STOCK.scream : 1)
        + (ex.bright || 0) + (S.blip > 0 ? 1500 : 0)) * (VC.sound.lpMul || 1) * oct
        * (stockOn() ? STOCK.tone : 1) + cm.tone) * flyLp),
    t, k);

  // induction noise: the thing you're standing in front of over the bonnet,
  // and the thing you cannot hear at all from the tailpipe
  const nMul = (VC.sound.noiseMul || 1) * P.intake * dirIntake;
  // …and on a rig car this is zero, because the rig has a proper intake layer
  // of its own and stacking a second one on top just makes mud
  const boostHiss = CC.asp === "turbo" && !CC.turboRig ? S.boost * 0.09 * P.turbo : 0;
  // On a naturally aspirated engine with open trumpets there is no turbo to
  // whoosh, and induction roar takes its place — but it does not track revs
  // the way a whistle tracks boost. It tracks THE THROTTLE, because it is
  // literally the sound of air falling through an open butterfly. That is
  // what makes lifting and reapplying dramatic in a car like this: the roar
  // vanishes and comes back with your right foot, not with the tacho.
  // `intakeLoad` is how much of the induction noise hangs off the pedal.
  const il = VC.sound.intakeLoad || 1;
  AU.nGain.gain.setTargetAtTime(
    running && !mute ? (load * 0.10 * il + rpm / 90000) * nMul + boostHiss : 0, t, k);
  AU.nbp.frequency.setTargetAtTime(500 + rpm * 0.35, t, k);
  // every overrun bang goes off in the pipes, so on a flyby the pops belong
  // almost entirely to the second half of the pass. (applyListen() sets this
  // too, for the case where the audio tick isn't running.)
  AU.popBus.gain.setTargetAtTime(1.35 * P.pop * dirEx, t, 0.05);

  // forced-induction whine
  let wf = 800, wg = 0, scg = 0, w2f = 1400, w2g = 0, tbF = 1400, tbG = 0, chopHz = 15, chopG = 0;
  // the gearbox voice: >0 means this car has a straight-cut box singing, and
  // it gets its own chain and its own listening map — see the gearWhine
  // branch below and AU.boxOscs
  let boxMul = 0, boxHz = 3000, boxLvl = 0;
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
  } else if (running && CC.asp === "turbo" && CC.turboRig) {
    /* This car has a real rig (see TURBO RIG), which owns the whine, the
       intake, the charge-air rush and the release on its own chain and drives
       all four off shaft speed rather than off the tacho. The legacy
       single-whistle voice below would only fight with it, so it stays shut —
       everything is left at zero and turboRigTick() does the work. */
  } else if (running && CC.asp === "turbo") {
    // A turbo is a big lump of metal spinning in a housing, and what you
    // actually hear from the driver's seat is a low siren, not a kettle. The
    // old scaling ran to nearly 6kHz at full boost, which is somewhere up in
    // dog-whistle territory and is why every turbo car read as shrill. A
    // real one lives between about 400Hz off-boost and 2.5kHz flat out.
    wf = (300 + S.boost * 1500 + rpm * 0.085) * (CC.whistleFreqMul || 1) * dop;
    wg = S.boost * 0.055 * (CC.whistleMul || 1); // big singles whistle louder
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
    // Just a hint of inverter. Not the old rising wail — about a third of it,
    // sitting under the tyres rather than over them, so you can tell the car
    // is doing something without it becoming the sound of the car.
    wf = (400 + rpm * 0.32) * dop;
    wg = 0.005 + load * 0.014 + rFrac * 0.009 + (S.brake > 0.2 && Math.abs(S.v) > 2 ? 0.009 : 0);
  } else if (CC.edrive && S.powered && S.eDrive === "ev") {
    // eDrive gliding: barely-there inverter whisper that tracks road speed
    const sp = Math.abs(S.v);
    wf = (300 + sp * 45) * dop;
    wg = 0.005 + S.throttle * 0.018 + (S.brake > 0.2 && sp > 2 ? 0.015 : 0);
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
  /* --- the straight-cut gearbox ---
     Deliberately NOT part of the if/else chain above, and this is a fix, not
     a style choice. The chain picks ONE forced-induction voice, and the
     gearbox was sitting in it as a branch — so any car with both a turbo and
     a dog box (the LMH-24, which is the whole reason `gearWhine: 9` exists)
     matched the turbo branch first and its gearbox never made a sound at all.
     A turbo and a gearbox are not alternatives. The car has both, they run on
     separate chains, and they should both be audible.

     Gear-mesh scream rides the crank — hard under load, still singing on the
     overrun while the pipes crackle. And it is almost entirely an INTERIOR
     sound: straight-cut gears are cut that way because they're stronger, and
     the price is that they scream instead of running quietly, but that scream
     is structure-borne. It comes up through the casing, into the tub, and out
     of the bulkhead a foot behind your head. Stand next to the car and the
     open exhaust drowns it completely; sit in it and it is the loudest thing
     in the car, over the V12. So it gets its own listening map rather than
     borrowing the turbo's: in the cabin it dominates, at the tailpipe it is
     nearly gone. */
  if (running && CC.gearWhine) {
    boxHz = Math.min(9000, f0 * CC.gearWhine) * dop;
    boxLvl = (0.01 + load * 0.055 + (load < 0.15 && Math.abs(S.v) > 3 ? 0.036 : 0))
           * Math.pow(rFrac, 1.2);
    // Sealing yourself in with it is the loudest it ever gets — and how loud
    // that is depends on how modern the box is. An old coarse-pitch dog box
    // grumbles; a current LMH/GT3 set is fine-pitch and geared up, so its
    // mesh frequency lands right in the band the tub radiates best and the
    // cabin fills with that flat electric EEEEE over everything else.
    // gearWhine is the mesh ratio, so it doubles as "how new is this box".
    const modern = clamp((CC.gearWhine - 6) / 3, 0, 1);
    boxMul = insideEar() ? (inCabin() ? 6 + 3 * modern : 3.2 + 1.2 * modern) : 0.45;
    // …and a per-car trim on top, for a box that is simply more of the car's
    // voice than the mesh ratio alone can say
    boxMul *= CC.gearWhineMul || 1;
  }

  // the blower and the turbos live under the bonnet, so where you stand
  // changes how much of them reaches you more than it changes anything else
  const hT = hE * P.turbo;
  // The gearbox rides its own chain. Inside, it is the loudest thing in the
  // car and it tracks the casing resonance up with the mesh frequency so the
  // peak never falls behind the note; outside, the open exhaust buries it.
  if (AU.boxG) {
    for (const b of AU.boxOscs)
      b.o.frequency.setTargetAtTime(Math.min(14000, boxHz * b.mult), t, k);
    AU.boxBp.frequency.setTargetAtTime(clamp(boxHz * 1.7, 400, 9000), t, k);
    // hushEng() and NOT hE: the gearbox already has its own listening map a
    // few lines up, which is the authority on what climbing into the car does
    // to it. Handing it cabinLift() as well would apply the "no deadening"
    // bonus twice and the box would drown the engine it's bolted to.
    AU.boxG.gain.setTargetAtTime(boxLvl * boxMul * hushEng(), t, 0.05);
  }
  AU.whine.frequency.setTargetAtTime(wf, t, k);
  const stW = stockOn() ? STOCK.whistle : 1;    // the plumbing stays under the bonnet
  AU.whineG.gain.setTargetAtTime(wg * hT * stW, t, 0.05);
  AU.whine2.frequency.setTargetAtTime(Math.min(11000, w2f), t, k);
  AU.whine2G.gain.setTargetAtTime(w2g * hT * stW, t, 0.05);
  AU.wChop.frequency.setTargetAtTime(chopHz, t, k);
  AU.wChopG.gain.setTargetAtTime(chopG * hT * stW, t, 0.05);
  AU.tbBp.frequency.setTargetAtTime(tbF, t, k);
  AU.tbG.gain.setTargetAtTime(tbG * hT * (stockOn() ? 0.55 : 1), t, 0.05);
  for (const s of AU.scOscs)
    s.o.frequency.setTargetAtTime(Math.min(12000, wf * s.mult), t, k);
  AU.blowG.gain.setTargetAtTime(scg * hT * stW, t, 0.05);

  /* --- the quad-turbo rig ---
     Its own chain, its own listening map, and its own driving quantities —
     shaft speed and manifold pressure rather than rpm. Everything it needs to
     know about where you are standing and how far away the car is gets handed
     to it here rather than looked up again, so the rig and the engine can
     never disagree about the position of the microphone.

     `hIn` is the intake's weighting rather than the turbo's: induction noise
     leaves the FRONT of the car, so it behaves like the intake layer above
     (huge over the bonnet, nearly absent at the tailpipe) and not like the
     whine, which is a mechanical sound radiating off the compressors. */
  turboRigTick(t, k, {
    running, mute, load, dop, flyLp,
    hT, stW,
    hIn: hE * P.intake * dirIntake,
  });

  const sp = Math.abs(S.v);
  // wind: gentle low rumble at town speeds, then the rush piles on hard past
  // ~60 mph (27 m/s) the way real wind noise suddenly owns the cabin
  const rush = clamp((sp - 24) / 28, 0, 1);
  // Inside the car, wind is most of what you hear at speed — a broad roar off
  // the A-pillar and mirrors that buries everything else on a motorway. From
  // outside it's just air moving past, so the cabin gets the lion's share of
  // the lift rather than turning the whole mix into a gale.
  // …except in the one car built to make that untrue: foam-filled tyres,
  // double glazing and sealed door frames mean the motorway roar never
  // arrives in the first place
  const cabW = (inCabin() ? 1.6 : 1) * hushAir() * ear().wind;
  // gusting: a slow random walk, a few percent either way. Dead-steady wind
  // is the giveaway that it's a noise generator and not moving air.
  S.gust = clamp((S.gust || 0) * 0.994 + (Math.random() - 0.5) * 0.016, -0.14, 0.14);
  const gust = 1 + S.gust * clamp(sp / 30, 0, 1);
  AU.wGain.gain.setTargetAtTime((Math.min(0.26, sp * 0.0045) + rush * 0.19) * cabW * gust, t, 0.1);
  AU.wlp.frequency.setTargetAtTime(220 + sp * 26, t, 0.1);
  AU.rushG.gain.setTargetAtTime(Math.pow(rush, 1.5) * 0.66 * cabW * gust, t, 0.15);
  // with the glass up you lose the top of the hiss and keep the roar, so the
  // band sits lower — that's what makes it read as "inside" rather than louder
  AU.rushBp.frequency.setTargetAtTime((inCabin() ? 380 : 500) + sp * (inCabin() ? 10 : 14), t, 0.2);

  AU.grindGain.gain.setTargetAtTime(S.grinding ? 0.22 : 0, t, 0.02);

  // tire screech — spinning rubber or locked wheels. Keyed off SLIP RATIO,
  // not raw spin speed: a tire scrubbing 15% at 200km/h is doing far more
  // work (and making far more noise) than the same 3 m/s of slip pulling
  // away from a light, and the old absolute-speed version had it backwards.
  // The howl starts as the tire goes past its peak and gets no louder once
  // it's fully alight — from there it just gets rougher.
  const slip = S.slipR || 0;
  const scAmt = clamp((slip - 0.14) / 0.5, 0, 1) * clamp(0.35 + Math.abs(S.v) / 22, 0.35, 1.25)
              + (S.lockup ? 0.7 : 0);
  const scAudible = Math.abs(S.v) > 1.2 || S.spinV > 0.6 ? 1 : 0;
  // …and a slick does not squeal like a road tyre. A treaded tyre squirms
  // block by block and the noise is broad and scrubby; a slick is one
  // continuous soft contact patch shearing against the road, and it HOWLS —
  // lower, more tonal, and far louder, because there is so much more rubber
  // doing it. `tire` is that difference (1 = road rubber, ~1.6 = slicks).
  const tg = CC.tire || 1;
  AU.scG.gain.setTargetAtTime(Math.min(0.44 * tg, scAmt * 0.36 * tg) * scAudible, t, 0.04);
  // the squeal climbs as the rubber shears harder, and never sits still
  AU.scBp.frequency.setTargetAtTime(
    (700 + clamp(slip, 0, 1.4) * 340 + Math.random() * 180) / Math.sqrt(tg), t, 0.05);

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
    n.connect(f); f.connect(g); g.connect(AU.sfx);
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
  n.connect(f); f.connect(g); g.connect(p); p.connect(AU.sfx);
  n.start(t); n.stop(t + dur + 0.04);

  // the soft "thunk" of the arm hitting its stop at the end of the wipe
  const th = ctx.createOscillator(); th.type = "sine";
  th.frequency.setValueAtTime(150, t + dur);
  th.frequency.exponentialRampToValueAtTime(60, t + dur + 0.07);
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.14, t + dur);
  tg.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.1);
  th.connect(tg); tg.connect(AU.sfx); th.start(t + dur); th.stop(t + dur + 0.12);
}

function sfxClunk(strength = 1, out) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime, dest = out || AU.sfx;
  const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(95, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.09);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5 * strength, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.14);

  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 700;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.28 * strength, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  n.connect(f); f.connect(ng); ng.connect(dest); n.start(t); n.stop(t + 0.08);
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
  /* The lever is not out on the road with the exhaust — it is eighteen inches
     from your elbow, bolted through the tunnel you are sitting on. So it rides
     the interior bus with the chimes and the stalk: it skips the windows-up
     filter entirely, and sealing yourself in the car makes it LOUDER and
     closer rather than duller, exactly the way it does in real life. From
     outside, all you get is a muffled knock through the bodywork.
     (1.7 keeps the outdoor level roughly where it has always been, since the
      interior bus sits at 0.55 out there and 1.55 in here.) */
  const s = curMod().shift, bus = AU.inner || AU.sfx;
  strength *= 1.7;
  if (s === "click") sfxShiftClick(strength, bus);
  else if (s === "metal") sfxShiftMetal(strength, bus);
  else sfxClunk(strength, bus);
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
    g.gain.value = (inCabin() ? 2.4 : 1.3) * strength;
    s.connect(g); g.connect(inCabin() ? AU.comp : AU.sfx); s.start();
    return;
  }
  if (!AU.pshiftEls)                     // engine not running / audio not booted
    AU.pshiftEls = [0, 1, 2].map(() => {
      const a = new Audio("Sound/Pshift.wav"); a.preload = "auto"; return a;
    });
  const a = AU.pshiftEls.find(x => x.paused) || AU.pshiftEls[0];
  a.volume = Math.min(1, (inCabin() ? 1.4 : 0.9) * strength);
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

/* ---- the recorded quad-turbo samples (Molsheim only) ----

   Everything else the turbo rig makes is synthesized, and it stays that way:
   filtered noise follows shaft speed and boost continuously, which is the
   only way a lift at a third throttle can sound like a third of a lift. But
   two moments in the Molsheim's life are single, fixed events with no
   in-between worth modelling — the valves dumping eighteen pounds when you
   come off it at the top of a gear, and the bang the box makes handing over
   through the short ratios — and for those, a real recording beats anything
   the synth will do.

   So they layer ON TOP of the synthesized release rather than replacing it,
   and only on this one car (see rigSample in the config). They ride the same
   dry sfx bus, take the same listening-position and cabin scaling as
   sfxTurboRelease, and — the part that matters for realism — every one of
   them is faded out over its own tail instead of simply ending. A recording
   that stops dead reads as a sample being cut off; a recording whose last
   third rolls away reads as pressure equalising. */
/* `norm` is not a taste knob — it is a measured correction. Both clips were
   recorded quiet: the release peaks at 0.185 of full scale (-14.6dBFS) and the
   shift at 0.297 (-10.5dBFS), and their RMS is lower still. Played at a gain
   of 1 they land 15dB under an engine that is already sitting on the limiter,
   which is exactly why they were inaudible. These numbers bring each clip UP
   to a peak of 1.0 so that the gains below mean what they say: 1.0 is full
   scale, and anything above it is deliberately driving the master chain.
   If either file is ever re-exported at a different level, remeasure. */
/* `rate` slows the clip down, which does two things at once and both of them
   are wanted here. It makes the release LAST longer — a big charge-air system
   does not empty quickly — and it pitches the escaping air DOWN, which is the
   right direction: whistle and release frequency scale inversely with wheel
   size, so four large compressors sit well below the hiss of a small one. The
   shift bang keeps more of its speed; that event really is quick.
   `fade` is how much of the (slowed) clip is spent getting to silence. */
const TURBO_SAMPLES = {
  release: { url: "Sound/Turbo Release.mp3", fade: 0.85, norm: 5.4, rate: 0.84 },
  shift:   { url: "Sound/Turbo Shift.mp3",   fade: 0.24, norm: 3.4, rate: 0.94 },
};

function loadTurboSamples() {
  if (!AU.ctx) return;
  AU.turboBuf = AU.turboBuf || {};
  for (const which in TURBO_SAMPLES) {
    if (AU.turboBuf[which] || AU.turboBuf[which] === null) continue;
    AU.turboBuf[which] = null;           // claim it, so we only fetch once
    fetch(TURBO_SAMPLES[which].url)
      .then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); })
      .then(b => AU.ctx.decodeAudioData(b))
      .then(buf => { AU.turboBuf[which] = buf; })
      .catch(() => { delete AU.turboBuf[which]; });   // let a later boot retry
  }
}

/* `amt` is the same 0..1 the synthesized release is scaled by, so a lift off
   half boost brings the recording in at half level too — the sample is part of
   the event, not an announcement laid over the top of it. */
function sfxTurboSample(which, amt = 1, gain = 1) {
  if (!AU.ready || !AU.turboBuf || !AU.turboBuf[which]) return;
  const buf = AU.turboBuf[which], spec = TURBO_SAMPLES[which];
  const ctx = AU.ctx, t = ctx.currentTime;
  const C = rigOf(CC);
  const smp = (C && C.sample) || {};
  /* Sealed in with four turbochargers a foot behind your head, these are the
     loudest thing in the car — louder than the engine, on purpose. The rig's
     own `cabin` (2.85) is tuned for the synthesized layers, which have to
     leave room for everything else; these two clips do not, so they get their
     own, bigger multiplier. */
  const cab = inCabin() ? (smp.cabin || (C && C.cabin) || 1) : 1;
  const pos = ear().turbo * cab * (stockOn() ? 0.75 : 1);
  // deliberately NOT clamped to 1: past full scale the master limiter pulls
  // the whole mix down around the clip, which is what "it dominates the cabin"
  // actually sounds like as opposed to "it is turned up"
  const lvl = clamp(amt, 0, 1) * pos * gain * (spec.norm || 1);
  if (lvl < 0.02) return;

  /* …and get the engine out of the way underneath it.

     THIS is what makes the clip cover the engine, not the gain above, and the
     distinction matters. Pushing gain further just feeds the master limiter,
     which pulls the sample down along with everything else and squashes the
     recording flat — past a point you get mush, not loudness. Pulling the bed
     down instead leaves the clip completely intact and simply removes what it
     was competing with. So inside the cabin the engine goes almost silent for
     the length of the clip (duckBed floors at 0.08, and this asks for it):
     you hear four turbochargers and essentially nothing else, then the engine
     swells back underneath as the tail fades. Outside it stays a duck rather
     than a hole, because out there the exhaust is the loud thing and muting it
     would be the unrealistic choice.

     The hold covers almost the whole clip — the synthesized release only ducks
     for its own ~200ms transient, and the release recording is 1.26s. */
  const dk = clamp(amt, 0, 1) * (smp.duck === undefined ? 1 : smp.duck);
  if (dk > 0.05)
    duckBed(1 - dk * (inCabin() ? 0.95 : 0.72), 0.06,
            (buf.duration / (spec.rate || 1)) * (inCabin() ? 0.9 : 0.7));

  const s = ctx.createBufferSource(); s.buffer = buf;
  // slowed per the spec above, with a little jitter on top so it is never
  // twice identical — four turbochargers do not repeat themselves
  const rate = (spec.rate || 1) * (0.97 + Math.random() * 0.06);
  s.playbackRate.value = rate;
  const dur = buf.duration / rate;
  const fade = Math.min(spec.fade, dur * 0.7);

  const g = ctx.createGain();
  g.gain.setValueAtTime(lvl, t);
  g.gain.setValueAtTime(lvl, t + dur - fade);
  // exponential, because pressure leaving a pipe doesn't leave linearly
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(g); g.connect(AU.sfx);
  s.start(t); s.stop(t + dur + 0.02);
}

/* dog-ring engagement — NOT the paddle, the GEARBOX: a hard steel CLACK as
   the dogs slam into the next ratio, a dense mechanical thud through the
   chassis, and a brief straight-cut zing */
/* THE MIDDLE OF THE SHIFT — the sound inside the gap.

   Between the ignition dying and the dogs landing, a barrel-shaped selector
   drum rotates a few degrees and its track drags a shift fork sideways,
   sliding a splined ring along a shaft. All of it happens inside a magnesium
   case full of hot oil, an arm's length behind your head.

   So it is NOT a click. It is a short, dull, slightly gritty shunt with no
   transient worth speaking of — steel sliding on steel through oil film,
   heard through a case wall. Two components and no ring at all: a band of
   filtered noise that swells and stops (the drag), and a soft low shunt (the
   fork reaching the end of its travel). If you can pick it out as a separate
   sound effect it is too loud; you should only notice that the pause has
   something happening in it. */
function sfxDogSelect(strength = 1) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  // the ring dragging across the splines — gritty, mid, and gone in 40ms
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 0.85;
  const f = ctx.createBiquadFilter(); f.type = "bandpass";
  f.frequency.setValueAtTime(760, t);
  f.frequency.linearRampToValueAtTime(1250, t + 0.04);   // it speeds up as it goes
  f.Q.value = 1.5;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.3 * strength, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  n.connect(f); f.connect(g); g.connect(AU.sfx); n.start(t); n.stop(t + 0.06);
  // the fork arriving at the end of the track — felt more than heard
  const o = ctx.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(260, t + 0.022);
  o.frequency.exponentialRampToValueAtTime(110, t + 0.075);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.22 * strength, t + 0.022);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.085);
  o.connect(og); og.connect(AU.sfx); o.start(t + 0.022); o.stop(t + 0.1);
}

/* The dogs landing.

   `down` matters, and it is not a volume difference. An UPSHIFT engages while
   the engine is decelerating into the new ratio — the torque reversal is
   gentle, the dogs are being caught rather than thrown, and it is a bright
   tight CLACK. A DOWNSHIFT throws a spinning engine at a shaft that is
   already turning faster than it and then loads it backwards the instant it
   arrives. Same hardware, much bigger event: lower, longer, more weight
   underneath it, and a second knock as the play in the driveline closes up. */
function sfxDogEngage(strength = 1, down = false) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  // the steel-on-steel strike. Going down it is a heavier, blunter impact,
  // so the band sits lower and it takes longer to die.
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf;
  n.playbackRate.value = down ? 1.35 : 1.9;
  const f = ctx.createBiquadFilter(); f.type = "bandpass";
  f.frequency.value = down ? 950 : 1500; f.Q.value = down ? 0.85 : 1.1;
  const g = ctx.createGain();
  g.gain.setValueAtTime((down ? 1.35 : 1.1) * strength, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + (down ? 0.085 : 0.05));
  n.connect(f); f.connect(g); g.connect(AU.sfx); n.start(t); n.stop(t + 0.11);
  // hard metallic ring — short, damped by the oil. Downshifts ring lower and
  // for longer: more mass moved, and it is the big gears doing the moving.
  const rings = down ? [[1500, 0.2, 0.15], [2350, 0.11, 0.1], [3150, 0.05, 0.06]]
                     : [[2100, 0.16, 0.09], [3300, 0.08, 0.06]];
  rings.forEach(([hz, amp, dur]) => {
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.value = hz * (0.99 + Math.random() * 0.02);
    const og = ctx.createGain();
    og.gain.setValueAtTime(amp * strength, t + 0.006);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.006 + dur);
    o.connect(og); og.connect(AU.sfx); o.start(t + 0.006); o.stop(t + 0.006 + dur + 0.02);
  });
  // the thud through the tub — you feel this one. Downshift: starts lower,
  // falls further, and goes down into territory you hear with your chest.
  const k = ctx.createOscillator(); k.type = "sine";
  k.frequency.setValueAtTime(down ? 165 : 200, t);
  k.frequency.exponentialRampToValueAtTime(down ? 38 : 55, t + (down ? 0.14 : 0.09));
  const kg = ctx.createGain();
  kg.gain.setValueAtTime((down ? 1.05 : 0.7) * strength, t);
  kg.gain.exponentialRampToValueAtTime(0.001, t + (down ? 0.2 : 0.12));
  k.connect(kg); kg.connect(AU.sfx); k.start(t); k.stop(t + 0.22);
  // …and on the way down, the second knock: the dogs seat, then the backlash
  // in the ring closes against the far side of its windows. Two impacts a
  // few milliseconds apart is what "mechanical" actually sounds like — one
  // clean impact is what a sample sounds like.
  if (down) {
    const d2 = 0.028 + Math.random() * 0.012;
    const n2 = ctx.createBufferSource(); n2.buffer = AU.noiseBuf; n2.playbackRate.value = 1.15;
    const f2 = ctx.createBiquadFilter(); f2.type = "bandpass";
    f2.frequency.value = 720; f2.Q.value = 1.2;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.5 * strength, t + d2);
    g2.gain.exponentialRampToValueAtTime(0.001, t + d2 + 0.06);
    n2.connect(f2); f2.connect(g2); g2.connect(AU.sfx);
    n2.start(t + d2); n2.stop(t + d2 + 0.08);
    const k2 = ctx.createOscillator(); k2.type = "sine";
    k2.frequency.setValueAtTime(120, t + d2);
    k2.frequency.exponentialRampToValueAtTime(46, t + d2 + 0.1);
    const kg2 = ctx.createGain();
    kg2.gain.setValueAtTime(0.44 * strength, t + d2);
    kg2.gain.exponentialRampToValueAtTime(0.001, t + d2 + 0.13);
    k2.connect(kg2); kg2.connect(AU.sfx); k2.start(t + d2); k2.stop(t + d2 + 0.15);
  }
}

/* THE TAKE-UP — the depth under a downshift.

   The clack is the gearbox. This is the CAR, and it arrives a beat later.

   The moment a lower gear engages on a closed throttle, the engine becomes
   the slowest-turning thing in the driveline, and everything between it and
   the road has to wind up backwards against it: driveshafts twist, the diff
   loads onto the far side of its teeth, the engine mounts compress, the
   whole rear of the car squats fractionally. None of that is instant and
   none of it is silent — it is a big, low, heavily damped shunt that you
   feel through the seat as much as hear, with a slow wobble on it as the
   shafts unwind and rewind once before settling.

   Two components. A decaying low sine with a touch of frequency wobble (the
   wind-up itself, and the wobble is what stops it sounding like a kick
   drum), and a short band of low noise underneath for the mounts and
   bushings taking it. Deliberately dark — there is nothing above 200Hz in
   this event, because everything making it weighs a great deal. */
function sfxDrivelineShunt(strength = 1) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  // the wind-up: low, slow, and it sags rather than decays cleanly
  const o = ctx.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(78, t);
  o.frequency.linearRampToValueAtTime(52, t + 0.09);
  o.frequency.linearRampToValueAtTime(61, t + 0.17);      // the shafts unwind…
  o.frequency.linearRampToValueAtTime(44, t + 0.3);       // …and settle
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.001, t);
  og.gain.linearRampToValueAtTime(0.62 * strength, t + 0.018);
  og.gain.exponentialRampToValueAtTime(0.16 * strength, t + 0.14);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
  o.connect(og); og.connect(AU.sfx); o.start(t); o.stop(t + 0.36);
  // a second, slightly detuned voice a shade later — a driveline is not one
  // spring, it is several in series, and they do not all arrive together
  const o2 = ctx.createOscillator(); o2.type = "triangle";
  o2.frequency.setValueAtTime(112, t + 0.012);
  o2.frequency.exponentialRampToValueAtTime(58, t + 0.16);
  const og2 = ctx.createGain();
  og2.gain.setValueAtTime(0.001, t + 0.012);
  og2.gain.linearRampToValueAtTime(0.2 * strength, t + 0.03);
  og2.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  o2.connect(og2); og2.connect(AU.sfx); o2.start(t + 0.012); o2.stop(t + 0.24);
  // mounts and bushings taking the load — dark, short, no transient
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 0.55;
  const f = ctx.createBiquadFilter(); f.type = "lowpass";
  f.frequency.setValueAtTime(260, t);
  f.frequency.linearRampToValueAtTime(120, t + 0.18);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.001, t);
  ng.gain.linearRampToValueAtTime(0.3 * strength, t + 0.025);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
  n.connect(f); f.connect(ng); ng.connect(AU.sfx); n.start(t); n.stop(t + 0.26);
}

/* twin-clutch engagement — the ROAD-CAR version of the above, and the whole
   point of it is that it is a SEPARATE EVENT from the paddle.

   A DCT does not change gear when your finger moves. The paddle is a switch:
   it closes, and then forty-odd milliseconds later, somewhere behind your
   back, one clutch releases and the other takes up and the car steps into
   the next ratio. Those are two distinct things you hear and feel, in that
   order, with a gap between them — and firing them both on the same frame is
   exactly why a paddle shift can feel like a mouse click instead of like a
   gearbox. Everything good about the way a 458 shifts lives in that gap.

   So this is deliberately small: a soft damped clack and a low step through
   the shell. It is not meant to be noticed on its own. It is meant to be the
   far end of the pause. */
function sfxDctEngage(strength = 1) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  // the clutch pack taking up — muted, oily, nothing like a dog ring
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 1.5;
  const f = ctx.createBiquadFilter(); f.type = "bandpass";
  f.frequency.value = 900 + Math.random() * 160; f.Q.value = 1.6;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.34 * strength, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
  n.connect(f); f.connect(g); g.connect(AU.sfx); n.start(t); n.stop(t + 0.05);
  // one short damped ring off the casing — a hint of metal, not a bell
  const o = ctx.createOscillator(); o.type = "sine";
  o.frequency.value = 1650 * (0.98 + Math.random() * 0.04);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.05 * strength, t + 0.004);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.048);
  o.connect(og); og.connect(AU.sfx); o.start(t + 0.004); o.stop(t + 0.07);
  // and the step through the car — the bit you feel in the seat
  const k = ctx.createOscillator(); k.type = "sine"; k.frequency.setValueAtTime(150, t);
  k.frequency.exponentialRampToValueAtTime(62, t + 0.07);
  const kg = ctx.createGain();
  kg.gain.setValueAtTime(0.3 * strength, t);
  kg.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  k.connect(kg); kg.connect(AU.sfx); k.start(t); k.stop(t + 0.11);
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
  s.connect(sf); sf.connect(sg); sg.connect(AU.sfx); s.start(t); s.stop(t + 0.035);
  // the two-stage detent: pull… CLACK
  [[0, 3200, 0.7], [0.03, 4200, 0.95]].forEach(([dt, hz, amp]) => {
    const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 2.2;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = hz; f.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp * strength, t + dt);
    g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.04);
    n.connect(f); f.connect(g); g.connect(AU.sfx); n.start(t + dt); n.stop(t + dt + 0.055);
  });
  // bright spring ring — sings for a moment after the clack
  [[5600, 0.11], [7400, 0.05]].forEach(([hz, amp]) => {
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = hz;
    const og = ctx.createGain();
    og.gain.setValueAtTime(amp * strength, t + 0.03);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(og); og.connect(AU.sfx); o.start(t + 0.03); o.stop(t + 0.22);
  });
  // the knock through the steering column — weight behind the click
  const k = ctx.createOscillator(); k.type = "sine"; k.frequency.setValueAtTime(420, t + 0.03);
  k.frequency.exponentialRampToValueAtTime(140, t + 0.08);
  const kg = ctx.createGain();
  kg.gain.setValueAtTime(0.42 * strength, t + 0.03);
  kg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  k.connect(kg); kg.connect(AU.sfx); k.start(t + 0.03); k.stop(t + 0.12);
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
  n.connect(f); f.connect(g); g.connect(AU.sfx); n.start(t); n.stop(t + 0.08);
  // crisp top on the strike
  const h = ctx.createBufferSource(); h.buffer = AU.noiseBuf; h.playbackRate.value = 2.4;
  const hf = ctx.createBiquadFilter(); hf.type = "highpass"; hf.frequency.value = 3200;
  const hg = ctx.createGain();
  hg.gain.setValueAtTime(0.5 * strength, t);
  hg.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  h.connect(hf); hf.connect(hg); hg.connect(AU.sfx); h.start(t); h.stop(t + 0.045);
  // the alloy rings — louder, longer
  [[2600, 0.18], [3900, 0.1], [5200, 0.04]].forEach(([hz, amp]) => {
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.value = hz * (0.99 + Math.random() * 0.02);
    const og = ctx.createGain();
    og.gain.setValueAtTime(amp * strength, t + 0.008);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
    o.connect(og); og.connect(AU.sfx); o.start(t + 0.008); o.stop(t + 0.21);
  });
  // deep thump of the paddle hitting its stop
  const k = ctx.createOscillator(); k.type = "sine"; k.frequency.setValueAtTime(170, t);
  k.frequency.exponentialRampToValueAtTime(60, t + 0.08);
  const kg = ctx.createGain();
  kg.gain.setValueAtTime(0.55 * strength, t);
  kg.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
  k.connect(kg); kg.connect(AU.sfx); k.start(t); k.stop(t + 0.13);
}

/* crisp mechanical detent — "k-CHK", a short-shifter with a tight spring:
   release click, engage clack, and a small knuckle thump underneath */
function sfxShiftClick(strength = 1, out) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime, dest = out || AU.sfx;
  [[0, 2600, 0.20], [0.045, 1700, 0.46]].forEach(([dt, hz, amp]) => {
    const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 1.6;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = hz; f.Q.value = 2.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp * strength, t + dt);
    g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.045);
    n.connect(f); f.connect(g); g.connect(dest);
    n.start(t + dt); n.stop(t + dt + 0.06);
  });
  const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(180, t + 0.045);
  o.frequency.exponentialRampToValueAtTime(70, t + 0.1);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.2 * strength, t + 0.045);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
  o.connect(og); og.connect(dest); o.start(t + 0.045); o.stop(t + 0.13);
}

/* open-gate metal snick — the ball knob through an exposed gate: a bright
   tick, the gate plate ringing (two detuned partials), and the lever's clack */
function sfxShiftMetal(strength = 1, out) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime, dest = out || AU.sfx;
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 2;
  const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 2800;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.45 * strength, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  n.connect(f); f.connect(g); g.connect(dest); n.start(t); n.stop(t + 0.07);
  [[3150, 0.085], [4680, 0.05]].forEach(([hz, amp]) => {
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.value = hz * (0.98 + Math.random() * 0.04);
    const og = ctx.createGain();
    og.gain.setValueAtTime(amp * strength, t + 0.01);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(og); og.connect(dest); o.start(t + 0.01); o.stop(t + 0.25);
  });
  const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.setValueAtTime(140, t);
  o2.frequency.exponentialRampToValueAtTime(60, t + 0.07);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.28 * strength, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  o2.connect(g2); g2.connect(dest); o2.start(t); o2.stop(t + 0.11);
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
  n.connect(f); f.connect(g); g.connect(AU.sfx); n.start(t); n.stop(t + 0.04);
  // the bright snap — short, dry, no ring
  const o = ctx.createOscillator(); o.type = "square";
  o.frequency.setValueAtTime(2400, t);
  o.frequency.exponentialRampToValueAtTime(900, t + 0.02);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.16 * amp, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  o.connect(og); og.connect(AU.sfx); o.start(t); o.stop(t + 0.045);
  // the knock into the panel — the bit you feel
  const k = ctx.createOscillator(); k.type = "sine";
  k.frequency.setValueAtTime(320, t);
  k.frequency.exponentialRampToValueAtTime(110, t + 0.05);
  const kg = ctx.createGain();
  kg.gain.setValueAtTime(0.3 * amp, t);
  kg.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  k.connect(kg); kg.connect(AU.sfx); k.start(t); k.stop(t + 0.09);
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
  s.connect(sf); sf.connect(sg); sg.connect(AU.sfx); s.start(t); s.stop(t + 0.12);
  // the detent dropping home
  const dt = back ? 0.05 : 0.08;
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 1.8;
  const nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 1900; nf.Q.value = 1.1;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.4, t + dt);
  ng.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.03);
  n.connect(nf); nf.connect(ng); ng.connect(AU.sfx); n.start(t + dt); n.stop(t + dt + 0.05);
  // the lump of the mechanism landing — cheap, heavy, mechanical
  const k = ctx.createOscillator(); k.type = "sine";
  k.frequency.setValueAtTime(380, t + dt);
  k.frequency.exponentialRampToValueAtTime(120, t + dt + 0.05);
  const kg = ctx.createGain();
  kg.gain.setValueAtTime(0.3, t + dt);
  kg.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.08);
  k.connect(kg); kg.connect(AU.sfx); k.start(t + dt); k.stop(t + dt + 0.1);
  // a little steel ring off the barrel
  const o = ctx.createOscillator(); o.type = "triangle";
  o.frequency.value = back ? 1420 : 1180;
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.05, t + dt + 0.004);
  og.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.09);
  o.connect(og); og.connect(AU.sfx); o.start(t + dt + 0.004); o.stop(t + dt + 0.11);
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
  n.connect(f); f.connect(g); g.connect(AU.sfx); n.start(t); n.stop(t + 0.05);
  // spring twang — thin metal, quickly damped
  [[1750, 0.1], [2620, 0.05]].forEach(([hz, amp]) => {
    const o = ctx.createOscillator(); o.type = "triangle";
    o.frequency.setValueAtTime(hz, t);
    o.frequency.exponentialRampToValueAtTime(hz * (open ? 1.12 : 0.88), t + 0.09);
    const og = ctx.createGain();
    og.gain.setValueAtTime(amp, t + 0.004);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    o.connect(og); og.connect(AU.sfx); o.start(t + 0.004); o.stop(t + 0.13);
  });
  // the lid arriving at its stop a beat later
  const dt = open ? 0.11 : 0.07;
  const k = ctx.createOscillator(); k.type = "sine";
  k.frequency.setValueAtTime(520, t + dt);
  k.frequency.exponentialRampToValueAtTime(150, t + dt + 0.05);
  const kg = ctx.createGain();
  kg.gain.setValueAtTime(0.34, t + dt);
  kg.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.08);
  k.connect(kg); kg.connect(AU.sfx); k.start(t + dt); k.stop(t + dt + 0.1);
  const c = ctx.createBufferSource(); c.buffer = AU.noiseBuf; c.playbackRate.value = 1.7;
  const cf = ctx.createBiquadFilter(); cf.type = "bandpass"; cf.frequency.value = 2100; cf.Q.value = 0.9;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.3, t + dt);
  cg.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.035);
  c.connect(cf); cf.connect(cg); cg.connect(AU.sfx); c.start(t + dt); c.stop(t + dt + 0.05);
}

/* first press: electronics live. The main relay clacks in, the in-tank fuel
   pump spins up and primes with that rising whirr, then goes quiet as the
   rail comes up to pressure — the moment the car stops being furniture. */
/* ---- cluster voice callouts ----------------------------------------
   Spoken by the browser's own speech engine, so there's nothing to
   download and it follows the system voice. Kept low, slow and flat —
   it should sound like a car telling you something, not an assistant. */
// the voice list arrives asynchronously; ask for it early so the first
// callout of the session isn't the one that comes out in the wrong voice
if (typeof speechSynthesis !== "undefined") {
  try {
    speechSynthesis.getVoices();
    speechSynthesis.addEventListener("voiceschanged", () => speechSynthesis.getVoices());
  } catch (_) {}
}

function sayVoice(text, opt = {}) {
  if (!S.voice || S.muted) return;
  if (typeof speechSynthesis === "undefined") return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = opt.rate != null ? opt.rate : 0.94;
    u.pitch = opt.pitch != null ? opt.pitch : 0.72;   // dropped — flat and machine-ish
    // the callouts come out of the cluster speaker, which is a foot from your
    // head with the windows up and thirty feet away with your ear at the
    // tailpipe — so the voice tracks where you're listening from, same as
    // everything else on the interior bus
    const base = opt.volume != null ? opt.volume : 0.5;
    u.volume = clamp(base * (inCabin() ? 1.8 : insideEar() ? 1 : 0.45), 0, 1);
    // prefer a plain system voice over anything chirpy
    const vs = speechSynthesis.getVoices() || [];
    const pick = vs.find(v => /daniel|alex|google uk english male|male/i.test(v.name))
              || vs.find(v => /en[-_]/i.test(v.lang));
    if (pick) u.voice = pick;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch (_) {}
}

/* Event callouts. Rate-limited per kind so the cluster informs you rather
   than nags: a warning you're actively ignoring repeats, everything else
   says its piece once and shuts up. */
const VOX = {};
function sayEvent(key, text, opt = {}) {
  if (!S.voice || S.muted) return;
  const now = performance.now();
  const gap = (opt.cool != null ? opt.cool : 6) * 1000;
  if (VOX[key] && now - VOX[key] < gap) return;
  VOX[key] = now;
  sayVoice(text, opt);
}
// forget the cooldowns when the situation resets (new car, restart)
function clearVox() { for (const k in VOX) delete VOX[k]; }

/* ---- the electrics you can actually hear running -------------------
   Key on and a car is not silent. The radiator fans spin up and stay
   spinning, the HVAC blower comes on with them, and underneath it all
   is the flat electrical hum of a live loom. It runs until the engine
   catches and takes over, or until you switch it off.

   This is a sustained bed rather than a one-shot, so it keeps going for
   as long as you leave the car sitting there powered up. */
/* The bed of noise a switched-on car makes while it is standing still.
   `fans` splits it in two, because on a race car those are two different
   switches: IGNITION wakes the loom — dash alive, relays in, the flat hum of
   a car with current in it — and the FUEL PUMP is what spins the coolant
   fans and the blower up. Flip them in order on the real thing and you hear
   exactly this: a click and a hum, then a pause, then the car starts
   breathing. See raceSwitch(). */
function accBedStart(loud = 1, fans = true) {
  if (!AU.ready) return;
  accBedStop(0.05);
  const ctx = AU.ctx, t = ctx.currentTime;
  const bed = { nodes: [], gains: [], fans };

  if (fans) {
  // --- radiator fans: broadband rush, spinning up over about a second
  const fan = ctx.createBufferSource(); fan.buffer = AU.noiseBuf; fan.loop = true;
  fan.playbackRate.value = 0.62;
  const fanF = ctx.createBiquadFilter(); fanF.type = "bandpass"; fanF.Q.value = 0.75;
  fanF.frequency.setValueAtTime(220, t);
  fanF.frequency.exponentialRampToValueAtTime(760, t + 1.0);
  const fanG = ctx.createGain();
  fanG.gain.setValueAtTime(0.0001, t);
  fanG.gain.linearRampToValueAtTime(0.115 * loud, t + 0.85);
  fan.connect(fanF); fanF.connect(fanG); fanG.connect(AU.sfx);
  fan.start(t);
  bed.nodes.push(fan); bed.gains.push(fanG);

  // --- the blade-pass tone that makes it read as a fan and not just hiss.
  //     Rises with the spin-up and then wanders very slightly, the way a
  //     real one does as it loads and unloads.
  const blade = ctx.createOscillator(); blade.type = "sawtooth";
  blade.frequency.setValueAtTime(46, t);
  blade.frequency.exponentialRampToValueAtTime(132, t + 1.0);
  const wob = ctx.createOscillator(); wob.type = "sine"; wob.frequency.value = 0.7;
  const wobG = ctx.createGain(); wobG.gain.value = 2.4;
  wob.connect(wobG); wobG.connect(blade.frequency); wob.start(t);
  const bladeF = ctx.createBiquadFilter(); bladeF.type = "lowpass"; bladeF.frequency.value = 560;
  const bladeG = ctx.createGain();
  bladeG.gain.setValueAtTime(0.0001, t);
  bladeG.gain.linearRampToValueAtTime(0.062 * loud, t + 0.9);
  blade.connect(bladeF); bladeF.connect(bladeG); bladeG.connect(AU.sfx);
  blade.start(t);
  bed.nodes.push(blade, wob); bed.gains.push(bladeG);

  // --- HVAC blower in the dash: softer, closer, no blade tone
  const blow = ctx.createBufferSource(); blow.buffer = AU.noiseBuf; blow.loop = true;
  blow.playbackRate.value = 0.4;
  const blowF = ctx.createBiquadFilter(); blowF.type = "lowpass"; blowF.frequency.value = 900;
  const blowG = ctx.createGain();
  blowG.gain.setValueAtTime(0.0001, t + 0.3);
  blowG.gain.linearRampToValueAtTime(0.05 * loud, t + 1.4);
  blow.connect(blowF); blowF.connect(blowG); blowG.connect(AU.sfx);
  blow.start(t + 0.3);
  bed.nodes.push(blow); bed.gains.push(blowG);

  }   // end of the fan/blower group

  // --- and the loom itself: the flat hum of a car that is switched on.
  //     This one is not optional — it IS "the car has electricity".
  const hum = ctx.createOscillator(); hum.type = "triangle"; hum.frequency.value = 118;
  const humG = ctx.createGain();
  humG.gain.setValueAtTime(0.0001, t);
  humG.gain.linearRampToValueAtTime(0.02 * loud, t + 0.4);
  hum.connect(humG); humG.connect(AU.sfx); hum.start(t);
  bed.nodes.push(hum); bed.gains.push(humG);

  AU.accBed = bed;
}

function accBedStop(fade = 0.5) {
  const bed = AU.accBed;
  if (!bed || !AU.ready) return;
  AU.accBed = null;
  const t = AU.ctx.currentTime;
  bed.gains.forEach(g => {
    try {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    } catch (_) {}
  });
  bed.nodes.forEach(n => { try { n.stop(t + fade + 0.05); } catch (_) {} });
}

/* the ABS pump running its self-test — a short, hard motor buzz with the
   solenoid valves clicking through underneath it. Every car with ABS does
   this on key-on and it is unmistakably mechanical. */
function sfxAbsTest(at) {
  if (!AU.ready) return;
  const ctx = AU.ctx;
  const m = ctx.createOscillator(); m.type = "square";
  m.frequency.setValueAtTime(74, at);
  m.frequency.linearRampToValueAtTime(96, at + 0.26);
  const mf = ctx.createBiquadFilter(); mf.type = "lowpass"; mf.frequency.value = 700;
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(0.0001, at);
  mg.gain.linearRampToValueAtTime(0.045, at + 0.04);
  mg.gain.setValueAtTime(0.045, at + 0.22);
  mg.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
  m.connect(mf); mf.connect(mg); mg.connect(AU.sfx);
  m.start(at); m.stop(at + 0.34);
  // the valve block ticking through its channels
  for (let i = 0; i < 5; i++) {
    const tt = at + 0.03 + i * 0.045;
    const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 2.2;
    const nf = ctx.createBiquadFilter(); nf.type = "bandpass";
    nf.frequency.value = 2600 + i * 180; nf.Q.value = 2.4;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.05, tt);
    ng.gain.exponentialRampToValueAtTime(0.0001, tt + 0.014);
    n.connect(nf); nf.connect(ng); ng.connect(AU.sfx); n.start(tt); n.stop(tt + 0.02);
  }
}

/* injectors and the rail ticking as the ECU pulses them — fast, dry, quiet,
   the sound of a fuel system being told to wake up */
function sfxInjectorTicks(at, n = 9) {
  if (!AU.ready) return;
  const ctx = AU.ctx;
  for (let i = 0; i < n; i++) {
    const tt = at + i * 0.037 + Math.random() * 0.008;
    const s = ctx.createBufferSource(); s.buffer = AU.noiseBuf; s.playbackRate.value = 2.8;
    const f = ctx.createBiquadFilter(); f.type = "bandpass";
    f.frequency.value = 3800 + Math.random() * 900; f.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.026, tt);
    g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.01);
    s.connect(f); f.connect(g); g.connect(AU.sfx); s.start(tt); s.stop(tt + 0.015);
  }
}

/* Key on, engine off. Every car does this: once the dash has finished
   waking up it starts quietly reminding you it's sitting there powered but
   not running, and it doesn't stop until you either start it or switch it
   off. Deliberately soft — a nudge, not the warning tone. */
function sfxAccNag() {
  if (!AU.ready || S.muted) return;
  clusterBeep(AU.ctx.currentTime, 2093, 0.06, 0.036);   // one short pip, nothing more
}

let accNagT = 0;
function accNagStop() { if (accNagT) { clearTimeout(accNagT); accNagT = 0; } }
function accNagStart(delay) {
  accNagStop();
  const seq = S.crankSeq;                  // any further ignition press ends it
  const tick = () => {
    accNagT = 0;
    if (S.crankSeq !== seq) return;
    if (!S.acc || S.engineOn || S.cranking) return;
    sfxAccNag();
    accNagT = setTimeout(tick, 1150);
  };
  accNagT = setTimeout(tick, delay);
}

/* the harsh two-tone a cluster uses when it actually wants your attention —
   deliberately unpleasant, and nothing like the polite self-test beep */
function warnChime(urgency = 1) {
  if (!AU.ready) return;
  const t = AU.ctx.currentTime;
  clusterBeep(t, 988, 0.09, 0.055 * urgency);
  clusterBeep(t + 0.11, 740, 0.11, 0.055 * urgency);
  if (urgency > 1) clusterBeep(t + 0.24, 988, 0.09, 0.05 * urgency);
}

// a clean cluster beep — the kind a self-test makes: sine core, a touch of
// third harmonic for the piezo edge, hard-gated so it never rings
function clusterBeep(at, hz = 2100, dur = 0.055, amp = 0.05) {
  if (!AU.ready) return;
  const ctx = AU.ctx;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(amp, at + 0.006);
  g.gain.setValueAtTime(amp, at + dur - 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  g.connect(AU.inner);
  [[1, 1], [3, 0.22], [5, 0.07]].forEach(([mul, lvl]) => {
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.value = hz * mul;
    const og = ctx.createGain(); og.gain.value = lvl;
    o.connect(og); og.connect(g); o.start(at); o.stop(at + dur + 0.02);
  });
}

/* The full supercar wake-up, on top of the ordinary one. This is the bit
   people film: you turn it on and the car spends two seconds proving it
   still works before it will let you start it.

   Everything here is a real noise a real car makes on key-on — the head
   unit's speaker relay, the needles sweeping their stops, the exhaust
   bypass valves cycling, the fans blipping, the TFT dash lighting up. */
function sfxAccRich(c) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  const loud = Math.min(1.5, 0.7 + popsRating() * 0.2);   // open pipes make a meal of it

  /* --- the head unit's speaker relay. A soft thunk with real weight to it,
         the sound of amplifiers being connected to drivers. Nothing else on
         a car sounds like this and everyone knows it instantly. --- */
  const amp0 = t + 0.09;
  const amp = ctx.createOscillator(); amp.type = "sine";
  amp.frequency.setValueAtTime(96, amp0);
  amp.frequency.exponentialRampToValueAtTime(38, amp0 + 0.1);
  const ampG = ctx.createGain();
  ampG.gain.setValueAtTime(0.0001, amp0);
  ampG.gain.linearRampToValueAtTime(0.3, amp0 + 0.008);
  ampG.gain.exponentialRampToValueAtTime(0.0001, amp0 + 0.16);
  amp.connect(ampG); ampG.connect(AU.sfx); amp.start(amp0); amp.stop(amp0 + 0.2);
  // the tiny relay contact that does it
  const rc = ctx.createBufferSource(); rc.buffer = AU.noiseBuf; rc.playbackRate.value = 1.9;
  const rcF = ctx.createBiquadFilter(); rcF.type = "bandpass"; rcF.frequency.value = 2700; rcF.Q.value = 2;
  const rcG = ctx.createGain();
  rcG.gain.setValueAtTime(0.13, amp0);
  rcG.gain.exponentialRampToValueAtTime(0.0001, amp0 + 0.018);
  rc.connect(rcF); rcF.connect(rcG); rcG.connect(AU.sfx); rc.start(amp0); rc.stop(amp0 + 0.03);

  /* --- the TFT dash lighting up: a soft rising swell, no transient. The
         cluster arriving rather than switching. --- */
  const tft0 = t + 0.2;
  [[220, 0.020], [330, 0.014], [440, 0.010]].forEach(([hz, lvl], i) => {
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(hz * 0.985, tft0);
    o.frequency.linearRampToValueAtTime(hz, tft0 + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, tft0 + i * 0.05);
    g.gain.linearRampToValueAtTime(lvl, tft0 + 0.28 + i * 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, tft0 + 0.95);
    o.connect(g); g.connect(AU.sfx); o.start(tft0 + i * 0.05); o.stop(tft0 + 1.0);
  });

  /* --- the needles sweeping to their stops and back. Stepper motors under
         glass: a thin whirr that rises with the sweep out, pauses on the peg,
         then falls as they come home. Timed to the gauges actually moving. --- */
  const sw0 = t + 0.26;
  const nsw = ctx.createOscillator(); nsw.type = "sawtooth";
  nsw.frequency.setValueAtTime(240, sw0);
  nsw.frequency.linearRampToValueAtTime(720, sw0 + 0.4);       // out to the stop
  nsw.frequency.setValueAtTime(720, sw0 + 0.48);
  nsw.frequency.linearRampToValueAtTime(250, sw0 + 0.92);      // and back home
  const nswF = ctx.createBiquadFilter(); nswF.type = "bandpass";
  nswF.frequency.value = 2100; nswF.Q.value = 4.5;
  const nswG = ctx.createGain();
  nswG.gain.setValueAtTime(0.0001, sw0);
  nswG.gain.linearRampToValueAtTime(0.026, sw0 + 0.06);
  nswG.gain.setValueAtTime(0.026, sw0 + 0.86);
  nswG.gain.exponentialRampToValueAtTime(0.0001, sw0 + 0.95);
  nsw.connect(nswF); nswF.connect(nswG); nswG.connect(AU.sfx);
  nsw.start(sw0); nsw.stop(sw0 + 1.0);
  // both needles hitting their stops, then landing back on zero
  [[sw0 + 0.42, 0.06], [sw0 + 0.45, 0.05], [sw0 + 0.9, 0.045], [sw0 + 0.93, 0.04]]
    .forEach(([at, lvl]) => {
      const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 2.4;
      const nf = ctx.createBiquadFilter(); nf.type = "bandpass";
      nf.frequency.value = 3400; nf.Q.value = 2.2;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(lvl, at);
      ng.gain.exponentialRampToValueAtTime(0.0001, at + 0.02);
      n.connect(nf); nf.connect(ng); ng.connect(AU.sfx); n.start(at); n.stop(at + 0.03);
    });

  /* --- the exhaust bypass valves cycling on their self-test. Two actuator
         servos, a beat apart, each ending in the valve plate seating against
         its stop — right down the pipes, so on a straight-piped car you hear
         it through the whole exhaust. --- */
  [0.62, 0.86].forEach((dt, i) => {
    const v0 = t + dt;
    // the actuator driving over
    const v = ctx.createOscillator(); v.type = "sawtooth";
    v.frequency.setValueAtTime(150, v0);
    v.frequency.linearRampToValueAtTime(300 + i * 60, v0 + 0.13);
    const vf = ctx.createBiquadFilter(); vf.type = "bandpass";
    vf.frequency.value = 1150; vf.Q.value = 3.4;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0.0001, v0);
    vg.gain.linearRampToValueAtTime(0.03 * loud, v0 + 0.03);
    vg.gain.setValueAtTime(0.03 * loud, v0 + 0.1);
    vg.gain.exponentialRampToValueAtTime(0.0001, v0 + 0.15);
    v.connect(vf); vf.connect(vg); vg.connect(AU.sfx); v.start(v0); v.stop(v0 + 0.18);
    // the plate seating — a dull metallic clack that rings down the pipe
    const seat = v0 + 0.14;
    const k = ctx.createOscillator(); k.type = "sine";
    k.frequency.setValueAtTime(430 - i * 60, seat);
    k.frequency.exponentialRampToValueAtTime(120, seat + 0.06);
    const kg = ctx.createGain();
    kg.gain.setValueAtTime(0.16 * loud, seat);
    kg.gain.exponentialRampToValueAtTime(0.0001, seat + 0.1);
    k.connect(kg); kg.connect(AU.sfx); k.start(seat); k.stop(seat + 0.12);
    const kn = ctx.createBufferSource(); kn.buffer = AU.noiseBuf; kn.playbackRate.value = 1.4;
    const knF = ctx.createBiquadFilter(); knF.type = "bandpass";
    knF.frequency.value = 1700; knF.Q.value = 1.1;
    const knG = ctx.createGain();
    knG.gain.setValueAtTime(0.14 * loud, seat);
    knG.gain.exponentialRampToValueAtTime(0.0001, seat + 0.045);
    kn.connect(knF); knF.connect(knG); knG.connect(AU.sfx); kn.start(seat); kn.stop(seat + 0.06);
  });

  /* --- and the belt reminder, because it always does --- */
  clusterBeep(t + 1.42, 1760, 0.09, 0.03);
  clusterBeep(t + 1.62, 1760, 0.09, 0.03);
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
  r.connect(rf); rf.connect(rg); rg.connect(AU.sfx); r.start(t); r.stop(t + 0.05);
  const rk = ctx.createOscillator(); rk.type = "sine";
  rk.frequency.setValueAtTime(260, t); rk.frequency.exponentialRampToValueAtTime(90, t + 0.06);
  const rkg = ctx.createGain();
  rkg.gain.setValueAtTime(0.36, t); rkg.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  rk.connect(rkg); rkg.connect(AU.sfx); rk.start(t); rk.stop(t + 0.1);

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
  en.connect(enf); enf.connect(eng); eng.connect(AU.sfx);
  en.start(t + 0.02); en.stop(t + 0.4);
  // the mains hum that lives under a live dashboard until you stop noticing it
  const hum = ctx.createOscillator(); hum.type = "triangle"; hum.frequency.value = 118;
  const humG = ctx.createGain();
  humG.gain.setValueAtTime(0.001, t + 0.03);
  humG.gain.linearRampToValueAtTime(0.018, t + 0.2);
  humG.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
  hum.connect(humG); humG.connect(AU.sfx); hum.start(t + 0.03); hum.stop(t + 1.6);

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
  p.connect(pf); pf.connect(pg); pg.connect(AU.sfx);
  p.start(p0); p.stop(p0 + pDur + 0.05);
  // the hiss of fuel actually moving with it
  const h = ctx.createBufferSource(); h.buffer = AU.noiseBuf; h.loop = true; h.playbackRate.value = 1.1;
  const hf = ctx.createBiquadFilter(); hf.type = "bandpass"; hf.frequency.value = 2400; hf.Q.value = 0.8;
  const hg = ctx.createGain();
  hg.gain.setValueAtTime(0.001, p0);
  hg.gain.linearRampToValueAtTime(0.03, p0 + 0.12);
  hg.gain.exponentialRampToValueAtTime(0.001, p0 + pDur);
  h.connect(hf); hf.connect(hg); hg.connect(AU.sfx);
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
  sv.connect(svf); svf.connect(svg); svg.connect(AU.sfx);
  sv.start(s0); sv.stop(s0 + 0.36);
  }

  /* --- the ABS pump cycling its valve block, and the injectors being
         pulsed awake --- */
  if (modern) {
    sfxAbsTest(t + 0.66);
    sfxInjectorTicks(t + 0.34, 9);
  } else {
    sfxInjectorTicks(t + 0.3, 5);
  }

  /* --- the fans, the blower and the loom: everything that keeps running for
         as long as the car sits there switched on --- */
  accBedStart(modern ? 1 : 0.75);

  /* --- secondary relays ticking in behind everything else --- */
  [0.30, 0.47, 0.61, 0.82].forEach((dt, i) => {
    const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf;
    n.playbackRate.value = 1.3 + i * 0.25;
    const nf = ctx.createBiquadFilter(); nf.type = "bandpass";
    nf.frequency.value = 1500 + i * 420; nf.Q.value = 2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.11 - i * 0.015, t + dt);
    ng.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.022);
    n.connect(nf); nf.connect(ng); ng.connect(AU.sfx);
    n.start(t + dt); n.stop(t + dt + 0.035);
  });

  /* --- systems ready: a two-note resolve, then the callout. The old cars
         get a single dull warning chime instead, which is all they had. --- */
  if (modern) {
    clusterBeep(t + 1.02, 1568, 0.075, 0.045);
    clusterBeep(t + 1.12, 2093, 0.13, 0.05);
    setTimeout(() => sayVoice("Electronics on", { volume: 0.85, rate: 0.9 }), 1250);
  } else {
    clusterBeep(t + 0.55, 1046, 0.16, 0.035);
  }

  // the exotics get the whole performance on top
  if (c && c.bootRich) sfxAccRich(c);
  if (c && c.boot === "space") sfxAccSpace();
}

/* ---------------------------------------------------------------
   THE SPACESHIP
   ---------------------------------------------------------------
   Horacio Pagani built the Zonda's cabin like an instrument, not a dashboard
   — milled aluminium toggles in a row, an exposed gear linkage, switches
   that look like they arm something. Turning it on should feel like bringing
   a machine online rather than waking an appliance up, and that is a
   sequence, not a sound: five separate events with air between them.

     0.00  the sub swelling up      — something large getting power
     0.10  four toggles, in a row   — accelerating, because you flick them fast
     0.55  the charge sweep         — a resonant rise, capacitors filling
     1.05  systems online           — a detuned chord blooming and settling
     1.55  the main contactor       — one deep thunk, and it is live

   Nothing here is the engine. The engine is the second press. This is just
   the car agreeing to exist. */
function sfxAccSpace() {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime, B = AU.sfx;

  // --- 1. the reactor: a sub swell rising under everything else
  const sub = ctx.createOscillator(); sub.type = "sine";
  sub.frequency.setValueAtTime(26, t);
  sub.frequency.exponentialRampToValueAtTime(72, t + 1.5);
  const subG = ctx.createGain();
  subG.gain.setValueAtTime(0.0001, t);
  subG.gain.linearRampToValueAtTime(0.16, t + 0.9);
  subG.gain.setValueAtTime(0.16, t + 1.5);
  subG.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
  sub.connect(subG); subG.connect(B); sub.start(t); sub.stop(t + 2.5);

  // --- 2. the toggle bank: four milled switches, thrown in a row and
  //        speeding up, because nobody flicks the fourth one slowly
  [0.10, 0.235, 0.35, 0.445].forEach((at, i) => {
    const w = t + at;
    const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf;
    n.playbackRate.value = 1.7 + i * 0.12;
    const f = ctx.createBiquadFilter(); f.type = "bandpass";
    f.frequency.value = 2600 + i * 320; f.Q.value = 2.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.2 + i * 0.02, w);
    g.gain.exponentialRampToValueAtTime(0.0001, w + 0.022);
    n.connect(f); f.connect(g); g.connect(B); n.start(w); n.stop(w + 0.04);
    // each toggle lands on a little metal body, a semitone up each time
    const k = ctx.createOscillator(); k.type = "triangle";
    k.frequency.setValueAtTime(320 * Math.pow(1.06, i), w);
    k.frequency.exponentialRampToValueAtTime(150, w + 0.05);
    const kg = ctx.createGain();
    kg.gain.setValueAtTime(0.075, w);
    kg.gain.exponentialRampToValueAtTime(0.0001, w + 0.07);
    k.connect(kg); kg.connect(B); k.start(w); k.stop(w + 0.09);
  });

  // --- 3. the charge: a high-Q band sweeping up through the spectrum. This
  //        is the one that reads as science fiction, and it works because
  //        real capacitor banks and real turbines both do exactly this.
  const c0 = t + 0.55;
  const chg = ctx.createBufferSource(); chg.buffer = AU.noiseBuf; chg.loop = true;
  chg.playbackRate.value = 1.2;
  const cf = ctx.createBiquadFilter(); cf.type = "bandpass"; cf.Q.value = 14;
  cf.frequency.setValueAtTime(190, c0);
  cf.frequency.exponentialRampToValueAtTime(3900, c0 + 0.85);
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.0001, c0);
  cg.gain.linearRampToValueAtTime(0.15, c0 + 0.5);
  cg.gain.exponentialRampToValueAtTime(0.0001, c0 + 1.0);
  chg.connect(cf); cf.connect(cg); cg.connect(B); chg.start(c0); chg.stop(c0 + 1.05);
  // a tonal partner an octave under it so the sweep has a pitch, not just hiss
  const cs = ctx.createOscillator(); cs.type = "sawtooth";
  cs.frequency.setValueAtTime(95, c0);
  cs.frequency.exponentialRampToValueAtTime(1950, c0 + 0.85);
  const csf = ctx.createBiquadFilter(); csf.type = "lowpass"; csf.frequency.value = 2600;
  const csg = ctx.createGain();
  csg.gain.setValueAtTime(0.0001, c0);
  csg.gain.linearRampToValueAtTime(0.045, c0 + 0.55);
  csg.gain.exponentialRampToValueAtTime(0.0001, c0 + 0.98);
  cs.connect(csf); csf.connect(csg); csg.connect(B); cs.start(c0); cs.stop(c0 + 1.0);

  // --- 4. systems online: a fifth, blooming and settling. Detuned by a few
  //        cents so it shimmers instead of sitting there being a synth chord.
  const o0 = t + 1.05;
  [[523.25, 0.030], [784.0, 0.024], [1046.5, 0.016], [1568.0, 0.008]].forEach(([hz, lvl], i) => {
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(hz * 0.994, o0 + i * 0.05);
    o.frequency.linearRampToValueAtTime(hz, o0 + 0.5 + i * 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, o0 + i * 0.05);
    g.gain.linearRampToValueAtTime(lvl, o0 + 0.26 + i * 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, o0 + 1.15);
    o.connect(g); g.connect(B); o.start(o0 + i * 0.05); o.stop(o0 + 1.2);
  });

  // --- 5. the main contactor closing. One deep thunk, and the car is live.
  const m0 = t + 1.55;
  const mk = ctx.createOscillator(); mk.type = "sine";
  mk.frequency.setValueAtTime(140, m0);
  mk.frequency.exponentialRampToValueAtTime(42, m0 + 0.13);
  const mkg = ctx.createGain();
  mkg.gain.setValueAtTime(0.42, m0);
  mkg.gain.exponentialRampToValueAtTime(0.0001, m0 + 0.22);
  mk.connect(mkg); mkg.connect(B); mk.start(m0); mk.stop(m0 + 0.25);
  const mn = ctx.createBufferSource(); mn.buffer = AU.noiseBuf; mn.playbackRate.value = 0.9;
  const mnf = ctx.createBiquadFilter(); mnf.type = "lowpass"; mnf.frequency.value = 900;
  const mng = ctx.createGain();
  mng.gain.setValueAtTime(0.26, m0);
  mng.gain.exponentialRampToValueAtTime(0.0001, m0 + 0.07);
  mn.connect(mnf); mnf.connect(mng); mng.connect(B); mn.start(m0); mn.stop(m0 + 0.1);
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

// a parked automatic is held here no matter how hard you lean on it
const PARK_REV_LIMIT = 4500;

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
  // a naturally aspirated engine with light internals flares hardest on the
  // first fires — the throttle plates are shut, so it's all fuelling
  p.flare = diesel ? 0.9 : c.asp === "na" ? 1 : 0.95;
  p.flareT = diesel ? 1.0 : c.asp === "na" ? (cyl >= 10 ? 1.25 : 1.1) : 1.05;
  const m = Object.assign(p, c.start || {});

  /* Every car swings to somewhere between three and four thousand and comes
     straight back down — that's the whole shape of a start, and it doesn't
     matter whether the redline is 4,550 or 12,100. Where inside that band a
     given car lands is down to how eager it is: a light naturally aspirated
     engine goes higher than a heavy turbo one. Anything with a low redline
     is held to three quarters of it so the needle never looks silly. */
  if (m.peak == null)
    m.peak = clamp(c.idle * (diesel ? 3.4 : c.asp === "na" ? 3.8 : 3.5),
                   3000, Math.min(4000, c.cut * 0.78));
  // and it needs the authority to actually get there
  m.flare = Math.max(m.flare, 0.95);
  m.flareT = Math.max(m.flareT, 1.6);
  // a genuinely feeble engine needs longer to swing that far — the Peel makes
  // ten horsepower and has to drag itself up there
  if (Math.max(...c.curve.map(q => q[1])) < 60) m.flareT *= 2.4;
  return m;
}

/* the crank itself — solenoid, motor, and the engine fighting back */
function sfxCrank(p, amp = 1) {
  if (!AU.ready) return null;
  const ctx = AU.ctx, t = ctx.currentTime;
  const dur = p.dur;
  /* everything the starter makes goes through one bus, so letting go of the
     button can cut it off mid-turn the way releasing a real key does */
  const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(AU.sfx);
  const chug = (p.cyl / 2) * (p.rpm / 60);      // compressions per second

  /* --- the solenoid throwing the pinion into the ring gear --- */
  const sol = ctx.createBufferSource(); sol.buffer = AU.noiseBuf; sol.playbackRate.value = 1.6;
  const solF = ctx.createBiquadFilter(); solF.type = "bandpass";
  solF.frequency.value = 2300; solF.Q.value = 1.3;
  const solG = ctx.createGain();
  solG.gain.setValueAtTime(0.55 * amp, t);
  solG.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  sol.connect(solF); solF.connect(solG); solG.connect(bus);
  sol.start(t); sol.stop(t + 0.06);
  // gear teeth meshing — a hard, low clack you feel in the bellhousing
  const mesh = ctx.createOscillator(); mesh.type = "sine";
  mesh.frequency.setValueAtTime(240, t);
  mesh.frequency.exponentialRampToValueAtTime(78, t + 0.06);
  const meshG = ctx.createGain();
  meshG.gain.setValueAtTime(0.42 * amp, t);
  meshG.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  mesh.connect(meshG); meshG.connect(bus); mesh.start(t); mesh.stop(t + 0.11);

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
  wh.connect(whF); whF.connect(whG); whG.connect(bus);
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
  arm.connect(armF); armF.connect(armG); armG.connect(bus);
  arm.start(t + 0.02); arm.stop(t + dur + 0.06);

  /* --- the compressions. One event per firing stroke, jittered, because
         no real starter is metronomic and that unevenness is most of the
         character. Rate accelerates slightly as the oil thins out. --- */
  let time = 0.035, i = 0;
  while (time < dur - 0.02 && i < 40) {
    const prog = time / dur;
    const lvl = amp * (0.62 + 0.38 * prog) * (0.85 + Math.random() * 0.3);
    const tt = Math.max(t, t + time + (Math.random() - 0.5) * 0.008);
    // the lump: the engine being forced over on a closed valve
    const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf;
    n.playbackRate.value = 0.3 + Math.random() * 0.12;
    const nf = ctx.createBiquadFilter(); nf.type = "lowpass";
    nf.frequency.value = 230 + p.grit * 170;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.001, tt);
    ng.gain.linearRampToValueAtTime(0.3 * lvl, tt + 0.006);
    ng.gain.exponentialRampToValueAtTime(0.001, tt + 0.05);
    n.connect(nf); nf.connect(ng); ng.connect(bus);
    n.start(tt); n.stop(tt + 0.07);
    // the thud through the block
    const k = ctx.createOscillator(); k.type = "sine";
    k.frequency.setValueAtTime(84 + Math.random() * 14, tt);
    k.frequency.exponentialRampToValueAtTime(46, tt + 0.045);
    const kg = ctx.createGain();
    kg.gain.setValueAtTime(0.26 * lvl, tt);
    kg.gain.exponentialRampToValueAtTime(0.001, tt + 0.06);
    k.connect(kg); kg.connect(bus); k.start(tt); k.stop(tt + 0.08);
    // diesels and tired old engines clatter on top of every stroke
    if (p.grit > 1.2) {
      const c2 = ctx.createBufferSource(); c2.buffer = AU.noiseBuf; c2.playbackRate.value = 2.1;
      const cf = ctx.createBiquadFilter(); cf.type = "bandpass";
      cf.frequency.value = 2900; cf.Q.value = 1.6;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.07 * lvl * p.grit, tt + 0.004);
      cg.gain.exponentialRampToValueAtTime(0.001, tt + 0.03);
      c2.connect(cf); cf.connect(cg); cg.connect(bus);
      c2.start(tt + 0.004); c2.stop(tt + 0.04);
    }
    time += 1 / (chug * (0.84 + 0.16 * prog));
    i++;
  }

  return {
    // let go early and the starter drops out: the bus is ducked away over a
    // few hundredths, which is exactly how abruptly a real one stops
    stop(fade = 0.06) {
      const now = ctx.currentTime;
      try {
        bus.gain.cancelScheduledValues(now);
        bus.gain.setValueAtTime(bus.gain.value, now);
        bus.gain.exponentialRampToValueAtTime(0.0001, now + fade);
      } catch (_) {}
    },
  };
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
  bx.connect(bxF); bxF.connect(bxG); bxG.connect(AU.sfx);
  bx.start(t); bx.stop(t + 0.25);

  /* --- the ragged first fires. Intervals close up as the crank speeds,
         amplitude climbs as more cylinders join in. --- */
  let dt = 0.0, gap = 0.082;
  for (let i = 0; i < (p.fires || 3); i++) {
    const lvl = hard * (0.5 + 0.5 * (i / Math.max(1, p.fires - 1))) * (0.8 + Math.random() * 0.4);
    const tt = Math.max(t, t + dt + (Math.random() - 0.5) * 0.012);
    // the crack out of the pipe
    const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 1.5;
    const nf = ctx.createBiquadFilter(); nf.type = "highpass"; nf.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.34 * lvl, tt);
    ng.gain.exponentialRampToValueAtTime(0.001, tt + 0.055);
    n.connect(nf); nf.connect(ng); ng.connect(AU.sfx); n.start(tt); n.stop(tt + 0.07);
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
    o.connect(of); of.connect(og); og.connect(AU.sfx); o.start(tt); o.stop(tt + 0.14);
    // and the punch in the chest
    const k = ctx.createOscillator(); k.type = "sine";
    k.frequency.setValueAtTime(120, tt);
    k.frequency.exponentialRampToValueAtTime(42, tt + 0.08);
    const kg = ctx.createGain();
    kg.gain.setValueAtTime(0.38 * lvl, tt);
    kg.gain.exponentialRampToValueAtTime(0.001, tt + 0.1);
    k.connect(kg); kg.connect(AU.sfx); k.start(tt); k.stop(tt + 0.12);
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
  air.connect(af); af.connect(ag); ag.connect(AU.sfx);
  air.start(t); air.stop(t + 0.85);
}

/* the polite one: a recirculating valve opening and the charge air sighing
   back round to the intake. No stall, no chuffing — just pressure leaving. */
function sfxBlowoff(amount = 1) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  const a = clamp(amount, 0, 1) * ear().turbo * (inCabin() ? 0.35 : 1);
  if (a < 0.03) return;
  [[0, 0.6], [0.07, 0.4], [0.13, 0.28], [0.19, 0.17], [0.26, 0.09]].forEach(([dt, amp], i) => {
    const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 1.45;
    const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 1900 - i * 260;
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp * a, t + dt);
    g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.1);
    n.connect(f); f.connect(g); g.connect(AU.sfx);
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
  n.connect(f); f.connect(g); g.connect(AU.sfx);
  n.start(t); n.stop(t + 0.42);
}

/* ================================================================
   TURBO RIG — a turbocharger system as a physical object
   ================================================================
   Everything else in this file models forced induction as a number called
   `boost` that chases rpm. That is fine for a car where the turbo is a detail.
   It is completely wrong for a car where the turbos ARE the car, because it
   gets the single most important thing backwards: a turbocharger is a heavy
   wheel spinning at 130,000rpm, and it does not care what your right foot is
   doing. Shut the throttle and manifold pressure is gone in a tenth of a
   second — but the shaft is still spinning, and it will still be spinning a
   second later. Get back on the throttle before it has bled off and the boost
   is simply THERE, instantly, with no lag at all. That asymmetry — pressure
   collapses fast, shaft speed decays slowly — is the entire feel of driving a
   big turbo car, and it is why lift-and-reapply is satisfying.

   So the rig separates the two:

     shaft speed   integrated, with real inertia, driven by exhaust flow
     boost         shaft speed × how far the throttle plate is open

   Manifold pressure falls off a cliff on a lift. Shaft speed coasts. Both
   drive the sound, and they drive DIFFERENT parts of it: the exhaust and the
   engine tone follow boost and load, the whine and the charge-air rush follow
   shaft speed. That is why the whine keeps singing for a moment after you
   lift, and why it does not have to be faked with an envelope.

   STAGING. The stages are turbo PAIRS, each with its own shaft, its own
   inertia and its own whine. A stage's control valve opens it to the exhaust
   over `at` → `at + span`, so it fades in over a whole chunk of the rev range
   rather than switching on. Nothing is triggered, nothing steps, and there
   are no separate whooshes — there is one turbo system that gets progressively
   more of itself involved. A bigger stage has more inertia, so it takes
   longer to light and longer to spin down, which is exactly the difference
   you hear between the low pair and the high pair.

   Every layer below is independently levelled, and every curve has a default,
   so a car can specify a whole rig or just say `turboRig: {}` and get a
   sensible generic one. See the Molsheim for a fully specified quad. */

const RIG_DEF = {
  // --- shaft mechanics -------------------------------------------------
  spoolUp:  3.0,    // how hard exhaust energy accelerates a shaft (1/s)
  coast:    0.6,    // how fast a shaft bleeds off unfed. LOW = long inertia,
                    //   and this number IS the lift-and-reapply feel
  bleed:    9.0,    // how fast manifold pressure collapses behind a shut plate
  fill:    16.0,    // …and how fast it refills behind an open one. Near-
                    //   instant: the air is already compressed and waiting
  windmill: 0.10,   // shaft speed a closed throttle still supports — the
                    //   engine is pumping SOMETHING even on the overrun
  // --- layers ----------------------------------------------------------
  whine:   { level: 0.05, hzMul: 1, spread: 0.007, wobble: 0.45, wobbleHz: 5.5, hp: 400 },
  // rise/riseMax: how hard CLIMBING pressure leans on the induction noise, and
  // the ceiling on that lean. This is the difference between flooring it at
  // 2000rpm and holding it flat at 6000 — same throttle, one of them building.
  intake:  { level: 0.10, hz: 340, q: 0.55, load: 0.75, rev: 0.28,
             rise: 0.22, riseMax: 0.35 },
  // …and the same pair for the charge-air rush. Off by default (rise: 0) so
  // nothing already tuned changes; a car turns it on when the swell onto boost
  // is part of its character.
  breath:  { level: 0.07, q: 0.6, boostHz: 600, rise: 0, riseMax: 0.5 },
  hiss:    { level: 0.025, hz: 3200, q: 0.5 },
  /* --- the whistle ---
     The thing people mean when they say "turbo". It is NOT the whine layer:
     the whine is the shaft, low and mechanical, and the whistle is the air
     screaming through the compressor inducer on its way past the blades.

     Measured turbocharger acoustics say two things that decide how this is
     built. First, blade-pass tonal noise lives high — a few kHz, up to 10 on
     a big wheel, with broadband lift across 4-12kHz. Second, and much more
     useful: a compressor is TONAL at its design point and BROADBAND near
     surge. So the same layer covers both jobs — hard, tight and pitched when
     the engine is pulling; wide and airy when the throttle shuts and the
     compressor falls off its map. One layer, two characters, and the
     crossfade between them is a physical fact rather than an effect.

     `voices` is the "different sound at different revs" part, and it is a
     plain list: each entry is what the whistle IS at that shaft speed, and
     the layer crossfades between the two that bracket it. Add entries to
     make the character change more often; the blend never steps. */
  whistle: {
    level: 0.055,
    load: 0.6,          // how much of it hangs off the pedal vs. the shaft
    wobble: 9,          // cents of drift — a whistle that never wavers is a synth
    voices: [
      // at    the shaft speed this voice describes
      // hz    where the whistle sits
      // tone  0 = pure air, 1 = pure blade tone
      // q     how tight the band is. Loose and breathy → hard and focused.
      // lvl   how loud this voice is, before level/load scaling
      { at: 0.00, hz:  520, tone: 0.16, q:  2.6, lvl: 0.10 },   // faint. just there.
      { at: 0.30, hz: 1180, tone: 0.42, q:  5.5, lvl: 0.34 },   // part throttle
      { at: 0.62, hz: 2500, tone: 0.64, q:  9.0, lvl: 0.76 },   // coming on song
      { at: 0.90, hz: 4000, tone: 0.82, q: 12.5, lvl: 1.00 },   // full boost: hard
    ],
    surge: 0.75,        // how far toward broadband a lift drags it (see above)
  },
  /* --- the spool ---
     The smooth high note that sits OVER the engine under hard acceleration
     and is not there at any other time. It is deliberately not the whistle:
     the whistle is always present to some degree, and this only shows up when
     the engine is being asked for everything, which is what makes flooring it
     feel like an event rather than like turning a volume knob. */
  spool:   { level: 0.028, hz: [1800, 4200], q: 0.9 },
  release: { level: 1, sigh: 1, chuff: 0.35, tail: 1, psh: 1, chirp: 1,
             duck: 1,          // how hard a release pulls the engine down
             shift: 0.8,       // an upshift's release, as a fraction of a lift's
             shiftAt: 0.3 },   // …and the boost above which a shift gets one at all
  /* --- where the turbo plumbing actually is ---
     Every other one-shot in this file gets quieter when you seal the cabin,
     because almost everything else in a car is outside it: the exhaust is
     under the floor and out the back, the tyres are at the corners, the wind
     is on the glass. Turbochargers are not. On a mid-engined car they and
     their charge pipes are bolted to the bulkhead a foot behind your head,
     and the bypass valves vent into the engine bay, which IS the cabin's back
     wall. Sealing yourself in cuts the exhaust and the wind and leaves the
     plumbing — so the turbo gets LOUDER inside, not quieter, and it is the
     one thing in the car that does. */
  cabin:   1.75,
  /* …but the STEADY layers get a gentler lift than the one-shots do, and
     they have to. A blow-off is an event: it can be as loud as the engine for
     a fifth of a second and the mix simply makes room for it. The rush and
     the whistle are continuous, and if they get the same 1.75 they stop being
     a layer over the engine and start being a curtain in front of it. So the
     bang gets the full amount and the wash gets about half of it. */
  cabinCont: 1.35,
  /* A stage is a turbo, or a pair of them:
       at/span   the rev window its control valve opens across
       sat       revs at which its turbine has all the exhaust it can use —
                 small wheel, low number; big wheel, high one
       share     how much of total boost it is responsible for
       inertia   how heavy it is. Slows the spool AND lengthens the coast,
                 and the coast is what you hear after a lift.
       whineHz / whineMul / breathHz   its own voice */
  stages:  [{ at: 1200, span: 2000, sat: 3000, share: 0.6, inertia: 0.6, whineHz: 1400, whineMul: 1, breathHz: 560 },
            { at: 3600, span: 2200, sat: 5400, share: 0.4, inertia: 0.9, whineHz: 1850, whineMul: 1.15, breathHz: 720 }],
};

/* this car's rig, with every default filled in */
function rigOf(car) {
  const r = (car || CC).turboRig;
  if (!r) return null;
  if (r._def) return r;                       // memoised — this runs every frame
  const merged = {
    ...RIG_DEF, ...r,
    whine:   { ...RIG_DEF.whine,   ...(r.whine   || {}) },
    intake:  { ...RIG_DEF.intake,  ...(r.intake  || {}) },
    breath:  { ...RIG_DEF.breath,  ...(r.breath  || {}) },
    hiss:    { ...RIG_DEF.hiss,    ...(r.hiss    || {}) },
    spool:   { ...RIG_DEF.spool,   ...(r.spool   || {}) },
    release: { ...RIG_DEF.release, ...(r.release || {}) },
    whistle: { ...RIG_DEF.whistle, ...(r.whistle || {}),
               // voices are replaced wholesale, not merged element-wise: a car
               // that describes its own whistle means all of it
               voices: ((r.whistle && r.whistle.voices) || RIG_DEF.whistle.voices)
                 .slice().sort((a, b) => a.at - b.at) },
    stages:  (r.stages || RIG_DEF.stages).map(s => ({ ...RIG_DEF.stages[0], ...s })),
    _def: true,
  };
  Object.assign(r, merged);
  return r;
}

/* the rig's whole observable state, zeroed. Everything the audio side reads
   comes from here, so there is exactly one place to look. */
function turboRigReset() {
  S.tShaft = null;      // per-stage shaft speed, 0..1
  S.tSpd = 0;           // combined shaft speed, 0..1 — drives whine & rush
  S.tStage = 0;         // how much of stage two is in it, 0..1
  S.tRise = 0;          // d(boost)/dt, smoothed — "it is BUILDING"
  S.tLiftT = 99;        // seconds since the last lift
  S.tLiftBoost = 0;     // how much boost there was at the instant of the lift
  S.tRelease = 0;       // release envelope, 0..1, decays after a lift
  S._rigEff = 0;        // previous pedal position; do not inherit another car
  S._rigShifting = false;
  S._rigHold = 0;
  S._shiftDir = 0;
}

/* one physics step of the rig. Owns S.boost for cars that have one. */
function turboRigStep(dt, eff) {
  const R = rigOf(CC);
  if (!R) return;
  const st = R.stages;
  if (!S.tShaft || S.tShaft.length !== st.length) { turboRigReset(); S.tShaft = st.map(() => 0); }

  /* A twin-clutch upshift cuts fuel for fifty milliseconds. The driver's foot
     never moved, and neither did anything in the intake tract — the
     compressors do not know a gear changed. So the rig is driven by the
     PEDAL through a shift, not by the fuel cut, and no release fires. This is
     the difference between a car that stays on boost through the gears and
     one that has to re-spool four times on the way to the top of third. */
  const shifting = S.shiftCut > 0 || S.cutTimer > 0;
  const pedal = clamp(S.in.gas, 0, 1);
  const air = shifting ? Math.max(eff, pedal * 0.9) : eff;

  // how hard the engine is breathing at all: a closed throttle still pumps a
  // little, which is `windmill`, and is why the shafts never actually stop
  // while the engine is running
  const pump = R.windmill + air * (1 - R.windmill);

  let charge = 0, spd = 0, wsum = 0;
  for (let i = 0; i < st.length; i++) {
    const s = st[i];
    /* Exhaust flow available to THIS stage, and the saturation point is per
       stage because it is a property of the turbine, not of the engine. A
       small wheel has all the exhaust it can use by two and a half thousand
       rpm and is against its wastegate from there to the limiter — that is
       what a small turbo is FOR, and it is where the low-down shove comes
       from. A big wheel is still filling up at five. Using one global flow
       curve for both makes the small pair behave like the big pair, and the
       car loses the bottom end that is the entire point of staging it. */
    const flow = clamp(S.rpm / s.sat, 0, 1);
    // the stage's control valve opening to the exhaust stream — a ramp, not
    // a switch, and a long one, so the stage arrives as a swell
    const gate = clamp((S.rpm - s.at) / s.span, 0, 1);
    const tgt = flow * pump * (gate * gate * (3 - 2 * gate));     // smoothstep
    const w = S.tShaft[i];
    // accelerating a turbine is violent; slowing one down is bearing drag and
    // nothing else. Big wheels do both more slowly.
    const rate = (tgt > w ? R.spoolUp : R.coast) / s.inertia;
    S.tShaft[i] = w + (tgt - w) * Math.min(1, rate * dt);
    charge += S.tShaft[i] * s.share;
    spd += S.tShaft[i] * s.share; wsum += s.share;
  }
  S.tSpd = wsum > 0 ? clamp(spd / wsum, 0, 1.2) : 0;
  // how much of what you are hearing is the second pair. Not a flag, not an
  // event — a ratio, which is what stops the handover reading as a whoosh.
  S.tStage = st.length > 1
    ? clamp(S.tShaft[1] * st[1].share / Math.max(0.001, charge), 0, 1)
    : 0;

  // boost is what actually reaches the manifold: compressed air behind a
  // throttle plate. The plate is the fast part of the system and the shaft is
  // the slow part, and keeping them separate is the whole point.
  const plate = clamp(air * 1.12, 0, 1);
  const tgt = clamp(charge, 0, 1) * plate;
  const prev = S.boost;
  S.boost += (tgt - S.boost) * Math.min(1, (tgt > S.boost ? R.fill : R.bleed) * dt);
  // smoothed rate of change — the audio side uses it to lean on the intake
  // while pressure is actively climbing, which is what "coming onto boost"
  // sounds like as opposed to "already on boost"
  S.tRise += (clamp((S.boost - prev) / Math.max(dt, 0.001), 0, 4) - S.tRise)
             * Math.min(1, 6 * dt);

  /* --- the lift ---
     Not an on/off event. How much comes out of the bypass valves is exactly
     how much pressure was in the pipes when the plate shut, so a lift off a
     part-throttle cruise is a tick and a lift off full boost at 6000rpm is
     the whole thing. And the whine that follows it is not scripted at all —
     the shafts are still spinning, `coast` is slow, and the whine layer is
     already following shaft speed, so it decays because the model says so. */
  const wasOn = S._rigEff === undefined ? 0 : S._rigEff;
  const drop = wasOn - pedal;
  S._rigHold = Math.max(0, (S._rigHold || 0) - dt);
  /* It is a PARTIAL lift as well as a full one. Going from flat to a third
     throttle in the middle of a corner still shuts most of the plate and
     still puts most of that pressure out through the valves, and a model
     that only listens for pedal-to-zero misses every one of them. So the
     trigger is how far the foot moved and how much pressure it moved away
     from — and the result is scaled by both, which is what makes a small
     lift a tick and a big one an event. The hold stops a jittery pedal
     firing a burst of them. */
  if (!shifting && drop > 0.22 && pedal < 0.6 && prev > 0.03 && S._rigHold <= 0) {
    const amt = clamp(prev * clamp(drop / 0.75, 0.25, 1), 0, 1);
    S.tLiftBoost = amt;
    S.tLiftT = 0;
    S.tRelease = amt;
    S._rigHold = 0.18;
    sfxTurboRelease(amt, S.tSpd, R);
    /* …and, on a car that has a recording of this, the real thing over the
       top of it — but only up near the limiter, where a lift is actually the
       big event. Coming off it at 2000rpm dumps a fraction of the pressure
       and the synthesized chuff already tells that story properly. */
    const smp = R.sample;
    if (smp && smp.releaseAt !== undefined && S.rpm >= ENG.max * smp.releaseAt)
      sfxTurboSample("release", amt, smp.releaseGain === undefined ? 1 : smp.releaseGain);
    // …and the surge, for a rig with no bypass capacity to speak of
    const fl = CC.flutter === true ? 1 : (CC.flutter || 0);
    if (fl > 0.05 && amt > 0.4) sfxFlutter(amt * 0.8, fl);
  }
  /* --- the gearbox's contribution ---
     An upshift at real boost is not a small event. The clutches hand over,
     the compressors unload against a closed-ish path, and the valves crack —
     and on a quad-turbo car that is one of the best noises it makes, on every
     single shift. So above a useful amount of boost this fires the FULL
     release rather than the little chuff, at a scaled-down amount so it reads
     as "same mechanism, less of it" rather than as a different sound. Below
     that, it stays a chuff, because a gearchange at part throttle should not
     announce itself. */
  if (shifting && !S._rigShifting && prev > 0.12 && S._shiftDir >= 0) {
    // Some cars make their signature bypass-valve sound only in the lower
    // gears, where a redline upshift is still carrying maximum charge-pipe
    // pressure. `shiftThrough: 4` means the three events into 2nd, 3rd and
    // 4th. Past that the normal, smaller chirp remains instead of making
    // every motorway ratio sound like a launch run.
    // Automatic shifts have already installed the destination ratio here;
    // delayed paddle shifts are still displaying the source ratio until the
    // DCT timer lands. Normalize both paths to the gear being shifted INTO.
    const shownGear = S.mode === "auto" ? S.autoGear : S.gear;
    const destGear = S.mode === "manual" && typeof shownGear === "number"
      ? shownGear + (S._shiftDir > 0 ? 1 : 0) : shownGear;
    const through = R.release.shiftThrough;
    const signatureShift = typeof destGear === "number" && destGear >= 2
                        && (through === undefined || destGear <= through);
    const redAt = R.release.redlineAt === undefined ? 0.9 : R.release.redlineAt;
    const red = clamp((S.rpm / ENG.max - redAt) / Math.max(0.01, 1 - redAt), 0, 1);
    const redLift = 1 + red * ((R.release.redlineLift || 1) - 1);
    if (prev >= (R.release.shiftAt === undefined ? 0.3 : R.release.shiftAt)) {
      const shiftScale = R.release.shift === undefined ? 0.8 : R.release.shift;
      const amt = clamp(prev * shiftScale * (signatureShift ? redLift : 0.72), 0, 1);
      S.tRelease = Math.max(S.tRelease, amt * 0.8);
      sfxTurboRelease(amt, S.tSpd, R);
      // the recorded shift bang, on the ratios that earn it — 1→2, 2→3, 3→4
      const smp = R.sample;
      if (smp && smp.shiftGears && typeof destGear === "number"
          && smp.shiftGears.indexOf(destGear) >= 0)
        sfxTurboSample("shift", amt, smp.shiftGain === undefined ? 1 : smp.shiftGain);
      S._rigHold = 0.1;          // don't let the lift trigger double up on it
    } else {
      sfxTurboChirp(prev, R);
    }
  }
  S._rigShifting = shifting;
  S._rigEff = pedal;
  S.tLiftT = pedal < 0.12 ? S.tLiftT + dt : 0;
  /* the release envelope dies on its own clock — faster if you get back on it,
     because reopening the throttle is what stops air coming out of the valves.

     This envelope is what the rush and the whistle's surge ride, so it is the
     other half of "how long does the release last": the one-shot can sigh for
     two seconds and it will still sound short if the continuous layers have
     already snapped back to their on-boost state underneath it. `decay` lets a
     car with a lot of plumbing hold it open longer. */
  const rd = R.release.decay === undefined ? 1.6 : R.release.decay;
  S.tRelease *= Math.max(0, 1 - (pedal > 0.25 ? 7 : rd) * dt);
}

/* engine off / not a rig car: let the shafts wind down instead of snapping
   to zero, so shutting the engine down under boost still sounds like metal
   coming to rest rather than a mute button */
function turboRigIdle(dt) {
  if (!S.tShaft) return;
  for (let i = 0; i < S.tShaft.length; i++) S.tShaft[i] *= Math.max(0, 1 - 1.1 * dt);
  S.tSpd *= Math.max(0, 1 - 1.1 * dt);
  S.tRelease *= Math.max(0, 1 - 2.5 * dt);
}

/* ---------------------------------------------------------------
   the rig's audio chain
   ---------------------------------------------------------------
   Four independent layers, each with its own gain, each driven by a
   different quantity, each adjustable on its own from the car's config:

     whine    the compressors themselves. Follows SHAFT SPEED, not rpm, and
              that one decision is most of what makes it feel mechanical
              rather than like a synthesizer tracking the tacho.
     intake   air being swallowed. Follows the throttle and the rate of
              pressure rise — the sound of an engine eating.
     breath   low charge-air rush, the "zohh" through the pipes and the
              intercoolers. Follows shaft speed and boost together.
     hiss     the fine high-frequency top of the airflow. First thing to go
              with distance, which is what makes distance read as distance.

   All four hang off one bus so the whole system can be balanced against the
   engine in one move. */
function buildTurboRig(ctx) {
  const R = {};
  AU.rig = R;
  R.out = ctx.createGain(); R.out.gain.value = 1;
  R.out.connect(AU.engMech);

  // --- whine ---
  // A single sine is a dog whistle and reads as electronic. A real compressor
  // is a wheel with a specific blade count in a housing that rings: a
  // fundamental, a hard octave, a bit of third, and — critically — a second
  // detuned copy of the fundamental so the two beat slowly against each
  // other. Nothing in a turbocharger is perfectly balanced.
  R.whHp = ctx.createBiquadFilter(); R.whHp.type = "highpass";
  R.whHp.frequency.value = 400; R.whHp.Q.value = 0.7;
  R.whG = ctx.createGain(); R.whG.gain.value = 0;
  R.whHp.connect(R.whG); R.whG.connect(R.out);

  // the wobble: a slow, shallow pitch drift shared across every wheel. Air is
  // turbulent, the shafts hunt, and a whine that holds a dead-steady pitch is
  // the single biggest tell that it came out of an oscillator.
  R.wob = ctx.createOscillator(); R.wob.type = "sine"; R.wob.frequency.value = 5.5;
  R.wobG = ctx.createGain(); R.wobG.gain.value = 0;      // in cents
  R.wob.connect(R.wobG); R.wob.start();
  // …and a second, much slower one, so the wobble itself isn't periodic
  R.wob2 = ctx.createOscillator(); R.wob2.type = "sine"; R.wob2.frequency.value = 0.73;
  R.wob2G = ctx.createGain(); R.wob2G.gain.value = 0;
  R.wob2.connect(R.wob2G); R.wob2.start();

  // one bank per stage — separate gains, so the stages fade against each
  // other instead of being switched between. Three banks is enough for any
  // rig anyone is going to write; spare ones sit at zero and cost nothing.
  R.banks = [0, 1, 2].map(() => {
    const g = ctx.createGain(); g.gain.value = 0;
    g.connect(R.whHp);
    const oscs = [["sine", 1, 0.62], ["sine", 1.006, 0.44],
                  ["triangle", 2.0, 0.15], ["sine", 3.01, 0.05]]
      .map(([type, mult, lvl]) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = 1200;
        const og = ctx.createGain(); og.gain.value = lvl;
        o.connect(og); og.connect(g);
        R.wobG.connect(o.detune); R.wob2G.connect(o.detune);
        o.start();
        return { o, mult };
      });
    return { g, oscs };
  });

  // --- intake: the engine swallowing ---
  // Broad, low-mid, resonant. Not hiss — hiss is a leak. This is the sound of
  // a very large volume of air being dragged through a duct, so it lives
  // between about 200Hz and 1kHz and it has a body to it.
  const isrc = ctx.createBufferSource(); isrc.buffer = AU.noiseBuf;
  isrc.loop = true; isrc.playbackRate.value = 0.85;
  R.inBp = ctx.createBiquadFilter(); R.inBp.type = "bandpass";
  R.inBp.frequency.value = 340; R.inBp.Q.value = 0.55;
  R.inLp = ctx.createBiquadFilter(); R.inLp.type = "lowpass"; R.inLp.frequency.value = 1800;
  R.inG = ctx.createGain(); R.inG.gain.value = 0;
  isrc.connect(R.inBp); R.inBp.connect(R.inLp); R.inLp.connect(R.inG);
  R.inG.connect(R.out); isrc.start();

  // --- breath: charge air moving through the pipes ---
  const bsrc = ctx.createBufferSource(); bsrc.buffer = AU.noiseBuf;
  bsrc.loop = true; bsrc.playbackRate.value = 1.02;
  R.brBp = ctx.createBiquadFilter(); R.brBp.type = "bandpass";
  R.brBp.frequency.value = 600; R.brBp.Q.value = 0.6;
  R.brG = ctx.createGain(); R.brG.gain.value = 0;
  bsrc.connect(R.brBp); R.brBp.connect(R.brG); R.brG.connect(R.out); bsrc.start();

  // --- hiss: the detail on top ---
  const hsrc = ctx.createBufferSource(); hsrc.buffer = AU.noiseBuf;
  hsrc.loop = true; hsrc.playbackRate.value = 1.6;
  R.hsBp = ctx.createBiquadFilter(); R.hsBp.type = "bandpass";
  R.hsBp.frequency.value = 3200; R.hsBp.Q.value = 0.5;
  R.hsG = ctx.createGain(); R.hsG.gain.value = 0;
  hsrc.connect(R.hsBp); R.hsBp.connect(R.hsG); R.hsG.connect(R.out); hsrc.start();

  /* --- whistle ---
     Two sources into one gain, and the balance between them is the whole
     trick. A pure oscillator is the cartoon whistle everybody complains
     about; pure filtered noise is a steam leak. A real compressor is both at
     once — a blade tone sitting inside a band of rushing air — and the ratio
     between them is what changes with operating point. High-Q noise gives
     the band; the oscillators give the note; `tone` crossfades them. */
  R.wsG = ctx.createGain(); R.wsG.gain.value = 0;      // the layer's master
  R.wsG.connect(R.out);

  // the air: one narrow, steep band. Two poles in series, because a single
  // biquad at Q 12 is still too wide to read as a whistle rather than a hiss.
  const wsrc2 = ctx.createBufferSource(); wsrc2.buffer = AU.noiseBuf;
  wsrc2.loop = true; wsrc2.playbackRate.value = 1.35;
  R.wsBp = ctx.createBiquadFilter(); R.wsBp.type = "bandpass";
  R.wsBp.frequency.value = 1200; R.wsBp.Q.value = 6;
  R.wsBp2 = ctx.createBiquadFilter(); R.wsBp2.type = "bandpass";
  R.wsBp2.frequency.value = 1200; R.wsBp2.Q.value = 6;
  R.wsNG = ctx.createGain(); R.wsNG.gain.value = 0;
  wsrc2.connect(R.wsBp); R.wsBp.connect(R.wsBp2); R.wsBp2.connect(R.wsNG);
  R.wsNG.connect(R.wsG); wsrc2.start();

  // the blade tone: fundamental plus a thin second, and a little third for
  // the hard edge at full boost. Both wobble LFOs are wired in, so the
  // whistle drifts with the shaft instead of sitting on a grid.
  R.wsTG = ctx.createGain(); R.wsTG.gain.value = 0;
  R.wsTG.connect(R.wsG);
  R.wsOscs = [["sine", 1, 0.5], ["triangle", 2, 0.10], ["sine", 0.5, 0.18]]
    .map(([type, mult, lvl]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = 1200;
      const og = ctx.createGain(); og.gain.value = lvl;
      o.connect(og); og.connect(R.wsTG);
      R.wobG.connect(o.detune); R.wob2G.connect(o.detune);
      o.start();
      return { o, mult };
    });

  /* --- spool: the smooth high note over the top, hard acceleration only ---
     Sine-led and high-passed so it adds altitude to the mix without adding
     any weight — it should sit ABOVE the engine, not inside it. */
  R.spHp = ctx.createBiquadFilter(); R.spHp.type = "highpass";
  R.spHp.frequency.value = 1600; R.spHp.Q.value = 0.6;
  R.spG = ctx.createGain(); R.spG.gain.value = 0;
  R.spHp.connect(R.spG); R.spG.connect(R.out);
  R.spOscs = [["sine", 1, 0.55], ["sine", 1.004, 0.32], ["triangle", 2, 0.10]]
    .map(([type, mult, lvl]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = 3000;
      const og = ctx.createGain(); og.gain.value = lvl;
      o.connect(og); og.connect(R.spHp);
      R.wobG.connect(o.detune);
      o.start();
      return { o, mult };
    });
}

/* Which whistle this shaft speed calls for. The voices are waypoints and
   this is the crossfade between the two that bracket the current speed —
   so the character moves continuously and a car can have as many distinct
   "versions" of its whistle as it cares to write down. */
function whistleVoiceAt(spd, voices) {
  const n = voices.length;
  if (n === 1) return voices[0];
  let i = 0;
  while (i < n - 2 && spd >= voices[i + 1].at) i++;
  const a = voices[i], b = voices[i + 1];
  const span = b.at - a.at;
  const u = span > 1e-6 ? clamp((spd - a.at) / span, 0, 1) : 0;
  // smoothstep, so the handover between two voices has no corner in it
  const s = u * u * (3 - 2 * u);
  const mix = (p) => a[p] + (b[p] - a[p]) * s;
  return { hz: mix("hz"), tone: mix("tone"), q: mix("q"), lvl: mix("lvl") };
}

/* Per-frame drive. `env` carries what the audio tick already worked out:
   where you're standing, how far away the car is, and the Doppler factor. */
function turboRigTick(t, k, env) {
  const R = AU.rig;
  if (!R) return;
  const C = rigOf(CC);
  const live = C && env.running && !env.mute;
  if (!live) {
    R.whG.gain.setTargetAtTime(0, t, 0.12);
    R.inG.gain.setTargetAtTime(0, t, 0.12);
    R.brG.gain.setTargetAtTime(0, t, 0.12);
    R.hsG.gain.setTargetAtTime(0, t, 0.12);
    R.wsG.gain.setTargetAtTime(0, t, 0.12);
    R.spG.gain.setTargetAtTime(0, t, 0.12);
    return;
  }

  const st = C.stages;
  const spd = clamp(S.tSpd || 0, 0, 1.15);
  const boost = clamp(S.boost || 0, 0, 1.1);
  const load = env.load;
  const dop = env.dop, hT = env.hT, stW = env.stW, flyLp = env.flyLp;
  // distance eats the top of everything before it touches the bottom, so the
  // whine and the hiss are attenuated by it and the low rush very nearly
  // isn't. This is the whole reason a car half a mile away still sounds huge
  // and doesn't sound sharp.
  const near = clamp(flyLp, 0, 1);
  const hiKill = 0.25 + 0.75 * near * near;
  // sealing the cabin puts you INSIDE with the plumbing — see `cabin` in
  // RIG_DEF for why the turbo is the one thing that gets louder in here
  const cab = inCabin() ? (C.cabinCont || 1) : 1;

  // --- whine: each stage sings its own note, at its own shaft speed ---
  const W = C.whine;
  R.wobG.gain.setTargetAtTime(W.wobble * 22 * (0.35 + spd * 0.65), t, 0.15);
  R.wob2G.gain.setTargetAtTime(W.wobble * 14, t, 0.3);
  R.wob.frequency.setTargetAtTime(W.wobbleHz * (0.7 + spd * 0.6), t, 0.2);
  for (let i = 0; i < R.banks.length; i++) {
    const s = st[Math.min(i, st.length - 1)];
    const w = clamp((S.tShaft && S.tShaft[i]) || 0, 0, 1.15);
    // pitch tracks THIS shaft. A turbo that is coasting down is a turbo whose
    // note is falling, whatever the engine is doing — which is precisely the
    // sound you want after a lift.
    const hz = (260 + w * s.whineHz * 1.55) * (W.hzMul || 1) * dop;
    for (const o of R.banks[i].oscs)
      o.o.frequency.setTargetAtTime(Math.min(12000, Math.max(60, hz * o.mult)), t, k);
    // level: quiet off boost, climbing hard with shaft speed, and leaning on
    // load so a shaft freewheeling on the overrun is audible but not shouting
    const lvl = i >= st.length ? 0
      : Math.pow(w, 1.35) * s.whineMul * (0.45 + load * 0.55) * s.share * 2;
    R.banks[i].g.gain.setTargetAtTime(clamp(lvl, 0, 2), t, 0.06);
  }
  R.whHp.frequency.setTargetAtTime(W.hp, t, 0.2);
  // the top of a whine is directional and fragile: it barely survives the
  // bulkhead and it does not survive distance at all
  R.whG.gain.setTargetAtTime(W.level * hT * stW * hiKill * cab, t, 0.05);

  // --- intake ---
  // Hangs off the PEDAL, plus a lean on how fast pressure is climbing. That
  // second term is what makes flooring it at 2000rpm sound different from
  // holding it flat at 6000 — the same throttle, but only one of them is the
  // sound of an engine getting greedier by the moment.
  const I = C.intake;
  const revs = clamp(S.rpm / (ENG.max || 7000), 0, 1);
  /* The rise term is the whole "it is COMING ON" sound, and it is worth its
     own two knobs rather than the hard-coded pair it used to be: `rise` is how
     hard climbing pressure leans on the induction noise, `riseMax` is how far
     that lean is allowed to go. On a car with four compressors filling eight
     litres, the swell as they light is one of the defining noises it makes and
     it wants to be a long way up from the generic default. */
  const rise = Math.min(I.riseMax === undefined ? 0.35 : I.riseMax,
                        S.tRise * (I.rise === undefined ? 0.22 : I.rise));
  const inLvl = (load * I.load + revs * I.rev + rise) * (0.5 + boost * 0.7);
  R.inBp.frequency.setTargetAtTime((I.hz + revs * 620 + load * 220) * dop, t, k);
  R.inBp.Q.setTargetAtTime(I.q, t, 0.2);
  R.inLp.frequency.setTargetAtTime((1400 + revs * 2600) * (0.4 + 0.6 * near), t, 0.1);
  R.inG.gain.setTargetAtTime(clamp(inLvl, 0, 2.5) * I.level * env.hIn * cab, t, 0.05);

  // --- breath: shaft speed moving air, coloured by how much of it is
  //     actually being compressed into the engine right now ---
  const B = C.breath;
  // the rush sits wherever the air is actually coming from: a weighted mean
  // of the stages' bands, so as the big pair takes over the whole rush moves
  // up with it. One sound getting bigger, not two sounds crossfading.
  let bNum = 0, bDen = 0;
  for (let i = 0; i < st.length; i++) {
    const w = clamp((S.tShaft && S.tShaft[i]) || 0, 0, 1.2) * st[i].share;
    bNum += st[i].breathHz * w; bDen += w;
  }
  const bHz = bDen > 0.02 ? bNum / bDen : B.boostHz;
  R.brBp.frequency.setTargetAtTime(clamp((bHz + boost * 420) * dop, 120, 4000), t, k);
  R.brBp.Q.setTargetAtTime(B.q, t, 0.2);
  // the release rides here too: after a lift the shafts are still turning and
  // still pushing air round the bypass loop, and that is a rush, not a tone.
  // …and so does the RISE: the charge-air rush is at its loudest not when
  // boost is high but while it is still climbing, because that is when the
  // compressors are moving the most air relative to what the engine is
  // swallowing. Holding it flat at full boost is a steady state; the swell
  // getting there is the event, and it should be the louder of the two.
  const bRise = Math.min(B.riseMax === undefined ? 0.5 : B.riseMax,
                         S.tRise * (B.rise === undefined ? 0 : B.rise));
  R.brG.gain.setTargetAtTime(
    (Math.pow(spd, 1.15) * (0.35 + load * 0.65) + S.tRelease * 0.55 + bRise)
      * B.level * hT * cab,
    t, 0.05);

  // --- hiss ---
  const H = C.hiss;
  R.hsBp.frequency.setTargetAtTime((H.hz + spd * 1500) * dop, t, k);
  R.hsG.gain.setTargetAtTime(
    (Math.pow(spd, 1.6) * (0.3 + load * 0.7) + S.tRelease * 0.4) * H.level * hT * hiKill * cab,
    t, 0.06);

  /* --- whistle ---
     Pitch tracks shaft speed and NOT rpm, so it keeps climbing while the
     engine holds station on a boost plateau, and it keeps falling after a
     lift while the engine is still turning. That is the difference between a
     turbo and an air-raid siren bolted to the tacho. */
  const V = C.whistle;
  const voice = whistleVoiceAt(spd, V.voices);
  // Near surge the compressor stops making a tone and starts making noise —
  // which is what a lift actually sounds like, and it means the sharp airy
  // "pshhh" and the hard steady whistle are the same layer in two states.
  const surge = clamp(S.tRelease * V.surge, 0, 0.9);
  const tone = clamp(voice.tone * (1 - surge), 0, 1);
  const wsHz = clamp(voice.hz * dop, 90, 13000);
  R.wsBp.frequency.setTargetAtTime(wsHz, t, k);
  R.wsBp2.frequency.setTargetAtTime(wsHz, t, k);
  // the band tightens as it comes on song, and opens right up on a lift
  const wq = Math.max(0.7, voice.q * (1 - surge * 0.8));
  R.wsBp.Q.setTargetAtTime(wq, t, 0.08);
  R.wsBp2.Q.setTargetAtTime(wq, t, 0.08);
  for (const o of R.wsOscs)
    o.o.frequency.setTargetAtTime(Math.min(15000, wsHz * o.mult), t, k);
  // A narrow band throws away most of the noise power, so the air side needs
  // a lot more raw gain than the tone side to arrive at the same loudness.
  R.wsNG.gain.setTargetAtTime((1 - tone) * 2.6, t, 0.05);
  R.wsTG.gain.setTargetAtTime(tone * 0.85, t, 0.05);
  // …and it stays faintly audible off the throttle, because a spinning
  // compressor is never actually silent
  const wsLvl = voice.lvl * (1 - V.load + load * V.load) + S.tRelease * 0.5;
  R.wsG.gain.setTargetAtTime(clamp(wsLvl, 0, 2) * V.level * hT * stW * hiKill * cab, t, 0.05);

  /* --- spool ---
     Only under hard acceleration, and it wants BOTH conditions: a wide
     throttle and pressure actually in the pipes. Cruising at high boost on a
     part throttle does not get it, and neither does flooring it at 1200rpm
     with nothing behind the plate. It is the sound of the engine being asked
     for everything and having it available. */
  const SP = C.spool;
  const hard = clamp((load - 0.55) / 0.4, 0, 1) * clamp((boost - 0.25) / 0.5, 0, 1);
  const spHz = (SP.hz[0] + (SP.hz[1] - SP.hz[0]) * Math.pow(spd, 1.25)) * dop;
  for (const o of R.spOscs)
    o.o.frequency.setTargetAtTime(Math.min(15000, spHz * o.mult), t, k);
  R.spHp.frequency.setTargetAtTime(clamp(spHz * 0.6, 300, 8000), t, 0.1);
  R.spG.gain.setTargetAtTime(
    hard * Math.pow(spd, 1.2) * SP.level * hT * stW * hiKill * cab, t, 0.07);
}

/* ---- the lift ----
   Three things leave the car when the plate shuts, and how much of each
   depends entirely on how much pressure was in the pipes:

     the sigh    bypass valves opening and the charge air going back round to
                 the compressor inlet. Soft, broadband, falling. This is the
                 one that is always there.
     the chuffs  a couple of soft slams as the column of air reverses. Only
                 shows up with real pressure behind it, and it is short.
     the tail    the last of it leaving, under everything, for about a second.

   The decaying whine that follows is NOT here — that comes out of the shaft
   model for free, because the shafts are still spinning. Which is the point.

   `boost` is 0..1 at the instant of the lift. Below about a fifth of it this
   is a tick you barely notice, which is correct: a small lift is a small
   sound, and the reason arcade turbo audio is exhausting is that it isn't. */
function sfxTurboRelease(boost, spd, R) {
  if (!AU.ready) return;
  const C = R || rigOf(CC);
  if (!C) return;
  const R2 = C.release;
  const ctx = AU.ctx, t = ctx.currentTime;
  // under the bonnet and behind the bulkhead: loud over the wing, muted from
  // the driver's seat with the glass up, and mostly gone at distance
  const pos = ear().turbo * (inCabin() ? (C.cabin || 1) : 1) * (stockOn() ? 0.75 : 1);
  const k = clamp(boost, 0, 1) * R2.level * pos;
  if (k < 0.015) return;
  const bus = AU.sfx;
  // get the engine out of the way — this, not the gain above, is what makes
  // the release audible over a mix that is already hitting the limiter
  const dk = clamp(boost, 0, 1) * (R2.duck === undefined ? 1 : R2.duck);
  if (dk > 0.05) duckBed(1 - dk * 0.62, 0.05 + dk * 0.05, 0.26 + dk * 0.14);

  /* --- the "pshhh" ---
     The transient. A valve snapping open against real pressure is a fast,
     bright, tight crack of air, and it is SHORT — a couple of hundred
     milliseconds at most, not the half-second whoosh that every arcade game
     uses. Everything about it here is aimed at "expensive": a hard attack so
     it reads as a mechanism rather than a fade-in, a high band so it cuts
     over the engine instead of muddying it, a fast exponential collapse so it
     is gone before you can decide it was silly, and a downward sweep because
     the escaping air loses velocity as the pressure equalises.

     Its length and brightness both scale with how much boost there was, which
     is what stops a part-throttle lift sounding like a full one. */
  const pd = 0.10 + k * 0.13;                    // 100-230ms. Short on purpose.
  const p = ctx.createBufferSource(); p.buffer = AU.noiseBuf;
  p.playbackRate.value = 1.5 + Math.random() * 0.25;
  const pf = ctx.createBiquadFilter(); pf.type = "bandpass";
  pf.Q.value = 1.5 + k * 1.2;                    // tighter with more pressure
  pf.frequency.setValueAtTime(2600 + k * 2900, t);
  pf.frequency.exponentialRampToValueAtTime(1100 + k * 700, t + pd);
  // a little high-pass under it so nothing woolly survives — this layer is
  // all edge, and the body of the release is the sigh below
  const php = ctx.createBiquadFilter(); php.type = "highpass";
  php.frequency.value = 1500; php.Q.value = 0.7;
  const pg = ctx.createGain();
  pg.gain.setValueAtTime(0.0001, t);
  // This is the loudest single event the turbo system produces, and it is
  // meant to be. A bypass valve dumping 18psi is a bang of air, and every
  // time this number has been "tasteful" the release has vanished under the
  // engine — which is the one failure mode that matters, because the release
  // is the whole point of a turbo car.
  pg.gain.linearRampToValueAtTime(0.38 * k * R2.psh, t + 0.004);   // 4ms: a snap
  pg.gain.exponentialRampToValueAtTime(0.0001, t + pd);
  p.connect(pf); pf.connect(php); php.connect(pg); pg.connect(bus);
  p.start(t); p.stop(t + pd + 0.03);

  // …and a second, lower band under the crack. The high band alone is a
  // hiss; what makes it read as PRESSURE leaving rather than air escaping is
  // a bit of body at the bottom of it, arriving at the same instant.
  const pb = ctx.createBufferSource(); pb.buffer = AU.noiseBuf;
  pb.playbackRate.value = 0.8;
  const pbf = ctx.createBiquadFilter(); pbf.type = "bandpass"; pbf.Q.value = 1.1;
  pbf.frequency.setValueAtTime(700 + k * 500, t);
  pbf.frequency.exponentialRampToValueAtTime(260, t + pd * 1.3);
  const pbg = ctx.createGain();
  pbg.gain.setValueAtTime(0.0001, t);
  pbg.gain.linearRampToValueAtTime(0.19 * k * R2.psh, t + 0.006);
  pbg.gain.exponentialRampToValueAtTime(0.0001, t + pd * 1.3);
  pb.connect(pbf); pbf.connect(pbg); pbg.connect(bus);
  pb.start(t); pb.stop(t + pd * 1.3 + 0.03);

  // --- the sigh ---
  // The body under the crack: pressure still leaving after the initial snap.
  // Shorter than it used to be, because the psh above now carries the front
  // of the event and two long noise layers on top of each other is exactly
  // how a release stops sounding tight.
  // `sighDur` stretches the body the same way tailDur stretches the tail —
  // see there for why this car's release takes its time.
  const dur = (0.16 + k * 0.34) * (R2.sighDur || 1);
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf;
  n.loop = true; n.playbackRate.value = 1.1 + Math.random() * 0.2;
  const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 0.75;
  f.frequency.setValueAtTime(900 + k * 1500, t);
  f.frequency.exponentialRampToValueAtTime(320 + k * 260, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  // fast but not instant — a valve takes a few milliseconds to open, and
  // making it instant is what turns this into a hi-hat
  g.gain.linearRampToValueAtTime(0.30 * k * R2.sigh, t + 0.018);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f); f.connect(g); g.connect(bus);
  n.start(t); n.stop(t + dur + 0.05);

  // --- the chuffs ---
  // Only with pressure behind them. Two or three, decelerating, quiet enough
  // to sit inside the sigh rather than on top of it.
  if (k > 0.28) {
    const count = k > 0.62 ? 3 : 2;
    let at = t + 0.012, gap = 0.055, amp = 0.075 * k * R2.chuff * 6;
    for (let i = 0; i < count; i++) {
      const jit = 0.85 + Math.random() * 0.3;
      const c = ctx.createBufferSource(); c.buffer = AU.noiseBuf;
      c.playbackRate.value = 0.9 + Math.random() * 0.3;
      const cf = ctx.createBiquadFilter(); cf.type = "bandpass"; cf.Q.value = 1.1;
      cf.frequency.setValueAtTime((760 + k * 700) * jit, at);
      cf.frequency.exponentialRampToValueAtTime(300, at + gap * 1.4);
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, at);
      cg.gain.linearRampToValueAtTime(amp * jit, at + 0.006);
      cg.gain.exponentialRampToValueAtTime(0.0001, at + gap * 1.5);
      c.connect(cf); cf.connect(cg); cg.connect(bus);
      c.start(at); c.stop(at + gap * 1.6);
      at += gap; gap *= 1.28; amp *= 0.62;
    }
  }

  /* --- the tail ---
     The last of the pressure, low and long, under the lot of it. It is what
     stops the release ending on a hard edge.

     `tailDur` stretches it in TIME, which is a different knob from `tail` and
     the one that decides how long the release goes on for. Big plumbing is
     the reason: the charge pipes, intercoolers and plenum on a quad-turbo
     8-litre hold a genuinely large volume of compressed air, and emptying it
     through the bypass valves is not a quick job. A small turbo four is done
     in half a second; this should still be sighing well after that. */
  const td = (0.5 + k * 0.75) * (R2.tailDur || 1);
  const tl = ctx.createBufferSource(); tl.buffer = AU.noiseBuf;
  tl.loop = true; tl.playbackRate.value = 0.7;
  const tf = ctx.createBiquadFilter(); tf.type = "lowpass";
  tf.frequency.setValueAtTime(1100, t);
  tf.frequency.exponentialRampToValueAtTime(280, t + td);
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.0001, t);
  tg.gain.linearRampToValueAtTime(0.11 * k * R2.tail, t + 0.05);
  tg.gain.exponentialRampToValueAtTime(0.0001, t + td);
  tl.connect(tf); tf.connect(tg); tg.connect(bus);
  tl.start(t); tl.stop(t + td + 0.05);
}

/* Pull the continuous bed down and let it back up — see AU.duck. `amount` is
   how far down (0.35 = to 35% of normal), `hold` is how long it stays there
   before the recovery starts. The drop is fast enough to be inaudible as a
   fade and the recovery is slow enough that the engine swells back in rather
   than switching on, which is what stops it sounding like a pumping plugin. */
function duckBed(amount, hold = 0.06, back = 0.30) {
  if (!AU.ready || !AU.duck) return;
  const g = AU.duck.gain, t = AU.ctx.currentTime;
  const lvl = clamp(amount, 0.08, 1);
  // stack politely: if something already ducked us, take the lower of the two
  // rather than yanking the gain back up mid-recovery
  g.cancelScheduledValues(t);
  const cur = Math.min(g.value, 1);
  g.setValueAtTime(cur, t);
  g.linearRampToValueAtTime(Math.min(cur, lvl), t + 0.012);
  g.setValueAtTime(Math.min(cur, lvl), t + 0.012 + hold);
  g.linearRampToValueAtTime(1, t + 0.012 + hold + back);
}

/* ---- the upshift chuff ----
   A twin-clutch changing gear at full boost does not do a full release — the
   throttle never shut, so the whole charge volume is not being dumped. But
   the torque handover unloads the compressors hard for a few tens of
   milliseconds, and on a car running eighteen pounds of boost that is plenty
   of air going somewhere it wasn't a moment ago.

   This started out as a barely-there tick on the theory that it should be
   subtle. That was wrong: on a real quad-turbo car, banging through the
   gears flat out, you hear the plumbing on EVERY shift, and it is one of the
   best noises the car makes. So it is now a short, hard chuff — the same
   shape as the lift release, at roughly half the level and a third of the
   length. Short enough to sit inside the shift, loud enough to be the reason
   you keep taking it to the limiter. */
function sfxTurboChirp(boost, R) {
  if (!AU.ready) return;
  const C = R || rigOf(CC);
  if (!C) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  const k = clamp(boost, 0, 1) * (C.release.chirp || 0)
          * ear().turbo * (inCabin() ? (C.cabin || 1) : 1);
  if (k < 0.015) return;
  const bus = AU.sfx;
  // …and the same trick, at about half strength, so a shift punches a hole
  // in the engine rather than disappearing behind it
  const dk = clamp(boost, 0, 1) * (C.release.duck === undefined ? 1 : C.release.duck);
  if (dk > 0.05) duckBed(1 - dk * 0.34, 0.03, 0.20);
  const dur = 0.085;

  // the crack: bright, fast, gone
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf;
  n.playbackRate.value = 1.6 + Math.random() * 0.3;
  const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 2.2;
  f.frequency.setValueAtTime(3000 + k * 1900, t);
  f.frequency.exponentialRampToValueAtTime(1400, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.22 * k, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f); f.connect(g); g.connect(bus);
  n.start(t); n.stop(t + dur + 0.02);

  // …and the body under it, so it lands as a chuff of air rather than a tick
  const b = ctx.createBufferSource(); b.buffer = AU.noiseBuf;
  b.playbackRate.value = 0.85;
  const bf = ctx.createBiquadFilter(); bf.type = "bandpass"; bf.Q.value = 1.0;
  bf.frequency.setValueAtTime(760, t);
  bf.frequency.exponentialRampToValueAtTime(300, t + dur * 1.6);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.0001, t);
  bg.gain.linearRampToValueAtTime(0.11 * k, t + 0.005);
  bg.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.6);
  b.connect(bf); bf.connect(bg); bg.connect(bus);
  b.start(t); b.stop(t + dur * 1.6 + 0.02);
}

/* ---- compressor surge ----
   stu-tu-tu-tu-tu. What's actually happening: you shut the throttle, the
   column of pressurised air in the charge pipe has nowhere to go, and it
   slams backwards through a compressor wheel that is still spinning at
   130,000 rpm. The wheel stalls, the air escapes forward past the blades,
   pressure drops, the wheel bites again, and it repeats — several times a
   second, slowing down as the wheel spins down and the pressure bleeds off.

   That means it is NOT an amplitude-modulated tone, which is what it used to
   be here and why it buzzed like a ring modulator. It's a burst of separate
   physical events, each one its own puff of air with a short pitched ring
   off the blades, spaced further and further apart as the surge dies. So
   that's how it's built now: discrete chuffs, decelerating, each slightly
   different from the last, because no two stalls are identical.

   `flutter` on the car is 0..1 — how prone that particular turbo setup is to
   surging. Big single turbos with no bypass valve do it constantly; modern
   factory cars mostly recirculate and just sigh. */
function sfxFlutter(boost, amount = 1) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  const k = Math.min(1, boost) * clamp(amount, 0, 1.4);
  if (k < 0.04) return;
  /* Under the bonnet — but how much of it reaches the cabin depends on the
     thing that causes the flutter in the first place. A car that surges hard
     is a car with no bypass valve, which means the air is coming back out
     through the compressor and up the intake tract, and on a big single that
     tract is a four-inch pipe running to a filter in the wheel arch with
     nothing but the inner wing between it and your feet. That is why the
     "stu-tu-tu" is such an interior sound on these cars while a modern
     recirculating setup barely reaches you. So the cabin figure scales with
     how prone the setup is instead of being a flat 0.3 for everything. */
  const pos = ear().turbo * (inCabin() ? 0.3 + 0.35 * clamp(amount, 0, 1) : 1);
  const bus = AU.sfx;

  // how many stalls this surge gets, and how fast it starts. `flutterChat`
  // lengthens the burst without touching its level — the difference between a
  // couple of chuffs and the long machine-gun chatter of a big single.
  const chat = CC.flutterChat || 1;
  const pulses = Math.round((4 + k * 5) * chat);
  let gap = 0.052 - k * 0.014;                   // first interval, seconds
  let at = t;
  let pitch = 1750 + k * 1100;                   // blade ring, falls as it spools down
  let amp = (0.16 + k * 0.20) * pos;

  for (let i = 0; i < pulses; i++) {
    const jit = 0.86 + Math.random() * 0.28;     // no two stalls are the same
    const a = amp * jit;
    const dur = gap * 1.25;

    // the puff itself: broadband air forced back out of the intake
    const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf;
    n.playbackRate.value = 1.15 + Math.random() * 0.4;
    const nf = ctx.createBiquadFilter(); nf.type = "bandpass";
    nf.frequency.setValueAtTime(pitch * 0.85, at);
    nf.frequency.exponentialRampToValueAtTime(Math.max(180, pitch * 0.45), at + dur);
    nf.Q.value = 0.9;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, at);
    ng.gain.linearRampToValueAtTime(a, at + 0.004);      // very fast attack — it's a slam
    ng.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    n.connect(nf); nf.connect(ng); ng.connect(bus);
    n.start(at); n.stop(at + dur + 0.02);

    // and the short pitched ring as the blades unload
    const o = ctx.createOscillator(); o.type = "triangle";
    o.frequency.setValueAtTime(pitch * jit, at);
    o.frequency.exponentialRampToValueAtTime(pitch * 0.55, at + dur * 0.8);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, at);
    og.gain.linearRampToValueAtTime(a * 0.42, at + 0.005);
    og.gain.exponentialRampToValueAtTime(0.0001, at + dur * 0.85);
    o.connect(og); og.connect(bus);
    o.start(at); o.stop(at + dur + 0.02);

    at += gap;
    // the wheel is slowing: the stalls spread out. A long chattering surge
    // spreads more gently, or the burst is over before it has chattered.
    gap *= chat > 1 ? 1.19 - 0.06 * clamp(chat - 1, 0, 1) : 1.19;
    pitch *= 0.9;             // …and drop in pitch with it
    amp *= chat > 1 ? 0.86 : 0.8;   // …and run out of pressure to do it with
  }

  // the last of the pressure leaving through the intake, under the lot of it
  const tail = ctx.createBufferSource(); tail.buffer = AU.noiseBuf;
  tail.loop = true; tail.playbackRate.value = 0.9;
  const tf = ctx.createBiquadFilter(); tf.type = "lowpass"; tf.frequency.value = 900;
  const tg = ctx.createGain();
  const tdur = at - t + 0.12;
  tg.gain.setValueAtTime(0.0001, t);
  tg.gain.linearRampToValueAtTime(0.045 * k * pos, t + 0.03);
  tg.gain.exponentialRampToValueAtTime(0.0001, t + tdur);
  tail.connect(tf); tf.connect(tg); tg.connect(bus);
  tail.start(t); tail.stop(t + tdur + 0.05);
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
  o.connect(g); g.connect(AU.inner); o.start(t); o.stop(t + dur + 0.05);
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
    o.connect(g); g.connect(AU.inner); o.start(t + dt); o.stop(t + dt + 0.5);
  });
}

/* ================================================================
   WAKING THE ELECTRIC SIDE
   ================================================================
   An engine starting is a physical event and it sounds like whatever the
   hardware does. A high-voltage system waking up makes almost no noise at
   all — a contactor closes, a pump runs, and that is genuinely it. Which
   means every manufacturer has had to DESIGN what that moment sounds like,
   and the result is the most revealing thing any of these cars does: it is
   the only sound in the car that is pure intent, with no physics to hide
   behind. So they should not all share one chime.

   Four of them, and they disagree about what an expensive car is:

     ferrari   A soft ascending arpeggio. It says instrument.
     lambo     A precharge sweep into a hard two-note stab. Fighter jet.
     bavaria   A slow orchestral swell that resolves. Cinema, deliberately.
     race      Nothing composed at all: the contactors, the coolant pump and
               the inverter coming up. Because a team does not want a jingle,
               it wants to hear that the car is live.

   Per-car `evBoot`. Everything here rides AU.inner — it is coming out of the
   cabin speakers, so sealing yourself in makes it clearer, not duller. */
function sfxEvBoot(amp = 1) {
  switch (CC.evBoot) {
    case "lambo":   sfxBootLambo(amp);   break;
    case "bavaria": sfxBootBavaria(amp); break;
    case "race":    sfxBootRace(amp);    break;
    case "ferrari": sfxChimeFerrari(amp); break;
    default:        sfxChime(amp);       break;
  }
}

/* Sant'Agata: the whole car is built to reference an aeroplane, down to the
   flip-up cover over the starter, so the electric side wakes like an avionics
   bus and not like a doorbell. A precharge sweep climbing through a resonant
   filter, a hard contactor CLACK at the top of it, and then two notes — a
   fifth, stated flatly, no decoration. It is not friendly and it isn't meant
   to be. */
function sfxBootLambo(amp = 1) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  // the precharge: DC bus coming up through the resistor, heard as a sweep
  const o = ctx.createOscillator(); o.type = "sawtooth";
  o.frequency.setValueAtTime(70, t);
  o.frequency.exponentialRampToValueAtTime(760, t + 0.42);
  const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 5.5;
  f.frequency.setValueAtTime(180, t);
  f.frequency.exponentialRampToValueAtTime(2200, t + 0.42);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.075 * amp, t + 0.2);
  g.gain.exponentialRampToValueAtTime(0.012, t + 0.44);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  o.connect(f); f.connect(g); g.connect(AU.inner); o.start(t); o.stop(t + 0.52);
  // the main contactor landing — a dry, heavy, entirely unmusical clack
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 1.8;
  const nf = ctx.createBiquadFilter(); nf.type = "bandpass";
  nf.frequency.value = 1500; nf.Q.value = 1.4;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.34 * amp, t + 0.42);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  n.connect(nf); nf.connect(ng); ng.connect(AU.inner); n.start(t + 0.42); n.stop(t + 0.52);
  const k = ctx.createOscillator(); k.type = "sine";
  k.frequency.setValueAtTime(220, t + 0.42);
  k.frequency.exponentialRampToValueAtTime(72, t + 0.52);
  const kg = ctx.createGain();
  kg.gain.setValueAtTime(0.2 * amp, t + 0.42);
  kg.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
  k.connect(kg); kg.connect(AU.inner); k.start(t + 0.42); k.stop(t + 0.57);
  // and the statement: A, then E above it. Square-ish, hard-edged, no vibrato.
  [[440, 0.5, 0.2], [659.25, 0.66, 0.5]].forEach(([hz, dt, dur]) => {
    [["square", 0.05], ["sawtooth", 0.035]].forEach(([type, lvl]) => {
      const v = ctx.createOscillator(); v.type = type; v.frequency.value = hz;
      const vf = ctx.createBiquadFilter(); vf.type = "lowpass";
      vf.frequency.value = 3200; vf.Q.value = 1.2;
      const vg = ctx.createGain();
      vg.gain.setValueAtTime(0.001, t + dt);
      vg.gain.linearRampToValueAtTime(lvl * amp, t + dt + 0.02);
      vg.gain.exponentialRampToValueAtTime(0.001, t + dt + dur);
      v.connect(vf); vf.connect(vg); vg.connect(AU.inner);
      v.start(t + dt); v.stop(t + dt + dur + 0.05);
    });
  });
}

/* Bavaria: the one that hired a film composer. A slow low swell with a fifth
   and an octave stacked on it, a shimmer that arrives late and hangs, and a
   resolution rather than an arrival. Nothing about it is a beep. It takes a
   second and a half on purpose, because the car is telling you that you have
   time. */
function sfxBootBavaria(amp = 1) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  // the bed: a root and its fifth, rising together out of nothing
  [[65.41, 0.055], [98, 0.04], [130.81, 0.03]].forEach(([hz, lvl]) => {
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(hz * 0.985, t);
    o.frequency.linearRampToValueAtTime(hz, t + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(lvl * amp, t + 0.55);
    g.gain.setValueAtTime(lvl * amp, t + 0.95);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.75);
    o.connect(g); g.connect(AU.inner); o.start(t); o.stop(t + 1.8);
  });
  // the voicing over the top — a major triad that fills in one note at a time
  [[261.63, 0.34], [329.63, 0.5], [392, 0.62], [523.25, 0.78]].forEach(([hz, dt]) => {
    const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t + dt);
    g.gain.linearRampToValueAtTime(0.03 * amp, t + dt + 0.22);
    g.gain.exponentialRampToValueAtTime(0.001, t + dt + 1.0);
    o.connect(g); g.connect(AU.inner); o.start(t + dt); o.stop(t + dt + 1.05);
  });
  // the late shimmer: a thin band of filtered air that swells in behind the
  // chord and leaves after it. This is the bit that costs money.
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.loop = true;
  const nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.Q.value = 1.6;
  nf.frequency.setValueAtTime(1800, t + 0.4);
  nf.frequency.linearRampToValueAtTime(4200, t + 1.5);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.001, t + 0.4);
  ng.gain.linearRampToValueAtTime(0.02 * amp, t + 1.0);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 1.9);
  n.connect(nf); nf.connect(ng); ng.connect(AU.inner); n.start(t + 0.4); n.stop(t + 1.95);
}

/* A race car does not have a welcome sound, and pretending otherwise would be
   the one wrong note in the whole garage. What a driver actually hears when
   the hybrid goes live is three pieces of hardware in sequence: the coolant
   pump priming, the contactors landing one after the other, and the inverter
   settling into a steady high hum that then just stays there. That hum IS the
   confirmation. Nobody wrote any of this; it's just what the car does. */
function sfxBootRace(amp = 1) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  // coolant pump spinning up and then running
  const p = ctx.createOscillator(); p.type = "sawtooth";
  p.frequency.setValueAtTime(38, t);
  p.frequency.exponentialRampToValueAtTime(154, t + 0.5);
  const pf = ctx.createBiquadFilter(); pf.type = "lowpass";
  pf.frequency.value = 900; pf.Q.value = 3.5;
  const pg = ctx.createGain();
  pg.gain.setValueAtTime(0.001, t);
  pg.gain.linearRampToValueAtTime(0.05 * amp, t + 0.3);
  pg.gain.setValueAtTime(0.05 * amp, t + 1.1);
  pg.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
  p.connect(pf); pf.connect(pg); pg.connect(AU.inner); p.start(t); p.stop(t + 2.05);
  // two contactors, a beat apart, because that is how they are sequenced
  [0.34, 0.52].forEach((dt, i) => {
    const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 2.1;
    const nf = ctx.createBiquadFilter(); nf.type = "bandpass";
    nf.frequency.value = 1900 - i * 400; nf.Q.value = 1.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime((0.3 - i * 0.06) * amp, t + dt);
    ng.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.055);
    n.connect(nf); nf.connect(ng); ng.connect(AU.inner); n.start(t + dt); n.stop(t + dt + 0.07);
    const k = ctx.createOscillator(); k.type = "sine";
    k.frequency.setValueAtTime(190, t + dt);
    k.frequency.exponentialRampToValueAtTime(68, t + dt + 0.07);
    const kg = ctx.createGain();
    kg.gain.setValueAtTime(0.16 * amp, t + dt);
    kg.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.09);
    k.connect(kg); kg.connect(AU.inner); k.start(t + dt); k.stop(t + dt + 0.11);
  });
  // the inverter coming up to its switching frequency and then holding
  [[1, 0.028], [2, 0.012], [3, 0.005]].forEach(([mult, lvl]) => {
    const o = ctx.createOscillator(); o.type = mult === 1 ? "square" : "sine";
    o.frequency.setValueAtTime(320 * mult, t + 0.5);
    o.frequency.exponentialRampToValueAtTime(1180 * mult, t + 0.95);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t + 0.5);
    g.gain.linearRampToValueAtTime(lvl * amp, t + 0.95);
    g.gain.setValueAtTime(lvl * amp, t + 1.35);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.1);
    o.connect(g); g.connect(AU.inner); o.start(t + 0.5); o.stop(t + 2.15);
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
    o.connect(g); g.connect(AU.inner); o.start(t + dt); o.stop(t + dt + dur + 0.05);
    const s = ctx.createOscillator(); s.type = "sine"; s.frequency.value = hz * 2;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.001, t + dt);
    sg.gain.linearRampToValueAtTime(0.022 * amp, t + dt + 0.09);
    sg.gain.exponentialRampToValueAtTime(0.001, t + dt + dur);
    s.connect(sg); sg.connect(AU.inner); s.start(t + dt); s.stop(t + dt + dur + 0.05);
  });
  // the warm swell underneath — C3 rising to G3 as everything comes alive
  const b = ctx.createOscillator(); b.type = "sine"; b.frequency.setValueAtTime(130.8, t);
  b.frequency.linearRampToValueAtTime(196, t + 0.5);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.001, t);
  bg.gain.linearRampToValueAtTime(0.05 * amp, t + 0.3);
  bg.gain.exponentialRampToValueAtTime(0.001, t + 0.95);
  b.connect(bg); bg.connect(AU.inner); b.start(t); b.stop(t + 1);
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
  n.connect(nf); nf.connect(ng); ng.connect(AU.sfx); n.start(t); n.stop(t + 0.38);
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
  o.connect(of); of.connect(og); og.connect(AU.sfx); o.start(t); o.stop(t + 0.38);
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
  n.connect(f); f.connect(g); g.connect(AU.sfx);
  n.start(t); n.stop(t + 0.7);
}

/* ================================================================
   EXHAUST POPS — five voices, not one voice with a volume knob
   ================================================================
   Overrun noise is not a single sound played at different levels. What you
   hear depends on what the unburnt fuel is doing, and in what kind of pipe:

     putter   "p p p p"      Barely any fuel, low pressure, cold-ish pipe.
                             Round chuffs with no transient at all — the
                             lazy putter of a big lazy engine on trailing
                             throttle. All body, no crack.
     gurgle   "plplplpl"     Fuel pooling and boiling off in the pipe. The
                             wet one. A high-Q resonance sweeping DOWN as
                             the slug burns is what makes it sound liquid,
                             and it always arrives as a stuttered double tap
                             — that second tap is the "l" in "pl".
     tick     "klklklkl"     Thin-wall race pipe, glowing hot, very little
                             fuel. Dry, high, metallic, almost no low end —
                             more like a stone bouncing down a drainpipe.
     crack    "pap!"         The everyday pop: a real slug lighting cleanly.
                             Snap on the front, body behind it, thump under.
     bang     "BANG!"        A big single turbo dumping fuel into a red-hot
                             exhaust. Built like an actual gunshot report:
                             an instantaneous click, a deep chest thump, and
                             a long tail of the pipe and the street ringing.

   All five are assembled from the same four ingredients — a noise BODY, a
   SNAP on the front, a pitched THUMP underneath, and a resonant RING behind
   — and the character is entirely in the balance between them.

   Note where the loudness lives. Every voice is weighted toward the thump
   and body rather than the snap, because a real pop hits you in the chest.
   Pushing 2–4 kHz to make a synthesized pop "loud" is exactly what makes it
   sound like static, and it's what made these hurt to record before. */
const POP_VOICES = {
  putter: {
    gain: 2.2, max: 1.25,
    body:  { rate: [0.28, 0.5], type: "lowpass", f: [110, 240], q: 0.7,
             dec: [0.075, 0.115], len: 0.2, lvl: 1.0 },
    thump: { f0: 66, f1: 28, dec: 0.12, len: 0.15, lvl: 1.05 },
  },
  gurgle: {
    gain: 2.3, max: 1.3, double: [0.014, 0.028, 0.62],   // gap min/max, level
    // the swept high-Q bandpass IS the wetness — hold it still and it's a tick
    body:  { rate: [0.45, 0.75], type: "bandpass", f: [700, 820], f2: [150, 200],
             q: 6.5, dec: [0.05, 0.08], len: 0.15, lvl: 1.2 },
    snap:  { rate: 1.0, f: 900, q: 1.0, dec: 0.013, len: 0.03, lvl: 0.24 },
    thump: { f0: 132, f1: 44, dec: 0.08, len: 0.11, lvl: 0.72 },
  },
  tick: {
    gain: 2.0, max: 1.2,
    body:  { rate: [1.2, 1.75], type: "highpass", f: [1050, 1400], q: 0.7,
             dec: [0.012, 0.022], len: 0.06, lvl: 0.9 },
    snap:  { rate: 1.9, f: 3000, q: 1.4, dec: 0.008, len: 0.02, lvl: 0.5 },
    thump: { f0: 155, f1: 70, dec: 0.032, len: 0.05, lvl: 0.3 },
    ring:  { rate: 1.4, f: [2300, 2700], q: 9, dec: 0.07, len: 0.1, lvl: 0.2, at: 0.004 },
  },
  crack: {
    gain: 2.9, max: 1.7,
    body:  { rate: [0.45, 0.9], type: "lowpass", f: [300, 660], q: 0.9,
             dec: [0.045, 0.095], len: 0.15, lvl: 1.05 },
    snap:  { rate: 1.35, f: 1800, q: 0.8, dec: 0.02, len: 0.035, lvl: 0.52 },
    thump: { f0: 95, f1: 34, dec: 0.115, len: 0.14, lvl: 1.1 },
  },
  bang: {
    gain: 3.6, max: 2.5,
    // the instantaneous crack of the report — 2ms, and gone
    click: { rate: 2.2, f: 2600, q: 0.5, dec: 0.0035, len: 0.012, lvl: 0.7 },
    body:  { rate: [0.26, 0.46], type: "lowpass", f: [180, 430], q: 0.9,
             dec: [0.14, 0.2], len: 0.45, lvl: 1.35 },
    snap:  { rate: 1.5, f: 2000, q: 0.6, dec: 0.03, len: 0.05, lvl: 0.5 },
    thump: { f0: 96, f1: 22, dec: 0.3, len: 0.36, lvl: 1.75 },
    ring:  { rate: 0.8, f: [470, 720], q: 3.4, dec: 0.5, len: 0.55, lvl: 0.36, at: 0.012 },
  },
};

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (r) => Array.isArray(r) ? rnd(r[0], r[1]) : r;

/* one filtered noise burst on the pop bus */
function popNoise(t, lvl, spec, sweepTo) {
  const ctx = AU.ctx;
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf;
  n.playbackRate.value = pick(spec.rate);
  const f = ctx.createBiquadFilter();
  f.type = spec.type || "bandpass";
  f.frequency.value = pick(spec.f);
  f.Q.value = spec.q === undefined ? 1 : spec.q;
  const dec = pick(spec.dec);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dec);
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.max(0.0001, lvl), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
  n.connect(f); f.connect(g); g.connect(AU.popBus);
  n.start(t); n.stop(t + spec.len);
}

/* the pitched thump underneath — this is where a pop's weight comes from */
function popThump(t, lvl, spec) {
  const ctx = AU.ctx;
  const o = ctx.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(spec.f0 * rnd(0.92, 1.08), t);
  o.frequency.exponentialRampToValueAtTime(spec.f1, t + spec.dec);
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.max(0.0001, lvl), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + spec.dec);
  o.connect(g); g.connect(AU.popBus);
  o.start(t); o.stop(t + spec.len);
}

/* a single pop in a named voice. `amp` is how much fuel went off (0..~1). */
function sfxPop(amp, when, voice) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t0 = when || ctx.currentTime;
  const V = POP_VOICES[voice] || POP_VOICES.crack;
  const lvl = Math.min(V.max, Math.max(0, amp) * V.gain);
  if (lvl < 0.002) return;

  const shot = (t, k) => {
    if (V.click) popNoise(t, lvl * V.click.lvl * k, V.click);
    if (V.body) {
      const to = V.body.f2 ? pick(V.body.f2) : 0;    // gurgle sweeps, others don't
      popNoise(t, lvl * V.body.lvl * k, V.body, to);
    }
    if (V.snap) popNoise(t, lvl * V.snap.lvl * k, V.snap);
    if (V.ring) popNoise(t + (V.ring.at || 0), lvl * V.ring.lvl * k, V.ring);
    if (V.thump) popThump(t, lvl * V.thump.lvl * k, V.thump);
  };
  shot(t0, 1);
  // the stuttered second tap that turns "p" into "pl"
  if (V.double) shot(t0 + rnd(V.double[0], V.double[1]), V.double[2]);
}

/* ---------------- crackle patterns ----------------
   Which voices a car uses, how fast they come, and how often one of them
   really lets go. A fitted exhaust imposes its own character; on the stock
   system the car's own nature shows through instead. */
const CRACKLE_STYLES = {
  lazy:  { mix: [["putter", 7], ["gurgle", 2], ["crack", 1]],
           gap: [0.06, 0.12],  count: [3, 5],   bang: 0.015, roll: 0.10 },
  mixed: { mix: [["crack", 5], ["putter", 3], ["gurgle", 2], ["tick", 2]],
           gap: [0.04, 0.1],   count: [4, 7],   bang: 0.07,  roll: 0.22 },
  wet:   { mix: [["gurgle", 7], ["crack", 3], ["putter", 2]],
           gap: [0.035, 0.085], count: [5, 9],  bang: 0.08,  roll: 0.40 },
  dry:   { mix: [["tick", 8], ["crack", 2]],
           gap: [0.026, 0.058], count: [7, 12], bang: 0.05,  roll: 0.52 },
  hard:  { mix: [["crack", 6], ["tick", 2], ["gurgle", 1]],
           gap: [0.035, 0.085], count: [4, 8],  bang: 0.20,  roll: 0.22 },
  war:   { mix: [["tick", 5], ["crack", 5], ["gurgle", 2]],
           gap: [0.022, 0.052], count: [9, 15], bang: 0.28,  roll: 0.55 },
};

function crackleStyle() {
  return CRACKLE_STYLES[exSound().crackle || CC.crackle || "mixed"] || CRACKLE_STYLES.mixed;
}

/* weighted pick out of a style's voice mix */
function pickVoice(style) {
  const mix = style.mix;
  let total = 0;
  for (const [, wgt] of mix) total += wgt;
  let r = Math.random() * total;
  for (const [name, wgt] of mix) { r -= wgt; if (r <= 0) return name; }
  return mix[0][0];
}

/* how big a flame a given voice throws — a tick barely licks the pipe, a
   bang is a torch */
const POP_FLAME = { putter: 0.14, gurgle: 0.3, tick: 0.18, crack: 0.55, bang: 0.95 };

/* burst of overrun crackle, with flames timed to the pops.
   Real crackle stutters: mostly a loose scatter, then a fast ROLL of three or
   four right on top of each other, then a gap. That unevenness is most of
   what makes it sound like an engine instead of a metronome. */
function sfxCrackle(intensity) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t0 = ctx.currentTime;
  const st = crackleStyle(), mul = popEff();
  const n = Math.round(pick(st.count) * clamp(0.55 + intensity * 0.32, 0.5, 1.7));
  const bangOdds = Math.min(0.42, st.bang * (0.6 + mul * 0.7));
  let dt = 0.012;

  for (let i = 0; i < n; i++) {
    const fade = Math.max(0.32, 1 - i * 0.085);        // the burst dies away
    const amp = rnd(0.42, 0.8) * fade * Math.min(1.7, intensity);
    const bang = Math.random() < bangOdds;
    const voice = bang ? "bang" : pickVoice(st);
    sfxPop(amp, t0 + dt, voice);

    const power = (POP_FLAME[voice] || 0.4) * (0.65 + amp * 0.7);
    if (power > 0.08) setTimeout(() => popFlame(power), dt * 1000);
    dt += pick(st.gap);

    // …and every so often it stutters into a tight roll
    if (!bang && Math.random() < st.roll) {
      const rollVoice = pickVoice(st);
      for (let k = 0, m = 2 + Math.floor(Math.random() * 3); k < m; k++) {
        sfxPop(amp * rnd(0.42, 0.7), t0 + dt, rollVoice);
        dt += rnd(0.019, 0.032);
      }
      dt += rnd(0.02, 0.05);
    }
  }
}

/* the flat WHUMP a car without a popping exhaust makes on a bad lift, and
   the stumble of a misfire: one real report, then its smaller echo off the
   underside of the car */
function sfxBackfire() {
  if (!AU.ready) return;
  const t = AU.ctx.currentTime;
  sfxPop(0.5, t, "bang");
  sfxPop(0.16, t + 0.07 + Math.random() * 0.05, "crack");
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
  // …and a far lower one with the automatic in Park or Neutral. Nothing is
  // loading the engine, so the ECU refuses to let you sit it on the redline —
  // lean on the throttle at a standstill and it just holds here.
  if (S.mode === "auto" && (S.autoSel === "P" || S.autoSel === "N")) {
    S.parkLimit = Math.min(PARK_REV_LIMIT, ENG.cut * 0.95);
    if (S.rpm > S.parkLimit) S.cutTimer = Math.max(S.cutTimer, 0.05);
  } else S.parkLimit = 0;

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
  const catchWas = S.catchT;
  S.catchT = Math.max(0, S.catchT - dt);
  if (S.catchT > 0) {
    /* The flare is aimed at a ceiling rather than held wide open, and it
       looks ahead to get there cleanly: a featherweight V12 that is climbing
       at eight thousand rpm a second has to start backing off long before a
       heavy diesel does, or it sails straight past. So the fuelling is cut
       against where the revs will BE in a moment, not where they are —
       which is exactly what the real ECU is doing. */
    const peak = S.catchPeak || ENG.idle * 2.6;
    const rate = (S.rpm - (S._catchPrev != null ? S._catchPrev : S.rpm)) / Math.max(dt, 1e-4);
    S._catchPrev = S.rpm;
    const lead = S.rpm + rate * 0.2;             // where it is headed
    if (S.rpm >= peak) S.catchT = 0;             // there. Hand back to idle.
    else if (lead < peak) {
      const band = Math.max(180, (peak - ENG.idle) * 0.28);
      eff = Math.max(eff, (S.catchAmt || 0.55)
        * clamp((peak - lead) / band, 0, 1)
        * Math.min(1, S.catchT / 0.4));
    }
  } else S._catchPrev = null;

  /* The way down is the half of a start people actually remember: it does
     not drop off the flare, it sags back on a long smooth curve over a
     couple of seconds while the ECU bleeds the fast idle away. So the flare
     hands over to a governor that tracks a decaying target — friction pulls
     the revs down, this feathers just enough throttle to keep them on the
     curve, and it lets go the moment you touch the pedal yourself. */
  if (catchWas > 0 && S.catchT <= 0 && S.engineOn) {
    S.settleT = 0;
    S.settleDur = 7.5;                     // the whole warm-up, start to finish
    S.settleFrom = Math.max(S.rpm, ENG.idle + 100);
    S.fastIdle = ENG.idle * 1.55;          // where it sits while it warms
  }
  if (S.settleDur > 0 && S.settleT < S.settleDur) {
    S.settleT += dt;
    if (!S.engineOn || S.in.gas > 0.04 || S.blip > 0) S.settleDur = 0;
    else {
      /* A car does not go from the flare to idle in one movement. It drops
         onto a fast idle, SITS there while the ECU warms the cats, and only
         then bleeds away to a proper idle — and that middle bit is most of
         what you hear standing next to one. Three phases:
           0.0-1.1s  falling off the flare onto the fast idle
           1.1-4.2s  holding it, drifting down a hair
           4.2-7.5s  the long bleed down to idle */
      const e = S.settleT, fi = S.fastIdle;
      let target;
      if (e < 1.1) {
        const k = 1 - e / 1.1;
        target = fi + (S.settleFrom - fi) * k * k * (3 - 2 * k);
      } else if (e < 4.2) {
        target = fi - (fi - ENG.idle) * 0.16 * ((e - 1.1) / 3.1);
      } else {
        const k = clamp((e - 4.2) / 3.3, 0, 1);
        const from = fi - (fi - ENG.idle) * 0.16;
        target = ENG.idle + (from - ENG.idle) * (1 - k) * (1 - k);
      }
      if (S.rpm < target) {
        const band = Math.max(140, (S.settleFrom - ENG.idle) * 0.45);
        eff = Math.max(eff, 0.6 * clamp((target - S.rpm) / band, 0, 1));
      }
    }
  }
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
      sfxPop((0.13 + Math.random() * 0.07) * (0.6 + blat * 0.55), 0, "putter");
    }
  } else S._blatT = 0.1;

  // forced induction
  if (CC.turboRig && S.engineOn) {
    turboRigStep(dt, eff);
  } else if (CC.asp === "turbo" && S.engineOn) {
    // turbo needs exhaust flow: spools with rpm + load, bleeds fast off-throttle
    let tgt;
    if (CC.seqTurbo) {
      /* The lightweight staging model, for a car that wants a second pair of
         turbos arriving without the full shaft-inertia rig. It steps rather
         than swells, and the step is announced — which is a legitimate thing
         to want for a car where the handover IS the event. Anything that
         needs the turbos to be part of the voice should use `turboRig`
         instead; see TURBO RIG. */
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
    /* --- what counts as "shut the throttle" ---
       The plain test is a full lift: was on it, now off it, boost still up.
       That is fine for a car whose surge is an occasional side effect, and
       wrong for a car whose surge is its signature. A big single with no
       bypass valve chatters every time the plate moves against pressure — a
       part-throttle lift into a corner, a quick breath between gears, and
       every single upshift, because a manual upshift IS a throttle-shut event
       with the boost still trapped behind it. Miss those and the car only
       flutters when you come off completely, which is the least of the times
       it should.

       `flutterEager` opts a car into that wider trigger. Left off, every
       other turbo car keeps exactly the behaviour it was tuned with. */
    const eager = !!CC.flutterEager;
    const inShift = S.shiftCut > 0 || S.cutTimer > 0;
    const shutHard = S._prevBoostEff > 0.5 && eff < 0.15 && S.boost > 0.35;
    // one per shift, on the edge — not once per frame for the whole cut
    const shiftEdge = inShift && !S._flutShift && S._prevBoostEff > 0.35;
    const eagerShut = eager && S.boost > 0.18
                   && (((S._prevBoostEff - eff) > 0.28 && eff < 0.62) || shiftEdge);
    S._flutShift = inShift;
    if (shutHard || eagerShut) {
      // Throttle slammed shut under boost. What comes out depends entirely on
      // where that trapped air is allowed to go. No bypass valve and it has
      // to fight its way back out through the compressor — that's the
      // flutter. A recirculating valve (which is what almost every factory
      // car has, for emissions reasons) routes it politely back round to the
      // intake, and all you get is the sigh. Cars in between do a bit of
      // both, which is why `flutter` is a number and not a flag.
      const fl = CC.flutter === true ? 1 : (CC.flutter || 0);
      if (fl > 0) sfxFlutter(S.boost, fl);
      if (fl < 0.85) sfxBlowoff(1 - fl * 0.7);
      /* …and how much pressure that actually cost. A slam to zero empties the
         pipes; a part-throttle breath or a shift with your foot still mostly
         in it does not, and dumping all of it would mean the eager trigger
         above gutted the car's boost every time you brushed the pedal. So the
         dump scales with how far the plate really shut — which is also why the
         car comes back on boost instantly after a shift instead of having to
         spool from nothing. */
      S.boost *= shutHard ? 0.22 : clamp(0.28 + eff * 0.62, 0.22, 0.9);
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
    turboRigIdle(dt);
  }
  const boostMul = 1 + (CC.boostMax || 0) * S.boost;

  // consequences: an empty tank or a flat pack means there is nothing left to
  // make torque with, whatever the pedal says (see FUEL & CHARGE)
  const dry = starved();

  // engine torque (drive minus internal braking)
  let Te = 0;
  if (S.engineOn && !dry) Te = (torqueAt(S.rpm) * boostMul * ENG.tqMul + evBoostNm(S.rpm)) * eff
                     - (16 + S.rpm * 0.011) * (ENG.fric || 1) * (1 - eff);
  else Te = -(20 + S.rpm * 0.02) * (ENG.fric || 1);

  const engage = computeEngage();
  S.engage = engage;
  const ratio = currentRatio();
  const cap = CAR.clutchCap * engage * dmgClutchHold();

  // resistances on the car
  let F = 0;
  const drag = 0.5 * 1.22 * CAR.cdA * S.v * Math.abs(S.v);
  const roll = Math.abs(S.v) > 0.05 ? CAR.roll * Math.sign(S.v) : 0;
  F -= drag + roll;

  // driver aids: with them off, hard braking locks the wheels
  const aidsOff = curMod().abs === false;
  // GRIP: the workshop's cheat tire. Not more grip — ALL the grip. Nothing
  // ever breaks traction at either end, so the brakes never lock either.
  const gripLock = curMod().grip === true;
  S.lockup = aidsOff && !gripLock && S.brake > 0.9 && Math.abs(S.v) > 6;
  // brake pedal isn't grabby off the top: a soft-shaped curve means light
  // pressure trails the car gently and only a firm push delivers full stopping
  // power (real pedal feel, not an on/off switch)
  const brakeForce = Math.pow(S.brake, 1.7);
  let braking = brakeForce * CAR.brakeMax * dmgBrakeFade() +
                (S.mode === "auto" && S.autoSel === "P" ? 20000 : 0);
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
    /* …unless the car is a race car, in which case it does. A Le Mans hybrid
       runs on the motor alone at pit-lane speed and NOTHING else — there is
       no electric-only mode above walking pace to choose, so the engine
       simply lights the moment you leave the pit box. You can still fire it
       early by hand; you cannot decline to fire it at all. That handover, at
       full noise, is the single best sound these cars make. */
    // (this frame still finishes on the motor — one frame at 16ms is well
    //  under the time the engine takes to catch anyway)
    if (CC.evAuto && Math.abs(S.v) > cap * 0.92 && S.throttle > 0.05) fireHybrid();
    const fwd = S.mode === "auto" ? S.autoSel === "D" : (S.gear !== 0 && S.gear !== "R");
    const rev = S.mode === "auto" ? S.autoSel === "R" : (S.gear === "R");
    if (DMG.on && S.batt <= 0) driveF = 0;                 // nothing in the pack
    else if (fwd) driveF = S.throttle * (CC.evForce || 8000) * clamp((cap - S.v) / cap, 0, 1);
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

  /* ---- TIRES ------------------------------------------------------------
     What used to be here was a threshold and a clamp: past a number the
     drive force got chopped to a fixed fraction and a counter ran up. Two
     things were wrong with that. It only ran with the aids switched OFF, so
     a rear-drive car on full throttle in first hooked up like a train — and
     once it did break away nothing brought it back, so the counter ran to
     its stop and dragged the revs up there with it. That is the over-rev.

     A tire is not a switch. Grip RISES with slip up to about 15%, peaks, and
     falls away past it, and that shape is the whole reason wheelspin behaves
     itself in real life: the faster the tire spins the LESS it pushes, so it
     settles wherever the road can take what the engine is making, and it
     hooks up on its own the instant you lift. Model the curve and the
     behaviour falls out for free — the chirp off the line, the way a launch
     goes light then bites as the car squats, the way the revs flare and
     catch rather than climb forever.

     There are three parts:

       LOAD      Full throttle plants a rear-drive car on its back axle.
                 That transfer is worth a third of the rear grip, and it is
                 why a good RWD launch is a moment of slip that stops, not a
                 burnout. Taken off the traction the tires delivered last
                 frame, which is what actually pitches the car.

       SLIP      Force capacity = grip × mu(slip). Past the peak it falls
                 toward the kinetic floor: lit rubber pushes a little over
                 half of what a hooked-up tire does.

       INERTIA   Spinning a tire up means spinning the ENGINE up too,
                 through the gearing, and in first that reflected inertia
                 dwarfs the wheels themselves. It's why first gear lights up
                 slowly and progressively while third snaps.  */
  const spun = !gripLock && (evNow || (S.gear !== 0 && S.gear !== "R"));
  const gripCoef = aidsOff ? 0.345 : 0.42;   // no TC modulation → less usable grip
  // Weight transfer. A rear-drive car LIVES on this — full throttle plants it
  // on the axle that's doing the work, and that's the whole difference
  // between a launch and a burnout. All-wheel drive barely moves at all,
  // because the load it sheds off the nose lands on wheels it is also
  // driving. Which is exactly why AWD gets a flat bonus instead: its usable
  // traction is very nearly the whole weight of the car whatever the car is
  // doing, where a RWD car only ever has the back half to work with.
  const wt = (CC.awd ? 1.2 : 1)
           + clamp((S.tracF || 0) / (CAR.mass * 9.81), 0, 1) * (CC.awd ? 0.1 : 0.34);
  const gripMax = CAR.mass * 9.81 * gripCoef * (CC.grip || (CC.awd ? 1.8 : 1))
                * wt * (S.rain ? 0.76 : 1);
  // slip ratio: extra tire surface speed over road speed. At a standstill
  // the ratio is undefined, so launches are referenced to a walking pace —
  // otherwise the first metre is a divide by nothing.
  const sRatio = spun ? S.spinV / Math.max(Math.abs(S.v), 2.2) : 0;
  const SP = 0.16;                           // peak grip lives at ~16% slip
  const mu = sRatio <= SP ? 1
           : Math.max(0.56, (2 * SP * sRatio) / (SP * SP + sRatio * sRatio));
  const tracMax = gripMax * mu;

  if (spun) {
    if (!aidsOff) {
      /* Traction control is a torque cut, not a grip bonus — but the cut it
         makes is a SERVO, not a fixed penalty. Its job is to hold the tire at
         the peak of its own grip curve, which is the most force the road will
         take; lopping a flat fraction off the engine instead (what this used
         to do) meant a car that kept slipping got permanently limited to well
         under what its tires could actually deliver. That is what made the
         quick ones feel slow away from a standstill.

         The tenth of a second it takes to see the slip, decide and pull the
         torque is left in on purpose. That delay is the chirp. */
      const over = clamp((sRatio - SP) / (SP * 1.1), 0, 1);   // how far past the peak
      // …and how fast it can answer, which is not a tuning number: an
      // e-motor's torque is a current, and the inverter can take it away in
      // about ten milliseconds. An engine has to close a throttle plate and
      // pull ignition, and that is a tenth of a second whoever built it.
      // Which is exactly why an electric car launches with a chirp you can
      // barely hear and a petrol one lights the tires for a moment first.
      const react = (isEv() || CC.edrive) ? 0.02 : 0.11;
      S.tcCut = clamp((S.tcCut || 0) + (over - (S.tcCut || 0)) * Math.min(1, dt / react), 0, 1);
      driveF *= 1 - 0.85 * S.tcCut;
    } else S.tcCut = 0;
    // spinning the driven wheels means spinning everything bolted to them:
    // the engine, through the gearing, squared
    const geared = ratio ? Math.min(1200, ENG.inertia * ratio * ratio / (CAR.wheelR * CAR.wheelR)) : 0;
    // (an EV has no gearbox to reflect anything through, so its rotors and
    //  half-shafts are all there is — which is why they spin up instantly)
    const spinMass = clamp(CAR.mass * (ratio ? 0.02 : 0.06)
                         + geared * clamp(S.engage, 0, 1) * 0.6, 90, 1200);
    if (driveF > tracMax) {
      // more than the road can take — the surplus goes into spinning rubber
      S.spinV = Math.min(18, S.spinV + ((driveF - tracMax) / spinMass) * dt);
      driveF = tracMax;
    } else if (S.spinV > 0) {
      // …and grip left over drags it back down. This is the hook-up, and it
      // is the same equation, which is why it feels like one event.
      S.spinV = Math.max(0, S.spinV - ((tracMax - driveF) / spinMass + 1.5) * dt);
    }
  } else {
    S.spinV = Math.max(0, S.spinV - 12 * dt);
    S.tcCut = 0;                             // nothing slipping, nothing to cut
  }
  S.slipR = sRatio;
  S.tracF = Math.max(0, driveF);             // what pitches the car next frame

  // the factory governor. The big saloons and SUVs are limited to a number
  // rather than run out of gearing, and it feels exactly like this: the car
  // is still pulling, then it simply isn't, and the needle sits there.
  if (CC.vmaxKmh) {
    const lim = CC.vmaxKmh / 3.6;
    if (Math.abs(S.v) > lim - 1.5) driveF *= clamp((lim - Math.abs(S.v)) / 1.5, 0, 1);
  }
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

  // what the drive is actually putting through the road, for the screen
  // and the battery: positive under power, negative under regen
  S.powerW = driveF * S.v;

  if (isEv()) {
    if (S.evBoost > 0) {
      S.evBoost = Math.max(0, S.evBoost - dt);
      if (S.evBoost === 0) { S.evCool = EV_COOL_S; sfxBeep(520, 0.18, 0.09); }
    } else if (S.evCool > 0) {
      S.evCool = Math.max(0, S.evCool - dt);
      if (S.evCool === 0) sfxBeep(1180, 0.14, 0.08);
    }
    // ludicrous pulls hard on the pack, well beyond what the wheels see
    if (DMG.on && S.evBoost > 0) S.batt = clamp(S.batt - dt * 0.004, 0, 1);
    evSimTick(dt);
  }

  battTick(dt);
  fuelTick(dt, Te);
  refuelTick(dt);
  dmgTick(dt, Te, engage, ratio, braking);

  S.rpm = clamp(S.rpm, 0, S.parkLimit ? S.parkLimit : ENG.cut * 1.24);
  // the start-up ceiling is absolute — momentum doesn't get to carry the
  // needle through it either, so the guard outlives the flare by a beat
  S.catchGuard = Math.max(0, (S.catchGuard || 0) - dt);
  if (S.catchGuard > 0 && S.catchPeak) S.rpm = Math.min(S.rpm, S.catchPeak);

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
    // most burble pops are little ones in the car's own voice; every so
    // often one lets go properly
    const st = crackleStyle();
    const amp = (0.34 + Math.random() * 0.36) * Math.min(1.4, pMul);
    const bang = Math.random() < st.bang * 0.55 * pMul;
    const voice = bang ? "bang" : pickVoice(st);
    sfxPop(amp, undefined, voice);
    popFlame((POP_FLAME[voice] || 0.4) * (0.65 + amp * 0.7));
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
        warnChime(1);
        sayEvent("cel", "Check engine", { cool: 45 });
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
  S._shiftDir = down ? -1 : 1;
  S.autoGear = g; S.gear = g;
  // torque-converter smooth: a brief torque interruption and NOTHING else. No
  // throttle blip — a blip keeps the throttle alive while the clutch is open
  // during the shift, which free-revs the engine (the "sudden high revs" bug).
  // With the blip gone, shiftCut cleanly cuts drive and the revs simply flow
  // onto the new gear's ratio, exactly like a real automatic.
  // a seamless box overlaps the clutches and hands the torque across, so
  // there is no interruption to hear and nothing to announce
  S.shiftCut = seamless() ? 0.03 : (down ? 0.16 : 0.12);
  S.shiftCool = 0.7;
  S.blip = 0; S.blipTarget = null;
  if (!seamless()) { sfxClunk(0.1); flashGear(); }   // barely-there thunk
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

/* ================================================================
   CONSEQUENCES — opt-in mechanical sympathy
   ================================================================
   Off by default: the bay is a sandbox and it should stay one. Switched on in
   the workshop, the car stops being indestructible and three things start
   keeping score:

     ENGINE  past the fuel cut the valves are floating. Bouncing off the
             limiter kills it slowly; a money shift — dropping two gears at
             speed and dumping the clutch — spins it so far past the cut that
             it lets go in under a second.
     CLUTCH  slipping the plates while the engine is making real torque glazes
             them. A glazed clutch holds less, which makes it slip more.
     BRAKES  heat soaks in faster than it radiates out. Hot brakes fade, and
             fade is what turns one late corner into two.

   Everything here is derived from state the physics already computes, so none
   of it changes how the car drives until the driver earns it. */
const DMG = {
  on: false,
  engine: 0, clutch: 0, brakes: 0,   // 0..1
  blown: false,
};

/* fade curves. Both stay at full strength through the first half of the gauge
   — you get a warning band before anything actually stops working. */
function dmgBrakeFade() {
  return DMG.on ? 1 - 0.45 * clamp((DMG.brakes - 0.5) / 0.5, 0, 1) : 1;
}
function dmgClutchHold() {
  return DMG.on ? 1 - 0.5 * clamp((DMG.clutch - 0.35) / 0.65, 0, 1) : 1;
}

/* ================================================================
   FUEL & CHARGE — the other half of consequences
   ================================================================
   With consequences off, every car in the bay is on an infinite hose: the
   tank never moves and the pack never moves, because a sandbox where you
   have to stop and fill up is a worse sandbox.

   Switch consequences on and both start counting. Petrol burns off the power
   the engine is ACTUALLY making — brake-specific fuel consumption against
   crank output — so idling costs you almost nothing and holding a V12 at the
   limiter costs you a tank. The pack drains on the power the wheels see and
   takes a little back under regen. Run either one to zero and the car stops,
   because that is what running out means.

   Everything below is real numbers with one thumb on the scale: CONS_RATE
   compresses the clock, so a hard session empties a tank in ten minutes or
   so instead of two hours. Nothing else is fudged. */
const CONS_RATE = 4;          // sim-time compression on both the tank and the pack
const BSFC_L_KWH = 0.42;      // petrol at the crank: ~0.31 kg/kWh ÷ 0.745 kg/L
const EV_KWH = 100;           // default pack, if a car doesn't state one

/* does this thing drink? does it plug in? — asked of the engine currently
   BOLTED IN, so swapping a V12 into the electric car gives it a tank */
function usesFuel() { return !isEv(); }
function usesCharge() { return isEv() || !!CC.edrive; }

/* tank size in litres — stated per car, otherwise scaled off the engine,
   because nobody hangs a 90-litre tank behind a three-cylinder */
function tankL() { return CC.tank || clamp(24 + CC.cyl * 4.5, 18, 100); }
function packKwh() { return CC.battKwh || (isEv() ? EV_KWH : 8); }

/* fuel burn. Te is crank torque this instant, so the product with rpm is the
   power the engine is genuinely making — which is the only honest way to do
   this. Coasting in gear costs nothing; the same road speed with your foot in
   it costs plenty. */
function fuelTick(dt, Te) {
  if (!DMG.on || !usesFuel()) { S.fuel = 1; return; }
  if (!S.engineOn) return;
  const kW = Math.max(0, Te * S.rpm * (Math.PI / 30)) / 1000;
  const idleLh = 0.5 + CC.cyl * 0.14;          // pumping losses and accessories
  const lph = idleLh + kW * BSFC_L_KWH;
  const was = S.fuel;
  S.fuel = clamp(S.fuel - (lph / 3600) * CONS_RATE * dt / tankL(), 0, 1);
  if (was > 0.15 && S.fuel <= 0.15) {
    warnChime(1);
    sayEvent("lowfuel", "Low fuel", { cool: 90 });
  }
  if (S.fuel <= 0) runDry();
}

/* the pack. Drains on what the wheels actually took, gives a fraction back
   under regen, tops itself up from the engine on a hybrid that's running on
   petrol, and fills slowly whenever the car is sitting in Park. */
function battTick(dt) {
  if (!DMG.on || !usesCharge()) { S.batt = 1; return; }
  const onMotor = isEv() || (CC.edrive && S.powered && S.eDrive === "ev");
  const kw = S.powerW / 1000;
  let d = 0;
  if (onMotor && !(S.batt <= 0 && kw > 0)) {
    d = -(kw * dt / 3600) / packKwh();
    if (kw < 0) d *= 0.6;                      // regen is never free
  } else if (CC.edrive && S.engineOn) {
    // running on the engine: it puts charge back in, and the e-motor's
    // torque-fill takes a bite out of it again every time you ask for power
    d = dt * (1 / (11 * 60)) - dt * S.throttle * (1 / (7 * 60));
  }
  // parked on the charger — the deal every EV offers: empty it doing launches,
  // then wait. Sitting in P with the car drawing real power (revving it, or
  // holding it against the parking brake) isn't parked, it's posing.
  if (S.mode === "auto" && S.autoSel === "P" && Math.abs(S.v) < 0.3 && Math.abs(kw) < 5)
    d += dt * (1 / (14 * 60));
  const was = S.batt;
  S.batt = clamp(S.batt + d, 0, 1);
  if (was > 0.12 && S.batt <= 0.12) {
    warnChime(1);
    sayEvent("lowcharge", isEv() ? "Low charge" : "Pack depleted", { cool: 90 });
  }
}

/* is there anything left to make torque with? */
function starved() {
  if (!DMG.on) return false;
  if (isEv()) return S.batt <= 0;
  return usesFuel() && S.fuel <= 0;
}

/* the tank goes dry. It doesn't switch off — it starves: the mixture leans
   out, it stumbles twice looking for fuel that isn't there, and then it's
   just a heavy car rolling. */
function runDry() {
  if (!S.engineOn) return;
  S.fuel = 0;
  S.engineOn = false; S.cranking = false; S.acc = false;
  S.powered = false; S.boost = 0; S.locked = false;
  clearTimeout(S.crankTimer); S.crankTimer = 0;
  accNagStop(); accBedStop(0.1);
  updateRunLamp();
  sfxBackfire();
  setTimeout(sfxBackfire, 150);
  setTimeout(() => sfxClunk(0.9), 340);
  warnChime(1);
  sayEvent("dry", "Out of fuel", { cool: 20 });
  $("lampStall").classList.add("lit", "blink");
  showStallCard("OUT OF FUEL",
    "It'll crank all day and never catch. Roll to a stop, open the " +
    "<b>WORKSHOP</b> and fill it.");
  updateDmgUi();
}

/* ---- the pump ----
   Stationary, and for petrol switched off, same as anywhere with a roof over
   the forecourt. It takes a few seconds and you can hear it happening. */
const REFUEL = { t: 0, dur: 0, kind: null };

function refuelBusy() { return REFUEL.t > 0; }

function startRefuel() {
  if (!DMG.on) return;
  initAudio();
  if (AU.ctx && AU.ctx.state === "suspended") AU.ctx.resume();
  if (refuelBusy()) { endRefuel(false); return; }     // second press pulls the nozzle
  if (Math.abs(S.v) > 0.5) {
    sfxBeep(220, 0.25, 0.12);
    sayEvent("fuelmove", "Stop the car first", { cool: 6 });
    return;
  }
  const wantFuel = usesFuel() && S.fuel < 0.999;
  const wantChg = usesCharge() && S.batt < 0.999;
  if (!wantFuel && !wantChg) { sfxBeep(1180, 0.14, 0.08); return; }
  if (wantFuel && (S.engineOn || S.cranking)) {
    sfxBeep(220, 0.3, 0.13);
    sayEvent("fuelrun", "Switch it off first", { cool: 8 });
    return;
  }
  REFUEL.kind = wantFuel ? (wantChg ? "both" : "fuel") : "charge";
  REFUEL.dur = REFUEL.kind === "charge" ? 8 : 6;
  REFUEL.t = REFUEL.dur;
  sfxClunk(0.45);                                     // the nozzle going in
  if (REFUEL.kind === "charge") sfxCharger(REFUEL.dur);
  else sfxFuelPump(REFUEL.dur);
  refreshFuelCard();
  updateDmgUi();
}

function endRefuel(full) {
  REFUEL.t = 0; REFUEL.kind = null;
  sfxClunk(0.5);                                      // nozzle back on the hook
  if (full) { sfxBeep(1180, 0.16, 0.09); sayEvent("fuelled", "Full", { cool: 5 }); }
  refreshFuelCard();
  updateDmgUi();
}

function refuelTick(dt) {
  if (!refuelBusy()) return;
  // drive off mid-fill and the hose comes with you. It does not.
  if (Math.abs(S.v) > 0.5 || !DMG.on) { endRefuel(false); return; }
  const k = dt / REFUEL.dur;
  if (REFUEL.kind !== "charge" && usesFuel()) S.fuel = clamp(S.fuel + k, 0, 1);
  if (REFUEL.kind !== "fuel" && usesCharge()) S.batt = clamp(S.batt + k, 0, 1);
  REFUEL.t -= dt;
  if (REFUEL.t <= 0) {
    if (usesFuel()) S.fuel = 1;
    if (usesCharge()) S.batt = 1;
    $("lampStall").classList.remove("lit", "blink");
    $("stallOverlay").classList.remove("show");
    endRefuel(true);
    return;
  }
  updateDmgUi();
  if ($("workshop").classList.contains("open")) refreshFuelCard();
}

/* the forecourt: a hollow rush of liquid into a tank, climbing in pitch as
   the airspace above it shrinks — the sound you stop hearing and then
   suddenly notice change */
function sfxFuelPump(dur) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.loop = true;
  const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.8;
  f.frequency.setValueAtTime(280, t);
  f.frequency.linearRampToValueAtTime(1000, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.055, t + 0.4);
  g.gain.setValueAtTime(0.055, t + Math.max(0.5, dur - 0.5));
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  n.connect(f); f.connect(g); g.connect(AU.sfx);
  n.start(t); n.stop(t + dur + 0.05);
}

/* the charger: a contactor closing, then a DC hum and the cooling fan that
   runs the whole time a fast charger is pushing current */
function sfxCharger(dur) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = 120;
  const of = ctx.createBiquadFilter(); of.type = "lowpass"; of.frequency.value = 400;
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.linearRampToValueAtTime(0.035, t + 0.5);
  og.gain.setValueAtTime(0.035, t + Math.max(0.6, dur - 0.6));
  og.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(of); of.connect(og); og.connect(AU.sfx);
  o.start(t); o.stop(t + dur + 0.05);

  const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.loop = true;
  const nf = ctx.createBiquadFilter(); nf.type = "bandpass";
  nf.frequency.value = 900; nf.Q.value = 0.9;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.linearRampToValueAtTime(0.018, t + 0.6);
  ng.gain.setValueAtTime(0.018, t + Math.max(0.7, dur - 0.6));
  ng.gain.linearRampToValueAtTime(0.0001, t + dur);
  n.connect(nf); nf.connect(ng); ng.connect(AU.sfx);
  n.start(t); n.stop(t + dur + 0.05);
}

/* the workshop card reads back what's actually in the car */
function refreshFuelCard() {
  const card = $("wsFuel");
  if (!card) return;
  card.classList.toggle("hide", !DMG.on);
  if (!DMG.on) return;
  const f = usesFuel(), c = usesCharge();
  const name = refuelBusy()
    ? (REFUEL.kind === "charge" ? "CHARGING…" : "FILLING…")
    : f && c ? "REFUEL & CHARGE" : c ? "CHARGE" : "REFUEL";
  card.querySelector(".ws-card-name").textContent = name;
  card.classList.toggle("on", refuelBusy());
  const bits = [];
  if (f) bits.push(Math.round(S.fuel * 100) + "% fuel · " + Math.round(tankL()) + "L tank");
  if (c) bits.push(Math.round(S.batt * 100) + "% charge · " + packKwh() + " kWh");
  $("wsFuelDesc").textContent = refuelBusy()
    ? bits.join(" · ") + " — press again to pull the nozzle."
    : bits.join(" · ") + ". Bring it to a stop to fill it" +
      (f ? "; petrol wants the engine switched off." : ".");
}

function dmgReset(keepMode) {
  DMG.engine = DMG.clutch = DMG.brakes = 0;
  DMG.blown = false;
  if (!keepMode) DMG.on = !!S.dmgOn;
  // a fresh car arrives brimmed and fully charged
  REFUEL.t = 0; REFUEL.kind = null;
  S.fuel = 1; S.batt = 1;
  $("blownOverlay").classList.remove("show");
  updateDmgUi();
}

function dmgTick(dt, Te, engage, ratio, braking) {
  if (!DMG.on) { DMG.brakes = Math.max(0, DMG.brakes - dt * 0.25); return; }

  // --- engine: over-rev. Severity is how far past the cut, not just whether.
  if (S.engineOn && !DMG.blown && ENG.cut > 0) {
    const over = S.rpm / ENG.cut;
    if (over > 1.02) {
      DMG.engine = Math.min(1, DMG.engine + dt * (over - 1.02) * 9);
      if (DMG.engine >= 1) blowEngine();
    }
  }

  // --- clutch: slip × torque. Riding it at idle costs nothing; slipping it
  // against a V12 at full noise destroys it in seconds.
  if (!DMG.blown && ratio && engage > 0.04 && engage < 0.985) {
    const wheelRpm = Math.abs(S.v) / CAR.wheelR * Math.abs(ratio) * (60 / (2 * Math.PI));
    const slip = Math.abs(S.rpm - wheelRpm);
    if (slip > 180)
      DMG.clutch = Math.min(1, DMG.clutch + dt * (slip / 11000) * clamp(Math.abs(Te) / 420, 0, 3));
  }

  // --- brakes: heat in from work done, heat out all the time
  const work = braking * Math.abs(S.v);          // watts, near enough
  DMG.brakes = clamp(DMG.brakes + dt * (work / 5.2e6) - dt * 0.055, 0, 1);
  if (DMG.brakes > 0.82 && Math.random() < dt * 2.2) sayEvent("fade", "Brakes fading", { cool: 8 });

  updateDmgUi();
}

/* the money shift: it lets go, loudly, once */
function blowEngine() {
  DMG.blown = true; DMG.engine = 1;
  S.engineOn = false; S.cranking = false; S.acc = false;
  S.powered = false; S.boost = 0; S.locked = false;
  clearTimeout(S.crankTimer); S.crankTimer = 0;
  accNagStop(); accBedStop(0.1);
  updateRunLamp();
  // one enormous bang, then the wreckage rolling to a stop
  sfxPop(1.9, undefined, "bang");
  setTimeout(() => { sfxBackfire(); sfxClunk(1.6); }, 90);
  setTimeout(() => sfxClunk(1.1), 260);
  popFlame(1);
  warnChime(1);
  sayEvent("blown", "Engine let go", { cool: 30 });
  $("lampCel").classList.add("lit", "blink");
  $("lampRev").classList.add("lit", "blink");
  $("blownOverlay").classList.add("show");
  updateDmgUi();
}

/* fresh engine, fresh plates, cold discs */
function rebuildCar() {
  dmgReset(true);
  $("lampCel").classList.remove("lit", "blink");
  $("lampRev").classList.remove("lit", "blink");
  S.rpm = 0; S.v = 0; S.gear = 0; S.autoSel = "P"; S.autoGear = 1;
  sfxClunk(0.8);
  sayEvent("rebuilt", "Rebuilt", { cool: 2 });
}

function updateDmgUi() {
  const strip = $("dmgStrip");
  if (!strip) return;
  strip.classList.toggle("show", DMG.on);
  if (!DMG.on) return;
  const set = (id, v) => {
    const el = $(id);
    el.style.setProperty("--fill", (v * 100).toFixed(0) + "%");
    el.classList.toggle("warn", v > 0.5);
    el.classList.toggle("bad", v > 0.82);
  };
  set("dmgEngine", DMG.engine);
  set("dmgClutch", DMG.clutch);
  set("dmgBrakes", DMG.brakes);

  // fuel and charge read the other way round — the bar is what's left, and
  // a car only shows the gauges it actually has behind the filler flap
  const lvl = (id, v, show) => {
    const el = $(id);
    el.classList.toggle("hide", !show);
    if (!show) return;
    el.style.setProperty("--fill", (v * 100).toFixed(0) + "%");
    el.classList.toggle("warn", v <= 0.28);
    el.classList.toggle("bad", v <= 0.1);
  };
  lvl("dmgFuel", S.fuel, usesFuel());
  lvl("dmgCharge", S.batt, usesCharge());
  $("dmgFuel").classList.toggle("filling", refuelBusy() && REFUEL.kind !== "charge");
  $("dmgCharge").classList.toggle("filling", refuelBusy() && REFUEL.kind !== "fuel");
}

/* the overlay does double duty — a stall you can restart out of, and a dry
   tank you can't. They want different words. */
function showStallCard(title, body) {
  $("stallTitle").textContent = title;
  $("stallBody").innerHTML = body;
  $("stallOverlay").classList.add("show");
}

function stallEngine() {
  S.engineOn = false; S.stalled = true; S.locked = false;
  updateRunLamp();
  sfxClunk(1.4);
  warnChime(1);
  sayEvent("stall", "Engine stalled", { cool: 3 });
  showStallCard("ENGINE STALLED",
    "Clutch in, then hold <b>ENGINE START</b> — or hold <kbd>I</kbd>");
  $("lampStall").classList.add("lit", "blink");
}

/* ================================================================
   IGNITION
   ================================================================ */

/* every physical press of the button lands here. On the Sant'Agata cars the
   red cover has to come up first — that press costs you nothing but the flip.
   After that it's a real switch under your thumb, so it clicks. */
function ignitionDown() {
  initAudio();
  if (AU.ctx && AU.ctx.state === "suspended") AU.ctx.resume();
  if (S.cranking) return;                   // already turning over
  if (DMG.blown) {                          // nothing left in there to light
    sfxClunk(0.5);
    $("blownOverlay").classList.add("show");
    return;
  }

  if (CC.startCap && !S.capOpen) {
    S.capOpen = true;
    $("ignition").classList.add("cap-open");
    sfxCapFlip(true);
    return;
  }
  // key cars turn a barrel; everything else is a switch under your thumb
  if (CC.ignKey) sfxKeyTurn(S.engineOn ? -1 : 1);
  else sfxIgnClick();
  toggleIgnition();
}

/* Letting go matters. You hold the button — or hold the key over against
   its spring — until it lights; let go early and the starter drops out and
   the engine falls back to nothing, same as the real thing. */
function ignitionUp() {
  if (S.cranking) abortCrank();
}

// a complete press-and-hold, for everything that isn't a finger on the
// button: the gamepad, the autopilot, a scripted start
function ignitionPress() {
  ignitionDown();
  if (S.cranking) {
    const hold = ((S.crankP && S.crankP.dur) || 0.8) * 1000 + 150;
    setTimeout(ignitionUp, hold);
  }
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
      accNagStop(); accBedStop(0.35);
      sfxClunk(0.45);
      closeStartCap();
      updateRunLamp(); updateEdriveUi();
      return;
    }
    // A plug-in hybrid has no "start the engine" button — it has a POWER
    // button. Press it and the car wakes in silence on its e-motors. Lighting
    // the combustion engine is a separate, deliberate act: the eDrive button
    // (or H). That's how the real cars behave, and it's the whole party trick.
    powerUpEv();
    return;
  }

  if (S.engineOn) {
    S.engineOn = false; S.acc = false;
    accNagStop(); accBedStop(0.35);
    sfxClunk(0.5);
    closeStartCap();
    updateRunLamp();
    return;
  }
  // EV: no starter motor — just power up with a chime
  if (CC.ev) {
    if (DMG.on && S.batt <= 0) {          // a flat pack won't even wake it
      sfxBeep(220, 0.35, 0.14);
      sayEvent("lowcharge", "No charge", { cool: 12 });
      return;
    }
    S.engineOn = true; S.stalled = false; S.acc = true;
    S.rpm = 0; S.sweep = 0;
    $("stallOverlay").classList.remove("show");
    $("lampStall").classList.remove("lit", "blink");
    sfxEvBoot();
    setTimeout(() => sayVoice("Systems ready"), 700);
    updateRunLamp();
    return;
  }
  // race cars: the starter button is the LAST thing that happens, and only
  // once the panel above it is fully live. Nothing here is a shortcut.
  if (CC.race) {
    if (!raceReady()) {
      sfxRaceDeny();
      const p = $("racePanel");
      p.classList.remove("nudge"); void p.offsetWidth; p.classList.add("nudge");
      return;
    }
    if (S.engineOn) { killRaceEngine(); return; }
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
    accNagStart(CC.bootRich ? 2200 : 1500);   // …then it starts asking
    updateRunLamp();
    return;
  }

  /* THE CLUTCH. You cannot start a manual car without it, and the reason is
     not electronics — it is that the gearbox might be in gear, and a starter
     motor is more than strong enough to drive the car into whatever is in
     front of it. Every manual made in the last forty years has an interlock
     on the pedal for exactly that reason, and pressing the button with your
     foot off it does nothing at all: no click, no crank, nothing.

     Only the gated cars have a clutch pedal to press, so only they are
     asked. */
  if (S.mode === "clutch" && (S.in.clutch || 0) < 0.55) {
    sfxRaceDeny();
    const pg = $("pgClutch");
    pg.classList.remove("nudge"); void pg.offsetWidth; pg.classList.add("nudge");
    sayEvent("clutchstart", "Clutch pedal", { cool: 4 });
    return;
  }

  // crank — hybrids quick-start: the e-motor spins it up faster and quieter
  const quiet = !!CC.edrive;
  accNagStop();                       // it got what it was asking for
  const p = crankProfile(CC);
  // the e-motor spins it up fast and near-silently, but once it lights it
  // still swings up like anything else — it just gets there sooner
  if (quiet) { p.dur = 0.4; p.rpm *= 1.9; p.fires = 2; }
  S.acc = true;
  S.cranking = true; S.stalled = false;
  S.crankP = p;
  $("stallOverlay").classList.remove("show");
  $("lampStall").classList.remove("lit", "blink");
  const btn = $("ignition");
  btn.classList.add("cranking");
  AU.crankFx = sfxCrank(p, quiet ? 0.4 : 1.25);
  // the needle sits at cranking speed, wavering on every compression, and the
  // whole thing runs on the clock rather than a timeout so letting go of the
  // button can stop it dead partway through
  const chugHz = (p.cyl / 2) * (p.rpm / 60);
  const crank0 = performance.now();
  const crankAnim = () => {
    if (!S.cranking || S.crankSeq !== seq) return;
    const el = (performance.now() - crank0) / 1000;
    S.rpm = p.rpm * (0.86 + 0.14 * Math.min(1, el / p.dur))
          + Math.sin(el * chugHz * 6.283) * p.rpm * 0.16;
    requestAnimationFrame(crankAnim);
  };
  crankAnim();
  // the catch runs off a timer, not the animation frame: a backgrounded tab
  // stops painting but the engine still has to light when it lights
  clearTimeout(S.crankTimer);
  S.crankTimer = setTimeout(() => engineCaught(p, quiet, seq), p.dur * 1000);
}

/* it lit. The starter drops out, the first fires throw the revs up to the
   start-up ceiling, and the settle takes over from there. */
function engineCaught(p, quiet, seq) {
  if (S.crankSeq !== seq || !S.cranking) return;
  // …unless there's nothing to light. An empty tank cranks perfectly happily
  // — that's the cruel part. It spins, it half-fires, and it never catches.
  if (starved()) {
    S.cranking = false;
    clearTimeout(S.crankTimer); S.crankTimer = 0;
    $("ignition").classList.remove("cranking");
    if (AU.crankFx) { AU.crankFx.stop(0.05); AU.crankFx = null; }
    if (CC.ignKey) sfxKeyTurn(-1);
    sfxCrankDie(p);
    S.rpm = 0;
    warnChime(1);
    sayEvent("dry", "Out of fuel", { cool: 12 });
    $("lampStall").classList.add("lit", "blink");
    showStallCard("OUT OF FUEL",
      "The starter is fine. There's just nothing to light. Fill it in the " +
      "<b>WORKSHOP</b>.");
    return;
  }
  S.cranking = false;
  $("ignition").classList.remove("cranking");
  if (CC.ignKey) sfxKeyTurn(-1);      // sprung out of START, back to ON
  S.engineOn = true;
  armCel();                           // restart clears the code… for now
  S.rpm = p.rpm;                      // catches from cranking speed…
  S.catchAmt = p.flare;               // …and how hard it flares is the car's
  S.catchT = p.flareT;
  S.catchPeak = p.peak;               // …up to here and no further
  S.catchGuard = p.flareT + 0.8;
  // open pipes make a meal of the first fires; a stock system barely coughs
  sfxCatch(p, quiet ? 0.4 : 0.65 + Math.min(1.9, popsRating() * 0.5));
  S.sweep = 0;                        // needle sweep
  accBedStop(1.1);                    // the engine takes over from the fans
  // and you flip the cover back down over the running engine, which is what
  // everyone does — it has to come up again before you can stop it
  if (CC.startCap && S.capOpen)
    setTimeout(() => { if (S.engineOn) closeStartCap(); }, 1500);
  updateRunLamp();
}

/* let go too soon and it doesn't light. The starter drops out, the engine
   spins down on its own inertia, and you get one half-hearted cough out of
   whichever cylinder was nearly there — then nothing. */
function abortCrank() {
  if (!S.cranking) return;
  S.cranking = false;
  clearTimeout(S.crankTimer); S.crankTimer = 0;
  S.crankSeq = (S.crankSeq || 0) + 1;
  $("ignition").classList.remove("cranking");
  if (AU.crankFx) { AU.crankFx.stop(0.05); AU.crankFx = null; }
  if (CC.ignKey) sfxKeyTurn(-1);
  const p = S.crankP || crankProfile(CC);
  sfxCrankDie(p);
  S.rpm = 0;
  // it's still switched on, so it goes back to asking
  if (S.acc && !S.engineOn) accNagStart(900);
  updateRunLamp();
}

/* the sound of a start that didn't take: the starter winding down, one weak
   half-fire, and the engine coasting to a stop */
function sfxCrankDie(p) {
  if (!AU.ready) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  // the starter spinning down
  const w = ctx.createOscillator(); w.type = "sawtooth";
  w.frequency.setValueAtTime(p.whine * 0.95, t);
  w.frequency.exponentialRampToValueAtTime(p.whine * 0.18, t + 0.34);
  const wf = ctx.createBiquadFilter(); wf.type = "bandpass";
  wf.frequency.value = p.whine; wf.Q.value = 2.6;
  const wg = ctx.createGain();
  wg.gain.setValueAtTime(0.05, t);
  wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
  w.connect(wf); wf.connect(wg); wg.connect(AU.sfx); w.start(t); w.stop(t + 0.4);
  // the last two compressions, slowing down and dying out
  [[0.02, 0.5], [0.15, 0.28]].forEach(([dt, lvl]) => {
    const n = ctx.createBufferSource(); n.buffer = AU.noiseBuf; n.playbackRate.value = 0.3;
    const nf = ctx.createBiquadFilter(); nf.type = "lowpass"; nf.frequency.value = 300;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.26 * lvl, t + dt);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.09);
    n.connect(nf); nf.connect(ng); ng.connect(AU.sfx); n.start(t + dt); n.stop(t + dt + 0.11);
    const k = ctx.createOscillator(); k.type = "sine";
    k.frequency.setValueAtTime(80, t + dt);
    k.frequency.exponentialRampToValueAtTime(38, t + dt + 0.1);
    const kg = ctx.createGain();
    kg.gain.setValueAtTime(0.24 * lvl, t + dt);
    kg.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.12);
    k.connect(kg); kg.connect(AU.sfx); k.start(t + dt); k.stop(t + dt + 0.14);
  });
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
  // the engine lighting is not a reason to put the car in gear. In auto the
  // box just mirrors whatever the driver already has the selector on; in
  // sequential it stays exactly where they left it — it used to grab 1st for
  // you, which is not the car's decision to make.
  if (S.mode === "auto") {
    S.autoGear = 1;
    S.gear = S.autoSel === "D" ? 1 : S.autoSel === "R" ? "R" : 0;
  }
  S.rpm = 3500;                               // the fire-up flare
  S.shiftCool = 0.45;                         // a beat before the box reacts
  S.catchT = 0.1; S.catchAmt = 0.45; S.catchPeak = 3600;
  S.sweep = -1;
  sfxHybridFire();
  sayEvent("gas", CC.cyl >= 12 ? "V twelve engaged" : "Combustion engine engaged", { cool: 4 });
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
  if (DMG.on && S.batt <= 0.02) {             // the pack is flat — stay on petrol
    const b = $("edriveBtn"); b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake");
    sayEvent("lowcharge", "Pack depleted", { cool: 12 });
    return;
  }
  S.eDrive = "ev"; S.engineOn = false; S.rpm = 0; S.boost = 0;
  sfxEvBoot(0.7);                             // a quieter grace note mid-drive
  sayEvent("ev", "Electric mode on", { cool: 4 });
  updateRunLamp(); updateEdriveUi();
}

/* wake an eDrive car in silent electric mode — engine cold and untouched */
function powerUpEv() {
  initAudio();
  if (AU.ctx && AU.ctx.state === "suspended") AU.ctx.resume();
  if (S.cranking) return;
  // On a race car the hybrid system is downstream of the same panel
  // everything else is: master, ignition, fuel pump, and only then does
  // anything have power. Waking it on the motor alone would be a way to roll
  // out of the box with the car still switched off.
  if (CC.race && !raceReady()) {
    sfxRaceDeny();
    const p = $("racePanel");
    p.classList.remove("nudge"); void p.offsetWidth; p.classList.add("nudge");
    return;
  }
  S.crankSeq = (S.crankSeq || 0) + 1;
  S.powered = true; S.engineOn = false; S.eDrive = "ev"; S.acc = true;
  S.stalled = false; S.rpm = 0; S.boost = 0; S.sweep = 0;
  $("stallOverlay").classList.remove("show");
  $("lampStall").classList.remove("lit", "blink");
  sfxEvBoot();                              // the full welcome on power-up
  // a plug-in with a flat pack doesn't sit there being silent at you — it
  // wakes up, works out it has nothing, and lights the engine itself
  if (DMG.on && S.batt <= 0.02 && S.fuel > 0) {
    setTimeout(() => { if (S.powered && S.eDrive === "ev") fireHybrid(); }, 900);
    updateRunLamp(); updateEdriveUi();
    return;
  }
  setTimeout(() => sayVoice("Electric drive ready"), 900);
  updateRunLamp(); updateEdriveUi();
}

function toggleEdrive() {
  if (!CC.edrive) return;
  if (!S.powered) { powerUpEv(); return; }    // off → boot into silent EV
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
  S._shiftDir = dir;
  const target = order[j];
  if (target === "R" && Math.abs(S.v) > 1.6) {      // refuse reverse at speed
    sfxClunk(0.3);
    return;
  }
  flashSeqKey(dir);
  const lag = CC.shiftLag || 0;
  if (lag > 0) {
    // The paddle registers the command; the GEARBOX answers a beat later.
    // On a race dog box that beat is a tenth of a second and the dogs slam
    // home; on a road twin-clutch it's forty-odd milliseconds and the packs
    // swap quietly. Either way they are two events with a gap between them,
    // and the gap is what makes a shift feel like machinery.
    if (S.pendShift) return;             // one command at a time through the box
    S.pendShift = true;
    const car = CC.id;
    // a single-clutch automated manual is a manual gearbox with a robot
    // working the pedal — there is a real clutch to open, a real lever to
    // move, and you hear all of it. It belongs with the dog boxes, not with
    // the seamless twin-clutches. See mechBox.
    const dog = !!(CC.race || CC.gearWhine || CC.mechBox);
    sfxShift(0.75);                      // paddle in — command registered

    /* A race dog box genuinely stops the drive; a road single-clutch just
       opens a clutch and closes it again, and is far quicker about it.

       The dead time on a dog ring is not a gap in the sound. It is the part
       of the shift you actually hear, and it has THREE events in it, not one:

         1. the ignition dies         — the note stops dead, mid-note
         2. the selector moves        — a drum rotates, a fork drags a ring
                                        across its splines. Muffled, metallic,
                                        happening inside a case full of oil.
         3. the dogs SLAM             — steel finding steel at a few thousand
                                        rpm of relative speed, and then the
                                        ignition comes back on top of it

       Firing only 1 and 3 gives you a hole with a bang on the end, and the
       shift reads as a dropout rather than as machinery. Event 2 is the whole
       difference, and it costs one scheduled sound. */
    S.shiftCut = ((CC.race || CC.gearWhine) ? 0.075 : CC.mechBox ? 0.085 : 0.10) + lag;

    /* THE BLIP GOES FIRST. This was backwards: the throttle blip fired from
       seqEngage(), which runs when the dogs have already landed — so the car
       banged into the lower gear and THEN matched the revs, which is the one
       order it cannot happen in.

       A dog ring has no synchromesh. Nothing in the gearbox can drag the
       engine up to speed for you, so the ECU has to do it with the throttle
       BEFORE the dogs will go anywhere near engagement, and the dogs land on
       an engine that is already turning at the right speed. Get this the
       wrong way round and every downshift is a crunch that shouldn't be
       survivable. Get it right and you get the sound everyone knows: stab,
       revs leap, CLUNK, and the whole car settles onto engine braking. */
    if (dir < 0 && target !== 0 && target !== "R" && S.engineOn && Math.abs(S.v) > 3) {
      S.blip = Math.max(S.blip, lag + 0.14);
      S.blipTarget = matchRpm(target);
    }
    // the selector, roughly halfway through the gap — only on the boxes that
    // physically have one. A twin-clutch has nothing to drag anywhere.
    if (dog && lag > 0.07) {
      setTimeout(() => {
        if (CC.id === car && S.mode === "manual") sfxDogSelect(0.85);
      }, lag * 0.42 * 1000);
    }
    setTimeout(() => {
      S.pendShift = false;
      if (CC.id !== car || S.mode !== "manual") return;
      // a downshift lands harder than an upshift — see sfxDogEngage()
      if (dog) sfxDogEngage(dir < 0 ? 1.15 : 0.95, dir < 0);
      else sfxDctEngage(dir < 0 ? 1.0 : 0.9);
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
  const downshift = dir < 0 && target !== 0 && target !== "R"
                 && S.engineOn && Math.abs(S.v) > 3;
  if (downshift) {
    // instant boxes blip here because there was no gap to blip in; the lag
    // boxes already started theirs when the paddle moved (see seqShift)
    if (S.blip <= 0) { S.blip = 0.32; S.blipTarget = matchRpm(target); }
    S.shiftCut = Math.max(S.shiftCut, 0.16);

    /* THE TAKE-UP — the part that gives a downshift its weight.

       The dogs landing is a noise. What you FEEL a beat later is the whole
       driveline loading up backwards: the engine is now the slowest thing in
       the system, so every shaft, joint and diff between it and the road
       winds up against the play in it and then rings. That is a big, low,
       damped shunt through the floor about 40ms behind the clack, and it is
       the single most missing ingredient in a synthesized downshift —
       without it the gear change is a click, and with it the car has mass. */
    setTimeout(() => sfxDrivelineShunt(0.9 + Math.min(0.5, Math.abs(S.v) / 55)), 42);

    /* …and the bang, which lands LAST. The overrun pop is not the sound of
       the throttle opening, it is the sound of it slamming shut again at the
       top of the blip and dumping everything that didn't burn into a
       glowing pipe. So it goes off at the end of the blip, not at the start
       of the shift — which is also why you hear it a beat after the clunk
       rather than under it. */
    if (popsRating() >= 1) {
      const bang = popsRating() >= 2;
      const at = Math.max(90, Math.min(320, S.blip * 1000 * 0.62));
      setTimeout(() => {
        sfxPop(bang ? 0.72 : 0.54, undefined, bang ? "bang" : "crack");
        if (bang) popFlame(0.85);
      }, at);
    }
  }
  if (exSound().burble && S.engineOn && S.rpm > ENG.idle * 2)
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

/* ---------------- exhaust flames ----------------
   Real exhaust flames are not one colour, and which one you get is chemistry,
   not decoration:

     ORANGE  a rich, fuel-heavy charge burning at low pressure. The colour is
             glowing soot particles — the more unburnt fuel, the deeper and
             sootier the orange. This is the everyday overrun flame.
     BLUE    a LEAN charge lighting off under high pressure in an already
             red-hot pipe. Almost no soot survives, so you see the flame front
             itself. This is what a proper anti-lag setup throws.
     WHITE   a big slug of fuel going off all at once in a glowing pipe — hot
             enough that the core washes out to white before the orange edges
             catch up. The shotgun bangs.
     VIOLET  the fringe you get off long straight pipes at night, when the
             burn is clean and thin and there's nothing else lighting it.

   The workshop can pin any one of these, or leave it on AUTO and let the
   fitted system and the size of the pop decide. */
const FLAME_KINDS = ["orange", "blue", "white", "violet"];

function flameKind(power) {
  const set = curMod().flame || "auto";
  if (set !== "auto") return set;
  const ex = curEx();
  // anti-lag: fuel dumped straight into a glowing pipe, lean and high pressure
  if (ex.burble) return power > 0.85 ? "white" : power > 0.4 ? "blue" : "orange";
  // thin-wall race systems run hot enough to burn the charge clean up top
  if (ex.flameLean) return power > 0.82 ? "white" : power > 0.5 ? "blue" : "violet";
  // de-cat / open pipes are rich and sooty — deep orange, never blue
  if (ex.flameRich) return power > 0.88 ? "white" : "orange";
  return power > 0.9 ? "white" : "orange";
}

/* exhaust flame flash, synced to pops.
   power: 0..1 — how much fuel went off. Booleans still work (legacy calls). */
function popFlame(power) {
  if (isEv()) return;                      // no exhaust, nothing to burn
  if (!(popsRating() > 0)) return;
  if (typeof power === "boolean") power = power ? 0.7 : 0.3;
  // the workshop's flame-size knob scales the whole event: turn it down and
  // even a shotgun bang only licks the pipe, turn it up and ticks throw fire
  power = clamp((power === undefined ? 0.3 : power) * curMod().flameSize, 0, 1);
  if (power < 0.03) return;

  const kind = flameKind(power);
  const size = power > 0.78 ? "huge" : power > 0.4 ? "big" : "";
  const el = $("tipL");                    // one side-exit pipe now
  if (el) {
    el.className = "tip k-" + kind + (size ? " " + size : "");
    void el.offsetWidth; el.classList.add("fire");
    setTimeout(() => el.classList.remove("fire"), 360);
  }
  if (size || Math.random() < 0.55) {
    const gl = $("fireglow");
    gl.className = "fireglow k-" + kind + (size ? " " + size : "");
    void gl.offsetWidth; gl.classList.add("on");
  }
}

/* ---------------- the digital player ----------------
   The other cars get a tape deck with a mechanism you can hear. This one
   gets a screen: no moving parts, no transport noise, just a title and an
   equaliser that only moves when something is actually playing. It drives
   exactly the same Spotify transport as the deck — it's a different face on
   the same stereo, not a second one. */
function updateDPlayer() {
  if (!isEv()) return;
  const playing = !!MUS.playing;
  $("dpTitle").textContent = S.station ? stationName(S.station) : "NO SOURCE";
  $("dpDot").classList.toggle("live", playing);
  $("dpEq").classList.toggle("live", playing);
  $("dpPlay").classList.toggle("on", playing);
  $("dpPlayIcon").setAttribute("d", playing ? "M6 4h4v16H6zM14 4h4v16h-4z" : "M7 4l13 8-13 8z");
}

/* ---------------- the electric car's screen ----------------
   Called once when the car changes (chrome, buttons, mode lock) and once a
   frame while it's on screen (the live numbers). Split that way because the
   first one touches layout and the second one must not. */
function applyEvChrome() {
  const on = hasScreen();
  // an electric car has no exhaust to show, so the tip comes off entirely and
  // the space under the dash goes to the stereo. Swap a V12 in and the pipe
  // comes back, because now there is one.
  const noPipe = isEv();
  $("exhaust").classList.toggle("hide", noPipe);
  $("dplayer").classList.toggle("hide", !noPipe);
  updateDPlayer();
  document.body.classList.toggle("ev-dash", on);
  $("evScreen").setAttribute("aria-hidden", String(!on));
  $("evsName").textContent = CC.name.toUpperCase();

  // the two buttons belong to the drivetrain, not the dashboard: swap a V12
  // into this thing and they go away, along with the silence
  const ev = isEv();
  $("evBoostBtn").classList.toggle("hide", !ev);
  $("evV8Btn").classList.toggle("hide", !ev);
  if (!ev && S.evV8) { S.evV8 = false; buildEngineVoice(voiceCar()); applyFormants(); }

  // a single-speed car has nothing to shift, so it is automatic-only and the
  // other two modes are locked out rather than quietly ignored
  const only = forcedMode();
  document.querySelectorAll(".mode-btn").forEach(b => {
    const locked = !!only && b.dataset.mode !== only;
    b.classList.toggle("locked", locked);
    b.disabled = locked;
    b.title = locked
      ? (ev ? "Single-speed — this car is automatic only"
         : only === "clutch" ? "Gated six-speed and three pedals. That is the car."
         : "No manual mode — this car does not discuss its gearbox")
      : "";
  });
  if (only && S.mode !== only) setMode(only);
  updateEvUi();
}

/* button faces + the boost cell — anything that changes on a click, not a tick */
function updateEvUi() {
  if (!isEv()) return;
  const bBtn = $("evBoostBtn");
  const live = S.evBoost > 0, cool = S.evCool > 0;
  bBtn.classList.toggle("on-ev", live);
  bBtn.classList.toggle("cooling", cool);
  $("evBoostLbl").textContent = live ? S.evBoost.toFixed(1) + "s"
                              : cool ? Math.ceil(S.evCool) + "s" : "LUDICROUS";
  $("evV8Btn").classList.toggle("on-ev", S.evV8);
  $("evV8Lbl").textContent = S.evV8 ? "V8 ON" : "V8 SOUND";
}

function evScreenTick() {
  if (!hasScreen()) return;
  const ev = isEv();
  const kmh = S.units === "kmh";
  $("evsSpeed").textContent = Math.round(Math.abs(S.v) * (kmh ? 3.6 : 2.237));
  $("evsUnit").textContent = kmh ? "km/h" : "mph";

  // the power meter reads outward from the middle: drive right, regen left
  const kw = S.powerW / 1000;
  const peak = 700;
  $("evsDrive").style.width = (clamp(kw / peak, 0, 1) * 50).toFixed(2) + "%";
  $("evsRegen").style.width = (clamp(-kw / (peak * 0.35), 0, 1) * 50).toFixed(2) + "%";
  $("evsKw").textContent = (kw >= 0 ? "" : "−") + Math.round(Math.abs(kw)) + " kW";

  // The battery is a consequence, not a dashboard ornament. With consequences
  // off this car simply never runs out, so a gauge that reads 100% forever is
  // just a lie taking up screen — the cells come off and the remaining two
  // spread across the width.
  const tracking = DMG.on && usesCharge();
  $("evsBattCell").classList.toggle("hide", !tracking);
  $("evsRangeCell").classList.toggle("hide", !tracking);
  $("evScreen").querySelector(".evs-foot").classList.toggle("no-batt", !tracking);
  const pct = Math.round(S.batt * 100);
  if (tracking) {
    $("evsBattFill").style.width = pct + "%";
    $("evsBattFill").classList.toggle("low", S.batt < 0.15);
    $("evsBattPct").textContent = pct + "%";
    $("evsRange").textContent = Math.round(S.batt * 480) + (kmh ? " km" : " mi");
  }
  $("evsRpm").textContent = v8SimOn()
    ? Math.round(S.simRpm).toLocaleString() + " rpm"
    : Math.round(S.rpm).toLocaleString() + " rpm";

  const sel = S.mode === "auto" ? S.autoSel : (S.gear === 0 ? "N" : S.gear === "R" ? "R" : "D");
  $("evsGear").querySelectorAll("span").forEach(el =>
    el.classList.toggle("on", el.dataset.g === sel));

  const badge = !S.engineOn ? "OFF"
              : S.evBoost > 0 ? "LUDICROUS"
              : S.evV8 ? "V8 SIM"
              : tracking && S.batt < 0.1 ? "LOW CHARGE"
              : tracking && S.mode === "auto" && S.autoSel === "P" ? "CHARGING" : "READY";
  const bEl = $("evsBadge");
  if (bEl.textContent !== badge) bEl.textContent = badge;
  bEl.dataset.state = badge.toLowerCase().replace(/ /g, "-");

  $("evsBoostCell").classList.toggle("live", S.evBoost > 0);
  $("evsBoostCell").classList.toggle("cool", S.evBoost <= 0 && S.evCool > 0);
  $("evsClock").textContent = $("clockNum").textContent;
  if (ev) updateEvUi();
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
    // no gear number on a car that refuses to have gears
    return ["D", seamless() ? "drive" : "gear " + S.autoGear];
  }
  if (S.gear === 0) return ["N", "neutral"];
  if (S.gear === "R") return ["R", "reverse"];
  return [String(S.gear), "gear"];
}

function setMode(mode) {
  // The one place every route into a driving mode passes through — the mode
  // buttons, the gamepad cycle, and the saved-settings restore, which runs
  // AFTER the per-car lock in applyEvChrome() and would otherwise put a
  // reloaded page straight back into a gearbox the car hasn't got.
  const only = forcedMode();
  if (only && mode !== only) mode = only;
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
  const base = CARS.find(c => c.id === id) || CARS[1];
  const car = swapEngineInto(base);      // stock engine unless one's been swapped in
  CC = car;
  S.capOpen = false;                     // new car arrives with the cover down
  applyCar(car);

  // full reset — new car arrives parked, engine off
  S.crankSeq = (S.crankSeq || 0) + 1;
  S.cranking = false; S.engineOn = false; S.stalled = false;
  clearTimeout(S.crankTimer); S.crankTimer = 0;
  S.acc = false; S.capOpen = false; S._overWarn = 0;
  dmgReset();                            // new car, fresh engine and cold discs
  accNagStop(); accBedStop(0.2);
  clearVox();
  S.powered = false; S.eDrive = "gas";
  S.rpm = 0; S.v = 0; S.boost = 0; S.locked = false;
  S.seqStage = 0; S._seqPrev = 0;
  turboRigReset();               // four cold turbochargers, not the last car's
  armCel();
  S.gear = 0; S.autoSel = "P"; S.autoGear = 1;
  S.shiftCut = 0; S.shiftCool = 0; S.cutTimer = 0; S.blip = 0; S.catchT = 0; S.sweep = -1;
  S.pendShift = false;
  S.spinV = 0; S.slipR = 0; S.tracF = 0; S.tcCut = 0; S.lockup = false;
  S.evBoost = 0; S.evCool = 0;
  IND.side = 0; IND.on = false; IND.t = 0;   // the stalk springs back
  resetRaceSwitches();
  S.simGear = 1; S.simRpm = V8SIM.idle; S.simCut = 0;
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
  applyEvChrome();
  updateIndicatorUi();
  document.querySelectorAll(".car-chip").forEach(b =>
    b.classList.toggle("on", b.dataset.car === car.id));

  tachG.rebuild(); speedG.rebuild();
  applyCabin();                          // how hard THIS car seals (see hush)
  if (AU.ready) buildEngineVoice(voiceCar());
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
      this.osc.connect(this.olp); this.olp.connect(this.og); this.og.connect(AU.sfx);
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
  $("wsSwap").addEventListener("change", () => {
    const chassis = CC.id;               // CC.id is always the chassis, swapped or not
    curMod().swap = $("wsSwap").value;
    save();
    selectCar(chassis);                  // rebuilds the engine, gauges and voice
    sfxClunk(0.7);                       // the lump dropping onto its mounts
  });
  $("wsFlame").addEventListener("input", () => {
    curMod().flameSize = parseFloat($("wsFlame").value);
    $("wsFlameVal").textContent = fmtFlame();
    save();
  });
  document.querySelectorAll("#wsFlameCol .ws-card").forEach(b =>
    b.addEventListener("click", () => {
      curMod().flame = b.dataset.flame;
      refreshWorkshop();
      popFlame(0.85);                      // audition it right there in the bay
      save();
    }));
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
    S.spinV = 0; S.slipR = 0; S.tracF = 0; S.tcCut = 0; S.lockup = false;
    refreshWorkshop();
    sfxClunk(0.4);
    save();
  });
  $("wsGrip").addEventListener("click", () => {
    curMod().grip = !curMod().grip;
    S.spinV = 0; S.slipR = 0; S.tcCut = 0; S.lockup = false;
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
  $("wsDmg").addEventListener("click", () => {
    S.dmgOn = !S.dmgOn;
    DMG.on = S.dmgOn;
    dmgReset(true);                        // switching modes starts you clean
    refreshWorkshop();
    sfxClunk(0.5);
    save();
  });
  $("wsFuel").addEventListener("click", startRefuel);
  document.querySelectorAll("#wsListen .ws-card").forEach(b =>
    b.addEventListener("click", () => setListen(b.dataset.listen)));
  document.querySelectorAll("#wsSpace .ws-card").forEach(b =>
    b.addEventListener("click", () => setSpace(b.dataset.space)));
  $("wsShare").addEventListener("click", openSpecCard);
  $("scClose").addEventListener("click", closeSpecCard);
  $("scCopy").addEventListener("click", copySpecLink);
  $("speccard").addEventListener("click", (e) => { if (e.target === $("speccard")) closeSpecCard(); });
  $("blownRebuild").addEventListener("click", rebuildCar);
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
function fmtFlame() { return "×" + curMod().flameSize.toFixed(1); }
function fmtRev(r) {
  if (Math.abs(r - 1) < 0.001) return "stock";
  const p = Math.round((r - 1) * 100);
  return (p >= 0 ? "+" : "") + p + "%";
}

function refreshWorkshop() {
  $("wsCar").textContent = CC.name;
  updateJobCard();
  document.querySelectorAll("#wsExhausts .ws-card").forEach(b =>
    b.classList.toggle("on", b.dataset.ex === curMod().ex));
  document.querySelectorAll("#wsShift .ws-card").forEach(b =>
    b.classList.toggle("on", b.dataset.shift === curMod().shift));
  document.querySelectorAll("#wsPaddle .ws-card").forEach(b =>
    b.classList.toggle("on", b.dataset.paddle === curMod().paddle));
  $("cabinBtn").classList.toggle("on", S.cabin);
  refreshListenUi();
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
  refreshSwapPicker();
  $("wsFlame").value = curMod().flameSize;
  $("wsFlameVal").textContent = fmtFlame();
  document.querySelectorAll("#wsFlameCol .ws-card").forEach(b =>
    b.classList.toggle("on", b.dataset.flame === curMod().flame));
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
  $("wsDmg").classList.toggle("on", S.dmgOn);
  $("wsDmg").querySelector(".ws-card-name").textContent =
    "CONSEQUENCES — " + (S.dmgOn ? "ON" : "OFF");
  refreshFuelCard();
  $("wsAids").classList.toggle("on", aidsOn);
  $("wsAids").querySelector(".ws-card-name").textContent =
    "DRIVER AIDS — " + (aidsOn ? "ON" : "OFF");
  const gripOn = curMod().grip === true;
  $("wsGrip").classList.toggle("on", gripOn);
  $("wsGrip").querySelector(".ws-card-name").textContent =
    "GRIP — " + (gripOn ? "ON" : "OFF");
  $("modBtn").classList.toggle("on",
    curMod().ex !== "stock" || curMod().pitch !== 1 || curMod().gear !== 1 ||
    curMod().vol !== 1 || curMod().tone !== 0 || curMod().pop !== 1 ||
    curMod().flame !== "auto" || curMod().flameSize !== 1 || curMod().swap ||
    curMod().rev !== 1 || curMod().tune || !aidsOn || gripOn ||
    curMod().shift !== "stock" || curMod().paddle !== "stock");
}

/* the engine-swap dropdown: every engine in the garage, grouped so the stock
   one is never buried among thirty donors */
function refreshSwapPicker() {
  const sel = $("wsSwap"), chassis = CC.id, cur = curMod().swap || "";
  const stock = CARS.find(c => c.id === chassis);
  const donors = CARS.filter(c => c.id !== chassis)
    .map(c => `<option value="${esc(c.id)}">${esc(c.name)} — ${esc(c.layout)}</option>`)
    .join("");
  sel.innerHTML =
    `<option value="">FACTORY — ${esc(stock ? stock.layout : "as delivered")}</option>` +
    `<optgroup label="Swap in">${donors}</optgroup>`;
  sel.value = cur;
  if (sel.value !== cur) sel.value = "";  // donor was deleted from the garage
  const donor = cur && CARS.find(c => c.id === cur);
  $("wsSwapNote").textContent = donor
    ? `${donor.name}'s ${donor.layout} in the ${stock ? stock.name : "chassis"}. ` +
      `Redline ${(CC.max / 1000).toFixed(1)}k, ` +
      `${Math.round(CC.mass)}kg, clutch uprated to ${Math.round(CAR.clutchCap)}Nm.`
    : "Factory engine, as delivered.";
  sel.classList.toggle("on", !!cur);
}

/* the docket clipped to the bench: a stable per-car job number and a count
   of how many things have been changed from factory */
function updateJobCard() {
  const m = curMod();
  const changed = [
    m.ex !== "stock", m.swap, m.pitch !== 1, m.vol !== 1, m.tone !== 0,
    m.pop !== 1, m.flame !== "auto", m.flameSize !== 1, m.gear !== 1,
    m.rev !== 1, m.tune, m.abs === false,
    m.shift !== "stock", m.paddle !== "carbon",
  ].filter(Boolean).length;
  let h = 0;
  for (const ch of CC.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  $("wsJob").textContent =
    "DS-" + (1000 + h % 9000) + " · " + (changed ? changed + " MOD" + (changed > 1 ? "S" : "") : "STOCK");
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
  sayEvent("ad", "Auto drive engaged", { cool: 3 });
}

function autodriveOff() {
  if (!AD.on) return;
  AD.on = false; AD.gas = 0; AD.brake = 0;
  sayEvent("adOff", "Manual control", { cool: 3 });
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
  if (AU.ready) clusterBeep(AU.ctx.currentTime, 1568, 0.07, 0.04);
  sayEvent("cruise", "Cruise control set", { cool: 3 });
  updateCruiseUi();
}

function cruiseOff() {
  if (!S.cruise.on) return;
  S.cruise.on = false;
  sayEvent("cruiseOff", "Cruise cancelled", { cool: 3 });
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
  updateDPlayer();                       // the EV wears a different face on the same stereo
  $("casLabel").textContent = S.station ? stationName(S.station) : "NO TAPE";
  if (stateTxt) $("casState").textContent = stateTxt;
  else if (S.station) $("casState").textContent = MUS.playing ? "playing" : "paused — press play";
}

function setPlaying(p) {
  if (MUS.playing === p) return;
  MUS.playing = p;
  updateMasterGain();          // the car steps back the moment the music starts
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
  updateMasterGain();          // a tape in the deck already shifts the balance
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
/* ---------------- the music balance ----------------
   Spotify's stream is DRM-boxed: we can't touch its gain, and in the bare
   embed fallback we can't even see inside the iframe. So VOL doesn't make the
   music louder — it pulls the CAR back, which your ear reads as the same
   thing. Turn it up and the engine, the road, the weather and everything else
   step aside; turn it down and the car comes back over the top of the track.

   That's not a trick so much as how a real stereo fight works, and it's the
   only lever we actually have. */

/* Should the deck be treated as running?
   With the Web Playback SDK or the IFrame API we're told. With the plain
   embed there is no telemetry at all — so once a tape is loaded we assume
   it's playing, because a volume slider that silently does nothing is a much
   worse outcome than one that leans in a moment early. */
function deckLive() {
  if (MUS.playing) return true;
  const telemetry = !!MUS.player || !!MUS.ctrl;   // something that reports back
  return !!S.station && !telemetry;
}

/* how far the world steps back, 0..1 (1 = untouched) */
function musicDuck() {
  if (!deckLive()) return 1;
  // Shaped rather than linear. The bottom half of the travel barely moves the
  // car, so you can nudge the balance; the top half pulls away hard, so the
  // end of the slider is where the "turn it UP" feeling lives.
  // With the windows up there's less road noise to compete with, so the
  // stereo wins by more — same as sitting in a real car.
  const depth = (inCabin() ? 0.82 : 0.64) * Math.pow(clamp(MUS.vol, 0, 1), 1.5);
  return 1 - depth;
}

function updateMasterGain() {
  if (!AU.ready) return;
  const t = AU.ctx.currentTime, duck = musicDuck();
  AU.master.gain.setTargetAtTime(S.muted ? 0 : 0.85 * duck, t, 0.25);
  // the interior bus skips the cabin filter, not the volume knob — mute and
  // music ducking still have to reach the chimes
  AU.innerMaster.gain.setTargetAtTime(S.muted ? 0 : 0.85 * duck, t, 0.25);
  // Rain and traffic hang off their own bus, downstream of nothing — so they
  // ducked for exactly no one. Turning the music up used to leave the weather
  // roaring straight over the top of it. (This also means MUTE finally mutes
  // the weather, which it never did either.)
  AU.amb.gain.setTargetAtTime(S.muted ? 0 : duck, t, 0.25);
  updateDuckReadout();
}

/* say out loud what the slider is doing, so it doesn't look broken */
function updateDuckReadout() {
  const el = $("tpDuck");
  if (!el) return;
  const cut = Math.round((1 - musicDuck()) * 100);
  el.textContent = cut > 0 ? "car −" + cut + "%" : "car full";
  el.classList.toggle("live", cut > 0);
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

/* ================================================================
   BUILD CARD — a whole build in a link
   ================================================================
   A build is just a car id plus that car's workshop entry, so it fits in a
   URL fragment. The fragment never leaves the browser (that's the point of
   using a hash rather than a query string), and opening one applies it as a
   normal workshop change — nothing is trusted beyond "is this a car we have,
   and are these numbers in range". */

function b64urlEncode(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(str) {
  const pad = str.replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(escape(atob(pad + "===".slice((pad.length + 3) % 4))));
}

function buildCode() {
  return b64urlEncode(JSON.stringify({ v: 1, car: CC.id, mod: curMod() }));
}

function buildUrl() {
  const base = location.origin + location.pathname;
  return base + "#b=" + buildCode();
}

/* apply a build code from the address bar, if there's one there */
function applyBuildFromUrl() {
  const m = /[#&]b=([A-Za-z0-9\-_]+)/.exec(location.hash || "");
  if (!m) return false;
  let data;
  try { data = JSON.parse(b64urlDecode(m[1])); } catch (_) { return false; }
  if (!data || !data.car || !CARS.some(c => c.id === data.car)) return false;

  const src = data.mod || {}, m2 = {};
  // whitelist + clamp: a shared link may only set things the workshop can set
  if (EXHAUSTS[src.ex]) m2.ex = src.ex;
  if (CARS.some(c => c.id === src.swap)) m2.swap = src.swap;
  if (FLAME_KINDS.includes(src.flame) || src.flame === "auto") m2.flame = src.flame;
  if (["stock", "click", "metal"].includes(src.shift)) m2.shift = src.shift;
  if (["stock", "mech", "metal", "carbon"].includes(src.paddle)) m2.paddle = src.paddle;
  const num = (k, lo, hi) => {
    const v = parseFloat(src[k]);
    if (Number.isFinite(v)) m2[k] = clamp(v, lo, hi);
  };
  num("pitch", 0.7, 1.3); num("vol", 0.6, 1.6); num("tone", -800, 1200);
  num("pop", 0, 2); num("flameSize", 0, 2); num("gear", 0.7, 1.3); num("rev", 0.5, 3);
  m2.tune = !!src.tune;
  m2.abs = src.abs !== false;
  m2.grip = src.grip === true;

  S.mods[data.car] = m2;
  selectCar(data.car);
  history.replaceState(null, "", location.origin + location.pathname);
  return true;
}

function openSpecCard() {
  closeWorkshop();
  const donor = curMod().swap && CARS.find(c => c.id === curMod().swap);
  $("scName").textContent = CC.name;
  $("scLayout").textContent = donor ? donor.layout + " — swapped in" : CC.layout;
  $("scExhaust").dataset.look = curEx().look || "stock";
  $("scTip").className = "tip k-" + flameKind(0.9);

  const rows = [
    ["EXHAUST", curEx().name],
    ["REDLINE", (ENG.max / 1000).toFixed(1) + "k rpm"],
    ["MASS", Math.round(CAR.mass) + " kg"],
    ["FINAL DRIVE", CAR.finalDrive.toFixed(2)],
    ["PITCH", fmtPitch()],
    ["VOLUME", fmtVol()],
    ["TONE", fmtTone()],
    ["POPS", fmtPop()],
    ["FLAMES", fmtFlame() + " · " + (curMod().flame === "auto" ? "auto" : curMod().flame)],
    ["REV SPEED", fmtRev(curMod().rev)],
    ["TUNE", curMod().tune ? "race flash" : "stock"],
    ["AIDS", curMod().abs === false ? "off" : "on"],
    ["GRIP", curMod().grip ? "unlimited" : "as delivered"],
  ];
  $("scSpecs").innerHTML = rows
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");

  const url = buildUrl();
  $("scUrl").value = url;
  $("scNote").textContent =
    "Anyone opening this link gets your exact car, engine and workshop settings.";
  $("speccard").classList.add("show");
}

function closeSpecCard() { $("speccard").classList.remove("show"); }

function copySpecLink() {
  const input = $("scUrl");
  input.select();
  const done = (ok) => {
    $("scNote").textContent = ok ? "Link copied — paste it anywhere."
                                 : "Couldn't copy automatically — the link is selected, hit copy.";
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(input.value).then(() => done(true), () => done(false));
  } else {
    try { done(document.execCommand("copy")); } catch (_) { done(false); }
  }
}

function save() {
  try {
    localStorage.setItem("dwnshift", JSON.stringify({
      theme: document.body.dataset.theme, units: S.units, mode: S.mode, muted: S.muted,
      voice: S.voice,
      car: CC.id, tunnel: S.tunnel, flyby: S.flyby, cabin: S.cabin, stock: S.stock, mods: S.mods,
      listen: S.listen, space: S.space,
      traffic: S.traffic, rain: S.rain, lt: S.ltTgt, ltBest: LT.best,
      dmgOn: S.dmgOn, evV8: S.evV8, batt: S.batt, fuel: S.fuel,
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
      case "KeyG": if (down && !e.repeat) $("stockBtn").click(); return true;
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
      case "KeyI":
        if (down && !e.repeat) ignitionDown(); else if (!down) ignitionUp();
        return true;
      case "KeyH": if (down && !e.repeat) toggleEdrive(); return true;
      case "KeyB": if (down && !e.repeat) toggleEvBoost(); return true;
      case "Comma":  if (down && !e.repeat) setIndicator(-1); return true;
      case "Period": if (down && !e.repeat) setIndicator(1); return true;
      case "KeyJ": if (down && !e.repeat) toggleEvV8(); return true;
      case "KeyL":
        if (down && !e.repeat) LT.phase === "off" ? openLaunch() : closeLaunch();
        return true;
      case "Escape":
        if (down) { closeWorkshop(); closeLaunch(); closeSpecCard(); toggleCassette(false); }
        return false;
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

  const ign = $("ignition");
  ign.addEventListener("pointerdown", e => { e.preventDefault(); ignitionDown(); });
  ign.addEventListener("pointerup", ignitionUp);
  ign.addEventListener("pointerleave", ignitionUp);
  ign.addEventListener("pointercancel", ignitionUp);
  window.addEventListener("blur", ignitionUp);
  // keyboard "press" on a focused button would fire a second, phantom start
  ign.addEventListener("click", e => e.preventDefault());
  $("edriveBtn").addEventListener("click", toggleEdrive);
  $("evBoostBtn").addEventListener("click", toggleEvBoost);
  $("evV8Btn").addEventListener("click", toggleEvV8);
  $("dpPlay").addEventListener("click", () => { if (MUS.player) MUS.player.togglePlay(); });
  $("dpPrev").addEventListener("click", () => { if (MUS.player) MUS.player.previousTrack(); });
  $("dpNext").addEventListener("click", () => { if (MUS.player) MUS.player.nextTrack(); });
  $("dpLib").addEventListener("click", () => toggleCassette());
  $("tsigL").addEventListener("click", () => setIndicator(-1));
  $("tsigR").addEventListener("click", () => setIndicator(1));
  for (const k of RACE_SWITCHES)
    $("rsw" + k[0].toUpperCase() + k.slice(1)).addEventListener("click", () => raceSwitch(k));

  document.querySelectorAll(".mode-btn").forEach(b =>
    b.addEventListener("click", () => {
      if (b.classList.contains("locked")) return;   // single-speed cars: auto only
      setMode(b.dataset.mode);
    }));

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
    refreshListenUi();           // the note explains why it may have done nothing
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
    applySpace();                    // …and the world outside it steps back
    refreshSpaceUi();
    save();
  });

  // FACTORY STOCK — see the STOCK table. Nothing about the car changes, only
  // how loud it is allowed to be about it.
  $("stockBtn").addEventListener("click", () => {
    S.stock = !S.stock;
    $("stockBtn").classList.toggle("on", S.stock);
    applyFormants();                 // the pipe stops shifting the resonances
    sayEvent("stock", S.stock ? "Factory exhaust" : "Sport exhaust", { cool: 0 });
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

  /* the two sequential keys are real buttons — clicking them shifts exactly
     as Q and E do, so a mouse or a phone can drive the box too */
  document.querySelectorAll(".seq-key").forEach(b => {
    b.addEventListener("click", () => {
      initAudio();
      if (AU.ctx && AU.ctx.state === "suspended") AU.ctx.resume();
      const dir = +b.dataset.seq;
      if (S.mode === "clutch") kbSeqGate(dir); else seqShift(dir);
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

const GP = { index: null, prevButtons: [], ignHeld: false };

function initGamepad() {
  window.addEventListener("gamepadconnected", (e) => { GP.index = e.gamepad.index; });
  window.addEventListener("gamepaddisconnected", (e) => {
    if (GP.index === e.gamepad.index) {
      GP.index = null;
      if (GP.ignHeld) { GP.ignHeld = false; ignitionUp(); }   // don't leave it cranking
    }
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

/* how far in the trigger is, is how far down the pedal is. A rest deadzone
   so a pad that never quite reads zero doesn't creep, rescaled so the very
   first millimetre of travel still counts, then a gentle curve that spreads
   the bottom of the pedal out — that's where all the useful control is, and
   a linear trigger makes a 600hp car feel like a light switch. */
function pedalCurve(v, gamma) {
  const dz = 0.055;
  if (v <= dz) return 0;
  const t = (v - dz) / (1 - dz);
  return Math.pow(t, gamma);
}

/* Full pad mapping. Everything the standard layout gives us does something.

   RT / R2 ....... throttle (analog — how hard you press is how far it opens)
   LT / L2 ....... brake (analog)
   A / Cross ..... clutch, held (manual + clutch mode)
   B / Circle .... cruise control set / cancel
   X / Square .... auto drive on / off
   Y / Triangle .. eDrive EV <-> engine on the hybrids, cabin view otherwise
   RB / R1 ....... shift up
   LB / L1 ....... shift down
   View / Share .. cycle auto -> manual -> manual+clutch
   Menu/Options .. ignition — HOLD it to crank, exactly like the button
   L3 ............ night drive
   R3 ............ cabin / exterior view
   D-pad up ...... selector toward P
   D-pad down .... selector toward D
   D-pad left .... previous car
   D-pad right ... next car                                                  */
const GP_MAP = {
  CLUTCH: 0, CRUISE: 1, AUTODRIVE: 2, EDRIVE: 3,
  DOWN: 4, UP: 5, BRAKE: 6, GAS: 7,
  MODE: 8, IGNITION: 9, NIGHT: 10, CABIN: 11,
  SEL_UP: 12, SEL_DOWN: 13, CAR_PREV: 14, CAR_NEXT: 15,
};
const PRND = ["P", "R", "N", "D"];
const GP_MODES = ["auto", "manual", "clutch"];

function gpSelector(dir) {
  if (S.mode !== "auto") return;
  const i = clamp(PRND.indexOf(S.autoSel) + dir, 0, PRND.length - 1);
  const b = document.querySelector(`.prnd button[data-sel="${PRND[i]}"]`);
  if (b) b.click();
}

function gpCycleCar(dir) {
  const i = CARS.findIndex(c => c.id === CC.id);
  const next = CARS[(i + dir + CARS.length) % CARS.length];
  if (next) selectCar(next.id);
}

function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = GP.index != null ? pads[GP.index] : null;
  if (!gp) gp = Array.from(pads).find(p => p) || null;
  if (!gp) return;
  GP.index = gp.index;
  const prev = GP.prevButtons;
  const held = i => !!(gp.buttons[i] && gp.buttons[i].pressed);

  /* --- the pedals. Analog buttons on the standard mapping, with an axis
         fallback for the pads that report triggers as axes instead. --- */
  const rawGas = gp.buttons[GP_MAP.GAS]
    ? gp.buttons[GP_MAP.GAS].value : Math.max(0, gp.axes[5] || 0);
  const rawBrake = gp.buttons[GP_MAP.BRAKE]
    ? gp.buttons[GP_MAP.BRAKE].value : Math.max(0, gp.axes[4] || 0);
  S.in.gas = pedalCurve(rawGas, 1.45);      // most of the travel is the bottom half
  S.in.brake = pedalCurve(rawBrake, 1.25);  // brakes want a little less curve
  if (S.mode === "clutch")
    S.in.clutch = held(GP_MAP.CLUTCH) ? 1 : 0;

  /* --- the ignition is press-and-hold on the pad too --- */
  const ignNow = held(GP_MAP.IGNITION);
  if (ignNow && !GP.ignHeld) ignitionDown();
  else if (!ignNow && GP.ignHeld) ignitionUp();
  GP.ignHeld = ignNow;
  prev[GP_MAP.IGNITION] = ignNow;

  /* --- paddles, exactly like a Forza-style sequential box --- */
  if (gpPressed(gp, GP_MAP.UP, prev)) {
    if (S.mode === "manual") seqShift(1);
    else if (S.mode === "clutch") kbSeqGate(1);
  }
  if (gpPressed(gp, GP_MAP.DOWN, prev)) {
    if (S.mode === "manual") seqShift(-1);
    else if (S.mode === "clutch") kbSeqGate(-1);
  }

  /* --- everything else --- */
  if (gpPressed(gp, GP_MAP.CRUISE, prev)) toggleCruise();
  if (gpPressed(gp, GP_MAP.AUTODRIVE, prev)) toggleAutodrive();
  if (gpPressed(gp, GP_MAP.EDRIVE, prev)) {
    if (CC.edrive) toggleEdrive();          // hybrids: EV <-> engine
    else $("cabinBtn").click();             // everything else: a spare view key
  }
  if (gpPressed(gp, GP_MAP.MODE, prev))
    setMode(GP_MODES[(GP_MODES.indexOf(S.mode) + 1) % GP_MODES.length]);
  if (gpPressed(gp, GP_MAP.NIGHT, prev)) setNight(!S.night);
  if (gpPressed(gp, GP_MAP.CABIN, prev)) $("cabinBtn").click();
  if (gpPressed(gp, GP_MAP.SEL_UP, prev)) gpSelector(-1);
  if (gpPressed(gp, GP_MAP.SEL_DOWN, prev)) gpSelector(1);
  if (gpPressed(gp, GP_MAP.CAR_PREV, prev)) gpCycleCar(-1);
  if (gpPressed(gp, GP_MAP.CAR_NEXT, prev)) gpCycleCar(1);
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
  pedalSfxTick();
  indicatorTick(dt);
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

  evScreenTick();

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
  // sitting on the limiter is the one thing worth nagging about: it keeps
  // warning, and keeps saying so, for as long as you keep doing it
  if (over) {
    if (!S._overWarn || performance.now() - S._overWarn > 1500) {
      S._overWarn = performance.now();
      warnChime(2);
    }
    sayEvent("rev", "Over rev", { cool: 1.9, rate: 1.15, volume: 0.6 });
  } else if (S._overWarn && S.rpm < ENG.max * 0.9) {
    S._overWarn = 0;
  }
  /* --- THE DEAD DASH ---------------------------------------------------
     A car that is switched off has no instruments. Not dim ones — none. The
     needles lie wherever they stopped, the screens are black glass, and the
     warning lamps are just coloured lenses with nothing behind them. Every
     driving game gets this wrong by leaving the cluster lit on the menu
     screen, and the moment you fix it the first press of the starter stops
     being a button and starts being an event, because it is the thing that
     brings the car's face to life.

     Anything with current in it counts: accessory position, cranking,
     running, or an EV that has been woken up. */
  document.body.classList.toggle("dash-dead",
    !(S.acc || S.engineOn || S.cranking || (CC.edrive && S.powered)));

  $("lampShift").classList.toggle("lit", S.engineOn && S.rpm > ENG.max * 0.93 && !over);
  // the traction lamp flickers when the tires go past their peak, not the
  // moment they slip at all — every launch slips a little, and a light that
  // comes on for a chirp is a light nobody reads
  const slipping = (S.slipR || 0) > 0.2 || S.lockup;
  $("lampGrip").classList.toggle("lit", slipping);
  $("lampGrip").classList.toggle("blink", slipping);
  if (slipping && S.engineOn)
    sayEvent("grip", S.lockup ? "Wheels locked" : "Traction loss", { cool: 9 });

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
  S.stock = !!saved.stock;
  $("stockBtn").classList.toggle("on", S.stock);
  S.flyby = !!saved.flyby;
  $("flybyBtn").classList.toggle("on", S.flyby);
  S.cabin = !!saved.cabin;
  $("cabinBtn").classList.toggle("on", S.cabin);
  if (LISTEN[saved.listen]) S.listen = saved.listen;
  refreshListenUi();
  if (SPACES[saved.space]) S.space = saved.space;
  refreshSpaceUi();
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
  S.dmgOn = !!saved.dmgOn;
  DMG.on = S.dmgOn;
  S.evV8 = !!saved.evV8;
  // the tank and the pack only survive a reload if they mean anything —
  // with consequences off they're both notionally full forever
  if (S.dmgOn) {
    if (typeof saved.batt === "number") S.batt = clamp(saved.batt, 0, 1);
    if (typeof saved.fuel === "number") S.fuel = clamp(saved.fuel, 0, 1);
  }

  CC = swapEngineInto(CARS.find(c => c.id === saved.car) || CARS[1]);
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
  applyEvChrome();
  updateIndicatorUi();
  resetRaceSwitches();

  $("boostWrap").classList.toggle("hide", CC.asp === "na" || CC.asp === "ev" || CC.edrive);
  updateEdriveUi();
  document.querySelectorAll(".car-chip").forEach(b =>
    b.classList.toggle("on", b.dataset.car === CC.id));

  document.querySelectorAll(".swatch").forEach(s =>
    s.classList.toggle("active", s.dataset.t === document.body.dataset.theme));
  $("unitsBtn").textContent = S.units === "kmh" ? "KM/H" : "MPH";
  $("speedUnitLbl").textContent = S.units === "kmh" ? "km/h" : "mph";

  setMode(saved.mode || "auto");
  updateDmgUi();
  applyBuildFromUrl();                     // "#b=…" wins over the saved car

  // rebuild dial faces once web fonts arrive (numerals use JetBrains Mono)
  if (document.fonts && document.fonts.ready)
    document.fonts.ready.then(() => { tachG.rebuild(); speedG.rebuild(); positionGlider(); });

  requestAnimationFrame(frame);
})();
