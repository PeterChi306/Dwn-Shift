#!/bin/bash
# Run a Los Santerra editor script headlessly.
#
#   ./unreal/run.sh trees      import the Fab tree FBX
#   ./unreal/run.sh level      build roads, sky and PlayerStart
#   ./unreal/run.sh city       building frontage PCG
#   ./unreal/run.sh foliage    tree scatter PCG   (needs the Landscape to exist)
#   ./unreal/run.sh probe      environment check only
#   ./unreal/run.sh ground     verify roads sit on the Landscape collision
#   ./unreal/run.sh nodf       drop distance fields from the road meshes
#   ./unreal/run.sh heights    rewrite Landscape heights from the heightmap PNG
#   ./unreal/run.sh fixland    delete duplicate Landscapes, reseat at the exported location
#   ./unreal/run.sh pcgprobe   which PCG node classes this engine exposes to Python
#   ./unreal/run.sh roadpcg    roads as PCG-driven splines (pilot: Downtown)
#
# The editor must be CLOSED: it takes an exclusive lock on the project.
#
# Note on exit codes: this project's MCP/Terminal plugin fails to bind port 8000,
# which counts as an error and makes the editor exit 1 even on a clean run. So we
# report based on the script's own log lines, not the exit code.
set -uo pipefail

ENGINE="/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor-Cmd"
PROJECT="/Users/peterchi/Desktop/DwnShiftUE/Dwnshift/Dwnshift.uproject"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGDIR="$HERE/../output/logs"
mkdir -p "$LOGDIR"

case "${1:-}" in
  trees)   SCRIPT="$HERE/import_fab_trees.py" ;;
  level)   SCRIPT="$HERE/build_los_santerra_level.py" ;;
  city)    SCRIPT="$HERE/build_los_santerra_pcg.py" ;;
  foliage) SCRIPT="$HERE/build_los_santerra_foliage_pcg.py" ;;
  probe)   SCRIPT="$HERE/probe_level.py" ;;
  ground)  SCRIPT="$HERE/check_road_ground.py" ;;
  nodf)    SCRIPT="$HERE/disable_road_distance_fields.py" ;;
  heights) SCRIPT="$HERE/reimport_landscape_heights.py"; NEEDS_RENDERING=1 ;;
  fixland) SCRIPT="$HERE/fix_landscape.py" ;;
  pcgprobe) SCRIPT="$HERE/probe_pcg_roads.py" ;;
  roadpcg) SCRIPT="$HERE/build_los_santerra_roads_pcg.py" ;;
  pcgprobe2) SCRIPT="$HERE/probe_pcg_roads2.py" ;;
  pcgprobe3) SCRIPT="$HERE/probe_pcg_roads3.py" ;;
  pcgprobe4) SCRIPT="$HERE/probe_pcg_roads4.py" ;;
  *) sed -n '2,16p' "$0"; exit 2 ;;
esac

# Guard against the GUI editor being open. Two traps here, both of which the
# original `pgrep -f "UnrealEditor .*Dwnshift"` guard fell into, so it silently
# passed every time and let headless runs write assets underneath a live editor:
#
#   1. The editor is launched with an EMPTY command line (its log prints
#      "Command Line:" blank), so `pgrep -f` never sees it. Match on the binary
#      path from `ps -eo comm=` instead. The $ anchor keeps the separate
#      UnrealEditorServices process from matching.
#   2. `ps ... | grep -q` is wrong under the `set -o pipefail` above: grep -q
#      exits at the first match, ps then dies of SIGPIPE, and pipefail reports
#      the pipeline as FAILED even though it matched. awk drains its input, so
#      it cannot trigger SIGPIPE.
EDITOR_PIDS="$(ps -eo pid=,comm= | awk '/MacOS\/UnrealEditor$/{printf "%s ", $1}')"
if [ -n "$EDITOR_PIDS" ]; then
  echo "The Unreal editor is open on this project (pid: $EDITOR_PIDS)." >&2
  echo "Close it first -- it holds an exclusive lock, and its in-memory copies" >&2
  echo "will overwrite anything written here when it saves." >&2
  exit 3
fi

# Commandlets run with rendering disabled, so a render target never gets a GPU
# resource and LandscapeImportHeightmapFromRenderTarget rejects it with
# "Render Target must be non null and not released".
# A plain string, not an array: macOS ships bash 3.2, where "${ARR[@]}" on an
# EMPTY array is an unbound-variable error under `set -u` and kills the script
# before the editor ever launches.
EXTRA=""
if [ "${NEEDS_RENDERING:-0}" = "1" ]; then
  EXTRA="-AllowCommandletRendering"
fi

LOG="$LOGDIR/$1.log"
echo "running $(basename "$SCRIPT")"
echo "log: $LOG"
"$ENGINE" "$PROJECT" -run=pythonscript -script="$SCRIPT" \
  -unattended -nopause -nosplash -stdout -FullStdOutLogOutput $EXTRA > "$LOG" 2>&1

echo "--- script output ---"
grep -a "Los Santerra\|Fab trees\|\[PROBE\]\|\[FIX\]\|\[PCGPROBE\]\|\[RoadPCG\]\|\[PCGPROBE2\]\|\[P3\]\|\[P4\]" "$LOG" | sed 's/.*LogPython: Warning: //' | sort -u
echo "--- real errors ---"
grep -aE "Error:" "$LOG" | grep -av "HttpListener" | head -20 || echo "(none)"
