import XCTest
@testable import ScoreSplitterCore

final class SessionSafetyTests: XCTestCase {
    private func client(_ transport: RecordingTransport, vault: any SessionVault = MemoryVault()) -> APIClient {
        APIClient(baseURL: URL(string: "https://example.com/api/v1")!, transport: transport, vault: vault, identityToken: { "firebase-id-token" })
    }

    func testLoginExchangesFirebaseTokenAndPersistsAppBearer() async throws {
        let transport = RecordingTransport()
        let vault = MemoryVault()
        let client = client(transport, vault: vault)
        let session = try await client.login(idToken: "firebase-id-token")
        XCTAssertEqual(vault.value?.token, session.token)
        let request = await transport.requests.first!
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
        let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: String]
        XCTAssertEqual(body["mode"], "login")
        XCTAssertEqual(body["idToken"], "firebase-id-token")
    }

    func testRestoreKeepsUnexpiredSessionAndDeletesExpiredOne() async throws {
        let vault = MemoryVault()
        vault.value = .fixture()
        let client = client(RecordingTransport(), vault: vault)
        try await client.restore()
        let restored = await client.currentSession
        XCTAssertEqual(restored?.householdId, "household")
        vault.value = .fixture(expiresAt: Date().addingTimeInterval(-1))
        try await client.restore()
        XCTAssertNil(vault.value)
        let expired = await client.currentSession
        XCTAssertNil(expired)
    }

    func testInvalidBearerCannotBeInstalled() async throws {
        let client = client(RecordingTransport())
        for token in ["", String(repeating: "A", count: 64), String(repeating: "a", count: 63)] {
            do { try await client.install(session: .fixture(token: token)); XCTFail("不正tokenを拒否すること") }
            catch { XCTAssertEqual((error as? APIError)?.code, "invalid_session") }
        }
    }

    func testNoSessionStopsBeforeNetwork() async throws {
        let transport = RecordingTransport()
        let client = client(transport)
        do { let _: MonthsResponse = try await client.get("months"); XCTFail("再認証が必要") }
        catch { XCTAssertEqual((error as? APIError)?.code, "unauthorized") }
        let count = await transport.requests.count
        XCTAssertEqual(count, 0)
    }

    func testExpiredDuringUseDoesNotRefresh() async throws {
        let transport = RecordingTransport()
        let client = client(transport)
        try await client.install(session: .fixture(expiresAt: Date().addingTimeInterval(0.1)))
        try await Task.sleep(nanoseconds: 150_000_000)
        do { let _: MonthsResponse = try await client.get("months"); XCTFail("期限切れ") }
        catch { XCTAssertEqual((error as? APIError)?.code, "unauthorized") }
        let count = await transport.requests.count
        XCTAssertEqual(count, 0)
    }

    func testRefreshCannotSwitchHousehold() async throws {
        let changed = Session(token: String(repeating: "b", count: 64), householdId: "other", person: .wife, authMethod: "firebase", userId: "user", membershipId: "member", sessionEpoch: 0, expiresAt: Date().addingTimeInterval(3600))
        let client = client(RecordingTransport(refreshSession: changed))
        try await client.install(session: .fixture(expiresAt: Date().addingTimeInterval(60)))
        do { let _: MonthsResponse = try await client.get("months"); XCTFail("世帯切替を拒否") }
        catch { XCTAssertEqual((error as? APIError)?.code, "unauthorized") }
        let active = await client.currentSession
        XCTAssertNil(active)
    }

    func testMissingRefreshBearerSignsOut() async throws {
        let missing = Session(token: nil, householdId: "household", person: .husband, authMethod: "firebase", userId: "user", membershipId: "member", sessionEpoch: 0, expiresAt: Date().addingTimeInterval(3600))
        let client = client(RecordingTransport(refreshSession: missing))
        try await client.install(session: .fixture(expiresAt: Date().addingTimeInterval(60)))
        do { let _: MonthsResponse = try await client.get("months"); XCTFail("Bearerなしを拒否") }
        catch { XCTAssertEqual((error as? APIError)?.code, "unauthorized") }
    }

    func testLateOldBearerUnauthorizedDoesNotClearNewLogin() async throws {
        let transport = RecordingTransport(slowReadUnauthorized: true)
        let client = client(transport)
        try await client.install(session: .fixture())
        let read = Task { let result: MonthsResponse = try await client.get("months"); return result }
        try await Task.sleep(nanoseconds: 20_000_000)
        try await client.install(session: .fixture(token: String(repeating: "b", count: 64)))
        do { _ = try await read.value } catch { }
        let active = await client.currentSession
        XCTAssertEqual(active?.token, String(repeating: "b", count: 64))
    }

    func testLogoutCallsRemoteEvenWhenKeychainDeleteFails() async throws {
        let transport = RecordingTransport()
        let vault = FailingDeleteVault()
        let client = client(transport, vault: vault)
        try await client.install(session: .fixture())
        do { try await client.logout(); XCTFail("削除失敗を通知すること") }
        catch { XCTAssertEqual((error as? APIError)?.code, "keychain") }
        let requests = await transport.requests
        XCTAssertEqual(requests.last?.url?.path, "/api/v1/auth/logout")
        let active = await client.currentSession
        XCTAssertNil(active)
    }

    func testDeleteAndPatchUseContractAndBearer() async throws {
        let transport = RecordingTransport()
        let client = client(transport)
        try await client.install(session: .fixture())
        try await client.delete("expenses/entry")
        let response: Updated = try await client.send("PATCH", path: "carryovers/entry", body: FlagInput(kind: .carryover, value: true))
        XCTAssertTrue(response.updated)
        let requests = await transport.requests
        XCTAssertEqual(requests.first?.httpMethod, "DELETE")
        XCTAssertEqual(requests.last?.value(forHTTPHeaderField: "Authorization"), "Bearer " + String(repeating: "a", count: 64))
        let body = try JSONSerialization.jsonObject(with: requests.last!.httpBody!) as! [String: Bool]
        XCTAssertEqual(body, ["isCleared": true])
    }

    func testInvalidSuccessBodyAndUnknownFailureAreUserFacingErrors() async throws {
        for status in [200, 503, 401] {
            let client = client(RecordingTransport(readStatus: status, malformedRead: true))
            try await client.install(session: .fixture())
            do { let _: MonthsResponse = try await client.get("months"); XCTFail("不正応答を拒否") }
            catch {
                XCTAssertEqual((error as? APIError)?.code, status == 200 ? "invalid_response" : status == 401 ? "unauthorized" : "server_error")
            }
        }
    }

    func testModelMetadataAndEncodingFlags() throws {
        XCTAssertEqual(Person.husband.title, "夫")
        XCTAssertEqual(Person.wife.title, "妻")
        XCTAssertEqual(EntryKind.allCases.map(\.title), ["収入", "支出", "繰越"])
        XCTAssertEqual(EntryKind.allCases.map(\.path), ["incomes", "expenses", "carryovers"])
        XCTAssertEqual(EntryKind.expense.id, "expense")
        let expense = try EntryInput(month: nil, label: " 家賃 ", amountText: "10", person: .husband, kind: .expense, flag: true)
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(expense)) as! [String: Any]
        XCTAssertNil(json["month"])
        XCTAssertEqual(json["label"] as? String, "家賃")
        XCTAssertEqual(json["isCarryover"] as? Bool, true)
        XCTAssertEqual(FlagInput(kind: .expense, value: true).isCarryover, true)
        XCTAssertThrowsError(try EntryInput(month: "202613", label: "給与", amountText: "1", person: .husband))
        XCTAssertThrowsError(try EntryInput(month: "202610", label: String(repeating: "😀", count: 128), amountText: "1", person: .husband))
        let carryover = try EntryInput(month: "202610", label: "繰越", amountText: "1", person: .wife, kind: .carryover, flag: true)
        XCTAssertEqual(carryover.isCleared, true)
        XCTAssertThrowsError(try EntryInput(month: "202610", label: String(repeating: "あ", count: 256), amountText: "1", person: .husband))
        let detail = try JSONDecoder().decode(MonthDetail.self, from: Data(RecordingTransport.emptyMonth.utf8))
        for kind in EntryKind.allCases { XCTAssertTrue(detail.entries(kind).isEmpty) }
        let summary = try JSONDecoder().decode(MonthlySummary.self, from: Data("{\"month\":\"202610\",\"incomeTotal\":0,\"expenseTotal\":0,\"balance\":0}".utf8))
        XCTAssertEqual(summary.id, "202610")
        XCTAssertEqual(APIError.reauthenticate.localizedDescription, APIError.reauthenticate.message)
    }

    func testDateDecoderRejectsCorruptDateAndAcceptsFractions() throws {
        let data = try JSONEncoder.api.encode(Session.fixture())
        var object = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        object["expiresAt"] = "2026-10-01T01:00:00.123Z"
        let decoded = try JSONDecoder.api.decode(Session.self, from: JSONSerialization.data(withJSONObject: object))
        XCTAssertNotNil(decoded.expiresAt)
        object["expiresAt"] = "不正な日付"
        XCTAssertThrowsError(try JSONDecoder.api.decode(Session.self, from: JSONSerialization.data(withJSONObject: object)))
    }
}

final class FailingDeleteVault: SessionVault, @unchecked Sendable {
    func read() throws -> Session? { nil }
    func write(_ session: Session?) throws {
        if session == nil { throw APIError(code: "keychain", message: "削除失敗") }
    }
}

actor RecordingTransport: HTTPTransport {
    var requests: [URLRequest] = []
    let refreshSession: Session
    let slowReadUnauthorized: Bool
    let readStatus: Int
    let malformedRead: Bool
    init(refreshSession: Session = .fixture(token: String(repeating: "b", count: 64)), slowReadUnauthorized: Bool = false, readStatus: Int = 200, malformedRead: Bool = false) {
        self.refreshSession = refreshSession; self.slowReadUnauthorized = slowReadUnauthorized
        self.readStatus = readStatus; self.malformedRead = malformedRead
    }
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        let path = request.url!.path
        var status = 200
        let data: Data
        if path.hasSuffix("exchange") { data = try JSONEncoder.api.encode(Envelope(data: refreshSession)) }
        else if path.hasSuffix("logout") { data = Data("{\"data\":{\"loggedOut\":true}}".utf8) }
        else if request.httpMethod == "DELETE" { data = Data("{\"data\":{\"deleted\":true}}".utf8) }
        else if request.httpMethod == "PATCH" { data = Data("{\"data\":{\"updated\":true}}".utf8) }
        else if slowReadUnauthorized {
            try await Task.sleep(nanoseconds: 100_000_000)
            status = 401; data = Data("{\"error\":{\"code\":\"unauthorized\",\"message\":\"再認証してください\"}}".utf8)
        } else { status = readStatus; data = Data((malformedRead ? "invalid" : "{\"data\":{\"months\":[]}}").utf8) }
        return (data, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }
    static let emptyMonth = """
    {"month":"202610","incomes":[],"expenses":[],"carryovers":[],"monthBalance":{"incomeTotal":0,"expenseTotal":0,"balance":0},"settlement":{"totalIncome":0,"totalExpense":0,"husbandIncome":0,"wifeIncome":0,"husbandExpense":0,"wifeExpense":0,"husbandTotal":0,"wifeTotal":0,"allowance":0,"settlement":0}}
    """
}
