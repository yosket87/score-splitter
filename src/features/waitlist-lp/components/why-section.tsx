const reasons = [
  {
    title: '働けなくなっても、仕組みはそのまま',
    description:
      '病気や事故でどちらかの収入が途絶えても、家計のルールを作り直す必要はありません。ふたりの収入をひとつにして山分けする仕組みは、最初から支え合いが前提です。',
  },
  {
    title: '子育てで休んでも、お小遣いは減らない',
    description:
      '時短や育休で給料が減ったら自分のお小遣いも減る——その構図では、休む側だけが我慢することになります。山分けなら減った分もふたりで分け合うから、協力しやすい。',
  },
  {
    title: '収入差があっても、対等',
    description:
      '稼ぎが多い方が偉い、ではなく「ふたりで稼いだお金をふたりで分ける」。だからお金の話し合いがフェアになります。',
  },
]

export function WhySection() {
  return (
    <section className="px-6 py-16">
      <p className="text-center text-sm font-semibold tracking-widest text-primary">
        なぜ、山分けなのか
      </p>
      <h2 className="mt-2 text-center text-2xl font-bold">
        夫婦は、常にチームだから。
      </h2>
      <div className="mx-auto mt-10 max-w-3xl space-y-6">
        {reasons.map((reason) => (
          <div key={reason.title} className="rounded-lg border p-6">
            <h3 className="font-semibold">{reason.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {reason.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
