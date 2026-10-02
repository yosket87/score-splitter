import SwiftUI

// Webのremは16px基準。iOSではptへ対応させ、文字だけDynamic Typeで拡大する。
enum Space {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 16
    static let xl: CGFloat = 20
    static let xxl: CGFloat = 24
}

enum Radius {
    static let base: CGFloat = 12
    static let xl: CGFloat = 16
    static let panel: CGFloat = 20
    static let annual: CGFloat = 24
    static let hero: CGFloat = 28
}

enum WebText {
    case caption, small, body, label, heading, loginTitle, title, amount, annual, hero

    var size: CGFloat {
        switch self {
        case .caption: 12
        case .small, .label: 14
        case .body, .heading: 16
        case .loginTitle: 20
        case .title, .amount: 24
        case .annual: 30
        case .hero: 36
        }
    }
    var relativeTo: Font.TextStyle {
        switch self {
        case .caption: .caption
        case .small, .label: .subheadline
        case .body, .heading: .body
        case .loginTitle: .title3
        case .title, .amount: .title2
        case .annual: .title
        case .hero: .largeTitle
        }
    }
    var weight: Font.Weight {
        switch self {
        case .caption, .small, .body: .regular
        case .label, .heading: .semibold
        default: .bold
        }
    }
    var design: Font.Design {
        switch self {
        case .amount, .annual, .hero: .monospaced
        default: .default
        }
    }
}

private struct WebTypography: ViewModifier {
    let token: WebText
    @ScaledMetric private var size: CGFloat
    init(_ token: WebText) {
        self.token = token
        _size = ScaledMetric(wrappedValue: token.size, relativeTo: token.relativeTo)
    }
    func body(content: Content) -> some View {
        content.font(.system(size: size, weight: token.weight, design: token.design))
    }
}

struct AppBackground: View {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Palette.background
                if !reduceTransparency && contrast != .increased {
                    RadialGradient(colors: [Palette.ambientHusband, .clear], center: UnitPoint(x: 0.08, y: -0.08), startRadius: 0, endRadius: geometry.size.height * 0.38)
                    RadialGradient(colors: [Palette.ambientWife, .clear], center: UnitPoint(x: 0.94, y: 0.12), startRadius: 0, endRadius: geometry.size.height * 0.34)
                }
            }
        }.ignoresSafeArea().allowsHitTesting(false).accessibilityHidden(true)
    }
}

private struct AppSurface: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    let radius: CGFloat
    let glass: Bool
    let padding: CGFloat
    private var opaque: Bool { !glass || reduceTransparency || contrast == .increased }
    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        content.padding(padding)
            .background {
                // 影は面だけに付け、半透明面の上の文字へ影を落とさない。
                Group {
                    if opaque { shape.fill(Palette.card) }
                    else { shape.fill(.ultraThinMaterial).overlay(shape.fill(Palette.glass)) }
                }
                .shadow(color: contrast == .increased ? .clear : (glass ? Palette.surfaceShadow : Palette.softShadow),
                        radius: glass ? (scheme == .dark ? 28 : 24) : (scheme == .dark ? 7 : 4),
                        x: 0, y: glass ? (scheme == .dark ? 24 : 18) : (scheme == .dark ? 4 : 2))
                .shadow(color: contrast == .increased || !glass ? .clear : Palette.surfaceShadowNear,
                        radius: scheme == .dark ? 5 : 4, x: 0, y: 2)
            }
            .overlay(shape.strokeBorder(contrast == .increased ? Palette.foreground : Palette.surfaceBorder, lineWidth: 1))
            .overlay(alignment: .top) {
                if contrast != .increased {
                    shape.strokeBorder(Palette.surfaceHighlight, lineWidth: 1)
                        .mask(LinearGradient(colors: [.white, .clear], startPoint: .top, endPoint: .center))
                }
            }

    }
}

struct StickySurface: View {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast
    var body: some View {
        Group {
            if reduceTransparency || contrast == .increased { Palette.card }
            else { Rectangle().fill(.ultraThinMaterial).overlay(Palette.sticky) }
        }.overlay(alignment: .top) {
            Rectangle().fill(contrast == .increased ? Palette.foreground : Palette.surfaceBorder).frame(height: 1)
        }.ignoresSafeArea(edges: .bottom)
    }
}

extension View {
    func webFont(_ token: WebText) -> some View { modifier(WebTypography(token)) }
    func surface(radius: CGFloat = Radius.panel, glass: Bool = false, padding: CGFloat = Space.lg) -> some View {
        modifier(AppSurface(radius: radius, glass: glass, padding: padding))
    }
}
