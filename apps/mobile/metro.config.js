/**
 * Metro, taught about the monorepo.
 *
 * Two things break without this, and both fail in ways that look like something else:
 *
 * 1. Metro only watches the app directory by default, so an edit in `packages/design`
 *    silently does nothing until you restart the bundler.
 * 2. pnpm does not hoist. Every dependency is a symlink into `.pnpm/`, so Metro has to
 *    be told to resolve from the workspace root as well as from the app — and
 *    `disableHierarchicalLookup` must stay OFF, or peer dependencies resolved through
 *    symlinks disappear.
 *
 * The classic symptom of getting this wrong is two copies of React in one bundle,
 * which surfaces as "Invalid hook call" — a message that points nowhere near here.
 */

const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
// Workspace packages ship TypeScript source rather than a build step, so the .ts
// entry points have to resolve. `unstable_enableSymlinks` is what makes pnpm work.
config.resolver.unstable_enableSymlinks = true

/**
 * Teach Metro the `.js`-means-`.ts` convention the rest of the toolchain already uses.
 *
 * TypeScript under `moduleResolution: nodenext` requires relative imports to carry the
 * extension of the EMITTED file, so the source says `./i18n.js` and the file on disk is
 * `i18n.tsx`. tsc understands that. vitest understands that. Metro does not: it appends
 * its extension list to the specifier verbatim and looks for `i18n.js.ts`, `i18n.js.tsx`
 * and so on, finds nothing, and stops.
 *
 * This is the reason the app had never bundled — on web OR native. Nothing caught it,
 * because `pnpm typecheck` runs tsc, `pnpm test` runs vitest, and neither one is the
 * bundler. The first thing that ever ran Metro found it on the first file it read.
 *
 * Rewriting to the extensionless specifier lets Metro's normal resolution do the work,
 * so `.ts`, `.tsx`, `.web.tsx` and a genuine `.js` all still resolve, in its own
 * precedence order. Falling through on failure keeps real `.js` files working.
 */
/**
 * Modules that are genuinely optional to their importer, and that we do not want.
 *
 * `@supabase/supabase-js` imports `@opentelemetry/api` behind a try/catch to add
 * tracing when it happens to be installed. Metro resolves statically, so "behind a
 * try/catch" means nothing to it — the import has to resolve or the bundle fails.
 * An empty module is the accurate answer: we are not tracing, and pulling in a
 * telemetry library to satisfy a bundler would ship code no user benefits from.
 */
const OPTIONAL_AND_UNWANTED = new Set(['@opentelemetry/api'])

const resolveTsFromJs = (context, moduleName, platform) => {
  if (OPTIONAL_AND_UNWANTED.has(moduleName)) return { type: 'empty' }

  if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    try {
      return context.resolveRequest(context, moduleName.slice(0, -'.js'.length), platform)
    } catch {
      // A real `.js` file, or a genuinely missing module. Either way the unmodified
      // specifier gives the accurate error rather than one about a path we invented.
    }
  }
  return context.resolveRequest(context, moduleName, platform)
}

config.resolver.resolveRequest = resolveTsFromJs

module.exports = config
