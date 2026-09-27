/** Editorial map plates from Natural Earth. No generated geography. */
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');const {launchOptions}=require('./chromium.cjs');
const {feature}=require('topojson-client');const iso=require('i18n-iso-countries');const{countries}=require('countries-list');
(async()=>{
 const {geoNaturalEarth1,geoOrthographic,geoPath,geoGraticule10}=await import('d3-geo');
 const topo=require('world-atlas/countries-110m.json');const land=feature(topo,topo.objects.countries);
 const out=path.resolve('apps/mobile/assets/geo/expedition');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch(launchOptions());try{const page=await browser.newPage();
 const centers={world:null,EU:[15,52],AS:[100,32],AF:[20,0],NA:[-100,42],SA:[-60,-20],OC:[140,-25],AN:[0,-90]};
 for(const[name,center]of Object.entries(centers)){
  const projection=center?geoOrthographic().rotate([-center[0],-center[1]]).scale(205).translate([300,220]):geoNaturalEarth1().fitExtent([[24,24],[976,576]],land);
  const width=center?600:1000,height=center?440:600,p=geoPath(projection);
  const paths=land.features.map(f=>{const region=countries[iso.numericToAlpha2(String(f.id).padStart(3,'0'))]?.continent;const fill=!center||region===name?'#6D8B77':'#D6DDD2';return `<path d="${p(f)||''}" fill="${fill}" stroke="#F6F5F0" stroke-width=".65"/>`}).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><path d="${p(geoGraticule10())}" fill="none" stroke="#CAD4C8" stroke-width=".6"/>${paths}</svg>`;
  const data=await page.evaluate(async({svg,width,height})=>{const i=new Image();i.src='data:image/svg+xml;base64,'+btoa(svg);await i.decode();const c=document.createElement('canvas');c.width=width;c.height=height;c.getContext('2d').drawImage(i,0,0);return c.toDataURL('image/webp',1).split(',')[1]},{svg,width,height});
  fs.writeFileSync(path.join(out,name+'.webp'),Buffer.from(data,'base64'));
 }
 const names=Object.keys(centers);fs.writeFileSync('apps/mobile/src/lib/expedition-maps.generated.ts',names.map(n=>`import ${n} from '../../assets/geo/expedition/${n}.webp'`).join('\n')+'\nexport const EXPEDITION_MAPS={'+names.join(',')+'} as const\n');
 console.log('Eight sourced cartographic plates rendered.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
