"""Overlay aurora.py's body on a reference mesh, to fit the profiles by eye.

Run:  Blender -b --factory-startup --python tools/blender/ref_overlay.py -- ref.glb out_dir [--sections 2.2,1.4,...]

Renders orthographic silhouettes of both (side, top, front, rear) and thin
cross-section slabs, and composites them: grey where they agree, red where
only the reference is, cyan where only ours is.
"""
import bpy, sys, os, math
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ARGS = sys.argv[sys.argv.index('--') + 1:]
REF, OUT = ARGS[0], ARGS[1]
arg = lambda n, d=None: ARGS[ARGS.index(n) + 1] if n in ARGS else d
SECTIONS = [float(s) for s in arg('--sections', '2.3,1.9,1.4,.9,.4,0,-.5,-1.0,-1.4,-1.9').split(',')]

# Build our body (aurora.py runs main() on exec; without --export it only builds).
ns = {'__file__': os.path.join(HERE, 'aurora.py'), '__name__': 'aurora'}
exec(open(ns['__file__']).read(), ns)
ours = [o for o in bpy.context.scene.objects if o.type in ('MESH', 'CURVE')]

# The reference, moved into game space (stored as Blender (x, -z, y) like aurora.py's G()).
sys.path.insert(0, HERE)
from ref_measure import load_game_space
V, ref, info = load_game_space(REF)
ref.matrix_world.identity()
B = np.stack([V[:, 0], -V[:, 2], V[:, 1]], 1)
ref.data.vertices.foreach_set('co', B.ravel()); ref.data.update()
print('REF', info)

s = bpy.context.scene
s.render.engine = 'BLENDER_WORKBENCH'; s.render.film_transparent = True
s.display.shading.light = 'FLAT'; s.display.shading.color_type = 'SINGLE'
s.render.resolution_x, s.render.resolution_y = 1400, 700
cam = bpy.data.objects.new('ocam', bpy.data.cameras.new('ocam')); s.collection.objects.link(cam); s.camera = cam
cam.data.type = 'ORTHO'
# Our wheels as plain discs, so the arches can be judged against the reference's tyres.
wheels = []
for zc in (1.41, -1.41):
    for x in (.91, -.91):
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=.365, depth=.3, location=(x, -zc, .365), rotation=(0, math.pi / 2, 0))
        wheels.append(bpy.context.active_object)
ours += wheels

def mask(objs, path):
    for o in bpy.context.scene.objects:
        if o.type in ('MESH', 'CURVE'): o.hide_render = o not in objs
    s.render.filepath = path; bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(path); a = np.array(im.pixels[:]).reshape(im.size[1], im.size[0], 4)[..., 3]
    bpy.data.images.remove(im)
    return a > .5

def view(name, loc, look, up_, scale, clip=None, rot=0):
    """rot: quarter turns applied after rendering (the side and top views render with the car upright)."""
    rx, ry = s.render.resolution_x, s.render.resolution_y
    if rot % 2: s.render.resolution_x, s.render.resolution_y = ry, rx
    cam.location = Vector(loc)
    cam.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat('-Z', up_).to_euler()
    cam.data.ortho_scale = scale
    cam.data.clip_start, cam.data.clip_end = clip or (.01, 100)
    a = mask(ours, f'{OUT}/_ours-{name}.png'); b = mask([ref], f'{OUT}/_ref-{name}.png')
    s.render.resolution_x, s.render.resolution_y = rx, ry
    a, b = np.rot90(a, rot), np.rot90(b, rot)
    img = np.ones(a.shape + (4,)); img[..., :3] = .96
    img[a & b, :3] = (.45, .45, .48)
    img[b & ~a, :3] = (.9, .15, .1)
    img[a & ~b, :3] = (.1, .7, .9)
    # a 10 cm grid, to read the misfit in metres
    H, W = a.shape; px = max(W, H) / scale
    for k in range(-40, 41):
        for axis in (0, 1):
            c = int((W if axis else H) / 2 + k * .1 * px)
            if 0 <= c < (W if axis else H):
                if axis: img[:, c, :3] *= .93 if k % 5 else .8
                else: img[c, :, :3] *= .93 if k % 5 else .8
    out = bpy.data.images.new(name, W, H, alpha=True); out.pixels[:] = img.ravel()
    out.filepath_raw = f'{OUT}/ov-{name}.png'; out.file_format = 'PNG'; out.save()
    print('ov', name, 'ref-only %.1f%% ours-only %.1f%%' % (100 * (b & ~a).sum() / max(1, (a | b).sum()), 100 * (a & ~b).sum() / max(1, (a | b).sum())))

cy = .6
view('side', (10, 0, cy), (0, 0, cy), 'Z', 5.6, rot=1)
view('top', (0, 0, 10), (0, 0, 0), 'Y', 5.6, rot=1)
s.render.resolution_x, s.render.resolution_y = 900, 600
view('front', (0, -10, cy), (0, 0, cy), 'Z', 2.7)
view('rear', (0, 10, cy), (0, 0, cy), 'Z', 2.7)
# Sections: a 2 cm slab at game z (Blender -y), seen from the front.
for z in SECTIONS:
    view(f'sec{z:+.2f}', (0, -z - 10, cy), (0, -z, cy), 'Z', 2.7, (10 - .01, 10 + .01))
