// Atlas, original WorldQuest character. All geometry and motion are authored here.
// +Z is the face; named shoulder, wrist, neck, eye and ankle pivots remain editable.
import * as THREE from 'three';
import {roundedBox, tube} from 'w3d/geometry.js';
export const settings = {
  name:'atlas', mode:'sequence', look:'photoreal', size:[400,400], margin:.065,
  camera:{elevation:9,azimuth:12,projection:'orthographic'},
  studio:{preset:'clay',envMap:'softbox',key:{softness:4}},
  contact:{opacity:.18},floor:{shadow:.08},background:'#D6F1FF',ao:false,
  sequence:{frames:48,fps:20,loop:false},
};
const material=(color,roughness=.45,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
const amber=material('#F8B735'), cream=material('#FFF1CE'), teal=material('#15B5B7'), dark=material('#163842',.29), sole=material('#6C593B'), visor=material('#12383E',.2), light=material('#9CFDF0',.3);
let rig;
export let mood='welcome';
export function setMood(value){mood=value;}
function group(parent,name,x=0,y=0,z=0){const g=new THREE.Group();g.name=name;g.position.set(x,y,z);parent.add(g);return g;}
function ball(parent,name,x,y,z,sx,sy,sz,mat){const m=new THREE.Mesh(new THREE.SphereGeometry(1,40,28),mat);m.name=name;m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m;}
function box(parent,name,x,y,z,w,h,d,r,mat){const m=new THREE.Mesh(roundedBox(w,h,d,r,5),mat);m.name=name;m.position.set(x,y,z);parent.add(m);return m;}
function line(parent,name,points,r,mat){const m=new THREE.Mesh(tube(points,r,{tubular:32,radial:10}),mat);m.name=name;parent.add(m);return m;}
export default function build(){
  const root=new THREE.Group();root.name='atlas';
  const body=group(root,'Torso',0,.78,0);
  ball(body,'Jacket',0,.32,0,.44,.50,.29,amber);
  box(body,'Shirt',0,.36,.255,.42,.54,.085,.12,cream);
  box(body,'Belt',0,.04,.055,.78,.105,.49,.05,sole);
  box(body,'Buckle',0,.04,.319,.15,.135,.045,.03,amber);
  box(body,'Backpack',0,.36,-.30,.62,.65,.27,.12,teal);
  for(const side of [-1,1]) {
    line(body,'Pack strap '+side,[[side*.29,.71,.08],[side*.34,.54,.23],[side*.30,.13,.27]],.035,sole);
    box(body,'Pocket '+side,side*.26,.24,.264,.17,.18,.055,.035,amber);
  }
  const scarf=group(body,'Scarf',0,.76,.03);
  ball(scarf,'Neckerchief',0,0,0,.34,.11,.30,teal);
  const tail=box(scarf,'Scarf tail',.12,-.20,.28,.16,.36,.065,.055,teal);tail.rotation.z=-.22;
  ball(scarf,'Knot',.07,-.03,.30,.10,.10,.08,teal);
  const head=group(body,'Neck',0,.84,0);
  ball(head,'Head shell',0,.43,0,.68,.57,.48,amber);
  ball(head,'Face surround',0,.40,.292,.61,.43,.24,cream);
  ball(head,'Visor',0,.43,.416,.557,.344,.157,visor);
  const eyes=[];
  for(const side of [-1,1]) {
    const e=group(head,'Eye '+side,side*.225,.46,.557);
    ball(e,'Eye light '+side,0,0,0,.084,.125,.030,light);
    ball(e,'Eye glint '+side,-.023,.045,.024,.022,.026,.008,cream);
    eyes.push(e);
    ball(head,'Ear '+side,side*.66,.41,-.01,.095,.17,.14,teal);
    ball(head,'Cheek '+side,side*.405,.285,.535,.060,.026,.015,teal);
  }
  const smile=line(head,'Smile',[[-.115,.28,.563],[0,.245,.582],[.115,.28,.563]],.018,light);
  // Broad elliptical brim, rounded crown and a fabric ribbon: readable at 64 px.
  ball(head,'Hat brim',0,.84,-.02,.82,.07,.61,amber);
  ball(head,'Hat crown',0,.91,-.075,.57,.36,.43,amber);
  ball(head,'Hat band',0,.845,-.06,.578,.085,.437,sole);
  box(head,'Hat badge',.0,.88,.385,.14,.16,.035,.035,teal);
  line(head,'Badge compass',[[0,.935,.413],[0,.835,.413]],.011,cream);
  line(head,'Badge compass cross',[[-.046,.885,.413],[.046,.885,.413]],.011,cream);
  const arms=[];const wrists=[];const legs=[];
  for(const side of [-1,1]) {
    const arm=group(body,'Shoulder '+side,side*.41,.57,0);arms.push(arm);
    ball(arm,'Sleeve '+side,side*.09,-.12,0,.18,.25,.20,amber);
    ball(arm,'Elbow '+side,side*.13,-.33,.018,.12,.125,.13,sole);
    ball(arm,'Cuff '+side,side*.14,-.39,.025,.145,.10,.155,teal);
    const wrist=group(arm,'Wrist '+side,side*.15,-.49,.05);wrists.push(wrist);
    ball(wrist,'Palm '+side,0,-.055,.01,.142,.17,.11,cream);
    ball(wrist,'Thumb '+side,-side*.12,-.015,.065,.066,.095,.062,cream);
    for(let f=0;f<3;f++)ball(wrist,'Finger '+side+' '+f,(f-1)*.070,-.15,.025,.045,.075,.08,cream);
    const leg=group(root,'Ankle '+side,side*.235,.47,0);legs.push(leg);
    ball(leg,'Trouser '+side,0,-.03,0,.18,.26,.20,sole);
    box(leg,'Boot '+side,0,-.30,.075,.36,.27,.48,.10,amber);
    box(leg,'Boot sole '+side,0,-.405,.08,.37,.075,.49,.035,sole);
    box(leg,'Boot toe '+side,0,-.29,.283,.26,.12,.045,.035,cream);
  }
  rig={root,body,head,eyes,smile,arms,wrists,legs,tail};pose(0);
  // Preserve named, sampled clips in the GLB as well as mobile raster sequences.
  root.userData.animations=['welcome','celebrate','thinking','resting','encouraging'].map(name=>{
    const nodes=[root,body,head,...eyes,...arms,...wrists,...legs,tail];const samples=49,times=[];
    const tracks=nodes.map(n=>({n,p:[],q:[],s:[]}));const previous=mood;mood=name;
    for(let i=0;i<samples;i++){times.push(i/20);pose(i/(samples-1));for(const v of tracks){v.p.push(...v.n.position.toArray());v.q.push(...v.n.quaternion.toArray());v.s.push(...v.n.scale.toArray());}}
    mood=previous;
    return new THREE.AnimationClip(name,2.4,tracks.flatMap(v=>[new THREE.VectorKeyframeTrack(v.n.name+'.position',times,v.p),new THREE.QuaternionKeyframeTrack(v.n.name+'.quaternion',times,v.q),new THREE.VectorKeyframeTrack(v.n.name+'.scale',times,v.s)]));
  });pose(0);
  return [{name:'atlas',object:root}];
}
const pulse=(t,a,b)=>t<a||t>b?0:Math.sin(Math.PI*(t-a)/(b-a));
export function pose(t){
  if(!rig)return;const {root,body,head,eyes,arms,wrists,legs,tail}=rig;
  const beat=Math.sin(t*Math.PI*2), act=pulse(t,.06,.90);
  root.position.y=-.027;root.rotation.y=.05*beat;root.scale.set(1,1,1);
  body.position.y=.78+.014*beat;head.rotation.set(0,.09*beat,.025*beat);
  arms.forEach((a,i)=>{a.rotation.set(0,0,(i?1:-1)*(.12+.03*beat));});
  wrists.forEach(w=>w.rotation.set(0,0,0));legs.forEach(l=>l.rotation.set(0,0,0));
  tail.rotation.z=-.22+.05*Math.sin(t*Math.PI*2-.3);
  const blink=1-.94*pulse(t,.35,.43);eyes.forEach(e=>{e.scale.y=blink;e.position.y=.46;});
  if(mood==='welcome') {arms[1].rotation.z=.12+1.65*act;wrists[1].rotation.z=.32*Math.sin(t*Math.PI*10)*act;head.rotation.z=-.09*act;}
  if(mood==='thinking'){head.rotation.z=.17*act;head.rotation.y=-.19*act;arms[0].rotation.z=-.12-1.05*act;arms[0].rotation.x=-.8*act;eyes.forEach(e=>e.position.y=.46+.035*act);}
  if(mood==='encouraging'){head.rotation.x=.17*Math.sin(t*Math.PI*4)*act;arms[1].rotation.z=.12+.9*act;arms[1].rotation.x=-.7*act;}
  if(mood==='resting'){head.rotation.z=-.065*act;eyes.forEach(e=>e.scale.y=1-.65*pulse(t,.25,.70));}
  if(mood==='celebrate') {const jump=pulse(t,.23,.65);root.position.y=-.027+.34*jump-.05*pulse(t,.10,.23);arms[0].rotation.z=-.12-1.75*act;arms[1].rotation.z=.12+1.75*act;legs[0].rotation.z=-.20*jump;legs[1].rotation.z=.20*jump;head.rotation.z=.09*beat;root.rotation.y=.22*beat;}
}
export function animate({t}){pose(t);}
