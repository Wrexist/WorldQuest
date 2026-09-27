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
ART = ROOT / 'docs/design/assets/chest-v2'
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


# Original soft toy chest. 40 sampled poses, one cosmetic gem, no random rewards.
m=setup()
m['Teal']=material('Lagoon enamel',(.025,.49,.66))
m['Inside']=material('Velvet interior',(.022,.16,.22))
m['Gold']=material('Warm satin brass',(1,.63,.08))
m['Gem']=material('Lilac crystal',(.46,.18,.92))
m['Gem'].node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value=.25
root=pivot('Chest anticipation',(0,0,0))
# An actual hollow body, with a recessed floor and four rounded walls.
cube('Chest floor',(0,0,.28),(1.65,1.12,.25),m['Teal'],.10,root)
cube('Velvet cushion',(0,0,.42),(1.37,.84,.13),m['Inside'],.08,root)
for y in [-.49,.49]:
    cube('Front wall' if y<0 else 'Back wall',(0,y,.67),(1.65,.20,.73),m['Teal'],.09,root)
for x in [-.73,.73]:
    cube('Side wall',(x,0,.67),(.20,.92,.73),m['Teal'],.09,root)
for x in [-.53,.53]:
    cube('Brass front strap',(x,-.606,.64),(.16,.045,.68),m['Gold'],.022,root)
    for z in [.39,.87]: ball('Strap rivet',(x,-.64,z),(.045,.022,.045),m['Cream'],root)
for x in [-.64,.64]:
    for y in [-.36,.36]: cube('Soft brass foot',(x,y,.14),(.28,.28,.24),m['Gold'],.075,root)
# Lid coordinates are local to a physical hinge along the rear rim.
lid=pivot('Hinged domed lid',(0,.49,1.04)); lid.parent=root
profile=[(-.58,-.055),(.58,-.055)]
profile += [(cos(i*pi/16)*.58, .05+sin(i*pi/16)*.35) for i in range(17)]
verts=[(x,y-.49,z) for x in [-.845,.845] for y,z in profile]
n=len(profile);faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]
faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
mesh=bpy.data.meshes.new('Arched lid');mesh.from_pydata(verts,[],faces);mesh.update()
o=bpy.data.objects.new('Arched enamel lid',mesh);bpy.context.collection.objects.link(o)
b=o.modifiers.new('Rounded rim','BEVEL');b.width=.045;b.segments=3
finish(o,'Arched enamel lid',m['Teal'],lid)
cube('Lid velvet underside',(0,-.49,-.07),(1.42,.87,.045),m['Inside'],.055,lid)
# Straps follow the dome, rather than floating flat above it.
for x in [-.53,.53]:
    for i in range(20):
        a=(i+.5)*pi/20
        band=cube('Domed brass strap',(x,cos(a)*.59-.49,.05+sin(a)*.36),(.16,.102,.045),m['Gold'],.015,lid)
        band.rotation_euler[0]=a-pi/2
cube('Brass clasp',(0,-1.10,-.055),(.30,.105,.32),m['Gold'],.065,lid)
# Tiny embossed compass mark on the fixed front of the chest.
seal=star('Compass seal',(0,-.616,.67),.16,.035,m['Gold'])
# Parent the seal without changing its world position (root starts at origin).
seal.parent=root
# Crisp gemstone topology: a crown, girdle, and pointed pavilion.
gem=pivot('Gem reveal',(0,-.04,.68));gem.parent=root
verts=[(0,0,.37)]
for z,r in [(.19,.24),(-.04,.32)]:
    verts += [(cos(i*pi/3)*r,sin(i*pi/3)*r,z) for i in range(6)]
verts += [(0,0,-.39)]
faces=[]
for i in range(6):
    a=1+i;b=1+(i+1)%6;c=7+i;d=7+(i+1)%6
    faces += [(0,a,b),(a,c,d,b),(c,13,d)]
mesh=bpy.data.meshes.new('Crystal facets');mesh.from_pydata(verts,[],faces);mesh.update()
o=bpy.data.objects.new('One collectible streak gem',mesh);bpy.context.collection.objects.link(o);o.parent=gem;o.data.materials.append(m['Gem'])
# A few small stars sit in the same 3D light as the reward.
sparks=[]
for i,(x,z,s) in enumerate([(-.60,1.93,.10),(.59,2.23,.085),(.78,1.70,.06)]):
    o=star('Reveal sparkle '+str(i),(x,-.09,z),s,.035,m['Gold']);sparks.append(o)
scene=bpy.context.scene
scene.frame_start=1;scene.frame_end=40;scene.render.fps=20
for f in range(1,41):
    t=(f-1)/39
    shake=sin(t*pi*24)*.035*(1-t/.25) if t<.25 else 0
    root.rotation_euler[1]=shake;root.keyframe_insert(data_path='rotation_euler',frame=f)
    a=max(0,min(1,(t-.23)/.40));ease=1-(1-a)**3
    lid.rotation_euler[0]=-1.85*ease;lid.keyframe_insert(data_path='rotation_euler',frame=f)
    g=max(0,min(1,(t-.38)/.42));e=1-(1-g)**3
    gem.location.z=.67+1.20*e+sin(g*pi)*.12;gem.keyframe_insert(data_path='location',frame=f)
    gem.scale=(max(.001,e),)*3;gem.keyframe_insert(data_path='scale',frame=f)
    gem.rotation_euler[2]=-.4+.9*e;gem.keyframe_insert(data_path='rotation_euler',frame=f)
    for o in sparks:
        o.scale=(max(.001,e),)*3;o.keyframe_insert(data_path='scale',frame=f)
scene.frame_set(1)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'treasure-chest-v2.glb'),export_format='GLB',use_selection=True,export_animations=True,export_apply=True)
bpy.ops.object.camera_add(location=(3.6,-7,3.7));camera=bpy.context.object
look=(0,0,1.15);camera.rotation_euler=(Vector(look)-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=3.25;scene.camera=camera
for pos,power,size in [((-3,-4,7),500,5),((4,-2,4),350,4),((1,4,6),650,3)]:
    bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size
    o.rotation_euler=(Vector(look)-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True
scene.render.resolution_x=320;scene.render.resolution_y=320;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.world.color=(.4,.4,.4);scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'treasure-chest-v2.blend'))
for f in range(1,41):
    scene.frame_set(f);scene.render.filepath=str(ART/f'frame-{f:02d}.png');bpy.ops.render.render(write_still=True)
print('WORLDQUEST_CHEST_V2_READY',flush=True)
