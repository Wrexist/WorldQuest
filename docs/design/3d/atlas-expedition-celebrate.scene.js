import build,{settings as base,animate,setMood} from './atlas-expedition.scene.js';
export const settings={...base,name:'atlas-celebrate'};
export default function scene(){setMood('celebrate');return build();}
export {animate};
