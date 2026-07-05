import type { D1DatabaseLike, Runtime } from './d1'
import { HttpError } from './http'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PRICE_INTENTS = ['free_only', 'paid_ok'] as const

type PriceIntent = (typeof PRICE_INTENTS)[number]

interface WaitlistPayload {
  email: string
  priceIntent: PriceIntent
  simulatorUsed: boolean
  website?: string
}

export async function registerWaitlistEntry(
  db: D1DatabaseLike,
  runtime: Runtime,
  payload: unknown
): Promise<{ registered: boolean }> {
  const input = parseWaitlistPayload(payload)

  // honeypot: botには成功を装い、保存しない
  if (input.website !== undefined && input.website.trim() !== '') {
    return { registered: true }
  }

  // email重複は成功として扱う（登録済みかどうかを外部から探れないようにする）
  await db
    .prepare(
      `INSERT INTO waitlist_entries (id, email, price_intent, simulator_used, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(email) DO NOTHING`
    )
    .bind(
      runtime.randomUUID(),
      input.email,
      input.priceIntent,
      input.simulatorUsed ? 1 : 0,
      runtime.now().toISOString()
    )
    .run()

  return { registered: true }
}

function parseWaitlistPayload(payload: unknown): WaitlistPayload {
  if (typeof payload !== 'object' || payload === null) {
    throw new HttpError('リクエストの形式が不正です', 400)
  }

  const { email, priceIntent, simulatorUsed, website } = payload as Record<string, unknown>

  if (typeof email !== 'string') {
    throw new HttpError('メールアドレスを入力してください', 400)
  }

  const normalizedEmail = email.trim().toLowerCase()
  if (!EMAIL_PATTERN.test(normalizedEmail) || normalizedEmail.length > 255) {
    throw new HttpError('メールアドレスの形式が正しくありません', 400)
  }

  if (!isPriceIntent(priceIntent)) {
    throw new HttpError('料金の希望が不正です', 400)
  }

  if (typeof simulatorUsed !== 'boolean') {
    throw new HttpError('リクエストの形式が不正です', 400)
  }

  if (website !== undefined && typeof website !== 'string') {
    throw new HttpError('リクエストの形式が不正です', 400)
  }

  return { email: normalizedEmail, priceIntent, simulatorUsed, website }
}

function isPriceIntent(value: unknown): value is PriceIntent {
  return typeof value === 'string' && (PRICE_INTENTS as readonly string[]).includes(value)
}
