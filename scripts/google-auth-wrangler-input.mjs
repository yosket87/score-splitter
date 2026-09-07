import { readFile } from 'node:fs/promises'

// Wranglerのremote --fileはimport APIでSELECT行を返さない。
// preloadでquery API用の値をメモリへ読み、OSのargvへ秘密SQLを載せない。
const path = process.env.GOOGLE_AUTH_SQL_FILE
delete process.env.GOOGLE_AUTH_SQL_FILE
if (!path || process.argv.includes('--command') || process.argv.includes('--file')) {
  throw new Error('非公開クエリ入力を確認してください')
}
const sql = await readFile(path, 'utf8')
process.argv.push('--command', sql)
