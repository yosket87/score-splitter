import SwiftUI
import ScoreSplitterCore

struct MonthlyView: View {
    @Environment(AppModel.self) private var model
    @State private var month: String
    @State private var detail: MonthDetail?
    @State private var loading = true
    @State private var error: String?
    @State private var editor: EditorRoute?
    @State private var deletion: EntryRoute?
    @State private var changing = false
    @State private var operationMessage: String?

    init(initialMonth: String) { _month = State(initialValue: initialMonth) }

    var body: some View {
        ScrollView {
            VStack(spacing: Space.lg) {
                monthNavigation
                if loading { ProgressView("家計を読み込み中…").frame(maxWidth: .infinity).padding(44) }
                else if let error {
                    Notice(message: error)
                    Button("再読み込み") { Task { await load() } }
                } else if let detail {
                    SettlementCard(result: detail.settlement)
                    VStack(alignment: .leading, spacing: 12) {
                        amountCard("月収支", value: detail.monthBalance.balance, subtitle: "収入 − 支出")
                        amountCard("お小遣い", value: detail.settlement.allowance, subtitle: "1人あたり")
                    }
                    TrendCard()
                    ForEach(EntryKind.allCases) { kind in
                        entrySection(kind, entries: detail.entries(kind))
                    }
                }
                if let operationMessage { Notice(message: operationMessage) }
            }.padding(Space.lg)
        }.background { AppBackground() }
            .navigationTitle("").navigationBarTitleDisplayMode(.inline)
            .toolbar { AccountToolbar() }
            .safeAreaInset(edge: .bottom) {
                Button { editor = EditorRoute(kind: .expense, entry: nil, month: month) } label: {
                    Label("項目を追加", systemImage: "plus").webFont(.label).foregroundStyle(Palette.onAccent)
                        .frame(maxWidth: .infinity).padding(.vertical, 15)
                }.buttonStyle(.borderedProminent).buttonBorderShape(.capsule)
                    .padding(.horizontal, 20).padding(.vertical, 10)
                    .background { StickySurface() }
                    .disabled(loading || changing).accessibilityIdentifier("addEntry")
            }
            .task(id: "\(month)-\(model.revision)") { await load() }
            .refreshable { await load() }
            .sheet(item: $editor) { route in
                EntryEditor(month: route.month, initialKind: route.kind, entry: route.entry)
            }
            .confirmationDialog("この項目を削除しますか？", isPresented: Binding(get: { deletion != nil }, set: { if !$0 { deletion = nil } }), titleVisibility: .visible) {
                if let route = deletion {
                    Button("削除", role: .destructive) {
                        deletion = nil
                        Task { await mutate { try await model.delete(kind: route.kind, id: route.entry.id) } }
                    }
                }
            }
    }

    private var monthNavigation: some View {
        HStack {
            Button { move(-1) } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }
                .accessibilityLabel("前月")
            Spacer()
            Button {
                let target = currentMonth()
                guard target != month else { return }
                month = target; detail = nil; error = nil; loading = true
            } label: {
                VStack(spacing: 3) {
                    Text(monthTitle(month)).webFont(.title).lineLimit(1).minimumScaleFactor(0.6).foregroundStyle(Palette.foreground)
                    Text(month == currentMonth() ? "今月" : "今月へ戻る").webFont(.caption).foregroundStyle(Palette.mutedForeground)
                }
            }.accessibilityIdentifier("monthTitle")
            Spacer()
            Button { move(1) } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }
                .accessibilityLabel("翌月")
        }.disabled(changing)
    }

    private func amountCard(_ title: String, value: Double, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).webFont(.caption).foregroundStyle(Palette.mutedForeground)
            Text(yen(value)).webFont(.amount).monospacedDigit().minimumScaleFactor(0.5).lineLimit(1)
            Text(subtitle).webFont(.caption).foregroundStyle(Palette.mutedForeground)
        }.frame(maxWidth: .infinity, alignment: .leading).surface(radius: Radius.panel)
    }

    private func entrySection(_ kind: EntryKind, entries: [Entry]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(kind.title).webFont(.heading)
                Text("\(entries.count)件").webFont(.caption).foregroundStyle(Palette.mutedForeground)
                Spacer()
                Button { editor = EditorRoute(kind: kind, entry: nil, month: month) } label: {
                    Image(systemName: "plus").frame(width: 44, height: 44)
                }.accessibilityLabel("\(kind.title)を追加")
            }
            if entries.isEmpty {
                Text("\(kind.title)はまだありません")
                    .webFont(.small).foregroundStyle(Palette.mutedForeground)
                    .frame(maxWidth: .infinity, alignment: .leading).surface()
            }
            ForEach(entries) { entry in
                HStack(alignment: .top, spacing: 12) {
                    Text(entry.person.title).webFont(.caption)
                        .foregroundStyle(entry.person == .husband ? Palette.husband : Palette.wife)
                        .frame(width: 34, height: 34)
                        .background((entry.person == .husband ? Palette.husbandLight : Palette.wifeLight), in: Circle())
                    VStack(alignment: .leading, spacing: 8) {
                        Text(entry.label).webFont(.label).fixedSize(horizontal: false, vertical: true)
                        Text(yen(abs(Double(entry.amount)))).webFont(.label)
                            .foregroundStyle(kind == .income ? Palette.accent : Palette.destructive).monospacedDigit()
                            .minimumScaleFactor(0.6).lineLimit(1)
                        if kind == .expense, entry.isCarryover == true { badge("繰越扱い") }
                        if kind == .carryover { badge(entry.isCleared == true ? "今月の精算に含む" : "未清算") }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                    Menu {
                        Button("編集", systemImage: "pencil") { editor = EditorRoute(kind: kind, entry: entry, month: month) }
                        if kind != .income {
                            Button(kind == .expense ? (entry.isCarryover == true ? "精算対象にする" : "繰越扱いにする") : (entry.isCleared == true ? "未清算に戻す" : "今月で清算する")) {
                                Task { await mutate { try await model.toggle(kind: kind, entry: entry) } }
                            }
                        }
                        Button("削除", systemImage: "trash", role: .destructive) { deletion = EntryRoute(kind: kind, entry: entry) }

                    } label: {
                        Image(systemName: "ellipsis").frame(width: 36, height: 44).contentShape(Rectangle())
                    }.accessibilityLabel("\(entry.label)の操作").disabled(changing)
                }.surface()
            }
            if kind == .carryover {
                Text("清算済みの繰越だけ、今月の精算に含まれます。")
                    .webFont(.caption).foregroundStyle(Palette.mutedForeground)
            }
        }
    }

    private func badge(_ title: String) -> some View {
        Text(title).webFont(.caption).foregroundStyle(Palette.mutedForeground).padding(.horizontal, 9).padding(.vertical, 5)
            .background(Palette.muted, in: Capsule())
    }

    private func move(_ offset: Int) {
        month = shiftedMonth(month, by: offset); detail = nil; error = nil; loading = true; operationMessage = nil
    }

    private func load() async {
        let requested = month
        loading = true; error = nil
        do {
            let result = try await model.detail(month: requested)
            try Task.checkCancellation()
            guard requested == month else { return }
            detail = result; loading = false
        } catch is CancellationError { }
        catch { if !Task.isCancelled, requested == month { self.error = error.localizedDescription; loading = false } }
    }

    private func mutate(_ operation: () async throws -> Void) async {
        guard !changing else { return }
        changing = true; operationMessage = nil
        defer { changing = false }
        do { try await operation() }
        catch is CancellationError { }
        catch {
            operationMessage = "\(error.localizedDescription) 更新結果が不明な場合は、再読み込みして記録を確認してください。"
            await load()
        }
    }
}

private struct EditorRoute: Identifiable {
    let id = UUID()
    let kind: EntryKind
    let entry: Entry?
    let month: String
}
private struct EntryRoute { let kind: EntryKind; let entry: Entry }
