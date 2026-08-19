# Dwn-Shift

An immersive interface driving simulator. Every engine is synthesized in the
browser — no samples — so each car has its own firing order, its own crank,
and its own voice.

## Controller

Any standard Xbox or PlayStation pad. Every button on the standard layout
does something.

| Control | Xbox | PlayStation | What it does |
|---|---|---|---|
| Throttle | **RT** | **R2** | Analog — how hard you press is how far the pedal goes |
| Brake | **LT** | **L2** | Analog |
| Clutch | **A** | **Cross** | Held, in Manual + Clutch mode |
| Shift up | **RB** | **R1** | |
| Shift down | **LB** | **L1** | |
| Ignition | **Menu** | **Options** | **Hold** to crank — let go early and it won't catch |
| Cruise control | **B** | **Circle** | Set / cancel. Needs a forward gear and ~25 km/h |
| Auto drive | **X** | **Square** | The car takes over. Touch a pedal to take it back |
| eDrive | **Y** | **Triangle** | EV ⇄ engine on the hybrids; cabin view on everything else |
| Transmission mode | **View** | **Share** | Cycles Auto → Manual → Manual + Clutch |
| Night drive | **L3** | **L3** | Stick click |
| Cabin view | **R3** | **R3** | Stick click |
| Selector toward P | **D-pad up** | | P ← R ← N ← D, in Auto |
| Selector toward D | **D-pad down** | | P → R → N → D, in Auto |
| Previous car | **D-pad left** | | |
| Next car | **D-pad right** | | |

The triggers are properly analog: a rest deadzone so a worn pad doesn't
creep, then a curve that spreads the bottom of the pedal travel out, because
that's where all the useful control is.

## Keyboard

`W` throttle · `S` brake · `Space` / `C` clutch · `E` / `Q` sequential shift ·
`I` **hold** to start · `K` cruise · `A` auto drive · `N` night · `V` cabin ·
`F` flyby · `T` tunnel · `M` tape deck

## Starting a car

Not every car starts the same way.

- **Most cars** — hold the button.
- **Sant'Agata cars** (SVJ, V10 Evo, Revuelto, Urus) — flip the red cover first,
  then hold. It drops back down over the running engine, so it has to come
  up again before you can switch off.
- **Two-stage cars** (SVJ, 458, and the older stuff) — one press wakes the
  electronics, then hold to crank.
- **Older cars** (13R, MkIV, 6.2 SC, S6, M58, the diesel) — a real barrel
  lock. Key to ON, then hold it over against the spring to START.

- **Plug-in hybrids** (296, SF90, Revuelto, XM) — the button is a POWER
  button, not a starter. It wakes the car in silence on its motors; lighting
  the engine is a separate, deliberate press of **eDrive**.

Let go before it lights and the starter drops out, the engine falls back to
nothing, and the car goes back to reminding you it's switched on.

## The quiet one

The **Goodwood Phantom** is the only car in here built around not being
heard. Six-and-three-quarter litres of twin-turbo V12 making peak torque at
1700 rpm, so it never has to raise its voice — and 130kg of insulation,
double-skinned bulkheads and 6mm glass, so what little it does make doesn't
reach you.

Stand outside it and it sounds like the V12 it is. Press `V` for the cabin
and the world shuts off: the engine recedes to a weight somewhere ahead of
the bulkhead, the motorway roar stops, and you're left with a hum. That's
the `hush` property, and it's the only car that has one.

## Where you're listening from

Workshop → **WHERE YOU LISTEN**. Same engine, four microphones.

| | What it is |
|---|---|
| **Driver's seat** | Where every car in here is voiced. The default. |
| **Over the bonnet** | Induction roar, valve gear and turbo, right in front of you. The exhaust is fifteen feet behind your back, so the bass mostly isn't there. |
| **At the tailpipe** | All bass and rasp, every overrun bang going off in your face, no intake at all. The loudest place to stand and the least informative. |
| **Back seat** | Through the bulkhead and the parcel shelf. Boomy and distant — which is exactly what a chauffeur car is voiced for. |

The two outside positions genuinely are outside, so the cabin toggle does
nothing from there. You can be looking at the cabin and listening at the
tailpipe; the tailpipe wins.

The things that live inside the car with you — the chimes, the warning
tones, the indicator relay, the voice — run on their own bus that skips the
windows-up filter entirely. Sealing the car makes them **louder and
clearer**, not duller, because they were always in there with you. It's the
rest of the world that just got shut out.

## Compressor surge

`flutter` on a car is a number, not a flag, because the sound is a
consequence of plumbing. Shut the throttle under boost and the column of
pressurised air has to go somewhere:

- **No bypass valve** (the big single-turbo cars) — it slams back through a
  compressor still spinning at 130,000 rpm. The wheel stalls, the air escapes
  forward, the wheel bites again. Several separate events a second, spreading
  out and dropping in pitch as it spools down. That's the stu-tu-tu-tu.
- **A recirculating valve** (almost every factory car, for emissions reasons)
  — the air goes politely back round to the intake and all you get is the
  sigh.
- **Most cars are somewhere in between**, and do a bit of both.

All of it happens under the bonnet, so it is much quieter from inside the
car than from over the wing — and almost inaudible from the tailpipe.

Every twin-turbo car in the garage builds that sigh rather than plays a
recording of one — the two recordings belong to the quad-turbo car, and eight
litres of charge pipe pasted onto a V8 sounds like a V8 that borrowed
something. What the twins get instead is the event itself, in three parts: the
crack of the valve, a rush that falls and *darkens* as the pressure behind it
goes, and a low breath underneath that is the pipe volume emptying.

And it stays a detail. Nothing is ducked for it, so the engine plays straight
through — and where the quad-turbo car's plumbing gets *louder* with the
windows up, because on that car it genuinely is the loudest thing in the
cabin, this drops to under a third when you seal yourself in. You hear it
properly from outside, which is where a bypass valve actually is. How much
there is to hear is a property of the plumbing: open aftermarket valves let all
of it out, and a Phantom, built around you not hearing anything, lets out
almost none.

## Two kinds of automatic

**AUTO** is not one gearbox, because the cars in here do not have one gearbox.
A twin-clutch supercar in D has clutch plates in it and behaves like clutch
plates: the revs step across a shift, and what the tacho says is what the
gearing says. The ordinary cars — the hatch, the truck, the muscle car, the
SUVs, the Phantom, the drag missile — have a torque converter, which is two
bladed wheels facing each other in a case of oil, and that changes what the
needle does all day long:

- **It slips.** Lean on it and the engine sits a few hundred rpm above where
  the gearing says it should be. Floor it from a standstill and the revs do
  not climb with road speed at all — they flash to the stall speed and *sit*
  there while the speedo does the moving.
- **It multiplies torque.** Below the coupling point the turbine puts out
  nearly twice what the engine makes. It is also why the car creeps forward
  at idle with nothing holding it: maximum slip is maximum torque, and it
  falls away by itself as the car gathers speed.
- **It locks up.** Cruising, the two halves bolt together — the revs drop a
  couple of hundred, the engine steps back, and suddenly there is engine
  braking that was not there before. Ask for torque and it drops straight
  out again, and the revs rise before a single gear has changed.

The stall speed is derived from the engine behind it rather than typed in, so
a 6¾-litre V12 with its torque at 1700 gets a low one and the drag car gets a
deliberately loose 4,200.

## Kickdown

An automatic has two shift maps and a switch between them, and the switch is a
detent at the bottom of the pedal. Above it, the box is the comfort box: it
short-shifts, lives in the tall gears and never sees five thousand however
long you hold it. Through it, none of that applies — it drops as many gears as
it can without hitting the limiter, often two at once, and uses all of the
tacho. It will also go and find a lower gear on its own when the pedal is well
in, the revs are below anything useful and the car has stopped gaining speed,
which is what a hill is.

## The soft limiter

Workshop → **ECU & SETUP**. A stock limiter is a switch: past the number the
ECU stops the fuel, the revs fall, it lights again, and the engine hammers off
that wall several times a second. That bounce is the sound of a limiter.

A soft limiter switches nothing off. It takes the fuelling away *progressively*
across the last few hundred rpm, so the engine runs out of torque just before
it runs out of rev range — it arrives at the ceiling and stays there, flat and
quiet, no bounce and no bang. You can hold it against the stop all day and
never cross it. The taper is a fraction of each car's rev range rather than a
fixed number of rpm, so a 4,550rpm diesel and an 18,000rpm twin get the same
shape instead of the same width, and it applies to whatever ceiling is in
force — including the low one the automatic imposes in Park and Neutral.

## Running out

Consequences mode (workshop → **ECU & SETUP**) does three things to the car's
mechanical health. It also starts the clocks on the two things that actually
run out.

**Fuel** burns off the power the engine is genuinely making, not off elapsed
time — idling a V12 costs you almost nothing, holding it on the limiter costs
you a tank. Run dry and it doesn't switch off, it *starves*: it stumbles,
misses, and dies. After that the starter will spin all day and never catch.

**Charge** drains on what the wheels take and gives a fraction back under
regen. A plug-in tops its own pack up off the engine while it's running on
petrol, and anything sitting in **P** is on the charger.

To fill either, stop the car and use **REFUEL** in the workshop. Petrol wants
the engine switched off, the way it does anywhere with a roof over the
forecourt. Drive off mid-fill and the nozzle comes out.

With consequences **off**, nothing consumes anything — including the electric
car, which simply has no battery gauge at all until you switch consequences
on. A meter that reads 100% forever isn't a meter.
