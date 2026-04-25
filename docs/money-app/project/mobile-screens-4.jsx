// Final mobile screens: settings, privacy center, empty, paywall, permissions, history, split

// ─── Settings ──────────────────────────────────────────────────
function S_Settings() {
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      <div style={{ padding:'14px 22px 16px' }}>
        <div style={{ fontFamily: T.fDisp, fontSize: 34, fontWeight: 700, color: T.ink, letterSpacing: -0.8 }}>
          Settings
        </div>
      </div>
      <div style={{ flex: 1, overflow:'auto', paddingBottom: 40 }}>
        {/* profile */}
        <div style={{ padding:'0 16px 20px' }}>
          <div style={{ background:'#fff', borderRadius: 22, padding:'16px 18px',
            display:'flex', alignItems:'center', gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 24, background: T.cat.food.bg, color: T.cat.food.fg,
              display:'flex', alignItems:'center', justifyContent:'center', fontWeight: 700, fontSize: 18 }}>J</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>Jordan</div>
              <div style={{ fontSize: 12, color: T.ink3 }}>Free plan · 184 expenses</div>
            </div>
            <div style={{ padding:'6px 10px', borderRadius: 8, background: T.accent, color:'#fff',
              fontSize: 12, fontWeight: 700 }}>Upgrade</div>
          </div>
        </div>
        <SetGroup label="Voice & capture">
          <SetRow label="Voice engine" detail="On-device"/>
          <SetRow label="Language" detail="English (US)"/>
          <SetRow label="Apple Pay auto-log" toggle on/>
          <SetRow label="Haptics" toggle on last/>
        </SetGroup>
        <SetGroup label="Privacy">
          <SetRow label="Privacy center" detail="Review"/>
          <SetRow label="Require Face ID" toggle off/>
          <SetRow label="Export data"/>
          <SetRow label="Delete all data" danger last/>
        </SetGroup>
        <SetGroup label="Sync">
          <SetRow label="iCloud sync" toggle on/>
          <SetRow label="Desktop companion" detail="Connected" last/>
        </SetGroup>
        <SetGroup label="About">
          <SetRow label="Help & contact"/>
          <SetRow label="Version" detail="1.0 (build 184)" chevron={false} last/>
        </SetGroup>
      </div>
    </BareDevice>
  );
}
function SetGroup({ label, children }) {
  return (
    <div style={{ padding:'0 16px 24px' }}>
      <div style={{ padding:'0 20px 8px', color: T.ink3, fontSize: 12,
        fontWeight: 700, letterSpacing: 0.5, textTransform:'uppercase' }}>{label}</div>
      <div style={{ background:'#fff', borderRadius: 22, overflow:'hidden' }}>{children}</div>
    </div>
  );
}
function SetRow({ label, detail, toggle, on, last, danger, chevron = true }) {
  return (
    <div style={{ padding:'14px 18px', display:'flex', alignItems:'center', gap: 10,
      borderBottom: last ? 'none' : `0.5px solid ${T.line}` }}>
      <div style={{ flex: 1, fontSize: 15, fontWeight: 500, color: danger ? '#A94646' : T.ink }}>{label}</div>
      {detail && <div style={{ fontSize: 13, color: T.ink3, fontWeight: 500 }}>{detail}</div>}
      {toggle && (
        <div style={{ width: 42, height: 26, borderRadius: 13, background: on ? T.accent : '#E2DED3',
          padding: 2, display:'flex', justifyContent: on ? 'flex-end' : 'flex-start' }}>
          <div style={{ width: 22, height: 22, borderRadius: 11, background:'#fff',
            boxShadow:'0 2px 4px rgba(0,0,0,0.15)' }}/>
        </div>
      )}
      {!toggle && chevron && Icon.chev(T.ink4)}
    </div>
  );
}

// ─── Privacy Center ──────────────────────────────────────────────
function S_Privacy() {
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      <div style={{ padding:'8px 20px', display:'flex', alignItems:'center', gap: 8 }}>
        <div style={{ width: 36, height: 36, borderRadius: 18, background:'#fff',
          border:`0.5px solid ${T.line}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          {Icon.chev(T.ink2)}
        </div>
        <div style={{ fontSize: 15, color: T.ink3, fontWeight: 600 }}>Settings</div>
      </div>
      <div style={{ padding:'20px 24px 8px' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: T.accentSoft,
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          {Icon.lock(T.accent, 22)}
        </div>
        <div style={{ fontFamily: T.fSerif, fontSize: 32, fontWeight: 500, color: T.ink,
          letterSpacing: -0.6, lineHeight: 1.2, marginTop: 14 }}>
          Your money, yours.
        </div>
        <div style={{ color: T.ink3, fontSize: 14, lineHeight: 1.5, marginTop: 10 }}>
          Murmur never links to your bank. Your voice stays on your device unless you explicitly opt in.
        </div>
      </div>
      <div style={{ flex: 1, overflow:'auto', padding:'20px 0 40px' }}>
        <SetGroup label="What's stored where">
          <PrivacyRow icon="📱" label="On this device" detail="Voice recordings · Transcripts"/>
          <PrivacyRow icon="☁️" label="Your iCloud" detail="Expenses · Categories"/>
          <PrivacyRow icon="🚫" label="Our servers" detail="Nothing identifying" last/>
        </SetGroup>
        <SetGroup label="Controls">
          <SetRow label="Process voice on-device only" toggle on/>
          <SetRow label="Share anonymous analytics" toggle off/>
          <SetRow label="Delete voice recordings after 24h" toggle on last/>
        </SetGroup>
        <SetGroup label="Your rights">
          <SetRow label="Export all my data"/>
          <SetRow label="Delete everything permanently" danger last/>
        </SetGroup>
      </div>
    </BareDevice>
  );
}
function PrivacyRow({ icon, label, detail, last }) {
  return (
    <div style={{ padding:'14px 18px', display:'flex', alignItems:'center', gap: 14,
      borderBottom: last ? 'none' : `0.5px solid ${T.line}` }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: T.accentSoft,
        display:'flex', alignItems:'center', justifyContent:'center', fontSize: 17 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{label}</div>
        <div style={{ fontSize: 12, color: T.ink3, marginTop: 1 }}>{detail}</div>
      </div>
    </div>
  );
}

// ─── Empty state (day 1) ────────────────────────────────────────
function S_Empty() {
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      <div style={{ padding:'14px 22px 8px' }}>
        <div style={{ color: T.ink4, fontSize: 13, fontWeight: 600, letterSpacing: 0.4, textTransform:'uppercase' }}>
          April
        </div>
        <div style={{ fontFamily: T.fDisp, fontSize: 34, fontWeight: 700, color: T.ink, letterSpacing: -0.8 }}>
          Today
        </div>
      </div>
      <div style={{ flex: 1, display:'flex', flexDirection:'column', alignItems:'center',
        justifyContent:'center', padding:'0 40px 120px', textAlign:'center' }}>
        <div style={{ width: 96, height: 96, borderRadius: 48, background: T.accentSoft,
          display:'flex', alignItems:'center', justifyContent:'center', marginBottom: 28 }}>
          {Icon.mic(T.accent, 42)}
        </div>
        <div style={{ fontFamily: T.fSerif, fontSize: 26, fontWeight: 500, color: T.ink,
          letterSpacing: -0.4, lineHeight: 1.25 }}>
          Tap the mic, speak your first expense.
        </div>
        <div style={{ fontSize: 14, color: T.ink3, marginTop: 12, lineHeight: 1.5 }}>
          Try: <span style={{ background: T.accentSoft, color: T.accent, fontWeight: 600,
            padding:'2px 8px', borderRadius: 6 }}>"Seven fifty at the bakery"</span>
        </div>
        <div style={{ marginTop: 32, padding:'10px 16px', borderRadius: 999,
          background:'#fff', border:`0.5px solid ${T.line}`,
          display:'inline-flex', alignItems:'center', gap: 8,
          fontSize: 13, color: T.ink2, fontWeight: 500 }}>
          or <span style={{ color: T.accent, fontWeight: 700 }}>type it manually</span>
        </div>
      </div>
      <TabBar active="today"/>
    </BareDevice>
  );
}

// ─── Paywall ────────────────────────────────────────────────────
function S_Paywall() {
  return (
    <BareDevice dark>
      <div style={{ position:'absolute', inset:0,
        background:'radial-gradient(120% 80% at 30% 0%, #2b3a2b 0%, #0B0B0C 55%)' }}/>
      <div style={{ paddingTop: 56 }}/>
      <div style={{ position:'relative', padding:'8px 20px', display:'flex', justifyContent:'flex-end' }}>
        <div style={{ width: 36, height: 36, borderRadius: 18,
          background:'rgba(255,255,255,0.12)',
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          {Icon.close('#fff', 16)}</div>
      </div>
      <div style={{ position:'relative', padding:'32px 28px 0', color:'#fff' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap: 6,
          padding:'6px 10px', background: T.accent, borderRadius: 999,
          fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform:'uppercase' }}>
          {Icon.sparkle('#fff', 12)} Murmur Plus · Desktop
        </div>
        <div style={{ fontFamily: T.fSerif, fontSize: 38, fontWeight: 500, letterSpacing: -0.8,
          lineHeight: 1.1, marginTop: 22 }}>
          Mobile stays free.<br/>Forever.
        </div>
        <div style={{ color:'rgba(255,255,255,0.7)', fontSize: 15, lineHeight: 1.5, marginTop: 14 }}>
          No trial, no countdown. Unlock the desktop companion only if you want deeper analytics.
        </div>
      </div>
      <div style={{ position:'relative', padding:'28px 24px 0', display:'flex', flexDirection:'column', gap: 10 }}>
        {[
          'Desktop app with trends, forecasts & budgets',
          'Ask Murmur — grounded AI over your data',
          'Recurring subscription detection',
          'Export to CSV & PDF',
        ].map((f,i)=>(
          <div key={i} style={{ display:'flex', alignItems:'center', gap: 12,
            color:'rgba(255,255,255,0.9)', fontSize: 14 }}>
            <div style={{ width: 22, height: 22, borderRadius: 11, background: T.accent,
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              {Icon.check('#fff', 12)}
            </div>
            {f}
          </div>
        ))}
      </div>
      <div style={{ flex: 1 }}/>
      <div style={{ position:'relative', padding:'0 20px 36px' }}>
        {/* plan toggle */}
        <div style={{ display:'flex', gap: 10, marginBottom: 18 }}>
          <PlanCard period="Monthly" price="$4.99" sub="billed monthly"/>
          <PlanCard period="Yearly" price="$39" sub="$3.25/mo · save 35%" featured/>
        </div>
        <div style={{ height: 56, borderRadius: 28, background:'#fff',
          display:'flex', alignItems:'center', justifyContent:'center',
          color: T.ink, fontSize: 17, fontWeight: 700, letterSpacing: -0.2 }}>
          Upgrade to Plus
        </div>
        <div style={{ textAlign:'center', color:'rgba(255,255,255,0.5)', fontSize: 12,
          marginTop: 12, fontWeight: 500 }}>
          Cancel any time · Free mobile tier is never limited
        </div>
      </div>
    </BareDevice>
  );
}
function PlanCard({ period, price, sub, featured }) {
  return (
    <div style={{
      flex: 1, padding:'14px 16px', borderRadius: 16,
      background: featured ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
      border: featured ? `1.5px solid ${T.accent}` : '0.5px solid rgba(255,255,255,0.12)',
      position:'relative',
    }}>
      {featured && <div style={{ position:'absolute', top: -10, right: 10,
        padding:'3px 8px', background: T.accent, color:'#fff', borderRadius: 6,
        fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform:'uppercase' }}>Best</div>}
      <div style={{ color:'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600 }}>{period}</div>
      <div style={{ color:'#fff', fontFamily: T.fDisp, fontSize: 22, fontWeight: 700, letterSpacing: -0.5, marginTop: 2 }}>{price}</div>
      <div style={{ color:'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

// ─── Permissions ────────────────────────────────────────────────
function S_Permissions() {
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      <div style={{ padding:'40px 28px 0', flex: 1, display:'flex', flexDirection:'column' }}>
        <div style={{ color: T.ink4, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform:'uppercase' }}>
          Step 2 of 3
        </div>
        <div style={{ fontFamily: T.fSerif, fontSize: 34, fontWeight: 500, color: T.ink,
          letterSpacing: -0.6, lineHeight: 1.2, marginTop: 10 }}>
          A few permissions, then you're set.
        </div>
        <div style={{ color: T.ink3, fontSize: 14, lineHeight: 1.5, marginTop: 10 }}>
          We ask for the minimum. You can change these later in Settings.
        </div>
        <div style={{ marginTop: 36, display:'flex', flexDirection:'column', gap: 12 }}>
          <PermCard icon={Icon.mic} t="Microphone" s="So you can log expenses with your voice." granted/>
          <PermCard icon={Icon.sparkle} t="Shortcuts · Apple Pay" s="Auto-capture transactions when you pay." granted/>
          <PermCard icon={Icon.lock} t="Face ID" s="Optional — lock the app if you share your phone."/>
        </div>
        <div style={{ flex: 1 }}/>
        <div style={{ padding:'0 0 40px' }}>
          <div style={{ height: 56, borderRadius: 28, background: T.ink,
            display:'flex', alignItems:'center', justifyContent:'center',
            color:'#fff', fontSize: 17, fontWeight: 600 }}>Continue</div>
        </div>
      </div>
    </BareDevice>
  );
}
function PermCard({ icon, t, s, granted }) {
  return (
    <div style={{ padding:'14px 16px', background:'#fff', borderRadius: 16,
      border:`0.5px solid ${T.line}`, display:'flex', alignItems:'center', gap: 14 }}>
      <div style={{ width: 38, height: 38, borderRadius: 10,
        background: granted ? T.accentSoft : T.surface2,
        display:'flex', alignItems:'center', justifyContent:'center' }}>
        {icon(granted ? T.accent : T.ink3, 18)}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: T.ink, letterSpacing: -0.2 }}>{t}</div>
        <div style={{ fontSize: 12.5, color: T.ink3, marginTop: 2, lineHeight: 1.4 }}>{s}</div>
      </div>
      {granted ? (
        <div style={{ width: 24, height: 24, borderRadius: 12, background: T.accent,
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          {Icon.check('#fff', 13)}
        </div>
      ) : (
        <div style={{ padding:'6px 12px', borderRadius: 999, background: T.ink,
          color:'#fff', fontSize: 12, fontWeight: 700 }}>Allow</div>
      )}
    </div>
  );
}

// ─── History / month scrubber ───────────────────────────────────
function S_History() {
  const months = [
    { m:'January', t: 1420 },
    { m:'February', t: 1680 },
    { m:'March', t: 1512 },
    { m:'April', t: 1330, current: true },
  ];
  const days = Array.from({length: 18}, (_,i)=>({
    d: i+1,
    amt: [34,12,58,0,92,46,22,0,128,74,42,0,38,88,16,54,72,45][i]||0,
  }));
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      <div style={{ padding:'8px 20px', display:'flex', alignItems:'center', gap: 8 }}>
        <div style={{ width: 36, height: 36, borderRadius: 18, background:'#fff',
          border:`0.5px solid ${T.line}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          {Icon.chev(T.ink2)}
        </div>
        <div style={{ fontSize: 15, color: T.ink3, fontWeight: 600 }}>Today</div>
      </div>
      <div style={{ padding:'14px 22px 8px' }}>
        <div style={{ color: T.ink4, fontSize: 13, fontWeight: 600, letterSpacing: 0.4, textTransform:'uppercase' }}>
          History
        </div>
        <div style={{ fontFamily: T.fDisp, fontSize: 34, fontWeight: 700, color: T.ink, letterSpacing: -0.8 }}>
          2026
        </div>
      </div>
      {/* calendar heatmap for April */}
      <div style={{ padding:'12px 20px 0' }}>
        <div style={{ background:'#fff', borderRadius: 22, padding:'18px 18px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>April</div>
            <Money value={1330} size={16} serif={false} bold={700}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap: 6 }}>
            {['S','M','T','W','T','F','S'].map((d,i)=>(
              <div key={i} style={{ fontSize: 10, color: T.ink4, textAlign:'center', fontWeight: 700 }}>{d}</div>
            ))}
            {[null,null,null].map((_,i)=><div key={'x'+i}/>)}
            {days.map((x,i)=>{
              const op = x.amt ? 0.2 + Math.min(x.amt/130, 1)*0.7 : 0;
              const isToday = x.d===18;
              return (
                <div key={i} style={{
                  aspectRatio:'1', borderRadius: 6,
                  background: x.amt ? `rgba(63,90,62,${op})` : T.surface2,
                  border: isToday ? `1.5px solid ${T.ink}` : 'none',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize: 10, fontWeight: 600,
                  color: x.amt && op>0.5 ? '#fff' : T.ink3,
                }}>{x.d}</div>
              );
            })}
          </div>
        </div>
      </div>
      {/* month rows */}
      <div style={{ padding:'20px 16px 140px', flex: 1, overflow:'auto' }}>
        <div style={{ padding:'0 8px 8px', color: T.ink3, fontSize: 11, fontWeight: 700,
          letterSpacing: 0.6, textTransform:'uppercase' }}>Months</div>
        <div style={{ background:'#fff', borderRadius: 22, overflow:'hidden' }}>
          {months.slice().reverse().map((m,i,a)=>(
            <div key={i} style={{ padding:'14px 18px', display:'flex', alignItems:'center',
              justifyContent:'space-between', borderBottom: i===a.length-1 ? 'none' : `0.5px solid ${T.line}` }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: T.ink }}>{m.m}</div>
                {m.current && <div style={{ fontSize: 11, color: T.accent, fontWeight: 700, marginTop: 1 }}>In progress</div>}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
                <Money value={m.t} size={14} serif={false} bold={600}/>
                {Icon.chev(T.ink4)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </BareDevice>
  );
}

Object.assign(window, { S_Settings, S_Privacy, S_Empty, S_Paywall, S_Permissions, S_History });
