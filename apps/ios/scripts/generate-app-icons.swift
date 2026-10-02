import AppKit
import Foundation

// WebのBrandMarkの曲線と色を使い、iOS向けの不透明1024pxアイコンを再生成する。
let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let catalog = root.appendingPathComponent("ScoreSplitter/Assets.xcassets")
let output = catalog.appendingPathComponent("AppIcon.appiconset")
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!

func color(_ hex: UInt32, alpha: CGFloat = 1) -> CGColor {
    CGColor(colorSpace: colorSpace, components: [CGFloat((hex >> 16) & 255) / 255,
        CGFloat((hex >> 8) & 255) / 255, CGFloat(hex & 255) / 255, alpha])!
}

func render(dark: Bool) throws {
    guard let context = CGContext(data: nil, width: 1024, height: 1024, bitsPerComponent: 8,
                                  bytesPerRow: 4096, space: colorSpace,
                                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else {
        throw NSError(domain: "AppIcon", code: 1, userInfo: [NSLocalizedDescriptionKey: "描画領域を作成できません"])
    }
    context.setFillColor(color(dark ? 0x0B0E14 : 0xF4F7FC))
    context.fill(CGRect(x: 0, y: 0, width: 1024, height: 1024))
    context.translateBy(x: 0, y: 1024)
    context.scaleBy(x: 1, y: -1)
    for (hex, center) in [(UInt32(0x2563EB), CGPoint(x: 80, y: 0)), (UInt32(0xC43B5C), CGPoint(x: 960, y: 160))] {
        let colors = [color(hex, alpha: dark ? 0.16 : 0.09), color(hex, alpha: 0)] as CFArray
        let gradient = CGGradient(colorsSpace: colorSpace, colors: colors, locations: [0, 1])!
        context.drawRadialGradient(gradient, startCenter: center, startRadius: 0,
                                   endCenter: center, endRadius: 850, options: [])
    }
    // 32単位のマークに余白を足す。角丸マスクはOSに任せる。
    context.translateBy(x: 128, y: 128)
    context.scaleBy(x: 24, y: 24)
    context.setLineCap(.round)
    context.setLineWidth(4)
    for (start, end, hex) in [(6.0, 26.0, UInt32(dark ? 0x73AEFF : 0x2563EB)),
                              (26.0, 6.0, UInt32(dark ? 0xFF7D9C : 0xC43B5C))] {
        context.setStrokeColor(color(hex))
        context.move(to: CGPoint(x: 4, y: start))
        context.addCurve(to: CGPoint(x: 28, y: end), control1: CGPoint(x: 10, y: start), control2: CGPoint(x: 12, y: end))
        context.strokePath()
    }
    guard let image = context.makeImage(),
          let data = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else {
        throw NSError(domain: "AppIcon", code: 2, userInfo: [NSLocalizedDescriptionKey: "PNGを書き出せません"])
    }
    try data.write(to: output.appendingPathComponent(dark ? "AppIcon-Dark.png" : "AppIcon.png"))
}

try render(dark: false)
try render(dark: true)
let info: [String: Any] = ["author": "xcode", "version": 1]
let images: [[String: Any]] = [
    ["filename": "AppIcon.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"],
    ["filename": "AppIcon-Dark.png", "idiom": "universal", "platform": "ios", "size": "1024x1024",
     "appearances": [["appearance": "luminosity", "value": "dark"]]]
]
try JSONSerialization.data(withJSONObject: ["images": images, "info": info], options: [.prettyPrinted, .sortedKeys])
    .write(to: output.appendingPathComponent("Contents.json"))
try JSONSerialization.data(withJSONObject: ["info": info], options: [.prettyPrinted, .sortedKeys])
    .write(to: catalog.appendingPathComponent("Contents.json"))
print("ライト・ダークのAppIconを生成しました")
