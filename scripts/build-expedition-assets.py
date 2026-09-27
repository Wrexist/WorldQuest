"""Original WorldQuest Expedition props. Run with Blender --background --python this_file.

Meters, Z up in Blender, glTF Y up on export. Procedural geometry; no external meshes.
Decorative props only; no factual flags, country geometry or mascot replacement.
"""
from pathlib import Path
from math import pi, sin, cos
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/design/assets/expedition/models'
ART = ROOT / 'docs/design/assets/expedition/masters'
OUT.mkdir(parents=True, exist_ok=True)
ART.mkdir(parents=True, exist_ok=True)

def material(name, color):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = .34
    bs.inputs['Metallic'].default_value = .32 if name == 'Gold' else 0
    return m

def setup():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    return {k: material(k, c) for k,c in {
        'Teal':(.015,.55,.57), 'Visor':(.014,.085,.12),
        'Cream':(.96,.90,.69), 'Gold':(1,.62,.055),
        'Orange':(1,.28,.065), 'Leaf':(.38,.67,.10),
        'Brown':(.31,.14,.045), 'Pink':(.95,.16,.27), 'Blue':(.015,.24,.8), 'Purple':(.39,.10,.85), 'Ice':(.22,.82,1), 'White':(.95,.98,1),
    }.items()}

def finish(obj, name, mat, parent=None):
    obj.name = name
    obj.data.materials.append(mat)
    if parent: obj.parent = parent
    for face in obj.data.polygons: face.use_smooth = True
    return obj

def cube(name, loc, scale, mat, radius=.12, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o=bpy.context.object
    o.scale=scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel=o.modifiers.new('Soft molded edges', 'BEVEL')
    bevel.width=radius
    bevel.segments=4
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    o.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return finish(o,name,mat,parent)

def ball(name, loc, scale, mat, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1, location=loc)
    o=bpy.context.object
    o.scale=scale
    return finish(o,name,mat,parent)

def ring(name, loc, major, minor, mat, rot=(0,0,0), parent=None):
    bpy.ops.mesh.primitive_torus_add(major_segments=48, minor_segments=8,
        location=loc, major_radius=major, minor_radius=minor, rotation=rot)
    return finish(bpy.context.object,name,mat,parent)

def pivot(name, loc):
    o=bpy.data.objects.new(name,None)
    bpy.context.collection.objects.link(o)
    o.location=loc
    return o

def star(name, loc, size, depth, mat, points=5):
    verts=[]
    for y in [-depth/2,depth/2]:
        for i in range(points*2):
            a=pi/2+i*pi/points
            r=size if i%2==0 else size*.47
            verts.append((cos(a)*r,y,sin(a)*r))
    n=points*2
    faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    o=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(o)
    o.location=loc
    b=o.modifiers.new('Soft star corners','BEVEL'); b.width=.045; b.segments=3
    return finish(o,name,mat)

def export(name, look, scale, animated=False, frame=1):
    import os
    if os.environ.get('WQ_ASSET_ONLY') and name != os.environ['WQ_ASSET_ONLY']: return
    scene=bpy.context.scene
    scene.frame_start=1; scene.frame_end=72; scene.render.fps=24
    scene.frame_set(frame)
    bpy.ops.object.select_all(action='DESELECT')
    for o in scene.objects:
        if o.type in {'MESH','EMPTY'}: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / f'{name}.glb'), export_format='GLB',
        use_selection=True, export_animations=animated, export_apply=True)
    bpy.ops.object.camera_add(location=(3,-7,3.8))
    camera=bpy.context.object
    camera.rotation_euler=(Vector(look)-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO'; camera.data.ortho_scale=scale
    scene.camera=camera
    for pos,power,size in [((1,-4,7),550,5),((-4,-2,3),320,4),((2,4,5),650,3)]:
        bpy.ops.object.light_add(type='AREA',location=pos)
        light=bpy.context.object; light.data.energy=power; light.data.shape='DISK'; light.data.size=size
        light.rotation_euler=(Vector(look)-light.location).to_track_quat('-Z','Y').to_euler()
    scene.render.engine='CYCLES'; scene.cycles.samples=48
    scene.cycles.use_denoising=True
    scene.render.resolution_x=640; scene.render.resolution_y=640; scene.render.resolution_percentage=100
    scene.render.film_transparent=True
    scene.world.color=(.5,.5,.5)
    scene.view_settings.view_transform='Standard'; scene.view_settings.exposure=-.5
    scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'
    scene.render.filepath=str(ART / f'{name}.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f'{name}.blend'))
    bpy.ops.render.render(write_still=True)
    print(f'WORLDQUEST_ASSET_READY {name}', flush=True)


# Original Expedition prop family: molded enamel, warm brass and matte ceramic.
def gem(loc=(0,0,1), size=.5, parent=None):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=loc)
    o=bpy.context.object; o.scale=(size,size*.72,size*1.3)
    finish(o,'Amethyst collectible',m['Purple'],parent)
    for face in o.data.polygons: face.use_smooth=False
    return o

def coin(loc, r=.34):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=r, depth=.10, location=loc)
    o=finish(bpy.context.object,'Brass coin',m['Gold'])
    bevel=o.modifiers.new('Rounded coin edge','BEVEL'); bevel.width=.025; bevel.segments=3
    ring('Raised coin rim',(loc[0],loc[1],loc[2]+.055),r*.80,.018,m['Cream'])
    return o

m=setup()
p=pivot('Crystal reveal',(0,0,0))
gem((0,0,1),.58,p)
ring('Collectible bezel',(0,0,.35),.48,.09,m['Gold'])
for x,z,s in [(-.75,1.6,.16),(.74,.8,.12)]: star('Crystal sparkle',(x,0,z),s,.07,m['Gold'])
for f,z in [(1,-.2),(18,.07),(30,0),(72,0)]:
    p.location.z=z; p.keyframe_insert(data_path='location',frame=f)
p.animation_data.action.name='Crystal lift and settle'
export('gem',(0,0,1),2.5,True,30)

m=setup()
cube('Passport cover',(0,0,.85),(1.18,.30,1.62),m['Blue'],.14)
cube('Ivory pages',(.03,.03,.85),(1.04,.31,1.43),m['Cream'],.10)
cube('Front cover',(0,-.17,.85),(1.18,.07,1.62),m['Teal'],.10)
ring('Passport medallion',(0,-.24,.99),.34,.038,m['Gold'],(pi/2,0,0))
ring('Globe longitude',(0,-.255,.99),.30,.016,m['Gold'],(pi/2,0,0))
cube('Globe meridian',(0,-.27,.99),(.035,.025,.60),m['Gold'],.015)
cube('Globe equator',(0,-.27,.99),(.61,.025,.035),m['Gold'],.015)
for x in [-.20,0,.20]: star('Travel seal',(x,-.25,.42),.065,.025,m['Gold'])
cube('Ribbon bookmark',(.32,.05,.08),(.16,.08,.36),m['Orange'],.025)
export('passport',(0,0,.87),2.2)

m=setup()
# Compass lies tilted toward the camera; geometry is decorative, not teaching data.
bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.76,depth=.18,location=(0,0,.85),rotation=(pi/2,0,0))
finish(bpy.context.object,'Compass body',m['Gold'])
ring('Brass rolled rim',(0,-.12,.85),.69,.075,m['Gold'],(pi/2,0,0))
bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.62,depth=.025,location=(0,-.13,.85),rotation=(pi/2,0,0))
finish(bpy.context.object,'Ocean enamel dial',m['Blue'])
for i in range(12):
    a=i*pi/6
    ball('Dial index',(sin(a)*.52,-.17,.85+cos(a)*.52),(.026,.02,.026),m['Cream'])
needle=star('Compass rose',(0,-.19,.85),.46,.055,m['Cream'],points=4)
north=star('North pointer',(0,-.23,1.03),.23,.065,m['Orange'],points=4); north.scale.x=.35
ball('Central pin',(0,-.26,.85),(.065,.045,.065),m['Gold'])
ring('Lanyard ring',(0,0,1.72),.13,.04,m['Gold'],(pi/2,0,0))
export('compass',(0,0,.97),2.35)

m=setup()
for x,y,n in [(-.34,.12,4),(.34,.24,6),(.02,-.33,2)]:
    for i in range(n): coin((x,y,.13+i*.115))
star('Earned star',(-.68,0,.96),.19,.07,m['Gold'])
export('coins',(0,0,.47),2.3)

m=setup()
cube('Trophy base',(0,0,.16),(.96,.70,.27),m['Blue'],.10)
cube('Base trim',(0,0,.30),(.81,.59,.08),m['Gold'],.03)
cube('Trophy stem',(0,0,.64),(.18,.18,.70),m['Gold'],.06)
star('Gold award star',(0,0,1.38),.64,.27,m['Gold'])
star('Inset enamel star',(0,-.16,1.38),.39,.055,m['Teal'])
star('Ivory center',(0,-.20,1.38),.17,.025,m['Cream'])
for x in [-.73,.73]: star('Award sparkle',(x,0,1.05),.13,.06,m['Gold'])
export('star-trophy',(0,0,1.03),2.65)

m=setup()
ice=cube('Frosted ice token',(0,0,.90),(1.12,.54,1.20),m['Ice'],.18)
ice.rotation_euler[1]=-.12
for angle in [0,pi/3,-pi/3]:
    o=cube('Snow crystal arm',(0,-.31,.90),(.07,.07,.83),m['White'],.028)
    o.rotation_euler[1]=angle
for x in [-.72,.72]: star('Ice glint',(x,0,1.28),.13,.055,m['White'])
cube('Ice pedestal',(0,0,.20),(1.20,.70,.18),m['Blue'],.08)
export('streak-freeze',(0,0,.84),2.35)

m=setup()
# A hollow body, separate hinge and lid, interior cushion and emerging collectible.
cube('Chest floor',(0,0,.18),(1.52,1.03,.22),m['Blue'],.10)
for x in [-.68,.68]: cube('Side wall',(x,0,.60),(.20,1.03,.88),m['Blue'],.08)
for y in [-.44,.44]: cube('Chest wall',(0,y,.60),(1.43,.18,.88),m['Teal'],.08)
cube('Interior cushion',(0,0,.32),(1.20,.72,.15),m['Purple'],.05)
for x in [-.51,.51]:
    cube('Front brass strap',(x,-.555,.60),(.14,.065,.85),m['Gold'],.04)
    for z in [.30,.85]: ball('Brass rivet',(x,-.60,z),(.032,.023,.032),m['Cream'])
for x in [-.56,.56]: cube('Chest foot',(x,0,.08),(.27,.72,.14),m['Gold'],.055)
cube('Front clasp',(0,-.57,.69),(.34,.12,.37),m['Gold'],.075)
star('Clasp emblem',(0,-.645,.69),.12,.035,m['Cream'])
lid=pivot('Lid hinge',(0,.46,1.03))
cube('Domed lid',(0,-.46,.13),(1.58,1.10,.37),m['Blue'],.17,lid)
for x in [-.51,.51]: cube('Lid brass strap',(x,-.46,.32),(.14,.92,.08),m['Gold'],.035,lid)
reward=pivot('Reward rise',(0,0,0)); gem((0,0,.70),.30,reward)
for f,a,z in [(1,0,0),(10,.07,0),(26,-1.45,.75),(38,-1.36,.63),(72,-1.36,.63)]:
    lid.rotation_euler[0]=a; lid.keyframe_insert(data_path='rotation_euler',frame=f)
    reward.location.z=z; reward.keyframe_insert(data_path='location',frame=f)
lid.animation_data.action.name='Chest anticipation and hinged opening'
reward.animation_data.action.name='Collectible reveal'
export('treasure-chest',(0,0,.95),2.9,True,38)

import os
if os.environ.get('WQ_ASSET_ONLY'): raise SystemExit(0)
# Runtime film is sampled from this exact model, not a separate illustration.
scene=bpy.context.scene
scene.render.resolution_x=240; scene.render.resolution_y=240
scene.cycles.samples=16
film=ART / 'chest-frames'; film.mkdir(exist_ok=True)
for index in range(40):
    scene.frame_set(1+index)
    scene.render.filepath=str(film / f'{index:02d}.png')
    bpy.ops.render.render(write_still=True)
print('WORLDQUEST_CHEST_FILM_READY',flush=True)
