"""Why are the trees floating? Run in the open editor: py "<this file>" """
import json, os, random, unreal

L = unreal.log_warning
EXPORTS = '/Users/peterchi/Desktop/Dwn SHIFT/output/unreal'
TREES = os.path.join(EXPORTS, 'los-santerra-trees.json')
TERRAIN = os.path.join(EXPORTS, 'los-santerra-terrain.json')

meta = json.load(open(TERRAIN))['unreal']
L('[FLOAT] expected landscape location %s scale %s/%s/%s'
  % (meta['landscapeLocation'], meta['scaleX'], meta['scaleY'], meta['scaleZ']))

actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()
found = [a for a in actors if isinstance(a, unreal.LandscapeProxy)]
L('[FLOAT] landscape proxies in level: %d' % len(found))
for a in found:
    loc, scale = a.get_actor_location(), a.get_actor_scale3d()
    L('[FLOAT]   %-28s loc (%.1f, %.1f, %.1f) scale (%.4f, %.4f, %.4f)'
      % (a.get_actor_label(), loc.x, loc.y, loc.z, scale.x, scale.y, scale.z))
    if abs(scale.z - meta['scaleZ']) > 0.01:
        L('[FLOAT]   *** Z SCALE MISMATCH: is %.4f, should be %.4f (terrain is %.2fx too %s)'
          % (scale.z, meta['scaleZ'], max(scale.z, meta['scaleZ']) / min(scale.z, meta['scaleZ']),
             'flat' if scale.z < meta['scaleZ'] else 'tall'))
    if abs(scale.x - meta['scaleX']) > 0.01:
        L('[FLOAT]   *** XY SCALE MISMATCH: is %.4f, should be %.4f' % (scale.x, meta['scaleX']))
    for axis, want, got in (('X', meta['landscapeLocation'][0], loc.x),
                            ('Y', meta['landscapeLocation'][1], loc.y),
                            ('Z', meta['landscapeLocation'][2], loc.z)):
        if abs(want - got) > 1.0:
            L('[FLOAT]   *** %s LOCATION MISMATCH: is %.1f, should be %.1f' % (axis, got, want))

if not found:
    L('[FLOAT] no Landscape in the level -- trees are floating over nothing')

# Sample tree positions and trace down onto whatever is actually there.
species = json.load(open(TREES))['species']
flat = [(k, it) for k, v in species.items() for it in v]
random.seed(7)
sample = random.sample(flat, min(300, len(flat)))
world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
ignore = [a for a in actors if unreal.Name('LosSanterraTrees') in a.tags]
L('[FLOAT] ignoring %d tree actors in the traces' % len(ignore))
gaps, misses = [], 0
for kind, (x, y, z, yaw, scale) in sample:
    start = unreal.Vector(x, y, 200000.0)
    end = unreal.Vector(x, y, -100000.0)
    hit = unreal.SystemLibrary.line_trace_single(
        world, start, end, unreal.TraceTypeQuery.ECC_VISIBILITY, False, ignore,
        unreal.DrawDebugTrace.NONE, True)
    if hit is None:
        misses += 1
        continue
    ground = None
    for name in ('impact_point', 'location'):
        try:
            ground = hit.get_editor_property(name).z
            break
        except Exception:
            pass
    if ground is None:
        try:
            ground = unreal.SystemLibrary.break_hit_result(hit)[5].z
        except Exception as exc:
            L('[FLOAT] cannot read hit: %s' % exc)
            break
    gaps.append((z - ground, kind, x, y, z, ground))

L('[FLOAT] traced %d sample trees, %d hit nothing' % (len(sample), misses))
if gaps:
    gaps.sort()
    vals = [g[0] for g in gaps]
    mid = vals[len(vals) // 2]
    L('[FLOAT] gap (tree z - ground z), cm:  min %.0f  median %.0f  max %.0f'
      % (vals[0], mid, vals[-1]))
    L('[FLOAT] median gap = %.1f m' % (mid / 100.0))
    for label, g in (('lowest', gaps[0]), ('median', gaps[len(gaps) // 2]), ('highest', gaps[-1])):
        L('[FLOAT]   %-7s %-5s at (%.0f, %.0f): tree z %.0f, ground z %.0f'
          % (label, g[1], g[2], g[3], g[4], g[5]))
    ratios = [g[4] / g[5] for g in gaps if abs(g[5]) > 100]
    if ratios:
        ratios.sort()
        L('[FLOAT] tree z / ground z ratio: median %.3f  (1.000 = perfectly seated)'
          % ratios[len(ratios) // 2])
L('[FLOAT] ==== done ====')
