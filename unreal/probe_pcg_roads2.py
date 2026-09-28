"""Second probe: exact PIN LABELS and how PCGSpawnSplineMesh gets its mesh.

Round one gave class names. It did not give pin labels ("does not have the In
label") nor how the spawner is fed a static mesh -- it has no static_mesh
property, only spline_mesh_override_descriptions / _params_override, which says
the mesh arrives as data on a pin. Guessing twice is how you burn an afternoon.

    ./unreal/run.sh pcgprobe2
"""
import unreal

L = unreal.log_warning
assets = unreal.EditorAssetLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()

SCRATCH = '/Game/LosSanterra/PCG/PCG_Probe2'

L('[PCGPROBE2] ==== start ====')
if assets.does_asset_exist(SCRATCH):
    assets.delete_asset(SCRATCH)
graph = tools.create_asset('PCG_Probe2', '/Game/LosSanterra/PCG',
                           unreal.PCGGraph, unreal.PCGGraphFactory())


def pins(node, label):
    """Pin labels, the thing add_edge actually needs."""
    for accessor, side in (('get_input_pins', 'IN '), ('get_output_pins', 'OUT')):
        try:
            found = getattr(node, accessor)()
        except Exception as error:
            L('[PCGPROBE2] %s %s %s -> %s' % (label, side, accessor, error))
            continue
        names = []
        for pin in found:
            try:
                props = pin.get_editor_property('properties')
                names.append(str(props.get_editor_property('label')))
            except Exception:
                names.append(repr(pin))
        L('[PCGPROBE2] %-30s %s pins: %s' % (label, side, ', '.join(names)))


pins(graph.get_input_node(), 'INPUT node')
pins(graph.get_output_node(), 'OUTPUT node')

for cls_name in ('PCGSpawnSplineMeshSettings', 'PCGCleanSplineSettings',
                 'PCGCreateSplineMeshSettings', 'PCGSplineToMeshSettings',
                 'PCGOffsetSplineSettings', 'PCGProjectionSettings'):
    cls = getattr(unreal, cls_name, None)
    if cls is None:
        L('[PCGPROBE2] %s MISSING' % cls_name)
        continue
    try:
        node, settings = graph.add_node_of_type(cls)
    except Exception as error:
        L('[PCGPROBE2] %s add failed: %s' % (cls_name, error))
        continue
    pins(node, cls_name)

# How does the spawner name its mesh? Inspect the override description struct.
for struct_name in ('PCGSplineMeshOverrideDescription', 'PCGSplineMeshParams',
                    'SoftStaticMeshComponentDescriptor',
                    'PCGSoftStaticMeshComponentDescriptor'):
    cls = getattr(unreal, struct_name, None)
    if cls is None:
        L('[PCGPROBE2] struct %s MISSING' % struct_name)
        continue
    try:
        inst = cls()
    except Exception as error:
        L('[PCGPROBE2] struct %s cannot construct: %s' % (struct_name, error))
        continue
    names = []
    for name in dir(inst):
        if name.startswith('_'):
            continue
        try:
            inst.get_editor_property(name)
        except Exception:
            continue
        names.append(name)
    L('[PCGPROBE2] struct %-40s %s' % (struct_name, ', '.join(sorted(names))))

# Anything that looks like it CARRIES a mesh into the graph.
L('[PCGPROBE2] ---- mesh-carrying node candidates ----')
for name in sorted(dir(unreal)):
    if name.startswith('PCG') and name.endswith('Settings'):
        if any(k in name for k in ('StaticMesh', 'MeshSelector', 'Descriptor',
                                   'GetStaticMesh', 'SplineMesh')):
            L('[PCGPROBE2]   %s' % name)

# Can a Blueprint actor be spawned at all in a commandlet? (round one: None)
L('[PCGPROBE2] ---- actor spawn routes ----')
bp_path = '/Game/LosSanterra/PCG/BP_RoadSpline'
if assets.does_asset_exist(bp_path):
    unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).load_level(
        '/Game/LosSanterra/Maps/L_LosSanterra')
    sub = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    bp = assets.load_asset(bp_path)
    loc = unreal.Vector(0, 0, 50000)
    try:
        a = sub.spawn_actor_from_object(bp, loc)
        L('[PCGPROBE2] spawn_actor_from_object -> %s' % a)
        if a:
            sub.destroy_actor(a)
    except Exception as error:
        L('[PCGPROBE2] spawn_actor_from_object raised %s' % error)
    try:
        gen = bp.generated_class()
        a = sub.spawn_actor_from_class(gen, loc)
        L('[PCGPROBE2] spawn_actor_from_class(generated_class) -> %s' % a)
        if a:
            L('[PCGPROBE2]   has SplineComponent: %s'
              % (a.get_component_by_class(unreal.SplineComponent) is not None))
            L('[PCGPROBE2]   has PCGComponent:    %s'
              % (a.get_component_by_class(unreal.PCGComponent) is not None))
            sub.destroy_actor(a)
    except Exception as error:
        L('[PCGPROBE2] spawn_actor_from_class raised %s' % error)
else:
    L('[PCGPROBE2] no BP_RoadSpline yet')

assets.delete_asset(SCRATCH)
L('[PCGPROBE2] ==== done ====')
