import SwiftUI
import WidgetKit

// Taps land on the app's record bridge (app/(tabs)/record.tsx): bare opens
// the voice overlay over Today, `tab=manual` opens Quick entry.
private let speakURL = URL(string: "voiceexpense://record")!
private let typeURL = URL(string: "voiceexpense://record?tab=manual")!

private let sage = Color(red: 0x3F / 255, green: 0x5A / 255, blue: 0x3E / 255)
private let sageDark = Color(red: 0x9C / 255, green: 0xB8 / 255, blue: 0x98 / 255)
private let overRed = Color(red: 0xB4 / 255, green: 0x3C / 255, blue: 0x2E / 255)

struct MurmurEntry: TimelineEntry {
  let date: Date
  let snapshot: Snapshot?
}

struct MurmurProvider: TimelineProvider {
  func placeholder(in context: Context) -> MurmurEntry { MurmurEntry(date: Date(), snapshot: nil) }

  func getSnapshot(in context: Context, completion: @escaping (MurmurEntry) -> Void) {
    completion(MurmurEntry(date: Date(), snapshot: Snapshot.load()))
  }

  // The app reloads the timeline whenever its figures change; on its own
  // the widget only has to turn the day over at midnight and start a new
  // budget period when the current one ends.
  func getTimeline(in context: Context, completion: @escaping (Timeline<MurmurEntry>) -> Void) {
    let now = Date()
    let snap = Snapshot.load()
    var dates = [now]
    if let snap {
      let midnight = snap.nextMidnight(after: now)
      dates.append(midnight)
      if let end = snap.budgetEnd, end > now, end < midnight.addingTimeInterval(86_400) { dates.append(end) }
      let entries = dates.sorted().map { MurmurEntry(date: $0, snapshot: snap) }
      completion(Timeline(entries: entries, policy: .after(snap.nextMidnight(after: midnight))))
    } else {
      completion(Timeline(entries: [MurmurEntry(date: now, snapshot: nil)], policy: .never))
    }
  }
}

// MARK: Home screen

struct MicBadge: View {
  @Environment(\.colorScheme) private var scheme
  var size: CGFloat = 38
  var body: some View {
    ZStack {
      Circle().fill(scheme == .dark ? sageDark : sage)
      Image(systemName: "mic.fill")
        .font(.system(size: size * 0.42, weight: .semibold))
        .foregroundStyle(scheme == .dark ? Color.black : Color.white)
    }
    .frame(width: size, height: size)
  }
}

struct Figures: View {
  @Environment(\.colorScheme) private var scheme
  let entry: MurmurEntry
  var body: some View {
    if let snap = entry.snapshot {
      let v = snap.view(at: entry.date)
      VStack(alignment: .leading, spacing: 2) {
        Text(snap.labels.spentToday)
          .font(.system(size: 12, weight: .medium))
          .foregroundStyle(.secondary)
        Text(v.spent)
          .font(.system(size: 26, weight: .semibold, design: .rounded))
          .monospacedDigit()
          .lineLimit(1)
          .minimumScaleFactor(0.5)
        if let amount = v.budgetAmount, let label = v.budgetLabel {
          (Text(amount).fontWeight(.semibold).foregroundColor(v.over ? overRed : (scheme == .dark ? sageDark : sage))
            + Text(" " + label).foregroundColor(.secondary))
            .font(.system(size: 12))
            .lineLimit(2)
            .minimumScaleFactor(0.8)
            .padding(.top, 2)
        }
      }
    } else {
      Text(WidgetCopy.openToStart)
        .font(.system(size: 15, weight: .semibold))
        .lineLimit(3)
    }
  }
}

struct SmallView: View {
  let entry: MurmurEntry
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Figures(entry: entry)
      Spacer(minLength: 4)
      HStack {
        Spacer()
        MicBadge()
      }
    }
    .widgetURL(speakURL)
  }
}

struct ActionButton: View {
  @Environment(\.colorScheme) private var scheme
  let url: URL
  let title: String
  let icon: String
  let primary: Bool
  var body: some View {
    Link(destination: url) {
      HStack(spacing: 6) {
        Image(systemName: icon).font(.system(size: 14, weight: .semibold))
        Text(title).font(.system(size: 14, weight: .semibold)).lineLimit(1)
      }
      .frame(maxWidth: .infinity, minHeight: 40)
      .foregroundStyle(primary ? (scheme == .dark ? Color.black : Color.white) : (scheme == .dark ? sageDark : sage))
      .background(
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .fill(primary ? (scheme == .dark ? sageDark : sage) : (scheme == .dark ? sageDark : sage).opacity(0.14))
      )
    }
  }
}

struct MediumView: View {
  let entry: MurmurEntry
  var body: some View {
    HStack(alignment: .center, spacing: 14) {
      Figures(entry: entry)
        .frame(maxWidth: .infinity, alignment: .leading)
      VStack(spacing: 8) {
        ActionButton(url: speakURL, title: entry.snapshot?.labels.speak ?? WidgetCopy.speak, icon: "mic.fill", primary: true)
        ActionButton(url: typeURL, title: entry.snapshot?.labels.type ?? WidgetCopy.type, icon: "keyboard", primary: false)
      }
      .frame(width: 118)
    }
    .widgetURL(speakURL)
  }
}

struct HomeView: View {
  @Environment(\.widgetFamily) private var family
  let entry: MurmurEntry
  var body: some View {
    Group {
      if family == .systemMedium { MediumView(entry: entry) } else { SmallView(entry: entry) }
    }
    .containerBackground(for: .widget) { Color("surface") }
  }
}

struct MurmurHomeWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "MurmurHome", provider: MurmurProvider()) { entry in
      HomeView(entry: entry)
    }
    .configurationDisplayName(WidgetCopy.name)
    .description(WidgetCopy.description)
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

// MARK: Lock screen

struct LockView: View {
  @Environment(\.widgetFamily) private var family
  let entry: MurmurEntry
  var body: some View {
    Group {
      switch family {
      case .accessoryCircular:
        ZStack {
          AccessoryWidgetBackground()
          Image(systemName: "mic.fill").font(.system(size: 20, weight: .semibold))
        }
        .widgetAccentable()
      case .accessoryInline:
        if let snap = entry.snapshot {
          Label("\(snap.view(at: entry.date).spent) \(snap.labels.spentToday.lowercased())", systemImage: "mic.fill")
        } else {
          Label(WidgetCopy.lockName, systemImage: "mic.fill")
        }
      default:
        HStack(spacing: 8) {
          VStack(alignment: .leading, spacing: 0) {
            if let snap = entry.snapshot {
              let v = snap.view(at: entry.date)
              Text(snap.labels.spentToday).font(.system(size: 12)).foregroundStyle(.secondary)
              Text(v.spent).font(.system(size: 17, weight: .semibold, design: .rounded)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
              if let amount = v.budgetAmount, let label = v.budgetLabel {
                Text("\(amount) \(label)").font(.system(size: 12)).lineLimit(1).minimumScaleFactor(0.7)
              }
            } else {
              Text(WidgetCopy.lockName).font(.system(size: 14, weight: .semibold)).lineLimit(2)
            }
          }
          Spacer(minLength: 0)
          Image(systemName: "mic.fill").font(.system(size: 16, weight: .semibold)).widgetAccentable()
        }
      }
    }
    .widgetURL(speakURL)
    .containerBackground(for: .widget) { Color.clear }
  }
}

struct MurmurLockWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "MurmurLock", provider: MurmurProvider()) { entry in
      LockView(entry: entry)
    }
    .configurationDisplayName(WidgetCopy.lockName)
    .description(WidgetCopy.lockDescription)
    .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
  }
}

@main
struct MurmurWidgetBundle: WidgetBundle {
  var body: some Widget {
    MurmurHomeWidget()
    MurmurLockWidget()
  }
}
