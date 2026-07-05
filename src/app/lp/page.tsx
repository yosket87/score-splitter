import type { Metadata } from 'next'
import { WaitlistLp } from '@/features/waitlist-lp'

const metadataBase = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
)

export const metadata: Metadata = {
  metadataBase,
  title: 'ヤマワケ（仮称）| ふたりの収入から経費を引いて、残りを山分け',
  description:
    '共働き夫婦の毎月の精算を1つの数字で終わらせる家計アプリを準備中。収入合算から共通経費を引いて残りを山分けする精算額を自動計算します。ウェイトリスト受付中。',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'ヤマワケ（仮称）| ふたりの家計を山分けする精算アプリ',
    description:
      '収入合算から共通経費を引いて残りを山分け。共働き夫婦のための精算アプリのウェイトリスト受付中です。',
    type: 'website',
    images: [
      {
        url: '/lp/monthly-dashboard-preview.png',
        width: 960,
        height: 720,
        alt: 'ヤマワケの月次画面プレビュー',
      },
    ],
  },
}

export default function LpPage() {
  return <WaitlistLp />
}
