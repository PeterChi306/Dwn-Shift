"""Blender performance coupe plus genuinely different sedan, SUV and delivery van."""
import bpy, bmesh, math, os
from mathutils import Vector
OUT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../assets/world'))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,color,metal=0,rough=.4,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if metal>.5:p.inputs['Coat Weight'].default_value=.55;p.inputs['Coat Roughness'].default_value=.12
 if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
 return m
paint=mat('Obsidian petrol metallic',(.045,.105,.12),.72,.22);rubber=mat('Satin tire rubber',(.012,.014,.016),0,.82);black=mat('Carbon diffuser',(.015,.02,.025),.3,.35);silver=mat('Brushed forged aluminum',(.43,.46,.5),.92,.22);glass=mat('Tinted automotive glass',(.055,.10,.13),.3,.075);red=mat('Brake LED',(.8,.007,.008),.1,.2,3);white=mat('Headlight LED',(.72,.86,1),.1,.2,4);leather=mat('Saddle leather',(.17,.09,.055),0,.8);caliper=mat('Ceramic brake caliper',(.67,.19,.035),.45,.3)
glass.node_tree.nodes.get('Principled BSDF').inputs['Transmission Weight'].default_value=.24
current=[]
def register(o,name,m=None,parent=None):
 o.name=name
 if m:o.data.materials.append(m)
 if parent:o.parent=parent
 current.append(o);return o
def mesh(name,verts,faces,m,parent=None):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);register(o,name,m,parent);return o
def cube(name,p,s,m,bevel=.035,parent=None):
 vs=[(-.5,-.5,-.5),(.5,-.5,-.5),(.5,.5,-.5),(-.5,.5,-.5),(-.5,-.5,.5),(.5,-.5,.5),(.5,.5,.5),(-.5,.5,.5)];o=mesh(name,[(v[0]*s[0],v[1]*s[1],v[2]*s[2])for v in vs],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],m,parent);o.location=p
 if bevel:mod=o.modifiers.new('Edge radius','BEVEL');mod.width=bevel;mod.segments=3;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 return o
def cylinder(name,p,r,depth,m,parent=None,vertices=48):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=p,rotation=(0,math.pi/2,0));o=bpy.context.object;register(o,name,m,parent)
 for f in o.data.polygons:f.use_smooth=True
 return o
def loft(name,sections,m):
 v=[];f=[];count=24
 for yy,width,bottom,top in sections:
  for j in range(count):
   a=j/count*math.tau;xx=math.copysign(abs(math.cos(a))**.5,math.cos(a))*width;zz=(bottom+top)/2+math.copysign(abs(math.sin(a))**.6,math.sin(a))*(top-bottom)/2;v.append((xx,yy,zz))
 for i in range(len(sections)-1):
  for j in range(count):f.append((i*count+j,i*count+(j+1)%count,(i+1)*count+(j+1)%count,(i+1)*count+j))
 f.extend([tuple(reversed(range(count))),tuple((len(sections)-1)*count+j for j in range(count))]);o=mesh(name,v,f,m)
 for poly in o.data.polygons:poly.use_smooth=True
 return o
def wheels(wheelbase,width,radius=.36):
 for side,x in [('L',-width),('R',width)]:
  for axle,y in [('F',-wheelbase/2),('R',wheelbase/2)]:
   group=bpy.data.objects.new('Wheel_'+axle+side,None);bpy.context.collection.objects.link(group);group.location=(x,y,radius);current.append(group)
   # Mesh vertices in wheel-local space; glTF retains the pivot for steering/rotation.
   bpy.ops.mesh.primitive_torus_add(major_radius=radius-.07,minor_radius=.075,major_segments=48,minor_segments=12,rotation=(0,math.pi/2,0));t=bpy.context.object;register(t,'Performance tire',rubber,group);t.scale.z=1.6
   for f in t.data.polygons:f.use_smooth=True
   sign=1 if x>0 else -1
   cylinder('Ventilated brake rotor',(sign*.045,0,0),radius*.72,.035,silver,group)
   cylinder('Wheel barrel',(0,0,0),radius*.77,.16,black,group)
   cylinder('Center cap',(sign*.14,0,0),.052,.03,silver,group)
   for a in range(10):
    theta=a*math.tau/10;o=cube('Machined Y spoke',(sign*.13,math.sin(theta)*radius*.39,math.cos(theta)*radius*.39),(.04,.026,radius*.72),silver,.009,group);o.rotation_euler.x=-theta
   for a in range(16):
    theta=a*math.tau/16;cylinder('Drilled rotor hole',(sign*.153,math.sin(theta)*radius*.6,math.cos(theta)*radius*.6),.008,.008,black,group,12)
   cube('Brake caliper',(sign*.1,.2,0),(.12,.09,.25),caliper,.025,group)
def car(kind):
 global current
 current=[]
 ishero=kind=='performance-coupe';suv=kind=='traffic-suv';van=kind=='traffic-van';wb=2.82 if ishero else 3.0;w=.99 if ishero else 1.02;length=4.65 if ishero else 4.9;top=.87 if ishero else 1.05
 color=paint if ishero else mat(kind+' paint',(.28,.31,.34)if suv else (.72,.7,.64)if van else(.3,.12,.08),.55,.29)
 sections=[(-length/2,.78,.32,top-.18),(-length/2+.18,.91,.24,top-.07),(-wb/2,w,.25,top+.07),(-.65,.91,.25,top),(.5,.92,.25,top),(wb/2,w,.27,top+.12),(length/2-.2,.94,.3,top+.02),(length/2,.84,.35,top-.08)]
 body=loft('Sculpted coachwork',sections,color)
 # Real open wheel arches, cut into the body rather than wheels glued onto its side.
 for yy in [-wb/2,wb/2]:
  cutter=cylinder('Wheel arch cutter',(0,yy,.36),.408,2.8,black)
  mod=body.modifiers.new('Wheel arch','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter;bpy.context.view_layer.objects.active=body
  bpy.ops.object.modifier_apply(modifier=mod.name);current.remove(cutter);bpy.data.objects.remove(cutter,do_unlink=True)
 roof=1.28 if ishero else 1.68 if suv else 2.2 if van else 1.48
 front=-.53 if ishero else -.7;back=.95 if ishero else 1.5
 cabin=loft('Glazed cabin',[(-1.05,.72,top-.015,top+.035),(front,.7,top-.01,roof-.025),(back-.42,.7,top-.01,roof),(back,.79,top-.01,top+.07)],glass)
 cube('Floating roof',(0,(front+back-.42)/2,roof), (1.37,back-.42-front,.055),color,.06)
 for side in [-1,1]:
  # B-pillars, window trim, mirrors, door seams and handles.
  cube('B pillar',(side*.704,.18,(roof+top)/2),(.038,.06,roof-top),black,.013)
  cube('Window sill',(side*.84,.1,top+.025),(.045,1.9,.035),silver,.01)
  cube('Door handle',(side*.925,.4,top-.09),(.035,.16,.025),silver,.01)
  cube('Side skirt',(side*.92,.02,.28),(.075,1.85,.1),black,.02)
  cube('Mirror stalk',(side*.94,-.65,top+.11),(.2,.04,.04),black,.012)
  cube('Mirror housing',(side*1.045,-.65,top+.13),(.2,.28,.105),color,.045)
  cube('Mirror glass',(side*1.045,-.51,top+.13),(.14,.02,.067),silver,.018)
  cube('Seat cushion',(side*.39,.12,.56),(.48,.54,.16),leather,.06)
  seat=cube('Seat back',(side*.39,.47,.89),(.47,.15,.65),leather,.08);seat.rotation_euler.x=.13
  cube('Seat headrest',(side*.39,.46,1.12),(.23,.13,.15),leather,.055)
  cube('LED headlight',(side*.66,-length/2-.015,top-.11),(.43,.035,.065),white,.025)
  cube('Rear light blade',(side*.55,length/2+.006,top-.045),(.67,.035,.042),red,.014)
  cylinder('Titanium exhaust',(side*.64,length/2-.01,.35),.068,.16,silver).rotation_euler=(math.pi/2,0,0)
 cube('Rear LED bridge',(0,length/2+.014,top-.045),(.4,.028,.025),red,.01)
 cube('Front lower intake',(0,-length/2+.02,.43),(1.3,.1,.18),black,.025)
 for xx in [-.4,-.2,0,.2,.4]:cube('Intake vertical strake',(xx,-length/2-.035,.43),(.025,.03,.14),silver,.006)
 cube('Rear diffuser',(0,length/2,.31),(1.5,.2,.16),black,.025)
 for xx in [-.6,-.3,0,.3,.6]:cube('Diffuser fin',(xx,length/2-.13,.25),(.024,.42,.13),black,.009)
 cube('Rear license plate',(0,length/2+.025,.6),(.31,.025,.115),silver,.005)
 cube('Dashboard',(0,-.77,.85),(1.35,.32,.16),black,.04)
 cube('Infotainment display',(0,-.61,.99),(.22,.025,.14),glass,.012)
 if van:
  cube('Delivery cargo body',(0,.6,1.48),(1.96,3.0,1.5),color,.11)
  for side in [-1,1]:cube('Cargo panel seam',(side*.988,.6,1.48),(.016,2.7,1.26),silver,.005)
 if suv:
  for side in [-1,1]:cube('Roof rail',(side*.62,.3,roof+.07),(.045,1.7,.06),silver,.02)
 if ishero:
  cube('Integrated rear spoiler',(0,length/2-.24,top+.13),(1.58,.23,.055),color,.025)
 wheels(wb,w-.08,.365 if ishero else .39)
 bpy.ops.object.select_all(action='DESELECT')
 for o in current:o.select_set(True)
 bpy.context.view_layer.objects.active=body
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,kind+'.glb'),export_format='GLB',use_selection=True,export_apply=True)
 # Layout the editable fleet with independent roots for easy inspection.
 offset={'performance-coupe':0,'traffic-sedan':4,'traffic-suv':8,'traffic-van':12}[kind]
 for o in current:
  if o.parent is None:o.location.x+=offset
 return current
for kind in ['performance-coupe','traffic-sedan','traffic-suv','traffic-van']:car(kind)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'los-santerra-fleet.blend'))
print('Fleet export complete')
