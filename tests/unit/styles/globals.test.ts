import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('globals.css', () => {
  it('ライトモードのmuted-foregroundは白背景で読める濃さにする', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf-8')

    expect(css).toContain('--muted-foreground: #767676;')
    expect(css).not.toContain('--muted-foreground: #999999;')
  })

  it('色名と実体がずれたneon-greenトークンを残さない', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf-8')

    expect(css).not.toContain('neon-green')
  })

  it('夫婦のブランド色と別系統のデストラクティブ色を定義する', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf-8')
    const wife = css.match(/--brand-wife:\s*([^;]+);/)?.[1]
    const destructive = css.match(/--destructive:\s*([^;]+);/)?.[1]

    expect(css).toContain('--brand-husband: #2563EB;')
    expect(css).toContain('--brand-wife: #C43B5C;')
    expect(wife).toBeTruthy()
    expect(destructive).toBeTruthy()
    expect(destructive).not.toBe(wife)
  })

  it('アプリ専用のアンビエント背景と選択的なサーフェスを提供する', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf-8')

    expect(css).toContain('.app-shell')
    expect(css).toContain('.app-glass-heavy')
    expect(css).toContain('.app-sticky-glass')
    expect(css).toContain('.app-solid-panel')
    expect(css).toContain('backdrop-filter: blur(')
  })

  it('透明度低減とコントラスト向上の設定を尊重する', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf-8')

    expect(css).toContain('@media (prefers-reduced-transparency: reduce)')
    expect(css).toContain('@media (prefers-contrast: more)')
    expect(css).toContain('backdrop-filter: none')
  })
})
