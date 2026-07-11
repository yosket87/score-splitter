import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('globals.css', () => {
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf-8')

  it('ライトモードのmuted-foregroundは白背景で読める濃さにする', () => {
    expect(css).toContain('--muted-foreground: #6e6e73;')
    expect(css).not.toContain('--muted-foreground: #999999;')
  })

  it('アクセントはAction Blue #0066ccに単一化する', () => {
    expect(css).toContain('--accent: #0066cc;')
    expect(css).toContain('--ring: #0066cc;')
  })

  it('色名と実体がずれたneon系トークンを残さない', () => {
    expect(css).not.toContain('neon-green')
    expect(css).not.toContain('neon-red')
    expect(css).not.toContain('neon-cyan')
  })

  it('装飾グラデーションを定義しない', () => {
    expect(css).not.toContain('linear-gradient')
    expect(css).not.toContain('radial-gradient')
  })
})
