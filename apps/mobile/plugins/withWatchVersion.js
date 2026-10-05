// Keeps the Apple Watch app's version equal to the iPhone app's.
//
// App Store Connect rejects an upload whose embedded watch app reports a
// different CFBundleShortVersionString or CFBundleVersion from its companion
// iPhone app. @bacons/apple-targets generates the watch target with
// MARKETING_VERSION hard-coded to "1.0", so without this every upload with
// the watch app would bounce. Both values come from the same app config the
// iPhone target uses, so they cannot drift.
//
// Runs as a finalized mod: apple-targets writes the watch target in its own
// late step, after the regular xcodeproj mods, so editing it any earlier
// finds nothing. The pbxproj is edited block by block, touching only build
// configurations whose SDKROOT is watchos.
const fs = require('fs')
const path = require('path')
const { withFinalizedMod } = require('expo/config-plugins')

module.exports = function withWatchVersion(config) {
  return withFinalizedMod(config, [
    'ios',
    (c) => {
      const root = c.modRequest.platformProjectRoot
      const pbx = fs.readdirSync(root).find((f) => f.endsWith('.xcodeproj'))
      const file = path.join(root, pbx, 'project.pbxproj')
      const src = fs.readFileSync(file, 'utf8')
      const version = c.version
      const build = String(c.ios?.buildNumber ?? '1')
      let touched = 0
      const out = src.replace(/buildSettings = \{[\s\S]*?\n\t\t\t\};/g, (block) => {
        if (!/SDKROOT = watchos;/.test(block)) return block
        touched++
        return block
          .replace(/MARKETING_VERSION = [^;]+;/, `MARKETING_VERSION = ${version};`)
          .replace(/CURRENT_PROJECT_VERSION = [^;]+;/, `CURRENT_PROJECT_VERSION = ${build};`)
      })
      if (touched === 0) {
        throw new Error('withWatchVersion: no watchOS build configuration in the project. Is @bacons/apple-targets in the plugin list, and does targets/watch exist?')
      }
      fs.writeFileSync(file, out)
      return c
    },
  ])
}
