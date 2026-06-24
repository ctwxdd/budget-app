import { readdir, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

await rm('.tmp-test', { recursive: true, force: true })
run('./node_modules/.bin/tsc', ['-p', 'tsconfig.unit.json'])
await writeFile('.tmp-test/package.json', '{"type":"commonjs"}\n')

const findTests = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(entries.map((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return findTests(path)
    return entry.isFile() && entry.name.endsWith('.test.cjs') ? [path] : []
  }))
  return files.flat()
}

const tests = await findTests('tests/unit')
run('node', ['--test', ...tests])
