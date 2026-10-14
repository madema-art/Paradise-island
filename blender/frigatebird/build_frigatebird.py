"""Great frigatebird / Fregata minor. Run with Blender --background --factory-startup --python.
Original procedural mesh, hand-shaped anatomical profiles, editable weighted rig and baked actions.
Z up / -Y forward in Blender. Y up / +Z forward in glTF. Metres. Rest pose is flight.
"""
import bpy, math, os, json
from mathutils import Vector, Matrix, Quaternion, Euler
from math import sin, cos, pi
OUT=os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene; scene.render.fps=30; scene.unit_settings.system='METRIC'
V=[];F=[];COL=[];W=[];TAG=[]
def rgb(h):
 c=[int(h[i:i+2],16)/255 for i in (0,2,4)]
 return tuple(x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in c)+(1,)
P={k:rgb(v) for k,v in dict(black='202a30',dark='141d24',feather='303b43',edge='48545b',green='254b43',bronze='565346',bill='a5aaa4',billtip='626d70',eye='090e12',ring='526b70',foot='626368',claw='242d31',red='bc2631',white='dddcd2',buff='bd8650').items()}
def mix(a,b,t):return tuple(x*(1-t)+y*t for x,y in zip(a,b))
def vert(p,c,w,tag='body'):
 i=len(V);V.append(tuple(p));COL.append(c);W.append(w if isinstance(w,dict) else {w:1});TAG.append(tag);return i
def loft(rings,bone,color,tag='body',n=24):
 start=len(V)
 for j,(y,z,rx,rz) in enumerate(rings):
  for i in range(n):
   a=2*pi*i/n;p=Vector((rx*cos(a),y,z+rz*sin(a)))
   c=color(p,a,j) if callable(color) else color
   w=bone(p,j) if callable(bone) else bone
   vert(p,c,w,tag)
 for j in range(len(rings)-1):
  for i in range(n):F.append((start+j*n+i,start+(j+1)*n+i,start+(j+1)*n+(i+1)%n,start+j*n+(i+1)%n))
 F.append(tuple(start+i for i in reversed(range(n))))
 F.append(tuple(start+(len(rings)-1)*n+i for i in range(n)))
def ell(c,r,b,col,tag,n=14,m=8):
 start=len(V)
 for j in range(m+1):
  a=pi*j/m
  for i in range(n):
   t=2*pi*i/n;p=(c[0]+r[0]*sin(a)*cos(t),c[1]+r[1]*sin(a)*sin(t),c[2]+r[2]*cos(a))
   vert(p,col,b,tag)
 for j in range(m):
  for i in range(n):
   a=start+j*n+i;b0=start+j*n+(i+1)%n
   if j==0:F.append((a,b0+n,a+n))
   elif j==m-1:F.append((a,b0,b0+n))
   else:F.append((a,b0,b0+n,a+n))
def tube(points,radii,b,col,tag='detail',n=6):
 start=len(V)
 for j,point in enumerate(points):
  p=Vector(point);d=(Vector(points[min(j+1,len(points)-1)])-Vector(points[max(0,j-1)])).normalized()
  u=d.cross(Vector((0,0,1)))
  if u.length<.01:u=d.cross(Vector((0,1,0)))
  u.normalize();v=d.cross(u).normalized()
  for i in range(n):vert(p+radii[j]*(cos(2*pi*i/n)*u+sin(2*pi*i/n)*v),col,b,tag)
 for j in range(len(points)-1):
  for i in range(n):F.append((start+j*n+i,start+j*n+(i+1)%n,start+(j+1)*n+(i+1)%n,start+(j+1)*n+i))
 F.append(tuple(start+i for i in reversed(range(n))));F.append(tuple(start+(len(points)-1)*n+i for i in range(n)))
def feather(base,tip,width,b,col,tag='feather',camber=.003):
 base=Vector(base);tip=Vector(tip);d=tip-base;side=Vector((-d.y,d.x,0)).normalized();rows=[]
 for t,wd in [(0,.45),(.22,.90),(.55,1),(.86,.78),(1,.20)]:
  row=[]
  for k in [-1,0,1]:
   p=base+d*t+side*(k*width*wd);p.z+=camber*sin(pi*t)*(1-abs(k))
   # Quiet edge highlights read as feather layering at game distance.
   c=mix(col,P['edge'],.12 if k else .025)
   row.append(vert(p,c,b,tag))
  rows.append(row)
 for j in range(4):
  for k in range(2):F.append((rows[j][k],rows[j+1][k],rows[j+1][k+1],rows[j][k+1]))

# Streamlined body flowing into a slim neck and low, flattened head.
bodyrings=[(.22,.13,.007,.009),(.18,.14,.032,.033),(.10,.148,.060,.056),(.015,.15,.077,.070),(-.06,.158,.076,.073),(-.12,.17,.061,.062),(-.16,.188,.043,.045),(-.20,.208,.030,.035),(-.235,.224,.036,.037),(-.267,.23,.043,.037),(-.295,.224,.036,.030),(-.32,.212,.021,.019),(-.33,.207,.012,.011)]
def bodyweights(p,j):
 if j<5:return 'Body'
 if j==5:return {'Body':.7,'Neck':.3}
 if j==6:return {'Body':.25,'Neck':.75}
 if j==7:return {'Neck':.6,'Head':.4}
 return 'Head'
def bodycolor(p,a,j):return mix(P['black'],P['green'],max(0,sin(a))*.35) if j<7 else P['black']
loft(bodyrings,bodyweights,bodycolor)
# Bill: long, narrow, slightly concave dorsal line, terminal hook; distinct mandible seam.
loft([(-.315,.212,.020,.014),(-.35,.210,.017,.011),(-.395,.208,.012,.009),(-.445,.210,.009,.008),(-.475,.212,.009,.008),(-.493,.206,.007,.011),(-.500,.193,.003,.009),(-.497,.186,.0008,.001)],'Head',P['bill'],'bill',14)
loft([(-.317,.197,.016,.006),(-.365,.195,.012,.004),(-.417,.198,.009,.003),(-.468,.202,.004,.002)],'Jaw',P['billtip'],'bill',12)
for s in [-1,1]:
 # Eyes set into the lateral skull; a thin orbital ring, no white sclera.
 ell((s*.039,-.278,.236),(.0024,.008,.008),'Head',P['ring'],'ring')
 ell((s*.041,-.280,.237),(.002,.0057,.0058),'Head',P['eye'],'eye')
 ell((s*.0426,-.282,.239),(.0005,.0011,.0011),'Head',rgb('8c9b9d'),'glint',8,5)
 tube([(s*.014,-.337,.214),(s*.010,-.372,.213)],[.001,.0006],'Head',P['dark'],'nostril',5)

# A real folded gular patch in ordinary flight. Inflation is a dedicated deform bone.
ell((0,-.165,.143),(.025,.047,.018),'Gular',P['red'],'gular',24,14)

# Primary lifting surface: continuous cambered skin and tapered overlapping remiges.
XS=[.055,.16,.30,.42,.54,.66,.82,.98,1.10]
LE=[-.075,-.025,.045,-.065,-.145,-.095,.015,.13,.235]
TE=[.145,.205,.235,.205,.145,.185,.25,.285,.237]
def wingweight(x,side):
 if x<.08:return {'Body':.20,'Shoulder'+side:.8}
 if x<.25:return 'Shoulder'+side
 if x<.35:
  t=(x-.25)/.10;return {'Shoulder'+side:1-t,'Elbow'+side:t}
 if x<.49:return 'Elbow'+side
 if x<.59:
  t=(x-.49)/.1;return {'Elbow'+side:1-t,'Wrist'+side:t}
 return 'Wrist'+side
def interp(x,vals):
 for i in range(len(XS)-1):
  if x<=XS[i+1]:t=(x-XS[i])/(XS[i+1]-XS[i]);return vals[i]*(1-t)+vals[i+1]*t
 return vals[-1]
for s in [-1,1]:
 side='L' if s==1 else 'R';start=len(V)
 for lower in [False,True]:
  for j,x in enumerate(XS):
   for k in range(5):
    u=k/4;z=.175+(.014*sin(pi*u) if not lower else -.006*sin(pi*u))+.012*(x/.54 if x<.54 else (1.1-x)/.56)
    p=(s*x,LE[j]*(1-u*.72)+TE[j]*u*.72,z)
    col=mix(P['black'],P['bronze'],.30*sin(pi*u)) if not lower else P['dark']
    vert(p,col,wingweight(x,side),'wing')
 layer=len(XS)*5
 for lower in [0,1]:
  for j in range(len(XS)-1):
   for k in range(4):
    a=start+lower*layer+j*5+k;q=(a,a+5,a+6,a+1)
    F.append(q if (s==1)^bool(lower) else tuple(reversed(q)))
 for k in [0,4]:
  for j in range(len(XS)-1):
   a=start+j*5+k;F.append((a,a+layer,a+layer+5,a+5))
 # Secondary feathers form the trailing scallop, each width overlaps its neighbours.
 for j in range(15):
  x=.09+j*.031;lead=interp(x,LE);trail=interp(x,TE)
  feather((s*x,lead+.045,.199),(s*(x+.018),trail+.018,.184),.028,wingweight(x,side),mix(P['feather'],P['bronze'],.13),'secondary')
 # Long primary tips converge into the swept narrow hand; no broad eagle fingers.
 for j in range(10):
  t=j/9;x=.53+t*.16
  tipx=.62+t*.48;tipy=.25+.09*sin(pi*t)-.015*t
  feather((s*x,-.10+.06*t,.201),(s*tipx,tipy,.184),.041*(1-.3*t),'Primary'+side+str(j),mix(P['dark'],P['feather'],.40),'primary')
 # Two staggered rows of coverts with restrained brown panels.
 for row in range(2):
  for j in range(14):
   x=.10+j*.034;lead=interp(x,LE)
   y=lead+.018+row*.045
   feather((s*x,y,.207+row*.002),(s*(x+.018),y+.079,.204),.020,wingweight(x,side),mix(P['feather'],P['bronze'],.25 if row else .10),'covert',.001)
 # Scapulars tuck the wing smoothly into the back.
 for j in range(6):
  feather((s*(.028+j*.008),-.08+j*.018,.215-j*.003),(s*(.065+j*.008),.12+j*.012,.185),.019,'Body',mix(P['black'],P['green'],.28),'scapular')

# Deeply forked tail: twelve narrow graduated feathers, independently steerable halves.
for s in [-1,1]:
 side='L' if s==1 else 'R'
 for j in range(6):
  t=j/5
  feather((s*(.005+.006*j),.16,.145),(s*(.025+.108*t),.32+.30*t,.133-.01*t),.018-.004*t,'Tail'+side,mix(P['black'],P['feather'],.15+.12*t),'tail',.002)

# Very short tarsi and small totipalmate feet: three forward digits and a rear hallux.
for s in [-1,1]:
 side='L' if s==1 else 'R';x=s*.036
 ell((x,.047,.091),(.022,.038,.025),'Leg'+side,P['black'],'leg',12,8)
 tube([(x,.06,.095),(x,.043,.050),(x,.028,.023)],[.009,.007,.005],'Leg'+side,P['foot'],'foot')
 bases=[]
 for j,dx in enumerate([-.018,0,.018]):
  b=(x,.025,.023);mid=(x+dx,.002,.013);end=(x+dx*1.1,-.017,.005)
  tube([b,mid,end],[.004,.003,.0018],'Foot'+side,P['foot'],'foot')
  tube([end,(end[0],end[1]-.005,.001),(end[0],end[1]-.006,-.003)],[.002,.0015,.0003],'Foot'+side,P['claw'],'claw')
  bases.append(mid)
 for j in range(2):F.append(tuple(vert(p,P['foot'],'Foot'+side,'web') for p in [(x,.025,.022),bases[j],bases[j+1]]))
 tube([(x,.026,.020),(x+s*.01,.052,.010),(x+s*.01,.058,.001)],[.004,.003,.001],'Foot'+side,P['foot'],'foot')

# Preserve charcoal plumage under the broad studio sky lighting on thin feather surfaces.
for i,c in enumerate(COL):
 if TAG[i] in ['wing','primary','secondary','covert','tail']:COL[i]=tuple(v*.22 for v in c[:3])+(1,)
# Editable geometry and rig. All bone local axes match world axes for predictable controls.
mesh=bpy.data.meshes.new('Frigatebird_GameTopology');mesh.from_pydata(V,[],F);mesh.update()
ob=bpy.data.objects.new('GreatFrigatebird_Male',mesh);scene.collection.objects.link(ob)
attr=mesh.color_attributes.new(name='Plumage',type='FLOAT_COLOR',domain='POINT')
for i,c in enumerate(COL):attr.data[i].color=c
for poly in mesh.polygons:poly.use_smooth=True
mat=bpy.data.materials.new('Frigatebird_VertexPlumage');mat.use_nodes=True
bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=.78;bs.inputs['Specular IOR Level'].default_value=.16
vc=mat.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='Plumage';mat.node_tree.links.new(vc.outputs['Color'],bs.inputs['Base Color'])
mat.diffuse_color=P['black'];mat.surface_render_method='DITHERED';mesh.materials.append(mat)
arm=bpy.data.armatures.new('Frigatebird_AnatomicalRig');rig=bpy.data.objects.new('Frigatebird_Rig',arm);scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
B={}
def bone(name,pos,parent=None):
 b=arm.edit_bones.new(name);b.head=pos;b.tail=Vector(pos)+Vector((0,.06,0));
 if parent:b.parent=B[parent]
 B[name]=b
bone('Root',(0,0,0));bone('Body',(0,0,.145),'Root');bone('Neck',(0,-.13,.18),'Body');bone('Head',(0,-.23,.22),'Neck');bone('Jaw',(0,-.31,.20),'Head');bone('Gular',(0,-.165,.143),'Neck')
bone('BillTip',(0,-.497,.186),'Head')
for s in [-1,1]:
 side='L' if s==1 else 'R'
 bone('Shoulder'+side,(s*.055,-.075,.175),'Body');bone('Elbow'+side,(s*.30,.045,.180),'Shoulder'+side);bone('Wrist'+side,(s*.54,-.145,.187),'Elbow'+side)
 for j in range(10):
  t=j/9;bone('Primary'+side+str(j),(s*(.53+t*.16),-.10+.06*t,.201),'Wrist'+side)
 bone('Tail'+side,(s*.018,.17,.145),'Body');bone('Leg'+side,(s*.036,.06,.095),'Body');bone('Foot'+side,(s*.036,.028,.023),'Leg'+side)
bpy.ops.object.mode_set(mode='OBJECT')
for name in B:ob.vertex_groups.new(name=name)
for i,weights in enumerate(W):
 for name,weight in weights.items():
  if weight>0:ob.vertex_groups[name].add([i],weight,'REPLACE')
mod=ob.modifiers.new('Anatomical skin','ARMATURE');mod.object=rig
rig.show_in_front=True;arm.display_type='OCTAHEDRAL'
for p in rig.pose.bones:p.rotation_mode='XYZ'
CLIPS=[('Flight_Soar',4),('Flight_Glide',3),('Flight_DeepFlaps',1.1),('Flight_BankLeft',2),('Flight_BankRight',2),('Feed_SurfaceSnatch',1.6),('Flight_Recovery',2.2),('Perch_Takeoff',2.2),('Perch_Landing',2.4),('Perch_Idle',4),('Perch_Alert',3),('Perch_Preen',4),('Perch_WingSettle',2),('Male_PouchInflate',3),('Male_Courtship',4)]
def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
def pose(name,u):
 fold=0;flap=0;lag=0;tip=0;spread=.08;body=0;headx=0;headz=0;bank=0;pouch=0;legs=1
 wave=sin(2*pi*u)
 if name=='Flight_Soar':flap=.06+.025*wave;tip=-.05+.025*sin(2*pi*u+.5);spread=-.22+.025*wave;headz=.10*wave
 if name=='Flight_Glide':flap=.03;tip=-.09;spread=-.25;headx=.06*sin(2*pi*u)
 if name in ['Flight_DeepFlaps','Flight_Recovery']:
  cyc=u if name=='Flight_DeepFlaps' else 2*u
  flap=.52*sin(2*pi*cyc);lag=.16*sin(2*pi*cyc-.7);tip=.16*sin(2*pi*cyc-1.1);spread=.14
 if name.startswith('Flight_Bank'):
  bank=(1 if name.endswith('Left') else -1)*.12*sin(pi*u)**2;flap=.06;tip=-.08;spread=.22
 if name=='Feed_SurfaceSnatch':
  v=sin(pi*u)**4;headx=.68*v;spread=.24*v;flap=.09;tip=-.08;body=.08*v
  rig.pose.bones['Jaw'].rotation_euler.x=.19*v
 if name.startswith('Perch_') or name.startswith('Male_'):
  fold=1;body=-.48;headx=.20;legs=0;spread=-.20
 if name=='Perch_Takeoff':
  fold=1-smooth(u/.35);body=-.48*(1-smooth(u/.55));headx=.2*(1-u);legs=smooth((u-.25)/.45)
  flap=.55*sin(2*pi*2*u)*smooth(u/.3);lag=.14*sin(4*pi*u-.7);tip=.13*sin(4*pi*u-1)
 if name=='Perch_Landing':
  fold=smooth((u-.55)/.45);body=-.48*smooth(u);legs=1-smooth(u/.45);spread=.30*sin(pi*u)
  flap=.42*sin(4*pi*u)*(1-smooth((u-.5)/.5));tip=.14*sin(4*pi*u-.5)*(1-fold)
 if name=='Perch_Idle':headz=.13*wave;body+=.006*wave
 if name=='Perch_Alert':headz=.65*wave;headx+=.13*sin(4*pi*u)
 if name=='Perch_Preen':headz=1.4*sin(pi*u)**2;headx=.8*sin(pi*u)**2;fold=1-.07*sin(pi*u)**2
 if name=='Perch_WingSettle':fold=1-.3*sin(pi*u)**2;spread=.15*sin(pi*u)**2
 if name=='Male_PouchInflate':pouch=smooth(u);headx=-.13*smooth(u)
 if name=='Male_Courtship':pouch=.96+.04*wave;fold=.60;flap=.045*sin(12*pi*u);headx=-.30+.035*wave;headz=.10*wave
 rig.pose.bones['Body'].rotation_euler.x=body
 rig.pose.bones['Neck'].rotation_euler.x=headx*.35
 rig.pose.bones['Head'].rotation_euler=(headx*.65,0,headz)
 rig.pose.bones['Gular'].scale=(1+2.5*pouch,1+.9*pouch,1+4.5*pouch)
 rig.pose.bones['Gular'].location=(0,-.005*pouch,-.04*pouch)
 for s in [-1,1]:
  side='L' if s==1 else 'R'
  rig.pose.bones['Shoulder'+side].rotation_euler=(0,-s*(flap+.07*fold)+bank,s*.92*fold)
  rig.pose.bones['Elbow'+side].rotation_euler=(0,-s*lag,-s*2.0*fold)
  q=Euler((0,-s*tip,s*2.0*fold)).to_quaternion() @ Quaternion(Vector((s*.56,.38,0)).normalized(),-s*1.15*fold)
  rig.pose.bones['Wrist'+side].rotation_euler=q.to_euler()
  for j in range(10):
   t=j/9;dx=(.62+t*.48)-(.53+t*.16);dy=(.25+.09*sin(pi*t)-.015*t)-(-.10+.06*t)
   rig.pose.bones['Primary'+side+str(j)].rotation_euler.z=s*(math.atan2(.38,.56)-math.atan2(dy,dx))*fold
  rig.pose.bones['Tail'+side].rotation_euler=(.04*wave if name=='Flight_Soar' else 0,bank*.5,-s*spread)
  rig.pose.bones['Leg'+side].rotation_euler.x=-.85*legs
  rig.pose.bones['Foot'+side].rotation_euler.x=-.4*legs
 # Baked world-space foot hold for all stationary perch actions, not moving flight transitions.
 if (name.startswith('Perch_') and name not in ['Perch_Takeoff','Perch_Landing']) or name.startswith('Male_'):
  bpy.context.view_layer.update()
  for side in ['L','R']:
   p=rig.pose.bones['Foot'+side];p.matrix=p.bone.matrix_local
rig.animation_data_create()
for name,dur in CLIPS:
 act=bpy.data.actions.new(name);rig.animation_data.action=act
 for f in range(round(dur*30)+1):
  scene.frame_set(f+1)
  for p in rig.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0);p.scale=(1,1,1)
  pose(name,f/(dur*30))
  for p in rig.pose.bones:
   for prop in ['rotation_euler','location','scale']:p.keyframe_insert(prop,frame=f+1,group=p.name)
 act.use_fake_user=True
 tr=rig.animation_data.nla_tracks.new();tr.name=name;tr.strips.new(name,1,act);tr.mute=True
rig.animation_data.action=None
def variantcolor(i,variant):
 c=COL[i];p=V[i];tag=TAG[i]
 if variant=='male':return c
 if tag in ['wing','covert','scapular','secondary']:c=mix(c,P['bronze'],.18)
 if tag=='ring':c=rgb('a75661') if variant=='female' else rgb('84969c')
 if tag=='body':
  y=p[1];z=p[2]
  if variant=='female':
   # White breast bounded within the torso, no white axillary spurs.
   if -.21<y<.04 and z<.165:c=mix(P['white'],c,max(0,min(1,(z-.135)/.030)))
   if -.28<y<-.21 and z<.21:c=mix(c,P['white'],.32)
  else:
   if y<-.18:c=mix(P['white'],P['buff'],max(0,min(1,(z-.20)/.035))*.85)
   elif y<.06 and z<.17:c=P['white']
 if tag=='gular':c=P['white'] if variant=='juvenile' else P['black']
 return c
variants={}
for variant in ['male','female','juvenile']:
 if variant!='male':
  for tr in list(rig.animation_data.nla_tracks):
   if tr.name.startswith('Male_'):rig.animation_data.nla_tracks.remove(tr)
  vm=bpy.data.meshes.new('Frigatebird_'+variant+'_Topology');vm.from_pydata(V,[],[f for f in F if TAG[f[0]]!='gular']);vm.update();vm.materials.append(mat)
  for poly in vm.polygons:poly.use_smooth=True
  ob.data=vm;attr=vm.color_attributes.new(name='Plumage',type='FLOAT_COLOR',domain='POINT')
  for name in B:
   if name not in ob.vertex_groups:ob.vertex_groups.new(name=name)
  for i,weights in enumerate(W):
   for name,weight in weights.items():
    if weight>0:ob.vertex_groups[name].add([i],weight,'REPLACE')
 for i in range(len(V)):attr.data[i].color=variantcolor(i,variant)
 ob.name='GreatFrigatebird_'+variant.title()
 bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
 for tr in rig.animation_data.nla_tracks:tr.mute=tr.name.startswith('Male_') and variant!='male'
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'great_frigatebird_'+variant+'.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_skins=True,export_yup=True,export_materials='EXPORT',export_all_vertex_colors=True)
 for tr in rig.animation_data.nla_tracks:tr.mute=True
 if variant!='male':
  copy=ob.copy();copy.data=ob.data.copy();scene.collection.objects.link(copy);copy.name='GreatFrigatebird_'+variant.title();copy.hide_render=True;copy.hide_set(True);variants[variant]=copy
ob.data=mesh;attr=mesh.color_attributes['Plumage']
for name in B:
 if name not in ob.vertex_groups:ob.vertex_groups.new(name=name)
for i,c in enumerate(COL):attr.data[i].color=c
ob.name='GreatFrigatebird_Male';variants['male']=ob
for name,dur in CLIPS:
 if name.startswith('Male_'):
  tr=rig.animation_data.nla_tracks.new();tr.name=name;tr.strips.new(name,1,bpy.data.actions[name]);tr.mute=True

# Controlled studio lighting, pale background and contact branch. Source includes review cameras.
studio=bpy.data.collections.new('Review_Studio');scene.collection.children.link(studio)
def studio_obj(o):
 for c in list(o.users_collection):c.objects.unlink(o)
 studio.objects.link(o)
def material(name,color,rough=.7):
 m=bpy.data.materials.new(name);m.diffuse_color=rgb(color);m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=rgb(color);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=rough;return m
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.40));floor=bpy.context.object;studio_obj(floor);floor.data.materials.append(material('Warm grey studio','b6bdbe'))
bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.017,depth=.7,location=(0,.015,-.015),rotation=(0,pi/2,0));branch=bpy.context.object;branch.name='Perch_reference';studio_obj(branch);branch.data.materials.append(material('Weathered branch','6b6254'))
scene.world=bpy.data.worlds.new('StudioWorld');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.34,.40,.47,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.4
for loc,power,size in [((-2,-3,4),400,4),((3,-1,2),180,3),((0,3,3),550,3)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;studio_obj(o);o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,.1))-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
def render(name,loc,clip='Flight_Soar',frame=1,variant='male',scale=2.65,target=(0,.02,.12)):
 for k,o in variants.items():o.hide_render=k!=variant;o.hide_set(k!=variant)
 branch.hide_render=clip.startswith('Flight') or clip.startswith('Feed');floor.location.z=-.4 if branch.hide_render else -.16
 floor.hide_render=branch.hide_render
 rig.animation_data.action=bpy.data.actions[clip];scene.frame_set(frame)
 bpy.ops.object.camera_add(location=loc);cam=bpy.context.object;cam.name='Camera_'+name;studio_obj(cam);cam.data.type='ORTHO';cam.data.ortho_scale=scale;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();scene.camera=cam
 scene.render.filepath=os.path.join(OUT,name+'.png');bpy.ops.render.render(write_still=True)
render('frigatebird_hero',(1.7,-2.7,2.1))
render('frigatebird_dorsal',(0,0,4),scale=2.65)
render('frigatebird_front',(0,-4,.50),scale=2.65)
render('frigatebird_side',(3,-.3,.75),'Perch_Idle',1,scale=1.3)
render('frigatebird_female',(.7,-3,-1),variant='female',scale=2.65)
render('frigatebird_juvenile',(2,-3,1),'Perch_Idle',1,'juvenile',1.3)
render('frigatebird_display',(1.5,-3,1.0),'Male_Courtship',18,scale=1.7)
for k,o in variants.items():o.hide_render=k!='male';o.hide_set(k!='male')
rig.animation_data.action=bpy.data.actions['Flight_Soar'];scene.frame_set(1);scene.camera=bpy.data.objects['Camera_frigatebird_hero'];branch.hide_render=True;floor.location.z=-.4
scene.frame_end=120
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
rig['species']='Fregata minor';rig['axes']='Blender Z-up / -Y-forward; glTF Y-up / +Z-forward';rig['notes']='Flight bind pose. Root movement supplied by game. Male pouch stays folded outside display. Female 1.08 game scale, juvenile 0.96.'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'Paradise_Island_Great_Frigatebird.blend'))
report={'vertices':len(V),'polygons':len(F),'bones':len(arm.bones),'clips':[{'name':n,'seconds':d} for n,d in CLIPS],'variants':['male','female','juvenile'],'spanMetres':2.2,'lengthMetres':1.12,'materials':1}
with open(os.path.join(OUT,'model_report.json'),'w') as f:json.dump(report,f,indent=2)
print('FRIGATEBIRD_BUILD_COMPLETE',json.dumps(report))
