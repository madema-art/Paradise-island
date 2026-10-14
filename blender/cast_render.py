# Quick Workbench renders for checking the model.
import bpy, math
from mathutils import Vector

OUT = r'C:\Users\matta\AppData\Local\Temp\claude\D--Paradise-Island\ba471b37-075c-4138-ad56-0b3fc7249854\scratchpad'


def setup_render(res=(700, 900)):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    sh = sc.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'VERTEX'
    sh.show_cavity = False
    sh.show_shadows = False
    sh.background_type = 'VIEWPORT'
    sc.world.use_nodes = False
    sc.world.color = (0.30, 0.34, 0.40)
    try:
        sc.view_settings.view_transform = 'Standard'
    except Exception:
        pass
    if 'rcam' not in bpy.data.objects:
        cd = bpy.data.cameras.new('rcam')
        co = bpy.data.objects.new('rcam', cd)
        sc.collection.objects.link(co)
    sc.camera = bpy.data.objects['rcam']
    return sc.camera


def shot(name, loc, target, ortho=None, lens=70, res=(700, 900)):
    cam = setup_render(res)
    cam.location = Vector(loc)
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    if ortho:
        cam.data.type = 'ORTHO'
        cam.data.ortho_scale = ortho
    else:
        cam.data.type = 'PERSP'
        cam.data.lens = lens
    cam.data.clip_end = 100
    p = OUT + '\\' + name + '.png'
    bpy.context.scene.render.filepath = p
    bpy.ops.render.render(write_still=True)
    return p
