import { Heart } from 'lucide-react'

/**
 * 山分けの仕組みを固定の金額例で図解するインフォグラフィック。
 * スケールは「ふたりの収入合計50万円 = 100%」で3ステップ共通。
 * 担当者カラー（rose-600 / amber-700）はdatavizバリデーター検証済み。
 */
export function YamawakeFlow() {
  return (
    <section className="px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-center text-2xl font-bold">ヤマワケの仕組み</h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          たとえば、あなたの月収30万円・パートナー20万円・共通経費18万円なら
        </p>

        <div className="mt-10 space-y-10">
          <FlowStep number={1} title="ふたりの収入をひとつに">
            <div
              className="flex h-12 w-full gap-0.5"
              role="img"
              aria-label="あなたの収入30万円とパートナーの収入20万円を合わせて50万円"
            >
              <div
                className="flex items-center justify-center rounded-l-lg rounded-r-[4px] bg-rose-600 text-xs font-medium text-white"
                style={{ width: '60%' }}
              >
                あなた 30万円
              </div>
              <div
                className="flex items-center justify-center rounded-r-lg rounded-l-[4px] bg-amber-700 text-xs font-medium text-white"
                style={{ width: '40%' }}
              >
                パートナー 20万円
              </div>
            </div>
          </FlowStep>

          <FlowStep number={2} title="共通経費を引いて">
            <div
              className="flex h-12 w-full gap-0.5"
              role="img"
              aria-label="50万円から共通経費18万円を引いて残り32万円"
            >
              <div
                className="flex items-center justify-center rounded-l-lg rounded-r-[4px] bg-stone-400 text-xs font-medium text-white dark:bg-stone-600"
                style={{ width: '36%' }}
              >
                経費 −18万円
              </div>
              <div
                className="flex items-center justify-center rounded-r-lg rounded-l-[4px] border-2 border-dashed border-amber-400/70 bg-amber-50 text-xs font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                style={{ width: '64%' }}
              >
                残り 32万円
              </div>
            </div>
          </FlowStep>

          <FlowStep number={3} title="残りを山分け">
            <div className="relative">
              <div
                className="flex h-12 w-full gap-0.5"
                role="img"
                aria-label="残り32万円をふたりで16万円ずつ山分け"
              >
                <div className="opacity-0" style={{ width: '36%' }} aria-hidden="true" />
                <div
                  className="flex items-center justify-center rounded-l-lg rounded-r-[4px] bg-rose-600 text-xs font-medium text-white"
                  style={{ width: '32%' }}
                >
                  16万円
                </div>
                <div
                  className="flex items-center justify-center rounded-r-lg rounded-l-[4px] bg-amber-700 text-xs font-medium text-white"
                  style={{ width: '32%' }}
                >
                  16万円
                </div>
              </div>
              {/* 位置指定はinline transformに一本化（Tailwindのtranslateユーティリティは transform ではなく translate プロパティで合成されるため併用しない） */}
              <span
                className="absolute top-1/2 inline-flex size-8 items-center justify-center rounded-full border-2 border-background bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-md"
                style={{ left: '68%', transform: 'translate(-50%, -100%)' }}
                aria-hidden="true"
              >
                <Heart className="size-4 fill-current" />
              </span>
            </div>
            <p className="mt-3 text-right text-sm font-semibold text-muted-foreground">
              ふたりとも、同じ取り分。
            </p>
          </FlowStep>
        </div>
      </div>
    </section>
  )
}

interface FlowStepProps {
  number: number
  title: string
  children: React.ReactNode
}

function FlowStep({ number, title, children }: FlowStepProps) {
  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <span
          className="inline-flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-amber-500 text-xs font-bold text-white"
          aria-hidden="true"
        >
          {number}
        </span>
        {title}
      </p>
      <div className="mt-3">{children}</div>
    </div>
  )
}
