/** Original vector artwork, native-ready transparent WebPs, and a layered Atlas rig.
 * Source SVGs are editable. No third-party characters, meshes or raster tracing.
 * Country/continent outlines remain sourced from Natural Earth.
 */
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { chromium } = require('playwright')
const { launchOptions } = require('./chromium.cjs')
const root = path.resolve(__dirname, '..')
const masters = path.join(root, 'docs/design/assets/playful')
const output = path.join(root, 'apps/mobile/assets/art/playful')
const lib = path.join(root, 'apps/mobile/src/lib')
const P = { ink:'#164D59', teal:'#20BAC0', dark:'#078795', light:'#97F1E4', cream:'#FFF3D6', gold:'#FFCE44', edge:'#E7A927', orange:'#FF8748', blue:'#38B9ED', green:'#8ED448', purple:'#A58AEE', white:'#FFFFFF' }
const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 256 256">${body}</svg>`
const rect = (x,y,w,h,r,fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`
const circle = (x,y,r,fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`
const line = (d,color=P.ink,width=10) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`
const shape = (d,color) => `<path d="${d}" fill="${color}"/>`
const star = (x=128,y=125,r=78,fill=P.gold) => {
  const points=Array.from({length:10},(_,i)=>{const a=i*Math.PI/5-Math.PI/2,n=i%2?r*.48:r;return `${x+Math.cos(a)*n},${y+Math.sin(a)*n}`}).join(' ')
  return `<polygon points="${points}" fill="${fill}" stroke="${fill}" stroke-width="9" stroke-linejoin="round"/>`
}
const layer = {
  'leg-left': rect(86,190,34,43,15,P.dark)+rect(75,216,49,21,10,P.ink)+rect(78,216,44,12,6,P.teal),
  'leg-right': rect(137,190,34,43,15,P.dark)+rect(134,216,49,21,10,P.ink)+rect(136,216,44,12,6,P.teal),
  'arm-left': line('M84 143 Q59 155 57 178',P.dark,25)+circle(54,179,17,P.teal)+line('M49 180 L57 184',P.light,5),
  'arm-right': line('M172 143 Q197 135 198 111',P.dark,25)+circle(200,104,19,P.teal)+line('M188 98 L184 88 M199 92 L199 81 M209 95 L216 86',P.teal,10)+line('M194 106 L203 110',P.light,5),
  body: rect(82,130,92,75,29,P.dark)+rect(87,127,82,70,25,P.cream)+shape('M93 131 L128 162 L161 131Z',P.orange)+shape('M126 151 L113 180 L130 175 L142 184 L145 162Z',P.orange)+rect(143,168,14,13,4,P.gold),
  head: rect(60,54,136,84,35,P.dark)+rect(62,47,132,83,34,P.teal)+rect(74,65,108,56,25,P.ink)+shape('M85 71 Q101 64 114 70 L91 89Z','#276875')+shape('M73 51 Q79 10 127 12 Q174 10 185 52Z',P.gold)+shape('M77 41 Q128 54 181 40 L185 53 Q130 69 73 53Z',P.edge)+`<ellipse cx="128" cy="53" rx="78" ry="13" fill="${P.gold}"/>`+rect(118,19,22,18,7,P.cream),
  eyes: `<ellipse cx="106" cy="91" rx="10" ry="13" fill="${P.white}"/><ellipse cx="150" cy="91" rx="10" ry="13" fill="${P.white}"/>`+circle(109,94,5,P.ink)+circle(147,94,5,P.ink)+line('M119 107 Q128 115 137 107',P.light,4),
}
const atlas = (mode='welcome',accent=P.teal) => {
  const tilt=mode==='thinking'?-7:mode==='resting'?5:0
  const right=mode==='resting'||mode==='thinking'?`<g transform="rotate(72 172 143)">${layer['arm-right']}</g>`:layer['arm-right']
  const left=mode==='celebrate'?`<g transform="rotate(125 84 143)">${layer['arm-left']}</g>`:layer['arm-left']
  return (layer['leg-left']+layer['leg-right']+left+right+layer.body+`<g transform="rotate(${tilt} 128 123)">${layer.head+layer.eyes}</g>`).replaceAll(P.teal,accent)
}
const globe = circle(128,118,88,P.dark)+circle(128,109,84,P.blue)+`<ellipse cx="128" cy="109" rx="40" ry="84" fill="${P.teal}"/>`+line('M48 83 Q128 111 208 83 M48 138 Q128 112 208 138 M128 28 L128 193',P.light,5)+rect(118,191,20,27,5,P.edge)+rect(76,215,104,17,8,P.gold)
const heart = shape('M128 224 C109 201 33 159 33 101 C33 48 99 33 128 78 C157 33 223 48 223 101 C223 159 147 201 128 224Z','#D74765')+shape('M128 205 C108 182 42 149 42 96 C42 53 99 45 128 88 C157 45 214 53 214 96 C214 149 148 182 128 205Z','#FF6681')+line('M65 93 Q69 72 86 75','#FFB8C4',12)
const flame = shape('M129 19 C153 64 198 72 211 128 C229 199 181 236 127 236 C73 236 34 200 42 147 C47 117 65 105 79 91 C72 124 84 133 93 130 C110 111 93 70 129 19Z',P.orange)+shape('M131 112 C145 143 171 158 170 184 C169 207 151 222 128 222 C103 222 84 208 85 186 C86 165 104 150 110 139 C108 168 116 173 123 167 C131 156 122 138 131 112Z',P.gold)
const freeze = shape('M77 32 L177 32 L226 117 L180 220 L74 220 L30 117Z',P.blue)+shape('M77 32 L177 32 L159 64 L94 64 L62 117 L30 117Z','#9DEAFF')+line('M128 76 L128 181 M83 102 L174 155 M82 155 L173 102 M116 86 L128 98 L140 86 M116 170 L128 158 L140 170',P.white,9)
const chest = rect(40,112,176,112,24,P.dark)+rect(40,104,176,109,23,P.teal)+shape('M40 112 L40 90 Q40 50 79 50 L178 50 Q216 50 216 90 L216 112Z',P.gold)+rect(40,103,176,17,6,P.edge)+rect(65,56,17,151,6,P.edge)+rect(174,56,17,151,6,P.edge)+rect(107,112,42,48,10,P.cream)+circle(128,130,7,P.ink)+rect(124,130,8,14,2,P.ink)
const gem = shape('M64 35 L192 35 L233 94 L128 233 L23 94Z',P.dark)+shape('M64 25 L192 25 L233 84 L128 218 L23 84Z',P.blue)+shape('M64 25 L101 84 L23 84Z',P.light)+shape('M64 25 L128 25 L101 84Z','#D5FFF4')+shape('M128 25 L192 25 L155 84 L101 84Z',P.teal)+shape('M192 25 L233 84 L155 84Z',P.light)+shape('M101 84 L155 84 L128 218Z',P.teal)+line('M74 39 L56 66',P.white,8)
const chestBase = rect(40,105,176,122,24,P.dark)+rect(40,101,176,110,23,P.teal)+rect(44,97,168,22,10,P.ink)+rect(65,115,17,91,6,P.edge)+rect(174,115,17,91,6,P.edge)+rect(107,114,42,48,10,P.cream)+circle(128,130,7,P.ink)+rect(124,130,8,14,2,P.ink)
const chestLid = shape('M40 112 L40 90 Q40 50 79 50 L178 50 Q216 50 216 90 L216 112Z',P.gold)+rect(40,103,176,17,6,P.edge)+rect(65,56,17,58,6,P.edge)+rect(174,56,17,58,6,P.edge)+line('M95 67 L157 67',P.cream,8)
const house = shape('M24 115 L128 26 L232 115Z',P.orange)+rect(47,110,162,125,16,P.gold)+rect(103,155,51,80,12,P.teal)+rect(66,131,28,30,6,P.cream)+rect(166,131,28,30,6,P.cream)
const passport = rect(43,24,170,212,24,P.dark)+rect(43,24,158,202,23,P.teal)+circle(122,105,48,P.cream)+line('M74 105 L170 105 M122 58 Q90 105 122 152 M122 58 Q154 105 122 152',P.dark,6)+rect(85,173,76,10,5,P.cream)+rect(98,192,50,7,3,P.light)
const trophy = line('M84 61 L44 61 L44 91 Q44 128 90 134 M172 61 L212 61 L212 91 Q212 128 166 134',P.edge,19)+shape('M72 39 L184 39 L179 115 Q174 153 137 165 L137 198 L175 210 L175 227 L81 227 L81 210 L119 198 L119 165 Q82 153 77 115Z',P.gold)+star(128,93,31,P.cream)+rect(81,218,94,14,5,P.edge)
const compass = circle(128,128,97,P.edge)+circle(128,120,91,P.gold)+circle(128,120,73,P.cream)+shape('M153 67 L142 134 L103 174 L114 107Z',P.orange)+shape('M153 67 L114 107 L103 174 L128 124Z',P.teal)+circle(128,120,10,P.ink)
const flag = line('M62 225 L62 35',P.ink,15)+shape('M70 40 Q108 12 145 39 Q177 57 216 31 L216 137 Q177 163 143 142 Q105 118 70 144Z',P.teal)+shape('M77 51 Q110 31 140 48 L140 83 Q110 62 77 85Z',P.light)
const mountain = shape('M19 219 L99 52 Q105 39 113 52 L151 115 L174 80 Q179 72 185 83 L240 219Z',P.teal)+shape('M81 83 L106 44 L139 95 L120 91 L111 103 L100 83 L88 94Z',P.cream)+shape('M161 100 L179 74 L199 112 L181 105 L175 114Z',P.cream)
const book = shape('M28 53 Q75 36 122 63 L122 224 Q71 199 28 215Z',P.teal)+shape('M228 53 Q181 36 134 63 L134 224 Q185 199 228 215Z',P.blue)+line('M48 82 Q77 74 103 88 M48 111 Q77 103 103 117 M153 88 Q179 74 207 82 M153 117 Q179 103 207 111',P.cream,8)
const pin = shape('M128 236 C106 204 50 151 50 102 C50 3 206 3 206 102 C206 151 150 204 128 236Z',P.orange)+circle(128,100,37,P.cream)+circle(128,100,17,P.edge)
const building = shape('M28 90 L128 28 L228 90Z',P.teal)+rect(39,91,178,20,6,P.dark)+[57,101,145,189].map(x=>rect(x,115,17,81,5,P.gold)).join('')+rect(34,196,188,20,5,P.teal)+rect(23,219,210,16,5,P.dark)
const people = circle(87,85,36,P.gold)+circle(174,95,30,P.orange)+rect(34,131,108,91,39,P.teal)+rect(148,134,74,83,30,P.blue)+line('M70 87 Q86 101 101 87',P.ink,5)
const eye = shape('M21 128 Q128 6 235 128 Q128 250 21 128Z',P.teal)+circle(128,128,47,P.cream)+circle(128,128,27,P.ink)+circle(137,117,10,P.white)
const calendar = rect(39,44,178,188,24,P.teal)+rect(39,44,178,52,20,P.orange)+line('M83 26 L83 61 M172 26 L172 61',P.ink,14)+line('M85 159 L112 185 L171 124',P.cream,16)
const crown = shape('M35 66 L85 110 L128 38 L171 110 L221 66 L202 207 L54 207Z',P.gold)+rect(54,188,148,29,8,P.edge)+circle(128,139,16,P.orange)
const glyphs = { capitals:building,collections:book,consistency:flame,countries:globe,events:calendar,exploration:compass,flags:flag,hidden:eye,landmarks:mountain,legendary:crown,perfect:star(),premium:star(128,125,80,P.purple),social:people }
const rankShapes = {wanderer:pin,scout:flag,pathfinder:compass,navigator:compass,cartographer:book,trailblazer:mountain,voyager:globe,globetrotter:globe,circumnavigator:compass,worldkeeper:crown}
const badges = {bronze:['#D48A55','#F8C396'],silver:['#8FAFBC','#DCEBF0'],gold:[P.edge,P.gold],platinum:['#58BFC0','#BBF5EC'],legendary:['#8B69C6','#D7BAFF']}
const burst = Array.from({length:18},(_,i)=>{let a=i*Math.PI/9,r=i%2?99:77,x=128+Math.cos(a)*r,y=128+Math.sin(a)*r;return `<g transform="translate(${x} ${y}) rotate(${i*31})">${rect(-5,-10,10,20,3,[P.gold,P.teal,P.orange,P.blue,P.purple][i%5])}</g>`}).join('')
const rays = Array.from({length:12},(_,i)=>`<g transform="rotate(${i*30} 128 128)">${shape('M121 35 L128 7 L135 35Z',i%2?P.gold:P.light)}</g>`).join('')

async function main() {
  fs.mkdirSync(masters,{recursive:true});fs.mkdirSync(output,{recursive:true})
  const names = [...fs.readFileSync(path.join(lib,'art.generated.ts'),'utf8').matchAll(/^  '([^']+)':/gm)].map(m=>m[1]).filter((n,i,a)=>a.indexOf(n)===i)
  const files = {}, records = {}, hashes = {}
  const browser = await chromium.launch(launchOptions());const page = await browser.newPage()
  async function save(name,body,fullFrame=false) {
    const source=svg(body), file=name.replaceAll('/','--')
    fs.writeFileSync(path.join(masters,file+'.svg'),source)
    const result=await page.evaluate(async ({source,fullFrame})=>{
      const img=new Image();img.src='data:image/svg+xml;base64,'+btoa(source);await img.decode()
      const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');ctx.drawImage(img,0,0)
      const data=ctx.getImageData(0,0,512,512).data;let x0=512,y0=512,x1=0,y1=0
      for(let y=0;y<512;y++)for(let x=0;x<512;x++)if(data[(y*512+x)*4+3]>8){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)}
      return {data:c.toDataURL('image/webp',.92).split(',')[1],geometry:fullFrame?{aspect:1,x:0,y:0,w:1,h:1}:{aspect:1,x:x0/512,y:y0/512,w:(x1-x0+1)/512,h:(y1-y0+1)/512}}
    },{source,fullFrame})
    const bytes=Buffer.from(result.data,'base64');if(bytes.length>120*1024)throw Error(name+' is too large')
    fs.writeFileSync(path.join(output,file+'.webp'),bytes)
    files[name]=file;records[name]=result.geometry;hashes[file]={bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}
  }
  try {
    for(const name of names) {
      const [family,id]=name.split('/');let art
      if(family==='atlas')art=atlas(['resting','thinking','broken-compass'].includes(id)?'thinking':['celebrate','encouraging'].includes(id)?'celebrate':'welcome')
      if(family==='onboarding')art=id==='conquer'?atlas('celebrate'):id==='learn'?atlas('thinking'):atlas()
      if(family==='states')art=id==='empty-collection'?chest:id==='hearts-empty'?heart:id==='empty-caught-up'?atlas('celebrate'):atlas('thinking')
      if(family==='celebration')art=id==='rays'?rays:burst
      if(family==='rewards')art=id==='globe'?globe:id==='streak-flame'?flame:freeze
      if(family==='achievements') {
        if(id.startsWith('glyph-'))art=glyphs[id.slice(6)]
        else {const [edge,face]=badges[id.slice(5)];art=shape('M55 151 L37 242 L86 222 L116 246 L128 164 L142 246 L174 222 L219 242 L200 151Z',edge)+circle(128,128,101,edge)+circle(128,128,95,face)+circle(128,128,73,P.cream)+`<circle cx="128" cy="128" r="83" fill="none" stroke="${P.cream}" stroke-width="5"/>`}
      }
      if(family==='levels')art=circle(128,128,120,P.cream)+`<g transform="translate(35 35) scale(.73)">${rankShapes[id]}</g>`+star(202,207,21,P.gold)
      if(family==='avatars') {
        const n=Number(id.slice(-2))-1,faces=[P.teal,P.blue,P.purple,P.orange,P.green,'#F485A2'],accent=faces[n%6]
        const hats=n<4?'':n<8?shape('M56 64 L91 13 L128 41 L171 13 L204 64Z',P.gold):rect(83,14,91,35,12,P.purple)
        art=circle(128,128,123,[P.cream,'#E5F7FC','#F1EBFC'][n%3])+`<g transform="translate(-4 16) scale(1.03)">${atlas(n%3===0?'celebrate':n%3===1?'thinking':'welcome',accent)}</g>`+hats
      }
      if(family.startsWith('continents')) {
        const data=fs.readFileSync(path.join(root,'apps/mobile/assets/geo/daylight',id+'.png')).toString('base64')
        const color={EU:'#4D7FE6',AS:P.orange,AF:'#D9A418',NA:P.teal,SA:P.green,OC:P.purple,AN:P.blue}[id]
        art=`<defs><mask id="map"><image href="data:image/png;base64,${data}" x="8" y="35" width="240" height="180"/></mask></defs>`+(family==='continents'?rect(0,0,256,256,0,'#E8F6FB'):'')+`<rect width="256" height="256" fill="${color}" mask="url(#map)"/>`
      }
      if(!art)throw Error('Missing original artwork for '+name)
      await save(name,art)
    }
    for(const [name,body] of Object.entries(layer))await save('rig/'+name,body,true)
    for(const [name,body] of Object.entries({'atlas-welcome':atlas(),'atlas-celebrate':atlas('celebrate'),'atlas-calm':atlas('thinking'),'atlas-companion':atlas(),globe,heart,house,passport,gem,'chest-base':chestBase,'chest-lid':chestLid,'star-trophy':trophy,'treasure-chest':chest}))await save('props/'+name,body)
    const imports=Object.keys(files).map((name,i)=>`import a${i} from '../../assets/art/playful/${files[name]}.webp'`).join('\n')
    const indexOf=name=>Object.keys(files).indexOf(name)
    fs.writeFileSync(path.join(lib,'art.generated.ts'),`// Generated by scripts/build-playful-art.cjs. Editable SVG masters in docs/design/assets/playful.\n${names.map(n=>`import a${indexOf(n)} from '../../assets/art/playful/${files[n]}.webp'`).join('\n')}\nexport type ArtModule = number | string\nexport const ART_BY_NAME = {\n${names.map(n=>`  '${n}': a${indexOf(n)},`).join('\n')}\n} as const\nexport type ArtName = keyof typeof ART_BY_NAME\nexport type ArtGeometry = { readonly aspect:number; readonly x:number; readonly y:number; readonly w:number; readonly h:number }\nexport const ART_GEOMETRY = {\n${names.map(n=>`  '${n}': ${JSON.stringify(records[n])},`).join('\n')}\n} as const satisfies Readonly<Record<ArtName,ArtGeometry>>\n`)
    for(const [prefix,file,exportName] of [['props','daylight.generated.ts','DAYLIGHT_ART'],['rig','atlas-rig.generated.ts','ATLAS_RIG']]) {
      const subset=Object.keys(files).filter(n=>n.startsWith(prefix+'/'))
      fs.writeFileSync(path.join(lib,file),`// Generated original vector artwork. Do not edit.\n${subset.map(n=>`import a${indexOf(n)} from '../../assets/art/playful/${files[n]}.webp'`).join('\n')}\nexport const ${exportName} = {\n${subset.map(n=>`  '${n.split('/')[1]}': {asset:a${indexOf(n)},geometry:${JSON.stringify(records[n])}},`).join('\n')}\n} as const\n`)
    }
    // Brand assets are original vector exports, never flattened from a screenshot.
    for(const [file,size,bg,body] of [['icon',1024,'#E5F7FC',atlas()],['adaptive-icon',1024,'#E5F7FC',`<g transform="translate(43 43) scale(.66)">${atlas()}</g>`],['splash',1024,P.white,`<g transform="translate(64 64) scale(.5)">${atlas()}</g>`],['favicon',64,'#E5F7FC',`<g transform="translate(-42 -20) scale(1.32)">${layer.head+layer.eyes}</g>`]]) {
      const png=await page.evaluate(async({source,size})=>{const i=new Image();i.src='data:image/svg+xml;base64,'+btoa(source);await i.decode();const c=document.createElement('canvas');c.width=c.height=size;c.getContext('2d').drawImage(i,0,0,size,size);return c.toDataURL('image/png').split(',')[1]},{source:svg(rect(0,0,256,256,0,bg)+body),size})
      fs.writeFileSync(path.join(root,'apps/mobile/assets',file+'.png'),Buffer.from(png,'base64'))
    }
    fs.writeFileSync(path.join(masters,'validation.json'),JSON.stringify({style:'WorldQuest playful vector v1',count:Object.keys(files).length,totalBytes:Object.values(hashes).reduce((s,h)=>s+h.bytes,0),assets:hashes},null,2)+'\n')
    const cards=Object.entries(files).map(([n,f])=>`<figure><img src="${f}.svg" alt="${n}"><figcaption>${n}</figcaption></figure>`).join('')
    fs.writeFileSync(path.join(masters,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><title>WorldQuest asset sheet</title><style>body{background:#f4f8fa;font:14px system-ui;color:#164d59}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:16px}figure{margin:0;padding:12px;background:white;border-radius:16px}img{width:100%}figcaption{overflow-wrap:anywhere}</style><h1>WorldQuest original asset family</h1><main>${cards}</main></html>`)
    console.log(`${names.length} catalogue illustrations + ${Object.keys(files).length-names.length} rig/prop assets; ${Math.round(Object.values(hashes).reduce((s,h)=>s+h.bytes,0)/1024)}KB total`)
  } finally {await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
