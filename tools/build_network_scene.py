"""Create an editable Blender road-layout scene from the same game network.

The exact traced graph is preserved; browser-streamed architecture lives in
scenery.js. Geometry is batched into one mesh per district per purpose — the
graph is now ~7,200 segments, and one object per strip made the file unusable.
"""
import bpy, json, math, os, sys
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'assets/world')
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from build_network import height as terrain_height   # same authored terrain

data = json.load(open(os.path.join(OUT, 'network.json')))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def mat(name, color, rough=.85):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.roughness = rough
    return m


MATS = {
    'asphalt': mat('Road / asphalt', (.075, .085, .09)),
    'dirt': mat('Road / dirt', (.30, .20, .10)),
    'paint': mat('Road / center line', (.7, .55, .24)),
    'curb': mat('Road / sidewalk', (.57, .54, .46)),
    'concrete': mat('Concrete', (.39, .40, .37)),
    'ground': mat('Terrain', (.20, .24, .13)),
}


def vec(p):
    return Vector((p[0], -p[2], p[1]))


nodes = [vec(n['position']) for n in data['nodes']]
collections = {}


def collection(name):
    if name not in collections:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
        collections[name] = c
    return collections[name]


class Batch:
    """Accumulates quads and emits a single mesh object."""

    def __init__(self):
        self.verts = []
        self.faces = []

    def quad(self, a, b, width, offset, lift):
        d = b - a
        if d.length < 1e-6:
            return
        flat = Vector((d.x, d.y, 0))
        if flat.length < 1e-6:
            return
        flat.normalize()
        n = Vector((-flat.y, flat.x, 0))
        a = a + n * offset + Vector((0, 0, lift))
        b = b + n * offset + Vector((0, 0, lift))
        i = len(self.verts)
        self.verts += [a - n * width / 2, b - n * width / 2, b + n * width / 2, a + n * width / 2]
        self.faces.append((i, i + 1, i + 2, i + 3))

    def emit(self, name, material, col):
        if not self.faces:
            return None
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.verts, [], self.faces)
        me.materials.append(material)
        o = bpy.data.objects.new(name, me)
        col.objects.link(o)
        return o


batches = {}


def batch(district, purpose):
    key = (district, purpose)
    if key not in batches:
        batches[key] = Batch()
    return batches[key]


for e in data['edges']:
    a, b = nodes[e['a']], nodes[e['b']]
    d = e['district']
    surface = 'dirt' if e['kind'] == 'dirt' else 'asphalt'
    batch(d, surface).quad(a, b, e['width'], 0, 0)
    if e['kind'] != 'dirt':
        for side in (-1, 1):
            batch(d, 'paint').quad(a, b, .1, side * .13, .03)
            if e['kind'] not in ('freeway', 'ramp', 'tunnel', 'underpass'):
                batch(d, 'curb').quad(a, b, 3.8, side * (e['width'] / 2 + 1.9), .14)
    if e['kind'] == 'tunnel':
        batch(d, 'concrete').quad(a, b, e['width'] + 1, 0, 7.4)

LABEL = {'asphalt': 'Roads', 'dirt': 'Dirt roads', 'paint': 'Markings',
         'curb': 'Sidewalks', 'concrete': 'Tunnel decks'}
for (district, purpose), bat in sorted(batches.items()):
    o = bat.emit(f'{district} · {LABEL[purpose]}', MATS[purpose], collection(district))
    if o is not None and purpose in ('asphalt', 'dirt'):
        o['map_source'] = 'los-santerra-reference.png'

# Terrain, sampled from the same authored height function the game uses.
STEP = 24                      # reference pixels per terrain quad
verts, faces = [], []
cols = 1536 // STEP + 1
rows = 1024 // STEP + 1
for j in range(rows):
    for i in range(cols):
        px, py = i * STEP, j * STEP
        verts.append(Vector(((px - 768) * 10, -(py - 512) * 10, terrain_height(px, py) - 1.2)))
for j in range(rows - 1):
    for i in range(cols - 1):
        k = j * cols + i
        faces.append((k, k + 1, k + cols + 1, k + cols))
me = bpy.data.meshes.new('Terrain')
me.from_pydata(verts, [], faces)
me.materials.append(MATS['ground'])
o = bpy.data.objects.new('TERRAIN · Los Santerra', me)
collection('02 / Terrain').objects.link(o)

# Reference image is positioned in the same pixel-to-world coordinate system.
image = bpy.data.images.load(os.path.join(OUT, 'los-santerra-reference.png'))
image.pack()
m = bpy.data.materials.new('Supplied map / source of truth')
m.use_nodes = True
tree = m.node_tree
tex = tree.nodes.new('ShaderNodeTexImage')
tex.image = image
tree.links.new(tex.outputs['Color'], tree.nodes.get('Principled BSDF').inputs['Base Color'])
me = bpy.data.meshes.new('Map reference plane')
me.from_pydata([(-7680, -5120, -12), (7680, -5120, -12), (7680, 5120, -12), (-7680, 5120, -12)], [], [(0, 1, 2, 3)])
me.uv_layers.new()
for p in me.polygons:
    for loop, uv in zip(p.loop_indices, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        me.uv_layers[0].data[loop].uv = uv
me.materials.append(m)
o = bpy.data.objects.new('REFERENCE · Los Santerra map', me)
collection('00 / Reference').objects.link(o)

for l in data['landmarks']:
    o = bpy.data.objects.new(l['name'], None)
    collection('01 / Landmarks').objects.link(o)
    o.location = ((l['map'][0] - 768) * 10, -(l['map'][1] - 512) * 10,
                  terrain_height(l['map'][0], l['map'][1]) + 20)
    o.empty_display_type = 'CIRCLE'
    o.empty_display_size = 30

bpy.ops.object.camera_add(location=(0, 0, 15000))
cam = bpy.context.object
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 16500
cam.rotation_euler = (0, 0, 0)
bpy.context.scene.camera = cam
bpy.context.scene.render.resolution_x = 1536
bpy.context.scene.render.resolution_y = 1024
bpy.context.scene.world.color = (.3, .35, .4)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.clip_end = 40000
            area.spaces.active.region_3d.view_perspective = 'CAMERA'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'los-santerra-network.blend'))
print('Editable network saved:', len(data['nodes']), 'nodes,', len(data['edges']),
      'road segments,', len(batches), 'batched meshes')
