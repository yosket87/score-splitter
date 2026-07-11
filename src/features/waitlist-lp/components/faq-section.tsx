const faqs = [
  {
    question: 'いつから使えますか？',
    answer:
      '現在開発中です。ウェイトリスト登録者から順に、公開時にメールでご案内します。',
  },
  {
    question: '本当に月380円かかりますか？',
    answer:
      '想定している価格です。先行登録いただいた方は6ヶ月無料でお使いいただける予定です。正式な価格は公開時にご案内します。',
  },
  {
    question: '夫婦でなくても使えますか？',
    answer:
      '同棲中のカップルなど、ふたりで家計を分け合う関係であればお使いいただけます。',
  },
  {
    question: '入力したデータは安全ですか？',
    answer:
      'シミュレーターに入力した金額は保存も送信もされません。登録いただくのはメールアドレスと料金の希望のみです。',
  },
]

export function FaqSection() {
  return (
    <section className="bg-background px-6 py-20">
      <h2 className="text-center text-3xl font-bold tracking-tight">よくある質問</h2>
      <dl className="mx-auto mt-12 max-w-2xl divide-y divide-border rounded-2xl bg-card">
        {faqs.map((faq) => (
          <div key={faq.question} className="p-6">
            <dt className="font-semibold">{faq.question}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{faq.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
