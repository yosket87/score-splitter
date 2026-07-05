import { createElement, type ImgHTMLAttributes } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Hero } from '@/features/waitlist-lp/components/hero'
import { SimulatorUsageProvider } from '@/features/waitlist-lp/components/simulator-usage-provider'

const joinWaitlistMock = vi.hoisted(() => vi.fn())
vi.mock('@/app/actions/waitlist', () => ({ joinWaitlist: joinWaitlistMock }))

type NextImageTestProps = ImgHTMLAttributes<HTMLImageElement> & {
  priority?: boolean
}

vi.mock('next/image', () => ({
  default: ({ priority, ...props }: NextImageTestProps) => {
    void priority
    return createElement('img', props)
  },
}))

function renderHero() {
  return render(
    <SimulatorUsageProvider>
      <Hero />
    </SimulatorUsageProvider>
  )
}

describe('Hero', () => {
  it('実画面プレビューと信頼材料を表示する', () => {
    renderHero()

    expect(
      screen.getByRole('heading', {
        name: 'ふたりの収入から、ふたりの経費を引いて、残りを山分け。',
      })
    ).toBeInTheDocument()
    expect(
      screen.getByAltText(
        'ヤマワケの月次画面で収支、お小遣い、精算額を表示しているプレビュー'
      )
    ).toBeInTheDocument()
    expect(screen.getByText('メールのみで登録')).toBeInTheDocument()
    expect(screen.getByText('金額は送信されません')).toBeInTheDocument()
    expect(screen.getByText('先行登録で6ヶ月無料予定')).toBeInTheDocument()
  })

  it('ヒーロー内のcompactフォームを一意なidで表示する', () => {
    renderHero()

    expect(screen.getByText('公開時に優先案内を受け取る')).toBeInTheDocument()
    expect(screen.getByLabelText('メールアドレス')).toHaveAttribute(
      'id',
      'hero-waitlist-email'
    )
    expect(screen.getByLabelText('無料なら使いたい')).toHaveAttribute(
      'id',
      'hero-waitlist-price-free-only'
    )
  })
})
