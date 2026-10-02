// Real exported Explore journey. Onboarding is driven through the UI; no account seeding.
const fs=require('node:fs'), path=require('node:path'), http=require('node:http'), assert=require('node:assert/strict')
const { chromium }=require('playwright')
const { launchOptions }=require('./chromium.cjs')
const { walkOnboarding }=require('./lib/onboarding-walk.cjs')
const { browserContext }=require('./lib/browser-harness.cjs')
const root=path.resolve(__dirname,'..'), web=path.resolve(process.argv[2]||'node_modules/.cache/wq-compact-explore-web-v1')
const baseline=process.argv.includes('--baseline')
const focusOnly=process.argv.includes('--focus-only')
const settledOnly=process.argv.includes('--settled-list-only')
const finalProof=process.argv.includes('--final-proof')
const out=path.join(root,'docs/design/reviews/compact-explore-2026-10-02',baseline?'baseline':'browser',finalProof?'final':settledOnly?'settled':focusOnly?'focus-v2':'')
const report={source:web,baseline,realApp:true,seededAccount:false,cases:[],errors:[]}
const port=4190
const server=http.createServer((req,res)=>{let file=path.join(web,decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(web)){res.writeHead(404);res.end();return}if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=fs.existsSync(file+'.html')?file+'.html':path.join(web,'index.html');res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.webp':'image/webp','.png':'image/png','.json':'application/json','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res)})
const wait=(page,ms=400)=>page.waitForTimeout(ms)
async function scaleText(page){await page.evaluate(()=>{const list=[...document.querySelectorAll('[dir="auto"]')].filter(node=>!node.dataset.proofScaled).map(node=>({node,font:parseFloat(getComputedStyle(node).fontSize),line:parseFloat(getComputedStyle(node).lineHeight),scale:Math.min(2,Number(node.closest('[data-max-scale]')?.getAttribute('data-max-scale')||2))}));for(const{node,font,line,scale}of list){node.dataset.proofScaled='true';if(Number.isFinite(font))node.style.fontSize=font*scale+'px';if(Number.isFinite(line))node.style.lineHeight=line*scale+'px'}})}
async function cardMetrics(page){return page.getByTestId('explore-atlas-card').evaluate(card=>{const r=card.getBoundingClientRect(),overflow=[];const walker=document.createTreeWalker(card,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const range=document.createRange();range.selectNodeContents(walker.currentNode);for(const box of range.getClientRects())if(box.left<r.left-1||box.right>r.right+1)overflow.push(walker.currentNode.textContent)}return{height:r.height,width:r.width,overflow,text:card.textContent,targets:[...card.querySelectorAll('[role="button"]')].map(button=>{const b=button.getBoundingClientRect();return{label:button.getAttribute('aria-label'),width:b.width,height:b.height}})}})}
async function showCountry(page, country='Spain'){
  const atlas=page.getByTestId('explore-atlas')
  await atlas.getByRole('button',{name:'Europe',exact:true}).click()
  if(!baseline)await page.getByTestId('explore-atlas-browse').click()
  await atlas.getByRole('list').getByRole('button',{name:country,exact:true}).click()
  await wait(page,600)
  await page.getByTestId('explore-atlas-card').scrollIntoViewIfNeeded()
}
async function screenshot(page,name){await page.screenshot({path:path.join(out,name+'.png')})}
async function selection(page,width){
  await page.goto(`http://localhost:${port}/explore`,{waitUntil:'networkidle'})
  const atlas=page.getByTestId('explore-atlas')
  await atlas.waitFor();await wait(page,700)
  if(!baseline){
    assert.equal(await page.getByTestId('explore-atlas-browse').getAttribute('aria-expanded'),'false')
    assert.equal(await atlas.getByRole('list').count(),0)
  }
  const globe=await atlas.locator('canvas').first().elementHandle()
  await showCountry(page)
  const mapText=await page.getByTestId('explore-globe').locator('[dir="auto"]').allTextContents()
  if(finalProof)assert.deepEqual(mapText,['Madrid'])
  if(!baseline){
    assert.equal(await page.getByTestId('explore-atlas-browse').getAttribute('aria-expanded'),'false')
    assert.equal(await atlas.getByRole('list').count(),0)
    assert.equal(await globe.evaluate(el=>el===document.querySelector('[data-testid="explore-globe"] canvas')),true)
    assert.equal(await page.getByTestId('explore-globe').getByText('Spain',{exact:true}).count(),0)
  }
  const metrics=await cardMetrics(page)
  assert.deepEqual(metrics.overflow,[])
  assert.equal(metrics.targets.every(target=>target.width>=44&&target.height>=44),true)
  await screenshot(page,`selected-spain-${width}`)
  const focusAfterBrowseSelection=await page.evaluate(()=>({tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label')}))
  if(focusOnly)assert.equal(focusAfterBrowseSelection.label,'Open Spain')
  report.cases.push({name:'selected Spain',width,metrics,mapText,focusAfterBrowseSelection,collapsedAfterSelection:!baseline,globeRetained:!baseline})
}
async function behavior(page){
  const atlas=page.getByTestId('explore-atlas'),browse=page.getByTestId('explore-atlas-browse'),search=page.getByTestId('explore-search')
  const globe=await atlas.locator('canvas').first().elementHandle()
  const open=page.getByTestId('explore-atlas-open')
  await browse.click();const euCount=await atlas.getByRole('list').getByRole('button').count()
  assert.ok(euCount>20);assert.match(await browse.innerText(),new RegExp(String(euCount)))
  await atlas.getByRole('button',{name:'Asia',exact:true}).click()
  const asiaCount=await atlas.getByRole('list').getByRole('button').count()
  assert.notEqual(asiaCount,euCount);assert.equal(await atlas.getByRole('list').getByRole('button',{name:'Spain',exact:true}).count(),0)
  await atlas.getByRole('list').getByRole('button',{name:'Japan',exact:true}).click()
  assert.equal(await browse.getAttribute('aria-expanded'),'false')
  await open.focus()
  // Search selection outside Asia clears both the query and the incompatible filter.
  await search.fill('Spain')
  const result=page.getByRole('button',{name:'Spain',exact:true})
  const positions=await page.evaluate(()=>({result:[...document.querySelectorAll('[role="button"]')].find(el=>el.getAttribute('aria-label')==='Spain')?.getBoundingClientRect().top,globe:document.querySelector('[data-testid="explore-globe"]')?.getBoundingClientRect().top}))
  assert.ok(positions.result<positions.globe)
  assert.equal(await browse.count(),0)
  await result.click()
  if(focusOnly)await page.waitForFunction(()=>document.activeElement?.getAttribute('data-testid')==='explore-atlas-open')
  const focusAfterSearchSelection=await page.evaluate(()=>({tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label')}))
  assert.equal(await search.inputValue(),'')
  assert.equal(await atlas.getByRole('button',{name:'All',exact:true}).getAttribute('aria-selected'),'true')
  assert.equal(await globe.evaluate(el=>el===document.querySelector('[data-testid="explore-globe"] canvas')),true)
  const card=await page.getByTestId('explore-atlas-card').elementHandle(),openNode=await open.elementHandle()
  await open.focus()
  await browse.evaluate(el=>el.click())
  await atlas.getByRole('list').getByRole('button',{name:'Sweden',exact:true}).evaluate(el=>el.click())
  assert.equal(await openNode.evaluate(el=>el===document.activeElement),true)
  assert.equal(await card.evaluate(el=>el===document.querySelector('[data-testid="explore-atlas-card"]')),true)
  assert.equal(await open.getAttribute('aria-label'),'Open Sweden')
  await page.keyboard.press('Enter');await page.waitForURL('**/country/SE')
  await page.goto(`http://localhost:${port}/explore`,{waitUntil:'networkidle'});await showCountry(page)
  await atlas.getByRole('button',{name:'Clear selection',exact:true}).click()
  assert.equal(await page.getByTestId('explore-atlas-card').count(),0)
  assert.match(page.url(),/\/explore$/)
  // An expanded search returns to six rows when the query changes.
  await search.fill('a')
  const resultContainer=search.locator('..').locator('xpath=following-sibling::*[1]')
  assert.equal(await resultContainer.locator('[role="button"][aria-label]').count(),6)
  await page.getByRole('button',{name:/^Show all /}).click()
  const allCount=await resultContainer.locator('[role="button"][aria-label]').count();assert.ok(allCount>6)
  await page.getByRole('button',{name:'Show fewer',exact:true}).click()
  assert.equal(await resultContainer.locator('[role="button"][aria-label]').count(),6)
  await page.getByRole('button',{name:'Clear search',exact:true}).click();assert.equal(await search.inputValue(),'')
  await search.fill('zzzzzzz');assert.match(await resultContainer.innerText(),/0 countries in this course/)
  await page.getByRole('button',{name:'Clear search',exact:true}).first().click()
  await atlas.getByRole('button',{name:'All',exact:true}).click()
  const worldMapText=await page.getByTestId('explore-globe').locator('[dir="auto"]').allTextContents()
  if(finalProof)assert.deepEqual(worldMapText,[])
  await browse.click();const fullCountryCount=await atlas.getByRole('list').getByRole('button').count();assert.ok(fullCountryCount>190);await browse.scrollIntoViewIfNeeded();await screenshot(page,'browse-all-390');await browse.click()
  report.cases.push({name:'behavior',euCount,asiaCount,fullCountryCount,expandedSearchCount:allCount,worldMapText,resultBeforeGlobe:true,queryCleared:true,outsideFilterResets:true,keyboardOpen:true,closeIndependent:true,globeRetained:true,openFocusRetained:true,focusAfterSearchSelection})
}
;(async()=>{
  fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(port,r))
  const browser=await chromium.launch(launchOptions({args:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist']}))
  const context=await browser.newContext({...browserContext,viewport:{width:390,height:844},deviceScaleFactor:2,reducedMotion:'no-preference'})
  const page=await context.newPage();page.on('pageerror',error=>report.errors.push(String(error)))
  try{
    await page.goto(`http://localhost:${port}/`,{waitUntil:'networkidle'});await wait(page,1000);await walkOnboarding(page)
    if(settledOnly){
      await page.goto(`http://localhost:${port}/explore`,{waitUntil:'networkidle'});await wait(page,1500)
      await page.getByTestId('explore-atlas-browse').click();await wait(page,1500);await page.getByTestId('explore-atlas-browse').scrollIntoViewIfNeeded();await screenshot(page,'browse-all-390')
      report.cases.push({name:'all country list after camera and textures settle',count:await page.getByTestId('explore-atlas').getByRole('list').getByRole('button').count()})
    }else{
    for(const[width,height]of (focusOnly?[[390,844]]:[[390,844],[320,568],[768,1024]])){await page.setViewportSize({width,height});await selection(page,width)}
    if(!baseline){
      await page.setViewportSize({width:390,height:844});await selection(page,390);await behavior(page)
      if(!focusOnly){
      await page.goto(`http://localhost:${port}/settings`,{waitUntil:'networkidle'});await page.getByRole('radio',{name:'Dark',exact:true}).click();await page.getByRole('radio',{name:'Svenska',exact:true}).click()
      await page.emulateMedia({reducedMotion:'reduce'})
      for(const[width,height]of [[320,568],[390,844],[768,1024]]){
        await page.setViewportSize({width,height});await page.goto(`http://localhost:${port}/explore`,{waitUntil:'networkidle'})
        await page.getByTestId('explore-search').fill('Storbritannien');await page.getByRole('button',{name:'Storbritannien',exact:true}).click();await wait(page);await scaleText(page)
        const card=page.getByTestId('explore-atlas-card');await card.scrollIntoViewIfNeeded();await screenshot(page,`selected-gb-sv-dark-text2-${width}`)
        const metrics=await cardMetrics(page);assert.deepEqual(metrics.overflow,[])
        report.cases.push({name:'Swedish dark enlarged glyphs reduced motion',width,metrics})
      }
      }
    }
    }
    assert.deepEqual(report.errors,[])
  }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await context.close();await browser.close();await new Promise(r=>server.close(r))}
  console.log(JSON.stringify({cases:report.cases.length,errors:report.errors},null,2))
})().catch(error=>{console.error(error);process.exitCode=1})
