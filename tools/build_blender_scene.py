"""Editable route scene using the game's shared layout and Blender-authored kit."""
import bpy, json, math, os, bisect, random
from mathutils import Vector
random.seed(73)
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
OUT=os.path.join(ROOT,'assets/world')
config=json.load(open(os.path.join(OUT,'route.json')))
pts=[Vector(p) for p in config['points']];N=len(pts)
def curve(t):
 f=(t%1)*N;i=int(f);u=f-i;p0,p1,p2,p3=[pts[k%N] for k in (i-1,i,i+1,i+2)];v0=(p2-p0)*.35;v1=(p3-p1)*.35
 return (2*p1-2*p2+v0+v1)*u**3+(-3*p1+3*p2-2*v0-v1)*u**2+v0*u+p1
raw=[curve(i/5000) for i in range(5001)];lens=[0]
for i in range(1,len(raw)):lens.append(lens[-1]+(raw[i]-raw[i-1]).length)
L=lens[-1]
def sample(t):
 distance=(t%1)*L;i=max(1,min(5000,bisect.bisect_left(lens,distance)));f=(distance-lens[i-1])/(lens[i]-lens[i-1]);return raw[i-1].lerp(raw[i],f)
def at(t,off=0,h=0):
 p=sample(t);d=(sample(t+.00001)-sample(t-.00001)).normalized();p+=Vector((d.z*off,h,-d.x*off));return Vector((p.x,-p.z,p.y))
def angle(t):
 d=sample(t+.00001)-sample(t-.00001);return math.atan2(d.x,d.z)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def material(name,col):
 m=bpy.data.materials.new(name);m.diffuse_color=(*col,1);return m
road=material('Asphalt',(.09,.105,.12));line=material('Road paint',(.85,.78,.5));stone=material('Limestone',(.53,.48,.39));leaf=material('Chaparral',(.23,.3,.14));glass=material('Facade glazing',(.045,.12,.14))
cube_meshes={}
def cube(name,loc,size,mat,rotation=0):
 # Direct datablocks avoid an O(n²) dependency-graph update from bpy.ops per prop.
 if mat.name not in cube_meshes:
  me=bpy.data.meshes.new('Instanced cube / '+mat.name)
  me.from_pydata([(-.5,-.5,-.5),(.5,-.5,-.5),(.5,.5,-.5),(-.5,.5,-.5),(-.5,-.5,.5),(.5,-.5,.5),(.5,.5,.5),(-.5,.5,.5)],[],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
  me.materials.append(mat);cube_meshes[mat.name]=me
 o=bpy.data.objects.new(name,cube_meshes[mat.name]);bpy.context.collection.objects.link(o);o.location=loc;o.scale=size;o.rotation_euler.z=rotation;return o
def ribbon(name,offset,width,height,mat,start=0,end=1):
 v=[];f=[];count=max(2,int((end-start)*1800))
 for i in range(count+1):
  t=start+(end-start)*i/count
  for side in [-1,1]:v.append(at(t,offset+side*width/2,height))
  if i<count:j=i*2;f.append((j,j+2,j+3,j+1))
 me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.materials.append(mat);o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
ribbon('Continuous drivable road',0,28,0,road)
for off in [-.14,.14]:ribbon('Double yellow center line',off,.1,.028,line)
for side in [-1,1]:
 ribbon('Sidewalk',side*16,3,.14,stone);ribbon('Edge line',side*13,.13,.03,line)
 for d in range(0,int(L),12):ribbon('Lane dash',side*6.5,.12,.03,line,d/L,min((d+4)/L,1))
def import_asset(file,name):
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=os.path.join(OUT,file+'.glb'));objects=set(bpy.data.objects)-before
 collection=bpy.data.collections.new(name)
 for o in objects:
  for col in list(o.users_collection):col.objects.unlink(o)
  collection.objects.link(o)
 return collection
hotel=import_asset('aster-hotel','Aster hotel asset');palm=import_asset('california-palm','California palm asset');coupe=import_asset('touring-coupe','Touring coupe asset')
def instance(asset,name,t,off=0,rot=0,scale=1):
 o=bpy.data.objects.new(name,None);o.instance_type='COLLECTION';o.instance_collection=asset;o.location=at(t,off);o.rotation_euler.z=angle(t)+rot;o.scale=(scale,)*3;bpy.context.collection.objects.link(o)
instance(hotel,'THE ASTER / Sunset landmark',.027,31,-math.pi/2)
instance(coupe,'Player spawn',.018,-3.5)
for d in range(8,int(L),40):
 t=d/L
 if .43<t<.8:continue
 for side in [-1,1]:instance(palm,'Street palm',t,side*19.5,random.random()*6.28,.85+random.random()*.4)
for d in range(20,int(L),36):
 t=d/L
 if .22<t<.81 or t>.95:continue
 for side in [-1,1]:
  if t<.04 and side==1:continue
  h=5+random.random()*12;a=angle(t);off=side*30
  cube('Street building',at(t,off,h/2),(18,29,h),stone,a)
  for fl in range(2,int(h),3):
   for step in [-9,-4,1,6,11]:cube('Recessed storefront / window',at(t+step/L,off-side*9.1,fl),(.12,3,1.7),glass,a)
for d in range(int(L*.43),int(L*.54),8):
 t=d/L;a=angle(t);cube('Tunnel ceiling',at(t,0,7.5),(30,8.5,1),stone,a)
 for side in [-1,1]:cube('Tunnel concrete wall',at(t,side*14.6,3.6),(1,8.5,7.2),stone,a)
for d in range(int(L*.56),int(L*.79),24):
 t=d/L
 for side in [-1,1]:cube('Freeway bridge pier',at(t,side*17,-5),(1.8,2.5,10),stone,angle(t))
cube('Ground',(0,0,-14),(14000,14000,2),leaf)
bpy.ops.object.light_add(type='SUN',location=(0,0,100));bpy.context.object.rotation_euler=(.5,-.4,-.7);bpy.context.object.data.energy=3
bpy.ops.object.camera_add(location=at(.018-10/L,-3.5,4));cam=bpy.context.object;direction=at(.018+24/L,-3.5,1)-cam.location;cam.rotation_euler=direction.to_track_quat('-Z','Y').to_euler();bpy.context.scene.camera=cam
bpy.context.scene.world.color=(.25,.3,.4)
bpy.context.scene.render.engine='CYCLES';bpy.context.scene.cycles.samples=32
bpy.context.scene.render.resolution_x=1600;bpy.context.scene.render.resolution_y=900
# Open into the camera, with a useful clipping distance for the regional scene.
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':area.spaces.active.clip_end=15000;area.spaces.active.region_3d.view_perspective='CAMERA'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'sunset-run.blend'))
print('Saved editable full-route scene:',L,'meters')
