// remote queryの既知制約だけを検査する。SQLの実行・完全なparserの代用はしない。
// https://github.com/cloudflare/workers-sdk/issues/4727
export function assertD1RemoteTriggerSyntax(triggers) {
  for (const { name, sql } of triggers) {
    let depth = 0
    // SQLiteで生成したDDLから、引用値/identifier/コメント中の語と括弧を除外する。
    const tokens = sql.matchAll(/--[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|[()]|\bCASE\b/gi)
    for (const [token] of tokens) {
      if (token === '(') depth += 1
      else if (token === ')') depth -= 1
      else if (token.toUpperCase() === 'CASE' && depth === 0) {
        throw new Error(`${name}: D1 remote互換のためtrigger内のCASE式を括弧で囲んでください`)
      }
    }
  }
}
