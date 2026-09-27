"""Original WorldQuest toy assets. Run with Blender --background --python this_file.

Meters, Z up in Blender, glTF Y up on export. Procedural geometry; no external meshes.
The globe is a cartographic graticule, not an invented coastline or country border.
"""
from pathlib import Path
from math import pi, sin, cos
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/design/assets/models'
ART = ROOT / 'docs/design/assets/daylight'
OUT.mkdir(parents=True, exist_ok=True)
ART.mkdir(parents=True, exist_ok=True)

def material(name, color):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = .48
    return m

def setup():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    return {k: material(k, c) for k,c in {
        'Teal':(.015,.55,.57), 'Visor':(.014,.085,.12),
        'Cream':(.96,.90,.69), 'Gold':(1,.62,.055),
        'Orange':(1,.28,.065), 'Leaf':(.38,.67,.10),
        'Brown':(.31,.14,.045), 'Pink':(.95,.16,.27),
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

def star(name, loc, size, depth, mat):
    verts=[]
    for y in [-depth/2,depth/2]:
        for i in range(10):
            a=pi/2+i*pi/5
            r=size if i%2==0 else size*.47
            verts.append((cos(a)*r,y,sin(a)*r))
    faces=[tuple(reversed(range(10))),tuple(range(10,20))]
    faces += [(i,(i+1)%10,(i+1)%10+10,i+10) for i in range(10)]
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    o=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(o)
    o.location=loc
    b=o.modifiers.new('Soft star corners','BEVEL'); b.width=.045; b.segments=3
    return finish(o,name,mat)

def export(name, look, scale, animated=False):
    scene=bpy.context.scene
    scene.frame_start=1; scene.frame_end=72; scene.render.fps=24
    scene.frame_set(1)
    bpy.ops.object.select_all(action='DESELECT')
    for o in scene.objects:
        if o.type in {'MESH','EMPTY'}: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / f'{name}.glb'), export_format='GLB',
        use_selection=True, export_animations=animated, export_apply=True)
    bpy.ops.object.camera_add(location=(4,-7,4.2))
    camera=bpy.context.object
    camera.rotation_euler=(Vector(look)-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO'; camera.data.ortho_scale=scale
    scene.camera=camera
    for pos,power,size in [((1,-4,7),550,5),((-4,-2,3),320,4),((2,4,5),650,3)]:
        bpy.ops.object.light_add(type='AREA',location=pos)
        light=bpy.context.object; light.data.energy=power; light.data.shape='DISK'; light.data.size=size
        light.rotation_euler=(Vector(look)-light.location).to_track_quat('-Z','Y').to_euler()
    scene.render.engine='CYCLES'; scene.cycles.samples=24
    scene.cycles.use_denoising=True
    scene.render.resolution_x=640; scene.render.resolution_y=640; scene.render.resolution_percentage=100
    scene.render.film_transparent=True
    scene.world.color=(.5,.5,.5)
    scene.view_settings.view_transform='AgX'
    scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'
    scene.render.filepath=str(ART / f'{name}.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f'{name}.blend'))
    bpy.ops.render.render(write_still=True)
    print(f'WORLDQUEST_ASSET_READY {name}', flush=True)

# A reusable articulated Atlas companion. Head nod and shoulder wave are real glTF tracks.
m=setup()
root=pivot('Atlas root',(0,0,0))
cube('Cream expedition jacket',(0,0,1.02),(.83,.56,.80),m['Cream'],.21,root)
cube('Explorer backpack',(0,.37,1.13),(.72,.35,.75),m['Leaf'],.14,root)
for x in [-.26,.26]:
    ball('Knee',(x,0,.52),(.15,.16,.24),m['Cream'],root)
    cube('Chunky boot',(x,-.09,.24),(.43,.66,.33),m['Teal'],.13,root)
    cube('Cream sole',(x,-.09,.10),(.44,.67,.14),m['Cream'],.055,root)
head=pivot('Head nod',(0,0,1.78)); head.parent=root
cube('Rounded teal head',(0,0,.07),(1.32,.85,1.06),m['Teal'],.30,head)
cube('Friendly visor',(0,-.415,.07),(1.05,.16,.68),m['Visor'],.22,head)
for x in [-.25,.25]:
    ball('Warm oval eye',(x,-.512,.08),(.095,.035,.15),m['Cream'],head)
    ball('Ear',(x*2.65,0,.04),(.12,.23,.25),m['Cream'],head)
ball('Safari hat crown',(0,.025,.60),(.65,.48,.34),m['Gold'],head)
ball('Wide safari brim',(0,-.07,.43),(.89,.66,.085),m['Gold'],head)
ring('Hat band',(0,.015,.48),.50,.032,m['Brown'],parent=head)
ring('Neckerchief',(0,0,1.47),.22,.07,m['Orange'],parent=root)
ball('Scarf knot',(.11,-.32,1.39),(.10,.08,.12),m['Orange'],root)
for x in [-1,1]:
    arm=pivot('Wave shoulder' if x==-1 else 'Rest shoulder',(x*.58,0,1.29)); arm.parent=root
    ball('Arm sleeve',(x*.17,0,-.20),(.14,.17,.30),m['Cream'],arm)
    ball('Rounded hand',(x*.32,-.01,-.55),(.16,.13,.18),m['Teal'],arm)
    if x==-1:
        for frame,angle in [(1,.10),(12,1.65),(24,2.0),(36,1.65),(48,2.0),(60,.10),(72,.10)]:
            arm.rotation_euler[1]=angle; arm.keyframe_insert(data_path='rotation_euler',frame=frame)
        arm.animation_data.action.name='Atlas hello wave'
for frame,angle in [(1,0),(18,-.12),(36,.08),(54,0),(72,0)]:
    head.rotation_euler[1]=angle; head.keyframe_insert(data_path='rotation_euler',frame=frame)
head.animation_data.action.name='Atlas attentive nod'
export('atlas-companion',(0,0,1.35),3.6,True)

# Cartographic globe: parallels and meridians only, with no fabricated geography.
m=setup(); p=pivot('Globe turn',(0,0,1.28))
ball('Ocean',(0,0,0),(.82,.82,.82),m['Teal'],p)
for lat in [-pi/3,-pi/6,0,pi/6,pi/3]:
    ring('Parallel',(0,0,.825*sin(lat)),.825*cos(lat),.012,m['Cream'],parent=p)
for lon in [0,pi/4,pi/2,3*pi/4]:
    ring('Meridian',(0,0,0),.831,.012,m['Cream'],(pi/2,0,lon),p)
ring('Globe meridian frame',(0,0,1.28),.95,.05,m['Gold'],(pi/2,0,.20))
cube('Stand',(0,0,.24),(.16,.16,.36),m['Gold'],.055)
ball('Base',(0,0,.09),(.55,.42,.10),m['Gold'])
for frame,angle in [(1,0),(72,pi*2)]:
    p.rotation_euler[2]=angle; p.keyframe_insert(data_path='rotation_euler',frame=frame)
p.animation_data.action.name='Globe rotation'
export('globe',(0,0,1.15),2.75,True)

m=setup()
cube('Chest body',(0,0,.53),(1.50,.98,.88),m['Teal'],.16)
lid=pivot('Opening lid',(0,.48,.90))
cube('Chest lid',(0,-.48,.11),(1.53,1.02,.33),m['Teal'],.15,lid)
for x in [-.48,.48]:
    cube('Golden band',(x,-.505,.50),(.12,.055,.66),m['Gold'],.035)
    cube('Lid band',(x,-.48,.29),(.12,.84,.05),m['Gold'],.025,lid)
cube('Lock',(0,-.57,.73),(.27,.12,.29),m['Gold'],.075)
star('Lock star',(0,-.645,.75),.075,.026,m['Cream'])
for frame,angle in [(1,0),(20,0),(38,-1.15),(58,-1.15),(72,0)]:
    lid.rotation_euler[0]=angle; lid.keyframe_insert(data_path='rotation_euler',frame=frame)
lid.animation_data.action.name='Treasure reveal'
export('treasure-chest',(0,0,.65),2.50,True)

m=setup()
star('Achievement star',(0,0,1.18),.65,.24,m['Gold'])
cube('Stem',(0,0,.52),(.16,.17,.63),m['Gold'],.06)
cube('Podium',(0,0,.14),(.84,.64,.23),m['Teal'],.09)
cube('Podium rim',(0,0,.26),(.68,.49,.11),m['Gold'],.04)
export('star-trophy',(0,0,.91),2.28)

m=setup()
ball('Heart left',(-.235,0,.99),(.40,.22,.40),m['Pink'])
ball('Heart right',(.235,0,.99),(.40,.22,.40),m['Pink'])
bpy.ops.mesh.primitive_cone_add(vertices=48,radius1=.06,radius2=.52,depth=.72,location=(0,0,.64))
o=bpy.context.object; o.scale.y=.45
finish(o,'Heart point',m['Pink'])
star('Recovery spark',(.69,0,1.29),.17,.08,m['Gold'])
export('heart',(0,0,.87),1.93)
