/** Real UI walkthrough: two course lessons, actual grading, reward chain, next node. */
const { chromium } = require('playwright');
const { launchOptions } = require('./chromium.cjs');
const { walkOnboarding } = require('./lib/onboarding-walk.cjs');
const fs=require('fs'), path=require('path'), http=require('http');
const root=path.resolve(process.env.WQ_WEB || 'node_modules/.cache/wq-journey'), out=path.resolve(process.env.WQ_REVIEW_OUT || 'docs/design/reviews/lesson-journey-2026-09-27');
const entities=require('../packages/content/packs/geography/entities.countries.v1.json').items;
const flags=require('../packages/content/packs/geography/facts.flags.v1.json').items;
const base='http://localhost:4196';
const server=http.createServer((req,res)=>{
 let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,base).pathname));
 if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');
 res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf','.json':'application/json'})[path.extname(file)]||'application/octet-stream');
 fs.createReadStream(file).pipe(res);
});
const assert=(ok,message)=>{if(!ok)throw Error(message);console.log('PASS '+message);};
async function correctIndex(page){
 const prompt=await page.getByRole('heading').first().innerText();
 const options=await page.getByTestId('answer-option').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')||n.textContent));
 const entity=entities.find(e=>prompt.includes(e.names.en));
 const described=flags.find(f=>prompt.includes(f.value.names.en));
 if(described){const country=entities.find(e=>e.id===described.entity);const i=options.findIndex(s=>s===country?.names.en);if(i>=0)return i;}
 if(entity){
   const fact=flags.find(f=>f.entity===entity.id);
   const i=options.findIndex(s=>s.includes(fact?.value.names.en));
   if(i>=0)return i;
   const images=await page.getByTestId('answer-option').evaluateAll(nodes=>nodes.map(n=>Array.from(n.querySelectorAll('img')).map(i=>i.src).join(' ')));
   const imageIndex=images.findIndex(src=>new RegExp('/'+entity.id+'[.-]','i').test(src));
   if(imageIndex>=0)return imageIndex;
 }
 const srcs=await page.getByTestId('prompt-art').locator('img').evaluateAll(imgs=>imgs.map(i=>i.src));
 const flagEntity=entities.find(e=>srcs.some(src=>new RegExp('/'+e.id+'[.-]','i').test(src)));
 if(flagEntity){const i=options.findIndex(s=>s.includes(flagEntity.names.en));if(i>=0)return i;}
 throw Error('No grounded answer for '+JSON.stringify({prompt,options,srcs}));
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 await new Promise(r=>server.listen(4196,'127.0.0.1',r));
 const browser=await chromium.launch(launchOptions());
 const errors=[];
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'en-US',reducedMotion:'no-preference',recordVideo:{dir:out,size:{width:390,height:844}}});
  const page=await context.newPage();page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(90000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/onboarding',{waitUntil:'networkidle'});await walkOnboarding(page);
  await page.goto(base+'/',{waitUntil:'networkidle'});await page.getByTestId('path-node-current').click();
  for(let lesson=1;lesson<=2;lesson++){
   await page.getByTestId('answer-option').first().waitFor();
   await page.screenshot({path:path.join(out,`lesson-${lesson}-start.png`)});
   for(let question=0;question<60;question++){
    if(await page.getByTestId('summary-continue').count())break;
    await page.getByTestId('answer-option').first().waitFor();
    // Read before answering: the grader rejects implausibly fast automated responses.
    await page.waitForTimeout(1500);
    const right=await correctIndex(page);
    const wrong=lesson===1&&question===0;
    await page.getByTestId('answer-option').nth(wrong?(right+1)%4:right).click();
    await page.getByTestId('answer-sheet').waitFor();
    if(question<2){await page.waitForTimeout(500);await page.screenshot({path:path.join(out,`lesson-${lesson}-${wrong?'review':'earned'}.png`)});}
    if(!wrong)assert(await page.getByTestId('earned-xp').count()===1,'correct answer shows graded XP');
    await page.getByRole('button',{name:'Continue',exact:true}).click();
   }
   await page.getByTestId('summary-continue').waitFor();await page.waitForTimeout(700);
   assert(!/^0 XP earned$/.test((await page.getByTestId('summary-xp').getAttribute('aria-label'))||''),'completed lesson retains earned XP');
   await page.screenshot({path:path.join(out,`lesson-${lesson}-summary.png`)});
   await page.getByTestId('summary-continue').click();
   for(let step=0;step<20;step++){
    await page.waitForTimeout(500);
    if(await page.getByTestId('journey-ready').count())break;
    if(await page.getByTestId('open-streak-chest').count()){await page.getByTestId('open-streak-chest').click(); await page.getByText('+1 streak gem',{exact:true}).waitFor({timeout:10000}); await page.screenshot({path:path.join(out,'streak-collectible.png')}); continue;}
    if(new URL(page.url()).pathname==='/create-profile'){await page.getByRole('button',{name:/not now/i}).click();continue;}
    const next=page.getByRole('button',{name:'Continue',exact:true});
    if(await next.count())await next.click();
   }
   await page.getByTestId('journey-ready').waitFor();
   await page.waitForTimeout(700);
   await page.screenshot({path:path.join(out,`lesson-${lesson}-next.png`)});
   const body=await page.locator('body').innerText();
   assert(body.includes(lesson===1?'Lesson 2 of 2':'Find where 6 countries are in the world.'),'saved progress reveals the correct next challenge');
   if(lesson===1){await page.emulateMedia({reducedMotion:'reduce'});await page.getByTestId('journey-start').click();}
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:320,height:844});await page.reload({waitUntil:'networkidle'});
  await page.getByTestId('journey-start').waitFor();
  assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)),'320px reduced-motion reveal has no horizontal overflow');
  await page.screenshot({path:path.join(out,'next-320-reduced.png')});
  await page.getByRole('button',{name:'Back to my journey',exact:true}).click();
  await page.getByTestId('path-node-current').waitFor();
  assert((await page.getByTestId('path-node-current').getAttribute('aria-label')).includes('Find where'),'Home points to the same next step');
  assert(errors.length===0,'no uncaught browser errors');
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({lessonsCompleted:2,intentionalMistakes:1,nextNodeRevealed:true,reducedMotion:true,errors},null,2));
  const video=page.video();await context.close();if(video){await video.saveAs(path.join(out,'learning-loop.webm'));await video.delete();}
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
