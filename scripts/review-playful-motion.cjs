/** Real Expo browser evidence for the articulated character and reduced-motion controls. */
const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')
const { walkOnboarding } = require('./lib/onboarding-walk.cjs')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(process.env.WQ_WEB ?? 'node_modules/.cache/wq-atlas')
const output = path.resolve(process.env.WQ_REVIEW_OUT ?? 'docs/design/reviews/atlas-2026-09-26')
const port = 4189
const base = `http://localhost:${port}`
fs.mkdirSync(output,{recursive:true})
const server = http.createServer((req,res)=>{
  const route=decodeURIComponent(new URL(req.url,base).pathname)
  let file=path.resolve(root,'.'+route)
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
  if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html')
  const type={'.html':'text/html','.js':'application/javascript','.webp':'image/webp','.png':'image/png','.css':'text/css','.ttf':'font/ttf','.json':'application/json'}[path.extname(file)]
  res.writeHead(200,{'Content-Type':type??'application/octet-stream'});fs.createReadStream(file).pipe(res)
})
const assert=(ok,message)=>{if(!ok)throw Error(message);console.log('PASS '+message)}
async function sample(page,count=24) {
  const transforms=[]
  for(let i=0;i<count;i++){
    transforms.push(await page.getByTestId('atlas-character').first().evaluate(el=>{const film=el.querySelector('[data-testid=atlas-film]');return film ? getComputedStyle(film).transform : 'poster'}))
    await page.waitForTimeout(90)
  }
  return [...new Set(transforms)]
}
async function main(){
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve))
  const browser=await chromium.launch(launchOptions())
  const report={}
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},locale:'en-US',reducedMotion:'no-preference',recordVideo:{dir:output,size:{width:390,height:844}}})
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
    await page.goto(base+'/onboarding',{waitUntil:'domcontentloaded'})
    await page.getByTestId('atlas-character').first().waitFor({state:'visible'})
    report.fullMotionFrames=await sample(page)
    assert(report.fullMotionFrames.length>2,'3D performance advances through multiple rendered poses')
    await page.screenshot({path:path.join(output,'welcome.png')})
    report.settledFrames=await sample(page,8)
    assert(report.settledFrames.length===1,'character settles instead of looping')
    await walkOnboarding(page)
    await page.goto(base+'/settings',{waitUntil:'networkidle'})
    const toggle=page.getByRole('switch',{name:'Reduce motion',exact:true})
    await toggle.click()
    assert(await toggle.getAttribute('aria-checked')==='true','in-app reduced motion is enabled')
    await page.goto(base+'/',{waitUntil:'domcontentloaded'})
    await page.getByTestId('atlas-character').first().waitFor({state:'visible'})
    report.appReducedFrames=await sample(page,12)
    assert(report.appReducedFrames.length===1,'persisted app setting keeps Atlas still on reload')
    await page.screenshot({path:path.join(output,'home.png')})
    await page.goto(base+'/explore',{waitUntil:'networkidle'});await page.screenshot({path:path.join(output,'explore.png')})
    assert(errors.length===0,'no uncaught errors during animated navigation')
    const video=page.video();await context.close();await video.saveAs(path.join(output,'atlas-in-app.webm'))

    const reduced=await browser.newContext({viewport:{width:390,height:844},locale:'en-US',reducedMotion:'reduce'})
    const quiet=await reduced.newPage();await quiet.goto(base+'/onboarding',{waitUntil:'domcontentloaded'})
    await quiet.getByTestId('atlas-character').first().waitFor({state:'visible'})
    report.osReducedFrames=await sample(quiet,12)
    assert(report.osReducedFrames.length===1,'OS reduced motion keeps Atlas still from first appearance')
    await quiet.screenshot({path:path.join(output,'reduced-motion.png')})
    await quiet.emulateMedia({reducedMotion:'no-preference'})
    report.liveEnabledFrames=await sample(quiet,6)
    assert(report.liveEnabledFrames.length>1,'live OS change enables motion without a reload')
    await quiet.emulateMedia({reducedMotion:'reduce'})
    await quiet.waitForTimeout(100)
    report.liveDisabledFrames=await sample(quiet,8)
    assert(report.liveDisabledFrames.length===1,'live OS change stops the running animation')
    await reduced.close()
    fs.writeFileSync(path.join(output,'motion-report.json'),JSON.stringify(report,null,2)+'\n')
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1})
