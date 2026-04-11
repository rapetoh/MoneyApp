// Expo config plugin — adds the MoneyNotificationListenerService declaration to
// AndroidManifest.xml during `expo prebuild` (triggered automatically by EAS build).
const { withAndroidManifest } = require('@expo/config-plugins')

const SERVICE_NAME = 'expo.modules.notificationlistener.MoneyNotificationListenerService'

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 */
module.exports = function withNotificationListener(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults
    const application = manifest.manifest.application?.[0]
    if (!application) return modConfig

    if (!application.service) application.service = []

    // Idempotent — skip if already present
    const alreadyAdded = application.service.some(
      (s) => s.$?.['android:name'] === SERVICE_NAME,
    )
    if (alreadyAdded) return modConfig

    application.service.push({
      $: {
        'android:name': SERVICE_NAME,
        'android:label': 'Payment Notification Listener',
        'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
        'android:exported': 'false',
      },
      'intent-filter': [
        {
          action: [
            {
              $: {
                'android:name': 'android.service.notification.NotificationListenerService',
              },
            },
          ],
        },
      ],
    })

    return modConfig
  })
}
