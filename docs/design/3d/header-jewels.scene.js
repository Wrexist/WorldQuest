// Original WorldQuest header models. Studio-lit, editable geometry, transparent exports.
import * as THREE from 'three';
import * as O from 'w3d/objects.js';
import { extrudeSVG } from 'w3d/geometry.js';
export const settings = {
  name:'header-jewels', mode:'icons', look:'photoreal',
  icons:{size:[384,384],margin:.10}, ss:2, quality:1,
  camera:{elevation:16,azimuth:-14,projection:'orthographic'},
  studio:{preset:'soft',envMap:'softbox',key:{softness:4}},
  background:'#F6F5F0', floor:false, contact:false, ao:false,
};
const enamel=(color,metalness=.12)=>new THREE.MeshPhysicalMaterial({color,metalness,roughness:.26,clearcoat:1,clearcoatRoughness:.16});
const gold=enamel('#FFC02E',.38), edge=enamel('#D88908',.32), cream=enamel('#FFE995',.22);
const flameSVG='<svg viewBox="0 0 100 130"><path d="M48 3 C72 27 47 36 70 52 C80 58 86 43 85 37 C112 84 93 124 51 127 C6 128 -6 86 16 59 C21 74 34 76 33 61 C28 42 39 30 48 3Z"/></svg>';
function mesh(parent,name,geometry,material,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.name=name;m.position.set(x,y,z);parent.add(m);return m;}
function floor(group){const b=new THREE.Box3().setFromObject(group);group.position.y-=b.min.y;return group;}
async function globe(){
  const root=new THREE.Group(); root.name='Sapphire globe';
  const map=await new THREE.TextureLoader().loadAsync(new URL('./header-world.svg',import.meta.url).href);
  map.colorSpace=THREE.SRGBColorSpace; map.anisotropy=8;
  const surface=enamel('#FFFFFF',.08); surface.map=map;
  const earth=mesh(root,'Ocean and geographic land',new THREE.SphereGeometry(.86,96,64),surface,0,.98,0);
  earth.rotation.y=-Math.PI/2-.14;
  const orbit=mesh(root,'Golden meridian',new THREE.TorusGeometry(1.02,.047,16,128),gold,0,.98,0);
  orbit.rotation.z=-.38; orbit.rotation.y=.44;
  mesh(root,'North cap',new THREE.SphereGeometry(.065,24,16),cream,-.38,1.95,.0);
  const marker=O.puffy({shape:'star',size:.28,depth:.09,material:gold});marker.position.set(.70,1.64,.43);marker.rotation.z=-.2;root.add(marker);
  return floor(root);
}
function flame(){
  const root=new THREE.Group();root.name='Sunburst flame';
  mesh(root,'Crimson rounded rim',extrudeSVG(flameSVG,{size:1.25,depth:.28,bevel:.09,bevelSegments:12,curveSegments:56}),enamel('#EF4C16'));
  const inner=mesh(root,'Tangerine body',extrudeSVG(flameSVG,{size:1.12,depth:.24,bevel:.10,bevelSegments:12,curveSegments:56}),enamel('#FF9A0B'),0,.06,.13);
  const core=O.puffy({shape:'drop',size:.56,depth:.24,material:enamel('#FFE85D')});core.position.set(.02,.16,.36);core.rotation.z=-.12;root.add(core);
  const spark=O.puffy({shape:'drop',size:.17,depth:.10,material:enamel('#FFD332')});spark.position.set(.62,1.24,0);spark.rotation.z=-.25;root.add(spark);
  return floor(root);
}
function coin(){
  const g=O.coin({diameter:1,thickness:.16,material:gold});
  const ring=mesh(g,'Polished rim',new THREE.TorusGeometry(.42,.027,12,80),cream,0,.165,0);ring.rotation.x=-Math.PI/2;
  const badge=O.puffy({shape:'star',size:.48,depth:.035,material:edge});
  const bounds=new THREE.Box3().setFromObject(badge);const center=bounds.getCenter(new THREE.Vector3());badge.children.forEach(child=>child.position.sub(center));
  badge.rotation.x=-Math.PI/2;badge.position.y=.18;g.add(badge);
  for(let i=0;i<32;i++){const a=i*Math.PI/16;const reed=mesh(g,'Milled edge',new THREE.BoxGeometry(.018,.085,.025),cream,Math.sin(a)*.493,.078,Math.cos(a)*.493);reed.rotation.y=a;}
  return g;
}
function coins(){
  const root=new THREE.Group();root.name='Explorer gold coins';
  for(let i=0;i<3;i++){const c=coin();c.position.set(-.20+i*.025,i*.17,-.06);c.rotation.y=i*.3;root.add(c);}
  const upright=coin();upright.rotation.x=Math.PI/2-.14;upright.rotation.z=-.16;upright.position.set(.42,.58,.43);root.add(upright);
  return floor(root);
}
export default async function build(){return [{name:'globe',object:await globe()},{name:'flame',object:flame()},{name:'coins',object:coins()}];}
