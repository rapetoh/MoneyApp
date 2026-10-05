import SwiftUI

@main
struct MurmurWatchApp: App {
  init() {
    // Activate early so a reply from the iPhone, or a queued transfer it
    // delivers later, always finds a session.
    PhoneLink.shared.activate()
  }

  var body: some Scene {
    WindowGroup {
      ContentView()
    }
  }
}
