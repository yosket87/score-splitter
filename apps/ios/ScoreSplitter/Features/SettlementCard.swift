import SwiftUI
import ScoreSplitterCore

struct SettlementCard: View {
    let result: Settlement
    var body: some View {
        VStack(spacing: Space.xl) {
            Text("今月の精算額").webFont(.caption).foregroundStyle(Palette.mutedForeground)
            Text(result.settlement == 0 ? "精算なし" : yen(floor(abs(result.settlement))))
                .webFont(.hero)
                .monospacedDigit().minimumScaleFactor(0.4).lineLimit(1)
                .foregroundStyle(result.settlement == 0 ? Palette.mutedForeground : Palette.foreground).accessibilityIdentifier("settlementAmount")
            if result.settlement != 0 {
                Text(result.settlement >= 0 ? "夫 → 妻" : "妻 → 夫")
                    .webFont(.label).foregroundStyle(Palette.accent).padding(.horizontal, Space.md).padding(.vertical, Space.xs)
                    .background(Palette.accent.opacity(0.1), in: Capsule())
            }
            DisclosureGroup("精算の内訳") {
                VStack(spacing: 14) {
                    personBreakdown(.husband, income: result.husbandIncome, expense: result.husbandExpense, balance: result.husbandTotal)
                    personBreakdown(.wife, income: result.wifeIncome, expense: result.wifeExpense, balance: result.wifeTotal)
                    Divider()
                    HStack { Text("1人あたりのお小遣い"); Spacer(); Text(yen(result.allowance, fractional: true)).monospacedDigit() }
                    HStack { Text("計算上の精算額"); Spacer(); Text(yen(abs(result.settlement), fractional: true)).monospacedDigit() }
                    Text("精算額の表示は1円未満を切り捨てます。内訳には0.5円の端数も表示します。")
                        .webFont(.caption).foregroundStyle(Palette.mutedForeground)
                }.webFont(.caption).padding(.top, 16)
            }.webFont(.small).accessibilityIdentifier("settlementBreakdown")
        }.frame(maxWidth: .infinity).surface(radius: Radius.hero, glass: true)
    }

    private func personBreakdown(_ person: Person, income: Double, expense: Double, balance: Double) -> some View {
        VStack(spacing: 7) {
            HStack { Text(person.title).webFont(.label).foregroundStyle(person == .husband ? Palette.husband : Palette.wife); Spacer() }
            row("収入", value: income)
            row("精算対象支出", value: expense)
            row("差引", value: balance)
        }
    }
    private func row(_ label: String, value: Double) -> some View {
        HStack { Text(label).foregroundStyle(Palette.mutedForeground); Spacer(); Text(yen(value, fractional: true)).monospacedDigit().minimumScaleFactor(0.7).lineLimit(1) }
    }
}
