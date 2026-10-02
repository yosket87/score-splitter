import AuthenticationServices
import Foundation
import Observation
import ScoreSplitterCore

@MainActor @Observable
final class AppModel {
    let identity = IdentityProvider()
    let api: APIClient?
    let webURL: URL?
    var profile: AccountProfile?
    var session: Session?
    var busy = false
    var restoring = true
    var message: String?
    var requiresWebLink = false
    var epoch = UUID()
    var revision = 0
    var signedIn: Bool { session != nil }
    var configured: Bool { api != nil && identity.configured && identity.hasEnabledProvider }

    init() {
        webURL = Self.secureURL(key: "WebBaseURL")
        if let base = Self.secureURL(key: "APIBaseURL"), base.path == "/api/v1" {
            let identity = self.identity
            api = APIClient(baseURL: base, vault: KeychainVault(scope: base.absoluteString), identityToken: { try await identity.token() })
        } else { api = nil }
    }

    func restore() async {
        guard restoring else { return }
        defer { restoring = false }
        guard configured, let api else { return }
        do {
            try await api.restore()
            guard let saved = await api.currentSession else { return }
            let verified: Session = try await api.get("auth/session")
            guard saved.sameIdentity(as: verified) else { await api.clear(); return }
            session = await api.currentSession
            profile = identity.profile
        } catch { await api.clear(); handle(error) }
    }

    func googleLogin() async {
        await login { try await self.identity.google() }
    }

    func appleLogin(_ result: Result<ASAuthorization, Error>) async {
        await login { try await self.identity.apple(result) }
    }

    private func login(_ getToken: () async throws -> String) async {
        guard !busy, let api else { return }
        busy = true; requiresWebLink = false; message = nil
        epoch = UUID()
        let expected = epoch
        defer { busy = false }
        do {
            let token = try await getToken()
            let newSession = try await api.login(idToken: token)
            guard expected == epoch else { return }
            session = newSession
            profile = identity.profile
        } catch {
            guard expected == epoch else { return }
            handle(error)
        }
    }

    func logout() async {
        guard !busy else { return }
        busy = true
        epoch = UUID(); session = nil; profile = nil; revision = 0
        requiresWebLink = false; message = nil
        defer { busy = false }
        do {
            // API側の失効が失敗してもFirebaseからのログアウトを必ず試す。
            var remoteError: Error?
            do { try await api?.logout() } catch { remoteError = error }
            try identity.signOut()
            if let remoteError { throw remoteError }
        } catch { message = "ログアウト処理の一部を確認できませんでした。安全な保存領域の削除またはサーバーの失効に失敗しています。ネットワークと端末の状態を確認してください。" }
    }

    func months() async throws -> [MonthlySummary] {
        guard let api else { throw APIError.reauthenticate }
        let expected = epoch
        do {
            let response: MonthsResponse = try await api.get("months")
            try check(expected)
            return response.months
        } catch { await process(error, expected: expected); throw error }
    }

    func detail(month: String) async throws -> MonthDetail {
        guard let api else { throw APIError.reauthenticate }
        let expected = epoch
        do {
            let result: MonthDetail = try await api.get("months/\(month)")
            try check(expected)
            return result
        } catch { await process(error, expected: expected); throw error }
    }

    func save(kind: EntryKind, id: String?, input: EntryInput) async throws {
        guard let api else { throw APIError.reauthenticate }
        let expected = epoch
        do {
            let path = id.map { "\(kind.path)/\($0)" } ?? kind.path
            let _: Entry = try await api.send(id == nil ? "POST" : "PUT", path: path, body: input)
            try check(expected); revision += 1
        } catch { await process(error, expected: expected); throw error }
    }

    func delete(kind: EntryKind, id: String) async throws {
        guard let api else { throw APIError.reauthenticate }
        let expected = epoch
        do { try await api.delete("\(kind.path)/\(id)"); try check(expected); revision += 1 }
        catch { await process(error, expected: expected); throw error }
    }

    func toggle(kind: EntryKind, entry: Entry) async throws {
        guard let api else { throw APIError.reauthenticate }
        let expected = epoch
        let current = kind == .expense ? entry.isCarryover ?? false : entry.isCleared ?? false
        do {
            let _: Updated = try await api.send("PATCH", path: "\(kind.path)/\(entry.id)", body: FlagInput(kind: kind, value: !current))
            try check(expected); revision += 1
        } catch { await process(error, expected: expected); throw error }
    }

    private func process(_ error: Error, expected: UUID) async {
        guard expected == epoch else { return }
        if (error as? APIError)?.code == "unauthorized", await api?.currentSession == nil {
            epoch = UUID(); session = nil; profile = nil
            message = APIError.reauthenticate.message
        }
    }

    private func check(_ expected: UUID) throws {
        try Task.checkCancellation()
        guard epoch == expected else { throw CancellationError() }
    }

    private func handle(_ error: Error) {
        if (error as? ASAuthorizationError)?.code == .canceled { return }
        if (error as NSError).code == -5 { return }
        requiresWebLink = (error as? APIError)?.code == "web_link_required"
        if requiresWebLink { message = "初回のWeb連携が必要です。Webで同じアカウントを連携・承認してから、再度ログインしてください。" }
        else if let error = error as? APIError { message = error.message }
        else { message = "ログインに失敗しました。ネットワークと認証設定を確認して再度お試しください。" }
    }

    private static func secureURL(key: String) -> URL? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String, let url = URL(string: value), url.scheme == "https", url.host != nil, url.user == nil, url.password == nil, url.query == nil, url.fragment == nil else { return nil }
        return url
    }
}
