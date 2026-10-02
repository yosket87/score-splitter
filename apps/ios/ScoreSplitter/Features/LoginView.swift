import SwiftUI
import AuthenticationServices

struct LoginView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme
    @AppStorage("appearance") private var appearance = "system"
    @State private var helpOpen = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                Menu {
                    Picker("外観", selection: $appearance) {
                        Text("ライト").tag("light")
                        Text("ダーク").tag("dark")
                        Text("システムに合わせる").tag("system")
                    }
                } label: {
                    Image(systemName: scheme == .dark ? "moon" : "sun.max")
                        .frame(width: 44, height: 44)
                        .foregroundStyle(Palette.mutedForeground)
                }.accessibilityLabel("テーマを切り替え")
                    .accessibilityIdentifier("loginAppearance")
            }.padding(.horizontal, Space.lg)
            GeometryReader { geometry in
                ScrollView {
                    VStack(spacing: Space.xxl) {
                        loginCard
                        loginHelp
                    }.frame(maxWidth: 448)
                        .padding(.horizontal, Space.xl)
                        .padding(.top, Space.xxl).padding(.bottom, 48)
                        .frame(maxWidth: .infinity, minHeight: geometry.size.height)
                }
            }
        }.background { AppBackground() }
    }

    private var loginCard: some View {
        VStack(spacing: 28) {
            VStack(spacing: 0) {
                LoginBrandMark().frame(width: 48, height: 48)
                    .padding(.bottom, Space.md)
                Text("ヤマワケ").webFont(.loginTitle).fontWeight(.semibold).tracking(1.6)
                Text("ふたりの家計を、ひとつに。")
                    .webFont(.loginTitle).multilineTextAlignment(.center)
                    .padding(.top, Space.xxl)
                Text("いつもの方法でログイン")
                    .webFont(.small).foregroundStyle(Palette.subText)
                    .padding(.top, Space.sm)
            }.frame(maxWidth: .infinity)
            VStack(spacing: Space.md) {
                if model.identity.googleEnabled {
                    Button { Task { await model.googleLogin() } } label: {
                        HStack(spacing: 10) {
                            if let logo = UIImage(named: "google-g.png") {
                                Image(uiImage: logo).renderingMode(.original).resizable()
                                    .scaledToFit().frame(width: 20, height: 20).accessibilityHidden(true)
                            }
                            Text("Googleでログイン")
                                .font(.custom("GoogleSans-Medium", size: 14, relativeTo: .subheadline))
                                .frame(maxWidth: .infinity).multilineTextAlignment(.center)
                            Color.clear.frame(width: 20, height: 20).accessibilityHidden(true)
                        }.padding(.horizontal, Space.md).padding(.vertical, Space.md)
                            .frame(maxWidth: .infinity, minHeight: 48)
                    }.buttonStyle(GoogleLoginStyle())
                        .disabled(!model.identity.googleConfigured)
                        .accessibilityIdentifier("googleLogin")
                }
                if model.identity.appleEnabled {
                    SignInWithAppleButton(.signIn) { request in
                        do { try model.identity.prepareApple(request) }
                        catch { model.message = error.localizedDescription }
                    } onCompletion: { result in
                        Task { await model.appleLogin(result) }
                    }.signInWithAppleButtonStyle(scheme == .dark ? .white : .black)
                        .frame(height: 48).clipShape(RoundedRectangle(cornerRadius: Radius.xl))
                        .accessibilityIdentifier("appleLogin")
                }
            }.disabled(!model.configured || model.busy)
            if model.busy { ProgressView("ログインを確認しています…").webFont(.small) }
            if !model.configured {
                Text("サービスに接続できません。しばらくしてから再度お試しください。")
                    .webFont(.small).foregroundStyle(Palette.destructive)
                    .accessibilityIdentifier("connectionError")
            }
            if let message = model.message {
                Text(message).webFont(.small).foregroundStyle(Palette.destructive)
                    .accessibilityIdentifier("loginMessage")
            }
            if model.requiresWebLink, let webURL = model.webURL {
                Link("Webで初回連携する", destination: webURL).webFont(.small)
            }
        }.padding(.vertical, Space.sm)
            .surface(radius: Radius.hero, glass: true, padding: Space.xxl)
    }

    private var loginHelp: some View {
        VStack(spacing: Space.md) {
            Button { helpOpen.toggle() } label: {
                HStack(spacing: Space.xs) {
                    Image(systemName: helpOpen ? "chevron.down" : "chevron.right")
                    Text("ログインでお困りの方へ")
                }.webFont(.caption).frame(minHeight: 44)
            }.buttonStyle(.plain).foregroundStyle(Palette.accent)
                .accessibilityIdentifier("loginHelp")
                .accessibilityValue(helpOpen ? "展開中" : "折りたたみ")
            if helpOpen {
                VStack(alignment: .leading, spacing: Space.md) {
                    Text("初めて利用する場合は、Web版で同じアカウントの連携と世帯への参加を完了してください。")
                    if let webURL = model.webURL {
                        Link("Webで初回連携する", destination: webURL).accessibilityIdentifier("loginWebLink")
                    }
                }.webFont(.caption).foregroundStyle(Palette.subText)
            }
        }
    }
}

private struct GoogleLoginStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(Color(red: 31 / 255, green: 31 / 255, blue: 31 / 255))
            .background(configuration.isPressed ? Color(red: 238 / 255, green: 242 / 255, blue: 248 / 255) : .white, in: Capsule())
            .overlay(Capsule().strokeBorder(Color(red: 116 / 255, green: 119 / 255, blue: 117 / 255), lineWidth: 1))
            .opacity(enabled ? 1 : 0.5)
    }
}

private struct LoginBrandMark: View {
    var body: some View {
        // WebのBrandMark（viewBox 0 0 32 32）と同じベジェ曲線。
        Canvas { context, size in
            let scale = size.width / 32
            for (start, end, color) in [(6.0, 26.0, Palette.husband), (26.0, 6.0, Palette.wife)] {
                var path = Path()
                path.move(to: CGPoint(x: 4 * scale, y: start * scale))
                path.addCurve(to: CGPoint(x: 28 * scale, y: end * scale),
                              control1: CGPoint(x: 10 * scale, y: start * scale),
                              control2: CGPoint(x: 12 * scale, y: end * scale))
                context.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: 4 * scale, lineCap: .round))
            }
        }.accessibilityHidden(true)
    }
}
