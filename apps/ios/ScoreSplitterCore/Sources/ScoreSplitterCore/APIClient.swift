import Foundation

public protocol HTTPTransport: Sendable {
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

public struct URLSessionTransport: HTTPTransport {
    private let session: URLSession
    public init() {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.urlCache = nil
        config.timeoutIntervalForRequest = 30
        self.session = URLSession(configuration: config, delegate: NoRedirectDelegate(), delegateQueue: nil)
    }
    public func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw APIError(code: "network", message: "サーバーから応答を受信できませんでした。") }
        return (data, response)
    }
}

public protocol SessionVault: Sendable {
    func read() throws -> Session?
    func write(_ session: Session?) throws
}

public actor APIClient {
    private let baseURL: URL
    private let transport: any HTTPTransport
    private let vault: any SessionVault
    private let identityToken: @Sendable () async throws -> String
    private var session: Session?
    private var generation: UInt64 = 0
    private var refreshTask: Task<Session, Error>?
    public var currentSession: Session? { session }

    public init(baseURL: URL, transport: any HTTPTransport = URLSessionTransport(), vault: any SessionVault, identityToken: @escaping @Sendable () async throws -> String) {
        self.baseURL = baseURL; self.transport = transport; self.vault = vault; self.identityToken = identityToken
    }

    public func restore() throws {
        let saved = try vault.read()
        guard let saved, saved.expiresAt > Date() else { clear(); try vault.write(nil); return }
        try install(session: saved)
    }

    public func install(session newSession: Session) throws {
        guard Self.validToken(newSession.token), newSession.expiresAt > Date() else {
            throw APIError(code: "invalid_session", message: "セッションを保存できませんでした。")
        }
        try vault.write(newSession)
        generation &+= 1
        refreshTask?.cancel(); refreshTask = nil
        session = newSession
    }

    public func clear() {
        generation &+= 1
        refreshTask?.cancel(); refreshTask = nil
        session = nil
        // Keychain削除の失敗は呼出元に通知するため、logoutで再確認する。
        try? vault.write(nil)
    }

    public func login(idToken: String) async throws -> Session {
        let expected = generation
        let body = Exchange(idToken: idToken, mode: "login")
        let result: Session = try await raw("POST", path: "auth/exchange", body: JSONEncoder().encode(body), token: nil)
        guard generation == expected else { throw CancellationError() }
        try install(session: result)
        return result
    }

    public func logout() async throws {
        let token = session?.token
        clear()
        var localError: Error?
        do { try vault.write(nil) } catch { localError = error }
        var remoteError: Error?
        if let token {
            do { let _: LoggedOut = try await raw("POST", path: "auth/logout", body: nil, token: token) }
            catch { remoteError = error }
        }
        if let localError { throw localError }
        if let remoteError { throw remoteError }
    }

    public func get<T: Codable & Sendable>(_ path: String) async throws -> T {
        try await authorized("GET", path: path, body: nil)
    }

    public func send<T: Codable & Sendable, Body: Encodable & Sendable>(_ method: String, path: String, body: Body) async throws -> T {
        try await authorized(method, path: path, body: JSONEncoder().encode(body))
    }

    public func delete(_ path: String) async throws {
        let _: Deleted = try await authorized("DELETE", path: path, body: nil)
    }

    private func authorized<T: Codable & Sendable>(_ method: String, path: String, body: Data?) async throws -> T {
        let expected = generation
        let active = try await validSession()
        try Task.checkCancellation()
        guard generation == expected else { throw CancellationError() }
        do {
            let result: T = try await raw(method, path: path, body: body, token: active.token)
            try Task.checkCancellation()
            guard generation == expected else { throw CancellationError() }
            return result
        } catch let error as APIError {
            // 古いBearerの401で、新しいログイン・更新済みセッションを消さない。
            guard generation == expected else { throw CancellationError() }
            if session?.token == active.token, error.code == "unauthorized" { clear() }
            throw error
        } catch {
            guard generation == expected else { throw CancellationError() }
            throw error
        }
    }

    private func validSession() async throws -> Session {
        guard let active = session else { throw APIError.reauthenticate }
        guard active.expiresAt > Date() else { clear(); throw APIError.reauthenticate }
        if active.expiresAt.timeIntervalSinceNow > 120 { return active }
        let expected = generation
        if let task = refreshTask { return try await finishRefresh(task, original: active, generation: expected) }
        let transport = self.transport
        let baseURL = self.baseURL
        let identityToken = self.identityToken
        let task = Task<Session, Error> {
            let token = try await identityToken()
            try Task.checkCancellation()
            return try await Self.perform(transport: transport, baseURL: baseURL, method: "POST", path: "auth/exchange", body: JSONEncoder().encode(Exchange(idToken: token, mode: "refresh")), token: active.token)
        }
        refreshTask = task
        return try await finishRefresh(task, original: active, generation: expected)
    }

    private func finishRefresh(_ task: Task<Session, Error>, original: Session, generation expected: UInt64) async throws -> Session {
        do {
            let refreshed = try await task.value
            guard generation == expected else { throw CancellationError() }
            guard original.sameIdentity(as: refreshed) else { clear(); throw APIError.reauthenticate }
            // 複数待機者が同じ更新結果を受け取っても世代は変えない。
            guard Self.validToken(refreshed.token), refreshed.expiresAt > Date() else { clear(); throw APIError.reauthenticate }
            try vault.write(refreshed)
            session = refreshed; refreshTask = nil
            return refreshed
        } catch {
            if generation == expected {
                refreshTask = nil
                if (error as? APIError)?.code == "unauthorized" { clear() }
            }
            throw error
        }
    }

    private static func validToken(_ token: String?) -> Bool {
        guard let token else { return false }
        return token.count == 64 && token.allSatisfy { "0123456789abcdef".contains($0) }
    }

    private func raw<T: Codable & Sendable>(_ method: String, path: String, body: Data?, token: String?) async throws -> T {
        try await Self.perform(transport: transport, baseURL: baseURL, method: method, path: path, body: body, token: token)
    }

    private static func perform<T: Codable & Sendable>(transport: any HTTPTransport, baseURL: URL, method: String, path: String, body: Data?, token: String?) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method; request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (data, response) = try await transport.data(for: request)
        guard (200..<300).contains(response.statusCode) else {
            if let failure = try? JSONDecoder().decode(Failure.self, from: data) { throw failure.error }
            throw APIError(code: response.statusCode == 401 ? "unauthorized" : "server_error", message: "通信に失敗しました。しばらくしてから再度お試しください。")
        }
        do { return try JSONDecoder.api.decode(Envelope<T>.self, from: data).data }
        catch { throw APIError(code: "invalid_response", message: "サーバーの応答形式を確認できませんでした。") }
    }
}

private struct Exchange: Encodable, Sendable { let idToken: String; let mode: String }
private struct Failure: Decodable { let error: APIError }
private struct Deleted: Codable, Sendable { let deleted: Bool }
private struct LoggedOut: Codable, Sendable { let loggedOut: Bool }
public struct FlagInput: Encodable, Sendable {
    public let isCarryover: Bool?
    public let isCleared: Bool?
    public init(kind: EntryKind, value: Bool) {
        isCarryover = kind == .expense ? value : nil
        isCleared = kind == .carryover ? value : nil
    }
}
public struct Updated: Codable, Sendable { public let updated: Bool }

// Bearerを別ホストへ転送しない。APIのリダイレクトは設定エラーとして扱う。
private final class NoRedirectDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
