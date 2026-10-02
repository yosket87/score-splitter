import SwiftUI
import Charts
import ScoreSplitterCore

struct TrendCard: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(AppModel.self) private var model
    @State private var months: [MonthlySummary] = []
    @State private var loading = true
    @State private var error = false
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("収支の推移").webFont(.label)
            if loading { ProgressView().frame(maxWidth: .infinity) }
            else if error { Text("推移を読み込めませんでした。画面を再読み込みしてください。").webFont(.caption).foregroundStyle(Palette.mutedForeground) }
            else if months.isEmpty { Text("記録が増えると推移が表示されます").webFont(.small).foregroundStyle(Palette.mutedForeground) }
            else {
                GeometryReader { geometry in
                    ScrollView(.horizontal) {
                        Chart(months) { record in
                            BarMark(x: .value("月", record.month), y: .value("収支", record.balance))
                                .foregroundStyle(Palette.accent)
                                .accessibilityLabel(monthTitle(record.month))
                        }.frame(width: dynamicTypeSize.isAccessibilitySize ? max(560, geometry.size.width) : geometry.size.width,
                                height: dynamicTypeSize.isAccessibilitySize ? 180 : 110)
                             .chartYAxis(.hidden)
                            .chartXAxis {
                                AxisMarks { value in
                                    AxisGridLine()
                                    AxisValueLabel {
                                        if let month = value.as(String.self) {
                                            Text(String(Int(month.suffix(2)) ?? 1) + "月")
                                        }
                                    }
                                }
                            }.accessibilityLabel("直近6件の月別収支")
                    }
                }.frame(height: dynamicTypeSize.isAccessibilitySize ? 180 : 110)
            }
        }.frame(maxWidth: .infinity, alignment: .leading).surface()
            .task(id: model.revision) {
                do {
                    let result = try await model.months()
                    try Task.checkCancellation()
                    months = Array(result.sorted { $0.month < $1.month }.suffix(6)); loading = false
                } catch is CancellationError { }
                catch { if !Task.isCancelled { loading = false; self.error = true } }
            }
    }
}
