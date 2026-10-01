"""Atlas, the WorldQuest globe explorer, as a production 3D character.

Run:  blender --background --python scripts/build-globe-mascot.py -- [--stills] [--sheets] [--moods=a,b]

Built to the canonical design in docs/design/world-mascot.md (the owner's master
character sheet, September 30): a near-spherical Earth body with raised continents, a
face set into the ocean, short blue arms with mitten hands, very short legs in chunky
mustard boots, a sand explorer hat with a globe badge, and a small tan backpack.

Procedural, like build-daylight-models.py: no downloaded mesh or character. The land is
Natural Earth 1:110m (public domain, via world-atlas), painted by
build-globe-mascot-land.cjs — the only allowed source of continent shapes
(docs/design/asset-prompts.md). Land only, no borders.

Meters, Z up, the character faces -Y. Named parts follow the brief's rig list
(GlobeBody, Eye_L, Pupil_L, Eyelid_L, Brow_L, Mouth, Arm_L, Hand_L, Boot_L, Hat,
HatBadge, Backpack …) so a later rig pass can pick them up by name.

Outputs
- docs/design/assets/world-mascot-3d/atlas.blend           editable master
- docs/design/assets/world-mascot-3d/stills/<mood>.png     transparent stills
- node_modules/.cache/globe-mascot/<mood>/NNN.png          animation frames (packed by
                                                            scripts/build-globe-mascot-art.cjs)
"""
import sys
from math import radians, cos, sin, pi
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / 'docs/design/assets/world-mascot-3d'
FRAMES = ROOT / 'node_modules/.cache/globe-mascot'
MASTER.mkdir(parents=True, exist_ok=True)

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
MOOD_ARG = next((a.split('=', 1)[1] for a in ARGS if a.startswith('--moods=')), None)
FRAME_COUNT = 36          # per mood, played at 18 fps: two seconds
FRAME_PX = 400            # rendered, then downsampled to the sheet cell
STILL_PX = 1024

BODY_R = 1.0
BODY_Z = 1.46             # globe centre height; boots stand on z = 0
FACE_LON = -28.0          # the meridian that faces the camera: mid-Atlantic, so the face sits at sea
BODY = None


# ── materials ────────────────────────────────────────────────────────────────

def principled(name, color, rough=.45, coat=0.0, coat_rough=.25, sss=0.0, emission=None, sheen=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True  # still required in 5.2
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = coat_rough
    b.inputs['Sheen Weight'].default_value = sheen
    if sss:
        b.inputs['Subsurface Weight'].default_value = sss
        b.inputs['Subsurface Radius'].default_value = (.5, .6, 1.0)
        b.inputs['Subsurface Scale'].default_value = .04
    if emission:
        b.inputs['Emission Color'].default_value = (*emission, 1)
        b.inputs['Emission Strength'].default_value = 2.5 if name == 'Sparkle' else 1.0
    m.diffuse_color = (*color, 1)
    return m


def globe_material():
    """Satin ocean, fresh green land, shallows where the soft mask rises towards a coast."""
    m = bpy.data.materials.new('Earth')
    m.use_nodes = True  # still required in 5.2
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    uv = nt.nodes.new('ShaderNodeTexCoord')
    crisp = nt.nodes.new('ShaderNodeTexImage'); crisp.image = bpy.data.images.load(str(MASTER / 'land.png'))
    soft = nt.nodes.new('ShaderNodeTexImage'); soft.image = bpy.data.images.load(str(MASTER / 'land-soft.png'))
    for t in (crisp, soft):
        t.image.colorspace_settings.name = 'Non-Color'
        nt.links.new(uv.outputs['UV'], t.inputs['Vector'])
    ocean = nt.nodes.new('ShaderNodeValToRGB')           # deep → shallow by the soft mask
    ocean.color_ramp.elements[0].color = (.006, .19, .78, 1)
    ocean.color_ramp.elements[1].position = .5
    ocean.color_ramp.elements[1].color = (.03, .40, .98, 1)
    nt.links.new(soft.outputs['Color'], ocean.inputs['Fac'])
    land = nt.nodes.new('ShaderNodeValToRGB')            # coast → interior a touch lighter
    land.color_ramp.elements[0].color = (.12, .52, .07, 1)
    land.color_ramp.elements[1].color = (.28, .70, .12, 1)
    nt.links.new(soft.outputs['Color'], land.inputs['Fac'])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    nt.links.new(crisp.outputs['Color'], mix.inputs['Factor'])
    nt.links.new(ocean.outputs['Color'], mix.inputs['A'])
    nt.links.new(land.outputs['Color'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    rough = nt.nodes.new('ShaderNodeMapRange')           # ocean glossier than land
    rough.inputs['To Min'].default_value = .26
    rough.inputs['To Max'].default_value = .5
    nt.links.new(crisp.outputs['Color'], rough.inputs['Value'])
    nt.links.new(rough.outputs['Result'], b.inputs['Roughness'])
    b.inputs['Coat Weight'].default_value = .4
    b.inputs['Coat Roughness'].default_value = .2
    b.inputs['Subsurface Weight'].default_value = .05
    return m


# ── helpers ──────────────────────────────────────────────────────────────────

def smooth(o):
    if o.type == 'MESH':
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


def sphere(name, loc, scale, mat, parent=None, subdiv=2):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1, location=(0, 0, 0))
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if subdiv:
        s = o.modifiers.new('Smooth', 'SUBSURF'); s.levels = 1; s.render_levels = subdiv
    link(smooth(o), parent, mat)
    o.location = loc
    return o


def rounded_box(name, loc, size, mat, parent=None, bevel=.08):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    b = o.modifiers.new('Soft edges', 'BEVEL'); b.width = bevel; b.segments = 6
    s = o.modifiers.new('Smooth', 'SUBSURF'); s.levels = 1; s.render_levels = 2
    link(smooth(o), parent, mat)
    o.location = loc
    return o


def tube(name, points, radius, mat, parent=None, taper=None):
    """A soft rounded stroke along a bezier: brows, lash lines, closed mouths, straps."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = 8
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
    d = Vector(direction).normalized()
    return d * (BODY_R + lift), d


def facing(direction):
    """Rotation that turns a part's local -Y to face along `direction`."""
    return Vector(direction).normalized().to_track_quat('-Y', 'Z').to_euler()


def bend(x, z):
    """A point on a feature's local plane, pushed back onto the sphere (about r²/2)."""
    return (x, (x * x + z * z) / 2 / BODY_R, z)


def arc(a0, a1, rx, rz, n=24, cx=0.0, cz=0.0):
    return [(cx + rx * cos(radians(a)), cz + rz * sin(radians(a))) for a in [a0 + (a1 - a0) * i / (n - 1) for i in range(n)]]


def flat_shape(name, outline, mat, parent, direction, lift, thickness=.02):
    """A flat 2D shape (x right, z up), bent onto the sphere at `direction`, with depth."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    verts = [bm.verts.new((x, 0, z)) for x, z in outline]
    face = bm.faces.new(verts)
    face.normal_update()
    if face.normal.y > 0:
        face.normal_flip()
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    # Subdivided on this mesh alone, so the shrinkwrap can bend it round the ball.
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


def pivot_on(name, direction, parent, lift=0.0):
    """An empty on the ball's surface whose local -Y points out along `direction`."""
    p, d = surface_point(direction, lift)
    o = empty(name, p, parent)
    o.rotation_euler = facing(d)
    return o


def decal(name, parent, w, h, depth, mat, cx=0.0, cz=0.0, top=None, smile=0.0, front=0.0):
    """A soft lozenge on a surface pivot: mouths, tongues, teeth, blush."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=1, location=(0, 0, 0))
    o = bpy.context.object
    o.name = name
    bm = bmesh.new(); bm.from_mesh(o.data)
    for v in bm.verts:
        x, y, z = v.co
        if top is not None:
            z = min(z, top)
        z += smile * x * x
        x, z = cx + x * w, cz + z * h
        v.co = (x, y * depth - front + (x * x + z * z) / 2 / BODY_R, z)
    bm.to_mesh(o.data); bm.free()
    sub = o.modifiers.new('Soft', 'SUBSURF'); sub.levels = 1; sub.render_levels = 2
    link(smooth(o), parent, mat)
    return o


def cut_below(o, z):
    """Keep the top of a primitive: eyelid shells, the hat crown."""
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < z], context='VERTS')
    bm.to_mesh(o.data); bm.free()


# ── build ────────────────────────────────────────────────────────────────────

def build():
    global BODY
    bpy.ops.wm.read_factory_settings(use_empty=True)
    M = {
        'earth': globe_material(),
        'skin': principled('Arm blue', (.02, .25, .88), rough=.34, coat=.4, coat_rough=.2, sss=.06),
        'eye': principled('Eye white', (1, 1, 1), rough=.12, coat=1, coat_rough=.04, sss=.2),
        'iris': principled('Iris', (.16, .26, .42), rough=.2, coat=1, coat_rough=.03),
        'pupil': principled('Pupil', (.006, .012, .045), rough=.12, coat=1, coat_rough=.02),
        'glint': principled('Glint', (1, 1, 1), emission=(1, 1, 1), rough=.1),
        'ink': principled('Brow navy', (.008, .02, .085), rough=.45),
        'mouth': principled('Mouth', (.26, .018, .05), rough=.5),
        'tongue': principled('Tongue', (1.0, .36, .40), rough=.35, sss=.25),
        'teeth': principled('Teeth', (.98, .97, .95), rough=.25, coat=.4),
        'blush': principled('Blush', (1.0, .42, .52), rough=.6),
        'hat': principled('Hat felt', (.5, .36, .18), rough=.78, sheen=.6),
        'band': principled('Hat band', (.20, .10, .045), rough=.55),
        'gold': principled('Badge rim', (1.0, .72, .22), rough=.25, coat=.6),
        'green': principled('Badge land', (.2, .72, .12), rough=.35, coat=.4),
        'badge': principled('Badge sea', (.03, .38, .98), rough=.25, coat=.6),
        'boot': principled('Boot', (.86, .43, .0), rough=.42, coat=.35, coat_rough=.2),
        'sole': principled('Sole', (.97, .93, .84), rough=.55),
        'lace': principled('Lace', (.55, .34, .12), rough=.5),
        'pack': principled('Backpack', (.52, .33, .16), rough=.6, sheen=.3),
        'packLight': principled('Backpack flap', (.68, .47, .26), rough=.6, sheen=.3),
        'strap': principled('Strap', (.32, .19, .08), rough=.5),
        'mat': principled('Rolled mat', (.86, .74, .55), rough=.7, sheen=.4),
        'buckle': principled('Buckle', (.8, .62, .3), rough=.3, coat=.5),
        'tear': principled('Tear', (.55, .85, 1.0), rough=.02, coat=1),
        'spark': principled('Sparkle', (1.0, .78, .12), emission=(1.0, .7, .1), rough=.2),
        'zzz': principled('Zzz', (.16, .36, .74), rough=.4, coat=.6),
    }

    rig = empty('Atlas')
    hips = empty('Hips', (0, 0, .42), rig)                 # squash-and-stretch pivot, at the legs
    body = empty('Body', (0, 0, BODY_Z - .42), hips)       # tilt and nod about the globe's centre

    # GlobeBody: a UV sphere so the equirectangular land mask maps straight onto it,
    # continents raised by the soft mask into rounded banks the key light rolls over.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=256, ring_count=128, radius=BODY_R, location=(0, 0, 0))
    g = bpy.context.object; g.name = 'GlobeBody'
    g.parent = body
    tex = bpy.data.textures.new('Land relief', 'IMAGE')
    tex.image = bpy.data.images.load(str(MASTER / 'land-soft.png'))
    tex.image.colorspace_settings.name = 'Non-Color'
    disp = g.modifiers.new('LandMass relief', 'DISPLACE')
    disp.texture = tex; disp.texture_coords = 'UV'; disp.strength = .04; disp.mid_level = 0
    sub = g.modifiers.new('Soft', 'SUBSURF'); sub.levels = 1; sub.render_levels = 2
    link(smooth(g), None, M['earth'])
    # Slightly wider than tall, as the brief asks, and the Atlantic turned to face us.
    g.scale = (1.03, 1.0, .97)
    g.rotation_euler.z = radians(-90 - FACE_LON)
    BODY = g

    # Eyes: white, with a big deep-navy pupil, a hint of blue-grey iris, two glints,
    # set a touch into the sphere so the eyelids can close over them.
    eyes = {}
    for side, x, z, tilt in [('L', -.33, .2, 6), ('R', .33, .2, -6)]:
        d = Vector((x, -1, z)).normalized()
        socket = empty(f'Eye_{side}', d * (BODY_R * .92), body)
        socket.rotation_euler = facing(d)
        socket.rotation_euler.y += radians(tilt)
        ball = sphere(f'EyeWhite_{side}', (0, 0, 0), (.19, .14, .25), M['eye'], socket)
        gaze = empty(f'Gaze_{side}', (0, 0, 0), socket)
        iris = sphere(f'Iris_{side}', (0, -.108, -.015), (.15, .05, .195), M['iris'], gaze)
        pupil = sphere(f'Pupil_{side}', (0, -.126, -.015), (.132, .045, .176), M['pupil'], gaze)
        g1 = sphere(f'Glint_{side}', (.045, -.168, .075), (.05, .012, .06), M['glint'], gaze)
        g2 = sphere(f'GlintSmall_{side}', (-.05, -.164, -.08), (.022, .008, .022), M['glint'], gaze, subdiv=1)
        lid = empty(f'Eyelid_{side}', (0, 0, 0), socket)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1, location=(0, 0, 0))
        shell = bpy.context.object; shell.name = f'EyelidShell_{side}'
        cut_below(shell, -.02)
        shell.scale = (.203, .155, .263)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        so = shell.modifiers.new('Lid thickness', 'SOLIDIFY'); so.thickness = .014
        s2 = shell.modifiers.new('Soft', 'SUBSURF'); s2.levels = 1; s2.render_levels = 2
        link(smooth(shell), lid, M['skin'])
        tube(f'Lash_{side}', [(-.2, 0, 0), (-.12, -.13, 0), (0, -.16, 0), (.12, -.13, 0), (.2, 0, 0)], .014, M['ink'], lid)
        lid.rotation_euler.x = radians(-80)
        happy = tube(f'HappyEye_{side}', [(-.17, -.14, -.06), (-.08, -.19, .07), (0, -.2, .1), (.08, -.19, .07), (.17, -.14, -.06)], .03, M['ink'], socket)
        happy.hide_render = True
        eyes[side] = dict(socket=socket, gaze=gaze, lid=lid, parts=[ball, iris, pupil, g1, g2], happy=happy,
                          pupil=pupil, pupil_rest=pupil.scale.copy())

    brows = {}
    for side, x, z, flip in [('L', -.33, .54, 1), ('R', .33, .54, -1)]:
        d = Vector((x, -1, z)).normalized()
        piv = empty(f'Brow_{side}', d * (BODY_R + .02), body)
        piv.rotation_euler = facing(d)
        tube(f'BrowStroke_{side}', [bend(-.12, -.015 * flip), bend(0, .03), bend(.12, .015 * flip)], .026, M['ink'], piv, taper=[.55, 1, .75])
        brows[side] = dict(piv=piv, rest=piv.location.copy())

    # Mouths: open shapes are a burgundy cavity with a pink tongue (and teeth only for
    # the laugh); closed ones are a navy line. One shows per mood.
    mouth_dir = Vector((0, -1, -.24))
    mouths = {}

    def open_mouth(name, w, h, smile, teeth=False):
        # A D-shaped burgundy cavity, flat along the top and curved up at the corners, a
        # pink tongue resting in the bottom, and a band of teeth only for the big laugh.
        m = pivot_on(name, mouth_dir, body, .012)
        decal(name + 'Cavity', m, w, h, .014, M['mouth'], top=.15, smile=smile)
        decal(name + 'Tongue', m, w * .52, h * .36, .016, M['tongue'], cz=-h * .58, smile=smile * .6, front=.006)
        if teeth:
            decal(name + 'Teeth', m, w * .66, h * .2, .012, M['teeth'], cz=h * .15, top=0, smile=smile * .5, front=.005)
        return m
    mouths['smile'] = open_mouth('Mouth', .25, .21, .5)
    mouths['laugh'] = open_mouth('MouthLaugh', .29, .3, .35, teeth=True)
    mouths['o'] = pivot_on('MouthO', mouth_dir, body, .012)
    decal('MouthOCavity', mouths['o'], .07, .09, .014, M['mouth'])
    for key, pts, r in [('gentle', [bend(-.13, .02), bend(0, -.05), bend(.13, .02)], .02),
                        ('smirk', [bend(-.13, -.01), bend(0, -.045), bend(.11, .015), bend(.16, .06)], .021),
                        ('think', [bend(-.07, 0), bend(.07, .012)], .02)]:
        o = tube(f'Mouth_{key}', pts, r, M['ink'], body)
        o.location = surface_point(mouth_dir, .018)[0]
        o.rotation_euler = facing(mouth_dir)
        mouths[key] = o

    for side, x in [('L', -.56), ('R', .56)]:
        decal(f'Cheek_{side}', pivot_on(f'Blush_{side}', Vector((x, -1, -.02)), body, .05), .12, .075, .008, M['blush'])

    # Arms: short, rounded, blue, emerging from the globe's sides, with mitten hands:
    # a palm, three soft finger forms and a thumb.
    arms, elbows = {}, {}
    for side, x, sign in [('L', -.92, -1), ('R', .92, 1)]:
        shoulder = empty(f'Arm_{side}', (x, -.05, -.12), body)
        tube(f'UpperArm_{side}', [(-sign * .08, 0, .02), (sign * .1, -.01, -.12), (sign * .18, -.02, -.25)], .115, M['skin'], shoulder, taper=[1, .95, .9])
        elbow = empty(f'Elbow_{side}', (sign * .18, -.02, -.25), shoulder)
        sphere(f'ElbowJoint_{side}', (0, 0, 0), (.108, .108, .108), M['skin'], elbow)
        tube(f'Forearm_{side}', [(0, 0, 0), (sign * .02, -.03, -.12), (sign * .03, -.05, -.22)], .1, M['skin'], elbow, taper=[1, .96, .94])
        hand = empty(f'Hand_{side}', (sign * .03, -.05, -.25), elbow)
        sphere(f'Palm_{side}', (0, 0, -.07), (.15, .125, .15), M['skin'], hand)
        for k, fy in enumerate((-.07, 0, .07)):
            sphere(f'Finger_{side}{k}', (sign * .025, fy - .012, -.2 + abs(fy) * .4), (.056, .052, .075), M['skin'], hand)
        sphere(f'Thumb_{side}', (-sign * .09, -.1, -.05), (.056, .056, .08), M['skin'], hand).rotation_euler.y = radians(sign * 30)
        shoulder.rotation_euler.y = radians(sign * 14)
        elbow.rotation_euler.x = radians(-15)
        arms[side] = shoulder
        elbows[side] = elbow

    # Legs and boots: very short legs, chunky mustard explorer boots, off-white soles.
    for side, x in [('L', -.3), ('R', .3)]:
        bpy.ops.mesh.primitive_cylinder_add(radius=.1, depth=.42, location=(0, 0, 0))
        leg = bpy.context.object; leg.name = f'Leg_{side}'
        link(smooth(leg), hips, M['skin']); leg.location = (x, 0, -.1)
        boot = empty(f'Boot_{side}', (x, -.02, 0), rig)
        sphere(f'BootBody_{side}', (0, -.08, .17), (.23, .31, .17), M['boot'], boot)
        sphere(f'BootCollar_{side}', (0, .01, .3), (.16, .16, .1), M['boot'], boot)
        sphere(f'BootSole_{side}', (0, -.08, .055), (.245, .325, .06), M['sole'], boot)
        for k in range(3):
            tube(f'Lace_{side}{k}', [(-.07, -.3 + k * .07, .29 - k * .025), (.07, -.3 + k * .07, .29 - k * .025)], .013, M['lace'], boot)

    # Hat: rounded crown, soft brim, dark band, a globe badge; tilted with personality.
    # Its own pivot, so the acting can lag and settle it after a hop.
    hat = empty('Hat', (0, 0, .66), body)
    hat.scale = (1.1, 1.1, 1.1)
    hat.rotation_euler = (radians(-10), radians(10), 0)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=1, location=(0, 0, 0))
    crown = bpy.context.object; crown.name = 'HatCrown'
    cut_below(crown, -.05)
    for v in crown.data.vertices:
        x, y, z = v.co
        if z > .6:
            z = .6 + (z - .6) * .45
        z -= .09 * max(0.0, z - .45) / .2 * (2.718 ** (-(x / .28) ** 2))
        v.co.z = z
    crown.scale = (.68, .64, .56)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    so = crown.modifiers.new('Felt', 'SOLIDIFY'); so.thickness = .03
    s2 = crown.modifiers.new('Soft', 'SUBSURF'); s2.levels = 1; s2.render_levels = 2
    link(smooth(crown), hat, M['hat']); crown.location = (0, 0, .02)
    # The brim is a band of a flattened sphere: an annulus that curves softly down.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=1, location=(0, 0, 0))
    brim = bpy.context.object; brim.name = 'HatBrim'
    bm = bmesh.new(); bm.from_mesh(brim.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < .2 or v.co.z > .84], context='VERTS')
    bm.to_mesh(brim.data); bm.free()
    brim.scale = (1.2, 1.12, .16)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bv = brim.modifiers.new('Felt', 'SOLIDIFY'); bv.thickness = .035
    s3 = brim.modifiers.new('Soft', 'SUBSURF'); s3.levels = 1; s3.render_levels = 2
    link(smooth(brim), hat, M['hat']); brim.location = (0, 0, -.11)
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=.69, depth=.13, location=(0, 0, 0))
    band = bpy.context.object; band.name = 'HatBand'
    band.scale = (1, .94, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link(smooth(band), hat, M['band']); band.location = (0, 0, .08)
    badge = empty('HatBadge', (0, -.6, .22), hat)
    badge.rotation_euler.x = radians(-22)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=.14, depth=.03, location=(0, 0, 0), rotation=(radians(90), 0, 0))
    rim = bpy.context.object; rim.name = 'HatBadgeRim'
    rb = rim.modifiers.new('Soft', 'BEVEL'); rb.width = .012; rb.segments = 4
    link(smooth(rim), badge, M['gold'])
    sphere('HatBadgeGlobe', (0, -.02, 0), (.11, .03, .11), M['badge'], badge)
    for k, (bx, bz, s) in enumerate([(-.04, .03, .045), (.04, -.025, .04), (.045, .045, .024)]):
        sphere(f'HatBadgeLand{k}', (bx, -.045, bz), (s, .01, s * .8), M['green'], badge)

    # Backpack: small, rounded, tan; one pocket, a rolled mat, a buckle, straps over the
    # shoulders. Sits on his back; visible past the silhouette, never dominant.
    pack = empty('Backpack', (-.8, .52, -.1), body)
    pack.rotation_euler.z = radians(57)
    rounded_box('BackpackBody', (0, .08, 0), (.72, .36, .74), M['pack'], pack, bevel=.14)
    rounded_box('BackpackPocket', (0, .25, -.12), (.42, .1, .28), M['packLight'], pack, bevel=.05)
    rounded_box('BackpackFlap', (0, .16, .2), (.56, .2, .16), M['packLight'], pack, bevel=.06)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=.1, depth=.86, location=(0, 0, 0), rotation=(0, radians(90), 0))
    mat_roll = bpy.context.object; mat_roll.name = 'BackpackMat'
    link(smooth(mat_roll), pack, M['mat']); mat_roll.location = (0, .1, .46)
    rounded_box('BackpackBuckle', (0, .305, -.02), (.08, .02, .06), M['buckle'], pack, bevel=.01)
    for side, sx in [('L', -1), ('R', 1)]:
        loop = [(.5, .75, .35), (.75, .25, .55), (.85, -.3, .35), (.92, -.3, 0), (.85, .1, -.4), (.55, .6, -.5)]
        tube(f'BackpackStrap_{side}', [Vector((sx * x, y, z)).normalized() * 1.035 for x, y, z in loop], .042, M['strap'], body)

    # Extras, hidden unless a mood shows them.
    extras = {}
    extras['tears'] = [sphere(f'Tear_{s}', surface_point(Vector((x, -1, z)), .05)[0], (.04, .035, .06), M['tear'], body)
                       for s, x, z in [('L', -.52, .12), ('R', .52, .12)]]
    sparks = []
    for i, (x, z, s) in enumerate([(-1.3, 2.7, .16), (1.3, 2.8, .12), (1.45, 2.1, .09), (-1.45, 1.8, .08)]):
        verts, faces = [], []
        for k in range(8):
            a = pi / 2 + k * pi / 4
            r = s if k % 2 == 0 else s * .3
            verts.append((cos(a) * r, 0, sin(a) * r))
        verts += [(0, -s * .25, 0), (0, s * .25, 0)]
        for k in range(8):
            faces += [(k, (k + 1) % 8, 8), ((k + 1) % 8, k, 9)]
        mesh = bpy.data.meshes.new(f'Spark{i}'); mesh.from_pydata(verts, [], faces); mesh.update()
        o = bpy.data.objects.new(f'Spark{i}', mesh); bpy.context.collection.objects.link(o)
        o.location = (x, -.6, z); link(o, rig, M['spark']); sparks.append(o)
    extras['sparkles'] = sparks
    zs = []
    for i, (x, z, s) in enumerate([(1.0, 2.75, .3), (1.35, 3.1, .22), (1.6, 3.38, .16)]):
        cu = bpy.data.curves.new(f'Z{i}', 'FONT'); cu.body = 'Z'; cu.extrude = .04; cu.bevel_depth = .015; cu.align_x = 'CENTER'
        o = bpy.data.objects.new(f'Z{i}', cu); bpy.context.collection.objects.link(o)
        o.location = (x, -.8, z); o.rotation_euler = (radians(90), 0, radians(-8)); o.scale = (s, s, s)
        link(o, rig, M['zzz']); zs.append(o)
    extras['zzz'] = zs

    # Turned towards camera a little, so the backpack shows past his side.
    rig.rotation_euler.z = radians(12)
    return dict(rig=rig, hips=hips, body=body, eyes=eyes, brows=brows, mouths=mouths, arms=arms, elbows=elbows,
                extras=extras, lips={}, hat=hat)


# ── stage ────────────────────────────────────────────────────────────────────

def stage(px):
    scene = bpy.context.scene
    world = bpy.data.worlds.new('Soft studio'); scene.world = world
    world.use_nodes = True  # still required in 5.2
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (.78, .86, 1.0, 1)
    bg.inputs['Strength'].default_value = .45
    # A 65 mm lens, front three-quarter, slightly above: the brief's hero camera.
    cam_data = bpy.data.cameras.new('Camera'); cam_data.lens = 65; cam_data.sensor_width = 36
    cam = bpy.data.objects.new('Camera', cam_data); scene.collection.objects.link(cam)
    look = Vector((0, 0, 1.5))
    cam.location = look + Vector((0, -6.6, 1.3))
    cam.rotation_euler = (look - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    for name, pos, power, size, color in [
        ('Key', (-5, -6, 7), 1400, 6, (1.0, .97, .92)),
        ('Fill', (6, -6, 3), 420, 7, (.86, .92, 1.0)),
        ('Rim', (3, 6, 5), 900, 4, (.75, .88, 1.0)),
        ('Top', (0, -1, 9), 300, 6, (1, 1, 1)),
    ]:
        ld = bpy.data.lights.new(name, 'AREA'); ld.energy = power; ld.shape = 'DISK'; ld.size = size; ld.color = color
        lo = bpy.data.objects.new(name, ld); scene.collection.objects.link(lo); lo.location = pos
        lo.rotation_euler = (look - lo.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=1.3, fill_type='NGON', location=(0, -.05, 0))
    # Wide enough that the soft shadow of the hat and body fades out before any edge.
    floor = bpy.context.object; floor.name = 'Shadow'; floor.scale = (5, 5, 1); floor.is_shadow_catcher = True
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 96
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.resolution_x = px; scene.render.resolution_y = px
    scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Punchy'
    scene.render.fps = 18
    scene.frame_start = 1; scene.frame_end = FRAME_COUNT


# ── faces ────────────────────────────────────────────────────────────────────

MOODS = ['welcome', 'celebrate', 'thinking', 'resting', 'encouraging', 'laughing', 'surprised', 'proud', 'sleepy', 'wink']

# The rest look of each mood: the still under Reduce Motion, and the pose each animation
# starts and ends on. lids: degrees (-80 open, 0 half, 85 shut).
FACE = {
    'welcome':     dict(mouth='smile',  eyes='open',  lids=(-80, -80), brow=0,    pupil=1.0, extras=()),
    'celebrate':   dict(mouth='laugh',  eyes='happy', lids=(-80, -80), brow=.02,  pupil=1.0, extras=('sparkles',)),
    'thinking':    dict(mouth='think',  eyes='open',  lids=(-80, -80), brow=.03,  pupil=.95, extras=()),
    'resting':     dict(mouth='gentle', eyes='happy', lids=(-80, -80), brow=0,    pupil=1.0, extras=()),
    'encouraging': dict(mouth='gentle', eyes='open',  lids=(-80, -80), brow=.015, pupil=1.0, extras=()),
    'laughing':    dict(mouth='laugh',  eyes='happy', lids=(-80, -80), brow=.03,  pupil=1.0, extras=('tears',)),
    'surprised':   dict(mouth='o',      eyes='open',  lids=(-95, -95), brow=.07,  pupil=.72, extras=()),
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
        # The pupil alone, across the face: a shocked eye is a small pupil.
        r = eye['pupil_rest']
        eye['pupil'].scale = (r.x * f['pupil'], r.y, r.z * f['pupil'])
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
            arm = parts['arms']['R']; rest = arm.rotation_euler.y
            if mood == 'welcome':
                arm.rotation_euler.y = rest + radians(-112)
            bpy.context.scene.render.filepath = str(MASTER / 'stills' / f'{mood}.png')
            bpy.ops.render.render(write_still=True)
            arm.rotation_euler.y = rest
            print(f'STILL_READY {mood}', flush=True)
    if '--sheets' in ARGS:
        sys.path.insert(0, str(Path(__file__).parent))
        from globe_mascot_acting import act
        scene = bpy.context.scene
        scene.render.resolution_x = scene.render.resolution_y = FRAME_PX
        scene.cycles.samples = 48
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
