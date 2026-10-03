"""Build WorldQuest's approved explorer chest as editable geometry and a UI film.

Run: blender --background --python scripts/build-explorer-chest.py
WQ_CHEST_PREVIEW=1 renders the two master stills without the 40-frame film.
No remote generation. The inset coastline is Natural Earth, never an invented map.
"""
from pathlib import Path
from math import pi, sin, cos
import hashlib
import json
import os
import shutil
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/design/assets/explorer-chest'
FRAMES = OUT / 'frames'
for directory in (OUT, FRAMES, OUT / 'textures'):
    directory.mkdir(parents=True, exist_ok=True)
REFERENCE = Path('C:/Users/IsacC/.codex/generated_images/01a0fd29-bbd8-7560-8370-22d7dc5cd412/exec-f2439fff-0d34-49a0-955b-a419b0b70921.png')
LAND = ROOT / 'docs/design/assets/world-mascot-3d/land.png'
approved_reference = OUT / 'approved-reference.png'
if os.environ.get('WQ_CHEST_REFERENCE'):
    requested_reference = Path(os.environ['WQ_CHEST_REFERENCE']).resolve()
    if requested_reference != approved_reference.resolve():
        shutil.copyfile(requested_reference, approved_reference)
elif not approved_reference.exists():
    if REFERENCE.exists():
        shutil.copyfile(REFERENCE, approved_reference)
    else:
        raise FileNotFoundError('Provide the approved reference in the repo or through WQ_CHEST_REFERENCE.')

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def mat(name, color, roughness=.4, metal=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = roughness
    bs.inputs['Metallic'].default_value = metal
    return m

M = {
    'tan': mat('Warm honey leather', (.62,.30,.080), .47),
    'light': mat('Leather edge piping', (.85,.51,.205), .42),
    'strap': mat('Caramel travel straps', (.39,.135,.035), .46),
    'stitch': mat('Warm saddle stitching', (.71,.39,.14), .54),
    'gold': mat('Satin golden brass', (.95,.52,.075), .32, .4),
    'goldlight': mat('Embossed gold highlights', (1,.71,.25), .31, .35),
    'navy': mat('Atlas ocean blue enamel', (.028,.125,.265), .43),
    'blue': mat('Globe blue enamel', (.035,.225,.46), .29),
    'grid': mat('Globe silver blue graticule', (.36,.67,.86), .35, .15),
    'inside': mat('Dark suede interior', (.17,.061,.018), .68),
    'paper': mat('Folded parchment route map', (.91,.71,.40), .57),
    'ink': mat('Map route terracotta', (.42,.11,.027), .61),
}

def finish(o, name, material, parent=None):
    o.name = name
    if material: o.data.materials.append(material)
    if parent:
        o.parent = parent
        o.matrix_parent_inverse = parent.matrix_world.inverted()
    if o.type == 'MESH':
        for face in o.data.polygons: face.use_smooth = True
    return o

def cube(name, p, size, material, bevel=.08, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=p)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod=o.modifiers.new('Rounded handcrafted edges', 'BEVEL')
    mod.width=bevel; mod.segments=4
    bpy.ops.object.modifier_apply(modifier=mod.name)
    o.modifiers.new('Surface normals', 'WEIGHTED_NORMAL')
    return finish(o,name,material,parent)

def ball(name,p,size,material,parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=1,location=p)
    o=bpy.context.object; o.scale=size
    return finish(o,name,material,parent)

def curve(name, points, width, material, parent=None, cyclic=False):
    data=bpy.data.curves.new(name,'CURVE'); data.dimensions='3D'
    data.resolution_u=1; data.bevel_depth=width; data.bevel_resolution=2
    spline=data.splines.new('POLY'); spline.points.add(len(points)-1)
    for p,v in zip(spline.points,points): p.co=(*v,1)
    spline.use_cyclic_u=cyclic
    o=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(o)
    return finish(o,name,material,parent)

def empty(name,p=(0,0,0),parent=None):
    o=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(o)
    o.location=p
    bpy.context.view_layer.update()
    if parent:
        o.parent=parent; o.matrix_parent_inverse=parent.matrix_world.inverted()
    return o

root=empty('Explorer chest | animated assembly')
lid=empty('Rear hinge | lid and globe latch',(0,.78,1.39),root)
reward=empty('Earned contents | reveal',parent=root)

def mesh_obj(name,verts,faces,material,parent=None):
    data=bpy.data.meshes.new(name); data.from_pydata(verts,[],faces); data.update()
    o=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(o)
    return finish(o,name,material,parent)

def dome(name,x0,x1,ry,rz,z,material,parent,thickness=.065):
    # Closed hollow half barrel; the gold end caps and inner suede remain editable.
    count=40
    verts=[]
    for x in (x0,x1):
        for inner in (False,True):
            for i in range(count+1):
                a=pi*i/count
                verts.append((x,(ry-thickness if inner else ry)*cos(a),z+(rz-thickness if inner else rz)*sin(a)))
    stride=count+1; faces=[]
    for i in range(count):
        faces += [(i,i+1,2*stride+i+1,2*stride+i),
                  (stride+i,3*stride+i,3*stride+i+1,stride+i+1),
                  (i,stride+i,stride+i+1,i+1),
                  (2*stride+i,2*stride+i+1,3*stride+i+1,3*stride+i)]
    faces += [(0,2*stride,3*stride,stride),(count,stride+count,3*stride+count,2*stride+count)]
    o=mesh_obj(name,verts,faces,material,parent)
    b=o.modifiers.new('Soft dome edges','BEVEL'); b.width=.025; b.segments=3
    return o

# Hollow trunk, visibly inset ocean panels and a warm rolled rim.
cube('Suede floor',(0,0,.33),(2.45,1.51,.19),M['inside'],.09,root)
for x in (-1.22,1.22):
    cube('Leather side shell',(x,0,.85),(.20,1.62,1.06),M['tan'],.11,root)
    cube('Inset side enamel',(x*1.086,0,.86),(.026,1.31,.76),M['navy'],.08,root)
for y in (-.72,.72):
    cube('Leather front and back',(0,y,.85),(2.48,.21,1.06),M['tan'],.10,root)
    cube('Inset navy front panel',(0,y*1.154,.85),(2.20,.036,.77),M['navy'],.07,root)
for y in (-.77,.77):
    cube('Raised body rim',(0,y,1.36),(2.50,.15,.12),M['light'],.055,root)
    cube('Lower piping',(0,y,.36),(2.45,.16,.16),M['light'],.07,root)
for x in (-1.23,1.23):
    cube('Side rim',(x,0,1.36),(.15,1.48,.12),M['light'],.055,root)

# Derive this surface directly from the repo's existing Natural Earth land mask.
# Baking the material into a small texture also makes the GLB portable.
land=bpy.data.images.load(str(LAND)); land.scale(1024,512)
pixels=list(land.pixels); painted=[]
for i in range(0,len(pixels),4):
    mask=pixels[i]
    for ocean,ground in zip((.035,.16,.31),(.78,.48,.19)):
        painted.append(ocean*(1-mask)+ground*mask)
    painted.append(1)
tex=bpy.data.images.new('Natural Earth brass inlay',1024,512,alpha=True)
tex.pixels=painted; tex.filepath_raw=str(OUT/'textures/world-inlay.png'); tex.file_format='PNG'; tex.save()
inlay=mat('Real Natural Earth map inlay',(1,1,1),.48)
node=inlay.node_tree.nodes.new('ShaderNodeTexImage'); node.image=tex
inlay.node_tree.links.new(node.outputs['Color'],inlay.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])

def panel(name,verts,uv):
    o=mesh_obj(name,verts,[(0,1,2,3)],inlay,root)
    layer=o.data.uv_layers.new(name='Map coordinates')
    for poly in o.data.polygons:
        for index in poly.loop_indices: layer.data[index].uv=uv[o.data.loops[index].vertex_index]
    return o
panel('Natural Earth front inlay',[(-1.04,-.858,.48),(1.04,-.858,.48),(1.04,-.858,1.21),(-1.04,-.858,1.21)],[(.03,.16),(.99,.16),(.99,.93),(.03,.93)])
panel('Natural Earth side inlay',[(-1.342,.57,.48),(-1.342,-.57,.48),(-1.342,-.57,1.21),(-1.342,.57,1.21)],[(.02,.16),(.49,.16),(.49,.93),(.02,.93)])

# Broad caramel straps with restrained saddle stitching.
for x in (-.81,.81):
    for y in (-.867,.82):
        cube('Body travel strap',(x,y,.84),(.285,.075,1.05),M['strap'],.045,root)
    for edge in (-.109,.109):
        for z in (.43,.54,.65,.76,.87,.98,1.09,1.20):
            curve('Saddle stitch',[(x+edge,-.909,z),(x+edge,-.91,z+.047)],.009,M['stitch'],root)

# Feet and generously rounded golden bumpers read at small icon sizes.
for x in (-1.13,1.13):
    for y in (-.64,.64):
        ball('Leather bun foot',(x,y,.23),(.245,.23,.16),M['strap'],root)
        cube('Rounded lower brass corner',(x,y*1.13,.46),(.52,.50,.35),M['gold'],.15,root)
        cube('Rounded upper brass corner',(x,y*1.17,1.14),(.43,.43,.44),M['gold'],.13,root)
        ball('Corner brass rivet',(x,y+(-.335 if y<0 else .335),1.20),(.072,.049,.072),M['goldlight'],root)

dome('Warm domed leather lid',-1.29,1.29,.79,.71,1.41,M['tan'],lid)
dome('Suede lining under lid',-1.18,1.18,.695,.62,1.416,M['inside'],lid,.03)
for x in (-1.295,1.295):
    # End face fills the barrel so the lid reads as a soft luggage silhouette.
    verts=[(x,0,1.43)]+[(x,.727*cos(pi*i/32),1.43+.66*sin(pi*i/32)) for i in range(33)]
    mesh_obj('Navy leather lid end',verts,[tuple(range(len(verts)))],M['navy'],lid)
    curve('Lid end leather piping',[(x,.775*cos(pi*i/40),1.415+.70*sin(pi*i/40)) for i in range(41)],.048,M['light'],lid)
for x in (-.81,.81):
    dome('Caramel band over dome',x-.142,x+.142,.817,.738,1.405,M['strap'],lid,.028)
    for edge in (-.112,.112):
        for i in range(22):
            a=pi*(i+.15)/22; b=pi*(i+.70)/22
            curve('Lid saddle stitch',[(x+edge,.838*cos(a),1.405+.762*sin(a)),(x+edge,.838*cos(b),1.405+.762*sin(b))],.009,M['stitch'],lid)
for y in (-.79,.79):
    cube('Lid lower rolled edge',(0,y,1.435),(2.57,.13,.12),M['light'],.055,lid)
for x in (-1.13,1.13):
    for y in (-.67,.67):
        cube('Lid brass protector',(x,y*1.10,1.54),(.43,.43,.35),M['gold'],.13,lid)
        ball('Lid protector rivet',(x,y+(-.293 if y<0 else .293),1.55),(.068,.046,.068),M['goldlight'],lid)
for x in (-.71,.71):
    cube('Rear brass hinge',(x,.84,1.39),(.31,.13,.24),M['gold'],.04,root)

# Large globe latch travels with the lid; its matching catch stays on the body.
cube('Latch receiver',(0,-.894,1.115),(.36,.12,.29),M['gold'],.07,root)
cube('Receiver dark slot',(0,-.963,1.135),(.17,.018,.053),M['inside'],.02,root)
cube('Latch tongue',(0,-.917,1.225),(.24,.095,.30),M['gold'],.055,lid)
ball('Round gold globe bezel',(0,-.91,1.49),(.365,.11,.375),M['gold'],lid)
ball('Domed ocean globe latch',(0,-1.002,1.49),(.292,.085,.306),M['blue'],lid)
def globe_point(lon,lat):
    return (.292*sin(lon)*cos(lat),-1.01-.088*cos(lon)*cos(lat),1.49+.306*sin(lat))
for lon in (-pi/3,0,pi/3):
    curve('Globe meridian',[globe_point(lon,-pi/2+pi*i/32) for i in range(33)],.011,M['grid'],lid)
for lat in (-pi/4,0,pi/4):
    curve('Globe latitude',[globe_point(-pi/2+pi*i/40,lat) for i in range(41)],.011,M['grid'],lid)

def medallion(name,p,r,tilt=0):
    group=empty(name,p,reward)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=r,depth=.105,location=p,rotation=(pi/2,0,0))
    coin=finish(bpy.context.object,'Gold XP medallion',M['gold'],group)
    bevel=coin.modifiers.new('Rounded coin edge','BEVEL'); bevel.width=.025; bevel.segments=3
    curve('Coin embossed rim',[(p[0]+r*.84*cos(a),p[1]-.065,p[2]+r*.84*sin(a)) for a in [2*pi*i/64 for i in range(64)]],.022,M['goldlight'],group,True)
    bpy.ops.object.text_add(location=(p[0],p[1]-.067,p[2]),rotation=(pi/2,0,0))
    txt=bpy.context.object; txt.data.body='XP'; txt.data.align_x='CENTER'; txt.data.align_y='CENTER'; txt.data.size=r*.93; txt.data.extrude=.011; txt.data.bevel_depth=.004
    finish(txt,'Embossed XP letters',M['goldlight'],group)
    group.rotation_euler[1]=tilt
    return group
medallion('Front earned XP',(0,-.27,1.07),.40,-.10)
medallion('Left earned XP',(-.61,-.10,1.035),.33,.12)
medallion('Back earned XP',(.43,.20,1.09),.32,-.08)

# Folded route map: decorative dashed route, no fictitious coastline or borders.
map_root=empty('Folded explorer route map',(.62,-.08,1.08),reward)
verts=[(.19,-.23,.87),(.51,-.29,.90),(.84,-.22,.91),(1.09,-.19,.89),
       (.19,-.01,1.61),(.51,-.07,1.64),(.84,0,1.65),(1.09,.03,1.63)]
paper=mesh_obj('Accordion parchment',verts,[(0,1,5,4),(1,2,6,5),(2,3,7,6)],M['paper'],map_root)
solid=paper.modifiers.new('Parchment thickness','SOLIDIFY'); solid.thickness=.025
bevel=paper.modifiers.new('Soft paper edges','BEVEL'); bevel.width=.018; bevel.segments=3
for i in range(3):
    xa=.25+i*.28
    curve('Route dash',[(xa,-.278+.04*i,1.13+.10*sin(i*2)),(xa+.095,-.28+.04*i,1.16+.10*sin(i*2))],.019,M['ink'],map_root)
for angle in (-.7,.7):
    dx=.075*cos(angle); dz=.075*sin(angle)
    curve('Destination cross',[(.80-dx,-.123,1.47-dz),(.80+dx,-.123,1.47+dz)],.021,M['ink'],map_root)
for x in (.51,.84):
    curve('Map fold line',[(x,-.31 if x<.6 else -.24,.95),(x,-.09 if x<.6 else -.02,1.58)],.008,M['light'],map_root)

def star():
    verts=[]
    for y in (-.045,.045):
        for i in range(10):
            a=pi/2+2*pi*i/10; r=.25 if i%2==0 else .12
            verts.append((-.16+r*cos(a),.18+y,1.88+r*sin(a)))
    faces=[tuple(reversed(range(10))),tuple(range(10,20))]+[(i,(i+1)%10,(i+1)%10+10,i+10) for i in range(10)]
    o=mesh_obj('Small earned gold star',verts,faces,M['goldlight'],reward)
    b=o.modifiers.new('Soft star points','BEVEL'); b.width=.025; b.segments=3
star()

# A single 2-second ceremony. Resting completion is the final pose, never a loop.
for f,angle in [(1,0),(5,.035),(8,-.045),(11,.018),(23,-1.80),(29,-1.69),(35,-1.73),(40,-1.73)]:
    lid.rotation_euler[0]=angle; lid.keyframe_insert(data_path='rotation_euler',frame=f)
for f,z,scale in [(1,.75,.01),(12,.75,.01),(16,.06,.70),(25,.48,1.06),(32,.37,1),(40,.37,1)]:
    reward.location.z=z; reward.scale=(scale,scale,scale)
    reward.keyframe_insert(data_path='location',frame=f); reward.keyframe_insert(data_path='scale',frame=f)
for f,z,a in [(1,0,0),(5,-.022,-.015),(8,.018,.012),(12,0,0),(40,0,0)]:
    root.location.z=z; root.rotation_euler[1]=a
    root.keyframe_insert(data_path='location',frame=f); root.keyframe_insert(data_path='rotation_euler',frame=f)
for o in (root,lid,reward):
    o.animation_data.action.name='Explorer chest opening | '+o.name

scene=bpy.context.scene
scene.frame_start=1; scene.frame_end=40; scene.render.fps=20
scene.frame_set(1)
bpy.ops.object.camera_add(location=(-4.0,-7.6,4.0))
camera=bpy.context.object; target=Vector((0,0,1.48))
camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='PERSP'; camera.data.lens=80
scene.camera=camera
for name,pos,power,size in [('Softbox key',(-3,-4,6),850,4),('Sky fill',(4,-2,3),500,4),('Warm rim',(1,4,5),1050,3)]:
    bpy.ops.object.light_add(type='AREA',location=pos)
    light=bpy.context.object; light.name=name; light.data.energy=power; light.data.shape='DISK'; light.data.size=size
    light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES'; scene.cycles.samples=40; scene.cycles.use_denoising=True
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type='CUDA'; prefs.get_devices()
    gpu=False
    for d in prefs.devices:
        d.use=d.type!='CPU'; gpu=gpu or d.use
    if gpu: scene.cycles.device='GPU'
except Exception: pass
scene.render.resolution_x=640; scene.render.resolution_y=640; scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.world.color=(.35,.35,.35)
scene.view_settings.view_transform='AgX'; scene.view_settings.look='AgX - Medium High Contrast'; scene.view_settings.exposure=-1.1
scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'

# Convert text/curve details so all decorative construction exports into glTF.
for o in list(scene.objects):
    if o.type in {'FONT','CURVE'}:
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o
        bpy.ops.object.convert(target='MESH')
scene.frame_set(1)
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
    if o.type in {'MESH','EMPTY'}: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'explorer-chest.glb'),export_format='GLB',use_selection=True,
    export_animations=True,export_apply=True,export_animation_mode='SCENE',
    export_anim_scene_split_object=False,export_nla_strips_merged_animation_name='Explorer chest opening',
    export_anim_slide_to_zero=True)
bpy.ops.file.pack_all()
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'explorer-chest.blend'))
for name,f in [('closed',1),('opened',40)]:
    scene.frame_set(f); scene.render.filepath=str(OUT/f'{name}.png'); bpy.ops.render.render(write_still=True)
    print('EXPLORER_CHEST_STILL_READY '+name,flush=True)
if not os.environ.get('WQ_CHEST_PREVIEW'):
    scene.render.resolution_x=480; scene.render.resolution_y=480; scene.cycles.samples=64
    for i in range(40):
        scene.frame_set(i+1); scene.render.filepath=str(FRAMES/f'{i:02d}.png'); bpy.ops.render.render(write_still=True)
    print('EXPLORER_CHEST_FILM_READY',flush=True)

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
scene.frame_set(1)
deps=bpy.context.evaluated_depsgraph_get()
triangles=0
for o in scene.objects:
    if o.type=='MESH':
        evaluated=o.evaluated_get(deps); mesh=evaluated.to_mesh(); mesh.calc_loop_triangles(); triangles+=len(mesh.loop_triangles); evaluated.to_mesh_clear()
record={
    'name':'WorldQuest explorer chest','version':'1.0.0','created':'2026-10-02',
    'workflow':'Original procedural Blender geometry from user-approved ImageGen concept. No paid provider jobs.',
    'reference':{'path':'approved-reference.png','sha256':sha(OUT/'approved-reference.png')},
    'conceptPrompt':{'path':'concept-prompt.txt','sha256':sha(OUT/'concept-prompt.txt')} if (OUT/'concept-prompt.txt').exists() else None,
    'geography':{'source':'Natural Earth 1:110m land via world-atlas','license':'Public domain','path':str(LAND.relative_to(ROOT)),'sha256':sha(LAND)},
    'assetLicense':'Original WorldQuest project asset; existing project usage terms apply. Natural Earth land is public domain.',
    'model':{'units':'meters','sourceUp':'Z','glbUp':'Y','triangles':triangles,'glbBytes':(OUT/'explorer-chest.glb').stat().st_size,
             'sha256':sha(OUT/'explorer-chest.glb'),'animationFrames':40,'fps':20},
    'policy':{'maxTriangles':100000,'maxGlbBytes':5242880,'stills':{'size':640,'transparent':True},'film':{'frames':40,'size':480,'columns':8,'rows':5}},
    'validation':{'topologyBudget':triangles<100000,'modelSizeBudget':(OUT/'explorer-chest.glb').stat().st_size<5242880,'blenderVersion':bpy.app.version_string,
                  'renderedStills':True,'renderedAllFrames':not bool(os.environ.get('WQ_CHEST_PREVIEW'))},
}
(OUT/'provenance.json').write_text(json.dumps(record,indent=2)+'\n')
print('EXPLORER_CHEST_MODEL_READY '+json.dumps(record['model']),flush=True)
