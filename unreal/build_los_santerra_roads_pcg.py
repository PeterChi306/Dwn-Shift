"""Roads as SPLINES driven by PCG, replacing the baked static-mesh ribbons.

Why this exists
---------------
build_los_santerra_level.py bakes each road into a static mesh built from the
centreline POLYLINE. A polyline with 11 m segments and a 6 degree turn is a
visible flat facet, and every chunk boundary is a seam -- both plainly visible in
the 2026-09-17 viewport shots. A Spline with real tangents is curvature
continuous, and PCGSpawnSplineMesh deforms a cross-section along it, so the
smoothness comes from the curve rather than from adding more vertices.

Node names checked on THIS engine by probe_pcg_roads.py (UE 5.8.2). The spawner
is PCGSpawnSplineMeshSettings -- NOT PCGSplineMeshSpawnerSettings, which does not
exist here. Do not rename on memory; re-probe.

Scope: a PILOT. Only `street` roads whose points fall inside PILOT_BOUNDS
(Downtown) are built, because the full network is 1,274 km and would stall the
editor before we know the chain works. Widen PILOT_BOUNDS or clear PILOT_KINDS
once it looks right.

The baked road meshes are left alone, so you can compare side by side. They carry
tag LosSanterraRoad; these carry LosSanterraRoadSpline.

Run with the editor CLOSED:

    ./unreal/run.sh roadpcg
"""
import json
import math
import os

import unreal

PROJECT = r'/Users/peterchi/Desktop/Dwn SHIFT'
DATA_DIR = os.path.join(PROJECT, 'output', 'unreal')
ROADS = os.path.join(DATA_DIR, 'los-santerra-roads.json')

ROOT = '/Game/LosSanterra'
LEVEL_PATH = ROOT + '/Maps/L_LosSanterra'
PCG_DIR = ROOT + '/PCG'
MESH_DIR = ROOT + '/Roads'
GRAPH_PATH = PCG_DIR + '/PCG_LosSanterra_RoadSurface'
BP_PATH = PCG_DIR + '/BP_RoadSpline'
ASPHALT_MESH = MESH_DIR + '/SM_RoadSection'
SPLINE_TAG = 'LosSanterraRoadSpline'

# --- pilot scope -----------------------------------------------------------
# Centimetres, world space. Downtown sits near the origin; this is ~3 x 3 km.
PILOT_BOUNDS = (-150000.0, -150000.0, 150000.0, 150000.0)
PILOT_KINDS = {'street', 'avenue', 'boulevard'}
PILOT_MAX_ROADS = 60

# The cross-section is authored 100 cm wide, so a spline point's Y scale IS the
# road width in metres. One mesh covers every width instead of one mesh per kind.
SECTION_LEN_CM = 100.0
SECTION_WIDTH_CM = 100.0
SECTION_THICK_CM = 20.0

assets = unreal.EditorAssetLibrary
actor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
prims = unreal.GeometryScript_Primitives
new_assets = unreal.GeometryScript_NewAssetUtils


def log(message):
    unreal.log_warning('[RoadPCG] {}'.format(message))


def set_props(obj, **props):
    """Set what this build exposes; report the rest rather than dying.

    PCG property names move between 5.x releases. A rename should cost one log
    line and one skipped tweak, not the whole graph.
    """
    for name, value in props.items():
        try:
            obj.set_editor_property(name, value)
        except Exception as error:
            log('  note: could not set {}.{} ({})'.format(
                type(obj).__name__, name, error))


def dump_props(obj, label):
    """Print an object's editor properties, so the next edit guesses nothing."""
    names = []
    for name in dir(obj):
        if name.startswith('_'):
            continue
        try:
            obj.get_editor_property(name)
        except Exception:
            continue
        names.append(name)
    log('  {} properties: {}'.format(label, ', '.join(sorted(names)) or '(none)'))


# ------------------------------------------------------------------- level
def open_level():
    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    if not assets.does_asset_exist(LEVEL_PATH):
        raise RuntimeError('no level at ' + LEVEL_PATH)
    levels.load_level(LEVEL_PATH)
    log('opened ' + LEVEL_PATH)


# -------------------------------------------------------------------- mesh
def build_section_mesh():
    """One road cross-section: 1 m long, 1 m wide, surface at Z=0.

    Nanite is deliberately OFF. Spline meshes deform per instance, and a Nanite
    road section is the kind of thing that either silently ignores the deform or
    costs more than it saves. Get it correct first.
    """
    if assets.does_asset_exist(ASPHALT_MESH):
        assets.delete_asset(ASPHALT_MESH)
    mesh = unreal.DynamicMesh()
    options = unreal.GeometryScriptPrimitiveOptions()
    # append_box origin defaults to Base, so the transform Z is the base plane:
    # put the base a slab-thickness below zero and the driving surface lands at 0.
    prims.append_box(mesh, options,
                     unreal.Transform(unreal.Vector(0, 0, -SECTION_THICK_CM),
                                      unreal.Rotator(0, 0, 0),
                                      unreal.Vector(1, 1, 1)),
                     SECTION_LEN_CM, SECTION_WIDTH_CM, SECTION_THICK_CM, 0, 0, 0)

    create = unreal.GeometryScriptCreateNewStaticMeshAssetOptions()
    set_props(create,
              enable_collision=True,
              collision_mode=unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE,
              enable_recompute_normals=True,
              enable_nanite=False)
    static_mesh, outcome = new_assets.create_new_static_mesh_asset_from_mesh(
        mesh, ASPHALT_MESH, create)
    if outcome != unreal.GeometryScriptOutcomePins.SUCCESS or static_mesh is None:
        raise RuntimeError('could not build ' + ASPHALT_MESH)

    existing = '/Game/LosSanterra/Materials/M_LosSanterra_asphalt'
    if assets.does_asset_exist(existing):
        static_mesh.set_material(0, assets.load_asset(existing))
        log('section mesh uses the existing asphalt material')
    assets.save_asset(ASPHALT_MESH)
    log('built ' + ASPHALT_MESH)
    return static_mesh


# ------------------------------------------------------------------- graph
def add_node(graph, settings_class, x, y):
    node, settings = graph.add_node_of_type(settings_class)
    if node is None:
        raise RuntimeError('could not add ' + str(settings_class))
    try:
        node.set_editor_property('node_position_x', int(x))
        node.set_editor_property('node_position_y', int(y))
    except Exception:
        pass
    return node, settings


def build_graph(section_mesh):
    """Input spline -> clean -> spawn spline mesh -> output.

    Deliberately minimal. Kerbs (PCGOffsetSpline), markings and lamps are the
    next layer; a graph that does one thing correctly is what we can verify.
    """
    if assets.does_asset_exist(GRAPH_PATH):
        assets.delete_asset(GRAPH_PATH)
    graph = asset_tools.create_asset('PCG_LosSanterra_RoadSurface', PCG_DIR,
                                     unreal.PCGGraph, unreal.PCGGraphFactory())
    if graph is None:
        raise RuntimeError('could not create ' + GRAPH_PATH)

    clean_node, clean = add_node(graph, unreal.PCGCleanSplineSettings, -400, 0)
    # Fuse duplicate control points and drop collinear ones. The centrelines have
    # points 1 m apart in places, which is noise a spline does not need.
    set_props(clean, fuse_colocated_control_points=True,
              remove_collinear_control_points=True,
              colocation_distance_threshold=50.0)

    # The mesh enters the graph as DATA: PCGSpawnSplineMesh has no static_mesh
    # property, only In / Overrides pins (probe 4). GetStaticMeshResourceData
    # carries a static_meshes array and outputs on Out.
    mesh_node, mesh_src = add_node(
        graph, unreal.PCGGetStaticMeshResourceDataSettings, -400, 220)
    set_props(mesh_src, static_meshes=[section_mesh])

    spawn_node, spawn = add_node(graph, unreal.PCGSpawnSplineMeshSettings, 0, 0)
    dump_props(spawn, 'PCGSpawnSplineMeshSettings')

    # The mesh params object carries the descriptor and the forward axis. Its
    # exact shape is what dump_props above is for -- set defensively.
    params = None
    try:
        params = spawn.get_editor_property('spline_mesh_params')
    except Exception as error:
        log('  note: no spline_mesh_params ({})'.format(error))
    if params is not None:
        dump_props(params, 'PCGSplineMeshParams')
        set_props(params, forward_axis=unreal.PCGSplineMeshForwardAxis.X)

    # NOTE: the mesh is supplied by the GetStaticMeshResourceData node above,
    # not by a property on the spawner -- probe 4 showed PCGSpawnSplineMesh has
    # no static_mesh/descriptor property and only In / Overrides pins.

    # Pin labels verified by elimination in probe 3/4: the graph INPUT node's pin
    # is 'In' and the OUTPUT node's is 'Out' -- every other spelling logs
    # "does not have the X label" at generation time rather than raising here.
    edges = ((graph.get_input_node(), 'In', clean_node, 'In'),
             (clean_node, 'Out', spawn_node, 'In'),
             (mesh_node, 'Out', spawn_node, 'In'),
             (spawn_node, 'Out', graph.get_output_node(), 'Out'))
    wired = 0
    for a, a_pin, b, b_pin in edges:
        try:
            graph.add_edge(a, a_pin, b, b_pin)
            wired += 1
        except Exception as error:
            log('  note: edge {} -> {} failed ({})'.format(a_pin, b_pin, error))
    log('wired {} of {} edges'.format(wired, len(edges)))

    assets.save_asset(GRAPH_PATH)
    log('built ' + GRAPH_PATH)
    return graph


# --------------------------------------------------------------- blueprint
def build_blueprint(graph):
    """An actor carrying a Spline the PCG graph reads, plus the PCGComponent."""
    if assets.does_asset_exist(BP_PATH):
        assets.delete_asset(BP_PATH)
    factory = unreal.BlueprintFactory()
    factory.set_editor_property('parent_class', unreal.Actor)
    blueprint = asset_tools.create_asset('BP_RoadSpline', PCG_DIR, None, factory)
    if blueprint is None:
        raise RuntimeError('could not create ' + BP_PATH)

    subsystem = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
    root = subsystem.k2_gather_subobject_data_for_blueprint(blueprint)[0]

    def add(component_class, name):
        handle, failure = subsystem.add_new_subobject(
            unreal.AddNewSubobjectParams(parent_handle=root,
                                         new_class=component_class,
                                         blueprint_context=blueprint))
        if not failure.is_empty():
            raise RuntimeError('adding {}: {}'.format(name, failure))
        subsystem.rename_subobject(handle, unreal.Text(name))
        data = unreal.SubobjectDataBlueprintFunctionLibrary.get_data(handle)
        return unreal.SubobjectDataBlueprintFunctionLibrary.get_object(data)

    add(unreal.SplineComponent, 'RoadSpline')
    pcg = add(unreal.PCGComponent, 'PCG')
    set_props(pcg,
              generation_trigger=unreal.PCGComponentGenerationTrigger.GENERATE_ON_DEMAND,
              is_component_partitioned=True)
    try:
        pcg.set_graph(graph)
    except Exception as error:
        log('note: could not bind graph ({}) -- set BP_RoadSpline > PCG > Graph '
            'to PCG_LosSanterra_RoadSurface by hand'.format(error))

    unreal.BlueprintEditorLibrary.compile_blueprint(blueprint)
    assets.save_asset(BP_PATH)
    log('built ' + BP_PATH)
    return blueprint


# ------------------------------------------------------------------- place
def tangents(points):
    """Catmull-Rom tangents: the whole reason a spline beats the polyline.

    Leave these at zero and the spline passes through the same points with the
    same corners, and nothing is gained. Endpoints use the one-sided difference.
    """
    out = []
    count = len(points)
    for i in range(count):
        if i == 0:
            a, b = points[0], points[min(1, count - 1)]
        elif i == count - 1:
            a, b = points[count - 2], points[count - 1]
        else:
            a, b = points[i - 1], points[i + 1]
        out.append(unreal.Vector((b[0] - a[0]) * 0.5,
                                 (b[1] - a[1]) * 0.5,
                                 (b[2] - a[2]) * 0.5))
    return out


def in_bounds(point):
    x0, y0, x1, y1 = PILOT_BOUNDS
    return x0 <= point[0] <= x1 and y0 <= point[1] <= y1


def pilot_roads():
    with open(ROADS) as handle:
        roads = json.load(handle)['roads']
    chosen = []
    for road in roads:
        if road['kind'] not in PILOT_KINDS or road.get('elevated'):
            continue
        points = road['points']
        if len(points) < 3:
            continue
        if not all(in_bounds(p) for p in points):
            continue
        chosen.append(road)
    chosen.sort(key=lambda r: -len(r['points']))
    return chosen[:PILOT_MAX_ROADS]


def clear_old():
    removed = 0
    for actor in actor_subsystem.get_all_level_actors():
        if unreal.Name(SPLINE_TAG) in actor.tags:
            actor_subsystem.destroy_actor(actor)
            removed += 1
    if removed:
        log('removed {} old spline actors'.format(removed))


def place(blueprint, roads):
    loaded = assets.load_asset(BP_PATH)
    placed = 0
    for road in roads:
        points = road['points']
        origin = unreal.Vector(points[0][0], points[0][1], points[0][2])
        # spawn_actor_from_object returns None in a commandlet; the generated
        # class route works and yields both components (probe 2).
        actor = actor_subsystem.spawn_actor_from_class(
            loaded.generated_class(), origin)
        if actor is None:
            log('*** spawn_actor_from_class returned None -- cannot place splines')
            return 0
        actor.set_actor_label('Spline_{}_{}'.format(road['kind'], placed))
        actor.tags = [unreal.Name(SPLINE_TAG), unreal.Name('Road_' + road['kind'])]

        spline = actor.get_component_by_class(unreal.SplineComponent)
        if spline is None:
            log('*** no SplineComponent on the spawned actor')
            return 0
        spline.clear_spline_points(False)
        tans = tangents(points)
        width_scale = road.get('width', 12.0) * 100.0 / SECTION_WIDTH_CM
        for i, point in enumerate(points):
            local = unreal.Vector(point[0] - origin.x,
                                  point[1] - origin.y,
                                  point[2] - origin.z)
            spline.add_spline_point(local, unreal.SplineCoordinateSpace.LOCAL, False)
            spline.set_tangent_at_spline_point(
                i, tans[i], unreal.SplineCoordinateSpace.LOCAL, False)
            spline.set_scale_at_spline_point(
                i, unreal.Vector(1.0, width_scale, 1.0), False)
        spline.set_closed_loop(False, False)
        spline.update_spline()
        placed += 1
    log('placed {} road spline actors'.format(placed))
    return placed


def generate():
    generated = 0
    for actor in actor_subsystem.get_all_level_actors():
        if unreal.Name(SPLINE_TAG) not in actor.tags:
            continue
        pcg = actor.get_component_by_class(unreal.PCGComponent)
        if pcg is None:
            continue
        try:
            pcg.generate(True)
            generated += 1
        except Exception as error:
            log('  note: generate failed ({})'.format(error))
            break
    log('generated {} PCG components'.format(generated))


def main():
    log('==== start ====')
    open_level()
    section = build_section_mesh()
    graph = build_graph(section)
    blueprint = build_blueprint(graph)
    clear_old()
    roads = pilot_roads()
    log('pilot: {} roads of kinds {} inside {}'.format(
        len(roads), sorted(PILOT_KINDS), PILOT_BOUNDS))
    if not roads:
        log('*** no roads matched the pilot bounds -- widen PILOT_BOUNDS')
    else:
        if place(blueprint, roads):
            generate()
    unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()
    log('level saved')
    log('==== done ====')


main()
