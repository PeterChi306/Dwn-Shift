"""Import Los Santerra's road network into the open Unreal level.

Run from the Unreal editor:  Window > Developer Tools > Output Log, switch the
command dropdown from Cmd to Python, then:

    exec(open(r'<path to>/unreal/import_los_santerra.py').read())

or from Tools > Execute Python Script.

What it does
------------
1. Makes sure /Game/LosSanterra/BP_RoadSpline exists (an Actor with one Spline
   Component). Creates it if it is missing.
2. Spawns one actor per road centreline from output/unreal/los-santerra-roads.json,
   fills its spline with the road's points in world space, labels it with the
   street name and tags it with the road kind and district.
3. Files everything under the LosSanterra/Roads outliner folder, one subfolder
   per road kind, so freeways, canyon roads and residential streets can be
   shown, hidden and worked on separately.

All coordinates are already in Unreal centimetres, with the map's centre pixel at
the world origin — the same origin the Landscape heightmap uses — so nothing here
does any geometry of its own.

Nothing is placed for the 18k building lots yet: that many actors is the wrong
shape for the problem and they belong in PCG, driven by the same file.
"""
import json
import os

import unreal

# --------------------------------------------------------------------- config
# Absolute on purpose: exec()'d scripts have no __file__, and the editor's
# working directory is wherever the Unreal binary lives. Edit this if the project
# moves.
PROJECT = r'/Users/peterchi/Desktop/Dwn SHIFT'
DATA = os.path.join(PROJECT, 'output', 'unreal', 'los-santerra-roads.json')
PACKAGE_PATH = '/Game/LosSanterra'
BLUEPRINT_NAME = 'BP_RoadSpline'
BLUEPRINT_PATH = '{}/{}'.format(PACKAGE_PATH, BLUEPRINT_NAME)
ROOT_FOLDER = 'LosSanterra/Roads'

# Skip nothing by default; set e.g. {'street', 'residential'} for a fast test run
# that only brings in the arterials, freeways and canyon roads.
SKIP_KINDS = set()


def log(message):
    unreal.log('[Los Santerra] {}'.format(message))


# ---------------------------------------------------------------- blueprint
def ensure_blueprint():
    """Return the BP_RoadSpline class, creating the asset if needed."""
    if unreal.EditorAssetLibrary.does_asset_exist(BLUEPRINT_PATH):
        blueprint = unreal.EditorAssetLibrary.load_asset(BLUEPRINT_PATH)
        log('using existing {}'.format(BLUEPRINT_PATH))
        return blueprint

    log('creating {}'.format(BLUEPRINT_PATH))
    factory = unreal.BlueprintFactory()
    factory.set_editor_property('parent_class', unreal.Actor)
    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    blueprint = asset_tools.create_asset(BLUEPRINT_NAME, PACKAGE_PATH, None, factory)
    if blueprint is None:
        raise RuntimeError('could not create ' + BLUEPRINT_PATH)

    # Add the spline component through the subobject system, which is how UE5
    # edits a Blueprint's component tree from script.
    subsystem = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
    handles = subsystem.k2_gather_subobject_data_for_blueprint(blueprint)
    if not handles:
        raise RuntimeError('no subobject handles for ' + BLUEPRINT_PATH)
    params = unreal.AddNewSubobjectParams(
        parent_handle=handles[0],
        new_class=unreal.SplineComponent,
        blueprint_context=blueprint)
    handle, failure = subsystem.add_new_subobject(params)
    if not failure.is_empty():
        raise RuntimeError('adding spline component: {}'.format(failure))
    subsystem.rename_subobject(handle, unreal.Text('RoadSpline'))
    unreal.BlueprintEditorLibrary.compile_blueprint(blueprint)
    unreal.EditorAssetLibrary.save_asset(BLUEPRINT_PATH)
    return blueprint


# -------------------------------------------------------------------- import
def spline_of(actor):
    component = actor.get_component_by_class(unreal.SplineComponent)
    if component is None:
        raise RuntimeError('BP_RoadSpline has no Spline Component')
    return component


def main():
    path = os.path.normpath(DATA)
    if not os.path.exists(path):
        raise RuntimeError(
            'cannot find {}\nRun: python3 tools/build_unreal_export.py'.format(path))
    with open(path, 'r') as handle:
        payload = json.load(handle)

    roads = [r for r in payload['roads'] if r['kind'] not in SKIP_KINDS]
    log('{} road splines to place'.format(len(roads)))

    blueprint = ensure_blueprint()
    actor_class = blueprint.generated_class()
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)

    origin = unreal.Vector(0.0, 0.0, 0.0)
    rotation = unreal.Rotator(0.0, 0.0, 0.0)
    placed = 0
    total_km = 0.0

    task = unreal.ScopedSlowTask(len(roads), 'Importing Los Santerra roads')
    task.make_dialog(True)
    for road in roads:
        if task.should_cancel():
            log('cancelled after {} roads'.format(placed))
            break
        task.enter_progress_frame(1, road['name'])

        actor = actors.spawn_actor_from_class(actor_class, origin, rotation)
        if actor is None:
            continue
        spline = spline_of(actor)
        spline.clear_spline_points(False)
        for x, y, z in road['points']:
            spline.add_spline_point(unreal.Vector(x, y, z),
                                    unreal.SplineCoordinateSpace.WORLD, False)
        spline.set_closed_loop(False, False)
        spline.update_spline()

        actor.set_actor_label('{} [{}]'.format(road['name'], road['kind']))
        actor.set_folder_path('{}/{}'.format(ROOT_FOLDER, road['kind']))
        actor.tags = [unreal.Name(road['kind']),
                      unreal.Name(road['district']),
                      unreal.Name('elevated' if road['elevated'] else 'surface')]
        placed += 1
        total_km += road['lengthM'] / 1000.0

    log('placed {} road splines, {:.0f} km'.format(placed, total_km))
    log('outliner folder: {}'.format(ROOT_FOLDER))
    return placed


main()
