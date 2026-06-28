export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...init.headers,
    },
  })
}

export function errorJson(message: string, status: number): Response {
  return json({ error: message }, { status })
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new HttpError('JSONの形式が不正です', 400)
  }
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

export function assertAuth(request: Request, token: string): void {
  const authorization = request.headers.get('authorization')
  if (authorization !== `Bearer ${token}`) {
    throw new HttpError('認証に失敗しました', 401)
  }
}
