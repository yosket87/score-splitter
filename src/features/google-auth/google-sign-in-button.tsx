import type { ComponentProps } from 'react'
import Image from 'next/image'
import localFont from 'next/font/local'
import googleLogo from './google-g.png'
import { Button } from '@/components/ui/button'
import styles from './google-sign-in-button.module.css'

const googleSans = localFont({ src: './google-sans-medium.ttf', weight: '500', display: 'swap' })
const buttonClassName = `${styles.button} ${googleSans.className}`

// Google公式のライトテーマ。認証処理は呼び出し元へ委ねる。
export function GoogleSignInButton({ href, ...props }: Omit<ComponentProps<'button'>, 'children' | 'className'> & { href?: string }) {
  const content = <>
    <Image src={googleLogo} alt="" width={20} height={20} className="shrink-0" />
    <span className="flex-1 text-center">Googleでログイン</span>
    <span aria-hidden="true" className="w-5 shrink-0" />
  </>

  return href
    // eslint-disable-next-line @next/next/no-html-link-for-pages -- OAuth開始は通常の画面遷移を使う。
    ? <Button asChild className={buttonClassName}><a href={href}>{content}</a></Button>
    : <Button {...props} type="button" className={buttonClassName}>{content}</Button>
}
