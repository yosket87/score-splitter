import Foundation
import Security
import CryptoKit
import ScoreSplitterCore

struct KeychainVault: SessionVault {
    private let service: String
    init(scope: String) {
        let digest = SHA256.hash(data: Data(scope.utf8)).map { String(format: "%02x", $0) }.joined()
        service = (Bundle.main.bundleIdentifier ?? "ScoreSplitter") + ".session.v1." + digest
    }
    private let account = "app-session"
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account,
         kSecAttrSynchronizable as String: false]
    }
    func read() throws -> Session? {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw failure }
        do { return try JSONDecoder.api.decode(Session.self, from: data) }
        catch { try write(nil); return nil }
    }
    func write(_ session: Session?) throws {
        guard let session else {
            let status = SecItemDelete(query as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw failure }
            return
        }
        let data = try JSONEncoder.api.encode(session)
        let changes: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let status = SecItemUpdate(query as CFDictionary, changes as CFDictionary)
        if status == errSecItemNotFound {
            var item = query
            changes.forEach { item[$0.key] = $0.value }
            guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw failure }
        } else if status != errSecSuccess { throw failure }
    }
    private var failure: APIError { APIError(code: "keychain", message: "安全なセッション保存領域にアクセスできませんでした。端末のロックを解除して再度お試しください。") }
}
