import type { Metadata } from 'next'
import { LegalPage } from '../../components/LegalPage'

export const metadata: Metadata = {
  title: 'Privacy Policy · Murmur',
  description:
    'How Murmur handles your data: what we collect, what we never do, who processes it, and your rights.',
}

// Public (no auth). Linked from the iOS paywall (App Store 3.1.2), the
// App Store listing, and Settings. Keep in step with the in-app Privacy
// screen (apps/mobile/app/more/privacy.tsx) and packages/shared/src/brand
// .ts — the subprocessor table below is the list of everyone the product
// actually talks to; add a row the day a new integration ships.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="August 16, 2026">
      <div className="summary">
        <p style={{ fontWeight: 600 }}>The short version</p>
        <ul>
          <li>
            Murmur never connects to your bank. Everything in it is something you chose to enter.
          </li>
          <li>Your voice is transcribed on your device. Audio never leaves your phone.</li>
          <li>
            We don&apos;t sell your data, we don&apos;t show ads, and we don&apos;t run analytics or
            crash trackers today.
          </li>
          <li>
            You can export or permanently delete everything, yourself, from Settings, no email
            required.
          </li>
        </ul>
      </div>

      <h2>Who we are</h2>
      <p>
        Murmur (&quot;Murmur&quot;, &quot;we&quot;, &quot;us&quot;) is the voice-first expense
        tracker published under the developer name shown on its App Store listing. This policy
        explains what we collect when you use the Murmur iPhone app, the desktop app and the web
        dashboard (together, the &quot;Service&quot;), why, and what control you have.
      </p>

      <h2>What we collect</h2>
      <h3>Account</h3>
      <p>
        Your email address, a display name if you set one, and which sign-in method you use (email,
        Apple or Google). Sign in with Apple can hide your real email; we work with the relay
        address Apple gives us.
      </p>
      <h3>What you record</h3>
      <p>
        The expenses and income you enter: amount, currency, merchant, category, date, payment
        method, an optional note, and, for recurring items, the rule that generates them. Budgets
        and your monthly income if you set them. Preferences such as language, currency and time
        zone.
      </p>
      <h3>Voice</h3>
      <p>
        Speech is turned into text <strong>on your device</strong> using Apple&apos;s speech
        recognition (or the Android equivalent). Only the resulting text is sent to our server to be
        interpreted into an expense; the audio never leaves your phone.
      </p>
      <h3>Receipts and paychecks you scan</h3>
      <p>
        If you photograph a receipt or a paycheck, the image is sent to our AI provider to extract
        the amounts and merchant, then discarded by us, we store the extracted transaction, not the
        image.
      </p>
      <h3>Ask Murmur</h3>
      <p>
        When you ask Murmur a question, your question and a summary of the relevant transactions are
        sent to our AI provider to compose the answer. Conversations are stored in your account so
        you can pick them up later, and you can delete them.
      </p>
      <h3>Devices and sync</h3>
      <p>
        The name and platform of each device you sign in on, and when it last synced, so you can see
        and manage them in Settings.
      </p>
      <h3>Subscription</h3>
      <p>
        If you subscribe to Murmur Plus, Apple processes the payment, we never see your card
        details. We receive a confirmation of your subscription status (plan, renewal date, trial
        state) so we can unlock Plus on all your devices.
      </p>

      <h2>What we don&apos;t do</h2>
      <ul>
        <li>No bank or card linking, ever. Murmur has no access to your accounts.</li>
        <li>No selling, renting or sharing of your data for advertising.</li>
        <li>No advertising in the product.</li>
        <li>
          No usage analytics or crash reporting is collected today. If that changes, it will be
          opt-in and this policy will say so first.
        </li>
      </ul>

      <h2>Who processes data on our behalf</h2>
      <p>
        We use a small number of providers to run the Service. Each receives only what it needs.
      </p>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>What for</th>
            <th>What they receive</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Supabase</td>
            <td>Database, authentication, sync (hosted in the United States)</td>
            <td>Your account and everything you record</td>
          </tr>
          <tr>
            <td>Vercel</td>
            <td>Hosting for the web dashboard and our API</td>
            <td>Requests you make to the Service</td>
          </tr>
          <tr>
            <td>OpenAI</td>
            <td>Interpreting spoken entries, reading receipts, answering Ask Murmur</td>
            <td>
              The text of what you said, scanned images, and the question plus transaction summary
              you ask about, never your name or email
            </td>
          </tr>
          <tr>
            <td>Apple</td>
            <td>Sign in with Apple, on-device speech recognition, App Store subscriptions</td>
            <td>
              What Apple already holds as your platform provider; payment details stay with Apple
            </td>
          </tr>
          <tr>
            <td>RevenueCat</td>
            <td>Subscription management</td>
            <td>Your account identifier and Apple&apos;s subscription receipt</td>
          </tr>
          <tr>
            <td>Google</td>
            <td>Sign in with Google (if you choose it); merchant logos</td>
            <td>
              Sign-in only if used; for logos, the merchant name alone (disclosed in the app under
              Settings → Privacy)
            </td>
          </tr>
          <tr>
            <td>Frankfurter (ECB rates)</td>
            <td>Currency conversion for entries in another currency</td>
            <td>Currency pair and date only, nothing about you</td>
          </tr>
        </tbody>
      </table>

      <h2>How long we keep it</h2>
      <p>
        For as long as your account exists. Deleting your account (Settings → Privacy → Delete
        everything) permanently removes your transactions, budgets, categories, recurring rules,
        conversations, devices, profile and sign-in record; database backups are purged on their
        rolling schedule shortly after. You can export everything at any time as CSV, JSON or PDF.
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit and at rest. Every table is protected by row-level security
        tied to your account, so the database itself refuses to hand one person&apos;s rows to
        another. Your Plus entitlement is written only by our server from the store&apos;s receipt.
      </p>

      <h2>Your rights</h2>
      <p>
        Wherever you live, you can access, correct, export and delete your data from within the app.
        If you are in the EU/EEA, UK, Switzerland, Brazil, California or another jurisdiction with
        data-protection rights, the same tools serve those rights; you may also contact us (below)
        and, if unresolved, your local supervisory authority. We process your data because you asked
        us to run the Service for you (performance of a contract) and, for security and abuse
        prevention, on our legitimate interests.
      </p>

      <h2>Children</h2>
      <p>
        Murmur is not directed to children under 13 (16 where that is the local age of consent), and
        we do not knowingly collect their data.
      </p>

      <h2>Changes</h2>
      <p>
        When this policy changes in a way that matters, we&apos;ll say so in the app before it takes
        effect and update the date at the top.
      </p>

      <h2>Contact</h2>
      <p>See the footer of this page for how to reach us about privacy.</p>
    </LegalPage>
  )
}
