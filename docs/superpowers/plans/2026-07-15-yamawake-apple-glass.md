# ヤマワケ Apple Glass デザイン刷新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 認証後アプリと認証・システム画面を「ヤマワケ」ブランドへ統一し、青い夫線とローズ赤の妻線が交差する決定的SVG、選択的なガラス表現、モバイル1カラム／デスクトップ2カラムを実装する。

**Architecture:** データ取得と業務ロジックは既存のApp Router Server Components／Server Actionsに残し、ブランド・サーフェス・レイアウトだけを表示層で再構成する。ガラスは共有CSSトークンと小さなブランドコンポーネントで表し、要約やStickyバーだけに強いブラーを使う。画面変更は既存の公開操作を保ったまま、コンポーネントテストを先に追加して進める。

**Tech Stack:** Next.js 16、React 19、TypeScript、Tailwind CSS 4、shadcn/ui、Motion、Vaul、Vitest、Playwright

## Global Constraints

- `/lp` のレイアウトとトーンは変更しない。LP内のアプリ画面プレビュー画像だけを新ブランドへ更新する。
- ブランド表示は「ヤマワケ」に統一するが、内部npmパッケージ名、API、DB、保存データ、`Person = 'husband' | 'wife'`、RP ID、Originは変更しない。
- 夫はアクセシブルな青、妻はローズ系の赤で表示し、支出・エラーのデストラクティブ赤とは色調と形状を分ける。色だけに依存せず「夫／妻」の文字を維持する。
- 外部フォント、追加ライブラリ、画像生成物をプロダクションUIへ追加しない。ロゴは決定的なインラインSVGを使う。
- 375pxと768pxは1カラム、1024px以上は月次画面・月一覧とも要約と明細の2カラムにする。
- `prefers-reduced-motion`、`prefers-reduced-transparency`、`prefers-contrast: more`を尊重する。
- ボタンの押下は`scale(0.97)`、月移動は現在の表示値から始まる短い無バウンスのスプリング、Drawerは既存Vaulジェスチャーを維持する。
- すべてのDialog／Drawerに説明テキストまたは明示的な`aria-describedby`を設定し、44px以上のタッチ領域とキーボード操作を維持する。
- 日本語ラベルへ統一し、精算方向の業務ロジックと正負の保存規則は変更しない。

---

### Task 1: ブランドSVG・テーマ基盤・共有アプリシェル

**Files:**
- Create: `src/components/brand/brand-mark.tsx`
- Create: `src/components/brand/brand-logo.tsx`
- Create: `src/app/icon.svg`
- Modify: `src/app/globals.css`
- Modify: `src/components/layout/header.tsx`
- Modify: `src/components/ui/button.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/lib/webauthn/config.ts`
- Modify: `.env.mock`
- Test: `tests/components/brand-logo.test.tsx`
- Test: `tests/components/header.test.tsx`
- Test: `tests/unit/styles/globals.test.ts`
- Test: `tests/unit/lib/webauthn/config.test.ts`

**Interfaces:**
- Produces: `BrandMark({ variant?: 'color' | 'mono', tone?: 'default' | 'inverse', ...svgProps })`
- Produces: `BrandLogo({ variant?: 'color' | 'mono', tone?: 'default' | 'inverse', compact?: boolean, ...props })`
- Produces: `Header({ backHref?, backLabel? })` as the shared sticky glass bar.

- [ ] **Step 1: Write failing tests** for the `ヤマワケ` accessible logo name, equal-width husband/wife paths, color/mono/inverse variants, Japanese header controls, 44px action targets, metadata, WebAuthn default RP name, brand/glass media-query tokens.
- [ ] **Step 2: Run focused tests and confirm RED** because the brand components and tokens do not exist and the RP name is still `Score Splitter`.
- [ ] **Step 3: Implement deterministic SVGs** with two equal-width Bézier paths crossing from blue top-left to bottom-right and rose-red bottom-left to top-right; add neutral wordmark and compact mark.
- [ ] **Step 4: Implement app-only CSS foundations**: ambient background, heavy glass, sticky glass bar, solid panel, borders/highlights/shadows, brand husband/wife colors, distinct destructive color, focus ring, reduced motion/transparency and increased contrast fallbacks. Do not restyle the LP shell.
- [ ] **Step 5: Refactor the shared header** to the brand logo plus theme, settings, and logout actions without theme-derived inline backgrounds. All icon controls must retain visible focus and at least 44px targets.
- [ ] **Step 6: Update metadata and WebAuthn defaults** to `ヤマワケ`, keeping RP ID/Origin unchanged.
- [ ] **Step 7: Run focused tests and full tests, confirm GREEN, then commit** with a Japanese Conventional Commit.

### Task 2: 月次画面と月一覧の情報階層・レスポンシブ配置

**Files:**
- Modify: `src/features/monthly-overview/index.tsx`
- Modify: `src/app/[year]/[month]/page.tsx`
- Modify: `src/features/monthly-list/index.tsx`
- Modify: `src/app/[year]/page.tsx`
- Modify: `src/components/charts/trend-card.tsx`
- Modify as needed: income/expense/carryover section presentation files only
- Test: `tests/components/features/monthly-overview.test.tsx`
- Test: `tests/components/features/monthly-list.test.tsx`
- Test: existing section component tests

**Interfaces:**
- Replaces: `HeroSection` with `MonthlyOverview`.
- `MonthlyOverview` consumes structured props for `year`, `month`, `summary`, and `summaries`; it must not accept arbitrary `children` for the trend card.
- App Router server-side data fetching remains in the pages.

- [ ] **Step 1: Write failing component tests** proving the settlement amount/direction is the primary heading, all labels are Japanese, husband/wife text remains, month controls are 44px, and no arbitrary child slot is required.
- [ ] **Step 2: Run focused tests and confirm RED** against the existing `HeroSection`.
- [ ] **Step 3: Implement `MonthlyOverview`** with mobile order: 精算額 → 月収支 → お小遣い → 推移. Use an accessible no-bounce Motion spring keyed by month and start from the current presentation.
- [ ] **Step 4: Implement page grids** so mobile/tablet remain one column and `lg` uses a sticky overview/trend left rail plus income/expense/carryover right rail. Keep FAB and server data flow unchanged.
- [ ] **Step 5: Recompose the year page** into annual summary/chart left and 12-month list right at `lg`; give empty data a static icon, concise Japanese message, and a next-action link/button without Lottie.
- [ ] **Step 6: Run section and focused tests, full tests, confirm GREEN, then commit** with a Japanese Conventional Commit.

### Task 3: 認証・設定・システム画面とモーダルの統一

**Files:**
- Modify: `src/app/login/login-form.tsx`
- Modify: `src/app/settings/page.tsx`
- Modify: `src/app/error.tsx`
- Modify: `src/app/not-found.tsx`
- Modify: `src/app/loading.tsx`
- Modify: responsive modal, dialog/drawer primitives and add/edit/copy/delete callers as required
- Test: `tests/components/login-page.test.tsx`
- Test: `tests/components/app-error.test.tsx`
- Test: `tests/components/features/entry-form-a11y.test.tsx`
- Test: `tests/components/features/copy-month-dialog.test.tsx`
- Test: `tests/components/a11y/ux-polish.test.tsx`

**Interfaces:**
- Responsive modal continues to use Vaul Drawer on mobile and Radix Dialog on desktop.
- Every modal call provides a visible description or an explicit description relationship.

- [ ] **Step 1: Add failing tests** for shared logo/background/surface, Japanese copy, Dialog/Drawer descriptions, keyboard close/focus behavior and 44px controls.
- [ ] **Step 2: Run focused tests and confirm RED**, including the existing missing-Description warning as failure evidence.
- [ ] **Step 3: Apply the app ambient shell and brand surfaces** to login, settings, error, 404 and loading without changing authentication or recovery logic.
- [ ] **Step 4: Normalize modal hierarchy** with consistent title, description, form content and actions. Preserve Vaul continuous gestures and Radix focus management.
- [ ] **Step 5: Run focused tests with pristine output, full tests, confirm GREEN, then commit** with a Japanese Conventional Commit.

### Task 4: ブランド文言・ドキュメント・LPプレビュー・総合検証

**Files:**
- Modify: `docs/README.md`
- Modify as found: user-visible app copy, WebAuthn environment examples and E2E expectations
- Replace: legacy favicon with `src/app/icon.svg`
- Replace: `public/lp/monthly-dashboard-preview.png` using a deterministic browser screenshot of the implemented app
- Modify: E2E and component expectations needed for Japanese labels/new hierarchy

- [ ] **Step 1: Search the repository** for user-visible `Score Splitter` and English app labels; keep package and internal identifiers unchanged.
- [ ] **Step 2: Update tests first**, then change README, environment examples, app copy and E2E expectations to `ヤマワケ`.
- [ ] **Step 3: Start `npm run dev:mock`**, log in with password `password`, and verify normal, empty, large-amount, Drawer/Dialog cases at 375px, 768px and 1280px in light/dark.
- [ ] **Step 4: Capture screenshots**, confirm the `lg` breakpoint, horizontal overflow absence, sticky behavior, touch and keyboard flows; update only the LP preview image, not LP layout or tone.
- [ ] **Step 5: Run** `npm run lint`, `npm run test:run`, `npm run test:coverage`, `npm run build`, and `npm run test:e2e`; maintain at least 80% coverage.
- [ ] **Step 6: Perform whole-branch spec/code review**, fix Critical/Important findings, rerun covering tests, then commit with a Japanese Conventional Commit.
- [ ] **Step 7: Push the feature branch and create a Japanese PR** without generated-information boilerplate.
