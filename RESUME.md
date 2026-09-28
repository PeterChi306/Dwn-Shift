# Los Santerra — resume here (left off 2026-09-16 ~05:46)

The thinned network is BUILT IN UNREAL and the landscape heights match it.

    road actors 1397 over 151 roads, 349 km
    road vs ground: median 0.01 m, p90 0.28 m, 92.6% within 0.5 m

## Where the bar stands
RESUME's old bar was "median well under 0.5 m, nothing deeply buried".
Median is met with room to spare. NOT met: a ~1% tail, p99 8.06 m,
deepest burial 14.05 m. The offline `tools/check_road_seating.py` shows the
same tail against the PNG itself (p99 8.18 m, worst on scenic/steep streets),
so that tail is in the HEIGHTMAP, not in the Unreal import.

Decide before moving on: either chase the tail in the carve, or accept it
(it is ~5 of 484 sampled points, on steep scenic/hillside roads).

## Rerunning the pipeline (editor CLOSED)

    cd ~/Desktop/Dwn\ SHIFT
    export LOS_SANTERRA_THIN=1
    python3 tools/build_heightmap.py
    ./unreal/run.sh level
    ./unreal/run.sh heights
    ./unreal/run.sh ground

Exit code is always 1 — judge by the `[Los Santerra]` lines in output/logs/.

## Next
buildings (`run.sh city`) -> props -> foliage. Editor CLOSED for all of it.

Foliage is more nuanced than the old note said. AUTHORING the PCG graph is
headless-safe: build_los_santerra_foliage_pcg.py only creates the graph asset,
places the PCG volumes, attaches PCGComponents and saves the level. Only
GENERATION needs the editor open -- the script ends by telling you to hit
Generate in the PCG panel, and the components are is_component_partitioned=True
so the instances land in World Partition actors the editor manages.
UNTESTED idea: `-AllowCommandletRendering` (the flag that fixed `heights`) plus
an explicit `component.generate()` may let generation run headless too. Try it
once before scattering by hand.

## Fixed this session — four bugs in `heights`, which had never run clean
1. `unreal.KismetRenderingLibrary` does not exist in UE 5.8 Python; it is
   `unreal.RenderingLibrary`.
2. Render target size must come from `RenderingLibrary.create_render_target2d`,
   not `set_editor_property('size_x', ...)` on an RT asset: over 2048 that opens
   a "will use NMb, are you sure?" dialog, `-unattended` answers No, and the
   engine CLAMPS both dimensions to 2048 — silently importing a 2048x2048 crop.
3. Commandlets run with rendering off, so the RT had no GPU resource and the
   import refused it. run.sh now passes `-AllowCommandletRendering` for `heights`.
4. The killer: the heightmap texture used TC_VECTOR_DISPLACEMENTMAP, which forces
   BGRA8 and quantises 65535 height steps to 255 — 4.3 m of landscape per step.
   TC_GRAYSCALE keeps it at G16. This alone was median 1.10 m of error.
   Also: the importer takes height as a RAW `(uint16)LinearColor.R`, so the blit
   material multiplies the 0..1 sample by 65535, and only RTF_RGBA16f/32f/RGBA8
   are accepted (R32F is rejected).

`unreal/run.sh` also had a macOS bash 3.2 trap: `"${ARR[@]}"` on an empty array
is an unbound-variable error under `set -u` and killed the script silently.

## Stale
`tools/check_road_seating.py` still reads the FULL 730-road export, not the
thinned one — its numbers are not comparable to `run.sh ground`.

## Note
Run Claude Code from Terminal, not Unreal's terminal plugin — quitting the
editor kills the session, and the editor must be closed for the above to run.
