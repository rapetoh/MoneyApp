// Murmur widgets (Oct 8 2026): home screen (small, medium) and lock screen
// (circular, rectangular, inline). Logging is the product, so every widget
// is a door into the voice overlay: one tap opens Murmur already listening
// (iOS does not let a widget record audio itself). The numbers are the top
// of Today, handed over by the app as a snapshot in the shared App Group
// (src/components/WidgetSync.tsx -> modules/murmur-widget); the widget never
// reads the database or the network.
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = (config) => ({
  type: 'widget',
  name: 'MurmurWidget',
  displayName: 'Murmur',
  bundleIdentifier: '.widget',
  // containerBackground and the current accessory families.
  deploymentTarget: '17.0',
  colors: {
    $accent: '#3F5A3E',
    surface: { light: '#FBFAF7', dark: '#1B1C19' },
  },
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
})
