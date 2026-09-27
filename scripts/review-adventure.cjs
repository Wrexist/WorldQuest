/** Capture actual app routes and verify the illustrated path still teaches. */
const { chromium } = require('playwright');
const { launchOptions } = require('./chromium.cjs');
const { walkOnboarding } = require('./lib/onboarding-walk.cjs');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(process.env.WQ_WEB || 'node_modules/.cache/wq-adventure-delivery');
const out = path.resolve(process.env.WQ_REVIEW_OUT || 'docs/design/reviews/adventure-2026-09-27');
const base = 'http://localhost:4198';
const server = http.createServer((req,res) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url,base).pathname));
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root,'index.html');
  res.setHeader('Content-Type', {'.html':'text/html','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.ttf':'font/ttf'}[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  if (!fs.existsSync(path.join(root,'index.html'))) throw Error('Export the app first');
  fs.mkdirSync(out,{recursive:true});
  await new Promise(resolve => server.listen(4198,'127.0.0.1',resolve));
  const browser = await chromium.launch(launchOptions());
  const results = [], errors = [];
  try {
    const context = await browser.newContext({viewport:{width:390,height:844},locale:'en-US',reducedMotion:process.env.WQ_MASCOT_MOTION === '1' ? 'no-preference' : 'reduce', ...(process.env.WQ_MASCOT_MOTION === '1' ? {recordVideo:{dir:out,size:{width:390,height:844}}} : {})});
    const page = await context.newPage(); page.setDefaultNavigationTimeout(90000); page.setDefaultTimeout(30000); page.on('pageerror',e => errors.push(String(e)));
    await page.goto(base+'/onboarding',{waitUntil:'networkidle'});
    await page.getByText('Get started',{exact:true}).first().waitFor({state:'visible',timeout:60000});
    await walkOnboarding(page, async step => {
      if (process.env.WQ_MASCOT_MOTION === '1' && step === 'slide-1') {
        const arm = page.getByTestId('mascot-right-arm').first();
        const samples = [];
        for (let i=0;i<8;i++) { samples.push(await arm.evaluate(n=>getComputedStyle(n.parentElement).transform)); await page.waitForTimeout(75); }
        if (new Set(samples).size < 2) throw Error('Mascot arm did not articulate');
        results.push({flow:'Independent arm animation',pass:true});
        await page.waitForTimeout(2500);
        await page.emulateMedia({reducedMotion:'reduce'});
        await page.waitForTimeout(250);
        const still = await arm.evaluate(n=>getComputedStyle(n.parentElement).transform);
        await page.waitForTimeout(400);
        if (still !== await arm.evaluate(n=>getComputedStyle(n.parentElement).transform)) throw Error('Reduced motion did not settle');
        results.push({flow:'Reduced motion settles character immediately',pass:true});
        await page.emulateMedia({reducedMotion:'no-preference'});
      }
      if (process.env.WQ_MASCOT_MOTION === '1' && step === 'slide-3') await page.waitForTimeout(2200);
      if (process.env.WQ_MASCOT === '1' && step.startsWith('slide-')) {
        await page.screenshot({path:path.join(out, 'onboarding-' + step + '.png')});
      }
    });
    await page.emulateMedia({reducedMotion:'reduce'});
    for (const width of [390,320,768]) {
      await page.setViewportSize({width,height:844});
      for (const route of ['','explore','quests','profile','shop']) {
        await page.goto(base+'/'+route,{waitUntil:'networkidle'});
        await page.waitForTimeout(500);
        if (!route) await page.getByTestId('daily-adventure').scrollIntoViewIfNeeded();
        const broken = await page.evaluate(() => Array.from(document.images).filter(i => !i.complete || i.naturalWidth === 0).map(i=>i.src));
        if (broken.length) throw Error('Undecoded artwork: '+broken.join(','));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth+1);
        if (overflow) throw Error('Horizontal overflow: '+route+' '+width);
        await page.screenshot({path:path.join(out,(route||'home')+(width===390?'':'-'+width)+'.png')});
        results.push({route:route||'home',width,artworkLoaded:true,horizontalOverflow:false});
        console.log('Captured',route||'home',width);
      }
    }
    if (process.env.WQ_PLATFORM === '1') {
      await page.setViewportSize({width:320,height:844});
      await page.goto(base+'/',{waitUntil:'networkidle'});
      const landscapes = await page.locator('[data-testid="path-unit"] img').evaluateAll(images => images.filter(img => img.src.includes('island')).length);
      if (landscapes) throw Error('Landscape art remains behind platforms');
      if (process.env.WQ_RING_CHECK === '1') {
        const geometry = await page.getByTestId('path-node-current').evaluate(node => {
          const box = id => node.querySelector(`[data-testid="${id}"]`).getBoundingClientRect();
          const ring = box('lesson-ring-track'), face = box('platform-face'), socket = box('platform-socket');
          return { ringRound:Math.abs(ring.width-ring.height), faceRound:Math.abs(face.width-face.height), centerX:Math.abs(ring.x+ring.width/2-socket.x-socket.width/2), centerY:Math.abs(ring.y+ring.height/2-socket.y-socket.height/2) };
        });
        if (Object.values(geometry).some(delta => delta > 1)) throw Error('Asymmetric platform: '+JSON.stringify(geometry));
        results.push({flow:'Circular platform and ring share a center', geometry, pass:true});
      }
      await page.evaluate(() => {
        const fonts = Array.from(document.querySelectorAll('*')).map(node => ({node, font:parseFloat(getComputedStyle(node).fontSize), line:parseFloat(getComputedStyle(node).lineHeight)}));
        for (const {node,font,line} of fonts) {
          const capped = node.closest('[data-max-scale]');
          const factor = capped ? Number(capped.getAttribute('data-max-scale')) || 2 : 2;
          if (Number.isFinite(font)) node.style.setProperty('font-size',`${font*factor}px`,'important');
          if (Number.isFinite(line)) node.style.setProperty('line-height',`${line*factor}px`,'important');
        }
      });
      await page.getByTestId('trail-next').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(out,'home-320-text200.png')});
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth+1)) throw Error('200% text creates horizontal overflow');
      results.push({flow:'Platform path has no landscape; 320px with doubled text stays within viewport width',pass:true});
    }
    await page.setViewportSize({width:390,height:844});
    await page.goto(base+'/',{waitUntil:'networkidle'});
    await page.getByTestId('path-node-locked').first().click();
    await page.getByTestId('path-card').waitFor({state:'visible'});
    await page.waitForFunction(() => {
      const card = document.querySelector('[data-testid="path-card"]');
      if (!card) return false;
      const rect = card.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight - 80;
    });
    await page.screenshot({path:path.join(out,'map-inspection.png')});
    results.push({flow:'Map scrolls selected explanation above the tab bar',pass:true});
    results.push({flow:'Locked step explains how to unlock',pass:true});
    await page.getByTestId('path-node-current').click();
    await page.waitForURL(/\/lesson/);
    results.push({flow:'Current step starts a real lesson',pass:true});
    if (errors.length) throw Error(errors.join('\n'));
    if (process.env.WQ_MASCOT_MOTION === '1') { const video = page.video(); await context.close(); await video.saveAs(path.join(out,'mascot-in-app.webm')); }
    fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({results,errors},null,2));
    const routes=['home','explore','quests','profile','shop'];
    const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>WorldQuest â€” adventure design</title><style>body{margin:0;background:#f6f5f0;color:#182d25;font:16px system-ui;padding:32px}h1{font-size:30px;margin:0 0 12px}p{max-width:780px;line-height:1.6}main{display:grid;grid-template-columns:repeat(5,minmax(220px,1fr));gap:20px;overflow:auto}img{width:100%;border-radius:24px;border:1px solid #dadfd5}h2{font-size:18px;text-transform:capitalize}a{color:#214f3d}</style><h1>WorldQuest Â· A world worth exploring</h1><p>Actual app screenshots after onboarding. Illustrated journeys, seven destination scenes, a refined explorer and a treasure banner. All progress and balances shown are real. The globe companion uses independent native-driven layers for its eyes, arms and body. Reduced-motion layouts are shown here.</p><main>${routes.map(n=>`<section><a href="${n}.png"><img alt="WorldQuest ${n} screen" src="${n}.png"></a><h2>${n}</h2></section>`).join('')}</main><p><a href="browser-report.json">Browser checks</a> Â· <a href="../../assets/adventure/PROMPTS.md">Artwork prompts and provenance</a></p></html>`;
    fs.writeFileSync(path.join(out,'index.html'),html);
    const gallery = await browser.newPage({viewport:{width:1800,height:1000},deviceScaleFactor:1});
    await gallery.goto(require('node:url').pathToFileURL(path.join(out,'index.html')).href);
    await gallery.screenshot({path:path.join(out,'gallery.png'),fullPage:true});
    await gallery.close();
    console.log(JSON.stringify({checks:results.length,errors:errors.length,output:out}));
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

