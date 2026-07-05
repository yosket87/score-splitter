import { redirect } from 'next/navigation'
import { LoginForm } from './login-form'
import { isAuthenticated } from '@/lib/webauthn/session'

export default async function LoginPage() {
  if (await isAuthenticated()) {
    redirect('/')
  }

  return <LoginForm />
}
