import SwiftUI

func adaptive(_ light: UInt32, _ dark: UInt32, lightAlpha: Double = 1, darkAlpha: Double = 1) -> Color {
    Color(uiColor: UIColor { traits in
        let hex = traits.userInterfaceStyle == .dark ? dark : light
        return UIColor(red: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: traits.userInterfaceStyle == .dark ? darkAlpha : lightAlpha)
    })
}

// src/app/globals.cssの認証後アプリ用トークンに対応する。
enum Palette {
    static let background = adaptive(0xF4F7FC, 0x0B0E14)
    static let card = adaptive(0xFFFFFF, 0x181D29)
    static let foreground = adaptive(0x1A1A1A, 0xE5E7EB)
    static let accent = adaptive(0x2563EB, 0x60A5FA)
    static let onAccent = adaptive(0xFFFFFF, 0x0B0E14)
    static let husband = adaptive(0x2563EB, 0x73AEFF)
    static let wife = adaptive(0xC43B5C, 0xFF7D9C)
    static let income = adaptive(0x0F766E, 0x5EEAD4)
    static let expense = adaptive(0xB45309, 0xFBBF24)
    static let mutedForeground = adaptive(0x767676, 0x9CA3AF)
    static let subText = adaptive(0x666666, 0x9CA3AF)
    static let muted = adaptive(0xF3F4F6, 0x252833)
    static let border = adaptive(0xE5E7EB, 0xFFFFFF, darkAlpha: 0x14 / 255.0)
    static let destructive = adaptive(0xB42318, 0xFF8A75)
    static let husbandLight = adaptive(0xEFF6FF, 0x60A5FA, darkAlpha: 0x26 / 255.0)
    static let wifeLight = adaptive(0xFFF1F3, 0xFF7D9C, darkAlpha: 0x26 / 255.0)
    static let surfaceBorder = adaptive(0xFFFFFF, 0xFFFFFF, lightAlpha: 0xCC / 255.0, darkAlpha: 0x1F / 255.0)
    static let surfaceHighlight = adaptive(0xFFFFFF, 0xFFFFFF, lightAlpha: 0xE6 / 255.0, darkAlpha: 0x14 / 255.0)
    static let glass = adaptive(0xFFFFFF, 0x181D29, lightAlpha: 0xB8 / 255.0, darkAlpha: 0xB8 / 255.0)
    static let sticky = adaptive(0xFFFFFF, 0x111620, lightAlpha: 0xD6 / 255.0, darkAlpha: 0xD9 / 255.0)
    static let ambientHusband = adaptive(0x2563EB, 0x2563EB, lightAlpha: 0x1F / 255.0, darkAlpha: 0x2E / 255.0)
    static let ambientWife = adaptive(0xC43B5C, 0xC43B5C, lightAlpha: 0x14 / 255.0, darkAlpha: 0x24 / 255.0)
    static let softShadow = adaptive(0x000000, 0x000000, lightAlpha: 0x0D / 255.0, darkAlpha: 0x4D / 255.0)
    static let surfaceShadow = adaptive(0x1D3563, 0x000000, lightAlpha: 0x1A / 255.0, darkAlpha: 0x52 / 255.0)
    static let surfaceShadowNear = adaptive(0x1D3563, 0x000000, lightAlpha: 0x0D / 255.0, darkAlpha: 0x33 / 255.0)
    static let chartBarMuted = adaptive(0xE5E7EB, 0x374151)
}


func yen(_ amount: Double, fractional: Bool = false) -> String {
    let value = fractional ? abs(amount) : floor(abs(amount))
    let formatted = value.formatted(.number.locale(Locale(identifier: "ja_JP")).precision(.fractionLength(0...(fractional ? 1 : 0))))
    return (amount < 0 ? "−¥" : "¥") + formatted
}

func monthTitle(_ month: String) -> String {
    guard month.count == 6, let year = Int(month.prefix(4)), let number = Int(month.suffix(2)) else { return month }
    return "\(year)年\(number)月"
}

func currentMonth() -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyyMM"
    return formatter.string(from: Date())
}

func shiftedMonth(_ month: String, by offset: Int) -> String {
    var calendar = Calendar(identifier: .gregorian)
    calendar.locale = Locale(identifier: "ja_JP")
    guard let year = Int(month.prefix(4)), let number = Int(month.suffix(2)), let date = calendar.date(from: DateComponents(year: year, month: number, day: 1)), let shifted = calendar.date(byAdding: .month, value: offset, to: date) else { return month }
    let components = calendar.dateComponents([.year, .month], from: shifted)
    return String(format: "%04d%02d", components.year ?? year, components.month ?? number)
}

struct Notice: View {
    let message: String
    var body: some View {
        Label(message, systemImage: "info.circle")
            .webFont(.small).foregroundStyle(Palette.mutedForeground)
            .frame(maxWidth: .infinity, alignment: .leading).surface()
    }
}
