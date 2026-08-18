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
    let at = (merchant?.isEmpty == false) ? " · \(merchant!)" : ""
    let title = "Saved \(amount)\(at)"
    // Feedback: a Murmur-branded local notification (app icon, not the
    // Shortcuts banner — and no Shortcuts dialog, so there is exactly one
    // banner). Identifier = entry id, so the JS side REPLACES it with the
    // final version (category filled in, Undo / Edit actions) the moment
    // the real save lands. The guided set-up screen asks for notification
    // permission up front; without it the save still happens silently.
    let settings = await UNUserNotificationCenter.current().notificationSettings()
    if settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional {
      let content = UNMutableNotificationContent()
      content.title = title
      content.body = "Filing it in Murmur…"
      content.threadIdentifier = "wallet-capture"
      content.userInfo = ["walletCaptureId": id]
      content.interruptionLevel = .active
      let request = UNNotificationRequest(identifier: "wallet-capture-\(id)", content: content, trigger: nil)
      try? await UNUserNotificationCenter.current().add(request)
    }
    return .result()
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
