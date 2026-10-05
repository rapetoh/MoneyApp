import SwiftUI

/// One screen, two buttons. Tapping opens the system text input, where
/// dictation is the default on the watch, then the sentence goes to the
/// iPhone and the screen shows what was saved.
struct ContentView: View {
  @ObservedObject private var link = PhoneLink.shared
  @State private var status: String?
  @State private var busy = false

  var body: some View {
    ScrollView {
      VStack(spacing: 10) {
        Image(systemName: "waveform")
          .font(.system(size: 28, weight: .semibold))
          .foregroundStyle(.tint)
          .padding(.top, 4)

        CaptureButton(title: WatchCopy.logExpense, systemImage: "mic.fill", hint: "expense", busy: $busy, status: $status)
        CaptureButton(title: WatchCopy.logIncome, systemImage: "arrow.down.circle", hint: "income", busy: $busy, status: $status)

        if busy {
          ProgressView().padding(.top, 4)
        } else if let status = status ?? link.lastStatus {
          Text(status)
            .font(.footnote)
            .multilineTextAlignment(.center)
            .foregroundStyle(.secondary)
            .padding(.top, 4)
        }
      }
      .padding(.horizontal, 4)
    }
  }
}

private struct CaptureButton: View {
  let title: String
  let systemImage: String
  let hint: String
  @Binding var busy: Bool
  @Binding var status: String?
  @State private var text = ""

  var body: some View {
    // A TextField styled as a button: on watchOS, tapping a text field
    // opens the system input sheet, with dictation and Scribble.
    TextField(text: $text) {
      Label(title, systemImage: systemImage)
    }
    .textFieldStyle(.automatic)
    .disabled(busy)
    .onSubmit {
      let phrase = text
      text = ""
      guard !phrase.trimmingCharacters(in: .whitespaces).isEmpty else { return }
      busy = true
      status = nil
      Task {
        let result = await PhoneLink.shared.send(phrase: phrase, hint: hint)
        await MainActor.run {
          busy = false
          status = result
        }
      }
    }
  }
}
