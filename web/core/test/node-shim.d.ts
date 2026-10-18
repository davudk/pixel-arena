// The tests use a couple of Node APIs; declaring them avoids depending on @types/node.
declare module 'node:fs' {
  export function readFileSync(path: URL | string): Uint8Array
  export function writeFileSync(path: URL | string, data: Uint8Array): void
}
declare const process: { env: Record<string, string | undefined> }
