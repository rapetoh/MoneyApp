import type { Metadata } from 'next'
import { LegalPage } from '../../components/LegalPage'

export const metadata: Metadata = {
  title: 'Terms of Use · Murmur',
  description: 'The terms under which Murmur and the Murmur Plus subscription are provided.',
}

// Public (no auth). Linked from the iOS paywall (App Store 3.1.2) and the
// App Store listing. The subscription section must keep describing what
// the store actually sells: auto-renewable, trial once per Apple ID,
// managed and refunded through Apple. Prices are deliberately not
// written here — the store shows them.
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated="August 16, 2026">
      <p>
        These terms govern your use of Murmur, the iPhone app, the desktop app and the web
        dashboard (the &quot;Service&quot;), provided by the developer named on Murmur&apos;s App
        Store listing (&quot;Murmur&quot;, &quot;we&quot;, &quot;us&quot;). By creating an account
        or using the Service you agree to them. If you don&apos;t agree, please don&apos;t use
        Murmur.
      </p>

      <h2>1. What Murmur is</h2>
      <p>
        Murmur is a personal expense tracker. You record your own spending and income, by voice, by
        scanning a receipt or by typing, and Murmur organises, forecasts and reports on it. Murmur
        does not connect to banks or cards, does not move money, and is not a financial institution.
      </p>

      <h2>2. Not financial advice</h2>
      <p>
        Insights, forecasts, budgets and Ask Murmur answers are generated from the data you entered,
        partly by automated and AI systems, and are provided for information only. They can be
        incomplete or wrong. They are not financial, tax, legal or investment advice, and you should
        not rely on them as such. Check anything that matters against your own records.
      </p>

      <h2>3. Your account</h2>
      <p>
        You need an account to use Murmur. Keep your sign-in secure and tell us if you think it has
        been compromised. You are responsible for what happens under your account. You must be at
        least 13 (or the age of digital consent where you live) to use Murmur.
      </p>

      <h2>4. Murmur Plus subscription</h2>
      <p>
        Some features. Ask Murmur, automatic recurring detection, export, and the desktop and web
        dashboard, are part of <strong>Murmur Plus</strong>, an auto-renewable subscription
        purchased through the App Store on iPhone. Your account then unlocks Plus on every platform
        you sign in to.
      </p>
      <ul>
        <li>
          <strong>Plans and price.</strong> Monthly or yearly plans. The exact price for your
          country and currency is shown in the app before you subscribe and on your App Store
          receipt.
        </li>
        <li>
          <strong>Free trial.</strong> New subscribers may be offered a free trial; its length is
          shown before you start it. Apple allows one introductory offer per Apple ID for Murmur
          Plus. If you don&apos;t cancel at least 24 hours before the trial ends, your chosen plan
          starts and is charged to your Apple ID.
        </li>
        <li>
          <strong>Renewal.</strong> Subscriptions renew automatically at the same price and period
          unless auto-renew is turned off at least 24 hours before the end of the current period.
          Payment is charged to your Apple ID at confirmation and at each renewal.
        </li>
        <li>
          <strong>Managing and cancelling.</strong> Manage or cancel any time in your Apple ID
          settings (Settings → your name → Subscriptions on iPhone). Cancelling stops future
          renewals; you keep Plus until the end of the period you paid for.
        </li>
        <li>
          <strong>Refunds.</strong> Purchases are handled by Apple, and refunds are governed by
          Apple&apos;s policies; request one from Apple at reportaproblem.apple.com. We can&apos;t
          issue App Store refunds ourselves.
        </li>
        <li>
          <strong>Restore.</strong> If you reinstall or change phones, use &quot;Restore
          purchases&quot; on the Plus screen with the same Apple ID.
        </li>
        <li>
          <strong>Changes.</strong> We may change plans or prices for future periods; existing
          subscribers are notified through Apple and can cancel before a change applies.
        </li>
      </ul>
      <p>
        Where you obtained Murmur from the App Store, Apple&apos;s{' '}
        <a
          href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
          target="_blank"
          rel="noreferrer"
        >
          Licensed Application End User License Agreement
        </a>{' '}
        also applies, and prevails where it conflicts with this section.
      </p>

      <h2>5. Your data</h2>
      <p>
        You own what you record. Our <a href="/privacy">Privacy Policy</a> explains what we collect
        and how it is handled. You can export or permanently delete your data from Settings at any
        time. If you delete your account, your data is gone, including any active Plus benefits
        tied to it.
      </p>

      <h2>6. Acceptable use</h2>
      <p>
        Don&apos;t misuse the Service: no attempts to access other people&apos;s data, disrupt or
        overload the Service, reverse-engineer it beyond what the law allows, use it for anything
        unlawful, or use Ask Murmur to generate content that is abusive, deceptive or infringing. We
        may suspend accounts that do.
      </p>

      <h2>7. Intellectual property</h2>
      <p>
        Murmur, its name, mark, design and software are ours or our licensors&apos;. We grant you a
        personal, non-transferable licence to use the apps for your own expense tracking. Nothing
        here transfers ownership of the Service to you, and nothing transfers ownership of your data
        to us.
      </p>

      <h2>8. Availability and changes</h2>
      <p>
        We work hard to keep Murmur available, but it is provided &quot;as is&quot; and &quot;as
        available&quot;. We may change, add or remove features, and we may discontinue the Service
        with reasonable notice, in which case you will be able to export your data first.
      </p>

      <h2>9. Disclaimers and limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, we disclaim all warranties, express or implied,
        including merchantability, fitness for a particular purpose and non-infringement, and we are
        not liable for indirect, incidental, special, consequential or punitive damages, or for lost
        profits, revenue, data or goodwill, arising from your use of the Service. Our total
        liability for any claim relating to the Service is limited to the amount you paid us for
        Murmur Plus in the twelve months before the claim, or if you paid nothing, to $50. Some
        jurisdictions don&apos;t allow some of these limits; where that applies, they apply only to
        the extent permitted.
      </p>

      <h2>10. Termination</h2>
      <p>
        You can stop using Murmur and delete your account at any time. We may suspend or terminate
        accounts that breach these terms. Sections 2, 5, 7, 9 and 11 survive termination.
      </p>

      <h2>11. Governing law and disputes</h2>
      <p>
        These terms are governed by the laws of the jurisdiction in which the developer is
        established, without regard to conflict-of-law rules, and disputes will be brought in the
        courts there, except that consumers keep any non-waivable protections and forum rights of
        the country in which they live.
      </p>

      <h2>12. Changes to these terms</h2>
      <p>
        We may update these terms. If a change is material, we&apos;ll tell you in the app before it
        takes effect. Continuing to use Murmur after that means you accept the updated terms.
      </p>

      <h2>13. Contact</h2>
      <p>See the footer of this page for how to reach us.</p>
    </LegalPage>
  )
}
