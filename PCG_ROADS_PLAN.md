# Los Santerra — roads via PCG, step by step

Written 2026-09-17. Goal: replace the 684 baked road meshes with **PCG graphs driven
by splines**, so roads are smooth, and so buildings/plants/props can reuse the same
machinery later.

---

## 0. How to run anything at all

Every editor script goes through one runner:

```bash
cd "/Users/peterchi/Desktop/Dwn SHIFT"
./unreal/run.sh <nickname>
```

| nickname  | what it does                                        |
|-----------|-----------------------------------------------------|
| `probe`   | environment check — prints engine version, which PCG classes exist |
| `level`   | build roads, sky, PlayerStart                        |
| `heights` | rewrite Landscape heights from the heightmap PNG     |
| `ground`  | trace real collision, verify roads sit on the Landscape |
| `city`    | building frontage PCG                                |
| `foliage` | tree scatter PCG (needs the Landscape to exist)      |
| `trees`   | import the Fab tree FBX                              |
| `nodf`    | drop distance fields from road meshes                |

**The editor must be CLOSED.** It holds an exclusive lock on the project, and its
in-memory copies would overwrite anything a headless run writes. `run.sh` checks
for this and stops with a clear message.

Output goes to `output/logs/<nickname>.log`. `run.sh` prints the script's own log
lines plus any real errors at the end, so you usually don't need to open the log.

Ignore exit code 1 on its own: the MCP plugin fails to bind port 8000 and makes
the editor exit nonzero even on a clean run. Trust the printed log lines.

Pure-data scripts under `tools/` are ordinary Python, no runner needed:

```bash
python3 tools/build_heightmap.py        # ~40 s
python3 tools/check_road_seating.py     # verify, prints a table
```

---

## Phase 1 — Get a Landscape under the roads

Right now there is none. The grey checkerboard in the viewport is the default
template plane, so every road is a ribbon floating in space. Nothing about road
quality can be judged until this is fixed.

### 1a. Re-bake the heightmap  ✅ already done 2026-09-17

```bash
python3 tools/build_heightmap.py
python3 tools/check_road_seating.py
```

Expect: `median 0.01  p90 0.04  p99 0.67  max 3.07`, 98.6% within 0.5 m.

The old PNG had been baked while the carve was restricted to the 136 *thinned*
roads, but the level ships the full 513 — two thirds of the mileage sat on terrain
never cut for it. **If roads ever look buried again, re-bake before suspecting
anything else.**

### 1b. Create the Landscape (manual — the one unavoidable hand step)

`ALandscape::Import` is not exposed to Python, so this cannot be scripted.

1. Open the editor on `L_LosSanterra`.
2. Top-left mode dropdown → **Landscape**.
3. **Manage** tab → **New** → **Import from File**.
4. Heightmap File: `output/unreal/los-santerra-height.png`
5. Type these **exactly** (from `output/unreal/los-santerra-terrain.json`):

   | field | value |
   |---|---|
   | Location X | `-768000` |
   | Location Y | `-512000` |
   | Location Z | `0` |
   | Scale X | `403.1496` |
   | Scale Y | `403.1496` |
   | Scale Z | `212.1409` |
   | Section Size | `127 x 127` |
   | Sections Per Component | `1x1` |
   | Number of Components | `30 x 20` |

6. **Import**, then save the level.

Location matters: it puts the Landscape's centre at world origin, which is what
`network.json` assumes. Getting it wrong shifts the whole terrain under the roads.

### 1c. Verify

```bash
./unreal/run.sh heights     # only needed if heights look stale later
./unreal/run.sh ground      # traces real collision
```

`ground` is the only check that catches a stale Landscape. Expect max error
under 1 m. If it reports ~19 m, the Landscape is stale — run `heights`.

If `fix_landscape.py` is needed (duplicate Landscapes, wrong location), it's
there, but it has no `run.sh` nickname yet — say the word and I'll add one.

**Stop here and look at the world before going on.** Phase 2 is only worth doing
against real terrain.

---

## Phase 2 — Clean the centrelines (before PCG, not after)

PCG spawns geometry along the data you hand it. It has no opinion about whether a
centreline doubles back or whether two roads meet. Feeding it dirty data gives
dirty output — *worse* than now, because spline meshes flare and self-intersect
through a tight corner far more visibly than flat quads do.

### What's actually wrong

Measured across ~53,000 points: **138 bad corners, 0.26%**. Small, but concentrated
exactly where you notice them.

| kind        | kinks | worst radius |
|-------------|-------|--------------|
| street      | 41    | 3.4 m        |
| scenic      | 40    | 2.3 m        |
| residential | 16    | 3.9 m        |
| ramp        | 13    | 2.8 m        |
| underpass   | 13    | 2.7 m        |

These are not hairpins — they're **folds where the line reverses on itself**.
`Hollywood Ridge Road` has three 100°+ corners within 10 m. `Culver City 3` is the
twisted sheet climbing into the sky in the screenshot. `Downtown Los Santerra 6`
is the known hand-traced-Downtown problem showing up as geometry.

Scenic roads also still hit **50% grade**, above their own cap.

### The passes to write (`tools/`)

1. **Despike** — drop any vertex whose turn exceeds a per-kind limit *when both its
   legs are short*. Spikes are removable; a genuine hairpin has long legs and
   survives. Iterate until clean.
2. **Minimum radius** — guarantee it per kind rather than hoping the existing
   rounding pass gets there. Starting points: scenic 12 m, street 8 m, ramp 25 m.
3. **Re-grade** — despiking shortens the path and therefore steepens it, so
   `regrade_network.py` has to run again afterwards.
4. **Re-bake + re-check** — `build_heightmap.py`, then `check_road_seating.py`.

Target: zero corners under the per-kind minimum radius, scenic max grade back
under its cap.

---

## Phase 3 — Roads become splines

Today `build_los_santerra_level.py` bakes 684 static meshes. Those get replaced by
**Spline actors tagged by kind** (`Road_Freeway`, `Road_Street`, `Road_Scenic`, …).

Why this is the step that actually buys smoothness: a polyline with an 11 m segment
and a 6° turn is a visible flat facet. A Spline with proper tangents is
curvature-continuous, and `Spawn Spline Mesh` deforms geometry along it. This is
what the city builds you've seen are doing.

It also helps the **memory-pressure warning** in your screenshot: splines are nearly
free, and the meshes come back through PCG with partitioning so only nearby tiles
are resident.

Tangent handling is the whole game here — set them from the neighbouring points
(Catmull-Rom style), not left at zero, or you get corners again.

---

## Phase 4 — `PCG_Roads`

Good news: **this is scriptable.** `build_los_santerra_pcg.py` already authors a PCG
graph with `graph.add_node_of_type(...)` and `graph.add_edge(...)`, so the road graph
follows the same pattern. You'll still be able to open it and see every node.

Node chain:

1. **Get Spline Data** — filter by tag, one road kind at a time. Start with
   `Road_Street` only.
2. **Spline Sampler** — Subdivision mode, ~400 cm spacing.
3. **Spawn Spline Mesh** — the asphalt ribbon.
4. **Transform Points** — offset ±600 cm on Y for the kerb and sidewalk lines.
5. **Static Mesh Spawner** — kerbs.
6. **Density Filter** + a second spawner — street lamps every Nth point.

Then: a **PCG Volume** in the level, assign the graph, **Generate**. Test over about
1 km of Downtown first — the full 1,274 km will stall the editor.

**Before scaling up**, turn on **Is Partitioned** on the PCG component so it
generates per World Partition tile.

---

## Phase 5 — `PCG_Buildings`, `PCG_Foliage`

Same machinery, once roads look right.

**Buildings.** Better than scattering: `tools/build_blocks.py` already extracts the
faces of the planar road graph as city blocks and places lots inside them. Export
those as closed splines and let PCG fill each lot. Because a lot is inside a block
polygon and the roads are that polygon's edges, a building in a road is
structurally impossible.

Fallback if lots don't export cleanly: Surface Sampler → Difference against
road-point bounds → Self Pruning → weighted Static Mesh Spawner.

**Foliage.** Surface Sampler → Difference (roads, buildings) → density from the
green-cover reference PNG → spawner (palm / oak / pine). This eventually replaces
`build_los_santerra_trees.py` and its 226k baked instances.

---

## Order of work

| # | step | who |
|---|------|-----|
| 1 | re-bake heightmap | done 2026-09-17 |
| 2 | create the Landscape | done 2026-09-17 |
| 3 | `run.sh ground` verify | done — max 2.49 m, 98.9% within 0.5 m |
| 4 | despike + min-radius + re-grade | me |
| 5 | spline export | me |
| 6 | `PCG_Roads` graph | me, you review in editor |
| 7 | buildings, foliage | later |

Phase 1 closed 2026-09-17. Next up is step 4.

Two script bugs found and fixed along the way, both silent failures:
`fix_landscape.py` had no `load_level()` so it reported "found 0 landscape actors"
against an empty world, and `run.sh` filtered `[FIX]` lines out of its own output so
the run looked like it did nothing. `fixland` is now a `run.sh` nickname.
