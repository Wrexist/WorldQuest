/** Build the offline reference from exactly the Worker's active lesson catalogue. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { learningContent } from '../packages/backend/src/learning-content.js'
import { encodeReferenceCatalogue } from '../packages/content/src/reference-catalogue.js'

const target = resolve('apps/mobile/assets/content/reference-catalogue.bin')
const payload = JSON.stringify(encodeReferenceCatalogue([...learningContent.facts.values()])) + '\n'
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, payload)
console.log(`Reference catalogue: ${learningContent.facts.size} facts, ${Buffer.byteLength(payload)} bytes outside the JS bundle`)
