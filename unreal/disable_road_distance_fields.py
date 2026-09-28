"""Turn off mesh distance fields on the Los Santerra road meshes.

Why this exists: the project runs Lumen (r.DynamicGlobalIlluminationMethod=1),
so r.GenerateMeshDistanceFields=True, and /Game/LosSanterra/Roads holds ~6,700
individual road meshes. Each one costs 1.4 - 13 s to build a 126^3 distance
field, which is 8+ hours of compiling the editor re-enters every time the level
loads -- and enough parallel volumes in flight to get the process killed.

Roads are flat slabs lying on the Landscape. The Landscape's own distance field
already covers the ground for Lumen, so the roads contribute nothing a driver
would ever see. Dropping their distance fields removes the stall outright.

This only clears a build flag. It touches no geometry, no transforms and no
materials, so it cannot move a road or change how one seats on the terrain.

Note on the API: the single switch is StaticMesh.generate_mesh_distance_field.
The per-LOD FMeshBuildSettings route needs StaticMeshEditorSubsystem, which is
None under -run=pythonscript (editor subsystems are not started), so do not
reach for it here -- it is also not needed, the mesh-level flag governs.

Run headless with the editor CLOSED:

    ./unreal/run.sh nodf

Re-running is harmless: meshes already set are counted and skipped.
"""
import unreal

ROAD_DIR = '/Game/LosSanterra/Roads'

assets = unreal.EditorAssetLibrary


def log(message):
    unreal.log_warning('[Los Santerra] {}'.format(message))


def main():
    if not assets.does_directory_exist(ROAD_DIR):
        log('no road directory at {} -- nothing to do'.format(ROAD_DIR))
        return

    paths = assets.list_assets(ROAD_DIR, recursive=True, include_folder=False)
    log('scanning {} assets under {}'.format(len(paths), ROAD_DIR))

    changed = skipped = failed = 0

    for path in paths:
        mesh = assets.load_asset(path)
        if not isinstance(mesh, unreal.StaticMesh):
            continue
        try:
            if not mesh.get_editor_property('generate_mesh_distance_field'):
                skipped += 1
                continue
            mesh.set_editor_property('generate_mesh_distance_field', False)
            assets.save_loaded_asset(mesh, only_if_is_dirty=False)
            changed += 1
            if changed % 500 == 0:
                log('  ...{} meshes updated'.format(changed))
        except Exception as error:
            failed += 1
            if failed <= 10:
                log('  could not update {}: {}'.format(path, error))

    log('distance fields disabled on {} road meshes'.format(changed))
    log('already clear: {}   failed: {}'.format(skipped, failed))
    log('open the editor next -- the compile stall should be gone')


main()
