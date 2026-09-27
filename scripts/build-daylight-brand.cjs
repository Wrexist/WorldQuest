/** Platform-sized branding derived from the same Atlas master as the app. */
const fs=require('node:fs')
const { chromium }=require('playwright')
const { launchOptions }=require('./chromium.cjs')
const { token }=require('./tokens.cjs')
async function main() {
  const browser=await chromium.launch(launchOptions())
  try {
    const page=await browser.newPage()
    const data=fs.readFileSync('docs/design/assets/daylight/atlas-welcome.png').toString('base64')
    for (const [name,size,mode] of [['icon',1024,'icon'],['adaptive-icon',1024,'adaptive'],['favicon',64,'icon'],['splash',1024,'splash']]) {
      const bytes=await page.evaluate(async ({data,size,mode,canvas,field})=>{
        const img=new Image();img.src='data:image/png;base64,'+data;await img.decode()
        const c=document.createElement('canvas');c.width=size;c.height=size
        const ctx=c.getContext('2d')
        if(mode!=='adaptive') {ctx.fillStyle=mode==='splash'?canvas:field;ctx.fillRect(0,0,size,size)}
        const scale=mode==='icon'?1.30:mode==='adaptive'?.70:.50
        const w=size*scale
        ctx.drawImage(img,(size-w)/2,mode==='icon'?size*.04:(size-w)/2,w,w)
        return c.toDataURL('image/png').split(',')[1]
      },{data,size,mode,canvas:token('color.bg.canvas'),field:token('color.journey.sky')})
      fs.writeFileSync(`apps/mobile/assets/${name}.png`,Buffer.from(bytes,'base64'))
      console.log(`${name}: ${size}px`)
    }
  } finally {await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
