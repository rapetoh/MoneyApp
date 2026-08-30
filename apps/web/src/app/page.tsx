import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '../lib/supabase/server'
import { MurmurMark } from '../components/MurmurMark'
import { colors, font } from '../lib/theme'
import { SUPPORT_EMAIL } from '@voice-expense/shared'

export const metadata: Metadata = {
  title: 'Murmur, the voice-first expense tracker',
  description:
    'Say what you spent and Murmur files it. Apple Pay purchases capture themselves. AI answers grounded in your own numbers. No bank linking, ever.',
}

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
 *   facts about the product. No dead download links: App Store reads
 *   "soon", the web dashboard link is real.
 * - Signed-in users still go straight to their dashboard via the nav
 *   button; the page itself renders for everyone.
 */

// Desktop downloads (signed + notarized, published Aug 29, 2026). The
// release script keeps these in step with the latest version.
const MAC_DMG_ARM = 'https://github.com/rapetoh/murmur-releases/releases/latest/download/Murmur-1.0.0-arm64.dmg'
const MAC_DMG_INTEL = 'https://github.com/rapetoh/murmur-releases/releases/latest/download/Murmur-1.0.0.dmg'

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
          <nav style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 14 }}>
            <a href="#features" className="lp-navlink">
              Features
            </a>
            <a href="#plus" className="lp-navlink">
              Plus
            </a>
            <Link href="/privacy" className="lp-navlink">
              Privacy
            </Link>
            <Link href={appHref} className="lp-cta-pill">
              {user ? 'Open dashboard' : 'Log in'}
            </Link>
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
            <div className="lp-hero-ctas lp-rise" style={{ animationDelay: '.28s' }}>
              <a href={MAC_DMG_ARM} className="lp-btn-primary">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 3v12m0 0 5-5m-5 5-5-5M4 21h16" stroke="#FBFAF7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Download for Mac
              </a>
              <Link href={appHref} className="lp-badge-soon">
                Web dashboard →
              </Link>
              <span className="lp-badge-soon"> App Store, soon</span>
            </div>
            <div className="lp-hero-dlnote lp-rise" style={{ animationDelay: '.32s' }}>
              Apple Silicon · signed &amp; notarized · <a href={MAC_DMG_INTEL}>Intel Mac version</a>
            </div>
            <div className="lp-trust lp-rise" style={{ animationDelay: '.36s' }}>
              No bank linking · Speech stays on your phone · Export or erase everything, anytime
            </div>
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
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
                      {/* eslint-disable-next-line @next/next/no-img-element */}
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
              // eslint-disable-next-line @next/next/no-img-element
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
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
        <div className="lp-plus-head">
          <div className="lp-kicker">Murmur Plus</div>
          <h2 className="lp-h2">The whole picture, one subscription.</h2>
          <p className="lp-p" style={{ maxWidth: 520, margin: '10px auto 0' }}>
            Ask Murmur, automatic recurring detection, full export and the desktop &amp; web
            dashboard. Subscribe on your iPhone; your account unlocks everywhere.
          </p>
        </div>
        <div className="lp-prices">
          <div className="lp-price">
            <div className="lp-price-name">Monthly</div>
            <div className="lp-price-amt">
              $3.99<span> / month</span>
            </div>
            <div className="lp-price-trial">7 days free</div>
          </div>
          <div className="lp-price lp-price-hero">
            <div className="lp-price-flag">Best value · Save 37%</div>
            <div className="lp-price-name">Yearly</div>
            <div className="lp-price-amt">
              $29.99<span> / year</span>
            </div>
            <div className="lp-price-trial">7 days free · $2.49 a month</div>
          </div>
        </div>
        <p className="lp-fineprint">
          Renews automatically until cancelled in your Apple ID settings. Cancel anytime.
        </p>
      </section>

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
              <a href={MAC_DMG_ARM}>Download for Mac</a>
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
        .lp-hero-dlnote { margin-top: 14px; font-size: 12px; color: #9C9589; }
        .lp-hero-dlnote a { color: #3F5A3E; font-weight: 600; }
        .lp-hero-dlnote a:hover { text-decoration: underline; }
        .lp-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 10px 26px rgba(63,90,62,0.3); }
        .lp-badge-soon { font-size: 13px; font-weight: 600; color: #6C675E; background: #F5F2EB; padding: 13px 20px; border-radius: 999px; }
        .lp-trust { margin-top: 26px; font-size: 12.5px; color: #9C9589; letter-spacing: 0.2px; }

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
        .lp-footer-links { display: flex; gap: 22px; font-size: 13.5px; }
        .lp-footer-links a { color: #6C675E; }
        .lp-footer-links a:hover { color: #1B1915; }
        .lp-footer-word { font-family: ${lpSerif}; font-size: clamp(90px, 16vw, 200px); line-height: 1; letter-spacing: -0.04em; color: #3F5A3E; opacity: 0.07; text-align: center; margin: 10px 0 0; user-select: none; }
        .lp-footer-bottom { text-align: center; font-size: 12.5px; color: #9C9589; margin-top: 6px; }

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
          .lp-navlink:not(.lp-cta-pill) { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .lp-rise { animation: none; opacity: 1; }
          .lp-float, .lp-mic-ring, .lp-marquee-track, .lp-wave span { animation: none; }
        }
      `}</style>
    </div>
  )
}
