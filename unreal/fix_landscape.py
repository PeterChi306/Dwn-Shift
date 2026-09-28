"""Delete duplicate Landscapes and seat the survivor at the exported location."""
import json, unreal

L = unreal.log_warning
EXPORTS = '/Users/peterchi/Desktop/Dwn SHIFT/output/unreal'
LEVEL = '/Game/LosSanterra/Maps/L_LosSanterra'
meta = json.load(open(EXPORTS + '/los-santerra-terrain.json'))['unreal']
want = meta['landscapeLocation']

# Headless, the commandlet boots whatever startup map it likes -- NOT necessarily
# ours. Without this the script inspected an empty world and cheerfully reported
# "found 0 landscape actors" while the Landscape sat in L_LosSanterra all along.
unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).load_level(LEVEL)
L('[FIX] opened %s' % LEVEL)

actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
landscapes = [a for a in actors.get_all_level_actors()
              if isinstance(a, unreal.LandscapeProxy)]
landscapes.sort(key=lambda a: a.get_actor_label())
L('[FIX] found %d landscape actors: %s'
  % (len(landscapes), ', '.join(a.get_actor_label() for a in landscapes)))

if not landscapes:
    L('[FIX] nothing to do -- no Landscape in the level')
else:
    keep = landscapes[0]
    for extra in landscapes[1:]:
        L('[FIX] deleting duplicate %s' % extra.get_actor_label())
        actors.destroy_actor(extra)

    keep.set_actor_location(unreal.Vector(*want), False, False)
    loc, scale = keep.get_actor_location(), keep.get_actor_scale3d()
    L('[FIX] kept %s at (%.1f, %.1f, %.1f) scale (%.4f, %.4f, %.4f)'
      % (keep.get_actor_label(), loc.x, loc.y, loc.z, scale.x, scale.y, scale.z))
    if abs(scale.z - meta['scaleZ']) > 0.01:
        L('[FIX] *** Z scale is still wrong: %.4f, wanted %.4f' % (scale.z, meta['scaleZ']))

    unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()
    L('[FIX] level saved')
L('[FIX] ==== done ====')
