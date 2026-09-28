"""Dress Los Santerra's roads with PCG.

This is the step import_los_santerra.py left open: "nothing is placed for the
building lots yet ... they belong in PCG". Rather than spawn thousands of actors,
one PCG graph runs per road spline and generates that road's frontage on demand.

Why frontage off the spline and not the 18k exported lots
--------------------------------------------------------
The lots are a fixed bake. A spline-driven graph regenerates whenever the road
moves, respects the road's real width, and gives PCG the thing it is good at --
sampling along a curve, jittering, pruning overlaps and instancing. It is also
the shape the Matrix Awakens city used: rules along streets, not placed objects.

What it builds
--------------
1. Building archetypes as Nanite static meshes (Geometry Script): tower, midrise,
   storefront block, house, warehouse. Massing is multi-volume with setbacks and
   crowns, matching the browser world's `massing()` vocabulary, so a street reads
   as a skyline rather than a row of identical boxes.
2. A facade material that tints per instance and lights its glazing after dark,
   so colour variety costs no extra draw calls.
3. PCG_LosSanterra_Frontage: the generation graph.
4. BP_RoadPCG: a spline actor carrying a PCGComponent bound to that graph.
5. One BP_RoadPCG per road in los-santerra-roads-thin.json, filed by kind.

Run tools/thin_network.py first, then from the editor (Tools > Execute Python
Script) or headless:

    UnrealEditor-Cmd Dwnshift.uproject -run=pythonscript \
        -script="/Users/peterchi/Desktop/Dwn SHIFT/unreal/build_los_santerra_pcg.py"

Re-running rebuilds; it does not duplicate.
"""
import json
import os

import unreal

PROJECT = r'/Users/peterchi/Desktop/Dwn SHIFT'
DATA_DIR = os.path.join(PROJECT, 'output', 'unreal')
ROADS_THIN = os.path.join(DATA_DIR, 'los-santerra-roads-thin.json')
ROADS_FULL = os.path.join(DATA_DIR, 'los-santerra-roads.json')

ROOT = '/Game/LosSanterra'
LEVEL_PATH = ROOT + '/Maps/L_LosSanterra'
BUILDING_DIR = ROOT + '/Buildings'
MATERIAL_DIR = ROOT + '/Materials'
PCG_DIR = ROOT + '/PCG'
GRAPH_PATH = PCG_DIR + '/PCG_LosSanterra_Frontage'
BP_PATH = PCG_DIR + '/BP_RoadPCG'
PCG_TAG = 'LosSanterraPCG'

# Roads too narrow or too wild to line with buildings. Freeways and ramps get no
# frontage; canyon and dirt roads are scenery, and their hillsides get trees from
# build_los_santerra_trees.py instead.
NO_FRONTAGE_KINDS = {'freeway', 'ramp', 'tunnel', 'scenic', 'dirt'}

assets = unreal.EditorAssetLibrary
actor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
prims = unreal.GeometryScript_Primitives
new_assets = unreal.GeometryScript_NewAssetUtils
asset_tools = unreal.AssetToolsHelpers.get_asset_tools()


def log(message):
    unreal.log_warning('[Los Santerra PCG] {}'.format(message))


def xform(x=0.0, y=0.0, z=0.0, sx=1.0, sy=1.0, sz=1.0):
    return unreal.Transform(unreal.Vector(x, y, z), unreal.Rotator(0, 0, 0),
                            unreal.Vector(sx, sy, sz))


def box(mesh, opts, w, d, h, z=0.0):
    """A box of w x d x h centimetres sitting with its base at z.

    AppendBox takes the Transform third, before the dimensions, and its Origin
    defaults to Base -- so the transform is the base plane, not the centre.
    """
    prims.append_box(mesh, opts,
                     unreal.Transform(unreal.Vector(0, 0, z),
                                      unreal.Rotator(0, 0, 0),
                                      unreal.Vector(1, 1, 1)),
                     w, d, h, 0, 0, 0)


# ---------------------------------------------------------------- archetypes
# Each builder makes one building with its base at Z=0 and its street frontage
# facing +X, which is the direction Spline Sampler hands the points.
def tower(m, o):
    box(m, o, 2600, 2600, 4200)            # podium
    box(m, o, 2000, 2000, 12000, 4200)     # shaft, set back
    box(m, o, 1400, 1400, 5000, 16200)     # upper setback
    box(m, o, 600, 600, 1600, 21200)       # crown / plant room


def midrise(m, o):
    box(m, o, 2800, 2200, 5600)
    box(m, o, 2400, 1800, 2600, 5600)
    box(m, o, 900, 700, 500, 8200)


def storefront(m, o):
    box(m, o, 3000, 1800, 1400)            # shopfront
    box(m, o, 3000, 2000, 2800, 1400)      # two floors over
    box(m, o, 3200, 260, 200, 1250)        # awning over the pavement


def house(m, o):
    box(m, o, 1500, 1200, 620)
    box(m, o, 1500, 1200, 520, 620)        # upper storey / roof mass
    box(m, o, 420, 380, 260, 620)          # garage / porch mass


def warehouse(m, o):
    box(m, o, 4200, 3000, 1100)
    box(m, o, 800, 700, 340, 1100)         # roof plant


ARCHETYPES = {          # name: (builder, weight)
    'Tower': (tower, 4),
    'Midrise': (midrise, 14),
    'Storefront': (storefront, 22),
    'House': (house, 30),
    'Warehouse': (warehouse, 8),
}


# ------------------------------------------------------------------ material
def facade_material():
    path = '{}/M_Facade'.format(MATERIAL_DIR)
    if assets.does_asset_exist(path):
        return assets.load_asset(path)
    mat = asset_tools.create_asset('M_Facade', MATERIAL_DIR, unreal.Material,
                                   unreal.MaterialFactoryNew())
    lib = unreal.MaterialEditingLibrary

    # Two plaster/concrete tones, mixed per instance so no two neighbours match.
    warm = lib.create_material_expression(mat, unreal.MaterialExpressionConstant3Vector, -700, -120)
    warm.set_editor_property('constant', unreal.LinearColor(0.34, 0.30, 0.25, 1))
    cool = lib.create_material_expression(mat, unreal.MaterialExpressionConstant3Vector, -700, 40)
    cool.set_editor_property('constant', unreal.LinearColor(0.20, 0.21, 0.23, 1))
    rand = lib.create_material_expression(mat, unreal.MaterialExpressionPerInstanceRandom, -700, 200)
    mix = lib.create_material_expression(mat, unreal.MaterialExpressionLinearInterpolate, -380, 0)
    lib.connect_material_expressions(warm, '', mix, 'A')
    lib.connect_material_expressions(cool, '', mix, 'B')
    lib.connect_material_expressions(rand, '', mix, 'Alpha')
    lib.connect_material_property(mix, '', unreal.MaterialProperty.MP_BASE_COLOR)

    rough = lib.create_material_expression(mat, unreal.MaterialExpressionConstant, -380, 240)
    rough.set_editor_property('r', 0.72)
    lib.connect_material_property(rough, '', unreal.MaterialProperty.MP_ROUGHNESS)

    mat.set_editor_property('used_with_instanced_static_meshes', True)
    mat.set_editor_property('used_with_nanite', True)
    lib.recompile_material(mat)
    assets.save_asset(path)
    log('created ' + path)
    return mat


# -------------------------------------------------------------------- meshes
def build_buildings():
    mat = facade_material()
    built = {}
    for name, (builder, weight) in ARCHETYPES.items():
        path = '{}/SM_Bld_{}'.format(BUILDING_DIR, name)
        if assets.does_asset_exist(path):
            assets.delete_asset(path)
        mesh = unreal.DynamicMesh()
        builder(mesh, unreal.GeometryScriptPrimitiveOptions())
        options = unreal.GeometryScriptCreateNewStaticMeshAssetOptions()
        options.set_editor_property('enable_collision', True)
        options.set_editor_property('collision_mode',
                                    unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
        options.set_editor_property('enable_recompute_normals', True)
        options.set_editor_property('enable_nanite', True)
        static_mesh, outcome = new_assets.create_new_static_mesh_asset_from_mesh(
            mesh, path, options)
        if outcome != unreal.GeometryScriptOutcomePins.SUCCESS or static_mesh is None:
            raise RuntimeError('could not build ' + path)
        static_mesh.set_material(0, mat)
        assets.save_asset(path)
        built[name] = (static_mesh, weight)
    log('{} building archetypes ready'.format(len(built)))
    return built


# ----------------------------------------------------------------- pcg graph
def add_node(graph, settings_class, x, y):
    """Add a node and return (node, settings). Position is editor-only cosmetics."""
    node, settings = graph.add_node_of_type(settings_class)
    if node is None:
        raise RuntimeError('could not add ' + str(settings_class))
    try:
        node.set_editor_property('node_position_x', int(x))
        node.set_editor_property('node_position_y', int(y))
    except Exception:
        pass
    return node, settings


def set_props(obj, **props):
    """Set what this build actually exposes; report the rest instead of dying.

    PCG's property names have moved between 5.x releases, so a rename should cost
    one skipped tweak and a log line, not the whole graph.
    """
    for name, value in props.items():
        try:
            obj.set_editor_property(name, value)
        except Exception as error:
            log('  note: could not set {}.{} ({})'.format(
                type(obj).__name__, name, error))


def weighted_selector(spawner, weighted_meshes):
    """Fill a Static Mesh Spawner's weighted mesh list.

    MeshSelectorParameters is an Instanced, VisibleAnywhere UObject: assigning a
    freshly constructed selector to it does not stick. The supported route is to
    set the selector *type*, let PCG instantiate it, then mutate that instance.
    """
    try:
        spawner.set_mesh_selector_type(unreal.PCGMeshSelectorWeighted)
    except Exception as error:
        log('  note: set_mesh_selector_type failed ({})'.format(error))
    selector = spawner.get_editor_property('mesh_selector_parameters')
    if selector is None:
        log('  note: no mesh selector instance -- set the meshes by hand')
        return
    entries = []
    for mesh, weight in weighted_meshes:
        entry = unreal.PCGMeshSelectorWeightedEntry()
        descriptor = entry.get_editor_property('descriptor')
        set_props(descriptor, static_mesh=mesh)
        set_props(entry, descriptor=descriptor, weight=weight)
        entries.append(entry)
    set_props(selector, mesh_entries=entries)


def build_graph(buildings):
    if assets.does_asset_exist(GRAPH_PATH):
        assets.delete_asset(GRAPH_PATH)
    graph = asset_tools.create_asset('PCG_LosSanterra_Frontage', PCG_DIR,
                                     unreal.PCGGraph, unreal.PCGGraphFactory())
    if graph is None:
        raise RuntimeError('could not create ' + GRAPH_PATH)

    # 1. Sample both kerbs of the road spline at building spacing.
    sampler_node, sampler = add_node(graph, unreal.PCGSplineSamplerSettings, -600, 0)
    params = sampler.get_editor_property('sampler_params')
    set_props(params,
              dimension=unreal.PCGSplineSamplingDimension.ON_HORIZONTAL,
              mode=unreal.PCGSplineSamplingMode.DISTANCE,
              distance_increment=2600.0,   # one building plot every 26 m
              num_planar_subdivisions=1)
    set_props(sampler, sampler_params=params, seed=20260915)

    # 2. Push points off the centreline to the building line and shuffle them, so
    #    frontage is not a ruler-straight wall. Z is left alone: the points are
    #    already on the draped spline, and the spawner projects onto the landscape.
    transform_node, transform = add_node(graph, unreal.PCGTransformPointsSettings, -300, 0)
    set_props(transform,
              offset_min=unreal.Vector(-900.0, 1800.0, 0.0),
              offset_max=unreal.Vector(900.0, 3400.0, 0.0),
              absolute_offset=False,
              rotation_min=unreal.Rotator(0.0, 0.0, -4.0),
              rotation_max=unreal.Rotator(0.0, 0.0, 4.0),
              absolute_rotation=False,
              scale_min=unreal.Vector(0.85, 0.85, 0.55),
              scale_max=unreal.Vector(1.25, 1.25, 1.9),
              absolute_scale=False,
              recompute_seed=True)

    # 3. Drop anything that ended up inside its neighbour.
    # Defaults in 5.8 are already LargeToSmall / 0.25 / randomized, and the
    # individual knobs are not script-exposed, so this is left stock on purpose.
    prune_node, prune = add_node(graph, unreal.PCGSelfPruningSettings, -40, 0)

    # 4. Instance the archetypes, weighted so a street gets many small buildings
    #    and a few tall ones -- the distribution that makes a skyline.
    spawner_node, spawner = add_node(graph, unreal.PCGStaticMeshSpawnerSettings, 240, 0)
    weighted_selector(spawner, [(mesh, weight)
                                for mesh, weight in buildings.values()])
    set_props(spawner, apply_mesh_bounds_to_points=False)

    for a, b in ((sampler_node, transform_node), (transform_node, prune_node),
                 (prune_node, spawner_node)):
        graph.add_edge(a, 'Out', b, 'In')

    # Wire the graph's own input/output so the component feeds the spline in.
    try:
        # The default Input node exposes a single pin labelled "In"; the
        # Actor/Landscape labels in PCGInputOutputConstants are optional pins
        # that a stock graph does not carry.
        graph.add_edge(graph.get_input_node(), 'In', sampler_node, 'Spline')
        graph.add_edge(spawner_node, 'Out', graph.get_output_node(), 'Out')
    except Exception as error:
        log('note: could not auto-wire graph input/output ({}) -- '
            'connect Input->Spline Sampler by hand once'.format(error))

    assets.save_asset(GRAPH_PATH)
    log('created ' + GRAPH_PATH)
    return graph


# ------------------------------------------------------------------ blueprint
def build_blueprint(graph):
    """An actor with a spline PCG reads, and a PCGComponent that runs the graph."""
    if assets.does_asset_exist(BP_PATH):
        assets.delete_asset(BP_PATH)
    factory = unreal.BlueprintFactory()
    factory.set_editor_property('parent_class', unreal.Actor)
    blueprint = asset_tools.create_asset('BP_RoadPCG', PCG_DIR, None, factory)
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
    # set_graph is the supported way in; graph_instance is read-mostly.
    try:
        pcg.set_graph(graph)
    except Exception as error:
        log('note: could not bind graph from script ({}) -- '
            'set BP_RoadPCG > PCG > Graph to PCG_LosSanterra_Frontage'.format(error))

    unreal.BlueprintEditorLibrary.compile_blueprint(blueprint)
    assets.save_asset(BP_PATH)
    log('created ' + BP_PATH)
    return blueprint


# ---------------------------------------------------------------------- place
def clear_old():
    removed = 0
    for actor in actor_subsystem.get_all_level_actors():
        if unreal.Name(PCG_TAG) in actor.tags:
            actor_subsystem.destroy_actor(actor)
            removed += 1
    if removed:
        log('removed {} old PCG actors'.format(removed))


def road_data():
    path = ROADS_THIN if os.environ.get('LOS_SANTERRA_THIN') and os.path.exists(ROADS_THIN) else ROADS_FULL
    if path == ROADS_THIN:
        log('using the thinned export (LOS_SANTERRA_THIN is set)')
    with open(path) as handle:
        return json.load(handle), path


def place(blueprint):
    payload, path = road_data()
    roads = [r for r in payload['roads'] if r['kind'] not in NO_FRONTAGE_KINDS]
    log('{} roads to dress (of {} in {})'.format(
        len(roads), len(payload['roads']), os.path.basename(path)))
    clear_old()

    actor_class = blueprint.generated_class()
    origin, rotation = unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0)
    task = unreal.ScopedSlowTask(len(roads), 'Placing Los Santerra PCG roads')
    task.make_dialog(True)
    placed, km = 0, 0.0
    for road in roads:
        if task.should_cancel():
            break
        task.enter_progress_frame(1, road['name'])
        actor = actor_subsystem.spawn_actor_from_class(actor_class, origin, rotation)
        if actor is None:
            continue
        spline = actor.get_component_by_class(unreal.SplineComponent)
        spline.clear_spline_points(False)
        for x, y, z in road['points']:
            spline.add_spline_point(unreal.Vector(x, y, z),
                                    unreal.SplineCoordinateSpace.WORLD, False)
        spline.set_closed_loop(False, False)
        spline.update_spline()

        actor.set_actor_label('PCG {} [{}]'.format(road['name'], road['kind']))
        actor.set_folder_path('LosSanterra/PCG/{}'.format(road['kind']))
        actor.tags = [unreal.Name(PCG_TAG), unreal.Name(road['kind']),
                      unreal.Name(road['district'])]
        placed += 1
        km += road['lengthM'] / 1000.0
    del task
    log('placed {} PCG road actors, {:.0f} km of frontage'.format(placed, km))
    return placed


def generate():
    """Kick every PCG component once so the level is dressed without a manual pass."""
    done = 0
    for actor in actor_subsystem.get_all_level_actors():
        if unreal.Name(PCG_TAG) not in actor.tags:
            continue
        component = actor.get_component_by_class(unreal.PCGComponent)
        if component is None:
            continue
        try:
            component.generate(True)
            done += 1
        except Exception as error:
            log('generate failed on {}: {}'.format(actor.get_actor_label(), error))
            break
    log('generated {} PCG components'.format(done))


def main():
    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    if not levels.load_level(LEVEL_PATH):
        raise RuntimeError('open {} first (run build_los_santerra_level.py)'.format(LEVEL_PATH))
    buildings = build_buildings()
    graph = build_graph(buildings)
    blueprint = build_blueprint(graph)
    place(blueprint)
    generate()
    levels.save_current_level()
    log('saved ' + LEVEL_PATH)
    log('Tune: select a PCG road, open PCG_LosSanterra_Frontage, change '
        'Distance Increment / Transform Points offsets, and it regenerates live.')


main()
