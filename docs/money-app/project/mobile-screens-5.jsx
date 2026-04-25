// Mobile screens v2 additions:
// Budgets tab, Recurring subscriptions, Ask Murmur (entry + result),
// Day-1 guided first log, Income setup.
// Note: BareDevice, TabBar, TxRow, etc. come from mobile-screens-1.jsx via window.

// ─── Screen 20: Budgets tab ─────────────────────────────────────
function S_Budgets() {
  const budgets = [
    { cat:'food',     label:'Food & drink', limit: 600, spent: 412, days: 12 },
    { cat:'coffee',   label:'Coffee & tea', limit: 120, spent: 89,  days: 12 },
    { cat:'transit',  label:'Transit',      limit: 250, spent: 186, days: 12 },
    { cat:'shopping', label:'Shopping',     limit: 300, spent: 298, days: 12 },
    { cat:'bills',    label:'Bills',        limit: 280, spent: 230, days: 12 },
    { cat:'health',   label:'Health',       limit: 100, spent: 22,  days: 12 },
  ];
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      <div style={{ padding:'14px 22px 4px', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div style={{ color: T.ink4, fontSize: 13, fontWeight: 600, letterSpacing: 0.4, textTransform:'uppercase' }}>
            April · 12 days left
          </div>
          <div style={{ fontFamily: T.fDisp, fontSize: 34, fontWeight: 700, color: T.ink, letterSpacing: -0.8 }}>
            Budgets
          </div>
        </div>
        <div style={{
          width: 36, height: 36, borderRadius: 18, background:'#fff',
          display:'flex', alignItems:'center', justifyContent:'center',
          border:`0.5px solid ${T.line}`, marginTop: 20,
        }}>{Icon.plus(T.ink2, 18)}</div>
      </div>
      <div style={{ flex: 1, overflow:'auto', paddingBottom: 140 }}>
        {/* hero ring summary */}
        <div style={{ padding:'12px 20px 0' }}>
          <div style={{ background: T.surface, borderRadius: 28, padding:'22px 22px',
            display:'flex', alignItems:'center', gap: 20 }}>
            <BudgetRing spent={1237} limit={1700}/>
            <div style={{ flex: 1 }}>
              <div style={{ color: T.ink3, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform:'uppercase' }}>
                Monthly budget
              </div>
              <div style={{ marginTop: 4 }}>
                <Money value={1700 - 1237} size={30}/>
              </div>
              <div style={{ color: T.ink3, fontSize: 13, marginTop: 2 }}>
                left of <Money value={1700} size={13} serif={false} bold={600} muted/>
              </div>
              <div style={{ marginTop: 10, display:'inline-flex', gap: 6, alignItems:'center',
                padding:'5px 10px', background: T.accentSoft, color: T.accent,
                borderRadius: 999, fontSize: 11.5, fontWeight: 700 }}>
                On pace · ends near $2,240
              </div>
            </div>
          </div>
        </div>
        {/* category budgets */}
        <div style={{ padding:'20px 16px 0' }}>
          <div style={{ padding:'0 8px 8px', color: T.ink3, fontSize: 11, fontWeight: 700,
            letterSpacing: 0.6, textTransform:'uppercase' }}>By category</div>
          <div style={{ background: T.surface, borderRadius: 22, padding:'4px 0' }}>
            {budgets.map((b,i)=>(
              <BudgetRow key={i} b={b} last={i===budgets.length-1}/>
            ))}
          </div>
        </div>
      </div>
      <TabBar active="budgets"/>
    </BareDevice>
  );
}
function BudgetRing({ spent, limit }) {
  const r = 44, c = 2*Math.PI*r;
  const pct = Math.min(spent/limit, 1);
  return (
    <div style={{ position:'relative', width: 110, height: 110, flexShrink: 0 }}>
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} fill="none" stroke={T.surface2} strokeWidth="8"/>
        <circle cx="55" cy="55" r={r} fill="none" stroke={T.accent} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={`${c*pct} ${c}`}
          transform="rotate(-90 55 55)"/>
      </svg>
      <div style={{
        position:'absolute', inset: 0, display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
      }}>
        <div style={{ fontFamily: T.fDisp, fontSize: 22, fontWeight: 700, color: T.ink, letterSpacing: -0.5 }}>
          {Math.round(pct*100)}%
        </div>
        <div style={{ color: T.ink3, fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform:'uppercase', marginTop: 2 }}>
          used
        </div>
      </div>
    </div>
  );
}
function BudgetRow({ b, last }) {
  const c = T.cat[b.cat];
  const pct = Math.min(b.spent/b.limit, 1);
  const over = b.spent > b.limit;
  const tight = !over && pct > 0.92;
  return (
    <div style={{ padding:'14px 16px', borderBottom: last ? 'none' : `0.5px solid ${T.line}` }}>
      <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: c.bg, color: c.fg,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontWeight: 700, fontSize: 14 }}>{b.label[0]}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: T.ink, letterSpacing: -0.2 }}>{b.label}</div>
          <div style={{ fontSize: 12, color: T.ink3, marginTop: 1 }}>
            <Money value={b.spent} size={12} serif={false} bold={600}/> of <Money value={b.limit} size={12} serif={false} bold={600} muted/>
          </div>
        </div>
        {tight && <span style={{ padding:'3px 8px', borderRadius: 999, background:'#F2E8D5', color:'#7A5A1C',
          fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, textTransform:'uppercase' }}>Tight</span>}
        {over && <span style={{ padding:'3px 8px', borderRadius: 999, background:'#F4DDDD', color:'#843C3C',
          fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, textTransform:'uppercase' }}>Over</span>}
      </div>
      <div style={{ height: 6, borderRadius: 3, background: T.surface2, overflow:'hidden', marginTop: 10 }}>
        <div style={{
          width: `${pct*100}%`, height:'100%',
          background: over ? '#A94646' : (tight ? '#C08A3A' : c.fg),
          opacity: 0.85, borderRadius: 3,
        }}/>
      </div>
    </div>
  );
}

// ─── Screen 21: Recurring subscriptions ─────────────────────────
function S_Recurring() {
  const subs = [
    { m:'Netflix',      amt: 14.00, cadence:'monthly', next:'Apr 24', cat:'bills', active:true },
    { m:'Spotify',      amt: 10.99, cadence:'monthly', next:'Apr 21', cat:'bills', active:true },
    { m:'iCloud+',      amt: 2.99,  cadence:'monthly', next:'Apr 29', cat:'bills', active:true },
    { m:'Gym · Equinox', amt: 245.00, cadence:'monthly', next:'May 1', cat:'health', active:true },
    { m:'NYT',          amt: 4.25,  cadence:'monthly', next:'May 4', cat:'bills', active:true },
  ];
  const detected = { m:'Starbucks', amt: 6.50, note:'Mon–Fri ~9am' };
  const total = subs.reduce((s,x)=>s+x.amt, 0);
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      <div style={{ padding:'8px 20px', display:'flex', alignItems:'center', gap: 8 }}>
        <div style={{ width: 36, height: 36, borderRadius: 18, background:'#fff',
          border:`0.5px solid ${T.line}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          {Icon.chev(T.ink2)}
        </div>
        <div style={{ fontSize: 15, color: T.ink3, fontWeight: 600 }}>Insights</div>
      </div>
      <div style={{ padding:'14px 22px 4px' }}>
        <div style={{ color: T.ink4, fontSize: 13, fontWeight: 600, letterSpacing: 0.4, textTransform:'uppercase' }}>
          Detected automatically
        </div>
        <div style={{ fontFamily: T.fDisp, fontSize: 32, fontWeight: 700, color: T.ink, letterSpacing: -0.8 }}>
          Recurring
        </div>
      </div>
      <div style={{ flex: 1, overflow:'auto', paddingBottom: 40 }}>
        {/* hero */}
        <div style={{ padding:'12px 20px 0' }}>
          <div style={{ background: T.surface, borderRadius: 26, padding:'22px 22px' }}>
            <div style={{ color: T.ink3, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform:'uppercase' }}>
              Paid monthly
            </div>
            <div style={{ marginTop: 6, display:'flex', alignItems:'baseline', gap: 8 }}>
              <Money value={total} size={46}/>
              <span style={{ color: T.ink3, fontSize: 14 }}>/ month</span>
            </div>
            <div style={{ fontFamily: T.fSerif, fontSize: 16, color: T.ink2, lineHeight: 1.4, marginTop: 12 }}>
              That's <b style={{ color: T.ink }}>${Math.round(total*12)}</b> a year in subscriptions.
            </div>
          </div>
        </div>
        {/* detected new */}
        <div style={{ padding:'20px 16px 0' }}>
          <div style={{ padding:'0 8px 8px', color: T.ink3, fontSize: 11, fontWeight: 700,
            letterSpacing: 0.6, textTransform:'uppercase' }}>
            New pattern detected
          </div>
          <div style={{ background:'#fff', borderRadius: 20, padding:'16px 16px',
            border:`1.5px dashed ${T.accent}` }}>
            <div style={{ display:'flex', alignItems:'center', gap: 12, marginBottom: 10 }}>
              <MerchantLogo name={detected.m} cat="coffee" size={40} radius={12}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{detected.m}</div>
                <div style={{ fontSize: 12.5, color: T.ink3, marginTop: 1 }}>
                  ~${detected.amt.toFixed(2)} · {detected.note}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 13.5, color: T.ink2, lineHeight: 1.45, marginBottom: 12 }}>
              Looks like a routine. Mark as recurring so forecasts stay accurate?
            </div>
            <div style={{ display:'flex', gap: 8 }}>
              <div style={{ flex:1, height: 38, borderRadius: 19, background: T.ink, color:'#fff',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize: 13, fontWeight: 700 }}>Yes, it's recurring</div>
              <div style={{ flex:1, height: 38, borderRadius: 19, background:'#fff',
                border:`0.5px solid ${T.lineHard}`, color: T.ink2,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize: 13, fontWeight: 600 }}>Not really</div>
            </div>
          </div>
        </div>
        {/* active subs */}
        <div style={{ padding:'24px 16px 0' }}>
          <div style={{ padding:'0 8px 8px', color: T.ink3, fontSize: 11, fontWeight: 700,
            letterSpacing: 0.6, textTransform:'uppercase' }}>Active subscriptions</div>
          <div style={{ background: T.surface, borderRadius: 22, overflow:'hidden' }}>
            {subs.map((s,i)=>(
              <div key={i} style={{
                padding:'12px 14px', display:'flex', alignItems:'center', gap: 12,
                borderBottom: i===subs.length-1 ? 'none' : `0.5px solid ${T.line}`,
              }}>
                <MerchantLogo name={s.m} cat={s.cat} size={36} radius={10}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: T.ink, letterSpacing: -0.2 }}>{s.m}</div>
                  <div style={{ fontSize: 12, color: T.ink3, marginTop: 1 }}>Next · {s.next}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <Money value={s.amt} size={14} serif={false} bold={700}/>
                  <div style={{ fontSize: 10.5, color: T.ink4, fontWeight: 600, textTransform:'uppercase', letterSpacing: 0.4, marginTop: 1 }}>/mo</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BareDevice>
  );
}

// ─── Screen 22: Ask Murmur (entry state) ────────────────────────
// Grounded AI over the user's own data. Goal-oriented by default.
function S_AskEntry() {
  const suggestions = [
    { icon:'🎮', t:'Can I afford a PS5 this month?' },
    { icon:'☕', t:'Where is my coffee budget going?' },
    { icon:'📉', t:'Why did I spend more than usual last week?' },
    { icon:'🎯', t:'Help me save $500 by August.' },
  ];
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      <div style={{ padding:'8px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 18, background:'#fff',
          border:`0.5px solid ${T.line}`, display:'flex', alignItems:'center', justifyContent:'center',
        }}>{Icon.close(T.ink2, 16)}</div>
        <div style={{ display:'inline-flex', alignItems:'center', gap: 6,
          padding:'5px 10px', background: T.accentSoft, color: T.accent, borderRadius: 999,
          fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform:'uppercase' }}>
          {Icon.sparkle(T.accent, 11)} Beta
        </div>
      </div>
      <div style={{ padding:'40px 28px 0' }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16, background: T.ink,
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 6px 18px rgba(0,0,0,0.18)',
        }}>
          {Icon.sparkle('#fff', 26)}
        </div>
        <div style={{ fontFamily: T.fSerif, fontSize: 36, fontWeight: 500, color: T.ink,
          letterSpacing: -0.8, lineHeight: 1.15, marginTop: 22 }}>
          Ask Murmur.
        </div>
        <div style={{ color: T.ink3, fontSize: 15, lineHeight: 1.5, marginTop: 10 }}>
          Grounded in your own transactions. Not general advice — your data, your numbers, a direct answer.
        </div>
      </div>
      {/* suggestions */}
      <div style={{ padding:'28px 20px 0', display:'flex', flexDirection:'column', gap: 10 }}>
        {suggestions.map((s,i)=>(
          <div key={i} style={{
            padding:'14px 16px', background:'#fff', borderRadius: 16,
            border:`0.5px solid ${T.line}`,
            display:'flex', alignItems:'center', gap: 12,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: T.surface2,
              display:'flex', alignItems:'center', justifyContent:'center', fontSize: 18,
            }}>{s.icon}</div>
            <div style={{ flex: 1, fontSize: 14.5, color: T.ink, fontWeight: 500, letterSpacing: -0.2 }}>{s.t}</div>
            {Icon.chev(T.ink4)}
          </div>
        ))}
      </div>
      <div style={{ flex: 1 }}/>
      {/* input bar */}
      <div style={{ padding:'0 16px 36px' }}>
        <div style={{
          background:'#fff', borderRadius: 26, padding:'8px 8px 8px 18px',
          border:`0.5px solid ${T.line}`,
          display:'flex', alignItems:'center', gap: 10,
          boxShadow:'0 4px 12px rgba(0,0,0,0.06)',
        }}>
          <div style={{ flex: 1, fontSize: 15, color: T.ink4 }}>Ask a question about your spending…</div>
          <div style={{
            width: 44, height: 44, borderRadius: 22, background: T.accent,
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>{Icon.mic('#fff', 20)}</div>
        </div>
        <div style={{ textAlign:'center', marginTop: 10, fontSize: 11.5, color: T.ink4, fontWeight: 500,
          display:'inline-flex', alignItems:'center', justifyContent:'center', gap: 6, width:'100%' }}>
          {Icon.lock(T.ink4, 11)} Your data never trains a model
        </div>
      </div>
    </BareDevice>
  );
}

// ─── Screen 23: Ask Murmur (result — PS5 example) ───────────────
function S_AskResult() {
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      <div style={{ padding:'8px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 18, background:'#fff',
          border:`0.5px solid ${T.line}`, display:'flex', alignItems:'center', justifyContent:'center',
        }}>{Icon.chev(T.ink2)}</div>
        <div style={{ fontSize: 15, color: T.ink, fontWeight: 700 }}>Ask Murmur</div>
        <div style={{
          width: 36, height: 36, borderRadius: 18, background:'#fff',
          border:`0.5px solid ${T.line}`, display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path d="M4 12h16M12 4l8 8-8 8" stroke={T.ink2} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
      <div style={{ flex: 1, overflow:'auto', padding:'12px 20px 24px' }}>
        {/* user bubble */}
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom: 14 }}>
          <div style={{
            maxWidth: '78%', background: T.ink, color:'#fff',
            padding:'10px 14px', borderRadius: 18, borderBottomRightRadius: 6,
            fontSize: 15, lineHeight: 1.4, letterSpacing: -0.1,
          }}>
            Can I afford a PS5 by end of April?
          </div>
        </div>
        {/* Murmur bubble */}
        <div style={{ display:'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: T.accentSoft, flexShrink: 0,
            display:'flex', alignItems:'center', justifyContent:'center', marginTop: 4 }}>
            {Icon.sparkle(T.accent, 16)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              background:'#fff', padding:'14px 16px', borderRadius: 20, borderTopLeftRadius: 6,
              border:`0.5px solid ${T.line}`,
            }}>
              <div style={{ fontFamily: T.fSerif, fontSize: 18, color: T.ink, lineHeight: 1.35, letterSpacing: -0.2 }}>
                Short answer: <b style={{ color:'#A94646' }}>not this month</b> — but you can in <b>5 months</b>.
              </div>
            </div>
            {/* the breakdown card */}
            <div style={{
              marginTop: 10,
              background:'#fff', padding:'16px 16px', borderRadius: 20,
              border:`0.5px solid ${T.line}`,
            }}>
              <div style={{ color: T.ink3, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform:'uppercase', marginBottom: 8 }}>
                From your last 3 months
              </div>
              <Stat label="Avg monthly income" value="$4,120" muted/>
              <Stat label="Avg monthly spend" value="$3,970" muted/>
              <Stat label="Avg left over" value="+$150" accent/>
              <div style={{ height: 1, background: T.line, margin:'10px 0' }}/>
              <Stat label="PS5 (you searched)" value="$499"/>
              <Stat label="If you save $150/mo" value="≈ 3.3 months" accent/>
              <Stat label="If you cut coffee by half" value="≈ 2.1 months" accent last/>
            </div>
            {/* note */}
            <div style={{
              marginTop: 10, padding:'12px 14px', borderRadius: 16,
              background: T.accentSoft, color: T.ink2, fontSize: 13.5, lineHeight: 1.5,
            }}>
              You spent <b>$89 on coffee</b> this month. Halving that alone saves ~$540/year.
              I'd suggest setting a <b style={{ color: T.accent }}>"PS5 fund"</b> goal at $100/mo — you'd have it by August 12.
            </div>
            <div style={{ fontSize: 11, color: T.ink4, marginTop: 10, lineHeight: 1.5,
              display:'flex', alignItems:'center', gap: 5 }}>
              {Icon.lock(T.ink4, 10)}
              Based on 184 transactions in Murmur. No guesses, no external advice.
            </div>
            {/* quick actions */}
            <div style={{ display:'flex', gap: 8, marginTop: 14 }}>
              <div style={{
                padding:'8px 14px', borderRadius: 999, background: T.ink, color:'#fff',
                fontSize: 13, fontWeight: 700, display:'inline-flex', alignItems:'center', gap: 6,
              }}>
                {Icon.plus('#fff', 14)} Create PS5 goal
              </div>
              <div style={{
                padding:'8px 14px', borderRadius: 999, background:'#fff',
                border:`0.5px solid ${T.line}`,
                fontSize: 13, fontWeight: 600, color: T.ink2,
              }}>Show my coffee spend</div>
            </div>
          </div>
        </div>
      </div>
      {/* input bar */}
      <div style={{ padding:'0 16px 34px' }}>
        <div style={{
          background:'#fff', borderRadius: 26, padding:'8px 8px 8px 18px',
          border:`0.5px solid ${T.line}`,
          display:'flex', alignItems:'center', gap: 10,
        }}>
          <div style={{ flex: 1, fontSize: 14.5, color: T.ink4 }}>Ask a follow-up…</div>
          <div style={{
            width: 40, height: 40, borderRadius: 20, background: T.accent,
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>{Icon.mic('#fff', 18)}</div>
        </div>
      </div>
    </BareDevice>
  );
}
function Stat({ label, value, last, accent, muted }) {
  return (
    <div style={{
      display:'flex', justifyContent:'space-between', alignItems:'baseline',
      padding:'6px 0', borderBottom: last ? 'none' : `0.5px dashed ${T.line}`,
    }}>
      <div style={{ fontSize: 13, color: muted ? T.ink3 : T.ink2, fontWeight: 500 }}>{label}</div>
      <div style={{
        fontFamily: T.fDisp, fontSize: 15, fontWeight: 700, letterSpacing: -0.3,
        color: accent ? T.accent : T.ink, fontVariantNumeric:'tabular-nums',
      }}>{value}</div>
    </div>
  );
}

// ─── Screen 24: Day-1 guided first log ─────────────────────────
function S_DayOne() {
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      <div style={{ padding:'8px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ color: T.ink4, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform:'uppercase' }}>
          Your first expense · 1 of 3
        </div>
        <div style={{ color: T.ink3, fontSize: 14, fontWeight: 600 }}>Skip</div>
      </div>
      {/* little progress */}
      <div style={{ padding:'4px 20px 0' }}>
        <div style={{ height: 3, background: T.surface2, borderRadius: 2, overflow:'hidden' }}>
          <div style={{ width:'33%', height:'100%', background: T.accent }}/>
        </div>
      </div>
      <div style={{ padding:'36px 28px 0' }}>
        <div style={{ fontFamily: T.fSerif, fontSize: 34, fontWeight: 500, color: T.ink,
          letterSpacing: -0.6, lineHeight: 1.2 }}>
          Try logging your<br/>morning coffee.
        </div>
        <div style={{ fontSize: 14.5, color: T.ink3, lineHeight: 1.5, marginTop: 12 }}>
          Hold the mic and say anything like this. No specific phrasing needed — Murmur figures it out.
        </div>
      </div>
      {/* example cards */}
      <div style={{ padding:'24px 20px 0', display:'flex', flexDirection:'column', gap: 10 }}>
        {[
          '"Four fifty at the bakery"',
          '"Twelve dollars at Blue Bottle, coffee"',
          '"Thirty bucks Uber this morning"',
        ].map((q,i)=>(
          <div key={i} style={{
            padding:'14px 16px', background:'#fff', borderRadius: 16,
            border:`0.5px solid ${T.line}`,
            display:'flex', alignItems:'center', gap: 12,
          }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: T.accentSoft,
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              {Icon.mic(T.accent, 15)}
            </div>
            <div style={{ fontSize: 15, color: T.ink, fontStyle:'italic', letterSpacing: -0.2 }}>{q}</div>
          </div>
        ))}
      </div>
      {/* spotlight onto mic button */}
      <div style={{ flex: 1, position:'relative' }}/>
      {/* annotated pointer to mic */}
      <div style={{ position:'absolute', right: 68, bottom: 118, zIndex: 45 }}>
        <div style={{
          background: T.ink, color:'#fff', padding:'8px 12px', borderRadius: 12,
          fontSize: 12.5, fontWeight: 600, letterSpacing: -0.1,
          boxShadow:'0 4px 12px rgba(0,0,0,0.22)', position:'relative',
        }}>
          Tap & hold to speak
          <div style={{ position:'absolute', bottom: -5, right: 18,
            width: 10, height: 10, background: T.ink, transform:'rotate(45deg)' }}/>
        </div>
      </div>
      <div style={{ padding:'0 20px 14px' }}>
        <div style={{ color: T.ink3, fontSize: 12.5, textAlign:'center', fontWeight: 500 }}>
          Or <span style={{ color: T.accent, fontWeight: 700 }}>type instead</span>
        </div>
      </div>
      <TabBar active="today"/>
      {/* highlight glow around the mic FAB */}
      <div style={{
        position:'absolute', bottom: 24, left:'50%', transform:'translateX(-50%) translateY(-10px)',
        width: 100, height: 100, borderRadius: 50, zIndex: 35,
        boxShadow:`0 0 0 6px ${T.accentSoft}, 0 0 0 12px rgba(63,90,62,0.12)`,
        pointerEvents:'none',
      }}/>
    </BareDevice>
  );
}

// ─── Screen 25: Income setup (part of onboarding) ───────────────
function S_Income() {
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      <div style={{ padding:'8px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ color: T.ink3, fontSize: 15, fontWeight: 600 }}>Back</div>
        <div style={{ color: T.ink4, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform:'uppercase' }}>
          Step 3 of 3
        </div>
        <div style={{ color: T.ink3, fontSize: 15, fontWeight: 600 }}>Skip</div>
      </div>
      <div style={{ padding:'40px 28px 0' }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: T.accentSoft,
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M12 2v20M18 6l-6-4-6 4M18 18l-6 4-6-4" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ fontFamily: T.fSerif, fontSize: 32, fontWeight: 500, color: T.ink,
          letterSpacing: -0.6, lineHeight: 1.25, marginTop: 18 }}>
          What's your monthly income?
        </div>
        <div style={{ fontSize: 14.5, color: T.ink3, lineHeight: 1.5, marginTop: 10 }}>
          Optional. Helps Murmur answer questions like <i>"can I afford this?"</i>. Never shared, never linked to a bank.
        </div>
      </div>
      {/* amount field */}
      <div style={{ padding:'36px 24px 0', textAlign:'center' }}>
        <Money value={4120} size={80}/>
        <div style={{ marginTop: 8, fontSize: 13, color: T.ink3, fontWeight: 600,
          display:'inline-flex', alignItems:'center', gap: 6 }}>
          per month
          <span style={{ width: 4, height: 4, borderRadius: 2, background: T.ink4 }}/>
          <span style={{ color: T.accent, fontWeight: 700 }}>USD</span>
          {Icon.chev(T.ink4, 12)}
        </div>
      </div>
      {/* quick presets */}
      <div style={{ padding:'28px 20px 0' }}>
        <div style={{ color: T.ink3, fontSize: 12, fontWeight: 700, letterSpacing: 0.6,
          textTransform:'uppercase', marginBottom: 8 }}>Quick pick</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap: 8 }}>
          {['$2.5k','$4k','$6k','$10k'].map((v,i)=>(
            <div key={i} style={{
              height: 44, borderRadius: 14, background:'#fff',
              border:`0.5px solid ${i===1 ? T.ink : T.line}`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontFamily: T.fDisp, fontSize: 15, fontWeight: 600, color: T.ink,
            }}>{v}</div>
          ))}
        </div>
        <div style={{ marginTop: 20, padding:'14px 16px', background: T.accentSoft,
          borderRadius: 16, display:'flex', alignItems:'flex-start', gap: 10 }}>
          <div style={{ marginTop: 1 }}>{Icon.lock(T.accent, 14)}</div>
          <div style={{ fontSize: 13, color: T.ink2, lineHeight: 1.45 }}>
            We don't verify or store this with your bank. Change any time in Settings.
          </div>
        </div>
      </div>
      <div style={{ flex: 1 }}/>
      <div style={{ padding:'0 20px 40px' }}>
        <div style={{ height: 56, borderRadius: 28, background: T.ink,
          display:'flex', alignItems:'center', justifyContent:'center',
          color:'#fff', fontSize: 17, fontWeight: 600 }}>Continue</div>
      </div>
    </BareDevice>
  );
}

Object.assign(window, {
  S_Budgets, S_Recurring, S_AskEntry, S_AskResult, S_DayOne, S_Income,
});
