// Original WorldQuest reward set, rendered with the user-supplied 3D Asset Studio.
import * as THREE from 'three';
import * as O from 'w3d/objects.js';
import * as M from 'w3d/materials.js';
export const settings = {
  name: 'worldquest-rewards', mode: 'icons', look: 'photoreal',
  icons: {size: [320, 320], margin: 0.12},
  camera: {elevation: 22, azimuth: -18, projection: 'orthographic'},
  studio: {preset: 'clay', envMap: 'softbox', key: {softness: 5}, floor: {shadow: .12}, contact: {opacity: .18}},
  ao: {samples: 12, strength: .65}, background: '#F5FBFF',
};
export default function build() {
  const heart=O.puffy({shape:'heart',size:1.1,depth:.42,color:0xf16b92});heart.rotation.y=-.15;
  const roundedStar='<svg viewBox="0 0 100 100"><path d="M45 9 Q50 0 55 9 L65 32 Q66 35 70 35 L91 37 Q103 38 94 47 L77 63 Q74 65 75 70 L80 91 Q83 102 73 96 L53 84 Q50 82 47 84 L27 96 Q17 102 20 91 L25 70 Q26 65 23 63 L6 47 Q-3 38 9 37 L30 35 Q34 35 35 32Z"/></svg>';
  const star=O.puffy({shape:roundedStar,size:1.1,depth:.40,color:0xffc841});star.rotation.y=-.15;
  const coins=new THREE.Group();
  for(let i=0;i<3;i++) {const c=O.coin({diameter:.95,thickness:.14,material:M.paint({color:0xffc841})});c.position.set(i*.025,i*.14,0);c.rotation.y=i*.3;coins.add(c);}
  return [{name:'heart',object:heart},{name:'star',object:star},{name:'coins',object:coins}];
}
