import { http, HttpResponse } from 'msw'
import { z } from 'zod'
import { isValidMonth } from '@/lib/utils/format'
import type { Session } from '@/types'
import { getTable } from './db'
import { correctMockPayment, getMockPaymentOperation, getMockPaymentStatus, recordMockPayment } from './payment-status'
import { HttpError } from '../../cloudflare/worker/src/http'

export function createPaymentHandlers(baseUrl: string, internalToken: string) {
  return [http.all(`${baseUrl}/months/:month/:action/:id?`, async ({ request, params }) => {
    try {
      if (request.headers.get('authorization') !== `Bearer ${internalToken}`) throw new HttpError('認証に失敗しました。', 401)
      const token = request.headers.get('x-household-session')
      const session = getTable('sessions').find((row) => row.token === token)
      if (!session || !(Date.parse(String(session.expires_at)) > Date.now())) throw new HttpError('ログインし直してください。', 401)
      const month = String(params.month)
      if (!isValidMonth(month)) throw new HttpError('月が不正です。', 400)
      const actor: Session = { person: session.person as Session['person'], authMethod: session.auth_method as Session['authMethod'] }
      if (request.method === 'GET' && params.action === 'payment-status') return HttpResponse.json({ data: getMockPaymentStatus(month) })
      if (request.method === 'GET' && params.action === 'payment-operations') {
        const id = z.string().uuid().parse(params.id)
        return HttpResponse.json({ data: getMockPaymentOperation(month, id) })
      }
      if (request.method === 'POST' && ['payments', 'payment-corrections'].includes(String(params.action))) {
        const body = await request.json() as { month?: unknown }
        if (!body || body.month !== month) throw new HttpError('対象の月が一致しません。', 400)
        return HttpResponse.json({ data: params.action === 'payments' ? recordMockPayment(body, actor) : correctMockPayment(body, actor) })
      }
      return HttpResponse.json({ error: '見つかりません。' }, { status: 404 })
    } catch (error) {
      const status = error instanceof HttpError ? error.status : error instanceof z.ZodError ? 400 : 500
      return HttpResponse.json({ error: error instanceof HttpError ? error.message : '振込記録の処理に失敗しました。' }, { status })
    }
  })]
}
