const problems = [
  {
    title: '精算がExcel頼み',
    description:
      '毎月末にスプレッドシートを開いて、収入と立替をコピペして関数を直す。その作業、毎月やっていませんか。',
  },
  {
    title: '立替の記憶が消える',
    description:
      '「先月の旅行、どっちがいくら払ったっけ？」精算が遅れるほど、記憶とレシートは消えていきます。',
  },
  {
    title: '収入差の気まずさ',
    description:
      '完全折半は収入差があると不公平。かといって話し合いで毎回決めるのは気まずい。ルールをアプリに任せましょう。',
  },
]

export function ProblemSection() {
  return (
    <section className="bg-muted/50 px-6 py-16">
      <h2 className="text-center text-2xl font-bold">
        こんな精算、していませんか
      </h2>
      <div className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-3">
        {problems.map((problem) => (
          <div key={problem.title} className="rounded-lg bg-background p-6 shadow-sm">
            <h3 className="font-semibold">{problem.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {problem.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
