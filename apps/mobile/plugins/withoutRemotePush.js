// Strips the `aps-environment` (remote push) entitlement that the
// expo-notifications plugin adds by default.
//
// Murmur only schedules LOCAL notifications (Day-2 reminder, budget
// alerts) — it has no server-sent push feature, no APNs backend, and
// the stored ad-hoc provisioning profile has no Push Notifications
// capability. Keeping the entitlement makes every EAS build fail with
// "Provisioning profile doesn't support the Push Notifications
// capability" while granting the app a permission it never uses.
// If real remote push ever ships, delete this plugin and regenerate
// credentials with the capability enabled.
const { withEntitlementsPlist } = require('expo/config-plugins')

module.exports = function withoutRemotePush(config) {
  return withEntitlementsPlist(config, (c) => {
    delete c.modResults['aps-environment']
    return c
  })
}
