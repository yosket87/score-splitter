import { FileSpreadsheet, ReceiptText, Scale } from 'lucide-react'
import { SectionCard } from './section-card'

const problems = [
  {
    icon: FileSpreadsheet,
    title: '精算がExcel頼み',
    description:
      '毎月末にスプレッドシートを開いて、収入と立替をコピペして関数を直す。その作業、毎月やっていませんか。',
  },
  {
    icon: ReceiptText,
    title: '立替の記憶が消える',
    description:
      '「先月の旅行、どっちがいくら払ったっけ？」精算が遅れるほど、記憶とレシートは消えていきます。',
  },
  {
    icon: Scale,
    title: '収入差の気まずさ',
    description:
      '完全折半は収入差があると不公平。かといって話し合いで毎回決めるのは気まずい。ルールをアプリに任せましょう。',
  },
]

export function ProblemSection() {
  return (
    <section className="bg-hero-tile px-6 py-20">
      <h2 className="text-center text-3xl font-bold tracking-tight text-white">
        こんな精算、していませんか
      </h2>
      <div className="mx-auto mt-12 grid max-w-4xl gap-10 sm:grid-cols-3">
        {problems.map((problem) => (
          <SectionCard
            key={problem.title}
            icon={problem.icon}
            title={problem.title}
            description={problem.description}
            tone="dark"
          />
        ))}
      </div>
    </section>
  )
}
