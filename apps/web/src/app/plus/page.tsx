import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { MurmurMark } from '../../components/MurmurMark'
import { PlusQr } from '../../components/PlusQr'
import { APP_STORE_ID, APP_STORE_URL, plusDeepLink } from '../../lib/links'

/**
 * itsmurmur.com/plus: where the QR code on the Plus screen lands (Oct 23
 * 2026). On an iPhone it opens Murmur on its Plus screen; Safari's Smart
 * App Banner (the `itunes` metadata) offers the same, or the App Store
 * when the app is not installed. Anywhere else it shows the code again,
 * because Plus is sold in the iPhone app.
 *
 * No auto-redirect to the app on load: Safari shows an "address is
 * invalid" alert for a custom scheme when the app is missing, which is
 * worse than one tap on a clear button.
 */
export const metadata: Metadata = {
  title: 'Murmur Plus',
  description:
    'Open Murmur on your iPhone to start Plus. Your account unlocks on the web and the desktop app too.',
  itunes: { appId: APP_STORE_ID, appArgument: plusDeepLink('web_qr') },
}

export default async function PlusPage() {
  const ua = (await headers()).get('user-agent') ?? ''
  const onIPhone = /iPhone|iPod/.test(ua)

  return (
    <main className="mpp">
      <style>{CSS}</style>
      <div className="mpp-col">
        <div className="mpp-mark">
          <MurmurMark size={68} variant="sage" />
        </div>
        <span className="mpp-eyebrow">Murmur Plus</span>
        {onIPhone ? (
          <>
            <h1 className="mpp-title">Start Plus in Murmur</h1>
            <p className="mpp-body">
              Plus adds the web and desktop apps, Ask Murmur, recurring detection and reports. Start
              it in the app; your account unlocks everywhere.
            </p>
            <a className="mpp-btn" href={plusDeepLink('web_qr')}>
              Open Murmur
            </a>
            <a className="mpp-link" href={APP_STORE_URL} rel="noreferrer">
              No app yet? Get it on the App Store
            </a>
          </>
        ) : (
          <>
            <h1 className="mpp-title">Open this on your iPhone</h1>
            <p className="mpp-body">
              Plus is sold in the Murmur iPhone app. Scan the code with your iPhone camera; it opens
              Murmur straight on Plus.
            </p>
            <div className="mpp-qr">
              <PlusQr size={168} />
            </div>
            <a className="mpp-link" href={APP_STORE_URL} rel="noreferrer">
              Murmur on the App Store
            </a>
          </>
        )}
      </div>
    </main>
  )
}

const SANS = '-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif'
const CSS = `
.mpp{min-height:100dvh;display:grid;place-items:center;padding:48px 16px;background:radial-gradient(90% 60% at 50% 0%,#FBFAF7 0%,#F4F1EA 70%)}
.mpp-col{width:100%;max-width:400px;display:flex;flex-direction:column;align-items:center;text-align:center;animation:mpp-in .5s cubic-bezier(.2,.8,.2,1) backwards}
.mpp-mark{line-height:0;border-radius:18px;box-shadow:0 1px 2px rgba(40,36,28,.08),0 14px 34px -12px rgba(63,90,62,.45)}
.mpp-eyebrow{margin-top:22px;font:600 11.5px/1 ${SANS};letter-spacing:.08em;text-transform:uppercase;color:#3F5A3E}
.mpp-title{margin:10px 0 0;font-family:"New York","Iowan Old Style",Georgia,"Times New Roman",serif;font-weight:500;font-size:32px;line-height:1.12;letter-spacing:-.02em;color:#1B1915;text-wrap:balance}
.mpp-body{margin:12px 0 0;font:400 15.5px/1.6 ${SANS};color:#6C675E;text-wrap:pretty}
.mpp-btn{margin-top:28px;width:100%;display:flex;align-items:center;justify-content:center;padding:16px 20px;border-radius:14px;background:#3F5A3E;color:#FBFAF7;text-decoration:none;font:600 16.5px/1 ${SANS};box-shadow:0 1px 2px rgba(40,36,28,.12),0 10px 24px -10px rgba(63,90,62,.6);transition:transform .15s ease,background .15s ease}
.mpp-btn:active{transform:scale(.98);background:#36503A}
.mpp-link{margin-top:16px;padding:6px;font:500 14px/1.3 ${SANS};color:#6C675E;text-decoration:none}
.mpp-link:hover{color:#1B1915;text-decoration:underline;text-underline-offset:3px}
.mpp-btn:focus-visible,.mpp-link:focus-visible{outline:2px solid #3F5A3E;outline-offset:3px}
.mpp-qr{margin-top:26px;padding:14px;border-radius:16px;background:#FFFFFF;border:1px solid rgba(40,36,28,.08);box-shadow:0 1px 2px rgba(40,36,28,.04),0 18px 40px -20px rgba(40,36,28,.25)}
@keyframes mpp-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.mpp-col{animation:none}}
`
