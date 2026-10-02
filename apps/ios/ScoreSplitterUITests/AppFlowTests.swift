import XCTest

final class AppFlowTests: XCTestCase {
    func testUnconfiguredShowsConnectionErrorAndCannotSignIn() {
        let app = XCUIApplication()
        app.launchArguments = ["--unconfigured"]
        app.launch()
        XCTAssertTrue(app.staticTexts["connectionError"].waitForExistence(timeout: 10))
        for identifier in ["googleLogin", "appleLogin"] {
            let button = app.buttons[identifier]
            if button.exists { XCTAssertFalse(button.isEnabled) }
        }
        XCTAssertFalse(app.staticTexts["settlementAmount"].exists)
        capture("接続設定なし・ログイン")
    }

    func testLiveConfigurationShowsGoogleLoginOnly() throws {
        guard ProcessInfo.processInfo.environment["IOS_LIVE_UI_TESTS"] == "YES" else {
            throw XCTSkip("実接続UI検証はIOS_LIVE_UI_TESTS=YESで明示実行してください。")
        }
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.buttons["googleLogin"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["googleLogin"].isEnabled)
        XCTAssertFalse(app.buttons["appleLogin"].exists)
        XCTAssertFalse(app.staticTexts["connectionError"].exists)
        XCTAssertFalse(app.staticTexts["loginMessage"].exists)
        XCTAssertFalse(app.staticTexts["settlementAmount"].exists)
        capture("実接続・Googleログイン")
    }

    func testAuthenticatedMonthListAndAccountNavigation() throws {
        guard ProcessInfo.processInfo.environment["IOS_LIVE_UI_TESTS"] == "AUTHENTICATED" else {
            throw XCTSkip("ログイン済み開発SimulatorでIOS_LIVE_UI_TESTS=AUTHENTICATEDを指定してください。")
        }
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.navigationBars["ヤマワケ"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.tabBars.count, 0)
        app.buttons["accountButton"].tap()
        XCTAssertTrue(app.navigationBars["アカウント"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["accountName"].exists)
        XCTAssertTrue(app.staticTexts["accountEmail"].exists)
        capture("アカウント・プロフィールと設定")
        for _ in 0..<5 {
            if app.buttons["logout"].isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(app.buttons["logout"].isHittable)
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.buttons["currentMonth"].tap()
        XCTAssertTrue(app.buttons["addEntry"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.navigationBars.staticTexts["月詳細"].exists)
        app.buttons["accountButton"].tap()
        XCTAssertTrue(app.navigationBars["アカウント"].waitForExistence(timeout: 5))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertFalse(app.navigationBars.staticTexts["月詳細"].exists)
        capture("月詳細・画像のみのアカウントボタン")
        XCTAssertEqual(app.tabBars.count, 0)
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.navigationBars["ヤマワケ"].exists)
        capture("月一覧・下タブなし")
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIApplication().screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways
        add(attachment)
    }
}
