"""Import the Fab tree FBX and register the meshes for the foliage pipeline.

Source:  ~/Downloads/trees-house-in-the-woods-project/source/trees four hous uplode.fbx
         9 tree meshes, 2.65 M verts total (350 k - 1.2 M triangles each).

Those counts are the whole story for how this imports. The trees are solid
geometry -- every leaf is modelled, there are no alpha cards and no LODs -- so at
Los Santerra's scale they are only viable as Nanite. Nanite is therefore forced on
here rather than left to the importer, and the crowns get no collision so a car
never snags a branch.

After this, run build_los_santerra_foliage_pcg.py to scatter them.

Run from the editor (Tools > Execute Python Script) or headless:

    UnrealEditor-Cmd Dwnshift.uproject -run=pythonscript \
        -script="/Users/peterchi/Desktop/Dwn SHIFT/unreal/import_fab_trees.py"

Re-running re-imports in place.
"""
import json
import os

import unreal

FBX = os.path.expanduser(
    '~/Downloads/trees-house-in-the-woods-project/source/trees four hous uplode.fbx')
TEXTURE_DIR = os.path.expanduser(
    '~/Downloads/trees-house-in-the-woods-project/textures')

DEST = '/Game/LosSanterra/Trees/Fab'
MANIFEST = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..',
                        'output', 'unreal', 'fab-trees.json')

# The FBX is authored in metres; Unreal wants centimetres. The importer's
# uniform scale is the least destructive place to fix that.
IMPORT_UNIFORM_SCALE = 100.0

assets = unreal.EditorAssetLibrary


def log(message):
    unreal.log_warning('[Fab trees] {}'.format(message))


def build_task():
    options = unreal.FbxImportUI()
    options.set_editor_property('import_mesh', True)
    options.set_editor_property('import_textures', True)
    options.set_editor_property('import_materials', True)
    options.set_editor_property('import_as_skeletal', False)
    options.set_editor_property('mesh_type_to_import',
                                unreal.FBXImportType.FBXIT_STATIC_MESH)

    static = options.static_mesh_import_data
    static.set_editor_property('import_uniform_scale', IMPORT_UNIFORM_SCALE)
    static.set_editor_property('combine_meshes', False)   # keep 9 separate trees
    static.set_editor_property('generate_lightmap_u_vs', False)  # Nanite/Lumen
    static.set_editor_property('auto_generate_collision', False)
    static.set_editor_property('remove_degenerates', True)
    static.set_editor_property('build_nanite', True)

    task = unreal.AssetImportTask()
    task.set_editor_property('filename', FBX)
    task.set_editor_property('destination_path', DEST)
    task.set_editor_property('options', options)
    task.set_editor_property('automated', True)
    task.set_editor_property('replace_existing', True)
    task.set_editor_property('save', True)
    return task


def force_nanite(mesh):
    """Nanite on, collision off. The importer does not always honour build_nanite."""
    try:
        settings = mesh.get_editor_property('nanite_settings')
        settings.set_editor_property('enabled', True)
        mesh.set_editor_property('nanite_settings', settings)
    except Exception as error:
        log('  could not set Nanite on {}: {}'.format(mesh.get_name(), error))
    try:
        body = mesh.get_editor_property('body_setup')
        if body is not None:
            body.set_editor_property('collision_trace_flag',
                                     unreal.CollisionTraceFlag.CTF_USE_SIMPLE_AS_COMPLEX)
    except Exception:
        pass


def main():
    if not os.path.exists(FBX):
        raise RuntimeError('FBX not found: {}'.format(FBX))
    log('importing {:.0f} MB from {}'.format(
        os.path.getsize(FBX) / 1e6, os.path.basename(FBX)))

    tools = unreal.AssetToolsHelpers.get_asset_tools()
    task = build_task()
    tools.import_asset_tasks([task])

    imported = list(task.get_editor_property('imported_object_paths') or [])
    meshes = []
    for path in imported:
        asset = assets.load_asset(path.split('.')[0])
        if isinstance(asset, unreal.StaticMesh):
            meshes.append(asset)
    if not meshes:
        # Fall back to whatever landed in the destination folder.
        for path in assets.list_assets(DEST, recursive=True):
            asset = assets.load_asset(path.split('.')[0])
            if isinstance(asset, unreal.StaticMesh):
                meshes.append(asset)
    if not meshes:
        raise RuntimeError('no static meshes imported into ' + DEST)

    records = []
    for mesh in meshes:
        force_nanite(mesh)
        path = mesh.get_path_name().split('.')[0]
        assets.save_asset(path)
        records.append(path)
        log('  {}'.format(path))

    assets.save_directory(DEST, only_if_is_dirty=True, recursive=True)

    out = os.path.normpath(MANIFEST)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w') as handle:
        json.dump({'meshes': sorted(records)}, handle, indent=2)
    log('imported {} tree meshes -> {}'.format(len(records), DEST))
    log('manifest: {}'.format(out))
    log('next: build_los_santerra_foliage_pcg.py')


main()
