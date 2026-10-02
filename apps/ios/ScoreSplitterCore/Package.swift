// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "ScoreSplitterCore",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [.library(name: "ScoreSplitterCore", targets: ["ScoreSplitterCore"])],
    targets: [.target(name: "ScoreSplitterCore"), .testTarget(name: "ScoreSplitterCoreTests", dependencies: ["ScoreSplitterCore"])]
)
