"""Third probe: does PCGCreateSplineMesh carry the mesh, and which pin label
does the output node accept? Both are one-line unknowns blocking the builder."""
import unreal
L = unreal.log_warning
assets = unreal.EditorAssetLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()
S = '/Game/LosSanterra/PCG/PCG_Probe3'
L('[P3] ==== start ====')
if assets.does_asset_exist(S):
    assets.delete_asset(S)
g = tools.create_asset('PCG_Probe3', '/Game/LosSanterra/PCG',
                       unreal.PCGGraph, unreal.PCGGraphFactory())

def props(o, label):
    names = []
    for n in dir(o):
        if n.startswith('_'):
            continue
        try:
            v = o.get_editor_property(n)
        except Exception:
            continue
        names.append('%s=%r' % (n, v) if 'mesh' in n.lower() or 'desc' in n.lower() else n)
    L('[P3] %-34s %s' % (label, ', '.join(sorted(names))))

for cls_name in ('PCGCreateSplineMeshSettings', 'PCGSplineToMeshSettings',
                 'PCGGetStaticMeshResourceDataSettings'):
    cls = getattr(unreal, cls_name, None)
    if cls is None:
        L('[P3] %s MISSING' % cls_name); continue
    node, st = g.add_node_of_type(cls)
    props(st, cls_name)

# Which label does the OUTPUT node accept? Try each and see which logs no error.
clean_node, _ = g.add_node_of_type(unreal.PCGCleanSplineSettings)
for label in ('In', 'Out', 'Output', 'Data'):
    try:
        ok = g.add_edge(clean_node, 'Out', g.get_output_node(), label)
        L('[P3] output pin %-8s add_edge -> %s' % (label, ok))
    except Exception as e:
        L('[P3] output pin %-8s raised %s' % (label, e))
for label in ('In', 'Out', 'Input', 'Data'):
    try:
        ok = g.add_edge(g.get_input_node(), label, clean_node, 'In')
        L('[P3] input pin  %-8s add_edge -> %s' % (label, ok))
    except Exception as e:
        L('[P3] input pin  %-8s raised %s' % (label, e))
assets.delete_asset(S)
L('[P3] ==== done ====')
