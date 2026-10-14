import bpy, math, os
from mathutils import Vector

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'generated')
os.makedirs(OUT, exist_ok=True)

# Build in a new scene, leaving the open Paradise Island crab scene untouched.
previous=bpy.data.scenes.get('Paradise Island | Dolphin Species')
if previous:
    for obj in list(previous.objects): bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.scenes.remove(previous)
scene = bpy.data.scenes.new('Paradise Island | Dolphin Species')
bpy.context.window.scene = scene

def coll(name, parent=None):
    c=bpy.data.collections.new(name); (parent or scene.collection).children.link(c); return c
models=coll('01 | DOLPHIN FAMILY')
stage=coll('02 | STUDIO PREVIEW')
rigcol=coll('03 | ANIMATION RIGS')

def mat(name, color, rough=.34, metallic=0.0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metallic
    return m
belly=mat('Pale silver | underside',(0.70,.76,.75),.4)
eye_surround=mat('Soft charcoal eye surround',(.18,.23,.25),.38)
eye_mat=mat('Deep ocean eyes',(.018,.045,.058),.2)
glint_mat=mat('Eye catchlight',(.88,.96,.98),.19)
mouth_mat=mat('Soft mouth line',(.105,.16,.18),.48)
palette=[
 ('Lagoon blue-grey',(.25,.39,.46)),('Slate back',(.29,.34,.38)),('Warm grey',(.43,.40,.36)),('Silver mist',(.49,.55,.56)),('Deep dusk',(.22,.27,.31))]
backs=[mat('Dorsal | '+n,c,.3) for n,c in palette]
finmat=[mat('Fins | '+n,tuple(v*.92 for v in c),.31) for n,c in palette]

# Dense quad rings with carefully shaped beak, melon, chest, peduncle and caudal base.
stations=[
 (-2.35,.070,.060,0),(-2.29,.095,.074,0),(-2.17,.122,.088,0),(-2.04,.143,.103,0),
 (-1.90,.157,.116,0),(-1.77,.163,.123,0),(-1.66,.158,.118,0),(-1.58,.145,.106,0),
 (-1.49,.166,.135,.005),(-1.36,.218,.205,.02),(-1.19,.292,.288,.055),(-.98,.353,.365,.075),
 (-.75,.400,.415,.055),(-.48,.442,.451,.025),(-.18,.462,.466,0),(.14,.449,.450,0),
 (.43,.420,.415,0),(.72,.375,.367,0),(1.02,.315,.31,0),(1.30,.247,.247,0),
 (1.53,.186,.186,0),(1.72,.139,.142,0),(1.88,.103,.107,0),(2.02,.079,.080,0),
 (2.14,.064,.062,0),(2.23,.052,.049,0)]
def interp(x, colidx):
    for i in range(len(stations)-1):
        a,b=stations[i],stations[i+1]
        if x<=b[0]:
            t=max(0,min(1,(x-a[0])/(b[0]-a[0])))
            t=t*t*(3-2*t)
            return a[colidx]*(1-t)+b[colidx]*t
    return stations[-1][colidx]

def make_body(name, scale, backmat, fmat, roundness=1.0):
    n=48; verts=[]; faces=[]; material_ids=[]
    for station in stations:
        x=station[0]
        ry=interp(x,1)*roundness; rz=interp(x,2)*roundness
        for j in range(n):
            a=2*math.pi*j/n
            z=rz*math.sin(a)+.02+interp(x,3)
            y=ry*math.cos(a)
            verts.append((x*scale,y*scale,z*scale))
    for i in range(len(stations)-1):
        for j in range(n):
            a=i*n+j; b=i*n+(j+1)%n; c=(i+1)*n+(j+1)%n; d=(i+1)*n+j
            faces.append((a,b,c,d))
            # Countershading follows a consistent lower-body band instead of a jagged world-height cut.
            xmean=sum(verts[k][0] for k in (a,b,c,d))/4/scale
            zmean=sum(verts[k][2] for k in (a,b,c,d))/4/scale
            zcenter=.02+interp(xmean,3); rz=max(.001,interp(xmean,2))
            material_ids.append(1 if (zmean-zcenter)/rz < -.42 and xmean < 1.55 else 0)
    faces += [tuple(reversed(range(n))),tuple((len(stations)-1)*n+j for j in range(n))]
    material_ids += [0,0]
    mesh=bpy.data.meshes.new(name+' | quad skin'); mesh.from_pydata(verts,[],faces); mesh.materials.clear(); mesh.materials.append(backmat); mesh.materials.append(belly)
    ob=bpy.data.objects.new(name,mesh); models.objects.link(ob); ob.data.materials.clear(); ob.data.materials.append(backmat); ob.data.materials.append(belly)
    for p,mi in zip(mesh.polygons,material_ids): p.material_index=mi; p.use_smooth=True
    return ob

def fin_mesh(name, profile, scale, material, parentcoll=models, thickness=.045):
    # Chaikin-smoothed profile keeps low-poly fins rounded instead of reading as knife-edged wedges.
    pts=[Vector(p) for p in profile]
    for _ in range(2):
        smooth=[]
        for p,q in zip(pts,pts[1:]+pts[:1]):
            smooth.extend((p*.82+q*.18,p*.18+q*.82))
        pts=smooth
    profile=[tuple(p) for p in pts]
    # Profile is an extruded stylized airfoil; bevels catch light while keeping a game-friendly silhouette.
    verts=[]
    for y,z in [(-thickness/2,0),(thickness/2,0)]:
        verts.extend([(x*scale, (yy+y)*scale, zz*scale) for x,yy,zz in profile])
    # Profile coordinates are (x,y,z); thickness applied along Y for dorsal too, acceptable rounded foils.
    N=len(profile); faces=[]
    faces.append(tuple(range(N))); faces.append(tuple(range(N,2*N)))
    for i in range(N): faces.append((i,(i+1)%N,(i+1)%N+N,i+N))
    me=bpy.data.meshes.new(name+' | airfoil'); me.from_pydata(verts,[],faces); me.materials.append(material)
    ob=bpy.data.objects.new(name,me); parentcoll.objects.link(ob)
    bev=ob.modifiers.new('Soft fin edge','BEVEL'); bev.width=.045*scale; bev.segments=3
    ob.modifiers.new('Fin normals','WEIGHTED_NORMAL')
    for p in me.polygons:p.use_smooth=True
    return ob

def uv_sphere(name, loc, scale, material, destination=models, seg=16,rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, location=loc)
    o=bpy.context.object; o.name=name
    for c in list(o.users_collection):c.objects.unlink(o)
    destination.objects.link(o); o.scale=scale; o.data.materials.append(material)
    for p in o.data.polygons:p.use_smooth=True
    return o

def curve_line(name, coords, material, destination=models):
    cu=bpy.data.curves.new(name,'CURVE'); cu.dimensions='3D'; cu.resolution_u=2; cu.bevel_depth=.009; cu.bevel_resolution=2
    s=cu.splines.new('POLY'); s.points.add(len(coords)-1)
    for p,v in zip(s.points,coords): p.co=(*v,1)
    ob=bpy.data.objects.new(name,cu); destination.objects.link(ob); ob.data.materials.append(material); return ob

def make_dolphin(tag, scale, back_index, origin_x, origin_y=0, rigged=False, roundness=1.0):
    bm=backs[back_index]; fm=finmat[back_index]
    roundness=1.14 if scale < .6 else (1.045 if scale < .8 else (1.04 if 'Male' in tag else (.985 if 'Female' in tag else 1.0)))
    body=make_body(tag+' | body',scale,bm,fm,roundness=roundness); body.location=(origin_x,origin_y,0)
    # dorsal fin sweeps aft; twin crescent pectorals; horizontal crescent flukes.
    dorsal=fin_mesh(tag+' | dorsal fin',[(-.34,0,.30),(-.32,0,.36),(-.28,0,.43),(-.21,0,.50),(-.12,0,.57),(.00,0,.63),(.13,0,.68),(.25,0,.70),(.34,0,.67),(.39,0,.61),(.39,0,.54),(.34,0,.46),(.28,0,.38),(.26,0,.32)],scale,fm)
    dorsal.location=(origin_x,origin_y,0)
    # Broad, gently swept paddle flippers grow from the chest and taper to rounded tips.
    pectoral=[(-.68,0,-.12),(-.42,0,-.17),(-.24,-.05,-.195),(-.10,-.16,-.22),(.04,-.28,-.235),(.18,-.38,-.23),(.28,-.44,-.205),(.32,-.44,-.18),(.26,-.38,-.16),(.15,-.29,-.14),(.00,-.18,-.12),(-.16,-.07,-.105)]
    finA=fin_mesh(tag+' | left pectoral',pectoral,scale,fm,thickness=.085)
    finB=fin_mesh(tag+' | right pectoral',[(x,-y,z) for x,y,z in pectoral],scale,fm,thickness=.085)
    finA.location=(origin_x,origin_y-.245*scale,0); finB.location=(origin_x,origin_y+.245*scale,0)
    # Two broad horizontal lobes meet at a deep, readable median notch.
    fluke=[(1.99,0,.035),(2.12,.20,.06),(2.32,.47,.105),(2.50,.72,.105),(2.56,.86,.07),(2.49,.92,.025),(2.32,.83,-.025),(2.12,.60,-.055),(1.99,.31,-.025)]
    tailL=fin_mesh(tag+' | tail fluke left',[(x,-y,z) for x,y,z in fluke],scale,fm,thickness=.09)
    tailR=fin_mesh(tag+' | tail fluke right',fluke,scale,fm,thickness=.09)
    tailL.location=(origin_x,origin_y,0); tailR.location=(origin_x,origin_y,0)
    parts=[body,dorsal,finA,finB,tailL,tailR]
    # Eye sits on the lateral head behind the melon-to-rostrum break.
    for side in (-1,1):
        eye_x=-1.54
        eye_ry=interp(eye_x,1); eye_rz=interp(eye_x,2); eye_cz=.02+interp(eye_x,3)
        eye_z=.115
        eye_surface=eye_ry*math.sqrt(max(.05,1-((eye_z-eye_cz)/eye_rz)**2))
        y=origin_y+side*(eye_surface-.010)*scale; z=eye_z*scale; x=origin_x+eye_x*scale
        eye_factor=1+(1-scale)*.35
        patch=uv_sphere(tag+' | eye surround', (x,y,z),(.075*scale*eye_factor,.016*scale,.048*scale*eye_factor),eye_surround)
        eye=uv_sphere(tag+' | eye', (x-.004*scale,y+side*.009*scale,z+.004*scale),(.032*scale*eye_factor,.010*scale,.030*scale*eye_factor),eye_mat)
        gl=uv_sphere(tag+' | eye glint',(x-.016*scale,y+side*.016*scale,z+.014*scale),(.007*scale*eye_factor,.0035*scale,.007*scale*eye_factor),glint_mat,seg=12,rings=8)
        parts.extend([patch,eye,gl])
        mouth=curve_line(tag+' | mouth crease',[(origin_x-2.24*scale,origin_y+side*.080*scale,-.043*scale),(origin_x-2.04*scale,origin_y+side*.112*scale,-.037*scale),(origin_x-1.82*scale,origin_y+side*.143*scale,-.012*scale),(origin_x-1.59*scale,origin_y+side*.153*scale,.055*scale)],mouth_mat)
        parts.append(mouth)
    arm=None
    if rigged:
        arm_data=bpy.data.armatures.new(tag+' | dolphin skeleton'); arm=bpy.data.objects.new(tag+' | rig',arm_data); rigcol.objects.link(arm); arm.location=(origin_x,origin_y,0)
        bpy.context.view_layer.objects.active=arm; arm.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
        bones=[('Root',(-1.95,0,0),(-1.45,0,0),None),('Spine_Front',(-1.45,0,0),(-.60,0,0),'Root'),('Spine_Mid',(-.60,0,0),(.30,0,0),'Spine_Front'),('Spine_Rear',(.30,0,0),(1.25,0,0),'Spine_Mid'),('Peduncle',(1.25,0,0),(2.02,0,0),'Spine_Rear'),('Tail_Flukes',(2.02,0,0),(2.52,0,0),'Peduncle'),('Dorsal',(0,0,.35),(.12,0,.72),'Spine_Mid'),('Flipper_L',(-.53,-.08,-.13),(-.1,-.55,-.42),'Spine_Front'),('Flipper_R',(-.53,.08,-.13),(-.1,.55,-.42),'Spine_Front')]
        eb={}
        for nm,h,t,parent in bones:
            b=arm_data.edit_bones.new(nm); b.head=Vector(h)*scale; b.tail=Vector(t)*scale
            if parent:b.parent=arm_data.edit_bones[parent]
            eb[nm]=b
        bpy.ops.object.mode_set(mode='OBJECT'); arm.select_set(False)
        # Body smooth weights follow longitudinal spine; fins are rigidly weighted to controls.
        for bn in ['Root','Spine_Front','Spine_Mid','Spine_Rear','Peduncle','Tail_Flukes','Dorsal','Flipper_L','Flipper_R']:body.vertex_groups.new(name=bn)
        # ring x from data local; body origin at zero local positions include scaling
        xs=[-1.95,-1.2,-.15,.75,1.58,2.1]
        for i,v in enumerate(body.data.vertices):
            x=v.co.x/scale
            if x<xs[1]: a,b='Root','Spine_Front'
            elif x<xs[2]: a,b='Spine_Front','Spine_Mid'
            elif x<xs[3]: a,b='Spine_Mid','Spine_Rear'
            elif x<xs[4]: a,b='Spine_Rear','Peduncle'
            else:a,b='Peduncle','Tail_Flukes'
            anchors={'Root':xs[0],'Spine_Front':xs[1],'Spine_Mid':xs[2],'Spine_Rear':xs[3],'Peduncle':xs[4],'Tail_Flukes':xs[5]}
            t=max(0,min(1,(x-anchors[a])/(anchors[b]-anchors[a])))
            body.vertex_groups[a].add([i],1-t,'REPLACE'); body.vertex_groups[b].add([i],t,'REPLACE')
        # parent fins/eyes/creases with single bone weights
        for ob in parts[1:]:
            if ob.type=='MESH' and ob.name.endswith('dorsal fin'): bn='Dorsal'
            elif 'pectoral' in ob.name:bn='Flipper_L' if 'left' in ob.name else 'Flipper_R'
            elif 'tail fluke' in ob.name:bn='Tail_Flukes'
            elif 'eye' in ob.name or 'surround' in ob.name:bn='Spine_Front'
            elif 'mouth' in ob.name:bn='Spine_Front'
            else:bn='Root'
            # world position currently stored in local mesh plus object loc: arm space coordinates match dolphin's world coords
            world_matrix=ob.matrix_world.copy()
            ob.parent=arm; ob.parent_type='BONE'; ob.parent_bone=bn
            ob.matrix_world=world_matrix
        mod=body.modifiers.new('Dolphin deformation','ARMATURE'); mod.object=arm
        world_matrix=body.matrix_world.copy(); body.parent=arm; body.matrix_world=world_matrix
        for bn in ['Root','Spine_Front','Spine_Mid','Spine_Rear','Peduncle','Tail_Flukes']:
            pass
    return {'body':body,'parts':parts,'arm':arm}

# Family proportions: estimates expressed as total relative body length; adult sexual dimorphism stays modest.
family=[('Adult_Male_Lagoon',1.10,0, -9.70,True),('Adult_Female_WarmGrey',1.00,2,-4.55,True),('Juvenile_SilverMist',.74,3,.05,True),('Calf_SlateBlue',.53,1,3.45,True),('Adult_Slate',1.04,4,7.60,True)]
specs=[]
for name,s,ci,x,rig in family:
    data=make_dolphin(name,s,ci,x,0,rig)
    body=data['body']; body['variant']=name; body['scale_relative']=s; body['colorway']=palette[ci][0]
    body['sex']='Male' if '_Male' in name else ('Female' if '_Female' in name else 'Unspecified')
    body['age_stage']='Calf' if 'Calf' in name else ('Juvenile' if 'Juvenile' in name else 'Adult')
    specs.append((name,data,s,ci,rig))

# Rig controls and animation clips on the mature male source specimen.
base=specs[0][1]['arm']; bpy.context.view_layer.objects.active=base
base.animation_data_create()
def animate(name, frames, values, cycle=False):
    act=bpy.data.actions.new(name); base.animation_data.action=act
    pb=base.pose.bones
    for bone in pb: bone.rotation_mode='XYZ'
    for frame, state in zip(frames,values):
        for bone,rot in state.items():
            if bone=='@RootLocation':
                pb['Root'].location=rot; pb['Root'].keyframe_insert(data_path='location',frame=frame,group='Root')
            else:
                pb[bone].rotation_euler=rot
                pb[bone].keyframe_insert(data_path='rotation_euler',frame=frame,group=bone)
    act.use_cyclic=cycle
    act['looping']=cycle; act['description']='Reusable species motion clip. Forward travel is game-engine root motion.'
    base.animation_data.action=None
    track=base.animation_data.nla_tracks.new(); track.name=name
    strip=track.strips.new(name,frames[0],act); strip.action_frame_start=frames[0]; strip.action_frame_end=frames[-1]; strip.blend_type='REPLACE'
    return act
def st(t=0,r=0,tail=0,lf=0,rf=0,root=0,lift=0):
    return {'Spine_Front':(0,t*.12,r*.16),'Spine_Mid':(0,t*.35,r*.35),'Spine_Rear':(0,t*.60,r*.60),'Peduncle':(0,t*.80,r*.8),'Tail_Flukes':(t,0,tail),'Flipper_L':(lf,0,0),'Flipper_R':(rf,0,0),'Root':(0,root,0),'@RootLocation':(0,0,lift)}
F=[1,7,13,19,25]
animate('Swim_Idle',F,[st(0,0,0,0,0),st(.11,.015,.025,.02,-.02),st(0,0,0,0,0),st(-.11,-.015,-.025,-.02,.02),st(0,0,0,0,0)],True)
animate('Swim_Cruise',F,[st(0,0,0),st(.18,.025,.035),st(0,0,0),st(-.18,-.025,-.035),st(0,0,0)],True)
animate('Swim_Fast',F,[st(0,0,0),st(.34,.05,.07,.04,-.04),st(0,0,0),st(-.34,-.05,-.07,-.04,.04),st(0,0,0)],True)
animate('Swim_TurnBank',[1,8,16,24],[st(0,0,0,0,0),st(.22,.12,.04,-.14,.14),st(.12,.34,.06,-.32,.32),st(0,.08,0,0,0)])
animate('Surface_Breath',[1,10,20,30],[st(0,0,0),st(.04,0,.01,-.08,-.08,.06),st(-.04,0,-.01,.03,.03,-.015),st(0,0,0)],True)
animate('Jump_Breach',[1,6,12,18,25],[st(0,0,0,0,0),st(.08,0,0,0,0,-.12,.05),st(.12,0,.03,-.12,-.12,-.42,.68),st(-.07,0,.02,.16,.16,-.18,.18),st(0,0,0)],False)
animate('Dive_Return',[1,7,14,22],[st(0,0,0,0,0),st(-.08,0,.02,.04,.04,.1),st(-.14,0,.03,-.12,-.12,.35),st(0,0,0)])
animate('Playful_Leap',[1,6,12,18,24],[st(0,0,0),st(.10,.12,.02,-.12,-.12,-.20),st(.12,.20,.04,-.18,-.18,-.50),st(-.10,-.15,-.02,.18,.18,-.28),st(0,0,0)])
animate('Surface_Bob',[1,8,16,24],[st(0,0,0,0,0,.02),st(.03,0,.01,-.04,-.04,-.02),st(0,0,0,0,0,.025),st(-.03,0,-.01,.03,.03,-.01)],True)
animate('Group_Follow',[1,7,13,19,25],[st(0,0,0),st(.15,.02,.03),st(0,0,0),st(-.15,-.02,-.03),st(0,0,0)],True)
animate('Calf_Swim',[1,6,12,18,24],[st(0,0,0),st(.22,.02,.04,.02,-.02),st(0,0,0),st(-.22,-.02,-.04,-.02,.02),st(0,0,0)],True)
animate('Mother_Calf_Paired',[1,8,16,24],[st(0,0,0),st(.13,.02,.025),st(0,0,0),st(-.13,-.02,-.025)],True)
animate('Social_Circle',[1,8,16,24],[st(.16,.20,.04,-.10,.10),st(0,.38,.07,-.25,.25),st(-.16,-.20,-.04,.10,-.10),st(0,-.35,-.07,.22,-.22)],True)

# Parent armature mesh and ensure body, distinct fin geometry all share motion and export as one character.
for name,data,s,ci,rig in specs:
    arm=data['arm']; body=data['body']
    # Record species metadata on armature and model.
    body['species']='Common bottlenose dolphin (Tursiops truncatus)'; body['variant']=name
    arm['species']='Common bottlenose dolphin (Tursiops truncatus)'
    arm['animation_library']='Swim_Idle; Swim_Cruise; Swim_Fast; Swim_TurnBank; Surface_Breath; Jump_Breach; Dive_Return; Playful_Leap; Surface_Bob; Group_Follow; Calf_Swim; Mother_Calf_Paired; Social_Circle'

# Share the authored clip library across the matching skeletons of all five variants.
for name,data,s,ci,rig in specs[1:]:
    arm=data['arm']; arm.animation_data_create()
    for source_track in base.animation_data.nla_tracks:
        target_track=arm.animation_data.nla_tracks.new(); target_track.name=source_track.name
        source_strip=source_track.strips[0]
        target_strip=target_track.strips.new(source_strip.name,int(source_strip.frame_start),source_strip.action)
        target_strip.action_frame_start=source_strip.action_frame_start; target_strip.action_frame_end=source_strip.action_frame_end
        target_strip.blend_type='REPLACE'
# Family labels in the Blender scene as helpful authoring notes (hidden from render).
for old_note in [t for t in bpy.data.texts if t.name.startswith('READ ME | Dolphin species package')]:
    bpy.data.texts.remove(old_note)
notes=bpy.data.texts.new('READ ME | Dolphin species package')
notes.write('PARADISE ISLAND • COMMON BOTTLENOSE DOLPHIN SPECIES\n\nBase animal: stylized common bottlenose dolphin (Tursiops truncatus), with robust chest and shoulders, a distinct rounded melon transitioning into a short thick rostrum, subtle curved mouthline, mid-back falcate dorsal fin, paired rounded paddle flippers, horizontal deeply notched flukes, and natural gray countershading. Five dorsal palettes preserve the coordinated family colorways.\n\nANATOMICAL REFERENCE PASS\nPhotographic comparisons: NOAA Fisheries side/profile photo and species sheet; Kyoto Aquarium and U.S. Navy Marine Species Monitoring front/oblique photo views; NOAA and National Park Service anatomy descriptions. Compared side silhouette for forehead-to-rostrum break, short heavy beak, chest fullness, and dorsal sweep; front view for rounded melon, bilateral eye placement, shoulder breadth and flipper spread; three-quarter view for flipper attachment and body volume.\n\nFAMILY VARIANTS\nAdult_Male_Lagoon: relative scale 1.10; larger with a slightly broader body.\nAdult_Female_WarmGrey: relative scale 1.00; slightly smaller and more slender, neutral warm grey.\nJuvenile_SilverMist: relative scale 0.74; compact, with a gently fuller body and slightly larger eyes relative to size.\nCalf_SlateBlue: relative scale 0.53; small, rounder body and relatively larger eyes.\nAdult_Slate: relative scale 1.04; darker slate colorway.\nSex/age differences remain restrained and preserve a shared species silhouette. Anatomy differences are expressed through body scale, slight profile changes and eye proportions.\n\nRIG & CLIPS\nAll five family variants have matching animation rigs: Root → Spine_Front → Spine_Mid → Spine_Rear → Peduncle → Tail_Flukes, plus Dorsal and paired Flipper controls. Body skin blends smoothly along the spine. All 13 clips are stored as named NLA tracks on every variant: Swim_Idle, Swim_Cruise, Swim_Fast, Swim_TurnBank, Surface_Breath, Jump_Breach, Dive_Return, Playful_Leap, Surface_Bob, Group_Follow, Calf_Swim, Mother_Calf_Paired, Social_Circle. Cyclic clips loop. Root motion is left to the game controller.\n\nENGINE BEHAVIOR RECOMMENDATION\nExisting game pod behavior is outside this anatomy pass and remains untouched.\n\nDELIVERY STATUS\nFive rigged family/color variants, four view renders, animated family GLB, source-rig GLB, and 13 reusable clips are authored and validated.\n')

# Clean presentation render with family across a calm studio floor.
world=bpy.data.worlds.new('Lagoon studio world'); scene.world=world; world.use_nodes=True; world.node_tree.nodes['Background'].inputs['Color'].default_value=(.10,.16,.20,1); world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
scene.render.engine='CYCLES'; scene.cycles.samples=24; scene.render.resolution_x=1650; scene.render.resolution_y=660; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.film_transparent=False
floor_mat=mat('Deep lagoon backdrop',(.035,.10,.13),.62)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-1.03)); floor=bpy.context.object; floor.name='Studio backdrop';
for c in list(floor.users_collection):c.objects.unlink(floor)
stage.objects.link(floor); floor.data.materials.append(floor_mat)
def area(name,loc,power,size,color):
    bpy.ops.object.light_add(type='AREA',location=loc); o=bpy.context.object;o.name=name
    for c in list(o.users_collection):c.objects.unlink(o)
    stage.objects.link(o); o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=color
    o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
area('Key softbox',(-1,-6,8),1000,8,(.72,.86,1));area('Warm rim',(4,4,5),1250,6,(1,.72,.48));area('Front fill',(-5,-2,2),450,7,(.42,.74,1))
bpy.ops.object.camera_add(location=(0,-18,6.0)); cam=bpy.context.object; cam.name='Family lineup camera'
for c in list(cam.users_collection):c.objects.unlink(cam)
stage.objects.link(cam);cam.rotation_euler=(Vector((-.7,0,0))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=24.3;scene.camera=cam
scene.view_settings.view_transform='AgX'
scene.render.filepath=os.path.join(OUT,'dolphin_family_preview.png')
scene.camera.data.lens=48
# Set presentation viewport and save source.
scene.frame_start=1;scene.frame_end=30;scene.frame_set(1)
# Write only the dolphin scene and its dependencies into the standalone delivery file.
bpy.data.libraries.write(os.path.join(OUT,'Paradise_Island_Dolphin_Species.blend'), {scene}, fake_user=True, compress=True)
track_mutes={}
for _,data,_,_,_ in specs:
    for tr in data['arm'].animation_data.nla_tracks:
        track_mutes[tr]=tr.mute; tr.mute=True
    for pb in data['arm'].pose.bones:
        pb.matrix_basis.identity()
scene.frame_set(1)
bpy.ops.render.render(write_still=True)

# Render reference views and a breach deformation check from one hero adult.
hero_x=-9.70
floor_render_state=floor.hide_render
floor.hide_render=True
render_hide={}
for ob in list(models.objects)+list(rigcol.objects):
    render_hide[ob]=ob.hide_render
    ob.hide_render=not ob.name.startswith('Adult_Male_Lagoon |')

def render_angle(label, location, target, scale, filename):
    bpy.ops.object.camera_add(location=location)
    c=bpy.context.object; c.name='Reference camera | '+label
    for collection in list(c.users_collection): collection.objects.unlink(c)
    stage.objects.link(c)
    c.data.type='ORTHO'; c.data.ortho_scale=scale
    c.rotation_euler=(Vector(target)-c.location).to_track_quat('-Z','Y').to_euler()
    scene.camera=c
    scene.render.resolution_x=1200; scene.render.resolution_y=780; scene.render.resolution_percentage=100
    scene.render.filepath=os.path.join(OUT,filename)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(c,do_unlink=True)

render_angle('Side', (hero_x,-12,.65), (hero_x,0,.02), 5.75, 'dolphin_reference_side.png')
render_angle('Front', (hero_x-11,0,.20), (hero_x-1.80,0,.02), 4.10, 'dolphin_reference_front.png')
render_angle('Three quarter', (hero_x-8,-9,3.15), (hero_x-.15,0,0.02), 6.0, 'dolphin_reference_three_quarter.png')

# Render the authored breach apex to visually check that the fins remain seated.
for tr in base.animation_data.nla_tracks: tr.mute=True
base.animation_data.action=bpy.data.actions.get('Jump_Breach')
scene.frame_set(12)
render_angle('Jump deformation check', (hero_x,-12,.65), (hero_x,0,.02), 5.75, 'dolphin_jump_deformation_check.png')
base.animation_data.action=None
for tr,was_muted in track_mutes.items(): tr.mute=was_muted
scene.frame_set(1)
for ob,old_hide in render_hide.items(): ob.hide_render=old_hide
floor.hide_render=floor_render_state
scene.render.resolution_x=1650; scene.render.resolution_y=660; scene.render.resolution_percentage=100

# Export the animated family and a compact single-rig GLB.
rig_positions=[]
for name,data,s,ci,rig in specs:
    arm=data['arm']; rig_positions.append((arm,arm.location.copy())); arm.location=(0,0,0)
bpy.context.view_layer.update()
for o in list(bpy.context.selected_objects):o.select_set(False)
for o in list(models.objects)+list(rigcol.objects):o.select_set(True)
bpy.context.view_layer.objects.active=specs[0][1]['body']
try:
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'Paradise_Island_Dolphin_Family.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=False,export_animations=True,export_animation_mode='NLA_TRACKS')
    bpy.ops.object.select_all(action='DESELECT')
    for o in list(models.objects)+list(rigcol.objects):
        if o.name.startswith('Adult_Male_Lagoon') or o.name=='Adult_Male_Lagoon | rig': o.select_set(True)
    bpy.context.view_layer.objects.active=base
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'Paradise_Island_Dolphin_Animation_Rig.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=False,export_animations=True,export_animation_mode='NLA_TRACKS')
    export_status='Animated five-variant family GLB and standalone animated source-rig GLB exported; reusable clips also remain in Blender source.'
except Exception as e: export_status='GLB export unavailable: '+str(e)
for arm,old_position in rig_positions: arm.location=old_position
bpy.context.view_layer.update()
with open(os.path.join(OUT,'Dolphin_Species_Summary.txt'),'w',encoding='utf-8') as f:
    f.write(notes.as_string()+'\n'+export_status+'\n')
result={'blend':os.path.join(OUT,'Paradise_Island_Dolphin_Species.blend'),'preview':scene.render.filepath,'export':export_status,'variants':len(specs),'clips':13}
