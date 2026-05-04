// MindMap template \u2014 XMind-style radial diagram of the user's whole financial life.
// Center: user / month. Branches: Income, Expenses, Savings & Goals, Recurring.
// Sub-branches: categories. Leaves: top merchants.

function MindMapTemplate() {
  // Use a normalized 1280x600 coordinate system. SVG handles itself via viewBox.
  // HTML overlays are positioned in PERCENTAGES so they track the SVG regardless
  // of actual rendered width.
  const W = 1280, H = 600;
  const cx = W/2, cy = H/2;
  const pct = (v, total) => `${(v/total)*100}%`;

  // 4 main branches, each with sub-branches
  const branches = [
    {
      label: 'Income', side:'left', y: -1, color: T.accent,
      total: 4200,
      subs: [
        { label:'Salary', amt: 3500, leaves:['Acme Corp \u00b7 monthly'] },
        { label:'Freelance', amt: 600, leaves:['Acme \u00b7 contract','Side gig'] },
        { label:'Refunds', amt: 100, leaves:['Amazon return'] },
      ],
    },
    {
      label: 'Expenses', side:'right', y: -1, color: T.cat.bills.fg,
      total: 1330,
      subs: [
        { label:'Bills \u00b7 $760', amt: 760, color: T.cat.bills.fg, leaves:['Rent \u00b7 $600','Utilities \u00b7 $80','Internet \u00b7 $60','Phone \u00b7 $20'] },
        { label:'Food \u00b7 $412', amt: 412, color: T.cat.food.fg,   leaves:["Trader Joe's \u00b7 $240",'Restaurants \u00b7 $140','Coffee \u00b7 $32'] },
        { label:'Shopping \u00b7 $298', amt: 298, color: T.cat.shopping.fg, leaves:['Amazon \u00b7 $178','Clothing \u00b7 $120'] },
        { label:'Transit \u00b7 $186', amt: 186, color: T.cat.transit.fg,   leaves:['Uber \u00b7 $124','Gas \u00b7 $62'] },
      ],
    },
    {
      label: 'Saved & invested', side:'right', y: 1, color: T.accent,
      total: 2544,
      subs: [
        { label:'Emergency \u00b7 $1,500', amt: 1500, leaves:['Ally HYSA','Auto-transfer \u00b7 1st of month'] },
        { label:'Investing \u00b7 $1,044', amt: 1044, leaves:['Index fund (VTI)','Roth IRA'] },
      ],
    },
    {
      label: 'Goals & planning', side:'left', y: 1, color:'#7A4A22',
      total: null,
      subs: [
        { label:'PS5 \u00b7 $499', amt: 499, leaves:['Target: July 12','On track \u2192'] },
        { label:'Trip \u00b7 $1,800', amt: 1800, leaves:['Target: October','62% saved'] },
        { label:'Recurring \u00b7 12 subs', amt: 250, leaves:['Review: Gym, Notion, Disney+'] },
      ],
    },
  ];

  // Compute branch endpoint based on quadrant
  const branchEnd = (b) => {
    const x = b.side === 'left' ? 360 : W - 360;
    const y = b.y === -1 ? cy - 180 : cy + 180;
    return [x, y];
  };

  // Curved connector from center to branch endpoint
  const branchPath = (b) => {
    const [x, y] = branchEnd(b);
    const dirX = b.side === 'left' ? -1 : 1;
    // Start a bit outside the central oval
    const sx = cx + dirX * 95;
    const sy = cy + b.y * 14;
    const c1x = sx + dirX * 80;
    const c1y = sy;
    const c2x = x - dirX * 60;
    const c2y = y;
    return `M ${sx},${sy} C ${c1x},${c1y} ${c2x},${c2y} ${x},${y}`;
  };

  return (
    <div style={{ background:'#fff', borderRadius: 16, border:`0.5px solid ${T.line}`, padding: 0, height:'100%', position:'relative', overflow:'hidden' }}>
      {/* Subtle grid bg */}
      <div style={{
        position:'absolute', inset: 0,
        backgroundImage:`radial-gradient(${T.line} 1px, transparent 1px)`,
        backgroundSize:'24px 24px',
        opacity: 0.5,
      }}/>

      {/* Header */}
      <div style={{
        position:'absolute', top: 16, left: 20, right: 20,
        display:'flex', justifyContent:'space-between', alignItems:'flex-start', zIndex: 2,
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.ink3, letterSpacing: 0.6, textTransform:'uppercase' }}>Mind map \u00b7 April</div>
          <div style={{ fontSize: 13, color: T.ink3, marginTop: 4 }}>Your whole financial month, branching out from one place.</div>
        </div>
        <div style={{ display:'flex', gap: 10 }}>
          <div style={{ padding:'5px 10px', fontSize: 11, fontWeight: 600, background: T.surface, borderRadius: 6, border:`0.5px solid ${T.line}`, color: T.ink2, display:'flex', alignItems:'center', gap: 4 }}>
            {Icon.plus(T.ink3, 10)} Add node
          </div>
          <div style={{ padding:'5px 10px', fontSize: 11, fontWeight: 600, background: T.surface, borderRadius: 6, border:`0.5px solid ${T.line}`, color: T.ink2 }}>Auto-arrange</div>
          <div style={{ padding:'5px 10px', fontSize: 11, fontWeight: 600, background: T.surface, borderRadius: 6, border:`0.5px solid ${T.line}`, color: T.ink2, fontVariantNumeric:'tabular-nums' }}>100%</div>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'100%', position:'relative', zIndex: 1 }}>
        {/* Branch connectors (drawn first, behind nodes) */}
        {branches.map((b,i)=>(
          <path key={i} d={branchPath(b)}
            stroke={b.color} strokeWidth={5} fill="none" strokeLinecap="round" opacity="0.85"/>
        ))}

        {/* Sub-branch lines from each main branch */}
        {branches.map((b, bi) => {
          const [bx, by] = branchEnd(b);
          const dirX = b.side === 'left' ? -1 : 1;
          const subSpread = b.subs.length * 56;
          return b.subs.map((s, si) => {
            const sy = by - subSpread/2 + si*56 + 28;
            const sx = bx + dirX * 200;
            const c1x = bx + dirX * 60;
            const c1y = by;
            const c2x = sx - dirX * 50;
            const c2y = sy;
            return (
              <path key={`${bi}-${si}`}
                d={`M ${bx},${by} C ${c1x},${c1y} ${c2x},${c2y} ${sx},${sy}`}
                stroke={b.color} strokeWidth={2.2} fill="none" opacity="0.55" strokeLinecap="round"/>
            );
          });
        })}
      </svg>

      {/* Center node \u2014 overlaid as HTML for crisper text */}
      <div style={{
        position:'absolute', left: '50%', top: '50%', transform:'translate(-50%, -50%)', zIndex: 3,
        width: 180, height: 90, borderRadius: 18,
        background: T.ink, color:'#fff',
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        boxShadow:'0 12px 32px rgba(0,0,0,0.18), 0 0 0 6px rgba(255,255,255,0.9)',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color:'rgba(255,255,255,0.55)', letterSpacing: 0.6, textTransform:'uppercase' }}>April 2026</div>
        <div style={{ fontFamily: T.fSerif, fontSize: 26, fontWeight: 500, letterSpacing: -0.5 }}>Jordan</div>
        <div style={{ fontSize: 11, color:'rgba(255,255,255,0.6)', marginTop: 2 }}>net <span style={{ color:'#C9D6BE', fontWeight: 700 }}>+$2,870</span></div>
      </div>

      {/* Branch nodes (main) */}
      {branches.map((b, bi) => {
        const [x, y] = branchEnd(b);
        const dirX = b.side === 'left' ? -1 : 1;
        return (
          <React.Fragment key={bi}>
            <div style={{
              position:'absolute', left: pct(x, W), top: pct(y, H), transform:'translate(-50%, -50%)', zIndex: 3,
              padding:'10px 16px', borderRadius: 14,
              background: b.color, color:'#fff',
              boxShadow:`0 6px 18px ${b.color}55, 0 0 0 4px rgba(255,255,255,0.92)`,
              minWidth: 150, textAlign:'center',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color:'rgba(255,255,255,0.7)', letterSpacing: 0.6, textTransform:'uppercase' }}>{b.label}</div>
              {b.total != null && (
                <div style={{ fontFamily: T.fDisp, fontSize: 22, fontWeight: 700, marginTop: 2, letterSpacing: -0.4 }}>
                  ${b.total.toLocaleString()}
                </div>
              )}
            </div>

            {/* Sub-nodes */}
            {b.subs.map((s, si) => {
              const subSpread = b.subs.length * 56;
              const sy = y - subSpread/2 + si*56 + 28;
              const sx = x + dirX * 200;
              const align = b.side === 'left' ? 'flex-end' : 'flex-start';
              return (
                <div key={`${bi}-${si}`} style={{
                  position:'absolute', left: pct(sx, W), top: pct(sy, H),
                  transform: `translate(${b.side==='left'?'-100%':'0'}, -50%)`,
                  zIndex: 3, maxWidth: 220,
                  display:'flex', flexDirection:'column', alignItems: align,
                }}>
                  <div style={{
                    padding:'7px 12px', borderRadius: 10,
                    background:'#fff', color: T.ink,
                    border:`1.5px solid ${b.color}`,
                    boxShadow:'0 3px 10px rgba(0,0,0,0.06)',
                    fontSize: 13, fontWeight: 600,
                    whiteSpace:'nowrap',
                  }}>{s.label}</div>
                  {/* Leaves */}
                  <div style={{
                    marginTop: 4, paddingLeft: b.side==='left'?0:10, paddingRight: b.side==='left'?10:0,
                    borderLeft: b.side==='right' ? `1.5px dotted ${b.color}55` : 'none',
                    borderRight: b.side==='left' ? `1.5px dotted ${b.color}55` : 'none',
                    display:'flex', flexDirection:'column', gap: 2,
                    alignItems: align,
                  }}>
                    {s.leaves.map((leaf, li)=>(
                      <div key={li} style={{
                        fontSize: 11, color: T.ink3, fontWeight: 500,
                        padding:'2px 6px', borderRadius: 4,
                        background: 'rgba(255,255,255,0.7)',
                        whiteSpace:'nowrap',
                      }}>{leaf}</div>
                    ))}
                  </div>
                </div>
              );
            })}
          </React.Fragment>
        );
      })}

      {/* Footer hint */}
      <div style={{
        position:'absolute', bottom: 14, left: 20, right: 20,
        display:'flex', justifyContent:'space-between', alignItems:'center',
        fontSize: 11, color: T.ink4, fontWeight: 600, zIndex: 2,
      }}>
        <span>Tip: tap any branch to drill in \u00b7 drag to rearrange \u00b7 \u2318E to add a node</span>
        <span style={{ display:'flex', gap: 14 }}>
          <span style={{ display:'flex', alignItems:'center', gap: 5 }}><span style={{ width:10, height:10, borderRadius:5, background: T.accent }}/>Money in / saved</span>
          <span style={{ display:'flex', alignItems:'center', gap: 5 }}><span style={{ width:10, height:10, borderRadius:5, background: T.cat.bills.fg }}/>Money out</span>
          <span style={{ display:'flex', alignItems:'center', gap: 5 }}><span style={{ width:10, height:10, borderRadius:5, background:'#7A4A22' }}/>Goals & plans</span>
        </span>
      </div>
    </div>
  );
}

Object.assign(window, { MindMapTemplate });
