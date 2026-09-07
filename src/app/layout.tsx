import type { Metadata, Viewport } from 'next'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { MotionProvider } from '@/components/animations/motion-provider'
import './globals.css'
import { firebaseAuthConfig } from '@/lib/auth/firebase-config'
import { FirebaseSessionSync } from '@/features/firebase-auth/firebase-session-sync'
import { FirebaseClientProvider } from '@/features/firebase-auth/firebase-client-context'
import { headers } from 'next/headers'

export const metadata: Metadata = {
  title: 'ヤマワケ',
  applicationName: 'ヤマワケ',
  description: '夫婦間で家計を公平に管理・精算するためのウェブアプリケーション',
}

export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F7FC' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0E14' },
  ],
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const host = (await headers()).get('host')
  const firebase = firebaseAuthConfig()
  const firebaseClient = firebase && host === new URL(firebase.origin).host ? firebase.client : null
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-background focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg"
        >
          メインコンテンツへ
        </a>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <MotionProvider>
            <FirebaseClientProvider config={firebaseClient}>
              {firebaseClient && <FirebaseSessionSync config={firebaseClient} />}
              {children}
              <Toaster />
            </FirebaseClientProvider>
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
