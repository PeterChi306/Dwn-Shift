"""SUPERSEDED by build_los_santerra_foliage_pcg.py -- kept as the fallback.

This plants the procedural cone-and-sphere stand-ins from a baked JSON of ~200 k
transforms. Now that real tree meshes are imported (import_fab_trees.py), the PCG
foliage graph scatters those instead and evaluates slope, tree line and road
clearance in the editor. Run one or the other, never both: they both plant trees
over the same ground and you would get two forests occupying the same space.

Use this one only if you need tree placement to exactly match the browser world,
or if the PCG graph is not behaving and you want something on the hills now.

Plant Los Santerra's trees in L_LosSanterra from output/unreal/los-santerra-trees.json.

Generate the placements first (density is read off the reference map):

    python3 tools/build_trees.py

then run this from the editor (Tools > Execute Python Script) or headless:

    UnrealEditor-Cmd Dwnshift.uproject -run=pythonscript \
        -script="/Users/peterchi/Desktop/Dwn SHIFT/unreal/build_los_santerra_trees.py"

What it does
------------
1. Builds stand-in tree meshes with Geometry Script, one pair per species
   (oak, palm, pine): a trunk with collision so the car hits it, and a crown
   with no collision. Both are Nanite so hundreds of thousands stay cheap.
   Swap these for real foliage assets later: only MESHES below needs to change.
2. Bark and leaf materials; the leaf material tints each instance differently
   (PerInstanceRandom) so a hillside does not read as one colour.
3. Splits the map into 2 km tiles and spawns one actor per tile holding
   Hierarchical Instanced Static Mesh components, filed under
   LosSanterra/Trees in the outliner.

Re-running replaces the previous trees.
"""
import json
import math
import os

import unreal

PROJECT = r'/Users/peterchi/Desktop/Dwn SHIFT'
TREES = os.path.join(PROJECT, 'output', 'unreal', 'los-santerra-trees.json')
LEVEL_PATH = '/Game/LosSanterra/Maps/L_LosSanterra'
MESH_DIR = '/Game/LosSanterra/Trees'
MATERIAL_DIR = '/Game/LosSanterra/Materials'
TREE_TAG = 'LosSanterraTrees'
TILE_CM = 200000.0

assets = unreal.EditorAssetLibrary
actor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
prims = unreal.GeometryScript_Primitives
new_assets = unreal.GeometryScript_NewAssetUtils


def log(message):
    unreal.log_warning('[Los Santerra] {}'.format(message))


def xform(x=0.0, y=0.0, z=0.0, sx=1.0, sy=1.0, sz=1.0):
    return unreal.Transform(unreal.Vector(x, y, z), unreal.Rotator(0, 0, 0),
                            unreal.Vector(sx, sy, sz))


# ------------------------------------------------------------------ materials
def material(name, build):
    path = '{}/{}'.format(MATERIAL_DIR, name)
    if assets.does_asset_exist(path):
        return assets.load_asset(path)
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    mat = tools.create_asset(name, MATERIAL_DIR, unreal.Material, unreal.MaterialFactoryNew())
    build(mat, unreal.MaterialEditingLibrary)
    mat.set_editor_property('used_with_instanced_static_meshes', True)
    mat.set_editor_property('used_with_nanite', True)
    unreal.MaterialEditingLibrary.recompile_material(mat)
    assets.save_asset(path)
    log('created ' + path)
    return mat


def build_bark(mat, lib):
    colour = lib.create_material_expression(mat, unreal.MaterialExpressionConstant3Vector, -300, 0)
    colour.set_editor_property('constant', unreal.LinearColor(0.09, 0.06, 0.04, 1))
    lib.connect_material_property(colour, '', unreal.MaterialProperty.MP_BASE_COLOR)
    rough = lib.create_material_expression(mat, unreal.MaterialExpressionConstant, -300, 200)
    rough.set_editor_property('r', 0.9)
    lib.connect_material_property(rough, '', unreal.MaterialProperty.MP_ROUGHNESS)


def build_leaf(mat, lib):
    # Olive/sage to deep green, matching the reference map's tree masses.
    dark = lib.create_material_expression(mat, unreal.MaterialExpressionConstant3Vector, -600, -100)
    dark.set_editor_property('constant', unreal.LinearColor(0.025, 0.05, 0.018, 1))
    light = lib.create_material_expression(mat, unreal.MaterialExpressionConstant3Vector, -600, 50)
    light.set_editor_property('constant', unreal.LinearColor(0.10, 0.13, 0.045, 1))
    random = lib.create_material_expression(mat, unreal.MaterialExpressionPerInstanceRandom, -600, 200)
    lerp = lib.create_material_expression(mat, unreal.MaterialExpressionLinearInterpolate, -300, 0)
    lib.connect_material_expressions(dark, '', lerp, 'A')
    lib.connect_material_expressions(light, '', lerp, 'B')
    lib.connect_material_expressions(random, '', lerp, 'Alpha')
    lib.connect_material_property(lerp, '', unreal.MaterialProperty.MP_BASE_COLOR)
    rough = lib.create_material_expression(mat, unreal.MaterialExpressionConstant, -300, 250)
    rough.set_editor_property('r', 0.8)
    lib.connect_material_property(rough, '', unreal.MaterialProperty.MP_ROUGHNESS)


# --------------------------------------------------------------------- meshes
def oak_trunk(m, o):
    prims.append_cylinder(m, o, xform(), 28.0, 420.0, 8, 0, True)


def oak_crown(m, o):
    for x, y, z, r in ((0, 0, 620, 330), (170, 60, 520, 240), (-150, -90, 540, 250),
                       (40, -170, 700, 210)):
        prims.append_sphere_lat_long(m, o, xform(x, y, z, 1, 1, 0.8), r, 7, 10)


def pine_trunk(m, o):
    prims.append_cylinder(m, o, xform(), 22.0, 350.0, 8, 0, True)


def pine_crown(m, o):
    for z, r, h in ((220, 280, 520), (480, 215, 460), (740, 140, 400)):
        prims.append_cone(m, o, xform(0, 0, z), r, 5.0, h, 10, 0, True)


def palm_trunk(m, o):
    prims.append_cone(m, o, xform(), 32.0, 18.0, 1150.0, 8, 4, True)


def palm_crown(m, o):
    prims.append_sphere_lat_long(m, o, xform(0, 0, 1180, 1, 1, 0.35), 290.0, 6, 12)
    prims.append_sphere_lat_long(m, o, xform(0, 0, 1130), 70.0, 5, 8)


MESHES = {  # species: (trunk builder, crown builder)
    'oak': (oak_trunk, oak_crown),
    'pine': (pine_trunk, pine_crown),
    'palm': (palm_trunk, palm_crown),
}


def build_mesh(path, builder, mat, collision):
    if assets.does_asset_exist(path):
        assets.delete_asset(path)
    mesh = unreal.DynamicMesh()
    builder(mesh, unreal.GeometryScriptPrimitiveOptions())
    options = unreal.GeometryScriptCreateNewStaticMeshAssetOptions()
    # Trunks are plain cylinders, so their own triangles are a cheap, exact
    # collision shape; crowns get none so branches never snag the car.
    options.set_editor_property('enable_collision', collision)
    if collision:
        options.set_editor_property('collision_mode', unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
    options.set_editor_property('enable_recompute_normals', True)
    options.set_editor_property('enable_nanite', True)
    static_mesh, outcome = new_assets.create_new_static_mesh_asset_from_mesh(mesh, path, options)
    if outcome != unreal.GeometryScriptOutcomePins.SUCCESS or static_mesh is None:
        raise RuntimeError('could not build ' + path)
    static_mesh.set_material(0, mat)
    assets.save_asset(path)
    return static_mesh


def build_meshes():
    bark = material('M_Tree_Bark', build_bark)
    leaf = material('M_Tree_Leaf', build_leaf)
    meshes = {}
    for kind, (trunk, crown) in MESHES.items():
        meshes[kind] = (
            build_mesh('{}/SM_Tree_{}_Trunk'.format(MESH_DIR, kind.capitalize()), trunk, bark, True),
            build_mesh('{}/SM_Tree_{}_Crown'.format(MESH_DIR, kind.capitalize()), crown, leaf, False),
        )
    log('tree meshes ready')
    return meshes


# ---------------------------------------------------------------------- plant
def clear_old_trees():
    for actor in actor_subsystem.get_all_level_actors():
        if unreal.Name(TREE_TAG) in actor.tags:
            actor_subsystem.destroy_actor(actor)


def add_hism(actor, name, mesh, collision):
    subsystem = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
    handles = subsystem.k2_gather_subobject_data_for_instance(actor)
    params = unreal.AddNewSubobjectParams(
        parent_handle=handles[0],
        new_class=unreal.HierarchicalInstancedStaticMeshComponent,
        blueprint_context=None)
    handle, failure = subsystem.add_new_subobject(params)
    if not failure.is_empty():
        raise RuntimeError('adding HISM: {}'.format(failure))
    subsystem.rename_subobject(handle, unreal.Text(name))
    data = unreal.SubobjectDataBlueprintFunctionLibrary.get_data(handle)
    component = unreal.SubobjectDataBlueprintFunctionLibrary.get_object(data)
    component.set_static_mesh(mesh)
    component.set_mobility(unreal.ComponentMobility.STATIC)
    if collision:
        component.set_collision_profile_name('BlockAll')
    else:
        component.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
        component.set_editor_property('cast_shadow', True)
    return component


def plant(meshes):
    with open(TREES) as handle:
        species = json.load(handle)['species']
    clear_old_trees()

    tiles = {}
    for kind, items in species.items():
        for x, y, z, yaw, scale in items:
            key = (int(math.floor(x / TILE_CM)), int(math.floor(y / TILE_CM)))
            tiles.setdefault(key, {}).setdefault(kind, []).append((x, y, z, yaw, scale))

    task = unreal.ScopedSlowTask(len(tiles), 'Planting Los Santerra trees')
    task.make_dialog(True)
    total = 0
    for (tx, ty), kinds in sorted(tiles.items()):
        task.enter_progress_frame(1)
        centre = unreal.Vector((tx + 0.5) * TILE_CM, (ty + 0.5) * TILE_CM, 0.0)
        actor = actor_subsystem.spawn_actor_from_class(unreal.Actor, centre, unreal.Rotator(0, 0, 0))
        actor.set_actor_label('Trees_{}_{}'.format(tx, ty))
        actor.set_folder_path('LosSanterra/Trees')
        actor.tags = [unreal.Name(TREE_TAG)]
        for kind, items in kinds.items():
            transforms = [unreal.Transform(unreal.Vector(x, y, z), unreal.Rotator(0, 0, yaw),
                                           unreal.Vector(s, s, s * (0.9 + (yaw % 7) * 0.04)))
                          for x, y, z, yaw, s in items]
            trunk, crown = meshes[kind]
            for part, mesh, collision in (('Trunk', trunk, True), ('Crown', crown, False)):
                component = add_hism(actor, '{}_{}'.format(kind, part), mesh, collision)
                component.add_instances(transforms, False, True)
            total += len(items)
    del task
    log('planted {} trees in {} tiles'.format(total, len(tiles)))


def main():
    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    if not levels.load_level(LEVEL_PATH):
        raise RuntimeError('open ' + LEVEL_PATH + ' first (run build_los_santerra_level.py)')
    meshes = build_meshes()
    plant(meshes)
    levels.save_current_level()
    log('saved ' + LEVEL_PATH)


main()
