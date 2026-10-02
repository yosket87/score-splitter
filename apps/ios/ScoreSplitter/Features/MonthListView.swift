import SwiftUI
import Charts
import ScoreSplitterCore

struct MonthListView: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(AppModel.self) private var model
    @State private var year = Calendar.current.component(.year, from: Date())
    @State private var months: [MonthlySummary] = []
    @State private var loading = true
    @State private var error: String?
    private var annualBalance: Double { yearly.reduce(0) { $0 + $1.balance } }
    private var yearly: [MonthlySummary] { months.filter { $0.month.hasPrefix(String(year)) } }

    var body: some View {
        ScrollView {
            VStack(spacing: Space.xl) {
                HStack {
                    Button { year -= 1 } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }
                        .accessibilityLabel("前年")
                    Spacer()
                    Text("\(String(year))年").webFont(.title)
                    Spacer()
                    Button { year += 1 } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }
                        .accessibilityLabel("翌年")
                }
                NavigationLink(destination: MonthlyView(initialMonth: currentMonth())) {
                    Label("今月を見る", systemImage: "arrow.up.right").webFont(.label).foregroundStyle(Palette.onAccent).frame(maxWidth: .infinity)
                }.buttonStyle(.borderedProminent).controlSize(.large)
                    .accessibilityIdentifier("currentMonth")
                if loading { ProgressView("月一覧を読み込み中…").padding(24) }
                else if let error {
                    Notice(message: error)
                    Button("再読み込み") { Task { await load() } }
                } else {
                    annualCard
                    VStack(spacing: Space.md) {
                        ForEach(1...12, id: \.self) { number in
                            monthRow(number: number)
                        }
                    }
                }
            }.padding(Space.lg)
        }.background { AppBackground() }
            .navigationTitle("ヤマワケ").navigationBarTitleDisplayMode(.inline)
            .toolbar { AccountToolbar() }
            .task(id: model.revision) { await load() }
            .refreshable { await load() }
    }

    private var annualCard: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("年間収支").webFont(.caption).foregroundStyle(Palette.mutedForeground)
            Text(yen(annualBalance)).webFont(.annual).monospacedDigit()
                .foregroundStyle(annualBalance >= 0 ? Palette.accent : Palette.destructive)
                .minimumScaleFactor(0.65).lineLimit(1)
            HStack {
                stat("収入", yearly.reduce(0) { $0 + $1.incomeTotal }, Palette.income)
                Spacer()
                stat("支出", abs(yearly.reduce(0) { $0 + $1.expenseTotal }), Palette.expense)
            }
            if !yearly.isEmpty {
                annualChart
            } else { Text("この年の記録はありません").foregroundStyle(Palette.mutedForeground) }
        }.surface(radius: Radius.annual, glass: true, padding: Space.xl)
    }

    private var annualChart: some View {
        let height: CGFloat = dynamicTypeSize.isAccessibilitySize ? 220 : 130
        return GeometryReader { geometry in
            ScrollView(.horizontal) {
                Chart(yearly) { record in
                    BarMark(x: .value("月", String(Int(record.month.suffix(2)) ?? 1) + "月"), y: .value("収入", record.incomeTotal))
                        .foregroundStyle(Palette.income).position(by: .value("種別", "収入"))
                    BarMark(x: .value("月", String(Int(record.month.suffix(2)) ?? 1) + "月"), y: .value("支出", abs(record.expenseTotal)))
                        .foregroundStyle(Palette.expense).position(by: .value("種別", "支出"))
                }.frame(width: dynamicTypeSize.isAccessibilitySize ? max(640, geometry.size.width) : geometry.size.width, height: height)
                    .chartLegend(.hidden).accessibilityLabel("各月の収入と支出")
            }
        }.frame(height: height)
    }

    private func stat(_ title: String, _ value: Double, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).webFont(.caption).foregroundStyle(Palette.mutedForeground)
            Text(yen(value)).webFont(.label).foregroundStyle(color).minimumScaleFactor(0.65).lineLimit(1)
        }
    }

    private func monthRow(number: Int) -> some View {
        let month = String(format: "%04d%02d", year, number)
        let record = months.first { $0.month == month }
        return NavigationLink(destination: MonthlyView(initialMonth: month)) {
            HStack(spacing: 12) {
                Text("\(number)月").webFont(.heading).frame(minWidth: 48, alignment: .leading)
                if let record {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(yen(record.balance)).webFont(.label).foregroundStyle(record.balance >= 0 ? Palette.accent : Palette.destructive).monospacedDigit().minimumScaleFactor(0.6).lineLimit(1)
                        Text("収入 \(yen(record.incomeTotal)) / 支出 \(yen(abs(record.expenseTotal)))")
                            .webFont(.caption).foregroundStyle(Palette.mutedForeground)
                    }
                } else {
                    Text("未記録").foregroundStyle(Palette.mutedForeground)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").webFont(.caption).foregroundStyle(Palette.mutedForeground)
            }.frame(maxWidth: .infinity, alignment: .leading).surface(radius: Radius.xl)
        }.buttonStyle(.plain).accessibilityIdentifier("month-\(month)")
    }

    private func load() async {
        loading = true; error = nil
        do {
            let response = try await model.months()
            try Task.checkCancellation()
            months = response; loading = false
        } catch is CancellationError { }
        catch { if !Task.isCancelled { self.error = error.localizedDescription; loading = false } }
    }
}
