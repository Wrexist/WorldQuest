import build,{settings as base,animate,setMood} from './atlas-expedition.scene.js';
export const settings={...base,name:'atlas-encouraging'};
export default function scene(){setMood('encouraging');return build();}
export {animate};
