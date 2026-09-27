/** Local-only preview of the real Expo export. No backend credentials or production writes. */
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../node_modules/.cache/wq-web')
const port = Number(process.env.WQ_PREVIEW_PORT ?? 4188)
const types = { '.html':'text/html; charset=utf-8', '.js':'application/javascript', '.json':'application/json', '.css':'text/css', '.png':'image/png', '.webp':'image/webp', '.ttf':'font/ttf', '.wav':'audio/wav', '.ico':'image/x-icon' }
http.createServer((request,response)=>{
  let route
  try { route=decodeURIComponent(new URL(request.url,'http://localhost').pathname) }
  catch {response.writeHead(400);response.end();return}
  let file=path.resolve(root, '.' + route)
  if(file!==root && !file.startsWith(root+path.sep)) {response.writeHead(403);response.end();return}
  if(!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if(path.extname(route)) {response.writeHead(404);response.end();return}
    file=path.join(root,'index.html')
  }
  response.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream','Cache-Control':'no-store'})
  fs.createReadStream(file).pipe(response)
}).listen(port,'127.0.0.1',()=>console.log(`WorldQuest preview: http://localhost:${port}`))
