import Combine
import Foundation
import WatchConnectivity

/// The watch's only job: carry a sentence to the iPhone and bring back what
/// the iPhone actually saved, so Siri on the wrist can say it.
///
/// Two delivery paths, chosen by reachability:
///   - iPhone reachable (nearby, or on the same Wi-Fi): `sendMessage`, which
///     wakes Murmur on the iPhone in the background, and waits for its reply
///     ("Saved. $5.00 at Walmart."). The iPhone answers within its own 9 s
///     budget, the same one Siri on the phone uses.
///   - Not reachable: `transferUserInfo`, which the system delivers when the
///     two are back in range. Nothing is lost; the watch says so honestly
///     rather than claiming a save that has not happened.
final class PhoneLink: NSObject, ObservableObject, WCSessionDelegate {
  static let shared = PhoneLink()

  /// The last outcome, shown on the watch screen, including when the save
  /// came from Siri rather than a tap.
  @Published var lastStatus: String?

  private var activation: [CheckedContinuation<Void, Never>] = []
  private let lock = NSLock()

  func activate() {
    guard WCSession.isSupported() else { return }
    let s = WCSession.default
    if s.delegate == nil { s.delegate = self }
    if s.activationState != .activated { s.activate() }
  }

  private func waitUntilActive() async {
    let s = WCSession.default
    if s.activationState == .activated { return }
    activate()
    await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
      lock.lock()
      if s.activationState == .activated {
        lock.unlock()
        c.resume()
        return
      }
      activation.append(c)
      lock.unlock()
      // Never hang a Siri request on activation: give up after 3 s and let
      // the reachability check below decide.
      DispatchQueue.global().asyncAfter(deadline: .now() + 3) { [weak self] in
        self?.resumeWaiters()
      }
    }
  }

  private func resumeWaiters() {
    lock.lock()
    let waiting = activation
    activation = []
    lock.unlock()
    waiting.forEach { $0.resume() }
  }

  /// Returns the sentence to show or say.
  func send(phrase: String, hint: String) async -> String {
    let trimmed = phrase.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return publish(WatchCopy.nothingHeard) }
    await waitUntilActive()

    let payload: [String: Any] = [
      "kind": "phrase",
      "phrase": trimmed,
      "hint": hint,
      "captured_at": ISO8601DateFormatter().string(from: Date()),
    ]
    let s = WCSession.default
    guard s.activationState == .activated else { return publish(WatchCopy.noPhone) }

    // Reachability follows the app coming to the front by a beat; give it
    // up to 3 s before falling back to a deferred transfer.
    var waited = 0.0
    while !s.isReachable && waited < 3 {
      try? await Task.sleep(nanoseconds: 200_000_000)
      waited += 0.2
    }

    if s.isReachable {
      let reply: String? = await withCheckedContinuation { (c: CheckedContinuation<String?, Never>) in
        let once = Once()
        s.sendMessage(payload, replyHandler: { r in
          once.run { c.resume(returning: r["dialog"] as? String) }
        }, errorHandler: { _ in
          // The phone dropped out between the check and the send: queue it.
          s.transferUserInfo(payload)
          once.run { c.resume(returning: nil) }
        })
        // A little over the iPhone's own 9 s budget.
        DispatchQueue.global().asyncAfter(deadline: .now() + 11) {
          once.run { c.resume(returning: nil) }
        }
      }
      if let reply, !reply.isEmpty { return publish(reply) }
      return publish(WatchCopy.queued)
    }

    s.transferUserInfo(payload)
    return publish(WatchCopy.queuedForLater)
  }

  @discardableResult
  private func publish(_ line: String) -> String {
    DispatchQueue.main.async { self.lastStatus = line }
    return line
  }

  // MARK: WCSessionDelegate

  func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
    resumeWaiters()
  }
}

/// Resume a continuation at most once, whichever of reply, error or timeout
/// arrives first.
private final class Once {
  private var done = false
  private let lock = NSLock()
  func run(_ body: () -> Void) {
    lock.lock(); defer { lock.unlock() }
    if done { return }
    done = true
    body()
  }
}
