import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('globals.css', () => {
  it('ライトモードのmuted-foregroundは白背景で読める濃さにする', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf-8')

    expect(css).toContain('--muted-foreground: #64748B;')
    expect(css).not.toContain('--muted-foreground: #999999;')
  })

  it('色名と実体がずれたneon-greenトークンを残さない', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf-8')

    expect(css).not.toContain('neon-green')
  })
})
