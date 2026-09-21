// Murmur — "Hey Siri, log an expense in Murmur" (Sep 20, 2026).
//
// The owner's idea: standing outside Walmart, say it to Siri and never
// take the phone out. This is the App Intent that makes that work.
//
// What iOS actually allows, and why the flow looks like this: an App
// Shortcut phrase can only embed a parameter of type AppEnum or
// AppEntity, never free text. There is no way to put an arbitrary
// "5 dollars at Walmart" inside the trigger phrase itself. So the
// supported, future-proof shape is two turns, both hands free:
//
//     "Hey Siri, log an expense in Murmur"
//     Siri: "What did you spend?"
//     "five dollars at Walmart"
//     Siri: "Saved. $5.00 at Walmart."
//
// The single-utterance version exists only through SiriKit's Lists and
// Notes domain, which Apple deprecated at WWDC 2026 in favour of App
// Intents; building Murmur's newest surface on a retiring API is not a
// trade worth making. The Shortcuts action below also takes the phrase
// as a parameter, so anyone who wants one word can wire their own
// shortcut (Dictate text -> Log an expense) or put it on the Action
// button.
//
// Nothing here parses or saves. It appends the sentence to the same
// queue the Apple Pay intent uses (WalletCapture.swift), wakes the
// JavaScript drain, and waits a few seconds for it to answer with what
// it saved, so Siri can say the real amount and merchant rather than a
// canned line. The parse is the app's own parser, the save is the normal
// offline-first path: Siri and the microphone cannot disagree.
//
// Compiled into the main app target by plugins/withMurmurIntents.js.
// iOS 16+; @available keeps the deployment target (15.1) unchanged.
import AppIntents
import Foundation

@available(iOS 16.0, *)
struct LogSpokenExpenseIntent: AppIntent {
  static var title: LocalizedStringResource = "Log an expense"
  static var description = IntentDescription(
    "Say what you spent and Murmur files it: the amount, the merchant and the category."
  )

  /// Siri runs this in the background. Nothing comes to the front, which
  /// is the whole point when the phone is in a pocket.
  static var openAppWhenRun: Bool = false

  @Parameter(
    title: "What did you spend?",
    description: "Say it the way you would to a person: five dollars at Walmart.",
    requestValueDialog: IntentDialog("What did you spend?")
  )
  var spend: String

  static var parameterSummary: some ParameterSummary {
    Summary("Log \(\.$spend) in Murmur")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let phrase = spend.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !phrase.isEmpty else {
      return .result(dialog: IntentDialog(stringLiteral: SiriCopy.nothingHeard))
    }

    let id = UUID().uuidString
    let entry: [String: Any] = [
      "id": id,
      "kind": "phrase",
      "phrase": phrase,
      // The Apple Pay fields stay present and empty: one queue, one
      // reader, and an older build of the app can still parse the line.
      "amount": "",
      "merchant": "",
      "currency": "",
      "source": "shortcut",
      "captured_at": ISO8601DateFormatter().string(from: Date()),
    ]
    try WalletCaptureQueue.append(entry)

    // 9 s: Siri tolerates a short wait and the round trip is a cold JS
    // start plus one parse call. Past it, Siri answers honestly that the
    // sentence is queued rather than claiming a save that has not
    // happened; the drain files it on the next launch or foreground.
    let outcome = await WalletCaptureCoordinator.wakeAndWait(id: id, timeout: 9)
    if let dialog = outcome.dialog, !dialog.isEmpty {
      return .result(dialog: IntentDialog(stringLiteral: dialog))
    }
    return .result(dialog: IntentDialog(stringLiteral: SiriCopy.queued))
  }
}

/// The phrases Siri knows the moment Murmur is installed, with no setup
/// in the Shortcuts app. Apple requires the app name in every one of
/// them, so "log five dollars at Walmart" alone will never reach us; the
/// name is the price of entry for every third-party app.
@available(iOS 16.0, *)
struct MurmurAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: LogSpokenExpenseIntent(),
      phrases: [
        "Log an expense in \(.applicationName)",
        "Log a purchase in \(.applicationName)",
        "Log spending in \(.applicationName)",
        "Add an expense to \(.applicationName)",
        "New expense in \(.applicationName)",
        "Track an expense in \(.applicationName)",
      ],
      shortTitle: "Log an expense",
      systemImageName: "mic.fill"
    )
  }
}

/// Siri's own lines, for the two cases JavaScript never gets to answer.
/// They are the only user-facing strings in this file, so they live here
/// rather than in a .strings file the prebuild would have to wire up; the
/// sentences the user normally hears come from the app's i18n bundle,
/// already in their language.
enum SiriCopy {
  private static var language: String {
    Locale.preferredLanguages.first?.split(separator: "-").first.map(String.init) ?? "en"
  }

  private static func pick(en: String, fr: String, es: String, pt: String) -> String {
    switch language {
    case "fr": return fr
    case "es": return es
    case "pt": return pt
    default: return en
    }
  }

  /// The sentence is on the phone but not filed yet.
  static var queued: String {
    pick(
      en: "Got it. Murmur will file it.",
      fr: "C'est noté. Murmur va l'enregistrer.",
      es: "Anotado. Murmur lo va a registrar.",
      pt: "Anotado. O Murmur vai registar."
    )
  }

  /// Siri heard nothing usable.
  static var nothingHeard: String {
    pick(
      en: "I did not catch that.",
      fr: "Je n'ai pas compris.",
      es: "No he entendido eso.",
      pt: "Não percebi."
    )
  }
}
