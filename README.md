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

### The tailpipe is not the driver's seat with more bass

It used to be, and that was the problem: the EQ was right and the *position*
was wrong. Four things make standing a foot behind a running exhaust what it
is, and only one of them is tone.

- **Level.** It is simply the loudest place on the car, by a lot. No amount of
  low shelf makes something feel loud if it isn't louder.
- **Proximity.** A pipe has a length and the length has a note, so the bottom
  end now comes up as a resonant **peak** at 85Hz rather than a shelf. That is
  the difference between "bassy" and "standing behind a pipe".
- **Width.** At a metre away the tips are further apart than your ears are, so
  the sound stops being in front of you and wraps around you instead.
- **Gas.** The one nobody models. An exhaust is not only making a note, it is
  venting a few hundred litres a second of hot gas out of a hole, and that
  rush is broadband, loud, and has no pitch at all. From the driver's seat you
  cannot hear it — the note is thirty decibels louder by the time it gets
  there. At the pipe it is half of what you hear, and it is why a real
  tailpipe recording sounds dirty and physical where a synthesized one sounds
  like a tone generator. It rides **load**, not revs: lift off at seven
  thousand and the note stays while the rush vanishes.

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

Where you are standing decides how much of it you get. Outside — which is
where a bypass valve actually is — it is unmistakable, one of the things the
car is for, and it runs a little longer out there because nothing is eating
the tail. Sealed in it drops to under a fifth of that: nothing is ducked for
it, the engine plays straight through, and it stays a detail you notice. That
is the opposite of the quad-turbo car, whose plumbing gets *louder* with the
windows up, because on that car it genuinely is the loudest thing in the
cabin. How much there is to hear at all is a property of the plumbing: open
aftermarket valves let all of it out, and a Phantom, built around you not
hearing anything, lets out almost none.

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

## What a gear sounds like in the quad-turbo car

Down low the W16 has almost nothing to say — sixteen cylinders at two thousand
rpm are a rumble — and the four compressors are doing all the work. So that is
what you hear: the charge, one flat low note, right at the front of the mix.
Then the revs climb and the engine arrives, and the charge does not compete
with it. It fades out from underneath: by the limiter it is seven times
quieter than it was at four thousand, and the last part of every gear belongs
to the engine alone.

Then the shift dumps the lot — the stored charge goes out through the valves —
and the release is long, because eight litres of pipework does not empty
quickly. It is still sighing while the next gear is already pulling, and that
next gear starts again from the bottom with the whine back in front.

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

## The gearbox

A manual gearbox in a driving game is normally a switch with a permission on
it: hold the clutch, press the key, you are in the gear. That is not a
gearbox, that is a menu with a foot pedal.

Here is the machine instead. Between the engine and the road there is an
input shaft carrying the gears. The clutch decides whether that shaft is
bolted to the engine or free. The lever decides which gear is locked to the
output. And the one thing that has to be true before any gear will go in is
that **both sides are turning at the same speed** — which is the
synchroniser's entire job, and it takes time to do it.

Three things fall out of that, and all three are things drivers know in their
hands:

- **A shift takes as long as the shift is big.** 3rd to 4th at a steady speed
  drops straight in. 6th to 2nd is an enormous speed change, and the lever
  *hangs at the gate* for a beat while the cone does its work. That hesitation
  is not lag. It is the gearbox, and it is most of what a manual feels like.
- **The clutch is not a permission, it is a disconnection.** Fully in, the
  shaft is free and light and there is almost nothing to move. Half in, the
  shaft is still dragging on a spinning engine — so a brass cone the size of a
  bottle cap is now being asked to change the speed of a V10. It can't. It
  locks out, and you get the noise.
- **…which is why you can shift without the clutch at all.** Match the engine
  to the gear with your right foot and there is no speed difference left to
  kill. The lever slides through like there is nothing in the box.

The ring is deliberately quicker than a real one, and that is a decision
rather than an oversight: on a wheel and pedals you can meter a clutch to the
millimetre and blip to fifty rpm, and a strict cone would be a skill worth
learning. On a keyboard the clutch is in or out and the throttle is on or off,
so a strict cone is just a door that will not open. Everything the model is
*for* survives being loosened — the hang is still there and still proportional
to the shift, a half-declutched change still drags and grumbles, a hopeless
one still baulks. What is gone is the part that punished you for being ten
milliseconds late with a key.

So rev-matching earns something real. Blip on the way down and the mismatch
collapses, the hang disappears, and the change is instant and silent. Don't,
and it is slow, and the car shunts when the clutch comes up. **Double-declutch
and it works for the reason it works in a lorry** — blip in neutral with your
foot *off* the clutch and you spin the input shaft up yourself, so the synchro
has nothing left to do.

Reverse has a guard on it, because every six-speed ever built does.

### What a shift sounds like

The lever has a voice and the gearbox has a voice and they are not the same
object. The gearbox tells you how the shift went, and the grading is not
arbitrary — a matched change is a small oily **snick** because almost no
energy changed hands, and an unmatched one is a **clack** and a driveline
shunt because a great deal of it did.

The lever, meanwhile, is talking the whole time it moves: the detent ball
popping out of its notch, the boot dragging, the bump as you cross the sprung
centre plane, the stop at the end of the gate, the ball dropping into the
slot, the seat home, the spring throwing it back to the middle — and the
linkage chattering under your palm at idle, which stops the instant you press
the clutch.

And what it is **made of** changes all eight more than what it is *doing*
does, because every one of them is an impact and an impact is a spectrum.
An **exposed machined linkage** — billet rods and rose joints with no boot over
them, every pivot visible from the seat — is the one people know by ear, and
two things make it that sound. It is **two impacts, not one**: the linkage
takes up first and twenty-odd milliseconds later the detent slams into its
notch underneath, close enough that the ear hears one event with a texture,
far enough that collapsing them into a single click leaves you with a mouse
button. And it is **mechanical rather than metallic**, which are not the same
thing. A bright high transient with long ringing partials is a bell, or a
spanner dropped on a floor. This is a heavy short lever working a heavy shift
rod, and what your hand and your ear both report is *mass*: low, dense, over
almost immediately, with far more of it below 400Hz than above 2kHz. So the
transient sits down in the mid-hundreds and is broad rather than tight — a big
blunt impact excites everything, a small hard one excites a narrow band — the
ring partials are quiet and short, present enough to say metal and nowhere
near long enough to say bell, and the body underneath is the loudest component
in the event, because the body *is* the event. A short shifter is solid
alloy bushings — same impact, nothing absorbing it, so the pitch climbs and
you get the notchy k-chk people fit them for. An open gate is a steel ball in
a milled alloy plate, and the plate is a bell. A **wooden ball** is the
opposite of what a posh-looking knob suggests: wood across the grain is a
superb damper, so it is a dense, dry knock with real body and no ring at all.
Carbon and titanium weigh nothing, so there is no body — a bright tick over
silence.

Workshop → **SHIFTER FEEL**, and the default is whatever the car actually came
with, because a Zonda's open gate and a Carrera GT's beech ball are facts
about those cars rather than matters of taste.

## The third kind of gearbox

Until now there were two. A gate with three pedals, where the clutch is a
disconnection and the synchroniser does the work. And paddles, where there is
no clutch pedal at all and a computer does everything.

The **Ingolstadt S1 Quattro** has the one in between: a straight-cut **dog
sequential** with a real lever and a real clutch pedal.

### What the clutch is actually for

Worth being straight about this, because the first cut of this car got it
wrong. A rally sequential does **not** need the clutch on every change. The
clutch is for two things: getting the car moving, and stopping it again. On
the move you shift **clutchless** — you pull the lever, the ECU cuts the
ignition for fifty or eighty milliseconds, the load comes off the dogs on its
own, and the next gear goes in. That is a flat shift, it is what rally cars
have done since the early nineties, and it is why the onboards sound like the
engine is being *interrupted* rather than declutched.

(And for the record, the real Sport quattro S1 E2 had neither of those. It ran
a conventional H-pattern manual with a clutch on every shift. Its one famous
gearbox experiment was the *opposite* of a dog box — the Porsche-developed PDK
twin-clutch it trialled at San Remo in 1985. The clutched sequential modelled
here is the rally gearbox that came after it.)

So the pedal is required exactly where a real one is:

| | |
|---|---|
| **From a standstill** | Required. Into first, into reverse, or out to neutral with the car stopped. Nothing else can unload a dog ring against a stationary output shaft. Pull without it and the lever takes up its free play, finds a loaded ring and **stops dead** — a tick and a flat thud with no ring on it, because nothing rang: nothing moved. |
| **On the move** | Not required. Pull and go. |

And using it anyway is not pointless, which is the part worth modelling rather
than just gating. Dip the clutch on the move and the box does **not** have to
cut the ignition, so the engine pulls straight through the change. Clutchless
is quicker to do and there is an audible notch in the note every time;
clutched is cleaner and there isn't. Same gearbox, same lever, two different
sounds, and the difference is whether your foot moved.

### The lever

The cars that have a physical sequential now get one drawn, and it is a
completely different object from the gate next door. A gate is a plate with a
maze milled into it. A sequential is **one slot**, a very short throw, and a
lever that is spring-centred — it does not stay where you put it. You move it,
the drum indexes one notch, and the spring puts it back in the middle before
your hand has left the knob.

Which way is which is not arbitrary: racing convention is **pull back to go
up, push forward to go down**, because under acceleration your body is already
going backwards and pulling is the movement you can still make accurately at
1g. The plate is drawn from above, so "back toward the driver" is the *bottom*
of the slot — which is why `+` sits at the bottom, and why that looks wrong
until you think about where the driver is sitting.

The gear number lives on the knob, because a spring-centred lever tells you
nothing at all about which gear you are in. That is exactly why every car that
has one puts a display where the driver is already looking.

Paddle cars don't get a lever. Drawing one for a twin-clutch supercar would be
inventing hardware it hasn't got.

### It was making 876 horsepower

Two rounds of trying to slow this car down by adjusting grip and torque
missed the actual bug, which was a units mistake and a big one.

Every turbo car in here writes its **off-boost** torque into `curve`, and
`boostMax` multiplies it up to the published figures. The Ängelholm's comment
spells it out: 895 Nm of base × 1.68 lands on its quoted 1500. I had written
the S1's *real* torque straight into the curve — and then let `boostMax: 0.96`
nearly double it. 990 Nm and 876 hp in a 1,090 kg car. That is most of a Group
C car, and it is the entire reason it tore through every ratio and was in top
before you had finished looking at the tacho.

The curve is now worked *backwards* from Audi's numbers through the boost
model: 245 Nm of base at 5,500 × 1.96 = 480 Nm, and 228 at 7,500 = 469 hp.
Which is what they claim. The shape is the turbo's shape now rather than a
cliff drawn by hand on top of the turbo's cliff — the old curve was
double-counting that too.

### And it had one gear too many

With the power fixed, second gear was still on screen for **six tenths of a
second**. That is the "it just keeps shifting" problem, and it is arithmetic
rather than feel. Constant ratio steps give constant rpm drops, but the
*speed* span of each gear grows with the gear — so the early ones are narrow,
and this engine has its whole torque curve sitting exactly where second lives.

So it is a **five-speed**, which is what the Sport quattro S1 actually had.
Same spread, wider steps, one fewer shift, and no sixth to arrive in ten
seconds because there is no sixth. Measured through the sim's own physics
rather than by hand:

| gear | to | time in it |
|---|---|---|
| 1st | 57 km/h | 1.8s |
| 2nd | 91 | 1.1s |
| 3rd | 135 | 2.0s |
| 4th | 186 | 3.5s |
| 5th | 253 flat out | |

**0-100 in 3.30s** against the real car's 3.1, and 253 km/h against a quoted
250. First is deliberately short — this is a rally car, and a stage start
matters more than anything sixth was doing.

The engine under all this is a 2.1-litre **five**, which fires every 144°.
Five is odd, so no two cylinders ever balance and the exhaust pulses never
settle into pairs — the note walks, and that walk is the warble.

## Traction control is its own switch now

ABS is a brake system, traction control is an engine system, and they were
sharing one toggle. They don't any more — and a car is allowed to say it never
had one at all.

**Rear-wheel drive with the traction control off does not fail by spinning its
wheels. It fails by rotating.** And that falls out of the tyre curve that was
already in here rather than being bolted on beside it:

> A tyre's grip rises with slip to a peak and falls away past it. *Below* the
> peak the slope is positive, so any disturbance is self-correcting — push the
> back end sideways and the tyre pushes back harder. *Past* the peak the slope
> is **negative**. Push the back end sideways now and the tyre pushes back
> **less**. The car has stopped being a spring and become an amplifier, and
> the only thing left holding it straight is a person.

Which explains the rest of it:

- **It needs speed.** Past the peak at walking pace you get a burnout. At a
  hundred you get an incident, at the same slip ratio.
- **The throttle is the steering.** How far past the peak you are is your
  right foot. Lifting is not giving up, it is the correction.
- **But not all at once.** Lift hard at a big angle and the rear finds grip
  while the car is still rotating, and all that stored yaw has to go
  somewhere. It goes the other way, faster, with the opposite lock still wound
  in. The second slide is always worse than the first.
- **Opposite lock runs out.** The hands are quick but not instant, and there
  is a physical stop past about forty degrees.
- **And it costs you.** A car pointing five degrees off its direction of
  travel is scrubbing, not accelerating — the speedo stops climbing while the
  tacho screams, which is the difference between a fast lap and a loud one.

A slip-angle strip appears in the cluster when the back starts to move and
goes away again when it stops, because a gauge that reads zero forever stops
being read. The cluster rotates with the car, because you are strapped to it.

### …and with it switched on, it hunts

A traction control system is a feedback loop with a delay in it, and a
feedback loop with a delay in it does not sit still. It sees slip, pulls the
torque, and by the time the torque is gone the slip has gone with it — so it
gives it back, and the slip returns, and it takes it away again. Several times
a second. That cycling is the thing everyone recognises: the engine surging,
the car going in pulses, the light stuttering on the dash. A smooth servo is
what a TC system would do if it could see the future.

The important half is that it **settles**, and what settles it is speed. Off
the line the car has far more torque than the contact patch can take and every
correction overshoots, so it hunts hard. As road speed comes up the same slip
ratio is a much smaller fraction of what the tyre can do, the loop gets margin
to work in, and the corrections stop overshooting. So it is not a timer
running out — it is the car arriving somewhere the box can cope with, and it
comes straight back the moment it doesn't.

## Lugging, and dying

An engine does not stall the instant the needle dips below a number. It
**lugs**: the firing goes uneven, the whole car shudders in time with it, and
you get most of a second to do something about it. That window is the
difference between a car that is demanding and a car that is a trap. How long
it lasts is the flywheel — an iron-blocked 7.3 V12 hangs on for the better
part of a second, a race V10 with nothing to store energy in gives you a third
of that.

Two things were making a gentle pull-away impossible before, and neither of
them was the driver:

- **The stall speed was a fraction of idle.** But what kills an engine is the
  crank no longer carrying enough energy through the next compression stroke,
  and that is a property of the engine turning, not of where its idle happens
  to be set. A V12 idling at 800 and a 49cc single idling at 1700 both give up
  somewhere around three or four hundred rpm.
- **The anti-stall assist switched itself off exactly when it was needed.** It
  bailed out the moment the clutch locked — which is backwards, because while
  the plates are still slipping the engine can always run away from the load,
  and the one case where it genuinely cannot is when the clutch has locked and
  the road is holding the crank down. That is crawling in first at walking
  pace, and it was the one case with no help at all.

It is bounded tightly, though. The assist only has anything to say below about
a quarter over idle — near stall it has almost full authority, a few hundred
rpm up it has none. An anti-stall that reached higher would quietly feed in a
third of a throttle every time you coasted down a gear, and the car would
creep away from you on a trailing throttle, which is a worse bug than the one
it fixes.

You can still stall it. Try to pull away with your foot off the pedal and it
will die, as it should.

## The limiter bounces

A rev limiter is a relaxation oscillator, and it is one because of
**hysteresis**. The ECU does not restore the fuel the instant the revs dip
below the number — if it did it would chatter at the sample rate. It cuts at
the ceiling and does not light again until the revs have fallen a couple of
hundred rpm *below* it. The engine falls through that gap, catches, climbs
back through it, and cuts again: a sawtooth, five to twelve times a second,
and that sawtooth is the sound of a limiter. Every bark and every bang out of
the pipes is one cycle of it.

It happens in gear too. There the crank is bolted to the road and cannot
actually lose two hundred rpm in a twentieth of a second — but nothing between
it and the road is rigid, so the shafts wind and unwind, the mounts load and
release, and the needle wobbles against the stop while the car surges.

Two things had to be true before any of that was visible. The free-revving
case needed **substepping** — a 0.095 flywheel moves nearly a thousand rpm
between one frame and the next at 60Hz, and a single step that size cannot
resolve a limiter cycle at all; it jumps from under the ceiling to over it and
whatever the limiter decided in between never happened. And the **needle** had
to be allowed to follow: a spring tuned for a car accelerating is a 2Hz
lowpass, and a limiter cycling at eight is fifteen times faster than that, so
all of it was being filtered away and the needle sat on the redline looking
painted on. A real tacho hammers, visibly, and the blur is one of the things
that tells you where you are without reading anything. So while the limiter is
working, the needle's bandwidth is what a real instrument has.

Holding a car against the limiter is survivable, incidentally, even with
consequences on. That is what the limiter is *for*. What is still fatal is the
money shift, which puts the crank somewhere the fuelling has no say in and
does it in one go.

## Hearing a car you cannot see

Workshop → **THE SPACE AROUND YOU**, and `F` for the flyby. These two used to
be separate features. They are the same feature, and the thing that joins them
is distance.

### The mistake distance usually makes

Direct sound obeys the inverse square law. Reflected sound does not — it fills
the whole space more or less evenly, so past a few metres it barely falls off
at all. Which means the **ratio** between them swings enormously with
distance, and that ratio is what your ear actually measures distance with.

The flyby used to scale the reverb send by the same number as the dry path,
which quietly locked the wet/dry ratio to a constant and is exactly what makes
distance in games sound like a volume knob. A car half a kilometre away came
out as a small quiet car instead of a big distant one.

Now the reflections hold their level as the direct path collapses. Three
things move with distance instead of one:

- the direct sound falls away, and it is allowed to get genuinely faint now
- the **air** eats the top of it — at the far end of the run there is nothing
  above about 1.5kHz, which is why you can hear something big coming and still
  not be able to tell what it is
- the reflections arrive **later**, by tens of milliseconds, and that lag is
  heard as depth rather than as delay

### Which is what the city street is for

A tunnel is impressive and it is also simple: one surface, very close, very
loud, and every car in it sounds the same. A street canyon is the opposite.
The two facades are twenty metres apart, so their slap arrives as a separate
event rather than as a ring — and then the sound keeps going **down the
street** and comes back off everything else in it. Junctions, the block
opposite, the row behind you, a car park two hundred metres away. Those
returns land between a fifth of a second and a second and a half later, each
one quieter, later and more smeared than the last, and by the time they arrive
the air has taken everything bright out of them.

That late dark cloud is inaudible as an effect and enormous as a cue. It is
the reason car spotters stand on street corners rather than in tunnels: the
tunnel gives you volume, the street gives you **size**, and size is the thing
you can hear the distance in. Put a V12 on the flyby, pick CITY STREET, and
listen to the far end of the run.

### The alley had a ceiling, and that was the whole problem

It decayed about 9 dB over a second and a half. That is a cathedral, and it
sounded like one.

**A room has a lid.** Sound bounces off the ceiling and comes back, over and
over, from every direction at once, and what you get is a smooth reverberant
tail with no structure in it. That tail *is* the sound of being indoors — it
is the only cue that matters, and putting one on an outdoor space is exactly
what makes the outdoor space sound indoor.

An alley has no lid. Whatever goes up is gone: there is nothing above it for a
hundred metres, so it never comes back. What is left is sound bouncing between
two walls near-horizontally, which is a train of **discrete** reflections
rather than a wash — so the correct amount of diffuse bed out here turns out
to be almost none.

Two fixes, and the second was the big one:

- **The bed came down to a sixth** of what it was. It is now just enough that
  it is not uncomfortably dry between the strikes.
- **Geometric spreading was missing entirely.** There are two losses on every
  bounce, not one. Absorption is the wall — brick keeps about 96% of what hits
  it, which is why that number is so close to 1 and right to be. *Spreading*
  is geometry: the sound has travelled another 8.4 metres by the time it comes
  back, so it is quieter for that reason alone, with nothing having absorbed
  it. Over ninety bounces that is the difference between a decay you can hear
  end and one that simply doesn't.

And ninety bounces was itself wrong — in a real alley you can count maybe
twenty flutter repeats before it is gone. It is 26 now.

The result decays to −60dB in **half a second** instead of never. The ring is
still there, and it is still the reason to drive an alley; it just no longer
has a room around it. The wet level was re-solved rather than re-tuned:
because a convolver normalizes by total energy, cutting the tail turns the
strikes *up*, so the mix was recomputed to put them back exactly where they
were.

## The flyby, and the air in front of the car

Standing at the side of a road, the engine is not the first thing you hear and
it is not the loudest thing at the moment of the pass. **It is air**, and the
whole shape of a trackside pass is air.

- **From far**, a wide low wandering roar with almost no engine in it yet — a
  car pushing a column of atmosphere down the road ahead of itself, arriving
  before it does. Low frequencies carry, so this layer is deliberately allowed
  to fall off much more slowly than the rest.
- **Closing**, the roar tightens and rises as it stops being something the
  whole valley is doing and becomes something happening in one direction.
- **The pass** is a step, not a swell. A pressure front has no attack time.
  There is a bright shear crack off the leading edge, a low thump you feel
  rather than hear, and the whole band sweeps *downward* through the event
  because everything about the source is Dopplering.
- **Gone**, and the wake outlasts the front by a factor of five or six.
  Turbulence behind a car takes the better part of a second to break up, and
  it is dirtier and lower than the front was. That asymmetry — five
  milliseconds in, a second out — is most of what makes a real pass feel
  violent.

Under all of it, four contact patches tearing at tarmac, which at 200km/h is
genuinely as loud as the exhaust and is the layer everyone forgets. It is why
a car passing on a coast-down still makes an enormous noise.

The run is 620 metres each way rather than 380, and very fast cars are no
longer sped up to a cartoon. The honest reason a 400km/h pass felt
underwhelming was never that the car was too slow — at that speed it crosses
your window of usable directivity in well under a second and there is nothing
left to hear. The fix for that is a **longer approach**, not a faster car, and
the approach is the part worth standing there for.

## The one that asks the most

The **Zuffenhausen GT**. A 5.7-litre 68° V10 designed for a Le Mans prototype,
a six-speed manual, rear-wheel drive. It has traction control and it has ABS,
and both of them are switches — leave the first one on and the box holds the
rear at the peak of the curve, hunting and surging while it does it; switch it
off and there is nothing between 612 horsepower and the road except your right
foot, which is the version the car is famous for.

What it does *not* get is the workshop's infinite-grip cheat. It is the one
car in the garage that arrives with that switched **off**, because a car whose
whole character is how much it asks of you is not worth handing unobtainium
rubber by default. It is still a switch, and it is still yours.

The clutch is the other half of the reputation. A 169mm ceramic twin-plate
weighs almost nothing, which is why the engine revs like a switch — and it
takes up over about a centimetre of pedal travel. Same event as any other
clutch, compressed into a tenth of the window. It is not that the clutch is
vicious; it is that the band you have to work in is the width of your
shoelace, and a ceramic disc cannot smear its way through a bad launch the way
an organic one does. It grabs and lets go and grabs, fifteen times a second,
and the whole car shakes.

Which is why **CLUTCH ASSIST** (workshop → ECU & SETUP) exists and can be
switched off. A keyboard has one clutch position and a left foot has a
hundred, so by default there is a driver's foot in here doing the difference:
fast through the dead travel, then holding the bite the engine can actually
support until the wheels catch up. Switch it off and that foot is yours. On an
ordinary car that is fine. On this one it is the whole game.

The voice is a Formula One engine that had to be widened to fit a car with
luggage in it, and it sounds like that compromise: dry, hard and hollow rather
than brassy or round, with an enormous amount of induction in it and almost no
bass. The odd orders carry it — third and fifth are loud all the way up while
the evens stay back, and that gap is the hollow. The 68° vee with split pins
is *nearly* even-firing, and the beat that is left over is why the idle wobbles
and why the midrange rips instead of humming.

## The one that is a bit flat, on purpose

The **Sant'Agata Temerario** is the first car in here where the honest thing
to synthesize is a disappointment, and modelling it as anything else would
have been the one dishonest entry in the garage.

Everyone who drives one says a version of the same thing: astonishing at the
top, curiously ordinary in the middle. That is not Lamborghini losing
interest. It is three pieces of physics stacked on each other:

- **A flat-plane crank makes a narrow spectrum.** A 180° V8 fires
  left-right-left-right in perfect alternation — two inline-fours in lockstep
  — so the second order owns everything and the half-order has almost nothing
  in it. That evenness is what makes a 458 scream. It is also what makes an
  engine sound thin when nothing else is going on. The V10 this car replaced
  had a 72° crank in a 90° vee that *could not* fire evenly, and that
  permanent stumble is most of why people loved it.
- **Two turbines sit between the engine and you**, and a turbo in the exhaust
  stream is a low-pass filter you cannot switch off. What it takes is the
  third and fourth orders — the metallic edge that is the other half of a
  flat-plane's character.
- **Both losses land in the same place.** Three to six thousand is where the
  turbines are fully in and the revs are not yet high enough for the intake to
  take over, and it is genuinely the emptiest part of this engine.

So the three-zone layer gains are used the way nothing else here uses them:
the centre voice **dips** through the middle instead of climbing, the
half-order stays near zero throughout, and the third order is held back
deliberately. The dip is not a synthesis compromise. The dip is the car.

And then the last two thousand rpm, which is why it exists. Past eight the gas
velocity is high enough that the turbines stop mattering acoustically, the
resonance tube into the bulkhead comes alive, and the third and fourth orders
arrive all at once. The step from `gMid` to `gHi` on those two layers is the
biggest in the garage, and it happens over about fifteen hundred rpm. The
reward is real and you have to go and get it.

## Subtraction, not addition

The **Maranello F12 tdf** is the 812's engine two hundred cc smaller, and
almost everything that makes it sound like itself was taken *out*: the carpet,
the boot lining, most of the underbody felt, and a large part of the exhaust's
silencing volume.

The obvious way to voice that is "the 812, louder", and it is wrong in a way
that is worth being precise about. Mass law barely touches 100Hz — thirty
kilos of felt does almost nothing to a V12's fundamental, which is already
arriving through the floor and the glass and the seat. What felt and carpet
actually absorb is a kilohertz and up: induction, valvetrain, the third and
fourth orders, the ring of the pipe.

So the tdf is the 812's voice with the **top half** turned up and the bottom
left exactly where it was. That is why it reads as harder and angrier rather
than as bigger, and turning the bottom up too just gives you an 812 played
loud, which is a different car.

The 812 carries silky triangles at 3.5 and 4.5 orders doing one job: making it
sound expensive. A triangle at an exact half-order fuses into the note and the
ear hears smoothness. They are gone here, and in their place the fourth order
is a fraction sharp — 4.04, not 4.00 — so it cannot fuse and has to be heard
as a separate thing happening on top of the note. That is the difference
between a V12 singing and a V12 being operated near the limit of what it will
take.

The gears are the other half. Ferrari's own headline was six per cent — every
ratio six per cent shorter than an F12berlinetta's, upshifts thirty per cent
quicker, downshifts forty. Six per cent sounds like a rounding error and is
not: it is the difference between a gear that runs out where you expected and
one that runs out before you are ready, over and over, all the way up the box.
Nothing about the engine changed. The steps just got smaller.

Top gear is the exception, for the reason the SF90 note gives: a top ratio is
not part of a close stack, it is the one that has to reach the number on the
brochure. It stays long and does 340. Everything below it is squeezed.
