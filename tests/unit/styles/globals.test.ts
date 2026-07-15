import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const cssPath = join(process.cwd(), 'src/app/globals.css')

function readCss() {
  return readFileSync(cssPath, 'utf-8')
}

function getCssBlock(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const block = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1]

  expect(block, `${selector} のCSSブロック`).toBeDefined()
  return block ?? ''
}

function getCustomProperty(block: string, property: string) {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const value = block.match(new RegExp(`${escapedProperty}:\\s*([^;]+);`))?.[1]?.trim()

  expect(value, `${property} の値`).toBeDefined()
  return value ?? ''
}

function contrastRatio(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const channels = hex
      .replace('#', '')
      .match(/.{2}/g)
      ?.map((channel) => Number.parseInt(channel, 16) / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4
      )

    if (!channels || channels.length !== 3) {
      throw new Error(`6桁のHEXカラーが必要です: ${hex}`)
    }

    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  }

  const foregroundLuminance = luminance(foreground)
  const backgroundLuminance = luminance(background)
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  )
}

describe('globals.css', () => {
  it('ライトモードのmuted-foregroundは白背景で読める濃さにする', () => {
    const css = readCss()

    expect(css).toContain('--muted-foreground: #767676;')
    expect(css).not.toContain('--muted-foreground: #999999;')
  })

  it('色名と実体がずれたneon-greenトークンを残さない', () => {
    const css = readCss()

    expect(css).not.toContain('neon-green')
  })

  it('夫婦のブランド色と別系統のデストラクティブ色を定義する', () => {
    const css = readCss()
    const root = getCssBlock(css, ':root')
    const dark = getCssBlock(css, '.dark')

    expect(css).toContain('--brand-husband: #2563EB;')
    expect(css).toContain('--brand-wife: #C43B5C;')
    expect(getCustomProperty(root, '--app-destructive')).not.toBe(
      getCustomProperty(root, '--brand-wife')
    )
    expect(getCustomProperty(dark, '--app-destructive')).not.toBe(
      getCustomProperty(dark, '--brand-wife')
    )
  })

  it('LPの従来destructive色を保ちアプリだけ別トークンへ切り替える', () => {
    const css = readCss()
    const root = getCssBlock(css, ':root')
    const dark = getCssBlock(css, '.dark')
    const appShell = getCssBlock(css, '.app-shell')

    expect(getCustomProperty(root, '--destructive')).toBe('#E2483D')
    expect(getCustomProperty(dark, '--destructive')).toBe('#F87171')
    expect(getCustomProperty(root, '--app-destructive')).toBe('#B42318')
    expect(getCustomProperty(dark, '--app-destructive')).toBe('#FF8A75')
    expect(getCustomProperty(appShell, '--destructive')).toBe('var(--app-destructive)')
  })

  it.each([
    ['夫', '--brand-husband', '--husband-light'],
    ['妻', '--brand-wife', '--wife-light'],
  ])('%sの14px文字と淡色背景は4.5:1以上のコントラストを持つ', (_, foreground, background) => {
    const root = getCssBlock(readCss(), ':root')
    const ratio = contrastRatio(
      getCustomProperty(root, foreground),
      getCustomProperty(root, background)
    )

    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })

  it('アプリ専用のアンビエント背景と選択的なサーフェスを提供する', () => {
    const css = readCss()

    expect(css).toContain('.app-shell')
    expect(css).toContain('.app-glass-heavy')
    expect(css).toContain('.app-sticky-glass')
    expect(css).toContain('.app-solid-panel')
    expect(css).toContain('backdrop-filter: blur(')
  })

  it('透明度低減とコントラスト向上の設定を尊重する', () => {
    const css = readCss()

    expect(css).toContain('@media (prefers-reduced-transparency: reduce)')
    expect(css).toContain('@media (prefers-contrast: more)')
    expect(css).toContain('backdrop-filter: none')
  })
})
