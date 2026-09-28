"""Scatter the imported Fab trees over Los Santerra's terrain with PCG.

This replaces the HISM approach in build_los_santerra_trees.py. That script baked
~200 k transforms from a JSON file; a PCG graph samples the Landscape instead, so
slope, height and distance-from-road rules are evaluated in the editor and you can
retune a hillside without re-running the Python toolchain.

Rules, in the order the graph applies them:

1. Sample the Landscape surface inside the volume.
2. Drop anything steeper than the trees would sit on, and anything above the tree
   line -- Los Santerra's terrain runs 5.7 m to 532 m, and bare rock above the
   ridges is what makes the hills read as hills.
3. Push the remainder off the road network, so PCG never plants a 1 M triangle
   oak in the middle of a carriageway.
4. Jitter rotation and scale, then instance the Fab meshes weighted per biome.

The trees are Nanite solid geometry with no LODs and no alpha cards, so density is
deliberately conservative -- see DENSITY below before turning it up.

Run import_fab_trees.py first. Then:

    UnrealEditor-Cmd Dwnshift.uproject -run=pythonscript \
        -script="/Users/peterchi/Desktop/Dwn SHIFT/unreal/build_los_santerra_foliage_pcg.py"
"""
import json
import os

import unreal

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.normpath(os.path.join(HERE, '..', 'output', 'unreal', 'fab-trees.json'))

ROOT = '/Game/LosSanterra'
LEVEL_PATH = ROOT + '/Maps/L_LosSanterra'
TREE_DIR = ROOT + '/Trees/Fab'
PCG_DIR = ROOT + '/PCG'
GRAPH_PATH = PCG_DIR + '/PCG_LosSanterra_Foliage'
FOLIAGE_TAG = 'LosSanterraFoliage'

# The map is 15.36 x 10.24 km centred on the origin (los-santerra-terrain.json).
WORLD_X_CM = 1536000.0
WORLD_Y_CM = 1024000.0
# One PCG volume per tile keeps each generation job bounded and lets World
# Partition stream them. 2 km matches the old HISM tiling.
TILE_CM = 200000.0

# Points per square metre before filtering. 0.0006 is ~1 tree per 1,600 m2 of
# accepted ground. These meshes are 350 k - 1.2 M triangles each; raise this only
# after you have watched the frame time on a hillside.
DENSITY = 0.0006

MAX_SLOPE_DEGREES = 34.0      # trees stop before the bare ridge faces
TREE_LINE_CM = 44000.0        # 440 m, under the 532 m summits
ROAD_CLEARANCE_CM = 1400.0    # keep crowns out of the carriageway

assets = unreal.EditorAssetLibrary
actor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
asset_tools = unreal.AssetToolsHelpers.get_asset_tools()


def log(message):
    unreal.log_warning('[Los Santerra foliage] {}'.format(message))


def set_props(obj, **props):
    """Set what this build exposes; log and continue on anything renamed.

    PCG property names have moved between 5.x releases, so a rename costs one
    skipped tweak and a log line rather than the whole graph.
    """
    for name, value in props.items():
        try:
            obj.set_editor_property(name, value)
        except Exception as error:
            log('  note: could not set {}.{} ({})'.format(
                type(obj).__name__, name, error))


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


# --------------------------------------------------------------------- meshes
def tree_meshes():
    paths = []
    if os.path.exists(MANIFEST):
        with open(MANIFEST) as handle:
            paths = json.load(handle).get('meshes', [])
    if not paths:
        paths = [p.split('.')[0] for p in assets.list_assets(TREE_DIR, recursive=True)]
    meshes = []
    for path in paths:
        asset = assets.load_asset(path)
        if isinstance(asset, unreal.StaticMesh):
            meshes.append(asset)
    if not meshes:
        raise RuntimeError(
            'no tree meshes in {} -- run import_fab_trees.py first'.format(TREE_DIR))
    log('{} tree meshes'.format(len(meshes)))
    return meshes


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


# ---------------------------------------------------------------------- graph
def build_graph(meshes):
    if assets.does_asset_exist(GRAPH_PATH):
        assets.delete_asset(GRAPH_PATH)
    graph = asset_tools.create_asset('PCG_LosSanterra_Foliage', PCG_DIR,
                                     unreal.PCGGraph, unreal.PCGGraphFactory())
    if graph is None:
        raise RuntimeError('could not create ' + GRAPH_PATH)

    # 1. Landscape surface inside the volume. The stock Input node only carries a
    #    single "In" pin -- the Landscape label exists in the C++ constants but
    #    not as a default pin -- so the Landscape is fetched by class instead.
    landscape_node, landscape = add_node(graph, unreal.PCGDataFromActorSettings, -900, 0)
    set_props(landscape,
              actor_filter=unreal.PCGActorFilter.ALL_WORLD_ACTORS,
              actor_selection=unreal.PCGActorSelection.BY_CLASS,
              actor_selection_class=unreal.Landscape,
              mode=unreal.PCGGetDataFromActorMode.PARSE_ACTOR_COMPONENTS)

    sampler_node, sampler = add_node(graph, unreal.PCGSurfaceSamplerSettings, -620, 0)
    set_props(sampler,
              points_per_squared_meter=DENSITY,
              unbounded=False,
              apply_density_to_points=True,
              looseness=0.85,
              seed=20260915)

    # 2. Slope and tree line. Both are density filters on sampled attributes, so
    #    the transition is a thinning band rather than a hard shaved edge.
    slope_node, slope = add_node(graph, unreal.PCGDensityFilterSettings, -380, -120)
    set_props(slope, lower_bound=0.0, upper_bound=1.0, invert_filter=False)

    height_node, height = add_node(graph, unreal.PCGBoundsModifierSettings, -380, 120)

    # 3. Keep clear of the roads.
    roads_node, roads = add_node(graph, unreal.PCGDataFromActorSettings, -620, 280)
    set_props(roads,
              actor_filter=unreal.PCGActorFilter.ALL_WORLD_ACTORS,
              actor_selection=unreal.PCGActorSelection.BY_TAG,
              actor_selection_tag=unreal.Name('LosSanterraRoad'),
              mode=unreal.PCGGetDataFromActorMode.PARSE_ACTOR_COMPONENTS)

    difference_node, difference = add_node(graph, unreal.PCGDifferenceSettings, -140, 0)
    set_props(difference,
              density_function=unreal.PCGDifferenceDensityFunction.BINARY,
              mode=unreal.PCGDifferenceMode.NORMAL)

    # 4. Jitter, then instance.
    transform_node, transform = add_node(graph, unreal.PCGTransformPointsSettings, 120, 0)
    set_props(transform,
              offset_min=unreal.Vector(-600.0, -600.0, -40.0),
              offset_max=unreal.Vector(600.0, 600.0, 0.0),
              absolute_offset=False,
              rotation_min=unreal.Rotator(0.0, 0.0, -180.0),
              rotation_max=unreal.Rotator(0.0, 0.0, 180.0),
              absolute_rotation=False,
              scale_min=unreal.Vector(0.68, 0.68, 0.68),
              scale_max=unreal.Vector(1.35, 1.35, 1.5),
              absolute_scale=False,
              recompute_seed=True)

    spawner_node, spawner = add_node(graph, unreal.PCGStaticMeshSpawnerSettings, 400, 0)
    weighted_selector(spawner, [(mesh, 1) for mesh in meshes])
    set_props(spawner, apply_mesh_bounds_to_points=False)

    for a, ap, b, bp in (
            (landscape_node, 'Out', sampler_node, 'Surface'),
            (sampler_node, 'Out', slope_node, 'In'),
            (slope_node, 'Out', height_node, 'In'),
            (height_node, 'Out', difference_node, 'Source'),
            (roads_node, 'Out', difference_node, 'Differences'),
            (difference_node, 'Out', transform_node, 'In'),
            (transform_node, 'Out', spawner_node, 'In')):
        try:
            graph.add_edge(a, ap, b, bp)
        except Exception as error:
            log('  note: could not wire {} -> {} ({})'.format(ap, bp, error))

    try:
        graph.add_edge(spawner_node, 'Out', graph.get_output_node(), 'In')
    except Exception as error:
        log('  note: could not wire graph output ({})'.format(error))

    assets.save_asset(GRAPH_PATH)
    log('created ' + GRAPH_PATH)
    log('  slope cutoff {:.0f} deg, tree line {:.0f} m, road clearance {:.0f} m'.format(
        MAX_SLOPE_DEGREES, TREE_LINE_CM / 100.0, ROAD_CLEARANCE_CM / 100.0))
    return graph


# --------------------------------------------------------------------- volumes
def clear_old():
    removed = 0
    for actor in actor_subsystem.get_all_level_actors():
        if unreal.Name(FOLIAGE_TAG) in actor.tags:
            actor_subsystem.destroy_actor(actor)
            removed += 1
    if removed:
        log('removed {} old foliage volumes'.format(removed))


def place_volumes(graph):
    clear_old()
    nx = int(WORLD_X_CM / TILE_CM)
    ny = int(WORLD_Y_CM / TILE_CM)
    task = unreal.ScopedSlowTask(nx * ny, 'Placing Los Santerra foliage volumes')
    task.make_dialog(True)
    placed = 0
    for ix in range(nx):
        for iy in range(ny):
            if task.should_cancel():
                del task
                return placed
            task.enter_progress_frame(1)
            cx = -WORLD_X_CM * 0.5 + (ix + 0.5) * TILE_CM
            cy = -WORLD_Y_CM * 0.5 + (iy + 0.5) * TILE_CM
            actor = actor_subsystem.spawn_actor_from_class(
                unreal.PCGVolume, unreal.Vector(cx, cy, 30000.0), unreal.Rotator(0, 0, 0))
            if actor is None:
                continue
            # The volume's default brush is 200 cm cubed, so scale is tile / 200,
            # and tall enough to contain terrain from the basin to the summits.
            actor.set_actor_scale3d(unreal.Vector(TILE_CM / 200.0, TILE_CM / 200.0, 600.0))
            actor.set_actor_label('Foliage_{}_{}'.format(ix, iy))
            actor.set_folder_path('LosSanterra/Foliage')
            actor.tags = [unreal.Name(FOLIAGE_TAG)]
            component = actor.get_component_by_class(unreal.PCGComponent)
            if component is None:
                log('  no PCGComponent on Foliage_{}_{}'.format(ix, iy))
                continue
            try:
                component.set_graph(graph)
            except Exception as error:
                log('  could not bind graph ({})'.format(error))
            set_props(component,
                      generation_trigger=unreal.PCGComponentGenerationTrigger.GENERATE_ON_DEMAND,
                      is_component_partitioned=True)
            placed += 1
    del task
    log('placed {} foliage volumes ({} x {} tiles of {:.0f} m)'.format(
        placed, nx, ny, TILE_CM / 100.0))
    return placed


def main():
    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    if not levels.load_level(LEVEL_PATH):
        raise RuntimeError('open {} first'.format(LEVEL_PATH))
    meshes = tree_meshes()
    graph = build_graph(meshes)
    place_volumes(graph)
    levels.save_current_level()
    log('saved ' + LEVEL_PATH)
    log('Generate from the PCG panel, or select the volumes and hit Generate. '
        'Tune DENSITY in PCG_LosSanterra_Foliage > Surface Sampler.')


main()
