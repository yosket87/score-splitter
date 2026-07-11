import { ArrowRightLeft, CalendarDays, Calculator } from 'lucide-react'
import { SectionCard } from './section-card'

const features = [
  {
    icon: CalendarDays,
    title: '月ごとに記録',
    description:
      'ふたりの収入と共通経費を月単位で記録。どちらが払ったかも一緒に残ります。',
  },
  {
    icon: ArrowRightLeft,
    title: '繰越も忘れない',
    description:
      '今月精算しない立替は繰越として翌月へ。精算し忘れがなくなります。',
  },
  {
    icon: Calculator,
    title: '精算額は自動計算',
    description:
      '収入合計から経費を引いて残りを山分け。「どちらがいくら払うか」が1つの数字で出ます。',
  },
]

export function FeatureSection() {
  return (
    <section className="bg-background px-6 py-20">
      <h2 className="text-center text-3xl font-bold tracking-tight">ヤマワケができること</h2>
      <div className="mx-auto mt-12 grid max-w-4xl gap-10 sm:grid-cols-3">
        {features.map((feature) => (
          <SectionCard
            key={feature.title}
            icon={feature.icon}
            title={feature.title}
            description={feature.description}
          />
        ))}
      </div>
    </section>
  )
}
