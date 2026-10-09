// Widgets (Oct 8 2026): the app writes one small JSON snapshot (spent
// today, budget left, labels already in the user's language) into the
// shared App Group; the widget extension (targets/widget) reads it. The
// widget never touches the database or the network.
import ExpoModulesCore
import WidgetKit

let murmurAppGroup = "group.com.voiceexpense.app"
let murmurSnapshotKey = "murmur.widget.snapshot"

public class MurmurWidgetModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MurmurWidget")

    // Writes only when the snapshot changed, so a re-render never costs a
    // widget reload (iOS budgets those).
    Function("setSnapshot") { (json: String?) in
      guard let defaults = UserDefaults(suiteName: murmurAppGroup) else { return }
      let current = defaults.string(forKey: murmurSnapshotKey)
      if current == json { return }
      if let json { defaults.set(json, forKey: murmurSnapshotKey) } else { defaults.removeObject(forKey: murmurSnapshotKey) }
      WidgetCenter.shared.reloadAllTimelines()
    }
  }
}
