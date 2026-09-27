// Atlas, original WorldQuest character. All geometry and motion are authored here.
// +Z is the face; named shoulder, wrist, neck, eye and ankle pivots remain editable.
import * as THREE from 'three';
import * as M from 'w3d/materials.js';
import {roundedBox, tube} from 'w3d/geometry.js';
export const settings = {
  name:'atlas', mode:'sequence', look:'photoreal', size:[480,480], margin:.09,
  camera:{elevation:9,azimuth:12,projection:'orthographic'},
  studio:{preset:'soft',envMap:'softbox',key:{softness:4}},
  contact:{opacity:.18},floor:{shadow:.08},background:'#F6F5F0',ao:false,
  sequence:{frames:48,fps:20,loop:false},
};
const material=(color,roughness=.45,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
const amber=M.withGrain(material('#CCA25D',.31,.82),{scale:160,bump:.08,tintVar:.018,roughVar:.025});
const cream=M.withGrain(material('#D5C4A2',.87),{scale:220,bump:.12,tintVar:.012});
const leather=M.withGrain(material('#654128',.48),{scale:140,bump:.16,tintVar:.03});
const sole=material('#292823',.66), trim=material('#725127',.32,.72);
const visor=new THREE.MeshPhysicalMaterial({color:'#08191D',roughness:.19,metalness:.22,clearcoat:1,clearcoatRoughness:.10});
const light=new THREE.MeshStandardMaterial({color:'#60D6F5',emissive:'#06A6DE',emissiveIntensity:1.3,roughness:.25});
const white=material('#DCFDFF',.25);
let rig;
export let mood='welcome';
export function setMood(value){mood=value;}
function group(parent,name,x=0,y=0,z=0){const g=new THREE.Group();g.name=name;g.position.set(x,y,z);parent.add(g);return g;}
function ball(parent,name,x,y,z,sx,sy,sz,mat){const m=new THREE.Mesh(new THREE.SphereGeometry(1,40,28),mat);m.name=name;m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m;}
function box(parent,name,x,y,z,w,h,d,r,mat){const m=new THREE.Mesh(roundedBox(w,h,d,r,5),mat);m.name=name;m.position.set(x,y,z);parent.add(m);return m;}
function line(parent,name,points,r,mat){const m=new THREE.Mesh(tube(points,r,{tubular:32,radial:10}),mat);m.name=name;parent.add(m);return m;}
export default function build(){
  const root=new THREE.Group();root.name='atlas';
  const body=group(root,'Torso',0,.76,0);
  box(body,'Expedition chassis',0,.31,0,.81,.77,.55,.21,amber);
  ball(body,'Lower chassis',0,.005,0,.37,.22,.25,amber);
  box(body,'Backpack',0,.36,-.32,.63,.59,.27,.10,leather);
  box(body,'Pack flap',0,.58,-.46,.65,.22,.05,.07,leather);
  box(body,'Belt',0,.03,.025,.76,.105,.54,.045,leather);
  box(body,'Brass buckle',.11,.03,.314,.17,.14,.035,.018,amber);
  box(body,'Buckle inset',.11,.03,.34,.103,.080,.020,.012,leather);
  const strap=box(body,'Crossbody strap',0,.38,.292,.105,.86,.055,.025,leather);strap.rotation.z=-.52;
  const strapEdge=box(body,'Strap stitching',-.042,.36,.325,.007,.80,.008,.003,cream);strapEdge.rotation.z=-.52;
  box(body,'Satchel',-.26,.115,.35,.31,.30,.15,.045,leather);
  box(body,'Satchel flap',-.26,.23,.437,.33,.16,.035,.035,leather);
  ball(body,'Satchel clasp',-.26,.21,.468,.033,.033,.015,amber);
  for(const side of [-1,1]){
    line(body,'Chassis seam '+side,[[side*.26,.62,.235],[side*.29,.32,.27],[side*.25,.10,.265]],.007,trim);
    ball(body,'Chest rivet '+side,side*.26,.59,.252,.017,.017,.01,amber);
  }
  const scarf=group(body,'Scarf',0,.76,.025);
  line(scarf,'Linen cowl',[[-.27,.02,0],[-.21,-.015,.19],[0,-.09,.255],[.22,.04,.19],[.27,.06,0]],.080,cream);
  line(scarf,'Cowl fold',[[-.22,-.03,.18],[0,-.15,.25],[.18,-.02,.23]],.028,cream);
  const tail=box(scarf,'Scarf tail',.05,-.20,.23,.16,.25,.045,.06,cream);tail.rotation.z=-.30;
  const head=group(body,'Neck',0,.84,0);
  ball(head,'Neck coupling',0,-.075,0,.21,.13,.18,sole);
  box(head,'Head housing',0,.39,0,1.36,1.06,.94,.31,amber);
  box(head,'Visor gasket',0,.395,.434,1.255,.785,.15,.24,trim);
  box(head,'Curved glass visor',0,.408,.49,1.17,.705,.095,.21,visor);
  // Dome with a forward visor: the helmet wraps the head, rather than sitting like a toy hat.
  const dome=new THREE.Mesh(new THREE.SphereGeometry(1,64,32,0,Math.PI*2,0,Math.PI/2),amber);
  dome.name='Pith helmet crown';dome.scale.set(.74,.44,.58);dome.position.set(0,.79,-.035);head.add(dome);
  const brim=ball(head,'Forward helmet brim',0,.775,.09,.80,.055,.67,amber);brim.rotation.x=.055;
  const bandPoints=Array.from({length:49},(_,i)=>{const angle=i/48*Math.PI*2;return[Math.cos(angle)*.738,.85,Math.sin(angle)*.578-.035]});
  line(head,'Leather helmet band',bandPoints,.04,leather);
  for(const side of [-1,1]){
    const seam=Array.from({length:20},(_,i)=>{const angle=i/19*Math.PI/2;return[side*.36*Math.sin(angle),.792+.44*Math.cos(angle),.51*Math.sin(angle)-.035]});
    line(head,'Crown panel seam '+side,seam,.008,trim);
    ball(head,'Ear coupling '+side,side*.685,.41,-.025,.10,.195,.18,trim);
    ball(head,'Ear cover '+side,side*.75,.41,-.025,.045,.143,.133,amber);
    ball(head,'Ear fastener '+side,side*.79,.41,-.025,.015,.055,.05,trim);
  }
  const badge=box(head,'Compass patch',0,.873,.53,.14,.12,.027,.02,leather);badge.rotation.x=-.12;
  ball(head,'Compass brass bezel',0,.873,.55,.043,.043,.015,amber);
  const eyes=[],brows=[];
  for(const side of [-1,1]){
    const eye=group(head,'Eye '+side,side*.236,.42,.552);
    ball(eye,'Illuminated iris '+side,0,0,0,.077,.117,.014,light);
    ball(eye,'Eye reflection '+side,-.025,.041,.015,.016,.021,.006,white);eyes.push(eye);
    const brow=group(head,'Brow '+side,side*.236,.60,.55);
    line(brow,'Expression arc '+side,[[-.09,-.012,0],[0,.014,.003],[.09,-.012,0]],.013,light);brows.push(brow);
  }
  const arms=[],wrists=[],legs=[],elbows=[];
  for(const side of [-1,1]){
    const arm=group(body,'Shoulder '+side,side*.43,.57,0);arms.push(arm);
    ball(arm,'Shoulder joint '+side,0,-.025,0,.15,.15,.15,sole);
    ball(arm,'Shoulder armour '+side,side*.055,-.075,.005,.185,.21,.20,amber);
    line(arm,'Pauldron seam '+side,[[side*.18,-.10,.065],[side*.17,-.18,.13],[side*.04,-.22,.16]],.009,trim);
    const elbow=group(arm,'Elbow '+side,side*.055,-.28,.005);elbows.push(elbow);
    ball(elbow,'Elbow joint '+side,0,0,0,.115,.105,.125,sole);
    box(elbow,'Forearm guard '+side,0,-.145,.01,.26,.28,.28,.08,amber);
    line(elbow,'Forearm rim '+side,[[-.11,-.245,.12],[0,-.26,.15],[.11,-.245,.12]],.012,trim);
    const wrist=group(elbow,'Wrist '+side,0,-.32,.02);wrists.push(wrist);
    box(wrist,'Leather palm '+side,0,-.03,0,.22,.20,.15,.065,leather);
    for(let f=0;f<4;f++){const x=(f-1.5)*.047;box(wrist,'Glove finger '+side+' '+f,x,-.11,.035,.043,.115,.09,.019,leather);line(wrist,'Finger seam '+side+' '+f,[[x,-.07,.083],[x,-.12,.083]],.004,cream);}
    ball(wrist,'Thumb '+side,-side*.117,-.025,.05,.047,.085,.06,leather);
    ball(arm,'Shoulder rivet '+side,side*.05,-.10,.197,.022,.022,.012,trim);
    const leg=group(root,'Ankle '+side,side*.235,.43,0);legs.push(leg);
    ball(leg,'Hip coupling '+side,0,.035,0,.18,.18,.18,sole);
    box(leg,'Shin armour '+side,0,-.075,.02,.34,.31,.36,.095,amber);
    box(leg,'Knee inset '+side,0,.015,.194,.21,.10,.025,.025,trim);
    box(leg,'Explorer boot '+side,0,-.28,.095,.43,.27,.57,.105,amber);
    box(leg,'Rubber sole '+side,0,-.40,.10,.44,.075,.585,.025,sole);
    line(leg,'Toe welt '+side,[[-.18,-.32,.31],[0,-.32,.38],[.18,-.32,.31]],.012,trim);
    for(const x of [-.13,0,.13])box(leg,'Sole tread '+side+' '+x,x,-.43,.29,.055,.025,.15,.008,sole);
  }
  rig={root,body,head,eyes,brows,arms,elbows,wrists,legs,tail};pose(0);
  // Preserve named, sampled clips in the GLB as well as mobile raster sequences.
  root.userData.animations=['welcome','celebrate','thinking','resting','encouraging'].map(name=>{
    const nodes=[root,body,head,...eyes,...brows,...arms,...elbows,...wrists,...legs,tail];const samples=49,times=[];
    const tracks=nodes.map(n=>({n,p:[],q:[],s:[]}));const previous=mood;mood=name;
    for(let i=0;i<samples;i++){times.push(i/20);pose(i/(samples-1));for(const v of tracks){v.p.push(...v.n.position.toArray());v.q.push(...v.n.quaternion.toArray());v.s.push(...v.n.scale.toArray());}}
    mood=previous;
    return new THREE.AnimationClip(name,2.4,tracks.flatMap(v=>[new THREE.VectorKeyframeTrack(v.n.name+'.position',times,v.p),new THREE.QuaternionKeyframeTrack(v.n.name+'.quaternion',times,v.q),new THREE.VectorKeyframeTrack(v.n.name+'.scale',times,v.s)]));
  });pose(0);
  return [{name:'atlas',object:root}];
}
const pulse=(t,a,b)=>t<a||t>b?0:Math.sin(Math.PI*(t-a)/(b-a));
export function pose(t){
  if(!rig)return;const {root,body,head,eyes,brows,arms,elbows,wrists,legs,tail}=rig;
  const beat=Math.sin(t*Math.PI*2),act=pulse(t,.06,.94);
  root.position.y=.007;root.rotation.y=.035*beat;root.scale.set(1,1,1);
  body.position.y=.76+.008*beat;head.rotation.set(0,.07*beat,.012*beat);
  arms.forEach((a,i)=>a.rotation.set(0,0,(i?1:-1)*.12));elbows.forEach(e=>e.rotation.set(-.08,0,0));
  wrists.forEach(w=>w.rotation.set(0,0,0));legs.forEach((l,i)=>l.rotation.set(0,i?.10:-.08,0));
  tail.rotation.z=-.30+.025*beat;
  const blink=1-.95*pulse(t,.35,.43);
  eyes.forEach(e=>{e.scale.set(1,blink,1);e.position.y=.42});
  brows.forEach(b=>{b.rotation.z=0;b.position.y=.60});
  if(mood==='welcome'){arms[1].rotation.z=.12+.85*act;elbows[1].rotation.z=1.32*act;wrists[1].rotation.z=.16*Math.sin(t*Math.PI*8)*act;head.rotation.z=-.045*act;brows[1].position.y=.60+.025*act;}
  if(mood==='thinking'){head.rotation.z=.13*act;head.rotation.y=-.16*act;arms[0].rotation.z=-.12-.5*act;elbows[0].rotation.x=-1.1*act;eyes[0].scale.y=blink*(1-.30*act);brows[0].rotation.z=-.15*act;brows[1].position.y=.60+.05*act;}
  if(mood==='encouraging'){head.rotation.x=.12*Math.sin(t*Math.PI*4)*act;arms[1].rotation.z=.12+.5*act;elbows[1].rotation.x=-.9*act;brows.forEach(b=>b.position.y=.60+.025*act);}
  if(mood==='resting'){head.rotation.z=-.045*act;eyes.forEach(e=>e.scale.y=1-.60*pulse(t,.25,.72));brows.forEach(b=>b.position.y=.60-.025*act);}
  if(mood==='celebrate'){const jump=pulse(t,.25,.64);body.position.y-=.04*pulse(t,.12,.25);root.position.y=.007+.24*jump;arms[0].rotation.z=-.12-1.0*act;arms[1].rotation.z=.12+1.0*act;elbows[0].rotation.z=-.70*act;elbows[1].rotation.z=.70*act;legs[0].rotation.z=-.12*jump;legs[1].rotation.z=.12*jump;head.rotation.z=.05*beat;eyes.forEach(e=>e.scale.y=blink*(1-.35*act));brows.forEach(b=>b.position.y=.60+.04*act);}
}
export function animate({t}){pose(t);}
