import AuthenticationServices
import CryptoKit
import FirebaseAuth
import FirebaseCore
import GoogleSignIn
import ScoreSplitterCore
import UIKit

@MainActor
final class IdentityProvider {
    private(set) var configured = false
    private var appleNonce: String?
    let googleEnabled = IdentityProvider.enabled("GoogleSignInEnabled")
    let appleEnabled = IdentityProvider.enabled("AppleSignInEnabled")
    var hasEnabledProvider: Bool { googleConfigured || (appleEnabled && configured) }

    private static func enabled(_ key: String) -> Bool {
        (Bundle.main.object(forInfoDictionaryKey: key) as? String)?.uppercased() == "YES"
    }
    var googleConfigured: Bool {
        guard googleEnabled, configured, let clientID = FirebaseApp.app()?.options.clientID else { return false }
        let reversed = clientID.split(separator: ".").reversed().joined(separator: ".")
        let types = Bundle.main.object(forInfoDictionaryKey: "CFBundleURLTypes") as? [[String: Any]] ?? []
        let schemes = types.flatMap { $0["CFBundleURLSchemes"] as? [String] ?? [] }
        return schemes.contains(reversed)
    }

    init() {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--unconfigured") { return }
        #endif
        guard let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"), let options = FirebaseOptions(contentsOfFile: path), options.bundleID == Bundle.main.bundleIdentifier else { return }
        if FirebaseApp.app() == nil { FirebaseApp.configure(options: options) }
        configured = true
    }

    var profile: AccountProfile? {
        guard configured, let user = Auth.auth().currentUser else { return nil }
        let google = user.providerData.first { $0.providerID == "google.com" }
        return AccountProfile(name: google?.displayName ?? user.displayName,
                              email: google?.email ?? user.email,
                              photoURL: google?.photoURL ?? user.photoURL)
    }

    func token(forceRefresh: Bool = true) async throws -> String {
        guard configured, let user = Auth.auth().currentUser else { throw APIError.reauthenticate }
        return try await user.getIDToken(forcingRefresh: forceRefresh)
    }

    func google() async throws -> String {
        guard googleConfigured, let clientID = FirebaseApp.app()?.options.clientID, let presenter = Self.presentingController else {
            throw APIError(code: "configuration", message: "サービスに接続できません。しばらくしてから再度お試しください。")
        }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
        guard let idToken = result.user.idToken?.tokenString else { throw APIError.reauthenticate }
        let credential = GoogleAuthProvider.credential(withIDToken: idToken, accessToken: result.user.accessToken.tokenString)
        let user = try await Auth.auth().signIn(with: credential).user
        return try await user.getIDToken(forcingRefresh: true)
    }

    func prepareApple(_ request: ASAuthorizationAppleIDRequest) throws {
        appleNonce = nil
        guard appleEnabled, configured else { throw APIError.reauthenticate }
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            throw APIError(code: "authentication", message: "認証の準備に失敗しました。再度お試しください。")
        }
        let nonce = bytes.map { String(format: "%02x", $0) }.joined()
        appleNonce = nonce
        request.requestedScopes = [.fullName, .email]
        request.nonce = SHA256.hash(data: Data(nonce.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    func apple(_ result: Result<ASAuthorization, Error>) async throws -> String {
        defer { appleNonce = nil }
        guard appleEnabled, configured else { throw APIError.reauthenticate }
        let authorization = try result.get()
        guard let nonce = appleNonce, let apple = authorization.credential as? ASAuthorizationAppleIDCredential,
              let data = apple.identityToken, let idToken = String(data: data, encoding: .utf8) else { throw APIError.reauthenticate }
        let credential = OAuthProvider.appleCredential(withIDToken: idToken, rawNonce: nonce, fullName: apple.fullName)
        let user = try await Auth.auth().signIn(with: credential).user
        return try await user.getIDToken(forcingRefresh: true)
    }

    func signOut() throws {
        guard configured else { return }
        try Auth.auth().signOut()
        GIDSignIn.sharedInstance.signOut()
        appleNonce = nil
    }

    private static var presentingController: UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        var controller = scenes.first(where: { $0.activationState == .foregroundActive })?.windows.first(where: \.isKeyWindow)?.rootViewController
        while let presented = controller?.presentedViewController { controller = presented }
        return controller
    }
}
