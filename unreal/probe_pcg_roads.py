"""Which PCG pieces does this engine actually expose to Python?

build_los_santerra_pcg.py proved that graph authoring works (add_node_of_type /
add_edge). This probes the specific nodes a ROAD SURFACE graph needs, which the
frontage graph never used -- above all the spline-mesh spawner, the node that
deforms a mesh along a spline and is the whole reason splines beat polylines.

Names differ between UE versions (PCGSplineMeshSpawner vs PCGCreateSpline vs
SplineMeshParams living on the static mesh spawner), so guessing is how you get a
400-line script that dies on line 30. Run this first:

    ./unreal/run.sh pcgprobe
"""
import unreal

L = unreal.log_warning

# Settings classes: the node types we may want in the road graph.
WANTED = [
    # data in
    'PCGDataFromActorSettings',
    'PCGGetSplineSettings',
    'PCGLandscapeDataSettings',
    'PCGGetLandscapeSettings',
    # sampling
    'PCGSplineSamplerSettings',
    'PCGSurfaceSamplerSettings',
    'PCGProjectionSettings',
    # the important one -- deform a mesh along the spline
    'PCGSplineMeshSpawnerSettings',
    'PCGSplineMeshParams',
    'PCGCreateSplineSettings',
    'PCGSplineMeshSpawner',
    # spawning / shaping
    'PCGStaticMeshSpawnerSettings',
    'PCGTransformPointsSettings',
    'PCGDensityFilterSettings',
    'PCGSelfPruningSettings',
    'PCGDifferenceSettings',
    'PCGBoundsModifierSettings',
    'PCGAttributeNoiseSettings',
    'PCGCopyPointsSettings',
    # plumbing
    'PCGGraph',
    'PCGGraphFactory',
    'PCGComponent',
    'PCGVolume',
    'PCGSubgraphSettings',
]

L('[PCGPROBE] ==== start ====')
L('[PCGPROBE] engine %s' % unreal.SystemLibrary.get_engine_version())
missing = []
for name in WANTED:
    ok = hasattr(unreal, name)
    if not ok:
        missing.append(name)
    L('[PCGPROBE] %-36s %s' % (name, 'YES' if ok else '--'))

# Anything PCG-ish with "Spline" or "Mesh" in it, so a renamed class still turns up.
L('[PCGPROBE] ---- all PCG* classes mentioning Spline/Mesh ----')
for name in sorted(dir(unreal)):
    if name.startswith('PCG') and ('Spline' in name or 'Mesh' in name):
        L('[PCGPROBE]   %s' % name)

# Enums the graph will need to set modes on.
L('[PCGPROBE] ---- enums ----')
for name in ('PCGSplineSamplingMode', 'PCGSplineSamplingDimension',
             'PCGGetDataFromActorMode', 'PCGSplineMeshSpawnerAxis',
             'SplineMeshAxis'):
    L('[PCGPROBE] %-36s %s' % (name, 'YES' if hasattr(unreal, name) else '--'))

# Can a graph actually be made and wired here, headless?
try:
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    g = tools.create_asset('PCG_ProbeScratch', '/Game/LosSanterra/PCG',
                           unreal.PCGGraph, unreal.PCGGraphFactory())
    node, settings = g.add_node_of_type(unreal.PCGSplineSamplerSettings)
    L('[PCGPROBE] add_node_of_type works: %s' % type(settings).__name__)
    L('[PCGPROBE] graph input node: %s' % g.get_input_node())
    unreal.EditorAssetLibrary.delete_asset('/Game/LosSanterra/PCG/PCG_ProbeScratch')
    L('[PCGPROBE] scratch graph deleted')
except Exception as exc:
    L('[PCGPROBE] *** graph authoring FAILED: %s' % exc)

if missing:
    L('[PCGPROBE] missing: %s' % ', '.join(missing))
L('[PCGPROBE] ==== done ====')
