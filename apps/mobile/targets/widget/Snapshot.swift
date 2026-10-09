import Foundation

/// What the app published (src/components/WidgetSync.tsx). Every string is
/// already formatted and translated by the app.
struct Snapshot: Decodable {
  struct Budget: Decodable {
    let amount: String
    let label: String
    let over: Bool
    let endsAt: String
    let freshAmount: String
    let freshLabel: String
  }
  struct Labels: Decodable {
    let spentToday: String
    let speak: String
    let type: String
  }
  let v: Int
  let tz: String
  let day: String
  let spentToday: String
  let zero: String
  let budget: Budget?
  let labels: Labels

  static let appGroup = "group.com.voiceexpense.app"
  static let key = "murmur.widget.snapshot"

  static func load() -> Snapshot? {
    guard let json = UserDefaults(suiteName: appGroup)?.string(forKey: key),
          let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(Snapshot.self, from: data)
  }

  var timeZone: TimeZone { TimeZone(identifier: tz) ?? .current }

  /// "2026-10-08" for `date` in the profile's time zone.
  func civilDay(_ date: Date) -> String {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = timeZone
    let c = cal.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
  }

  /// Next local midnight after `date`, when "spent today" resets.
  func nextMidnight(after date: Date) -> Date {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = timeZone
    let start = cal.startOfDay(for: date)
    return cal.date(byAdding: .day, value: 1, to: start) ?? date.addingTimeInterval(86_400)
  }

  var budgetEnd: Date? {
    guard let budget else { return nil }
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f.date(from: budget.endsAt) ?? ISO8601DateFormatter().date(from: budget.endsAt)
  }

  /// The figures as they read at `date`: a new day spends nothing yet, and a
  /// new budget period starts full.
  func view(at date: Date) -> (spent: String, budgetAmount: String?, budgetLabel: String?, over: Bool) {
    let spent = civilDay(date) == day ? spentToday : zero
    guard let budget else { return (spent, nil, nil, false) }
    if let end = budgetEnd, date >= end {
      return (spent, budget.freshAmount, budget.freshLabel, false)
    }
    return (spent, budget.amount, budget.label, budget.over)
  }
}
