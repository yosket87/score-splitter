export interface D1ResultLike {
  success: boolean
  meta?: {
    changes?: number
  }
}

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike
  first<T = unknown>(): Promise<T | null>
  all<T = unknown>(): Promise<{ results: T[] }>
  run(): Promise<D1ResultLike>
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike
  batch(statements: D1PreparedStatementLike[]): Promise<D1ResultLike[]>
}

export interface Env {
  DB: D1DatabaseLike
  WORKER_API_TOKEN: string
}

export interface RuntimeDeps {
  randomUUID?: () => string
  now?: () => Date
}

export interface Runtime {
  randomUUID: () => string
  now: () => Date
}

export function createRuntime(deps: RuntimeDeps = {}): Runtime {
  return {
    randomUUID: deps.randomUUID ?? (() => crypto.randomUUID()),
    now: deps.now ?? (() => new Date()),
  }
}
