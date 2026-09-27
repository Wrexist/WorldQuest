"""Three-second motion proofs from the real Blender model sources, at 12 fps."""
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[1]
for name in ['atlas-companion', 'treasure-chest']:
    bpy.ops.wm.open_mainfile(filepath=str(ROOT / f'docs/design/assets/models/{name}.blend'))
    scene=bpy.context.scene
    scene.camera.data.ortho_scale *= 1.22
    scene.render.resolution_x=360; scene.render.resolution_y=360
    scene.cycles.samples=12
    scene.render.film_transparent=False
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.94,.97,.97,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.4
    dest=ROOT / f'node_modules/.cache/daylight-motion/{name}'
    dest.mkdir(parents=True, exist_ok=True)
    for index,frame in enumerate(range(1,73,2)):
        scene.frame_set(frame)
        scene.render.filepath=str(dest / f'{index:03d}.png')
        bpy.ops.render.render(write_still=True)
    print(f'MOTION_READY {name}',flush=True)
