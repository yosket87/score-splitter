import XCTest
@testable import ScoreSplitter

final class AccountProfileTests: XCTestCase {
    func testMissingProfileFieldsHaveNoInitialOrPhoto() {
        let profile = AccountProfile(name: " \n ", email: "", photoURL: nil)
        XCTAssertNil(profile.name)
        XCTAssertNil(profile.email)
        XCTAssertNil(profile.initial)
        XCTAssertNil(profile.photoURL)
    }

    func testTrimsProfileAndPreservesJapaneseInitial() {
        let url = URL(string: "https://example.com/avatar.png")!
        let profile = AccountProfile(name: " 田中 太郎 ", email: " user@example.com ", photoURL: url)
        XCTAssertEqual(profile.name, "田中 太郎")
        XCTAssertEqual(profile.initial, "田")
        XCTAssertEqual(profile.email, "user@example.com")
        XCTAssertEqual(profile.photoURL, url)
    }

    func testRejectsInsecurePhotoAndUsesUppercaseInitial() {
        let profile = AccountProfile(name: "alice", email: nil, photoURL: URL(string: "http://example.com/avatar.png"))
        XCTAssertNil(profile.photoURL)
        XCTAssertEqual(profile.initial, "A")
    }
}
