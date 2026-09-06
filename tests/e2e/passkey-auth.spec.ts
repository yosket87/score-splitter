import { test, expect } from '@playwright/test'
import { login, resetMockData } from './helpers'

test('世帯パスキーを登録し、試行cookieを消費して署名認証できる', async ({ page, context, request }) => {
  await resetMockData(request)
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  })
  try {
    await login(page)
    await page.goto('/settings')
    await expect(page.getByText('パスキーが登録されていません')).toBeVisible()
    await page.getByLabel('デバイス名（任意）').fill('認証検証端末')
    await page.getByRole('button', { name: 'パスキーを登録', exact: true }).click()
    await expect(page.getByText('認証検証端末', { exact: true })).toBeVisible()
    expect((await context.cookies()).some((cookie) => cookie.name === 'webauthn_registration')).toBe(false)
    const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId })
    expect(credentials).toHaveLength(1)
    expect(Buffer.from(credentials[0].userHandle!, 'base64').toString()).toBe('3975b870-bbfa-49fd-ae3d-d273c9f6e107:husband')

    await context.clearCookies()
    await page.goto('/login')
    await page.getByRole('button', { name: 'パスキーでログイン' }).click()
    await expect(page).toHaveURL(/\/\d{4}\/\d{2}/)
    const cookies = await context.cookies()
    expect(cookies.some((cookie) => cookie.name === 'webauthn_authentication')).toBe(false)
    expect(cookies.find((cookie) => cookie.name === 'household_session')).toMatchObject({ httpOnly: true, sameSite: 'Lax' })
  } finally {
    await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId })
    await cdp.detach()
  }
})
