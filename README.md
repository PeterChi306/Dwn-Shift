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
- **Sant'Agata cars** (SVJ, V10 Evo, Revuelto) — flip the red cover first,
  then hold. It drops back down over the running engine, so it has to come
  up again before you can switch off.
- **Two-stage cars** (SVJ, 458, and the older stuff) — one press wakes the
  electronics, then hold to crank.
- **Older cars** (13R, MkIV, 6.2 SC, S6, M58, the diesel) — a real barrel
  lock. Key to ON, then hold it over against the spring to START.

Let go before it lights and the starter drops out, the engine falls back to
nothing, and the car goes back to reminding you it's switched on.
