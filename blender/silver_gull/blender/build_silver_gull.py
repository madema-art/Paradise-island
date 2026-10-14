import bpy, math, os, json
from mathutils import Vector

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(os.path.dirname(ROOT_DIR), 'generated')
os.makedirs(OUT_DIR, exist_ok=True)
TAU = math.tau

# Paradise Island gull: adult silver-gull form, metres, Z up, facing -Y.
# Low/moderate polygon game asset; smooth body shapes with readable feather groups.

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.armatures, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)

def mat(name, color, rough=0.82):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = rough
    return m

MATS = {
    'white': mat('Warm white plumage', (0.88,0.89,0.85)),
    'belly': mat('Underwing ivory', (0.92,0.92,0.88)),
    'gray': mat('Pale slate gray mantle', (0.43,0.52,0.56)),
    'winggray': mat('Wing gray', (0.48,0.56,0.59)),
    'black': mat('Charcoal primary tips', (0.045,0.052,0.057)),
    'mirror': mat('White primary mirrors', (0.92,0.91,0.85)),
    'billred': mat('Bill coral red', (0.78,0.075,0.085)),
    'eyering': mat('Eye ring orange red', (0.83,0.12,0.07)),
    'pink': mat('Legs coral red', (0.72,0.15,0.12)),
    'eye': mat('Iris pale silver', (0.73,0.74,0.68)),
    'pupil': mat('Pupil', (0.025,0.022,0.018)),
    'brown': mat('Juvenile feather brown', (0.27,0.22,0.18)),
    'tan': mat('Juvenile warm feather edges', (0.54,0.44,0.34)),
    'juvwing': mat('Juvenile muted brown gray wing', (0.39,0.34,0.29)),
    'juvenilewhite': mat('Juvenile pale feather edges', (0.72,0.68,0.59)),
    'darkbill': mat('Juvenile dark bill', (0.25,0.20,0.16)),
    'darkleg': mat('Juvenile gray pink legs', (0.42,0.30,0.27)),
}

def smooth(obj):
    if obj.type == 'MESH':
        for p in obj.data.polygons: p.use_smooth = True

def uv(name, loc, scale, material, collection, seg=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, location=loc)
    ob = bpy.context.object; ob.name = name
    ob.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ob.data.materials.append(material); smooth(ob)
    for c in list(ob.users_collection): c.objects.unlink(ob)
    collection.objects.link(ob)
    return ob

def mesh_obj(name, verts, faces, material, collection):
    me = bpy.data.meshes.new(name + 'Mesh'); me.from_pydata(verts, [], faces); me.update()
    ob = bpy.data.objects.new(name, me); collection.objects.link(ob); ob.data.materials.append(material); smooth(ob)
    return ob

def loft_body(name, sections, material, collection, sides=24):
    # section rows: y, center_z, half_width, half_height
    verts=[]; faces=[]
    for y,cz,rx,rz in sections:
        for j in range(sides):
            a=TAU*j/sides
            verts.append((rx*math.cos(a), y, cz+rz*math.sin(a)))
    for i in range(len(sections)-1):
        for j in range(sides):
            a=i*sides+j; b=i*sides+(j+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.append(tuple(range(sides-1,-1,-1)))
    faces.append(tuple((len(sections)-1)*sides+j for j in range(sides)))
    return mesh_obj(name, verts, faces, material, collection)

def wing_surface(name, side, x0, x1, material, collection, upper=True, chord_scale=1.0, sections=12):
    # Spanwise cambered, swept gull wing from shoulder to outer hand.
    verts=[]; faces=[]; chord_steps=6
    for i in range(sections+1):
        t=i/sections; span=x0+(x1-x0)*t
        st=span/0.82
        lead=-0.105 + 0.17*st
        trail=0.18 + 0.075*st
        chord=max(0.012,(trail-lead)*chord_scale*(1.0-0.28*st))
        center=(lead+trail)/2
        for j in range(chord_steps+1):
            u=j/chord_steps
            y=center+(u-0.5)*chord
            camber=0.024*math.sin(math.pi*u)*(1.0-0.4*st)
            z=0.178 + (camber if upper else -camber-0.012)
            verts.append((side*span,y,z))
    for i in range(sections):
        for j in range(chord_steps):
            a=i*(chord_steps+1)+j; b=a+1
            if side==1: face=(a,a+chord_steps+1,b+chord_steps+1,b)
            else: face=(a,b,b+chord_steps+1,a+chord_steps+1)
            faces.append(face if upper else tuple(reversed(face)))
    ob=mesh_obj(name,verts,faces,material,collection)
    solid=ob.modifiers.new('Feather thin edge','SOLIDIFY'); solid.thickness=0.009
    bevel=ob.modifiers.new('Soft feather edge','BEVEL'); bevel.width=0.006; bevel.segments=2
    return ob

def feather(name, p0, p1, width, material, collection, bulge=0.012):
    # Subtle feather-shaped tapered blade with a low raised center ridge.
    a=Vector(p0); b=Vector(p1); d=(b-a).normalized(); perp=Vector((-d.y,d.x,0))
    if perp.length<0.2: perp=Vector((1,0,0))
    perp.normalize(); mid=(a+b)*0.5
    verts=[tuple(a),tuple(mid+perp*width/2),tuple(b),tuple(mid-perp*width/2),
           tuple(mid+Vector((0,0,bulge)))]
    faces=[(0,1,4),(1,2,4),(2,3,4),(3,0,4)]
    ob=mesh_obj(name,verts,faces,material,collection)
    solid=ob.modifiers.new('Feather body','SOLIDIFY'); solid.thickness=0.006
    return ob

def rod(name, points, radii, material, collection, sides=8):
    verts=[]; faces=[]
    pts=[Vector(p) for p in points]
    for i,p in enumerate(pts):
        d=(pts[min(i+1,len(pts)-1)]-pts[max(0,i-1)]).normalized()
        n=d.cross(Vector((1,0,0)))
        if n.length<0.15: n=d.cross(Vector((0,1,0)))
        n.normalize(); v=d.cross(n).normalized(); r=radii[min(i,len(radii)-1)]
        for j in range(sides):
            q=p+r*(math.cos(TAU*j/sides)*n+math.sin(TAU*j/sides)*v)
            verts.append(tuple(q))
    for i in range(len(pts)-1):
        for j in range(sides):
            a=i*sides+j;b=i*sides+(j+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.append(tuple(range(sides-1,-1,-1))); faces.append(tuple((len(pts)-1)*sides+j for j in range(sides)))
    return mesh_obj(name,verts,faces,material,collection)

def make_rig(name, offset, collection):
    arm=bpy.data.armatures.new(name+'Skeleton'); rig=bpy.data.objects.new(name+'Rig',arm); collection.objects.link(rig); rig.location=(offset,0,0)
    bpy.context.view_layer.objects.active=rig; rig.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
    bones={}
    def eb(n,h,t,parent=None):
        b=arm.edit_bones.new(n); b.head=h; b.tail=t
        if parent: b.parent=arm.edit_bones[parent]
        bones[n]=b
        return b
    eb('Root',(0,0,-0.02),(0,0,0.05))
    eb('Body',(0,0,0.05),(0,-0.25,0.07),'Root')
    eb('Head',(0,-0.25,0.07),(0,-0.40,0.10),'Body')
    eb('Tail',(0,0.22,0.05),(0,0.38,0.03),'Body')
    for side,suffix in ((1,'R'),(-1,'L')):
        sh=eb('Wing.'+suffix,(side*0.06,0.015,0.17),(side*0.40,0.06,0.17),'Body')
        # Local Z follows the bird's forward axis so local-Z rotation flaps the wing.
        sh.align_roll(Vector((0,-1,0)))
        out=eb('Hand.'+suffix,(side*0.40,0.06,0.17),(side*0.90,0.15,0.17),'Wing.'+suffix)
        out.align_roll(Vector((0,-1,0)))
        eb('Leg.'+suffix,(side*0.045,0.16,-0.005),(side*0.045,0.18,-0.15),'Body')
    bpy.ops.object.mode_set(mode='OBJECT'); rig.select_set(False)
    return rig

def skinned(ob, rig, bone):
    vg=ob.vertex_groups.new(name=bone); vg.add(list(range(len(ob.data.vertices))),1.0,'REPLACE')
    mod=ob.modifiers.new('Gull rig','ARMATURE'); mod.object=rig
    ob.parent=rig
    ob['deform_bone']=bone
    return ob

def merge_by_bone(collection):
    groups={}
    for ob in collection.objects:
        if ob.type=='MESH': groups.setdefault(ob.get('deform_bone','Body'),[]).append(ob)
    for bone,objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for ob in objects: ob.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1: bpy.ops.object.join()
        merged=bpy.context.view_layer.objects.active
        merged.name=collection.name+'_'+bone+'_Mesh'
        merged['deform_bone']=bone

def add_feet(suffix, side, material, rig, col):
    sg=side
    # In flight the short legs trail aft, rather than hanging straight down.
    leg=rod('Gull_leg_'+suffix,[(sg*.045,.14,.035),(sg*.045,.24,.005),(sg*.045,.34,-.018)],[.012,.009,.007],material,col)
    skinned(leg,rig,'Leg.'+suffix)
    # Three toes and a small web span; enough shape to read at game distance.
    toes=[]
    for i,(dy,dx) in enumerate(((.075,0),(.035,-.052),(.035,.052))):
        ob=rod('Gull_toe_'+suffix+str(i),[(sg*.045,.32,-.018),(sg*.045+dx*.45,.32+dy*.45,-.028),(sg*.045+dx,.32+dy,-.035)],[.006,.004,.0015],material,col,6)
        skinned(ob,rig,'Leg.'+suffix); toes.append(ob)
    return [leg]+toes

def add_bill(side, material, collection, bone='Head'):
    # tapered wedge, broad at the base with a gentle downward point
    verts=[(-.026,-.385,.108),(.026,-.385,.108),(-.017,-.455,.093),(.017,-.455,.093),(0,-.478,.079),
           (-.030,-.385,.078),(.030,-.385,.078)]
    faces=[(0,1,3,2),(0,2,4),(1,4,3),(0,5,6,1),(2,3,4),(0,4,5),(1,6,4)]
    return mesh_obj('Gull_bill',verts,faces,material,collection)

def build_variant(variant, offset, juvenile=False):
    name='SilverGull_Juvenile' if juvenile else 'SilverGull_Adult'
    col=bpy.data.collections.new(name); bpy.context.scene.collection.children.link(col)
    rig=make_rig(name,offset,col)
    bodymat=MATS['white'] if not juvenile else MATS['juvenilewhite']
    uppermat=MATS['gray'] if not juvenile else MATS['brown']
    wingmat=MATS['winggray'] if not juvenile else MATS['juvwing']
    tipmat=MATS['black'] if not juvenile else MATS['brown']
    billmat=MATS['billred'] if not juvenile else MATS['darkbill']
    legmat=MATS['pink'] if not juvenile else MATS['darkleg']
    # Barrel-chested trunk, smooth neck and rounded head. Forward is -Y.
    body=loft_body(name+'_Body',[(.42,.075,.009,.012),(.33,.075,.038,.042),(.22,.078,.074,.080),(.08,.082,.108,.118),(-.08,.09,.113,.122),(-.20,.105,.082,.092),(-.29,.12,.052,.063),(-.35,.12,.030,.035)],bodymat,col,28)
    skinned(body,rig,'Body')
    headmat=MATS['white'] if not juvenile else MATS['tan']
    head=uv(name+'_Head',(0,-.326,.130),(.058,.070,.062),headmat,col,20,14); skinned(head,rig,'Head')
    neck=uv(name+'_Neck',(0,-.244,.112),(.068,.109,.075),headmat,col,18,12); skinned(neck,rig,'Head')
    back=uv(name+'_Mantle',(0,.03,.165),(.107,.263,.047),uppermat,col,24,14); skinned(back,rig,'Body')
    # Tail is broad and shallow in gulls rather than a forked tern streamer.
    tail=mesh_obj(name+'_Tail', [(-.10,.25,.10),(0,.43,.115),(.10,.25,.10),(.09,.29,.035),(0,.45,.04),(-.09,.29,.035)],[(0,1,2),(0,2,3),(0,3,4,5)], bodymat,col)
    skinned(tail,rig,'Tail')
    if juvenile:
        band=mesh_obj(name+'_TailBand',[(-.095,.29,.094),(0,.40,.105),(.095,.29,.094),(.09,.31,.051),(0,.42,.052),(-.09,.31,.051)],[(0,1,2),(0,2,3),(0,3,4,5)],tipmat,col)
        skinned(band,rig,'Tail')
    # Eye ring and small pupil sit on either side of the head.
    for side in (-1,1):
        if not juvenile:
            ring=uv(name+'_EyeRing_'+str(side),(side*.053,-.338,.142),(.008,.010,.008),MATS['eyering'],col,12,8); skinned(ring,rig,'Head')
        eye=uv(name+'_Iris_'+str(side),(side*.057,-.341,.142),(.0055,.007,.0055),MATS['pupil'] if juvenile else MATS['eye'],col,12,8); skinned(eye,rig,'Head')
        pupil=uv(name+'_Pupil_'+str(side),(side*.062,-.344,.143),(.0028,.004,.003),MATS['pupil'],col,10,6); skinned(pupil,rig,'Head')
    bill=add_bill(1,billmat,col); skinned(bill,rig,'Head')
    # Wings have cambered broad inner surfaces plus long tapered primaries.
    for side,suffix in ((1,'R'),(-1,'L')):
        inner=wing_surface(name+'_WingInner_'+suffix,side,.055,.43,wingmat,col,upper=True,chord_scale=1.0,sections=10); skinned(inner,rig,'Wing.'+suffix)
        under=wing_surface(name+'_WingUnder_'+suffix,side,.055,.43,MATS['belly'] if not juvenile else MATS['tan'],col,upper=False,chord_scale=.98,sections=10); skinned(under,rig,'Wing.'+suffix)
        outer=wing_surface(name+'_WingHand_'+suffix,side,.39,.90,wingmat,col,upper=True,chord_scale=.88,sections=12); skinned(outer,rig,'Hand.'+suffix)
        under2=wing_surface(name+'_WingHandUnder_'+suffix,side,.39,.90,MATS['belly'] if not juvenile else MATS['tan'],col,upper=False,chord_scale=.86,sections=12); skinned(under2,rig,'Hand.'+suffix)
        # Overlapping primaries describe the hand silhouette. Charcoal tips terminate in white mirrors on adults.
        for i in range(8):
            st=i/7
            startx=.43+st*.33
            endx=.52+st*.38
            starty=.13+st*.045
            endy=.23+st*.075
            z=.174
            f=feather(name+'_Primary_'+suffix+str(i),(side*startx,starty,z),(side*endx,endy,z-.004),.050-0.018*st,tipmat,col,.005); skinned(f,rig,'Hand.'+suffix)
            # tiny pale mirror near outer adult primary tips
            if not juvenile and i>=5:
                f=feather(name+'_Mirror_'+suffix+str(i),(side*(endx-.018),endy-.022,z+.003),(side*(endx-.008),endy-.006,z+.003),.012,MATS['mirror'],col,.002); skinned(f,rig,'Hand.'+suffix)
        # Scapular and secondaries make the trailing edge layered but not toy-like.
        for i in range(5):
            x=.10+i*.06
            f=feather(name+'_Secondary_'+suffix+str(i),(side*x,.10,.176),(side*(x+.045),.235,.172),.040,wingmat,col,.005); skinned(f,rig,'Wing.'+suffix)
        for i in range(3):
            x=.09+i*.038
            f=feather(name+'_Scapular_'+suffix+str(i),(side*x,-.02,.184),(side*(x+.035),.095,.183),.043,uppermat,col,.005); skinned(f,rig,'Wing.'+suffix)
        add_feet(suffix,side,legmat,rig,col)
    merge_by_bone(col)
    rig['species']='Silver Gull (Chroicocephalus novaehollandiae)'
    rig['plumage']='juvenile immature plumage' if juvenile else 'adult plumage'
    rig['variant_scale']=0.84 if juvenile else 1.0
    if juvenile:
        rig.scale=(.84,.84,.84)
    return rig,col

def animate(rig):
    names=[b.name for b in rig.data.bones]
    actions={}
    def action(name,frames,poses,loop=True):
        # poses maps frame -> bone -> (Euler xyz) tuples in radians.
        bpy.context.scene.frame_start=1; bpy.context.scene.frame_end=max(f for f in frames)
        act=bpy.data.actions.new(name); act.use_fake_user=True
        rig.animation_data_create(); rig.animation_data.action=act
        for pb in rig.pose.bones:
            pb.rotation_mode='XYZ'; pb.rotation_euler=(0,0,0)
        for f in frames:
            bpy.context.scene.frame_set(f)
            for bone,rot in poses.get(f,{}).items():
                pb=rig.pose.bones[bone]; pb.rotation_euler=rot; pb.keyframe_insert(data_path='rotation_euler',frame=f,group=bone)
            # Key remaining bones too, so each clip is self-contained on export.
            for pb in rig.pose.bones:
                if pb.name not in poses.get(f,{}):
                    pb.rotation_euler=(0,0,0)
                    pb.keyframe_insert(data_path='rotation_euler',frame=f,group=pb.name)
        actions[name]=act
        rig.animation_data.action=None
        return act
    def wave(frames, amplitude, phase=0, pitch=0, bodyroll=0, handamp=None):
        handamp=amplitude*.55 if handamp is None else handamp
        p={}
        for f in frames:
            u=(f-1)/(frames[-1]-1 or 1); a=phase+u*TAU
            p[f]={}
            p[f]['Wing.R']=(0,0,amplitude*math.sin(a)); p[f]['Wing.L']=(0,0,-amplitude*math.sin(a))
            p[f]['Hand.R']=(0,0,handamp*math.sin(a-.42)); p[f]['Hand.L']=(0,0,-handamp*math.sin(a-.42))
            p[f]['Tail']=(pitch*math.sin(a-.5),0,bodyroll*math.sin(a))
        return p
    clips=[]
    # Flight cycles: actual gulls alternate wing-powered flight with extended glides.
    frames=[1,4,7,10,13]
    clips.append(action('Flight_Flap_Cycle',frames,wave(frames,.64,0,.04,.025)))
    frames=[1,12,24]
    clips.append(action('Flight_Soar_Glide',frames,wave(frames,.08,0,.01,.015)))
    frames=[1,8,16,24,32]
    p=wave(frames,.42,0,.02,.02)
    for f in frames:
        u=(f-1)/(frames[-1]-1); p[f]['Body']=(0,0,-.18*math.sin(math.pi*u)); p[f]['Tail']=(.08*math.sin(math.pi*u),0,0)
    clips.append(action('Flight_Banked_Turn',frames,p))
    frames=[1,7,14,21,28]
    p=wave(frames,.68,0,.06,.02)
    for f in frames:
        u=(f-1)/(frames[-1]-1); p[f]['Body']=(.18*math.sin(math.pi*u),0,.05*math.sin(math.pi*u))
    clips.append(action('Flight_Shallow_Dive',frames,p))
    frames=[1,6,12,18,24]
    p=wave(frames,.72,0,.10,.02)
    for f in frames:
        u=(f-1)/(frames[-1]-1)
        fold=1.45*(1-u)
        p[f]['Wing.R']=(-fold,0,p[f]['Wing.R'][2]); p[f]['Wing.L']=(fold,0,p[f]['Wing.L'][2])
        p[f]['Hand.R']=(-.18*fold,0,p[f]['Hand.R'][2]); p[f]['Hand.L']=(.18*fold,0,p[f]['Hand.L'][2])
        p[f]['Body']=(.14*math.sin(math.pi*u),0,0); p[f]['Tail']=(.10*math.sin(math.pi*u),0,0)
    clips.append(action('Flight_Takeoff',frames,p))
    frames=[1,7,14,21,28]
    p=wave(frames,.52,0,-.10,.03)
    for f in frames:
        u=(f-1)/(frames[-1]-1); p[f]['Body']=(-.12*math.sin(math.pi*u),0,0)
        fold=1.45*u
        p[f]['Wing.R']=(-fold,0,p[f]['Wing.R'][2]); p[f]['Wing.L']=(fold,0,p[f]['Wing.L'][2])
        p[f]['Hand.R']=(-.18*fold,0,p[f]['Hand.R'][2]); p[f]['Hand.L']=(.18*fold,0,p[f]['Hand.L'][2])
        for leg in ('Leg.L','Leg.R'): p[f][leg]=(0,0,-.10*math.sin(math.pi*u))
    clips.append(action('Flight_Landing_Flare',frames,p))
    # Calm ground/water states fold the wings and use small head/tail corrections.
    frames=[1,13,25,37,49]
    p={}
    for f in frames:
        u=(f-1)/(frames[-1]-1); a=TAU*u
        p[f]={'Wing.R':(-1.45,0,0),'Wing.L':(1.45,0,0),'Hand.R':(-.18,0,0),'Hand.L':(.18,0,0),
              'Head':(0,0,.14*math.sin(a)),'Tail':(.025*math.sin(a),0,0)}
    clips.append(action('Ground_Perch_Idle',frames,p))
    frames=[1,12,24,36,48]
    p={}
    for f in frames:
        u=(f-1)/(frames[-1]-1); a=TAU*u
        p[f]={'Wing.R':(-1.45,0,0),'Wing.L':(1.45,0,0),'Hand.R':(-.18,0,0),'Hand.L':(.18,0,0),
              'Body':(.025*math.sin(a),0,.018*math.sin(a+.6)),'Head':(.02*math.sin(a+.6),0,.08*math.sin(a))}
    clips.append(action('Surface_Rest_Float',frames,p))
    frames=[1,9,17,25,33]
    p={}
    for f in frames:
        u=(f-1)/(frames[-1]-1); a=math.sin(math.pi*u)
        p[f]={'Wing.R':(-1.45,0,0),'Wing.L':(1.45,0,0),'Hand.R':(-.18,0,0),'Hand.L':(.18,0,0),
              'Head':(.16*a,0,-.28*a),'Tail':(.035*a,0,0)}
    clips.append(action('Ground_Preening',frames,p))
    for act in clips:
        clip_name=act.name.removesuffix('.001')
        tr=rig.animation_data.nla_tracks.new(); tr.name=clip_name
        strip=tr.strips.new(clip_name,1,act); strip.action_frame_start=act.frame_range[0]; strip.action_frame_end=act.frame_range[1]
    rig.animation_data.action=None
    return [a.name for a in clips]

def camera(name, loc, target, lens=52):
    bpy.ops.object.camera_add(location=loc); cam=bpy.context.object; cam.name=name; cam.data.lens=lens
    cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler(); bpy.context.scene.camera=cam
    return cam

def setup_render():
    scene=bpy.context.scene
    scene.render.engine='CYCLES'; scene.cycles.samples=20
    scene.render.resolution_x=1080; scene.render.resolution_y=720; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'; scene.render.film_transparent=False
    scene.world.color=(0.22,0.28,0.31)
    scene.world.use_nodes=True
    bg=scene.world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value=(0.32,0.39,0.42,1)
    bg.inputs['Strength'].default_value=.72
    scene.view_settings.view_transform='Standard'; scene.view_settings.look='Medium High Contrast'; scene.view_settings.exposure=0; scene.view_settings.gamma=1
    bpy.ops.object.light_add(type='AREA',location=(0,-2,3.4)); light=bpy.context.object; light.data.energy=780; light.data.shape='DISK'; light.data.size=4
    light.rotation_euler=(math.radians(25),0,math.radians(-15))
    bpy.ops.object.light_add(type='AREA',location=(2,1,1.5)); light2=bpy.context.object; light2.data.energy=340; light2.data.size=3; light2.rotation_euler=(math.radians(65),0,math.radians(145))
    # Neutral blue-gray studio background, readable light bird.
    bpy.context.scene.world.color=(0.12,0.17,0.20)

def render_views(rig, col, label):
    # isolate selected variant; shared studio elements remain enabled.
    for c in bpy.context.scene.collection.children:
        c.hide_render=(c != col)
    col.hide_render=False
    rig.animation_data.action=None
    for tr in rig.animation_data.nla_tracks: tr.mute=True
    bpy.context.scene.frame_set(1)
    target=(rig.location.x,0,0.03)
    views=[('side',(rig.location.x+2.4,0,.28)),('front',(rig.location.x,-2.3,.22)),('three_quarter',(rig.location.x-1.65,-1.8,1.1))]
    for view,loc in views:
        cam=camera('ReviewCamera_'+view,loc,target,55)
        bpy.context.scene.render.filepath=os.path.join(OUT_DIR,f'{label}_{view}.png')
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam,do_unlink=True)
    for tr in rig.animation_data.nla_tracks: tr.mute=False
    for c in bpy.context.scene.collection.children: c.hide_render=False

def render_pose(rig, col, action_name, frame, file_name):
    for c in bpy.context.scene.collection.children: c.hide_render=(c != col)
    col.hide_render=False
    old_action=rig.animation_data.action
    old_mutes=[tr.mute for tr in rig.animation_data.nla_tracks]
    for tr in rig.animation_data.nla_tracks: tr.mute=True
    rig.animation_data.action=bpy.data.actions.get(action_name)
    bpy.context.scene.frame_set(frame)
    cam=camera('ReviewCamera_pose',(rig.location.x-2.15,-2.45,1.4),(rig.location.x,0,0.24),50)
    cam.data.type='ORTHO'; cam.data.ortho_scale=2.8
    bpy.context.scene.render.filepath=os.path.join(OUT_DIR,file_name)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam,do_unlink=True)
    rig.animation_data.action=old_action
    for tr,mute in zip(rig.animation_data.nla_tracks,old_mutes): tr.mute=mute
    bpy.context.scene.frame_set(1)
    for c in bpy.context.scene.collection.children: c.hide_render=False

def export_variant(rig,col,path):
    # Export only this variant's armature and mesh. NLA clips become GLB animations.
    bpy.ops.object.select_all(action='DESELECT')
    for ob in col.objects:
        if ob.type in {'MESH','ARMATURE'}: ob.select_set(True)
    bpy.context.view_layer.objects.active=rig
    bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,
        export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,
        export_skins=True,export_apply=False,export_yup=True,export_cameras=False,export_lights=False,
        export_materials='EXPORT',export_normals=True)

clear_scene()
adult_rig,adult_col=build_variant('adult',-0.52,False)
adult_clips=animate(adult_rig)
juv_rig,juv_col=build_variant('juvenile',0.64,True)
juvenile_clips=animate(juv_rig)
setup_render()
# floorless reference plates; two variants separate for review.
render_views(adult_rig,adult_col,'silver_gull_adult')
render_views(juv_rig,juv_col,'silver_gull_juvenile')
render_pose(adult_rig,adult_col,'Flight_Flap_Cycle',4,'silver_gull_flap_pose.png')
render_pose(adult_rig,adult_col,'Flight_Shallow_Dive',14,'silver_gull_shallow_dive_pose.png')
render_pose(adult_rig,adult_col,'Ground_Perch_Idle',13,'silver_gull_perch_pose.png')
# Export animation-ready standalone variants from origin, not the review display offsets.
adult_rig.location=(0,0,0); juv_rig.location=(0,0,0)
export_variant(adult_rig,adult_col,os.path.join(OUT_DIR,'Paradise_Island_Silver_Gull_Adult.glb'))
export_variant(juv_rig,juv_col,os.path.join(OUT_DIR,'Paradise_Island_Silver_Gull_Juvenile.glb'))
# Restore paired review layout and clean render settings in the saved Blender scene.
adult_rig.location=(-.52,0,0); juv_rig.location=(.64,0,0)
for c in bpy.context.scene.collection.children: c.hide_render=False
bpy.context.scene.render.filepath=os.path.join(OUT_DIR,'silver_gull')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_DIR,'Paradise_Island_Silver_Gulls.blend'))
result={'ok':True,'blend':os.path.join(OUT_DIR,'Paradise_Island_Silver_Gulls.blend'),'adult_glb':os.path.join(OUT_DIR,'Paradise_Island_Silver_Gull_Adult.glb'),'juvenile_glb':os.path.join(OUT_DIR,'Paradise_Island_Silver_Gull_Juvenile.glb'),'adult_clips':adult_clips,'juvenile_clips':juvenile_clips,'render_files':[f for f in os.listdir(OUT_DIR) if f.endswith('.png')]}
