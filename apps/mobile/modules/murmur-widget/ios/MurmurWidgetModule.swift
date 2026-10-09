// Widgets (Oct 8 2026): the app writes one small JSON snapshot (spent
// today, budget left, labels already in the user's language) to a keychain
// item shared with the widget extension (targets/widget), which reads it.
// The widget never touches the database or the network.
//
// A keychain group, not an App Group: sharing a keychain group inside one
// team needs no App ID capability, so builds need no Apple sign-in.
import ExpoModulesCore
import Security
import WidgetKit

/// "<Team ID>.com.voiceexpense.widgetdata", listed in both targets'
/// keychain-access-groups entitlements.
let murmurWidgetKeychainGroup = "47WU47J52M.com.voiceexpense.widgetdata"
let murmurWidgetKeychainAccount = "murmur.widget.snapshot"
let murmurWidgetKeychainService = "com.voiceexpense.widget"

private func baseQuery() -> [String: Any] {
  [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: murmurWidgetKeychainService,
    kSecAttrAccount as String: murmurWidgetKeychainAccount,
    kSecAttrAccessGroup as String: murmurWidgetKeychainGroup,
  ]
}

private func readSnapshot() -> String? {
  var query = baseQuery()
  query[kSecReturnData as String] = true
  query[kSecMatchLimit as String] = kSecMatchLimitOne
  var out: AnyObject?
  guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess,
        let data = out as? Data else { return nil }
  return String(data: data, encoding: .utf8)
}

public class MurmurWidgetModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MurmurWidget")

    // Writes only when the snapshot changed, so a re-render never costs a
    // widget reload (iOS budgets those).
    Function("setSnapshot") { (json: String?) in
      if readSnapshot() == json { return }
      if let json, let data = json.data(using: .utf8) {
        let update: [String: Any] = [kSecValueData as String: data]
        let status = SecItemUpdate(baseQuery() as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
          var add = baseQuery()
          add[kSecValueData as String] = data
          // Lock-screen widgets render while the phone is locked.
          add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
          SecItemAdd(add as CFDictionary, nil)
        }
      } else {
        SecItemDelete(baseQuery() as CFDictionary)
      }
      WidgetCenter.shared.reloadAllTimelines()
    }
  }
}
