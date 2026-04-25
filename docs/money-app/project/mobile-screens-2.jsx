// More mobile screens: Edit (with keyboard), Insights, Categories, Onboarding

// ─── Screen 5: Edit with keyboard ─────────────────────────────────
function S_Edit() {
  return (
    <div style={{
      width: 402, height: 874, borderRadius: 48, overflow: 'hidden',
      position: 'relative', background: T.bg,
      boxShadow: '0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)',
      fontFamily: T.fSans,
    }}>
      <div style={{
        position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)',
        width: 126, height: 37, borderRadius: 24, background: '#000', zIndex: 50,
      }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
        <IOSStatusBar dark={false} />
      </div>
      <div style={{ paddingTop: 56 }}/>
      {/* header */}
      <div style={{ padding:'8px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ color: T.ink3, fontSize: 15, fontWeight: 600 }}>Cancel</div>
        <div style={{ color: T.ink, fontSize: 16, fontWeight: 700 }}>Edit merchant</div>
        <div style={{ color: T.accent, fontSize: 15, fontWeight: 700 }}>Done</div>
      </div>
      {/* text field */}
      <div style={{ padding:'32px 24px 12px' }}>
        <div style={{ color: T.ink3, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform:'uppercase', marginBottom: 8 }}>
          Merchant
        </div>
        <div style={{
          background:'#fff', borderRadius: 16, padding:'16px 18px',
          border:`1.5px solid ${T.accent}`,
          fontFamily: T.fDisp, fontSize: 22, fontWeight: 500, color: T.ink,
          display:'flex', alignItems:'center',
        }}>
          Blue Bottle Coffee
          <span style={{
            display:'inline-block', width: 2, height: 22, background: T.accent,
            marginLeft: 3, animation: 'blink 1s infinite',
          }}/>
        </div>
        <div style={{ color: T.ink3, fontSize: 13, marginTop: 10, lineHeight: 1.4 }}>
          Recognized from your voice note. We'll remember this merchant next time.
        </div>
      </div>
      {/* suggestions */}
      <div style={{ padding:'16px 24px 0' }}>
        <div style={{ color: T.ink3, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform:'uppercase', marginBottom: 10 }}>
          Suggested
        </div>
        <div style={{ display:'flex', gap: 8, flexWrap:'wrap' }}>
          {['Blue Bottle Coffee','Blue Bottle','Bluestone Lane','Blue Ribbon'].map((s,i)=>(
            <span key={i} style={{
              padding:'8px 14px', borderRadius: 999, background:'#fff',
              border:`0.5px solid ${T.line}`, fontSize: 14, color: T.ink2, fontWeight: 500,
            }}>{s}</span>
          ))}
        </div>
      </div>
      <div style={{ flex: 1 }}/>
      <IOSKeyboard dark={false}/>
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 60,
        height: 34, display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
        paddingBottom: 8, pointerEvents: 'none',
      }}>
        <div style={{ width: 139, height: 5, borderRadius: 100, background: 'rgba(0,0,0,0.25)' }} />
      </div>
    </div>
  );
}

// ─── Screen 6: Insights summary ───────────────────────────────────
function S_Insights() {
  const cats = [
    { cat:'food', label:'Food & drink', amt: 412, pct: 31 },
    { cat:'transit', label:'Transit', amt: 186, pct: 14 },
    { cat:'shopping', label:'Shopping', amt: 298, pct: 22 },
    { cat:'bills', label:'Bills', amt: 230, pct: 17 },
    { cat:'coffee', label:'Coffee & tea', amt: 89, pct: 7 },
    { cat:'other', label:'Other', amt: 115, pct: 9 },
  ];
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      <div style={{ padding:'14px 22px 4px' }}>
        <div style={{ color: T.ink4, fontSize: 13, fontWeight: 600, letterSpacing: 0.4, textTransform:'uppercase' }}>
          This month
        </div>
        <div style={{ fontFamily: T.fDisp, fontSize: 34, fontWeight: 700, color: T.ink, letterSpacing: -0.8 }}>
          Insights
        </div>
      </div>
      <div style={{ flex: 1, overflow:'auto', paddingBottom: 140 }}>
        {/* Hero total */}
        <div style={{ padding:'12px 20px 0' }}>
          <div style={{
            background: T.surface, borderRadius: 28, padding:'24px 22px',
          }}>
            <div style={{ color: T.ink3, fontSize: 13, fontWeight: 600 }}>Spent · April 1 – 18</div>
            <div style={{ marginTop: 6, display:'flex', alignItems:'baseline', gap: 8 }}>
              <Money value={1330} size={52}/>
              <span style={{
                fontSize: 13, color: T.accent, fontWeight: 700,
                background: T.accentSoft, padding:'4px 8px', borderRadius: 8,
              }}>−12% vs March</span>
            </div>
            {/* tiny trend line */}
            <svg viewBox="0 0 340 80" style={{ width:'100%', height: 80, marginTop: 14 }}>
              <defs>
                <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={T.accent} stopOpacity="0.22"/>
                  <stop offset="100%" stopColor={T.accent} stopOpacity="0"/>
                </linearGradient>
              </defs>
              <path d="M0,60 C40,50 60,20 100,30 C140,40 170,15 210,25 C260,38 290,55 340,28 L340,80 L0,80 Z" fill="url(#g1)"/>
              <path d="M0,60 C40,50 60,20 100,30 C140,40 170,15 210,25 C260,38 290,55 340,28" fill="none" stroke={T.accent} strokeWidth="2"/>
            </svg>
          </div>
        </div>
        {/* categories */}
        <div style={{ padding:'20px' }}>
          <div style={{ color: T.ink3, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform:'uppercase', marginBottom: 10 }}>
            Categories
          </div>
          <div style={{ background: T.surface, borderRadius: 22, padding:'4px 0' }}>
            {cats.map((c,i)=>(
              <CatRow key={i} row={c} last={i===cats.length-1}/>
            ))}
          </div>
        </div>
        {/* forecast card */}
        <div style={{ padding:'0 20px 24px' }}>
          <div style={{
            background:'#1B1915', borderRadius: 22, padding:'20px 22px', color:'#fff',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap: 8,
              fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform:'uppercase', opacity: 0.7 }}>
              {Icon.sparkle('#fff', 13)} Forecast
            </div>
            <div style={{ fontFamily: T.fSerif, fontSize: 22, lineHeight: 1.35, fontWeight: 500, marginTop: 10 }}>
              At this pace, you'll end April around <span style={{ color:'#C9D6BE' }}>$2,240</span> — $310 below your usual.
            </div>
          </div>
        </div>
      </div>
      <TabBar active="insights"/>
    </BareDevice>
  );
}
function CatRow({ row, last }) {
  const c = T.cat[row.cat];
  return (
    <div style={{
      padding:'12px 16px', borderBottom: last ? 'none' : `0.5px solid ${T.line}`,
    }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 6 }}>
        <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: c.fg }}/>
          <span style={{ fontSize: 15, color: T.ink, fontWeight: 600 }}>{row.label}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
          <Money value={row.amt} size={15} serif={false} bold={600}/>
          <span style={{ fontSize: 12, color: T.ink3, fontWeight: 600, fontVariantNumeric:'tabular-nums', minWidth: 28, textAlign:'right' }}>{row.pct}%</span>
        </div>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: T.surface2, overflow:'hidden' }}>
        <div style={{ width: `${row.pct*2.5}%`, height:'100%', background: c.fg, opacity: 0.85, borderRadius: 3 }}/>
      </div>
    </div>
  );
}

// ─── Screen 7: Onboarding (privacy-first) ─────────────────────────
function S_Onboard() {
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      <div style={{ padding:'60px 32px 0', flex: 1, display:'flex', flexDirection:'column' }}>
        {/* logo mark */}
        <div style={{
          width: 56, height: 56, borderRadius: 14, background: T.accent,
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 4px 16px rgba(63,90,62,0.3)',
        }}>
          <span style={{ color:'#fff', fontSize: 28, fontWeight: 800, fontFamily: T.fDisp, letterSpacing: -1 }}>M</span>
        </div>
        <div style={{
          fontFamily: T.fSerif, fontSize: 44, lineHeight: 1.1, letterSpacing: -1,
          color: T.ink, fontWeight: 500, marginTop: 32,
        }}>
          Speak it.<br/>Spend clearly.
        </div>
        <div style={{ color: T.ink3, fontSize: 17, lineHeight: 1.45, marginTop: 16, fontWeight: 400 }}>
          Murmur turns a quick spoken note into a clean, categorized expense. No bank logins, no surveillance.
        </div>
        {/* three props */}
        <div style={{ marginTop: 40, display:'flex', flexDirection:'column', gap: 18 }}>
          <Prop icon={Icon.mic} t="On-device voice" s="Your speech never leaves your phone by default."/>
          <Prop icon={Icon.lock} t="No bank linking" s="You share nothing with Plaid or third parties."/>
          <Prop icon={Icon.chart} t="Clarity on desktop" s="Trends, forecasts and budgets in the companion app."/>
        </div>
        <div style={{ flex: 1 }}/>
        {/* CTAs */}
        <div style={{ padding:'20px 0 40px' }}>
          <div style={{
            height: 56, borderRadius: 28, background: T.ink,
            display:'flex', alignItems:'center', justifyContent:'center',
            color:'#fff', fontSize: 17, fontWeight: 600, letterSpacing: -0.2,
          }}>Get started</div>
          <div style={{ textAlign:'center', marginTop: 18, fontSize: 14, color: T.ink3, fontWeight: 500 }}>
            I already have an account
          </div>
        </div>
      </div>
    </BareDevice>
  );
}
function Prop({ icon, t, s }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap: 14 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, background: T.accentSoft,
        display:'flex', alignItems:'center', justifyContent:'center', flexShrink: 0,
      }}>{icon(T.accent, 18)}</div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, color: T.ink, letterSpacing: -0.2 }}>{t}</div>
        <div style={{ fontSize: 14, color: T.ink3, marginTop: 2, lineHeight: 1.4 }}>{s}</div>
      </div>
    </div>
  );
}

Object.assign(window, { S_Edit, S_Insights, S_Onboard });
