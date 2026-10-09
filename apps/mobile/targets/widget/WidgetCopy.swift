import Foundation

/// Gallery and signed-out lines. Everything else arrives translated in the
/// app's snapshot.
enum WidgetCopy {
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

  static var name: String { "Murmur" }
  static var description: String {
    pick(
      en: "Spent today, your budget, and one tap to log an expense.",
      fr: "Dépensé aujourd'hui, votre budget, et un geste pour noter une dépense.",
      es: "Lo gastado hoy, tu presupuesto y un toque para anotar un gasto.",
      pt: "Gasto hoje, o seu orçamento e um toque para registar uma despesa."
    )
  }
  static var lockName: String { pick(en: "Log an expense", fr: "Noter une dépense", es: "Anotar un gasto", pt: "Registar despesa") }
  static var lockDescription: String {
    pick(
      en: "Tap to open Murmur already listening.",
      fr: "Touchez pour ouvrir Murmur, déjà à l'écoute.",
      es: "Toca para abrir Murmur ya escuchando.",
      pt: "Toque para abrir o Murmur já a ouvir."
    )
  }
  static var openToStart: String {
    pick(en: "Open Murmur to start", fr: "Ouvrez Murmur pour commencer", es: "Abre Murmur para empezar", pt: "Abra o Murmur para começar")
  }
  static var speak: String { pick(en: "Speak", fr: "Parler", es: "Hablar", pt: "Falar") }
  static var type: String { pick(en: "Type", fr: "Écrire", es: "Escribir", pt: "Escrever") }
}
