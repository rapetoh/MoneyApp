import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '../lib/supabase/server'
import { MurmurMark } from '../components/MurmurMark'
import { HeroDownloads } from '../components/HeroDownloads'
import { colors, font } from '../lib/theme'
import { SUPPORT_EMAIL } from '@voice-expense/shared'

const SITE = 'https://itsmurmur.com'

// Every share of this link used to render as a bare URL. The card is the
// site's own hero at 1200x630, rebuilt by `npm run assets` (see
// scripts/build-site-assets.mjs), so the preview and the page cannot drift
// apart: change the hero, re-run it, and the card follows.
const OG_ALT = 'Murmur: speak your spending. The Today screen with an Apple Pay purchase capturing itself.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: 'Murmur, the voice-first expense tracker',
  description:
    'Say what you spent and Murmur files it. Apple Pay purchases capture themselves. Free forever, with two weeks of Plus to start. No bank linking, ever.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: SITE,
    siteName: 'Murmur',
    title: 'Murmur, the voice-first expense tracker',
    description:
      'Say it once and it is filed. Apple Pay captures itself. Free forever, two weeks of Plus to start, no bank linking.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: OG_ALT }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Murmur, the voice-first expense tracker',
    description: 'Say it once and it is filed. Free forever, no bank linking.',
    images: [{ url: '/og.png', alt: OG_ALT }],
  },
}

/**
 * What a visitor asks before downloading, answered on the page rather than
 * in a support thread. Also emitted as FAQPage structured data: Google and
 * the AI answer engines quote structured facts far more reliably than
 * prose, and this is the cheapest organic reach a one-person app can buy.
 */
const FAQ: { q: string; a: string }[] = [
  {
    q: 'Is Murmur free?',
    a: 'Yes. Logging expenses by voice, by hand or from a receipt is free forever, with no limit and no ads. Every new account also starts with 14 days of Murmur Plus, with no card, and keeps the free app afterwards.',
  },
  {
    q: 'What does Murmur Plus add?',
    a: 'Ask Murmur, the assistant that answers questions about your own numbers; the desktop and web app; automatic detection of recurring bills and subscriptions; your full history with trends and a forecast; and CSV or PDF reports. It is $4.99 a month or $29.99 a year, and it can be shared with up to five family members.',
  },
  {
    q: 'Do I have to connect my bank?',
    a: 'No, and you cannot. Murmur has no bank integration at all. Everything in it is something you said, typed, scanned or captured from Apple Pay on your own phone.',
  },
  {
    q: 'Does it work in my language and currency?',
    a: 'Murmur speaks English, French, Spanish and Portuguese, and picks your language, currency and speech recognition from your phone when you first sign in. Amounts are shown in your own currency, including CFA francs, naira and cedi.',
  },
  {
    q: 'How does Apple Pay capture work?',
    a: 'You set up one Shortcuts automation, which Murmur walks you through. After that, every purchase you make with your iPhone wallet logs itself with the amount, the merchant and a category, and a quiet notification lets you correct it in one tap.',
  },
  {
    q: 'What happens to my voice?',
    a: 'Your speech is turned into text on your phone whenever the device supports it, and the audio is never stored, by us or anyone else. Only the resulting text is used to file the expense.',
  },
  {
    q: 'Can I get my data out, or delete everything?',
    a: 'Any time, yourself, from Settings. Export gives you a complete file of your own data, and deleting your account removes everything from our servers for good. No email to support required.',
  },
  {
    q: 'Does it work offline?',
    a: 'Yes. Expenses are saved on the phone first and sync when you are back online, so a tunnel or a bad signal never costs you an entry.',
  },
]

/**
 * Public landing page at itsmurmur.com. Rebuilt Aug 28, 2026 after the
 * owner reviewed the first version against current top-tier marketing
 * sites (layered display typography, product-in-situ mockups, marquee
 * strips, editorial bento grids) and asked for that level in Murmur's
 * own skin: cream canvas, sage accent, serif money, Coin & Wave mark.
 *
 * Constraints honoured:
 * - CSP: no external assets except t0.gstatic.com favicons (already
 *   allow-listed for merchant logos), so every visual is CSS/SVG or a
 *   favicon. No JS libraries; motion is pure CSS with a
 *   prefers-reduced-motion off-switch.
 * - Honesty: no invented user counts or ratings. The stats band states
 *   facts about the product. No dead download links: every destination
 *   here is live, the App Store listing included.
 * - Signed-in users still go straight to their dashboard via the nav
 *   button; the page itself renders for everyone.
 */

// Desktop downloads (signed + notarized, published Aug 29, 2026). The
// release script keeps these in step with the latest version.
// Live on the App Store since Sep 11, 2026. The short id form is the
// canonical link: Apple resolves it to the localised store page, so it
// cannot rot if the listing title ever changes.
const APP_STORE_URL = 'https://apps.apple.com/app/id6799316747'
// GitHub's /releases/latest/download/ path takes an exact file name, and
// electron-builder stamps the version into it, so this constant has to move
// with every desktop release or all three buttons 404. It is one edit, and
// the desktop release runbook (docs/payments.md) names it.
const DESKTOP_VERSION = '1.0.0'
const REL = 'https://github.com/rapetoh/murmur-releases/releases/latest/download/'
const MAC_DMG_ARM = `${REL}Murmur-${DESKTOP_VERSION}-arm64.dmg`
const MAC_DMG_INTEL = `${REL}Murmur-${DESKTOP_VERSION}.dmg`
const WIN_EXE = `${REL}Murmur-Setup-${DESKTOP_VERSION}.exe`

const lpSerif = 'var(--font-fraunces), "New York", "Iowan Old Style", Georgia, serif'

const logo = (domain: string) =>
  'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://' +
  domain +
  '&size=128'

const HERO_ROWS = [
  {
    d: 'starbucks.com',
    name: 'Starbucks',
    cat: 'Food & Dining',
    amt: '-$6.40',
    tint: '#FDEBDD',
    fg: '#B4531F',
  },
  {
    d: 'target.com',
    name: 'Target',
    cat: 'Shopping',
    amt: '-$24.99',
    tint: '#EFE4F4',
    fg: '#6C3D86',
  },
  {
    d: 'shell.com',
    name: 'Shell',
    cat: 'Transport',
    amt: '-$38.20',
    tint: '#E2EAF5',
    fg: '#2F5591',
  },
  {
    d: 'netflix.com',
    name: 'Netflix',
    cat: 'Subscriptions',
    amt: '-$15.49',
    tint: '#FBF0D9',
    fg: '#8A6410',
  },
]

const MARQUEE = [
  'starbucks.com',
  'target.com',
  'netflix.com',
  'uber.com',
  'walmart.com',
  'chick-fil-a.com',
  'shell.com',
  'walgreens.com',
  'amazon.com',
  'spotify.com',
  'chipotle.com',
  'delta.com',
  'costco.com',
  'dunkindonuts.com',
  'airbnb.com',
  'kroger.com',
]

/**
 * The shipped App Store screenshots, resized for the web. They carry
 * their own captions, so the page shows them whole rather than
 * re-describing them underneath.
 */
const SHOTS = [
  { src: '/shots/voice.webp', alt: 'Murmur listening and writing out "Twelve forty at Starbucks for coffee" as it is spoken' },
  { src: '/shots/confirm.webp', alt: 'The confirmation card: $12.40 at Starbucks, filed under Coffee & tea, with one-tap corrections and an undo' },
  { src: '/shots/insights.webp', alt: 'Insights: $1,330.00 spent this month, 12% below March, broken down by category' },
  { src: '/shots/applepay.webp', alt: 'An Apple Pay purchase capturing itself: Starbucks, $6.40, Coffee & tea' },
  { src: '/shots/recurring.webp', alt: 'Recurring: $291.40 a month of bills and subscriptions, $3,497 a year, each with its next due date' },
  { src: '/shots/ask.webp', alt: 'Ask Murmur answering "Can I afford a trip to Lisbon?" from the user\'s own spending' },
]

export default async function RootPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const appHref = user ? '/dashboard' : '/login'

  return (
    <div className="lp" style={{ background: colors.bg, color: colors.ink, fontFamily: font.sans }}>
      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <header className="lp-nav">
        <div className="lp-shell lp-nav-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MurmurMark size={30} variant="sage" rounded />
            <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: -0.2 }}>Murmur</span>
          </div>
          <nav className="lp-nav-links">
            <a href="#how" className="lp-navlink">
              How it works
            </a>
            <a href="#features" className="lp-navlink">
              Features
            </a>
            <a href="#plus" className="lp-navlink">
              Pricing
            </a>
            <a href="#faq" className="lp-navlink">
              FAQ
            </a>
            <Link href={appHref} className="lp-navlink lp-navlink-keep">
              {user ? 'Dashboard' : 'Log in'}
            </Link>
            <a href="#get" className="lp-cta-pill">
              Get Murmur
            </a>
          </nav>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div aria-hidden className="lp-hero-word">
          murmur
        </div>
        <div aria-hidden className="lp-hero-glow" />
        <div className="lp-shell lp-hero-grid">
          <div className="lp-hero-copy">
            <div className="lp-eyebrow lp-rise" style={{ animationDelay: '.05s' }}>
              <span className="lp-eyebrow-dot" />
              Voice-first · Privacy-first
            </div>
            <h1 className="lp-h1 lp-rise" style={{ animationDelay: '.12s' }}>
              Speak your
              <br />
              <em>spending.</em>
            </h1>
            <p className="lp-sub lp-rise" style={{ animationDelay: '.2s' }}>
              One sentence and it&rsquo;s filed. Tap to pay and it captures itself. Murmur keeps
              your money story between you and your phone: no spreadsheets, no bank logins, nothing
              to maintain.
            </p>
            {/* iPhone leads now that the app is live: Murmur is a
                speak-it-and-it-is-filed tool, and the phone is where that
                happens. Mac keeps a button, just the quieter one. */}
            <div className="lp-rise" style={{ animationDelay: '.28s' }}>
              <HeroDownloads
                appStoreUrl={APP_STORE_URL}
                macUrl={MAC_DMG_ARM}
                winUrl={WIN_EXE}
                appHref={appHref}
              />
            </div>
            {/* The offer as three things a sceptic can check in a glance,
                not a paragraph they have to parse. Landing-page research
                is consistent that price, catch and risk belong above the
                fold, where the doubt is, and that scannable beats prose. */}
            <ul className="lp-proof lp-rise" style={{ animationDelay: '.34s' }}>
              {[
                ['Free forever', 'Unlimited logging, budgets, this month'],
                ['14 days of Plus', 'On every new account. No card.'],
                ['No bank linking', 'There is no integration to trust.'],
              ].map(([head, sub]) => (
                <li key={head} className="lp-proof-item">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M4 12.5 9.5 18 20 6.5" stroke="#3F5A3E" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div>
                    <strong>{head}</strong>
                    <span>{sub}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Product, in situ: hand-built phone showing Today */}
          <div className="lp-phone-stage lp-rise" style={{ animationDelay: '.25s' }}>
            <div className="lp-notif lp-float">
              <MurmurMark size={26} variant="sage" rounded />
              <div>
                <div className="lp-notif-title">Captured from Apple Pay · $4.06</div>
                <div className="lp-notif-body">
                  Three Square Market · Food &amp; Dining · just now
                </div>
              </div>
            </div>
            <div className="lp-phone-wrap">
              <div aria-hidden className="lp-branch-curves">
                <svg viewBox="0 0 190 290" width="190" height="290">
                  <g fill="none" stroke="#3F5A3E" strokeWidth="1.5" opacity="0.4">
                    <path d="M150 148 C 110 148, 140 52, 118 50" />
                    <path d="M150 148 C 110 148, 140 244, 118 246" />
                  </g>
                </svg>
              </div>
              <div aria-hidden className="lp-branch-node lp-branch-root">
                <div className="lp-branch-root-month">August</div>
                <div className="lp-branch-root-amt">$1,284</div>
              </div>
              <div aria-hidden className="lp-branch-node lp-branch-leaf lp-branch-leaf1">
                <span className="lp-branch-dot" style={{ background: '#FF6B35' }} />
                <div>
                  <div className="lp-branch-name">Food &amp; Dining</div>
                  <div className="lp-branch-sub">$412 this month</div>
                </div>
              </div>
              <div aria-hidden className="lp-branch-node lp-branch-leaf lp-branch-leaf2">
                <img
                  src={logo('starbucks.com')}
                  alt=""
                  width={20}
                  height={20}
                  style={{ borderRadius: 6 }}
                />
                <div>
                  <div className="lp-branch-name">Starbucks</div>
                  <div className="lp-branch-sub">$86 · 11 visits</div>
                </div>
              </div>
              <div className="lp-phone">
                <div className="lp-phone-notch" />
                <div className="lp-phone-head">
                  <div className="lp-phone-month">AUGUST</div>
                  <div className="lp-phone-today">Today</div>
                </div>
                <div className="lp-spent">
                  <div className="lp-spent-label">Spent today</div>
                  <div className="lp-spent-amt">
                    <span className="lp-spent-cur">$</span>85
                    <span className="lp-spent-dec">.08</span>
                  </div>
                </div>
                <div className="lp-rows">
                  {HERO_ROWS.map((r) => (
                    <div key={r.d} className="lp-row">
                      <img src={logo(r.d)} alt="" width={34} height={34} className="lp-row-logo" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="lp-row-name">{r.name}</div>
                        <span className="lp-chip" style={{ background: r.tint, color: r.fg }}>
                          {r.cat}
                        </span>
                      </div>
                      <div className="lp-row-amt">{r.amt}</div>
                    </div>
                  ))}
                </div>
                <div className="lp-mic">
                  <span className="lp-mic-ring" />
                  <span className="lp-mic-ring lp-mic-ring2" />
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <rect x="9" y="3" width="6" height="11" rx="3" fill="#FBFAF7" />
                    <path
                      d="M5 11a7 7 0 0 0 14 0M12 18v3"
                      stroke="#FBFAF7"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Marquee ─────────────────────────────────────────────────── */}
      <section className="lp-marquee-wrap" aria-label="Merchants Murmur captures automatically">
        <div className="lp-marquee-label">Purchases that filed themselves</div>
        <div className="lp-marquee">
          <div className="lp-marquee-track">
            {[...MARQUEE, ...MARQUEE, ...MARQUEE, ...MARQUEE].map((d, i) => (
              <img
                key={d + i}
                src={logo(d)}
                alt=""
                width={40}
                height={40}
                className="lp-marquee-logo"
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────── */}
      {/* The page had no explanation of the actual loop, only claims about
          it. Every app landing page that converts walks the visitor through
          input, action and result before asking for the download; three
          steps is the form that pattern takes. */}
      <section id="how" className="lp-shell lp-how">
        <div className="lp-sec-head">
          <div className="lp-kicker">How it works</div>
          <h2 className="lp-h2">Three seconds, start to filed.</h2>
        </div>
        <ol className="lp-steps">
          {[
            {
              n: '1',
              t: 'Say it',
              p: '“Twelve forty at Starbucks for coffee.” No form, no category to pick, no screen to find first. Typing and receipt photos work too.',
            },
            {
              n: '2',
              t: 'Murmur files it',
              p: 'It hears the amount, the merchant and the category, shows you the card, and saves with an undo. Tap-to-pay purchases skip even this: they file themselves.',
            },
            {
              n: '3',
              t: 'You see where it goes',
              p: 'Today, your budgets, the categories behind them and a month-end forecast, current without a spreadsheet and without a bank login.',
            },
          ].map((step) => (
            <li key={step.n} className="lp-step">
              <span className="lp-step-n">{step.n}</span>
              <h3 className="lp-step-t">{step.t}</h3>
              <p className="lp-p">{step.p}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── The app itself ─────────────────────────────────────────── */}
      {/* Real screens, shipped ones, in the order a new user meets them.
          Hand-drawn CSS mockups sell the idea; only the actual product
          sells the product. These are the App Store screenshots, so the
          site and the listing now say the same thing. */}
      <section className="lp-shots-wrap" aria-label="Screens from the Murmur app">
        <div className="lp-shell lp-sec-head">
          <div className="lp-kicker">The app itself</div>
          <h2 className="lp-h2">Not a mockup.</h2>
        </div>
        <div className="lp-shots" tabIndex={0} role="group" aria-label="App screens, scroll sideways">
          {SHOTS.map((shot) => (
            <img
              key={shot.src}
              src={shot.src}
              alt={shot.alt}
              width={560}
              height={1211}
              loading="lazy"
              decoding="async"
              className="lp-shot"
            />
          ))}
        </div>
      </section>

      {/* ── Stats ───────────────────────────────────────────────────── */}
      <section className="lp-shell lp-stats">
        {[
          ['0', 'bank accounts linked. Ever.'],
          ['100%', 'of your speech transcribed on-device'],
          ['4', 'languages: EN, FR, ES, PT'],
          ['3', 'surfaces: iPhone, web, desktop'],
        ].map(([n, label]) => (
          <div key={label} className="lp-stat">
            <div className="lp-stat-n">{n}</div>
            <div className="lp-stat-label">{label}</div>
          </div>
        ))}
      </section>

      {/* ── Mind map showcase ───────────────────────────────────────── */}
      <section className="lp-shell lp-map">
        <div className="lp-map-copy">
          <div className="lp-kicker">Desktop · Mind map</div>
          <h2 className="lp-h2">Your month, as a map.</h2>
          <p className="lp-p" style={{ maxWidth: 400 }}>
            On the desktop and web dashboard, the month unfolds as a living map: every category
            branches into the merchants behind it. Pan around, fold what you don&rsquo;t need, and
            follow the money to the exact purchase.
          </p>
          <Link href={appHref} className="lp-maplink">
            Explore it in the dashboard →
          </Link>
        </div>
        <div className="lp-map-stage">
          <svg
            viewBox="0 0 620 400"
            className="lp-map-svg"
            role="img"
            aria-label="Mind map of a month of spending: categories branching into merchants"
          >
            <g fill="none" stroke="#3F5A3E" strokeWidth="1.5" opacity="0.35">
              <path d="M158 200 C 230 200, 240 78, 300 74" />
              <path d="M158 200 C 235 200, 245 200, 300 200" />
              <path d="M158 200 C 230 200, 240 322, 300 326" />
              <path d="M436 74 C 470 74, 475 48, 506 46" />
              <path d="M436 74 C 470 74, 475 104, 506 102" />
              <path d="M436 200 C 470 200, 475 174, 506 172" />
              <path d="M436 200 C 470 200, 475 230, 506 228" />
              <path d="M436 326 C 470 326, 475 300, 506 298" />
              <path d="M436 326 C 470 326, 475 356, 506 354" />
            </g>
            <g className="lp-map-root">
              <rect x="18" y="168" width="140" height="64" rx="18" fill="#1B1915" />
              <text
                x="38"
                y="194"
                fontFamily="var(--font-fraunces), Georgia, serif"
                fontSize="17"
                fill="#FBFAF7"
              >
                August
              </text>
              <text x="38" y="216" fontSize="11.5" fontWeight="600" fill="#9DBB9C">
                $1,284 spent
              </text>
            </g>
            <g className="lp-map-cat">
              <rect
                x="300"
                y="52"
                width="136"
                height="44"
                rx="14"
                fill="#FFFFFF"
                stroke="rgba(40,36,28,0.1)"
              />
              <circle cx="320" cy="74" r="5" fill="#FF6B35" />
              <text x="333" y="70" fontSize="11.5" fontWeight="700" fill="#1B1915">
                Food &amp; Dining
              </text>
              <text x="333" y="86" fontSize="11" fill="#6C675E">
                $412
              </text>
              <rect
                x="300"
                y="178"
                width="136"
                height="44"
                rx="14"
                fill="#FFFFFF"
                stroke="rgba(40,36,28,0.1)"
              />
              <circle cx="320" cy="200" r="5" fill="#9B59B6" />
              <text x="333" y="196" fontSize="11.5" fontWeight="700" fill="#1B1915">
                Shopping
              </text>
              <text x="333" y="212" fontSize="11" fill="#6C675E">
                $310
              </text>
              <rect
                x="300"
                y="304"
                width="136"
                height="44"
                rx="14"
                fill="#FFFFFF"
                stroke="rgba(40,36,28,0.1)"
              />
              <circle cx="320" cy="326" r="5" fill="#4A90E2" />
              <text x="333" y="322" fontSize="11.5" fontWeight="700" fill="#1B1915">
                Transport
              </text>
              <text x="333" y="338" fontSize="11" fill="#6C675E">
                $164
              </text>
            </g>
            {[
              { y: 24, d: 'starbucks.com', n: 'Starbucks', a: '$86' },
              { y: 80, d: 'chick-fil-a.com', n: 'Chick-fil-A', a: '$54' },
              { y: 150, d: 'target.com', n: 'Target', a: '$121' },
              { y: 206, d: 'amazon.com', n: 'Amazon', a: '$89' },
              { y: 276, d: 'shell.com', n: 'Shell', a: '$38' },
              { y: 332, d: 'uber.com', n: 'Uber', a: '$47' },
            ].map((m) => (
              <g key={m.d} className="lp-map-leaf">
                <rect
                  x="506"
                  y={m.y}
                  width="112"
                  height="44"
                  rx="14"
                  fill="#FFFFFF"
                  stroke="rgba(40,36,28,0.08)"
                />
                <image href={logo(m.d)} x="518" y={m.y + 12} width="20" height="20" />
                <text x="546" y={m.y + 20} fontSize="11" fontWeight="600" fill="#1B1915">
                  {m.n}
                </text>
                <text
                  x="546"
                  y={m.y + 34}
                  fontSize="10.5"
                  fill="#6C675E"
                  fontFamily="var(--font-fraunces), Georgia, serif"
                >
                  {m.a}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </section>

      {/* ── Features (bento) ────────────────────────────────────────── */}
      <section id="features" className="lp-shell lp-bento">
        <div className="lp-card">
          <div className="lp-kicker">Voice</div>
          <h3 className="lp-h3">&ldquo;Eight dollars at Lay&rsquo;s.&rdquo;</h3>
          <p className="lp-p">
            That&rsquo;s the whole workflow. Murmur hears the amount, the merchant and the intent,
            picks the category, and saves it with an undo. Groceries in the car, rent from the
            couch.
          </p>
          <div className="lp-voice-vis" aria-hidden>
            <span className="lp-voice-mic">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="3" width="6" height="11" rx="3" fill="#FBFAF7" />
                <path
                  d="M5 11a7 7 0 0 0 14 0M12 18v3"
                  stroke="#FBFAF7"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <div className="lp-wave">
              {Array.from({ length: 28 }).map((_, i) => (
                <span key={i} style={{ animationDelay: (i * 0.06).toFixed(2) + 's' }} />
              ))}
            </div>
          </div>
        </div>

        <div className="lp-card lp-card-pay">
          <div className="lp-pay-copy">
            <div className="lp-kicker">Apple Pay capture</div>
            <h3 className="lp-h3">Pay. That&rsquo;s it.</h3>
            <p className="lp-p">
              A one-time setup, then every tap-to-pay purchase files itself in the background with a
              quiet confirmation. Undo or edit from the notification.
            </p>
          </div>
          {/* Photo: Unsplash (Nathan Dumlao), Unsplash License: free commercial
              use, no attribution required. Self-hosted for CSP. */}
          <div className="lp-pay-photo">
            <img
              src="/img/apple-pay-tap.jpg"
              alt="A hand paying with Apple Pay on an iPhone at a card terminal"
            />
            <span className="lp-pay-chip">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 12.5 9.5 18 20 6.5"
                  stroke="#3F5A3E"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Captured · $4.06 · Food &amp; Dining
            </span>
          </div>
        </div>

        <div className="lp-card">
          <div className="lp-kicker">Insights</div>
          <h3 className="lp-h3">See the month coming.</h3>
          <p className="lp-p">
            Forecasts, spending patterns and a recurring-bill radar that knows your pay cycle.
          </p>
          <svg className="lp-chart" viewBox="0 0 260 92" aria-hidden>
            <defs>
              <linearGradient id="lpg" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#3F5A3E" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#3F5A3E" stopOpacity="0" />
              </linearGradient>
            </defs>
            <g stroke="rgba(40,36,28,0.08)" strokeDasharray="2 4">
              <line x1="0" x2="260" y1="24" y2="24" />
              <line x1="0" x2="260" y1="48" y2="48" />
              <line x1="0" x2="260" y1="72" y2="72" />
            </g>
            <path
              d="M0 70 C30 66, 50 48, 80 52 S 140 38, 165 34 L165 92 L0 92 Z"
              fill="url(#lpg)"
            />
            <path
              d="M0 70 C30 66, 50 48, 80 52 S 140 38, 165 34"
              fill="none"
              stroke="#3F5A3E"
              strokeWidth="2.5"
            />
            <path
              d="M165 34 C 195 29, 225 22, 258 16"
              fill="none"
              stroke="#B8860B"
              strokeWidth="2.5"
              strokeDasharray="5 4"
              opacity="0.85"
            />
            <circle cx="52" cy="51" r="3.5" fill="#FF6B35" />
            <circle cx="112" cy="43" r="3.5" fill="#9B59B6" />
            <circle cx="165" cy="34" r="4.5" fill="#fff" stroke="#3F5A3E" strokeWidth="2.5" />
            <text x="196" y="12" fontSize="8.5" fontWeight="700" fill="#B8860B">
              forecast
            </text>
          </svg>
        </div>

        <div className="lp-card">
          <div className="lp-kicker">Yours, portable</div>
          <h3 className="lp-h3">Export everything.</h3>
          <p className="lp-p">
            CSV for spreadsheets, JSON for backups, a typeset PDF for records and taxes. Or delete
            it all, permanently, from Settings. No email required, no retention tricks.
          </p>
          <div className="lp-files" aria-hidden>
            <span className="lp-file" style={{ background: '#E4F0E2', color: '#2E5A2C' }}>
              CSV
            </span>
            <span className="lp-file" style={{ background: '#FBF0D9', color: '#8A6410' }}>
              JSON
            </span>
            <span className="lp-file" style={{ background: '#FDE4DE', color: '#A63A22' }}>
              PDF
            </span>
          </div>
        </div>

        <div className="lp-card">
          <div className="lp-kicker">Privacy</div>
          <h3 className="lp-h3">No bank linking. Ever.</h3>
          <p className="lp-p">
            Murmur never connects to your accounts. Everything in it is something you chose to put
            there. That is the product.
          </p>
          <div className="lp-priv" aria-hidden>
            <svg width="54" height="60" viewBox="0 0 54 60">
              <path
                d="M27 2 50 10v16c0 15-9.5 25.5-23 30C13.5 51.5 4 41 4 26V10L27 2Z"
                fill="#E8EDE3"
                stroke="#3F5A3E"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path
                d="M17 30l7 7 13-14"
                fill="none"
                stroke="#3F5A3E"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="lp-priv-bank">
              <svg width="34" height="34" viewBox="0 0 34 34">
                <g stroke="#9C9589" strokeWidth="1.8" fill="none">
                  <path
                    d="M6 14h22M8 14v10M13.5 14v10M19.5 14v10M26 14v10M5 26h24"
                    strokeLinecap="round"
                  />
                  <path d="M17 5 6 12h22L17 5Z" strokeLinejoin="round" />
                </g>
                <circle cx="17" cy="17" r="15" stroke="#A63A22" strokeWidth="2.4" fill="none" />
                <line
                  x1="6.5"
                  y1="27.5"
                  x2="27.5"
                  y2="6.5"
                  stroke="#A63A22"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </div>
        </div>

        <div className="lp-card lp-card-dark" id="ask">
          <div className="lp-ask-grid">
            <div>
              <div className="lp-kicker lp-kicker-light">Ask Murmur</div>
              <h3 className="lp-h3 lp-h3-light">Ask anything about your money.</h3>
              <div className="lp-chat">
                <div className="lp-bubble lp-bubble-user">What did food cost me this month?</div>
                <div className="lp-ai-row">
                  <span className="lp-ai-avatar">
                    <MurmurMark size={26} variant="sage" rounded />
                  </span>
                  <div className="lp-bubble lp-bubble-ai">
                    <span className="lp-bubble-figure">$412</span>, about 14% less than July.
                    Starbucks is your top spot at $86 across 11 visits.
                  </div>
                </div>
              </div>
              <p className="lp-p lp-p-light">
                Answers computed from your own transactions. Not generic advice, and never shared.
              </p>
            </div>
            <div className="lp-ask-side" aria-hidden>
              <div className="lp-ask-side-label">Things people murmur</div>
              <span className="lp-ask-chip">Am I over budget this week?</span>
              <span className="lp-ask-chip">What&rsquo;s my most expensive subscription?</span>
              <span className="lp-ask-chip">How much at Starbucks this year?</span>
              <span className="lp-ask-chip">What changed since last month?</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Plus ────────────────────────────────────────────────────── */}
      <section id="plus" className="lp-shell lp-plus">
        <div className="lp-sec-head">
          <div className="lp-kicker">Murmur Plus</div>
          <h2 className="lp-h2">The whole picture, one subscription.</h2>
          <p className="lp-p" style={{ maxWidth: 560, margin: '10px auto 0' }}>
            Writing it down is free, forever. Understanding it is what Plus adds. Every new account
            starts with two weeks of Plus, no card and nothing to cancel.
          </p>
        </div>
        <div className="lp-tiers">
          <div className="lp-tier">
            <div className="lp-tier-name">Murmur Free</div>
            <ul className="lp-tier-list">
              <li>Unlimited voice, typed and receipt logging</li>
              <li>Apple Pay purchases captured for you</li>
              <li>Budgets, reminders, full history and search</li>
              <li>This month&rsquo;s insights, by category</li>
              <li>3 Ask Murmur questions a month</li>
              <li>Export everything, delete everything</li>
            </ul>
          </div>
          <div className="lp-tier lp-tier-plus">
            <div className="lp-tier-name">Murmur Plus</div>
            <ul className="lp-tier-list">
              <li>Ask Murmur, unlimited</li>
              <li>The desktop and web app</li>
              <li>Subscriptions and bills found automatically</li>
              <li>Your whole year: trends and forecast</li>
              <li>CSV and PDF reports</li>
              <li>Shared with up to 5 family members</li>
            </ul>
          </div>
        </div>
        <div className="lp-prices">
          <div className="lp-price">
            <div className="lp-price-name">Monthly</div>
            <div className="lp-price-amt">
              $4.99<span> / month</span>
            </div>
            <div className="lp-price-trial">Two weeks of Plus included</div>
          </div>
          <div className="lp-price lp-price-hero">
            <div className="lp-price-flag">Best value · Save 50%</div>
            <div className="lp-price-name">Yearly</div>
            <div className="lp-price-amt">
              $29.99<span> / year</span>
            </div>
            <div className="lp-price-trial">Two weeks of Plus included · $2.50 a month</div>
          </div>
        </div>
        <p className="lp-fineprint">
          Renews automatically until cancelled in your Apple ID settings. Cancel anytime.
        </p>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────── */}
      {/* Folded by default, opened one at a time: eight answers as eight
          paragraphs was a wall nobody reads. `<details>` does this with no
          JavaScript, keeps the text in the DOM for search engines and the
          FAQPage data below, and is keyboard accessible for free. */}
      <section id="faq" className="lp-shell lp-faq">
        <div className="lp-sec-head">
          <div className="lp-kicker">Questions</div>
          <h2 className="lp-h2">Before you download.</h2>
        </div>
        <div className="lp-faq-list">
          {FAQ.map((item, i) => (
            <details key={item.q} className="lp-faq-item" open={i === 0}>
              <summary className="lp-faq-q">
                {item.q}
                <span aria-hidden className="lp-faq-mark">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="m5 9 7 7 7-7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </summary>
              <p className="lp-faq-a">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Get Murmur ─────────────────────────────────────────────── */}
      {/* Every platform, as a card, in one place. The previous version hid
          Mac Intel and Windows in an 11px grey line under the hero, which
          is the same as not shipping them. */}
      <section id="get" className="lp-getwrap">
        <div className="lp-shell">
          <div className="lp-sec-head lp-sec-head-light">
            <div className="lp-kicker lp-kicker-light">Get Murmur</div>
            <h2 className="lp-h2 lp-h2-light">Say it once. It is filed.</h2>
            <p className="lp-p lp-p-light" style={{ maxWidth: 480, margin: '12px auto 0' }}>
              Free forever on iPhone. One account, every screen, and two weeks of Plus the
              moment you sign in. No card, nothing to cancel.
            </p>
          </div>

          <div className="lp-get-grid">
            <div className="lp-get-card lp-get-card-lead">
              <div className="lp-get-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="#1B1915" aria-hidden>
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                </svg>
              </div>
              <h3 className="lp-get-name">iPhone</h3>
              <p className="lp-get-sub">
                The whole app: voice, Apple Pay capture, budgets, receipts. Free forever.
              </p>
              <a href={APP_STORE_URL} className="lp-btn-primary lp-get-btn" rel="noreferrer">
                Download on the App Store
              </a>
              <div className="lp-get-note">iPhone, iOS 15.1 or later</div>
            </div>

            <div className="lp-get-card">
              <div className="lp-get-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect x="2.5" y="4" width="19" height="12.5" rx="2" stroke="#1B1915" strokeWidth="1.9" />
                  <path d="M1 19.5h22" stroke="#1B1915" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              </div>
              <h3 className="lp-get-name">Mac</h3>
              <p className="lp-get-sub">The month as a mind map, reports, and Ask on a big screen.</p>
              <div className="lp-get-pair">
                <a href={MAC_DMG_ARM} className="lp-btn-secondary lp-get-btn">
                  Apple Silicon
                </a>
                <a href={MAC_DMG_INTEL} className="lp-btn-secondary lp-get-btn">
                  Intel
                </a>
              </div>
              <div className="lp-get-note">Signed and notarized by Apple · part of Plus</div>
            </div>

            <div className="lp-get-card">
              <div className="lp-get-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="#1B1915" aria-hidden>
                  <path d="M3 5.8 10.4 4.7v6.6H3V5.8Zm8.6-1.2L21 3.2v8.1h-9.4V4.6ZM3 12.7h7.4v6.6L3 18.2v-5.5Zm8.6 0H21v8.1l-9.4-1.4v-6.7Z" />
                </svg>
              </div>
              <h3 className="lp-get-name">Windows</h3>
              <p className="lp-get-sub">The same dashboard, on the machine you actually work on.</p>
              <a href={WIN_EXE} className="lp-btn-secondary lp-get-btn">
                Download for Windows
              </a>
              <div className="lp-get-note">
                Unsigned for now, so Windows asks once before it runs · part of Plus
              </div>
            </div>

            <div className="lp-get-card">
              <div className="lp-get-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="9" stroke="#1B1915" strokeWidth="1.9" />
                  <path d="M3 12h18M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18" stroke="#1B1915" strokeWidth="1.6" />
                </svg>
              </div>
              <h3 className="lp-get-name">Web</h3>
              <p className="lp-get-sub">Nothing to install. Your numbers in any browser, on any machine.</p>
              <Link href={appHref} className="lp-btn-secondary lp-get-btn">
                {user ? 'Open your dashboard' : 'Open the web app'}
              </Link>
              <div className="lp-get-note">Same account, same data · part of Plus</div>
            </div>
          </div>

          <p className="lp-get-foot">
            Logging is free forever on iPhone. The big screens, unlimited Ask, your full history
            and automatic subscription detection are Murmur Plus, $4.99 a month or $29.99 a year,
            shareable with five family members.
          </p>
        </div>
      </section>

      {/* Structured data. Search engines and the AI answer engines quote
          structured facts far more reliably than prose, and this page is
          the only place Murmur exists outside the App Store. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'SoftwareApplication',
                name: 'Murmur',
                applicationCategory: 'FinanceApplication',
                operatingSystem: 'iOS, macOS, Windows, Web',
                description:
                  'Voice-first expense tracker. Say what you spent and it is filed, with no bank linking. Free forever, with 14 days of Murmur Plus for every new account.',
                url: SITE,
                downloadUrl: APP_STORE_URL,
                inLanguage: ['en', 'fr', 'es', 'pt'],
                offers: [
                  { '@type': 'Offer', price: '0', priceCurrency: 'USD', name: 'Murmur Free' },
                  { '@type': 'Offer', price: '4.99', priceCurrency: 'USD', name: 'Murmur Plus, monthly' },
                  { '@type': 'Offer', price: '29.99', priceCurrency: 'USD', name: 'Murmur Plus, yearly' },
                ],
              },
              {
                '@type': 'Organization',
                name: 'Murmur',
                url: SITE,
                email: SUPPORT_EMAIL,
              },
              {
                '@type': 'FAQPage',
                mainEntity: FAQ.map((item) => ({
                  '@type': 'Question',
                  name: item.q,
                  acceptedAnswer: { '@type': 'Answer', text: item.a },
                })),
              },
            ],
          }),
        }}
      />

      {/* Phone visitors scroll a long way from the hero button, and most
          of this page's traffic is a phone. The bar keeps the one action
          in reach without covering anything: it only exists under 760px,
          and the page reserves its height at the bottom. */}
      <div className="lp-sticky">
        <div className="lp-sticky-copy">
          <strong>Free forever</strong>
          <span>14 days of Plus, no card</span>
        </div>
        <a href={APP_STORE_URL} className="lp-sticky-btn" rel="noreferrer">
          Get Murmur
        </a>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-shell">
          <div className="lp-footer-top">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <MurmurMark size={26} variant="sage" rounded />
              <span style={{ fontWeight: 700, fontSize: 15 }}>Murmur</span>
            </div>
            <nav className="lp-footer-links">
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <Link href={appHref}>Web dashboard</Link>
              <a href={APP_STORE_URL} rel="noreferrer">Download on the App Store</a>
              <a href={MAC_DMG_ARM}>Download for Mac</a>
              <a href={WIN_EXE}>Download for Windows</a>
              {SUPPORT_EMAIL && <a href={'mailto:' + SUPPORT_EMAIL}>{SUPPORT_EMAIL}</a>}
            </nav>
          </div>
          <div aria-hidden className="lp-footer-word">
            murmur
          </div>
          <div className="lp-footer-bottom">
            © {new Date().getFullYear()} Murmur · Your data, on your terms.
          </div>
        </div>
      </footer>

      <style>{`
        .lp { overflow-x: hidden; }
        .lp [id] { scroll-margin-top: 84px; }
        .lp-shell { max-width: 1120px; margin: 0 auto; padding: 0 28px; }
        .lp a { text-decoration: none; }

        .lp-nav { position: sticky; top: 0; z-index: 50; background: rgba(251,250,247,0.82); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-bottom: 0.5px solid rgba(40,36,28,0.08); }
        .lp-nav-inner { display: flex; align-items: center; justify-content: space-between; height: 64px; }
        .lp-navlink { color: #6C675E; font-weight: 600; transition: color .15s; }
        .lp-navlink:hover { color: #1B1915; }
        .lp-cta-pill { color: #fff; background: #3F5A3E; font-weight: 600; padding: 9px 18px; border-radius: 999px; transition: transform .15s, box-shadow .15s; }
        .lp-cta-pill:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(63,90,62,0.25); }

        .lp-hero { position: relative; padding: 84px 0 96px; }
        .lp-hero-word { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); font-family: ${lpSerif}; font-size: clamp(160px, 26vw, 380px); line-height: 1; color: #3F5A3E; opacity: 0.055; letter-spacing: -0.04em; user-select: none; pointer-events: none; white-space: nowrap; }
        .lp-hero-glow { position: absolute; top: -180px; right: -160px; width: 640px; height: 640px; border-radius: 50%; background: radial-gradient(circle, rgba(92,123,90,0.16), rgba(92,123,90,0) 65%); pointer-events: none; }
        .lp-hero-grid { position: relative; display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 48px; align-items: center; }
        .lp-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: #3F5A3E; background: #E8EDE3; padding: 8px 14px; border-radius: 999px; }
        .lp-eyebrow-dot { width: 6px; height: 6px; border-radius: 50%; background: #3F5A3E; }
        .lp-h1 { font-family: ${lpSerif}; font-weight: 500; font-size: clamp(52px, 7.6vw, 92px); line-height: 0.98; letter-spacing: -0.035em; margin: 26px 0 0; }
        .lp-h1 em { font-style: italic; color: #3F5A3E; }
        .lp-sub { font-size: 18px; line-height: 1.65; color: #3A3630; max-width: 470px; margin: 24px 0 0; }
        .lp-hero-ctas { display: flex; align-items: center; gap: 12px; margin-top: 34px; flex-wrap: wrap; }
        .lp-btn-primary { display: inline-flex; align-items: center; gap: 9px; background: #3F5A3E; color: #fff; font-weight: 600; font-size: 14px; padding: 13px 24px; border-radius: 999px; transition: transform .15s, box-shadow .15s; }
        .lp-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 10px 26px rgba(63,90,62,0.3); }
        .lp-btn-secondary { display: inline-flex; align-items: center; gap: 9px; background: #F5F2EB; color: #1B1915; font-weight: 600; font-size: 14px; padding: 13px 22px; border-radius: 999px; transition: transform .15s, box-shadow .15s; }
        .lp-btn-secondary:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(27,25,21,0.12); }

        .lp-phone-stage { position: relative; display: flex; justify-content: center; }
        .lp-phone-wrap { position: relative; }
        .lp-branch-curves { position: absolute; left: -168px; top: 96px; z-index: 1; animation: lp-float 7s ease-in-out infinite; animation-delay: 1.6s; }
        .lp-branch-node { position: absolute; z-index: 3; background: #FFFFFF; border: 0.5px solid rgba(40,36,28,0.1); border-radius: 14px; box-shadow: 0 12px 30px rgba(27,25,21,0.1); animation: lp-float 7s ease-in-out infinite; animation-delay: 1.6s; }
        .lp-branch-root { left: -52px; top: 222px; background: #1B1915; border-color: #1B1915; padding: 9px 14px; }
        .lp-branch-root-month { font-family: ${lpSerif}; font-size: 15px; color: #FBFAF7; }
        .lp-branch-root-amt { font-size: 10.5px; font-weight: 700; color: #9DBB9C; margin-top: 1px; }
        .lp-branch-leaf { display: flex; align-items: center; gap: 9px; padding: 9px 12px; }
        .lp-branch-leaf1 { left: -168px; top: 118px; }
        .lp-branch-leaf2 { left: -168px; top: 314px; }
        .lp-branch-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
        .lp-branch-name { font-size: 11.5px; font-weight: 700; color: #1B1915; white-space: nowrap; }
        .lp-branch-sub { font-size: 10.5px; color: #6C675E; white-space: nowrap; margin-top: 1px; }
        .lp-phone { position: relative; z-index: 2; width: 320px; background: #FFFFFF; border: 1px solid rgba(40,36,28,0.1); border-radius: 44px; padding: 22px 18px 30px; box-shadow: 0 40px 90px rgba(27,25,21,0.16), 0 6px 18px rgba(27,25,21,0.06); }
        .lp-phone-notch { width: 110px; height: 24px; background: #1B1915; border-radius: 999px; margin: 0 auto 16px; }
        .lp-phone-month { font-size: 10px; font-weight: 700; letter-spacing: 1.6px; color: #9C9589; }
        .lp-phone-today { font-family: ${lpSerif}; font-size: 30px; font-weight: 500; letter-spacing: -0.5px; margin-top: 2px; }
        .lp-spent { background: #F5F2EB; border-radius: 18px; padding: 14px 16px; margin-top: 14px; }
        .lp-spent-label { font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: #6C675E; }
        .lp-spent-amt { font-family: ${lpSerif}; font-size: 34px; letter-spacing: -0.5px; margin-top: 2px; }
        .lp-spent-cur { font-size: 20px; color: #6C675E; }
        .lp-spent-dec { color: #9C9589; }
        .lp-rows { margin-top: 14px; display: flex; flex-direction: column; }
        .lp-row { display: flex; align-items: center; gap: 12px; padding: 11px 2px; border-bottom: 0.5px solid rgba(40,36,28,0.07); }
        .lp-row:last-child { border-bottom: none; }
        .lp-row-logo { border-radius: 10px; }
        .lp-row-name { font-weight: 600; font-size: 14px; }
        .lp-chip { display: inline-block; font-size: 10.5px; font-weight: 600; border-radius: 999px; padding: 2px 8px; margin-top: 3px; }
        .lp-row-amt { font-family: ${lpSerif}; font-size: 16px; letter-spacing: -0.3px; }
        .lp-mic { position: absolute; left: 50%; transform: translateX(-50%); bottom: -26px; width: 58px; height: 58px; border-radius: 50%; background: #1B1915; display: flex; align-items: center; justify-content: center; box-shadow: 0 14px 30px rgba(27,25,21,0.35); }
        .lp-mic-ring { position: absolute; inset: 0; border-radius: 50%; border: 2px solid rgba(63,90,62,0.5); animation: lp-pulse 2.4s ease-out infinite; }
        .lp-mic-ring2 { animation-delay: 1.2s; }
        .lp-notif { position: absolute; top: -34px; right: -26px; z-index: 4; display: flex; gap: 10px; align-items: center; background: rgba(255,255,255,0.94); backdrop-filter: blur(8px); border: 0.5px solid rgba(40,36,28,0.1); border-radius: 18px; padding: 12px 16px; box-shadow: 0 18px 44px rgba(27,25,21,0.14); max-width: 300px; }
        .lp-notif-title { font-size: 12.5px; font-weight: 700; }
        .lp-notif-body { font-size: 11.5px; color: #6C675E; margin-top: 1px; }

        .lp-marquee-wrap { padding: 20px 0 8px; }
        .lp-marquee-label { text-align: center; font-size: 11px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase; color: #9C9589; margin-bottom: 18px; }
        .lp-marquee { overflow: hidden; -webkit-mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); }
        .lp-marquee-track { display: flex; width: max-content; padding: 4px 0; animation: lp-scroll 60s linear infinite; }
        .lp-marquee-logo { border-radius: 12px; opacity: 0.85; margin-right: 44px; }

        .lp-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; padding-top: 72px; padding-bottom: 8px; }
        .lp-stat { text-align: center; padding: 10px; }
        .lp-stat-n { font-family: ${lpSerif}; font-size: 44px; letter-spacing: -1px; color: #3F5A3E; }
        .lp-stat-label { font-size: 13px; color: #6C675E; margin-top: 4px; line-height: 1.45; }
        .lp-tiers { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 28px auto 0; max-width: 760px; text-align: left; }
        .lp-tier { background: #FFFFFF; border: 1px solid rgba(40,36,28,0.08); border-radius: 22px; padding: 22px 24px; }
        .lp-tier-plus { border-color: #3F5A3E; }
        .lp-tier-name { font-family: ${lpSerif}; font-size: 21px; color: #1B1915; }
        .lp-tier-list { margin: 12px 0 0; padding-left: 18px; display: grid; gap: 6px; font-size: 14px; color: #3A3630; line-height: 1.5; }
        @media (max-width: 760px) {
          .lp-tiers { grid-template-columns: 1fr; }
        }

        .lp-map { display: grid; grid-template-columns: 0.9fr 1.1fr; gap: 40px; align-items: center; padding-top: 88px; }
        .lp-map-stage { background: #FFFFFF; border: 0.5px solid rgba(40,36,28,0.08); border-radius: 28px; padding: 18px; box-shadow: 0 24px 60px rgba(27,25,21,0.07); }
        .lp-map-svg { width: 100%; height: auto; display: block; }
        .lp-map-root, .lp-map-cat, .lp-map-leaf { animation: lp-float 6s ease-in-out infinite; }
        .lp-map-cat { animation-delay: 1.2s; }
        .lp-map-leaf { animation-delay: 2.2s; }
        .lp-maplink { display: inline-block; margin-top: 20px; font-weight: 600; font-size: 14px; color: #3F5A3E; }
        .lp-maplink:hover { text-decoration: underline; }

        .lp-bento { display: grid; grid-template-columns: repeat(6, 1fr); gap: 14px; padding-top: 64px; padding-bottom: 24px; }
        .lp-card { grid-column: span 2; background: #FFFFFF; border: 0.5px solid rgba(40,36,28,0.08); border-radius: 24px; padding: 28px; transition: transform .18s, box-shadow .18s; }
        .lp-card:hover { transform: translateY(-3px); box-shadow: 0 18px 44px rgba(27,25,21,0.08); }
        .lp-card-pay { grid-column: span 4; display: grid; grid-template-columns: 1fr 1.1fr; gap: 24px; overflow: hidden; }
        .lp-pay-copy { align-self: center; }
        .lp-pay-photo { position: relative; margin: -28px -28px -28px 0; min-height: 280px; }
        .lp-pay-photo img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 42% 78%; -webkit-mask-image: linear-gradient(90deg, transparent, #000 26%); mask-image: linear-gradient(90deg, transparent, #000 26%); }
        .lp-pay-chip { position: absolute; left: 22px; bottom: 18px; display: inline-flex; align-items: center; gap: 7px; background: rgba(251,250,247,0.95); color: #2E4A2D; font-size: 12px; font-weight: 700; border-radius: 999px; padding: 8px 14px; box-shadow: 0 10px 26px rgba(27,25,21,0.25); }
        .lp-card-dark { grid-column: span 6; background: #1B1915; border-color: #1B1915; }
        .lp-kicker { font-size: 11px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: #3F5A3E; }
        .lp-kicker-light { color: #9DBB9C; }
        .lp-h2 { font-family: ${lpSerif}; font-weight: 500; font-size: clamp(30px, 4vw, 42px); letter-spacing: -0.8px; margin: 10px 0 0; }
        .lp-h3 { font-family: ${lpSerif}; font-weight: 500; font-size: 24px; letter-spacing: -0.4px; margin: 10px 0 0; }
        .lp-h3-light { color: #FBFAF7; font-size: clamp(26px, 3.4vw, 34px); }
        .lp-p { font-size: 14.5px; line-height: 1.65; color: #3A3630; margin: 10px 0 0; }
        .lp-p-light { color: rgba(251,250,247,0.72); }
        .lp-wave { display: flex; align-items: flex-end; gap: 4px; height: 46px; margin-top: 22px; }
        .lp-wave span { width: 5px; border-radius: 3px; background: #3F5A3E; height: 30%; animation: lp-wave 1.6s ease-in-out infinite; }
        .lp-chart { width: 100%; margin-top: 20px; display: block; }
        .lp-chat { display: flex; flex-direction: column; gap: 10px; margin-top: 20px; max-width: 560px; }
        .lp-bubble { border-radius: 18px; padding: 12px 16px; font-size: 14px; line-height: 1.55; width: fit-content; max-width: 92%; }
        .lp-bubble-user { background: rgba(251,250,247,0.12); color: #FBFAF7; align-self: flex-end; }
        .lp-bubble-ai { background: #FBFAF7; color: #1B1915; }
        .lp-bubble-figure { font-family: ${lpSerif}; font-weight: 600; }

        .lp-voice-vis { display: flex; align-items: center; gap: 16px; margin-top: 22px; }
        .lp-voice-mic { flex: none; width: 46px; height: 46px; border-radius: 50%; background: #1B1915; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 20px rgba(27,25,21,0.25); }
        .lp-files { display: flex; gap: 10px; margin-top: 22px; }
        .lp-file { position: relative; font-size: 12px; font-weight: 800; letter-spacing: 0.6px; border-radius: 10px 16px 10px 10px; padding: 16px 16px 10px; box-shadow: 0 6px 16px rgba(27,25,21,0.07); }
        .lp-file::before { content: ''; position: absolute; top: 0; right: 0; width: 14px; height: 14px; background: rgba(27,25,21,0.1); border-radius: 0 16px 0 10px; }
        .lp-priv { display: flex; align-items: center; gap: 18px; margin-top: 22px; }
        .lp-priv-bank { display: inline-flex; }
        .lp-ask-grid { display: grid; grid-template-columns: 1.25fr 0.75fr; gap: 36px; align-items: start; }
        .lp-ai-row { display: flex; align-items: flex-end; gap: 10px; }
        .lp-ai-avatar { flex: none; display: inline-flex; margin-bottom: 2px; }
        .lp-ask-side { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; padding-top: 34px; }
        .lp-ask-side-label { font-size: 11px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: rgba(251,250,247,0.45); margin-bottom: 2px; }
        .lp-ask-chip { font-size: 13px; color: rgba(251,250,247,0.85); border: 1px solid rgba(251,250,247,0.22); border-radius: 999px; padding: 9px 16px; }

        .lp-plus { padding-top: 72px; padding-bottom: 88px; text-align: center; }
        .lp-prices { display: flex; gap: 14px; justify-content: center; margin-top: 34px; flex-wrap: wrap; }
        .lp-price { position: relative; background: #FFFFFF; border: 0.5px solid rgba(40,36,28,0.1); border-radius: 24px; padding: 30px 40px; min-width: 240px; }
        .lp-price-hero { background: #3F5A3E; color: #FBFAF7; border-color: #3F5A3E; box-shadow: 0 24px 60px rgba(63,90,62,0.28); }
        .lp-price-flag { position: absolute; top: -13px; left: 50%; transform: translateX(-50%); background: #1B1915; color: #FBFAF7; font-size: 11px; font-weight: 700; padding: 5px 14px; border-radius: 999px; white-space: nowrap; }
        .lp-price-name { font-size: 13px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; opacity: 0.75; }
        .lp-price-amt { font-family: ${lpSerif}; font-size: 42px; letter-spacing: -1px; margin-top: 8px; }
        .lp-price-amt span { font-size: 15px; font-family: ${font.sans}; opacity: 0.7; letter-spacing: 0; }
        .lp-price-trial { font-size: 13px; font-weight: 600; margin-top: 8px; opacity: 0.85; }
        .lp-fineprint { font-size: 12px; color: #9C9589; margin-top: 22px; }

        .lp-footer { border-top: 0.5px solid rgba(40,36,28,0.08); padding: 36px 0 28px; }
        .lp-footer-top { display: flex; justify-content: space-between; align-items: center; gap: 18px; flex-wrap: wrap; }
        .lp-footer-links { display: flex; flex-wrap: wrap; gap: 10px 22px; font-size: 13.5px; }
        .lp-footer-links a { color: #6C675E; }
        .lp-footer-links a:hover { color: #1B1915; }
        .lp-footer-word { font-family: ${lpSerif}; font-size: clamp(90px, 16vw, 200px); line-height: 1; letter-spacing: -0.04em; color: #3F5A3E; opacity: 0.07; text-align: center; margin: 10px 0 0; user-select: none; }
        .lp-footer-bottom { text-align: center; font-size: 12.5px; color: #9C9589; margin-top: 6px; }

        /* Nav */
        .lp-nav-links { display: flex; align-items: center; gap: 22px; font-size: 14px; }

        /* Hero proof */
        .lp-btn-ghost { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 14px; color: #6C675E; padding: 13px 8px; }
        .lp-btn-ghost:hover { color: #1B1915; }
        .lp-proof { list-style: none; margin: 30px 0 0; padding: 0; display: grid; gap: 12px; max-width: 470px; }
        .lp-proof-item { display: flex; align-items: flex-start; gap: 9px; }
        .lp-proof-item svg { flex: none; margin-top: 3px; }
        .lp-proof-item strong { display: block; font-size: 14px; font-weight: 700; color: #1B1915; }
        .lp-proof-item span { display: block; font-size: 12.5px; color: #6C675E; margin-top: 1px; }

        /* Section heads */
        .lp-sec-head { text-align: center; max-width: 620px; margin: 0 auto; }
        .lp-sec-head-light .lp-h2 { color: #FBFAF7; }
        .lp-h2-light { color: #FBFAF7; }

        /* How it works */
        .lp-how { padding-top: 88px; }
        .lp-steps { list-style: none; margin: 34px 0 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; counter-reset: lp-step; }
        .lp-step { position: relative; background: #FFFFFF; border: 0.5px solid rgba(40,36,28,0.08); border-radius: 24px; padding: 26px 26px 28px; }
        .lp-step::after { content: ''; position: absolute; top: 46px; right: -14px; width: 14px; border-top: 1.5px dashed rgba(63,90,62,0.4); }
        .lp-step:last-child::after { display: none; }
        .lp-step-n { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; background: #E8EDE3; color: #3F5A3E; font-family: ${lpSerif}; font-size: 16px; }
        .lp-step-t { font-family: ${lpSerif}; font-weight: 500; font-size: 22px; letter-spacing: -0.3px; margin: 14px 0 0; }

        /* Real screens */
        .lp-shots-wrap { padding-top: 88px; }
        .lp-shots { display: flex; gap: 16px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 28px 28px 34px; scrollbar-width: none; -webkit-mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent); mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent); }
        .lp-shots::-webkit-scrollbar { display: none; }
        .lp-shots:focus-visible { outline: 2px solid #3F5A3E; outline-offset: -6px; border-radius: 28px; }
        .lp-shot { flex: none; width: 262px; height: auto; border-radius: 22px; border: 0.5px solid rgba(40,36,28,0.1); box-shadow: 0 18px 44px rgba(27,25,21,0.1); scroll-snap-align: center; background: #FFFFFF; }
        @media (min-width: 1180px) { .lp-shots { justify-content: center; } }

        /* FAQ */
        .lp-faq { padding-block: 88px 8px; }
        .lp-faq-list { max-width: 760px; margin: 28px auto 0; border-top: 0.5px solid rgba(40,36,28,0.12); }
        .lp-faq-item { border-bottom: 0.5px solid rgba(40,36,28,0.12); }
        .lp-faq-q { display: flex; align-items: center; justify-content: space-between; gap: 18px; list-style: none; cursor: pointer; font-size: 16.5px; font-weight: 700; color: #1B1915; padding: 20px 2px; transition: color .15s; }
        .lp-faq-q::-webkit-details-marker { display: none; }
        .lp-faq-q:hover { color: #3F5A3E; }
        .lp-faq-mark { flex: none; display: inline-flex; width: 28px; height: 28px; border-radius: 50%; background: #F0EDE5; color: #3F5A3E; align-items: center; justify-content: center; transition: transform .22s ease, background .22s ease; }
        .lp-faq-item[open] .lp-faq-mark { transform: rotate(180deg); background: #E8EDE3; }
        .lp-faq-a { font-size: 15px; line-height: 1.68; color: #3A3630; margin: 0 0 22px; max-width: 660px; }

        /* Get Murmur */
        .lp-getwrap { background: #1B1915; color: #FBFAF7; padding: 84px 0 88px; margin-top: 88px; }
        .lp-get-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 40px; align-items: stretch; }
        .lp-get-card { display: flex; flex-direction: column; background: #FBFAF7; color: #1B1915; border-radius: 24px; padding: 26px 24px 24px; }
        .lp-get-card-lead { outline: 2px solid #9DBB9C; outline-offset: -2px; }
        .lp-get-icon { width: 44px; height: 44px; border-radius: 14px; background: #EFEBE2; display: flex; align-items: center; justify-content: center; }
        .lp-get-name { font-family: ${lpSerif}; font-weight: 500; font-size: 24px; letter-spacing: -0.4px; margin: 16px 0 0; }
        .lp-get-sub { font-size: 13.5px; line-height: 1.55; color: #3A3630; margin: 8px 0 0; }
        .lp-get-btn { margin-top: 18px; justify-content: center; text-align: center; font-size: 12.5px; padding: 12px 14px; white-space: nowrap; }
        .lp-get-card > .lp-get-btn, .lp-get-pair { margin-top: auto; }
        .lp-get-pair { display: grid; gap: 8px; }
        .lp-get-pair .lp-get-btn:first-child { margin-top: 18px; }
        .lp-get-pair .lp-get-btn + .lp-get-btn { margin-top: 0; }
        .lp-get-note { font-size: 11.5px; line-height: 1.45; color: #6C675E; margin-top: 10px; }
        .lp-get-foot { max-width: 620px; margin: 34px auto 0; text-align: center; font-size: 13px; line-height: 1.6; color: rgba(251,250,247,0.6); }

        /* Sticky phone bar */
        .lp-sticky { display: none; position: fixed; left: 0; right: 0; bottom: 0; z-index: 60; align-items: center; justify-content: space-between; gap: 14px; padding: 11px 16px calc(11px + env(safe-area-inset-bottom)); background: rgba(251,250,247,0.94); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-top: 0.5px solid rgba(40,36,28,0.1); }
        .lp-sticky-copy strong { display: block; font-size: 13.5px; font-weight: 700; color: #1B1915; }
        .lp-sticky-copy span { display: block; font-size: 11.5px; color: #6C675E; }
        .lp-sticky-btn { flex: none; background: #3F5A3E; color: #fff; font-weight: 700; font-size: 14px; padding: 12px 22px; border-radius: 999px; }

        @media (max-width: 920px) {
          .lp-steps { grid-template-columns: 1fr; gap: 12px; }
          .lp-step::after { display: none; }
          .lp-get-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 760px) {
          .lp-sticky { display: flex; }
          .lp { padding-bottom: 72px; }
          .lp-getwrap { padding: 64px 0 68px; margin-top: 64px; }
          .lp-get-grid { grid-template-columns: 1fr; }
          .lp-shots { padding-inline: 20px; }
          .lp-shot { width: 214px; }
          .lp-how, .lp-shots-wrap, .lp-faq { padding-top: 64px; }
        }

        @keyframes lp-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        .lp-rise { opacity: 0; animation: lp-rise .7s cubic-bezier(.2,.7,.3,1) forwards; }
        @keyframes lp-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        .lp-float { animation: lp-float 5s ease-in-out infinite; }
        @keyframes lp-pulse { 0% { transform: scale(1); opacity: .7; } 100% { transform: scale(1.9); opacity: 0; } }
        @keyframes lp-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes lp-wave { 0%,100% { height: 26%; } 50% { height: 92%; } }

        @media (max-width: 1200px) {
          .lp-branch-curves, .lp-branch-node { display: none; }
        }
        @media (max-width: 920px) {
          .lp-hero { padding: 56px 0 72px; }
          .lp-hero-grid { grid-template-columns: 1fr; gap: 72px; }
          .lp-sub { max-width: none; }
          .lp-stats { grid-template-columns: repeat(2, 1fr); }
          .lp-map { grid-template-columns: 1fr; gap: 28px; padding-top: 64px; }
          .lp-ask-grid { grid-template-columns: 1fr; gap: 8px; }
          .lp-ask-side { padding-top: 16px; }
          .lp-card, .lp-card-pay, .lp-card-dark { grid-column: span 6; }
          .lp-card-pay { grid-template-columns: 1fr; }
          .lp-pay-photo { margin: 0 -28px -28px; min-height: 230px; }
          .lp-pay-photo img { -webkit-mask-image: linear-gradient(180deg, transparent, #000 22%); mask-image: linear-gradient(180deg, transparent, #000 22%); }
          .lp-navlink:not(.lp-navlink-keep) { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .lp-rise { animation: none; opacity: 1; }
          .lp-float, .lp-mic-ring, .lp-marquee-track, .lp-wave span { animation: none; }
        }
      `}</style>
    </div>
  )
}
