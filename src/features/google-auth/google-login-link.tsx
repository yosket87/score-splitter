import { GoogleSignInButton } from './google-sign-in-button'

export function GoogleLoginLink() {
  return <GoogleSignInButton href="/api/auth/google/start" />
}
export function GoogleRecoveryHelp() {
  return <p className="text-xs leading-relaxed text-sub-text">
    Googleを利用できない場合は、<a className="underline underline-offset-4" href="https://support.google.com/accounts/answer/7682439?hl=ja" rel="noreferrer">Googleアカウントの復旧手順</a>をご確認ください。
    家計への連携を復旧するには、これまで使っていた信頼できる連絡手段で管理者へ本人確認を依頼してください。
  </p>
}
