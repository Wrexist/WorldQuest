/** Serial GPU renders. Requires the user-supplied 3D Asset Studio in the cache. */
const {spawnSync}=require('node:child_process');
const render='node_modules/.cache/user-skills/3d-asset-studio/scripts/render.mjs';
for(const mood of ['welcome','celebrate','thinking','resting','encouraging']){
 const r=spawnSync(process.execPath,[render,`docs/design/3d/atlas${mood==='welcome'?'':'-'+mood}.scene.js`,'--out',`docs/design/3d/atlas/${mood}`,'--gpu','--quality','1'],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);
}
for(const args of [[render,'docs/design/3d/expedition.scene.js','--out','docs/design/3d/expedition','--gpu','--quality','1'],['scripts/build-atlas-model.mjs'],['scripts/build-atlas-assets.cjs']]){const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
