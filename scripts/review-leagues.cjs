/** Local-only review: real bundled app + real Worker/SQLite, synthetic verified test accounts. */
const { chromium } = require('playwright');
const { launchOptions } = require('./chromium.cjs');
const { walkOnboarding } = require('./lib/onboarding-walk.cjs');
const { build } = require('esbuild');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve('node_modules/.cache/wq-league-d1');
const out=path.resolve(process.env.WQ_REVIEW_OUT || 'docs/design/reviews/leagues-2026-09-27');
const base='http://127.0.0.1:4199';
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const bundle=await build({entryPoints:['packages/backend/src/index.ts'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['node:*']});
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-13',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{API_ENABLED:'true',LEAGUES_ENABLED:'true',CHALLENGES_ENABLED:process.env.WQ_FRIENDS==='1'?'true':'false'}}));
 const db=await mf.getD1Database('DB');
 for(const name of fs.readdirSync('packages/backend/migrations').sort()) {
  const statements=fs.readFileSync(`packages/backend/migrations/${name}`,'utf8').replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean);
  await db.batch(statements.map(s=>db.prepare(s)));
 }
 async function verify(id) {
  await db.batch([
   db.prepare('INSERT INTO auth_user(id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,1,0,0)').bind(id,'Review fixture',`${id}@example.test`),
   db.prepare('INSERT INTO identities(subject_id,account_id,linked_at) VALUES (?,?,0)').bind(id,id)
  ]);
 }
 const errors=[],requests=[];
 const server=http.createServer(async(req,res)=>{try{
  const pathname=new URL(req.url,base).pathname;
  if(pathname.startsWith('/v1/')||pathname==='/health') {
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const body=Buffer.concat(chunks).toString();
   const response=await mf.dispatchFetch(base+req.url,{method:req.method,headers:req.headers,...(body?{body}:{})});
   const bytes=Buffer.from(await response.arrayBuffer());
   if(pathname==='/v1/auth/guest'&&response.ok)await verify(JSON.parse(bytes.toString()).userId);
   requests.push({path:pathname,status:response.status});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(bytes);return;
  }
  let file=path.resolve(root,'.'+decodeURIComponent(pathname));
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');
  res.setHeader('Content-Type',{'.html':'text/html','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.ttf':'font/ttf'}[path.extname(file)]||'application/octet-stream');
  fs.createReadStream(file).pipe(res);
 }catch(error){errors.push(String(error));res.writeHead(500);res.end();}});
 await new Promise(resolve=>server.listen(4199,'127.0.0.1',resolve));
 const browser=await chromium.launch(launchOptions());
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'en-US',reducedMotion:'reduce'});
  const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base+'/onboarding',{waitUntil:'networkidle'});
  await walkOnboarding(page);
  const navigate=async route=>{ await page.evaluate(route=>{history.pushState(null,'',route);dispatchEvent(new PopStateEvent('popstate'));},route); };
  await navigate('/league');
  await page.getByRole('button',{name:'Join league',exact:true}).waitFor();
  await page.screenshot({path:path.join(out,'join-390.png'),fullPage:true});
  await page.getByRole('button',{name:'Join league',exact:true}).click();
  await page.getByText('Bronze League',{exact:true}).waitFor();
  await page.getByText('You',{exact:true}).waitFor();
  if(await page.getByText('You are in the promotion zone',{exact:true}).count())throw Error('Zero XP displayed as promotion');
  await page.screenshot({path:path.join(out,'standings-390.png'),fullPage:true});
  await navigate('/');
  await page.getByTestId('daily-adventure').waitFor();
  await navigate('/league');
  await page.getByText('Bronze League',{exact:true}).waitFor();
  for(const width of [320,768]){
   await page.setViewportSize({width,height:844});
   await page.screenshot({path:path.join(out,`standings-${width}.png`),fullPage:true});
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error(`Overflow at ${width}`);
  }
  if(process.env.WQ_UNIFIED==='1') {
   for(const width of [390,320,768]) {
    await page.setViewportSize({width,height:844});
    for(const [name,route] of [['home','/'],['explore','/explore'],['quests','/quests'],['passport','/profile'],['shop','/shop']]) {
     await navigate(route);
     await page.waitForTimeout(800);
     await page.screenshot({path:path.join(out,`${name}-${width}.png`),fullPage:true});
     if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error(`${name} overflow at ${width}`);
    }
   }
   await navigate('/league');
   await page.getByText('Bronze League',{exact:true}).waitFor();
  }
  await page.setViewportSize({width:320,height:844});
  await page.evaluate(()=>{
    const measured=[...document.querySelectorAll('*')].map(node=>({node,font:parseFloat(getComputedStyle(node).fontSize),line:parseFloat(getComputedStyle(node).lineHeight)}));
    for(const {node,font,line} of measured){if(font)node.style.fontSize=`${font*2}px`;if(line)node.style.lineHeight=`${line*2}px`;}
  });
  await page.getByRole('button',{name:'Start a lesson',exact:true}).scrollIntoViewIfNeeded();
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Overflow with 200% text');
  await page.screenshot({path:path.join(out,'standings-large-text.png'),fullPage:true});
  await navigate('/settings');
  const toggle=page.getByRole('switch',{name:'Leagues',exact:true});
  await toggle.waitFor();await toggle.click();
  await page.waitForFunction(()=>[...document.querySelectorAll('[role="switch"]')].some(el=>el.textContent.includes('Leagues')&&el.getAttribute('aria-checked')==='false'));
  const prefs=await db.prepare('SELECT opted_out FROM league_preferences').all();
  if(prefs.results.some(r=>r.opted_out!==1))throw Error('Opt-out not persisted');
  if(process.env.WQ_FRIENDS==='1') {
   await page.setViewportSize({width:390,height:844});
   // Clear the large-text probe by remounting the route, preserving secure in-memory auth.
   await navigate('/friends');
   await page.getByRole('button',{name:'Create invitation',exact:true}).click();
   await page.getByText('Your private invitation',{exact:true}).waitFor();
   const invite=(await page.locator('body').innerText()).match(/\b[a-f0-9]{24}\b/)[0];
   await page.screenshot({path:path.join(out,'friends-invitation.png'),fullPage:true});
   await page.setViewportSize({width:320,height:844});
   await page.screenshot({path:path.join(out,'friends-invitation-320.png'),fullPage:true});
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Invitation overflow at 320');
   await page.evaluate(()=>{
    globalThis.__fontProbe=[...document.querySelectorAll('*')].map(node=>({node,style:node.getAttribute('style'),font:parseFloat(getComputedStyle(node).fontSize),line:parseFloat(getComputedStyle(node).lineHeight)}));
    for(const {node,font,line} of globalThis.__fontProbe){if(font)node.style.fontSize=`${font*2}px`;if(line)node.style.lineHeight=`${line*2}px`;}
   });
   await page.getByRole('button',{name:'Share code',exact:true}).scrollIntoViewIfNeeded();
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Invitation overflow with 200% text');
   await page.screenshot({path:path.join(out,'friends-large-text.png'),fullPage:true});
   await page.evaluate(()=>{for(const {node,style} of globalThis.__fontProbe){if(style===null)node.removeAttribute('style');else node.setAttribute('style',style);}delete globalThis.__fontProbe;});
   await page.setViewportSize({width:390,height:844});
   const secondContext=await browser.newContext({viewport:{width:390,height:844},locale:'en-US',reducedMotion:'reduce'});
   const second=await secondContext.newPage();second.setDefaultTimeout(45000);second.on('pageerror',e=>errors.push(String(e)));
   await second.goto(base+'/onboarding',{waitUntil:'networkidle'});await walkOnboarding(second);
   await second.evaluate(()=>{history.pushState(null,'','/friends');dispatchEvent(new PopStateEvent('popstate'));});
   await second.getByLabel('Private challenge code',{exact:true}).fill(invite);
   await second.getByRole('button',{name:'Join challenge',exact:true}).click();
   await second.getByRole('button',{name:'Open challenge',exact:true}).waitFor();
   const row=await db.prepare('SELECT id,questions,answers FROM friend_challenges').first();
   const quiz=JSON.parse(row.questions),answers=JSON.parse(row.answers);
   for(const [player,win] of [[page,true],[second,false]]) {
    await player.getByRole('button',{name:'Open challenge',exact:true}).click();
    for(let i=0;i<10;i++) {
     await player.getByText(`Question ${i+1} of 10`,{exact:true}).waitFor();
     const choice=quiz[i].options.find(o=>win?o.id===answers[i]:o.id!==answers[i]);
     await player.getByRole('button',{name:choice.label,exact:true}).click();
     if(i===0)await player.screenshot({path:path.join(out,win?'friends-question.png':'friends-same-question.png'),fullPage:true});
     if(win&&i===0)await player.setViewportSize({width:320,height:480});
     await player.getByRole('button',{name:'Lock answer',exact:true}).click();
     if(win&&i===0) {
      const next=player.getByText('Question 2 of 10',{exact:true});await next.waitFor();
      await player.waitForFunction(()=>[...document.querySelectorAll('[dir="auto"]')].some(node=>node.textContent==='Question 2 of 10'&&node.getBoundingClientRect().top>=0));
      await player.screenshot({path:path.join(out,'friends-next-question-320.png'),fullPage:true});
      await player.setViewportSize({width:390,height:844});
     }
    }
    await player.getByRole('button',{name:'Send results',exact:true}).click();
    await player.getByText(win?'Your answers are saved. Waiting for your friend.':'A good round together',{exact:true}).waitFor();
   }
   await page.getByRole('button',{name:'Refresh challenges',exact:true}).click();
   await page.getByText('You won this round',{exact:true}).waitFor();
   await page.getByText('You: 10/10 · Friend: 0/10',{exact:true}).scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(out,'friends-result.png'),fullPage:true});
   await second.getByRole('button',{name:'Report explorer',exact:true}).click();
   await second.getByRole('button',{name:'Unwanted invitations',exact:true}).click();
   await second.getByText('Your report has been received.',{exact:true}).waitFor();
   await second.getByRole('button',{name:'Block explorer',exact:true}).click();
   await second.getByText('Explorer blocked. They cannot join your future challenges.',{exact:true}).waitFor();
   await secondContext.close();
   fs.writeFileSync(path.join(out,'friends-report.json'),JSON.stringify({kind:'Two synthetic verified accounts; real Worker and app',checks:['Private invitation join','Identical ten-question round','Server graded 10 versus 0','Results hidden until both finish','Report queue saved','Block saved'],errors},null,2));
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({kind:'Local app + real D1; synthetic verified test account',checks:['Explicit join','Persisted membership after screen remount','Zero XP not promoted','320/390/768 width','200% text and reachable lesson action','One-tap opt-out saved'],errors,requests},null,2));
  if(errors.length)throw Error(errors.join('\n'));
  console.log('League browser checks passed');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));await mf.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});

