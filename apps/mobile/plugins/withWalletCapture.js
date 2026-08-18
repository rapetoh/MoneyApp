// Compiles native/ios/WalletCapture.swift (the "Log Expense in Murmur"
// App Intent — Apple Pay capture, Aug 17 2026) into the main iOS app
// target during `expo prebuild`.
//
// Why a plugin and not a local Expo module: App Intents must be part of
// the *app target* for Xcode's `appintentsmetadataprocessor` to discover
// them at build time; a CocoaPods static library (which is what a local
// module becomes) is not reliably scanned. So we copy the Swift file into
// ios/<ProjectName>/ and register it in the target's Sources build phase.
// Idempotent: prebuild regenerates ios/ from scratch (CNG), and the
// group helper skips a file that is already present.
const path = require('path')
const fs = require('fs')
const { withDangerousMod, withXcodeProject, IOSConfig } = require('expo/config-plugins')

const SOURCE = path.join(__dirname, '..', 'native', 'ios', 'WalletCapture.swift')
const FILE = 'WalletCapture.swift'

module.exports = function withWalletCapture(config) {
  config = withDangerousMod(config, [
    'ios',
    (c) => {
      const projectName = c.modRequest.projectName
      const dest = path.join(c.modRequest.platformProjectRoot, projectName, FILE)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(SOURCE, dest)
      return c
    },
  ])
  config = withXcodeProject(config, (c) => {
    const projectName = c.modRequest.projectName
    const project = c.modResults
    const relPath = `${projectName}/${FILE}`
    if (!project.hasFile(relPath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: relPath,
        groupName: projectName,
        project,
      })
    }
    return c
  })
  return config
}
