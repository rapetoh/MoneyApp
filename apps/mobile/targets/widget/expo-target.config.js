// Murmur widgets (Oct 8 2026): home screen (small, medium) and lock screen
// (circular, rectangular, inline). Logging is the product, so every widget
// is a door into the voice overlay: one tap opens Murmur already listening
// (iOS does not let a widget record audio itself). The numbers are the top
// of Today, handed over by the app as a snapshot
// (src/components/WidgetSync.tsx -> modules/murmur-widget, via a shared
// keychain item); the widget never
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
  // Reads the snapshot from the keychain group the app shares (see the
  // app's entitlements in app.config.js). No App Group, on purpose.
  entitlements: {
    'keychain-access-groups': ['$(AppIdentifierPrefix)com.voiceexpense.widgetdata'],
  },
})
