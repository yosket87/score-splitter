import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

function readProjectFile(path: string): string {
  return readFileSync(join(projectRoot, path), 'utf-8')
}

describe('ブランド整合性', () => {
  it.each([
    'README.md',
    'docs/README.md',
    '.interface-design/system.md',
    '.env.mock',
    'wrangler.jsonc',
    'cloudflare-env.d.ts',
  ])('%s でヤマワケをブランド名として使用する', (path) => {
    const content = readProjectFile(path)

    expect(content).toContain('ヤマワケ')
    expect(content).not.toContain('Score Splitter')
  })

  it('新しいSVGアイコンだけをアプリアイコンとして使用する', () => {
    expect(existsSync(join(projectRoot, 'src/app/icon.svg'))).toBe(true)
    expect(existsSync(join(projectRoot, 'src/app/favicon.ico'))).toBe(false)
  })
})
