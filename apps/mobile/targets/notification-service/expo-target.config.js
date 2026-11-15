// Merchant logos on server notifications (Nov 13 2026).
//
// Owner, Oct 4: banners about a merchant should carry its logo on the right,
// the way messaging apps show a photo. Banners the phone posts itself (Apple
// Pay capture, Siri) have done that since Oct 4. A notification sent from the
// server (bill tomorrow, bill missing, heavy week) can only show an image if
// an extension downloads it before display; this is that extension. The
// sweep marks such messages `mutableContent` and puts the logo URL in
// `data.image` (packages/shared/src/domain/notifications.ts).
//
// No App Group, no keychain, no network other than the one logo request.
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = (config) => ({
  type: 'notification-service',
  name: 'MurmurNotificationService',
  displayName: 'Murmur',
  bundleIdentifier: '.notification-service',
  deploymentTarget: '15.1',
})
