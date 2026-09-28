"""Fourth probe: input pin labels on PCGSpawnSplineMesh. Invalid labels log a
LogPCG error naming them, so elimination gives the valid set."""
import unreal
L = unreal.log_warning
assets = unreal.EditorAssetLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()
S = '/Game/LosSanterra/PCG/PCG_Probe4'
L('[P4] ==== start ====')
if assets.does_asset_exist(S):
    assets.delete_asset(S)
g = tools.create_asset('PCG_Probe4', '/Game/LosSanterra/PCG',
                       unreal.PCGGraph, unreal.PCGGraphFactory())
spawn, _ = g.add_node_of_type(unreal.PCGSpawnSplineMeshSettings)
meshsrc, ms = g.add_node_of_type(unreal.PCGGetStaticMeshResourceDataSettings)

CANDIDATES = ('In', 'Spline', 'Splines', 'Mesh', 'Meshes', 'Descriptor',
              'Descriptors', 'SplineMeshParams', 'Params', 'Overrides',
              'StaticMesh', 'Data', 'Input')
L('[P4] --- trying INPUT labels on SpawnSplineMesh (from graph input) ---')
for label in CANDIDATES:
    try:
        g.add_edge(g.get_input_node(), 'In', spawn, label)
        L('[P4] tried spawn input label: %s' % label)
    except Exception as e:
        L('[P4] raised on %s: %s' % (label, e))
L('[P4] --- trying OUTPUT labels on GetStaticMeshResourceData ---')
for label in ('Out', 'Mesh', 'Meshes', 'Data', 'Output'):
    try:
        g.add_edge(meshsrc, label, spawn, 'In')
        L('[P4] tried meshsrc output label: %s' % label)
    except Exception as e:
        L('[P4] raised on %s: %s' % (label, e))
assets.delete_asset(S)
L('[P4] ==== done ====')
