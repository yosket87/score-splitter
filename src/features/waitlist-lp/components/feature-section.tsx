const features = [
  {
    title: '月ごとに記録',
    description:
      'ふたりの収入と共通経費を月単位で記録。どちらが払ったかも一緒に残ります。',
  },
  {
    title: '繰越も忘れない',
    description:
      '今月精算しない立替は繰越として翌月へ。精算し忘れがなくなります。',
  },
  {
    title: '精算額は自動計算',
    description:
      '収入合計から経費を引いて残りを山分け。「どちらがいくら払うか」が1つの数字で出ます。',
  },
]

export function FeatureSection() {
  return (
    <section className="px-6 py-16">
      <h2 className="text-center text-2xl font-bold">ヤマワケができること</h2>
      <div className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-3">
        {features.map((feature) => (
          <div key={feature.title} className="rounded-lg border p-6">
            <h3 className="font-semibold">{feature.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {feature.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
