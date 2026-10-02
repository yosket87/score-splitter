import Foundation

public enum Person: String, Codable, CaseIterable, Sendable {
    case husband, wife
    public var title: String { self == .husband ? "夫" : "妻" }
}

public enum EntryKind: String, CaseIterable, Identifiable, Sendable {
    case income, expense, carryover
    public var id: String { rawValue }
    public var title: String {
        switch self { case .income: "収入"; case .expense: "支出"; case .carryover: "繰越" }
    }
    public var path: String {
        switch self { case .income: "incomes"; case .expense: "expenses"; case .carryover: "carryovers" }
    }
}

public struct Entry: Codable, Identifiable, Sendable, Equatable {
    public let id: String
    public let month: String
    public let label: String
    public let amount: Int
    public let person: Person
    public let isCarryover: Bool?
    public let isCleared: Bool?
    public let createdAt: String?
}

public struct MonthlySummary: Codable, Identifiable, Sendable {
    public let month: String
    public let incomeTotal: Double
    public let expenseTotal: Double
    public let balance: Double
    public var id: String { month }
}

public struct MonthsResponse: Codable, Sendable {
    public let months: [MonthlySummary]
}

public struct Settlement: Codable, Sendable {
    public let totalIncome: Double
    public let totalExpense: Double
    public let husbandIncome: Double
    public let wifeIncome: Double
    public let husbandExpense: Double
    public let wifeExpense: Double
    public let husbandTotal: Double
    public let wifeTotal: Double
    public let allowance: Double
    public let settlement: Double
}

public struct MonthBalance: Codable, Sendable {
    public let incomeTotal: Double
    public let expenseTotal: Double
    public let balance: Double
}

public struct MonthDetail: Codable, Sendable {
    public let month: String
    public let incomes: [Entry]
    public let expenses: [Entry]
    public let carryovers: [Entry]
    public let settlement: Settlement
    public let monthBalance: MonthBalance
    public func entries(_ kind: EntryKind) -> [Entry] {
        switch kind { case .income: incomes; case .expense: expenses; case .carryover: carryovers }
    }
}

public struct Session: Codable, Sendable, Equatable {
    public let token: String?
    public let householdId: String
    public let person: Person
    public let authMethod: String
    public let userId: String?
    public let membershipId: String?
    public let sessionEpoch: Int?
    public let expiresAt: Date
    public init(token: String?, householdId: String, person: Person, authMethod: String, userId: String?, membershipId: String?, sessionEpoch: Int?, expiresAt: Date) {
        self.token = token; self.householdId = householdId; self.person = person
        self.authMethod = authMethod; self.userId = userId; self.membershipId = membershipId
        self.sessionEpoch = sessionEpoch; self.expiresAt = expiresAt
    }
    public func sameIdentity(as other: Session) -> Bool {
        householdId == other.householdId && userId == other.userId && membershipId == other.membershipId && person == other.person && sessionEpoch == other.sessionEpoch
    }
}

public struct EntryInput: Encodable, Sendable {
    public let month: String?
    public let label: String
    public let amount: Int
    public let person: Person
    public let isCarryover: Bool?
    public let isCleared: Bool?
    public init(month: String?, label: String, amountText: String, person: Person, kind: EntryKind = .income, flag: Bool = false) throws {
        if let month, month.range(of: "^[0-9]{4}(0[1-9]|1[0-2])$", options: .regularExpression) == nil {
            throw APIError(code: "invalid_input", message: "対象月を確認してください。")
        }
        let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.utf16.count <= 255 else { throw APIError(code: "invalid_input", message: "項目名は1〜255文字で入力してください。") }
        guard !amountText.isEmpty, amountText.allSatisfy({ $0.isASCII && $0.isNumber }), let amount = Int(amountText), (1...999_999_999).contains(amount) else {
            throw APIError(code: "invalid_input", message: "金額は1〜999,999,999の整数で入力してください。")
        }
        self.month = month; self.label = trimmed; self.amount = amount; self.person = person
        self.isCarryover = kind == .expense ? flag : nil
        self.isCleared = kind == .carryover ? flag : nil
    }
}

public struct Envelope<T: Codable & Sendable>: Codable, Sendable {
    public let data: T
    public init(data: T) { self.data = data }
}

public struct APIError: Error, Codable, Sendable, LocalizedError, Equatable {
    public let code: String
    public let message: String
    public var errorDescription: String? { message }
    public init(code: String, message: String) { self.code = code; self.message = message }
    public static let reauthenticate = APIError(code: "unauthorized", message: "セッションが終了しました。AppleまたはGoogleで再ログインしてください。")
}

public extension JSONDecoder {
    static var api: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { value in
            let text = try value.singleValueContainer().decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: text) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            guard let date = formatter.date(from: text) else { throw DecodingError.dataCorruptedError(in: try value.singleValueContainer(), debugDescription: "日時形式が不正です") }
            return date
        }
        return decoder
    }
}

public extension JSONEncoder {
    static var api: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
}
