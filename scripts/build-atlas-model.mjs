// Export the authored rig with its five animation clips using the supplied studio's loader.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd();
const kit=await import(pathToFileURL(path.join(root,'node_modules/.cache/user-skills/3d-asset-studio/scripts/browser.mjs')));
const browser=await kit.launch(kit.loadPlaywright(),{gpu:true});
try {
 const context=await browser.newContext();
 await kit.serve(context,{'/export.html':`<script type="importmap">${JSON.stringify(kit.importMap(kit.resolveDeps()))}</script>`});
 const page=await context.newPage();page.on('console',m=>console.log(m.text()));page.on('pageerror',e=>console.error(e));await page.goto(kit.ORIGIN+'/export.html');
 const result=await page.evaluate(async url=>{
  const {default:build}=await import(url);const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
  console.log('Loaded scene; building rig');const object=build()[0].object;const clips=object.userData.animations;delete object.userData.animations;
  const {Group}=await import('three');const metricRoot=new Group();metricRoot.name='WorldQuest Atlas';metricRoot.scale.setScalar(.1);metricRoot.add(object);
  console.log('Exporting five clips');const bytes=await new GLTFExporter().parseAsync(metricRoot,{binary:true,animations:clips});
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const {AnimationMixer,Box3}=await import('three');const imported=await new GLTFLoader().parseAsync(bytes,'');
  if(imported.animations.length!==5)throw Error('Missing exported performances');
  const mixer=new AnimationMixer(imported.scene);mixer.clipAction(imported.animations.find(c=>c.name==='welcome')).play();mixer.setTime(1);
  let shoulder;imported.scene.traverse(n=>{if(n.name==='Shoulder_1')shoulder=n});
  if(!shoulder||shoulder.rotation.z<.5)throw Error('Exported greeting does not articulate the shoulder');
  const bounds=new Box3().setFromObject(imported.scene);const height=bounds.max.y-bounds.min.y;
  if(height<.20||height>.40)throw Error('GLB scale is not in metres');
  console.log('Round-trip verified: 5 clips, articulated shoulder, height',height.toFixed(3),'m');
  console.log('Model bytes',bytes.byteLength);let raw='';const u=new Uint8Array(bytes);for(let i=0;i<u.length;i+=16384)raw+=String.fromCharCode(...u.subarray(i,i+16384));return {bytes:btoa(raw),clips:clips.map(c=>({name:c.name,duration:c.duration,tracks:c.tracks.length}))};
 },kit.toUrl(path.join(root,'docs/design/3d/atlas.scene.js')));
 fs.mkdirSync('docs/design/3d/atlas',{recursive:true});fs.writeFileSync('docs/design/3d/atlas/atlas.glb',Buffer.from(result.bytes,'base64'));
 fs.writeFileSync('docs/design/3d/atlas/model.json',JSON.stringify({author:'WorldQuest original procedural geometry',clips:result.clips},null,2)+'\n');console.log(result.clips);
}finally{await browser.close();}
