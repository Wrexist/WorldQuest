import build,{settings as shared} from './header-jewels.scene.js';
export const settings={...shared,name:'coins',mode:'none'};
export default async function(){return (await build()).filter(layer=>layer.name==='coins');}
