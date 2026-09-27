"""Render the collectible from the chest model so the reveal and album match."""
from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'docs/design/assets/models/treasure-chest-v2.blend'))
s=bpy.context.scene;s.frame_set(40)
for o in s.objects:
    if o.type=='MESH': o.hide_render=o.name!='One collectible streak gem'
s.camera.location=(2,-4,2.8)
s.camera.rotation_euler=(Vector((0,-.04,1.87))-s.camera.location).to_track_quat('-Z','Y').to_euler()
s.camera.data.ortho_scale=1.05
s.render.filepath=str(ROOT/'docs/design/assets/chest-v2/gem.png')
bpy.ops.render.render(write_still=True)
