import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Heart } from 'lucide-react'
import { SectionCard } from '@/features/waitlist-lp/components/section-card'

describe('SectionCard', () => {
  it('タイトルと説明を表示する', () => {
    render(<SectionCard icon={Heart} title="タイトル" description="説明文" />)
    expect(screen.getByRole('heading', { name: 'タイトル' })).toBeInTheDocument()
    expect(screen.getByText('説明文')).toBeInTheDocument()
  })

  it('row レイアウトでも表示できる', () => {
    render(
      <SectionCard icon={Heart} title="行タイトル" description="行説明" layout="row" />
    )
    expect(screen.getByRole('heading', { name: '行タイトル' })).toBeInTheDocument()
    expect(screen.getByText('行説明')).toBeInTheDocument()
  })
})
