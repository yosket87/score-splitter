import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { YamawakeFlow } from '@/features/waitlist-lp/components/yamawake-flow'

describe('YamawakeFlow', () => {
  it('3ステップの見出しを表示する', () => {
    render(<YamawakeFlow />)
    expect(screen.getByText('ふたりの収入をひとつに')).toBeInTheDocument()
    expect(screen.getByText('共通経費を引いて')).toBeInTheDocument()
    expect(screen.getByText('残りを山分け')).toBeInTheDocument()
  })

  it('各ステップのバーにaria-labelで金額説明がある', () => {
    render(<YamawakeFlow />)
    expect(
      screen.getByRole('img', {
        name: 'あなたの収入30万円とパートナーの収入20万円を合わせて50万円',
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('img', {
        name: '50万円から共通経費18万円を引いて残り32万円',
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('img', {
        name: '残り32万円をふたりで16万円ずつ山分け',
      })
    ).toBeInTheDocument()
  })
})
