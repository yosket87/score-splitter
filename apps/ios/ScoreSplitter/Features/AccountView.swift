import SwiftUI

struct AccountView: View {
    @Environment(AppModel.self) private var model
    @AppStorage("appearance") private var appearance = "system"
    @State private var confirmLogout = false
    var body: some View {
        Form {
            Section {
                VStack(spacing: Space.md) {
                    AccountAvatar(profile: model.profile, size: 80)
                    Text(model.profile?.name ?? "アカウント")
                        .webFont(.title)
                        .multilineTextAlignment(.center)
                        .accessibilityIdentifier("accountName")
                    if let email = model.profile?.email {
                        Text(email).webFont(.small).foregroundStyle(Palette.mutedForeground)
                            .multilineTextAlignment(.center)
                            .textSelection(.enabled)
                            .accessibilityIdentifier("accountEmail")
                    }
                }.frame(maxWidth: .infinity).padding(.vertical, 16)
            }

            Section("表示") {
                Picker("外観", selection: $appearance) {
                    Text("端末の設定に合わせる").tag("system")
                    Text("ライト").tag("light")
                    Text("ダーク").tag("dark")
                }
            }
            Section("家計") {
                LabeledContent("担当者", value: model.session?.person.title ?? "未確認")
                if let webURL = model.webURL { Link("Web版を開く", destination: webURL) }
                Text("世帯の管理・初回連携はWeb版で行えます。別のアカウントへ切り替える場合は一度ログアウトしてください。")
                    .webFont(.caption).foregroundStyle(Palette.mutedForeground)
                Button("ログアウト", role: .destructive) { confirmLogout = true }
                    .disabled(model.busy).accessibilityIdentifier("logout")
            }
            Section("このアプリについて") {
                LabeledContent("ヤマワケ", value: "1.0")
                Text("精算額はサーバーで計算した結果を表示しています。")
                    .webFont(.caption).foregroundStyle(Palette.mutedForeground)
            }
        }.scrollContentBackground(.hidden).background { AppBackground() }
            .navigationTitle("アカウント").navigationBarTitleDisplayMode(.inline)
            .confirmationDialog("ログアウトしますか？", isPresented: $confirmLogout, titleVisibility: .visible) {
                Button("ログアウト", role: .destructive) { Task { await model.logout() } }
            }
    }
}
