import XCTest
import ScoreSplitterCore
@testable import ScoreSplitter

final class KeychainVaultTests: XCTestCase {
    func testDedicatedScopeWritesReadsUpdatesAndDeletesSession() throws {
        // 実セッションとは異なるscopeで、毎回独立した保存領域を使用する。
        let vault = KeychainVault(scope: "keychain-test-\(UUID().uuidString)")
        defer { try? vault.write(nil) }
        XCTAssertNil(try vault.read())
        let session = Session(token: "test-only-token", householdId: "test-household", person: .husband,
                              authMethod: "firebase", userId: "test-user", membershipId: "test-membership",
                              sessionEpoch: 1, expiresAt: Date(timeIntervalSince1970: 2_000_000_000))
        try vault.write(session)
        XCTAssertEqual(try vault.read(), session)
        let updated = Session(token: "updated-test-token", householdId: session.householdId, person: session.person,
                              authMethod: session.authMethod, userId: session.userId, membershipId: session.membershipId,
                              sessionEpoch: 2, expiresAt: session.expiresAt)
        try vault.write(updated)
        XCTAssertEqual(try vault.read(), updated)
        try vault.write(nil)
        XCTAssertNil(try vault.read())
    }
}
