"""Atlas, the WorldQuest globe, as a real 3D character.

Run:  blender --background --python scripts/build-globe-mascot.py -- [--stills] [--sheets] [--moods a,b]

Procedural, like build-daylight-models.py and build-expedition-assets.py: no downloaded
mesh, texture or character. Meters, Z up, the character faces -Y.

The continents are IMAGINARY: smooth noise blobs pushed up out of the sphere, kept off
the face. This is a character, never a map (docs/design/asset-prompts.md): no real
coastline, border or country appears on him.

Outputs
- docs/design/assets/world-mascot-3d/atlas.blend           editable master
- docs/design/assets/world-mascot-3d/stills/<mood>.png     640 px transparent stills
- node_modules/.cache/globe-mascot/<mood>/NNN.png          animation frames (packed by
                                                            scripts/build-globe-mascot-art.cjs)
"""
import sys
from math import radians, sin, cos, pi
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector, noise, Matrix

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / 'docs/design/assets/world-mascot-3d'
FRAMES = ROOT / 'node_modules/.cache/globe-mascot'
MASTER.mkdir(parents=True, exist_ok=True)

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
MOOD_ARG = next((a.split('=', 1)[1] for a in ARGS if a.startswith('--moods=')), None)
FRAME_COUNT = 36          # per mood, played at 18 fps: two seconds
FRAME_PX = 320            # one sheet cell
EYE_SCALE = 1.18          # eyes a touch big: cuter, and they read at 64 px
MOUTH_SCALE = 1.35
STILL_PX = 640

BODY_R = 1.0
BODY_Z = 1.38             # body centre height; boots stand on z = 0
FRONT = Vector((0, -1, 0))


# ── materials ────────────────────────────────────────────────────────────────

def principled(name, color, rough=.42, coat=0.0, coat_rough=.25, sss=0.0, emission=None, alpha=1.0, spec=.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True  # still required in 5.2
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = coat_rough
    b.inputs['Specular IOR Level'].default_value = spec
    if sss:
        b.inputs['Subsurface Weight'].default_value = sss
        b.inputs['Subsurface Radius'].default_value = (.4, .6, 1.0)
        b.inputs['Subsurface Scale'].default_value = .05
    if emission:
        b.inputs['Emission Color'].default_value = (*emission, 1)
        b.inputs['Emission Strength'].default_value = 2.5 if name == 'Sparkle' else 1.0
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else None
    m.diffuse_color = (*color, 1)
    return m


def globe_material():
    """Ocean and land from the vertex colours the mesh bakes in, with a toy-like coat."""
    m = bpy.data.materials.new('Globe')
    m.use_nodes = True  # still required in 5.2
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    attr = nt.nodes.new('ShaderNodeVertexColor'); attr.layer_name = 'Col'
    nt.links.new(attr.outputs['Color'], b.inputs['Base Color'])
    rough = nt.nodes.new('ShaderNodeVertexColor'); rough.layer_name = 'Rough'
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(rough.outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Red'], b.inputs['Roughness'])
    b.inputs['Coat Weight'].default_value = .35
    b.inputs['Coat Roughness'].default_value = .22
    b.inputs['Subsurface Weight'].default_value = .08
    b.inputs['Subsurface Radius'].default_value = (.3, .5, 1.0)
    b.inputs['Subsurface Scale'].default_value = .06
    return m


C = {
    'deep': Vector((.002, .06, .42)), 'ocean': Vector((.004, .16, .78)), 'shallow': Vector((.02, .42, .95)),
    'sand': Vector((.95, .78, .36)), 'land': Vector((.10, .55, .03)), 'hill': Vector((.30, .74, .06)),
}


# ── helpers ──────────────────────────────────────────────────────────────────

def smooth(o):
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def link(o, parent=None, mat=None):
    if mat:
        o.data.materials.append(mat)
    if parent:
        o.parent = parent
    return o


def empty(name, loc=(0, 0, 0), parent=None):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.empty_display_size = .1
    o.location = loc
    if parent:
        o.parent = parent
    return o


def sphere(name, loc, scale, mat, parent=None, seg=48, rings=24, subdiv=1):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1, location=(0, 0, 0))
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if subdiv:
        s = o.modifiers.new('Smooth', 'SUBSURF'); s.levels = subdiv; s.render_levels = subdiv
    link(smooth(o), parent, mat)
    o.location = loc
    return o


def tube(name, points, radius, mat, parent=None, taper=None):
    """A soft rounded stroke (brows, arcs, lash lines) along a bezier through `points`."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = 6
    cu.use_fill_caps = True
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(points) - 1)
    for bp, p in zip(sp.bezier_points, points):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    if taper:
        for bp, r in zip(sp.bezier_points, taper):
            bp.radius = r
    o = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(o)
    link(o, parent, mat)
    return o


def surface_point(direction, lift=0.0):
    """A point on the body, in body space, along a direction from its centre."""
    d = Vector(direction).normalized()
    return d * (BODY_R + lift), d


def facing(direction):
    """Rotation that turns local -Y (a part's front) to face along `direction`."""
    return Vector(direction).normalized().to_track_quat('-Y', 'Z').to_euler()


def flat_shape(name, outline, mat, parent, direction, lift, thickness=.02, scale=1.0):
    """A flat 2D shape (x right, z up), bent onto the sphere at `direction`, with depth."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    verts = [bm.verts.new((x * scale, 0, z * scale)) for x, z in outline]
    bm.faces.new(verts)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    # Many small faces so the shrinkwrap can bend it round the ball. Done on this mesh
    # alone: an edit-mode subdivide once caught the whole selected globe (45 GB).
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=3, use_grid_fill=True)
    bm.to_mesh(mesh); bm.free()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    o.parent = parent
    p, d = surface_point(direction, lift)
    o.location = p
    o.rotation_euler = facing(d)
    sw = o.modifiers.new('Onto the globe', 'SHRINKWRAP')
    sw.target = BODY
    sw.wrap_method = 'NEAREST_SURFACEPOINT'
    sw.offset = lift
    so = o.modifiers.new('Depth', 'SOLIDIFY'); so.thickness = thickness; so.offset = 1
    sub = o.modifiers.new('Soft', 'SUBSURF'); sub.levels = 1; sub.render_levels = 2
    link(smooth(o), None, mat)
    return o


def arc(a0, a1, rx, rz, n=24, cx=0.0, cz=0.0):
    return [(cx + rx * cos(radians(a)), cz + rz * sin(radians(a))) for a in [a0 + (a1 - a0) * i / (n - 1) for i in range(n)]]


# ── build ────────────────────────────────────────────────────────────────────

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def build():
    global BODY
    clear()
    M = {
        'globe': globe_material(),
        'eye': principled('Eye white', (.97, .98, 1.0), rough=.12, coat=1.0, coat_rough=.05),
        'iris': principled('Iris', (.06, .36, .95), rough=.2, coat=1.0, coat_rough=.03),
        'pupil': principled('Pupil', (.004, .012, .05), rough=.15, coat=1.0, coat_rough=.02),
        'glint': principled('Glint', (1, 1, 1), emission=(1, 1, 1), rough=.1),
        'ink': principled('Ink', (.012, .03, .11), rough=.45),
        'mouth': principled('Mouth', (.10, .012, .03), rough=.55),
        'tongue': principled('Tongue', (.98, .30, .30), rough=.35, sss=.2),
        'teeth': principled('Teeth', (.98, .97, .95), rough=.25, coat=.4),
        'blush': principled('Blush', (1.0, .38, .5), rough=.6, alpha=.55),
        'scarf': principled('Scarf', (1.0, .16, .05), rough=.58, sss=.1),
        'scarfDark': principled('Scarf shade', (.78, .16, .08), rough=.66),
        'skin': principled('Arm', (.006, .17, .80), rough=.35, coat=.35, coat_rough=.22, sss=.08),
        'boot': principled('Boot', (1.0, .52, .01), rough=.32, coat=.5, coat_rough=.15),
        'sole': principled('Sole', (.62, .30, .02), rough=.6),
        'lace': principled('Lace', (.98, .92, .8), rough=.5),
        'tear': principled('Tear', (.55, .85, 1.0), rough=.02, coat=1.0, coat_rough=.0, alpha=.85),
        'spark': principled('Sparkle', (1.0, .78, .12), emission=(1.0, .7, .1), rough=.2),
        'zzz': principled('Zzz', (.16, .36, .74), rough=.4, coat=.6),
    }

    rig = empty('Atlas')                                   # root: position, squash, lean
    rig.location = (0, 0, 0)
    hips = empty('Hips', (0, 0, .55), rig)                 # squash and stretch pivot
    body = empty('Body', (0, 0, BODY_Z - .55), hips)       # tilt and nod about the centre

    # The globe: an icosphere with raised imaginary continents baked in as geometry and
    # vertex colours, so the land has real relief that the key light can catch.
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=7, radius=BODY_R, location=(0, 0, 0))
    g = bpy.context.object
    g.name = 'Globe'
    g.parent = body
    me = g.data
    col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    rough = me.color_attributes.new('Rough', 'FLOAT_COLOR', 'POINT')
    face_dir = Vector((0, -1, .12)).normalized()
    seed = Vector((3.1, 7.7, 1.9))
    for v in me.vertices:
        d = v.co.normalized()
        n = noise.fractal(d * 1.35 + seed, 1.0, 2.1, 4, noise_basis='PERLIN_ORIGINAL')
        n += .35 * noise.noise(d * 3.2 + seed * 2)
        facing_camera = max(0.0, d.dot(face_dir))
        n -= 1.2 * max(0.0, min(1.0, (facing_camera - .45) / .35)) ** 2      # keep the face at sea
        n += .18 * max(0.0, abs(d.z) - .6)                                      # a little land near the poles
        n += .22 * max(0.0, -d.x) * max(0.0, d.z + .2)                          # and up on his left, where the key light lands
        t = .12
        land = max(0.0, min(1.0, (n - t) / .07))
        hill = max(0.0, min(1.0, (n - t - .18) / .2))
        v.co = d * (BODY_R + .045 * land + .02 * hill)
        if n < t - .12:
            c = C['deep'].lerp(C['ocean'], max(0.0, min(1.0, (n - (t - .5)) / .38)))
        elif n < t - .015:
            c = C['ocean'].lerp(C['shallow'], (n - (t - .12)) / .105)
        elif n < t + .012:
            c = C['sand']
        else:
            c = C['land'].lerp(C['hill'], hill)
        col.data[v.index].color = (*c, 1)
        r = .38 if land < .5 else .6
        rough.data[v.index].color = (r, r, r, 1)
    me.update()
    smooth(g)
    g.data.materials.append(M['globe'])
    g.scale = (1.0, .96, 1.02)
    BODY = g

    # Eyes: glossy eyeballs set into the ocean face, iris and pupil on a gaze pivot,
    # two glints, and real lids that close over them.
    eyes = {}
    for side, x, z, tilt in [('L', -.34, .18, 9), ('R', .30, .23, -6)]:
        d = Vector((x, -1, z)).normalized()
        centre = d * (BODY_R * .9)
        socket = empty(f'Eye{side}', centre, body)
        socket.rotation_euler = facing(d)
        socket.rotation_euler.y += radians(tilt)
        socket.scale = (EYE_SCALE,) * 3
        ball = sphere(f'Eyeball{side}', (0, 0, 0), (.22, .17, .29), M['eye'], socket, subdiv=2)
        gaze = empty(f'Gaze{side}', (0, 0, 0), socket)
        iris = sphere(f'Iris{side}', (0, -.12, -.02), (.125, .06, .165), M['iris'], gaze, subdiv=2)
        pupil = sphere(f'Pupil{side}', (0, -.162, -.02), (.072, .03, .1), M['pupil'], gaze, subdiv=2)
        g1 = sphere(f'Glint{side}', (.045, -.19, .06), (.034, .012, .042), M['glint'], gaze, subdiv=1)
        g2 = sphere(f'GlintSmall{side}', (-.035, -.186, -.075), (.016, .008, .016), M['glint'], gaze, subdiv=1)
        # Lid: the upper half of a shell slightly larger than the eye, hinged at its centre.
        lid = empty(f'Lid{side}', (0, 0, 0), socket)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1, location=(0, 0, 0))
        shell = bpy.context.object
        shell.name = f'LidShell{side}'
        bm = bmesh.new(); bm.from_mesh(shell.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -.02], context='VERTS')
        bm.to_mesh(shell.data); bm.free()
        shell.scale = (.245, .205, .315)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        so = shell.modifiers.new('Lid thickness', 'SOLIDIFY'); so.thickness = .018
        sub = shell.modifiers.new('Soft', 'SUBSURF'); sub.levels = 1; sub.render_levels = 2
        link(smooth(shell), lid, M['skin'])
        lash = tube(f'Lash{side}', [(-.24, 0, 0), (-.14, -.17, 0), (0, -.21, 0), (.14, -.17, 0), (.24, 0, 0)], .016, M['ink'], lid)
        lid.rotation_euler.x = radians(-80)              # open: tucked up behind the brow
        # Happy eye: a closed, smiling arc, shown instead of the eyeball when delighted.
        happy = tube(f'HappyEye{side}', [(-.2, -.2, -.06), (-.1, -.25, .08), (0, -.27, .12), (.1, -.25, .08), (.2, -.2, -.06)], .03, M['ink'], socket)
        happy.hide_render = True
        eyes[side] = dict(socket=socket, gaze=gaze, lid=lid, parts=[ball, iris, pupil, g1, g2], happy=happy)

    # Brows, on their own pivots so they can rise in surprise.
    brows = {}
    for side, x, z, flip in [('L', -.36, .56, 1), ('R', .31, .60, -1)]:
        d = Vector((x, -1, z)).normalized()
        piv = empty(f'Brow{side}', d * (BODY_R + .025), body)
        piv.rotation_euler = facing(d)
        brow = tube(f'BrowStroke{side}', [(-.15, 0, -.02 * flip), (0, 0, .045), (.15, 0, .02 * flip)], .03, M['ink'], piv, taper=[.6, 1.0, .7])
        brows[side] = dict(piv=piv, rest=piv.location.copy())

    # Mouths: one of each shape, bent onto the face; a mood shows exactly one.
    mouth_dir = Vector((-.02, -1, -.33))
    mouths = {}
    smile = flat_shape('MouthSmile', arc(200, 340, .25, .2, cz=.1) + arc(330, 210, .2, .12, cz=.08), M['mouth'], body, mouth_dir, .012, scale=MOUTH_SCALE)
    flat_shape('SmileTongue', arc(210, 330, .12, .07, cz=-.04) + [(.1, -.02), (-.1, -.02)], M['tongue'], smile, mouth_dir + Vector((0, 0, -.04)), .02, thickness=.01, scale=MOUTH_SCALE)
    mouths['smile'] = smile
    laugh_outline = [(-.3, .05), (.3, .05)] + arc(355, 185, .3, .3, cz=.05)
    laugh = flat_shape('MouthLaugh', laugh_outline, M['mouth'], body, mouth_dir, .012, scale=MOUTH_SCALE)
    flat_shape('LaughTeeth', [(-.27, .05), (.27, .05), (.25, -.02), (-.25, -.02)], M['teeth'], laugh, mouth_dir + Vector((0, 0, .07)), .026, thickness=.012, scale=MOUTH_SCALE)
    flat_shape('LaughTongue', arc(200, 340, .16, .1, cz=-.13), M['tongue'], laugh, mouth_dir + Vector((0, 0, -.16)), .024, thickness=.012, scale=MOUTH_SCALE)
    mouths['laugh'] = laugh
    mouths['o'] = flat_shape('MouthO', arc(0, 359, .09, .12, n=32), M['mouth'], body, mouth_dir, .012, scale=MOUTH_SCALE)
    mouths['gentle'] = tube('MouthGentle', [(-.16, 0, .02), (0, 0, -.06), (.16, 0, .02)], .022, M['ink'], None)
    mouths['smirk'] = tube('MouthSmirk', [(-.17, 0, -.01), (0, 0, -.05), (.14, 0, .02), (.2, 0, .08)], .024, M['ink'], None)
    mouths['think'] = tube('MouthThink', [(-.08, 0, 0), (.08, 0, .015)], .022, M['ink'], None)
    for key in ('gentle', 'smirk', 'think'):
        o = mouths[key]
        p, d = surface_point(mouth_dir, .02)
        o.parent = body; o.location = p; o.rotation_euler = facing(d); o.scale = (MOUTH_SCALE,) * 3

    # Cheeks: a soft blush on the ocean.
    for side, x in [('L', -.55), ('R', .5)]:
        flat_shape(f'Cheek{side}', arc(0, 359, .13, .075, n=24), M['blush'], body, Vector((x, -1, -.08)), .006, thickness=.002)

    # Bandana: a folded triangle across the lower front, a knot, two tails.
    band = flat_shape('Bandana', [(-.72, .06), (.62, .16), (.56, .02), (.12, -.52), (-.66, -.08)], M['scarf'], body, Vector((0, -1, -.72)), .03, thickness=.035)
    flat_shape('BandanaFold', [(-.62, .02), (.56, .1), (.5, .06), (-.6, -.02)], M['scarfDark'], body, Vector((0, -1, -.66)), .07, thickness=.012)
    knot = sphere('Knot', surface_point(Vector((-.62, -1, -.6)), .05)[0], (.1, .08, .09), M['scarf'], body, subdiv=2)
    for i, (dx, dz) in enumerate([(-.14, -.1), (-.02, -.2)]):
        tail = sphere(f'Tail{i}', knot.location + Vector((dx, -.02, dz)), (.07, .04, .14), M['scarf'], body, subdiv=2)
        tail.rotation_euler.y = radians(35 if i == 0 else -15)

    # Arms: a short sleeve into a round mitten, on shoulder pivots.
    arms = {}
    for side, x, sign in [('L', -.93, -1), ('R', .93, 1)]:
        shoulder = empty(f'Shoulder{side}', (x, -.05, -.18), body)
        sphere(f'Upper{side}', (sign * .12, 0, -.1), (.13, .12, .2), M['skin'], shoulder, subdiv=2).rotation_euler.y = radians(sign * -35)
        hand = sphere(f'Mitten{side}', (sign * .3, -.02, -.34), (.17, .15, .19), M['skin'], shoulder, subdiv=2)
        sphere(f'Thumb{side}', (sign * .22, -.12, -.26), (.07, .06, .09), M['skin'], shoulder, subdiv=2)
        shoulder.rotation_euler.y = radians(sign * 15)
        arms[side] = shoulder

    # Legs and boots: short and sturdy, planted.
    for side, x in [('L', -.3), ('R', .3)]:
        bpy.ops.mesh.primitive_cylinder_add(radius=.1, depth=.34, location=(x, 0, .3))
        leg = bpy.context.object; leg.name = f'Leg{side}'
        link(smooth(leg), hips, M['skin']); leg.location = (x, 0, -.25)
        boot = sphere(f'Boot{side}', (x, -.08, .12), (.21, .3, .15), M['boot'], rig, subdiv=2)
        sole = sphere(f'Sole{side}', (x, -.08, .05), (.22, .31, .06), M['sole'], rig, subdiv=2)
        sphere(f'BootCuff{side}', (x, 0, .24), (.13, .13, .06), M['boot'], rig, subdiv=2)
        for i in range(2):
            sphere(f'Lace{side}{i}', (x + (-.05 if i else .05), -.27, .2), (.025, .02, .025), M['lace'], rig, subdiv=1)

    # Extras, hidden unless a mood shows them.
    extras = {}
    tears = []
    for side, x, z in [('L', -.62, .12), ('R', .58, .18)]:
        t = sphere(f'Tear{side}', surface_point(Vector((x, -1, z)), .06)[0], (.05, .04, .075), M['tear'], body, subdiv=2)
        tears.append(t)
    extras['tears'] = tears
    sparks = []
    for i, (x, z, s) in enumerate([(-1.25, 2.6, .16), (1.2, 2.75, .12), (1.35, 2.05, .09), (-1.35, 1.75, .08)]):
        verts, faces = [], []
        for k in range(8):
            a = pi / 2 + k * pi / 4
            r = s if k % 2 == 0 else s * .3
            verts.append((cos(a) * r, 0, sin(a) * r))
        verts.append((0, -s * .25, 0)); verts.append((0, s * .25, 0))
        for k in range(8):
            faces.append((k, (k + 1) % 8, 8)); faces.append(((k + 1) % 8, k, 9))
        mesh = bpy.data.meshes.new(f'Spark{i}'); mesh.from_pydata(verts, [], faces); mesh.update()
        o = bpy.data.objects.new(f'Spark{i}', mesh); bpy.context.collection.objects.link(o)
        o.location = (x, -.6, z); link(o, rig, M['spark'])
        sparks.append(o)
    extras['sparkles'] = sparks
    zs = []
    for i, (x, z, s) in enumerate([(.95, 2.55, .32), (1.3, 2.95, .24), (1.55, 3.25, .18)]):
        cu = bpy.data.curves.new(f'Z{i}', 'FONT'); cu.body = 'Z'; cu.extrude = .04; cu.bevel_depth = .015; cu.align_x = 'CENTER'
        o = bpy.data.objects.new(f'Z{i}', cu); bpy.context.collection.objects.link(o)
        o.location = (x, -.8, z); o.rotation_euler = (radians(90), 0, radians(-8)); o.scale = (s, s, s)
        link(o, rig, M['zzz']); zs.append(o)
    extras['zzz'] = zs

    rig.rotation_euler.z = radians(-14)     # a three-quarter turn, so he reads as round
    return dict(rig=rig, hips=hips, body=body, eyes=eyes, brows=brows, mouths=mouths, arms=arms, extras=extras)


# ── stage ────────────────────────────────────────────────────────────────────

def stage(px):
    scene = bpy.context.scene
    world = bpy.data.worlds.new('Soft sky'); scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (.62, .78, 1.0, 1)
    bg.inputs['Strength'].default_value = .32
    cam_data = bpy.data.cameras.new('Camera'); cam_data.type = 'ORTHO'; cam_data.ortho_scale = 3.7
    cam = bpy.data.objects.new('Camera', cam_data); scene.collection.objects.link(cam)
    cam.location = (.9, -9, 2.9)
    look = Vector((0, 0, 1.45))
    cam.rotation_euler = (look - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    for name, pos, power, size, color in [
        ('Key', (-4, -5, 6.5), 900, 4.5, (1.0, .96, .9)),
        ('Fill', (5, -6, 2.5), 260, 6, (.85, .92, 1.0)),
        ('Rim', (3.5, 5, 4.5), 700, 3, (.7, .85, 1.0)),
        ('Top', (0, 0, 8), 220, 5, (1, 1, 1)),
    ]:
        ld = bpy.data.lights.new(name, 'AREA'); ld.energy = power; ld.shape = 'DISK'; ld.size = size; ld.color = color
        lo = bpy.data.objects.new(name, ld); scene.collection.objects.link(lo); lo.location = pos
        lo.rotation_euler = (look - lo.location).to_track_quat('-Z', 'Y').to_euler()
    # A shadow catcher under the boots, so he stands on something.
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=1.1, fill_type='NGON', location=(0, -.05, 0))
    floor = bpy.context.object; floor.name = 'Shadow'; floor.is_shadow_catcher = True
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.cycles.device = 'GPU' if bpy.context.preferences.addons.get('cycles') else 'CPU'
    scene.render.film_transparent = True
    scene.render.resolution_x = px; scene.render.resolution_y = px
    scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Punchy'
    scene.render.fps = 18
    scene.frame_start = 1; scene.frame_end = FRAME_COUNT


# ── faces ────────────────────────────────────────────────────────────────────

MOODS = ['welcome', 'celebrate', 'thinking', 'resting', 'encouraging', 'laughing', 'surprised', 'proud', 'sleepy', 'wink']

# What each mood looks like at rest: the still under Reduce Motion, and the pose every
# animation starts and ends on. lids: degrees (-80 open, 0 half, 85 shut).
FACE = {
    'welcome':     dict(mouth='smile',  eyes='open',  lids=(-80, -80), brow=0,    pupil=1.0, extras=()),
    'celebrate':   dict(mouth='laugh',  eyes='happy', lids=(-80, -80), brow=.02,  pupil=1.0, extras=('sparkles',)),
    'thinking':    dict(mouth='think',  eyes='open',  lids=(-80, -80), brow=.03,  pupil=.95, extras=()),
    'resting':     dict(mouth='gentle', eyes='happy', lids=(-80, -80), brow=0,    pupil=1.0, extras=()),
    'encouraging': dict(mouth='gentle', eyes='open',  lids=(-80, -80), brow=.015, pupil=1.05, extras=()),
    'laughing':    dict(mouth='laugh',  eyes='happy', lids=(-80, -80), brow=.03,  pupil=1.0, extras=('tears',)),
    'surprised':   dict(mouth='o',      eyes='open',  lids=(-95, -95), brow=.09,  pupil=.78, extras=()),
    'proud':       dict(mouth='smirk',  eyes='open',  lids=(-5, -5),   brow=-.01, pupil=1.0, extras=('sparkles',)),
    'sleepy':      dict(mouth='gentle', eyes='open',  lids=(12, 12),   brow=-.02, pupil=1.0, extras=('zzz',)),
    'wink':        dict(mouth='smile',  eyes='open',  lids=(-80, -80), brow=0,    pupil=1.0, extras=()),
}


def apply_face(parts, mood):
    f = FACE[mood]
    for key, o in parts['mouths'].items():
        show = key == f['mouth']
        for x in [o, *o.children_recursive]:
            x.hide_render = not show; x.hide_viewport = not show
    for side, eye in parts['eyes'].items():
        happy = f['eyes'] == 'happy'
        eye['happy'].hide_render = not happy
        for x in [*eye['parts'], eye['lid'], *eye['lid'].children_recursive]:
            x.hide_render = happy
        eye['lid'].rotation_euler.x = radians(f['lids'][0 if side == 'L' else 1])
        # Across the face only: shrinking in depth too would sink the pupil into the eyeball.
        eye['gaze'].scale = (f['pupil'], 1, f['pupil'])
    for side, brow in parts['brows'].items():
        brow['piv'].location = brow['rest'] + Vector((0, 0, f['brow']))
    for key, objs in parts['extras'].items():
        for o in objs:
            o.hide_render = key not in f['extras']


if __name__ == '__main__':
    parts = build()
    stage(STILL_PX)
    bpy.ops.wm.save_as_mainfile(filepath=str(MASTER / 'atlas.blend'))
    moods = MOOD_ARG.split(',') if MOOD_ARG else MOODS
    if '--stills' in ARGS or not ARGS:
        (MASTER / 'stills').mkdir(exist_ok=True)
        for mood in moods:
            apply_face(parts, mood)
            bpy.context.scene.render.filepath = str(MASTER / 'stills' / f'{mood}.png')
            bpy.ops.render.render(write_still=True)
            print(f'STILL_READY {mood}', flush=True)
    if '--sheets' in ARGS:
        sys.path.insert(0, str(Path(__file__).parent))
        from globe_mascot_acting import act
        scene = bpy.context.scene
        scene.render.resolution_x = scene.render.resolution_y = FRAME_PX
        scene.cycles.samples = 40
        for mood in moods:
            for o in bpy.data.objects:
                o.animation_data_clear()
            apply_face(parts, mood)
            act(parts, mood)
            dest = FRAMES / mood
            dest.mkdir(parents=True, exist_ok=True)
            for frame in range(1, FRAME_COUNT + 1):
                scene.frame_set(frame)
                scene.render.filepath = str(dest / f'{frame - 1:03d}.png')
                bpy.ops.render.render(write_still=True)
            print(f'SHEET_FRAMES_READY {mood}', flush=True)
