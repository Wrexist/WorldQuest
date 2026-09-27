import build,{settings as base,animate,setMood} from './atlas.scene.js';
export const settings={...base,name:'atlas-thinking'};
export default function scene(){setMood('thinking');return build();}
export {animate};
