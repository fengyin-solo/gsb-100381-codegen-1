// 打包并执行交接台账业务规则校验：node scripts/run-verify.mjs
import { build } from 'esbuild'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const outfile = resolve(tmpdir(), 'verify-handover.bundle.mjs')

await build({
  entryPoints: [resolve(here, 'verify-handover.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  alias: { '@': resolve(root, 'src') },
  inject: [resolve(here, 'localStorage-shim.ts')],
})

await import(pathToFileURL(outfile).href)
