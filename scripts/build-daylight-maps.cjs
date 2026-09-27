/** Decorative continent silhouettes from Natural Earth (public domain), never AI geography. */
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')
const iso = require('i18n-iso-countries')
const { countries } = require('countries-list')
const { merge } = require('topojson-client')
async function main() {
  const { geoOrthographic, geoPath } = await import('d3-geo')
  const topo = require('world-atlas/countries-110m.json')
  const centers = { EU:[15,52,360], AS:[100,32,185], AF:[20,0,200], NA:[-100,42,190], SA:[-60,-20,200], OC:[140,-25,230], AN:[0,-90,280] }
  const out = path.resolve('apps/mobile/assets/geo/daylight')
  fs.mkdirSync(out,{recursive:true})
  const browser = await chromium.launch(launchOptions())
  try {
    const page = await browser.newPage()
    for (const [region,[lon,lat,scale]] of Object.entries(centers)) {
      const shapes = topo.objects.countries.geometries.filter(g => countries[iso.numericToAlpha2(String(g.id).padStart(3,'0'))]?.continent === region)
      if (!shapes.length) throw new Error(`No sourced geometry for ${region}`)
      const projection = geoOrthographic().rotate([-lon,-lat]).scale(scale).translate([240,180])
      const outline = geoPath(projection)(merge(topo,shapes))
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360"><path d="${outline}" fill="white"/></svg>`
      const png = await page.evaluate(async svg => {
        const img=new Image();img.src='data:image/svg+xml;base64,'+btoa(svg);await img.decode()
        const c=document.createElement('canvas');c.width=480;c.height=360;c.getContext('2d').drawImage(img,0,0)
        return c.toDataURL('image/png').split(',')[1]
      },svg)
      fs.writeFileSync(path.join(out,`${region}.png`),Buffer.from(png,'base64'))
    }
  } finally {await browser.close()}
  const regions=Object.keys(centers)
  fs.writeFileSync('apps/mobile/src/lib/daylight-maps.generated.ts',
    '// Generated from Natural Earth by scripts/build-daylight-maps.cjs. Public domain.\n'+
    regions.map(r=>`import ${r} from '../../assets/geo/daylight/${r}.png'`).join('\n')+
    '\nexport const DAYLIGHT_MAPS = { '+regions.join(', ')+' } as const\n')
}
main().catch(e=>{console.error(e);process.exitCode=1})
