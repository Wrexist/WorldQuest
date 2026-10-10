/**
 * Copy the Expedition island into the app.
 *
 * This also packed the robot Atlas's five 3D performances into sprite sheets
 * (`atlas3d/*-sheet|poster|pose.webp` and `atlas3d.generated.ts`). The robot was retired
 * for the clay globe in September 2026 and nothing imported them any more, so on
 * 2026-10-09 they were deleted (7.6 MB of the repository; the app bundle never carried
 * them). The source renders and `atlas.glb` remain under docs/design/3d/atlas.
 */
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const output = path.join(root, 'apps/mobile/assets/art/atlas3d')
fs.mkdirSync(output, { recursive: true })
fs.copyFileSync(path.join(root, 'docs/design/3d/expedition/expedition.webp'), path.join(output, 'expedition.webp'))
console.log('Copied the Expedition island.')
