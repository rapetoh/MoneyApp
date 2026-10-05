import Foundation

/// The watch's own lines. The line the user normally hears after a save
/// ("Saved. $5.00 at Walmart.") comes from the iPhone, already in their
/// language; these cover only the cases where the iPhone could not answer.
enum WatchCopy {
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

  static var logExpense: String { pick(en: "Log an expense", fr: "Noter une dépense", es: "Anotar un gasto", pt: "Registar despesa") }
  static var logIncome: String { pick(en: "Log income", fr: "Noter un revenu", es: "Anotar un ingreso", pt: "Registar receita") }

  /// Delivered to the iPhone, which did not answer in time.
  static var queued: String {
    pick(en: "Got it. Murmur will file it.", fr: "C'est noté. Murmur va l'enregistrer.", es: "Anotado. Murmur lo va a registrar.", pt: "Anotado. O Murmur vai registar.")
  }

  /// iPhone out of reach: queued by the system until it is back.
  static var queuedForLater: String {
    pick(
      en: "Got it. Murmur will file it when your iPhone is nearby.",
      fr: "C'est noté. Murmur l'enregistrera quand votre iPhone sera à proximité.",
      es: "Anotado. Murmur lo registrará cuando tu iPhone esté cerca.",
      pt: "Anotado. O Murmur vai registar quando o iPhone estiver por perto."
    )
  }

  static var noPhone: String {
    pick(
      en: "Murmur needs your iPhone. Open Murmur on it once, then try again.",
      fr: "Murmur a besoin de votre iPhone. Ouvrez Murmur dessus une fois, puis réessayez.",
      es: "Murmur necesita tu iPhone. Abre Murmur en él una vez y vuelve a intentarlo.",
      pt: "O Murmur precisa do seu iPhone. Abra o Murmur nele uma vez e tente de novo."
    )
  }

  static var nothingHeard: String {
    pick(en: "I did not catch that.", fr: "Je n'ai pas compris.", es: "No he entendido eso.", pt: "Não percebi.")
  }
}
