// Mobile screens for Murmur
// All screens rendered inside IOSDevice (402x874). Uses tokens + iOS frame.

// ─── Shared: custom status bar overlay for when we don't want iOS nav ───
function BareDevice({ children, dark=false }) {
  return (
    <div style={{
      width: 402, height: 874, borderRadius: 48, overflow: 'hidden',
      position: 'relative', background: dark ? '#0B0B0C' : T.bg,
      boxShadow: '0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)',
      fontFamily: T.fSans, WebkitFontSmoothing: 'antialiased',
    }}>
      <div style={{
        position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)',
        width: 126, height: 37, borderRadius: 24, background: '#000', zIndex: 50,
      }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
        <IOSStatusBar dark={dark} />
      </div>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 60,
        height: 34, display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
        paddingBottom: 8, pointerEvents: 'none',
      }}>
        <div style={{
          width: 139, height: 5, borderRadius: 100,
          background: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)',
        }} />
      </div>
    </div>
  );
}

// ─── Bottom tab bar: Today · Insights · [Mic FAB] · Budgets · More ──────────
// 5 slots, centered FAB. The FAB sits in the nav bar background, not floating.
function TabBar({ active='today' }) {
  // Icons
  const iMore = (c, s=22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <circle cx="6" cy="12" r="1.6" fill={c}/>
      <circle cx="12" cy="12" r="1.6" fill={c}/>
      <circle cx="18" cy="12" r="1.6" fill={c}/>
    </svg>
  );
  const iBudget = (c, s=22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8.5" stroke={c} strokeWidth="1.8"/>
      <path d="M12 3.5v8.5l6 3.2" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
  return (
    <div style={{
      position:'absolute', bottom: 24, left: 16, right: 16, zIndex: 40,
      height: 68, borderRadius: 34,
      background:'rgba(255,255,255,0.84)',
      backdropFilter:'blur(24px) saturate(180%)',
      WebkitBackdropFilter:'blur(24px) saturate(180%)',
      border:'0.5px solid rgba(0,0,0,0.06)',
      boxShadow:'0 10px 30px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
      display:'grid',
      gridTemplateColumns:'1fr 1fr auto 1fr 1fr',
      alignItems:'center', padding:'0 4px', gap: 0,
    }}>
      <TabIcon label="Today" active={active==='today'} icon={Icon.list}/>
      <TabIcon label="Insights" active={active==='insights'} icon={Icon.chart}/>
      {/* center FAB — elevated, breaks the pill */}
      <div style={{
        width: 58, height: 58, borderRadius: 29, margin:'0 6px',
        background: T.ink,
        display:'flex', alignItems:'center', justifyContent:'center',
        boxShadow:'0 8px 20px rgba(0,0,0,0.28), 0 2px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.1)',
        transform:'translateY(-10px)',
      }}>
        {Icon.mic('#FBFAF7', 26)}
      </div>
      <TabIcon label="Budgets" active={active==='budgets'} icon={iBudget}/>
      <TabIcon label="More" active={active==='more'} icon={iMore}/>
    </div>
  );
}
function TabIcon({ label, active, icon }) {
  const c = active ? T.ink : T.ink4;
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap: 3 }}>
      {icon(c, 22)}
      <span style={{ fontSize: 10, fontWeight: 600, color: c, letterSpacing: 0.2 }}>{label}</span>
    </div>
  );
}

// ─── Screen 1: Lock screen voice widget (3 actions) ─────────────────
function S_Lock() {
  return (
    <BareDevice dark>
      {/* subtle warm gradient wallpaper */}
      <div style={{
        position:'absolute', inset:0,
        background:'radial-gradient(120% 80% at 30% 20%, #2a2a2e 0%, #0B0B0C 60%)',
      }}/>
      {/* clock */}
      <div style={{ position:'relative', textAlign:'center', marginTop: 80, color:'#fff' }}>
        <div style={{ fontSize: 22, fontWeight: 500, opacity: 0.85 }}>Friday, April 18</div>
        <div style={{ fontFamily: T.fDisp, fontSize: 96, fontWeight: 300, letterSpacing: -3, lineHeight: 1 }}>9:41</div>
      </div>
      {/* spacer */}
      <div style={{ flex: 1 }}/>
      {/* lockscreen widget — 3-action Murmur tile */}
      <div style={{ position:'relative', padding:'0 20px 100px' }}>
        <div style={{
          borderRadius: 28, padding: 16,
          background:'rgba(255,255,255,0.14)',
          backdropFilter:'blur(24px) saturate(180%)',
          WebkitBackdropFilter:'blur(24px) saturate(180%)',
          border:'0.5px solid rgba(255,255,255,0.18)',
        }}>
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 14,
            color:'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
            textTransform:'uppercase',
          }}>
            <span style={{ display:'inline-flex', alignItems:'center', gap: 8 }}>
              <span style={{ width: 16, height: 16, borderRadius: 4, background:T.accent,
                display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
                <span style={{ color:'#fff', fontSize: 11, fontWeight: 800 }}>M</span>
              </span>
              Murmur
            </span>
            <span style={{ color:'rgba(255,255,255,0.6)' }}>$34.20 today</span>
          </div>
          {/* 3 actions */}
          <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr 1fr', gap: 8 }}>
            {/* mic — primary */}
            <div style={{
              height: 72, borderRadius: 18, background:'#fff',
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap: 4,
              boxShadow:'0 4px 12px rgba(0,0,0,0.25)',
            }}>
              {Icon.mic('#0B0B0C', 24)}
              <span style={{ color:'#0B0B0C', fontSize: 11, fontWeight: 700, letterSpacing: 0.2 }}>Speak</span>
            </div>
            {/* keypad */}
            <div style={{
              height: 72, borderRadius: 18, background:'rgba(255,255,255,0.14)',
              border:'0.5px solid rgba(255,255,255,0.12)',
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap: 4,
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="4" width="18" height="16" rx="3" stroke="#fff" strokeWidth="1.8"/>
                <circle cx="8" cy="10" r="1" fill="#fff"/>
                <circle cx="12" cy="10" r="1" fill="#fff"/>
                <circle cx="16" cy="10" r="1" fill="#fff"/>
                <path d="M8 15h8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              <span style={{ color:'#fff', fontSize: 11, fontWeight: 700 }}>Type</span>
            </div>
            {/* last+1 */}
            <div style={{
              height: 72, borderRadius: 18, background:'rgba(255,255,255,0.14)',
              border:'0.5px solid rgba(255,255,255,0.12)',
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap: 3,
            }}>
              <div style={{ color:'#fff', fontFamily: T.fDisp, fontSize: 15, fontWeight: 700, letterSpacing: -0.3 }}>$12.40</div>
              <span style={{ color:'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: 600 }}>Repeat last</span>
            </div>
          </div>
        </div>
        {/* flashlight + camera row */}
        <div style={{ display:'flex', justifyContent:'space-between', marginTop: 36, padding:'0 28px' }}>
          <div style={dotBtn}/><div style={dotBtn}/>
        </div>
      </div>
    </BareDevice>
  );
}
const dotBtn = {
  width: 50, height: 50, borderRadius: 25,
  background:'rgba(255,255,255,0.08)', border:'0.5px solid rgba(255,255,255,0.12)',
};

// ─── Screen 2: Listening (active voice capture) ─────────────────────
// Hero: detected amount. Transcript is de-emphasized.
function S_Listening() {
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      {/* header */}
      <div style={{ padding:'8px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ color: T.ink4, fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform:'uppercase',
          display:'inline-flex', alignItems:'center', gap: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: T.accent, boxShadow:`0 0 0 4px ${T.accentSoft}` }}/>
          Listening
        </div>
        <div style={{
          width: 36, height: 36, borderRadius: 18, background:'#EEEAE0',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>{Icon.close(T.ink2, 16)}</div>
      </div>
      {/* big amount hero — what's detected right now */}
      <div style={{ padding:'56px 28px 0', textAlign:'center' }}>
        <div style={{ color: T.ink4, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform:'uppercase' }}>
          Detected
        </div>
        <div style={{ marginTop: 10 }}>
          <Money value={12.40} size={92}/>
        </div>
        {/* quiet transcript — just a line */}
        <div style={{ color: T.ink3, fontSize: 14, marginTop: 18, lineHeight: 1.4,
          fontStyle:'italic', padding:'0 24px' }}>
          "Twelve forty at Blue Bottle, coffee<span style={{
            display:'inline-block', width: 2, height: 13, background: T.accent,
            verticalAlign:'middle', marginLeft: 2, animation:'blink 1s infinite',
          }}/>"
        </div>
      </div>
      {/* detected chips */}
      <div style={{ padding:'28px 24px 0', display:'flex', justifyContent:'center', gap: 6, flexWrap:'wrap' }}>
        <DetectChip label="Blue Bottle"/>
        <DetectChip label="Coffee" cat="coffee"/>
        <DetectChip label="Today" muted/>
      </div>
      <div style={{ flex: 1 }}/>
      {/* big waveform + stop */}
      <div style={{ padding:'0 20px 110px', display:'flex', flexDirection:'column', alignItems:'center', gap: 36 }}>
        <BigWaveform/>
        <div style={{
          width: 84, height: 84, borderRadius: 42, background: T.ink,
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 12px 28px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background:'#fff' }}/>
        </div>
        <div style={{ color: T.ink3, fontSize: 12.5, fontWeight: 500,
          display:'inline-flex', alignItems:'center', gap: 6 }}>
          {Icon.lock(T.ink3, 12)}
          Processed on-device
        </div>
      </div>
    </BareDevice>
  );
}
function DetectChip({ label, cat, muted }) {
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap: 6,
      padding:'8px 12px', borderRadius: 999,
      background: cat ? T.cat[cat].bg : (muted ? '#EEEAE0' : '#fff'),
      color: cat ? T.cat[cat].fg : (muted ? T.ink3 : T.ink),
      border: cat ? 'none' : '0.5px solid rgba(40,36,28,0.08)',
      fontSize: 14, fontWeight: 600,
    }}>{label}</span>
  );
}
function BigWaveform() {
  // fuller waveform, larger bars
  const heights = [8,14,22,30,44,58,38,24,52,68,44,32,56,72,50,36,60,44,28,46,64,38,22,30,48,62,42,28,16,24,40,30];
  return (
    <svg width="340" height="110" viewBox={`0 0 ${heights.length*10} 110`}>
      {heights.map((h,i)=>(
        <rect key={i} x={i*10} y={(110-h)/2} width="5" height={h} rx="2.5"
          fill={i<heights.length*0.65 ? T.accent : T.ink4} opacity={i<heights.length*0.65?1:0.4}/>
      ))}
    </svg>
  );
}

// ─── Screen 3: Confirm captured expense ─────────────────────────────
// Amount is the hero — a tappable card that pops the keypad.
function S_Confirm() {
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      {/* header */}
      <div style={{ padding:'8px 20px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ color: T.ink3, fontSize: 15, fontWeight: 600 }}>Cancel</div>
        <div style={{ color: T.ink, fontSize: 16, fontWeight: 700 }}>New expense</div>
        <div style={{ color: T.accent, fontSize: 15, fontWeight: 700 }}>Save</div>
      </div>
      {/* big tappable amount card */}
      <div style={{ padding:'12px 20px 0' }}>
        <div style={{
          background: T.surface, borderRadius: 28, padding: '28px 24px 22px',
          border: `1.5px solid ${T.accent}`,
          boxShadow: `0 0 0 6px ${T.accentSoft}`,
          position:'relative',
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 4 }}>
            <div style={{ color: T.ink3, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform:'uppercase' }}>
              Amount · tap to edit
            </div>
            <div style={{ display:'inline-flex', alignItems:'center', gap: 4,
              color: T.accent, fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform:'uppercase' }}>
              {Icon.sparkle(T.accent, 11)} Voice · 0.4s
            </div>
          </div>
          <div style={{ textAlign:'center', marginTop: 4 }}>
            <Money value={12.40} size={72} />
          </div>
          {/* quick keypad hint */}
          <div style={{ display:'flex', justifyContent:'center', gap: 8, marginTop: 14 }}>
            {['−$1','+$1','+$5','+$10'].map((x,i)=>(
              <span key={i} style={{
                padding:'6px 10px', borderRadius: 999, background: T.bg, border:`0.5px solid ${T.line}`,
                fontSize: 11.5, fontWeight: 600, color: T.ink3, fontFamily: T.fMono,
              }}>{x}</span>
            ))}
          </div>
        </div>
      </div>
      {/* fields */}
      <div style={{ padding:'20px' }}>
        <div style={{ background: T.surface, borderRadius: 22, overflow:'hidden' }}>
          <FieldLogo label="Merchant" merchant="Blue Bottle Coffee" cat="coffee"/>
          <Field label="Category" value={<Chip cat="coffee" label="Coffee & tea"/>} raw/>
          <Field label="Date" value="Today · 9:41 AM"/>
          <Field label="Payment" value="Apple Pay · Visa ••4821" last/>
        </div>
        {/* transcription */}
        <div style={{
          marginTop: 16, padding: '14px 16px',
          borderRadius: 18, background: T.accentSoft,
          display:'flex', alignItems:'flex-start', gap: 10,
        }}>
          <div style={{ marginTop: 2 }}>{Icon.sparkle(T.accent, 14)}</div>
          <div style={{ fontSize: 13.5, color: T.ink2, lineHeight: 1.5 }}>
            "Twelve forty at Blue Bottle, coffee"
            <div style={{ color: T.ink3, fontSize: 12, marginTop: 4 }}>Tap any field above to correct.</div>
          </div>
        </div>
      </div>
      <div style={{ flex: 1 }}/>
      {/* big save button */}
      <div style={{ padding:'0 20px 40px' }}>
        <div style={{
          height: 56, borderRadius: 28, background: T.ink,
          display:'flex', alignItems:'center', justifyContent:'center',
          color:'#fff', fontSize: 17, fontWeight: 600, letterSpacing: -0.2,
        }}>Save expense</div>
      </div>
    </BareDevice>
  );
}
function Field({ label, value, last, raw }) {
  return (
    <div style={{
      padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between',
      borderBottom: last ? 'none' : `0.5px solid ${T.line}`, gap: 12,
    }}>
      <div style={{ color: T.ink3, fontSize: 14, fontWeight: 500 }}>{label}</div>
      <div style={{ display:'flex', alignItems:'center', gap: 8, color: T.ink, fontSize: 15, fontWeight: 500 }}>
        {raw ? value : <span>{value}</span>}
        {Icon.chev(T.ink4)}
      </div>
    </div>
  );
}
function FieldLogo({ label, merchant, cat, last }) {
  return (
    <div style={{
      padding:'12px 18px', display:'flex', alignItems:'center', justifyContent:'space-between',
      borderBottom: last ? 'none' : `0.5px solid ${T.line}`, gap: 12,
    }}>
      <div style={{ color: T.ink3, fontSize: 14, fontWeight: 500 }}>{label}</div>
      <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
        <MerchantLogo name={merchant} cat={cat} size={28} radius={8}/>
        <span style={{ color: T.ink, fontSize: 15, fontWeight: 500 }}>{merchant}</span>
        {Icon.chev(T.ink4)}
      </div>
    </div>
  );
}

// ─── Screen 4: Today list ───────────────────────────────────────────
function S_Today({ withUndo=false } = {}) {
  const today = [
    { amt: 12.40, m: 'Blue Bottle Coffee', cat: 'coffee', label:'Coffee', t: '9:41 AM', voice: true },
    { amt: 28.50, m: 'Uber', cat: 'transit', label:'Transit', t: '8:12 AM', voice: true },
    { amt: 4.25, m: 'Walgreens', cat: 'health', label:'Health', t: '7:50 AM', voice: false },
  ];
  const yest = [
    { amt: 62.30, m: "Trader Joe's", cat: 'food', label:'Groceries', t: 'Yesterday', voice: true },
    { amt: 14.00, m: 'Netflix', cat: 'bills', label:'Subscription', t: 'Yesterday', voice: false, recurring: true },
    { amt: 38.80, m: 'Rappi', cat: 'food', label:'Food', t: 'Yesterday', voice: true },
  ];
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      {/* header */}
      <div style={{ padding:'14px 22px 8px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ color: T.ink4, fontSize: 13, fontWeight: 600, letterSpacing: 0.4, textTransform:'uppercase' }}>
            April
          </div>
          <div style={{ fontFamily: T.fDisp, fontSize: 34, fontWeight: 700, color: T.ink, letterSpacing: -0.8 }}>
            Today
          </div>
        </div>
        <div style={{
          width: 36, height: 36, borderRadius: 18, background:'#fff',
          display:'flex', alignItems:'center', justifyContent:'center',
          border:`0.5px solid ${T.line}`,
        }}>{Icon.search(T.ink2)}</div>
      </div>
      {/* budget header line — quiet, one line */}
      <div style={{ padding:'4px 24px 10px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontSize: 13, color: T.ink3, fontWeight: 500 }}>
          <span style={{ color: T.accent, fontWeight: 700 }}>$473</span> left this month
        </div>
        <div style={{ fontSize: 13, color: T.ink4, fontWeight: 500 }}>12 days to go</div>
      </div>
      {/* running total */}
      <div style={{ padding:'0 22px 20px' }}>
        <div style={{
          background: T.surface, borderRadius: 24, padding:'18px 20px',
          display:'flex', alignItems:'center', justifyContent:'space-between',
        }}>
          <div>
            <div style={{ fontSize: 12, color: T.ink3, fontWeight: 600, textTransform:'uppercase', letterSpacing: 0.6 }}>Spent today</div>
            <div style={{ marginTop: 4 }}><Money value={45.15} size={32}/></div>
          </div>
          <MiniBars/>
        </div>
      </div>
      {/* list */}
      <div style={{ flex: 1, overflow:'auto', paddingBottom: 140 }}>
        <SectionHead label="Today · Friday"/>
        <TxList items={today}/>
        <SectionHead label="Yesterday · Thursday"/>
        <TxList items={yest}/>
      </div>
      {/* Undo snackbar — only on withUndo variant, sits above tab bar */}
      {withUndo && (
        <div style={{
          position:'absolute', left: 16, right: 16, bottom: 104, zIndex: 50,
          height: 54, borderRadius: 18,
          background: T.ink, color:'#fff',
          padding:'0 18px',
          display:'flex', alignItems:'center', gap: 12,
          boxShadow:'0 12px 28px rgba(0,0,0,0.22)',
        }}>
          <div style={{ width: 32, height: 32, borderRadius: 16, background:'rgba(255,255,255,0.12)',
            display:'flex', alignItems:'center', justifyContent:'center' }}>
            {Icon.check('#fff', 14)}
          </div>
          <div style={{ flex: 1, fontSize: 14, fontWeight: 500, letterSpacing: -0.1 }}>
            Saved · Blue Bottle $12.40
          </div>
          <div style={{ color: T.accentSoft, fontSize: 14, fontWeight: 700, letterSpacing: 0.3 }}>Undo</div>
          <div style={{ width: 26, height: 2, background:'rgba(255,255,255,0.25)', borderRadius: 1, position:'absolute', bottom: 6, left: 18, right: 18 }}>
            <div style={{ width:'40%', height:'100%', background:T.accentSoft, borderRadius: 1 }}/>
          </div>
        </div>
      )}
      <TabBar active="today"/>
    </BareDevice>
  );
}
function SectionHead({ label }) {
  return (
    <div style={{
      padding:'18px 24px 8px', color: T.ink4,
      fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform:'uppercase',
    }}>{label}</div>
  );
}
function TxList({ items }) {
  return (
    <div style={{ padding:'0 16px' }}>
      <div style={{ background: T.surface, borderRadius: 22, overflow:'hidden' }}>
        {items.map((x,i)=>(
          <TxRow key={i} tx={x} last={i===items.length-1}/>
        ))}
      </div>
    </div>
  );
}
function TxRow({ tx, last }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', padding:'12px 14px', gap: 12,
      borderBottom: last ? 'none' : `0.5px solid ${T.line}`,
    }}>
      <MerchantLogo name={tx.m} cat={tx.cat} size={40} radius={12}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display:'flex', alignItems:'center', gap: 6 }}>
          <span style={{ color: T.ink, fontSize: 15, fontWeight: 600, letterSpacing: -0.2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tx.m}</span>
          {tx.voice && <span title="voice" style={{ color: T.accent, display:'inline-flex' }}>{Icon.mic(T.accent, 12)}</span>}
          {tx.recurring && <span style={{ display:'inline-flex', color: T.ink4 }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M2 8a6 6 0 0110-4.5M14 8a6 6 0 01-10 4.5" stroke={T.ink4} strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M10 3h2.5V0.5M6 13H3.5V15.5" stroke={T.ink4} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>}
        </div>
        <div style={{ color: T.ink3, fontSize: 12, marginTop: 2, display:'flex', gap: 6, alignItems:'center' }}>
          <Chip cat={tx.cat} label={tx.label} size="sm"/>
          <span>·</span>
          <span>{tx.t}</span>
        </div>
      </div>
      <Money value={-tx.amt} size={16} serif={false} bold={600}/>
    </div>
  );
}
function MiniBars() {
  const h = [28,14,22,18,36,24,42];
  const days = ['M','T','W','T','F','S','S'];
  return (
    <div style={{ display:'flex', gap: 6, alignItems:'flex-end' }}>
      {h.map((v,i)=>(
        <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap: 4 }}>
          <div style={{
            width: 8, height: v, borderRadius: 3,
            background: i===4 ? T.accent : T.lineHard,
          }}/>
          <div style={{ fontSize: 9, color: T.ink4, fontWeight: 600 }}>{days[i]}</div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { S_Lock, S_Listening, S_Confirm, S_Today, BareDevice, TabBar, TxRow, TxList, SectionHead, MiniBars, Field, FieldLogo });
