package expo.modules.notificationlistener

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.util.regex.Pattern

/**
 * Android NotificationListenerService that intercepts payment/transaction notifications
 * from banking and payment apps, parses the amount + merchant, and emits them to React
 * via NotificationListenerModule.
 *
 * This service is opt-in — users must explicitly grant notification access in system settings.
 * Notification content is never stored; it's parsed in memory and the structured result
 * (amount, merchant, currency) is passed to the app. Raw notification text is discarded.
 */
class MoneyNotificationListenerService : NotificationListenerService() {

  companion object {
    // Known payment/banking app package names to filter on
    // Users can still trigger the flow manually if their app is not listed
    private val PAYMENT_PACKAGES = setOf(
      "com.chase.sig.android",        // Chase
      "com.bankofamerica.android",     // Bank of America
      "com.wellsfargo.android",        // Wells Fargo
      "com.citibank.mobile",           // Citi
      "com.usbank.mobilebanking",      // US Bank
      "com.paypal.android.p2pmobile",  // PayPal
      "com.venmo",                     // Venmo
      "com.google.android.apps.walletnfcrel", // Google Pay
      "com.squareup.cash",             // Cash App
      "com.americanexpress.android.acctsvcs", // Amex
    )

    // Patterns ordered from most-specific to least-specific
    private val AMOUNT_MERCHANT_PATTERNS = listOf(
      // "charged $X.XX at Merchant" / "spent $X.XX at Merchant"
      Pattern.compile(
        """(?:charged|spent|used)\s+[$£€¥]?([\d,]+\.?\d*)\s+(?:[A-Z]{3}\s+)?at\s+(.+)""",
        Pattern.CASE_INSENSITIVE
      ),
      // "purchase of $X.XX at Merchant"
      Pattern.compile(
        """purchase\s+of\s+[$£€¥]?([\d,]+\.?\d*)\s+(?:[A-Z]{3}\s+)?at\s+(.+)""",
        Pattern.CASE_INSENSITIVE
      ),
      // "paid $X.XX to Merchant" / "payment of $X.XX to Merchant"
      Pattern.compile(
        """(?:paid|payment\s+of)\s+[$£€¥]?([\d,]+\.?\d*)\s+(?:[A-Z]{3}\s+)?(?:to\s+)?(.+)""",
        Pattern.CASE_INSENSITIVE
      ),
      // "$X.XX at Merchant" / "$X.XX charged at Merchant"
      Pattern.compile(
        """[$£€¥]([\d,]+\.?\d*)\s+(?:charged\s+)?at\s+(.+)""",
        Pattern.CASE_INSENSITIVE
      ),
      // "You spent $X.XX at Merchant"
      Pattern.compile(
        """You\s+spent\s+[$£€¥]?([\d,]+\.?\d*)\s+at\s+(.+)""",
        Pattern.CASE_INSENSITIVE
      ),
      // "transaction of $X.XX" — amount only, no merchant
      Pattern.compile(
        """(?:transaction|charge)\s+of\s+[$£€¥]?([\d,]+\.?\d*)""",
        Pattern.CASE_INSENSITIVE
      ),
    )

    // Amount-only fallback pattern
    private val AMOUNT_ONLY_PATTERN = Pattern.compile(
      """[$£€¥]([\d,]+\.?\d*)""",
      Pattern.CASE_INSENSITIVE
    )
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    super.onNotificationPosted(sbn)

    // Only process packages we know emit payment notifications
    if (sbn.packageName !in PAYMENT_PACKAGES) return

    val extras = sbn.notification.extras ?: return
    val title = extras.getString(Notification.EXTRA_TITLE) ?: ""
    val text = extras.getString(Notification.EXTRA_TEXT) ?: ""

    // Combine title + text for maximum parsing surface
    val fullText = if (title.isNotBlank()) "$title. $text" else text
    if (fullText.isBlank()) return

    val parsed = parsePaymentText(fullText) ?: return

    val payload = mapOf(
      "packageName" to sbn.packageName,
      "title" to title,
      "text" to text,
      "amount" to parsed.first,
      "currency" to detectCurrency(fullText),
      "merchant" to parsed.second,
      "timestamp" to System.currentTimeMillis(),
    )

    // Emit to React via the module — raw text is NOT included in the payload
    NotificationListenerModule.instance?.emitPaymentNotification(payload)
  }

  /**
   * Returns (amount, merchant) from the notification text, or null if no payment found.
   * Merchant may be an empty string if only the amount was detected.
   */
  private fun parsePaymentText(text: String): Pair<Double, String>? {
    for (pattern in AMOUNT_MERCHANT_PATTERNS) {
      val matcher = pattern.matcher(text)
      if (matcher.find()) {
        val rawAmount = matcher.group(1)?.replace(",", "") ?: continue
        val amount = rawAmount.toDoubleOrNull() ?: continue
        if (amount <= 0) continue
        val merchant = if (matcher.groupCount() >= 2) {
          // Clean up trailing punctuation and whitespace from merchant name
          matcher.group(2)?.trim()?.trimEnd('.', '!', ',') ?: ""
        } else ""
        return Pair(amount, merchant)
      }
    }

    // Last resort: try to extract any dollar amount
    val fallback = AMOUNT_ONLY_PATTERN.matcher(text)
    if (fallback.find()) {
      val rawAmount = fallback.group(1)?.replace(",", "") ?: return null
      val amount = rawAmount.toDoubleOrNull() ?: return null
      if (amount <= 0) return null
      return Pair(amount, "")
    }

    return null
  }

  private fun detectCurrency(text: String): String = when {
    text.contains("£") -> "GBP"
    text.contains("€") -> "EUR"
    text.contains("¥") -> "JPY"
    text.contains("CA$", ignoreCase = true) -> "CAD"
    else -> "USD"
  }
}
