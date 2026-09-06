import { Button } from '@/components/ui/button'
export function GoogleLoginLink() {
  // eslint-disable-next-line @next/next/no-html-link-for-pages -- 認可開始はprefetchやRSC遷移を避ける通常の画面遷移にする。
  return <Button asChild className="h-12 w-full rounded-xl text-sm font-bold"><a href="/api/auth/google/start">Googleでログイン</a></Button>
}
export function GoogleRecoveryHelp() {
  return <p className="text-xs leading-relaxed text-sub-text">
    Googleを利用できない場合は、<a className="underline underline-offset-4" href="https://support.google.com/accounts/answer/7682439?hl=ja" rel="noreferrer">Googleアカウントの復旧手順</a>をご確認ください。
    家計への連携を復旧するには、これまで使っていた信頼できる連絡手段で管理者へ本人確認を依頼してください。
  </p>
}
