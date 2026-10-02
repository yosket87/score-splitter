import SwiftUI
import AuthenticationServices

struct LoginView: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        ScrollView {
            VStack(spacing: 26) {
                Image(systemName: "person.2.fill").font(.system(size: 46)).foregroundStyle(Palette.accent)
                    .padding(.top, 64).accessibilityHidden(true)
                VStack(spacing: Space.md) {
                    Text("ヤマワケ").webFont(.hero)
                    Text("ふたりの家計を、すっきり。")
                        .webFont(.heading).foregroundStyle(Palette.mutedForeground)
                    Text("毎月の収入・支出を記録して、\n夫婦の精算額をひと目で確認。")
                        .multilineTextAlignment(.center).foregroundStyle(Palette.mutedForeground)
                }
                VStack(spacing: 14) {
                    if model.identity.appleEnabled {
                        SignInWithAppleButton(.signIn) { request in
                            do { try model.identity.prepareApple(request) }
                            catch { model.message = error.localizedDescription }
                        } onCompletion: { result in
                            Task { await model.appleLogin(result) }
                        }
                        .signInWithAppleButtonStyle(.black).frame(height: 52)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .accessibilityIdentifier("appleLogin")
                    }
                    if model.identity.googleEnabled {
                        Button { Task { await model.googleLogin() } } label: {
                            Label("Googleでログイン", systemImage: "person.crop.circle")
                                .webFont(.label).frame(maxWidth: .infinity).frame(height: 52)
                        }.buttonStyle(.bordered).tint(Palette.foreground).disabled(!model.identity.googleConfigured).accessibilityIdentifier("googleLogin")
                    }
                }.disabled(!model.configured || model.busy)
                if model.busy { ProgressView("ログイン中…") }
                if !model.configured {
                    Notice(message: "サービスに接続できません。しばらくしてから再度お試しください。")
                        .accessibilityIdentifier("connectionError")
                }
                if let message = model.message {
                    Notice(message: message).accessibilityIdentifier("loginMessage")
                }
                if let webURL = model.webURL {
                    Link(model.requiresWebLink ? "Webで初回連携する" : "Web版を開く", destination: webURL)
                }
                Text("初めて利用する場合は、Web版で同じアカウントの連携と世帯への参加を完了してください。")
                    .webFont(.caption).foregroundStyle(Palette.mutedForeground).multilineTextAlignment(.center)
            }.padding(28)
        }.background { AppBackground() }
    }
}
