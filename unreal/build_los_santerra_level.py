"""Build the Los Santerra level in Unreal from output/unreal/.

Run from the editor (Tools > Execute Python Script) or headless:

    UnrealEditor-Cmd Dwnshift.uproject -run=pythonscript \
        -script="/Users/peterchi/Desktop/Dwn SHIFT/unreal/build_los_santerra_level.py"

What it does
------------
1. Creates (or opens) /Game/LosSanterra/Maps/L_LosSanterra.
2. Sky: SkyAtmosphere, sun (DirectionalLight), real-time SkyLight, height fog
   and volumetric clouds, so the level reads as outdoors before any art exists.
3. Road surfaces: a mitred, skirted ribbon at the road's width draped on its
   centreline, with complex-as-simple collision so the Chaos car can drive on it,
   cut into CHUNK_LENGTH_CM pieces. Meshes live in /Game/LosSanterra/Roads,
   actors in the LosSanterra/Roads/<kind> folder.

   Chunked, because one mesh per road is what made roads vanish while driving.
   175 of the 760 roads span more than 2 km and the Santa Monica Freeway spans
   14.7 km, so each was a single StaticMeshActor with kilometre-wide bounds:
   World Partition assigns an actor to one cell by its origin, so the whole road
   streamed in and out as a unit, and its HLOD stood in for asphalt the player was
   driving on. Chunks put each piece in the cell it actually occupies. They share
   their boundary vertex with the next chunk, so the surface stays continuous.
4. Road materials (asphalt / concrete / dirt) and a PlayerStart on a Downtown road,
   and sets the level's GameMode to the Vehicle template's.

The Landscape is NOT created here: Unreal has no Python API that builds one from a
heightmap. Import it once in Landscape mode with the numbers in
output/unreal/los-santerra-terrain.json (printed at the end of this script).
Road Z values are already draped on that same terrain, so they line up.

Re-running is safe: road meshes and actors are rebuilt, not duplicated.
"""
import json
import math
import os

import unreal

PROJECT = r'/Users/peterchi/Desktop/Dwn SHIFT'
DATA_DIR = os.path.join(PROJECT, 'output', 'unreal')
# Prefer the thinned hero network (tools/thin_network.py). The full export is
# 1,274 km of centreline, most of it residential filler; the thinned one keeps the
# same 15.4 x 10.2 km footprint and terrain at ~168 km of road you would actually
# drive. Delete the thin file to fall back to the full network.
ROADS_THIN = os.path.join(DATA_DIR, 'los-santerra-roads-thin.json')
ROADS_FULL = os.path.join(DATA_DIR, 'los-santerra-roads.json')
# The full export is what ships. Thinning used to be how the level was kept to a
# drivable size, but once leaf pruning removed the dead-end stubs at the source,
# the thinner's own minimum-length filters became the main producer of loose
# ends -- it saved 22% of the mileage and added 27 more fragments. Set
# LOS_SANTERRA_THIN=1 to go back to the thinned export.
ROADS = ROADS_THIN if os.environ.get('LOS_SANTERRA_THIN') and os.path.exists(ROADS_THIN) else ROADS_FULL
TERRAIN = os.path.join(DATA_DIR, 'los-santerra-terrain.json')

ROOT = '/Game/LosSanterra'
LEVEL_PATH = ROOT + '/Maps/L_LosSanterra'
MESH_DIR = ROOT + '/Roads'
MATERIAL_DIR = ROOT + '/Materials'
GAME_MODE = '/Game/VehicleTemplate/Blueprints/BP_VehicleAdvGameMode'
ROAD_TAG = 'LosSanterraRoad'

# Lift above the draped centreline so the ribbon does not z-fight the Landscape.
SURFACE_LIFT_CM = 12.0
# Longest piece of road in one mesh/actor, so World Partition can stream a road by
# the part of it you are near rather than all at once.
CHUNK_LENGTH_CM = 25000.0
# A vertical apron dropped from both kerbs. The carve seats the landscape under the
# asphalt to within 0.7 m at p99, but "within 0.7 m" on the high side is a slot of
# daylight under the kerb with the hillside visible through it. The skirt buries
# the edge instead of trusting the terrain to meet it exactly.
SKIRT_CM = 90.0
# Cap on how far a mitre may stretch at a corner. Without it a sharp vertex pushes
# its offset vertex out toward infinity as the turn approaches 180 degrees, and the
# quad folds back through itself -- a road that disappears for a few metres.
MITRE_LIMIT = 2.5
# Kinds whose surface sits below grade; still built, but tagged for later work.
SKIP_KINDS = set()

MATERIAL_FOR_KIND = {
    'freeway': 'concrete', 'ramp': 'concrete', 'underpass': 'concrete',
    'tunnel': 'concrete', 'dirt': 'dirt',
}
MATERIAL_COLOURS = {  # linear base colour, roughness
    'asphalt': ((0.035, 0.035, 0.038), 0.85),
    'concrete': ((0.22, 0.21, 0.19), 0.8),
    'dirt': ((0.26, 0.17, 0.10), 0.95),
}

assets = unreal.EditorAssetLibrary
actor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)


def log(message):
    unreal.log_warning('[Los Santerra] {}'.format(message))


# ---------------------------------------------------------------------- level
def open_level():
    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    if assets.does_asset_exist(LEVEL_PATH):
        levels.load_level(LEVEL_PATH)
        log('opened ' + LEVEL_PATH)
    else:
        if not levels.new_level(LEVEL_PATH):
            raise RuntimeError('could not create ' + LEVEL_PATH)
        log('created ' + LEVEL_PATH)
    return unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()


def find_or_spawn(cls, label, location=(0, 0, 0), rotation=(0, 0, 0)):
    for actor in actor_subsystem.get_all_level_actors():
        if actor.get_actor_label() == label:
            return actor
    actor = actor_subsystem.spawn_actor_from_class(
        cls, unreal.Vector(*location), unreal.Rotator(*rotation))
    actor.set_actor_label(label)
    actor.set_folder_path('LosSanterra/Environment')
    return actor


def build_sky():
    # Rotator is (roll, pitch, yaw): a late-afternoon LA sun from the south-west.
    sun = find_or_spawn(unreal.DirectionalLight, 'Sun', (0, 0, 50000), (0, -32, 125))
    light = sun.get_component_by_class(unreal.DirectionalLightComponent)
    light.set_editor_property('atmosphere_sun_light', True)
    light.set_editor_property('intensity', 9.0)
    light.set_editor_property('mobility', unreal.ComponentMobility.MOVABLE)

    find_or_spawn(unreal.SkyAtmosphere, 'SkyAtmosphere')

    sky = find_or_spawn(unreal.SkyLight, 'SkyLight', (0, 0, 60000))
    sky_component = sky.get_component_by_class(unreal.SkyLightComponent)
    sky_component.set_editor_property('mobility', unreal.ComponentMobility.MOVABLE)
    sky_component.set_editor_property('real_time_capture', True)

    fog = find_or_spawn(unreal.ExponentialHeightFog, 'HeightFog')
    fog_component = fog.get_component_by_class(unreal.ExponentialHeightFogComponent)
    fog_component.set_editor_property('fog_density', 0.004)
    fog_component.set_editor_property('fog_height_falloff', 0.05)

    find_or_spawn(unreal.VolumetricCloud, 'Clouds')
    log('sky and lighting ready')


# ------------------------------------------------------------------ materials
def build_material(name, colour, roughness):
    path = '{}/M_Road_{}'.format(MATERIAL_DIR, name.capitalize())
    if assets.does_asset_exist(path):
        return assets.load_asset(path)
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    material = tools.create_asset(path.rsplit('/', 1)[1], MATERIAL_DIR,
                                  unreal.Material, unreal.MaterialFactoryNew())
    lib = unreal.MaterialEditingLibrary
    base = lib.create_material_expression(material, unreal.MaterialExpressionConstant3Vector, -300, 0)
    base.set_editor_property('constant', unreal.LinearColor(colour[0], colour[1], colour[2], 1.0))
    lib.connect_material_property(base, '', unreal.MaterialProperty.MP_BASE_COLOR)
    rough = lib.create_material_expression(material, unreal.MaterialExpressionConstant, -300, 200)
    rough.set_editor_property('r', roughness)
    lib.connect_material_property(rough, '', unreal.MaterialProperty.MP_ROUGHNESS)
    material.set_editor_property('two_sided', True)
    lib.recompile_material(material)
    assets.save_asset(path)
    log('created ' + path)
    return material


def build_materials():
    return {name: build_material(name, colour, rough)
            for name, (colour, rough) in MATERIAL_COLOURS.items()}


# ---------------------------------------------------------------------- roads
def chunked(points, max_cm):
    """Split a centreline into runs no longer than max_cm.

    Consecutive runs repeat the vertex they meet at, so the two meshes share an
    edge exactly and no seam opens between them.
    """
    runs, run, used = [], [points[0]], 0.0
    for i in range(1, len(points)):
        a, b = points[i - 1], points[i]
        used += math.hypot(b[0] - a[0], b[1] - a[1])
        run.append(b)
        if used >= max_cm and i < len(points) - 1:
            runs.append(run)
            run, used = [b], 0.0
    if len(run) >= 2:
        runs.append(run)
    return runs


def _offsets(points):
    """Mitred half-width directions, one per vertex, clamped to MITRE_LIMIT."""
    count = len(points)
    out = []
    for i in range(count):
        ax, ay, _ = points[max(i - 1, 0)]
        bx, by, _ = points[i]
        cx, cy, _ = points[min(i + 1, count - 1)]
        d1x, d1y = bx - ax, by - ay
        d2x, d2y = cx - bx, cy - by
        l1 = math.hypot(d1x, d1y)
        l2 = math.hypot(d2x, d2y)
        if l1 < 1e-6:
            d1x, d1y, l1 = d2x, d2y, l2
        if l2 < 1e-6:
            d2x, d2y, l2 = d1x, d1y, l1
        if l1 < 1e-6 or l2 < 1e-6:
            out.append((0.0, 0.0))
            continue
        # Left normal of each leg, then the bisector between them.
        n1x, n1y = -d1y / l1, d1x / l1
        n2x, n2y = -d2y / l2, d2x / l2
        mx, my = n1x + n2x, n1y + n2y
        m = math.hypot(mx, my)
        if m < 1e-6:                      # a true reversal; fall back to one leg
            out.append((n1x, n1y))
            continue
        mx, my = mx / m, my / m
        # 1/cos(half-angle) keeps the kerb width constant through a bend instead of
        # pinching it; the clamp stops that blowing up at a hairpin.
        scale = min(1.0 / max(mx * n1x + my * n1y, 1e-3), MITRE_LIMIT)
        out.append((mx * scale, my * scale))
    return out


def ribbon(points, width_cm):
    """Vertices/triangles for the road surface plus its skirt, relative to points[0].

    Four vertices per station: the two kerbs, and two more directly below them at
    the foot of the skirt.
    """
    ox, oy, oz = points[0]
    half = width_cm * 0.5
    count = len(points)
    normals_at = _offsets(points)
    vertices, normals, uvs, triangles = [], [], [], []
    distance = 0.0
    for i, (x, y, z) in enumerate(points):
        nx, ny = normals_at[i]
        if i > 0:
            px, py, _ = points[i - 1]
            distance += math.hypot(x - px, y - py)
        z = z - oz + SURFACE_LIFT_CM
        lx, ly = x - ox + nx * half, y - oy + ny * half
        rx, ry = x - ox - nx * half, y - oy - ny * half
        vertices.extend([unreal.Vector(lx, ly, z), unreal.Vector(rx, ry, z),
                         unreal.Vector(lx, ly, z - SKIRT_CM),
                         unreal.Vector(rx, ry, z - SKIRT_CM)])
        side = math.hypot(nx, ny) or 1.0
        normals.extend([unreal.Vector(0, 0, 1), unreal.Vector(0, 0, 1),
                        unreal.Vector(nx / side, ny / side, 0),
                        unreal.Vector(-nx / side, -ny / side, 0)])
        v = distance / width_cm
        uvs.extend([unreal.Vector2D(0.0, v), unreal.Vector2D(1.0, v),
                    unreal.Vector2D(0.0, v), unreal.Vector2D(1.0, v)])
    for i in range(count - 1):
        a = 4 * i
        b = 4 * (i + 1)
        # Carriageway. Winding chosen so +Z faces up in Unreal's left-handed frame.
        triangles.append(unreal.IntVector(a + 0, b + 0, a + 1))
        triangles.append(unreal.IntVector(a + 1, b + 0, b + 1))
        # Left skirt, outward-facing.
        triangles.append(unreal.IntVector(a + 2, b + 2, a + 0))
        triangles.append(unreal.IntVector(a + 0, b + 2, b + 0))
        # Right skirt, outward-facing the other way.
        triangles.append(unreal.IntVector(a + 1, b + 1, a + 3))
        triangles.append(unreal.IntVector(a + 3, b + 1, b + 3))
    return vertices, normals, uvs, triangles


def clear_old_roads():
    removed = 0
    for actor in actor_subsystem.get_all_level_actors():
        if unreal.Name(ROAD_TAG) in actor.tags:
            actor_subsystem.destroy_actor(actor)
            removed += 1
    if removed:
        log('removed {} old road actors'.format(removed))


def safe_name(road, index, part):
    keep = ''.join(ch if ch.isalnum() else '_' for ch in road['name'])
    return 'SM_Road_{:04d}_{:03d}_{}'.format(index, part, keep)[:60]


def build_roads(materials):
    with open(ROADS) as handle:
        roads = [r for r in json.load(handle)['roads'] if r['kind'] not in SKIP_KINDS]
    log('{} roads to build from {}'.format(len(roads), os.path.basename(ROADS)))
    clear_old_roads()

    geometry = unreal.GeometryScript_MeshEdits
    create = unreal.GeometryScript_NewAssetUtils
    options = unreal.GeometryScriptCreateNewStaticMeshAssetOptions()
    options.set_editor_property('enable_collision', True)
    options.set_editor_property('collision_mode', unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
    options.set_editor_property('enable_recompute_tangents', True)

    task = unreal.ScopedSlowTask(len(roads), 'Building Los Santerra roads')
    task.make_dialog(True)
    built, failed, km = 0, 0, 0.0
    for index, road in enumerate(roads):
        if task.should_cancel():
            break
        task.enter_progress_frame(1, road['name'])
        points = road['points']
        if len(points) < 2:
            continue
        material = materials[MATERIAL_FOR_KIND.get(road['kind'], 'asphalt')]

        for part, piece in enumerate(chunked(points, CHUNK_LENGTH_CM)):
            vertices, normals, uvs, triangles = ribbon(piece, road['widthCm'])
            mesh = unreal.DynamicMesh()
            buffers = unreal.GeometryScriptSimpleMeshBuffers()
            buffers.set_editor_property('vertices', vertices)
            buffers.set_editor_property('normals', normals)
            buffers.set_editor_property('uv0', uvs)
            buffers.set_editor_property('triangles', triangles)
            geometry.append_buffers_to_mesh(mesh, buffers, 0)

            path = '{}/{}/{}'.format(MESH_DIR, road['kind'],
                                     safe_name(road, index, part))
            if assets.does_asset_exist(path):
                assets.delete_asset(path)
            static_mesh, outcome = create.create_new_static_mesh_asset_from_mesh(
                mesh, path, options)
            if outcome != unreal.GeometryScriptOutcomePins.SUCCESS or static_mesh is None:
                unreal.log_warning('[Los Santerra] failed mesh for {} part {}'
                                   .format(road['name'], part))
                failed += 1
                continue
            static_mesh.set_material(0, material)

            ox, oy, oz = piece[0]
            actor = actor_subsystem.spawn_actor_from_class(
                unreal.StaticMeshActor, unreal.Vector(ox, oy, oz), unreal.Rotator(0, 0, 0))
            if actor is None:
                unreal.log_warning('[Los Santerra] failed actor for {} part {}'
                                   .format(road['name'], part))
                failed += 1
                continue
            actor.static_mesh_component.set_static_mesh(static_mesh)
            actor.set_actor_label('{} [{}] {:03d}'.format(road['name'], road['kind'], part))
            actor.set_folder_path('LosSanterra/Roads/{}'.format(road['kind']))
            actor.tags = [unreal.Name(ROAD_TAG), unreal.Name(road['kind']),
                          unreal.Name(road['district'])]
            built += 1
        km += road['lengthM'] / 1000.0
    del task
    if failed:
        unreal.log_warning('[Los Santerra] {} road chunks FAILED to build -- those '
                           'are gaps in the network, not cosmetic'.format(failed))
    assets.save_directory(MESH_DIR, only_if_is_dirty=True, recursive=True)
    log('built {} road chunks over {} roads, {:.0f} km'.format(built, len(roads), km))
    return roads


# ------------------------------------------------------------------- gameplay
def place_player_start(roads):
    """Spawn on the Downtown road point nearest the world origin."""
    best = None
    for road in roads:
        if road['kind'] in ('freeway', 'ramp', 'tunnel', 'underpass') or road['elevated']:
            continue
        if 'Downtown' not in road['district']:
            continue
        for i in range(len(road['points']) - 1):
            x, y, z = road['points'][i]
            score = x * x + y * y
            if best is None or score < best[0]:
                nx, ny, _ = road['points'][i + 1]
                best = (score, (x, y, z + 150.0), math.degrees(math.atan2(ny - y, nx - x)))
    if best is None:
        log('no Downtown road found for the PlayerStart')
        return
    _, location, yaw = best
    start = find_or_spawn(unreal.PlayerStart, 'PlayerStart_Downtown', location, (0, 0, yaw))
    start.set_actor_location(unreal.Vector(*location), False, False)
    start.set_actor_rotation(unreal.Rotator(0, 0, yaw), False)
    start.set_folder_path('LosSanterra/Gameplay')
    log('PlayerStart at {} yaw {:.0f}'.format(location, yaw))


def set_game_mode(world):
    if not assets.does_asset_exist(GAME_MODE):
        log('game mode not found: ' + GAME_MODE)
        return
    game_mode = assets.load_blueprint_class(GAME_MODE)
    world.get_world_settings().set_editor_property('default_game_mode', game_mode)
    log('GameMode override: ' + GAME_MODE)


def print_landscape_steps():
    with open(TERRAIN) as handle:
        terrain = json.load(handle)
    u = terrain['unreal']
    log('Landscape (one-time, Landscape mode > Manage > New > Import from File):')
    log('  heightmap    {}'.format(os.path.join(DATA_DIR, u['heightmapFile'])))
    log('  location     {}'.format(u['landscapeLocation']))
    log('  scale        X {} Y {} Z {}'.format(u['scaleX'], u['scaleY'], u['scaleZ']))
    log('  section size {}x{} quads, {} section/component, components {}'.format(
        u['sectionSize'], u['sectionSize'], u['sectionsPerComponent'], u['componentCount']))


def main():
    world = open_level()
    build_sky()
    materials = build_materials()
    roads = build_roads(materials)
    place_player_start(roads)
    set_game_mode(world)
    unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()
    log('saved ' + LEVEL_PATH)
    print_landscape_steps()


main()
