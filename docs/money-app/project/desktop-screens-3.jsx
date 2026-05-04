// Desktop Overview screen \u2014 the centerpiece.
// 5 templates over the same data: Flow, Calendar, Treemap, Cashflow, Matrix.
// Plus Ask Murmur desktop and Transactions table.

// \u2500\u2500\u2500 OVERVIEW \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function D_Overview({ template = 'mindmap' }) {
  return (
    <MurmurWindow title="Overview" active="overview" toolbarRight={
      <div style={{ display:'flex', gap: 8, alignItems:'center' }}>
        <div style={{
          padding:'6px 10px', fontSize: 12, fontWeight: 600,
          background:'rgba(255,255,255,0.7)', borderRadius: 8,
          border:`0.5px solid ${T.line}`, color: T.ink2, display:'flex', gap: 6, alignItems:'center',
        }}>
          April 2026 {Icon.chev(T.ink3, 10)}
        </div>
        <div style={{
          padding:'6px 12px', fontSize: 12, fontWeight: 600,
          background:'rgba(255,255,255,0.7)', borderRadius: 8,
          border:`0.5px solid ${T.line}`, color: T.ink2,
          display:'flex', gap: 6, alignItems:'center',
        }}>
          {Icon.list(T.ink3, 12)} Export
        </div>
      </div>
    }>
      {/* Top: greeting + template switcher */}
      <div style={{ padding:'0 0 14px', display:'flex', alignItems:'flex-end', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontFamily: T.fSerif, fontSize: 30, fontWeight: 500, color: T.ink, letterSpacing: -0.7 }}>
            April overview
          </div>
          <div style={{ fontSize: 13, color: T.ink3, marginTop: 4 }}>
            <b style={{ color: T.ink }}>$4,200</b> in \u00b7 <b style={{ color: T.ink }}>$1,330</b> out \u00b7 <b style={{ color: T.accent }}>$2,870 saved</b> \u00b7 184 transactions
          </div>
        </div>
        <TemplateSwitcher active={template}/>
      </div>

      {/* Template body */}
      <div style={{ height: 600 }}>
        {template === 'mindmap'  && <MindMapTemplate/>}
        {template === 'flow'     && <FlowTemplate/>}
        {template === 'calendar' && <CalendarTemplate/>}
        {template === 'treemap'  && <TreemapTemplate/>}
        {template === 'cashflow' && <CashflowTemplate/>}
        {template === 'matrix'   && <MatrixTemplate/>}
      </div>
    </MurmurWindow>
  );
}

function TemplateSwitcher({ active }) {
  const tabs = [
    { k:'mindmap',  label:'Mind map',  icon:'mind' },
    { k:'flow',     label:'Flow',      icon:'flow' },
    { k:'calendar', label:'Calendar',  icon:'cal' },
    { k:'treemap',  label:'Treemap',   icon:'tree' },
    { k:'cashflow', label:'Cashflow',  icon:'cash' },
    { k:'matrix',   label:'Matrix',    icon:'mat' },
  ];
  return (
    <div style={{ display:'flex', gap: 3, padding: 3, background:'rgba(0,0,0,0.05)', borderRadius: 10 }}>
      {tabs.map(t=>{
        const on = t.k === active;
        return (
          <div key={t.k} style={{
            padding:'7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: on ? '#fff' : 'transparent',
            color: on ? T.ink : T.ink3,
            boxShadow: on ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            display:'flex', alignItems:'center', gap: 6,
          }}>
            <TemplateGlyph kind={t.icon} color={on ? T.accent : T.ink4}/>
            {t.label}
          </div>
        );
      })}
    </div>
  );
}

function TemplateGlyph({ kind, color }) {
  const c = color, w = 14, h = 14;
  if (kind === 'mind') return (
    <svg width={w} height={h} viewBox="0 0 14 14">
      <circle cx="7" cy="7" r="2" fill={c}/>
      <line x1="7" y1="7" x2="2" y2="3" stroke={c} strokeWidth="1.2"/>
      <line x1="7" y1="7" x2="12" y2="3" stroke={c} strokeWidth="1.2"/>
      <line x1="7" y1="7" x2="2" y2="11" stroke={c} strokeWidth="1.2"/>
      <line x1="7" y1="7" x2="12" y2="11" stroke={c} strokeWidth="1.2"/>
      <circle cx="2" cy="3" r="1" fill={c}/><circle cx="12" cy="3" r="1" fill={c}/>
      <circle cx="2" cy="11" r="1" fill={c}/><circle cx="12" cy="11" r="1" fill={c}/>
    </svg>
  );
  if (kind === 'flow') return (
    <svg width={w} height={h} viewBox="0 0 14 14"><path d="M1,3 C 5,3 5,5 9,5 L13,5 M1,7 C 5,7 5,7 9,7 L13,7 M1,11 C 5,11 5,9 9,9 L13,9" stroke={c} strokeWidth="1.4" fill="none" strokeLinecap="round"/></svg>
  );
  if (kind === 'cal') return (
    <svg width={w} height={h} viewBox="0 0 14 14"><rect x="1" y="3" width="12" height="10" rx="1.5" fill="none" stroke={c} strokeWidth="1.2"/><line x1="1" y1="6" x2="13" y2="6" stroke={c} strokeWidth="1.2"/><circle cx="4" cy="9" r="0.8" fill={c}/><circle cx="7" cy="9" r="0.8" fill={c}/><circle cx="10" cy="9" r="0.8" fill={c}/></svg>
  );
  if (kind === 'tree') return (
    <svg width={w} height={h} viewBox="0 0 14 14"><rect x="1" y="1" width="7" height="8" fill="none" stroke={c} strokeWidth="1.2"/><rect x="9" y="1" width="4" height="5" fill="none" stroke={c} strokeWidth="1.2"/><rect x="9" y="7" width="4" height="6" fill="none" stroke={c} strokeWidth="1.2"/><rect x="1" y="10" width="7" height="3" fill="none" stroke={c} strokeWidth="1.2"/></svg>
  );
  if (kind === 'cash') return (
    <svg width={w} height={h} viewBox="0 0 14 14"><polyline points="1,10 4,7 7,9 10,4 13,6" stroke={c} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
  );
  if (kind === 'mat') return (
    <svg width={w} height={h} viewBox="0 0 14 14">{[0,1,2].map(r=>[0,1,2,3].map(cx=>(<rect key={`${r}-${cx}`} x={1+cx*3} y={2+r*3} width="2.4" height="2.4" fill={c} opacity={0.3+0.25*((r+cx)%3)}/>)))}</svg>
  );
  return null;
}

// NOTE: Full Flow / Calendar / Treemap / Cashflow / Matrix template
// implementations live in the Cloud Design source. Saved here as reference
// stubs only; consult the design for the canonical SVG layouts and data
// shapes when implementing each lens in apps/web.
function FlowTemplate()     { return <div/>; }
function CalendarTemplate() { return <div/>; }
function TreemapTemplate()  { return <div/>; }
function CashflowTemplate() { return <div/>; }
function MatrixTemplate()   { return <div/>; }

// \u2500\u2500\u2500 ASK MURMUR DESKTOP \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function D_AskMurmur() {
  return (
    <MurmurWindow title="Ask Murmur" active="ask">
      <div style={{ padding:'0 0 14px' }}>
        <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10, background: T.accent,
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>{Icon.sparkle('#fff', 16)}</div>
          <div style={{ fontFamily: T.fSerif, fontSize: 28, fontWeight: 500, color: T.ink, letterSpacing: -0.6 }}>
            Ask Murmur
          </div>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6,
            background: T.accentSoft, color: T.accent, padding:'3px 8px', borderRadius: 6 }}>GROUNDED IN YOUR DATA</span>
        </div>
        <div style={{ fontSize: 13, color: T.ink3, marginTop: 6, marginLeft: 42 }}>
          Plans, projections, and what-ifs \u2014 based strictly on your transactions, income, and budgets. Never general advice.
        </div>
      </div>

      {/* Search bar */}
      <div style={{
        background:'#fff', borderRadius: 14, border:`0.5px solid ${T.line}`,
        padding:'14px 18px', display:'flex', alignItems:'center', gap: 12, marginBottom: 14,
        boxShadow:'0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <div style={{ color: T.ink3 }}>{Icon.search(T.ink3, 16)}</div>
        <div style={{ flex: 1, fontSize: 15, color: T.ink, fontWeight: 500 }}>
          Can I afford a PS5 in July without dipping into savings?
        </div>
        <div style={{
          padding:'7px 14px', background: T.accent, color:'#fff',
          borderRadius: 8, fontSize: 12, fontWeight: 700, display:'flex', alignItems:'center', gap: 6,
        }}>{Icon.sparkle('#fff', 12)} Ask</div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap: 14, height: 470 }}>
        {/* Answer */}
        <div style={{
          background:'#fff', borderRadius: 16, border:`0.5px solid ${T.line}`,
          padding: 22, display:'flex', flexDirection:'column',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: T.accent }}/>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.ink3, letterSpacing: 0.6, textTransform:'uppercase' }}>Plan \u00b7 3 month projection</div>
          </div>

          <div style={{ fontFamily: T.fSerif, fontSize: 22, lineHeight: 1.4, color: T.ink, fontWeight: 500, letterSpacing: -0.3 }}>
            Yes \u2014 at your current pace you'll have <span style={{ color: T.accent, fontWeight: 600 }}>$1,840 in discretionary</span> by July 12, comfortably above the <b>$499</b> PS5 price.
          </div>

          {/* Mini projection chart */}
          <div style={{ marginTop: 18, marginBottom: 14, padding: 14, background: T.surface, borderRadius: 10, border:`0.5px solid ${T.line}` }}>
            <ProjectionChart/>
          </div>

          {/* Reasoning */}
          <div style={{ fontSize: 11, fontWeight: 700, color: T.ink3, letterSpacing: 0.6, textTransform:'uppercase', marginBottom: 10 }}>How I got there</div>
          <div style={{ display:'flex', flexDirection:'column', gap: 8 }}>
            <ReasonRow icon="+" text={<>Avg monthly net: <b>+$2,870</b> (last 3 months)</>} amount="+$2,870"/>
            <ReasonRow icon="\u2212" text={<>Already-set savings goal: <b>$1,200/mo</b> to emergency</>} amount="\u2212$1,200"/>
            <ReasonRow icon="\u2212" text={<>Reserved for upcoming bills (insurance, taxes)</>} amount="\u2212$310"/>
            <ReasonRow icon="=" text={<>Discretionary cushion / month</>} amount="$1,360" emphasis/>
            <ReasonRow icon="\u00d7" text={<>3 months until July 12 \u2192 $1,840 buffer at 45% confidence above 70%</>} amount="$1,840" emphasis/>
          </div>
        </div>

        {/* Right rail: data sources + suggestions */}
        <div style={{ display:'flex', flexDirection:'column', gap: 14 }}>
          <div style={{
            background:'#fff', borderRadius: 14, border:`0.5px solid ${T.line}`, padding: 16,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.ink3, letterSpacing: 0.6, textTransform:'uppercase', marginBottom: 10 }}>Sources used</div>
            {[
              ['184 voice expenses', '6 months'],
              ['3 income deposits', 'last 90d'],
              ['6 active budgets', 'current'],
              ['12 recurring bills', 'detected'],
            ].map(([l,s],i)=>(
              <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderTop: i===0?'none':`0.5px solid ${T.line}` }}>
                <span style={{ fontSize: 12, color: T.ink2, fontWeight: 600 }}>{l}</span>
                <span style={{ fontSize: 11, color: T.ink4 }}>{s}</span>
              </div>
            ))}
          </div>
          <div style={{
            background: T.ink, borderRadius: 14, padding: 16, color:'#fff',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color:'rgba(255,255,255,0.6)', letterSpacing: 0.6, textTransform:'uppercase', marginBottom: 10 }}>Try also</div>
            {[
              'How much did I spend on coffee last quarter?',
              'If I cut shopping by 30%, when would I hit $10k?',
              'Show months I overspent on food.',
              'What\'s my biggest wasted subscription?',
            ].map((q,i)=>(
              <div key={i} style={{ padding:'10px 0', fontSize: 13, color:'rgba(255,255,255,0.85)', borderTop: i===0?'none':'0.5px solid rgba(255,255,255,0.12)', cursor:'pointer' }}>
                {q}
              </div>
            ))}
          </div>
        </div>
      </div>
    </MurmurWindow>
  );
}
function ReasonRow({ icon, text, amount, emphasis }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap: 10, padding:'8px 0',
      borderTop: emphasis ? `1px solid ${T.line}` : 'none',
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: 11,
        background: emphasis ? T.accent : T.surface2,
        color: emphasis ? '#fff' : T.ink3,
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize: 13, fontWeight: 700,
      }}>{icon}</div>
      <div style={{ flex: 1, fontSize: 13, color: T.ink2, lineHeight: 1.45 }}>{text}</div>
      <div style={{
        fontFamily: T.fDisp, fontSize: emphasis?16:14, fontWeight: 700,
        color: emphasis ? T.ink : T.ink2, fontVariantNumeric:'tabular-nums',
      }}>{amount}</div>
    </div>
  );
}

function ProjectionChart() {
  const W = 700, H = 140, padX = 16, padY = 16;
  const months = ['Apr','May','Jun','Jul'];
  const proj = [4070, 5430, 6790, 8150];
  const max = 9000;
  const x = i => padX + (i/(months.length-1))*(W-padX*2);
  const y = v => H - padY - (v/max)*(H-padY*2);
  const target = 499;
  const path = proj.map((v,i)=>`${i===0?'M':'L'}${x(i)},${y(v)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H+20}`} style={{ width:'100%', height: 160 }}>
      <defs>
        <linearGradient id="pGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={T.accent} stopOpacity="0.22"/>
          <stop offset="100%" stopColor={T.accent} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={`${path} L ${x(3)},${H-padY} L ${x(0)},${H-padY} Z`} fill="url(#pGrad)"/>
      <path d={path} fill="none" stroke={T.accent} strokeWidth="2.5"/>
      {/* PS5 line */}
      <line x1={padX} x2={W-padX} y1={y(target)} y2={y(target)} stroke="#A94646" strokeWidth="1.2" strokeDasharray="4 3"/>
      <text x={padX+4} y={y(target)-4} fontSize="9" fill="#A94646" fontWeight="700">PS5 \u00b7 $499</text>
      {/* July marker */}
      <circle cx={x(3)} cy={y(proj[3])} r="5" fill="#fff" stroke={T.accent} strokeWidth="2.5"/>
      <text x={x(3)} y={y(proj[3])-12} fontSize="11" fontWeight="700" fill={T.accent} textAnchor="middle">$8,150</text>
      {months.map((m,i)=>(
        <text key={i} x={x(i)} y={H-2} fontSize="10" fill={T.ink3} textAnchor="middle" fontWeight="700">{m}</text>
      ))}
    </svg>
  );
}

// \u2500\u2500\u2500 TRANSACTIONS TABLE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function D_Transactions() {
  const rows = [
    { d:'Apr 18 \u00b7 8:42p', m:'Whole Foods', cat:'food', label:'Groceries', a:88.20, src:'voice', acc:'Murmur' },
    { d:'Apr 18 \u00b7 6:05p', m:'Amazon', cat:'shopping', label:'Online', a:42.00, src:'apple-pay', acc:'Murmur' },
    { d:'Apr 18 \u00b7 1:12p', m:'Lyft', cat:'transit', label:'Rideshare', a:12.00, src:'voice', acc:'Murmur' },
    { d:'Apr 17 \u00b7 9:14a', m:'Blue Bottle Coffee', cat:'coffee', label:'Coffee', a:6.50, src:'voice', acc:'Murmur' },
    { d:'Apr 16 \u00b7 7:30p', m:'Rappi \u00b7 Dinner', cat:'food', label:'Restaurants', a:38.80, src:'voice', acc:'Murmur' },
    { d:'Apr 15',          m:'Freelance \u00b7 Acme', cat:null, label:'Income', a:-600.00, src:'manual', acc:'Murmur' },
    { d:'Apr 14 \u00b7 11:02a', m:'Uber', cat:'transit', label:'Rideshare', a:28.50, src:'voice', acc:'Murmur' },
    { d:'Apr 13 \u00b7 8:30a', m:'Netflix', cat:'bills', label:'Subscription', a:14.00, src:'recurring', acc:'Murmur' },
    { d:'Apr 12 \u00b7 6:08p', m:"Trader Joe's", cat:'food', label:'Groceries', a:62.30, src:'voice', acc:'Murmur' },
    { d:'Apr 11 \u00b7 4:21p', m:'CVS Pharmacy', cat:'health', label:'Pharmacy', a:24.40, src:'voice', acc:'Murmur' },
    { d:'Apr 10 \u00b7 8:00p', m:'Spotify', cat:'bills', label:'Subscription', a:11.00, src:'recurring', acc:'Murmur' },
    { d:'Apr 8',           m:'Rent \u00b7 Landlord', cat:'bills', label:'Rent', a:1200.00, src:'manual', acc:'Murmur' },
  ];
  const SrcChip = ({ src }) => {
    const map = {
      'voice':     { l:'Voice', icon: Icon.mic, color: T.accent, bg: T.accentSoft },
      'apple-pay': { l:'Apple Pay', icon: Icon.list, color: '#3B4F6B', bg: '#E5E9EF' },
      'manual':    { l:'Typed', icon: Icon.list, color: T.ink2, bg: T.surface2 },
      'recurring': { l:'Recurring', icon: Icon.sparkle, color: '#7A4A22', bg: '#F2E5D5' },
    };
    const s = map[src];
    return (
      <span style={{ display:'inline-flex', alignItems:'center', gap: 5, padding:'2px 7px', borderRadius: 6, background: s.bg, color: s.color, fontSize: 11, fontWeight: 700 }}>
        {s.icon(s.color, 11)} {s.l}
      </span>
    );
  };
  return (
    <MurmurWindow title="Transactions" active="tx" toolbarRight={
      <div style={{ display:'flex', gap: 8 }}>
        <div style={{ padding:'6px 10px', fontSize: 12, fontWeight: 600, background:'rgba(255,255,255,0.7)', borderRadius: 8, border:`0.5px solid ${T.line}`, color: T.ink2 }}>Filter</div>
        <div style={{ padding:'6px 12px', fontSize: 12, fontWeight: 600, background: T.ink, color:'#fff', borderRadius: 8, display:'flex', alignItems:'center', gap: 6 }}>
          {Icon.list('#fff', 12)} Export CSV
        </div>
      </div>
    }>
      {/* Header summary */}
      <div style={{ padding:'0 0 14px', display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
        <div>
          <div style={{ fontFamily: T.fSerif, fontSize: 28, fontWeight: 500, color: T.ink, letterSpacing: -0.6 }}>184 transactions</div>
          <div style={{ fontSize: 13, color: T.ink3, marginTop: 2 }}>April \u00b7 156 voice \u00b7 18 Apple Pay \u00b7 8 typed \u00b7 12 recurring</div>
        </div>
        <div style={{ display:'flex', gap: 8 }}>
          {['All','Voice','Apple Pay','Recurring','Income'].map((f,i)=>(
            <div key={f} style={{
              padding:'6px 12px', fontSize: 12, fontWeight: 600,
              background: i===0 ? T.ink : 'transparent', color: i===0?'#fff':T.ink3,
              border: i===0?'none':`0.5px solid ${T.line}`,
              borderRadius: 8,
            }}>{f}</div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background:'#fff', borderRadius: 16, border:`0.5px solid ${T.line}`, overflow:'hidden' }}>
        <div style={{ display:'grid', gridTemplateColumns:'140px 1.6fr 1fr 0.9fr 1fr 0.7fr 32px', padding:'12px 16px',
          fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.6, textTransform:'uppercase',
          background: T.surface, borderBottom:`0.5px solid ${T.line}` }}>
          <div>Date</div>
          <div>Merchant</div>
          <div>Category</div>
          <div>Source</div>
          <div>Account</div>
          <div style={{ textAlign:'right' }}>Amount</div>
          <div/>
        </div>
        <div style={{ maxHeight: 480, overflow:'auto' }}>
          {rows.map((r,i)=>{
            const c = r.cat ? T.cat[r.cat] : { bg: T.accentSoft, fg: T.accent };
            const isIncome = r.a < 0;
            return (
              <div key={i} style={{
                display:'grid', gridTemplateColumns:'140px 1.6fr 1fr 0.9fr 1fr 0.7fr 32px',
                padding:'12px 16px', borderBottom: i===rows.length-1?'none':`0.5px solid ${T.line}`,
                fontSize: 13, alignItems:'center',
              }}>
                <div style={{ color: T.ink3, fontVariantNumeric:'tabular-nums', fontSize: 12 }}>{r.d}</div>
                <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: c.bg, color: c.fg, display:'flex', alignItems:'center', justifyContent:'center', fontWeight: 700, fontSize: 12 }}>{r.m[0]}</div>
                  <span style={{ color: T.ink, fontWeight: 600 }}>{r.m}</span>
                </div>
                <div>{r.cat ? <Chip cat={r.cat} label={r.label} size="sm"/> : <span style={{ fontSize: 11, fontWeight: 700, color: T.accent, background: T.accentSoft, padding:'2px 7px', borderRadius: 6 }}>INCOME</span>}</div>
                <div><SrcChip src={r.src}/></div>
                <div style={{ color: T.ink3 }}>{r.acc}</div>
                <div style={{ textAlign:'right' }}>
                  {isIncome ? <Money value={Math.abs(r.a)} size={13} serif={false} bold={700} positive/> : <Money value={-r.a} size={13} serif={false} bold={600}/>}
                </div>
                <div style={{ textAlign:'right', color: T.ink4 }}>\u22ef</div>
              </div>
            );
          })}
        </div>
      </div>
    </MurmurWindow>
  );
}

Object.assign(window, { D_Overview, D_AskMurmur, D_Transactions });
