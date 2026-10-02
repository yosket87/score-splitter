import SwiftUI
import ScoreSplitterCore

struct EntryEditor: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let month: String
    let entry: Entry?
    @State private var kind: EntryKind
    @State private var label: String
    @State private var amountText: String
    @State private var person: Person
    @State private var flag: Bool
    @State private var saving = false
    @State private var error: String?
    @State private var outcomeUnknown = false

    init(month: String, initialKind: EntryKind, entry: Entry?) {
        self.month = month; self.entry = entry
        _kind = State(initialValue: initialKind)
        _label = State(initialValue: entry?.label ?? "")
        _amountText = State(initialValue: entry.map { String(abs($0.amount)) } ?? "")
        _person = State(initialValue: entry?.person ?? .husband)
        _flag = State(initialValue: initialKind == .expense ? entry?.isCarryover ?? false : entry?.isCleared ?? false)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("項目種別", selection: $kind) {
                        ForEach(EntryKind.allCases) { kind in Text(kind.title).tag(kind) }
                    }.pickerStyle(.segmented).disabled(entry != nil)
                }
                Section("\(monthTitle(month))の\(kind.title)") {
                    TextField("項目名", text: $label).accessibilityIdentifier("entryLabel")
                    HStack {
                        TextField("金額", text: $amountText).keyboardType(.numberPad).accessibilityIdentifier("entryAmount")
                        Text("円").foregroundStyle(Palette.mutedForeground)
                    }
                    Picker("担当者", selection: $person) {
                        ForEach(Person.allCases, id: \.self) { person in Text(person.title).tag(person) }
                    }.pickerStyle(.segmented)
                    if kind == .expense { Toggle("繰越扱いにする", isOn: $flag) }
                    if kind == .carryover { Toggle("今月で清算する", isOn: $flag) }
                }
                if kind == .expense {
                    Section { Text("繰越扱いの支出は、今月の精算から除外します。").webFont(.caption).foregroundStyle(Palette.mutedForeground) }
                } else if kind == .carryover {
                    Section { Text("清算済みの繰越は今月の精算に含まれます。").webFont(.caption).foregroundStyle(Palette.mutedForeground) }
                }
                if let error { Section { Text(error).foregroundStyle(Palette.destructive).accessibilityIdentifier("entryError") } }
                Section {
                    Button { Task { await save() } } label: {
                        HStack {
                            Spacer()
                            if saving { ProgressView() }
                            Text(saving ? "保存中…" : entry == nil ? "\(kind.title)を追加" : "変更を保存").webFont(.label)
                            Spacer()
                        }
                    }.disabled(saving || outcomeUnknown).accessibilityIdentifier("saveEntry")
                    if outcomeUnknown {
                        Button("閉じて記録を再読み込みする") { model.revision += 1; dismiss() }
                        Text("送信結果が確認できないため、同じ変更を再送せず一覧で確認してください。")
                            .webFont(.caption).foregroundStyle(Palette.mutedForeground)
                    }
                }
            }.disabled(saving).scrollContentBackground(.hidden).background { AppBackground() }
                .navigationTitle(entry == nil ? "項目を追加" : "項目を編集")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() }.disabled(saving) }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("保存") { Task { await save() } }.disabled(saving || outcomeUnknown)
                    }
                }.interactiveDismissDisabled(saving)
                .onChange(of: kind) { _, _ in flag = false }
        }
    }

    private func save() async {
        guard !saving, !outcomeUnknown else { return }
        let input: EntryInput
        do { input = try EntryInput(month: entry == nil ? month : nil, label: label, amountText: amountText, person: person, kind: kind, flag: flag) }
        catch { self.error = error.localizedDescription; return }
        saving = true; error = nil
        defer { saving = false }
        do {
            try await model.save(kind: kind, id: entry?.id, input: input)
            dismiss()
        } catch is CancellationError { dismiss() }
        catch {
            self.error = error.localizedDescription
            // 入力エラー・確定した拒否以外は、POST/PUTの結果が不明として再送を防ぐ。
            let code = (error as? APIError)?.code
            outcomeUnknown = !["invalid_input", "unauthorized", "not_found", "rate_limited"].contains(code ?? "")
        }
    }
}
