// Desktop screens for Murmur companion app
// All screens inside MacWindow (1280x800 typical)

function MurmurSidebar({ active='dashboard' }) {
  const items = [
    { k:'dashboard', label:'Dashboard', icon: Icon.chart },
    { k:'tx', label:'Transactions', icon: Icon.list },
    { k:'analytics', label:'Analytics', icon: Icon.chart },
    { k:'budgets', label:'Budgets', icon: Icon.sparkle },
    { k:'forecast', label:'Forecast', icon: Icon.sparkle },
    { k:'export', label:'Export', icon: Icon.list },
  ];
  return (
    <div style={{
      width: 230, height: '100%', padding: 8, flexShrink: 0,
      position: 'relative', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        position: 'absolute', inset: 8, borderRadius: 18,
        background: 'rgba(250,247,240,0.8)',
        backdropFilter: 'blur(50px) saturate(180%)',
        WebkitBackdropFilter: 'blur(50px) saturate(180%)',
        border: '0.5px solid rgba(255,255,255,0.6)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.4)',
      }} />
      <div style={{ position: 'relative', zIndex: 1, padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div style={{ height: 32, display: 'flex', alignItems: 'center', padding: '0 14px', marginBottom: 8 }}>
          <MacTrafficLights />
        </div>
        {/* Brand */}
        <div style={{ padding:'6px 16px 18px', display:'flex', alignItems:'center', gap: 10 }}>
          <div style={{
            width: 24, height: 24, borderRadius: 6, background: T.accent,
            display:'flex', alignItems:'center', justifyContent:'center',
            color:'#fff', fontSize: 14, fontWeight: 800, fontFamily: T.fDisp,
          }}>M</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: -0.3 }}>Murmur</div>
        </div>
        <SidebarGroup label="Overview">
          {items.slice(0,2).map(i=>(
            <SidebarItem key={i.k} label={i.label} icon={i.icon} active={active===i.k}/>
          ))}
        </SidebarGroup>
        <SidebarGroup label="Analyze">
          {items.slice(2,5).map(i=>(
            <SidebarItem key={i.k} label={i.label} icon={i.icon} active={active===i.k}/>
          ))}
        </SidebarGroup>
        <SidebarGroup label="Data">
          {items.slice(5).map(i=>(
            <SidebarItem key={i.k} label={i.label} icon={i.icon} active={active===i.k}/>
          ))}
        </SidebarGroup>
      </div>
      {/* user at bottom */}
      <div style={{ flex: 1 }}/>
      <div style={{
        position:'relative', zIndex: 1, margin: '0 10px 10px', padding: '10px 12px',
        display:'flex', alignItems:'center', gap: 10,
        borderRadius: 12, background:'rgba(255,255,255,0.6)',
        border:`0.5px solid ${T.line}`,
      }}>
        <div style={{ width: 28, height: 28, borderRadius: 14, background: T.cat.food.bg, color: T.cat.food.fg, display:'flex', alignItems:'center', justifyContent:'center', fontWeight: 700, fontSize: 12 }}>J</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>Jordan</div>
          <div style={{ fontSize: 10, color: T.ink3 }}>Synced 2 min ago</div>
        </div>
      </div>
    </div>
  );
}
function SidebarGroup({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        padding:'8px 18px 4px', fontSize: 10, fontWeight: 700, color: T.ink3,
        letterSpacing: 0.6, textTransform:'uppercase',
      }}>{label}</div>
      {children}
    </div>
  );
}
function SidebarItem({ label, icon, active }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap: 8, margin:'1px 10px',
      padding:'6px 10px', borderRadius: 8,
      background: active ? T.accent : 'transparent',
      color: active ? '#fff' : T.ink2, fontSize: 12.5, fontWeight: 500,
    }}>
      {icon(active ? '#fff' : T.ink3, 14)}
      <span>{label}</span>
    </div>
  );
}

function MurmurWindow({ title, children, active, toolbarRight }) {
  return (
    <div style={{
      width: 1280, height: 820, borderRadius: 18, overflow: 'hidden',
      background: T.bgDesk,
      boxShadow: '0 0 0 1px rgba(0,0,0,0.18), 0 24px 60px rgba(0,0,0,0.3)',
      display: 'flex', position: 'relative', fontFamily: T.fSans,
    }}>
      <MurmurSidebar active={active}/>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bgDesk }}>
        {/* Toolbar */}
        <div style={{
          height: 52, display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'0 20px', flexShrink: 0,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, letterSpacing: -0.3 }}>{title}</div>
          <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
            {toolbarRight}
            <div style={{
              display:'flex', alignItems:'center', gap: 8, padding:'6px 12px',
              background:'rgba(255,255,255,0.7)', borderRadius: 8,
              border:`0.5px solid ${T.line}`, fontSize: 12, color: T.ink3,
            }}>
              {Icon.search(T.ink3, 13)} Search expenses
              <span style={{ color: T.ink4, fontFamily: T.fMono, fontSize: 11 }}>⌘K</span>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', padding:'0 20px 20px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Desktop 1: Dashboard ─────────────────────────────────────────
function D_Dashboard() {
  return (
    <MurmurWindow title="Dashboard" active="dashboard" toolbarRight={
      <div style={{ display:'flex', gap: 4, padding: 3, background:'rgba(0,0,0,0.05)', borderRadius: 8 }}>
        {['Week','Month','Quarter','Year'].map((p,i)=>(
          <div key={p} style={{
            padding:'4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: i===1 ? '#fff' : 'transparent',
            color: i===1 ? T.ink : T.ink3,
            boxShadow: i===1 ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
          }}>{p}</div>
        ))}
      </div>
    }>
      {/* Greeting row */}
      <div style={{ padding:'0 0 16px', display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
        <div>
          <div style={{ fontFamily: T.fSerif, fontSize: 32, fontWeight: 500, color: T.ink, letterSpacing: -0.8 }}>
            Good morning, Jordan.
          </div>
          <div style={{ fontSize: 13, color: T.ink3, marginTop: 4 }}>
            You're tracking ahead — <span style={{ color: T.accent, fontWeight: 600 }}>$310 below</span> your April pace.
          </div>
        </div>
      </div>
      {/* KPI strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap: 14, marginBottom: 16 }}>
        <KPI label="Spent this month"   value={1330} delta={-12} sub="vs March"/>
        <KPI label="Daily average"       value={73.88} delta={-8} sub="last 7 days" small/>
        <KPI label="Largest category"    value={412}  custom="Food & drink · 31%"/>
        <KPI label="Projected month-end" value={2240} delta={-14} sub="vs usual" forecast/>
      </div>
      {/* Middle row: trend + categories */}
      <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap: 14, marginBottom: 14 }}>
        <Card title="Spending trend" right={<LegendDot/>}>
          <TrendChart/>
        </Card>
        <Card title="By category">
          <CatRings/>
        </Card>
      </div>
      {/* Bottom row: recent + insight */}
      <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap: 14 }}>
        <Card title="Recent activity" right={<span style={{ fontSize: 12, color: T.accent, fontWeight: 600 }}>View all</span>}>
          <DeskTxTable/>
        </Card>
        <Card title="Weekly pulse" dark>
          <PulseCard/>
        </Card>
      </div>
    </MurmurWindow>
  );
}
function Card({ title, right, children, dark=false }) {
  return (
    <div style={{
      background: dark ? T.ink : '#fff', borderRadius: 16,
      padding: '16px 18px', border: dark ? 'none' : `0.5px solid ${T.line}`,
      boxShadow: dark ? 'none' : '0 1px 0 rgba(0,0,0,0.02)',
      display:'flex', flexDirection:'column', minHeight: 0,
    }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: dark ? 'rgba(255,255,255,0.6)' : T.ink3, letterSpacing: 0.6, textTransform:'uppercase' }}>{title}</div>
        {right}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}
function KPI({ label, value, delta, sub, small=false, custom, forecast=false }) {
  return (
    <div style={{
      background:'#fff', borderRadius: 16, padding:'16px 18px',
      border:`0.5px solid ${T.line}`,
      position:'relative', overflow:'hidden',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.ink3, letterSpacing: 0.6, textTransform:'uppercase' }}>{label}</div>
      <div style={{ marginTop: 8 }}><Money value={value} size={small ? 22 : 28}/></div>
      <div style={{ marginTop: 6, display:'flex', alignItems:'center', gap: 6, fontSize: 12 }}>
        {delta != null && (
          <span style={{
            color: delta<0 ? T.accent : '#A94646',
            background: delta<0 ? T.accentSoft : '#F4DDDD',
            padding:'2px 7px', borderRadius: 6, fontWeight: 700,
          }}>{delta<0?'↓':'↑'} {Math.abs(delta)}%</span>
        )}
        <span style={{ color: T.ink3 }}>{custom || sub}</span>
      </div>
      {forecast && <div style={{ position:'absolute', top: 14, right: 14 }}>{Icon.sparkle(T.ink4, 14)}</div>}
    </div>
  );
}
function LegendDot() {
  return (
    <div style={{ display:'flex', gap: 12, fontSize: 11, color: T.ink3, fontWeight: 600 }}>
      <span style={{ display:'flex', alignItems:'center', gap: 5 }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: T.accent }}/> This month
      </span>
      <span style={{ display:'flex', alignItems:'center', gap: 5 }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: T.ink4 }}/> Last month
      </span>
    </div>
  );
}
function TrendChart() {
  // two lines — this month (accent) and last (muted)
  const w = 640, h = 220, pad = 20;
  const cur = [20,35,28,45,60,55,72,68,90,82,100,95,85,78,92,88,80,70];
  const prev = [30,42,38,50,72,68,88,82,102,110,118,112,110,115,120,118,116,112];
  const max = 140;
  const toPath = (arr) => arr.map((v,i)=>{
    const x = pad + (i/(arr.length-1))*(w-pad*2);
    const y = h-pad - (v/max)*(h-pad*2);
    return `${i===0?'M':'L'}${x},${y}`;
  }).join(' ');
  const days = ['1','3','5','7','9','11','13','15','17'];
  return (
    <svg viewBox={`0 0 ${w} ${h+24}`} style={{ width:'100%', height: 240 }}>
      <defs>
        <linearGradient id="gCur" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={T.accent} stopOpacity="0.22"/>
          <stop offset="100%" stopColor={T.accent} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {/* gridlines */}
      {[0,1,2,3,4].map(i=>{
        const y = pad + i*((h-pad*2)/4);
        return <line key={i} x1={pad} x2={w-pad} y1={y} y2={y} stroke={T.line} strokeDasharray="2 3"/>;
      })}
      <path d={`${toPath(cur)} L ${w-pad},${h-pad} L ${pad},${h-pad} Z`} fill="url(#gCur)"/>
      <path d={toPath(prev)} fill="none" stroke={T.ink4} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.55"/>
      <path d={toPath(cur)} fill="none" stroke={T.accent} strokeWidth="2.5"/>
      {/* current marker */}
      {(() => {
        const i = cur.length-1;
        const x = pad + (i/(cur.length-1))*(w-pad*2);
        const y = h-pad - (cur[i]/max)*(h-pad*2);
        return <g><circle cx={x} cy={y} r="5" fill="#fff" stroke={T.accent} strokeWidth="2.5"/></g>;
      })()}
      {days.map((d,i)=>(
        <text key={i} x={pad + (i/(days.length-1))*(w-pad*2)} y={h+14}
          fontSize="10" fill={T.ink3} textAnchor="middle" fontFamily={T.fSans} fontWeight="600">Apr {d}</text>
      ))}
    </svg>
  );
}
function CatRings() {
  const cats = [
    { cat:'food', label:'Food & drink', pct: 31, amt: 412 },
    { cat:'shopping', label:'Shopping', pct: 22, amt: 298 },
    { cat:'bills', label:'Bills', pct: 17, amt: 230 },
    { cat:'transit', label:'Transit', pct: 14, amt: 186 },
    { cat:'other', label:'Other', pct: 16, amt: 204 },
  ];
  const r = 64, C = 2*Math.PI*r;
  let off = 0;
  return (
    <div style={{ display:'flex', alignItems:'center', gap: 18 }}>
      <svg width="160" height="160" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r={r} fill="none" stroke={T.surface2} strokeWidth="18"/>
        {cats.map((c,i)=>{
          const len = (c.pct/100)*C;
          const el = (
            <circle key={i} cx="80" cy="80" r={r} fill="none"
              stroke={T.cat[c.cat].fg} strokeWidth="18"
              strokeDasharray={`${len} ${C-len}`} strokeDashoffset={-off}
              transform="rotate(-90 80 80)"/>
          );
          off += len + 2;
          return el;
        })}
        <text x="80" y="76" textAnchor="middle" fontSize="11" fill={T.ink3} fontWeight="600">Total</text>
        <text x="80" y="94" textAnchor="middle" fontSize="18" fill={T.ink} fontWeight="700" fontFamily={T.fDisp}>$1,330</text>
      </svg>
      <div style={{ flex: 1, display:'flex', flexDirection:'column', gap: 6 }}>
        {cats.map((c,i)=>(
          <div key={i} style={{ display:'flex', alignItems:'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: T.cat[c.cat].fg }}/>
            <span style={{ flex: 1, color: T.ink2, fontWeight: 500 }}>{c.label}</span>
            <span style={{ color: T.ink3, fontWeight: 600, fontVariantNumeric:'tabular-nums' }}>{c.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
function DeskTxTable() {
  const rows = [
    { amt: 12.40, m:'Blue Bottle Coffee', cat:'coffee', label:'Coffee', t:'Today · 9:41', voice: true },
    { amt: 28.50, m:'Uber',               cat:'transit', label:'Transit', t:'Today · 8:12', voice: true },
    { amt: 62.30, m:"Trader Joe's",       cat:'food', label:'Groceries', t:'Yesterday', voice: true },
    { amt: 14.00, m:'Netflix',            cat:'bills', label:'Subscription', t:'Yesterday', voice: false },
    { amt: 38.80, m:'Rappi · Dinner',     cat:'food', label:'Food', t:'Apr 16', voice: true },
  ];
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1.2fr 1fr 0.8fr', padding:'0 8px 8px',
        fontSize: 10, fontWeight: 700, color: T.ink3, letterSpacing: 0.6, textTransform:'uppercase',
        borderBottom:`0.5px solid ${T.line}` }}>
        <div>Merchant</div><div>Category</div><div>Date</div><div style={{ textAlign:'right' }}>Amount</div>
      </div>
      {rows.map((r,i)=>{
        const c = T.cat[r.cat];
        return (
          <div key={i} style={{
            display:'grid', gridTemplateColumns:'2fr 1.2fr 1fr 0.8fr',
            padding:'10px 8px', borderBottom: i===rows.length-1?'none':`0.5px solid ${T.line}`,
            fontSize: 13, alignItems:'center',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, background: c.bg, color: c.fg,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontWeight: 700, fontSize: 12,
              }}>{r.m[0]}</div>
              <span style={{ color: T.ink, fontWeight: 600 }}>{r.m}</span>
              {r.voice && <span>{Icon.mic(T.accent, 11)}</span>}
            </div>
            <div><Chip cat={r.cat} label={r.label} size="sm"/></div>
            <div style={{ color: T.ink3 }}>{r.t}</div>
            <div style={{ textAlign:'right' }}><Money value={-r.amt} size={13} serif={false} bold={600}/></div>
          </div>
        );
      })}
    </div>
  );
}
function PulseCard() {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap: 14 }}>
      <div style={{ fontFamily: T.fSerif, fontSize: 20, lineHeight: 1.35, color:'#fff', fontWeight: 500 }}>
        You spend <span style={{ color:'#C9D6BE' }}>34% less</span> on weekends — but coffee doubles on Fridays.
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap: 4 }}>
        {['M','T','W','T','F','S','S'].map((d,i)=>{
          const vals = [0.4,0.3,0.35,0.45,0.7,0.25,0.2];
          return (
            <div key={i}>
              <div style={{
                height: 60, borderRadius: 6,
                background: `rgba(201,214,190,${vals[i]})`,
                border:'0.5px solid rgba(255,255,255,0.1)',
              }}/>
              <div style={{ textAlign:'center', fontSize: 10, color:'rgba(255,255,255,0.55)', marginTop: 4, fontWeight: 600 }}>{d}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { D_Dashboard, MurmurWindow, MurmurSidebar, Card, KPI });
