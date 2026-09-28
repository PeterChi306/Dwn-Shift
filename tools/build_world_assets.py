"""Reproducible Blender 4.4 environment kit. Run Blender -b --python this_file."""
import bpy, math, random, os
from mathutils import Vector
random.seed(41)
OUT=os.path.abspath(os.path.join(os.path.dirname(__file__), '../assets/world'))
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def mat(name, color, metal=0, rough=.5, glow=0):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
 if glow: p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=glow
 return m
stone=mat('Warm limestone',(.64,.56,.43)); dark=mat('Bronze anodised metal',(.07,.065,.05),.65); glass=mat('Smoked architectural glass',(.055,.14,.16),.6,.15); gold=mat('Warm architectural light',(1,.51,.17),0,.3,3); white=mat('Porcelain',(.8,.79,.7)); green=mat('Palm leaves',(.085,.18,.068)); bark=mat('Palm trunk',(.27,.20,.12)); paint=mat('Champagne titanium paint',(.52,.56,.52),.82,.23); rubber=mat('Tire rubber',(.013,.015,.019)); red=mat('Tail light',(1,.035,.012),0,.2,5)
def cube(name,loc,scale,m,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.name=name; o.dimensions=scale; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(m)
 if bevel:
  mod=o.modifiers.new('Soft machined edges','BEVEL'); mod.width=bevel; mod.segments=3; o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 return o
def text(name,loc,size,m):
 c=bpy.data.curves.new(name,'FONT'); c.body=name; c.align_x='CENTER'; c.size=size; c.extrude=.015; o=bpy.data.objects.new(name,c); bpy.context.collection.objects.link(o); o.location=loc; o.rotation_euler=(math.pi/2,0,0); c.materials.append(m)
def export(name):
 # Export only this asset, then hide it in the editable library.
 objs=[o for o in bpy.context.scene.objects if not o.hide_get()]
 bpy.ops.object.select_all(action='DESELECT')
 for o in objs:o.select_set(True)
 bpy.context.view_layer.objects.active=objs[0]
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,name+'.glb'),export_format='GLB',use_selection=True,export_apply=True)
 for o in objs:o.hide_set(True)
# Hero hotel: articulated facade, canopy, illuminated blade, terrace, roof plant.
cube('Hotel limestone podium',(0,0,3),(32,18,6),stone,.16)
cube('Hotel upper floors',(0,2,14),(27,14,17),stone,.2)
for floor in range(6):
 z=7+floor*2.7
 for x in range(-12,13,3):
  cube('Recessed bronze bay',(x,-5.13,z),(2.35,.15,1.95),dark,.04)
  cube('Glazing',(x,-5.24,z),(1.95,.06,1.65),glass)
  cube('Window lamp',(x,-5.28,z+.65),(1.8,.04,.05),gold)
 cube('Horizontal cornice',(0,-5.4,z-1.15),(28,.8,.18),white,.03)
for x in range(-14,15,4):
 cube('Streetfront glass',(x,-9.05,2.6),(3.1,.1,4.4),glass)
 cube('Stone fin',(x+1.7,-9.2,3),(.3,.6,6),stone)
cube('Entrance canopy',(0,-11.5,4.2),(15,5,.3),dark,.1)
cube('Canopy light',(0,-12.5,4.05),(13,.15,.05),gold)
text('THE ASTER',(0,-9.27,5.05),.85,gold)
cube('Vertical blade',(13.8,-6,15),(2,1.5,12),dark,.15)
for i,c in enumerate('ASTER'):text(c,(13.8,-6.79,19-i*2.15),1.35,gold)
for x in [-9,0,9]:
 cube('Roof planter',(x,1,23),(5,4,.9),dark,.1)
 for j in range(4):
  bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1.6,location=(x+random.uniform(-1,1),1+random.uniform(-1,1),24)); bpy.context.object.data.materials.append(green)
export('aster-hotel')
# Hand-shaped coupe; negative Y is front, positive Y is rear.
# Cross-sections create tapered haunches rather than a scaled cube.
sections=[(-2.25,.72,.42,.73),(-1.8,.94,.34,.93),(-.9,.96,.33,.98),(.8,.96,.33,1.0),(1.65,.95,.36,.92),(2.24,.76,.43,.78)]
vs=[];fs=[]
for yy,ww,lo,hi in sections:
 vs.extend([(-ww,yy,lo),(ww,yy,lo),(ww,yy,hi),(-ww,yy,hi)])
for i in range(len(sections)-1):
 for j in range(4):fs.append((i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j))
fs.extend([(3,2,1,0),(20,21,22,23)])
me=bpy.data.meshes.new('Tapered bodywork');me.from_pydata(vs,[],fs);o=bpy.data.objects.new('Sculpted lower body',me);bpy.context.collection.objects.link(o);o.data.materials.append(paint);be=o.modifiers.new('Coachwork radii','BEVEL');be.width=.14;be.segments=4;o.modifiers.new('Weighted body normals','WEIGHTED_NORMAL')
cube('Hood',(0,-1.32,.95),(1.82,1.5,.23),paint,.13)
cube('Glass canopy',(0,.15,1.12),(1.52,2.08,.55),glass,.28)
cube('Roof',(0,.25,1.4),(1.36,1.05,.08),paint,.1)
cube('Rear deck',(0,1.57,.98),(1.8,.85,.18),paint,.08)
for x in [-.96,.96]:
 for y in [-1.35,1.38]:
  bpy.ops.mesh.primitive_torus_add(major_radius=.29,minor_radius=.105,major_segments=24,minor_segments=10,location=(x,y,.42),rotation=(0,math.pi/2,0)); bpy.context.object.data.materials.append(rubber)
  bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.24,depth=.09,location=(x*1.045,y,.42),rotation=(0,math.pi/2,0)); bpy.context.object.data.materials.append(dark)
  for a in range(5):
   o=cube('Forged spoke',(x*1.1,y,.42),(.04,.035,.45),white,.015); o.rotation_euler.x=a*math.tau/5
for x in [-.63,.63]:
 cube('LED headlight',(x,-2.21,.78),(.48,.055,.1),gold,.03)
 cube('Rear lamp',(x,2.21,.78),(.52,.045,.08),red,.02)
 cube('Exhaust tip',(x,2.19,.43),(.18,.16,.1),dark,.04)
cube('Rear diffuser',(0,2.18,.4),(1.4,.15,.2),rubber,.05)
export('touring-coupe')
# Palm with curved trunk and individually tapered, drooping fronds.
verts=[]; faces=[]
for i in range(13):
 z=i*.85; bend=.012*z*z
 for j in range(10):
  a=j*math.tau/10; r=.19-i*.006; verts.append((bend+math.cos(a)*r,math.sin(a)*r,z))
 if i:
  for j in range(10): a=(i-1)*10+j; b=(i-1)*10+(j+1)%10; faces.append((a,b,b+10,a+10))
mesh=bpy.data.meshes.new('Curved trunk');mesh.from_pydata(verts,[],faces);o=bpy.data.objects.new('Palm trunk',mesh);bpy.context.collection.objects.link(o);o.data.materials.append(bark)
for f in range(12):
 a=f*math.tau/12; vv=[]; ff=[]
 for j in range(10):
  t=j/9; r=t*3.6; z=10.2+math.sin(t*math.pi)*1.1-t*t*1.7; w=.025
  for side in [-1,1]: vv.append((1.25+math.cos(a)*r+math.sin(a)*w*side,math.sin(a)*r-math.cos(a)*w*side,z))
  if j: k=j*2;ff.append((k-2,k-1,k+1,k))
 mesh=bpy.data.meshes.new('Frond');mesh.from_pydata(vv,[],ff);o=bpy.data.objects.new('Palm frond',mesh);bpy.context.collection.objects.link(o);o.data.materials.append(green)
# Feathered leaflets give the canopy a California-palm silhouette.
for f in range(12):
 a=f*math.tau/12
 for j in range(2,17):
  t=j/18; r=t*3.6; z=10.2+math.sin(t*math.pi)*1.1-t*t*1.7
  cx=1.25+math.cos(a)*r;cy=math.sin(a)*r;reach=math.sin(t*math.pi)*.78
  for side in [-1,1]:
   tip=(cx+math.sin(a)*reach*side+math.cos(a)*.28,cy-math.cos(a)*reach*side+math.sin(a)*.28,z-.32)
   vv=[(cx-math.cos(a)*.08,cy-math.sin(a)*.08,z),tip,(cx+math.cos(a)*.1,cy+math.sin(a)*.1,z+.015)]
   me=bpy.data.meshes.new('Palm leaflet');me.from_pydata(vv,[],[(0,1,2)]);o=bpy.data.objects.new('Palm leaflet',me);bpy.context.collection.objects.link(o);o.data.materials.append(green)
export('california-palm')
for o in bpy.context.scene.objects:o.hide_set(False)
# Objects carry clear names for editing; exported GLBs are independently centered.
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'sunset-kit.blend'))
print('Blender asset kit exported to',OUT)
