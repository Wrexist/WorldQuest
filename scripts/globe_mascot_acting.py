"""Atlas's acting: one keyframed performance per mood, for build-globe-mascot.py.

Keys are (frame, value) OFFSETS from the rest pose the face sets, over 36 frames at
18 fps. Every channel starts and ends on rest, so a performance can hold its last frame
or play again without a pop.

Axes, as the rig is built: arms rotate about Y at the shoulder (negative raises the
RIGHT arm, positive the LEFT); lids rotate about their X hinge (positive closes); the
body nods about X (positive leans forward) and rolls about Y.
"""
from math import radians as d


def keys(obj, path, index, pairs, base):
    for frame, delta in pairs:
        getattr(obj, path)[index] = base + delta
        obj.keyframe_insert(data_path=path, index=index, frame=frame)


def wave(f0, f1, lo, hi, every=4):
    out, f, up = [], f0, True
    while f <= f1:
        out.append((f, hi if up else lo))
        up = not up
        f += every
    return out


def blink(at, shut=165):
    return [(1, 0), (at - 2, 0), (at, shut), (at + 2, 0), (36, 0)]


def act(parts, mood):
    rig, hips, body = parts['rig'], parts['hips'], parts['body']
    arms, eyes, brows, ex = parts['arms'], parts['eyes'], parts['brows'], parts['extras']
    R, L = arms['R'], arms['L']
    rb, lb = R.rotation_euler.y, L.rotation_euler.y
    lidR, lidL = eyes['R']['lid'], eyes['L']['lid']
    rR, rL = lidR.rotation_euler.x, lidL.rotation_euler.x

    def arm(o, base, pairs): keys(o, 'rotation_euler', 1, [(f, d(v)) for f, v in pairs], base)
    def lid(o, base, pairs): keys(o, 'rotation_euler', 0, [(f, d(v)) for f, v in pairs], base)
    def roll(pairs): keys(body, 'rotation_euler', 1, [(f, d(v)) for f, v in pairs], 0)
    def nod(pairs): keys(body, 'rotation_euler', 0, [(f, d(v)) for f, v in pairs], 0)
    def hop(pairs): keys(rig, 'location', 2, pairs, 0)

    def squash(pairs):
        keys(hips, 'scale', 2, pairs, 1)
        keys(hips, 'scale', 0, [(f, -v * .5) for f, v in pairs], 1)
        keys(hips, 'scale', 1, [(f, -v * .5) for f, v in pairs], 1)

    def gaze(x, z, pairs):
        for e in eyes.values():
            keys(e['gaze'], 'rotation_euler', 2, [(f, d(v * x)) for f, v in pairs], 0)
            keys(e['gaze'], 'rotation_euler', 0, [(f, d(v * z)) for f, v in pairs], 0)

    def brow(pairs):
        for b in brows.values():
            keys(b['piv'], 'location', 2, pairs, b['piv'].location.z)

    hat = parts['hat']
    hz, hrx, hry = hat.location.z, hat.rotation_euler.x, hat.rotation_euler.y

    # The hat is not glued on: it follows a couple of frames late, lifts off at the top
    # of a hop, lands after him and bounces to rest.
    def hat_lift(pairs): keys(hat, 'location', 2, pairs, hz)
    def hat_nod(pairs): keys(hat, 'rotation_euler', 0, [(f, d(v)) for f, v in pairs], hrx)
    def hat_tip(pairs): keys(hat, 'rotation_euler', 1, [(f, d(v)) for f, v in pairs], hry)

    def both_lids(pairs):
        lid(lidR, rR, pairs)
        lid(lidL, rL, pairs)

    def drift(objs, pairs, axis=2):
        for o in objs:
            keys(o, 'location', axis, pairs, o.location[axis])

    def grow(objs, pairs):
        for o in objs:
            base = o.scale[0]
            for i in range(3):
                keys(o, 'scale', i, [(f, base * v) for f, v in pairs], base)

    if mood == 'welcome':
        # A big friendly wave, leaning into it, a glance and a blink.
        arm(R, rb, [(1, 0), (6, -112)] + wave(8, 24, -96, -128) + [(28, -112), (36, 0)])
        roll([(1, 0), (8, 5), (28, 5), (36, 0)])
        gaze(1, 0, [(1, 0), (10, 6), (26, 6), (36, 0)])
        both_lids(blink(31))
        squash([(1, 0), (4, -.03), (8, .02), (12, 0), (36, 0)])
        hat_tip([(1, 0), (11, 3), (31, 3), (36, 0)])
    elif mood == 'celebrate':
        # Crouch, spring, arms up, land with a squash, sparkles popping.
        squash([(1, 0), (5, -.09), (9, .07), (16, .02), (21, -.1), (25, .03), (29, 0), (36, 0)])
        hop([(1, 0), (6, 0), (15, .38), (21, 0), (36, 0)])  # high enough to read, low enough that the lifted hat stays in frame
        arm(R, rb, [(1, 0), (6, -20), (12, -118), (22, -112), (30, -30), (36, 0)])  # hands stay outside the brim
        arm(L, lb, [(1, 0), (6, 20), (12, 118), (22, 112), (30, 30), (36, 0)])
        roll([(1, 0), (12, -4), (18, 4), (26, 0), (36, 0)])
        grow(ex['sparkles'], [(1, 0), (8, .6), (14, -.2), (20, .5), (28, -.1), (36, 0)])
        hat_lift([(1, 0), (5, -.015), (9, -.01), (16, .08), (20, .045), (23, -.02), (26, .012), (29, 0), (36, 0)])
        hat_tip([(1, 0), (14, -5), (19, 6), (24, -3), (28, 1.5), (32, 0), (36, 0)])
    elif mood == 'laughing':
        # A belly laugh: head back, arms clutching, shaking, bouncing, tears rolling.
        roll([(1, 0), (4, 6)] + wave(6, 28, -6, 7, every=2) + [(32, 2), (36, 0)])
        hop([(1, 0), (6, .06), (9, 0), (14, .06), (17, 0), (22, .05), (25, 0), (36, 0)])
        squash([(1, 0), (6, .04), (9, -.05), (14, .04), (17, -.05), (22, .03), (25, -.03), (36, 0)])
        arm(R, rb, [(1, 0), (5, 35), (30, 35), (36, 0)])
        arm(L, lb, [(1, 0), (5, -35), (30, -35), (36, 0)])
        nod([(1, 0), (5, -6), (30, -6), (36, 0)])
        drift(ex['tears'], [(1, 0), (10, -.04), (24, -.16), (34, -.02), (36, 0)])
        hat_lift([(1, 0), (8, .025), (11, 0), (16, .025), (19, 0), (24, .02), (27, 0), (36, 0)])
        hat_tip([(1, 0), (6, 4)] + wave(7, 29, -5, 6, every=2) + [(33, 1), (36, 0)])
    elif mood == 'surprised':
        # A jolt: everything up at once, a double take, then a sheepish settle.
        squash([(1, 0), (3, -.06), (6, .12), (11, .03), (16, 0), (36, 0)])
        hop([(1, 0), (3, 0), (8, .22), (14, 0), (36, 0)])
        arm(R, rb, [(1, 0), (6, -95), (20, -85), (30, -10), (36, 0)])
        arm(L, lb, [(1, 0), (6, 95), (20, 85), (30, 10), (36, 0)])
        nod([(1, 0), (6, -9), (20, -6), (32, 0), (36, 0)])
        brow([(1, 0), (6, .05), (22, .04), (32, 0), (36, 0)])
        gaze(1, 0, [(1, 0), (22, 0), (26, -8), (30, 8), (36, 0)])
        hat_lift([(1, 0), (3, -.01), (9, .07), (13, .03), (16, -.02), (19, .01), (22, 0), (36, 0)])
        hat_nod([(1, 0), (9, -8), (15, 3), (20, -1), (24, 0), (36, 0)])
    elif mood == 'proud':
        # Chin up, hands on hips, one slow smug wink, sparkles.
        nod([(1, 0), (8, -10), (30, -10), (36, 0)])
        roll([(1, 0), (8, -4), (30, -4), (36, 0)])
        arm(R, rb, [(1, 0), (8, 40), (30, 40), (36, 0)])
        arm(L, lb, [(1, 0), (8, -40), (30, -40), (36, 0)])
        lid(lidR, rR, [(1, 0), (14, 0), (18, 90), (23, 90), (27, 0), (36, 0)])
        brow([(1, 0), (14, 0), (18, .03), (27, 0), (36, 0)])
        grow(ex['sparkles'], [(1, 0), (6, .5), (12, -.1), (18, .6), (24, 0), (30, .4), (36, 0)])
        hat_tip([(1, 0), (10, -5), (30, -5), (36, 0)])
    elif mood == 'sleepy':
        # Nods off, jerks awake with a start, nods off again; the Zzz drift up.
        nod([(1, 0), (6, 3), (12, 16), (15, 17), (17, -3), (20, 0), (26, 12), (32, 14), (36, 0)])
        both_lids([(1, 0), (12, 45), (15, 55), (17, -30), (20, 0), (30, 40), (36, 0)])
        brow([(1, 0), (16, 0), (17, .05), (21, 0), (36, 0)])
        drift(ex['zzz'], [(1, 0), (18, .1), (35, .2), (36, 0)])
        grow(ex['zzz'], [(1, 0), (18, .2), (35, -.5), (36, 0)])
        squash([(1, 0), (10, .02), (20, -.02), (30, .02), (36, 0)])
        hat_nod([(1, 0), (14, 10), (17, -6), (20, 2), (23, 0), (28, 8), (34, 8), (36, 0)])
        hat_lift([(1, 0), (16, 0), (18, .05), (21, 0), (36, 0)])
    elif mood == 'thinking':
        # Head tilted, eyes up and away, a hand to the chin, a slow blink.
        roll([(1, 0), (8, -7), (30, -7), (36, 0)])
        gaze(1, 1, [(1, 0), (8, -10), (20, -10), (26, 6), (30, 6), (36, 0)])
        arm(R, rb, [(1, 0), (8, -60), (30, -60), (36, 0)])
        brow([(1, 0), (8, .03), (30, .03), (36, 0)])
        both_lids(blink(22))
        hat_tip([(1, 0), (11, -4), (31, -4), (36, 0)])
    elif mood == 'encouraging':
        # Two warm nods and a hand held out.
        nod([(1, 0), (6, 7), (10, -2), (15, 7), (19, 0), (36, 0)])
        arm(R, rb, [(1, 0), (8, -55), (26, -55), (34, 0), (36, 0)])
        squash([(1, 0), (6, -.03), (10, .02), (15, -.03), (19, 0), (36, 0)])
        hat_nod([(1, 0), (8, 5), (12, -2), (17, 5), (21, 0), (36, 0)])
    elif mood == 'resting':
        # Content breathing.
        squash([(1, 0), (12, .025), (24, -.01), (36, 0)])
        roll([(1, 0), (18, 2), (36, 0)])
    elif mood == 'wink':
        lid(lidR, rR, [(1, 0), (10, 0), (14, 165), (20, 165), (24, 0), (36, 0)])
        roll([(1, 0), (10, -5), (26, -5), (36, 0)])
        arm(R, rb, [(1, 0), (10, -70), (26, -70), (36, 0)])
        brow([(1, 0), (12, .025), (22, .025), (26, 0), (36, 0)])
        hat_tip([(1, 0), (13, -3), (28, -3), (36, 0)])
