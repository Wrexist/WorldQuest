/**
 * Read a design token from `packages/design/tokens.json`, for the build scripts.
 *
 * The scripts in this folder are CommonJS and run under plain `node`, so they cannot
 * import `@worldquest/design` — that package is ESM TypeScript, and adding a compile
 * step to a script whose whole job is to rasterise a PNG is not worth it. But the
 * alternative they were using is worse: `scripts/build-art.cjs` and
 * `scripts/measure-design.cjs` each carried `const CANVAS = '#0B1730'`, a copy of
 * `color.bg.canvas` with a comment saying so and nothing checking it.
 *
 * A copy of a colour in a script that BAKES THAT COLOUR INTO SHIPPED PNGs is the worst
 * place for drift to hide: change the canvas token and every screen moves except the
 * matte behind the app icon, which stays the old colour until someone notices the seam
 * on a launcher that masks to a circle. So the scripts read the real file instead.
 *
 * `tokens.json` is JSON, and its semantic layer holds `{palette.a.b}` references that
 * `pnpm design:tokens` resolves when it generates `tokens.ts`. This resolves them the
 * same way, one level, which is all the file uses.
 */

const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const TOKENS = join(__dirname, '..', 'packages', 'design', 'tokens.json')

/** `a.b.c` → the value at that path, or `undefined`. */
function at(root, path) {
  return path.split('.').reduce((node, key) => (node === undefined ? undefined : node[key]), root)
}

/**
 * The value of a token path, with any one `{palette.x.y}` reference followed.
 *
 * Throws rather than returning a placeholder: a script that silently drew onto the
 * string "{palette.space.800}" would produce a black matte and no error, and the
 * failure would first be visible in a store listing.
 */
function token(path) {
  const tokens = JSON.parse(readFileSync(TOKENS, 'utf8'))
  const raw = at(tokens, path)

  if (typeof raw !== 'string') {
    throw new Error(`tokens.json has no string at "${path}" (got ${JSON.stringify(raw)})`)
  }

  const reference = raw.match(/^\{(.+)\}$/)
  if (reference === null) return raw

  const resolved = at(tokens, reference[1])
  if (typeof resolved !== 'string') {
    throw new Error(`"${path}" points at "${reference[1]}", which is not a value`)
  }
  return resolved
}

module.exports = { token }
