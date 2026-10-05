// Murmur for Apple Watch (Oct 4 2026).
//
// Owner, on an Apple Watch SE 3: "Hey Siri, log an expense in Murmur" on
// the wrist answered "I can't help you with that". Siri on the watch only
// knows apps installed on the watch, and Murmur had no watch app.
//
// This target is deliberately thin. It hears a sentence (Siri or a tap and
// dictation) and hands it to the iPhone over WatchConnectivity; the iPhone
// files it through the exact path Siri on the phone uses
// (native/ios/WatchBridge.swift -> SiriCapture -> the capture queue -> the
// app's own parser and save). No sign-in on the watch, no second parser, no
// way for the wrist and the phone to disagree about what was saved.
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = (config) => ({
  type: 'watch',
  name: 'MurmurWatch',
  displayName: 'Murmur',
  bundleIdentifier: '.watchkitapp',
  // App Shortcuts (Siri phrases with no setup) need watchOS 10.
  deploymentTarget: '10.0',
  icon: '../../assets/icon.png',
  colors: { $accent: '#3F5A3E' },
  frameworks: ['WatchConnectivity', 'AppIntents'],
})
