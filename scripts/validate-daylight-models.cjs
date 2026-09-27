/** Static GLB contract: embedded buffers, real mesh data, bounded size, finite animations. */
const fs = require('node:fs')
const crypto = require('node:crypto')
const path = require('node:path')
const root = path.resolve('docs/design/assets/models')
const result = []
for (const name of ['atlas-companion', 'globe', 'treasure-chest', 'star-trophy', 'heart']) {
  const bytes = fs.readFileSync(path.join(root, `${name}.glb`))
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length)
    throw new Error(`${name}: invalid GLB envelope`)
  const gltf = JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'))
  if (!gltf.meshes?.length || !gltf.scenes?.length) throw new Error(`${name}: empty scene`)
  if (gltf.buffers.some(b=>b.uri)) throw new Error(`${name}: external buffer`)
  const triangles = gltf.meshes.reduce((n,m)=>n+m.primitives.reduce((n,p)=>n+gltf.accessors[p.indices].count/3,0),0)
  if (triangles > 80000 || bytes.length > 8*1024*1024) throw new Error(`${name}: asset budget exceeded`)
  const animations = (gltf.animations ?? []).map(a=>({
    name:a.name, channels:a.channels.length,
    seconds:Math.max(...a.samplers.map(s=>gltf.accessors[s.input].max[0])),
  }))
  if (['atlas-companion','globe','treasure-chest'].includes(name) && !animations.length)
    throw new Error(`${name}: missing motion`)
  result.push({name,bytes:bytes.length,triangles,animations,sha256:crypto.createHash('sha256').update(bytes).digest('hex')})
}
fs.writeFileSync(path.join(root,'validation.json'),JSON.stringify({
  tool:'scripts/validate-daylight-models.cjs',
  scope:'Static GLB validation only. Blender preview renders reviewed separately; no native GPU performance claim.',
  models:result,
},null,2)+'\n')
console.log(JSON.stringify(result,null,2))
