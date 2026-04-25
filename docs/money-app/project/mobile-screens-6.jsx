// Mobile screens v3: Sign-in & account screens.
// These were added after the initial mockup round.
//
// Philosophy: no sign-in wall. Identity is LAZY — created only when
// the user asks for something that needs it (desktop pairing,
// restore on new phone). Sign in with Apple is the primary method.
//
// Exports: S_SignInPrompt, S_SignInApple, S_PairDesktop_QR, S_PairDesktop_Success,
//          S_Account, S_RestoreDevice

// ─── Screen 30: Contextual sign-in prompt ──────────────────────
// Shown when the user first tries something that needs an account.
// Example trigger: they tap "Sync to Mac" or "Restore from another phone"
function S_SignInPrompt() {
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      {/* faux modal over settings */}
      <div style={{ flex:1, background: 'rgba(20,18,14,0.35)', position:'relative' }}>
        <div style={{
          position:'absolute', left: 10, right: 10, bottom: 10,
          background:'#fff', borderRadius: 28, padding:'28px 24px 20px',
          boxShadow:'0 -20px 40px rgba(0,0,0,0.08)',
        }}>
          <div style={{ display:'flex', justifyContent:'center', marginBottom: 14 }}>
            <div style={{ width: 44, height: 4, borderRadius: 2, background: T.surface2 }}/>
          </div>
          {/* key icon */}
          <div style={{ display:'flex', justifyContent:'center' }}>
            <div style={{
              width: 60, height: 60, borderRadius: 18, background: T.accentSoft,
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <circle cx="9" cy="12" r="4" stroke={T.accent} strokeWidth="1.8"/>
                <path d="M13 12h8M17 12v4M21 12v3" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
          <div style={{ fontFamily: T.fSerif, fontSize: 28, fontWeight: 500, color: T.ink,
            letterSpacing: -0.5, textAlign:'center', marginTop: 16, lineHeight: 1.2 }}>
            Sign in to continue
          </div>
          <div style={{ fontSize: 14.5, color: T.ink3, lineHeight: 1.5, textAlign:'center',
            marginTop: 10, padding: '0 10px' }}>
            You'll need an account to pair your Mac. One tap with Apple — no email, no password.
          </div>

          {/* context card — what you just tried to do */}
          <div style={{
            marginTop: 20, padding:'12px 14px', background: T.surface2, borderRadius: 14,
            display:'flex', alignItems:'center', gap: 12,
          }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background:'#fff',
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="4" width="20" height="13" rx="2" stroke={T.ink2} strokeWidth="1.6"/>
                <path d="M8 21h8M12 17v4" stroke={T.ink2} strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: T.ink4, fontWeight: 600, textTransform:'uppercase', letterSpacing: 0.4 }}>
                You were about to
              </div>
              <div style={{ fontSize: 14, color: T.ink, fontWeight: 600, marginTop: 2 }}>
                Pair Murmur for Mac
              </div>
            </div>
          </div>

          {/* SIWA button — official Apple pattern */}
          <button style={{
            marginTop: 18, width:'100%', padding:'14px 16px', borderRadius: 12,
            background:'#000', color:'#fff', border:'none', fontWeight: 600,
            fontSize: 15, display:'flex', alignItems:'center', justifyContent:'center', gap: 8,
            fontFamily: T.fSans, cursor:'pointer',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
              <path d="M17.1 12.8c0-2.8 2.3-4.1 2.4-4.2-1.3-1.9-3.4-2.2-4.1-2.2-1.7-.2-3.4 1-4.3 1-.9 0-2.3-1-3.7-1-1.9 0-3.7 1.1-4.7 2.9-2 3.5-.5 8.7 1.4 11.5 1 1.4 2.1 2.9 3.5 2.9 1.4-.1 1.9-.9 3.6-.9s2.2.9 3.7.9c1.5 0 2.5-1.4 3.5-2.8 1.1-1.6 1.5-3.2 1.5-3.3-.1-.1-2.9-1.1-2.9-4.3zM14.5 4.2c.7-.9 1.3-2.1 1.1-3.4-1.1.1-2.4.8-3.1 1.7-.7.8-1.3 2.1-1.1 3.3 1.2.1 2.4-.6 3.1-1.6z"/>
            </svg>
            Sign in with Apple
          </button>

          {/* secondary — email fallback */}
          <div style={{ marginTop: 12, textAlign:'center' }}>
            <span style={{ fontSize: 13, color: T.ink3 }}>
              or <span style={{ color: T.accent, fontWeight: 700 }}>use email instead</span>
            </span>
          </div>

          {/* cancel */}
          <div style={{ marginTop: 18, textAlign:'center' }}>
            <span style={{ fontSize: 14, color: T.ink3, fontWeight: 600 }}>Not now</span>
          </div>

          {/* privacy footnote */}
          <div style={{ marginTop: 16, padding:'10px 12px', background: T.accentSoft,
            borderRadius: 10, display:'flex', gap: 8, alignItems:'flex-start' }}>
            {Icon.lock(T.accent, 13)}
            <div style={{ fontSize: 11.5, color: T.ink2, lineHeight: 1.4 }}>
              Your email is hidden from us. Your expense data stays on your device and in your own iCloud.
            </div>
          </div>
        </div>
      </div>
    </BareDevice>
  );
}

// ─── Screen 31: Apple's system Sign in with Apple sheet ────────
// The half-sheet triggered by iOS itself. We can't restyle this much,
// so we show an accurate-ish facsimile for design context.
function S_SignInApple() {
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      {/* dimmed app behind */}
      <div style={{ flex:1, background:'#000', position:'relative' }}>
        <div style={{ position:'absolute', inset: 0,
          background:'linear-gradient(180deg, rgba(0,0,0,0.5), rgba(0,0,0,0.75))' }}/>

        {/* SIWA modal sheet */}
        <div style={{
          position:'absolute', left: 12, right: 12, bottom: 14,
          background:'#F2F2F6', borderRadius: 14, overflow:'hidden',
          fontFamily: T.fSans,
        }}>
          {/* handle + apple logo header */}
          <div style={{ padding:'16px 16px 8px', display:'flex', alignItems:'center', gap: 8 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#000">
              <path d="M17.1 12.8c0-2.8 2.3-4.1 2.4-4.2-1.3-1.9-3.4-2.2-4.1-2.2-1.7-.2-3.4 1-4.3 1-.9 0-2.3-1-3.7-1-1.9 0-3.7 1.1-4.7 2.9-2 3.5-.5 8.7 1.4 11.5 1 1.4 2.1 2.9 3.5 2.9 1.4-.1 1.9-.9 3.6-.9s2.2.9 3.7.9c1.5 0 2.5-1.4 3.5-2.8 1.1-1.6 1.5-3.2 1.5-3.3-.1-.1-2.9-1.1-2.9-4.3zM14.5 4.2c.7-.9 1.3-2.1 1.1-3.4-1.1.1-2.4.8-3.1 1.7-.7.8-1.3 2.1-1.1 3.3 1.2.1 2.4-.6 3.1-1.6z"/>
            </svg>
            <div style={{ fontSize: 15, fontWeight: 700, color:'#000' }}>Sign In with Apple</div>
            <div style={{ flex: 1 }}/>
            <div style={{ fontSize: 15, color:'#007AFF', fontWeight: 500 }}>Cancel</div>
          </div>
          <div style={{ padding:'0 16px 12px' }}>
            <div style={{ fontSize: 13.5, color:'#3C3C43', lineHeight: 1.35 }}>
              Use your Apple Account “<b>jordan@icloud.com</b>” to sign in to <b>Murmur</b>?
            </div>
          </div>
          <div style={{ height: 1, background:'rgba(60,60,67,0.15)', margin:'0 0' }}/>

          {/* name row */}
          <div style={{ padding:'12px 16px', display:'flex', alignItems:'center', gap: 12 }}>
            <div style={{ width: 26, height: 26, borderRadius: 13, background:'#D1D1D6',
              display:'flex', alignItems:'center', justifyContent:'center', fontSize: 12, fontWeight: 700, color:'#636366' }}>J</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color:'#8E8E93', fontWeight: 500 }}>Name</div>
              <div style={{ fontSize: 15, color:'#000', fontWeight: 500 }}>Jordan Miles</div>
            </div>
            {Icon.chev('#C7C7CC', 13)}
          </div>
          <div style={{ height: 1, background:'rgba(60,60,67,0.15)', margin:'0 16px' }}/>

          {/* email row */}
          <div style={{ padding:'12px 16px', display:'flex', alignItems:'flex-start', gap: 12 }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="#636366" strokeWidth="1.6"/>
              <path d="M4 7l8 6 8-6" stroke="#636366" strokeWidth="1.6"/>
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color:'#8E8E93', fontWeight: 500 }}>Share My Email</div>
              <div style={{ fontSize: 15, color:'#000', fontWeight: 500 }}>jordan@icloud.com</div>
              <div style={{ marginTop: 4, fontSize: 13, color:'#007AFF', fontWeight: 500 }}>Hide My Email</div>
            </div>
          </div>

          {/* explanation */}
          <div style={{ padding:'0 16px 14px', fontSize: 12, color:'#636366', lineHeight: 1.4 }}>
            Apple will create a unique address that forwards to your real one. Murmur will never see it.
          </div>

          {/* continue cta */}
          <div style={{ padding:'0 12px 14px' }}>
            <button style={{
              width:'100%', padding:'14px', borderRadius: 12,
              background:'#000', color:'#fff', border:'none', fontWeight: 600, fontSize: 16,
              fontFamily: T.fSans, display:'flex', alignItems:'center', justifyContent:'center', gap: 8,
            }}>
              {Icon.lock('#fff', 14)}
              Continue with Face ID
            </button>
          </div>
        </div>
      </div>
    </BareDevice>
  );
}

// ─── Screen 32: Pair desktop via QR ────────────────────────────
function S_PairDesktop_QR() {
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      {/* top bar */}
      <div style={{ padding:'8px 16px', display:'flex', alignItems:'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: 18, background: T.surface,
          border:`0.5px solid ${T.line}`,
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24"><path d="M14 6l-6 6 6 6" stroke={T.ink2} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <div style={{ flex: 1, textAlign:'center', fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: -0.1 }}>
          Pair your Mac
        </div>
        <div style={{ width: 36 }}/>
      </div>

      <div style={{ padding:'14px 24px 0' }}>
        <div style={{ fontFamily: T.fSerif, fontSize: 28, fontWeight: 500, color: T.ink,
          letterSpacing: -0.5, lineHeight: 1.2 }}>
          Scan this on<br/>your Mac.
        </div>
        <div style={{ fontSize: 14.5, color: T.ink3, lineHeight: 1.5, marginTop: 10 }}>
          Open Murmur for Mac and point its camera here. The code rotates every 60 seconds.
        </div>
      </div>

      {/* QR container */}
      <div style={{ padding:'24px 20px 0', display:'flex', justifyContent:'center' }}>
        <div style={{
          width: 260, height: 260, background:'#fff', borderRadius: 28,
          padding: 20, border:`0.5px solid ${T.line}`,
          boxShadow:'0 10px 30px rgba(40,36,28,0.08)',
          position:'relative',
        }}>
          <QRCode/>
          {/* center logo */}
          <div style={{
            position:'absolute', top:'50%', left:'50%',
            transform:'translate(-50%,-50%)',
            width: 48, height: 48, borderRadius: 14, background: T.accent,
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 4px 14px rgba(63,90,62,0.35)',
          }}>
            {Icon.mic('#fff', 24)}
          </div>
        </div>
      </div>

      {/* countdown */}
      <div style={{ padding:'14px 0 0', textAlign:'center' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap: 8,
          padding:'6px 12px', background: T.surface, borderRadius: 999,
          border:`0.5px solid ${T.line}` }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: T.accent,
            boxShadow:`0 0 0 4px rgba(63,90,62,0.18)` }}/>
          <span style={{ fontSize: 12.5, color: T.ink2, fontWeight: 600, fontVariantNumeric:'tabular-nums' }}>
            Code expires in 0:47
          </span>
        </div>
      </div>

      {/* fallback code */}
      <div style={{ padding:'20px 24px 0', textAlign:'center' }}>
        <div style={{ fontSize: 12, color: T.ink4, fontWeight: 700, letterSpacing: 0.6, textTransform:'uppercase' }}>
          Or type this code
        </div>
        <div style={{ marginTop: 8, fontFamily: T.fMono, fontSize: 28, fontWeight: 700,
          color: T.ink, letterSpacing: 4, fontVariantNumeric:'tabular-nums' }}>
          7K4·9B2
        </div>
      </div>

      <div style={{ flex: 1 }}/>

      {/* footer */}
      <div style={{ padding:'0 20px 30px', textAlign:'center' }}>
        <div style={{ fontSize: 13, color: T.ink3, fontWeight: 500 }}>
          Don't have Mac app? <span style={{ color: T.accent, fontWeight: 700 }}>Get it at murmur.app</span>
        </div>
      </div>
    </BareDevice>
  );
}

// A decorative QR — not a real one, just recognizable as one
function QRCode() {
  // deterministic "random" pattern
  const cells = 21;
  const seed = [
    '111111101101011111111','100000101011001000001','101110100110001011101',
    '101110101011111011101','101110101010011011101','100000101001001000001',
    '111111101010101111111','000000001110010000000','110111110011110110100',
    '001010010101001101010','110110111110110110110','101010010101001010100',
    '010111100011101111010','000000001101001010010','111111101001011011010',
    '100000100011010010100','101110101100110111110','101110101010101010010',
    '101110100011011011100','100000101101001010000','111111101010110110110',
  ];
  return (
    <svg viewBox={`0 0 ${cells} ${cells}`} width="100%" height="100%" shapeRendering="crispEdges">
      {seed.map((row, y) =>
        row.split('').map((c, x) => c === '1' ? (
          <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#1B1915"/>
        ) : null)
      )}
      {/* three corner finders — overlay clean shapes */}
      {[[0,0],[14,0],[0,14]].map(([fx,fy],i)=>(
        <g key={i}>
          <rect x={fx} y={fy} width="7" height="7" fill="#1B1915"/>
          <rect x={fx+1} y={fy+1} width="5" height="5" fill="#fff"/>
          <rect x={fx+2} y={fy+2} width="3" height="3" fill="#1B1915"/>
        </g>
      ))}
    </svg>
  );
}

// ─── Screen 33: Pair desktop — success ─────────────────────────
function S_PairDesktop_Success() {
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      <div style={{ flex: 1, padding:'40px 24px 0',
        display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center' }}>

        {/* big success badge with sparkle */}
        <div style={{
          width: 120, height: 120, borderRadius: 60, background: T.accentSoft,
          display:'flex', alignItems:'center', justifyContent:'center', position:'relative',
        }}>
          <div style={{
            width: 80, height: 80, borderRadius: 40, background: T.accent,
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 10px 28px rgba(63,90,62,0.38)',
          }}>
            {Icon.check('#fff', 36)}
          </div>
          {/* decorative dots */}
          <span style={{ position:'absolute', top: 4, right: 12, width: 6, height: 6, borderRadius: 3, background: T.accent, opacity: 0.45 }}/>
          <span style={{ position:'absolute', bottom: 12, left: 4, width: 4, height: 4, borderRadius: 2, background: T.accent, opacity: 0.35 }}/>
          <span style={{ position:'absolute', top: 20, left: 2, width: 5, height: 5, borderRadius: 2.5, background: T.accent, opacity: 0.5 }}/>
        </div>

        <div style={{ fontFamily: T.fSerif, fontSize: 34, fontWeight: 500, color: T.ink,
          letterSpacing: -0.5, marginTop: 28, lineHeight: 1.15 }}>
          Mac paired.
        </div>
        <div style={{ fontSize: 15, color: T.ink3, lineHeight: 1.5, marginTop: 10, padding:'0 18px' }}>
          Your 184 expenses are syncing to <b>Jordan's MacBook Air</b>. Usually takes under 30 seconds.
        </div>

        {/* device cards */}
        <div style={{ marginTop: 32, width:'100%',
          background:'#fff', borderRadius: 22, padding:'16px 16px',
          border:`0.5px solid ${T.line}` }}>
          <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
            <DeviceIcon kind="phone"/>
            <div style={{ flex: 1, textAlign:'left' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>iPhone 15 Pro</div>
              <div style={{ fontSize: 12, color: T.ink3 }}>This device · Signed in</div>
            </div>
            <span style={{ padding:'3px 8px', borderRadius: 999, background: T.accentSoft,
              color: T.accent, fontSize: 11, fontWeight: 700, letterSpacing: 0.2 }}>Primary</span>
          </div>
          <div style={{ height: 1, background: T.line, margin:'14px 0' }}/>
          <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
            <DeviceIcon kind="mac"/>
            <div style={{ flex: 1, textAlign:'left' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>Jordan's MacBook Air</div>
              <div style={{ fontSize: 12, color: T.ink3 }}>
                <span style={{ color: T.accent, fontWeight: 700 }}>● Syncing</span> · 142 of 184
              </div>
            </div>
            <div style={{ width: 32, height: 4, background: T.surface2, borderRadius: 2, overflow:'hidden' }}>
              <div style={{ width:'77%', height:'100%', background: T.accent }}/>
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }}/>
        <button style={{
          width:'100%', padding:'15px', borderRadius: 14,
          background: T.ink, color:'#fff', border:'none', fontWeight: 700,
          fontSize: 15, fontFamily: T.fSans, marginBottom: 12,
        }}>
          Done
        </button>
        <div style={{ fontSize: 13, color: T.ink3, marginBottom: 20 }}>
          Manage devices in <span style={{ color: T.accent, fontWeight: 700 }}>Settings</span>
        </div>
      </div>
    </BareDevice>
  );
}

function DeviceIcon({ kind }) {
  const size = 40;
  if (kind === 'phone') return (
    <div style={{ width: size, height: size, borderRadius: 10, background: T.surface2,
      display:'flex', alignItems:'center', justifyContent:'center' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="6" y="2" width="12" height="20" rx="3" stroke={T.ink2} strokeWidth="1.6"/>
        <path d="M10 19h4" stroke={T.ink2} strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    </div>
  );
  return (
    <div style={{ width: size, height: size, borderRadius: 10, background: T.surface2,
      display:'flex', alignItems:'center', justifyContent:'center' }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="12" rx="1.5" stroke={T.ink2} strokeWidth="1.6"/>
        <path d="M1 19h22M10 16l-1 3M14 16l1 3" stroke={T.ink2} strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

// ─── Screen 34: Account screen (Settings > Account) ────────────
// Only appears after user has signed in.
function S_Account() {
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      {/* top bar */}
      <div style={{ padding:'8px 16px', display:'flex', alignItems:'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: 18, background: T.surface,
          border:`0.5px solid ${T.line}`,
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24"><path d="M14 6l-6 6 6 6" stroke={T.ink2} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <div style={{ flex: 1, textAlign:'center', fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: -0.1 }}>
          Account
        </div>
        <div style={{ width: 36 }}/>
      </div>

      <div style={{ flex:1, overflow:'auto', padding:'10px 16px 40px' }}>
        {/* profile hero */}
        <div style={{ padding:'22px 18px', background: T.surface, borderRadius: 22,
          border:`0.5px solid ${T.line}` }}>
          <div style={{ display:'flex', alignItems:'center', gap: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: 28,
              background:`linear-gradient(135deg, ${T.accent}, #6B8A6A)`,
              color:'#fff', display:'flex', alignItems:'center', justifyContent:'center',
              fontFamily: T.fDisp, fontSize: 22, fontWeight: 700 }}>J</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: T.ink, letterSpacing: -0.2 }}>
                Jordan Miles
              </div>
              <div style={{ fontSize: 12.5, color: T.ink3, marginTop: 2,
                display:'inline-flex', alignItems:'center', gap: 5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#000">
                  <path d="M17.1 12.8c0-2.8 2.3-4.1 2.4-4.2-1.3-1.9-3.4-2.2-4.1-2.2-1.7-.2-3.4 1-4.3 1-.9 0-2.3-1-3.7-1-1.9 0-3.7 1.1-4.7 2.9-2 3.5-.5 8.7 1.4 11.5 1 1.4 2.1 2.9 3.5 2.9 1.4-.1 1.9-.9 3.6-.9s2.2.9 3.7.9c1.5 0 2.5-1.4 3.5-2.8 1.1-1.6 1.5-3.2 1.5-3.3-.1-.1-2.9-1.1-2.9-4.3zM14.5 4.2c.7-.9 1.3-2.1 1.1-3.4-1.1.1-2.4.8-3.1 1.7-.7.8-1.3 2.1-1.1 3.3 1.2.1 2.4-.6 3.1-1.6z"/>
                </svg>
                Signed in with Apple
              </div>
            </div>
          </div>
          {/* masked email row */}
          <div style={{
            marginTop: 14, padding:'10px 12px',
            background: T.surface2, borderRadius: 12,
            display:'flex', alignItems:'center', gap: 10,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke={T.ink3} strokeWidth="1.6"/>
              <path d="M4 7l8 6 8-6" stroke={T.ink3} strokeWidth="1.6"/>
            </svg>
            <div style={{ flex: 1, fontSize: 12.5, color: T.ink2, fontFamily: T.fMono, letterSpacing: -0.2 }}>
              k9mjp2r8q1@privaterelay.apple
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.accent, letterSpacing: 0.3,
              padding:'2px 6px', background: T.accentSoft, borderRadius: 4 }}>HIDDEN</span>
          </div>
        </div>

        {/* plan card */}
        <SectionLabel>Plan</SectionLabel>
        <div style={{ background: T.surface, borderRadius: 18, border:`0.5px solid ${T.line}`,
          padding:'16px 16px', display:'flex', alignItems:'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: T.ink,
            display:'flex', alignItems:'center', justifyContent:'center' }}>
            {Icon.sparkle('#fff', 18)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: T.ink }}>Murmur Plus</div>
            <div style={{ fontSize: 12, color: T.ink3, marginTop: 2 }}>Yearly · Renews Mar 12, 2026</div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.accent }}>Manage</span>
        </div>

        {/* devices */}
        <SectionLabel>Devices · 2 active</SectionLabel>
        <div style={{ background: T.surface, borderRadius: 18, border:`0.5px solid ${T.line}`,
          overflow:'hidden' }}>
          <DeviceRow name="iPhone 15 Pro" meta="This device · iOS 17.4" current primary/>
          <Sep/>
          <DeviceRow name="Jordan's MacBook Air" meta="Last synced 2 min ago · macOS 14.3" />
          <Sep/>
          <div style={{ padding:'14px 16px', fontSize: 14, color: T.accent, fontWeight: 600 }}>
            + Pair another device
          </div>
        </div>

        {/* data controls */}
        <SectionLabel>Your data</SectionLabel>
        <div style={{ background: T.surface, borderRadius: 18, border:`0.5px solid ${T.line}`,
          overflow:'hidden' }}>
          <ListRow label="Export all transactions" hint="CSV · JSON"/>
          <Sep/>
          <ListRow label="Restore from iCloud"/>
          <Sep/>
          <ListRow label="Delete all cloud data" destructive/>
        </div>

        {/* sign out */}
        <div style={{ marginTop: 20, textAlign:'center' }}>
          <div style={{ fontSize: 14, color: T.ink3, fontWeight: 600, padding: 10 }}>
            Sign out of Murmur
          </div>
          <div style={{ marginTop: 6, fontSize: 11.5, color: T.ink4, lineHeight: 1.4, padding:'0 30px' }}>
            Signing out stops syncing. Your local data stays on this phone.
          </div>
        </div>
      </div>
    </BareDevice>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ padding:'22px 4px 8px', fontSize: 11.5, fontWeight: 700,
      color: T.ink4, letterSpacing: 0.8, textTransform:'uppercase' }}>{children}</div>
  );
}
function Sep() { return <div style={{ height: 1, background: T.line, margin:'0 16px' }}/>; }
function ListRow({ label, hint, destructive }) {
  return (
    <div style={{ padding:'13px 16px', display:'flex', alignItems:'center', gap: 10 }}>
      <div style={{ flex: 1, fontSize: 14.5, fontWeight: 500,
        color: destructive ? '#B8352F' : T.ink }}>{label}</div>
      {hint && <div style={{ fontSize: 12, color: T.ink4, fontWeight: 600 }}>{hint}</div>}
      {Icon.chev(T.ink4, 13)}
    </div>
  );
}
function DeviceRow({ name, meta, primary, current }) {
  return (
    <div style={{ padding:'13px 16px', display:'flex', alignItems:'center', gap: 12 }}>
      <DeviceIcon kind={name.includes('Mac') ? 'mac' : 'phone'}/>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: T.ink,
          display:'flex', alignItems:'center', gap: 6 }}>
          {name}
          {current && <span style={{ fontSize: 10, fontWeight: 700, color: T.accent,
            padding:'2px 6px', background: T.accentSoft, borderRadius: 4, letterSpacing: 0.3 }}>THIS DEVICE</span>}
        </div>
        <div style={{ fontSize: 12, color: T.ink3, marginTop: 2 }}>{meta}</div>
      </div>
      {primary && <span style={{ fontSize: 11, color: T.ink4, fontWeight: 600 }}>Primary</span>}
    </div>
  );
}

// ─── Screen 35: Restore on new device ──────────────────────────
function S_RestoreDevice() {
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      <div style={{ padding:'14px 24px 0' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: T.accentSoft,
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M4 12a8 8 0 0114.4-4.8M20 12a8 8 0 01-14.4 4.8" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M17 4v4h-4M7 20v-4h4" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ fontFamily: T.fSerif, fontSize: 32, fontWeight: 500, color: T.ink,
          letterSpacing: -0.5, lineHeight: 1.2, marginTop: 18 }}>
          Welcome back.
        </div>
        <div style={{ fontSize: 14.5, color: T.ink3, lineHeight: 1.5, marginTop: 10 }}>
          Looks like a new phone. If you used Murmur before, restore your expenses here.
        </div>
      </div>

      {/* two option cards */}
      <div style={{ padding:'28px 20px 0', display:'flex', flexDirection:'column', gap: 10 }}>
        {/* primary — iCloud auto */}
        <div style={{
          padding:'18px 18px', background:'#fff', borderRadius: 20,
          border:`1.5px solid ${T.accent}`,
          boxShadow:'0 8px 24px rgba(63,90,62,0.12)',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: T.accentSoft,
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M6 19a4 4 0 010-8 5 5 0 019.8-1.2A4 4 0 0119 19H6z" stroke={T.accent} strokeWidth="1.7" strokeLinejoin="round"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, letterSpacing: -0.2 }}>
                Restore from iCloud
              </div>
              <div style={{ fontSize: 12.5, color: T.ink3, marginTop: 2 }}>
                184 transactions found · Apr 2024–today
              </div>
            </div>
            <span style={{ padding:'3px 8px', borderRadius: 999, background: T.accentSoft,
              color: T.accent, fontSize: 10, fontWeight: 700, letterSpacing: 0.3 }}>RECOMMENDED</span>
          </div>
          <button style={{
            marginTop: 14, width:'100%', padding:'12px', borderRadius: 11,
            background: T.accent, color:'#fff', border:'none', fontWeight: 700,
            fontSize: 14, fontFamily: T.fSans,
          }}>
            Restore in seconds
          </button>
        </div>

        {/* secondary — sign in */}
        <div style={{
          padding:'16px 18px', background:'#fff', borderRadius: 20,
          border:`0.5px solid ${T.line}`,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: T.surface2,
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#000">
                <path d="M17.1 12.8c0-2.8 2.3-4.1 2.4-4.2-1.3-1.9-3.4-2.2-4.1-2.2-1.7-.2-3.4 1-4.3 1-.9 0-2.3-1-3.7-1-1.9 0-3.7 1.1-4.7 2.9-2 3.5-.5 8.7 1.4 11.5 1 1.4 2.1 2.9 3.5 2.9 1.4-.1 1.9-.9 3.6-.9s2.2.9 3.7.9c1.5 0 2.5-1.4 3.5-2.8 1.1-1.6 1.5-3.2 1.5-3.3-.1-.1-2.9-1.1-2.9-4.3zM14.5 4.2c.7-.9 1.3-2.1 1.1-3.4-1.1.1-2.4.8-3.1 1.7-.7.8-1.3 2.1-1.1 3.3 1.2.1 2.4-.6 3.1-1.6z"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, letterSpacing: -0.2 }}>
                Sign in with Apple
              </div>
              <div style={{ fontSize: 12.5, color: T.ink3, marginTop: 2 }}>
                Restore from Murmur's sync server
              </div>
            </div>
          </div>
        </div>

        {/* fresh start */}
        <div style={{
          padding:'16px 18px', background:'transparent', borderRadius: 20,
          border:`0.5px dashed ${T.lineHard}`,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: T.surface2,
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              {Icon.plus(T.ink2, 18)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, letterSpacing: -0.2 }}>
                Start fresh
              </div>
              <div style={{ fontSize: 12.5, color: T.ink3, marginTop: 2 }}>
                No previous data to restore
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }}/>
      <div style={{ padding:'0 30px 26px', textAlign:'center' }}>
        <div style={{ fontSize: 11.5, color: T.ink4, lineHeight: 1.4,
          display:'inline-flex', alignItems:'center', gap: 6 }}>
          {Icon.lock(T.ink4, 12)}
          Your data is end-to-end encrypted with your Apple ID key.
        </div>
      </div>
    </BareDevice>
  );
}

Object.assign(window, {
  S_SignInPrompt, S_SignInApple, S_PairDesktop_QR,
  S_PairDesktop_Success, S_Account, S_RestoreDevice,
});
