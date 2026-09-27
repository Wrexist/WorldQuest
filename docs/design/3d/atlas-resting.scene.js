import build,{settings as base,animate,setMood} from './atlas.scene.js';
export const settings={...base,name:'atlas-resting'};
export default function scene(){setMood('resting');return build();}
export {animate};
