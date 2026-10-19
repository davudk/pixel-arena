// Lets Node run the core's TypeScript directly (Node strips types itself): extensionless relative
// imports resolve to .ts files. Use: node --import ./web/tools/ts-resolve.mjs script.mjs
import { register } from 'node:module'

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\\.[a-z]+$/.test(specifier)) {
    try { return await next(specifier + '.ts', context) } catch {}
    try { return await next(specifier + '/index.ts', context) } catch {}
  }
  return next(specifier, context)
}`))
