import { revalidatePath } from 'next/cache'
import { isValidMonth, monthToPath } from '@/lib/utils/format'

export function revalidateHouseholdData(month?: string): void {
  if (!month || !isValidMonth(month)) {
    // IDだけの更新など月が特定できない互換経路用。通常のデータ取得はno-storeだが、
    // 将来キャッシュを入れた場合も最低限トップ配下を再検証する。
    revalidatePath('/')
    return
  }

  revalidatePath(monthToPath(month))
  revalidatePath(`/${month.slice(0, 4)}`)
}
