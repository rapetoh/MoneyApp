// More mobile screens: detail, manual keypad, error, apple pay notif,
// search, category picker, settings, privacy, empty, paywall, permissions, history

// ─── Screen 8: Transaction detail ─────────────────────────────────
function S_Detail() {
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      <div style={{ padding:'8px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: 18, background:'#fff',
          border:`0.5px solid ${T.line}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          {Icon.chev(T.ink2)}</div>
        <div style={{ width: 36, height: 36, borderRadius: 18, background:'#fff',
          border:`0.5px solid ${T.line}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24"><circle cx="5" cy="12" r="2" fill={T.ink2}/><circle cx="12" cy="12" r="2" fill={T.ink2}/><circle cx="19" cy="12" r="2" fill={T.ink2}/></svg>
        </div>
      </div>
      {/* Hero */}
      <div style={{ padding:'24px 28px 16px', textAlign:'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: T.cat.coffee.bg, color: T.cat.coffee.fg,
          margin:'0 auto 16px', display:'flex', alignItems:'center', justifyContent:'center',
          fontWeight: 700, fontSize: 26 }}>B</div>
        <div style={{ fontSize: 14, color: T.ink3, fontWeight: 500 }}>Blue Bottle Coffee</div>
        <div style={{ marginTop: 6 }}><Money value={-12.40} size={56}/></div>
        <div style={{ marginTop: 8, display:'inline-flex' }}>
          <Chip cat="coffee" label="Coffee & tea"/>
        </div>
      </div>
      {/* Fields */}
      <div style={{ padding:'0 20px' }}>
        <div style={{ background:'#fff', borderRadius: 22, overflow:'hidden' }}>
          <DetailRow label="Date" value="Friday, Apr 18 · 9:41 AM"/>
          <DetailRow label="Payment" value="Apple Pay · Visa ••4821"/>
          <DetailRow label="Note" value="Morning coffee before standup"/>
          <DetailRow label="Logged via" value="Voice · 0.4s" last/>
        </div>
      </div>
      {/* Actions */}
      <div style={{ padding:'16px 20px 0', display:'flex', gap: 10 }}>
        <ActionBtn icon={Icon.sparkle} label="Split"/>
        <ActionBtn icon={Icon.mic} label="Re-record"/>
        <ActionBtn icon={Icon.close} label="Delete" danger/>
      </div>
      <div style={{ flex: 1 }}/>
      {/* Transcription playback */}
      <div style={{ padding:'0 20px 40px' }}>
        <div style={{ padding:'14px 16px', background: T.accentSoft, borderRadius: 18,
          display:'flex', alignItems:'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 19, background: T.accent,
            display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="14" height="16" viewBox="0 0 14 16"><path d="M1 1l12 7-12 7V1z" fill="#fff"/></svg>
          </div>
          <div style={{ flex: 1, fontSize: 13, color: T.ink2, lineHeight: 1.45 }}>
            <div style={{ fontStyle:'italic' }}>"Twelve forty at Blue Bottle, coffee"</div>
            <div style={{ color: T.ink3, fontSize: 11, marginTop: 2 }}>Voice note · 1.8s</div>
          </div>
        </div>
      </div>
    </BareDevice>
  );
}
function DetailRow({ label, value, last }) {
  return (
    <div style={{ padding:'14px 18px', borderBottom: last ? 'none' : `0.5px solid ${T.line}` }}>
      <div style={{ fontSize: 12, color: T.ink3, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 15, color: T.ink, fontWeight: 500, marginTop: 2 }}>{value}</div>
    </div>
  );
}
function ActionBtn({ icon, label, danger }) {
  const c = danger ? '#A94646' : T.ink;
  return (
    <div style={{ flex: 1, background:'#fff', borderRadius: 16, padding:'14px 0',
      border:`0.5px solid ${T.line}`, textAlign:'center',
      display:'flex', flexDirection:'column', alignItems:'center', gap: 4 }}>
      {icon(c, 20)}
      <div style={{ fontSize: 12, fontWeight: 600, color: c }}>{label}</div>
    </div>
  );
}

// ─── Screen 9: Manual entry keypad ───────────────────────────────
function S_Keypad() {
  const keys = [['1','2','3'],['4','5','6'],['7','8','9'],['.','0','⌫']];
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      <div style={{ padding:'8px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ color: T.ink3, fontSize: 15, fontWeight: 600 }}>Cancel</div>
        <div style={{ color: T.ink, fontSize: 16, fontWeight: 700 }}>Quick entry</div>
        <div style={{
          width: 36, height: 36, borderRadius: 18, background: T.accentSoft,
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          {Icon.mic(T.accent, 18)}
        </div>
      </div>
      {/* Amount display */}
      <div style={{ padding:'36px 20px 20px', textAlign:'center' }}>
        <Money value={8.50} size={80}/>
        <div style={{ marginTop: 12, display:'flex', justifyContent:'center', gap: 8 }}>
          <Chip cat="coffee" label="Coffee & tea"/>
          <span style={{ padding:'5px 10px', borderRadius: 999, background:'#fff',
            border:`0.5px solid ${T.line}`, fontSize: 12, color: T.ink3, fontWeight: 600 }}>
            Today
          </span>
        </div>
      </div>
      <div style={{ flex: 1 }}/>
      {/* merchant quick field */}
      <div style={{ padding:'0 20px 16px' }}>
        <div style={{ background:'#fff', borderRadius: 16, padding:'14px 16px',
          border:`0.5px solid ${T.line}`, fontSize: 14, color: T.ink4 }}>
          Merchant (optional)
        </div>
      </div>
      {/* Keypad */}
      <div style={{ padding:'0 16px 8px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap: 8 }}>
        {keys.flat().map((k,i)=>(
          <div key={i} style={{
            height: 56, background:'#fff', borderRadius: 14,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontFamily: T.fDisp, fontSize: 28, fontWeight: 500, color: T.ink,
            border:`0.5px solid ${T.line}`,
          }}>{k}</div>
        ))}
      </div>
      <div style={{ padding:'8px 16px 36px' }}>
        <div style={{ height: 56, borderRadius: 28, background: T.ink,
          display:'flex', alignItems:'center', justifyContent:'center',
          color:'#fff', fontSize: 16, fontWeight: 600 }}>Add expense</div>
      </div>
    </BareDevice>
  );
}

// ─── Screen 10: Voice error / low confidence ─────────────────────
function S_Error() {
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      <div style={{ padding:'8px 20px', display:'flex', justifyContent:'flex-end' }}>
        <div style={{ width: 36, height: 36, borderRadius: 18, background:'#EEEAE0',
          display:'flex', alignItems:'center', justifyContent:'center' }}>{Icon.close(T.ink2, 16)}</div>
      </div>
      <div style={{ padding:'24px 24px 0' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap: 6, padding:'6px 10px',
          background:'#F2E8D5', color:'#7A5A1C', borderRadius: 999,
          fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform:'uppercase' }}>
          Not sure
        </div>
        <div style={{ fontFamily: T.fSerif, fontSize: 30, fontWeight: 500, color: T.ink,
          letterSpacing: -0.5, lineHeight: 1.25, marginTop: 14 }}>
          I heard an amount but missed the merchant.
        </div>
        <div style={{ fontSize: 14, color: T.ink3, marginTop: 10, lineHeight: 1.5 }}>
          Noise level was high. You can fix it below, or re-record closer to your mouth.
        </div>
      </div>
      {/* transcript */}
      <div style={{ padding:'20px 24px 0' }}>
        <div style={{ padding:'14px 16px', background:'#fff', borderRadius: 16,
          border:`0.5px solid ${T.line}`, fontSize: 15, color: T.ink2, lineHeight: 1.5, fontStyle:'italic' }}>
          "Uh, eight fifty at … <span style={{ background:'#F4DDDD', color:'#843C3C',
            padding:'1px 6px', borderRadius: 4, fontStyle:'normal', fontWeight: 600 }}>[unclear]</span>"
        </div>
      </div>
      {/* fix fields */}
      <div style={{ padding:'20px 20px 0' }}>
        <div style={{ background:'#fff', borderRadius: 22, overflow:'hidden' }}>
          <Field label="Amount" value="$8.50"/>
          <Field label="Merchant" value={<span style={{ color: T.ink4 }}>Tap to add</span>}/>
          <Field label="Category" value={<Chip cat="other" label="Uncategorized"/>} raw last/>
        </div>
      </div>
      <div style={{ flex: 1 }}/>
      <div style={{ padding:'0 20px 40px', display:'flex', gap: 10 }}>
        <div style={{ flex: 1, height: 52, borderRadius: 26, background:'#fff',
          border:`0.5px solid ${T.lineHard}`,
          display:'flex', alignItems:'center', justifyContent:'center', gap: 8,
          color: T.ink, fontSize: 15, fontWeight: 600 }}>
          {Icon.mic(T.ink, 18)} Re-record
        </div>
        <div style={{ flex: 1, height: 52, borderRadius: 26, background: T.ink,
          display:'flex', alignItems:'center', justifyContent:'center',
          color:'#fff', fontSize: 15, fontWeight: 600 }}>Save anyway</div>
      </div>
    </BareDevice>
  );
}

// ─── Screen 11: Apple Pay auto-capture notification ──────────────
function S_ApplePayNotif() {
  return (
    <BareDevice dark>
      <div style={{ position:'absolute', inset:0,
        background:'radial-gradient(120% 80% at 30% 20%, #2a2a2e 0%, #0B0B0C 60%)' }}/>
      <div style={{ position:'relative', textAlign:'center', marginTop: 80, color:'#fff' }}>
        <div style={{ fontSize: 22, fontWeight: 500, opacity: 0.85 }}>Friday, April 18</div>
        <div style={{ fontFamily: T.fDisp, fontSize: 96, fontWeight: 300, letterSpacing: -3, lineHeight: 1 }}>9:42</div>
      </div>
      {/* Notification */}
      <div style={{ position:'relative', padding:'40px 14px 0' }}>
        <div style={{
          borderRadius: 22, padding: 16,
          background:'rgba(40,40,44,0.6)',
          backdropFilter:'blur(24px) saturate(180%)',
          WebkitBackdropFilter:'blur(24px) saturate(180%)',
          border:'0.5px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap: 10, marginBottom: 8 }}>
            <span style={{ width: 22, height: 22, borderRadius: 6, background:T.accent,
              display:'inline-flex', alignItems:'center', justifyContent:'center',
              color:'#fff', fontSize: 12, fontWeight: 800 }}>M</span>
            <span style={{ color:'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 600 }}>MURMUR</span>
            <span style={{ flex: 1 }}/>
            <span style={{ color:'rgba(255,255,255,0.5)', fontSize: 12 }}>now</span>
          </div>
          <div style={{ color:'#fff', fontSize: 15, fontWeight: 600, letterSpacing: -0.2, marginBottom: 4 }}>
            Apple Pay · Trader Joe's
          </div>
          <div style={{ color:'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 1.4 }}>
            $62.30 charged just now. Tap to categorize or say a note.
          </div>
          {/* inline actions */}
          <div style={{ display:'flex', gap: 8, marginTop: 12 }}>
            <NotifBtn icon={Icon.mic} label="Add note"/>
            <NotifBtn label="Groceries"/>
            <NotifBtn label="Dismiss" muted/>
          </div>
        </div>
      </div>
      <div style={{ flex: 1 }}/>
      <div style={{ color:'rgba(255,255,255,0.4)', fontSize: 12, textAlign:'center', padding:'0 0 60px',
        fontWeight: 500, letterSpacing: 0.4 }}>
        Triggered by the Apple Pay Shortcut
      </div>
    </BareDevice>
  );
}
function NotifBtn({ icon, label, muted }) {
  return (
    <div style={{
      flex: 1, height: 32, borderRadius: 16,
      background: muted ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.16)',
      display:'flex', alignItems:'center', justifyContent:'center', gap: 5,
      color:'#fff', fontSize: 12, fontWeight: 600,
    }}>
      {icon && icon('#fff', 12)}
      {label}
    </div>
  );
}

// ─── Screen 12: Search / filter ──────────────────────────────────
function S_Search() {
  const results = [
    { amt: 12.40, m:'Blue Bottle Coffee', cat:'coffee', label:'Coffee', t:'Today · 9:41', voice: true },
    { amt: 6.80,  m:'Blue Bottle',        cat:'coffee', label:'Coffee', t:'Apr 14',       voice: true },
    { amt: 14.20, m:'Bluestone Lane',     cat:'coffee', label:'Coffee', t:'Apr 9',        voice: true },
    { amt: 9.50,  m:'Blue Bottle',        cat:'coffee', label:'Coffee', t:'Apr 2',        voice: false },
  ];
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      <div style={{ padding:'8px 16px', display:'flex', gap: 10, alignItems:'center' }}>
        <div style={{ flex: 1, height: 40, borderRadius: 20, background:'#fff',
          border:`0.5px solid ${T.line}`, padding:'0 14px',
          display:'flex', alignItems:'center', gap: 10 }}>
          {Icon.search(T.ink3, 16)}
          <span style={{ fontSize: 15, color: T.ink, fontWeight: 500 }}>blue</span>
          <span style={{ display:'inline-block', width: 2, height: 16, background: T.accent, animation:'blink 1s infinite' }}/>
        </div>
        <div style={{ color: T.accent, fontSize: 15, fontWeight: 600 }}>Cancel</div>
      </div>
      {/* filter chips */}
      <div style={{ padding:'12px 16px 16px', display:'flex', gap: 6, flexWrap:'wrap' }}>
        {[['All', true], ['This month'], ['Coffee'], ['Voice-logged'], ['> $20']].map(([l, a],i)=>(
          <span key={i} style={{
            padding:'6px 12px', borderRadius: 999,
            background: a ? T.ink : '#fff', color: a ? '#fff' : T.ink2,
            border: a ? 'none' : `0.5px solid ${T.line}`,
            fontSize: 12.5, fontWeight: 600,
          }}>{l}</span>
        ))}
      </div>
      <div style={{ padding:'0 24px 6px', color: T.ink3, fontSize: 12, fontWeight: 600,
        letterSpacing: 0.5, textTransform:'uppercase' }}>
        4 matches · $42.90 total
      </div>
      <div style={{ flex: 1, overflow:'auto', padding:'0 16px 140px' }}>
        <div style={{ background: T.surface, borderRadius: 22, overflow:'hidden' }}>
          {results.map((x,i)=>(
            <TxRow key={i} tx={x} last={i===results.length-1}/>
          ))}
        </div>
      </div>
    </BareDevice>
  );
}

// ─── Screen 13: Category picker (bottom sheet) ───────────────────
function S_CategoryPicker() {
  const cats = [
    ['food','Food & drink'],['coffee','Coffee & tea'],['transit','Transit'],
    ['shopping','Shopping'],['bills','Bills'],['health','Health'],
    ['work','Work'],['other','Other'],
  ];
  return (
    <BareDevice>
      {/* dimmed content behind */}
      <div style={{ paddingTop: 56, opacity: 0.3 }}>
        <div style={{ padding:'14px 22px 8px' }}>
          <div style={{ fontFamily: T.fDisp, fontSize: 34, fontWeight: 700 }}>New expense</div>
        </div>
      </div>
      <div style={{ position:'absolute', inset: 0, background:'rgba(0,0,0,0.25)', zIndex: 30 }}/>
      {/* sheet */}
      <div style={{
        position:'absolute', bottom: 0, left: 0, right: 0, zIndex: 40,
        background:'#FBFAF7', borderTopLeftRadius: 26, borderTopRightRadius: 26,
        paddingBottom: 44, boxShadow:'0 -8px 40px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display:'flex', justifyContent:'center', paddingTop: 8 }}>
          <div style={{ width: 36, height: 5, borderRadius: 3, background: T.lineHard }}/>
        </div>
        <div style={{ padding:'12px 20px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.ink }}>Category</div>
          <div style={{ color: T.accent, fontSize: 15, fontWeight: 600 }}>Done</div>
        </div>
        <div style={{ padding:'0 16px', display:'grid', gridTemplateColumns:'1fr 1fr', gap: 8 }}>
          {cats.map(([k,l],i)=>{
            const c = T.cat[k], selected = k==='coffee';
            return (
              <div key={i} style={{
                padding:'14px 14px', borderRadius: 16,
                background: selected ? c.bg : '#fff',
                border: selected ? `1.5px solid ${c.fg}` : `0.5px solid ${T.line}`,
                display:'flex', alignItems:'center', gap: 10,
              }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: c.fg, opacity: 0.85 }}/>
                <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: T.ink }}>{l}</div>
                {selected && <div style={{ width: 20, height: 20, borderRadius: 10, background: c.fg,
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {Icon.check('#fff', 12)}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </BareDevice>
  );
}

Object.assign(window, { S_Detail, S_Keypad, S_Error, S_ApplePayNotif, S_Search, S_CategoryPicker });
