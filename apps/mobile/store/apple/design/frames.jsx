// Murmur App Store set v3 (Nov 2026)
//
// One brand system for the whole listing, taken from the website: Fraunces
// headlines with one italic sage phrase ("Speak your *spending.*"), a quiet
// eyebrow, cream or forest grounds with a paper grain, and the device large
// enough to read. In-device UI uses the shipped app's own fonts (Plus Jakarta
// Sans, New York for amounts) and only shows what the iPhone build does.
//
// Canvas 642x1389, captured at 2x = 1284x2778 (App Store iPhone 6.5").

Object.assign(T, {
  fSans: '"Plus Jakarta Sans", -apple-system, system-ui, sans-serif',
  fDisp: '"Plus Jakarta Sans", -apple-system, system-ui, sans-serif',
  fSerif: '"New York", "Iowan Old Style", Georgia, serif',
  fMono: '"DM Mono", "SF Mono", Menlo, monospace',
});

const V2 = {
  W: 642, H: 1389,
  FR: '"Fraunces", "New York", Georgia, serif',
  RND: '"SF Rounded", -apple-system, system-ui, sans-serif',
  SF: '-apple-system, "SF Pro Text", system-ui, sans-serif',
  sage: '#3F5A3E', sageL: '#A9C29F', sageW: '#9CB898', cream: '#F7F5F0', ink: '#1B1915',
  icon: (window.__resources && window.__resources.appIcon) || 'appicon.png',
};

const V2_BG = {
  cream:  { base: 'linear-gradient(180deg,#FBF9F4 0%,#F3EEE5 58%,#EBE4D7 100%)' },
  sage:   { base: 'linear-gradient(180deg,#F6F7F2 0%,#EAEEE4 58%,#DEE6D6 100%)' },
  clay:   { base: 'linear-gradient(180deg,#FCF7F0 0%,#F4EADC 58%,#EBDBC5 100%)' },
  forest: { dark: true, base: 'radial-gradient(120% 64% at 50% -6%, #4C6E51 0%, #2E4834 40%, #1F3125 72%, #18271C 100%)' },
  night:  { dark: true, base: 'radial-gradient(120% 64% at 50% -6%, #45422F 0%, #26251D 44%, #181813 76%, #121210 100%)' },
};

const v2Noise = (rgb) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 ${rgb} 0 0 0 0 ${rgb} 0 0 0 0 ${rgb} 0 0 0 0.6 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`);
const V2_NOISE_D = v2Noise(0), V2_NOISE_L = v2Noise(1);

function V2Grain({ dark }) {
  return <div style={{ position:'absolute', inset: 0, zIndex: 1, pointerEvents:'none',
    backgroundImage: `url("${dark ? V2_NOISE_L : V2_NOISE_D}")`, backgroundSize: '220px 220px',
    opacity: dark ? 0.06 : 0.075, mixBlendMode: dark ? 'screen' : 'multiply' }}/>;
}

function V2Head({ eyebrow, title, accent, sub, dark, y = 86, size = 62, subW = 520, accentBreak = true }) {
  const fg = dark ? V2.cream : V2.ink;
  const ac = dark ? V2.sageL : V2.sage;
  return (
    <div style={{ position:'absolute', top: y, left: 0, right: 0, textAlign:'center', zIndex: 6, padding:'0 34px' }}>
      {eyebrow && (
        <div style={{ display:'inline-flex', alignItems:'center', gap: 9, fontSize: 13, fontWeight: 700,
          letterSpacing: 2.3, textTransform:'uppercase', color: ac, marginBottom: 20 }}>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: ac }}/>{eyebrow}
        </div>
      )}
      <div style={{ fontFamily: V2.FR, fontWeight: 500, fontSize: size, lineHeight: 1.0,
        letterSpacing: '-0.035em', wordSpacing: '0.06em', color: fg, textWrap:'balance' }}>
        {title}{accentBreak ? <br/> : ' '}<em style={{ fontStyle:'italic', color: ac, fontWeight: 500 }}>{accent}</em>
      </div>
      {sub && (
        <div style={{ margin:'22px auto 0', maxWidth: subW, fontSize: 19.5, lineHeight: 1.45, fontWeight: 500,
          color: dark ? 'rgba(247,245,240,0.68)' : '#6C675E', textWrap:'balance' }}>{sub}</div>
      )}
    </div>
  );
}

function V2Frame({ id, bg = 'cream', children, glow, w = V2.W, h = V2.H }) {
  const b = V2_BG[bg];
  return (
    <div style={{ display:'flex', flexDirection:'column', gap: 10 }}>
      <div id={id} style={{ width: w, height: h, position:'relative', overflow:'hidden',
        background: b.base, fontFamily: T.fSans, WebkitFontSmoothing:'antialiased', flexShrink: 0 }}>
        {glow}
        <V2Grain dark={b.dark}/>
        {children}
      </div>
      <div style={{ fontFamily: T.fMono, fontSize: 12, color:'#8A857A' }}>{id} · {w * 2}×{h * 2}</div>
    </div>
  );
}

// iPhone 17 Pro-ish body: titanium rim, black border, buttons. Child = 402x874 screen.
function V2Phone({ x, y, s = 1.2, z = 3, dark = false, r = 0, children }) {
  const btn = (side, top, h) => <div style={{ position:'absolute', [side]: -3.5, top, width: 5, height: h,
    borderRadius: 3, background: side === 'left' ? 'linear-gradient(90deg,#4a4a4f,#232326)' : 'linear-gradient(270deg,#4a4a4f,#232326)' }}/>;
  return (
    <div style={{ position:'absolute', left: x, top: y, width: 428, height: 900, zIndex: z,
      transform: `rotate(${r}deg) scale(${s})`, transformOrigin:'top left' }}>
      {btn('left', 176, 30)}{btn('left', 232, 58)}{btn('left', 302, 58)}{btn('right', 258, 92)}
      <div style={{ position:'absolute', inset: 0, borderRadius: 62,
        background:'linear-gradient(150deg,#77777D 0%,#38383D 10%,#1D1D21 46%,#2A2A2F 86%,#6E6E74 100%)',
        boxShadow: dark
          ? '0 70px 120px -20px rgba(0,0,0,0.65), 0 26px 50px -10px rgba(0,0,0,0.45)'
          : '0 90px 130px -40px rgba(60,48,30,0.45), 0 34px 64px -24px rgba(60,48,30,0.32)' }}/>
      <div style={{ position:'absolute', inset: 2.5, borderRadius: 59.5, background:'#060607' }}/>
      <div style={{ position:'absolute', inset: 13, borderRadius: 49, overflow:'hidden' }}>{children}</div>
    </div>
  );
}
const v2x = (s) => (V2.W - 428 * s) / 2;

function V2Card({ x, y, w, r = 0, z = 9, dark = false, pad = '18px 20px', radius = 26, style = {}, children }) {
  return (
    <div style={{ position:'absolute', left: x, top: y, width: w, zIndex: z, transform: `rotate(${r}deg)`,
      background: dark ? '#1E211C' : '#FFFFFF', borderRadius: radius, padding: pad,
      border: dark ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(40,36,28,0.05)',
      boxShadow: dark
        ? '0 40px 80px -16px rgba(0,0,0,0.65), 0 14px 30px -8px rgba(0,0,0,0.4)'
        : '0 44px 80px -22px rgba(60,48,30,0.38), 0 14px 30px -10px rgba(60,48,30,0.20)',
      color: dark ? V2.cream : V2.ink, ...style }}>{children}</div>
  );
}

function V2Pill({ x, y, r = 0, dark = false, z = 10, children, style = {} }) {
  return (
    <div style={{ position:'absolute', left: x, top: y, zIndex: z, transform: `rotate(${r}deg)`,
      display:'inline-flex', alignItems:'center', gap: 10, padding:'13px 19px', borderRadius: 999,
      background: dark ? '#1E211C' : '#FFFFFF', color: dark ? V2.cream : V2.ink,
      border: dark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(40,36,28,0.06)',
      boxShadow: dark ? '0 24px 50px -10px rgba(0,0,0,0.6)' : '0 26px 50px -14px rgba(60,48,30,0.34), 0 8px 18px -8px rgba(60,48,30,0.2)',
      fontSize: 17, fontWeight: 600, letterSpacing: -0.2, whiteSpace:'nowrap', ...style }}>{children}</div>
  );
}

const V2I = {
  check: (c = '#fff', s = 14) => <svg width={s} height={s} viewBox="0 0 14 14"><path d="M2.5 7.4l3 3L11.6 3.8" stroke={c} strokeWidth="2.1" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  mic: (c, s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="8.5" y="2.5" width="7" height="12.5" rx="3.5" fill={c}/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5v3.5" stroke={c} strokeWidth="2" strokeLinecap="round"/></svg>,
  keyboard: (c, s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="2.5" y="5.5" width="19" height="13" rx="2.6" stroke={c} strokeWidth="1.9"/><path d="M6.5 9.5h.01M10 9.5h.01M13.5 9.5h.01M17 9.5h.01M8 14.5h8" stroke={c} strokeWidth="2.1" strokeLinecap="round"/></svg>,
  chevL: (c, s = 18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  waveform: (c, s = 26) => <svg width={s} height={s} viewBox="0 0 28 28" fill="none">{[[3,11,17],[7.5,7,21],[12,3,25],[16.5,8,20],[21,5,23],[25.5,11,17]].map(([x,a,b],i)=><path key={i} d={`M${x} ${a}V${b}`} stroke={c} strokeWidth="2.6" strokeLinecap="round"/>)}</svg>,
  lock: (c, s = 14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="5" y="10.5" width="14" height="10.5" rx="2.4" fill={c}/><path d="M8 10.5V7.5a4 4 0 018 0v3" stroke={c} strokeWidth="2"/></svg>,
  arrowDown: (c, s = 22) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M12 4v15M5.5 12.5L12 19l6.5-6.5" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  roll: (c, s = 15) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M4 12a8 8 0 0113.7-5.6L20 8.5M20 4v4.5h-4.5" stroke={c} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"/><path d="M20 12a8 8 0 01-13.7 5.6L4 15.5M4 20v-4.5h4.5" stroke={c} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  shield: (c, s = 15) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M12 3l7.5 3v5.6c0 4.6-3.1 8.2-7.5 9.4-4.4-1.2-7.5-4.8-7.5-9.4V6L12 3z" stroke={c} strokeWidth="2" strokeLinejoin="round"/></svg>,
  trash: (c, s = 15) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

// ── Category tiles for merchants without a brand mark (the app's letter fallback)
function V2Letter({ name, bg, fg, size = 40, radius = 12 }) {
  return <div style={{ width: size, height: size, borderRadius: radius, background: bg, color: fg, flexShrink: 0,
    display:'flex', alignItems:'center', justifyContent:'center', fontWeight: 700, fontSize: size * 0.42,
    fontFamily: T.fSans, letterSpacing: -0.3 }}>{name[0]}</div>;
}

// ═══ In-device screens ═════════════════════════════════════════

// BareDevice with an optional status-bar clock (the Lock Screen has none).
function V2Bare({ dark = false, time = '9:41', bg, children }) {
  return (
    <div style={{ width: 402, height: 874, borderRadius: 48, overflow:'hidden', position:'relative',
      background: bg || (dark ? '#0B0B0C' : T.bg), fontFamily: T.fSans, WebkitFontSmoothing:'antialiased' }}>
      <div style={{ position:'absolute', top: 11, left:'50%', transform:'translateX(-50%)', width: 126, height: 37, borderRadius: 24, background:'#000', zIndex: 50 }}/>
      <div style={{ position:'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}><IOSStatusBar dark={dark} time={time}/></div>
      <div style={{ height:'100%', display:'flex', flexDirection:'column' }}>{children}</div>
    </div>
  );
}

// The voice overlay mid-sentence (S_VoiceListening), with Today pushed further
// back so the sentence is the only thing that reads.
function S_V2Listening() {
  return (
    <V2Bare>
      <div style={{ position:'absolute', inset: 0, zIndex: 1, transform:'scale(0.96)', transformOrigin:'50% 42%',
        filter:'saturate(0.5)', opacity: 0.2, display:'flex', flexDirection:'column' }}><TodayBehind/></div>
      <div style={{ position:'absolute', inset: 0, zIndex: 2,
        background:'linear-gradient(180deg, rgba(251,250,247,0.7) 0%, rgba(251,250,247,0.94) 40%, #FBFAF7 64%)' }}/>
      <VoiceEdge/>
      <div style={{ position:'relative', zIndex: 20, height:'100%', display:'flex', flexDirection:'column' }}>
        <div style={{ paddingTop: 70, display:'flex', justifyContent:'center' }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap: 8, padding:'7px 14px', borderRadius: 999,
            background:'#fff', border:`0.5px solid ${T.line}`, boxShadow:'0 2px 10px rgba(40,36,28,0.06)' }}>
            <span style={{ width: 7, height: 7, borderRadius: 4, background: T.accent }}/>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: T.ink2, letterSpacing: 0.7, textTransform:'uppercase' }}>Listening</span>
            <span style={{ width: 3, height: 3, borderRadius: 2, background: T.ink4 }}/>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: T.ink3 }}>0:04</span>
          </div>
        </div>
        <div style={{ padding:'120px 30px 0', fontFamily: T.fSerif, fontSize: 36, lineHeight: 1.26, letterSpacing: -0.6, color: T.ink, fontWeight: 500 }}>
          <span>Twelve forty at </span>
          <span style={{ background: T.accentSoft, borderRadius: 6, padding:'1px 5px' }}>Starbucks</span>
          <span> for </span>
          <span style={{ color: T.ink4 }}>coffee this morning</span>
          <span style={{ display:'inline-block', width: 3, height: 31, background: T.accent, verticalAlign:'-5px', marginLeft: 5, borderRadius: 2 }}/>
        </div>
        <div style={{ padding:'70px 24px 0' }}><LiveWave/></div>
      </div>
    </V2Bare>
  );
}

// Home Screen with the Murmur widgets (targets/widget/MurmurWidgets.swift).
function V2Figures({ big = 27 }) {
  return (
    <div style={{ fontFamily: V2.SF }}>
      <div style={{ fontSize: 12.5, fontWeight: 500, color:'rgba(60,60,67,0.6)' }}>Spent today</div>
      <div style={{ fontFamily: V2.RND, fontSize: big, fontWeight: 600, letterSpacing: -0.3, color:'#1B1915',
        marginTop: 1, fontVariantNumeric:'tabular-nums' }}>$45.15</div>
      <div style={{ fontSize: 12.5, marginTop: 5, lineHeight: 1.3 }}>
        <span style={{ color: V2.sage, fontWeight: 600 }}>$473</span>
        <span style={{ color:'rgba(60,60,67,0.6)' }}> left this month</span>
      </div>
    </div>
  );
}
function V2HomeIcon({ kind }) {
  const g = {
    cal: <div style={{ textAlign:'center', fontFamily: V2.SF, lineHeight: 1 }}><div style={{ fontSize: 10, fontWeight: 700, color:'#FF5A4F', letterSpacing: 0.3 }}>FRI</div><div style={{ fontSize: 30, fontWeight: 400, color:'#fff', marginTop: 2 }}>18</div></div>,
    camera: <svg width="34" height="34" viewBox="0 0 34 34"><rect x="4" y="9" width="26" height="18" rx="4" fill="#8E8E93"/><circle cx="17" cy="18" r="6" fill="#2C2C2E"/><circle cx="17" cy="18" r="3.6" fill="#5A5A60"/><rect x="11" y="6" width="8" height="4" rx="1.5" fill="#8E8E93"/></svg>,
    maps: <svg width="34" height="34" viewBox="0 0 34 34"><path d="M5 9l8-3 8 3 8-3v19l-8 3-8-3-8 3z" fill="#3A3A3C"/><path d="M13 6v19M21 9v19" stroke="#2A2A2C" strokeWidth="1.5"/><path d="M22.5 11.5l-6 13 -1.6-5.6-5.6-1.6z" fill="#0A84FF"/></svg>,
    music: <svg width="34" height="34" viewBox="0 0 34 34"><path d="M13 23.5V9.5l12-3v14" stroke="#FF375F" strokeWidth="2.6" fill="none" strokeLinejoin="round"/><circle cx="10" cy="23.5" r="3.6" fill="#FF375F"/><circle cx="22" cy="20.5" r="3.6" fill="#FF375F"/></svg>,
    notes: <svg width="34" height="34" viewBox="0 0 34 34"><rect x="6" y="5" width="22" height="24" rx="3" fill="#3A3A3C"/><rect x="6" y="5" width="22" height="6" rx="3" fill="#FFD60A"/><path d="M10 16h14M10 20h14M10 24h9" stroke="#8E8E93" strokeWidth="1.6" strokeLinecap="round"/></svg>,
    clock: <svg width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="12" fill="#1C1C1E" stroke="#fff" strokeWidth="1.6"/><path d="M17 9.5V17l5 3" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><path d="M17 17l-6 2.5" stroke="#FF9F0A" strokeWidth="1.4" strokeLinecap="round"/></svg>,
    weather: <svg width="34" height="34" viewBox="0 0 34 34"><circle cx="13" cy="13" r="6" fill="#FFD60A"/><path d="M11 27h14a5 5 0 000-10 7 7 0 00-13.4 2A4 4 0 0011 27z" fill="#E5E5EA"/></svg>,
    photos: <svg width="34" height="34" viewBox="0 0 34 34">{['#FF9F0A','#FFD60A','#30D158','#64D2FF','#0A84FF','#BF5AF2','#FF375F','#FF453A'].map((c,i)=><ellipse key={i} cx="17" cy="10.5" rx="3.8" ry="6.5" fill={c} opacity="0.85" transform={`rotate(${i*45} 17 17)`}/>)}</svg>,
    messages: <svg width="34" height="34" viewBox="0 0 34 34"><path d="M17 7c6.6 0 12 4.2 12 9.4S23.6 25.8 17 25.8c-1.2 0-2.3-.1-3.4-.4L8 28l1.4-4.6C6.7 21.7 5 19.2 5 16.4 5 11.2 10.4 7 17 7z" fill="#30D158"/></svg>,
    mail: <svg width="34" height="34" viewBox="0 0 34 34"><rect x="5" y="9" width="24" height="17" rx="3" fill="#0A84FF"/><path d="M6 10.5l11 8 11-8" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinejoin="round"/></svg>,
    phone: <svg width="34" height="34" viewBox="0 0 34 34"><path d="M11.5 6.5l3.2 5-2.2 2.6c1.4 3 3.5 5.1 6.4 6.4l2.6-2.2 5 3.2-1.4 4.2c-.4 1.1-1.5 1.8-2.7 1.6C13.5 25.9 8.1 20.5 6.7 11.6c-.2-1.2.5-2.3 1.6-2.7z" fill="#30D158"/></svg>,
    settings: <svg width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="9.5" fill="none" stroke="#8E8E93" strokeWidth="4" strokeDasharray="3.2 2.4"/><circle cx="17" cy="17" r="6.5" fill="none" stroke="#8E8E93" strokeWidth="2.4"/><circle cx="17" cy="17" r="2.4" fill="#8E8E93"/></svg>,
  }[kind];
  return (
    <div style={{ width: 64, height: 64, borderRadius: 15, background:'linear-gradient(180deg,#2C2C2F 0%,#18181A 100%)',
      display:'flex', alignItems:'center', justifyContent:'center',
      boxShadow:'inset 0 0.5px 0 rgba(255,255,255,0.14), 0 6px 14px rgba(0,0,0,0.28)' }}>{g}</div>
  );
}
function S_V2Home() {
  const col = [27, 121, 215, 309];
  const icon = (k, cx, cy) => <div key={k + cx + cy} style={{ position:'absolute', left: cx, top: cy }}>{k === 'murmur'
    ? <img src={V2.icon} width="64" height="64" style={{ width: 64, height: 64, borderRadius: 15, display:'block', boxShadow:'0 6px 14px rgba(0,0,0,0.28)' }}/>
    : <V2HomeIcon kind={k}/>}</div>;
  const btn = (primary, label, glyph) => (
    <div style={{ height: 42, borderRadius: 13, display:'flex', alignItems:'center', justifyContent:'center', gap: 6,
      background: primary ? V2.sage : 'rgba(63,90,62,0.13)', color: primary ? '#fff' : V2.sage,
      fontFamily: V2.SF, fontSize: 14.5, fontWeight: 600 }}>{glyph(primary ? '#fff' : V2.sage, 15)}{label}</div>
  );
  return (
    <BareDevice dark>
      <div style={{ position:'absolute', inset: 0, zIndex: 0,
        background:'radial-gradient(90% 55% at 18% 8%, #5E8463 0%, rgba(94,132,99,0) 70%), radial-gradient(80% 50% at 92% 62%, #9C7A45 0%, rgba(156,122,69,0) 68%), radial-gradient(90% 60% at 30% 100%, #2F5238 0%, rgba(47,82,56,0) 70%), linear-gradient(180deg,#22392A 0%,#14231A 100%)' }}/>
      <div style={{ position:'absolute', inset: 0, zIndex: 1, background:'rgba(0,0,0,0.12)' }}/>
      <div style={{ position:'relative', zIndex: 5, height:'100%' }}>
        {/* Medium widget */}
        <div style={{ position:'absolute', left: 27, top: 70, width: 346, height: 164, borderRadius: 24, background:'#FBFAF7',
          padding: 18, display:'flex', alignItems:'center', gap: 14, boxShadow:'0 12px 30px rgba(0,0,0,0.30)' }}>
          <div style={{ flex: 1 }}><V2Figures/></div>
          <div style={{ width: 120, display:'flex', flexDirection:'column', gap: 8 }}>
            {btn(true, 'Speak', V2I.mic)}{btn(false, 'Type', V2I.keyboard)}
          </div>
        </div>
        {/* Small widget */}
        <div style={{ position:'absolute', left: 27, top: 264, width: 158, height: 158, borderRadius: 24, background:'#FBFAF7',
          padding: 15, boxShadow:'0 12px 30px rgba(0,0,0,0.30)' }}>
          <V2Figures big={25}/>
          <div style={{ position:'absolute', right: 13, bottom: 13, width: 38, height: 38, borderRadius: 19, background: V2.sage,
            display:'flex', alignItems:'center', justifyContent:'center' }}>{V2I.mic('#fff', 17)}</div>
        </div>
        {icon('cal', col[2], 264)}{icon('weather', col[3], 264)}
        {icon('notes', col[2], 358)}{icon('clock', col[3], 358)}
        {icon('murmur', col[0], 452)}{icon('photos', col[1], 452)}{icon('camera', col[2], 452)}{icon('maps', col[3], 452)}
        {icon('mail', col[0], 546)}{icon('music', col[1], 546)}{icon('settings', col[2], 546)}{icon('notes', col[3], 546)}
        {/* page dots */}
        <div style={{ position:'absolute', left: 0, right: 0, top: 650, display:'flex', justifyContent:'center', gap: 8 }}>
          {[1, 0.4].map((o, i) => <span key={i} style={{ width: 7, height: 7, borderRadius: 4, background:`rgba(255,255,255,${o})` }}/>)}
        </div>
        {/* dock */}
        <div style={{ position:'absolute', left: 12, right: 12, top: 760, height: 92, borderRadius: 34, background:'rgba(255,255,255,0.16)',
          display:'flex', alignItems:'center', justifyContent:'space-around', padding:'0 10px' }}>
          {['phone', 'messages', 'mail', 'music'].map((k) => <V2HomeIcon key={k} kind={k}/>)}
        </div>
      </div>
    </BareDevice>
  );
}

// Apple Watch with the Murmur watch app (targets/watch/ContentView.swift).
function V2Watch({ x, y, s = 1, r = 0, z = 10 }) {
  const band = (top, flip) => (
    <div style={{ position:'absolute', left: 40, top, width: 120, height: 92,
      borderRadius: flip ? '3px 3px 0 0' : '0 0 3px 3px',
      background:'linear-gradient(90deg,#C9C2B2 0%,#E9E3D6 20%,#F2EDE2 50%,#E9E3D6 80%,#C9C2B2 100%)',
      WebkitMaskImage: flip ? 'linear-gradient(180deg,#000 40%,transparent 100%)' : 'linear-gradient(0deg,#000 40%,transparent 100%)' }}/>
  );
  return (
    <div style={{ position:'absolute', left: x, top: y, width: 200, height: 244, zIndex: z,
      transform: `rotate(${r}deg) scale(${s})`, transformOrigin:'top left' }}>
      {band(-80, false)}{band(232, true)}
      <div style={{ position:'absolute', right: -10, top: 60, width: 14, height: 42, borderRadius: 6,
        background:'repeating-linear-gradient(180deg,#7A7D80 0 2px,#3E4042 2px 4px)', boxShadow:'0 2px 6px rgba(0,0,0,0.4)' }}/>
      <div style={{ position:'absolute', right: -6, top: 124, width: 8, height: 48, borderRadius: 3, background:'#34373A' }}/>
      <div style={{ position:'absolute', inset: 0, borderRadius: 58,
        background:'linear-gradient(150deg,#686B6E 0%,#2E3032 22%,#1A1B1D 64%,#45484B 100%)',
        boxShadow:'0 50px 90px -18px rgba(0,0,0,0.65), 0 18px 36px -10px rgba(0,0,0,0.45)' }}/>
      <div style={{ position:'absolute', inset: 8, borderRadius: 50, background:'#000', overflow:'hidden',
        fontFamily: V2.SF, color:'#fff', padding:'14px 13px 0' }}>
        <div style={{ textAlign:'right', fontSize: 15, fontWeight: 600, paddingRight: 14 }}>9:41</div>
        <div style={{ display:'flex', justifyContent:'center', marginTop: 4 }}>{V2I.waveform(V2.sageW, 26)}</div>
        <div style={{ marginTop: 9, height: 44, borderRadius: 22, background:'#232326', display:'flex', alignItems:'center',
          justifyContent:'center', gap: 7, fontSize: 15, fontWeight: 600 }}>{V2I.mic(V2.sageW, 15)} Log an expense</div>
        <div style={{ marginTop: 10, textAlign:'center', fontSize: 13, lineHeight: 1.3, color:'rgba(235,235,245,0.62)', padding:'0 6px' }}>
          Saved. $6.40 at Starbucks.
        </div>
      </div>
    </div>
  );
}

// All transactions, filtered to one business (app/more/transactions.tsx).
function V2BizRow({ m, cat, label, t, amt, voice, last, logo }) {
  const c = T.cat[cat] || T.cat.other;
  return (
    <div style={{ display:'flex', alignItems:'center', padding:'12px 14px', gap: 12, borderBottom: last ? 'none' : `0.5px solid ${T.line}` }}>
      {logo ? <MerchantLogo name={m} size={40} radius={12}/> : <V2Letter name={m} bg={c.bg} fg={c.fg}/>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display:'flex', alignItems:'center', gap: 6 }}>
          <span style={{ color: T.ink, fontSize: 15, fontWeight: 600, letterSpacing: -0.2, whiteSpace:'nowrap' }}>{m}</span>
          {voice && Icon.mic(T.accent, 12)}
        </div>
        <div style={{ color: T.ink3, fontSize: 12, marginTop: 3, display:'flex', gap: 5, alignItems:'center', whiteSpace:'nowrap' }}>
          <Chip cat={cat} label={label} size="sm"/>
          <span>·</span><span style={{ color: T.ink2, fontWeight: 600 }}>Farm</span>
          <span>·</span><span>{t}</span>
        </div>
      </div>
      <Money value={-amt} size={16} serif={false} bold={700}/>
    </div>
  );
}
function V2ScreenHeader({ title }) {
  return (
    <div style={{ padding:'6px 18px 0' }}>
      <div style={{ width: 38, height: 38, borderRadius: 19, background: T.surface, border:`0.5px solid ${T.line}`,
        display:'flex', alignItems:'center', justifyContent:'center' }}>{V2I.chevL(T.ink2, 18)}</div>
      <div style={{ marginTop: 12, padding:'0 4px', fontSize: 30, fontWeight: 700, letterSpacing: -0.8, color: T.ink }}>{title}</div>
    </div>
  );
}
function S_V2Biz() {
  const pills = ['All', 'Personal', 'Farm', 'Booth', 'Books'];
  const rows = [
    { m:'Tractor Supply Co.', cat:'work', label:'Supplies', t:'9:12 AM', amt: 42.00, voice: true },
    { m:'Valley Feed & Seed', cat:'coffee', label:'Feed', t:'8:30 AM', amt: 212.00 },
    { m:'Shell', cat:'transit', label:'Fuel', t:'Yesterday', amt: 58.20, logo: true },
    { m:'Ace Hardware', cat:'work', label:'Supplies', t:'Apr 15', amt: 34.99, voice: true },
    { m:'County Vet Clinic', cat:'health', label:'Animals', t:'Apr 12', amt: 95.00 },
    { m:'Farmers Co-op', cat:'food', label:'Seed', t:'Apr 10', amt: 146.75 },
  ];
  return (
    <BareDevice>
      <div style={{ paddingTop: 54 }}/>
      <V2ScreenHeader title="Transactions"/>
      <div style={{ display:'flex', gap: 8, padding:'14px 22px 4px' }}>
        {pills.map((p) => {
          const on = p === 'Farm';
          return <div key={p} style={{ padding:'8px 13px', borderRadius: 999, fontSize: 13.5, fontWeight: on ? 700 : 500,
            background: on ? T.accentSoft : T.surface, color: on ? T.accent : T.ink2,
            border: `1px solid ${on ? T.accent : 'rgba(40,36,28,0.12)'}` }}>{p}</div>;
        })}
      </div>
      <div style={{ padding:'14px 16px 0' }}>
        <div style={{ background: T.surface, borderRadius: 22, padding:'16px 18px', display:'flex', alignItems:'flex-end', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform:'uppercase', color: T.ink3 }}>Farm · April</div>
            <div style={{ marginTop: 4 }}><Money value={1284.60} size={32}/></div>
          </div>
          <div style={{ fontSize: 13, color: T.ink3, fontWeight: 500, paddingBottom: 6 }}>23 transactions</div>
        </div>
      </div>
      <SectionHead label="This week"/>
      <div style={{ padding:'0 16px' }}>
        <div style={{ background: T.surface, borderRadius: 22, overflow:'hidden' }}>
          {rows.map((r, i) => <V2BizRow key={i} {...r} last={i === rows.length - 1}/>)}
        </div>
      </div>
    </BareDevice>
  );
}

// Lock Screen with the Apple Pay capture notification (WalletCaptureDrain.tsx).
function V2Notif({ title, body, time = 'now', scale = 1 }) {
  return (
    <div style={{ display:'flex', gap: 11, alignItems:'center', padding:'13px 14px', borderRadius: 22,
      background:'rgba(244,243,238,0.94)', fontFamily: V2.SF, boxShadow:'0 10px 26px rgba(0,0,0,0.18)' }}>
      <img src={V2.icon} width="38" height="38" style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0 }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color:'#000', letterSpacing: -0.2, whiteSpace:'nowrap' }}>{title}</div>
          <div style={{ fontSize: 13, color:'rgba(60,60,67,0.6)', flexShrink: 0 }}>{time}</div>
        </div>
        <div style={{ fontSize: 15, color:'rgba(0,0,0,0.82)', marginTop: 1, letterSpacing: -0.2, whiteSpace:'nowrap' }}>{body}</div>
      </div>
    </div>
  );
}
function S_V2Lock() {
  return (
    <V2Bare dark time="">
      <div style={{ position:'absolute', inset: 0, zIndex: 0,
        background:'radial-gradient(80% 50% at 80% 12%, #B58A52 0%, rgba(181,138,82,0) 70%), radial-gradient(90% 60% at 10% 70%, #4C7353 0%, rgba(76,115,83,0) 70%), linear-gradient(180deg,#2A3B2D 0%,#16211A 100%)' }}/>
      <div style={{ position:'relative', zIndex: 5, height:'100%', fontFamily: V2.SF, color:'#fff' }}>
        <div style={{ display:'flex', justifyContent:'center', paddingTop: 64 }}>{V2I.lock('rgba(255,255,255,0.9)', 16)}</div>
        <div style={{ textAlign:'center', marginTop: 8, fontSize: 19, fontWeight: 600, color:'rgba(255,255,255,0.86)' }}>Friday, April 18</div>
        <div style={{ textAlign:'center', marginTop: -6, fontFamily: V2.RND, fontSize: 104, fontWeight: 600, letterSpacing: -2, color:'rgba(255,255,255,0.94)' }}>9:41</div>
        <div style={{ position:'absolute', left: 12, right: 12, top: 586 }}>
          <V2Notif title="Captured from Apple Pay · $28.50" body="Uber · Transit · Tap to edit" time="8:12 AM"/>
        </div>
        <div style={{ position:'absolute', left: 46, right: 46, top: 770, display:'flex', justifyContent:'space-between' }}>
          {[0, 1].map((i) => <div key={i} style={{ width: 50, height: 50, borderRadius: 25, background:'rgba(255,255,255,0.18)' }}/>)}
        </div>
      </div>
    </V2Bare>
  );
}

// Transactions after a CSV import: descriptors became names + logos (csvImport.ts).
function S_V2Imported() {
  const rows = [
    { m:'Blue Bottle Coffee', cat:'coffee', label:'Coffee & tea', t:'Mar 28', amt: 6.75 },
    { m:'Amazon', cat:'shopping', label:'Shopping', t:'Mar 28', amt: 32.90 },
    { m:'Chipotle', cat:'food', label:'Food', t:'Mar 27', amt: 14.85 },
    { m:'Netflix', cat:'bills', label:'Subscriptions', t:'Mar 26', amt: 15.49 },
    { m:'Spotify', cat:'bills', label:'Subscriptions', t:'Mar 25', amt: 10.99 },
    { m:'Whole Foods', cat:'food', label:'Groceries', t:'Mar 24', amt: 84.12 },
  ];
  return (
    <BareDevice>
      <div style={{ paddingTop: 54 }}/>
      <V2ScreenHeader title="Import from a file"/>
      <div style={{ padding:'16px 16px 0' }}>
        <div style={{ background: T.accentSoft, borderRadius: 22, padding:'15px 16px', display:'flex', alignItems:'center', gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 17, background: T.accent, display:'flex', alignItems:'center', justifyContent:'center', flexShrink: 0 }}>{V2I.check('#fff', 15)}</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, letterSpacing: -0.2 }}>1,248 transactions imported</div>
            <div style={{ fontSize: 13, color: T.ink3, marginTop: 2 }}>Every merchant named, every category filled in</div>
          </div>
        </div>
      </div>
      <SectionHead label="March"/>
      <div style={{ padding:'0 16px' }}>
        <div style={{ background: T.surface, borderRadius: 22, overflow:'hidden' }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', padding:'12px 14px', gap: 12, borderBottom: i === rows.length - 1 ? 'none' : `0.5px solid ${T.line}` }}>
              <MerchantLogo name={r.m} cat={r.cat} size={40} radius={12}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: T.ink, fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>{r.m}</div>
                <div style={{ color: T.ink3, fontSize: 12, marginTop: 3, display:'flex', gap: 5, alignItems:'center' }}>
                  <Chip cat={r.cat} label={r.label} size="sm"/><span>·</span><span>{r.t}</span>
                </div>
              </div>
              <Money value={-r.amt} size={16} serif={false} bold={700}/>
            </div>
          ))}
        </div>
      </div>
    </BareDevice>
  );
}

// Ask Murmur thread (app/more/ask.tsx): one answered question.
function S_V2Ask({ liftQuestion = false } = {}) {
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      <AskHeader/>
      <div style={{ flex: 1, overflow:'hidden', padding:'14px 20px 0' }}>
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom: 16 }}>
          <div style={{ maxWidth:'82%', background: T.ink, color:'#fff', padding:'11px 15px', borderRadius: 20,
            borderBottomRightRadius: 6, fontSize: 15.5, lineHeight: 1.4, letterSpacing: -0.1, visibility: liftQuestion ? 'hidden' : 'visible' }}>Can I afford a trip to Lisbon in June?</div>
        </div>
        <div style={{ display:'flex', gap: 10 }}>
          <div style={{ marginTop: 4 }}><AskMark size={32} variant="sage"/></div>
          <div style={{ flex: 1, minWidth: 0, display:'flex', flexDirection:'column', gap: 10 }}>
            <div style={{ background: T.surface, padding:'14px 16px', borderRadius: 20, borderTopLeftRadius: 6, border:`0.5px solid ${T.line}` }}>
              <div style={{ fontFamily: T.fSerif, fontSize: 17.5, lineHeight: 1.38, letterSpacing: -0.2, color: T.ink }}>
                Yes, by June. You have about <b style={{ color: T.accent }}>$150</b> left over each month, and the trip
                is about <b style={{ color: T.accent }}>$450</b>.
              </div>
            </div>
            <AskCard eyebrow="From your last 3 months">
              <AskRow label="Average income" value="$4,120"/>
              <AskRow label="Average spend" value="$3,970"/>
              <AskRow label="Average left over" value="$150" accent last/>
            </AskCard>
            <AskCard eyebrow="What it would take">
              <div style={{ fontFamily: T.fSerif, fontSize: 30, lineHeight: 1.2, letterSpacing: -0.8, color: T.ink }}>3 months</div>
              <div style={{ marginTop: 4, fontSize: 13, color: T.ink3 }}>Setting aside $150 a month, from money already left over.</div>
            </AskCard>
            <div style={{ display:'flex', flexWrap:'wrap', gap: 8 }}>
              <AskActionChip label="Create goal" glyph={AskGlyph.pie}/>
              <AskActionChip label="Show transactions" glyph={(c)=>Icon.list(c, 13)}/>
            </div>
          </div>
        </div>
      </div>
    </BareDevice>
  );
}

// ═══ Floating proof pieces ═══════════════════════════════════

// NoBankProof (as-primitives) with an honest footer: Murmur has no voice login.
function V2NoBank({ x, y, s=1, line="Nothing to connect.", small="Speak it, tap to pay, or import a file." }) {
  const cream = (o) => `rgba(251,250,247,${o})`;
  const tile = (inner, label) => (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap: 12 }}>
      <div style={{ width: 140, height: 140, borderRadius: 34, background: cream(0.97),
        display:'flex', alignItems:'center', justifyContent:'center',
        boxShadow:'0 26px 56px rgba(8,14,8,0.42)' }}>{inner}</div>
      <div style={{ fontSize: 15.5, fontWeight: 600, color: cream(0.72) }}>{label}</div>
    </div>
  );
  return (
    <div style={{ position:'absolute', left: x, top: y, width: 566, transform:`scale(${s})`,
      transformOrigin:'top left', zIndex: 2, textAlign:'center' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'center', gap: 16 }}>
        {tile(
          <svg width="66" height="66" viewBox="0 0 24 24" fill="none" stroke="#55514A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 9.5L12 4l8.5 5.5H3.5z"/>
            <path d="M5.4 12v6M9.8 12v6M14.2 12v6M18.6 12v6"/>
            <path d="M3.5 20.5h17"/>
          </svg>, 'Your bank')}
        <div style={{ width: 124, paddingTop: 38 }}>
          <svg width="124" height="64" viewBox="0 0 124 64">
            <rect x="2" y="21" width="42" height="22" rx="11" fill="none" stroke={cream(0.75)} strokeWidth="3" transform="rotate(-9 23 32)"/>
            <rect x="80" y="21" width="42" height="22" rx="11" fill="none" stroke={cream(0.75)} strokeWidth="3" transform="rotate(9 101 32)"/>
            <path d="M56 26 L51 17 M62 24 L62 13 M68 26 L73 17" stroke={CLAY} strokeWidth="3" strokeLinecap="round"/>
            <path d="M56 40 L51 49 M62 42 L62 53 M68 40 L73 49" stroke={CLAY} strokeWidth="3" strokeLinecap="round"/>
          </svg>
          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, letterSpacing: 2.4, textTransform:'uppercase', color: CLAY }}>Never linked</div>
        </div>
        {tile(<DropMark size={94}/>, 'Murmur')}
      </div>
      <div style={{ marginTop: 42, display:'flex', justifyContent:'center', gap: 26 }}>
        {['Bank login','Password','One-time code'].map((c)=>(
          <span key={c} style={{ position:'relative', fontFamily: T.fSerif, fontStyle:'italic', fontSize: 20.5,
            letterSpacing: -0.2, color: cream(0.5) }}>
            {c}
            <span style={{ position:'absolute', left: -5, right: -5, top:'52%', height: 2, background: CLAY,
              opacity: 0.9, borderRadius: 2, transform:'rotate(-2deg)' }}></span>
          </span>
        ))}
      </div>
      <div style={{ marginTop: 30, fontFamily: T.fSerif, fontSize: 25, fontWeight: 600, color:'#F7F5F0', letterSpacing: -0.4 }}>{line}</div>
      <div style={{ marginTop: 4, fontSize: 15.5, color: cream(0.62) }}>{small}</div>
    </div>
  );
}


// The parsed result, as the voice sheet shows it (S_VoiceResult), lifted out.
function V2Filed({ x, y, w = 560, r = -1.5 }) {
  return (
    <V2Card x={x} y={y} w={w} r={r} pad="18px 20px 18px 18px" radius={28}>
      <div style={{ display:'flex', alignItems:'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 22, height: 22, borderRadius: 11, background: V2.sage, display:'flex', alignItems:'center', justifyContent:'center' }}>{V2I.check('#fff', 12)}</div>
        <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: 1.2, textTransform:'uppercase', color: V2.sage }}>Filed · 1.8 seconds</div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap: 14 }}>
        <MerchantLogo name="Starbucks" size={54} radius={16}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.4 }}>Starbucks</div>
          <div style={{ display:'flex', alignItems:'center', gap: 6, marginTop: 5 }}>
            <Chip cat="coffee" label="Coffee & tea"/><span style={{ fontSize: 13.5, color: T.ink3 }}>· Today 9:41 AM</span>
          </div>
        </div>
        <Money value={12.40} size={44}/>
      </div>
    </V2Card>
  );
}

// A raw bank statement export, before Murmur names anything.
function V2Statement({ x, y, w = 560, r = -2.5 }) {
  const rows = [
    ['03/28', 'SQ *BLUEBOTTLE 0412 OAKLAND CA', '-6.75'],
    ['03/28', 'AMZN MKTP US*2K41L09J2', '-32.90'],
    ['03/27', 'TST* CHIPOTLE 2210 SAN FRAN', '-14.85'],
    ['03/26', 'NETFLIX.COM 866-579-7172 CA', '-15.49'],
    ['03/25', 'SPOTIFY P1A2B3C4D5 NEW YORK', '-10.99'],
  ];
  return (
    <V2Card x={x} y={y} w={w} r={r} pad="16px 18px 14px" radius={14} z={11}
      style={{ background:'#FFFEFB', boxShadow:'0 40px 70px -22px rgba(60,48,30,0.40), 0 10px 22px -8px rgba(60,48,30,0.2)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingBottom: 9, borderBottom:'1px dashed rgba(40,36,28,0.18)' }}>
        <div style={{ fontFamily: T.fMono, fontSize: 13, fontWeight: 500, color: T.ink2 }}>statement-2026.csv</div>
        <div style={{ fontFamily: T.fMono, fontSize: 12, color: T.ink4 }}>1,248 rows</div>
      </div>
      {rows.map(([d, desc, a], i) => (
        <div key={i} style={{ display:'flex', gap: 12, fontFamily: T.fMono, fontSize: 13.5, color: '#5A554C', padding:'7px 0',
          borderBottom: i === rows.length - 1 ? 'none' : '1px solid rgba(40,36,28,0.06)' }}>
          <span style={{ color: T.ink4 }}>{d}</span>
          <span style={{ flex: 1, whiteSpace:'nowrap', overflow:'hidden' }}>{desc}</span>
          <span>{a}</span>
        </div>
      ))}
    </V2Card>
  );
}

// A savings goal card (goals.* strings), lifted out of Budgets.
function V2Goal({ x, y, w = 300, r = -2 }) {
  const pct = 0.62, R = 26, C = 2 * Math.PI * R;
  return (
    <V2Card x={x} y={y} w={w} r={r} pad="16px 18px" radius={24}>
      <div style={{ display:'flex', alignItems:'center', gap: 14 }}>
        <svg width="64" height="64" viewBox="0 0 64 64" style={{ flexShrink: 0 }}>
          <circle cx="32" cy="32" r={R} fill="none" stroke="#E8EDE3" strokeWidth="7"/>
          <circle cx="32" cy="32" r={R} fill="none" stroke={V2.sage} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 32 32)"/>
          <text x="32" y="37" textAnchor="middle" fontSize="15" fontWeight="700" fill={V2.ink} fontFamily="Plus Jakarta Sans">62%</text>
        </svg>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 1, textTransform:'uppercase', color: T.ink3 }}>Savings goal</div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3, marginTop: 2 }}>Trip to Lisbon</div>
          <div style={{ fontSize: 13.5, color: T.ink3, marginTop: 2 }}><b style={{ color: V2.ink }}>$560</b> of $900 · <span style={{ color: V2.sage, fontWeight: 700 }}>On track</span></div>
        </div>
      </div>
    </V2Card>
  );
}

// ═══ v3: real logos, real people, the order that sells ═══════════

const __R3 = (id, path) => (window.__resources && window.__resources[id]) || path;

// Merchant logos exactly as the app loads them (Google's favicon service,
// merchantBrand.ts), saved where they are sharp enough for the store. Marks
// whose favicon is too small are drawn as vectors (AS_BRANDS + below).
const V3_LOGO_FILES = {
  'Chipotle': 'chipotle.com', 'Whole Foods': 'wholefoodsmarket.com', 'Starbucks': 'starbucks.com',
  'Shell': 'shell.us', 'USPS': 'usps.com', 'Target': 'target.com', 'Uber': 'uber.com',
  "Trader Joe's": 'traderjoes.com', 'Sweetgreen': 'sweetgreen.com', 'Lyft': 'lyft.com',
  'Airbnb': 'airbnb.com', 'Instacart': 'instacart.com', 'Costco': 'costco.com',
  'iCloud': 'apple.com', 'Apple': 'apple.com',
};
const V3_VECTORS = {
  'Microsoft': (s) => (
    <svg width={s * 0.56} height={s * 0.56} viewBox="0 0 22 22">
      <rect x="0" y="0" width="10.4" height="10.4" fill="#F25022"/><rect x="11.6" y="0" width="10.4" height="10.4" fill="#7FBA00"/>
      <rect x="0" y="11.6" width="10.4" height="10.4" fill="#00A4EF"/><rect x="11.6" y="11.6" width="10.4" height="10.4" fill="#FFB900"/>
    </svg>
  ),
  'Tractor Supply': (s) => (
    <svg width={s * 0.82} height={s * 0.82} viewBox="0 0 40 40">
      <path d="M4 9h32l-3.2 19.5L20 34 7.2 28.5z" fill="#C8102E"/>
      <text x="20" y="25" textAnchor="middle" fontSize="13.5" fontWeight="800" fill="#fff" fontFamily="Georgia, serif" letterSpacing="-0.5">TSC</text>
    </svg>
  ),
};
function V3Logo({ name = '', size = 40, radius = 12, cat }) {
  const key = Object.keys(V3_LOGO_FILES).find((k) => name.includes(k));
  if (key) {
    const domain = V3_LOGO_FILES[key];
    return <img alt="" src={__R3('logo:' + domain, 'logos/' + domain + '.png')} width={size} height={size}
      style={{ width: size, height: size, borderRadius: radius, objectFit:'cover', flexShrink: 0, background:'#fff',
        boxShadow:'inset 0 0 0 0.5px rgba(40,36,28,0.14)' }}/>;
  }
  const vec = Object.keys(V3_VECTORS).find((k) => name.includes(k));
  if (vec) return (
    <div style={{ width: size, height: size, borderRadius: radius, background:'#fff', flexShrink: 0, display:'flex',
      alignItems:'center', justifyContent:'center', boxShadow:'inset 0 0 0 0.5px rgba(40,36,28,0.16)' }}>{V3_VECTORS[vec](size)}</div>
  );
  const brand = Object.keys(AS_BRANDS).find((k) => name.includes(k)) || Object.keys(AS_IMG).find((k) => name.includes(k));
  if (!brand) console.error('LETTER-FALLBACK ' + name);
  return <ASMerchantLogo name={name} size={size} radius={radius} cat={cat}/>;
}
window.MerchantLogo = V3Logo;

// Three small-business logos, the kind people upload in Settings > Businesses.
const V3_BIZ = {
  Farm: (s) => (
    <svg width={s} height={s} viewBox="0 0 48 48">
      <rect width="48" height="48" fill="#F3E6C4"/>
      <circle cx="31" cy="17" r="7" fill="#E3A33B"/>
      <path d="M0 33c9-6 19-7 28-3s15 3 20 0v18H0z" fill="#5E7F4E"/>
      <path d="M0 39c10-4 21-4 31-1s13 2 17 0v10H0z" fill="#3F5A3E"/>
      <path d="M10 33V25l6-5 6 5v8z" fill="#A5432F"/><path d="M14 33v-5h4v5z" fill="#F3E6C4"/>
    </svg>
  ),
  Booth: (s) => (
    <svg width={s} height={s} viewBox="0 0 48 48">
      <rect width="48" height="48" fill="#6E2C2C"/>
      <circle cx="17" cy="20" r="7.5" fill="none" stroke="#E2BE76" strokeWidth="3.2"/>
      <circle cx="17" cy="20" r="2.4" fill="#E2BE76"/>
      <path d="M22.5 25.5L36 39M30 33l3-3M33.5 36.5l3-3" stroke="#E2BE76" strokeWidth="3.2" strokeLinecap="round"/>
    </svg>
  ),
  Books: (s) => (
    <svg width={s} height={s} viewBox="0 0 48 48">
      <rect width="48" height="48" fill="#1F3A5F"/>
      <path d="M24 15c-4-3-9-3.5-14-2.5v21c5-1 10-.5 14 2.5 4-3 9-3.5 14-2.5v-21c-5-1-10-.5-14 2.5z" fill="#F4EDE0"/>
      <path d="M24 15v21" stroke="#1F3A5F" strokeWidth="1.6"/>
      <path d="M14 18.5c2.6-.4 5-.1 7 .9M14 23c2.6-.4 5-.1 7 .9M27 19.4c2-1 4.4-1.3 7-.9M27 23.9c2-1 4.4-1.3 7-.9" stroke="#C9A35B" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
};
function V3BizMark({ name, size = 20 }) {
  return <div style={{ width: size, height: size, borderRadius: size * 0.28, overflow:'hidden', flexShrink: 0,
    boxShadow:'inset 0 0 0 0.5px rgba(40,36,28,0.18)' }}>{V3_BIZ[name](size)}</div>;
}

function V3Photo({ src, x, y, w, h, pos = '50% 50%', radius = 36, z = 2, shadow = true, style = {}, children }) {
  return (
    <div style={{ position:'absolute', left: x, top: y, width: w, height: h, zIndex: z, borderRadius: radius, overflow:'hidden',
      boxShadow: shadow ? '0 50px 90px -30px rgba(30,24,14,0.45), 0 18px 36px -18px rgba(30,24,14,0.3)' : 'none', ...style }}>
      <img alt="" src={src} style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition: pos, display:'block' }}/>
      {children}
    </div>
  );
}
const V3_PHOTO = {
  voice: __R3('photo:voice', 'photos/voice-speaker.jpg'),
  pay: __R3('photo:pay', 'photos/applepay-bar.jpg'),
  ask: __R3('photo:ask', 'photos/ask-friends.jpg'),
};

// A thing someone said, already filed: logo, the words, the amount.
function V3Murmur({ x, y, r = 0, name, words, amount, w = 330, z = 8 }) {
  return (
    <V2Card x={x} y={y} w={w} r={r} z={z} pad="12px 14px" radius={20}>
      <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
        <V3Logo name={name} size={38} radius={11}/>
        <div style={{ flex: 1, minWidth: 0, fontFamily: V2.FR, fontStyle:'italic', fontSize: 17.5, letterSpacing: -0.2, color: V2.ink, lineHeight: 1.2 }}>{words}</div>
        <div style={{ fontWeight: 700, fontSize: 15.5, color: V2.ink, fontVariantNumeric:'tabular-nums' }}>{amount}</div>
      </div>
    </V2Card>
  );
}

// Lock-screen notification card, lifted (WalletCaptureDrain.notifySaved).
function V3Notif({ x, y, w, r = 0, title, body, time = 'now', scale = 1, z = 9, light = true }) {
  const f = scale;
  return (
    <div style={{ position:'absolute', left: x, top: y, width: w, zIndex: z, transform:`rotate(${r}deg)`,
      filter:'drop-shadow(0 34px 50px rgba(0,0,0,0.45))' }}>
      <div style={{ display:'flex', gap: 14 * f, alignItems:'center', padding:`${18 * f}px ${20 * f}px`, borderRadius: 28 * f,
        background: light ? '#F6F5F0' : '#fff', fontFamily: V2.SF }}>
        <img alt="" src={V2.icon} style={{ width: 54 * f, height: 54 * f, borderRadius: 13 * f, flexShrink: 0, boxShadow:'inset 0 0 0 0.5px rgba(0,0,0,0.1)' }}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap: 10 }}>
            <div style={{ fontSize: 19.5 * f, fontWeight: 700, color:'#000', letterSpacing: -0.3, whiteSpace:'nowrap' }}>{title}</div>
            <div style={{ fontSize: 15 * f, color:'rgba(60,60,67,0.6)', flexShrink: 0 }}>{time}</div>
          </div>
          <div style={{ fontSize: 18 * f, color:'rgba(0,0,0,0.78)', marginTop: 3, letterSpacing: -0.2, whiteSpace:'nowrap' }}>{body}</div>
        </div>
      </div>
    </div>
  );
}

// The voice result, lifted out (S_VoiceResult), for Blue Bottle.
function V3Filed({ x, y, w = 560, r = -1.5, z = 9 }) {
  return (
    <V2Card x={x} y={y} w={w} r={r} z={z} pad="18px 20px 18px 18px" radius={28}>
      <div style={{ display:'flex', alignItems:'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 22, height: 22, borderRadius: 11, background: V2.sage, display:'flex', alignItems:'center', justifyContent:'center' }}>{V2I.check('#fff', 12)}</div>
        <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: 1.2, textTransform:'uppercase', color: V2.sage }}>Filed · 1.8 seconds</div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap: 14 }}>
        <V3Logo name="Blue Bottle" size={56} radius={16}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.4 }}>Blue Bottle Coffee</div>
          <div style={{ display:'flex', alignItems:'center', gap: 6, marginTop: 5 }}>
            <Chip cat="coffee" label="Coffee & tea"/><span style={{ fontSize: 13.5, color: T.ink3 }}>· Today 9:41 AM</span>
          </div>
        </div>
        <Money value={6.50} size={44}/>
      </div>
    </V2Card>
  );
}

// Budgets tab exactly as app/(tabs)/budgets.tsx draws it: ring hero with the
// rolled-over line, then one row per category with a colour dot.
function S_V3Budgets() {
  const rows = [
    { n:'Food & drink', c: T.cat.food.fg, used: 412, cap: 600 },
    { n:'Coffee & tea', c: T.cat.coffee.fg, used: 89, cap: 120 },
    { n:'Transit', c: T.cat.transit.fg, used: 186, cap: 250 },
    { n:'Shopping', c: T.cat.shopping.fg, used: 284, cap: 300 },
    { n:'Bills', c: T.cat.bills.fg, used: 230, cap: 280 },
  ];
  const money = (v) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <V2Bare>
      <div style={{ paddingTop: 56 }}/>
      <div style={{ padding:'14px 22px 6px', display:'flex', alignItems:'flex-end', justifyContent:'space-between' }}>
        <div>
          <div style={{ color: T.ink4, fontSize: 13, fontWeight: 600, letterSpacing: 0.4, textTransform:'uppercase' }}>April · 12 days to go</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: T.ink, letterSpacing: -0.8 }}>Budgets</div>
        </div>
        <div style={{ width: 38, height: 38, borderRadius: 19, background: T.surface, border:`0.5px solid ${T.line}`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom: 4 }}>{Icon.plus(T.ink2, 18)}</div>
      </div>
      <div style={{ padding:'8px 16px 0' }}>
        <div style={{ background: T.surface, borderRadius: 24, padding:'18px 18px', display:'flex', gap: 18, alignItems:'center' }}>
          <BudgetRing spent={1237} limit={1700}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6, textTransform:'uppercase', color: T.ink3 }}>Monthly budget</div>
            <div style={{ marginTop: 3 }}><Money value={463} size={32}/></div>
            <div style={{ fontSize: 13, color: T.ink3, marginTop: 4 }}>left of <b style={{ color: T.ink2 }}>$1,700</b></div>
            <div style={{ fontSize: 13, color: T.ink3, marginTop: 2 }}><b style={{ color: T.ink2 }}>+$38.00</b> rolled over</div>
            <div style={{ fontSize: 13, color: T.ink3, marginTop: 2 }}><b style={{ color: T.ink2 }}>$180.00</b> still due</div>
            <div style={{ display:'inline-block', marginTop: 9, padding:'5px 11px', borderRadius: 999, background: T.accentSoft, color: T.accent, fontSize: 12.5, fontWeight: 700 }}>On pace</div>
          </div>
        </div>
      </div>
      <div style={{ padding:'20px 24px 8px', color: T.ink3, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform:'uppercase' }}>By category</div>
      <div style={{ padding:'0 16px' }}>
        <div style={{ background: T.surface, borderRadius: 22, overflow:'hidden' }}>
          {rows.map((r, i) => {
            const pct = r.used / r.cap, near = pct > 0.9;
            return (
              <div key={r.n} style={{ padding:'14px 16px 12px', borderTop: i ? `0.5px solid ${T.line}` : 'none' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: r.c }}/>
                    <span style={{ fontSize: 15, fontWeight: 600, color: T.ink }}>{r.n}</span>
                    <span style={{ fontSize: 12, color: T.ink4 }}>Monthly</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'baseline', gap: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: T.ink, fontVariantNumeric:'tabular-nums' }}>{money(r.used)}</span>
                    <span style={{ fontSize: 12.5, color: T.ink4 }}>/ ${r.cap}</span>
                  </div>
                </div>
                <div style={{ marginTop: 9, height: 6, borderRadius: 3, background: T.surface2, overflow:'hidden' }}>
                  <div style={{ width: `${Math.min(pct, 1) * 100}%`, height:'100%', borderRadius: 3, background: near ? '#B8860B' : r.c }}/>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: near ? '#B8860B' : T.ink3, fontWeight: near ? 600 : 500 }}>
                  {near ? 'Tight' : 'On pace'} · ${r.cap - r.used} left of ${r.cap}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </V2Bare>
  );
}

// All transactions filtered to one business, drawn as app/more/transactions.tsx
// draws it (checked against the 1.0.2 simulator build): nav bar with the date
// filter, Expenses/Income switch, summary line, search, business pills (the
// selected one is ink), the business header card, then day sections.
function S_V3Biz() {
  const pills = [['All'], ['Personal'], ['Farm', true], ['Booth', true], ['Books', true]];
  const today = [
    { m:'Tractor Supply Co.', cat:'work', label:'Supplies', t:'9:12 AM', amt: 42.00, voice: true },
    { m:'Costco', cat:'food', label:'Feed', t:'8:30 AM', amt: 212.00 },
  ];
  const earlier = [
    { m:'Shell', cat:'transit', label:'Fuel', t:'5:40 PM', amt: 58.20 },
    { m:'USPS', cat:'bills', label:'Shipping', t:'1:15 PM', amt: 18.40, voice: true },
    { m:'Target', cat:'shopping', label:'Supplies', t:'10:02 AM', amt: 36.75 },
    { m:'Amazon', cat:'work', label:'Parts', t:'8:47 AM', amt: 64.99 },
  ];
  const row = (r, i, n) => (
    <div key={i} style={{ display:'flex', alignItems:'center', padding:'12px 14px', gap: 12, borderBottom: i === n - 1 ? 'none' : `0.5px solid ${T.line}` }}>
      <V3Logo name={r.m} size={40} radius={12}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display:'flex', alignItems:'center', gap: 6 }}>
          <span style={{ color: T.ink, fontSize: 15, fontWeight: 600, letterSpacing: -0.2, whiteSpace:'nowrap' }}>{r.m}</span>
          {r.voice && Icon.mic(T.accent, 12)}
        </div>
        <div style={{ color: T.ink3, fontSize: 12, marginTop: 3, display:'flex', gap: 5, alignItems:'center', whiteSpace:'nowrap' }}>
          <Chip cat={r.cat} label={r.label} size="sm"/><span>·</span>
          <V3BizMark name="Farm" size={14}/><span style={{ color: T.ink2, fontWeight: 600 }}>Farm</span>
          <span>·</span><span>{r.t}</span>
        </div>
      </div>
      <Money value={-r.amt} size={16} serif={false} bold={700}/>
    </div>
  );
  const card = (rows) => <div style={{ padding:'0 16px' }}><div style={{ background: T.surface, borderRadius: 20, overflow:'hidden' }}>{rows.map((r, i) => row(r, i, rows.length))}</div></div>;
  const day = (label) => <div style={{ padding:'16px 20px 8px', fontSize: 14, fontWeight: 600, color: T.ink2 }}>{label}</div>;
  return (
    <V2Bare>
      <div style={{ paddingTop: 54 }}/>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 16px 0' }}>
        <div style={{ width: 38, height: 38, borderRadius: 19, background: T.surface, border:`0.5px solid ${T.line}`, display:'flex', alignItems:'center', justifyContent:'center' }}>{V2I.chevL(T.ink2, 18)}</div>
        <div style={{ fontSize: 16.5, fontWeight: 600, color: T.ink }}>Transactions</div>
        <div style={{ display:'flex', alignItems:'center', gap: 6, padding:'8px 12px', borderRadius: 999, background: T.surface, border:`0.5px solid ${T.line}`, fontSize: 13.5, fontWeight: 600, color: T.ink2 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" stroke={T.ink2} strokeWidth="1.8"/><path d="M3.5 9.5h17M8 3v4M16 3v4" stroke={T.ink2} strokeWidth="1.8" strokeLinecap="round"/></svg>
          All time
        </div>
      </div>
      <div style={{ margin:'14px 16px 0', padding: 3, borderRadius: 14, background: T.surface2, display:'flex' }}>
        <div style={{ flex: 1, textAlign:'center', padding:'8px 0', borderRadius: 11, background:'#fff', fontSize: 14, fontWeight: 600, color: T.ink, boxShadow:'0 1px 3px rgba(40,36,28,0.08)' }}>Expenses</div>
        <div style={{ flex: 1, textAlign:'center', padding:'8px 0', fontSize: 14, fontWeight: 500, color: T.ink3 }}>Income</div>
      </div>
      <div style={{ padding:'10px 18px 0', fontSize: 12.5, color: T.ink3 }}>All time · 64 transactions · $3,912.40</div>
      <div style={{ margin:'12px 16px 0', padding:'11px 16px', borderRadius: 999, background:'#fff', border:`0.5px solid ${T.line}`, fontSize: 15, color: T.ink4 }}>Search transactions...</div>
      <div style={{ display:'flex', gap: 8, padding:'12px 16px 0', whiteSpace:'nowrap' }}>
        {pills.map(([p, mark]) => {
          const on = p === 'Farm';
          return <div key={p} style={{ display:'flex', alignItems:'center', gap: 7, padding: mark ? '6px 13px 6px 7px' : '8px 14px', borderRadius: 999, fontSize: 14,
            fontWeight: 600, flexShrink: 0, background: on ? T.ink : T.surface, color: on ? '#fff' : T.ink2,
            border: `0.5px solid ${on ? T.ink : 'rgba(40,36,28,0.12)'}` }}>{mark && <V3BizMark name={p} size={20}/>}{p}</div>;
        })}
      </div>
      <div style={{ padding:'12px 16px 0' }}>
        <div style={{ background: T.surface, borderRadius: 20, padding:'14px 16px', display:'flex', alignItems:'center', gap: 12, boxShadow:'0 1px 3px rgba(40,36,28,0.05)' }}>
          <V3BizMark name="Farm" size={44}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: T.ink, letterSpacing: -0.3 }}>Farm</div>
            <div style={{ fontSize: 13, color: T.ink3, marginTop: 1, whiteSpace:'nowrap' }}>23 transactions this month</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <Money value={1284.60} size={20} serif={false} bold={700}/>
            <div style={{ fontSize: 13, color: T.ink3, marginTop: 1 }}>Spent this month</div>
          </div>
        </div>
      </div>
      {day('Today')}
      {card(today)}
      {day('Thursday, April 17')}
      {card(earlier)}
    </V2Bare>
  );
}


// Recurring and Insights as the 1.0.2 build draws them (checked in the
// simulator): Recurring's back pill reads More and Add manually is ink;
// Insights has the period chevron, a tinted spend card and axis labels.
function S_V3Recurring() {
  // Traced from apps/mobile/app/recurring.tsx: back pill + "Add manually",
  // eyebrow/headline, hero (monthly outflow + yearly + income line + footnote),
  // then Expenses / Income sections each with their own per-month subtotal.
  const expenses = [
    { m:'Netflix',       amt: 14.00, next:'Apr 24', cat:'bills',  tag:'/mo' },
    { m:'Spotify',       amt: 10.99, next:'Apr 21', cat:'bills',  tag:'/mo' },
    { m:'iCloud+',       amt: 2.99,  next:'Apr 29', cat:'bills',  tag:'/mo' },
    { m:'Equinox',       amt: 245.00, next:'May 1', cat:'health', tag:'/mo' },
  ];
  const income = [{ m:'Microsoft', amt: 2000.00, next:'Apr 30', cat:'work', tag:'/2wk', eq: 4333.33, credit:true }];
  const monthlyTotal = 291.40;
  return (
    <BareDevice>
      <div style={{ paddingTop: 56 }}/>
      <div style={{ padding:'8px 20px', display:'flex', alignItems:'center', gap: 8 }}>
        <div style={{ width: 36, height: 36, borderRadius: 18, background: T.surface,
          border:`0.5px solid ${T.line}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24"><path d="M14 6l-6 6 6 6" stroke={T.ink2} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <div style={{ fontSize: 15, color: T.ink3, fontWeight: 500 }}>More</div>
        <div style={{ flex: 1 }}/>
        <div style={{ display:'inline-flex', alignItems:'center', gap: 6, padding:'9px 15px', borderRadius: 999,
          background: T.ink, fontSize: 13.5, fontWeight: 600, color:'#fff' }}>
          {Icon.plus('#fff', 14)} Add manually
        </div>
      </div>
      <div style={{ padding:'14px 22px 4px' }}>
        <div style={{ color: T.ink4, fontSize: 13, fontWeight: 600, letterSpacing: 0.4, textTransform:'uppercase' }}>
          Subscriptions, bills &amp; income
        </div>
        <div style={{ fontFamily: T.fDisp, fontSize: 32, fontWeight: 700, color: T.ink, letterSpacing: -0.8, marginTop: 2 }}>
          Recurring
        </div>
      </div>
      <div style={{ flex: 1, overflow:'hidden', paddingBottom: 20 }}>
        <div style={{ padding:'12px 20px 0' }}>
          <div style={{ background: T.surface, borderRadius: 26, padding:'20px 22px' }}>
            <div style={{ color: T.ink3, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform:'uppercase' }}>
              Recurring expenses · per month
            </div>
            <div style={{ marginTop: 6, display:'flex', alignItems:'baseline', gap: 8 }}>
              <Money value={monthlyTotal} size={46}/>
              <span style={{ color: T.ink3, fontSize: 14 }}>/ month</span>
            </div>
            <div style={{ fontFamily: T.fSerif, fontSize: 16, color: T.ink2, lineHeight: 1.4, marginTop: 10 }}>
              That’s <b style={{ color: T.ink }}>$3,497</b> a year.
            </div>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop:`0.5px solid ${T.line}`,
              display:'flex', alignItems:'baseline', justifyContent:'space-between' }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform:'uppercase', color: T.ink3 }}>
                Recurring income
              </div>
              <div style={{ display:'flex', alignItems:'baseline', gap: 6 }}>
                <Money value={4333.33} size={20} positive/>
                <span style={{ color: T.ink3, fontSize: 12 }}>/ month</span>
              </div>
            </div>
            <div style={{ marginTop: 10, fontSize: 11.5, color: T.ink4, lineHeight: 1.45 }}>
              Every schedule is shown as a per-month amount, a paycheck every 2 weeks counts 26 ÷ 12 times, a weekly bill 52 ÷ 12.
            </div>
          </div>
        </div>
        <RecSection label="Expenses" total="$291.40/mo" rows={expenses}/>
        <RecSection label="Income" total="$4,333.33/mo" totalAccent rows={income}/>
      </div>
    </BareDevice>
  );
}

function S_V3Insights() {
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
        <div style={{ color: T.ink4, fontSize: 13, fontWeight: 600, letterSpacing: 0.4, textTransform:'uppercase', display:'flex', alignItems:'center', gap: 6 }}>
          This month
          <svg width="12" height="12" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke={T.ink4} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <div style={{ fontFamily: T.fDisp, fontSize: 34, fontWeight: 700, color: T.ink, letterSpacing: -0.8 }}>
          Insights
        </div>
      </div>
      <div style={{ flex: 1, overflow:'auto', paddingBottom: 140 }}>
        {/* Hero total */}
        <div style={{ padding:'12px 20px 0' }}>
          <div style={{
            background: T.surface2, borderRadius: 28, padding:'24px 22px',
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
            <div style={{ display:'flex', justifyContent:'space-between', marginTop: 8, fontSize: 11, fontWeight: 600, color: T.ink4 }}>
              <span>Apr 1</span><span style={{ letterSpacing: 0.6, textTransform:'uppercase' }}>Last 18 days</span><span>Apr 18</span>
            </div>
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
              At this pace, you'll end April around <span style={{ color:'#C9D6BE' }}>$2,240</span>, about $310 below your usual.
            </div>
          </div>
        </div>
      </div>
      <TabBar active="insights"/>
    </BareDevice>
  );
}

// Faint ring of the subscriptions Murmur spots, behind the phone.
function V3Orbit({ items, cx = 321, cy = 900, r = 330, dark = true }) {
  return (
    <div style={{ position:'absolute', inset: 0, zIndex: 1, pointerEvents:'none' }}>
      <svg style={{ position:'absolute', inset: 0 }} width={V2.W} height={V2.H}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={dark ? '#F7F5F0' : V2.sage} strokeWidth="1.5" strokeDasharray="3 10" opacity="0.22"/>
        <circle cx={cx} cy={cy} r={r + 130} fill="none" stroke={dark ? '#F7F5F0' : V2.sage} strokeWidth="1.5" strokeDasharray="3 12" opacity="0.13"/>
      </svg>
      {items.map(([n, a, s = 58, rr = 1]) => {
        const rad = a * Math.PI / 180, R = r * rr;
        return <div key={n} style={{ position:'absolute', left: cx + R * Math.cos(rad) - s / 2, top: cy + R * Math.sin(rad) - s / 2,
          transform:`rotate(${(a % 7) - 3}deg)`, filter:'drop-shadow(0 16px 26px rgba(0,0,0,0.35))' }}><V3Logo name={n} size={s} radius={s * 0.27}/></div>;
      })}
    </div>
  );
}

// Logos scattered around a frame, half off the edges, behind the content.
function V3Scatter({ items, z = 1, dark = false }) {
  return items.map(([n, x, y, s = 52, r = 0]) => (
    <div key={n + x + y} style={{ position:'absolute', left: x, top: y, zIndex: z, transform:`rotate(${r}deg)`,
      filter: dark ? 'drop-shadow(0 16px 26px rgba(0,0,0,0.45))' : 'drop-shadow(0 14px 22px rgba(60,48,30,0.22))' }}>
      <V3Logo name={n} size={s} radius={s * 0.27}/>
    </div>
  ));
}

// ═══ The ten iPhone frames, in selling order ═════════════════════
// 1 what it is · 2 it logs itself · 3 it answers you · 4 trust ·
// 5-8 breadth · 9-10 the two audiences (side business, switchers).
const V3S = 1.2, V3Y = 452;

function F_01() {
  return (
    <V2Frame id="ip-01" bg="cream">
      <V3Scatter items={[['Airbnb', -14, 118, 54, -9], ['Uber', 24, 238, 44, 6], ['Chipotle', 596, 104, 54, 8], ['Netflix', 576, 236, 46, -6]]}/>
      <V2Head eyebrow="Voice-first · Privacy-first" title="Speak your" accent="spending." size={84} y={70}
        sub="Say what you spent. Murmur files it, with the merchant and category filled in."/>
      <V3Photo src={V3_PHOTO.voice} x={22} y={372} w={598} h={560} pos="62% 40%" radius={40}/>
      <div style={{ position:'absolute', left: 40, top: 404, zIndex: 6, maxWidth: 300 }}>
        <div style={{ background:'#FFFFFF', borderRadius: 26, borderBottomRightRadius: 8, padding:'15px 18px 14px',
          boxShadow:'0 24px 50px -16px rgba(30,24,14,0.45)' }}>
          <div style={{ display:'flex', alignItems:'center', gap: 8, marginBottom: 6 }}>
            {V2I.waveform(V2.sage, 18)}
            <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 1.1, textTransform:'uppercase', color: V2.sage }}>Listening</span>
          </div>
          <div style={{ fontFamily: V2.FR, fontStyle:'italic', fontSize: 25, lineHeight: 1.18, letterSpacing: -0.4, color: V2.ink }}>“Six fifty at Blue Bottle for a latte”</div>
        </div>
      </div>
      <V3Filed x={34} y={862} w={574}/>
      <V3Murmur x={18} y={1052} r={-2.5} w={360} name="Target" words="“Forty at Target”" amount="$40.00"/>
      <V3Murmur x={268} y={1148} r={2} w={356} name="Lyft" words="“Lyft to the airport”" amount="$31.20"/>
      <V3Murmur x={30} y={1246} r={-1.2} w={370} name="Instacart" words="“Groceries, eighty-two”" amount="$82.00"/>
    </V2Frame>
  );
}
function F_02() {
  return (
    <V2Frame id="ip-02" bg="night">
      <V2Head dark eyebrow="Apple Pay" title="Tap to pay." accent="Logged already."
        sub="Set it up once. Every Apple Pay purchase files itself, with nothing to type or say."/>
      <V3Photo src={V3_PHOTO.pay} x={22} y={372} w={598} h={760} pos="22% 50%" radius="300px 300px 36px 36px">
        <div style={{ position:'absolute', inset: 0, background:'linear-gradient(180deg, rgba(0,0,0,0) 62%, rgba(12,12,10,0.55) 100%)' }}/>
      </V3Photo>
      <svg style={{ position:'absolute', left: 0, top: 0, zIndex: 3 }} width={V2.W} height={V2.H}>
        {[0, 1, 2].map((i) => <circle key={i} cx={417} cy={796} r={26 + i * 20} fill="none" stroke="#FFFFFF" strokeWidth="2" opacity={0.7 - i * 0.22}/>)}
      </svg>
      <V3Notif x={20} y={1076} w={602} r={-1.2} title="Captured from Apple Pay · $31.69" body="The Alder Room · Food & drink · Tap to edit"/>
      <div style={{ position:'absolute', left: 0, right: 0, top: 1226, zIndex: 6, display:'flex', justifyContent:'center' }}>
        <V2Pill dark x={0} y={0} style={{ position:'relative', left: 0, top: 0 }}>{V2I.check(V2.sageL, 15)} In Today, with Undo and Edit right there</V2Pill>
      </div>
    </V2Frame>
  );
}
function F_03() {
  return (
    <V2Frame id="ip-03" bg="sage">
      <V2Head eyebrow="Ask Murmur" title="Ask anything" accent="about your money."
        sub="Can I afford it? Where did it go? Answers come from your own numbers."/>
      <V3Photo src={V3_PHOTO.ask} x={22} y={372} w={598} h={500} pos="38% 40%" radius={40}/>
      <div style={{ position:'absolute', right: 34, top: 400, zIndex: 7, maxWidth: 420, background: V2.ink, color:'#fff',
        padding:'15px 20px', borderRadius: 26, borderBottomRightRadius: 8, fontSize: 20.5, fontWeight: 500, lineHeight: 1.3,
        letterSpacing: -0.3, boxShadow:'0 24px 50px -14px rgba(0,0,0,0.5)' }}>Can I afford a trip to Lisbon in June?</div>
      <V2Card x={30} y={812} w={582} r={-1} pad="20px 22px 18px" radius={30} z={8}>
        <div style={{ display:'flex', gap: 14, alignItems:'flex-start' }}>
          <AskMark size={40} variant="sage"/>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: V2.FR, fontSize: 34, fontWeight: 500, letterSpacing: -1, lineHeight: 1.02 }}>Yes, by <em style={{ color: V2.sage }}>June.</em></div>
            <div style={{ fontSize: 16, color: T.ink3, marginTop: 7, lineHeight: 1.4 }}>You have about <b style={{ color: V2.ink }}>$150</b> left over each month, and the trip is about <b style={{ color: V2.ink }}>$450</b>.</div>
          </div>
        </div>
        <div style={{ marginTop: 16, borderRadius: 18, background:'#FBFAF7', border:`0.5px solid ${T.line}`, padding:'12px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform:'uppercase', color: T.ink3, marginBottom: 4 }}>From your last 3 months</div>
          <AskRow label="Average income" value="$4,120"/>
          <AskRow label="Average spend" value="$3,970"/>
          <AskRow label="Average left over" value="$150" accent last/>
        </div>
        <div style={{ display:'flex', gap: 8, marginTop: 14 }}>
          <AskActionChip label="Create goal" glyph={AskGlyph.pie}/>
          <AskActionChip label="Show transactions" glyph={(c) => Icon.list(c, 13)}/>
        </div>
      </V2Card>
      <div style={{ position:'absolute', left: 30, right: 30, top: 1268, zIndex: 6, display:'flex', flexWrap:'wrap', gap: 10, justifyContent:'center' }}>
        {['Where did my money go?', 'Cut a subscription', 'Am I on budget?'].map((q) => (
          <div key={q} style={{ padding:'11px 16px', borderRadius: 999, background:'#FFFFFF', border:'1px solid rgba(40,36,28,0.08)',
            fontSize: 15.5, fontWeight: 600, color: V2.ink, boxShadow:'0 10px 24px -12px rgba(60,48,30,0.3)' }}>{q}</div>
        ))}
      </div>
    </V2Frame>
  );
}
function F_04() {
  return (
    <V2Frame id="ip-04" bg="forest">
      <V2Head dark eyebrow="Privacy" title="No bank linking." accent="Ever." y={96}
        sub="Murmur never asks for your bank login, because it never needs one."/>
      <V2NoBank x={-3} y={516} s={1.16}/>
      <div style={{ position:'absolute', left: 56, right: 56, top: 1000, zIndex: 6, borderRadius: 28, padding:'6px 22px',
        background:'rgba(247,245,240,0.06)', border:'1px solid rgba(247,245,240,0.12)' }}>
        {[[V2I.mic, 'Speech is turned into text on your iPhone'], [V2I.shield, 'No analytics, no ad tracking'], [V2I.trash, 'Delete everything, any time']].map(([g, l], i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap: 14, padding:'16px 0', borderTop: i ? '1px solid rgba(247,245,240,0.10)' : 'none' }}>
            <div style={{ width: 36, height: 36, borderRadius: 18, background:'rgba(169,194,159,0.16)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink: 0 }}>{g(V2.sageL, 17)}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: V2.cream, letterSpacing: -0.2 }}>{l}</div>
          </div>
        ))}
      </div>
    </V2Frame>
  );
}
function F_05() {
  return (
    <V2Frame id="ip-05" bg="clay">
      <V2Head eyebrow="Widgets · Apple Watch · Siri" title="Log it from" accent="anywhere."
        sub="Your Home Screen, your wrist, or just ask Siri. One sentence, filed."/>
      <V2Phone x={v2x(V3S) - 46} y={V3Y} s={V3S}><S_V2Home/></V2Phone>
      <V2Watch x={400} y={1000} s={1.04} r={-6}/>
      <V2Pill dark x={232} y={398} r={2}>{V2I.mic(V2.sageL, 16)}<span style={{ fontFamily: V2.FR, fontStyle:'italic', fontWeight: 400, fontSize: 19 }}>“Hey Siri, log an expense in Murmur”</span></V2Pill>
    </V2Frame>
  );
}
function F_06() {
  return (
    <V2Frame id="ip-06" bg="forest">
      <V2Head dark eyebrow="Insights" title="See where it" accent="goes." sub="Categories, trends and a month-end forecast, without a spreadsheet."/>
      <V2Phone dark x={v2x(V3S)} y={V3Y} s={V3S}><S_V3Insights/></V2Phone>
      <V2Card x={330} y={1040} w={282} r={2} pad="16px 18px" radius={24}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 1.2, textTransform:'uppercase', color: V2.sage }}>At this pace</div>
        <div style={{ marginTop: 4, fontFamily: T.fSerif, fontSize: 42, fontWeight: 500, letterSpacing: -1, color: V2.ink }}>~$2,240</div>
        <div style={{ fontSize: 14.5, color: T.ink3, marginTop: 2 }}>by the end of April</div>
      </V2Card>
    </V2Frame>
  );
}
function F_07() {
  return (
    <V2Frame id="ip-07" bg="cream">
      <V2Head eyebrow="Budgets & goals" title="A budget that" accent="doesn’t nag." sub="One quiet ring. What you don’t spend can roll over, and goals fill up."/>
      <V2Phone x={v2x(V3S)} y={V3Y} s={V3S}><S_V3Budgets/></V2Phone>
      <V2Goal x={300} y={1080} w={320} r={2}/>
    </V2Frame>
  );
}
function F_08() {
  return (
    <V2Frame id="ip-08" bg="night">
      <V3Scatter dark items={[['Netflix', -16, 520, 66, -8], ['Spotify', 12, 760, 54, 7], ['Amazon', -10, 990, 60, -5], ['Apple', 584, 560, 62, 8], ['Uber', 598, 800, 52, -7], ['Airbnb', 580, 1040, 58, 6]]}/>
      <V2Head dark eyebrow="Recurring" title="Every subscription," accent="spotted." size={58} sub="Repeat charges surface on their own, and Murmur tells you before they land."/>
      <V2Phone dark x={v2x(V3S)} y={V3Y} s={V3S}><S_V3Recurring/></V2Phone>
      <V3Notif x={20} y={1196} w={602} r={-1.2} title="2 bills this week, $24.99" body="First up: Spotify, $10.99." time="9:00 AM"/>
    </V2Frame>
  );
}
function F_09() {
  return (
    <V2Frame id="ip-09" bg="clay">
      <V2Head eyebrow="Businesses" title="Side business?" accent="Kept apart."
        sub="Give each one its logo. Say “for the farm” and it files itself there."/>
      <V2Phone x={v2x(V3S)} y={V3Y} s={V3S}><S_V3Biz/></V2Phone>
      <V2Card x={24} y={1104} w={594} r={-1.2} pad="16px 18px" radius={26}>
        <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 20, background: T.accentSoft, display:'flex', alignItems:'center', justifyContent:'center', flexShrink: 0 }}>{V2I.mic(V2.sage, 18)}</div>
          <div style={{ flex: 1, fontFamily: V2.FR, fontStyle:'italic', fontSize: 22, letterSpacing: -0.3, color: V2.ink }}>“Forty-two at Tractor Supply for the farm”</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap: 8, marginTop: 12, paddingTop: 12, borderTop:'1px solid rgba(40,36,28,0.08)' }}>
          {[['Personal'], ['Farm', true], ['Booth', true]].map(([p, mark]) => {
            const on = p === 'Farm';
            return <span key={p} style={{ display:'inline-flex', alignItems:'center', gap: 6, padding: mark ? '5px 12px 5px 5px' : '7px 12px', borderRadius: 999, fontSize: 14, fontWeight: on ? 700 : 500,
              background: on ? T.accentSoft : '#fff', color: on ? T.accent : T.ink3, border:`1px solid ${on ? T.accent : 'rgba(40,36,28,0.12)'}` }}>{mark && <V3BizMark name={p} size={22}/>}{p}</span>;
          })}
          <span style={{ flex: 1 }}/>
          <Money value={42} size={26}/>
        </div>
      </V2Card>
    </V2Frame>
  );
}
function F_10() {
  return (
    <V2Frame id="ip-10" bg="forest">
      <V2Head dark eyebrow="Import" title="Bring your history." accent="Cleaned up." size={58}
        sub="Import a CSV from your bank or your old app. Card codes become real names and logos."/>
      <V2Phone dark x={v2x(V3S)} y={604} s={V3S}><S_V2Imported/></V2Phone>
      <V2Statement x={40} y={468}/>
    </V2Frame>
  );
}

// ═══ iPad (frames 1-5 of the same order, recomposed) ═════════════
const PW3 = 1032, PH3 = 1376, pcx3 = (s) => (PW3 - 428 * s) / 2;
function P_01() {
  return (
    <V2Frame id="pad-01" bg="cream" w={PW3} h={PH3}>
      <V3Scatter items={[['Airbnb', 40, 120, 64, -9], ['Uber', 120, 260, 52, 6], ['Chipotle', 920, 110, 64, 8], ['Netflix', 846, 262, 54, -6]]}/>
      <V2Head eyebrow="Voice-first · Privacy-first" title="Speak your" accent="spending." size={104} y={70} subW={640}
        sub="Say what you spent. Murmur files it, with the merchant and category filled in."/>
      <V3Photo src={V3_PHOTO.voice} x={60} y={420} w={912} h={560} pos="60% 40%" radius={44}/>
      <div style={{ position:'absolute', left: 96, top: 462, zIndex: 6, maxWidth: 360 }}>
        <div style={{ background:'#FFFFFF', borderRadius: 28, borderBottomRightRadius: 8, padding:'17px 20px 16px', boxShadow:'0 24px 50px -16px rgba(30,24,14,0.45)' }}>
          <div style={{ display:'flex', alignItems:'center', gap: 8, marginBottom: 6 }}>{V2I.waveform(V2.sage, 20)}
            <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: 1.1, textTransform:'uppercase', color: V2.sage }}>Listening</span></div>
          <div style={{ fontFamily: V2.FR, fontStyle:'italic', fontSize: 30, lineHeight: 1.16, letterSpacing: -0.5, color: V2.ink }}>“Six fifty at Blue Bottle for a latte”</div>
        </div>
      </div>
      <V3Filed x={228} y={918} w={576}/>
      <V3Murmur x={40} y={1110} r={-2.5} w={340} name="Target" words="“Forty at Target”" amount="$40.00"/>
      <V3Murmur x={346} y={1196} r={1.5} w={340} name="Lyft" words="“Lyft to the airport”" amount="$31.20"/>
      <V3Murmur x={652} y={1110} r={2.5} w={340} name="Instacart" words="“Groceries, eighty-two”" amount="$82.00"/>
    </V2Frame>
  );
}
function P_02() {
  return (
    <V2Frame id="pad-02" bg="night" w={PW3} h={PH3}>
      <V2Head dark eyebrow="Apple Pay" title="Tap to pay." accent="Logged already." size={96} y={70} subW={640}
        sub="Set it up once. Every Apple Pay purchase files itself, with nothing to type or say."/>
      <V3Photo src={V3_PHOTO.pay} x={60} y={420} w={912} h={720} pos="30% 50%" radius="360px 360px 40px 40px">
        <div style={{ position:'absolute', inset: 0, background:'linear-gradient(180deg, rgba(0,0,0,0) 62%, rgba(12,12,10,0.55) 100%)' }}/>
      </V3Photo>
      <V3Notif x={186} y={1070} w={660} r={-1} title="Captured from Apple Pay · $31.69" body="The Alder Room · Food & drink · Tap to edit"/>
    </V2Frame>
  );
}
function P_03() {
  return (
    <V2Frame id="pad-03" bg="sage" w={PW3} h={PH3}>
      <V2Head eyebrow="Ask Murmur" title="Ask anything" accent="about your money." size={92} y={70} subW={640}
        sub="Can I afford it? Where did it go? Answers come from your own numbers."/>
      <V3Photo src={V3_PHOTO.ask} x={60} y={420} w={912} h={560} pos="40% 40%" radius={44}/>
      <div style={{ position:'absolute', right: 96, top: 456, zIndex: 7, maxWidth: 460, background: V2.ink, color:'#fff',
        padding:'17px 22px', borderRadius: 28, borderBottomRightRadius: 8, fontSize: 23, fontWeight: 500, lineHeight: 1.3,
        letterSpacing: -0.3, boxShadow:'0 24px 50px -14px rgba(0,0,0,0.5)' }}>Can I afford a trip to Lisbon in June?</div>
      <V2Card x={196} y={900} w={640} r={-1} pad="22px 24px 20px" radius={30} z={8}>
        <div style={{ display:'flex', gap: 14, alignItems:'flex-start' }}>
          <AskMark size={44} variant="sage"/>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: V2.FR, fontSize: 38, fontWeight: 500, letterSpacing: -1, lineHeight: 1.02 }}>Yes, by <em style={{ color: V2.sage }}>June.</em></div>
            <div style={{ fontSize: 17, color: T.ink3, marginTop: 8, lineHeight: 1.4 }}>You have about <b style={{ color: V2.ink }}>$150</b> left over each month, and the trip is about <b style={{ color: V2.ink }}>$450</b>.</div>
          </div>
        </div>
        <div style={{ marginTop: 16, borderRadius: 18, background:'#FBFAF7', border:`0.5px solid ${T.line}`, padding:'12px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform:'uppercase', color: T.ink3, marginBottom: 4 }}>From your last 3 months</div>
          <AskRow label="Average income" value="$4,120"/>
          <AskRow label="Average spend" value="$3,970"/>
          <AskRow label="Average left over" value="$150" accent last/>
        </div>
      </V2Card>
    </V2Frame>
  );
}
function P_04() {
  return (
    <V2Frame id="pad-04" bg="forest" w={PW3} h={PH3}>
      <V2Head dark eyebrow="Privacy" title="No bank linking." accent="Ever." size={100} y={84} subW={640}
        sub="Murmur never asks for your bank login, because it never needs one."/>
      <V2NoBank x={(PW3 - 566 * 1.5) / 2} y={520} s={1.5}/>
      <div style={{ position:'absolute', left: 196, right: 196, top: 1060, zIndex: 6, borderRadius: 30, padding:'6px 26px',
        background:'rgba(247,245,240,0.06)', border:'1px solid rgba(247,245,240,0.12)' }}>
        {[[V2I.mic, 'Speech is turned into text on your iPhone'], [V2I.shield, 'No analytics, no ad tracking'], [V2I.trash, 'Delete everything, any time']].map(([g, l], i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap: 16, padding:'17px 0', borderTop: i ? '1px solid rgba(247,245,240,0.10)' : 'none' }}>
            <div style={{ width: 40, height: 40, borderRadius: 20, background:'rgba(169,194,159,0.16)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink: 0 }}>{g(V2.sageL, 19)}</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: V2.cream, letterSpacing: -0.2 }}>{l}</div>
          </div>
        ))}
      </div>
    </V2Frame>
  );
}
function P_05() {
  return (
    <V2Frame id="pad-05" bg="clay" w={PW3} h={PH3}>
      <V2Head eyebrow="Widgets · Apple Watch · Siri" title="Log it from" accent="anywhere." size={96} y={78} subW={640}
        sub="Your Home Screen, your wrist, or just ask Siri. One sentence, filed."/>
      <V2Phone x={150} y={470} s={1.06}><S_V2Home/></V2Phone>
      <V2Watch x={636} y={760} s={1.5} r={-5}/>
      <V2Pill dark x={560} y={500} r={2}>{V2I.mic(V2.sageL, 16)}<span style={{ fontFamily: V2.FR, fontStyle:'italic', fontWeight: 400, fontSize: 21 }}>“Hey Siri, log an expense in Murmur”</span></V2Pill>
    </V2Frame>
  );
}

const V3_FRAMES = {
  'ip-01': F_01, 'ip-02': F_02, 'ip-03': F_03, 'ip-04': F_04, 'ip-05': F_05,
  'ip-06': F_06, 'ip-07': F_07, 'ip-08': F_08, 'ip-09': F_09, 'ip-10': F_10,
  'pad-01': P_01, 'pad-02': P_02, 'pad-03': P_03, 'pad-04': P_04, 'pad-05': P_05,
};
// index.html#ip-03 renders that frame alone at the top-left, which is what
// the render script captures. Without a hash: every frame, wrapped.
function V2Page() {
  const [only, setOnly] = React.useState(location.hash.slice(1));
  React.useEffect(() => {
    const onHash = () => setOnly(location.hash.slice(1));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const One = V3_FRAMES[only];
  if (One) return <div style={{ position:'absolute', left: 0, top: 0 }}><One/></div>;
  return (
    <div style={{ padding: 40, display:'flex', flexWrap:'wrap', gap: 40, alignItems:'flex-start', maxWidth: 3600 }}>
      {Object.entries(V3_FRAMES).map(([id, F]) => <F key={id}/>)}
    </div>
  );
}
Object.assign(window, { V2Page, V3Logo, V3BizMark });
