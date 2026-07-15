import { readFileSync } from 'fs'
import { join } from 'path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrandLogo } from '@/components/brand/brand-logo'
import { BrandMark } from '@/components/brand/brand-mark'

describe('BrandMark', () => {
  it('ヤマワケのアクセシブルな名前を持つ', () => {
    render(<BrandMark />)

    expect(screen.getByRole('img', { name: 'ヤマワケ' })).toBeInTheDocument()
  })

  it('夫と妻を表す同じ太さの2本の曲線を描く', () => {
    const { container } = render(<BrandMark />)
    const husbandPath = container.querySelector('[data-person="husband"]')
    const wifePath = container.querySelector('[data-person="wife"]')

    expect(husbandPath).toHaveAttribute('stroke-width')
    expect(wifePath).toHaveAttribute(
      'stroke-width',
      husbandPath?.getAttribute('stroke-width') ?? undefined
    )
    expect(husbandPath?.getAttribute('d')).toMatch(/^M4 6 C/)
    expect(wifePath?.getAttribute('d')).toMatch(/^M4 26 C/)
  })

  it('カラーバリアントでは夫の青と妻のローズを使い分ける', () => {
    const { container } = render(<BrandMark variant="color" />)

    expect(container.querySelector('[data-person="husband"]')).toHaveAttribute(
      'stroke',
      'var(--brand-husband)'
    )
    expect(container.querySelector('[data-person="wife"]')).toHaveAttribute(
      'stroke',
      'var(--brand-wife)'
    )
  })

  it('モノクロと反転トーンを組み合わせられる', () => {
    const { container } = render(<BrandMark variant="mono" tone="inverse" />)
    const mark = screen.getByRole('img', { name: 'ヤマワケ' })

    expect(mark).toHaveAttribute('data-variant', 'mono')
    expect(mark).toHaveAttribute('data-tone', 'inverse')
    expect(container.querySelector('[data-person="husband"]')).toHaveAttribute('stroke', 'currentColor')
    expect(container.querySelector('[data-person="wife"]')).toHaveAttribute('stroke', 'currentColor')
  })
})

describe('BrandLogo', () => {
  it('ニュートラル色のワードマークを表示する', () => {
    render(<BrandLogo />)

    expect(screen.getByRole('img', { name: 'ヤマワケ' })).toHaveTextContent('ヤマワケ')
    expect(screen.getByText('ヤマワケ')).toHaveClass('text-foreground')
  })

  it('compactではアクセシブルな名前を保ってマークだけを表示する', () => {
    render(<BrandLogo compact />)

    expect(screen.getByRole('img', { name: 'ヤマワケ' })).toBeInTheDocument()
    expect(screen.queryByText('ヤマワケ')).not.toBeInTheDocument()
  })

  it('反転トーンではワードマークを明るいニュートラル色にする', () => {
    render(<BrandLogo tone="inverse" />)

    expect(screen.getByText('ヤマワケ')).toHaveClass('text-white')
  })
})

describe('アプリアイコン', () => {
  it('ブランドと同じ夫婦の等幅曲線を使う', () => {
    const icon = readFileSync(join(process.cwd(), 'src/app/icon.svg'), 'utf-8')
    const widths = [...icon.matchAll(/stroke-width="([^"]+)"/g)].map((match) => match[1])

    expect(icon).toContain('var(--brand-husband, #2563EB)')
    expect(icon).toContain('var(--brand-wife, #C43B5C)')
    expect(widths).toHaveLength(2)
    expect(new Set(widths).size).toBe(1)
  })
})
