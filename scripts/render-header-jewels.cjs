/** Reproducible original header assets, sequential renders to avoid GPU contention. */
const fs=require('node:fs'), {spawnSync}=require('node:child_process');
const cli='node_modules/.cache/user-skills/3d-asset-studio/scripts/render.mjs';
function run(args){const r=spawnSync(process.execPath,[cli,...args],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
run(['docs/design/3d/header-jewels.scene.js','--out','docs/design/assets/header-jewels','--no-ao']);
fs.mkdirSync('apps/mobile/assets/art/header-jewels',{recursive:true});
for(const name of ['globe','flame','coins']) fs.copyFileSync(`docs/design/assets/header-jewels/icons/${name}.webp`,`apps/mobile/assets/art/header-jewels/${name}.webp`);
for(const name of ['globe','flame','coins']){
 const scene=`docs/design/3d/header-${name}.scene.js`;
 fs.writeFileSync(scene,`import build,{settings as shared} from './header-jewels.scene.js';\nexport const settings={...shared,name:'${name}',mode:'none'};\nexport default async function(){return (await build()).filter(layer=>layer.name==='${name}');}\n`);
 run([scene,'--mode','none','--export','glb','--out',`docs/design/assets/header-jewels/models/${name}`]);
}
