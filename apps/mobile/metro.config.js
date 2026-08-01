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

module.exports = config
