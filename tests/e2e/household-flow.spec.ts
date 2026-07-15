import { test, expect, type Page } from '@playwright/test'
import { resetMockData } from './helpers'

const MOCK_PASSWORD = 'password'

test.beforeEach(async ({ request }) => {
  await resetMockData(request)
})

async function login(page: Page) {
  await page.goto('/login')
  await page.getByPlaceholder('パスワード').fill(MOCK_PASSWORD)
  await page.getByRole('button', { name: 'ログイン', exact: true }).click()
  await page.waitForURL(/\/\d{4}\/\d{2}/)
}

function getIncomeSection(page: Page) {
  return page.locator('[data-section="income"]')
}

function getExpenseSection(page: Page) {
  return page.locator('[data-section="expense"]')
}

function getCarryoverSection(page: Page) {
  return page.locator('[data-section="carryover"]')
}

// =============================================
// ログインページ
// =============================================
test.describe('ログインページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('スマホ幅で横スクロールせずにフォーム全体を表示する', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()

    const viewportWidth = await page.evaluate(() =>
      document.documentElement.clientWidth
    )
    const contentWidth = await page.evaluate(() =>
      document.documentElement.scrollWidth
    )

    expect(contentWidth).toBe(viewportWidth)
    await expect(page.getByPlaceholder('パスワード')).toBeInViewport()
    await expect(
      page.getByRole('button', { name: 'ログイン', exact: true })
    ).toBeInViewport()
    await expect(
      page.getByRole('button', { name: 'パスキーでログイン' })
    ).toBeInViewport()
  })

  test('ログインフォームが表示される', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'ヤマワケ' })).toBeVisible()
    await expect(page.getByPlaceholder('パスワード')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'ログイン', exact: true })
    ).toBeVisible()
  })

  test('不正なパスワードでエラーが表示される', async ({ page }) => {
    await page.getByPlaceholder('パスワード').fill('wrong-password')
    await page.getByRole('button', { name: 'ログイン', exact: true }).click()

    await expect(
      page.getByText(/パスワードが正しくありません/)
    ).toBeVisible()
  })

  test('正しいパスワードで月詳細に遷移する', async ({ page }) => {
    await page.getByPlaceholder('パスワード').fill(MOCK_PASSWORD)
    await page.getByRole('button', { name: 'ログイン', exact: true }).click()
    await page.waitForURL(/\/\d{4}\/\d{2}/)

    await expect(page.getByText('月収支').first()).toBeVisible()
  })
})

// =============================================
// 月一覧ページ（年別一覧）
// =============================================
test.describe('月一覧ページ', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/2026')
    await page.waitForURL(/\/2026$/)
  })

  test('月一覧の注記が表示される', async ({ page }) => {
    await expect(
      page.getByText('※各月の収支は繰越に回す前の金額です')
    ).toBeVisible()
  })

  test('データのある月のカードが表示される', async ({ page }) => {
    await expect(
      page.getByRole('link', { name: /2026年2月の詳細を開く/ })
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: /2026年1月の詳細を開く/ })
    ).toBeVisible()
  })

  test('月カードをクリックすると月詳細に遷移する', async ({ page }) => {
    await page.getByRole('link', { name: /2026年2月の詳細を開く/ }).click()
    await expect(page).toHaveURL(/\/2026\/02/)
    await expect(page.getByText('精算額').first()).toBeVisible()
  })

  test('月詳細の「一覧へ」リンクで年別一覧に戻れる', async ({ page }) => {
    await page.goto('/2026/02')
    await page.getByRole('link', { name: '月の一覧へ戻る' }).click()
    await expect(page).toHaveURL(/\/2026$/)
    await expect(
      page.getByText('※各月の収支は繰越に回す前の金額です')
    ).toBeVisible()
  })

  test('不正な月パラメータはリダイレクトされる', async ({ page }) => {
    await page.goto('/2026/ab')
    await expect(page).toHaveURL(/\/\d{4}\/\d{2}/)
  })

  test('月範囲外（13月など）の月パラメータもリダイレクトされる', async ({
    page,
  }) => {
    await page.goto('/2026/13')
    await expect(page).toHaveURL(/\/\d{4}\/\d{2}/)
  })
})

// =============================================
// 月詳細ページ（認証後）
// =============================================
test.describe('月詳細ページ', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/2026/02')
  })

  test('ヘッダーが表示される', async ({ page }) => {
    await expect(page.getByRole('img', { name: 'ヤマワケ' })).toBeVisible()
  })

  test('全セクションが表示される', async ({ page }) => {
    const incomeSection = getIncomeSection(page)
    await expect(incomeSection).toBeVisible()
    const expenseSection = getExpenseSection(page)
    await expect(expenseSection).toBeVisible()
    await expect(page.getByTestId('carryover-title')).toBeVisible()
    await expect(page.getByText('精算額').first()).toBeVisible()
  })

  test('シードデータの収入が表示される', async ({ page }) => {
    await page.goto('/2026/02')

    const incomeSection = getIncomeSection(page)

    await expect(incomeSection.getByText('給料').first()).toBeVisible()
    await expect(incomeSection.getByText('副業')).toBeVisible()

    await expect(incomeSection.getByText(/350,000/)).toBeVisible()
    await expect(incomeSection.getByText(/280,000/)).toBeVisible()
    await expect(incomeSection.getByText(/\+¥50,000/)).toBeVisible()
  })

  test('シードデータの支出が表示される', async ({ page }) => {
    await page.goto('/2026/02')

    await expect(page.getByText('家賃')).toBeVisible()
    await expect(page.getByText('光熱費')).toBeVisible()
    await expect(page.getByText('食費')).toBeVisible()
    await expect(page.getByText('日用品')).toBeVisible()
    await expect(page.getByText('通信費')).toBeVisible()
  })

  test('精算額とお小遣いが表示される', async ({ page }) => {
    await page.goto('/2026/02')

    await expect(page.getByText('精算額').first()).toBeVisible()
    await expect(page.getByText('お小遣い')).toBeVisible()
    await expect(page.getByText('月収支').first()).toBeVisible()
  })

  test('精算額の計算結果が正しい', async ({ page }) => {
    await page.goto('/2026/02')

    // シードデータ:
    // 収入: 夫350000+50000=400000, 妻280000 → 合計680000
    // 支出: 夫-120000-15000-12000=-147000, 妻-50000-8000=-58000 → 合計-205000
    // お小遣い: (680000-205000)/2 = 237500
    // 精算: 253000-237500 = 15500 (夫→妻)

    await expect(page.getByText('¥15,500').first()).toBeVisible()
    await expect(page.getByText('夫').first()).toBeVisible()
    await expect(page.getByText('妻').first()).toBeVisible()
  })

  test('月次データをCSVで出力できる', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download')

    await page.getByRole('button', { name: 'CSV出力' }).click()

    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('家計データ_2026年2月.csv')
  })
})

// =============================================
// 月ナビゲーション
// =============================================
test.describe('月ナビゲーション', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/2026/02')
  })

  test('現在の月が表示される', async ({ page }) => {
    await expect(page.getByText('2026年2月')).toBeVisible()
  })

  test('前月に移動できる', async ({ page }) => {
    await page.getByRole('button', { name: '前月に移動' }).click()

    await expect(page).toHaveURL(/\/2026\/01/)
    await expect(page.getByText('2026年1月')).toBeVisible()
  })

  test('翌月に移動できる', async ({ page }) => {
    await page.getByRole('button', { name: '翌月に移動' }).click()

    await expect(page).toHaveURL(/\/2026\/03/)
    await expect(page.getByText('2026年3月')).toBeVisible()
  })

  test('前月に移動するとデータが変わる', async ({ page }) => {
    await expect(page.getByText('副業')).toBeVisible()

    await page.getByRole('button', { name: '前月に移動' }).click()
    await page.waitForURL(/\/2026\/01/)

    await expect(page.getByText('副業')).not.toBeVisible()
  })

  test('データのない月では空メッセージが表示される', async ({ page }) => {
    await page.getByRole('button', { name: '翌月に移動' }).click()
    await page.waitForURL(/\/2026\/03/)

    await expect(page.getByText('収入がありません')).toBeVisible()
    await expect(page.getByText('支出がありません')).toBeVisible()
  })
})

// =============================================
// 収入のCRUD操作
// =============================================
test.describe('収入の追加', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/2026/12')
  })

  test('収入を追加できる', async ({ page }) => {
    const section = getIncomeSection(page)
    await section.getByRole('button', { name: '項目を追加' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByPlaceholder('例：食費、家賃、給与').fill('テスト給料')
    await dialog.getByPlaceholder('¥ 0').fill('300000')
    await dialog.getByRole('button', { name: /収入.*追加/ }).click()

    await expect(dialog).not.toBeVisible()
    await expect(section.getByText('テスト給料')).toBeVisible()
    await expect(section.getByText(/300,000/).first()).toBeVisible()
  })

  test('担当者を妻にして収入を追加できる', async ({ page }) => {
    const section = getIncomeSection(page)
    await section.getByRole('button', { name: '項目を追加' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByPlaceholder('例：食費、家賃、給与').fill('妻のパート')
    await dialog.getByPlaceholder('¥ 0').fill('150000')

    await dialog.getByRole('radio', { name: '妻' }).click()

    await dialog.getByRole('button', { name: /収入.*追加/ }).click()

    await expect(dialog).not.toBeVisible()
    await expect(section.getByText('妻のパート')).toBeVisible()
    await expect(section.getByText(/150,000/).first()).toBeVisible()
  })
})

// =============================================
// 支出のCRUD操作
// =============================================
test.describe('支出の追加', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/2026/12')
  })

  test('支出を追加できる', async ({ page }) => {
    const section = getExpenseSection(page)
    await section.getByRole('button', { name: '項目を追加' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByPlaceholder('例：食費、家賃、給与').fill('テスト家賃')
    await dialog.getByPlaceholder('¥ 0').fill('100000')
    await dialog.getByRole('button', { name: /支出.*追加/ }).click()

    await expect(dialog).not.toBeVisible()
    await expect(page.getByText('テスト家賃')).toBeVisible()
  })
})

// =============================================
// 繰越のCRUD操作
// =============================================
test.describe('繰越の追加', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/2026/12')
  })

  test('繰越を追加できる', async ({ page }) => {
    const section = getCarryoverSection(page)
    await section.getByRole('button', { name: '項目を追加' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByPlaceholder('例：食費、家賃、給与').fill('テスト繰越')
    await dialog.getByPlaceholder('¥ 0').fill('5000')
    await dialog.getByRole('button', { name: /繰越.*追加/ }).click()

    await expect(dialog).not.toBeVisible()
    await expect(page.getByText('テスト繰越')).toBeVisible()
  })
})

// =============================================
// 項目の編集
// =============================================
test.describe('項目の編集', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/2026/02')
  })

  test('収入を編集できる', async ({ page }) => {
    const section = getIncomeSection(page)
    const row = section.locator('[data-testid="item-row"]').filter({
      hasText: '副業',
    })
    await row.hover()
    await row.getByRole('button', { name: /副業.*を編集/ }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const labelInput = dialog.locator('input[name="label"]')
    await labelInput.clear()
    await labelInput.fill('副業収入（更新）')

    await dialog.getByRole('button', { name: '更新' }).click()

    await expect(page.getByText('副業収入（更新）')).toBeVisible()
  })

  test('編集ダイアログのキャンセルが動作する', async ({ page }) => {
    const section = getIncomeSection(page)
    const row = section.locator('[data-testid="item-row"]').filter({
      hasText: '副業',
    })
    await row.hover()
    await row.getByRole('button', { name: /副業.*を編集/ }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: 'キャンセル' }).click()

    await expect(dialog).not.toBeVisible()
  })
})

// =============================================
// 項目の削除
// =============================================
test.describe('項目の削除', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/2026/02')
  })

  test('収入を削除できる', async ({ page }) => {
    const section = getIncomeSection(page)

    await expect(section.getByText('副業')).toBeVisible()

    const row = section.locator('[data-testid="item-row"]').filter({
      hasText: '副業',
    })
    await row.hover()
    await row.getByRole('button', { name: /副業.*を削除/ }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/副業.*を削除しますか/)).toBeVisible()
    await dialog.getByRole('button', { name: '削除する' }).click()

    await expect(section.getByText('副業')).not.toBeVisible({ timeout: 5000 })
  })
})

// =============================================
// 精算額の動的更新
// =============================================
test.describe('精算額の更新', () => {
  test('収入追加後に精算額が更新される', async ({ page }) => {
    await login(page)
    await page.goto('/2026/11')

    await expect(page.getByText('精算なし')).toBeVisible()

    const section = getIncomeSection(page)
    await section.getByRole('button', { name: '項目を追加' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByPlaceholder('例：食費、家賃、給与').fill('給料')
    await dialog.getByPlaceholder('¥ 0').fill('400000')
    await dialog.getByRole('button', { name: /収入.*追加/ }).click()

    await expect(dialog).not.toBeVisible()

    await expect(page.getByText('夫').first()).toBeVisible()
  })
})

// =============================================
// 前月からコピー
// =============================================
test.describe('前月からコピー', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/2026/02')
  })

  test('コピーダイアログが表示される', async ({ page }) => {
    await page.getByRole('button', { name: /前月からコピー/ }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('前月からデータをコピー')).toBeVisible()
    await expect(dialog.getByText(/2026年1月/)).toBeVisible()
    await expect(dialog.getByText(/2026年2月/)).toBeVisible()
  })

  test('コピーダイアログに前月のデータが表示される', async ({ page }) => {
    await page.getByRole('button', { name: /前月からコピー/ }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('コピー対象を選択')).toBeVisible()

    await expect(dialog.getByText('収入', { exact: true })).toBeVisible()
  })

  test('コピーダイアログのキャンセルが動作する', async ({ page }) => {
    await page.getByRole('button', { name: /前月からコピー/ }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('前月からデータをコピー')).toBeVisible()

    await dialog.getByRole('button', { name: 'キャンセル' }).click()
    await expect(dialog).not.toBeVisible()
  })

  test('前月データをコピーして対象月に反映できる', async ({ page }) => {
    await page.goto('/2026/03')

    await expect(getIncomeSection(page).getByText('収入がありません')).toBeVisible()
    await expect(getExpenseSection(page).getByText('支出がありません')).toBeVisible()

    await page.getByRole('button', { name: /前月からコピー/ }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('前月からデータをコピー')).toBeVisible()
    await expect(dialog.getByText(/2026年2月/)).toBeVisible()
    await expect(dialog.getByText(/2026年3月/)).toBeVisible()
    await expect(dialog.getByText('給料').first()).toBeVisible()

    await dialog.getByRole('button', { name: /コピーする/ }).click()

    await expect(dialog).not.toBeVisible()
    await expect(getIncomeSection(page).getByText('給料').first()).toBeVisible()
    await expect(getExpenseSection(page).getByText('家賃')).toBeVisible()
    await expect(getCarryoverSection(page).getByText('前月繰越')).toBeVisible()
  })
})

// =============================================
// ログアウト
// =============================================
test.describe('ログアウト', () => {
  test('ログアウトするとログインページに遷移する', async ({ page }) => {
    await login(page)

    await page.getByRole('button', { name: /ログアウト/ }).click()

    await page.waitForURL(/\/login/)
    await expect(page.getByPlaceholder('パスワード')).toBeVisible()
  })

  test('ログアウト後にホームにアクセスするとログインページにリダイレクトされる', async ({ page }) => {
    await login(page)
    await page.getByRole('button', { name: /ログアウト/ }).click()
    await page.waitForURL(/\/login/)

    await page.goto('/')
    await page.waitForURL(/\/login/)

    await expect(page.getByPlaceholder('パスワード')).toBeVisible()
  })
})

// =============================================
// 認証ガード
// =============================================
test.describe('認証ガード', () => {
  test('未ログインでホームにアクセスするとログインページにリダイレクト', async ({ page }) => {
    await page.goto('/')
    await page.waitForURL(/\/login/)
    await expect(page.getByPlaceholder('パスワード')).toBeVisible()
  })

  test('ログイン済みでログインページにアクセスするとホームにリダイレクト', async ({ page }) => {
    await login(page)
    await page.goto('/login')
    await page.waitForURL(/\/\d{4}\/\d{2}/)
  })
})

// =============================================
// テーマ切り替え
// =============================================
test.describe('テーマ切り替え', () => {
  test('テーマ切り替えボタンが存在する', async ({ page }) => {
    await login(page)

    const themeButton = page.getByRole('button', { name: 'テーマを切り替え' })
    await expect(themeButton).toBeVisible()
  })
})
