// More desktop screens: Analytics deep-dive, Budgets

function D_Analytics() {
  return (
    <MurmurWindow title="Analytics · Forecast" active="forecast" toolbarRight={
      <div style={{ display:'flex', gap: 8, alignItems:'center' }}>
        <div style={{
          padding:'6px 10px', fontSize: 12, fontWeight: 600,
          background:'rgba(255,255,255,0.7)', borderRadius: 8,
          border:`0.5px solid ${T.line}`, color: T.ink2, display:'flex', gap: 6, alignItems:'center',
        }}>
          Last 6 months {Icon.chev(T.ink3, 10)}
        </div>
        <div style={{
          padding:'6px 12px', fontSize: 12, fontWeight: 600,
          background: T.ink, color:'#fff', borderRadius: 8,
          display:'flex', gap: 6, alignItems:'center',
        }}>
          {Icon.sparkle('#fff', 12)} Generate report
        </div>
      </div>
    }>
      {/* Title row */}
      <div style={{ padding:'0 0 14px' }}>
        <div style={{ fontFamily: T.fSerif, fontSize: 28, fontWeight: 500, color: T.ink, letterSpacing: -0.6 }}>
          Forecast & patterns
        </div>
        <div style={{ fontSize: 13, color: T.ink3, marginTop: 2 }}>
          Based on 184 voice-logged expenses across 6 months.
        </div>
      </div>
      {/* 6-month forecast chart */}
      <div style={{ background:'#fff', borderRadius: 16, padding:'18px 20px',
        border:`0.5px solid ${T.line}`, marginBottom: 14, height: 360 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.ink3, letterSpacing: 0.6, textTransform:'uppercase' }}>Monthly total · forecast</div>
            <div style={{ marginTop: 6, display:'flex', alignItems:'baseline', gap: 12 }}>
              <Money value={2240} size={34}/>
              <span style={{ fontSize: 13, color: T.ink3 }}>projected for April</span>
              <span style={{
                fontSize: 12, color: T.accent, fontWeight: 700,
                background: T.accentSoft, padding:'2px 8px', borderRadius: 6,
              }}>−14% vs 6-mo average</span>
            </div>
          </div>
          <div style={{ display:'flex', gap: 14, fontSize: 11, color: T.ink3, fontWeight: 600 }}>
            <span style={{ display:'flex', alignItems:'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: T.accent }}/> Actual
            </span>
            <span style={{ display:'flex', alignItems:'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: T.cat.coffee.fg, opacity: 0.35 }}/> Forecast
            </span>
            <span style={{ display:'flex', alignItems:'center', gap: 5 }}>
              <span style={{ width: 10, height: 4, background: T.ink4 }}/> Budget
            </span>
          </div>
        </div>
        <ForecastChart/>
      </div>
      {/* Bottom row: insights + merchants */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap: 14 }}>
        <Card title="Patterns">
          <div style={{ display:'flex', flexDirection:'column', gap: 10 }}>
            <Insight text={<>Friday is your <b>heaviest</b> day — avg <b>$84</b>.</>}/>
            <Insight text={<>Coffee spend rose <b>+22%</b> over 3 months.</>}/>
            <Insight text={<>Subscriptions now <b>17%</b> of total. Review?</>}/>
          </div>
        </Card>
        <Card title="Top merchants">
          <div style={{ display:'flex', flexDirection:'column', gap: 8 }}>
            {[
              { m:"Trader Joe's", amt: 312, cat:'food', bar: 1 },
              { m:'Uber', amt: 186, cat:'transit', bar: 0.6 },
              { m:'Blue Bottle', amt: 142, cat:'coffee', bar: 0.46 },
              { m:'Netflix', amt: 84, cat:'bills', bar: 0.27 },
              { m:'Amazon', amt: 78, cat:'shopping', bar: 0.25 },
            ].map((r,i)=>(
              <div key={i} style={{ display:'flex', alignItems:'center', gap: 10, fontSize: 12 }}>
                <div style={{ width: 90, color: T.ink2, fontWeight: 600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.m}</div>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: T.surface2, overflow:'hidden' }}>
                  <div style={{ width: `${r.bar*100}%`, height:'100%', background: T.cat[r.cat].fg, opacity: 0.85, borderRadius: 4 }}/>
                </div>
                <div style={{ width: 52, textAlign:'right' }}>
                  <Money value={r.amt} size={12} serif={false} bold={600}/>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Heatmap · weekday × hour">
          <Heatmap/>
        </Card>
      </div>
    </MurmurWindow>
  );
}

function ForecastChart() {
  const w = 1120, h = 260, pad = 28;
  // 6 months + 3 forecast
  const actual = [1820, 1720, 1980, 1880, 1620, 1330];
  const forecast = [null, null, null, null, null, 1330, 2240, 2310, 2180];
  const budget = 2500;
  const all = [...actual, ...forecast.slice(6)];
  const max = 2800;
  const labels = ['Nov','Dec','Jan','Feb','Mar','Apr','May','Jun','Jul'];
  const x = i => pad + (i/(labels.length-1))*(w-pad*2);
  const y = v => h-pad - (v/max)*(h-pad*2);
  return (
    <svg viewBox={`0 0 ${w} ${h+24}`} style={{ width:'100%', height: 280 }}>
      <defs>
        <linearGradient id="gActual" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={T.accent} stopOpacity="0.22"/>
          <stop offset="100%" stopColor={T.accent} stopOpacity="0"/>
        </linearGradient>
        <pattern id="fHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill={T.cat.coffee.bg}/>
          <line x1="0" y="0" x2="0" y2="6" stroke={T.cat.coffee.fg} strokeOpacity="0.25" strokeWidth="2"/>
        </pattern>
      </defs>
      {/* gridlines */}
      {[0,1,2,3,4].map(i=>{
        const gy = pad + i*((h-pad*2)/4);
        const val = Math.round(max - i*(max/4));
        return <g key={i}>
          <line x1={pad} x2={w-pad} y1={gy} y2={gy} stroke={T.line} strokeDasharray="2 3"/>
          <text x={8} y={gy+4} fontSize="10" fill={T.ink4} fontWeight="600">${val}</text>
        </g>;
      })}
      {/* budget line */}
      <line x1={pad} x2={w-pad} y1={y(budget)} y2={y(budget)} stroke={T.ink4} strokeWidth="1.5" strokeDasharray="6 4"/>
      <text x={w-pad-6} y={y(budget)-6} fontSize="10" fill={T.ink3} textAnchor="end" fontWeight="700">Budget $2,500</text>
      {/* forecast band */}
      {(() => {
        const fx = forecast.map((v,i)=>v==null?null:[x(i),y(v)]).filter(Boolean);
        const up = fx.map(([px,py])=>[px, py-20]);
        const dn = fx.map(([px,py])=>[px, py+24]);
        const path = `M ${up.map(p=>p.join(',')).join(' L ')} L ${dn.reverse().map(p=>p.join(',')).join(' L ')} Z`;
        return <path d={path} fill="url(#fHatch)" opacity="0.7"/>;
      })()}
      {/* actual area */}
      {(() => {
        const pts = actual.map((v,i)=>[x(i), y(v)]);
        const area = `M ${pts[0].join(',')} ` + pts.slice(1).map(p=>`L ${p.join(',')}`).join(' ') + ` L ${x(5)},${h-pad} L ${x(0)},${h-pad} Z`;
        const line = `M ${pts[0].join(',')} ` + pts.slice(1).map(p=>`L ${p.join(',')}`).join(' ');
        return <g>
          <path d={area} fill="url(#gActual)"/>
          <path d={line} fill="none" stroke={T.accent} strokeWidth="2.5"/>
        </g>;
      })()}
      {/* forecast line */}
      {(() => {
        const pts = forecast.map((v,i)=>v==null?null:[x(i), y(v)]).filter(Boolean);
        const line = `M ${pts[0].join(',')} ` + pts.slice(1).map(p=>`L ${p.join(',')}`).join(' ');
        return <path d={line} fill="none" stroke={T.cat.coffee.fg} strokeWidth="2.5" strokeDasharray="5 4" opacity="0.7"/>;
      })()}
      {/* data points for actual */}
      {actual.map((v,i)=>(
        <circle key={i} cx={x(i)} cy={y(v)} r="4" fill="#fff" stroke={T.accent} strokeWidth="2"/>
      ))}
      {/* labels */}
      {labels.map((d,i)=>(
        <text key={i} x={x(i)} y={h+14} fontSize="10" fill={i<6?T.ink3:T.ink4}
          textAnchor="middle" fontWeight={i===5?'700':'600'}>{d}</text>
      ))}
    </svg>
  );
}

function Insight({ text }) {
  return (
    <div style={{ display:'flex', gap: 10, alignItems:'flex-start' }}>
      <div style={{ width: 18, height: 18, borderRadius: 5, background: T.accentSoft, flexShrink: 0,
        display:'flex', alignItems:'center', justifyContent:'center' }}>
        {Icon.sparkle(T.accent, 10)}
      </div>
      <div style={{ fontSize: 13, color: T.ink2, lineHeight: 1.5 }}>{text}</div>
    </div>
  );
}

function Heatmap() {
  const days = ['M','T','W','T','F','S','S'];
  const hours = [8,10,12,14,16,18,20];
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns: `16px repeat(${hours.length}, 1fr)`, gap: 3 }}>
        <div/>
        {hours.map(h=>(
          <div key={h} style={{ fontSize: 9, color: T.ink4, textAlign:'center', fontWeight: 600 }}>{h}</div>
        ))}
        {days.map((d,di)=>(
          <React.Fragment key={di}>
            <div style={{ fontSize: 9, color: T.ink4, fontWeight: 600, display:'flex', alignItems:'center' }}>{d}</div>
            {hours.map((_,hi)=>{
              // pseudo-random heat
              const v = ((di*3 + hi*2 + (di===4?5:0)) % 7) / 7;
              return <div key={hi} style={{
                aspectRatio:'1', borderRadius: 3,
                background: v<0.15 ? T.surface2 : `rgba(63,90,62,${0.2+v*0.75})`,
              }}/>;
            })}
          </React.Fragment>
        ))}
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', marginTop: 10, fontSize: 10, color: T.ink4, fontWeight: 600 }}>
        <span>Less</span>
        <div style={{ display:'flex', gap: 2 }}>
          {[0.15,0.35,0.55,0.75,0.95].map((v,i)=>(
            <div key={i} style={{ width: 14, height: 10, borderRadius: 2, background:`rgba(63,90,62,${v})` }}/>
          ))}
        </div>
        <span>More</span>
      </div>
    </div>
  );
}

// ─── Desktop 3: Budgets ──────────────────────────────────────────
function D_Budgets() {
  const budgets = [
    { cat:'food', label:'Food & drink', spent: 412, cap: 500 },
    { cat:'transit', label:'Transit', spent: 186, cap: 250 },
    { cat:'shopping', label:'Shopping', spent: 298, cap: 300 },
    { cat:'bills', label:'Bills & subscriptions', spent: 230, cap: 350 },
    { cat:'coffee', label:'Coffee & tea', spent: 89, cap: 80 },
    { cat:'health', label:'Health', spent: 42, cap: 150 },
  ];
  return (
    <MurmurWindow title="Budgets" active="budgets" toolbarRight={
      <div style={{
        padding:'6px 12px', fontSize: 12, fontWeight: 600,
        background: T.ink, color:'#fff', borderRadius: 8,
        display:'flex', gap: 6, alignItems:'center',
      }}>{Icon.plus('#fff', 12)} New budget</div>
    }>
      <div style={{ padding:'0 0 14px', display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
        <div>
          <div style={{ fontFamily: T.fSerif, fontSize: 28, fontWeight: 500, color: T.ink, letterSpacing: -0.6 }}>
            April budgets
          </div>
          <div style={{ fontSize: 13, color: T.ink3, marginTop: 2 }}>
            You've used <b style={{ color: T.ink }}>$1,257</b> of <b style={{ color: T.ink }}>$1,630</b> this month.
          </div>
        </div>
        <div style={{ display:'flex', gap: 14, alignItems:'center' }}>
          <Stat label="On track" value="4" color={T.accent}/>
          <Stat label="Near limit" value="1" color="#B07B2A"/>
          <Stat label="Over" value="1" color="#A94646"/>
        </div>
      </div>

      {/* total ring + list */}
      <div style={{ display:'grid', gridTemplateColumns:'340px 1fr', gap: 14 }}>
        <div style={{ background:'#fff', borderRadius: 16, padding:'20px 20px',
          border:`0.5px solid ${T.line}`, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.ink3, letterSpacing: 0.6, textTransform:'uppercase' }}>Overall</div>
          <svg width="220" height="220" viewBox="0 0 220 220" style={{ margin:'10px 0' }}>
            <circle cx="110" cy="110" r="88" fill="none" stroke={T.surface2} strokeWidth="18"/>
            <circle cx="110" cy="110" r="88" fill="none" stroke={T.accent} strokeWidth="18"
              strokeDasharray={`${2*Math.PI*88*0.77} ${2*Math.PI*88*0.23}`}
              transform="rotate(-90 110 110)" strokeLinecap="round"/>
            <text x="110" y="104" textAnchor="middle" fontSize="12" fill={T.ink3} fontWeight="600">77% used</text>
            <text x="110" y="128" textAnchor="middle" fontSize="26" fontWeight="700" fontFamily={T.fDisp} fill={T.ink}>$1,257</text>
            <text x="110" y="148" textAnchor="middle" fontSize="11" fill={T.ink4} fontWeight="600">of $1,630</text>
          </svg>
          <div style={{ fontSize: 12, color: T.ink3, textAlign:'center', lineHeight: 1.5, padding:'0 10px' }}>
            At current pace you'll finish the month <b style={{ color: T.accent }}>$140 under</b> your total budget.
          </div>
        </div>
        <div style={{ background:'#fff', borderRadius: 16,
          border:`0.5px solid ${T.line}`, overflow:'hidden' }}>
          {budgets.map((b,i)=>(
            <BudgetRow key={i} b={b} last={i===budgets.length-1}/>
          ))}
        </div>
      </div>
    </MurmurWindow>
  );
}
function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign:'right' }}>
      <div style={{ fontFamily: T.fDisp, fontSize: 24, fontWeight: 700, color, letterSpacing: -0.6 }}>{value}</div>
      <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: 0.6, textTransform:'uppercase' }}>{label}</div>
    </div>
  );
}
function BudgetRow({ b, last }) {
  const pct = b.spent / b.cap;
  const over = pct > 1;
  const near = pct > 0.9 && !over;
  const barColor = over ? '#A94646' : near ? '#B07B2A' : T.cat[b.cat].fg;
  const statusLabel = over ? 'Over by $' + (b.spent - b.cap).toFixed(0) :
                      near ? 'Near limit' : `$${(b.cap - b.spent).toFixed(0)} left`;
  const statusColor = over ? '#A94646' : near ? '#B07B2A' : T.ink3;
  return (
    <div style={{ padding:'16px 20px', borderBottom: last ? 'none' : `0.5px solid ${T.line}` }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 8 }}>
        <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
          <Chip cat={b.cat} label={b.label}/>
        </div>
        <div style={{ display:'flex', alignItems:'baseline', gap: 8 }}>
          <Money value={b.spent} size={16} serif={false} bold={700}/>
          <span style={{ color: T.ink4, fontSize: 12, fontWeight: 600 }}>of ${b.cap}</span>
          <span style={{ color: statusColor, fontSize: 11, fontWeight: 700, marginLeft: 10,
            background: over ? '#F4DDDD' : near ? '#F2E8D5' : 'transparent',
            padding: over||near ? '2px 7px' : 0, borderRadius: 6 }}>{statusLabel}</span>
        </div>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: T.surface2, overflow:'hidden' }}>
        <div style={{ width: `${Math.min(pct,1)*100}%`, height:'100%', background: barColor, borderRadius: 4 }}/>
      </div>
    </div>
  );
}

Object.assign(window, { D_Analytics, D_Budgets });
