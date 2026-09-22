// Compiles Murmur's App Intents into the main iOS app target during
// `expo prebuild`:
//
//   native/ios/WalletCapture.swift   "Log Expense in Murmur" (Apple Pay
//                                    capture via a Wallet automation,
//                                    Aug 17 2026)
//   native/ios/SiriLogExpense.swift  "Log an expense" + the App Shortcut
//                                    phrases Siri answers to (Sep 20 2026)
//
// Why a plugin and not a local Expo module: App Intents must be part of
// the *app target* for Xcode's `appintentsmetadataprocessor` to discover
// them at build time; a CocoaPods static library (which is what a local
// module becomes) is not reliably scanned. So we copy the Swift files
// into ios/<ProjectName>/ and register them in the target's Sources build
// phase. Idempotent: prebuild regenerates ios/ from scratch (CNG), and
// the group helper skips a file that is already present.
const path = require('path')
const fs = require('fs')
const { withDangerousMod, withXcodeProject, withInfoPlist, IOSConfig } = require('expo/config-plugins')
const { PHRASES, INTENT_STRINGS, LOCALES } = require('../native/ios/siri-phrases')

const FILES = ['WalletCapture.swift', 'SiriLogExpense.swift']
const SOURCE_DIR = path.join(__dirname, '..', 'native', 'ios')

// Escape a .strings value: the format is C-like, so a literal quote or
// backslash has to be escaped or the whole file fails to parse and every
// phrase silently falls back to English.
const esc = (v) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
const stringsFile = (pairs) =>
  pairs.map(([k, v]) => `"${esc(k)}" = "${esc(v)}";`).join('\n') + '\n'

/** `<lang>.lproj/AppShortcuts.strings` + `Localizable.strings` for each
 *  language the app speaks. Siri matches phrases literally, so without
 *  these a French phone can only trigger Murmur in English. */
function localizationFiles() {
  const out = []
  for (const lang of LOCALES) {
    const pairs = []
    for (const kind of ['expense', 'income']) {
      PHRASES.en[kind].forEach((en, i) => pairs.push([en, PHRASES[lang][kind][i]]))
    }
    out.push([`${lang}.lproj/AppShortcuts.strings`, stringsFile(pairs)])
    const intent = INTENT_STRINGS[lang]
    if (intent) {
      out.push([
        `${lang}.lproj/Localizable.strings`,
        stringsFile(Object.entries(intent)),
      ])
    }
  }
  return out
}

module.exports = function withMurmurIntents(config) {
  config = withDangerousMod(config, [
    'ios',
    (c) => {
      const projectName = c.modRequest.projectName
      for (const file of FILES) {
        const dest = path.join(c.modRequest.platformProjectRoot, projectName, file)
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.copyFileSync(path.join(SOURCE_DIR, file), dest)
      }
      for (const [rel, contents] of localizationFiles()) {
        const dest = path.join(c.modRequest.platformProjectRoot, projectName, rel)
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.writeFileSync(dest, contents, 'utf8')
      }
      return c
    },
  ])
  config = withXcodeProject(config, (c) => {
    const projectName = c.modRequest.projectName
    const project = c.modResults
    for (const file of FILES) {
      const relPath = `${projectName}/${file}`
      if (!project.hasFile(relPath)) {
        IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
          filepath: relPath,
          groupName: projectName,
          project,
        })
      }
    }
    // The localizations go in as four *folder references*, one per
    // `<lang>.lproj`, not as seven individual files.
    //
    // Adding them file by file silently loses most of them: Xcode's group
    // children are matched by basename, so the second AppShortcuts.strings
    // (and the second Localizable.strings) is treated as a duplicate and
    // dropped, which shipped English phrases to every language. A folder
    // reference has a unique name, and Xcode copies the directory into the
    // bundle verbatim, which is exactly the layout iOS looks for.
    for (const lang of LOCALES) {
      const relPath = `${projectName}/${lang}.lproj`
      if (!project.hasFile(relPath)) {
        IOSConfig.XcodeUtils.addResourceFileToGroup({
          filepath: relPath,
          groupName: projectName,
          project,
          isBuildFile: true,
        })
      }
    }
    // `pbxFile` has no type for a `.lproj` extension, so it would be
    // copied as an opaque file. Naming it a folder is what makes Xcode
    // recurse into it.
    const refs = project.pbxFileReferenceSection()
    for (const key of Object.keys(refs)) {
      const ref = refs[key]
      if (ref && typeof ref === 'object' && String(ref.path ?? '').includes('.lproj')) {
        ref.lastKnownFileType = 'folder'
        delete ref.explicitFileType
      }
    }
    return c
  })
  // Without this, iOS reports the app as English-only and never looks in
  // fr/es/pt.lproj for the Siri phrases, however well the files are
  // copied. It also makes the App Store listing say the truth about the
  // four languages Murmur speaks.
  config = withInfoPlist(config, (c) => {
    c.modResults.CFBundleLocalizations = LOCALES
    return c
  })
  return config
}
