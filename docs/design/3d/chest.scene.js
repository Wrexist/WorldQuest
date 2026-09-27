// Real hinged lid + one collectible gem. 3D Asset Studio lights every frame.
import * as THREE from 'three';
import {loadModel, describe} from 'w3d/models.js';
export const settings = {
  name:'worldquest-chest', mode:'sequence', look:'photoreal', size:[480,480],
  margin:.10, camera:{elevation:21,azimuth:27,projection:'orthographic'},
  studio:{preset:'clay',envMap:'softbox',key:{softness:4}},
  contact:{opacity:.18},floor:{shadow:.10},background:'#EAE0FF',ao:false,
  sequence:{frames:40,fps:20,loop:false},
};
let mixer;
let duration;
export default async function build(ctx) {
  const model=await loadModel(new URL('../assets/models/treasure-chest-v2.glb',import.meta.url).href,{height:'20cm'});
  ctx.log(describe(model));
  const clips=model.userData.animations;
  duration=Math.max(...clips.map(c=>c.duration));
  const combined=new THREE.AnimationClip('Chest opening',duration,clips.flatMap(c=>c.tracks.map(t=>t.clone())));
  mixer=new THREE.AnimationMixer(model);
  const action=mixer.clipAction(combined);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
  // Keep the base colors saturated under the soft key, with broad toy-like highlights.
  model.traverse(o=>{if(o.isMesh){for(const m of (Array.isArray(o.material)?o.material:[o.material])) {
    if(m.name==='Lagoon enamel')m.color.set('#23A9C5');
    if(m.name==='Warm satin brass')m.color.set('#F8C34B');
    if(m.name==='Lilac crystal')m.color.set('#A171ED');
  }}});
  return [{name:'chest',object:model}];
}
export function animate({t}) {mixer.setTime(t*duration);}
