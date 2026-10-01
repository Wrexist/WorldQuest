const { beginLesson } = require('./lib/lesson-walk.cjs');
/** Render real lessons at phone sizes and require all four answers above the fold.
 * Run after Expo web export; WQ_WEB selects the exported bundle.
 */
const { chromium } = require('playwright');
const { launchOptions } = require('./chromium.cjs');
const { walkOnboarding } = require('./lib/onboarding-walk.cjs');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(process.env.WQ_WEB || 'node_modules/.cache/wq-web'),out=path.resolve(process.env.WQ_PHONE_SHOTS || 'node_modules/.cache/vivid-phone-layout');
const origin='http://127.0.0.1:4198';
const server=http.createServer((req,res)=>{
 let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,origin).pathname));
 if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');
 res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream');
 fs.createReadStream(file).pipe(res);
});
(async()=>{
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(4198,'127.0.0.1',r));
 const browser=await chromium.launch(launchOptions());const failures=[];const results=[];
 try{
  const page=await browser.newPage({viewport:{width:390,height:759},locale:'en-US',reducedMotion:'reduce',colorScheme:process.env.WQ_APPEARANCE==='dark'?'dark':'light'});
  page.setDefaultTimeout(45000);await page.goto(origin,{waitUntil:'networkidle'});await walkOnboarding(page);
  // The 759pt viewport reserves 85pt of an 844pt iPhone screen for native safe areas.
  for(const [width,height] of [[390,759],[375,667],[320,568]]){
   await page.setViewportSize({width,height});
   for(const attr of ['location','capital','flag']){
    await page.goto(origin+'/lesson?attr='+attr,{waitUntil:'networkidle'});
    await page.waitForTimeout(800); await beginLesson(page);
    await page.getByTestId('answer-option').nth(3).waitFor();await page.waitForTimeout(500);
    const fit=await page.evaluate(()=>{
     const options=[...document.querySelectorAll('[data-testid="answer-option"]')].filter(n=>n.getBoundingClientRect().height>0).map(n=>{const r=n.getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height}});
     const button=document.querySelector('[data-testid="lesson-check"]')?.getBoundingClientRect();
     const viewport=document.querySelector('[data-testid="lesson-scroll"]')?.getBoundingClientRect();
     return {options,footer:button?.top??innerHeight,height:Math.min(innerHeight,viewport?.bottom??innerHeight)};
    });
    const ok=fit.options.length===4&&fit.options.every(r=>r.top>=0&&r.bottom<=Math.min(fit.footer,fit.height)+1&&r.height>=44);
    const name=`${attr}-${width}x${height}`;results.push({name,ok,...fit});if(!ok)failures.push(name);
    await page.screenshot({path:path.join(out,name+'.png')});console.log((ok?'PASS ':'FAIL ')+name);
    if(width===390&&attr==='location'){
     const first=page.getByTestId('answer-option').first();await first.click();
     await page.emulateMedia({colorScheme:process.env.WQ_APPEARANCE==='dark'?'light':'dark'});
     await page.waitForTimeout(200);
     if(await first.getAttribute('aria-selected')!=='true')throw Error('Theme change lost the selected answer');
     await page.screenshot({path:path.join(out,'live-theme-selected.png')});
     await page.emulateMedia({colorScheme:process.env.WQ_APPEARANCE==='dark'?'dark':'light'});
     console.log('PASS theme switch preserves actual lesson selection');
    }
   }
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(results,null,2));
 }finally{await browser.close();server.close();}
 if(failures.length)throw Error('Answers require scrolling: '+failures.join(', '));
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
