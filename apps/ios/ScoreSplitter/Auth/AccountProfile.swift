import Foundation

struct AccountProfile: Equatable {
    let name: String?
    let email: String?
    let photoURL: URL?

    init(name: String?, email: String?, photoURL: URL?) {
        self.name = Self.nonempty(name)
        self.email = Self.nonempty(email)
        self.photoURL = photoURL?.scheme == "https" ? photoURL : nil
    }

    var initial: String? { name.map { String($0.prefix(1)).uppercased() } }

    private static func nonempty(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return nil }
        return value
    }
}
