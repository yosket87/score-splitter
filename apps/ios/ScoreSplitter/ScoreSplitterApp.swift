import SwiftUI
import GoogleSignIn

@main
struct ScoreSplitterApp: App {
    @State private var model = AppModel()
    @AppStorage("appearance") private var appearance = "system"
    var body: some Scene {
        WindowGroup {
            RootView().environment(model).webFont(.body)
                .tint(Palette.accent)
                .foregroundStyle(Palette.foreground)
                .preferredColorScheme(appearance == "dark" ? .dark : appearance == "light" ? .light : nil)
                .onOpenURL { GIDSignIn.sharedInstance.handle($0) }
                .task { await model.restore() }
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        Group {
            if model.restoring { ProgressView("セッションを確認中…") }
            else if model.signedIn {
                NavigationStack { MonthListView() }.id(model.epoch)
            } else { LoginView() }
        }
    }
}
