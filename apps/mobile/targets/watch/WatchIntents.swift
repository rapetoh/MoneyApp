import AppIntents

/// "Hey Siri, log an expense in Murmur" on the wrist. Same two turns as on
/// the iPhone (an App Shortcut phrase cannot carry free text), same phrases,
/// and the sentence goes to the iPhone, which answers with what it saved.
struct LogExpenseOnWatchIntent: AppIntent {
  static var title: LocalizedStringResource = "Log an expense"
  static var description = IntentDescription("Say what you spent and Murmur files it.")
  static var openAppWhenRun: Bool = false

  @Parameter(title: "What did you spend?", requestValueDialog: IntentDialog("What did you spend?"))
  var spend: String

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let line = await PhoneLink.shared.send(phrase: spend, hint: "expense")
    return .result(dialog: IntentDialog(stringLiteral: line))
  }
}

struct LogIncomeOnWatchIntent: AppIntent {
  static var title: LocalizedStringResource = "Log income"
  static var description = IntentDescription("Say what came in and Murmur files it.")
  static var openAppWhenRun: Bool = false

  @Parameter(title: "What came in?", requestValueDialog: IntentDialog("What came in?"))
  var received: String

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let line = await PhoneLink.shared.send(phrase: received, hint: "income")
    return .result(dialog: IntentDialog(stringLiteral: line))
  }
}

/// Keep these identical to the iPhone's list (native/ios/SiriLogExpense.swift)
/// so a sentence that works on the phone works on the wrist.
struct MurmurWatchShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: LogExpenseOnWatchIntent(),
      phrases: [
        "Log an expense in \(.applicationName)",
        "Log a purchase in \(.applicationName)",
        "Log spending in \(.applicationName)",
        "Add an expense to \(.applicationName)",
        "Add an expense in \(.applicationName)",
        "New expense in \(.applicationName)",
        "Track an expense in \(.applicationName)",
        "Record an expense in \(.applicationName)",
        "Note an expense in \(.applicationName)",
        "Start an expense in \(.applicationName)",
        "\(.applicationName) expense",
        "\(.applicationName) log an expense",
      ],
      shortTitle: "Log an expense",
      systemImageName: "mic.fill"
    )
    AppShortcut(
      intent: LogIncomeOnWatchIntent(),
      phrases: [
        "Log income in \(.applicationName)",
        "Log a payment in \(.applicationName)",
        "Add income to \(.applicationName)",
        "Record income in \(.applicationName)",
        "New income in \(.applicationName)",
        "Log a deposit in \(.applicationName)",
        "\(.applicationName) income",
        "\(.applicationName) log income",
      ],
      shortTitle: "Log income",
      systemImageName: "arrow.down.circle"
    )
  }
}
