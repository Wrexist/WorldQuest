// A tiny explorable landscape. Decorative scenery, never a geographic teaching map.
import * as THREE from 'three';
import {roundedBox,tube} from 'w3d/geometry.js';
export const settings={name:'expedition',mode:'still',look:'photoreal',size:[800,480],margin:.045,camera:{elevation:23,azimuth:10,projection:'orthographic'},studio:{preset:'clay',envMap:'softbox',key:{softness:4}},floor:{shadow:.06},contact:{opacity:.12},ao:false,background:'#D6F1FF'};
export default function build(){
 const root=new THREE.Group();
 const mat=c=>new THREE.MeshStandardMaterial({color:c,roughness:.65});
 const grass=mat('#8BCB59'),earth=mat('#E2B878'),water=mat('#57CBCD'),leaf=mat('#37A67D'),light=mat('#ABDF73'),stone=mat('#DBDCC7'),wood=mat('#9A7753');
 function ball(x,y,z,a,b,c,m){const o=new THREE.Mesh(new THREE.SphereGeometry(1,40,24),m);o.position.set(x,y,z);o.scale.set(a,b,c);root.add(o);return o;}
 ball(0,.32,0,2.5,.40,1.30,earth);ball(0,.51,0,2.50,.28,1.30,grass);
 ball(.5,.73,.45,1.28,.025,.51,water);
 // Sandy stepping stones lead from the character's clearing toward the flag.
 for(let i=0;i<6;i++)ball(-.9+i*.34,.80,.18+Math.sin(i*.8)*.24,.19,.045,.13,stone);
 for(const [x,z,h] of [[-1.85,-.4,1.1],[-1.4,-.85,.85],[1.85,-.45,1.25],[1.5,-.85,.7]]){
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.045,.07,h,12),wood);trunk.position.set(x,.6+h/2,z);root.add(trunk);
  ball(x,.65+h,z,.30,.48,.28,leaf);ball(x-.13,.52+h,z+.03,.24,.34,.23,light);
 }
 for(const [x,z]of[[-2,.35],[-1.7,.6],[1.7,.56],[1.94,.23]]){ball(x,.73,z,.26,.20,.22,leaf);ball(x+.17,.77,z+.05,.19,.26,.17,light);}
 const pole=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.9,12),wood);pole.position.set(.95,1.13,-.45);root.add(pole);
 const flag=new THREE.Mesh(roundedBox(.43,.27,.035,.035,4),mat('#FFB745'));flag.position.set(1.14,1.47,-.45);root.add(flag);
 for(const x of [-1.5,1.4]){ball(x,.74,.8,.19,.11,.14,stone);ball(x+.16,.73,.69,.12,.10,.1,stone);}
 root.position.y=.08;
 return [{name:'island',object:root}];
}
