import XCTest
import UIKit

final class LoginAssetsTests: XCTestCase {
    func testSharedGoogleAssetsAreBundled() throws {
        XCTAssertNotNil(UIImage(named: "google-g.png"))
        XCTAssertNotNil(UIFont(name: "GoogleSans-Medium", size: 14))
        let license = try XCTUnwrap(Bundle.main.url(forResource: "google-sans-OFL", withExtension: "txt"))
        XCTAssertTrue(try String(contentsOf: license, encoding: .utf8).contains("SIL OPEN FONT LICENSE"))
    }
}
