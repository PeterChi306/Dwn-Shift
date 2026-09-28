# Los Santerra — map-based open-road milestone

## Play

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Open [the local game](http://127.0.0.1:8080). The new ES modules and GLB models require HTTP rather than opening the HTML file directly.

- **W / S**: original throttle and brake.
- **A / D or left / right arrows**: progressive steering. A no longer activates the old chauffeur while in the 3D world; it still does in the original simulator.
- **I, held**: original ignition. Covers, two-stage starts and hybrid behavior remain vehicle-specific.
- **Q / E**: original sequential shifts. **C / Space**: original clutch behavior.
- **D in the on-screen selector**: Drive in Automatic. The selector is hidden for manual modes. The keyboard D key steers.
- **Drag the scene**: rotate the chase camera. It recenters smoothly after you resume driving. The controller right stick also looks around; left stick steers.
- **Tab**: MAP. **Escape**: pause/resume or close the full workshop.
- **N / Night Drive**: lighting. **Camera**: chase / bonnet.

The Map page supports destination routing, zoom, pan, and a reference-image overlay. Settings offers steering sensitivity, optional steering assistance, resolution quality, and recovery to the nearest road. Assistance only steers; the driver must brake for turns and traffic.

Garage keeps the original powertrain choices. Car sound controls use the existing per-car exhaust volume, pitch and tone settings and persistence. The full workshop and original simulator remain available.

## The supplied map is the layout reference

`assets/world/los-santerra-reference.png` is the user's original map, copied without
image edits. `tools/build_network.py` records selected visible road corridors and
district grids in its original 1536 × 1024 pixel coordinate space.

`assets/world/network.json` is the authoritative runtime geometry. The world,
minimap, full Map page, pathfinding, traffic and Blender layout all use that same
graph. No closed race spline is active.

Current graph:

- 156 named/traced road polylines.
- 6,817 nodes and 7,208 road segments; 531 nodes with three or more connections.
- About 443.4 km of aggregate centerline at 10 metres per reference pixel.
- All nodes are in one connected component. All twelve ordered routes between the
  four priority destination areas pass continuity checks.
- Road elevation runs from 0.5 m in the basin to 507.6 m at the Mount Lee summit.

This is a selected, simplified trace of the supplied raster map, not a claim that
every tiny street visible in the image has been digitized. Some street names are
fictionalized labels. Position and relative district layout come from the reference;
elevation is an authored interpretation of its mountain bands, not surveyed terrain
or an extracted height map. The reference scale bar is not used as a literal
geographic scale.

### Terrain

Height comes from named crest polylines — Santa Monica/Hollywood Hills, Verdugo,
San Gabriel, Elysian, Repetto and Baldwin — each with a Gaussian cross-section, plus
a gently rolling basin and a detail band that only bites on high ground. Mount Lee
carries a distinct peak for the sign and the overlook.

`tools/build_network.py` and `world/network.js` both implement this function. The
builder emits a `heightSamples` table and `tools/check_network.mjs` asserts the two
agree to within 1e-3 m, so an unmirrored change fails the check rather than quietly
floating the roads above the ground.

### Road types

Traced polylines are corner-rounded into fillets before intersection splitting, so
bends are arcs rather than kinks; vertices that another road terminates on are kept
sharp so no junction is lost. Segments are then densified to about 55 m so a road
follows the ground instead of spanning a hill as one flat quad, and each road's
profile is smoothed along its own chain — heavily for freeways, lightly for streets.

Present in the graph: freeways and ramps on their own grade layers, boulevards,
avenues, streets, residential lanes, scenic canyon roads, dirt fire roads, bored
tunnels (Laurel and Cahuenga passes), and 185 underpass segments. Underpasses are
not authored by hand: any surface segment passing within 26 m of a freeway deck is
cut into a dip, and the grade smoothing builds its approach ramps around it.

## What changed in this pass

### Why it read as "the backrooms"

The previous world put one box per lot, at one setback, at one spacing, with one
palette per district and windows drawn as small dark boxes. Every street therefore
converged on a vanishing point between two identical walls. The fixes were
structural rather than cosmetic:

- **Facades are textured and UV-scaled to real metres**, not assembled from
  thousands of window boxes. One material per facade type, tinted per building by
  vertex colour, so colour variety is free and draw calls stay bounded. A matching
  emissive map lights the glazing after dark, unevenly, so a night facade is not a
  uniform grid.
- **Massing varies**: multi-volume towers with setbacks and crowns, hip-roofed
  houses, warehouses, storefront blocks. Heights use a biased distribution so a
  street gets many low buildings and a few tall ones, which is what makes a skyline.
- **Frontage jitter**: per-building setback offset and along-street jitter, so no
  two neighbours share a building line.
- **Lots that are not buildings**: parking, pocket parks and fenced yards break up
  the frontage, and a second rank behind the street gives blocks depth.
- **Street furniture and buildings are placed along whole streets** via road chains,
  not per split edge. After densification most edges were too short to clear the old
  per-edge margins, which had left kerbs, lamps and trees appearing only in patches.
- Districts cover the whole reference now — Koreatown, Hancock Park, Fairfax,
  Mid-City, Culver City, Exposition Park, Echo Park, Eagle Rock, Alhambra, Monterey
  Park, El Monte and East Los Santerra joined the original four — each with its own
  building vocabulary, palette and shop names.

### Sky and light

The sky is a single shader with a real daylight arc: sunrise at 06:00, sunset at
20:00, a warm band stacked toward the sun's compass bearing at low elevation, a sun
disc and halo, an opposing moon, stars that thin out as the sky brightens, and two
cloud layers lit from the sun's direction. The running in-world clock drives it, so
driving long enough gives sunrise and sunset; NIGHT DRIVE jumps the clock to 21:18.

`Scenery.applyLighting` owns sun position and colour, hemisphere bounce and fog, so
lighting and sky cannot disagree.

Two bugs were fixed here that had been darkening everything: the environment probe
was generated with `PMREMGenerator.fromScene`'s default 100-unit far plane while the
sky shell sits at 25 km, so every PBR surface was lit by a black probe; and the
default clock sat just past sunset.

### Seeing the city

Detail streams only about 1 km out, so from the hills the basin was an empty plain.
A low-detail massing model of every block in the map is now built once at startup
and shown wherever the detailed chunk is not loaded, using the same `massing()`
function the detailed buildings use — so the skyline from Mount Lee matches the
blocks you drive through. Haze was thinned so the basin is actually visible.

Mount Lee carries the HOLLYWOOD sign (letterforms built from bars, anchored to the
landmark's own map position rather than snapped to a road) and an overlook terrace.

### Driving

Steering was vague: a 0.075 dead zone and a 1.65 response exponent meant the first
third of travel did almost nothing, and a 100 ms tap moved the car 0.042°. The dead
zone is now 0.04, the exponent 1.3, the lateral-acceleration target 8.2 m/s², the
keyboard ramp reaches full lock in about 0.28 s, and the steer follows its target
faster. Small-input response at 108 km/h went from 0.00065 to 0.00248 rad — about
3.8× — while full-lock response stays inside a sane lateral-acceleration limit.

NPC contact used a 7 m radius around the vehicle centre, so passing in the next lane
dragged the player down. It is now an oriented box test against the NPC's own
heading (±3.6 m along, ±1.65 m across), so only real overlap slows you.

### Other fixes found along the way

- `prop()` and the lot helper swapped the across-street and along-street axes, so
  every cornice, awning, eave and apron was rotated 90°.
- Storefronts, awnings, signage and neon blades were being placed on the **back**
  face of commercial buildings, away from the street.
- Hip roofs scaled a four-sided cone by width rather than by the corner radius,
  making them roughly 60% oversized.
- Canyon roads flattened terrain 90 m to either side, turning every summit into a
  mesa; scenic and dirt roads now cut a 26 m notch instead.
- Routing moved to a binary heap — the graph grew from 892 to 6,817 nodes, and the
  old linear scan was O(V²).

## Files and rebuilding

- `world.js`: driving integration, camera, traffic, menus and instruments.
- `world/network.js`: projection, routing, spatial queries and steering response.
- `world/scenery.js`: roads, terrain, lighting, district dressing and streaming.
- `world.css`: glass UI styling.
- `assets/world/network.json`: shared physical/map road graph.
- `assets/world/los-santerra-network.blend`: editable road-layout scene with named district collections, a terrain mesh sampled from the same height function, the reference image and landmark markers. Geometry is batched into one mesh per district per purpose (71 meshes) — one object per strip was unusable at 7,208 segments. It preserves graph geometry; it does not contain the browser's complete streamed building dressing.
- `assets/world/los-santerra-fleet.blend`: editable four-vehicle fleet.
- `performance-coupe.glb`, `traffic-sedan.glb`, `traffic-suv.glb`, `traffic-van.glb`: current vehicle exports.

```sh
python3 tools/build_network.py
/Applications/Blender.app/Contents/MacOS/Blender -b --python tools/build_network_scene.py
/Applications/Blender.app/Contents/MacOS/Blender -b --python tools/build_vehicle_fleet.py
node tools/check_network.mjs
```

The old `route.json`, `sunset-run.blend` and `sunset-kit.blend` belong to the earlier loop prototype. They are not the active world layout.

The renderer streams nearby district chunks, instances repeated geometry and signage, merges static vehicle parts by material, preserves wheel pivots, and bounds nearby light data as chunks unload. Quality options control pixel ratio and shadows. Source modules and GLB files are served locally; the new renderer needs no CDN at runtime.

## Road network integrity

Four passes in `tools/build_network.py` exist to stop the grid from fragmenting.
They run in this order and each one depends on the last:

- **dedupe** drops a generated road that is mostly within 20 m of, and within
  15 degrees of, one already placed. The district polygons in `regions.py`
  overlap, so the same ground gets a grid from two districts; without this the
  map carries pairs of near-parallel road surfaces.
- **stitching** walks every loose end forward along its own heading up to 160 m
  and joins it to the first road it finds.
- **leaf pruning** deletes what stitching could not join, walking each dead tail
  back to the last real junction instead of trimming one segment. Hand-traced
  roads, fire and canyon roads, cul-de-sacs and anything reaching the map border
  are exempt, so authored dead ends survive.
- **carving** (`tools/build_heightmap.py`) stamps each surface road's graded
  profile into the heightmap, with a 26 m verge blending back to natural ground.
  Roads are engineered rather than draped, so without this the landscape cuts
  through the asphalt -- it was out by up to 29.5 m, which is felt as bumps and
  seen as half-buried hillside roads.

`tools/plot_roads.py` renders a top-down PNG of any export, coloured by kind,
with every dangling end marked red; pass a bounding box in centimetres for a
close-up. `tools/check_road_seating.py` measures road-versus-landscape error.

Widths come from a lane count (`LANES` in build_network.py) at 4.4 m a lane plus
shoulders and median, not from authored numbers: 1 lane for dirt and ramps, 2
for residential, scenic, street and tunnel, 4 for avenues, 6 for boulevards and
the freeway.

Unreal reads `los-santerra-roads.json`, the full export. `tools/thin_network.py`
still exists and `LOS_SANTERRA_THIN=1` selects its output, but once leaf pruning
removed the stubs at source the thinner's own minimum-length filters became the
main producer of loose ends -- it saved 22% of the mileage and added 27 more.

## Verification and practical limits

`tools/check_network.mjs` checks graph connectivity, route continuity between all
four priority areas, finite geometry, the world-to-map coordinate transform, steering
symmetry, dead zone and speed-sensitive response. It additionally asserts that the JS
terrain mirror matches the Python builder's `heightSamples` table, that surface roads
stay near the ground, that the world has real vertical relief, and that every road
kind is present. Results are in `output/network-validation.json`.

Latest run: 6,817 connected nodes, 7,208 edges, 443.4 km, 531 branch junctions, all
12 routes continuous, terrain mirror delta 5e-5 m, elevation 0.5–507.6 m, 140 segments
steeper than 22%.

Browser checks in this pass were visual: headless Chromium screenshots of Downtown,
West Hollywood, Beverly Hills, Pasadena, San Marino and Koreatown at street level,
plus the Mount Lee overlook in daylight, at sunset and at night, with the console
watched for errors. Those are in `output/playwright` (the `final-` and `v12-` sets).

Not re-tested in this pass: audio, the full workshop, controller input, the Map page
and Garage UI, and sustained-drive performance on lower-end hardware. The added
skyline layer and the higher-resolution terrain both raise startup cost and memory;
that has not been profiled.

`?worldDebug=1` exposes `DwnWorldDebug` for checkpoint placement and graph inspection. It is not a player fast-travel system. Normal play exposes only read-only `DwnWorld.diagnostics` and the physics integration hook.

Remaining work includes bespoke architecture and material assets, more hero
landmarks, engineered junction and kerb-return geometry, interiors and rooftop
detail, more sophisticated traffic, full suspension and contact dynamics, per-vehicle
bodies, level-of-detail between the streamed chunks and the skyline layer, and
broader hardware testing. The existing audio path was preserved and initialized in browser tests; this was not a subjective listening evaluation. Controller mappings were implemented but no physical controller was available for validation.

## Visual research

The map and the user's requested identities take precedence over real geography. Architectural references used to guide the district rules include Pasadena's municipal [architecture and design context](https://www.cityofpasadena.net/planning/planning-division/design-and-historic-preservation/historic-preservation/historic-context-statement/chapter-8/), West Hollywood's description of [the Sunset Strip](https://www.weho.org/city-government/city-manager/projects-current-on-the-boards/project-archive/the-sunset-strip), and Beverly Hills' [historic development](https://www.beverlyhills.org/165/History-of-Beverly-Hills). San Marino's residential emphasis follows the user's brief and reference map.
