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
              <span className="lp-badge-soon"> App Store, soon</span>
              <Link href={appHref} className="lp-btn-primary">
                Open the web dashboard
              </Link>
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
            <div className="lp-phone">
              <div className="lp-phone-notch" />
              <div className="lp-phone-head">
                <div className="lp-phone-month">AUGUST</div>
                <div className="lp-phone-today">Today</div>
              </div>
              <div className="lp-spent">
                <div className="lp-spent-label">Spent today</div>
                <div className="lp-spent-amt">
                  <span className="lp-spent-cur">$</span>85<span className="lp-spent-dec">.08</span>
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
      </section>

      {/* ── Marquee ─────────────────────────────────────────────────── */}
      <section className="lp-marquee-wrap" aria-label="Merchants Murmur captures automatically">
        <div className="lp-marquee-label">Purchases that filed themselves</div>
        <div className="lp-marquee">
          <div className="lp-marquee-track">
            {[...MARQUEE, ...MARQUEE].map((d, i) => (
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

      {/* ── Features (bento) ────────────────────────────────────────── */}
      <section id="features" className="lp-shell lp-bento">
        <div className="lp-card lp-card-voice">
          <div className="lp-kicker">Voice</div>
          <h3 className="lp-h3">&ldquo;Eight dollars at Lay&rsquo;s.&rdquo;</h3>
          <p className="lp-p">
            That&rsquo;s the whole workflow. Murmur hears the amount, the merchant and the intent,
            picks the category, and saves it with an undo. Groceries in the car, rent from the
            couch.
          </p>
          <div className="lp-wave" aria-hidden>
            {Array.from({ length: 28 }).map((_, i) => (
              <span key={i} style={{ animationDelay: (i * 0.06).toFixed(2) + 's' }} />
            ))}
          </div>
        </div>

        <div className="lp-card">
          <div className="lp-kicker">Apple Pay capture</div>
          <h3 className="lp-h3">Pay. That&rsquo;s it.</h3>
          <p className="lp-p">
            A one-time setup, then every tap-to-pay purchase files itself in the background with a
            quiet confirmation. Undo or edit from the notification.
          </p>
        </div>

        <div className="lp-card">
          <div className="lp-kicker">Insights</div>
          <h3 className="lp-h3">See the month coming.</h3>
          <p className="lp-p">
            Forecasts, spending patterns and a recurring-bill radar that knows your pay cycle.
          </p>
          <svg className="lp-chart" viewBox="0 0 260 80" aria-hidden>
            <path
              d="M0 62 C30 58, 50 40, 80 44 S 140 30, 170 26 S 230 14, 260 10 L260 80 L0 80 Z"
              fill="#3F5A3E"
              opacity="0.12"
            />
            <path
              d="M0 62 C30 58, 50 40, 80 44 S 140 30, 170 26 S 230 14, 260 10"
              fill="none"
              stroke="#3F5A3E"
              strokeWidth="2.5"
            />
            <circle cx="170" cy="26" r="4" fill="#fff" stroke="#3F5A3E" strokeWidth="2.5" />
          </svg>
        </div>

        <div className="lp-card lp-card-dark" id="ask">
          <div className="lp-kicker lp-kicker-light">Ask Murmur</div>
          <h3 className="lp-h3 lp-h3-light">Ask anything about your money.</h3>
          <div className="lp-chat">
            <div className="lp-bubble lp-bubble-user">What did food cost me this month?</div>
            <div className="lp-bubble lp-bubble-ai">
              <span className="lp-bubble-figure">$412</span>, about 14% less than July. Starbucks is
              your top spot at $86 across 11 visits.
            </div>
          </div>
          <p className="lp-p lp-p-light">
            Answers computed from your own transactions. Not generic advice, and never shared.
          </p>
        </div>

        <div className="lp-card">
          <div className="lp-kicker">Yours, portable</div>
          <h3 className="lp-h3">Export everything.</h3>
          <p className="lp-p">
            CSV for spreadsheets, JSON for backups, a typeset PDF for records and taxes. Or delete
            it all, permanently, from Settings. No email required, no retention tricks.
          </p>
        </div>

        <div className="lp-card">
          <div className="lp-kicker">Privacy</div>
          <h3 className="lp-h3">No bank linking. Ever.</h3>
          <p className="lp-p">
            Murmur never connects to your accounts. Everything in it is something you chose to put
            there. That is the product.
          </p>
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
        .lp-hero-word { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); font-family: ${font.serif}; font-size: clamp(160px, 26vw, 380px); line-height: 1; color: #3F5A3E; opacity: 0.055; letter-spacing: -0.04em; user-select: none; pointer-events: none; white-space: nowrap; }
        .lp-hero-glow { position: absolute; top: -180px; right: -160px; width: 640px; height: 640px; border-radius: 50%; background: radial-gradient(circle, rgba(92,123,90,0.16), rgba(92,123,90,0) 65%); pointer-events: none; }
        .lp-hero-grid { position: relative; display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 48px; align-items: center; }
        .lp-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: #3F5A3E; background: #E8EDE3; padding: 8px 14px; border-radius: 999px; }
        .lp-eyebrow-dot { width: 6px; height: 6px; border-radius: 50%; background: #3F5A3E; }
        .lp-h1 { font-family: ${font.serif}; font-weight: 500; font-size: clamp(52px, 7.6vw, 92px); line-height: 0.98; letter-spacing: -0.035em; margin: 26px 0 0; }
        .lp-h1 em { font-style: italic; color: #3F5A3E; }
        .lp-sub { font-size: 18px; line-height: 1.65; color: #3A3630; max-width: 470px; margin: 24px 0 0; }
        .lp-hero-ctas { display: flex; align-items: center; gap: 12px; margin-top: 34px; flex-wrap: wrap; }
        .lp-btn-primary { background: #3F5A3E; color: #fff; font-weight: 600; font-size: 14px; padding: 13px 24px; border-radius: 999px; transition: transform .15s, box-shadow .15s; }
        .lp-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 10px 26px rgba(63,90,62,0.3); }
        .lp-badge-soon { font-size: 13px; font-weight: 600; color: #6C675E; background: #F5F2EB; padding: 13px 20px; border-radius: 999px; }
        .lp-trust { margin-top: 26px; font-size: 12.5px; color: #9C9589; letter-spacing: 0.2px; }

        .lp-phone-stage { position: relative; display: flex; justify-content: center; }
        .lp-phone { position: relative; width: 320px; background: #FFFFFF; border: 1px solid rgba(40,36,28,0.1); border-radius: 44px; padding: 22px 18px 30px; box-shadow: 0 40px 90px rgba(27,25,21,0.16), 0 6px 18px rgba(27,25,21,0.06); }
        .lp-phone-notch { width: 110px; height: 24px; background: #1B1915; border-radius: 999px; margin: 0 auto 16px; }
        .lp-phone-month { font-size: 10px; font-weight: 700; letter-spacing: 1.6px; color: #9C9589; }
        .lp-phone-today { font-family: ${font.serif}; font-size: 30px; font-weight: 500; letter-spacing: -0.5px; margin-top: 2px; }
        .lp-spent { background: #F5F2EB; border-radius: 18px; padding: 14px 16px; margin-top: 14px; }
        .lp-spent-label { font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: #6C675E; }
        .lp-spent-amt { font-family: ${font.serif}; font-size: 34px; letter-spacing: -0.5px; margin-top: 2px; }
        .lp-spent-cur { font-size: 20px; color: #6C675E; }
        .lp-spent-dec { color: #9C9589; }
        .lp-rows { margin-top: 14px; display: flex; flex-direction: column; }
        .lp-row { display: flex; align-items: center; gap: 12px; padding: 11px 2px; border-bottom: 0.5px solid rgba(40,36,28,0.07); }
        .lp-row:last-child { border-bottom: none; }
        .lp-row-logo { border-radius: 10px; }
        .lp-row-name { font-weight: 600; font-size: 14px; }
        .lp-chip { display: inline-block; font-size: 10.5px; font-weight: 600; border-radius: 999px; padding: 2px 8px; margin-top: 3px; }
        .lp-row-amt { font-family: ${font.serif}; font-size: 16px; letter-spacing: -0.3px; }
        .lp-mic { position: absolute; left: 50%; transform: translateX(-50%); bottom: -26px; width: 58px; height: 58px; border-radius: 50%; background: #1B1915; display: flex; align-items: center; justify-content: center; box-shadow: 0 14px 30px rgba(27,25,21,0.35); }
        .lp-mic-ring { position: absolute; inset: 0; border-radius: 50%; border: 2px solid rgba(63,90,62,0.5); animation: lp-pulse 2.4s ease-out infinite; }
        .lp-mic-ring2 { animation-delay: 1.2s; }
        .lp-notif { position: absolute; top: -18px; right: -8px; z-index: 2; display: flex; gap: 10px; align-items: center; background: rgba(255,255,255,0.94); backdrop-filter: blur(8px); border: 0.5px solid rgba(40,36,28,0.1); border-radius: 18px; padding: 12px 16px; box-shadow: 0 18px 44px rgba(27,25,21,0.14); max-width: 300px; }
        .lp-notif-title { font-size: 12.5px; font-weight: 700; }
        .lp-notif-body { font-size: 11.5px; color: #6C675E; margin-top: 1px; }

        .lp-marquee-wrap { padding: 20px 0 8px; }
        .lp-marquee-label { text-align: center; font-size: 11px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase; color: #9C9589; margin-bottom: 18px; }
        .lp-marquee { overflow: hidden; -webkit-mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); }
        .lp-marquee-track { display: flex; gap: 44px; width: max-content; padding: 4px 0; animation: lp-scroll 36s linear infinite; }
        .lp-marquee-logo { border-radius: 12px; opacity: 0.85; }

        .lp-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; padding-top: 72px; padding-bottom: 8px; }
        .lp-stat { text-align: center; padding: 10px; }
        .lp-stat-n { font-family: ${font.serif}; font-size: 44px; letter-spacing: -1px; color: #3F5A3E; }
        .lp-stat-label { font-size: 13px; color: #6C675E; margin-top: 4px; line-height: 1.45; }

        .lp-bento { display: grid; grid-template-columns: repeat(6, 1fr); gap: 14px; padding-top: 64px; padding-bottom: 24px; }
        .lp-card { grid-column: span 2; background: #FFFFFF; border: 0.5px solid rgba(40,36,28,0.08); border-radius: 24px; padding: 28px; transition: transform .18s, box-shadow .18s; }
        .lp-card:hover { transform: translateY(-3px); box-shadow: 0 18px 44px rgba(27,25,21,0.08); }
        .lp-card-voice { grid-column: span 4; }
        .lp-card-dark { grid-column: span 6; background: #1B1915; border-color: #1B1915; }
        .lp-kicker { font-size: 11px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: #3F5A3E; }
        .lp-kicker-light { color: #9DBB9C; }
        .lp-h2 { font-family: ${font.serif}; font-weight: 500; font-size: clamp(30px, 4vw, 42px); letter-spacing: -0.8px; margin: 10px 0 0; }
        .lp-h3 { font-family: ${font.serif}; font-weight: 500; font-size: 24px; letter-spacing: -0.4px; margin: 10px 0 0; }
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
        .lp-bubble-figure { font-family: ${font.serif}; font-weight: 600; }

        .lp-plus { padding-top: 72px; padding-bottom: 88px; text-align: center; }
        .lp-prices { display: flex; gap: 14px; justify-content: center; margin-top: 34px; flex-wrap: wrap; }
        .lp-price { position: relative; background: #FFFFFF; border: 0.5px solid rgba(40,36,28,0.1); border-radius: 24px; padding: 30px 40px; min-width: 240px; }
        .lp-price-hero { background: #3F5A3E; color: #FBFAF7; border-color: #3F5A3E; box-shadow: 0 24px 60px rgba(63,90,62,0.28); }
        .lp-price-flag { position: absolute; top: -13px; left: 50%; transform: translateX(-50%); background: #1B1915; color: #FBFAF7; font-size: 11px; font-weight: 700; padding: 5px 14px; border-radius: 999px; white-space: nowrap; }
        .lp-price-name { font-size: 13px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; opacity: 0.75; }
        .lp-price-amt { font-family: ${font.serif}; font-size: 42px; letter-spacing: -1px; margin-top: 8px; }
        .lp-price-amt span { font-size: 15px; font-family: ${font.sans}; opacity: 0.7; letter-spacing: 0; }
        .lp-price-trial { font-size: 13px; font-weight: 600; margin-top: 8px; opacity: 0.85; }
        .lp-fineprint { font-size: 12px; color: #9C9589; margin-top: 22px; }

        .lp-footer { border-top: 0.5px solid rgba(40,36,28,0.08); padding: 36px 0 28px; }
        .lp-footer-top { display: flex; justify-content: space-between; align-items: center; gap: 18px; flex-wrap: wrap; }
        .lp-footer-links { display: flex; gap: 22px; font-size: 13.5px; }
        .lp-footer-links a { color: #6C675E; }
        .lp-footer-links a:hover { color: #1B1915; }
        .lp-footer-word { font-family: ${font.serif}; font-size: clamp(90px, 16vw, 200px); line-height: 1; letter-spacing: -0.04em; color: #3F5A3E; opacity: 0.07; text-align: center; margin: 10px 0 0; user-select: none; }
        .lp-footer-bottom { text-align: center; font-size: 12.5px; color: #9C9589; margin-top: 6px; }

        @keyframes lp-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        .lp-rise { opacity: 0; animation: lp-rise .7s cubic-bezier(.2,.7,.3,1) forwards; }
        @keyframes lp-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        .lp-float { animation: lp-float 5s ease-in-out infinite; }
        @keyframes lp-pulse { 0% { transform: scale(1); opacity: .7; } 100% { transform: scale(1.9); opacity: 0; } }
        @keyframes lp-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes lp-wave { 0%,100% { height: 26%; } 50% { height: 92%; } }

        @media (max-width: 920px) {
          .lp-hero { padding: 56px 0 72px; }
          .lp-hero-grid { grid-template-columns: 1fr; gap: 72px; }
          .lp-sub { max-width: none; }
          .lp-stats { grid-template-columns: repeat(2, 1fr); }
          .lp-card, .lp-card-voice, .lp-card-dark { grid-column: span 6; }
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
