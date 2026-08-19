// Murmur — Apple Pay capture, native half (Aug 17, 2026).
//
// An App Intent named "Log Expense in Murmur" that a Shortcuts *Wallet*
// automation ("When I tap a Wallet card or pass") calls with the
// transaction's Amount and Merchant. `openAppWhenRun = false`, so iOS
// runs it in the background: the user pays, nothing comes to the front,
// a banner says "Saved $2.11 at Three Square Market", and the expense is
// in Murmur. Apple exposes no API to read Wallet transactions directly;
// this is the mechanism every tracker (MonAi included) uses.
//
// It does not talk to the network or the database. It appends one JSON
// line to a queue file in the app's Documents directory; the JavaScript
// side (apps/mobile/src/services/walletCapture.ts, mounted by the root
// layout) drains that queue on launch / foreground / a native poke and
// saves each entry through the normal offline-first transaction path —
// categories, FX snapshot, sync, undo toast — exactly like a voice entry.
// iOS launches the app in the background to run the intent, so the JS
// drain normally runs within seconds; worst case it runs on next open.
//
// Compiled into the main app target by plugins/withWalletCapture.js
// (App Intents must live in the app target for Xcode's metadata
// extraction to see them). iOS 16+ only — @available keeps the
// deployment target unchanged.
import AppIntents
import Foundation
import UserNotifications

@available(iOS 16.0, *)
struct LogExpenseIntent: AppIntent {
  static var title: LocalizedStringResource = "Log Expense in Murmur"
  static var description = IntentDescription(
    "Saves an expense to Murmur in the background. Pass the Amount and Merchant from a Wallet automation."
  )
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Amount", description: "The transaction amount, e.g. $2.11 — a Wallet automation's Amount.")
  var amount: String

  @Parameter(title: "Merchant", description: "Where the money went — a Wallet automation's Merchant.")
  var merchant: String?

  @Parameter(title: "Currency", description: "Optional ISO code such as USD or EUR. Left empty, Murmur uses the symbol in the amount or your profile currency.")
  var currency: String?

  static var parameterSummary: some ParameterSummary {
    Summary("Log \(\.$amount) at \(\.$merchant)") {
      \.$currency
    }
  }

  func perform() async throws -> some IntentResult {
    let entry: [String: Any] = [
      "id": UUID().uuidString,
      "amount": amount,
      "merchant": merchant ?? "",
      "currency": currency ?? "",
      "source": "shortcut",
      "captured_at": ISO8601DateFormatter().string(from: Date()),
    ]
    try WalletCaptureQueue.append(entry)
    let id = entry["id"] as! String

    // Wake the app's JavaScript (modules/wallet-capture bridge) and give it
    // up to `jsBudget` seconds to save the row and post the final
    // notification itself. This is what makes the save happen at tap time
    // even when Murmur is suspended in memory (Aug 18 2026 owner test:
    // without it the row was saved 20 minutes later, on next open).
    let handledByJS = await WalletCaptureCoordinator.wakeAndWait(id: id, timeout: 20)
    if handledByJS { return .result() }

    // JS did not answer (app not running and iOS did not launch it, or a
    // very slow start): leave a Murmur-branded placeholder so the user
    // still sees the capture; the drain replaces it on next open. Skip if a
    // final notification with this id already exists (late JS finish).
    let center = UNUserNotificationCenter.current()
    let delivered = await center.deliveredNotifications()
    let notifId = "wallet-capture-\(id)"
    if delivered.contains(where: { $0.request.identifier == notifId }) { return .result() }
    let settings = await center.notificationSettings()
    if settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional {
      let content = UNMutableNotificationContent()
      content.title = "Captured from Apple Pay · \(amount)"
      content.body = "\((merchant?.isEmpty == false) ? merchant! : "Apple Pay") · Saving…"
      content.threadIdentifier = "wallet-capture"
      content.userInfo = ["walletCaptureId": id]
      content.interruptionLevel = .active
      try? await center.add(UNNotificationRequest(identifier: notifId, content: content, trigger: nil))
    }
    return .result()
  }
}

/// Intent ⇄ JavaScript hand-off. The bridge module (modules/wallet-capture)
/// forwards `MurmurWalletCaptureDidAppend` to JS as an event and posts
/// `MurmurWalletCaptureDone` when JS calls `reportDone(id)`. Both sides
/// share only these notification names — no symbols across targets.
enum WalletCaptureCoordinator {
  static let didAppend = Notification.Name("MurmurWalletCaptureDidAppend")
  static let done = Notification.Name("MurmurWalletCaptureDone")

  static func wakeAndWait(id: String, timeout: TimeInterval) async -> Bool {
    await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
      let lock = NSLock()
      var finished = false
      var token: NSObjectProtocol?
      let finish: (Bool) -> Void = { ok in
        lock.lock(); defer { lock.unlock() }
        if finished { return }
        finished = true
        if let t = token { NotificationCenter.default.removeObserver(t) }
        cont.resume(returning: ok)
      }
      token = NotificationCenter.default.addObserver(forName: done, object: nil, queue: nil) { n in
        if (n.userInfo?["id"] as? String) == id { finish(true) }
      }
      NotificationCenter.default.post(name: didAppend, object: nil, userInfo: ["id": id])
      DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { finish(false) }
    }
  }
}

/// One JSON object per line in Documents/wallet-capture-queue.jsonl — the
/// directory `expo-file-system`'s `Paths.document` resolves to on the JS side.
enum WalletCaptureQueue {
  static let fileName = "wallet-capture-queue.jsonl"

  static var url: URL {
    FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      .appendingPathComponent(fileName)
  }

  static func append(_ entry: [String: Any]) throws {
    let data = try JSONSerialization.data(withJSONObject: entry, options: [])
    var line = data
    line.append(0x0A) // "\n"
    let path = url
    if FileManager.default.fileExists(atPath: path.path) {
      let handle = try FileHandle(forWritingTo: path)
      defer { try? handle.close() }
      try handle.seekToEnd()
      try handle.write(contentsOf: line)
    } else {
      try line.write(to: path, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
  }
}
