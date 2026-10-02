import XCTest
@testable import ScoreSplitterCore

final class ClientTests: XCTestCase {
    func testInputRejectsInvalidAmountAndBlankLabel() throws {
        XCTAssertThrowsError(try EntryInput(month: "202610", label: " ", amountText: "100", person: .husband))
        for amount in ["0", "-1", "1.5", "1000000000", "abc"] {
            XCTAssertThrowsError(try EntryInput(month: "202610", label: "給与", amountText: amount, person: .wife))
        }
        let input = try EntryInput(month: "202610", label: "給与", amountText: "999999999", person: .wife)
        XCTAssertEqual(input.amount, 999999999)
    }

    func testDecodesServerFractionAndOptionalFlags() throws {
        let entry = try JSONDecoder().decode(Entry.self, from: Data("""
        {"id":"1","month":"202610","label":"給与","amount":1,"person":"husband"}
        """.utf8))
        XCTAssertNil(entry.isCarryover)
        let detail = try JSONDecoder().decode(MonthDetail.self, from: Data("""
        {"month":"202610","incomes":[],"expenses":[],"carryovers":[],"monthBalance":{"incomeTotal":0,"expenseTotal":0,"balance":0},"settlement":{"totalIncome":1,"totalExpense":0,"husbandIncome":1,"wifeIncome":0,"husbandExpense":0,"wifeExpense":0,"husbandTotal":1,"wifeTotal":0,"allowance":0.5,"settlement":0.5}}
        """.utf8))
        XCTAssertEqual(detail.settlement.allowance, 0.5)
        XCTAssertEqual(detail.settlement.settlement, 0.5)
    }

    func testConcurrentRefreshUsesOneExchange() async throws {
        let transport = StubTransport()
        let vault = MemoryVault()
        let client = APIClient(baseURL: URL(string: "https://example.com/api/v1")!, transport: transport, vault: vault, identityToken: { "id-token" })
        try await client.install(session: Session.fixture(expiresAt: Date().addingTimeInterval(30)))
        async let first: MonthsResponse = client.get("months")
        async let second: MonthsResponse = client.get("months")
        _ = try await (first, second)
        let refreshes = await transport.refreshCount
        XCTAssertEqual(refreshes, 1)
    }

    func testLateResponseIsDiscardedAfterLogout() async throws {
        let transport = StubTransport(delayReads: true)
        let client = APIClient(baseURL: URL(string: "https://example.com/api/v1")!, transport: transport, vault: MemoryVault(), identityToken: { "id-token" })
        try await client.install(session: Session.fixture())
        let read = Task { let result: MonthsResponse = try await client.get("months"); return result }
        try await Task.sleep(nanoseconds: 20_000_000)
        await client.clear()
        do { _ = try await read.value; XCTFail("古いレスポンスを破棄すること") } catch { XCTAssertTrue(error is CancellationError) }
    }

    func testMutationIsNeverRetriedOnUnauthorized() async throws {
        let transport = StubTransport(unauthorizedMutations: true)
        let client = APIClient(baseURL: URL(string: "https://example.com/api/v1")!, transport: transport, vault: MemoryVault(), identityToken: { "id-token" })
        try await client.install(session: Session.fixture())
        do {
            let _: Entry = try await client.send("POST", path: "incomes", body: EntryInput(month: "202610", label: "給与", amountText: "1", person: .husband))
            XCTFail("401を通知すること")
        } catch { XCTAssertEqual((error as? APIError)?.code, "unauthorized") }
        let count = await transport.mutationCount
        XCTAssertEqual(count, 1)
        let session = await client.currentSession
        XCTAssertNil(session)
    }
}

final class MemoryVault: SessionVault, @unchecked Sendable {
    var value: Session?
    func read() throws -> Session? { value }
    func write(_ session: Session?) throws { value = session }
}

actor StubTransport: HTTPTransport {
    var refreshCount = 0
    var mutationCount = 0
    let delayReads: Bool
    let unauthorizedMutations: Bool
    init(delayReads: Bool = false, unauthorizedMutations: Bool = false) {
        self.delayReads = delayReads
        self.unauthorizedMutations = unauthorizedMutations
    }
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let path = request.url!.path
        var status = 200
        let payload: Data
        if path.hasSuffix("exchange") {
            refreshCount += 1
            try await Task.sleep(nanoseconds: 40_000_000)
            payload = try JSONEncoder.api.encode(Envelope(data: Session.fixture(token: String(repeating: "b", count: 64))))
        } else if request.httpMethod == "POST" {
            mutationCount += 1
            status = unauthorizedMutations ? 401 : 503
            payload = Data("{\"error\":{\"code\":\"unauthorized\",\"message\":\"認証が必要です\"}}".utf8)
        } else {
            if delayReads { try await Task.sleep(nanoseconds: 100_000_000) }
            payload = Data("{\"data\":{\"months\":[]}}".utf8)
        }
        return (payload, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }
}

extension Session {
    static func fixture(token: String = String(repeating: "a", count: 64), expiresAt: Date = Date().addingTimeInterval(3600)) -> Session {
        Session(token: token, householdId: "household", person: .husband, authMethod: "firebase", userId: "user", membershipId: "member", sessionEpoch: 0, expiresAt: expiresAt)
    }
}
