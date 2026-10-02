#!/usr/bin/env python3
"""標準Pythonだけで再生成できるXcodeプロジェクト。"""
from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parent.parent
objects = {}

def uid(name):
    return hashlib.sha256(name.encode()).hexdigest()[:24].upper()

def obj(identity, **fields):
    key = uid(identity)
    objects[key] = fields
    return key

def ref(name):
    return uid(name)

def config(name, settings, base=None):
    fields = dict(isa='XCBuildConfiguration', buildSettings=settings, name=name.rsplit(':', 1)[-1])
    if base: fields['baseConfigurationReference'] = base
    return obj(name, **fields)

def configs(name, settings, base=None):
    ids = []
    for kind in ['Debug', 'Release']:
        merged = dict(settings)
        if kind == 'Debug':
            merged.update(SWIFT_ACTIVE_COMPILATION_CONDITIONS='DEBUG', SWIFT_OPTIMIZATION_LEVEL='-Onone', ONLY_ACTIVE_ARCH='YES', ENABLE_TESTABILITY='YES')
        ids.append(config(name + ':' + kind, merged, base))
    return obj(name + ':configs', isa='XCConfigurationList', buildConfigurations=ids, defaultConfigurationIsVisible=0, defaultConfigurationName='Release')

base = obj('config-file', isa='PBXFileReference', lastKnownFileType='text.xcconfig', path='Config/Shared.xcconfig', sourceTree='<group>')
products = []
groups = [base]
packages = [obj('core-package', isa='XCLocalSwiftPackageReference', relativePath='ScoreSplitterCore')]
for name, url, version in [('firebase', 'https://github.com/firebase/firebase-ios-sdk.git', '12.0.0'), ('google', 'https://github.com/google/GoogleSignIn-iOS.git', '9.0.0')]:
    packages.append(obj(name + '-package', isa='XCRemoteSwiftPackageReference', repositoryURL=url, requirement=dict(kind='upToNextMajorVersion', minimumVersion=version)))

common = dict(SWIFT_VERSION='5.0', IPHONEOS_DEPLOYMENT_TARGET='17.0', SDKROOT='iphoneos', TARGETED_DEVICE_FAMILY='1', CODE_SIGN_STYLE='Automatic', ENABLE_USER_SCRIPT_SANDBOXING='NO', CURRENT_PROJECT_VERSION='1', MARKETING_VERSION='1.0', CLANG_ENABLE_MODULES='YES')
project_configs = configs('project', dict(common, DEBUG_INFORMATION_FORMAT='dwarf-with-dsym'))
targets = []
for target, kind, directory, deps in [('ScoreSplitter', 'application', 'ScoreSplitter', [('core', 'ScoreSplitterCore'), ('firebase', 'FirebaseAuth'), ('firebase', 'FirebaseCore'), ('google', 'GoogleSignIn')]), ('ScoreSplitterTests', 'bundle.unit-test', 'ScoreSplitterCore/Tests/ScoreSplitterCoreTests', [('core', 'ScoreSplitterCore')]), ('ScoreSplitterUITests', 'bundle.ui-testing', 'ScoreSplitterUITests', [])]:
    source_ids = []
    children = []
    sources = list((root / directory).rglob('*.swift'))
    if target == 'ScoreSplitterTests':
        sources += list((root / 'ScoreSplitterTests').rglob('*.swift'))
    for source in sorted(sources):
        path = str(source.relative_to(root))
        f = obj(path, isa='PBXFileReference', lastKnownFileType='sourcecode.swift', path=path, sourceTree='<group>')
        children.append(f)
        source_ids.append(obj(path + ':build:' + target, isa='PBXBuildFile', fileRef=f))
    groups.append(obj(target + ':group', isa='PBXGroup', children=children, name=target, sourceTree='<group>'))
    phases = [obj(target + ':sources', isa='PBXSourcesBuildPhase', buildActionMask=2147483647, files=source_ids, runOnlyForDeploymentPostprocessing=0)]
    dependencies = []
    framework_files = []
    for package, product in deps:
        dependency = obj(target + ':' + product, isa='XCSwiftPackageProductDependency', package=ref(package + '-package'), productName=product)
        dependencies.append(dependency)
        framework_files.append(obj(target + ':' + product + ':build', isa='PBXBuildFile', productRef=dependency))
    phases.append(obj(target + ':frameworks', isa='PBXFrameworksBuildPhase', buildActionMask=2147483647, files=framework_files, runOnlyForDeploymentPostprocessing=0))
    settings = dict(common, PRODUCT_NAME='$(TARGET_NAME)', GENERATE_INFOPLIST_FILE='YES')
    if target == 'ScoreSplitter':
        settings.update(INFOPLIST_FILE='ScoreSplitter/Info.plist', GENERATE_INFOPLIST_FILE='NO', CODE_SIGN_ENTITLEMENTS='ScoreSplitter/ScoreSplitter.entitlements')
        phases.append(obj('firebase-copy', isa='PBXShellScriptBuildPhase', alwaysOutOfDate=1, buildActionMask=2147483647, files=[], inputPaths=[], outputPaths=[], runOnlyForDeploymentPostprocessing=0, shellPath='/bin/sh', shellScript='if [ -f "${SRCROOT}/Config/GoogleService-Info.plist" ]; then\n  cp "${SRCROOT}/Config/GoogleService-Info.plist" "${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/GoogleService-Info.plist"\nelse\n  rm -f "${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/GoogleService-Info.plist"\nfi\n'))
    else:
        settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'app.yamawake.ios.' + target
        if target == 'ScoreSplitterTests':
            settings.update(TEST_HOST='$(BUILT_PRODUCTS_DIR)/ScoreSplitter.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/ScoreSplitter', BUNDLE_LOADER='$(TEST_HOST)')
        else: settings['TEST_TARGET_NAME'] = 'ScoreSplitter'
    extension = 'app' if kind == 'application' else 'xctest'
    product = obj(target + ':product', isa='PBXFileReference', explicitFileType='wrapper.application' if extension == 'app' else 'wrapper.cfbundle', path=target + '.' + extension, sourceTree='BUILT_PRODUCTS_DIR')
    products.append(product)
    target_deps = []
    if target != 'ScoreSplitter':
        proxy = obj(target + ':proxy', isa='PBXContainerItemProxy', containerPortal=ref('project'), proxyType=1, remoteGlobalIDString=ref('ScoreSplitter:target'), remoteInfo='ScoreSplitter')
        target_deps.append(obj(target + ':dependency', isa='PBXTargetDependency', target=ref('ScoreSplitter:target'), targetProxy=proxy))
    targets.append(obj(target + ':target', isa='PBXNativeTarget', buildConfigurationList=configs(target, settings, base), buildPhases=phases, buildRules=[], dependencies=target_deps, name=target, packageProductDependencies=dependencies, productName=target, productReference=product, productType='com.apple.product-type.' + kind))
product_group = obj('products', isa='PBXGroup', children=products, name='Products', sourceTree='<group>')
main_group = obj('main-group', isa='PBXGroup', children=groups + [product_group], sourceTree='<group>')
project = obj('project', isa='PBXProject', attributes=dict(LastUpgradeCheck='2650', TargetAttributes={ref('ScoreSplitter:target'): dict(CreatedOnToolsVersion='26.5', SystemCapabilities={'com.apple.SignInWithApple': {'enabled': 1}})}), buildConfigurationList=project_configs, compatibilityVersion='Xcode 14.0', developmentRegion='ja', hasScannedForEncodings=0, knownRegions=['ja', 'en', 'Base'], mainGroup=main_group, packageReferences=packages, productRefGroup=product_group, projectDirPath='', projectRoot='', targets=targets)

def serialize(value, indent=0):
    if isinstance(value, dict):
        return '{\n' + '\n'.join('\t' * (indent + 1) + serialize(k) + ' = ' + serialize(v, indent + 1) + ';' for k, v in value.items()) + '\n' + '\t' * indent + '}'
    if isinstance(value, list): return '(' + ', '.join(serialize(v, indent) for v in value) + ')'
    if isinstance(value, int): return str(value)
    return json.dumps(value, ensure_ascii=False)

project_dir = root / 'ScoreSplitter.xcodeproj'
project_dir.mkdir(exist_ok=True)
(project_dir / 'project.pbxproj').write_text('// !$*UTF8*$!\n' + serialize(dict(archiveVersion=1, classes={}, objectVersion=60, objects=objects, rootObject=project)) + '\n')
scheme_dir = project_dir / 'xcshareddata/xcschemes'
scheme_dir.mkdir(parents=True, exist_ok=True)
def buildable(target):
    return f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{ref(target + ":target")}" BuildableName="{target}.{"app" if target == "ScoreSplitter" else "xctest"}" BlueprintName="{target}" ReferencedContainer="container:ScoreSplitter.xcodeproj"/>'
(scheme_dir / 'ScoreSplitter.xcscheme').write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="2650" version="1.3">
<BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">{buildable('ScoreSplitter')}</BuildActionEntry></BuildActionEntries></BuildAction>
<TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="NO"><MacroExpansion>{buildable('ScoreSplitter')}</MacroExpansion><Testables><TestableReference skipped="NO">{buildable('ScoreSplitterTests')}</TestableReference><TestableReference skipped="NO">{buildable('ScoreSplitterUITests')}</TestableReference></Testables><EnvironmentVariables><EnvironmentVariable key="IOS_LIVE_UI_TESTS" value="$(IOS_LIVE_UI_TESTS)" isEnabled="YES"/></EnvironmentVariables></TestAction>
<LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0">{buildable('ScoreSplitter')}</BuildableProductRunnable></LaunchAction>
<ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersion="1.0"><BuildableProductRunnable runnableDebuggingMode="0">{buildable('ScoreSplitter')}</BuildableProductRunnable></ProfileAction>
<AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>''')
print('ScoreSplitter.xcodeprojを生成しました')
