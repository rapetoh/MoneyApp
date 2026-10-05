// Murmur — the iPhone half of the Apple Watch app (Oct 4, 2026).
//
// The watch (targets/watch) hears a sentence and sends it here over
// WatchConnectivity. This files it through SiriCapture.file, exactly what
// "Hey Siri, log an expense in Murmur" on the iPhone does: same queue, same
// parser, same save, same banner with the merchant's logo. The reply carries
// the line to say on the wrist ("Saved. $5.00 at Walmart.").
//
// Two inbound paths, matching the watch's two outbound ones:
//   - sendMessage(_:replyHandler:) when the iPhone is reachable. iOS wakes
//     Murmur in the background for it if needed; the reply is the real
//     outcome, within SiriCapture's 9 s budget.
//   - transferUserInfo when it was not: delivered later by the system, no
//     reply possible, so it is just queued and the drain is woken.
//
// The session must be activated at launch, before a message can arrive;
// plugins/withMurmurIntents.js adds the call to AppDelegate.
import Foundation
import WatchConnectivity

@objc final class WatchBridge: NSObject, WCSessionDelegate {
  @objc static let shared = WatchBridge()

  @objc func activate() {
    guard WCSession.isSupported() else { return }
    let s = WCSession.default
    s.delegate = self
    s.activate()
  }

  private func phrase(from payload: [String: Any]) -> (String, String)? {
    guard (payload["kind"] as? String) == "phrase",
          let raw = payload["phrase"] as? String else { return nil }
    let phrase = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !phrase.isEmpty else { return nil }
    let hint = (payload["hint"] as? String) == "income" ? "income" : "expense"
    return (phrase, hint)
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
    guard let (phrase, hint) = phrase(from: message) else {
      replyHandler(["dialog": SiriCopy.nothingHeard])
      return
    }
    Task {
      let line = (try? await SiriCapture.file(phrase: phrase, hint: hint)) ?? SiriCopy.queued
      replyHandler(["dialog": line])
    }
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    guard let (phrase, hint) = phrase(from: userInfo) else { return }
    Task { _ = try? await SiriCapture.file(phrase: phrase, hint: hint) }
  }

  // Required on iOS.
  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) {
    // Switching watches: reactivate so the new one is heard.
    session.activate()
  }
}
