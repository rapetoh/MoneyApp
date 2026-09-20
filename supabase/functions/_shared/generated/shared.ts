// GENERATED FILE - DO NOT EDIT.
//
// Source:    packages/shared/src/index.ts (the real @voice-expense/shared)
// Generator: scripts/build-shared-deno.mjs
// Regenerate: npm run build:shared-deno
//
// Edge Functions import this instead of hand-ported copies, so the server
// runs byte-identical domain logic to the iOS and web apps. Editing this
// file by hand is always wrong: the next regeneration silently discards
// the edit. Change packages/shared and regenerate.
//
// deno-lint-ignore-file
// @ts-nocheck
// packages/shared/src/types/database.types.ts
var Constants = {
  public: {
    Enums: {}
  }
};

// packages/shared/src/utils/currency.ts
function roundCents(amount) {
  const sign = amount < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(amount) * 100) / 100;
}
function formatMoneyParts(value, currencyCode, locale) {
  const nf = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  if (typeof nf.formatToParts !== "function") {
    return formatMoneyPartsFallback(nf, value, currencyCode);
  }
  const parts = nf.formatToParts(Math.abs(value));
  let symbol = "";
  let integer = "";
  let decimal = "";
  let fraction = "";
  let symbolSeenBeforeDigits = false;
  let sawDigit = false;
  for (const part of parts) {
    if (part.type === "currency") {
      symbol += part.value;
      if (!sawDigit) symbolSeenBeforeDigits = true;
    } else if (part.type === "integer" || part.type === "group") {
      integer += part.value;
      sawDigit = true;
    } else if (part.type === "decimal") {
      decimal = part.value;
    } else if (part.type === "fraction") {
      fraction = part.value;
    }
  }
  return {
    sign: value < 0 ? "-" : "",
    symbol,
    symbolFirst: symbolSeenBeforeDigits,
    integer,
    decimal,
    fraction
  };
}
function formatMoneyPartsFallback(nf, value, currencyCode) {
  const abs = Math.abs(value);
  const formatted = nf.format(abs);
  const digitRun = formatted.match(/\d[\d\s.,  ']*\d|\d/u);
  const numeric = digitRun ? digitRun[0] : String(abs.toFixed(2));
  const affixBefore = digitRun ? formatted.slice(0, digitRun.index).trim() : "";
  const symbol = affixBefore || formatted.slice((digitRun?.index ?? 0) + numeric.length).trim() || currencySymbolFor(currencyCode);
  const sepMatch = numeric.match(/([^\d])(\d+)$/u);
  const hasFraction = sepMatch != null && sepMatch[2].length === 2;
  return {
    sign: value < 0 ? "-" : "",
    symbol,
    symbolFirst: affixBefore.length > 0,
    integer: hasFraction ? numeric.slice(0, numeric.length - 3) : numeric,
    decimal: hasFraction ? sepMatch[1] : "",
    fraction: hasFraction ? sepMatch[2] : ""
  };
}
function formatMoney(value, currencyCode, locale, options) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: options?.precision === "compact" ? 0 : 2,
    maximumFractionDigits: options?.precision === "compact" ? 1 : 2,
    notation: options?.precision === "compact" ? "compact" : "standard"
  }).format(value);
}
function formatCurrency(amount, currencyCode, locale = "en") {
  return formatMoney(amount, currencyCode, locale);
}
function currencySymbolFor(code) {
  switch (code) {
    case "USD":
    case "CAD":
    case "AUD":
      return "$";
    case "EUR":
      return "\u20AC";
    case "GBP":
      return "\xA3";
    case "JPY":
      return "\xA5";
    case "CHF":
      return "CHF ";
    case "NGN":
      return "\u20A6";
    case "GHS":
      return "\u20B5";
    case "XAF":
      return "CFA ";
    default:
      return code + " ";
  }
}
var ADJUST_DELTA_MAGNITUDES = {
  JPY: [-100, 100, 500, 1e3],
  XAF: [-500, 500, 2500, 5e3],
  NGN: [-500, 500, 2500, 5e3],
  GHS: [-5, 5, 25, 50]
};
var DEFAULT_ADJUST_DELTAS = [-1, 1, 5, 10];
function amountAdjustDeltasFor(currencyCode) {
  return ADJUST_DELTA_MAGNITUDES[currencyCode] ?? DEFAULT_ADJUST_DELTAS;
}

// packages/shared/src/utils/period.ts
var MS_PER_DAY = 864e5;
var WEEK_START = 1;
function pad2(n) {
  return String(n).padStart(2, "0");
}
function pad4(n) {
  return String(n).padStart(4, "0");
}
function toIso(epochMs) {
  return new Date(epochMs).toISOString();
}
function normalizeHour(h) {
  return h === 24 ? 0 : h;
}
var PARTS_FORMATTER_CACHE = /* @__PURE__ */ new Map();
function partsFormatter(tz) {
  let dtf = PARTS_FORMATTER_CACHE.get(tz);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    PARTS_FORMATTER_CACHE.set(tz, dtf);
  }
  return dtf;
}
function civilFieldsAt(epochMs, tz) {
  const dtf = partsFormatter(tz);
  if (typeof dtf.formatToParts === "function") {
    const parts = dtf.formatToParts(new Date(epochMs));
    const out = {};
    for (const p of parts) {
      if (p.type !== "literal") out[p.type] = Number(p.value);
    }
    return out;
  }
  const m = dtf.format(new Date(epochMs)).match(/(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2}):(\d{2})/u);
  if (!m) throw new Error(`period.ts: unparseable DateTimeFormat output for tz "${tz}"`);
  return { month: +m[1], day: +m[2], year: +m[3], hour: +m[4], minute: +m[5], second: +m[6] };
}
function tzOffsetMsAt(epochMs, tz) {
  const fields = civilFieldsAt(epochMs, tz);
  const get = (type) => {
    const found = fields[type];
    if (found === void 0 || Number.isNaN(found)) throw new Error(`period.ts: Intl did not return a "${type}" part for tz "${tz}"`);
    return found;
  };
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    normalizeHour(get("hour")),
    get("minute"),
    get("second")
  );
  return asIfUtc - epochMs;
}
function zonedTimeToUtcMs(y, month0, d, h, min, s, ms, tz) {
  const guess = Date.UTC(y, month0, d, h, min, s, ms);
  const offset = tzOffsetMsAt(guess, tz);
  return guess - tzOffsetMsAt(guess - offset, tz);
}
function civilDayNumber(y, month0, d) {
  return Math.floor(Date.UTC(y, month0, d) / MS_PER_DAY);
}
function civilFromDayNumber(dayNumber) {
  const dt = new Date(dayNumber * MS_PER_DAY);
  return { y: dt.getUTCFullYear(), month0: dt.getUTCMonth(), d: dt.getUTCDate() };
}
function civilWeekdayMonday0(y, month0, d) {
  const sundayIndexed = new Date(Date.UTC(y, month0, d)).getUTCDay();
  return (sundayIndexed + 6) % 7;
}
function parseMonthIso(monthIsoStr) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthIsoStr);
  if (!match) throw new Error(`period.ts: "${monthIsoStr}" is not a "YYYY-MM" month`);
  return { y: Number(match[1]), month0: Number(match[2]) - 1 };
}
function parseLocalDay(dayIsoStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayIsoStr);
  if (!match) throw new Error(`period.ts: "${dayIsoStr}" is not a "YYYY-MM-DD" day`);
  return { y: Number(match[1]), month0: Number(match[2]) - 1, d: Number(match[3]) };
}
function civilDayBounds(dayIsoStr, tz, lengthDays) {
  const { y, month0, d } = parseLocalDay(dayIsoStr);
  const startDayNum = civilDayNumber(y, month0, d);
  const start = zonedTimeToUtcMs(y, month0, d, 0, 0, 0, 0, tz);
  const end = civilFromDayNumber(startDayNum + lengthDays);
  const endExclusive = zonedTimeToUtcMs(end.y, end.month0, end.d, 0, 0, 0, 0, tz);
  return { start: toIso(start), endExclusive: toIso(endExclusive) };
}
function localParts(instantIso, tz) {
  const epochMs = Date.parse(instantIso);
  if (Number.isNaN(epochMs)) {
    throw new Error(`period.ts: "${instantIso}" is not a parseable ISO instant`);
  }
  const fields = civilFieldsAt(epochMs, tz);
  const get = (type) => Number(fields[type]);
  const y = get("year");
  const m = get("month");
  const d = get("day");
  return {
    y,
    m,
    d,
    weekdayIndex: civilWeekdayMonday0(y, m - 1, d),
    hour: normalizeHour(get("hour")),
    minute: get("minute"),
    second: get("second")
  };
}
function localDay(instantIso, tz) {
  const { y, m, d } = localParts(instantIso, tz);
  return `${pad4(y)}-${pad2(m)}-${pad2(d)}`;
}
function monthIso(instantIso, tz) {
  const { y, m } = localParts(instantIso, tz);
  return `${pad4(y)}-${pad2(m)}`;
}
function currentMonthIso(tz) {
  return monthIso((/* @__PURE__ */ new Date()).toISOString(), tz);
}
function monthBounds(monthIsoStr, tz) {
  const { y, month0 } = parseMonthIso(monthIsoStr);
  const start = zonedTimeToUtcMs(y, month0, 1, 0, 0, 0, 0, tz);
  const endExclusive = zonedTimeToUtcMs(y, month0 + 1, 1, 0, 0, 0, 0, tz);
  return { start: toIso(start), endExclusive: toIso(endExclusive) };
}
function weekStart(instantIso, tz) {
  const parts = localParts(instantIso, tz);
  const dayNum = civilDayNumber(parts.y, parts.m - 1, parts.d);
  const monday = civilFromDayNumber(dayNum - parts.weekdayIndex);
  return `${pad4(monday.y)}-${pad2(monday.month0 + 1)}-${pad2(monday.d)}`;
}
function weekBounds(instantIso, tz) {
  return civilDayBounds(weekStart(instantIso, tz), tz, 7);
}
function quarterBounds(instantIso, tz) {
  const parts = localParts(instantIso, tz);
  const quarterStartMonth0 = Math.floor((parts.m - 1) / 3) * 3;
  const start = zonedTimeToUtcMs(parts.y, quarterStartMonth0, 1, 0, 0, 0, 0, tz);
  const endExclusive = zonedTimeToUtcMs(parts.y, quarterStartMonth0 + 3, 1, 0, 0, 0, 0, tz);
  return { start: toIso(start), endExclusive: toIso(endExclusive) };
}
function yearBounds(instantIso, tz) {
  const parts = localParts(instantIso, tz);
  const start = zonedTimeToUtcMs(parts.y, 0, 1, 0, 0, 0, 0, tz);
  const endExclusive = zonedTimeToUtcMs(parts.y + 1, 0, 1, 0, 0, 0, 0, tz);
  return { start: toIso(start), endExclusive: toIso(endExclusive) };
}
function cyclicDayBounds(atInstantIso, tz, anchorIso, periodDays) {
  const at = localParts(atInstantIso, tz);
  const anchor = localParts(anchorIso, tz);
  const atDayNum = civilDayNumber(at.y, at.m - 1, at.d);
  const anchorDayNum = civilDayNumber(anchor.y, anchor.m - 1, anchor.d);
  const cycleIndex = Math.floor((atDayNum - anchorDayNum) / periodDays);
  const cycleStartDayNum = anchorDayNum + cycleIndex * periodDays;
  const startCivil = civilFromDayNumber(cycleStartDayNum);
  const endCivil = civilFromDayNumber(cycleStartDayNum + periodDays);
  const start = zonedTimeToUtcMs(startCivil.y, startCivil.month0, startCivil.d, 0, 0, 0, 0, tz);
  const endExclusive = zonedTimeToUtcMs(endCivil.y, endCivil.month0, endCivil.d, 0, 0, 0, 0, tz);
  return { start: toIso(start), endExclusive: toIso(endExclusive) };
}
function periodBounds(period, atInstantIso, tz, anchor) {
  switch (period) {
    case "weekly":
      return weekBounds(atInstantIso, tz);
    case "biweekly":
      if (!anchor) {
        throw new Error(
          `period.ts: periodBounds('biweekly', ...) requires an anchor instant (e.g. the budget's starts_at) to fix the 14-day cycle's phase \u2014 a floating "last 14 days" window is not a stable definition of a fortnight.`
        );
      }
      return cyclicDayBounds(atInstantIso, tz, anchor, 14);
    case "monthly":
      return monthBounds(monthIso(atInstantIso, tz), tz);
    case "quarterly":
      return quarterBounds(atInstantIso, tz);
    case "yearly":
      return yearBounds(atInstantIso, tz);
    default: {
      const exhaustive = period;
      throw new Error(`period.ts: periodBounds received an unknown period "${String(exhaustive)}"`);
    }
  }
}
function addMonthsClamped(y, m, d, deltaMonths) {
  const target0 = m - 1 + deltaMonths;
  const targetY = y + Math.floor(target0 / 12);
  const targetMonth0 = (target0 % 12 + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(targetY, targetMonth0 + 1, 0)).getUTCDate();
  return { y: targetY, m: targetMonth0 + 1, d: Math.min(d, daysInTargetMonth) };
}
function addDays(y, m, d, deltaDays) {
  const { y: ry, month0, d: rd } = civilFromDayNumber(civilDayNumber(y, m - 1, d) + deltaDays);
  return { y: ry, m: month0 + 1, d: rd };
}
function daysBetween(y1, m1, d1, y2, m2, d2) {
  return civilDayNumber(y2, m2 - 1, d2) - civilDayNumber(y1, m1 - 1, d1);
}
function civilDateTimeToInstant(y, m, d, h, minute, s, tz) {
  return toIso(zonedTimeToUtcMs(y, m - 1, d, h, minute, s, 0, tz));
}
function weekdayLabels(locale, style = "narrow") {
  const dtf = new Intl.DateTimeFormat(locale, { weekday: style, timeZone: "UTC" });
  const mondayFirst = Array.from(
    { length: 7 },
    (_, i) => dtf.format(new Date(Date.UTC(2023, 0, 2 + i)))
  );
  const rotate = (WEEK_START - 1 + 7) % 7;
  return [...mondayFirst.slice(rotate), ...mondayFirst.slice(0, rotate)];
}
function normalizeParsedTransactedAt(iso, tz, nowIso) {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00(?::00(?:\.0+)?)?(?:Z|\+00:00)?)?$/);
  if (!m) return iso;
  const civil = `${m[1]}-${m[2]}-${m[3]}`;
  if (civil === localDay(nowIso, tz)) return null;
  return civilDateTimeToInstant(Number(m[1]), Number(m[2]), Number(m[3]), 12, 0, 0, tz);
}

// packages/shared/src/utils/fx.ts
function aggAmount(t2) {
  return t2.amount_in_profile_currency ?? 0;
}
function isFxPending(t2) {
  return t2.amount_in_profile_currency == null;
}
function sumInProfileCurrency(txns) {
  let cents = 0;
  let pendingCount = 0;
  for (const t2 of txns) {
    if (isFxPending(t2)) {
      pendingCount++;
      continue;
    }
    cents += Math.round(t2.amount_in_profile_currency * 100);
  }
  return { total: cents / 100, pendingCount };
}
var RATE_CACHE = /* @__PURE__ */ new Map();
function cacheKey(date, from, to) {
  return `${date}|${from}|${to}`;
}
async function fetchFxRate(isoDateOrTimestamp, from, to, tz) {
  const date = tz ? localDay(isoDateOrTimestamp, tz) : isoDateOrTimestamp.slice(0, 10);
  if (from === to) return { rate: 1, date };
  const key = cacheKey(date, from, to);
  const cached = RATE_CACHE.get(key);
  if (cached != null) return { rate: cached, date };
  const url = `https://api.frankfurter.app/${date}?from=${encodeURIComponent(
    from
  )}&to=${encodeURIComponent(to)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`FX lookup failed: HTTP ${res.status} for ${from}->${to} on ${date}`);
  }
  const body = await res.json();
  const rate = body?.rates?.[to];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`FX lookup returned no rate for ${from}->${to} on ${date}`);
  }
  RATE_CACHE.set(key, rate);
  return { rate, date };
}
async function snapshotFx(isoDateOrTimestamp, fromCurrency, toCurrency, amount, tz) {
  try {
    const { rate, date } = await fetchFxRate(isoDateOrTimestamp, fromCurrency, toCurrency, tz);
    return {
      // Keep two decimals on the converted amount — matches the
      // numeric(14, 2) column type and avoids `0.1 + 0.2` noise when
      // the converted figure is later summed.
      amount_in_profile_currency: Math.round(amount * rate * 100) / 100,
      fx_rate_to_profile: rate,
      fx_rate_date: date
    };
  } catch (err) {
    if (typeof console !== "undefined") console.warn("[fx] snapshot failed:", err);
    return null;
  }
}

// packages/shared/src/utils/validation.ts
var MAX_AMOUNT = 999999999999e-2;
function validateAmount(raw, _currency) {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, reason: "empty" };
  const normalized = trimmed.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return { ok: false, reason: "not_a_number" };
  const decimals = normalized.split(".")[1];
  if (decimals && decimals.length > 2) return { ok: false, reason: "too_many_decimals" };
  const amount = parseFloat(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: "not_positive" };
  if (amount > MAX_AMOUNT) return { ok: false, reason: "too_large" };
  return { ok: true, amount };
}

// packages/shared/src/utils/setup.ts
var LOCALE_LABELS = {
  en: "English",
  fr: "Fran\xE7ais",
  es: "Espa\xF1ol",
  pt: "Portugu\xEAs"
};
var SUPPORTED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "CHF",
  "JPY",
  "BRL",
  "MXN",
  "INR",
  "ZAR",
  "XOF",
  "XAF",
  "NGN",
  "GHS"
];
function resolveCurrency(deviceCurrency) {
  const code = (deviceCurrency ?? "").toUpperCase();
  return SUPPORTED_CURRENCIES.includes(code) ? code : "USD";
}
var DEFAULT_REGION = {
  en: "US",
  fr: "FR",
  es: "ES",
  pt: "BR"
};
var RECOGNIZER_REGIONS = {
  en: ["US", "GB", "CA", "AU", "IE", "IN", "NZ", "SG", "ZA", "PH"],
  fr: ["FR", "CA", "BE", "CH"],
  es: ["ES", "MX", "US", "AR", "CL", "CO", "PE"],
  pt: ["BR", "PT"]
};
function voiceLanguageFor(locale, deviceRegion) {
  const region = (deviceRegion ?? "").toUpperCase();
  const ok = RECOGNIZER_REGIONS[locale].includes(region);
  return `${locale}-${ok ? region : DEFAULT_REGION[locale]}`;
}
function effectiveVoiceLanguage(stored, locale, deviceRegion) {
  const lang = (stored ?? "").split("-")[0]?.toLowerCase();
  if (stored && lang === locale) return stored;
  return voiceLanguageFor(locale, deviceRegion);
}

// packages/shared/src/utils/color.ts
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}
function rgbToHex(r, g, b) {
  const c = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    default:
      h = (rn - gn) / d + 4;
  }
  return [h * 60, s * 100, l * 100];
}
function hslToRgb(h, s, l) {
  const hn = h / 360;
  const sn = s / 100;
  const ln = l / 100;
  if (sn === 0) return [ln * 255, ln * 255, ln * 255];
  const hue2rgb = (p2, q2, t2) => {
    let tt = t2;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p2 + (q2 - p2) * 6 * tt;
    if (tt < 1 / 2) return q2;
    if (tt < 2 / 3) return p2 + (q2 - p2) * (2 / 3 - tt) * 6;
    return p2;
  };
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  return [255 * hue2rgb(p, q, hn + 1 / 3), 255 * hue2rgb(p, q, hn), 255 * hue2rgb(p, q, hn - 1 / 3)];
}
function hslToHex(h, s, l) {
  return rgbToHex(...hslToRgb(h, s, l));
}
function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const f = (c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrastRatio(hexA, hexB) {
  const lA = relativeLuminance(hexA) + 0.05;
  const lB = relativeLuminance(hexB) + 0.05;
  return lA > lB ? lA / lB : lB / lA;
}
var AVATAR_COLORS = [
  "#8C4A2A",
  // peach-deep
  "#3F5A3E",
  // sage
  "#5A4E7A",
  // lavender-deep
  "#8A6F1F",
  // butter-deep
  "#8E424C",
  // rose-deep
  "#5A5F34",
  // olive-deep
  "#4A6B74",
  // dusty teal
  "#6B4E3D"
  // warm taupe
];
function merchantColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
var KNOWN_DOMAINS = {
  netflix: "netflix.com",
  spotify: "spotify.com",
  amazon: "amazon.com",
  walmart: "walmart.com",
  target: "target.com",
  costco: "costco.com",
  starbucks: "starbucks.com",
  mcdonalds: "mcdonalds.com",
  uber: "uber.com",
  ubereats: "ubereats.com",
  lyft: "lyft.com",
  apple: "apple.com",
  google: "google.com",
  microsoft: "microsoft.com",
  adobe: "adobe.com",
  hulu: "hulu.com",
  disneyplus: "disneyplus.com",
  disney: "disney.com",
  hbomax: "hbomax.com",
  youtube: "youtube.com",
  paypal: "paypal.com",
  venmo: "venmo.com",
  cashapp: "cash.app",
  bestbuy: "bestbuy.com",
  homedepot: "homedepot.com",
  lowes: "lowes.com",
  ikea: "ikea.com",
  nike: "nike.com",
  adidas: "adidas.com",
  zara: "zara.com",
  sephora: "sephora.com",
  wholefoods: "wholefoods.com",
  traderjoes: "traderjoes.com",
  kroger: "kroger.com",
  walgreens: "walgreens.com",
  cvs: "cvs.com",
  tmobile: "t-mobile.com",
  verizon: "verizon.com",
  att: "att.com",
  comcast: "comcast.com",
  chipotle: "chipotle.com",
  doordash: "doordash.com",
  grubhub: "grubhub.com",
  airbnb: "airbnb.com",
  booking: "booking.com",
  expedia: "expedia.com",
  playstation: "playstation.com",
  xbox: "xbox.com",
  steam: "steampowered.com",
  github: "github.com",
  notion: "notion.so",
  slack: "slack.com",
  zoom: "zoom.us",
  dropbox: "dropbox.com",
  chickfila: "chick-fil-a.com",
  burgerking: "bk.com",
  wendys: "wendys.com",
  dominos: "dominos.com",
  pizzahut: "pizzahut.com",
  subways: "subway.com",
  subway: "subway.com",
  dunkin: "dunkindonuts.com",
  panera: "panerabread.com"
};
function guessDomain(name) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return KNOWN_DOMAINS[normalized] ?? `${normalized}.com`;
}
var CATEGORY_PALETTE_CACHE = /* @__PURE__ */ new Map();
function categoryPalette(hex) {
  const cached = CATEGORY_PALETTE_CACHE.get(hex);
  if (cached) return cached;
  const [h, rawS] = rgbToHsl(...hexToRgb(hex));
  const neutral = rawS < 8;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const bgS = neutral ? clamp(rawS, 6, 14) : clamp(rawS, 22, 38);
  const bg = hslToHex(h, bgS, 90);
  const fgS = neutral ? clamp(rawS, 6, 14) : clamp(rawS, 45, 68);
  let l = 34;
  let fg = hslToHex(h, fgS, l);
  for (let guard = 0; guard < 40 && l > 4; guard++) {
    if (contrastRatio(fg, bg) >= 4.5 && contrastRatio(fg, "#FFFFFF") >= 4.5) break;
    l -= 2;
    fg = hslToHex(h, fgS, l);
  }
  const result = { bg, fg };
  CATEGORY_PALETTE_CACHE.set(hex, result);
  return result;
}

// packages/shared/src/domain/money.ts
var DEFAULT_TRANSFER_CATEGORY_NAMES = /* @__PURE__ */ new Set([
  "Savings & Investing"
]);
var UNCATEGORIZED_CATEGORY_KEY = "__uncategorized__";
function resolveCategoryKind(categoryName, explicitKind) {
  if (explicitKind != null) return explicitKind;
  if (categoryName != null && DEFAULT_TRANSFER_CATEGORY_NAMES.has(categoryName)) {
    return "transfer";
  }
  return null;
}
function classifyFlow(txn, categoryKind) {
  if (categoryKind === "transfer") return "transfer";
  if (categoryKind === "income") return "income";
  return txn.direction === "credit" ? "income" : "expense";
}
function isSpend(txn, categoryKind) {
  return classifyFlow(txn, categoryKind) === "expense";
}
function summarize(txns, window) {
  const inWindow2 = window ? txns.filter((t2) => t2.transacted_at >= window.start && t2.transacted_at < window.endExclusive) : txns;
  let incomeCents = 0;
  let expenseCents = 0;
  let transferCents = 0;
  let pendingCount = 0;
  const byCategoryCents = /* @__PURE__ */ new Map();
  for (const t2 of inWindow2) {
    if (isFxPending(t2)) {
      pendingCount++;
      continue;
    }
    const cents = Math.round(t2.amount_in_profile_currency * 100);
    const categoryKind = resolveCategoryKind(t2.category_name, t2.category_kind);
    const flow = classifyFlow(t2, categoryKind);
    if (flow === "income") {
      incomeCents += cents;
    } else if (flow === "transfer") {
      transferCents += t2.direction === "debit" ? cents : -cents;
    } else {
      expenseCents += cents;
      const key = t2.category_id ?? UNCATEGORIZED_CATEGORY_KEY;
      const bucket = byCategoryCents.get(key) ?? {
        categoryId: key,
        categoryName: t2.category_name ?? null,
        cents: 0,
        count: 0
      };
      bucket.cents += cents;
      bucket.count += 1;
      byCategoryCents.set(key, bucket);
    }
  }
  const income = roundCents(incomeCents / 100);
  const expense = roundCents(expenseCents / 100);
  const transfers = roundCents(transferCents / 100);
  const savedAndNet = roundCents((incomeCents - expenseCents) / 100);
  const byCategory = {};
  for (const [key, bucket] of byCategoryCents) {
    byCategory[key] = {
      categoryId: bucket.categoryId,
      categoryName: bucket.categoryName,
      amount: roundCents(bucket.cents / 100),
      transactionCount: bucket.count
    };
  }
  return {
    income,
    expense,
    transfers,
    saved: savedAndNet,
    net: savedAndNet,
    transactionCount: inWindow2.length,
    pendingCount,
    byCategory
  };
}

// packages/shared/src/domain/export.ts
function pad22(n) {
  return String(n).padStart(2, "0");
}
function parseLocalDayStrict(dayIso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayIso);
  if (!match) throw new Error(`export.ts: "${dayIso}" is not a "YYYY-MM-DD" day`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}
function buildExport(input) {
  const tz = input.profile.timezone || "UTC";
  const catNameById = new Map(input.categories.map((c) => [c.id, c.name]));
  const from = parseLocalDayStrict(input.dateFrom);
  const to = parseLocalDayStrict(input.dateTo);
  const startInstant = civilDateTimeToInstant(from.y, from.m, from.d, 0, 0, 0, tz);
  const dayAfterTo = addDays(to.y, to.m, to.d, 1);
  const endExclusiveInstant = civilDateTimeToInstant(dayAfterTo.y, dayAfterTo.m, dayAfterTo.d, 0, 0, 0, tz);
  const inRange = input.transactions.filter(
    (t2) => t2.transacted_at >= startInstant && t2.transacted_at < endExclusiveInstant
  );
  const rows = inRange.slice().sort((a, b) => a.transacted_at.localeCompare(b.transacted_at)).map((t2) => {
    const parts = localParts(t2.transacted_at, tz);
    return {
      date: localDay(t2.transacted_at, tz),
      time: `${pad22(parts.hour)}:${pad22(parts.minute)}`,
      merchant: t2.merchant ?? "",
      category: t2.category_id ? catNameById.get(t2.category_id) ?? "" : "",
      direction: t2.direction,
      amount: t2.amount,
      currency: t2.currency_code || input.profile.currency_code,
      amountInProfileCurrency: t2.amount_in_profile_currency,
      fxRate: t2.fx_rate_to_profile ?? null,
      fxDate: t2.fx_rate_date ?? null,
      paymentMethod: t2.payment_method ?? "",
      source: t2.source ?? "",
      note: t2.note ?? "",
      isRecurring: !!t2.is_recurring
    };
  });
  const summary = summarize(
    inRange.map((t2) => ({
      amount_in_profile_currency: t2.amount_in_profile_currency,
      direction: t2.direction,
      transacted_at: t2.transacted_at,
      category_id: t2.category_id,
      category_name: t2.category_id ? catNameById.get(t2.category_id) ?? null : null,
      category_kind: t2.category_kind ?? null
    }))
  );
  return {
    profile: input.profile,
    dateRange: { from: input.dateFrom, to: input.dateTo },
    rows,
    summary,
    categories: input.categories,
    recurringRules: input.recurringRules ?? [],
    generatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function exportSummaryJSON(result) {
  return {
    app: "Murmur",
    version: 1,
    exported_at: result.generatedAt,
    currency: result.profile.currency_code,
    locale: result.profile.locale,
    date_range: result.dateRange,
    summary: {
      income: result.summary.income,
      expense: result.summary.expense,
      transfers: result.summary.transfers,
      saved: result.summary.saved,
      transaction_count: result.summary.transactionCount,
      pending_conversion_count: result.summary.pendingCount
    },
    transactions: result.rows.map((r) => ({
      date: r.date,
      time: r.time,
      amount: r.amount,
      currency: r.currency,
      amount_in_profile_currency: r.amountInProfileCurrency,
      fx_rate: r.fxRate,
      fx_date: r.fxDate,
      direction: r.direction,
      category: r.category || null,
      merchant: r.merchant || null,
      payment_method: r.paymentMethod || null,
      source: r.source || null,
      note: r.note || null,
      is_recurring: r.isRecurring
    })),
    categories: result.categories.map((c) => ({ id: c.id, name: c.name })),
    recurring_rules: result.recurringRules
  };
}

// packages/shared/src/domain/recurrence.ts
function instantMs(iso) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`recurrence.ts: "${iso}" is not a parseable ISO instant`);
  return ms;
}
function parseAnchorTime(raw) {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(raw);
  if (!match) throw new Error(`recurrence.ts: "${raw}" is not a parseable "HH:MM[:SS]" anchor_time`);
  return { hour: Number(match[1]), minute: Number(match[2]), second: Number(match[3] ?? 0) };
}
function resolveAnchor(rule, tz) {
  const start = localParts(rule.starts_at, tz);
  const day = rule.anchor_day ?? start.d;
  const weekday = rule.anchor_weekday ?? start.weekdayIndex + 1;
  if (rule.anchor_time) {
    const { hour, minute, second } = parseAnchorTime(rule.anchor_time);
    return { day, weekday, hour, minute, second };
  }
  return { day, weekday, hour: start.hour, minute: start.minute, second: start.second };
}
function normalizedInterval(rule) {
  const n = Math.trunc(rule.interval);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
function cadenceStep(rule) {
  const interval = normalizedInterval(rule);
  switch (rule.frequency) {
    case "daily":
      return { unit: "days", n: interval };
    case "weekly":
      return { unit: "days", n: 7 * interval };
    case "biweekly":
      return { unit: "days", n: 14 * interval };
    case "monthly":
      return { unit: "months", n: interval };
    case "quarterly":
      return { unit: "months", n: 3 * interval };
    case "yearly":
      return { unit: "months", n: 12 * interval };
    default: {
      const exhaustive = rule.frequency;
      throw new Error(`recurrence.ts: unknown frequency "${String(exhaustive)}"`);
    }
  }
}
function buildOccurrence(rule, instant, tz) {
  if (rule.ends_at && instantMs(instant) > instantMs(rule.ends_at)) return null;
  return { instant, occurrenceDate: localDay(instant, tz) };
}
function nextOccurrence(rule, afterInstant, tz) {
  if (afterInstant == null) {
    return buildOccurrence(rule, rule.starts_at, tz);
  }
  const anchor = resolveAnchor(rule, tz);
  const after = localParts(afterInstant, tz);
  const step = cadenceStep(rule);
  const target = step.unit === "days" ? addDays(after.y, after.m, after.d, step.n) : addMonthsClamped(after.y, after.m, anchor.day, step.n);
  const instant = civilDateTimeToInstant(
    target.y,
    target.m,
    target.d,
    anchor.hour,
    anchor.minute,
    anchor.second,
    tz
  );
  return buildOccurrence(rule, instant, tz);
}
function firstOccurrenceOnOrAfter(rule, atInstant, tz) {
  if (instantMs(rule.starts_at) >= instantMs(atInstant)) {
    return buildOccurrence(rule, rule.starts_at, tz);
  }
  const anchor = resolveAnchor(rule, tz);
  const start = localParts(rule.starts_at, tz);
  const at = localParts(atInstant, tz);
  const step = cadenceStep(rule);
  const elapsed = step.unit === "days" ? daysBetween(start.y, start.m, start.d, at.y, at.m, at.d) : (at.y - start.y) * 12 + (at.m - start.m);
  const estimateCycles = Math.max(0, Math.floor(elapsed / step.n));
  const occurrenceAtCycle = (cycles) => {
    const target = step.unit === "days" ? addDays(start.y, start.m, start.d, cycles * step.n) : addMonthsClamped(start.y, start.m, anchor.day, cycles * step.n);
    const instant = civilDateTimeToInstant(
      target.y,
      target.m,
      target.d,
      anchor.hour,
      anchor.minute,
      anchor.second,
      tz
    );
    return buildOccurrence(rule, instant, tz);
  };
  for (let cycles = estimateCycles; cycles <= estimateCycles + 2; cycles++) {
    const occ = occurrenceAtCycle(cycles);
    if (!occ) return null;
    if (instantMs(occ.instant) >= instantMs(atInstant)) return occ;
  }
  return null;
}
function occurrencesInWindow(rule, startInstant, endExclusiveInstant, tz, opts = {}) {
  const limit = opts.limit ?? 1e4;
  const out = [];
  let cursor = firstOccurrenceOnOrAfter(rule, startInstant, tz);
  let iterations = 0;
  while (cursor && instantMs(cursor.instant) < instantMs(endExclusiveInstant) && iterations < limit) {
    out.push(cursor);
    cursor = nextOccurrence(rule, cursor.instant, tz);
    iterations++;
  }
  return out;
}
function occurrencesDue(rule, nowInstant, tz, limit = 500) {
  const out = [];
  let cursor = nextOccurrence(rule, rule.last_generated, tz);
  let iterations = 0;
  while (cursor && instantMs(cursor.instant) <= instantMs(nowInstant) && iterations < limit) {
    out.push(cursor);
    cursor = nextOccurrence(rule, cursor.instant, tz);
    iterations++;
  }
  return out;
}
function chargesInWindow(rules, startInstant, endExclusiveInstant, tz) {
  const out = [];
  for (const rule of rules) {
    for (const occurrence of occurrencesInWindow(rule, startInstant, endExclusiveInstant, tz)) {
      out.push({ rule, occurrence });
    }
  }
  out.sort((a, b) => instantMs(a.occurrence.instant) - instantMs(b.occurrence.instant));
  return out;
}
function monthlyEquivalent(rule) {
  const interval = normalizedInterval(rule);
  switch (rule.frequency) {
    // Exact calendar ratios, not the 30 / 4.33 / 2.17 shortcuts this used
    // to ship: a $2,500 biweekly paycheck is $5,416.67/mo (26 ÷ 12), not
    // the $5,425 the rounded factor produced on the Recurring hero.
    case "daily":
      return rule.amount * (365.25 / 12) / interval;
    case "weekly":
      return rule.amount * (52 / 12) / interval;
    case "biweekly":
      return rule.amount * (26 / 12) / interval;
    case "monthly":
      return rule.amount / interval;
    case "quarterly":
      return rule.amount / (3 * interval);
    case "yearly":
      return rule.amount / (12 * interval);
    default: {
      const exhaustive = rule.frequency;
      throw new Error(`recurrence.ts: unknown frequency "${String(exhaustive)}"`);
    }
  }
}
function annualEquivalent(rule) {
  return monthlyEquivalent(rule) * 12;
}
function recurringOutflowInWindow(rules, startInstant, endExclusiveInstant, tz) {
  return flowInWindow(rules, "debit", startInstant, endExclusiveInstant, tz);
}
function recurringInflowInWindow(rules, startInstant, endExclusiveInstant, tz) {
  return flowInWindow(rules, "credit", startInstant, endExclusiveInstant, tz);
}
function flowInWindow(rules, direction, startInstant, endExclusiveInstant, tz) {
  const filtered = rules.filter((r) => r.direction === direction);
  let cents = 0;
  let pendingCount = 0;
  for (const { rule } of chargesInWindow(filtered, startInstant, endExclusiveInstant, tz)) {
    if (rule.amount_in_profile_currency == null) {
      pendingCount++;
      continue;
    }
    cents += Math.round(rule.amount_in_profile_currency * 100);
  }
  return { total: cents / 100, pendingCount };
}
function findRuleForTransaction(txn, rules) {
  if (txn.recurring_rule_id) {
    const byId = rules.find((r) => r.id === txn.recurring_rule_id);
    if (byId) return byId;
  }
  return rules.find((r) => r.template_txn_id === txn.id) ?? null;
}
function buildRuleAnchor(instant, tz) {
  const parts = localParts(instant, tz);
  return {
    starts_at: instant,
    anchor_day: parts.d,
    anchor_weekday: parts.weekdayIndex + 1,
    anchor_time: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}:${String(parts.second).padStart(2, "0")}`
  };
}

// packages/shared/src/domain/forecast.ts
function monthlyAverage(months, firstTransactionMonthIso) {
  const covered = firstTransactionMonthIso == null ? months : months.filter((m) => m.monthIso >= firstTransactionMonthIso);
  if (covered.length === 0) return { avg: 0, monthsCovered: 0 };
  const avg = covered.reduce((s, m) => s + m.total, 0) / covered.length;
  return { avg, monthsCovered: covered.length };
}
function pad23(n) {
  return String(n).padStart(2, "0");
}
function pad42(n) {
  return String(n).padStart(4, "0");
}
function dayKey(y, m, d) {
  return `${pad42(y)}-${pad23(m)}-${pad23(d)}`;
}
function monthKey(y, m) {
  return `${pad42(y)}-${pad23(m)}`;
}
function spendAmount(t2) {
  if (isFxPending(t2)) return 0;
  const kind = resolveCategoryKind(t2.category_name, t2.category_kind);
  if (!isSpend(t2, kind)) return 0;
  return t2.amount_in_profile_currency;
}
function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}
function forecastMonthly(txns, recurringRules, nowInstant, tz) {
  const now = localParts(nowInstant, tz);
  const thisMonthIso = monthIso(nowInstant, tz);
  const monthStartBounds = monthBounds(thisMonthIso, tz);
  let monthToDate = 0;
  let firstTransactedAt = null;
  for (const t2 of txns) {
    if (firstTransactedAt == null || t2.transacted_at < firstTransactedAt) {
      firstTransactedAt = t2.transacted_at;
    }
    if (t2.transacted_at >= monthStartBounds.start && t2.transacted_at < nowInstant) {
      monthToDate += spendAmount(t2);
    }
  }
  const firstMonthIso = firstTransactedAt ? monthIso(firstTransactedAt, tz) : null;
  const monthlyTotals = [];
  for (let back = 1; back <= 6; back++) {
    const target = addMonthsClamped(now.y, now.m, 1, -back);
    const targetIso = monthKey(target.y, target.m);
    if (firstMonthIso != null && targetIso < firstMonthIso) break;
    const bounds = monthBounds(targetIso, tz);
    let total = 0;
    for (const t2 of txns) {
      if (t2.transacted_at >= bounds.start && t2.transacted_at < bounds.endExclusive) {
        total += spendAmount(t2);
      }
    }
    monthlyTotals.unshift({ monthIso: targetIso, total });
  }
  const { avg: usualAvg, monthsCovered } = monthlyAverage(monthlyTotals, firstMonthIso);
  const usual = monthsCovered > 0 ? usualAvg : null;
  const WINDOW_DAYS = 90;
  const windowStart = addDays(now.y, now.m, now.d, -(WINDOW_DAYS - 1));
  const windowStartInstant = civilDateTimeToInstant(windowStart.y, windowStart.m, windowStart.d, 0, 0, 0, tz);
  const dailyBuckets = /* @__PURE__ */ new Map();
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const day = addDays(windowStart.y, windowStart.m, windowStart.d, i);
    dailyBuckets.set(dayKey(day.y, day.m, day.d), 0);
  }
  let distinctSpendingDays = 0;
  const spendingDaySet = /* @__PURE__ */ new Set();
  for (const t2 of txns) {
    if (t2.transacted_at < windowStartInstant || t2.transacted_at >= nowInstant) continue;
    const amount = spendAmount(t2);
    if (amount <= 0) continue;
    const day = localDay(t2.transacted_at, tz);
    spendingDaySet.add(day);
    if (t2.is_recurring) continue;
    if (dailyBuckets.has(day)) {
      dailyBuckets.set(day, (dailyBuckets.get(day) ?? 0) + amount);
    }
  }
  distinctSpendingDays = spendingDaySet.size;
  const dailySorted = Array.from(dailyBuckets.values()).sort((a, b) => a - b);
  const medianDailyVariable = percentile(dailySorted, 0.5);
  const p25Daily = percentile(dailySorted, 0.25);
  const p75Daily = percentile(dailySorted, 0.75);
  const confident = monthsCovered >= 2 && distinctSpendingDays >= 10 || monthsCovered >= 1 && now.d >= 10;
  if (!confident) {
    return { monthToDate, projected: null, range: null, usual, sampleMonths: monthsCovered, confident: false };
  }
  const nextMonthStart = addMonthsClamped(now.y, now.m, 1, 1);
  const daysInMonth = daysBetween(now.y, now.m, 1, nextMonthStart.y, nextMonthStart.m, nextMonthStart.d);
  const daysRemaining = Math.max(0, daysInMonth - now.d);
  const remainingCharges = chargesInWindow(recurringRules, nowInstant, monthStartBounds.endExclusive, tz);
  const recurringCommittedRemaining = remainingCharges.filter(({ rule }) => rule.direction === "debit").reduce((s, { rule }) => s + rule.amount, 0);
  const projected = monthToDate + recurringCommittedRemaining + medianDailyVariable * daysRemaining;
  const low = monthToDate + recurringCommittedRemaining + p25Daily * daysRemaining;
  const high = monthToDate + recurringCommittedRemaining + p75Daily * daysRemaining;
  return {
    monthToDate,
    projected,
    range: { low, high },
    usual,
    sampleMonths: monthsCovered,
    confident: true
  };
}

// packages/shared/src/domain/patterns.ts
function spendAmount2(t2) {
  if (isFxPending(t2)) return 0;
  const kind = resolveCategoryKind(t2.category_name, t2.category_kind);
  if (!isSpend(t2, kind)) return 0;
  return t2.amount_in_profile_currency;
}
function inWindow(t2, w) {
  return t2.transacted_at >= w.start && t2.transacted_at < w.endExclusive;
}
function heaviestWeekday(txns, window, tz) {
  const weekdaySums = new Array(7).fill(0);
  const weekdayDays = Array.from({ length: 7 }, () => /* @__PURE__ */ new Set());
  let totalSpendTxns = 0;
  for (const t2 of txns) {
    if (!inWindow(t2, window)) continue;
    const amount = spendAmount2(t2);
    if (amount <= 0) continue;
    totalSpendTxns++;
    const parts = localParts(t2.transacted_at, tz);
    weekdaySums[parts.weekdayIndex] += amount;
    weekdayDays[parts.weekdayIndex].add(`${parts.y}-${parts.m}-${parts.d}`);
  }
  let heaviestIdx = -1;
  let heaviestAvg = -1;
  let heaviestCount = 0;
  for (let i = 0; i < 7; i++) {
    const count = weekdayDays[i].size;
    if (count === 0) continue;
    const avg = weekdaySums[i] / count;
    if (avg > heaviestAvg) {
      heaviestAvg = avg;
      heaviestIdx = i;
      heaviestCount = count;
    }
  }
  const confident = heaviestIdx >= 0 && heaviestCount >= 4 && totalSpendTxns >= 12;
  return {
    kind: "heaviest_weekday",
    sampleSize: heaviestCount,
    confident,
    ...confident ? { data: { weekdayIndex: heaviestIdx, average: heaviestAvg, observedCount: heaviestCount } } : {}
  };
}
function categoryShare(txns, window, tz) {
  const totals = /* @__PURE__ */ new Map();
  let total = 0;
  let count = 0;
  const days = /* @__PURE__ */ new Set();
  for (const t2 of txns) {
    if (!inWindow(t2, window)) continue;
    const amount = spendAmount2(t2);
    if (amount <= 0) continue;
    count++;
    total += amount;
    const parts = localParts(t2.transacted_at, tz);
    days.add(`${parts.y}-${parts.m}-${parts.d}`);
    const key = t2.category_id ?? "__uncategorized__";
    totals.set(key, (totals.get(key) ?? 0) + amount);
  }
  let topKey = null;
  let topAmount = -1;
  for (const [key, amount] of totals) {
    if (amount > topAmount) {
      topAmount = amount;
      topKey = key;
    }
  }
  const confident = topKey != null && count >= 10 && days.size >= 21 && total > 0;
  return {
    kind: "category_share",
    sampleSize: count,
    confident,
    ...confident ? { data: { categoryId: topKey, amount: topAmount, share: topAmount / total, total } } : {}
  };
}
function topMerchants(txns, window, limit = 5) {
  const totals = /* @__PURE__ */ new Map();
  let count = 0;
  for (const t2 of txns) {
    if (!inWindow(t2, window)) continue;
    const amount = spendAmount2(t2);
    if (amount <= 0) continue;
    count++;
    const key = t2.merchant ?? "Unnamed";
    totals.set(key, (totals.get(key) ?? 0) + amount);
  }
  const sorted = Array.from(totals.entries()).sort(([, a], [, b]) => b - a);
  const confident = sorted.length >= 5;
  return {
    kind: "top_merchants",
    sampleSize: sorted.length,
    confident,
    ...confident ? { data: { merchants: sorted.slice(0, limit).map(([merchant, amount]) => ({ merchant, amount })) } } : {}
  };
}
function heatmap(txns, window, tz) {
  const matrix = Array.from({ length: 7 }, () => new Array(24).fill(0));
  let count = 0;
  for (const t2 of txns) {
    if (!inWindow(t2, window)) continue;
    const amount = spendAmount2(t2);
    if (amount <= 0) continue;
    count++;
    const parts = localParts(t2.transacted_at, tz);
    matrix[parts.weekdayIndex][parts.hour] += amount;
  }
  const confident = count >= 20;
  return {
    kind: "heatmap",
    sampleSize: count,
    confident,
    ...confident ? { data: { matrix } } : {}
  };
}
function patterns(txns, window, tz) {
  return [heaviestWeekday(txns, window, tz), categoryShare(txns, window, tz), topMerchants(txns, window)].filter(
    (p) => p.confident
  );
}

// packages/shared/src/domain/budget.ts
function resolveBudgetAnchor(startsAt, tz) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startsAt);
  if (!dateOnly) return startsAt;
  return civilDateTimeToInstant(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]), 0, 0, 0, tz);
}
function budgetStatus(budget, txns, rules, tz, atInstantIso = (/* @__PURE__ */ new Date()).toISOString()) {
  const anchor = resolveBudgetAnchor(budget.starts_at, tz);
  const window = periodBounds(budget.period, atInstantIso, tz, anchor);
  const inWindow2 = txns.filter(
    (t2) => t2.transacted_at >= window.start && t2.transacted_at < window.endExclusive
  );
  const scoped = budget.category_id == null ? inWindow2 : inWindow2.filter((t2) => t2.category_id === budget.category_id);
  let spentCents = 0;
  let committedFromTxnsCents = 0;
  let pendingCount = 0;
  const postedCountByRule = /* @__PURE__ */ new Map();
  for (const t2 of scoped) {
    if (t2.recurring_rule_id) {
      postedCountByRule.set(t2.recurring_rule_id, (postedCountByRule.get(t2.recurring_rule_id) ?? 0) + 1);
    }
    const categoryKind = resolveCategoryKind(t2.category_name, t2.category_kind);
    if (!isSpend(t2, categoryKind)) continue;
    if (t2.amount_in_profile_currency == null) {
      pendingCount++;
      continue;
    }
    const cents = Math.round(t2.amount_in_profile_currency * 100);
    if (t2.transacted_at > atInstantIso) {
      committedFromTxnsCents += cents;
    } else {
      spentCents += cents;
    }
  }
  let committedFromRulesCents = 0;
  for (const r of rules) {
    if (!r.is_active || r.direction !== "debit") continue;
    if (budget.category_id != null && r.category_id !== budget.category_id) continue;
    const perOccurrence = r.amount_in_profile_currency ?? (r.currency_code === budget.currency_code ? r.amount : null);
    if (perOccurrence == null) continue;
    const due = occurrencesInWindow(r, window.start, window.endExclusive, tz);
    if (due.length === 0) continue;
    const posted = postedCountByRule.get(r.id) ?? 0;
    const unposted = Math.max(0, due.length - posted);
    if (unposted === 0) continue;
    committedFromRulesCents += Math.round(perOccurrence * 100) * unposted;
  }
  const spent = roundCents(spentCents / 100);
  const committed = roundCents((committedFromTxnsCents + committedFromRulesCents) / 100);
  const remaining = roundCents(budget.amount - spent - committed);
  const pct = budget.amount > 0 ? (spent + committed) / budget.amount : 0;
  return { spent, committed, remaining, pct, window, pendingCount };
}

// packages/shared/src/domain/recurringPatternDetector.ts
var MIN_OCCURRENCES = 2;
var SLOWER_THAN_MONTHLY = /* @__PURE__ */ new Set(["quarterly", "yearly"]);
var MIN_OCCURRENCES_SLOW = 3;
var MIN_DAYS_SPREAD = 21;
var AMOUNT_TOLERANCE = 0.2;
var GAP_VARIANCE_TOLERANCE = 0.25;
var DAY_MS = 24 * 60 * 60 * 1e3;
var CADENCE_BANDS = [
  { freq: "daily", min: 0.5, max: 3 },
  { freq: "weekly", min: 4, max: 10 },
  { freq: "biweekly", min: 11, max: 20 },
  { freq: "monthly", min: 21, max: 45 },
  { freq: "quarterly", min: 75, max: 110 },
  { freq: "yearly", min: 335, max: 395 }
];
function patternKey(merchant, amount) {
  const cents = Math.round(amount * 100);
  const m = (merchant ?? "").toLowerCase().trim();
  return `${m}|${cents}`;
}
function normalizedMerchant(merchant) {
  return (merchant ?? "").toLowerCase().trim();
}
function clusterByAmount(sorted) {
  const clusters = [];
  let current = [];
  let meanCents = 0;
  for (const tx of sorted) {
    const cents = Math.round(tx.amount * 100);
    if (current.length === 0) {
      current = [tx];
      meanCents = cents;
      continue;
    }
    const relDiff = Math.abs(cents - meanCents) / meanCents;
    if (relDiff <= AMOUNT_TOLERANCE) {
      current.push(tx);
      meanCents = current.reduce((s, t2) => s + Math.round(t2.amount * 100), 0) / current.length;
    } else {
      clusters.push(current);
      current = [tx];
      meanCents = cents;
    }
  }
  if (current.length > 0) clusters.push(current);
  return clusters;
}
function inferFrequency(medianGapDays) {
  for (const band of CADENCE_BANDS) {
    if (medianGapDays >= band.min && medianGapDays <= band.max) return band.freq;
  }
  return null;
}
function median(xs) {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[m - 1] + sorted[m]) / 2 : sorted[m];
}
function detectRecurringPatterns({
  transactions,
  dismissedKeys
}) {
  const byMerchant = /* @__PURE__ */ new Map();
  for (const tx of transactions) {
    if (tx.is_deleted) continue;
    if (tx.recurring_rule_id != null) continue;
    if (tx.direction !== "debit") continue;
    if (!tx.merchant) continue;
    const m = normalizedMerchant(tx.merchant);
    const list = byMerchant.get(m) ?? [];
    list.push(tx);
    byMerchant.set(m, list);
  }
  const candidates = [];
  for (const [, merchantTxns] of byMerchant) {
    const sortedMerchant = [...merchantTxns].sort(
      (a, b) => a.transacted_at.localeCompare(b.transacted_at)
    );
    for (const sorted of clusterByAmount(sortedMerchant)) {
      const anchor = sorted[sorted.length - 1];
      const key = patternKey(anchor.merchant, anchor.amount);
      if (dismissedKeys?.has(key)) continue;
      const earliest = new Date(sorted[0].transacted_at).getTime();
      const latest = new Date(sorted[sorted.length - 1].transacted_at).getTime();
      const spreadDays = (latest - earliest) / DAY_MS;
      if (spreadDays < MIN_DAYS_SPREAD) continue;
      const gaps = [];
      for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1].transacted_at).getTime();
        const cur = new Date(sorted[i].transacted_at).getTime();
        gaps.push((cur - prev) / DAY_MS);
      }
      const medianGap = median(gaps);
      const gapVarianceOk = gaps.every(
        (g) => Math.abs(g - medianGap) <= medianGap * GAP_VARIANCE_TOLERANCE
      );
      if (!gapVarianceOk) continue;
      const frequency = inferFrequency(medianGap);
      if (!frequency) continue;
      const minOccurrences = SLOWER_THAN_MONTHLY.has(frequency) ? MIN_OCCURRENCES_SLOW : MIN_OCCURRENCES;
      if (sorted.length < minOccurrences) continue;
      candidates.push({
        key,
        merchant: anchor.merchant ?? "",
        amount: anchor.amount,
        currency_code: anchor.currency_code,
        occurrences: sorted.length,
        lastSeenAt: anchor.transacted_at,
        frequency,
        templateTxnId: anchor.id,
        category_id: anchor.category_id,
        payment_method: anchor.payment_method,
        direction: "debit"
      });
    }
  }
  candidates.sort((a, b) => b.amount * b.occurrences - a.amount * a.occurrences);
  return candidates;
}

// packages/shared/src/domain/source.ts
function classifySourceKind(source) {
  switch (source) {
    case "voice":
      return "voice";
    case "scan":
      return "scan";
    case "shortcut":
    case "notification_listener":
      return "apple-pay";
    case "recurring_generated":
      return "auto";
    case "manual":
    default:
      return "typed";
  }
}
var KIND_LABEL = {
  voice: "Voice",
  typed: "Typed",
  scan: "Scanned",
  "apple-pay": "Apple Pay",
  auto: "Auto"
};
function sourceLabel(source) {
  return KIND_LABEL[classifySourceKind(source)];
}

// packages/shared/src/domain/categoryResolver.ts
var SYNONYM_TABLE = [
  { pattern: /\b(rent|mortgage)\b/i, categoryName: "Housing" },
  {
    pattern: /\b(internet|electric|electricity|utility|utilities)\b/i,
    categoryName: "Utilities"
  },
  {
    pattern: /\b(investing|invest|investment|investments|401k|401\(k\)|ira|brokerage)\b/i,
    categoryName: "Savings & Investing"
  },
  { pattern: /\b(salary|paycheck|payroll|wages?)\b/i, categoryName: "Income" }
];
var MIN_TOKEN_LENGTH = 3;
var MIN_TOKEN_OVERLAP_SCORE = 1;
function normalize(s) {
  return s.trim().toLowerCase();
}
function tokens(s) {
  return normalize(s).split(/[\s&,/-]+/).filter((w) => w.length >= MIN_TOKEN_LENGTH);
}
function tokenOverlapScore(a, b) {
  let score = 0;
  for (const token of a) {
    if (b.includes(token)) score += 1;
  }
  return score;
}
function resolveCategorySuggestion(suggestion, categories) {
  const raw = (suggestion ?? "").trim();
  if (!raw || categories.length === 0) return null;
  const normalized = normalize(raw);
  const exact = categories.find((c) => c.name_normalized === normalized);
  if (exact) return { category: exact, strategy: "exact" };
  for (const { pattern, categoryName } of SYNONYM_TABLE) {
    if (!pattern.test(normalized)) continue;
    const target = categories.find((c) => c.name_normalized === normalize(categoryName));
    if (target) return { category: target, strategy: "synonym" };
  }
  const suggestionTokens = tokens(normalized);
  if (suggestionTokens.length === 0) return null;
  let best = null;
  for (const c of categories) {
    const score = tokenOverlapScore(suggestionTokens, tokens(c.name));
    if (score > 0 && (!best || score > best.score)) best = { category: c, score };
  }
  if (best && best.score >= MIN_TOKEN_OVERLAP_SCORE) {
    return { category: best.category, strategy: "token_overlap" };
  }
  return null;
}
var MERCHANT_KEYWORDS = [
  {
    pattern: /\b(uber|lyft|taxi|cab|metro|transit|mta|bart|parking|park(ing)?\s?mobile|amtrak|greyhound)\b/i,
    categoryName: "Transport"
  },
  {
    pattern: /\b(shell|exxon|mobil|chevron|bp|citgo|sunoco|marathon|maverik|kwik\s?(star|trip)|murphy\s?(usa|express)?|casey'?s|kum\s?&?\s?go|speedway|wawa|sheetz|circle\s?k|7-?eleven|gas|fuel|petro)\b/i,
    categoryName: "Transport"
  },
  {
    pattern: /\b(walmart|target|costco|sam'?s club|amazon|amzn|best ?buy|apple store|ikea|home ?depot|lowe'?s|dollar (tree|general)|tj ?maxx|marshalls|macy'?s|nike|zara|h&m|shein|temu|ebay|etsy)\b/i,
    categoryName: "Shopping"
  },
  {
    pattern: /\b(kroger|aldi|hy-?vee|trader joe'?s|whole foods|safeway|publix|wegmans|heb|h-e-b|meijer|lidl|food ?lion|giant|stop ?& ?shop|grocery|market ?basket|fareway|sprouts)\b/i,
    categoryName: "Groceries"
  },
  {
    pattern: /\b(walgreens|cvs|rite ?aid|pharmacy|clinic|dental|dentist|hospital|urgent care|medical|md|dr\.?|optical|vision)\b/i,
    categoryName: "Health & Medical"
  },
  {
    pattern: /\b(netflix|spotify|hulu|disney\+?|hbo|max|apple\.com\/bill|itunes|google \*?(play|storage|one)|youtube|prime video|paramount|peacock|adobe|microsoft|openai|chatgpt|icloud|dropbox|planet fitness|anytime fitness|gym)\b/i,
    categoryName: "Subscriptions"
  },
  {
    pattern: /\b(delta|united|american air|southwest|jetblue|spirit|frontier|airbnb|marriott|hilton|hyatt|hotel|motel|expedia|booking\.com|hertz|avis|enterprise rent)\b/i,
    categoryName: "Travel"
  },
  {
    pattern: /\b(amc|cinemark|regal|theat(er|re)|cinema|steam|playstation|xbox|nintendo|ticketmaster|stubhub|bowling|golf|arcade|dave ?& ?buster)\b/i,
    categoryName: "Entertainment"
  },
  {
    pattern: /\b(salon|barber|spa|nails?|sephora|ulta|massage|beauty)\b/i,
    categoryName: "Personal Care"
  },
  { pattern: /\b(petco|petsmart|chewy|vet(erinary)?|animal hospital)\b/i, categoryName: "Pets" },
  {
    pattern: /\b(canteen|vending|vend|snack|cafe|caf[eé]|coffee|starbucks|dunkin|mcdonald'?s|burger|pizza|taco|chipotle|subway|wendy'?s|chick-?fil-?a|kfc|popeyes|panera|domino'?s|papa john|sonic|arby'?s|dairy queen|culver'?s|five guys|shake shack|panda express|restaurant|grill|bistro|diner|kitchen|bakery|donut|doughnut|deli|sushi|ramen|pho|thai|bbq|steak|wings|buffet|peking|wok|hibachi|doordash|uber ?eats|grubhub|instacart|bar\b|pub\b|brew|tavern|lounge)\b/i,
    categoryName: "Food & Dining"
  }
];
function guessCategoryFromMerchant(merchant, categories) {
  const raw = (merchant ?? "").trim();
  if (!raw || categories.length === 0) return null;
  for (const { pattern, categoryName } of MERCHANT_KEYWORDS) {
    if (!pattern.test(raw)) continue;
    const target = categories.find((c) => c.name_normalized === normalize(categoryName));
    if (target) return { category: target, strategy: "synonym" };
  }
  return null;
}

// packages/shared/src/domain/merchantBrand.ts
function cleanMerchantDescriptor(raw) {
  const s = (raw ?? "").trim();
  if (!s) return "";
  let out = s;
  const firstComma = out.indexOf(",");
  if (firstComma > 0) out = out.slice(0, firstComma);
  out = out.replace(/\*[A-Za-z0-9]+/g, " ").replace(/#\s?\d+/g, " ").replace(/\b(?:T|ST|STR|NO|STORE|UNIT)[-.]?\s?\d{2,}\b/gi, " ").replace(/\b\d{4,}\b/g, " ");
  out = out.replace(/\s{2,}/g, " ").trim();
  return out || s;
}
var BRAND_DOMAINS = [
  { pattern: /\btarget\b/i, domain: "target.com" },
  { pattern: /\bwal-?mart\b/i, domain: "walmart.com" },
  { pattern: /\bcostco\b/i, domain: "costco.com" },
  { pattern: /\bsam'?s club\b/i, domain: "samsclub.com" },
  { pattern: /\b(amazon|amzn)\b/i, domain: "amazon.com" },
  { pattern: /\bstarbucks\b/i, domain: "starbucks.com" },
  { pattern: /\bchick[- ]?fil[- ]?a\b/i, domain: "chick-fil-a.com" },
  { pattern: /\bmcdonald/i, domain: "mcdonalds.com" },
  { pattern: /\bchipotle\b/i, domain: "chipotle.com" },
  { pattern: /\bdunkin/i, domain: "dunkindonuts.com" },
  { pattern: /\bpanera\b/i, domain: "panerabread.com" },
  { pattern: /\bwendy'?s\b/i, domain: "wendys.com" },
  { pattern: /\btaco bell\b/i, domain: "tacobell.com" },
  { pattern: /\bkfc\b/i, domain: "kfc.com" },
  { pattern: /\bpopeyes\b/i, domain: "popeyes.com" },
  { pattern: /\bdomino'?s\b/i, domain: "dominos.com" },
  { pattern: /\bpizza hut\b/i, domain: "pizzahut.com" },
  { pattern: /\bfive guys\b/i, domain: "fiveguys.com" },
  { pattern: /\bculver'?s\b/i, domain: "culvers.com" },
  { pattern: /\bsubway\b/i, domain: "subway.com" },
  { pattern: /\bsonic\b/i, domain: "sonicdrivein.com" },
  { pattern: /\barby'?s\b/i, domain: "arbys.com" },
  { pattern: /\bdairy queen\b/i, domain: "dairyqueen.com" },
  { pattern: /\bshake shack\b/i, domain: "shakeshack.com" },
  { pattern: /\bpanda express\b/i, domain: "pandaexpress.com" },
  { pattern: /\bdoordash\b/i, domain: "doordash.com" },
  { pattern: /\buber\s?eats\b/i, domain: "ubereats.com" },
  { pattern: /\bgrubhub\b/i, domain: "grubhub.com" },
  { pattern: /\binstacart\b/i, domain: "instacart.com" },
  { pattern: /\buber\b/i, domain: "uber.com" },
  { pattern: /\blyft\b/i, domain: "lyft.com" },
  { pattern: /\bmaverik\b/i, domain: "maverik.com" },
  { pattern: /\bkwik\s?(star|trip)\b/i, domain: "kwiktrip.com" },
  { pattern: /\bmurphy\s?(usa|express)?\b/i, domain: "murphyusa.com" },
  { pattern: /\bshell\b/i, domain: "shell.com" },
  { pattern: /\bchevron\b/i, domain: "chevron.com" },
  { pattern: /\bexxon\b/i, domain: "exxon.com" },
  { pattern: /\bcasey'?s\b/i, domain: "caseys.com" },
  { pattern: /\bkum\s?&?\s?go\b/i, domain: "kumandgo.com" },
  { pattern: /\bspeedway\b/i, domain: "speedway.com" },
  { pattern: /\bcircle\s?k\b/i, domain: "circlek.com" },
  { pattern: /\b7-?eleven\b/i, domain: "7-eleven.com" },
  { pattern: /\bwawa\b/i, domain: "wawa.com" },
  { pattern: /\bsheetz\b/i, domain: "sheetz.com" },
  { pattern: /\bkroger\b/i, domain: "kroger.com" },
  { pattern: /\bhy-?vee\b/i, domain: "hy-vee.com" },
  { pattern: /\baldi\b/i, domain: "aldi.us" },
  { pattern: /\btrader joe'?s\b/i, domain: "traderjoes.com" },
  { pattern: /\bwhole foods\b/i, domain: "wholefoodsmarket.com" },
  { pattern: /\bwalgreens\b/i, domain: "walgreens.com" },
  { pattern: /\bcvs\b/i, domain: "cvs.com" },
  { pattern: /\bbest ?buy\b/i, domain: "bestbuy.com" },
  { pattern: /\bhome ?depot\b/i, domain: "homedepot.com" },
  { pattern: /\blowe'?s\b/i, domain: "lowes.com" },
  { pattern: /\bdollar tree\b/i, domain: "dollartree.com" },
  { pattern: /\bdollar general\b/i, domain: "dollargeneral.com" },
  { pattern: /\bikea\b/i, domain: "ikea.com" },
  { pattern: /\bnetflix\b/i, domain: "netflix.com" },
  { pattern: /\bspotify\b/i, domain: "spotify.com" },
  { pattern: /\bapple\.com\/bill|itunes\b/i, domain: "apple.com" },
  { pattern: /\bpetco\b/i, domain: "petco.com" },
  { pattern: /\bpetsmart\b/i, domain: "petsmart.com" },
  { pattern: /\bchewy\b/i, domain: "chewy.com" },
  { pattern: /\bsephora\b/i, domain: "sephora.com" },
  { pattern: /\bulta\b/i, domain: "ulta.com" },
  { pattern: /\bairbnb\b/i, domain: "airbnb.com" },
  { pattern: /\bmarriott\b/i, domain: "marriott.com" },
  { pattern: /\bhilton\b/i, domain: "hilton.com" },
  { pattern: /\bdelta\b/i, domain: "delta.com" },
  { pattern: /\bsouthwest\b/i, domain: "southwest.com" }
];
function brandDomainForMerchant(raw) {
  const s = (raw ?? "").trim();
  if (!s) return null;
  for (const { pattern, domain } of BRAND_DOMAINS) {
    if (pattern.test(s)) return domain;
  }
  return null;
}

// packages/shared/src/i18n/locales/en.json
var en_default = {
  "app.name": "Murmur",
  "home.greeting": "Hey,",
  "home.net_balance": "Net Balance This Month",
  "home.income": "Income",
  "home.expenses": "Expenses",
  "home.recent_activity": "Recent Activity",
  "home.view_all": "View All",
  "home.see_all_transactions": "See all {count} transactions",
  "home.safe_to_spend": "Safe to Spend",
  "home.over_budget": "Over budget by",
  "home.set_budget": "Set a budget to track your spending",
  "home.spent_weekly": "Spent this week",
  "home.spent_biweekly": "Spent (last 14 days)",
  "home.spent_quarterly": "Spent this quarter",
  "home.spent_yearly": "Spent this year",
  "home.spent_monthly": "Spent this month",
  "home.budget_weekly": "Weekly budget",
  "home.budget_biweekly": "Bi-weekly budget",
  "home.budget_quarterly": "Quarterly budget",
  "home.budget_yearly": "Yearly budget",
  "home.budget_monthly": "Monthly budget",
  "home.upcoming": "Upcoming",
  "home.first_expense": "Tap the mic to log your first expense",
  "home.day_one_progress": "Your first expense",
  "home.day_one_headline": "Try logging your morning coffee.",
  "home.day_one_body": "Tap the mic and say anything like this. No specific phrasing needed. Murmur figures it out.",
  "home.day_one_example_1": '"Four fifty at the bakery"',
  "home.day_one_example_2": '"Twelve dollars at Blue Bottle, coffee"',
  "home.day_one_example_3": '"Thirty bucks Uber this morning"',
  "home.day_one_or": "Or",
  "home.day_one_type_instead": "type instead",
  "home.spent_today": "Spent today",
  "home.left_this_month": "left this month",
  "home.left_this_week": "left this week",
  "home.left_this_period": "left this period",
  "home.over_budget_suffix": "over budget",
  "home.days_left_week": "days left this week",
  "home.days_to_go": "days to go",
  "home.net": "Net",
  "voice.page_title": "Record",
  "voice.title": "What's the transaction?",
  "voice.subtitle": "Speak naturally, AI handles the rest",
  "voice.transcript_placeholder": "Your words will appear here...",
  "listening.eyebrow": "Listening",
  "listening.processing": "Processing",
  "listening.detected": "Detected",
  "listening.waiting": "Listening for your amount\u2026",
  "listening.processed_on_device": "Processed securely",
  "voice.save": "Save",
  "voice.parsed_expense": "Parsed Transaction",
  "voice.amount": "Amount",
  "voice.merchant": "Merchant",
  "voice.category": "Category",
  "voice.tab_voice": "Voice",
  "voice.tab_manual": "Manual",
  "voice.tap_to_stop": "Tap to stop",
  "voice.tap_to_record": "Tap to record",
  "voice.parsing": "Parsing with AI...",
  "voice.scan_receipt": "Scan Receipt",
  "voice.scan_paycheck": "Scan Paycheck",
  "voice.expense": "Expense",
  "voice.income_label": "Income",
  "voice.merchant_source": "Merchant / Source",
  "voice.note": "Note (optional)",
  "voice.note_placeholder": "Add a note...",
  "voice.more_options": "More options",
  "voice.add_expense": "Add expense",
  "voice.add_income": "Add income",
  "voice.no_transcript": "We didn't catch anything, tap the mic to try again.",
  "voice.payment_method": "Payment Method",
  "voice.low_confidence": "Low confidence, please verify the details above",
  "voice.ai_suggests": "AI suggests:",
  "voice.invalid_amount": "Invalid amount",
  "voice.invalid_amount_msg": "Enter a valid amount greater than 0",
  "voice.amount_too_large": "That amount is too large, enter something under 9,999,999,999.99.",
  "voice.amount_too_many_decimals": "Amounts can have at most 2 decimal places.",
  "voice.permission_required": "Permission required",
  "voice.camera_permission": "Camera access is needed to scan receipts.",
  "voice.scan_failed": "Scan failed",
  "voice.scan_rejected_title": "Couldn't read that scan",
  "voice.retake": "Retake",
  "voice.enter_manually": "Enter manually",
  "voice.save_changes": "Save Changes",
  "transactions.title": "Activity",
  "transactions.search": "Search transactions...",
  "transactions.all_time": "All time",
  "transactions.pick_month": "Choose a month",
  "transactions.count_one": "1 transaction",
  "transactions.count_many": "{count} transactions",
  "transactions.filter": "Filter",
  "transactions.today": "Today",
  "transactions.yesterday": "Yesterday",
  "transactions.empty": "No transactions yet",
  "transactions.empty_search": "No results",
  "transactions.uncategorized": "Uncategorized",
  "transactions.unknown": "Unknown",
  "transactions.filter_all": "All",
  "detail.title": "Expense Detail",
  "detail.category": "Category",
  "detail.payment": "Payment Method",
  "detail.source": "Source",
  "detail.note": "Note",
  "detail.recurring": "Recurring",
  "detail.transcript": "Voice Transcript",
  "detail.date": "Date",
  "detail.logged_via": "Logged via",
  "source.voice": "Voice",
  "source.manual": "Manual",
  "source.scan": "Receipt scan",
  "source.shortcut": "Apple Pay Shortcut",
  "source.notification": "Payment notification",
  "source.recurring": "Recurring \xB7 auto-generated",
  "detail.edit": "Edit",
  "detail.delete": "Delete",
  "detail.delete_title": "Delete transaction",
  "detail.delete_msg": "This cannot be undone.",
  "detail.deleted": "Deleted",
  "detail.not_found": "Transaction not found",
  "common.cancel": "Cancel",
  "common.dismiss": "Dismiss",
  "settings.reminders": "Reminders",
  "settings.dunning_label": "Nudge me when I go quiet",
  "settings.privacy_data": "Privacy & data",
  "settings.export_label": "Export transactions",
  "settings.export_detail_plus": "CSV \xB7 JSON \xB7 PDF",
  "settings.export_detail_free": "Murmur Plus",
  "export.picker_title": "Export format",
  "export.fmt_csv_label": "Spreadsheet (.csv)",
  "export.fmt_csv_hint": "For Excel, Numbers, Google Sheets.",
  "export.fmt_json_label": "Raw data (.json)",
  "export.fmt_json_hint": "Full structured export. Best for backup or other tools.",
  "export.fmt_pdf_label": "Printable report (.pdf)",
  "export.fmt_pdf_hint": "Formatted ledger you can print or send.",
  "export.share_dialog_title": "Save Murmur export",
  "export.failed_title": "Export failed",
  "export.pdf_eyebrow": "Murmur \xB7 Transactions",
  "export.pdf_title": "Your transactions",
  "export.pdf_total_label": "Total spent",
  "export.pdf_count_label": "Entries",
  "export.col_date": "Date",
  "export.col_merchant": "Merchant",
  "export.col_category": "Category",
  "export.col_amount": "Amount",
  "export.pdf_footer": "Exported from Murmur. Your data, on your terms.",
  "home.pattern_eyebrow": "New pattern",
  "home.pattern_title": "Looks like {merchant} is recurring at {amount} {frequency}.",
  "home.pattern_body": "We noticed it {count} times. Want Murmur to track it automatically?",
  "home.pattern_accept": "Set up",
  "home.pattern_dismiss": "Not now",
  "insights.unlock_eyebrow": "Insights unlocked",
  "insights.unlock_title": "Three logs in. Patterns ahead.",
  "insights.unlock_body": "Now there's enough captured for Murmur to show you trends, top merchants, and where the month is going.",
  "common.confirm": "Confirm",
  "common.ok": "OK",
  "common.undo": "Undo",
  "common.save": "Save",
  "common.done": "Done",
  "common.skip": "Skip",
  "common.continue": "Continue",
  "onboarding.welcome.headline": "Speak it.\nSpend clearly.",
  "onboarding.income.source_label": "Source (optional)",
  "onboarding.income.source_placeholder": "e.g. Microsoft, freelance, tips\u2026",
  "onboarding.income.per_month": "per month",
  "onboarding.income.default_name": "Salary",
  "onboarding.income.txn_note": "Monthly income (set during onboarding)",
  "common.yes": "Yes",
  "common.no": "No",
  "common.none": "None",
  "common.loading": "Loading...",
  "common.error": "Something went wrong",
  "common.load_failed": "Couldn't load your data",
  "common.retry": "Retry",
  "common.back": "Back",
  "auth.sign_in": "Sign In",
  "auth.sign_up": "Sign Up",
  "auth.sign_out": "Sign Out",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.continue_apple": "Continue with Apple",
  "auth.continue_google": "Continue with Google",
  "auth.welcome_back": "Welcome back",
  "auth.sign_in_continue": "Sign in to continue",
  "auth.or_continue_with": "or continue with",
  "auth.no_account": "Don't have an account?",
  "auth.create_one": "Create one",
  "auth.has_account": "Already have an account?",
  "auth.sign_in_link": "Sign in",
  "auth.create_account": "Create account",
  "auth.track_voice": "Track expenses with your voice",
  "auth.create_account_btn": "Create Account",
  "auth.password_short": "Password too short",
  "auth.password_min": "Password must be at least 6 characters.",
  "auth.confirm_password": "Confirm password",
  "auth.passwords_no_match": "Those two passwords don't match.",
  "auth.password_placeholder": "At least 6 characters",
  "auth.sign_in_failed": "Sign in failed",
  "auth.sign_up_failed": "Sign up failed",
  "auth.apple_failed": "Apple Sign-In failed",
  "auth.google_failed": "Google Sign-In failed",
  "auth.check_email": "Check your email",
  "auth.confirmation_sent": "We sent a confirmation link to {email}. Click it to activate your account.",
  "auth.back_to_sign_in": "Back to Sign In",
  "auth.more_options": "More options",
  "auth.hide_email_form": "Hide email options",
  "auth.privacy_note": "Your data is yours. We never sell it. Your email is only used to keep you signed in.",
  "auth.forgot_password": "Forgot password?",
  "auth.forgot_password_need_email": "Enter your email above first.",
  "auth.reset_email_sent": "We sent a password reset link to {email}. Open it on this device to set a new password.",
  "auth.reset_failed": "Reset failed",
  "auth.new_password_title": "Set a new password",
  "auth.new_password_body": "Choose a new password for your account.",
  "auth.update_password": "Update password",
  "auth.password_updated": "Password updated",
  "auth.reset_link_invalid": "This reset link is invalid or has expired. Request a new one from the sign-in screen.",
  "settings.title": "Settings",
  "settings.budget": "Monthly Budget",
  "settings.monthly_income": "Monthly Income",
  "settings.income_amount": "Amount",
  "settings.income_source_helper": "Optional. If you add a company name, we'll show its logo on your income entries.",
  "settings.currency": "Currency",
  "settings.currency_confirm_title": "Change currency?",
  "settings.currency_confirm_body_prefix": "This will convert",
  "settings.currency_confirm_body_suffix": "transactions, plus your budgets and monthly income, to the new currency at today's exchange rate. This can't be undone automatically.",
  "settings.currency_confirm_action": "Convert",
  "settings.currency_converting": "Converting your history\u2026",
  "settings.currency_offline_title": "You're offline",
  "settings.currency_offline_body": "Changing currency needs a connection so nothing is left half-converted. Try again once you're back online.",
  "settings.currency_failed_title": "Currency change failed",
  "settings.language": "Language",
  "settings.account": "Account",
  "settings.display_name": "Display Name",
  "settings.preferences": "Preferences",
  "settings.developer": "Developer",
  "settings.ai_server_url": "AI Server URL",
  "settings.about": "About",
  "settings.version": "Version",
  "settings.budget_hint": "Set your spending budget. Safe to Spend will track your remaining amount.",
  "settings.budget_period": "Budget Period",
  "settings.payment_notifications": "Payment Notifications",
  "settings.disable_notifications": "Disable Payment Notifications",
  "settings.disable_notifications_msg": "To disable, open Settings > Apps > Special app access > Notification access and remove this app.",
  "settings.ai_url_hint": "Enter the URL of your local Next.js dev server (e.g. http://192.168.1.5:3000). Change this without rebuilding the app.",
  "settings.reset_default": "Reset to default",
  "settings.your_name": "Your name",
  "tabs.home": "Home",
  "tabs.today": "Today",
  "tabs.expenses": "Expenses",
  "tabs.record": "Record",
  "tabs.insights": "Insights",
  "insights.eyebrow_this_month": "This month",
  "insights.heading": "Insights",
  "insights.spent": "Spent",
  "insights.vs": "vs",
  "insights.last_n_days_prefix": "Last",
  "insights.last_n_days_suffix": "days",
  "insights.history": "History",
  "insights.categories": "Categories",
  "insights.other": "Other",
  "insights.empty": "No spending yet this period.",
  "insights.select_month": "Select month",
  "insights.forecast": "Forecast",
  "insights.forecast_line_prefix": "At this pace, around",
  "insights.forecast_line_suffix": "by the end of {month}.",
  "insights.forecast_below": "below your usual.",
  "insights.forecast_above": "above your usual.",
  "insights.forecast_same": "Right around your usual.",
  "tabs.budgets": "Budgets",
  "tabs.settings": "Settings",
  "tabs.more": "More",
  "more.title": "More",
  "more.section_activity": "Activity",
  "more.section_intelligence": "Intelligence",
  "more.section_account": "Account",
  "more.history": "History",
  "more.transactions": "Transactions",
  "history.heading_eyebrow": "History",
  "history.months": "Months",
  "history.in_progress": "In progress",
  "history.browse_all": "Browse all transactions",
  "history.prev_month": "Previous month",
  "history.next_month": "Next month",
  "history.empty": "Nothing logged yet. Record your first expense to start the heatmap.",
  "more.recurring": "Recurring",
  "more.ask": "Ask Murmur",
  "more.settings": "Settings",
  "more.privacy": "Privacy Center",
  "more.help": "Help",
  "budgets.title": "Budgets",
  "budgets.empty_title": "Budgets arrive soon",
  "budgets.empty_body": "A ring for the month plus per-category progress. Lands in the next release.",
  "budgets.left_of": "left of",
  "budgets.over_by": "over by",
  "budgets.status_on_pace": "On pace",
  "budgets.status_tight": "Tight",
  "budgets.status_over": "Over",
  "budgets.no_budget_title": "No budget set yet",
  "budgets.no_budget_body": "Set a monthly budget so the ring can tell you when you're tight, over, or on pace.",
  "budgets.set_budget_cta": "Set a budget",
  "budgets.edit_budget": "Edit budget",
  "budgets.by_category": "By category",
  "budgets.committed": "still due",
  "budgets.ring_used": "used",
  "privacy.title": "Your money, yours.",
  "privacy.lead": "Murmur never connects to your bank, and your voice is handled on your phone whenever the device supports it. Everything you record is yours: export it or erase it below, anytime. The full detail of how we handle data is in the privacy policy.",
  "privacy.group_rights": "Your data",
  "privacy.group_legal": "Legal",
  "privacy.policy_label": "Privacy Policy",
  "privacy.terms_label": "Terms of Service",
  "privacy.export_all": "Export all my data",
  "privacy.export_all_busy": "Preparing export\u2026",
  "privacy.export_all_failed": "Couldn't export your data",
  "privacy.delete_all": "Delete account",
  "privacy.delete_all_title": "Delete your account?",
  "privacy.delete_all_body": "This permanently deletes your Murmur account and everything in it: transactions, budgets, recurring rules, categories and Ask conversations. A Murmur Plus subscription is managed by Apple and is not cancelled by deleting the account. This cannot be undone.",
  "privacy.delete_all_confirm": "Delete account",
  "privacy.delete_all_busy": "Deleting account\u2026",
  "privacy.delete_all_failed": "Couldn't delete your account",
  "ask.title": "Ask Murmur.",
  "ask.lead": "Grounded in your own transactions. Not general advice, your data, your numbers, a direct answer.",
  "ask.beta": "Beta",
  "ask.suggestion_afford": "Can I afford a PS5 this month?",
  "ask.suggestion_coffee": "Where is my coffee budget going?",
  "ask.suggestion_unusual": "Why did I spend more than usual last week?",
  "ask.suggestion_goal": "Help me save $500 by August.",
  "ask.input_placeholder": "Ask a question about your spending\u2026",
  "ask.mic_label": "Voice ask",
  "ask.send_label": "Send question",
  "ask.privacy_note": "Your data never trains a model",
  "ask.header_title": "Ask Murmur",
  "ask.thinking": "Reading your transactions\u2026",
  "ask.error": "Couldn\u2019t reach Ask Murmur. Try again in a moment.",
  "ask.retry": "Try again",
  "ask.followup_placeholder": "Ask a follow-up\u2026",
  "ask.attribution": "Based on {count} transactions in Murmur. No guesses, no external advice.",
  "ask.refusal_default": "I can only answer from your own transactions, and that\u2019s outside what I can see.",
  "ask.action_create_goal": "Create goal",
  "ask.action_show_category": "Show category",
  "ask.action_show_transactions": "Show transactions",
  "ask.action_set_budget": "Set budget",
  "ask.breakdown_caption": "From your last 3 months",
  "ask.today_eyebrow": "Today",
  "ask.entry_lead": "Murmur watches your money. Here's what stands out, or ask anything.",
  "ask.intent_eyebrow": "I want to\u2026",
  "ask.intent_budget": "Check my budget",
  "ask.intent_budget_q": "How am I doing against my budget?",
  "ask.intent_subs": "Cut a subscription",
  "ask.intent_subs_q": "Which of my recurring bills could I cut?",
  "ask.intent_where": "See where my money went",
  "ask.intent_where_q": "Where did my money go this month?",
  "ask.intent_plan": "Plan a purchase",
  "ask.intent_plan_q": "How much can I spend on something new this month without going over?",
  "ask.composer_placeholder": "Ask anything about your money\u2026",
  "ask.history": "History",
  "ask.history_empty": "No conversations yet.",
  "ask.new_conversation": "New",
  "ask.delete": "Delete",
  "ask.busy": "Murmur is busy right now, try again in a moment.",
  "ask.plus_required": "Ask Murmur is part of Murmur Plus.",
  "ask.action_open_recurring": "Review recurring",
  "ask.action_log_expense": "Log an expense",
  "ask.action_create_rule": "Add a recurring rule",
  "ask.period_weekly": "weekly",
  "ask.period_biweekly": "biweekly",
  "ask.period_monthly": "monthly",
  "ask.period_quarterly": "quarterly",
  "ask.period_yearly": "yearly",
  "ask.insight_unnamed_rule": "Unnamed",
  "ask.insight_upcoming_title": "{name} {amount} due {date}",
  "ask.insight_upcoming_detail_income": "With {due} of bills still due, that leaves {left} this month.",
  "ask.insight_upcoming_detail_noincome": "{due} of bills still due this month.",
  "ask.insight_upcoming_question": "What's coming up, and what does that leave me this month?",
  "ask.insight_upcoming_action": "Review recurring",
  "ask.insight_budget_over_title": "Over budget by {over}",
  "ask.insight_budget_over_detail": "{days} days left in your {period} budget.",
  "ask.insight_budget_tight_title": "{left} left for {days} days",
  "ask.insight_budget_tight_detail": "That's {pace}/day, your usual is {usual}/day.",
  "ask.insight_budget_ok_title": "On track: {left} left for {days} days",
  "ask.insight_budget_ok_detail": "{pace}/day keeps you within budget; you usually spend {usual}/day.",
  "ask.insight_budget_pace_only": "That's {pace}/day to stay within budget.",
  "ask.insight_budget_question": "How am I doing against my budget?",
  "ask.insight_budget_action": "Adjust budget",
  "ask.insight_surge_title": "{category} {amount} so far this month",
  "ask.insight_surge_detail": "{pct}% over your usual by this point in the month.",
  "ask.insight_surge_question": "Why is {category} over this month?",
  "ask.insight_surge_action": "See transactions",
  "ask.insight_subs_title_one": "{a} takes {total} every month",
  "ask.insight_subs_title_two": "{a} + {b} take {total} every month",
  "ask.insight_subs_title_many": "{a}, {b} + {n} more take {total} every month",
  "ask.insight_subs_detail": "Keep or cut?",
  "ask.insight_subs_question": "Which of my recurring bills should I keep or cut?",
  "ask.insight_delta_title": "{category}: biggest change vs last month",
  "ask.insight_delta_detail_up": "{delta} more than by this point last month.",
  "ask.insight_delta_detail_down": "{delta} less than by this point last month.",
  "ask.insight_delta_question": "What changed in {category} compared with last month?",
  "ask.insight_netflow_title": "Spent {spent} of {income} so far this month",
  "ask.insight_netflow_detail": "{left} left, {days} days to go.",
  "ask.insight_netflow_over_title": "Spent {over} more than you earned this month",
  "ask.insight_netflow_over_detail": "{spent} out, {income} in so far.",
  "ask.insight_netflow_question": "How am I doing overall this month?",
  "ask.insight_large_title": "{merchant} {amount} on {date}",
  "ask.insight_large_detail": "{times}\xD7 your typical purchase.",
  "ask.insight_large_question": "Tell me about the {merchant} charge.",
  "ask.insight_large_action": "See transaction",
  "ask.insight_nodata_title": "Log a few expenses and Murmur starts watching your money",
  "ask.insight_nodata_detail": "Once there's data, upcoming bills, budget pace and unusual spending show up here.",
  "ask.insight_nodata_question": "What can you help me with?",
  "ask.insight_nodata_action": "Log an expense",
  "ask.continue_eyebrow": "Pick up where you left off",
  "ask.continue_open": "Continue",
  "ask.kind_upcoming_bill": "Upcoming bill",
  "ask.kind_budget_pace": "Budget",
  "ask.kind_category_surge": "Running high",
  "ask.kind_subscriptions": "Recurring",
  "ask.kind_month_delta": "Vs last month",
  "ask.kind_net_flow": "This month",
  "ask.kind_large_transaction": "Unusual purchase",
  "ask.kind_no_data": "Getting started",
  "help.title": "Help",
  "help.body": "Murmur is early. If something feels off or you have an idea, write us, it lands directly in the inbox of the person building it.",
  "help.body_no_contact": "Murmur is early, thanks for trying it. In-app support isn't live yet.",
  "help.contact": "Contact",
  "help.version": "Version",
  "recurring.title": "Recurring Transactions",
  "recurring.toggle": "Mark as recurring",
  "recurring.edit_scope_title": "Apply changes to which?",
  "recurring.edit_scope_body": "This transaction was generated by a recurring rule. Update just this one, or this one and every future occurrence?",
  "recurring.edit_scope_one": "Just this one",
  "recurring.edit_scope_all_future": "This and all future",
  "recurring.frequency": "Frequency",
  "recurring.daily": "Daily",
  "recurring.weekly": "Weekly",
  "recurring.biweekly": "Bi-weekly",
  "recurring.monthly": "Monthly",
  "recurring.quarterly": "Quarterly",
  "recurring.yearly": "Yearly",
  "recurring.short_daily": "/day",
  "recurring.short_weekly": "/wk",
  "recurring.short_biweekly": "/2wk",
  "recurring.short_monthly": "/mo",
  "recurring.short_quarterly": "/qtr",
  "recurring.short_yearly": "/yr",
  "recurring.active": "Active",
  "recurring.paused": "Paused",
  "recurring.next_due": "Next due",
  "recurring.empty": "No recurring transactions",
  "recurring.empty_sub": "Set up recurring transactions to auto-track subscriptions, rent, and bills",
  "recurring.ai_detected": "AI detected this might be recurring",
  "recurring.ai_badge": "AI",
  "recurring.delete_confirm": "Delete this recurring rule?",
  "recurring.eyebrow_detected": "Detected automatically",
  "recurring.heading": "Recurring",
  "recurring.paid_monthly": "Paid monthly",
  "recurring.per_month": "/ month",
  "recurring.yearly_prefix": "That's",
  "recurring.yearly_suffix": "a year.",
  "recurring.pause": "Pause",
  "recurring.resume": "Resume",
  "recurring.overdue": "Overdue, pending generation",
  "recurring.inflow_monthly": "Plus {amount}/mo from income",
  "recurring.add_manually": "Add manually",
  "recurring.new_rule_title": "New recurring rule",
  "recurring.edit_rule_title": "Edit recurring rule",
  "recurring.name_label": "Name",
  "recurring.name_placeholder": "e.g. Netflix",
  "recurring.amount_label": "Amount",
  "recurring.currency_label": "Currency",
  "recurring.interval_label": "Repeat every",
  "recurring.interval_hint": "2 = every other cycle",
  "recurring.next_charge_label": "Next charge",
  "recurring.end_date_toggle": "This has an end date",
  "recurring.end_date_label": "Cancel from",
  "recurring.no_end_date": "No end date",
  "recurring.invalid_date": "Enter a valid date (YYYY-MM-DD)",
  "recurring.save_error": "Couldn't save this rule, try again.",
  "recurring.active_section": "Active",
  "recurring.paused_section": "Paused",
  "settings.recurring": "Recurring Transactions",
  "payment.cash": "Cash",
  "payment.credit_card": "Credit Card",
  "payment.debit_card": "Debit Card",
  "payment.digital_wallet": "Digital Wallet",
  "payment.bank_transfer": "Bank Transfer",
  "category.select": "Select category\u2026",
  "category.new": "New category",
  "category.name_placeholder": "Category name",
  "category.add": "Add",
  "category.create_error": "Could not create category. It may already exist.",
  "voice.merchant_placeholder": "e.g. Starbucks",
  "voice.got_it": "Got it",
  "voice.redo": "Redo",
  "voice.save_expense": "Save expense",
  "voice.save_income": "Save income",
  "voice.edit": "Edit",
  "voice.edit_expense": "Edit expense",
  "voice.edit_income": "Edit income",
  "voice.discard_expense": "Discard this expense",
  "voice.discard_income": "Discard this income",
  "voice.date_time": "Date & time",
  "voice.quick_entry": "Quick entry",
  "voice.saved": "Saved",
  "voice.type_instead": "Type instead",
  "settings.confirm_sign_out": "Are you sure?",
  "settings.invalid_budget": "Enter a valid budget amount.",
  "settings.budget_save_error": "Could not save budget.",
  "settings.period_weekly": "Weekly",
  "settings.period_biweekly": "Bi-weekly (every 2 weeks)",
  "settings.period_monthly": "Monthly",
  "settings.period_quarterly": "Quarterly",
  "settings.period_yearly": "Yearly",
  "settings.plan_free": "Free plan",
  "settings.plan_plus": "Murmur Plus",
  "settings.expenses_count": "expenses",
  "settings.upgrade": "Upgrade",
  "settings.voice_capture": "Voice & capture",
  "settings.voice_engine": "Voice engine",
  "settings.voice_engine_on_device": "Local speech-to-text",
  "settings.voice_engine_apple": "Apple speech recognition",
  "settings.review": "Review",
  "paywall.eyebrow": "Murmur Plus",
  "paywall.headline": "Get more from every murmur.",
  "paywall.body": "Ask Murmur, recurring detection, full export and the desktop companion, one subscription, cancel anytime.",
  "paywall.feature_desktop": "Desktop app with trends, forecasts & budgets",
  "paywall.feature_ask_murmur": "Ask Murmur, grounded AI over your data",
  "paywall.feature_auto_recurring": "Recurring subscription detection",
  "paywall.feature_export": "Export to CSV & PDF",
  "paywall.disclaimer": "Purchases aren't available in this build yet.",
  "settings.timezone": "Time Zone",
  "settings.sync": "Sync",
  "settings.sync_last_synced": "Last synced",
  "settings.sync_never": "Never",
  "settings.sync_in_progress": "Syncing\u2026",
  "settings.sync_queued_suffix": "queued",
  "settings.sync_issues": "Sync Issues",
  "settings.sync_issues_empty": "No sync issues",
  "settings.sync_failed_suffix": "failed",
  "settings.sync_unknown_error": "Unknown error",
  "settings.sync_retry_all": "Retry All",
  "settings.sync_discard": "Discard",
  "settings.sync_item_singular": "item couldn't sync",
  "settings.sync_item_plural": "items couldn't sync",
  "settings.sync_details": "Details",
  "settings.sync_hide": "Hide",
  "nav.transaction": "Transaction",
  "nav.add_expense": "Add Expense",
  "nav.edit_transaction": "Edit Transaction",
  "recurring.add_rule_cta": "Add rule",
  "recurring.eyebrow": "Subscriptions, bills & income",
  "recurring.expenses_per_month": "Recurring expenses \xB7 per month",
  "recurring.income_per_month": "Recurring income",
  "recurring.hero_footnote": "Every schedule is shown as a per-month amount, a paycheck every 2 weeks counts 26 \xF7 12 times, a weekly bill 52 \xF7 12.",
  "recurring.expenses_section": "Expenses",
  "recurring.income_section": "Income",
  "budgets.applies_to": "Applies to",
  "budgets.scope_overall": "All spending",
  "budgets.by_category_empty": "No category budgets yet. Cap a single area, groceries, dining, shopping, and track it here.",
  "budgets.add_category_budget": "Add a category budget",
  "budgets.remove_confirm": "Remove this budget?",
  "paywall.plan_yearly": "Yearly",
  "paywall.plan_monthly": "Monthly",
  "paywall.per_year": "per year",
  "paywall.per_month": "per month",
  "paywall.equiv_per_month": "{price} / month",
  "paywall.best_value": "Best value",
  "paywall.save_pct": "Save {pct}%",
  "paywall.trial_badge": "{days} days free",
  "paywall.cta_trial": "Start {days}-day free trial",
  "paywall.cta_subscribe": "Subscribe \xB7 {price}",
  "paywall.fine_print_trial": "Free for {days} days, then {price} {period}. Renews automatically until cancelled in your Apple ID settings at least 24 hours before the period ends. Cancel anytime.",
  "paywall.fine_print": "{price} {period}. Renews automatically until cancelled in your Apple ID settings at least 24 hours before the period ends. Cancel anytime.",
  "paywall.restore": "Restore purchases",
  "paywall.terms": "Terms",
  "paywall.privacy": "Privacy",
  "paywall.loading": "Loading plans\u2026",
  "paywall.load_error": "Couldn't reach the App Store.",
  "paywall.retry": "Retry",
  "paywall.restore_none": "No previous purchase was found for this Apple ID.",
  "paywall.restore_done": "Your subscription is back.",
  "paywall.purchase_error": "The purchase didn't go through.",
  "paywall.pending": "Waiting for approval. Plus unlocks as soon as the purchase is approved.",
  "paywall.already_plus": "You're on Murmur Plus.",
  "paywall.manage": "Manage subscription",
  "paywall.processing": "Processing\u2026",
  "paywall.done": "Done",
  "settings.subscription": "Subscription",
  "settings.plan_trial": "Free trial \xB7 ends {date}",
  "settings.plan_active_renews": "Murmur Plus \xB7 {plan} \xB7 renews {date}",
  "settings.plan_active_ends": "Murmur Plus \xB7 {plan} \xB7 ends {date}",
  "settings.plan_lapsed": "Plus ended {date}",
  "settings.get_plus": "Get Murmur Plus",
  "settings.plan_row_free": "Free plan",
  "applepay.title": "Log Apple Pay purchases automatically",
  "applepay.body": "Set this up once. After that, every time you pay with a card in Wallet, Murmur saves the expense in the background, no app to open, nothing to type. Apple only allows this through a Shortcuts automation, so it takes six taps in the Shortcuts app.",
  "applepay.steps_label": "In the Shortcuts app",
  "applepay.step_1": "Open Shortcuts \u2192 Automation tab \u2192 tap +.",
  "applepay.step_2": "Choose Wallet (\u201CWhen I tap a Wallet card or pass\u201D). Select Any Card, Run Immediately, turn off Notify When Run \u2192 Next.",
  "applepay.step_3": "Tap New Blank Automation, then Add Action and search \u201CMurmur\u201D.",
  "applepay.step_4": "Pick \u201CLog Expense in Murmur\u201D.",
  "applepay.step_5": "Tap the Amount field \u2192 Select Variable \u2192 Shortcut Input \u2192 Amount. Tap the Merchant field \u2192 Shortcut Input \u2192 Merchant.",
  "applepay.step_6": "Tap Done. That\u2019s it, your next Apple Pay purchase saves itself.",
  "applepay.open_shortcuts": "Open Shortcuts",
  "applepay.install_shortcut": "Or install the ready-made shortcut",
  "applepay.footnote": "Murmur only receives the amount and merchant Wallet passes to the automation. Refunds are ignored. You can edit or undo any saved purchase from the list.",
  "settings.apple_pay_capture": "Apple Pay capture",
  "settings.apple_pay_capture_detail": "Save purchases automatically",
  "applepay.uncategorised": "Uncategorised",
  "applepay.tap_to_edit": "Tap to edit",
  "applepay.notif_title": "Get a confirmation for each purchase",
  "applepay.notif_body": "Allow notifications so Murmur can tell you what it saved, with Undo and Edit right there.",
  "applepay.notif_allow": "Allow notifications",
  "applepay.notif_denied": "Notifications are off for Murmur, enable them in Settings \u2192 Notifications to see confirmations.",
  "common.edit": "Edit",
  "applepay.notif_captured": "Captured from Apple Pay",
  "applepay.amount_unknown": "Couldn't read the amount \xB7 Tap to add it",
  "insights.highlights": "Highlights",
  "income.name_prompt_title": "Who pays you?",
  "income.name_prompt_body": "Give your recurring income a name, like your employer or client. Murmur uses it on the record and for the logo.",
  "income.name_prompt_later": "Later",
  "welcome.demo_transcript": "Twelve fifty at Chipotle",
  "welcome.demo_merchant": "Chipotle",
  "welcome.demo_category": "Food & Drink",
  "welcome.trust": "No bank logins. Audio is never stored.",
  "onboarding.setup.headline": "Here's how Murmur is set up.",
  "onboarding.setup.lead": "We read these from your phone. Tap one to change it.",
  "onboarding.setup.voice": "Listens in",
  "onboarding.setup.voice_hint": "Follows your language",
  "onboarding.setup.currency_hint": "Every amount is shown in this currency",
  "onboarding.setup.cta": "Looks right",
  "onboarding.first_log.headline": "Try it now.",
  "onboarding.first_log.lead": "Tap the mic and say your last purchase, the way you'd tell a friend.",
  "onboarding.first_log.example_label": "For example",
  "onboarding.first_log.tap": "Tap to speak",
  "onboarding.first_log.mic_note": "Murmur will ask to use the microphone. Audio is never stored.",
  "onboarding.first_log.later": "I'll do it later",
  "onboarding.first_log.filed_title": "Filed.",
  "onboarding.first_log.filed_body": "That's the whole habit: say it when you pay.",
  "onboarding.habit.headline": "Never miss one.",
  "onboarding.habit.lead": "Without a bank connection, Murmur only knows what you tell it. Two ways to make that effortless.",
  "onboarding.habit.checkin_title": "Evening check-in",
  "onboarding.habit.checkin_body": "One gentle reminder a day, skipped on days you've already logged.",
  "onboarding.habit.notif_note": "Continue, and Murmur will ask to send notifications.",
  "onboarding.habit.applepay_title": "Apple Pay, logged for you",
  "onboarding.habit.applepay_body": "Pay with your iPhone and the expense files itself. One minute to set up.",
  "onboarding.habit.applepay_toggle": "Set it up next",
  "reminders.checkin_title": "Anything to add from today?",
  "reminders.checkin_body": "Say it in one sentence. Murmur files it.",
  "reminders.quiet3_title": "A few quiet days",
  "reminders.quiet3_body": "Anything from the last few days? One sentence each is enough.",
  "reminders.quiet7_title": "Your week in one minute",
  "reminders.quiet7_body": "Catch up on this week's spending while you still remember it.",
  "reminders.prime_title": "Want a nudge if you forget?",
  "reminders.prime_body": "One evening check-in a day, skipped on days you've already logged. Change it any time in Settings.",
  "settings.checkin_label": "Evening check-in",
  "settings.checkin_time": "Check-in time",
  "settings.notifications_off": "Notifications are off for Murmur. Turn them on in Settings to get reminders.",
  "voice.mic_denied": "Murmur can't hear you yet. Turn on Microphone and Speech Recognition for Murmur in Settings, or type it instead.",
  "common.open_settings": "Open Settings",
  "common.not_now": "Not now",
  "start.title": "Getting started",
  "start.progress": "{done} of {total}",
  "start.first_expense": "Log your first expense",
  "start.budget": "Set a monthly budget",
  "start.income": "Add your income",
  "start.applepay": "Log Apple Pay automatically",
  "privacy.group_improve": "Help improve Murmur",
  "privacy.analytics_label": "Anonymous usage data",
  "privacy.crash_label": "Crash reports",
  "auth.email_confirmed": "Email confirmed",
  "auth.email_confirmed_body": "Sign in to continue.",
  "voice.recognizer_error": "Murmur couldn't hear that clearly. Try again, or type it instead.",
  "voice.parse_failed": "Couldn't file that. Check your connection and try again.",
  "common.save_failed": "Couldn't save. Check your connection and try again.",
  "onboarding.setup.privacy_note": "Murmur keeps anonymous usage and crash data so we can fix what breaks. Never your transactions, amounts or what you say. Turn it off any time in Settings, Privacy Center.",
  "privacy.improve_note": "On by default. Anonymous, kept by us, never shared. Never your transactions, amounts or what you say.",
  "start.collapse": "Collapse",
  "start.expand": "Show the steps",
  "start.more": "More options",
  "start.remove": "Remove",
  "start.remove_title": "Remove Getting started?",
  "start.remove_body": "It won't come back. You can still set a budget in Budgets, and add your income or Apple Pay capture in Settings.",
  "voice.nothing_heard_title": "Nothing heard",
  "voice.nothing_heard_body": "Tap the mic and say it out loud, for example: \u201C{example}\u201D.",
  "voice.mic_off_title": "Microphone is off",
  "voice.recognizer_error_title": "Didn't catch that",
  "voice.parse_failed_title": "Couldn't file that",
  "notif.billing_issue_title": "Your payment did not go through",
  "notif.billing_issue_body": "Plus is paused. Updating your payment method brings it straight back.",
  "notif.billing_issue_body_grace": "Plus keeps working for {days} more days while the store retries.",
  "notif.trial_ending_title": "Your free trial ends soon",
  "notif.trial_ending_body": "Plus begins in {days} days. Cancel any time in Settings.",
  "notif.trial_ending_off_title": "Your trial ends soon",
  "notif.trial_ending_off_body": "Auto renew is off, so nothing will be charged. Plus stops when the trial ends.",
  "notif.plus_lapsed_title": "Plus has ended",
  "notif.plus_lapsed_body": "Everything you logged is still here. Plus features are switched off.",
  "notif.bill_tomorrow_title": "{name}, {amount}, lands tomorrow",
  "notif.bill_tomorrow_body_left": "{left} left this month once it clears.",
  "notif.bill_tomorrow_body": "{due} still due before month end.",
  "notif.bill_week_title": "{count} bills this week, {amount}",
  "notif.bill_week_body": "First up: {name}, {amount}.",
  "notif.bill_missing_title": "{name} has not shown up",
  "notif.bill_missing_body": "It was due a few days ago. Log it if it went through another way.",
  "notif.budget_over_title": "Over budget by {over}",
  "notif.budget_over_body": "{days} days still to go.",
  "notif.budget_category_over_title": "{category} is over by {over}",
  "notif.budget_80_title": "{pct}% of your budget, {days} days left",
  "notif.budget_80_body": "{perDay} a day keeps you inside. {left} left.",
  "notif.weekly_recap_title": "Last week: {amount}",
  "notif.weekly_recap_body_top": "{count} entries. {category} was the biggest at {amount}.",
  "notif.weekly_recap_body": "{count} entries logged.",
  "notif.winback_14_title": "Two weeks since your last entry",
  "notif.winback_14_body": "One sentence catches you back up.",
  "notif.winback_30_title": "Your ledger has been quiet a month",
  "notif.winback_30_body": "Pick it up with today's first expense.",
  "notif.winback_60_title": "Still here when you want it",
  "notif.winback_60_body": "Everything you logged is waiting, exactly as you left it.",
  "notif.winback_bills_title": "{count} bills are still on your calendar",
  "notif.winback_bills_body": "{name} at {amount} is next. Want Murmur to keep watch?",
  "notifsettings.title": "Notifications",
  "notifsettings.hint": "Murmur sends at most one a day, and never more than a few a week.",
  "notifsettings.family_money": "Billing and account",
  "notifsettings.family_money_hint": "A failed payment or a trial ending. Always sent.",
  "notifsettings.family_bills": "Bills coming up",
  "notifsettings.family_bills_hint": "A charge landing tomorrow, and what is left after it.",
  "notifsettings.family_budget": "Budget",
  "notifsettings.family_budget_hint": "When you are close to your limit, or past it.",
  "notifsettings.family_receipts": "Receipts",
  "notifsettings.family_receipts_hint": "Confirmation when something is saved for you.",
  "notifsettings.family_insights": "Weekly recap and insights",
  "notifsettings.family_insights_hint": "Your week in a line, and anything unusual.",
  "notifsettings.family_habit": "Reminders",
  "notifsettings.family_habit_hint": "A nudge if you have been away a while.",
  "notifsettings.quiet_hours": "Quiet hours",
  "notifsettings.quiet_hours_value": "{start} to {end}",
  "notifsettings.max_per_week": "At most per week",
  "notifsettings.max_per_week_value": "{count} a week",
  "notifsettings.always_on": "Always on",
  "notifsettings.permission_off": "Notifications are off for Murmur. Turn them on in Settings to receive these.",
  "ask.free_quota": "{count} free questions left this month",
  "ask.free_quota_one": "1 free question left this month",
  "ask.free_quota_none": "No free questions left this month",
  "ask.get_plus": "Get Plus",
  "plus.unlock": "Unlock with Plus",
  "insights.locked_history_title": "Your year, month by month",
  "insights.locked_history_body": "Compare months, see the drift, and read the whole picture instead of this one month.",
  "insights.locked_forecast_title": "Where this month lands",
  "insights.locked_forecast_body": "Murmur projects the rest of the month from your pace and the bills still to come.",
  "insights.locked_month_title": "Past months are Plus",
  "insights.this_month_free": "This month",
  "trial.ending_days": "Your week of Plus ends in {days} days",
  "trial.ending_tomorrow": "Your week of Plus ends tomorrow",
  "trial.ending_today": "Your week of Plus ends today",
  "trial.ending_body": "Ask Murmur, the desktop app, automatic recurring detection and reports. Logging stays free either way.",
  "trial.keep": "Keep Plus",
  "trial.ended_title": "Your week of Plus has ended",
  "trial.ended_body": "You are on Murmur Free: unlimited logging, budgets and this month's insights, forever."
};

// packages/shared/src/i18n/locales/fr.json
var fr_default = {
  "app.name": "Murmur",
  "home.greeting": "Salut,",
  "home.net_balance": "Solde Net Ce Mois",
  "home.income": "Revenus",
  "home.expenses": "D\xE9penses",
  "home.recent_activity": "Activit\xE9 R\xE9cente",
  "home.view_all": "Voir Tout",
  "home.see_all_transactions": "Voir les {count} transactions",
  "home.safe_to_spend": "Disponible",
  "home.over_budget": "Budget d\xE9pass\xE9 de",
  "home.set_budget": "D\xE9finir un budget pour suivre vos d\xE9penses",
  "home.spent_weekly": "D\xE9pens\xE9 cette semaine",
  "home.spent_biweekly": "D\xE9pens\xE9 (14 derniers jours)",
  "home.spent_quarterly": "D\xE9pens\xE9 ce trimestre",
  "home.spent_yearly": "D\xE9pens\xE9 cette ann\xE9e",
  "home.spent_monthly": "D\xE9pens\xE9 ce mois",
  "home.budget_weekly": "Budget hebdomadaire",
  "home.budget_biweekly": "Budget bimensuel",
  "home.budget_quarterly": "Budget trimestriel",
  "home.budget_yearly": "Budget annuel",
  "home.budget_monthly": "Budget mensuel",
  "home.upcoming": "\xC0 venir",
  "home.spent_today": "D\xE9pens\xE9 aujourd'hui",
  "home.left_this_month": "restants ce mois-ci",
  "home.left_this_week": "restants cette semaine",
  "home.left_this_period": "restants sur cette p\xE9riode",
  "home.over_budget_suffix": "au-dessus du budget",
  "home.days_left_week": "jours restants cette semaine",
  "home.days_to_go": "jours restants",
  "home.first_expense": "Appuyez sur le micro pour enregistrer votre premi\xE8re d\xE9pense",
  "home.day_one_progress": "Votre premi\xE8re d\xE9pense",
  "home.day_one_headline": "Essayez avec votre caf\xE9 du matin.",
  "home.day_one_body": "Appuyez sur le micro et dites quelque chose comme \xE7a. Pas besoin d'une phrase pr\xE9cise. Murmur comprend.",
  "home.day_one_example_1": '"Quatre cinquante \xE0 la boulangerie"',
  "home.day_one_example_2": '"Douze euros chez Blue Bottle, caf\xE9"',
  "home.day_one_example_3": '"Trente balles Uber ce matin"',
  "home.day_one_or": "Ou",
  "home.day_one_type_instead": "\xE9crire \xE0 la place",
  "home.net": "Net",
  "voice.page_title": "Enregistrer",
  "voice.title": "Quelle est la transaction ?",
  "voice.subtitle": "Parlez naturellement, l'IA s'occupe du reste",
  "voice.transcript_placeholder": "Vos mots appara\xEEtront ici...",
  "listening.eyebrow": "\xC0 l'\xE9coute",
  "listening.processing": "Traitement",
  "listening.detected": "D\xE9tect\xE9",
  "listening.waiting": "En attente de votre montant\u2026",
  "listening.processed_on_device": "Trait\xE9 de fa\xE7on s\xE9curis\xE9e",
  "voice.save": "Enregistrer",
  "voice.parsed_expense": "Transaction Analys\xE9e",
  "voice.amount": "Montant",
  "voice.merchant": "Marchand",
  "voice.category": "Cat\xE9gorie",
  "voice.tab_voice": "Voix",
  "voice.tab_manual": "Manuel",
  "voice.tap_to_stop": "Appuyer pour arr\xEAter",
  "voice.tap_to_record": "Appuyer pour enregistrer",
  "voice.parsing": "Analyse en cours...",
  "voice.scan_receipt": "Scanner un Re\xE7u",
  "voice.scan_paycheck": "Scanner une Fiche de Paie",
  "voice.expense": "D\xE9pense",
  "voice.income_label": "Revenu",
  "voice.merchant_source": "Marchand / Source",
  "voice.note": "Note (facultatif)",
  "voice.note_placeholder": "Ajouter une note...",
  "voice.more_options": "Plus d'options",
  "voice.add_expense": "Ajouter la d\xE9pense",
  "voice.add_income": "Ajouter le revenu",
  "voice.no_transcript": "Nous n'avons rien capt\xE9, appuyez sur le micro pour r\xE9essayer.",
  "voice.payment_method": "Mode de Paiement",
  "voice.low_confidence": "Faible confiance, veuillez v\xE9rifier les d\xE9tails ci-dessus",
  "voice.ai_suggests": "Suggestion IA :",
  "voice.invalid_amount": "Montant invalide",
  "voice.invalid_amount_msg": "Entrez un montant valide sup\xE9rieur \xE0 0",
  "voice.amount_too_large": "Ce montant est trop \xE9lev\xE9, entrez une valeur inf\xE9rieure \xE0 9 999 999 999,99.",
  "voice.amount_too_many_decimals": "Les montants peuvent avoir au plus 2 d\xE9cimales.",
  "voice.permission_required": "Permission requise",
  "voice.camera_permission": "L'acc\xE8s \xE0 la cam\xE9ra est n\xE9cessaire pour scanner les re\xE7us.",
  "voice.scan_failed": "\xC9chec du scan",
  "voice.scan_rejected_title": "Impossible de lire ce scan",
  "voice.retake": "Reprendre",
  "voice.enter_manually": "Saisir manuellement",
  "voice.save_changes": "Enregistrer les modifications",
  "transactions.title": "Activit\xE9",
  "transactions.search": "Rechercher des transactions...",
  "transactions.all_time": "Tout l'historique",
  "transactions.pick_month": "Choisir un mois",
  "transactions.count_one": "1 transaction",
  "transactions.count_many": "{count} transactions",
  "transactions.filter": "Filtrer",
  "transactions.today": "Aujourd'hui",
  "transactions.yesterday": "Hier",
  "transactions.empty": "Aucune transaction",
  "transactions.empty_search": "Aucun r\xE9sultat",
  "transactions.uncategorized": "Non cat\xE9goris\xE9",
  "transactions.unknown": "Inconnu",
  "transactions.filter_all": "Tout",
  "detail.title": "D\xE9tail de la D\xE9pense",
  "detail.category": "Cat\xE9gorie",
  "detail.payment": "Mode de Paiement",
  "detail.source": "Source",
  "detail.note": "Note",
  "detail.recurring": "R\xE9current",
  "detail.transcript": "Transcription Vocale",
  "detail.date": "Date",
  "detail.logged_via": "Source",
  "source.voice": "Voix",
  "source.manual": "Manuel",
  "source.scan": "Scan de re\xE7u",
  "source.shortcut": "Raccourci Apple Pay",
  "source.notification": "Notification de paiement",
  "source.recurring": "R\xE9current \xB7 g\xE9n\xE9r\xE9 automatiquement",
  "detail.edit": "Modifier",
  "detail.delete": "Supprimer",
  "detail.delete_title": "Supprimer la transaction",
  "detail.delete_msg": "Cette action est irr\xE9versible.",
  "detail.deleted": "Supprim\xE9",
  "detail.not_found": "Transaction introuvable",
  "common.cancel": "Annuler",
  "common.dismiss": "Fermer",
  "settings.reminders": "Rappels",
  "settings.dunning_label": "Me relancer si j'arr\xEAte",
  "settings.privacy_data": "Confidentialit\xE9 et donn\xE9es",
  "settings.export_label": "Exporter les transactions",
  "settings.export_detail_plus": "CSV \xB7 JSON \xB7 PDF",
  "settings.export_detail_free": "Murmur Plus",
  "export.picker_title": "Format d'export",
  "export.fmt_csv_label": "Tableur (.csv)",
  "export.fmt_csv_hint": "Pour Excel, Numbers, Google Sheets.",
  "export.fmt_json_label": "Donn\xE9es brutes (.json)",
  "export.fmt_json_hint": "Export structur\xE9 complet. Id\xE9al pour sauvegarde ou autres outils.",
  "export.fmt_pdf_label": "Rapport imprimable (.pdf)",
  "export.fmt_pdf_hint": "Registre format\xE9 \xE0 imprimer ou envoyer.",
  "export.share_dialog_title": "Enregistrer l'export Murmur",
  "export.failed_title": "\xC9chec de l'export",
  "export.pdf_eyebrow": "Murmur \xB7 Transactions",
  "export.pdf_title": "Vos transactions",
  "export.pdf_total_label": "Total d\xE9pens\xE9",
  "export.pdf_count_label": "Entr\xE9es",
  "export.col_date": "Date",
  "export.col_merchant": "Commer\xE7ant",
  "export.col_category": "Cat\xE9gorie",
  "export.col_amount": "Montant",
  "export.pdf_footer": "Export\xE9 depuis Murmur. Vos donn\xE9es, vos r\xE8gles.",
  "home.pattern_eyebrow": "Nouveau motif",
  "home.pattern_title": "On dirait que {merchant} revient \xE0 {amount} {frequency}.",
  "home.pattern_body": "Rep\xE9r\xE9 {count} fois. Voulez-vous que Murmur le suive automatiquement ?",
  "home.pattern_accept": "Activer",
  "home.pattern_dismiss": "Pas maintenant",
  "insights.unlock_eyebrow": "Insights d\xE9bloqu\xE9s",
  "insights.unlock_title": "Trois saisies. Les tendances arrivent.",
  "insights.unlock_body": "Il y a maintenant assez de donn\xE9es pour que Murmur r\xE9v\xE8le vos tendances, vos commer\xE7ants principaux et o\xF9 va votre mois.",
  "common.skip": "Passer",
  "common.continue": "Continuer",
  "onboarding.welcome.headline": "Dites-le.\nD\xE9pensez clair.",
  "onboarding.income.source_label": "Source (optionnel)",
  "onboarding.income.source_placeholder": "ex. Microsoft, freelance, pourboires\u2026",
  "onboarding.income.per_month": "par mois",
  "onboarding.income.default_name": "Salaire",
  "onboarding.income.txn_note": "Revenu mensuel (d\xE9fini pendant l'int\xE9gration)",
  "common.confirm": "Confirmer",
  "common.ok": "OK",
  "common.undo": "Annuler l'action",
  "common.save": "Sauvegarder",
  "common.done": "Termin\xE9",
  "common.yes": "Oui",
  "common.no": "Non",
  "common.none": "Aucun",
  "common.loading": "Chargement...",
  "common.error": "Une erreur est survenue",
  "common.load_failed": "Impossible de charger vos donn\xE9es",
  "common.retry": "R\xE9essayer",
  "common.back": "Retour",
  "auth.sign_in": "Se Connecter",
  "auth.sign_up": "S'inscrire",
  "auth.sign_out": "Se D\xE9connecter",
  "auth.email": "Email",
  "auth.password": "Mot de passe",
  "auth.continue_apple": "Continuer avec Apple",
  "auth.continue_google": "Continuer avec Google",
  "auth.welcome_back": "Bon retour",
  "auth.sign_in_continue": "Connectez-vous pour continuer",
  "auth.or_continue_with": "ou continuer avec",
  "auth.no_account": "Pas encore de compte ?",
  "auth.create_one": "Cr\xE9er un compte",
  "auth.has_account": "D\xE9j\xE0 un compte ?",
  "auth.sign_in_link": "Se connecter",
  "auth.create_account": "Cr\xE9er un compte",
  "auth.track_voice": "Suivez vos d\xE9penses avec votre voix",
  "auth.create_account_btn": "Cr\xE9er un compte",
  "auth.password_short": "Mot de passe trop court",
  "auth.password_min": "Le mot de passe doit comporter au moins 6 caract\xE8res.",
  "auth.confirm_password": "Confirmer le mot de passe",
  "auth.passwords_no_match": "Ces deux mots de passe ne correspondent pas.",
  "auth.password_placeholder": "Au moins 6 caract\xE8res",
  "auth.sign_in_failed": "\xC9chec de la connexion",
  "auth.sign_up_failed": "\xC9chec de l'inscription",
  "auth.apple_failed": "\xC9chec de la connexion Apple",
  "auth.google_failed": "\xC9chec de la connexion Google",
  "auth.check_email": "V\xE9rifiez votre email",
  "auth.confirmation_sent": "Nous avons envoy\xE9 un lien de confirmation \xE0 {email}. Cliquez dessus pour activer votre compte.",
  "auth.back_to_sign_in": "Retour \xE0 la connexion",
  "auth.more_options": "Plus d'options",
  "auth.hide_email_form": "Masquer les options par e-mail",
  "auth.privacy_note": "Vos donn\xE9es vous appartiennent. Nous ne les vendons jamais. Votre e-mail sert uniquement \xE0 vous garder connect\xE9.",
  "auth.forgot_password": "Mot de passe oubli\xE9 ?",
  "auth.forgot_password_need_email": "Saisissez d'abord votre e-mail ci-dessus.",
  "auth.reset_email_sent": "Nous avons envoy\xE9 un lien de r\xE9initialisation \xE0 {email}. Ouvrez-le sur cet appareil pour d\xE9finir un nouveau mot de passe.",
  "auth.reset_failed": "\xC9chec de la r\xE9initialisation",
  "auth.new_password_title": "D\xE9finir un nouveau mot de passe",
  "auth.new_password_body": "Choisissez un nouveau mot de passe pour votre compte.",
  "auth.update_password": "Mettre \xE0 jour le mot de passe",
  "auth.password_updated": "Mot de passe mis \xE0 jour",
  "auth.reset_link_invalid": "Ce lien de r\xE9initialisation est invalide ou a expir\xE9. Demandez-en un nouveau depuis l'\xE9cran de connexion.",
  "settings.title": "Param\xE8tres",
  "settings.budget": "Budget Mensuel",
  "settings.monthly_income": "Revenu Mensuel",
  "settings.income_amount": "Montant",
  "settings.income_source_helper": "Optionnel. Si vous ajoutez le nom d'une entreprise, nous afficherons son logo sur vos entr\xE9es de revenus.",
  "settings.currency": "Devise",
  "settings.currency_confirm_title": "Changer de devise ?",
  "settings.currency_confirm_body_prefix": "Cela convertira",
  "settings.currency_confirm_body_suffix": "transactions, ainsi que vos budgets et revenus mensuels, dans la nouvelle devise au taux de change du jour. Cette action ne peut pas \xEAtre annul\xE9e automatiquement.",
  "settings.currency_confirm_action": "Convertir",
  "settings.currency_converting": "Conversion de votre historique\u2026",
  "settings.currency_offline_title": "Vous \xEAtes hors ligne",
  "settings.currency_offline_body": "Le changement de devise n\xE9cessite une connexion pour qu'aucune donn\xE9e ne reste \xE0 moiti\xE9 convertie. R\xE9essayez une fois reconnect\xE9.",
  "settings.currency_failed_title": "\xC9chec du changement de devise",
  "settings.language": "Langue",
  "settings.account": "Compte",
  "settings.display_name": "Nom d'affichage",
  "settings.preferences": "Pr\xE9f\xE9rences",
  "settings.developer": "D\xE9veloppeur",
  "settings.ai_server_url": "URL du serveur IA",
  "settings.about": "\xC0 propos",
  "settings.version": "Version",
  "settings.budget_hint": "D\xE9finissez votre budget. Le disponible suivra votre solde restant.",
  "settings.budget_period": "P\xE9riode budg\xE9taire",
  "settings.payment_notifications": "Notifications de paiement",
  "settings.disable_notifications": "D\xE9sactiver les notifications de paiement",
  "settings.disable_notifications_msg": "Pour d\xE9sactiver, ouvrez Param\xE8tres > Applications > Acc\xE8s sp\xE9cial > Acc\xE8s aux notifications et retirez cette app.",
  "settings.ai_url_hint": "Entrez l'URL de votre serveur Next.js local (ex : http://192.168.1.5:3000). Modifiable sans reconstruire l'app.",
  "settings.reset_default": "R\xE9initialiser par d\xE9faut",
  "settings.your_name": "Votre nom",
  "tabs.home": "Accueil",
  "tabs.today": "Aujourd'hui",
  "tabs.expenses": "D\xE9penses",
  "tabs.record": "Enregistrer",
  "tabs.insights": "Analyses",
  "insights.eyebrow_this_month": "Ce mois",
  "insights.heading": "Analyses",
  "insights.spent": "D\xE9pens\xE9",
  "insights.vs": "vs",
  "insights.last_n_days_prefix": "Derniers",
  "insights.last_n_days_suffix": "jours",
  "insights.history": "Historique",
  "insights.categories": "Cat\xE9gories",
  "insights.other": "Autres",
  "insights.empty": "Aucune d\xE9pense sur cette p\xE9riode.",
  "insights.select_month": "Choisir un mois",
  "insights.forecast": "Pr\xE9vision",
  "insights.forecast_line_prefix": "\xC0 ce rythme, environ",
  "insights.forecast_line_suffix": "d'ici la fin de {month}.",
  "insights.forecast_below": "de moins que d'habitude.",
  "insights.forecast_above": "de plus que d'habitude.",
  "insights.forecast_same": "Pile dans la moyenne.",
  "tabs.budgets": "Budgets",
  "tabs.settings": "Param\xE8tres",
  "tabs.more": "Plus",
  "more.title": "Plus",
  "more.section_activity": "Activit\xE9",
  "more.section_intelligence": "Intelligence",
  "more.section_account": "Compte",
  "more.history": "Historique",
  "more.transactions": "Transactions",
  "history.heading_eyebrow": "Historique",
  "history.months": "Mois",
  "history.in_progress": "En cours",
  "history.browse_all": "Parcourir toutes les transactions",
  "history.prev_month": "Mois pr\xE9c\xE9dent",
  "history.next_month": "Mois suivant",
  "history.empty": "Rien enregistr\xE9 pour l'instant. Enregistrez votre premi\xE8re d\xE9pense pour d\xE9marrer la carte.",
  "more.recurring": "Transactions r\xE9currentes",
  "more.ask": "Ask Murmur",
  "more.settings": "Param\xE8tres",
  "more.privacy": "Centre de confidentialit\xE9",
  "more.help": "Aide",
  "budgets.title": "Budgets",
  "budgets.empty_title": "Les budgets arrivent bient\xF4t",
  "budgets.empty_body": "Un anneau pour le mois et la progression par cat\xE9gorie. Dans la prochaine version.",
  "budgets.left_of": "sur",
  "budgets.over_by": "d\xE9passement de",
  "budgets.status_on_pace": "Dans le rythme",
  "budgets.status_tight": "Serr\xE9",
  "budgets.status_over": "D\xE9pass\xE9",
  "budgets.no_budget_title": "Aucun budget d\xE9fini",
  "budgets.no_budget_body": "D\xE9finissez un budget mensuel pour que l'anneau vous indique si vous \xEAtes serr\xE9, d\xE9pass\xE9, ou dans le rythme.",
  "budgets.set_budget_cta": "D\xE9finir un budget",
  "budgets.edit_budget": "Modifier le budget",
  "budgets.by_category": "Par cat\xE9gorie",
  "budgets.committed": "encore \xE0 payer",
  "budgets.ring_used": "utilis\xE9",
  "privacy.title": "Votre argent, \xE0 vous.",
  "privacy.lead": "Murmur ne se connecte jamais \xE0 votre banque, et votre voix est trait\xE9e sur votre t\xE9l\xE9phone d\xE8s que votre appareil le permet. Tout ce que vous enregistrez vous appartient : exportez-le ou effacez-le ci-dessous, \xE0 tout moment. Le d\xE9tail complet se trouve dans la politique de confidentialit\xE9.",
  "privacy.group_rights": "Vos donn\xE9es",
  "privacy.group_legal": "Mentions l\xE9gales",
  "privacy.policy_label": "Politique de confidentialit\xE9",
  "privacy.terms_label": "Conditions d'utilisation",
  "privacy.export_all": "Exporter toutes mes donn\xE9es",
  "privacy.export_all_busy": "Pr\xE9paration de l'export\u2026",
  "privacy.export_all_failed": "Impossible d'exporter vos donn\xE9es",
  "privacy.delete_all": "Supprimer le compte",
  "privacy.delete_all_title": "Supprimer votre compte ?",
  "privacy.delete_all_body": "Cette action supprime d\xE9finitivement votre compte Murmur et tout ce qu'il contient : transactions, budgets, r\xE8gles r\xE9currentes, cat\xE9gories et conversations Ask. Un abonnement Murmur Plus est g\xE9r\xE9 par Apple et n'est pas annul\xE9 par la suppression du compte. Action irr\xE9versible.",
  "privacy.delete_all_confirm": "Supprimer le compte",
  "privacy.delete_all_busy": "Suppression du compte\u2026",
  "privacy.delete_all_failed": "Impossible de supprimer votre compte",
  "ask.title": "Ask Murmur.",
  "ask.lead": "Fond\xE9 sur vos propres transactions. Pas de conseils g\xE9n\xE9riques, vos donn\xE9es, vos chiffres, une r\xE9ponse directe.",
  "ask.beta": "B\xEAta",
  "ask.suggestion_afford": "Puis-je me permettre une PS5 ce mois-ci ?",
  "ask.suggestion_coffee": "O\xF9 part mon budget caf\xE9 ?",
  "ask.suggestion_unusual": "Pourquoi ai-je d\xE9pens\xE9 plus que d'habitude la semaine derni\xE8re ?",
  "ask.suggestion_goal": "Aide-moi \xE0 \xE9conomiser 500 \u20AC d'ici ao\xFBt.",
  "ask.input_placeholder": "Posez une question sur vos d\xE9penses\u2026",
  "ask.mic_label": "Question vocale",
  "ask.send_label": "Envoyer la question",
  "ask.privacy_note": "Vos donn\xE9es n'entra\xEEnent jamais un mod\xE8le",
  "ask.header_title": "Ask Murmur",
  "ask.thinking": "Lecture de vos transactions\u2026",
  "ask.error": "Impossible de joindre Ask Murmur. R\xE9essayez dans un instant.",
  "ask.retry": "R\xE9essayer",
  "ask.followup_placeholder": "Question de suivi\u2026",
  "ask.attribution": "Bas\xE9 sur {count} transactions dans Murmur. Aucune supposition, aucun conseil externe.",
  "ask.refusal_default": "Je peux uniquement r\xE9pondre \xE0 partir de vos propres transactions, et cela d\xE9passe ce que je peux voir.",
  "ask.action_create_goal": "Cr\xE9er un objectif",
  "ask.action_show_category": "Voir la cat\xE9gorie",
  "ask.action_show_transactions": "Voir les transactions",
  "ask.action_set_budget": "D\xE9finir un budget",
  "ask.breakdown_caption": "Sur vos 3 derniers mois",
  "ask.today_eyebrow": "Aujourd'hui",
  "ask.entry_lead": "Murmur veille sur votre argent. Voici ce qui ressort, ou posez n'importe quelle question.",
  "ask.intent_eyebrow": "Je veux\u2026",
  "ask.intent_budget": "V\xE9rifier mon budget",
  "ask.intent_budget_q": "O\xF9 en suis-je par rapport \xE0 mon budget ?",
  "ask.intent_subs": "Couper un abonnement",
  "ask.intent_subs_q": "Lesquels de mes pr\xE9l\xE8vements r\xE9currents pourrais-je couper ?",
  "ask.intent_where": "Voir o\xF9 est parti mon argent",
  "ask.intent_where_q": "O\xF9 est parti mon argent ce mois-ci ?",
  "ask.intent_plan": "Pr\xE9voir un achat",
  "ask.intent_plan_q": "Combien puis-je d\xE9penser pour un nouvel achat ce mois-ci sans d\xE9passer ?",
  "ask.composer_placeholder": "Posez une question sur votre argent\u2026",
  "ask.history": "Historique",
  "ask.history_empty": "Aucune conversation pour l'instant.",
  "ask.new_conversation": "Nouveau",
  "ask.delete": "Supprimer",
  "ask.busy": "Murmur est occup\xE9, r\xE9essayez dans un instant.",
  "ask.plus_required": "Ask Murmur fait partie de Murmur Plus.",
  "ask.action_open_recurring": "Voir les r\xE9currents",
  "ask.action_log_expense": "Saisir une d\xE9pense",
  "ask.action_create_rule": "Ajouter un r\xE9current",
  "ask.period_weekly": "hebdomadaire",
  "ask.period_biweekly": "bimensuel",
  "ask.period_monthly": "mensuel",
  "ask.period_quarterly": "trimestriel",
  "ask.period_yearly": "annuel",
  "ask.insight_unnamed_rule": "Sans nom",
  "ask.insight_upcoming_title": "{name} {amount} le {date}",
  "ask.insight_upcoming_detail_income": "Avec {due} de factures encore \xE0 venir, il vous reste {left} ce mois-ci.",
  "ask.insight_upcoming_detail_noincome": "{due} de factures encore \xE0 venir ce mois-ci.",
  "ask.insight_upcoming_question": "Qu'est-ce qui arrive, et que me reste-t-il ce mois-ci ?",
  "ask.insight_upcoming_action": "Voir les r\xE9currents",
  "ask.insight_budget_over_title": "Budget d\xE9pass\xE9 de {over}",
  "ask.insight_budget_over_detail": "{days} jours restants sur votre budget {period}.",
  "ask.insight_budget_tight_title": "{left} restants pour {days} jours",
  "ask.insight_budget_tight_detail": "Soit {pace}/jour, d'habitude vous d\xE9pensez {usual}/jour.",
  "ask.insight_budget_ok_title": "Dans les clous : {left} restants pour {days} jours",
  "ask.insight_budget_ok_detail": "{pace}/jour pour rester dans le budget ; d'habitude vous d\xE9pensez {usual}/jour.",
  "ask.insight_budget_pace_only": "Soit {pace}/jour pour rester dans le budget.",
  "ask.insight_budget_question": "O\xF9 en suis-je par rapport \xE0 mon budget ?",
  "ask.insight_budget_action": "Ajuster le budget",
  "ask.insight_surge_title": "{category} {amount} depuis le d\xE9but du mois",
  "ask.insight_surge_detail": "{pct} % au-dessus de votre habitude \xE0 ce stade du mois.",
  "ask.insight_surge_question": "Pourquoi {category} d\xE9passe-t-il ce mois-ci ?",
  "ask.insight_surge_action": "Voir les transactions",
  "ask.insight_subs_title_one": "{a} prend {total} chaque mois",
  "ask.insight_subs_title_two": "{a} + {b} prennent {total} chaque mois",
  "ask.insight_subs_title_many": "{a}, {b} + {n} autres prennent {total} chaque mois",
  "ask.insight_subs_detail": "Garder ou couper ?",
  "ask.insight_subs_question": "Lesquels de mes pr\xE9l\xE8vements r\xE9currents garder ou couper ?",
  "ask.insight_delta_title": "{category} : plus gros changement vs le mois dernier",
  "ask.insight_delta_detail_up": "{delta} de plus qu'\xE0 ce stade le mois dernier.",
  "ask.insight_delta_detail_down": "{delta} de moins qu'\xE0 ce stade le mois dernier.",
  "ask.insight_delta_question": "Qu'est-ce qui a chang\xE9 dans {category} par rapport au mois dernier ?",
  "ask.insight_netflow_title": "{spent} d\xE9pens\xE9s sur {income} ce mois-ci",
  "ask.insight_netflow_detail": "{left} restants, {days} jours \xE0 tenir.",
  "ask.insight_netflow_over_title": "{over} d\xE9pens\xE9s de plus que vos revenus ce mois-ci",
  "ask.insight_netflow_over_detail": "{spent} sortis, {income} entr\xE9s jusqu'ici.",
  "ask.insight_netflow_question": "Comment je m'en sors globalement ce mois-ci ?",
  "ask.insight_large_title": "{merchant} {amount} le {date}",
  "ask.insight_large_detail": "{times}\xD7 votre achat habituel.",
  "ask.insight_large_question": "Parle-moi de la d\xE9pense {merchant}.",
  "ask.insight_large_action": "Voir la transaction",
  "ask.insight_nodata_title": "Saisissez quelques d\xE9penses et Murmur se met \xE0 veiller sur votre argent",
  "ask.insight_nodata_detail": "D\xE8s qu'il y a des donn\xE9es, les factures \xE0 venir, le rythme du budget et les d\xE9penses inhabituelles apparaissent ici.",
  "ask.insight_nodata_question": "En quoi peux-tu m'aider ?",
  "ask.insight_nodata_action": "Saisir une d\xE9pense",
  "ask.continue_eyebrow": "Reprendre l\xE0 o\xF9 vous en \xE9tiez",
  "ask.continue_open": "Reprendre",
  "ask.kind_upcoming_bill": "Facture \xE0 venir",
  "ask.kind_budget_pace": "Budget",
  "ask.kind_category_surge": "En hausse",
  "ask.kind_subscriptions": "R\xE9currents",
  "ask.kind_month_delta": "Vs le mois dernier",
  "ask.kind_net_flow": "Ce mois-ci",
  "ask.kind_large_transaction": "Achat inhabituel",
  "ask.kind_no_data": "Pour commencer",
  "help.title": "Aide",
  "help.body": "Murmur en est \xE0 ses d\xE9buts. Si quelque chose cloche ou si vous avez une id\xE9e, \xE9crivez-nous, cela atterrit directement dans la bo\xEEte de la personne qui le construit.",
  "help.body_no_contact": "Murmur en est \xE0 ses d\xE9buts, merci de l'essayer. Le support int\xE9gr\xE9 n'est pas encore disponible.",
  "help.contact": "Contact",
  "help.version": "Version",
  "recurring.title": "Transactions R\xE9currentes",
  "recurring.toggle": "Marquer comme r\xE9current",
  "recurring.edit_scope_title": "Appliquer \xE0 quoi ?",
  "recurring.edit_scope_body": "Cette transaction a \xE9t\xE9 g\xE9n\xE9r\xE9e par une r\xE8gle r\xE9currente. Modifier uniquement celle-ci, ou celle-ci et toutes les suivantes ?",
  "recurring.edit_scope_one": "Uniquement celle-ci",
  "recurring.edit_scope_all_future": "Celle-ci et toutes les suivantes",
  "recurring.frequency": "Fr\xE9quence",
  "recurring.daily": "Quotidien",
  "recurring.weekly": "Hebdomadaire",
  "recurring.biweekly": "Bimensuel",
  "recurring.monthly": "Mensuel",
  "recurring.quarterly": "Trimestriel",
  "recurring.yearly": "Annuel",
  "recurring.short_daily": "/jour",
  "recurring.short_weekly": "/sem",
  "recurring.short_biweekly": "/2sem",
  "recurring.short_monthly": "/mois",
  "recurring.short_quarterly": "/trim",
  "recurring.short_yearly": "/an",
  "recurring.active": "Actif",
  "recurring.paused": "En pause",
  "recurring.next_due": "Prochain",
  "recurring.empty": "Aucune transaction r\xE9currente",
  "recurring.empty_sub": "Configurez des transactions r\xE9currentes pour suivre abonnements, loyer et factures",
  "recurring.ai_detected": "L'IA a d\xE9tect\xE9 que cela pourrait \xEAtre r\xE9current",
  "recurring.ai_badge": "IA",
  "recurring.delete_confirm": "Supprimer cette r\xE8gle r\xE9currente ?",
  "recurring.eyebrow_detected": "D\xE9tect\xE9 automatiquement",
  "recurring.heading": "R\xE9currents",
  "recurring.paid_monthly": "Pay\xE9 par mois",
  "recurring.per_month": "/ mois",
  "recurring.yearly_prefix": "C'est",
  "recurring.yearly_suffix": "par an.",
  "recurring.pause": "Mettre en pause",
  "recurring.resume": "Reprendre",
  "recurring.overdue": "En retard, g\xE9n\xE9ration en attente",
  "recurring.inflow_monthly": "Plus {amount}/mois de revenus",
  "recurring.add_manually": "Ajouter manuellement",
  "recurring.new_rule_title": "Nouvelle r\xE8gle r\xE9currente",
  "recurring.edit_rule_title": "Modifier la r\xE8gle r\xE9currente",
  "recurring.name_label": "Nom",
  "recurring.name_placeholder": "ex. Netflix",
  "recurring.amount_label": "Montant",
  "recurring.currency_label": "Devise",
  "recurring.interval_label": "R\xE9p\xE9ter tous les",
  "recurring.interval_hint": "2 = un cycle sur deux",
  "recurring.next_charge_label": "Prochain pr\xE9l\xE8vement",
  "recurring.end_date_toggle": "A une date de fin",
  "recurring.end_date_label": "Annuler \xE0 partir de",
  "recurring.no_end_date": "Aucune date de fin",
  "recurring.invalid_date": "Entrez une date valide (AAAA-MM-JJ)",
  "recurring.save_error": "Impossible d'enregistrer cette r\xE8gle, r\xE9essayez.",
  "recurring.active_section": "Actives",
  "recurring.paused_section": "En pause",
  "settings.recurring": "Transactions R\xE9currentes",
  "payment.cash": "Esp\xE8ces",
  "payment.credit_card": "Carte de cr\xE9dit",
  "payment.debit_card": "Carte de d\xE9bit",
  "payment.digital_wallet": "Portefeuille num\xE9rique",
  "payment.bank_transfer": "Virement bancaire",
  "category.select": "Choisir une cat\xE9gorie\u2026",
  "category.new": "Nouvelle cat\xE9gorie",
  "category.name_placeholder": "Nom de la cat\xE9gorie",
  "category.add": "Ajouter",
  "category.create_error": "Impossible de cr\xE9er la cat\xE9gorie. Elle existe peut-\xEAtre d\xE9j\xE0.",
  "voice.merchant_placeholder": "ex. Starbucks",
  "voice.got_it": "C\u2019est not\xE9",
  "voice.redo": "Refaire",
  "voice.save_expense": "Enregistrer la d\xE9pense",
  "voice.save_income": "Enregistrer le revenu",
  "voice.edit": "Modifier",
  "voice.edit_expense": "Modifier la d\xE9pense",
  "voice.edit_income": "Modifier le revenu",
  "voice.discard_expense": "Abandonner cette d\xE9pense",
  "voice.discard_income": "Abandonner ce revenu",
  "voice.date_time": "Date et heure",
  "voice.quick_entry": "Saisie rapide",
  "voice.saved": "Enregistr\xE9",
  "voice.type_instead": "Saisir au clavier",
  "settings.confirm_sign_out": "\xCAtes-vous s\xFBr ?",
  "settings.invalid_budget": "Entrez un montant de budget valide.",
  "settings.budget_save_error": "Impossible d'enregistrer le budget.",
  "settings.period_weekly": "Hebdomadaire",
  "settings.period_biweekly": "Bimensuel (toutes les 2 semaines)",
  "settings.period_monthly": "Mensuel",
  "settings.period_quarterly": "Trimestriel",
  "settings.period_yearly": "Annuel",
  "settings.plan_free": "Plan gratuit",
  "settings.plan_plus": "Murmur Plus",
  "settings.expenses_count": "d\xE9penses",
  "settings.upgrade": "Passer \xE0 Plus",
  "settings.voice_capture": "Voix et capture",
  "settings.voice_engine": "Moteur vocal",
  "settings.voice_engine_on_device": "Transcription locale",
  "settings.voice_engine_apple": "Reconnaissance vocale Apple",
  "settings.review": "V\xE9rifier",
  "paywall.eyebrow": "Murmur Plus",
  "paywall.headline": "Tirez plus de chaque murmure.",
  "paywall.body": "Ask Murmur, d\xE9tection des r\xE9currences, export complet et l'application de bureau, un seul abonnement, r\xE9siliable \xE0 tout moment.",
  "paywall.feature_desktop": "App de bureau avec tendances, pr\xE9visions et budgets",
  "paywall.feature_ask_murmur": "Ask Murmur. IA fond\xE9e sur vos propres donn\xE9es",
  "paywall.feature_auto_recurring": "D\xE9tection automatique des abonnements",
  "paywall.feature_export": "Export CSV et PDF",
  "paywall.disclaimer": "Les achats ne sont pas encore disponibles dans cette version.",
  "settings.timezone": "Fuseau horaire",
  "settings.sync": "Synchronisation",
  "settings.sync_last_synced": "Derni\xE8re synchronisation",
  "settings.sync_never": "Jamais",
  "settings.sync_in_progress": "Synchronisation\u2026",
  "settings.sync_queued_suffix": "en file d'attente",
  "settings.sync_issues": "Probl\xE8mes de synchronisation",
  "settings.sync_issues_empty": "Aucun probl\xE8me de synchronisation",
  "settings.sync_failed_suffix": "\xE9chou\xE9s",
  "settings.sync_unknown_error": "Erreur inconnue",
  "settings.sync_retry_all": "Tout r\xE9essayer",
  "settings.sync_discard": "Ignorer",
  "settings.sync_item_singular": "\xE9l\xE9ment n'a pas pu \xEAtre synchronis\xE9",
  "settings.sync_item_plural": "\xE9l\xE9ments n'ont pas pu \xEAtre synchronis\xE9s",
  "settings.sync_details": "D\xE9tails",
  "settings.sync_hide": "Masquer",
  "nav.transaction": "Transaction",
  "nav.add_expense": "Ajouter une D\xE9pense",
  "nav.edit_transaction": "Modifier la Transaction",
  "recurring.add_rule_cta": "Ajouter la r\xE8gle",
  "recurring.eyebrow": "Abonnements, factures et revenus",
  "recurring.expenses_per_month": "D\xE9penses r\xE9currentes \xB7 par mois",
  "recurring.income_per_month": "Revenus r\xE9currents",
  "recurring.hero_footnote": "Chaque \xE9ch\xE9ance est ramen\xE9e \xE0 un montant mensuel, une paie toutes les 2 semaines compte 26 \xF7 12 fois, une facture hebdomadaire 52 \xF7 12.",
  "recurring.expenses_section": "D\xE9penses",
  "recurring.income_section": "Revenus",
  "budgets.applies_to": "S\u2019applique \xE0",
  "budgets.scope_overall": "Toutes les d\xE9penses",
  "budgets.by_category_empty": "Aucun budget par cat\xE9gorie. Plafonnez un domaine, courses, restaurants, shopping, et suivez-le ici.",
  "budgets.add_category_budget": "Ajouter un budget par cat\xE9gorie",
  "budgets.remove_confirm": "Supprimer ce budget ?",
  "paywall.plan_yearly": "Annuel",
  "paywall.plan_monthly": "Mensuel",
  "paywall.per_year": "par an",
  "paywall.per_month": "par mois",
  "paywall.equiv_per_month": "{price} / mois",
  "paywall.best_value": "Meilleure offre",
  "paywall.save_pct": "\u2212{pct} %",
  "paywall.trial_badge": "{days} jours gratuits",
  "paywall.cta_trial": "Essayer {days} jours gratuitement",
  "paywall.cta_subscribe": "S'abonner \xB7 {price}",
  "paywall.fine_print_trial": "Gratuit pendant {days} jours, puis {price} {period}. Renouvellement automatique jusqu'\xE0 r\xE9siliation dans les r\xE9glages de votre identifiant Apple, au moins 24 h avant la fin de la p\xE9riode. R\xE9siliable \xE0 tout moment.",
  "paywall.fine_print": "{price} {period}. Renouvellement automatique jusqu'\xE0 r\xE9siliation dans les r\xE9glages de votre identifiant Apple, au moins 24 h avant la fin de la p\xE9riode. R\xE9siliable \xE0 tout moment.",
  "paywall.restore": "Restaurer les achats",
  "paywall.terms": "Conditions",
  "paywall.privacy": "Confidentialit\xE9",
  "paywall.loading": "Chargement des offres\u2026",
  "paywall.load_error": "Impossible de joindre l'App Store.",
  "paywall.retry": "R\xE9essayer",
  "paywall.restore_none": "Aucun achat ant\xE9rieur trouv\xE9 pour cet identifiant Apple.",
  "paywall.restore_done": "Votre abonnement est r\xE9tabli.",
  "paywall.purchase_error": "L'achat n'a pas abouti.",
  "paywall.pending": "En attente d'approbation. Plus sera activ\xE9 d\xE8s que l'achat sera approuv\xE9.",
  "paywall.already_plus": "Vous \xEAtes sur Murmur Plus.",
  "paywall.manage": "G\xE9rer l'abonnement",
  "paywall.processing": "Traitement\u2026",
  "paywall.done": "Termin\xE9",
  "settings.subscription": "Abonnement",
  "settings.plan_trial": "Essai gratuit \xB7 fin le {date}",
  "settings.plan_active_renews": "Murmur Plus \xB7 {plan} \xB7 renouvellement le {date}",
  "settings.plan_active_ends": "Murmur Plus \xB7 {plan} \xB7 fin le {date}",
  "settings.plan_lapsed": "Plus termin\xE9 le {date}",
  "settings.get_plus": "Obtenir Murmur Plus",
  "settings.plan_row_free": "Offre gratuite",
  "applepay.title": "Enregistrer vos achats Apple Pay automatiquement",
  "applepay.body": "\xC0 configurer une seule fois. Ensuite, chaque paiement avec une carte de Wallet est enregistr\xE9 par Murmur en arri\xE8re-plan, rien \xE0 ouvrir, rien \xE0 saisir. Apple n'autorise cela que via une automatisation Raccourcis : six touches dans l'app Raccourcis.",
  "applepay.steps_label": "Dans l'app Raccourcis",
  "applepay.step_1": "Ouvrez Raccourcis \u2192 onglet Automatisation \u2192 touchez +.",
  "applepay.step_2": "Choisissez Wallet (\xAB Lorsque je pr\xE9sente une carte ou un pass Wallet \xBB). S\xE9lectionnez Toute carte, Ex\xE9cuter imm\xE9diatement, d\xE9sactivez Notifier lors de l'ex\xE9cution \u2192 Suivant.",
  "applepay.step_3": "Touchez Nouvelle automatisation vierge, puis Ajouter une action et cherchez \xAB Murmur \xBB.",
  "applepay.step_4": "Choisissez \xAB Enregistrer une d\xE9pense dans Murmur \xBB.",
  "applepay.step_5": "Touchez le champ Montant \u2192 S\xE9lectionner une variable \u2192 Entr\xE9e du raccourci \u2192 Montant. Touchez le champ Commer\xE7ant \u2192 Entr\xE9e du raccourci \u2192 Commer\xE7ant.",
  "applepay.step_6": "Touchez OK. C'est tout, votre prochain achat Apple Pay s'enregistrera tout seul.",
  "applepay.open_shortcuts": "Ouvrir Raccourcis",
  "applepay.install_shortcut": "Ou installer le raccourci pr\xEAt \xE0 l'emploi",
  "applepay.footnote": "Murmur ne re\xE7oit que le montant et le commer\xE7ant transmis par Wallet \xE0 l'automatisation. Les remboursements sont ignor\xE9s. Vous pouvez modifier ou annuler tout achat enregistr\xE9 depuis la liste.",
  "settings.apple_pay_capture": "Capture Apple Pay",
  "settings.apple_pay_capture_detail": "Enregistrer les achats automatiquement",
  "applepay.uncategorised": "Sans cat\xE9gorie",
  "applepay.tap_to_edit": "Touchez pour modifier",
  "applepay.notif_title": "Recevoir une confirmation \xE0 chaque achat",
  "applepay.notif_body": "Autorisez les notifications pour que Murmur vous indique ce qui a \xE9t\xE9 enregistr\xE9, avec Annuler et Modifier directement.",
  "applepay.notif_allow": "Autoriser les notifications",
  "applepay.notif_denied": "Les notifications sont d\xE9sactiv\xE9es pour Murmur, activez-les dans R\xE9glages \u2192 Notifications pour voir les confirmations.",
  "common.edit": "Modifier",
  "applepay.notif_captured": "Captur\xE9 depuis Apple Pay",
  "applepay.amount_unknown": "Montant illisible \xB7 Touchez pour l'ajouter",
  "insights.highlights": "\xC0 la une",
  "income.name_prompt_title": "Qui vous paie ?",
  "income.name_prompt_body": "Donnez un nom \xE0 votre revenu r\xE9current, par exemple votre employeur ou votre client. Murmur l'utilise pour l'historique et le logo.",
  "income.name_prompt_later": "Plus tard",
  "welcome.demo_transcript": "Douze cinquante \xE0 la boulangerie",
  "welcome.demo_merchant": "Boulangerie",
  "welcome.demo_category": "Alimentation",
  "welcome.trust": "Aucune connexion bancaire. L'audio n'est jamais enregistr\xE9.",
  "onboarding.setup.headline": "Voici vos r\xE9glages Murmur.",
  "onboarding.setup.lead": "Repris de votre t\xE9l\xE9phone. Touchez une ligne pour la modifier.",
  "onboarding.setup.voice": "\xC9coute en",
  "onboarding.setup.voice_hint": "Suit votre langue",
  "onboarding.setup.currency_hint": "Tous les montants s'affichent dans cette devise",
  "onboarding.setup.cta": "C'est bon",
  "onboarding.first_log.headline": "Essayez maintenant.",
  "onboarding.first_log.lead": "Touchez le micro et dites votre dernier achat, comme vous le diriez \xE0 un ami.",
  "onboarding.first_log.example_label": "Par exemple",
  "onboarding.first_log.tap": "Touchez pour parler",
  "onboarding.first_log.mic_note": "Murmur va demander l'acc\xE8s au micro. L'audio n'est jamais enregistr\xE9.",
  "onboarding.first_log.later": "Plus tard",
  "onboarding.first_log.filed_title": "Class\xE9.",
  "onboarding.first_log.filed_body": "C'est toute l'habitude : dites-le quand vous payez.",
  "onboarding.habit.headline": "N'en oubliez aucune.",
  "onboarding.habit.lead": "Sans lien bancaire, Murmur ne sait que ce que vous lui dites. Deux fa\xE7ons de rendre \xE7a facile.",
  "onboarding.habit.checkin_title": "Rappel du soir",
  "onboarding.habit.checkin_body": "Un rappel discret par jour, saut\xE9 les jours o\xF9 vous avez d\xE9j\xE0 not\xE9.",
  "onboarding.habit.notif_note": "Continuez, et Murmur demandera \xE0 envoyer des notifications.",
  "onboarding.habit.applepay_title": "Apple Pay, not\xE9 pour vous",
  "onboarding.habit.applepay_body": "Payez avec votre iPhone et la d\xE9pense s'enregistre seule. Une minute \xE0 configurer.",
  "onboarding.habit.applepay_toggle": "Configurer ensuite",
  "reminders.checkin_title": "Quelque chose \xE0 noter aujourd'hui ?",
  "reminders.checkin_body": "Dites-le en une phrase, Murmur s'occupe du reste.",
  "reminders.quiet3_title": "Quelques jours calmes",
  "reminders.quiet3_body": "Des d\xE9penses ces derniers jours ? Une phrase chacune suffit.",
  "reminders.quiet7_title": "Votre semaine en une minute",
  "reminders.quiet7_body": "Rattrapez les d\xE9penses de la semaine tant que vous vous en souvenez.",
  "reminders.prime_title": "Un petit rappel si vous oubliez ?",
  "reminders.prime_body": "Un rappel le soir, saut\xE9 les jours o\xF9 vous avez d\xE9j\xE0 not\xE9. Modifiable \xE0 tout moment dans R\xE9glages.",
  "settings.checkin_label": "Rappel du soir",
  "settings.checkin_time": "Heure du rappel",
  "settings.notifications_off": "Les notifications sont d\xE9sactiv\xE9es pour Murmur. Activez-les dans R\xE9glages pour recevoir les rappels.",
  "voice.mic_denied": "Murmur ne peut pas encore vous entendre. Activez Micro et Reconnaissance vocale pour Murmur dans R\xE9glages, ou tapez la d\xE9pense.",
  "common.open_settings": "Ouvrir R\xE9glages",
  "common.not_now": "Pas maintenant",
  "start.title": "Pour bien d\xE9marrer",
  "start.progress": "{done} sur {total}",
  "start.first_expense": "Notez votre premi\xE8re d\xE9pense",
  "start.budget": "Fixez un budget mensuel",
  "start.income": "Ajoutez vos revenus",
  "start.applepay": "Notez Apple Pay automatiquement",
  "privacy.group_improve": "Aider \xE0 am\xE9liorer Murmur",
  "privacy.analytics_label": "Donn\xE9es d'usage anonymes",
  "privacy.crash_label": "Rapports de plantage",
  "auth.email_confirmed": "E-mail confirm\xE9",
  "auth.email_confirmed_body": "Connectez-vous pour continuer.",
  "voice.recognizer_error": "Murmur n'a pas bien entendu. R\xE9essayez, ou tapez la d\xE9pense.",
  "voice.parse_failed": "Impossible d'enregistrer. V\xE9rifiez votre connexion et r\xE9essayez.",
  "common.save_failed": "Impossible d'enregistrer. V\xE9rifiez votre connexion et r\xE9essayez.",
  "onboarding.setup.privacy_note": "Murmur conserve des donn\xE9es d'usage et de plantage anonymes pour corriger ce qui casse. Jamais vos transactions, montants ou ce que vous dites. D\xE9sactivable \xE0 tout moment dans R\xE9glages, Confidentialit\xE9.",
  "privacy.improve_note": "Activ\xE9 par d\xE9faut. Anonyme, gard\xE9 chez nous, jamais partag\xE9. Jamais vos transactions, montants ou ce que vous dites.",
  "start.collapse": "R\xE9duire",
  "start.expand": "Afficher les \xE9tapes",
  "start.more": "Plus d'options",
  "start.remove": "Retirer",
  "start.remove_title": "Retirer Pour bien d\xE9marrer ?",
  "start.remove_body": "Il ne reviendra pas. Vous pouvez toujours d\xE9finir un budget dans Budgets, et ajouter vos revenus ou la capture Apple Pay dans R\xE9glages.",
  "voice.nothing_heard_title": "Rien entendu",
  "voice.nothing_heard_body": "Touchez le micro et dites-le \xE0 voix haute, par exemple : \xAB {example} \xBB.",
  "voice.mic_off_title": "Le micro est d\xE9sactiv\xE9",
  "voice.recognizer_error_title": "Pas bien entendu",
  "voice.parse_failed_title": "Enregistrement impossible",
  "notif.billing_issue_title": "Votre paiement n'est pas pass\xE9",
  "notif.billing_issue_body": "Plus est en pause. Mettez \xE0 jour votre moyen de paiement pour le r\xE9activer.",
  "notif.billing_issue_body_grace": "Plus continue de fonctionner encore {days} jours pendant que la boutique r\xE9essaie.",
  "notif.trial_ending_title": "Votre essai gratuit se termine bient\xF4t",
  "notif.trial_ending_body": "Plus d\xE9marre dans {days} jours. Annulable \xE0 tout moment dans les r\xE9glages.",
  "notif.trial_ending_off_title": "Votre essai se termine bient\xF4t",
  "notif.trial_ending_off_body": "Le renouvellement est d\xE9sactiv\xE9, rien ne sera d\xE9bit\xE9. Plus s'arr\xEAte \xE0 la fin de l'essai.",
  "notif.plus_lapsed_title": "Plus est termin\xE9",
  "notif.plus_lapsed_body": "Tout ce que vous avez enregistr\xE9 est toujours l\xE0. Les fonctions Plus sont d\xE9sactiv\xE9es.",
  "notif.bill_tomorrow_title": "{name}, {amount}, tombe demain",
  "notif.bill_tomorrow_body_left": "Il vous restera {left} ce mois-ci une fois d\xE9bit\xE9.",
  "notif.bill_tomorrow_body": "{due} encore \xE0 payer d'ici la fin du mois.",
  "notif.bill_week_title": "{count} factures cette semaine, {amount}",
  "notif.bill_week_body": "La premi\xE8re : {name}, {amount}.",
  "notif.bill_missing_title": "{name} n'est pas arriv\xE9",
  "notif.bill_missing_body": "C'\xE9tait d\xFB il y a quelques jours. Notez-le si le paiement est pass\xE9 autrement.",
  "notif.budget_over_title": "Budget d\xE9pass\xE9 de {over}",
  "notif.budget_over_body": "Encore {days} jours \xE0 tenir.",
  "notif.budget_category_over_title": "{category} d\xE9passe de {over}",
  "notif.budget_80_title": "{pct} % de votre budget, {days} jours restants",
  "notif.budget_80_body": "{perDay} par jour pour rester dedans. Il reste {left}.",
  "notif.weekly_recap_title": "La semaine derni\xE8re : {amount}",
  "notif.weekly_recap_body_top": "{count} entr\xE9es. {category} en t\xEAte avec {amount}.",
  "notif.weekly_recap_body": "{count} entr\xE9es enregistr\xE9es.",
  "notif.winback_14_title": "Deux semaines sans nouvelle entr\xE9e",
  "notif.winback_14_body": "Une phrase suffit pour vous remettre \xE0 jour.",
  "notif.winback_30_title": "Votre carnet est calme depuis un mois",
  "notif.winback_30_body": "Reprenez avec la premi\xE8re d\xE9pense du jour.",
  "notif.winback_60_title": "Toujours l\xE0 quand vous voulez",
  "notif.winback_60_body": "Tout ce que vous avez enregistr\xE9 vous attend, tel quel.",
  "notif.winback_bills_title": "{count} factures sont encore \xE0 votre calendrier",
  "notif.winback_bills_body": "{name} \xE0 {amount} arrive. Murmur garde un \u0153il dessus ?",
  "notifsettings.title": "Notifications",
  "notifsettings.hint": "Murmur envoie au maximum un message par jour, et jamais plus de quelques-uns par semaine.",
  "notifsettings.family_money": "Facturation et compte",
  "notifsettings.family_money_hint": "Un paiement refus\xE9 ou un essai qui se termine. Toujours envoy\xE9.",
  "notifsettings.family_bills": "Factures \xE0 venir",
  "notifsettings.family_bills_hint": "Un pr\xE9l\xE8vement demain, et ce qu'il vous restera.",
  "notifsettings.family_budget": "Budget",
  "notifsettings.family_budget_hint": "Quand vous approchez de votre limite, ou la d\xE9passez.",
  "notifsettings.family_receipts": "Confirmations",
  "notifsettings.family_receipts_hint": "Une confirmation quand une d\xE9pense est enregistr\xE9e pour vous.",
  "notifsettings.family_insights": "Bilan hebdomadaire et analyses",
  "notifsettings.family_insights_hint": "Votre semaine en une ligne, et tout ce qui sort de l'ordinaire.",
  "notifsettings.family_habit": "Rappels",
  "notifsettings.family_habit_hint": "Un petit rappel apr\xE8s une absence.",
  "notifsettings.quiet_hours": "Heures calmes",
  "notifsettings.quiet_hours_value": "de {start} \xE0 {end}",
  "notifsettings.max_per_week": "Maximum par semaine",
  "notifsettings.max_per_week_value": "{count} par semaine",
  "notifsettings.always_on": "Toujours actif",
  "notifsettings.permission_off": "Les notifications sont d\xE9sactiv\xE9es pour Murmur. Activez-les dans les r\xE9glages pour les recevoir.",
  "ask.free_quota": "{count} questions gratuites restantes ce mois-ci",
  "ask.free_quota_one": "1 question gratuite restante ce mois-ci",
  "ask.free_quota_none": "Plus de questions gratuites ce mois-ci",
  "ask.get_plus": "Passer \xE0 Plus",
  "plus.unlock": "D\xE9bloquer avec Plus",
  "insights.locked_history_title": "Votre ann\xE9e, mois par mois",
  "insights.locked_history_body": "Comparez les mois, voyez la d\xE9rive, et lisez toute l'histoire au lieu de ce seul mois.",
  "insights.locked_forecast_title": "O\xF9 finira ce mois",
  "insights.locked_forecast_body": "Murmur projette la fin du mois \xE0 partir de votre rythme et des factures \xE0 venir.",
  "insights.locked_month_title": "Les mois pass\xE9s sont dans Plus",
  "insights.this_month_free": "Ce mois-ci",
  "trial.ending_days": "Votre semaine Plus se termine dans {days} jours",
  "trial.ending_tomorrow": "Votre semaine Plus se termine demain",
  "trial.ending_today": "Votre semaine Plus se termine aujourd'hui",
  "trial.ending_body": "Ask Murmur, l'app bureau, la d\xE9tection automatique des abonnements et les rapports. Noter vos d\xE9penses reste gratuit dans tous les cas.",
  "trial.keep": "Garder Plus",
  "trial.ended_title": "Votre semaine Plus est termin\xE9e",
  "trial.ended_body": "Vous \xEAtes sur Murmur Gratuit : d\xE9penses illimit\xE9es, budgets et les analyses du mois, pour toujours."
};

// packages/shared/src/i18n/locales/es.json
var es_default = {
  "app.name": "Murmur",
  "home.greeting": "Hola,",
  "home.net_balance": "Saldo Neto Este Mes",
  "home.income": "Ingresos",
  "home.expenses": "Gastos",
  "home.recent_activity": "Actividad Reciente",
  "home.view_all": "Ver Todo",
  "home.see_all_transactions": "Ver las {count} transacciones",
  "home.safe_to_spend": "Disponible para Gastar",
  "home.over_budget": "Presupuesto excedido por",
  "home.set_budget": "Establece un presupuesto para seguir tus gastos",
  "home.spent_weekly": "Gastado esta semana",
  "home.spent_biweekly": "Gastado (\xFAltimos 14 d\xEDas)",
  "home.spent_quarterly": "Gastado este trimestre",
  "home.spent_yearly": "Gastado este a\xF1o",
  "home.spent_monthly": "Gastado este mes",
  "home.budget_weekly": "Presupuesto semanal",
  "home.budget_biweekly": "Presupuesto quincenal",
  "home.budget_quarterly": "Presupuesto trimestral",
  "home.budget_yearly": "Presupuesto anual",
  "home.budget_monthly": "Presupuesto mensual",
  "home.upcoming": "Pr\xF3ximos",
  "home.spent_today": "Gastado hoy",
  "home.left_this_month": "restantes este mes",
  "home.left_this_week": "restantes esta semana",
  "home.left_this_period": "restantes en este periodo",
  "home.over_budget_suffix": "por encima del presupuesto",
  "home.days_left_week": "d\xEDas restantes esta semana",
  "home.days_to_go": "d\xEDas restantes",
  "home.first_expense": "Toca el micr\xF3fono para registrar tu primer gasto",
  "home.day_one_progress": "Tu primer gasto",
  "home.day_one_headline": "Prueba con tu caf\xE9 de la ma\xF1ana.",
  "home.day_one_body": "Toca el micr\xF3fono y di algo as\xED. No hace falta una frase espec\xEDfica. Murmur lo entiende.",
  "home.day_one_example_1": '"Cuatro cincuenta en la panader\xEDa"',
  "home.day_one_example_2": '"Doce d\xF3lares en Blue Bottle, caf\xE9"',
  "home.day_one_example_3": '"Treinta pavos Uber esta ma\xF1ana"',
  "home.day_one_or": "O",
  "home.day_one_type_instead": "escribe en su lugar",
  "home.net": "Neto",
  "voice.page_title": "Registrar",
  "voice.title": "\xBFCu\xE1l es la transacci\xF3n?",
  "voice.subtitle": "Habla naturalmente, la IA se encarga del resto",
  "voice.transcript_placeholder": "Tus palabras aparecer\xE1n aqu\xED...",
  "listening.eyebrow": "Escuchando",
  "listening.processing": "Procesando",
  "listening.detected": "Detectado",
  "listening.waiting": "Esperando tu monto\u2026",
  "listening.processed_on_device": "Procesado de forma segura",
  "voice.save": "Guardar",
  "voice.parsed_expense": "Transacci\xF3n Analizada",
  "voice.amount": "Monto",
  "voice.merchant": "Comercio",
  "voice.category": "Categor\xEDa",
  "voice.tab_voice": "Voz",
  "voice.tab_manual": "Manual",
  "voice.tap_to_stop": "Toca para detener",
  "voice.tap_to_record": "Toca para grabar",
  "voice.parsing": "Analizando con IA...",
  "voice.scan_receipt": "Escanear Recibo",
  "voice.scan_paycheck": "Escanear N\xF3mina",
  "voice.expense": "Gasto",
  "voice.income_label": "Ingreso",
  "voice.merchant_source": "Comercio / Fuente",
  "voice.note": "Nota (opcional)",
  "voice.note_placeholder": "Agregar una nota...",
  "voice.more_options": "M\xE1s opciones",
  "voice.add_expense": "Agregar gasto",
  "voice.add_income": "Agregar ingreso",
  "voice.no_transcript": "No captamos nada, toca el micr\xF3fono para reintentar.",
  "voice.payment_method": "M\xE9todo de Pago",
  "voice.low_confidence": "Baja confianza, por favor verifica los detalles arriba",
  "voice.ai_suggests": "Sugerencia IA:",
  "voice.invalid_amount": "Monto inv\xE1lido",
  "voice.invalid_amount_msg": "Ingresa un monto v\xE1lido mayor a 0",
  "voice.amount_too_large": "Ese monto es demasiado grande, ingresa un valor menor a 9.999.999.999,99.",
  "voice.amount_too_many_decimals": "Los montos pueden tener como m\xE1ximo 2 decimales.",
  "voice.permission_required": "Permiso requerido",
  "voice.camera_permission": "Se necesita acceso a la c\xE1mara para escanear recibos.",
  "voice.scan_failed": "Error al escanear",
  "voice.scan_rejected_title": "No se pudo leer ese escaneo",
  "voice.retake": "Repetir",
  "voice.enter_manually": "Ingresar manualmente",
  "voice.save_changes": "Guardar cambios",
  "transactions.title": "Actividad",
  "transactions.search": "Buscar transacciones...",
  "transactions.all_time": "Todo el historial",
  "transactions.pick_month": "Elegir un mes",
  "transactions.count_one": "1 transacci\xF3n",
  "transactions.count_many": "{count} transacciones",
  "transactions.filter": "Filtrar",
  "transactions.today": "Hoy",
  "transactions.yesterday": "Ayer",
  "transactions.empty": "Sin transacciones",
  "transactions.empty_search": "Sin resultados",
  "transactions.uncategorized": "Sin categor\xEDa",
  "transactions.unknown": "Desconocido",
  "transactions.filter_all": "Todo",
  "detail.title": "Detalle del Gasto",
  "detail.category": "Categor\xEDa",
  "detail.payment": "M\xE9todo de Pago",
  "detail.source": "Fuente",
  "detail.note": "Nota",
  "detail.recurring": "Recurrente",
  "detail.transcript": "Transcripci\xF3n de Voz",
  "detail.date": "Fecha",
  "detail.logged_via": "Origen",
  "source.voice": "Voz",
  "source.manual": "Manual",
  "source.scan": "Escaneo de recibo",
  "source.shortcut": "Atajo de Apple Pay",
  "source.notification": "Notificaci\xF3n de pago",
  "source.recurring": "Recurrente \xB7 generado autom\xE1ticamente",
  "detail.edit": "Editar",
  "detail.delete": "Eliminar",
  "detail.delete_title": "Eliminar transacci\xF3n",
  "detail.delete_msg": "Esta acci\xF3n no se puede deshacer.",
  "detail.deleted": "Eliminado",
  "detail.not_found": "Transacci\xF3n no encontrada",
  "common.cancel": "Cancelar",
  "common.dismiss": "Cerrar",
  "settings.reminders": "Recordatorios",
  "settings.dunning_label": "Avisarme si dejo de registrar",
  "settings.privacy_data": "Privacidad y datos",
  "settings.export_label": "Exportar transacciones",
  "settings.export_detail_plus": "CSV \xB7 JSON \xB7 PDF",
  "settings.export_detail_free": "Murmur Plus",
  "export.picker_title": "Formato de exportaci\xF3n",
  "export.fmt_csv_label": "Hoja de c\xE1lculo (.csv)",
  "export.fmt_csv_hint": "Para Excel, Numbers, Google Sheets.",
  "export.fmt_json_label": "Datos en bruto (.json)",
  "export.fmt_json_hint": "Exportaci\xF3n estructurada completa. Ideal para respaldo u otras herramientas.",
  "export.fmt_pdf_label": "Informe imprimible (.pdf)",
  "export.fmt_pdf_hint": "Registro con formato listo para imprimir o enviar.",
  "export.share_dialog_title": "Guardar exportaci\xF3n de Murmur",
  "export.failed_title": "Error en la exportaci\xF3n",
  "export.pdf_eyebrow": "Murmur \xB7 Transacciones",
  "export.pdf_title": "Tus transacciones",
  "export.pdf_total_label": "Total gastado",
  "export.pdf_count_label": "Entradas",
  "export.col_date": "Fecha",
  "export.col_merchant": "Comercio",
  "export.col_category": "Categor\xEDa",
  "export.col_amount": "Importe",
  "export.pdf_footer": "Exportado desde Murmur. Tus datos, tus reglas.",
  "home.pattern_eyebrow": "Nuevo patr\xF3n",
  "home.pattern_title": "Parece que {merchant} se repite a {amount} {frequency}.",
  "home.pattern_body": "Lo vimos {count} veces. \xBFQuieres que Murmur lo registre autom\xE1ticamente?",
  "home.pattern_accept": "Activar",
  "home.pattern_dismiss": "Ahora no",
  "insights.unlock_eyebrow": "Insights desbloqueados",
  "insights.unlock_title": "Tres registros. Vienen los patrones.",
  "insights.unlock_body": "Ya hay suficiente para que Murmur muestre tendencias, comercios principales y a d\xF3nde va el mes.",
  "common.skip": "Omitir",
  "common.continue": "Continuar",
  "onboarding.welcome.headline": "Dilo.\nGasta con claridad.",
  "onboarding.income.source_label": "Fuente (opcional)",
  "onboarding.income.source_placeholder": "p. ej. Microsoft, freelance, propinas\u2026",
  "onboarding.income.per_month": "al mes",
  "onboarding.income.default_name": "Salario",
  "onboarding.income.txn_note": "Ingreso mensual (definido durante la incorporaci\xF3n)",
  "common.confirm": "Confirmar",
  "common.ok": "OK",
  "common.undo": "Deshacer",
  "common.save": "Guardar",
  "common.done": "Listo",
  "common.yes": "S\xED",
  "common.no": "No",
  "common.none": "Ninguno",
  "common.loading": "Cargando...",
  "common.error": "Algo sali\xF3 mal",
  "common.load_failed": "No se pudieron cargar tus datos",
  "common.retry": "Reintentar",
  "common.back": "Atr\xE1s",
  "auth.sign_in": "Iniciar Sesi\xF3n",
  "auth.sign_up": "Registrarse",
  "auth.sign_out": "Cerrar Sesi\xF3n",
  "auth.email": "Correo",
  "auth.password": "Contrase\xF1a",
  "auth.continue_apple": "Continuar con Apple",
  "auth.continue_google": "Continuar con Google",
  "auth.welcome_back": "Bienvenido de nuevo",
  "auth.sign_in_continue": "Inicia sesi\xF3n para continuar",
  "auth.or_continue_with": "o continuar con",
  "auth.no_account": "\xBFNo tienes una cuenta?",
  "auth.create_one": "Crear una",
  "auth.has_account": "\xBFYa tienes una cuenta?",
  "auth.sign_in_link": "Iniciar sesi\xF3n",
  "auth.create_account": "Crear cuenta",
  "auth.track_voice": "Rastrea gastos con tu voz",
  "auth.create_account_btn": "Crear Cuenta",
  "auth.password_short": "Contrase\xF1a muy corta",
  "auth.password_min": "La contrase\xF1a debe tener al menos 6 caracteres.",
  "auth.confirm_password": "Confirmar contrase\xF1a",
  "auth.passwords_no_match": "Esas dos contrase\xF1as no coinciden.",
  "auth.password_placeholder": "Al menos 6 caracteres",
  "auth.sign_in_failed": "Error al iniciar sesi\xF3n",
  "auth.sign_up_failed": "Error al registrarse",
  "auth.apple_failed": "Error con Apple Sign-In",
  "auth.google_failed": "Error con Google Sign-In",
  "auth.check_email": "Revisa tu correo",
  "auth.confirmation_sent": "Enviamos un enlace de confirmaci\xF3n a {email}. Haz clic para activar tu cuenta.",
  "auth.back_to_sign_in": "Volver a Iniciar Sesi\xF3n",
  "auth.more_options": "M\xE1s opciones",
  "auth.hide_email_form": "Ocultar opciones por correo",
  "auth.privacy_note": "Tus datos son tuyos. Nunca los vendemos. Tu correo solo sirve para mantenerte con sesi\xF3n iniciada.",
  "auth.forgot_password": "\xBFOlvidaste tu contrase\xF1a?",
  "auth.forgot_password_need_email": "Escribe primero tu correo arriba.",
  "auth.reset_email_sent": "Enviamos un enlace para restablecer la contrase\xF1a a {email}. \xC1brelo en este dispositivo para definir una nueva contrase\xF1a.",
  "auth.reset_failed": "Error al restablecer",
  "auth.new_password_title": "Establece una nueva contrase\xF1a",
  "auth.new_password_body": "Elige una nueva contrase\xF1a para tu cuenta.",
  "auth.update_password": "Actualizar contrase\xF1a",
  "auth.password_updated": "Contrase\xF1a actualizada",
  "auth.reset_link_invalid": "Este enlace de restablecimiento no es v\xE1lido o caduc\xF3. Solicita uno nuevo desde la pantalla de inicio de sesi\xF3n.",
  "settings.title": "Ajustes",
  "settings.budget": "Presupuesto Mensual",
  "settings.monthly_income": "Ingreso Mensual",
  "settings.income_amount": "Monto",
  "settings.income_source_helper": "Opcional. Si agregas el nombre de una empresa, mostraremos su logo en tus ingresos.",
  "settings.currency": "Moneda",
  "settings.currency_confirm_title": "\xBFCambiar de moneda?",
  "settings.currency_confirm_body_prefix": "Esto convertir\xE1",
  "settings.currency_confirm_body_suffix": "transacciones, adem\xE1s de tus presupuestos e ingresos mensuales, a la nueva moneda con el tipo de cambio de hoy. Esta acci\xF3n no se puede deshacer autom\xE1ticamente.",
  "settings.currency_confirm_action": "Convertir",
  "settings.currency_converting": "Convirtiendo tu historial\u2026",
  "settings.currency_offline_title": "Est\xE1s sin conexi\xF3n",
  "settings.currency_offline_body": "Cambiar de moneda requiere conexi\xF3n para que nada quede a medio convertir. Vuelve a intentarlo cuando tengas conexi\xF3n.",
  "settings.currency_failed_title": "Error al cambiar de moneda",
  "settings.language": "Idioma",
  "settings.account": "Cuenta",
  "settings.display_name": "Nombre para mostrar",
  "settings.preferences": "Preferencias",
  "settings.developer": "Desarrollador",
  "settings.ai_server_url": "URL del servidor IA",
  "settings.about": "Acerca de",
  "settings.version": "Versi\xF3n",
  "settings.budget_hint": "Establece tu presupuesto. El disponible rastrear\xE1 tu saldo restante.",
  "settings.budget_period": "Per\xEDodo presupuestario",
  "settings.payment_notifications": "Notificaciones de pago",
  "settings.disable_notifications": "Desactivar notificaciones de pago",
  "settings.disable_notifications_msg": "Para desactivar, abre Ajustes > Apps > Acceso especial > Acceso a notificaciones y elimina esta app.",
  "settings.ai_url_hint": "Ingresa la URL de tu servidor Next.js local (ej: http://192.168.1.5:3000). Modificable sin reconstruir la app.",
  "settings.reset_default": "Restablecer por defecto",
  "settings.your_name": "Tu nombre",
  "tabs.home": "Inicio",
  "tabs.today": "Hoy",
  "tabs.expenses": "Gastos",
  "tabs.record": "Registrar",
  "tabs.insights": "An\xE1lisis",
  "insights.eyebrow_this_month": "Este mes",
  "insights.heading": "An\xE1lisis",
  "insights.spent": "Gastado",
  "insights.vs": "vs",
  "insights.last_n_days_prefix": "\xDAltimos",
  "insights.last_n_days_suffix": "d\xEDas",
  "insights.history": "Historial",
  "insights.categories": "Categor\xEDas",
  "insights.other": "Otros",
  "insights.empty": "A\xFAn no hay gastos en este per\xEDodo.",
  "insights.select_month": "Seleccionar mes",
  "insights.forecast": "Pron\xF3stico",
  "insights.forecast_line_prefix": "A este ritmo, cerca de",
  "insights.forecast_line_suffix": "al final de {month}.",
  "insights.forecast_below": "por debajo de lo habitual.",
  "insights.forecast_above": "por encima de lo habitual.",
  "insights.forecast_same": "Justo en tu promedio.",
  "tabs.budgets": "Presupuestos",
  "tabs.settings": "Ajustes",
  "tabs.more": "M\xE1s",
  "more.title": "M\xE1s",
  "more.section_activity": "Actividad",
  "more.section_intelligence": "Inteligencia",
  "more.section_account": "Cuenta",
  "more.history": "Historial",
  "more.transactions": "Transacciones",
  "history.heading_eyebrow": "Historial",
  "history.months": "Meses",
  "history.in_progress": "En curso",
  "history.browse_all": "Ver todas las transacciones",
  "history.prev_month": "Mes anterior",
  "history.next_month": "Mes siguiente",
  "history.empty": "A\xFAn no has registrado nada. Registra tu primer gasto para empezar el mapa.",
  "more.recurring": "Transacciones recurrentes",
  "more.ask": "Ask Murmur",
  "more.settings": "Ajustes",
  "more.privacy": "Centro de privacidad",
  "more.help": "Ayuda",
  "budgets.title": "Presupuestos",
  "budgets.empty_title": "Los presupuestos llegan pronto",
  "budgets.empty_body": "Un anillo mensual y progreso por categor\xEDa. Llega en la pr\xF3xima versi\xF3n.",
  "budgets.left_of": "de",
  "budgets.over_by": "excedido en",
  "budgets.status_on_pace": "Al ritmo",
  "budgets.status_tight": "Ajustado",
  "budgets.status_over": "Excedido",
  "budgets.no_budget_title": "A\xFAn no hay presupuesto",
  "budgets.no_budget_body": "Establece un presupuesto mensual para que el anillo te diga si est\xE1s ajustado, excedido, o al ritmo.",
  "budgets.set_budget_cta": "Establecer presupuesto",
  "budgets.edit_budget": "Modificar presupuesto",
  "budgets.by_category": "Por categor\xEDa",
  "budgets.committed": "pendiente",
  "budgets.ring_used": "usado",
  "privacy.title": "Tu dinero, tuyo.",
  "privacy.lead": "Murmur nunca se conecta a tu banco, y tu voz se procesa en tu tel\xE9fono siempre que el dispositivo lo permita. Todo lo que registras es tuyo: exp\xF3rtalo o b\xF3rralo abajo, cuando quieras. El detalle completo est\xE1 en la pol\xEDtica de privacidad.",
  "privacy.group_rights": "Tus datos",
  "privacy.group_legal": "Legal",
  "privacy.policy_label": "Pol\xEDtica de privacidad",
  "privacy.terms_label": "T\xE9rminos de uso",
  "privacy.export_all": "Exportar todos mis datos",
  "privacy.export_all_busy": "Preparando exportaci\xF3n\u2026",
  "privacy.export_all_failed": "No se pudieron exportar tus datos",
  "privacy.delete_all": "Eliminar cuenta",
  "privacy.delete_all_title": "\xBFEliminar tu cuenta?",
  "privacy.delete_all_body": "Esto elimina permanentemente tu cuenta de Murmur y todo su contenido: transacciones, presupuestos, reglas recurrentes, categor\xEDas y conversaciones de Ask. Una suscripci\xF3n a Murmur Plus la gestiona Apple y no se cancela al eliminar la cuenta. No se puede deshacer.",
  "privacy.delete_all_confirm": "Eliminar cuenta",
  "privacy.delete_all_busy": "Eliminando cuenta\u2026",
  "privacy.delete_all_failed": "No se pudo eliminar tu cuenta",
  "ask.title": "Ask Murmur.",
  "ask.lead": "Fundamentado en tus propias transacciones. No es consejo gen\xE9rico, tus datos, tus n\xFAmeros, una respuesta directa.",
  "ask.beta": "Beta",
  "ask.suggestion_afford": "\xBFPuedo comprarme una PS5 este mes?",
  "ask.suggestion_coffee": "\xBFA d\xF3nde se va mi presupuesto de caf\xE9?",
  "ask.suggestion_unusual": "\xBFPor qu\xE9 gast\xE9 m\xE1s de lo habitual la semana pasada?",
  "ask.suggestion_goal": "Ay\xFAdame a ahorrar 500 $ para agosto.",
  "ask.input_placeholder": "Haz una pregunta sobre tus gastos\u2026",
  "ask.mic_label": "Pregunta por voz",
  "ask.send_label": "Enviar pregunta",
  "ask.privacy_note": "Tus datos nunca entrenan un modelo",
  "ask.header_title": "Ask Murmur",
  "ask.thinking": "Leyendo tus transacciones\u2026",
  "ask.error": "No pudimos contactar a Ask Murmur. Int\xE9ntalo de nuevo en un momento.",
  "ask.retry": "Reintentar",
  "ask.followup_placeholder": "Pregunta de seguimiento\u2026",
  "ask.attribution": "Basado en {count} transacciones en Murmur. Sin conjeturas, sin consejos externos.",
  "ask.refusal_default": "Solo puedo responder a partir de tus propias transacciones, y eso queda fuera de lo que puedo ver.",
  "ask.action_create_goal": "Crear meta",
  "ask.action_show_category": "Ver categor\xEDa",
  "ask.action_show_transactions": "Ver transacciones",
  "ask.action_set_budget": "Definir presupuesto",
  "ask.breakdown_caption": "De tus \xFAltimos 3 meses",
  "ask.today_eyebrow": "Hoy",
  "ask.entry_lead": "Murmur vigila tu dinero. Esto es lo que destaca, o pregunta lo que quieras.",
  "ask.intent_eyebrow": "Quiero\u2026",
  "ask.intent_budget": "Revisar mi presupuesto",
  "ask.intent_budget_q": "\xBFC\xF3mo voy con mi presupuesto?",
  "ask.intent_subs": "Cortar una suscripci\xF3n",
  "ask.intent_subs_q": "\xBFCu\xE1les de mis cargos recurrentes podr\xEDa cortar?",
  "ask.intent_where": "Ver a d\xF3nde fue mi dinero",
  "ask.intent_where_q": "\xBFA d\xF3nde fue mi dinero este mes?",
  "ask.intent_plan": "Planear una compra",
  "ask.intent_plan_q": "\xBFCu\xE1nto puedo gastar en algo nuevo este mes sin pasarme?",
  "ask.composer_placeholder": "Pregunta lo que quieras sobre tu dinero\u2026",
  "ask.history": "Historial",
  "ask.history_empty": "A\xFAn no hay conversaciones.",
  "ask.new_conversation": "Nueva",
  "ask.delete": "Eliminar",
  "ask.busy": "Murmur est\xE1 ocupado, int\xE9ntalo de nuevo en un momento.",
  "ask.plus_required": "Ask Murmur forma parte de Murmur Plus.",
  "ask.action_open_recurring": "Ver recurrentes",
  "ask.action_log_expense": "Registrar un gasto",
  "ask.action_create_rule": "A\xF1adir un recurrente",
  "ask.period_weekly": "semanal",
  "ask.period_biweekly": "quincenal",
  "ask.period_monthly": "mensual",
  "ask.period_quarterly": "trimestral",
  "ask.period_yearly": "anual",
  "ask.insight_unnamed_rule": "Sin nombre",
  "ask.insight_upcoming_title": "{name} {amount} vence el {date}",
  "ask.insight_upcoming_detail_income": "Con {due} de facturas a\xFAn por pagar, te quedan {left} este mes.",
  "ask.insight_upcoming_detail_noincome": "{due} de facturas a\xFAn por pagar este mes.",
  "ask.insight_upcoming_question": "\xBFQu\xE9 viene y qu\xE9 me deja eso este mes?",
  "ask.insight_upcoming_action": "Ver recurrentes",
  "ask.insight_budget_over_title": "Presupuesto superado por {over}",
  "ask.insight_budget_over_detail": "Quedan {days} d\xEDas de tu presupuesto {period}.",
  "ask.insight_budget_tight_title": "Quedan {left} para {days} d\xEDas",
  "ask.insight_budget_tight_detail": "Son {pace}/d\xEDa, normalmente gastas {usual}/d\xEDa.",
  "ask.insight_budget_ok_title": "En camino: quedan {left} para {days} d\xEDas",
  "ask.insight_budget_ok_detail": "{pace}/d\xEDa te mantiene dentro del presupuesto; normalmente gastas {usual}/d\xEDa.",
  "ask.insight_budget_pace_only": "Son {pace}/d\xEDa para no pasarte.",
  "ask.insight_budget_question": "\xBFC\xF3mo voy con mi presupuesto?",
  "ask.insight_budget_action": "Ajustar presupuesto",
  "ask.insight_surge_title": "{category} {amount} en lo que va del mes",
  "ask.insight_surge_detail": "{pct}% por encima de lo habitual a estas alturas del mes.",
  "ask.insight_surge_question": "\xBFPor qu\xE9 {category} est\xE1 por encima este mes?",
  "ask.insight_surge_action": "Ver transacciones",
  "ask.insight_subs_title_one": "{a} se lleva {total} cada mes",
  "ask.insight_subs_title_two": "{a} + {b} se llevan {total} cada mes",
  "ask.insight_subs_title_many": "{a}, {b} + {n} m\xE1s se llevan {total} cada mes",
  "ask.insight_subs_detail": "\xBFMantener o cortar?",
  "ask.insight_subs_question": "\xBFCu\xE1les de mis cargos recurrentes deber\xEDa mantener o cortar?",
  "ask.insight_delta_title": "{category}: el mayor cambio vs el mes pasado",
  "ask.insight_delta_detail_up": "{delta} m\xE1s que a estas alturas el mes pasado.",
  "ask.insight_delta_detail_down": "{delta} menos que a estas alturas el mes pasado.",
  "ask.insight_delta_question": "\xBFQu\xE9 cambi\xF3 en {category} respecto al mes pasado?",
  "ask.insight_netflow_title": "Gastados {spent} de {income} en lo que va del mes",
  "ask.insight_netflow_detail": "Quedan {left}, faltan {days} d\xEDas.",
  "ask.insight_netflow_over_title": "Gastaste {over} m\xE1s de lo que ingresaste este mes",
  "ask.insight_netflow_over_detail": "{spent} salieron, {income} entraron hasta ahora.",
  "ask.insight_netflow_question": "\xBFC\xF3mo voy en general este mes?",
  "ask.insight_large_title": "{merchant} {amount} el {date}",
  "ask.insight_large_detail": "{times}\xD7 tu compra habitual.",
  "ask.insight_large_question": "Cu\xE9ntame sobre el cargo de {merchant}.",
  "ask.insight_large_action": "Ver transacci\xF3n",
  "ask.insight_nodata_title": "Registra unos gastos y Murmur empieza a vigilar tu dinero",
  "ask.insight_nodata_detail": "Cuando haya datos, aqu\xED ver\xE1s facturas pr\xF3ximas, ritmo del presupuesto y gastos inusuales.",
  "ask.insight_nodata_question": "\xBFEn qu\xE9 puedes ayudarme?",
  "ask.insight_nodata_action": "Registrar un gasto",
  "ask.continue_eyebrow": "Retoma donde lo dejaste",
  "ask.continue_open": "Continuar",
  "ask.kind_upcoming_bill": "Factura pr\xF3xima",
  "ask.kind_budget_pace": "Presupuesto",
  "ask.kind_category_surge": "Al alza",
  "ask.kind_subscriptions": "Recurrentes",
  "ask.kind_month_delta": "Vs el mes pasado",
  "ask.kind_net_flow": "Este mes",
  "ask.kind_large_transaction": "Compra inusual",
  "ask.kind_no_data": "Para empezar",
  "help.title": "Ayuda",
  "help.body": "Murmur est\xE1 empezando. Si algo no funciona o tienes una idea, escr\xEDbenos, llega directo al buz\xF3n de la persona que lo construye.",
  "help.body_no_contact": "Murmur est\xE1 empezando, gracias por probarlo. El soporte dentro de la app todav\xEDa no est\xE1 disponible.",
  "help.contact": "Contacto",
  "help.version": "Versi\xF3n",
  "recurring.title": "Transacciones Recurrentes",
  "recurring.toggle": "Marcar como recurrente",
  "recurring.edit_scope_title": "\xBFAplicar a cu\xE1l?",
  "recurring.edit_scope_body": "Esta transacci\xF3n fue generada por una regla recurrente. \xBFActualizar solo esta, o esta y todas las futuras?",
  "recurring.edit_scope_one": "Solo esta",
  "recurring.edit_scope_all_future": "Esta y todas las futuras",
  "recurring.frequency": "Frecuencia",
  "recurring.daily": "Diario",
  "recurring.weekly": "Semanal",
  "recurring.biweekly": "Quincenal",
  "recurring.monthly": "Mensual",
  "recurring.quarterly": "Trimestral",
  "recurring.yearly": "Anual",
  "recurring.short_daily": "/d\xEDa",
  "recurring.short_weekly": "/sem",
  "recurring.short_biweekly": "/2sem",
  "recurring.short_monthly": "/mes",
  "recurring.short_quarterly": "/trim",
  "recurring.short_yearly": "/a\xF1o",
  "recurring.active": "Activo",
  "recurring.paused": "En pausa",
  "recurring.next_due": "Pr\xF3ximo",
  "recurring.empty": "Sin transacciones recurrentes",
  "recurring.empty_sub": "Configura transacciones recurrentes para rastrear suscripciones, renta y facturas",
  "recurring.ai_detected": "La IA detect\xF3 que esto podr\xEDa ser recurrente",
  "recurring.ai_badge": "IA",
  "recurring.delete_confirm": "\xBFEliminar esta regla recurrente?",
  "recurring.eyebrow_detected": "Detectado autom\xE1ticamente",
  "recurring.heading": "Recurrentes",
  "recurring.paid_monthly": "Pagado al mes",
  "recurring.per_month": "/ mes",
  "recurring.yearly_prefix": "Eso es",
  "recurring.yearly_suffix": "al a\xF1o.",
  "recurring.pause": "Pausar",
  "recurring.resume": "Reanudar",
  "recurring.overdue": "Atrasado, generaci\xF3n pendiente",
  "recurring.inflow_monthly": "M\xE1s {amount}/mes de ingresos",
  "recurring.add_manually": "A\xF1adir manualmente",
  "recurring.new_rule_title": "Nueva regla recurrente",
  "recurring.edit_rule_title": "Editar regla recurrente",
  "recurring.name_label": "Nombre",
  "recurring.name_placeholder": "p. ej. Netflix",
  "recurring.amount_label": "Importe",
  "recurring.currency_label": "Moneda",
  "recurring.interval_label": "Repetir cada",
  "recurring.interval_hint": "2 = un ciclo de cada dos",
  "recurring.next_charge_label": "Pr\xF3ximo cobro",
  "recurring.end_date_toggle": "Tiene fecha de fin",
  "recurring.end_date_label": "Cancelar desde",
  "recurring.no_end_date": "Sin fecha de fin",
  "recurring.invalid_date": "Introduce una fecha v\xE1lida (AAAA-MM-DD)",
  "recurring.save_error": "No se pudo guardar esta regla, int\xE9ntalo de nuevo.",
  "recurring.active_section": "Activas",
  "recurring.paused_section": "Pausadas",
  "settings.recurring": "Transacciones Recurrentes",
  "payment.cash": "Efectivo",
  "payment.credit_card": "Tarjeta de cr\xE9dito",
  "payment.debit_card": "Tarjeta de d\xE9bito",
  "payment.digital_wallet": "Billetera digital",
  "payment.bank_transfer": "Transferencia bancaria",
  "category.select": "Seleccionar categor\xEDa\u2026",
  "category.new": "Nueva categor\xEDa",
  "category.name_placeholder": "Nombre de categor\xEDa",
  "category.add": "Agregar",
  "category.create_error": "No se pudo crear la categor\xEDa. Quiz\xE1s ya existe.",
  "voice.merchant_placeholder": "ej. Starbucks",
  "voice.got_it": "Entendido",
  "voice.redo": "Rehacer",
  "voice.save_expense": "Guardar gasto",
  "voice.save_income": "Guardar ingreso",
  "voice.edit": "Editar",
  "voice.edit_expense": "Editar gasto",
  "voice.edit_income": "Editar ingreso",
  "voice.discard_expense": "Descartar este gasto",
  "voice.discard_income": "Descartar este ingreso",
  "voice.date_time": "Fecha y hora",
  "voice.quick_entry": "Entrada r\xE1pida",
  "voice.saved": "Guardado",
  "voice.type_instead": "Escribir en su lugar",
  "settings.confirm_sign_out": "\xBFEst\xE1s seguro?",
  "settings.invalid_budget": "Ingresa un monto de presupuesto v\xE1lido.",
  "settings.budget_save_error": "No se pudo guardar el presupuesto.",
  "settings.period_weekly": "Semanal",
  "settings.period_biweekly": "Quincenal (cada 2 semanas)",
  "settings.period_monthly": "Mensual",
  "settings.period_quarterly": "Trimestral",
  "settings.period_yearly": "Anual",
  "settings.plan_free": "Plan gratis",
  "settings.plan_plus": "Murmur Plus",
  "settings.expenses_count": "gastos",
  "settings.upgrade": "Mejorar",
  "settings.voice_capture": "Voz y captura",
  "settings.voice_engine": "Motor de voz",
  "settings.voice_engine_on_device": "Transcripci\xF3n local",
  "settings.voice_engine_apple": "Reconocimiento de voz de Apple",
  "settings.review": "Revisar",
  "paywall.eyebrow": "Murmur Plus",
  "paywall.headline": "Saca m\xE1s de cada murmullo.",
  "paywall.body": "Ask Murmur, detecci\xF3n de recurrentes, exportaci\xF3n completa y la app de escritorio, una sola suscripci\xF3n, cancela cuando quieras.",
  "paywall.feature_desktop": "App de escritorio con tendencias, pron\xF3sticos y presupuestos",
  "paywall.feature_ask_murmur": "Ask Murmur. IA basada en tus propios datos",
  "paywall.feature_auto_recurring": "Detecci\xF3n autom\xE1tica de suscripciones",
  "paywall.feature_export": "Exportar a CSV y PDF",
  "paywall.disclaimer": "Las compras a\xFAn no est\xE1n disponibles en esta versi\xF3n.",
  "settings.timezone": "Zona horaria",
  "settings.sync": "Sincronizaci\xF3n",
  "settings.sync_last_synced": "\xDAltima sincronizaci\xF3n",
  "settings.sync_never": "Nunca",
  "settings.sync_in_progress": "Sincronizando\u2026",
  "settings.sync_queued_suffix": "en cola",
  "settings.sync_issues": "Problemas de sincronizaci\xF3n",
  "settings.sync_issues_empty": "Sin problemas de sincronizaci\xF3n",
  "settings.sync_failed_suffix": "fallidos",
  "settings.sync_unknown_error": "Error desconocido",
  "settings.sync_retry_all": "Reintentar todo",
  "settings.sync_discard": "Descartar",
  "settings.sync_item_singular": "elemento no se pudo sincronizar",
  "settings.sync_item_plural": "elementos no se pudieron sincronizar",
  "settings.sync_details": "Detalles",
  "settings.sync_hide": "Ocultar",
  "nav.transaction": "Transacci\xF3n",
  "nav.add_expense": "Agregar Gasto",
  "nav.edit_transaction": "Editar Transacci\xF3n",
  "recurring.add_rule_cta": "A\xF1adir regla",
  "recurring.eyebrow": "Suscripciones, facturas e ingresos",
  "recurring.expenses_per_month": "Gastos recurrentes \xB7 por mes",
  "recurring.income_per_month": "Ingresos recurrentes",
  "recurring.hero_footnote": "Cada frecuencia se muestra como importe mensual, un sueldo cada 2 semanas cuenta 26 \xF7 12 veces, una factura semanal 52 \xF7 12.",
  "recurring.expenses_section": "Gastos",
  "recurring.income_section": "Ingresos",
  "budgets.applies_to": "Se aplica a",
  "budgets.scope_overall": "Todo el gasto",
  "budgets.by_category_empty": "A\xFAn no hay presupuestos por categor\xEDa. Limita un \xE1rea, supermercado, restaurantes, compras, y s\xEDguela aqu\xED.",
  "budgets.add_category_budget": "A\xF1adir presupuesto por categor\xEDa",
  "budgets.remove_confirm": "\xBFEliminar este presupuesto?",
  "paywall.plan_yearly": "Anual",
  "paywall.plan_monthly": "Mensual",
  "paywall.per_year": "al a\xF1o",
  "paywall.per_month": "al mes",
  "paywall.equiv_per_month": "{price} / mes",
  "paywall.best_value": "Mejor precio",
  "paywall.save_pct": "Ahorra {pct}%",
  "paywall.trial_badge": "{days} d\xEDas gratis",
  "paywall.cta_trial": "Probar {days} d\xEDas gratis",
  "paywall.cta_subscribe": "Suscribirse \xB7 {price}",
  "paywall.fine_print_trial": "Gratis durante {days} d\xEDas, luego {price} {period}. Se renueva autom\xE1ticamente hasta que lo canceles en los ajustes de tu ID de Apple, al menos 24 h antes de que termine el periodo. Cancela cuando quieras.",
  "paywall.fine_print": "{price} {period}. Se renueva autom\xE1ticamente hasta que lo canceles en los ajustes de tu ID de Apple, al menos 24 h antes de que termine el periodo. Cancela cuando quieras.",
  "paywall.restore": "Restaurar compras",
  "paywall.terms": "T\xE9rminos",
  "paywall.privacy": "Privacidad",
  "paywall.loading": "Cargando planes\u2026",
  "paywall.load_error": "No se pudo conectar con el App Store.",
  "paywall.retry": "Reintentar",
  "paywall.restore_none": "No se encontr\xF3 ninguna compra anterior para este ID de Apple.",
  "paywall.restore_done": "Tu suscripci\xF3n est\xE1 de vuelta.",
  "paywall.purchase_error": "La compra no se complet\xF3.",
  "paywall.pending": "Esperando aprobaci\xF3n. Plus se activar\xE1 en cuanto se apruebe la compra.",
  "paywall.already_plus": "Ya tienes Murmur Plus.",
  "paywall.manage": "Gestionar suscripci\xF3n",
  "paywall.processing": "Procesando\u2026",
  "paywall.done": "Listo",
  "settings.subscription": "Suscripci\xF3n",
  "settings.plan_trial": "Prueba gratis \xB7 termina el {date}",
  "settings.plan_active_renews": "Murmur Plus \xB7 {plan} \xB7 se renueva el {date}",
  "settings.plan_active_ends": "Murmur Plus \xB7 {plan} \xB7 termina el {date}",
  "settings.plan_lapsed": "Plus termin\xF3 el {date}",
  "settings.get_plus": "Obtener Murmur Plus",
  "settings.plan_row_free": "Plan gratuito",
  "applepay.title": "Registra tus compras con Apple Pay autom\xE1ticamente",
  "applepay.body": "Config\xFAralo una vez. Despu\xE9s, cada vez que pagues con una tarjeta de Wallet, Murmur guarda el gasto en segundo plano, sin abrir nada, sin escribir. Apple solo lo permite mediante una automatizaci\xF3n de Atajos, as\xED que son seis toques en la app Atajos.",
  "applepay.steps_label": "En la app Atajos",
  "applepay.step_1": "Abre Atajos \u2192 pesta\xF1a Automatizaci\xF3n \u2192 toca +.",
  "applepay.step_2": "Elige Wallet (\xABAl usar una tarjeta o pase de Wallet\xBB). Selecciona Cualquier tarjeta, Ejecutar inmediatamente, desactiva Notificar al ejecutar \u2192 Siguiente.",
  "applepay.step_3": "Toca Nueva automatizaci\xF3n en blanco, luego A\xF1adir acci\xF3n y busca \xABMurmur\xBB.",
  "applepay.step_4": "Elige \xABRegistrar gasto en Murmur\xBB.",
  "applepay.step_5": "Toca el campo Importe \u2192 Seleccionar variable \u2192 Entrada del atajo \u2192 Importe. Toca el campo Comercio \u2192 Entrada del atajo \u2192 Comercio.",
  "applepay.step_6": "Toca OK. Listo: tu pr\xF3xima compra con Apple Pay se guardar\xE1 sola.",
  "applepay.open_shortcuts": "Abrir Atajos",
  "applepay.install_shortcut": "O instala el atajo listo para usar",
  "applepay.footnote": "Murmur solo recibe el importe y el comercio que Wallet pasa a la automatizaci\xF3n. Los reembolsos se ignoran. Puedes editar o deshacer cualquier compra guardada desde la lista.",
  "settings.apple_pay_capture": "Captura de Apple Pay",
  "settings.apple_pay_capture_detail": "Guardar compras autom\xE1ticamente",
  "applepay.uncategorised": "Sin categor\xEDa",
  "applepay.tap_to_edit": "Toca para editar",
  "applepay.notif_title": "Recibe una confirmaci\xF3n por cada compra",
  "applepay.notif_body": "Permite las notificaciones para que Murmur te diga qu\xE9 guard\xF3, con Deshacer y Editar ah\xED mismo.",
  "applepay.notif_allow": "Permitir notificaciones",
  "applepay.notif_denied": "Las notificaciones est\xE1n desactivadas para Murmur, act\xEDvalas en Ajustes \u2192 Notificaciones para ver las confirmaciones.",
  "common.edit": "Editar",
  "applepay.notif_captured": "Capturado de Apple Pay",
  "applepay.amount_unknown": "No se pudo leer el importe \xB7 Toca para a\xF1adirlo",
  "insights.highlights": "Destacados",
  "income.name_prompt_title": "\xBFQui\xE9n te paga?",
  "income.name_prompt_body": "Ponle un nombre a tu ingreso recurrente, por ejemplo tu empleador o cliente. Murmur lo usa en el registro y para el logo.",
  "income.name_prompt_later": "M\xE1s tarde",
  "welcome.demo_transcript": "Doce cincuenta en la panader\xEDa",
  "welcome.demo_merchant": "Panader\xEDa",
  "welcome.demo_category": "Comida",
  "welcome.trust": "Sin conectar tu banco. El audio nunca se guarda.",
  "onboarding.setup.headline": "As\xED queda Murmur configurado.",
  "onboarding.setup.lead": "Los tomamos de tu tel\xE9fono. Toca uno para cambiarlo.",
  "onboarding.setup.voice": "Escucha en",
  "onboarding.setup.voice_hint": "Sigue tu idioma",
  "onboarding.setup.currency_hint": "Todos los importes se muestran en esta moneda",
  "onboarding.setup.cta": "Todo bien",
  "onboarding.first_log.headline": "Pru\xE9balo ahora.",
  "onboarding.first_log.lead": "Toca el micr\xF3fono y di tu \xFAltima compra, como se lo contar\xEDas a un amigo.",
  "onboarding.first_log.example_label": "Por ejemplo",
  "onboarding.first_log.tap": "Toca para hablar",
  "onboarding.first_log.mic_note": "Murmur pedir\xE1 acceso al micr\xF3fono. El audio nunca se guarda.",
  "onboarding.first_log.later": "M\xE1s tarde",
  "onboarding.first_log.filed_title": "Registrado.",
  "onboarding.first_log.filed_body": "Ese es todo el h\xE1bito: dilo cuando pagues.",
  "onboarding.habit.headline": "No olvides ninguno.",
  "onboarding.habit.lead": "Sin conexi\xF3n bancaria, Murmur solo sabe lo que le cuentas. Dos formas de hacerlo sin esfuerzo.",
  "onboarding.habit.checkin_title": "Aviso por la noche",
  "onboarding.habit.checkin_body": "Un aviso suave al d\xEDa, que se salta los d\xEDas que ya registraste.",
  "onboarding.habit.notif_note": "Contin\xFAa y Murmur pedir\xE1 permiso para enviar notificaciones.",
  "onboarding.habit.applepay_title": "Apple Pay, registrado por ti",
  "onboarding.habit.applepay_body": "Paga con tu iPhone y el gasto se registra solo. Un minuto para configurarlo.",
  "onboarding.habit.applepay_toggle": "Configurarlo despu\xE9s",
  "reminders.checkin_title": "\xBFAlgo que anotar de hoy?",
  "reminders.checkin_body": "Dilo en una frase. Murmur lo registra.",
  "reminders.quiet3_title": "Unos d\xEDas tranquilos",
  "reminders.quiet3_body": "\xBFAlgo de los \xFAltimos d\xEDas? Una frase por gasto basta.",
  "reminders.quiet7_title": "Tu semana en un minuto",
  "reminders.quiet7_body": "Ponte al d\xEDa con los gastos de la semana mientras los recuerdas.",
  "reminders.prime_title": "\xBFUn aviso si se te olvida?",
  "reminders.prime_body": "Un aviso por la noche, que se salta los d\xEDas que ya registraste. C\xE1mbialo cuando quieras en Ajustes.",
  "settings.checkin_label": "Aviso por la noche",
  "settings.checkin_time": "Hora del aviso",
  "settings.notifications_off": "Las notificaciones de Murmur est\xE1n desactivadas. Act\xEDvalas en Ajustes para recibir avisos.",
  "voice.mic_denied": "Murmur a\xFAn no puede o\xEDrte. Activa Micr\xF3fono y Reconocimiento de voz para Murmur en Ajustes, o escr\xEDbelo.",
  "common.open_settings": "Abrir Ajustes",
  "common.not_now": "Ahora no",
  "start.title": "Primeros pasos",
  "start.progress": "{done} de {total}",
  "start.first_expense": "Registra tu primer gasto",
  "start.budget": "Define un presupuesto mensual",
  "start.income": "A\xF1ade tus ingresos",
  "start.applepay": "Registra Apple Pay autom\xE1ticamente",
  "privacy.group_improve": "Ayuda a mejorar Murmur",
  "privacy.analytics_label": "Datos de uso an\xF3nimos",
  "privacy.crash_label": "Informes de fallos",
  "auth.email_confirmed": "Correo confirmado",
  "auth.email_confirmed_body": "Inicia sesi\xF3n para continuar.",
  "voice.recognizer_error": "Murmur no te oy\xF3 bien. Int\xE9ntalo de nuevo o escr\xEDbelo.",
  "voice.parse_failed": "No se pudo registrar. Revisa tu conexi\xF3n e int\xE9ntalo de nuevo.",
  "common.save_failed": "No se pudo guardar. Revisa tu conexi\xF3n e int\xE9ntalo de nuevo.",
  "onboarding.setup.privacy_note": "Murmur guarda datos an\xF3nimos de uso y fallos para arreglar lo que se rompe. Nunca tus transacciones, importes ni lo que dices. Puedes desactivarlo cuando quieras en Ajustes, Privacidad.",
  "privacy.improve_note": "Activado por defecto. An\xF3nimo, nuestro, nunca compartido. Nunca tus transacciones, importes ni lo que dices.",
  "start.collapse": "Contraer",
  "start.expand": "Mostrar los pasos",
  "start.more": "M\xE1s opciones",
  "start.remove": "Quitar",
  "start.remove_title": "\xBFQuitar Primeros pasos?",
  "start.remove_body": "No volver\xE1. Puedes definir un presupuesto en Presupuestos, y a\xF1adir tus ingresos o la captura de Apple Pay en Ajustes.",
  "voice.nothing_heard_title": "No se escuch\xF3 nada",
  "voice.nothing_heard_body": "Toca el micr\xF3fono y dilo en voz alta, por ejemplo: \xAB{example}\xBB.",
  "voice.mic_off_title": "El micr\xF3fono est\xE1 desactivado",
  "voice.recognizer_error_title": "No te o\xEDmos bien",
  "voice.parse_failed_title": "No se pudo registrar",
  "notif.billing_issue_title": "Tu pago no se ha completado",
  "notif.billing_issue_body": "Plus est\xE1 en pausa. Actualiza tu m\xE9todo de pago para recuperarlo.",
  "notif.billing_issue_body_grace": "Plus sigue activo {days} d\xEDas m\xE1s mientras la tienda lo reintenta.",
  "notif.trial_ending_title": "Tu prueba gratuita termina pronto",
  "notif.trial_ending_body": "Plus empieza en {days} d\xEDas. Puedes cancelar cuando quieras en Ajustes.",
  "notif.trial_ending_off_title": "Tu prueba termina pronto",
  "notif.trial_ending_off_body": "La renovaci\xF3n est\xE1 desactivada, no se cobrar\xE1 nada. Plus se detiene al terminar la prueba.",
  "notif.plus_lapsed_title": "Plus ha terminado",
  "notif.plus_lapsed_body": "Todo lo que registraste sigue aqu\xED. Las funciones Plus est\xE1n desactivadas.",
  "notif.bill_tomorrow_title": "{name}, {amount}, se cobra ma\xF1ana",
  "notif.bill_tomorrow_body_left": "Te quedar\xE1n {left} este mes cuando se cobre.",
  "notif.bill_tomorrow_body": "{due} pendientes hasta fin de mes.",
  "notif.bill_week_title": "{count} recibos esta semana, {amount}",
  "notif.bill_week_body": "El primero: {name}, {amount}.",
  "notif.bill_missing_title": "{name} no ha aparecido",
  "notif.bill_missing_body": "Venc\xEDa hace unos d\xEDas. Reg\xEDstralo si lo pagaste de otra forma.",
  "notif.budget_over_title": "Te pasaste del presupuesto por {over}",
  "notif.budget_over_body": "Quedan {days} d\xEDas.",
  "notif.budget_category_over_title": "{category} se pasa por {over}",
  "notif.budget_80_title": "{pct} % de tu presupuesto, {days} d\xEDas restantes",
  "notif.budget_80_body": "{perDay} al d\xEDa para no pasarte. Quedan {left}.",
  "notif.weekly_recap_title": "La semana pasada: {amount}",
  "notif.weekly_recap_body_top": "{count} entradas. {category} fue lo m\xE1s alto con {amount}.",
  "notif.weekly_recap_body": "{count} entradas registradas.",
  "notif.winback_14_title": "Dos semanas sin registrar nada",
  "notif.winback_14_body": "Una frase y te pones al d\xEDa.",
  "notif.winback_30_title": "Tu registro lleva un mes en silencio",
  "notif.winback_30_body": "Ret\xF3malo con el primer gasto de hoy.",
  "notif.winback_60_title": "Aqu\xED seguimos cuando quieras",
  "notif.winback_60_body": "Todo lo que registraste te espera, tal cual.",
  "notif.winback_bills_title": "{count} recibos siguen en tu calendario",
  "notif.winback_bills_body": "{name} de {amount} es el pr\xF3ximo. \xBFMurmur los vigila?",
  "notifsettings.title": "Notificaciones",
  "notifsettings.hint": "Murmur env\xEDa como mucho una al d\xEDa, y nunca m\xE1s de unas pocas por semana.",
  "notifsettings.family_money": "Facturaci\xF3n y cuenta",
  "notifsettings.family_money_hint": "Un pago rechazado o una prueba que termina. Siempre se env\xEDa.",
  "notifsettings.family_bills": "Recibos pr\xF3ximos",
  "notifsettings.family_bills_hint": "Un cargo que llega ma\xF1ana, y lo que queda despu\xE9s.",
  "notifsettings.family_budget": "Presupuesto",
  "notifsettings.family_budget_hint": "Cuando te acercas al l\xEDmite, o lo pasas.",
  "notifsettings.family_receipts": "Confirmaciones",
  "notifsettings.family_receipts_hint": "Aviso cuando algo se guarda por ti.",
  "notifsettings.family_insights": "Resumen semanal y an\xE1lisis",
  "notifsettings.family_insights_hint": "Tu semana en una l\xEDnea, y cualquier cosa fuera de lo normal.",
  "notifsettings.family_habit": "Recordatorios",
  "notifsettings.family_habit_hint": "Un aviso si llevas tiempo sin aparecer.",
  "notifsettings.quiet_hours": "Horas de silencio",
  "notifsettings.quiet_hours_value": "de {start} a {end}",
  "notifsettings.max_per_week": "M\xE1ximo por semana",
  "notifsettings.max_per_week_value": "{count} por semana",
  "notifsettings.always_on": "Siempre activo",
  "notifsettings.permission_off": "Las notificaciones est\xE1n desactivadas para Murmur. Act\xEDvalas en Ajustes para recibirlas.",
  "ask.free_quota": "Te quedan {count} preguntas gratis este mes",
  "ask.free_quota_one": "Te queda 1 pregunta gratis este mes",
  "ask.free_quota_none": "No quedan preguntas gratis este mes",
  "ask.get_plus": "Obtener Plus",
  "plus.unlock": "Desbloquear con Plus",
  "insights.locked_history_title": "Tu a\xF1o, mes a mes",
  "insights.locked_history_body": "Compara meses, ve la tendencia y lee el panorama completo en vez de un solo mes.",
  "insights.locked_forecast_title": "D\xF3nde termina este mes",
  "insights.locked_forecast_body": "Murmur proyecta el resto del mes con tu ritmo y las facturas por llegar.",
  "insights.locked_month_title": "Los meses pasados son de Plus",
  "insights.this_month_free": "Este mes",
  "trial.ending_days": "Tu semana de Plus termina en {days} d\xEDas",
  "trial.ending_tomorrow": "Tu semana de Plus termina ma\xF1ana",
  "trial.ending_today": "Tu semana de Plus termina hoy",
  "trial.ending_body": "Ask Murmur, la app de escritorio, la detecci\xF3n autom\xE1tica de recurrentes y los informes. Registrar gastos sigue siendo gratis igualmente.",
  "trial.keep": "Mantener Plus",
  "trial.ended_title": "Tu semana de Plus termin\xF3",
  "trial.ended_body": "Est\xE1s en Murmur Gratis: gastos ilimitados, presupuestos y los an\xE1lisis de este mes, para siempre."
};

// packages/shared/src/i18n/locales/pt.json
var pt_default = {
  "app.name": "Murmur",
  "home.greeting": "Ol\xE1,",
  "home.net_balance": "Saldo L\xEDquido Este M\xEAs",
  "home.income": "Receitas",
  "home.expenses": "Despesas",
  "home.recent_activity": "Atividade Recente",
  "home.view_all": "Ver Tudo",
  "home.see_all_transactions": "Ver todas as {count} transa\xE7\xF5es",
  "home.safe_to_spend": "Dispon\xEDvel para Gastar",
  "home.over_budget": "Or\xE7amento excedido em",
  "home.set_budget": "Defina um or\xE7amento para acompanhar seus gastos",
  "home.spent_weekly": "Gasto esta semana",
  "home.spent_biweekly": "Gasto (\xFAltimos 14 dias)",
  "home.spent_quarterly": "Gasto este trimestre",
  "home.spent_yearly": "Gasto este ano",
  "home.spent_monthly": "Gasto este m\xEAs",
  "home.budget_weekly": "Or\xE7amento semanal",
  "home.budget_biweekly": "Or\xE7amento quinzenal",
  "home.budget_quarterly": "Or\xE7amento trimestral",
  "home.budget_yearly": "Or\xE7amento anual",
  "home.budget_monthly": "Or\xE7amento mensal",
  "home.upcoming": "Pr\xF3ximos",
  "home.spent_today": "Gasto hoje",
  "home.left_this_month": "restantes este m\xEAs",
  "home.left_this_week": "restantes esta semana",
  "home.left_this_period": "restantes neste per\xEDodo",
  "home.over_budget_suffix": "acima do or\xE7amento",
  "home.days_left_week": "dias restantes esta semana",
  "home.days_to_go": "dias restantes",
  "home.first_expense": "Toque o microfone para registrar sua primeira despesa",
  "home.day_one_progress": "Sua primeira despesa",
  "home.day_one_headline": "Tente registrar seu caf\xE9 da manh\xE3.",
  "home.day_one_body": "Toque o microfone e fale algo assim. N\xE3o precisa de uma frase espec\xEDfica, o Murmur entende.",
  "home.day_one_example_1": '"Quatro e cinquenta na padaria"',
  "home.day_one_example_2": '"Doze reais no Blue Bottle, caf\xE9"',
  "home.day_one_example_3": '"Trinta paus Uber de manh\xE3"',
  "home.day_one_or": "Ou",
  "home.day_one_type_instead": "digite no lugar",
  "home.net": "L\xEDquido",
  "voice.page_title": "Registrar",
  "voice.title": "Qual \xE9 a transa\xE7\xE3o?",
  "voice.subtitle": "Fale naturalmente, a IA cuida do resto",
  "voice.transcript_placeholder": "Suas palavras aparecer\xE3o aqui...",
  "listening.eyebrow": "Ouvindo",
  "listening.processing": "Processando",
  "listening.detected": "Detectado",
  "listening.waiting": "Aguardando seu valor\u2026",
  "listening.processed_on_device": "Processado com seguran\xE7a",
  "voice.save": "Salvar",
  "voice.parsed_expense": "Transa\xE7\xE3o Analisada",
  "voice.amount": "Valor",
  "voice.merchant": "Estabelecimento",
  "voice.category": "Categoria",
  "voice.tab_voice": "Voz",
  "voice.tab_manual": "Manual",
  "voice.tap_to_stop": "Toque para parar",
  "voice.tap_to_record": "Toque para gravar",
  "voice.parsing": "Analisando com IA...",
  "voice.scan_receipt": "Escanear Recibo",
  "voice.scan_paycheck": "Escanear Holerite",
  "voice.expense": "Despesa",
  "voice.income_label": "Receita",
  "voice.merchant_source": "Estabelecimento / Fonte",
  "voice.note": "Nota (opcional)",
  "voice.note_placeholder": "Adicionar uma nota...",
  "voice.more_options": "Mais op\xE7\xF5es",
  "voice.add_expense": "Adicionar despesa",
  "voice.add_income": "Adicionar receita",
  "voice.no_transcript": "N\xE3o captamos nada, toque o microfone para tentar de novo.",
  "voice.payment_method": "M\xE9todo de Pagamento",
  "voice.low_confidence": "Baixa confian\xE7a, por favor verifique os detalhes acima",
  "voice.ai_suggests": "Sugest\xE3o da IA:",
  "voice.invalid_amount": "Valor inv\xE1lido",
  "voice.invalid_amount_msg": "Digite um valor v\xE1lido maior que 0",
  "voice.amount_too_large": "Esse valor \xE9 grande demais, informe um valor menor que 9.999.999.999,99.",
  "voice.amount_too_many_decimals": "Valores podem ter no m\xE1ximo 2 casas decimais.",
  "voice.permission_required": "Permiss\xE3o necess\xE1ria",
  "voice.camera_permission": "O acesso \xE0 c\xE2mera \xE9 necess\xE1rio para escanear recibos.",
  "voice.scan_failed": "Falha no escaneamento",
  "voice.scan_rejected_title": "N\xE3o foi poss\xEDvel ler esse escaneamento",
  "voice.retake": "Repetir",
  "voice.enter_manually": "Inserir manualmente",
  "voice.save_changes": "Salvar altera\xE7\xF5es",
  "transactions.title": "Atividade",
  "transactions.search": "Pesquisar transa\xE7\xF5es...",
  "transactions.all_time": "Todo o hist\xF3rico",
  "transactions.pick_month": "Escolher um m\xEAs",
  "transactions.count_one": "1 transa\xE7\xE3o",
  "transactions.count_many": "{count} transa\xE7\xF5es",
  "transactions.filter": "Filtrar",
  "transactions.today": "Hoje",
  "transactions.yesterday": "Ontem",
  "transactions.empty": "Sem transa\xE7\xF5es",
  "transactions.empty_search": "Sem resultados",
  "transactions.uncategorized": "Sem categoria",
  "transactions.unknown": "Desconhecido",
  "transactions.filter_all": "Tudo",
  "detail.title": "Detalhe da Despesa",
  "detail.category": "Categoria",
  "detail.payment": "M\xE9todo de Pagamento",
  "detail.source": "Fonte",
  "detail.note": "Nota",
  "detail.recurring": "Recorrente",
  "detail.transcript": "Transcri\xE7\xE3o de Voz",
  "detail.date": "Data",
  "detail.logged_via": "Origem",
  "source.voice": "Voz",
  "source.manual": "Manual",
  "source.scan": "Digitaliza\xE7\xE3o de recibo",
  "source.shortcut": "Atalho do Apple Pay",
  "source.notification": "Notifica\xE7\xE3o de pagamento",
  "source.recurring": "Recorrente \xB7 gerado automaticamente",
  "detail.edit": "Editar",
  "detail.delete": "Excluir",
  "detail.delete_title": "Excluir transa\xE7\xE3o",
  "detail.delete_msg": "Esta a\xE7\xE3o n\xE3o pode ser desfeita.",
  "detail.deleted": "Exclu\xEDdo",
  "detail.not_found": "Transa\xE7\xE3o n\xE3o encontrada",
  "common.cancel": "Cancelar",
  "common.dismiss": "Fechar",
  "settings.reminders": "Lembretes",
  "settings.dunning_label": "Me lembrar se eu parar",
  "settings.privacy_data": "Privacidade e dados",
  "settings.export_label": "Exportar transa\xE7\xF5es",
  "settings.export_detail_plus": "CSV \xB7 JSON \xB7 PDF",
  "settings.export_detail_free": "Murmur Plus",
  "export.picker_title": "Formato de exporta\xE7\xE3o",
  "export.fmt_csv_label": "Planilha (.csv)",
  "export.fmt_csv_hint": "Para Excel, Numbers, Google Sheets.",
  "export.fmt_json_label": "Dados brutos (.json)",
  "export.fmt_json_hint": "Exporta\xE7\xE3o estruturada completa. Ideal para backup ou outras ferramentas.",
  "export.fmt_pdf_label": "Relat\xF3rio imprim\xEDvel (.pdf)",
  "export.fmt_pdf_hint": "Extrato formatado para imprimir ou enviar.",
  "export.share_dialog_title": "Salvar exporta\xE7\xE3o do Murmur",
  "export.failed_title": "Falha ao exportar",
  "export.pdf_eyebrow": "Murmur \xB7 Transa\xE7\xF5es",
  "export.pdf_title": "Suas transa\xE7\xF5es",
  "export.pdf_total_label": "Total gasto",
  "export.pdf_count_label": "Entradas",
  "export.col_date": "Data",
  "export.col_merchant": "Com\xE9rcio",
  "export.col_category": "Categoria",
  "export.col_amount": "Valor",
  "export.pdf_footer": "Exportado do Murmur. Seus dados, suas regras.",
  "home.pattern_eyebrow": "Novo padr\xE3o",
  "home.pattern_title": "Parece que {merchant} se repete em {amount} {frequency}.",
  "home.pattern_body": "Vimos {count} vezes. Quer que o Murmur acompanhe automaticamente?",
  "home.pattern_accept": "Ativar",
  "home.pattern_dismiss": "Agora n\xE3o",
  "insights.unlock_eyebrow": "Insights desbloqueados",
  "insights.unlock_title": "Tr\xEAs registros. Padr\xF5es a caminho.",
  "insights.unlock_body": "J\xE1 h\xE1 dados suficientes para o Murmur revelar tend\xEAncias, principais com\xE9rcios e para onde o m\xEAs est\xE1 indo.",
  "common.skip": "Pular",
  "common.continue": "Continuar",
  "onboarding.welcome.headline": "Fale.\nGaste com clareza.",
  "onboarding.income.source_label": "Fonte (opcional)",
  "onboarding.income.source_placeholder": "ex. Microsoft, freelance, gorjetas\u2026",
  "onboarding.income.per_month": "por m\xEAs",
  "onboarding.income.default_name": "Sal\xE1rio",
  "onboarding.income.txn_note": "Renda mensal (definida durante o onboarding)",
  "common.confirm": "Confirmar",
  "common.ok": "OK",
  "common.undo": "Desfazer",
  "common.save": "Salvar",
  "common.done": "Conclu\xEDdo",
  "common.yes": "Sim",
  "common.no": "N\xE3o",
  "common.none": "Nenhum",
  "common.loading": "Carregando...",
  "common.error": "Algo deu errado",
  "common.load_failed": "N\xE3o foi poss\xEDvel carregar seus dados",
  "common.retry": "Tentar novamente",
  "common.back": "Voltar",
  "auth.sign_in": "Entrar",
  "auth.sign_up": "Cadastrar",
  "auth.sign_out": "Sair",
  "auth.email": "Email",
  "auth.password": "Senha",
  "auth.continue_apple": "Continuar com Apple",
  "auth.continue_google": "Continuar com Google",
  "auth.welcome_back": "Bem-vindo de volta",
  "auth.sign_in_continue": "Entre para continuar",
  "auth.or_continue_with": "ou continuar com",
  "auth.no_account": "N\xE3o tem uma conta?",
  "auth.create_one": "Criar uma",
  "auth.has_account": "J\xE1 tem uma conta?",
  "auth.sign_in_link": "Entrar",
  "auth.create_account": "Criar conta",
  "auth.track_voice": "Rastreie despesas com sua voz",
  "auth.create_account_btn": "Criar Conta",
  "auth.password_short": "Senha muito curta",
  "auth.password_min": "A senha deve ter pelo menos 6 caracteres.",
  "auth.confirm_password": "Confirmar senha",
  "auth.passwords_no_match": "Essas duas senhas n\xE3o coincidem.",
  "auth.password_placeholder": "Pelo menos 6 caracteres",
  "auth.sign_in_failed": "Falha ao entrar",
  "auth.sign_up_failed": "Falha ao cadastrar",
  "auth.apple_failed": "Falha no Apple Sign-In",
  "auth.google_failed": "Falha no Google Sign-In",
  "auth.check_email": "Verifique seu email",
  "auth.confirmation_sent": "Enviamos um link de confirma\xE7\xE3o para {email}. Clique nele para ativar sua conta.",
  "auth.back_to_sign_in": "Voltar para Entrar",
  "auth.more_options": "Mais op\xE7\xF5es",
  "auth.hide_email_form": "Ocultar op\xE7\xF5es por e-mail",
  "auth.privacy_note": "Seus dados s\xE3o seus. Nunca os vendemos. Seu e-mail s\xF3 serve para manter sua sess\xE3o ativa.",
  "auth.forgot_password": "Esqueceu a senha?",
  "auth.forgot_password_need_email": "Digite seu e-mail acima primeiro.",
  "auth.reset_email_sent": "Enviamos um link de redefini\xE7\xE3o de senha para {email}. Abra-o neste dispositivo para definir uma nova senha.",
  "auth.reset_failed": "Falha ao redefinir",
  "auth.new_password_title": "Defina uma nova senha",
  "auth.new_password_body": "Escolha uma nova senha para sua conta.",
  "auth.update_password": "Atualizar senha",
  "auth.password_updated": "Senha atualizada",
  "auth.reset_link_invalid": "Este link de redefini\xE7\xE3o \xE9 inv\xE1lido ou expirou. Solicite um novo na tela de login.",
  "settings.title": "Configura\xE7\xF5es",
  "settings.budget": "Or\xE7amento Mensal",
  "settings.monthly_income": "Renda Mensal",
  "settings.income_amount": "Valor",
  "settings.income_source_helper": "Opcional. Se voc\xEA adicionar o nome de uma empresa, mostraremos o logotipo em suas entradas de receita.",
  "settings.currency": "Moeda",
  "settings.currency_confirm_title": "Mudar de moeda?",
  "settings.currency_confirm_body_prefix": "Isso vai converter",
  "settings.currency_confirm_body_suffix": "transa\xE7\xF5es, al\xE9m dos seus or\xE7amentos e renda mensal, para a nova moeda pela taxa de c\xE2mbio de hoje. Essa a\xE7\xE3o n\xE3o pode ser desfeita automaticamente.",
  "settings.currency_confirm_action": "Converter",
  "settings.currency_converting": "Convertendo seu hist\xF3rico\u2026",
  "settings.currency_offline_title": "Voc\xEA est\xE1 offline",
  "settings.currency_offline_body": "Mudar de moeda exige conex\xE3o para que nada fique parcialmente convertido. Tente novamente quando estiver online.",
  "settings.currency_failed_title": "Falha ao mudar de moeda",
  "settings.language": "Idioma",
  "settings.account": "Conta",
  "settings.display_name": "Nome de exibi\xE7\xE3o",
  "settings.preferences": "Prefer\xEAncias",
  "settings.developer": "Desenvolvedor",
  "settings.ai_server_url": "URL do servidor IA",
  "settings.about": "Sobre",
  "settings.version": "Vers\xE3o",
  "settings.budget_hint": "Defina seu or\xE7amento. O dispon\xEDvel rastrear\xE1 seu saldo restante.",
  "settings.budget_period": "Per\xEDodo or\xE7ament\xE1rio",
  "settings.payment_notifications": "Notifica\xE7\xF5es de pagamento",
  "settings.disable_notifications": "Desativar notifica\xE7\xF5es de pagamento",
  "settings.disable_notifications_msg": "Para desativar, abra Configura\xE7\xF5es > Apps > Acesso especial > Acesso a notifica\xE7\xF5es e remova este app.",
  "settings.ai_url_hint": "Digite a URL do seu servidor Next.js local (ex: http://192.168.1.5:3000). Alter\xE1vel sem reconstruir o app.",
  "settings.reset_default": "Restaurar padr\xE3o",
  "settings.your_name": "Seu nome",
  "tabs.home": "In\xEDcio",
  "tabs.today": "Hoje",
  "tabs.expenses": "Despesas",
  "tabs.record": "Registrar",
  "tabs.insights": "An\xE1lises",
  "insights.eyebrow_this_month": "Este m\xEAs",
  "insights.heading": "An\xE1lises",
  "insights.spent": "Gasto",
  "insights.vs": "vs",
  "insights.last_n_days_prefix": "\xDAltimos",
  "insights.last_n_days_suffix": "dias",
  "insights.history": "Hist\xF3rico",
  "insights.categories": "Categorias",
  "insights.other": "Outros",
  "insights.empty": "Sem gastos neste per\xEDodo ainda.",
  "insights.select_month": "Selecionar m\xEAs",
  "insights.forecast": "Previs\xE3o",
  "insights.forecast_line_prefix": "Neste ritmo, cerca de",
  "insights.forecast_line_suffix": "at\xE9 o fim de {month}.",
  "insights.forecast_below": "abaixo do habitual.",
  "insights.forecast_above": "acima do habitual.",
  "insights.forecast_same": "Bem na sua m\xE9dia.",
  "tabs.budgets": "Or\xE7amentos",
  "tabs.settings": "Configura\xE7\xF5es",
  "tabs.more": "Mais",
  "more.title": "Mais",
  "more.section_activity": "Atividade",
  "more.section_intelligence": "Intelig\xEAncia",
  "more.section_account": "Conta",
  "more.history": "Hist\xF3rico",
  "more.transactions": "Transa\xE7\xF5es",
  "history.heading_eyebrow": "Hist\xF3rico",
  "history.months": "Meses",
  "history.in_progress": "Em andamento",
  "history.browse_all": "Ver todas as transa\xE7\xF5es",
  "history.prev_month": "M\xEAs anterior",
  "history.next_month": "Pr\xF3ximo m\xEAs",
  "history.empty": "Nada registrado ainda. Registre sua primeira despesa para come\xE7ar o mapa.",
  "more.recurring": "Transa\xE7\xF5es recorrentes",
  "more.ask": "Ask Murmur",
  "more.settings": "Configura\xE7\xF5es",
  "more.privacy": "Centro de privacidade",
  "more.help": "Ajuda",
  "budgets.title": "Or\xE7amentos",
  "budgets.empty_title": "Os or\xE7amentos chegam em breve",
  "budgets.empty_body": "Um anel mensal e progresso por categoria. Chega na pr\xF3xima vers\xE3o.",
  "budgets.left_of": "de",
  "budgets.over_by": "ultrapassado em",
  "budgets.status_on_pace": "No ritmo",
  "budgets.status_tight": "Apertado",
  "budgets.status_over": "Ultrapassado",
  "budgets.no_budget_title": "Ainda sem or\xE7amento",
  "budgets.no_budget_body": "Defina um or\xE7amento mensal para que o anel mostre se voc\xEA est\xE1 apertado, ultrapassado, ou no ritmo.",
  "budgets.set_budget_cta": "Definir or\xE7amento",
  "budgets.edit_budget": "Editar or\xE7amento",
  "budgets.by_category": "Por categoria",
  "budgets.committed": "ainda a pagar",
  "budgets.ring_used": "usado",
  "privacy.title": "Seu dinheiro, seu.",
  "privacy.lead": "Murmur nunca se conecta ao seu banco, e sua voz \xE9 processada no seu telefone sempre que o aparelho permitir. Tudo o que voc\xEA registra \xE9 seu: exporte ou apague abaixo, a qualquer momento. O detalhe completo est\xE1 na pol\xEDtica de privacidade.",
  "privacy.group_rights": "Seus dados",
  "privacy.group_legal": "Legal",
  "privacy.policy_label": "Pol\xEDtica de privacidade",
  "privacy.terms_label": "Termos de uso",
  "privacy.export_all": "Exportar todos os meus dados",
  "privacy.export_all_busy": "Preparando exporta\xE7\xE3o\u2026",
  "privacy.export_all_failed": "N\xE3o foi poss\xEDvel exportar seus dados",
  "privacy.delete_all": "Excluir conta",
  "privacy.delete_all_title": "Excluir sua conta?",
  "privacy.delete_all_body": "Isso exclui permanentemente sua conta Murmur e tudo o que h\xE1 nela: transa\xE7\xF5es, or\xE7amentos, regras recorrentes, categorias e conversas do Ask. Uma assinatura Murmur Plus \xE9 gerenciada pela Apple e n\xE3o \xE9 cancelada ao excluir a conta. N\xE3o pode ser desfeito.",
  "privacy.delete_all_confirm": "Excluir conta",
  "privacy.delete_all_busy": "Excluindo conta\u2026",
  "privacy.delete_all_failed": "N\xE3o foi poss\xEDvel excluir sua conta",
  "ask.title": "Ask Murmur.",
  "ask.lead": "Fundamentado nas suas pr\xF3prias transa\xE7\xF5es. N\xE3o \xE9 conselho gen\xE9rico, seus dados, seus n\xFAmeros, uma resposta direta.",
  "ask.beta": "Beta",
  "ask.suggestion_afford": "Posso comprar um PS5 este m\xEAs?",
  "ask.suggestion_coffee": "Para onde est\xE1 indo meu or\xE7amento de caf\xE9?",
  "ask.suggestion_unusual": "Por que gastei mais que o normal semana passada?",
  "ask.suggestion_goal": "Me ajude a economizar R$500 at\xE9 agosto.",
  "ask.input_placeholder": "Pergunte algo sobre seus gastos\u2026",
  "ask.mic_label": "Pergunta por voz",
  "ask.send_label": "Enviar pergunta",
  "ask.privacy_note": "Seus dados nunca treinam um modelo",
  "ask.header_title": "Ask Murmur",
  "ask.thinking": "Lendo suas transa\xE7\xF5es\u2026",
  "ask.error": "N\xE3o conseguimos falar com Ask Murmur. Tente novamente em instantes.",
  "ask.retry": "Tentar de novo",
  "ask.followup_placeholder": "Pergunta de acompanhamento\u2026",
  "ask.attribution": "Baseado em {count} transa\xE7\xF5es no Murmur. Sem palpites, sem conselhos externos.",
  "ask.refusal_default": "S\xF3 consigo responder a partir das suas pr\xF3prias transa\xE7\xF5es, e isso est\xE1 fora do que posso ver.",
  "ask.action_create_goal": "Criar meta",
  "ask.action_show_category": "Ver categoria",
  "ask.action_show_transactions": "Ver transa\xE7\xF5es",
  "ask.action_set_budget": "Definir or\xE7amento",
  "ask.breakdown_caption": "Dos seus \xFAltimos 3 meses",
  "ask.today_eyebrow": "Hoje",
  "ask.entry_lead": "O Murmur acompanha o seu dinheiro. Isto \xE9 o que se destaca, ou pergunte o que quiser.",
  "ask.intent_eyebrow": "Quero\u2026",
  "ask.intent_budget": "Ver o meu or\xE7amento",
  "ask.intent_budget_q": "Como estou em rela\xE7\xE3o ao meu or\xE7amento?",
  "ask.intent_subs": "Cortar uma assinatura",
  "ask.intent_subs_q": "Quais das minhas cobran\xE7as recorrentes eu poderia cortar?",
  "ask.intent_where": "Ver para onde foi o dinheiro",
  "ask.intent_where_q": "Para onde foi o meu dinheiro este m\xEAs?",
  "ask.intent_plan": "Planejar uma compra",
  "ask.intent_plan_q": "Quanto posso gastar em algo novo este m\xEAs sem estourar?",
  "ask.composer_placeholder": "Pergunte qualquer coisa sobre o seu dinheiro\u2026",
  "ask.history": "Hist\xF3rico",
  "ask.history_empty": "Ainda n\xE3o h\xE1 conversas.",
  "ask.new_conversation": "Nova",
  "ask.delete": "Excluir",
  "ask.busy": "O Murmur est\xE1 ocupado, tente de novo em instantes.",
  "ask.plus_required": "O Ask Murmur faz parte do Murmur Plus.",
  "ask.action_open_recurring": "Ver recorrentes",
  "ask.action_log_expense": "Registrar um gasto",
  "ask.action_create_rule": "Adicionar recorrente",
  "ask.period_weekly": "semanal",
  "ask.period_biweekly": "quinzenal",
  "ask.period_monthly": "mensal",
  "ask.period_quarterly": "trimestral",
  "ask.period_yearly": "anual",
  "ask.insight_unnamed_rule": "Sem nome",
  "ask.insight_upcoming_title": "{name} {amount} vence em {date}",
  "ask.insight_upcoming_detail_income": "Com {due} de contas ainda por pagar, sobram {left} este m\xEAs.",
  "ask.insight_upcoming_detail_noincome": "{due} de contas ainda por pagar este m\xEAs.",
  "ask.insight_upcoming_question": "O que vem por a\xED e o que isso me deixa este m\xEAs?",
  "ask.insight_upcoming_action": "Ver recorrentes",
  "ask.insight_budget_over_title": "Or\xE7amento estourado em {over}",
  "ask.insight_budget_over_detail": "Faltam {days} dias no seu or\xE7amento {period}.",
  "ask.insight_budget_tight_title": "Restam {left} para {days} dias",
  "ask.insight_budget_tight_detail": "S\xE3o {pace}/dia, normalmente voc\xEA gasta {usual}/dia.",
  "ask.insight_budget_ok_title": "No caminho: restam {left} para {days} dias",
  "ask.insight_budget_ok_detail": "{pace}/dia mant\xE9m voc\xEA dentro do or\xE7amento; normalmente voc\xEA gasta {usual}/dia.",
  "ask.insight_budget_pace_only": "S\xE3o {pace}/dia para ficar dentro do or\xE7amento.",
  "ask.insight_budget_question": "Como estou em rela\xE7\xE3o ao meu or\xE7amento?",
  "ask.insight_budget_action": "Ajustar or\xE7amento",
  "ask.insight_surge_title": "{category} {amount} at\xE9 agora este m\xEAs",
  "ask.insight_surge_detail": "{pct}% acima do habitual a esta altura do m\xEAs.",
  "ask.insight_surge_question": "Por que {category} est\xE1 acima este m\xEAs?",
  "ask.insight_surge_action": "Ver transa\xE7\xF5es",
  "ask.insight_subs_title_one": "{a} leva {total} todo m\xEAs",
  "ask.insight_subs_title_two": "{a} + {b} levam {total} todo m\xEAs",
  "ask.insight_subs_title_many": "{a}, {b} + {n} outros levam {total} todo m\xEAs",
  "ask.insight_subs_detail": "Manter ou cortar?",
  "ask.insight_subs_question": "Quais das minhas cobran\xE7as recorrentes devo manter ou cortar?",
  "ask.insight_delta_title": "{category}: maior mudan\xE7a vs o m\xEAs passado",
  "ask.insight_delta_detail_up": "{delta} a mais do que a esta altura no m\xEAs passado.",
  "ask.insight_delta_detail_down": "{delta} a menos do que a esta altura no m\xEAs passado.",
  "ask.insight_delta_question": "O que mudou em {category} em rela\xE7\xE3o ao m\xEAs passado?",
  "ask.insight_netflow_title": "Gastos {spent} de {income} at\xE9 agora este m\xEAs",
  "ask.insight_netflow_detail": "Restam {left}, faltam {days} dias.",
  "ask.insight_netflow_over_title": "Voc\xEA gastou {over} a mais do que ganhou este m\xEAs",
  "ask.insight_netflow_over_detail": "{spent} sa\xEDram, {income} entraram at\xE9 agora.",
  "ask.insight_netflow_question": "Como estou no geral este m\xEAs?",
  "ask.insight_large_title": "{merchant} {amount} em {date}",
  "ask.insight_large_detail": "{times}\xD7 a sua compra habitual.",
  "ask.insight_large_question": "Me conte sobre a cobran\xE7a de {merchant}.",
  "ask.insight_large_action": "Ver transa\xE7\xE3o",
  "ask.insight_nodata_title": "Registre alguns gastos e o Murmur come\xE7a a acompanhar o seu dinheiro",
  "ask.insight_nodata_detail": "Assim que houver dados, contas a vencer, ritmo do or\xE7amento e gastos incomuns aparecem aqui.",
  "ask.insight_nodata_question": "Com o que voc\xEA pode me ajudar?",
  "ask.insight_nodata_action": "Registrar um gasto",
  "ask.continue_eyebrow": "Retome de onde parou",
  "ask.continue_open": "Continuar",
  "ask.kind_upcoming_bill": "Conta a vencer",
  "ask.kind_budget_pace": "Or\xE7amento",
  "ask.kind_category_surge": "Em alta",
  "ask.kind_subscriptions": "Recorrentes",
  "ask.kind_month_delta": "Vs o m\xEAs passado",
  "ask.kind_net_flow": "Este m\xEAs",
  "ask.kind_large_transaction": "Compra incomum",
  "ask.kind_no_data": "Para come\xE7ar",
  "help.title": "Ajuda",
  "help.body": "Murmur est\xE1 come\xE7ando. Se algo n\xE3o funcionar ou voc\xEA tiver uma ideia, escreva-nos, chega direto na caixa de quem est\xE1 construindo.",
  "help.body_no_contact": "Murmur est\xE1 come\xE7ando, obrigado por experimentar. O suporte no aplicativo ainda n\xE3o est\xE1 dispon\xEDvel.",
  "help.contact": "Contato",
  "help.version": "Vers\xE3o",
  "recurring.title": "Transa\xE7\xF5es Recorrentes",
  "recurring.toggle": "Marcar como recorrente",
  "recurring.edit_scope_title": "Aplicar a qual?",
  "recurring.edit_scope_body": "Esta transa\xE7\xE3o foi gerada por uma regra recorrente. Atualizar somente esta, ou esta e todas as pr\xF3ximas?",
  "recurring.edit_scope_one": "Somente esta",
  "recurring.edit_scope_all_future": "Esta e todas as pr\xF3ximas",
  "recurring.frequency": "Frequ\xEAncia",
  "recurring.daily": "Di\xE1rio",
  "recurring.weekly": "Semanal",
  "recurring.biweekly": "Quinzenal",
  "recurring.monthly": "Mensal",
  "recurring.quarterly": "Trimestral",
  "recurring.yearly": "Anual",
  "recurring.short_daily": "/dia",
  "recurring.short_weekly": "/sem",
  "recurring.short_biweekly": "/2sem",
  "recurring.short_monthly": "/m\xEAs",
  "recurring.short_quarterly": "/trim",
  "recurring.short_yearly": "/ano",
  "recurring.active": "Ativo",
  "recurring.paused": "Pausado",
  "recurring.next_due": "Pr\xF3ximo",
  "recurring.empty": "Sem transa\xE7\xF5es recorrentes",
  "recurring.empty_sub": "Configure transa\xE7\xF5es recorrentes para rastrear assinaturas, aluguel e contas",
  "recurring.ai_detected": "A IA detectou que isso pode ser recorrente",
  "recurring.ai_badge": "IA",
  "recurring.delete_confirm": "Excluir esta regra recorrente?",
  "recurring.eyebrow_detected": "Detectado automaticamente",
  "recurring.heading": "Recorrentes",
  "recurring.paid_monthly": "Pago por m\xEAs",
  "recurring.per_month": "/ m\xEAs",
  "recurring.yearly_prefix": "Isso \xE9",
  "recurring.yearly_suffix": "por ano.",
  "recurring.pause": "Pausar",
  "recurring.resume": "Retomar",
  "recurring.overdue": "Atrasado, gera\xE7\xE3o pendente",
  "recurring.inflow_monthly": "Mais {amount}/m\xEAs de renda",
  "recurring.add_manually": "Adicionar manualmente",
  "recurring.new_rule_title": "Nova regra recorrente",
  "recurring.edit_rule_title": "Editar regra recorrente",
  "recurring.name_label": "Nome",
  "recurring.name_placeholder": "ex. Netflix",
  "recurring.amount_label": "Valor",
  "recurring.currency_label": "Moeda",
  "recurring.interval_label": "Repetir a cada",
  "recurring.interval_hint": "2 = a cada dois ciclos",
  "recurring.next_charge_label": "Pr\xF3xima cobran\xE7a",
  "recurring.end_date_toggle": "Tem data de t\xE9rmino",
  "recurring.end_date_label": "Cancelar a partir de",
  "recurring.no_end_date": "Sem data de t\xE9rmino",
  "recurring.invalid_date": "Insira uma data v\xE1lida (AAAA-MM-DD)",
  "recurring.save_error": "N\xE3o foi poss\xEDvel salvar esta regra, tente novamente.",
  "recurring.active_section": "Ativas",
  "recurring.paused_section": "Pausadas",
  "settings.recurring": "Transa\xE7\xF5es Recorrentes",
  "payment.cash": "Dinheiro",
  "payment.credit_card": "Cart\xE3o de cr\xE9dito",
  "payment.debit_card": "Cart\xE3o de d\xE9bito",
  "payment.digital_wallet": "Carteira digital",
  "payment.bank_transfer": "Transfer\xEAncia banc\xE1ria",
  "category.select": "Selecionar categoria\u2026",
  "category.new": "Nova categoria",
  "category.name_placeholder": "Nome da categoria",
  "category.add": "Adicionar",
  "category.create_error": "N\xE3o foi poss\xEDvel criar a categoria. Talvez j\xE1 exista.",
  "voice.merchant_placeholder": "ex. Starbucks",
  "voice.got_it": "Entendi",
  "voice.redo": "Refazer",
  "voice.save_expense": "Salvar despesa",
  "voice.save_income": "Salvar receita",
  "voice.edit": "Editar",
  "voice.edit_expense": "Editar despesa",
  "voice.edit_income": "Editar receita",
  "voice.discard_expense": "Descartar esta despesa",
  "voice.discard_income": "Descartar esta receita",
  "voice.date_time": "Data e hora",
  "voice.quick_entry": "Entrada r\xE1pida",
  "voice.saved": "Salvo",
  "voice.type_instead": "Digitar",
  "settings.confirm_sign_out": "Tem certeza?",
  "settings.invalid_budget": "Digite um valor de or\xE7amento v\xE1lido.",
  "settings.budget_save_error": "N\xE3o foi poss\xEDvel salvar o or\xE7amento.",
  "settings.period_weekly": "Semanal",
  "settings.period_biweekly": "Quinzenal (a cada 2 semanas)",
  "settings.period_monthly": "Mensal",
  "settings.period_quarterly": "Trimestral",
  "settings.period_yearly": "Anual",
  "settings.plan_free": "Plano gr\xE1tis",
  "settings.plan_plus": "Murmur Plus",
  "settings.expenses_count": "despesas",
  "settings.upgrade": "Melhorar",
  "settings.voice_capture": "Voz e captura",
  "settings.voice_engine": "Motor de voz",
  "settings.voice_engine_on_device": "Transcri\xE7\xE3o local",
  "settings.voice_engine_apple": "Reconhecimento de voz da Apple",
  "settings.review": "Revisar",
  "paywall.eyebrow": "Murmur Plus",
  "paywall.headline": "Aproveite mais cada murm\xFArio.",
  "paywall.body": "Ask Murmur, dete\xE7\xE3o de recorr\xEAncias, exporta\xE7\xE3o completa e a app de desktop, uma \xFAnica assinatura, cancele quando quiser.",
  "paywall.feature_desktop": "App desktop com tend\xEAncias, previs\xF5es e or\xE7amentos",
  "paywall.feature_ask_murmur": "Ask Murmur. IA fundamentada nos seus pr\xF3prios dados",
  "paywall.feature_auto_recurring": "Detec\xE7\xE3o autom\xE1tica de assinaturas",
  "paywall.feature_export": "Exportar para CSV e PDF",
  "paywall.disclaimer": "As compras ainda n\xE3o est\xE3o dispon\xEDveis nesta vers\xE3o.",
  "settings.timezone": "Fuso hor\xE1rio",
  "settings.sync": "Sincroniza\xE7\xE3o",
  "settings.sync_last_synced": "\xDAltima sincroniza\xE7\xE3o",
  "settings.sync_never": "Nunca",
  "settings.sync_in_progress": "Sincronizando\u2026",
  "settings.sync_queued_suffix": "na fila",
  "settings.sync_issues": "Problemas de sincroniza\xE7\xE3o",
  "settings.sync_issues_empty": "Nenhum problema de sincroniza\xE7\xE3o",
  "settings.sync_failed_suffix": "com falha",
  "settings.sync_unknown_error": "Erro desconhecido",
  "settings.sync_retry_all": "Repetir tudo",
  "settings.sync_discard": "Descartar",
  "settings.sync_item_singular": "item n\xE3o p\xF4de ser sincronizado",
  "settings.sync_item_plural": "itens n\xE3o puderam ser sincronizados",
  "settings.sync_details": "Detalhes",
  "settings.sync_hide": "Ocultar",
  "nav.transaction": "Transa\xE7\xE3o",
  "nav.add_expense": "Adicionar Despesa",
  "nav.edit_transaction": "Editar Transa\xE7\xE3o",
  "recurring.add_rule_cta": "Adicionar regra",
  "recurring.eyebrow": "Assinaturas, contas e rendimentos",
  "recurring.expenses_per_month": "Despesas recorrentes \xB7 por m\xEAs",
  "recurring.income_per_month": "Rendimentos recorrentes",
  "recurring.hero_footnote": "Cada frequ\xEAncia aparece como valor mensal, um sal\xE1rio a cada 2 semanas conta 26 \xF7 12 vezes, uma conta semanal 52 \xF7 12.",
  "recurring.expenses_section": "Despesas",
  "recurring.income_section": "Rendimentos",
  "budgets.applies_to": "Aplica-se a",
  "budgets.scope_overall": "Todos os gastos",
  "budgets.by_category_empty": "Ainda n\xE3o h\xE1 or\xE7amentos por categoria. Limite uma \xE1rea, mercado, restaurantes, compras, e acompanhe aqui.",
  "budgets.add_category_budget": "Adicionar or\xE7amento por categoria",
  "budgets.remove_confirm": "Remover este or\xE7amento?",
  "paywall.plan_yearly": "Anual",
  "paywall.plan_monthly": "Mensal",
  "paywall.per_year": "por ano",
  "paywall.per_month": "por m\xEAs",
  "paywall.equiv_per_month": "{price} / m\xEAs",
  "paywall.best_value": "Melhor valor",
  "paywall.save_pct": "Poupe {pct}%",
  "paywall.trial_badge": "{days} dias gr\xE1tis",
  "paywall.cta_trial": "Experimentar {days} dias gr\xE1tis",
  "paywall.cta_subscribe": "Assinar \xB7 {price}",
  "paywall.fine_print_trial": "Gr\xE1tis durante {days} dias, depois {price} {period}. Renova automaticamente at\xE9 ser cancelada nas defini\xE7\xF5es do seu ID Apple, pelo menos 24 h antes do fim do per\xEDodo. Cancele quando quiser.",
  "paywall.fine_print": "{price} {period}. Renova automaticamente at\xE9 ser cancelada nas defini\xE7\xF5es do seu ID Apple, pelo menos 24 h antes do fim do per\xEDodo. Cancele quando quiser.",
  "paywall.restore": "Restaurar compras",
  "paywall.terms": "Termos",
  "paywall.privacy": "Privacidade",
  "paywall.loading": "A carregar planos\u2026",
  "paywall.load_error": "N\xE3o foi poss\xEDvel contactar a App Store.",
  "paywall.retry": "Tentar novamente",
  "paywall.restore_none": "N\xE3o foi encontrada nenhuma compra anterior para este ID Apple.",
  "paywall.restore_done": "A sua assinatura foi restaurada.",
  "paywall.purchase_error": "A compra n\xE3o foi conclu\xEDda.",
  "paywall.pending": "A aguardar aprova\xE7\xE3o. O Plus \xE9 ativado assim que a compra for aprovada.",
  "paywall.already_plus": "J\xE1 tem o Murmur Plus.",
  "paywall.manage": "Gerir assinatura",
  "paywall.processing": "A processar\u2026",
  "paywall.done": "Conclu\xEDdo",
  "settings.subscription": "Assinatura",
  "settings.plan_trial": "Teste gr\xE1tis \xB7 termina a {date}",
  "settings.plan_active_renews": "Murmur Plus \xB7 {plan} \xB7 renova a {date}",
  "settings.plan_active_ends": "Murmur Plus \xB7 {plan} \xB7 termina a {date}",
  "settings.plan_lapsed": "Plus terminou a {date}",
  "settings.get_plus": "Obter Murmur Plus",
  "settings.plan_row_free": "Plano gratuito",
  "applepay.title": "Registe as compras com Apple Pay automaticamente",
  "applepay.body": "Configure uma vez. Depois, sempre que pagar com um cart\xE3o da Wallet, o Murmur guarda a despesa em segundo plano, nada para abrir, nada para escrever. A Apple s\xF3 permite isto atrav\xE9s de uma automatiza\xE7\xE3o dos Atalhos, por isso s\xE3o seis toques na app Atalhos.",
  "applepay.steps_label": "Na app Atalhos",
  "applepay.step_1": "Abra os Atalhos \u2192 separador Automatiza\xE7\xE3o \u2192 toque em +.",
  "applepay.step_2": "Escolha Wallet (\xABQuando toco num cart\xE3o ou passe da Wallet\xBB). Selecione Qualquer cart\xE3o, Executar imediatamente, desligue Notificar ao executar \u2192 Seguinte.",
  "applepay.step_3": "Toque em Nova automatiza\xE7\xE3o em branco, depois Adicionar a\xE7\xE3o e procure \xABMurmur\xBB.",
  "applepay.step_4": "Escolha \xABRegistar despesa no Murmur\xBB.",
  "applepay.step_5": "Toque no campo Valor \u2192 Selecionar vari\xE1vel \u2192 Entrada do atalho \u2192 Valor. Toque no campo Comerciante \u2192 Entrada do atalho \u2192 Comerciante.",
  "applepay.step_6": "Toque em OK. \xC9 tudo, a pr\xF3xima compra com Apple Pay guarda-se sozinha.",
  "applepay.open_shortcuts": "Abrir Atalhos",
  "applepay.install_shortcut": "Ou instale o atalho pronto a usar",
  "applepay.footnote": "O Murmur s\xF3 recebe o valor e o comerciante que a Wallet passa \xE0 automatiza\xE7\xE3o. Reembolsos s\xE3o ignorados. Pode editar ou anular qualquer compra guardada a partir da lista.",
  "settings.apple_pay_capture": "Captura Apple Pay",
  "settings.apple_pay_capture_detail": "Guardar compras automaticamente",
  "applepay.uncategorised": "Sem categoria",
  "applepay.tap_to_edit": "Toque para editar",
  "applepay.notif_title": "Receba uma confirma\xE7\xE3o por cada compra",
  "applepay.notif_body": "Permita notifica\xE7\xF5es para que o Murmur lhe diga o que guardou, com Anular e Editar ali mesmo.",
  "applepay.notif_allow": "Permitir notifica\xE7\xF5es",
  "applepay.notif_denied": "As notifica\xE7\xF5es est\xE3o desativadas para o Murmur, ative-as em Defini\xE7\xF5es \u2192 Notifica\xE7\xF5es para ver as confirma\xE7\xF5es.",
  "common.edit": "Editar",
  "applepay.notif_captured": "Capturado do Apple Pay",
  "applepay.amount_unknown": "N\xE3o foi poss\xEDvel ler o valor \xB7 Toque para adicionar",
  "insights.highlights": "Destaques",
  "income.name_prompt_title": "Quem paga voc\xEA?",
  "income.name_prompt_body": "D\xEA um nome \xE0 sua renda recorrente, por exemplo seu empregador ou cliente. Murmur usa isso no registro e para o logo.",
  "income.name_prompt_later": "Mais tarde",
  "welcome.demo_transcript": "Doze e cinquenta na padaria",
  "welcome.demo_merchant": "Padaria",
  "welcome.demo_category": "Alimenta\xE7\xE3o",
  "welcome.trust": "Sem conectar seu banco. O \xE1udio nunca \xE9 salvo.",
  "onboarding.setup.headline": "Veja como o Murmur ficou configurado.",
  "onboarding.setup.lead": "Pegamos do seu celular. Toque em um para mudar.",
  "onboarding.setup.voice": "Ouve em",
  "onboarding.setup.voice_hint": "Segue seu idioma",
  "onboarding.setup.currency_hint": "Todos os valores aparecem nesta moeda",
  "onboarding.setup.cta": "Tudo certo",
  "onboarding.first_log.headline": "Experimente agora.",
  "onboarding.first_log.lead": "Toque no microfone e diga sua \xFAltima compra, como contaria a um amigo.",
  "onboarding.first_log.example_label": "Por exemplo",
  "onboarding.first_log.tap": "Toque para falar",
  "onboarding.first_log.mic_note": "O Murmur vai pedir acesso ao microfone. O \xE1udio nunca \xE9 salvo.",
  "onboarding.first_log.later": "Depois",
  "onboarding.first_log.filed_title": "Registrado.",
  "onboarding.first_log.filed_body": "Esse \xE9 todo o h\xE1bito: diga quando pagar.",
  "onboarding.habit.headline": "N\xE3o esque\xE7a nenhum.",
  "onboarding.habit.lead": "Sem conex\xE3o com o banco, o Murmur s\xF3 sabe o que voc\xEA conta. Duas formas de facilitar.",
  "onboarding.habit.checkin_title": "Lembrete \xE0 noite",
  "onboarding.habit.checkin_body": "Um lembrete leve por dia, pulado nos dias em que voc\xEA j\xE1 registrou.",
  "onboarding.habit.notif_note": "Continue e o Murmur vai pedir para enviar notifica\xE7\xF5es.",
  "onboarding.habit.applepay_title": "Apple Pay, registrado para voc\xEA",
  "onboarding.habit.applepay_body": "Pague com o iPhone e a despesa se registra sozinha. Um minuto para configurar.",
  "onboarding.habit.applepay_toggle": "Configurar em seguida",
  "reminders.checkin_title": "Algo para anotar de hoje?",
  "reminders.checkin_body": "Diga em uma frase. O Murmur registra.",
  "reminders.quiet3_title": "Alguns dias tranquilos",
  "reminders.quiet3_body": "Algo dos \xFAltimos dias? Uma frase por gasto basta.",
  "reminders.quiet7_title": "Sua semana em um minuto",
  "reminders.quiet7_body": "Coloque os gastos da semana em dia enquanto ainda lembra.",
  "reminders.prime_title": "Quer um lembrete se esquecer?",
  "reminders.prime_body": "Um lembrete \xE0 noite, pulado nos dias em que voc\xEA j\xE1 registrou. Mude quando quiser em Ajustes.",
  "settings.checkin_label": "Lembrete \xE0 noite",
  "settings.checkin_time": "Hor\xE1rio do lembrete",
  "settings.notifications_off": "As notifica\xE7\xF5es do Murmur est\xE3o desligadas. Ative em Ajustes para receber lembretes.",
  "voice.mic_denied": "O Murmur ainda n\xE3o consegue ouvir voc\xEA. Ative Microfone e Reconhecimento de fala para o Murmur em Ajustes, ou digite.",
  "common.open_settings": "Abrir Ajustes",
  "common.not_now": "Agora n\xE3o",
  "start.title": "Primeiros passos",
  "start.progress": "{done} de {total}",
  "start.first_expense": "Registre seu primeiro gasto",
  "start.budget": "Defina um or\xE7amento mensal",
  "start.income": "Adicione sua renda",
  "start.applepay": "Registre o Apple Pay automaticamente",
  "privacy.group_improve": "Ajude a melhorar o Murmur",
  "privacy.analytics_label": "Dados de uso an\xF4nimos",
  "privacy.crash_label": "Relat\xF3rios de falhas",
  "auth.email_confirmed": "E-mail confirmado",
  "auth.email_confirmed_body": "Entre para continuar.",
  "voice.recognizer_error": "O Murmur n\xE3o ouviu direito. Tente de novo ou digite.",
  "voice.parse_failed": "N\xE3o foi poss\xEDvel registrar. Verifique sua conex\xE3o e tente de novo.",
  "common.save_failed": "N\xE3o foi poss\xEDvel salvar. Verifique sua conex\xE3o e tente de novo.",
  "onboarding.setup.privacy_note": "O Murmur guarda dados an\xF4nimos de uso e falhas para corrigir o que quebra. Nunca suas transa\xE7\xF5es, valores ou o que voc\xEA fala. Desligue quando quiser em Ajustes, Privacidade.",
  "privacy.improve_note": "Ligado por padr\xE3o. An\xF4nimo, nosso, nunca compartilhado. Nunca suas transa\xE7\xF5es, valores ou o que voc\xEA fala.",
  "start.collapse": "Recolher",
  "start.expand": "Mostrar as etapas",
  "start.more": "Mais op\xE7\xF5es",
  "start.remove": "Remover",
  "start.remove_title": "Remover Primeiros passos?",
  "start.remove_body": "Ele n\xE3o volta. Voc\xEA ainda pode definir um or\xE7amento em Or\xE7amentos, e adicionar sua renda ou a captura do Apple Pay em Ajustes.",
  "voice.nothing_heard_title": "Nada ouvido",
  "voice.nothing_heard_body": "Toque no microfone e diga em voz alta, por exemplo: \u201C{example}\u201D.",
  "voice.mic_off_title": "O microfone est\xE1 desligado",
  "voice.recognizer_error_title": "N\xE3o ouvimos direito",
  "voice.parse_failed_title": "N\xE3o foi poss\xEDvel registrar",
  "notif.billing_issue_title": "Seu pagamento n\xE3o foi aprovado",
  "notif.billing_issue_body": "O Plus est\xE1 pausado. Atualize sua forma de pagamento para reativ\xE1-lo.",
  "notif.billing_issue_body_grace": "O Plus continua funcionando por mais {days} dias enquanto a loja tenta de novo.",
  "notif.trial_ending_title": "Seu teste gr\xE1tis termina em breve",
  "notif.trial_ending_body": "O Plus come\xE7a em {days} dias. D\xE1 para cancelar quando quiser nos ajustes.",
  "notif.trial_ending_off_title": "Seu teste termina em breve",
  "notif.trial_ending_off_body": "A renova\xE7\xE3o est\xE1 desligada, nada ser\xE1 cobrado. O Plus para no fim do teste.",
  "notif.plus_lapsed_title": "O Plus terminou",
  "notif.plus_lapsed_body": "Tudo o que voc\xEA registrou continua aqui. Os recursos Plus est\xE3o desligados.",
  "notif.bill_tomorrow_title": "{name}, {amount}, cai amanh\xE3",
  "notif.bill_tomorrow_body_left": "V\xE3o sobrar {left} neste m\xEAs depois disso.",
  "notif.bill_tomorrow_body": "{due} ainda a pagar at\xE9 o fim do m\xEAs.",
  "notif.bill_week_title": "{count} contas nesta semana, {amount}",
  "notif.bill_week_body": "A primeira: {name}, {amount}.",
  "notif.bill_missing_title": "{name} n\xE3o apareceu",
  "notif.bill_missing_body": "Venceu h\xE1 alguns dias. Registre se voc\xEA pagou de outro jeito.",
  "notif.budget_over_title": "Passou do or\xE7amento em {over}",
  "notif.budget_over_body": "Ainda faltam {days} dias.",
  "notif.budget_category_over_title": "{category} passou em {over}",
  "notif.budget_80_title": "{pct}% do seu or\xE7amento, {days} dias restantes",
  "notif.budget_80_body": "{perDay} por dia para n\xE3o estourar. Restam {left}.",
  "notif.weekly_recap_title": "Semana passada: {amount}",
  "notif.weekly_recap_body_top": "{count} lan\xE7amentos. {category} liderou com {amount}.",
  "notif.weekly_recap_body": "{count} lan\xE7amentos registrados.",
  "notif.winback_14_title": "Duas semanas sem registrar nada",
  "notif.winback_14_body": "Uma frase j\xE1 te coloca em dia.",
  "notif.winback_30_title": "Seu registro est\xE1 quieto h\xE1 um m\xEAs",
  "notif.winback_30_body": "Retome com o primeiro gasto de hoje.",
  "notif.winback_60_title": "Seguimos aqui quando voc\xEA quiser",
  "notif.winback_60_body": "Tudo o que voc\xEA registrou continua esperando, do jeito que ficou.",
  "notif.winback_bills_title": "{count} contas ainda est\xE3o no seu calend\xE1rio",
  "notif.winback_bills_body": "{name} de {amount} \xE9 a pr\xF3xima. O Murmur fica de olho?",
  "notifsettings.title": "Notifica\xE7\xF5es",
  "notifsettings.hint": "O Murmur envia no m\xE1ximo uma por dia, e nunca mais do que algumas por semana.",
  "notifsettings.family_money": "Cobran\xE7a e conta",
  "notifsettings.family_money_hint": "Um pagamento recusado ou um teste terminando. Sempre enviado.",
  "notifsettings.family_bills": "Contas a vencer",
  "notifsettings.family_bills_hint": "Uma cobran\xE7a que cai amanh\xE3, e o que sobra depois.",
  "notifsettings.family_budget": "Or\xE7amento",
  "notifsettings.family_budget_hint": "Quando voc\xEA chega perto do limite, ou passa dele.",
  "notifsettings.family_receipts": "Confirma\xE7\xF5es",
  "notifsettings.family_receipts_hint": "Aviso quando algo \xE9 salvo para voc\xEA.",
  "notifsettings.family_insights": "Resumo semanal e an\xE1lises",
  "notifsettings.family_insights_hint": "Sua semana em uma linha, e o que fugir do normal.",
  "notifsettings.family_habit": "Lembretes",
  "notifsettings.family_habit_hint": "Um lembrete se voc\xEA ficar um tempo fora.",
  "notifsettings.quiet_hours": "Hor\xE1rio de sil\xEAncio",
  "notifsettings.quiet_hours_value": "das {start} \xE0s {end}",
  "notifsettings.max_per_week": "No m\xE1ximo por semana",
  "notifsettings.max_per_week_value": "{count} por semana",
  "notifsettings.always_on": "Sempre ativo",
  "notifsettings.permission_off": "As notifica\xE7\xF5es est\xE3o desligadas para o Murmur. Ative-as nos ajustes para receb\xEA-las.",
  "ask.free_quota": "{count} perguntas gr\xE1tis restantes este m\xEAs",
  "ask.free_quota_one": "1 pergunta gr\xE1tis restante este m\xEAs",
  "ask.free_quota_none": "Sem perguntas gr\xE1tis este m\xEAs",
  "ask.get_plus": "Obter o Plus",
  "plus.unlock": "Desbloquear com o Plus",
  "insights.locked_history_title": "Seu ano, m\xEAs a m\xEAs",
  "insights.locked_history_body": "Compare meses, veja a tend\xEAncia e leia o quadro inteiro em vez de um m\xEAs s\xF3.",
  "insights.locked_forecast_title": "Onde este m\xEAs termina",
  "insights.locked_forecast_body": "O Murmur projeta o resto do m\xEAs pelo seu ritmo e pelas contas que faltam.",
  "insights.locked_month_title": "Meses anteriores s\xE3o do Plus",
  "insights.this_month_free": "Este m\xEAs",
  "trial.ending_days": "Sua semana de Plus termina em {days} dias",
  "trial.ending_tomorrow": "Sua semana de Plus termina amanh\xE3",
  "trial.ending_today": "Sua semana de Plus termina hoje",
  "trial.ending_body": "Ask Murmur, o app de computador, a detec\xE7\xE3o autom\xE1tica de recorr\xEAncias e os relat\xF3rios. Registrar gastos continua gr\xE1tis de qualquer forma.",
  "trial.keep": "Manter o Plus",
  "trial.ended_title": "Sua semana de Plus terminou",
  "trial.ended_body": "Voc\xEA est\xE1 no Murmur Gr\xE1tis: gastos ilimitados, or\xE7amentos e as an\xE1lises deste m\xEAs, para sempre."
};

// packages/shared/src/i18n/index.ts
var locales = { en: en_default, fr: fr_default, es: es_default, pt: pt_default };
var SUPPORTED_LOCALES = ["en", "fr", "es", "pt"];
function t(key, locale = "en") {
  const strings = locales[locale];
  return strings[key] ?? locales["en"][key] ?? key;
}
function resolveLocale(languageCodes) {
  for (const code of languageCodes) {
    const match = SUPPORTED_LOCALES.find((supported) => supported === code);
    if (match) return match;
  }
  return "en";
}

// packages/shared/src/brand.ts
var PRODUCT_NAME = "Murmur";
var SUPPORT_EMAIL = "support@itsmurmur.com";
var SUPPORT_MAILTO = SUPPORT_EMAIL ? `mailto:${SUPPORT_EMAIL}?subject=Murmur%20feedback` : null;
var SHORTCUT_INSTALL_URL = "";

// packages/shared/src/plus.ts
function isPlusFromProfile(profile, now = /* @__PURE__ */ new Date()) {
  if (profile?.plus_status === "active") return true;
  return isTrialActive(profile, now);
}
function isTrialActive(profile, now = /* @__PURE__ */ new Date()) {
  const ends = profile?.trial_ends_at ? Date.parse(profile.trial_ends_at) : NaN;
  return Number.isFinite(ends) && ends > now.getTime();
}
function trialDaysLeft(profile, now = /* @__PURE__ */ new Date()) {
  const ends = profile?.trial_ends_at ? Date.parse(profile.trial_ends_at) : NaN;
  if (!Number.isFinite(ends)) return 0;
  return Math.max(0, Math.ceil((ends - now.getTime()) / 864e5));
}
var FREE_ASK_QUESTIONS_PER_MONTH = 3;
var PLUS_PRODUCTS = {
  monthly: "murmur_plus_monthly",
  yearly: "murmur_plus_yearly"
};
var PLUS_ENTITLEMENT_ID = "plus";
var PLUS_OFFERING_ID = "default";
var PLUS_MANAGE_URL_APPLE = "https://apps.apple.com/account/subscriptions";
var LEGAL_URLS = {
  terms: "https://itsmurmur.com/terms",
  privacy: "https://itsmurmur.com/privacy"
};
function planFromProductId(productId) {
  if (!productId) return null;
  if (productId === PLUS_PRODUCTS.yearly || /year|annual/i.test(productId)) return "yearly";
  if (productId === PLUS_PRODUCTS.monthly || /month/i.test(productId)) return "monthly";
  return null;
}
function describePlus(profile) {
  if (!profile) return { kind: "free" };
  const plan = planFromProductId(profile.plus_product_id);
  if (profile.plus_status === "active") {
    const willRenew = profile.plus_will_renew !== false;
    const storeBacked = !!profile.plus_synced_at;
    if (profile.plus_period_type === "trial") {
      return {
        kind: "trial",
        plan,
        endsAt: profile.plus_expires_at ?? null,
        willRenew,
        storeBacked
      };
    }
    return { kind: "active", plan, endsAt: profile.plus_expires_at ?? null, willRenew, storeBacked };
  }
  if (isTrialActive(profile)) {
    return {
      kind: "trial",
      plan: null,
      endsAt: profile.trial_ends_at ?? null,
      willRenew: false,
      storeBacked: false
    };
  }
  if (profile.plus_status === "lapsed") {
    return { kind: "lapsed", plan, endedAt: profile.plus_expires_at ?? null };
  }
  return { kind: "free" };
}

// packages/shared/src/askStorage.ts
var ASK_RESUME_WINDOW_MS = 12 * 60 * 60 * 1e3;
function deriveTitle(question, max = 60) {
  const trimmed = question.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed.replace(/[.!?]+$/, "");
  return trimmed.slice(0, max - 1).replace(/\s+\S*$/, "").replace(/[.!?]+$/, "") + "\u2026";
}
function isReply(r) {
  return typeof r.text === "string" && Array.isArray(r.blocks);
}
function legacyResponseToReply(r) {
  const blocks = [];
  if (r.breakdown && r.breakdown.rows.length > 0) {
    blocks.push({ type: "rows", caption: r.breakdown.caption, rows: r.breakdown.rows });
  }
  if (r.chart) blocks.push({ type: "chart", chart: r.chart });
  const text = r.note?.text ? `${r.verdict.text} ${r.note.text}` : r.verdict.text;
  const actions = [];
  for (const a of r.actions ?? []) {
    if (a.intent === "show_transactions" || a.intent === "show_category") {
      actions.push({
        label: a.label,
        intent: "show_transactions",
        params: a.params?.category_name ? { category_name: a.params.category_name } : a.params?.merchant ? { merchant: a.params.merchant } : void 0
      });
    } else if (a.intent === "set_budget") {
      actions.push({ label: a.label, intent: "set_budget", params: a.params });
    }
  }
  return {
    text,
    sentiment: r.verdict.sentiment,
    blocks,
    actions,
    focus: null,
    out_of_scope: r.out_of_scope,
    transaction_count: r.attribution?.transaction_count ?? 0
  };
}
function replyFromStored(response) {
  if (!response || typeof response !== "object") return null;
  if (isReply(response)) return response;
  if (response.verdict) return legacyResponseToReply(response);
  return null;
}
async function loadMessages(supabase, conversationId) {
  const { data, error } = await supabase.from("ask_messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true });
  if (error) throw new Error(`[ask-storage] loadMessages failed: ${error.message}`);
  return data ?? [];
}
async function loadMostRecentConversation(supabase, userId) {
  const { data, error } = await supabase.from("ask_conversations").select("*").eq("user_id", userId).eq("is_deleted", false).order("last_message_at", { ascending: false }).limit(1);
  if (error) throw new Error(`[ask-storage] loadMostRecentConversation failed: ${error.message}`);
  if (!data || data.length === 0) return null;
  const conversation = data[0];
  return { conversation, messages: await loadMessages(supabase, conversation.id) };
}
async function resumeCandidate(supabase, userId, nowMs = Date.now()) {
  const recent = await loadMostRecentConversation(supabase, userId);
  if (!recent) return null;
  const last = Date.parse(recent.conversation.last_message_at);
  if (!Number.isFinite(last) || nowMs - last > ASK_RESUME_WINDOW_MS) return null;
  return recent;
}
async function loadConversation(supabase, conversationId) {
  const { data, error } = await supabase.from("ask_conversations").select("*").eq("id", conversationId).eq("is_deleted", false).maybeSingle();
  if (error) throw new Error(`[ask-storage] loadConversation failed: ${error.message}`);
  if (!data) return null;
  return { conversation: data, messages: await loadMessages(supabase, conversationId) };
}
async function listConversations(supabase, userId, limit = 30) {
  const { data, error } = await supabase.from("ask_conversations").select("*").eq("user_id", userId).eq("is_deleted", false).order("last_message_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`[ask-storage] listConversations failed: ${error.message}`);
  return data ?? [];
}
async function softDeleteConversation(supabase, conversationId) {
  const { error } = await supabase.from("ask_conversations").update({ is_deleted: true }).eq("id", conversationId);
  if (error) throw new Error(`[ask-storage] softDeleteConversation failed: ${error.message}`);
}
async function createConversation(supabase, userId, firstQuestion) {
  const title = deriveTitle(firstQuestion);
  const { data, error } = await supabase.from("ask_conversations").insert({ user_id: userId, title }).select("*").single();
  if (error || !data) {
    console.error("[ask-storage] createConversation failed:", error?.message);
    return null;
  }
  return data;
}
async function appendUserMessage(supabase, conversationId, userId, question) {
  const { data, error } = await supabase.from("ask_messages").insert({ conversation_id: conversationId, user_id: userId, role: "user", question }).select("*").single();
  if (error || !data) {
    console.error("[ask-storage] appendUserMessage failed:", error?.message);
    return null;
  }
  return data;
}
async function appendAssistantMessage(supabase, conversationId, userId, response) {
  const { data, error } = await supabase.from("ask_messages").insert({ conversation_id: conversationId, user_id: userId, role: "assistant", response }).select("*").single();
  if (error || !data) {
    console.error("[ask-storage] appendAssistantMessage failed:", error?.message);
    return null;
  }
  return data;
}

// packages/shared/src/domain/askInsights.ts
var MAX_INSIGHTS = 4;
var VALID_FREQ = /* @__PURE__ */ new Set(["daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"]);
function fmtMoney(v, currency, locale) {
  const whole = Math.abs(v - Math.round(v)) < 5e-3;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: whole ? 0 : 2
    }).format(v);
  } catch {
    return `${currency} ${v.toFixed(whole ? 0 : 2)}`;
  }
}
function fmtDate(instantIso, tz, locale) {
  try {
    return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: tz }).format(new Date(instantIso));
  } catch {
    return instantIso.slice(0, 10);
  }
}
function fill(template, params) {
  return template.replace(/\{(\w+)\}/g, (_, k) => k in params ? String(params[k]) : `{${k}}`);
}
function inSpan(iso, s) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && ms >= s.startMs && ms < s.endMs;
}
function amountOf(tx) {
  return typeof tx.amount_in_profile_currency === "number" && Number.isFinite(tx.amount_in_profile_currency) ? tx.amount_in_profile_currency : null;
}
function sumDebits(txns, span, category) {
  let total = 0;
  for (const tx of txns) {
    if (tx.direction !== "debit") continue;
    if (category !== void 0 && (tx.category_name ?? "") !== category) continue;
    if (!inSpan(tx.transacted_at, span)) continue;
    const a = amountOf(tx);
    if (a !== null) total += a;
  }
  return roundCents(total);
}
function sumCredits(txns, span) {
  let total = 0;
  for (const tx of txns) {
    if (tx.direction !== "credit" || !inSpan(tx.transacted_at, span)) continue;
    const a = amountOf(tx);
    if (a !== null) total += a;
  }
  return roundCents(total);
}
function debitsByCategory(txns, span) {
  const out = /* @__PURE__ */ new Map();
  for (const tx of txns) {
    if (tx.direction !== "debit" || !inSpan(tx.transacted_at, span)) continue;
    const a = amountOf(tx);
    if (a === null) continue;
    const key = tx.category_name ?? "";
    out.set(key, (out.get(key) ?? 0) + a);
  }
  return out;
}
function sameSpanMonthsAgo(y, m, d, k, tz) {
  const target = addMonthsClamped(y, m, 1, -k);
  const startIso = monthBounds(`${String(target.y).padStart(4, "0")}-${String(target.m).padStart(2, "0")}`, tz).start;
  const dim = new Date(Date.UTC(target.y, target.m, 0)).getUTCDate();
  const cut = addDays(target.y, target.m, Math.min(d, dim), 1);
  return {
    startMs: Date.parse(startIso),
    endMs: Date.parse(civilDateTimeToInstant(cut.y, cut.m, cut.d, 0, 0, 0, tz))
  };
}
function computeAskInsights(input) {
  const { transactions, currency, locale } = input;
  const tz = safeTz(input.time_zone);
  const now = localParts(input.now_utc, tz);
  const nowMs = Date.parse(input.now_utc);
  const money2 = (v) => fmtMoney(v, currency, locale);
  const T = (key, params = {}) => fill(t(key, locale), params);
  const monthKey2 = `${String(now.y).padStart(4, "0")}-${String(now.m).padStart(2, "0")}`;
  const monthB = monthBounds(monthKey2, tz);
  const monthSpan = { startMs: Date.parse(monthB.start), endMs: Date.parse(monthB.endExclusive) };
  const daysInMonth = new Date(Date.UTC(now.y, now.m, 0)).getUTCDate();
  const daysLeftInMonth = Math.max(1, daysInMonth - now.d + 1);
  const out = [];
  const usable = transactions.filter((tx) => amountOf(tx) !== null);
  if (usable.length < 3) {
    return [
      {
        id: "no_data",
        kind: "no_data",
        score: 100,
        tone: "neutral",
        title: T("ask.insight_nodata_title"),
        detail: T("ask.insight_nodata_detail"),
        question: T("ask.insight_nodata_question"),
        action: { label: T("ask.insight_nodata_action"), intent: "log_expense" }
      }
    ];
  }
  const spentMtd = sumDebits(usable, monthSpan);
  const creditsMtd = sumCredits(usable, monthSpan);
  const incomeBasis = creditsMtd > 0 ? { value: creditsMtd, from: "transactions" } : input.monthly_income && input.monthly_income > 0 ? { value: input.monthly_income, from: "profile" } : null;
  const debitRules = input.rules.filter(
    (r) => r.direction === "debit" && r.is_active !== false && VALID_FREQ.has(r.frequency)
  );
  const ruleAmount = (r) => typeof r.amount_in_profile_currency === "number" && Number.isFinite(r.amount_in_profile_currency) ? r.amount_in_profile_currency : r.amount;
  const recurrenceOf = (r) => r.starts_at ? {
    frequency: r.frequency,
    interval: r.interval ?? 1,
    starts_at: r.starts_at,
    ends_at: r.ends_at ?? null,
    anchor_day: r.anchor_day ?? null,
    anchor_weekday: r.anchor_weekday ?? null,
    anchor_time: r.anchor_time ?? null
  } : null;
  let stillDue = 0;
  for (const r of debitRules) {
    const rec = recurrenceOf(r);
    if (!rec) continue;
    try {
      const occ = occurrencesInWindow(rec, input.now_utc, monthB.endExclusive, tz, { limit: 40 });
      stillDue += occ.length * ruleAmount(r);
    } catch {
    }
  }
  stillDue = roundCents(stillDue);
  {
    let best = null;
    const horizonMs = nowMs + 7 * 864e5;
    for (const r of debitRules) {
      const rec = recurrenceOf(r);
      if (!rec) continue;
      try {
        const occ = firstOccurrenceOnOrAfter(rec, input.now_utc, tz);
        if (!occ) continue;
        const ms = Date.parse(occ.instant);
        if (ms > horizonMs) continue;
        if (!best || ms < Date.parse(best.instant) || ms === Date.parse(best.instant) && ruleAmount(r) > best.amount) {
          best = { name: r.name?.trim() || t("ask.insight_unnamed_rule", locale), amount: ruleAmount(r), instant: occ.instant };
        }
      } catch {
      }
    }
    if (best) {
      const left = incomeBasis ? roundCents(incomeBasis.value - spentMtd - stillDue) : null;
      out.push({
        id: `upcoming:${best.name}`,
        kind: "upcoming_bill",
        score: 90,
        tone: left !== null && left < 0 ? "alert" : "watch",
        title: T("ask.insight_upcoming_title", { name: best.name, amount: money2(best.amount), date: fmtDate(best.instant, tz, locale) }),
        detail: left !== null ? T("ask.insight_upcoming_detail_income", { due: money2(stillDue), left: money2(left) }) : T("ask.insight_upcoming_detail_noincome", { due: money2(stillDue) }),
        question: T("ask.insight_upcoming_question"),
        action: { label: T("ask.insight_upcoming_action"), intent: "open_recurring", params: { name: best.name } }
      });
    }
  }
  const usualDaily = (() => {
    let total = 0;
    let days = 0;
    for (let k = 1; k <= 3; k++) {
      const target = addMonthsClamped(now.y, now.m, 1, -k);
      const key = `${String(target.y).padStart(4, "0")}-${String(target.m).padStart(2, "0")}`;
      const b = monthBounds(key, tz);
      const span = { startMs: Date.parse(b.start), endMs: Date.parse(b.endExclusive) };
      const spent = sumDebits(usable, span);
      if (spent <= 0) continue;
      total += spent;
      days += new Date(Date.UTC(target.y, target.m, 0)).getUTCDate();
    }
    return days > 0 ? total / days : null;
  })();
  if (input.budget) {
    const b = input.budget;
    const days = Math.max(1, b.days_left);
    if (b.remaining < 0) {
      out.push({
        id: "budget",
        kind: "budget_pace",
        score: 95,
        tone: "alert",
        title: T("ask.insight_budget_over_title", { over: money2(Math.abs(b.remaining)) }),
        detail: T("ask.insight_budget_over_detail", { days, period: t(`ask.period_${b.period}`, locale) }),
        question: T("ask.insight_budget_question"),
        action: { label: T("ask.insight_budget_action"), intent: "set_budget" }
      });
    } else {
      const pace = b.remaining / days;
      const tight = usualDaily !== null && pace < usualDaily * 0.8;
      out.push({
        id: "budget",
        kind: "budget_pace",
        score: tight ? 70 : 58,
        tone: tight ? "watch" : "good",
        title: T(tight ? "ask.insight_budget_tight_title" : "ask.insight_budget_ok_title", { left: money2(b.remaining), days }),
        detail: usualDaily !== null ? T(tight ? "ask.insight_budget_tight_detail" : "ask.insight_budget_ok_detail", { pace: money2(roundCents(pace)), usual: money2(roundCents(usualDaily)) }) : T("ask.insight_budget_pace_only", { pace: money2(roundCents(pace)) }),
        question: T("ask.insight_budget_question"),
        action: { label: T("ask.insight_budget_action"), intent: "set_budget" }
      });
    }
  }
  const mtdByCat = debitsByCategory(usable, monthSpan);
  const priorSpans = [1, 2, 3].map((k) => sameSpanMonthsAgo(now.y, now.m, now.d, k, tz));
  const priorByCat = priorSpans.map((s) => debitsByCategory(usable, s));
  let surge = null;
  for (const [cat, amount] of mtdByCat) {
    if (!cat || amount < 25) continue;
    const priors = priorByCat.map((m) => m.get(cat) ?? 0).filter((v) => v > 0);
    if (priors.length < 2) continue;
    const avg = priors.reduce((a, b) => a + b, 0) / priors.length;
    if (avg <= 0) continue;
    const pct = (amount - avg) / avg;
    if (pct < 0.4) continue;
    if (!surge || pct > surge.pct) surge = { category: cat, amount, pct };
  }
  if (surge) {
    const pctRounded = Math.round(surge.pct * 100);
    out.push({
      id: `surge:${surge.category}`,
      kind: "category_surge",
      score: 80 + Math.min(20, pctRounded / 5),
      tone: "alert",
      title: T("ask.insight_surge_title", { category: surge.category, amount: money2(surge.amount) }),
      detail: T("ask.insight_surge_detail", { pct: pctRounded }),
      question: T("ask.insight_surge_question", { category: surge.category }),
      action: {
        label: T("ask.insight_surge_action"),
        intent: "show_transactions",
        params: { category_name: surge.category, month: monthKey2 }
      }
    });
  }
  {
    const normalized = debitRules.map((r) => ({
      name: r.name?.trim() || t("ask.insight_unnamed_rule", locale),
      monthly: monthlyEquivalent({ frequency: r.frequency, interval: r.interval ?? 1, amount: ruleAmount(r) })
    })).sort((a, b) => b.monthly - a.monthly);
    const total = roundCents(normalized.reduce((a, r) => a + r.monthly, 0));
    if (normalized.length >= 2 || total >= 50) {
      const [a, b] = normalized;
      const title = normalized.length === 1 ? T("ask.insight_subs_title_one", { a: a.name, total: money2(total) }) : normalized.length === 2 ? T("ask.insight_subs_title_two", { a: a.name, b: b.name, total: money2(total) }) : T("ask.insight_subs_title_many", { a: a.name, b: b.name, n: normalized.length - 2, total: money2(total) });
      out.push({
        id: "subs",
        kind: "subscriptions",
        score: 55,
        tone: "neutral",
        title,
        detail: T("ask.insight_subs_detail"),
        question: T("ask.insight_subs_question"),
        action: { label: T("ask.insight_upcoming_action"), intent: "open_recurring" }
      });
    }
  }
  {
    const lastByCat = priorByCat[0];
    let best = null;
    const cats = /* @__PURE__ */ new Set([...mtdByCat.keys(), ...lastByCat.keys()]);
    for (const cat of cats) {
      if (!cat || surge && cat === surge.category) continue;
      const delta = roundCents((mtdByCat.get(cat) ?? 0) - (lastByCat.get(cat) ?? 0));
      if (Math.abs(delta) < 30) continue;
      if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { category: cat, delta };
    }
    if (best) {
      out.push({
        id: `delta:${best.category}`,
        kind: "month_delta",
        score: 50,
        tone: best.delta > 0 ? "watch" : "good",
        title: T("ask.insight_delta_title", { category: best.category }),
        detail: T(best.delta > 0 ? "ask.insight_delta_detail_up" : "ask.insight_delta_detail_down", { delta: money2(Math.abs(best.delta)) }),
        question: T("ask.insight_delta_question", { category: best.category }),
        action: {
          label: T("ask.insight_surge_action"),
          intent: "show_transactions",
          params: { category_name: best.category, month: monthKey2 }
        }
      });
    }
  }
  if (incomeBasis) {
    const over = roundCents(spentMtd - incomeBasis.value);
    if (over > 0) {
      out.push({
        id: "netflow",
        kind: "net_flow",
        score: 75,
        tone: "alert",
        title: T("ask.insight_netflow_over_title", { over: money2(over) }),
        detail: T("ask.insight_netflow_over_detail", { spent: money2(spentMtd), income: money2(incomeBasis.value) }),
        question: T("ask.insight_netflow_question"),
        action: null
      });
    } else if (spentMtd > 0) {
      out.push({
        id: "netflow",
        kind: "net_flow",
        score: 45,
        tone: "neutral",
        title: T("ask.insight_netflow_title", { spent: money2(spentMtd), income: money2(incomeBasis.value) }),
        detail: T("ask.insight_netflow_detail", { left: money2(roundCents(incomeBasis.value - spentMtd)), days: daysLeftInMonth }),
        question: T("ask.insight_netflow_question"),
        action: null
      });
    }
  }
  {
    const weekSpan = { startMs: nowMs - 7 * 864e5, endMs: nowMs + 1 };
    const ninety = { startMs: nowMs - 90 * 864e5, endMs: nowMs + 1 };
    const debits90 = usable.filter((tx) => tx.direction === "debit" && inSpan(tx.transacted_at, ninety)).map((tx) => amountOf(tx)).sort((a, b) => a - b);
    if (debits90.length >= 8) {
      const median2 = debits90[Math.floor(debits90.length / 2)];
      let best = null;
      for (const tx of usable) {
        if (tx.direction !== "debit" || tx.is_recurring || !inSpan(tx.transacted_at, weekSpan)) continue;
        const a = amountOf(tx);
        if (a < 100 || a < 3 * median2) continue;
        if (!best || a > amountOf(best)) best = tx;
      }
      if (best && median2 > 0) {
        const a = amountOf(best);
        const merchant = best.merchant?.trim() || best.category_name || t("ask.insight_unnamed_rule", locale);
        out.push({
          id: `large:${best.transacted_at}`,
          kind: "large_transaction",
          score: 60,
          tone: "watch",
          title: T("ask.insight_large_title", { merchant, amount: money2(a), date: fmtDate(best.transacted_at, tz, locale) }),
          detail: T("ask.insight_large_detail", { times: Math.round(a / median2) }),
          question: T("ask.insight_large_question", { merchant }),
          action: { label: T("ask.insight_large_action"), intent: "show_transactions", params: { query: merchant } }
        });
      }
    }
  }
  const seen = /* @__PURE__ */ new Set();
  return out.sort((a, b) => b.score - a.score).filter((i) => seen.has(i.kind) ? false : (seen.add(i.kind), true)).slice(0, MAX_INSIGHTS);
}
function askIntentChips(locale) {
  return [
    { id: "budget", label: t("ask.intent_budget", locale), question: t("ask.intent_budget_q", locale) },
    { id: "subs", label: t("ask.intent_subs", locale), question: t("ask.intent_subs_q", locale) },
    { id: "where", label: t("ask.intent_where", locale), question: t("ask.intent_where_q", locale) },
    { id: "plan", label: t("ask.intent_plan", locale), question: t("ask.intent_plan_q", locale) }
  ];
}
function askActionLabel(action, locale) {
  if (action.label?.trim()) return action.label;
  switch (action.intent) {
    case "show_transactions":
      return t("ask.action_show_transactions", locale);
    case "set_budget":
      return t("ask.action_set_budget", locale);
    case "open_recurring":
      return t("ask.action_open_recurring", locale);
    case "log_expense":
      return t("ask.action_log_expense", locale);
    case "create_rule":
      return t("ask.action_create_rule", locale);
  }
}
function safeTz(tz) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

// packages/shared/src/domain/notifications.ts
var PRIORITY = {
  billing_issue: 100,
  trial_ending: 95,
  plus_lapsed: 90,
  bill_tomorrow: 85,
  budget_over: 80,
  bill_missing: 75,
  budget_80: 70,
  budget_category_over: 65,
  bill_week_heavy: 55,
  month_closed: 50,
  category_surge: 45,
  weekly_recap: 40,
  winback_14: 30,
  winback_30: 28,
  winback_60: 26
};
var DAY_MS2 = 864e5;
function money(v, currency, locale) {
  const whole = Math.abs(v - Math.round(v)) < 5e-3;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: whole ? 0 : 2
    }).format(v);
  } catch {
    return `${currency} ${v.toFixed(whole ? 0 : 2)}`;
  }
}
function fill2(template, params) {
  return template.replace(/\{(\w+)\}/g, (_, k) => k in params ? String(params[k]) : `{${k}}`);
}
function amountOf2(tx) {
  return typeof tx.amount_in_profile_currency === "number" && Number.isFinite(tx.amount_in_profile_currency) ? tx.amount_in_profile_currency : null;
}
function daysBetween2(aMs, bMs) {
  return Math.floor((bMs - aMs) / DAY_MS2);
}
function planNotifications(input) {
  const { nowUtc, timeZone: tz, locale, currency, plus } = input;
  const nowMs = Date.parse(nowUtc);
  if (!Number.isFinite(nowMs)) return [];
  const T = (key, params = {}) => fill2(t(key, locale), params);
  const m = (v) => money(v, currency, locale);
  const out = [];
  if (plus.plus_billing_issue_at) {
    const graceMs = plus.plus_grace_until ? Date.parse(plus.plus_grace_until) : NaN;
    const stillInGrace = Number.isFinite(graceMs) && graceMs > nowMs;
    out.push({
      family: "money",
      kind: "billing_issue",
      dedupeKey: `billing_issue:${plus.plus_billing_issue_at}`,
      priority: PRIORITY.billing_issue,
      title: T("notif.billing_issue_title"),
      body: stillInGrace ? T("notif.billing_issue_body_grace", { days: Math.max(1, daysBetween2(nowMs, graceMs)) }) : T("notif.billing_issue_body"),
      data: { screen: "paywall", reason: "billing_issue" },
      urgency: "time-sensitive",
      transactional: true
    });
  }
  if (plus.plus_status === "active" && plus.plus_period_type === "trial" && plus.plus_expires_at) {
    const endMs = Date.parse(plus.plus_expires_at);
    const daysLeft = daysBetween2(nowMs, endMs);
    if (Number.isFinite(endMs) && endMs > nowMs && daysLeft <= 2) {
      const willRenew = plus.plus_will_renew !== false;
      out.push({
        family: "money",
        kind: "trial_ending",
        dedupeKey: `trial_ending:${plus.plus_expires_at}`,
        priority: PRIORITY.trial_ending,
        title: willRenew ? T("notif.trial_ending_title") : T("notif.trial_ending_off_title"),
        body: willRenew ? T("notif.trial_ending_body", { days: Math.max(1, daysLeft + 1) }) : T("notif.trial_ending_off_body"),
        data: { screen: "paywall", reason: "trial_ending" },
        urgency: "active",
        transactional: true
      });
    }
  }
  if (plus.plus_status === "lapsed" && plus.plus_expires_at && !plus.plus_billing_issue_at) {
    const endedMs = Date.parse(plus.plus_expires_at);
    if (Number.isFinite(endedMs) && nowMs - endedMs < 3 * DAY_MS2 && endedMs <= nowMs) {
      out.push({
        family: "money",
        kind: "plus_lapsed",
        dedupeKey: `plus_lapsed:${plus.plus_expires_at}`,
        priority: PRIORITY.plus_lapsed,
        title: T("notif.plus_lapsed_title"),
        body: T("notif.plus_lapsed_body"),
        data: { screen: "paywall", reason: "lapsed" },
        urgency: "passive",
        transactional: true
      });
    }
  }
  const debitRules = input.rules.filter(
    (r) => r.direction === "debit" && r.is_active !== false && r.starts_at
  );
  const ruleAmount = (r) => typeof r.amount_in_profile_currency === "number" && Number.isFinite(r.amount_in_profile_currency) ? r.amount_in_profile_currency : r.amount;
  const recurrenceOf = (r) => r.starts_at ? {
    frequency: r.frequency,
    interval: r.interval ?? 1,
    starts_at: r.starts_at,
    ends_at: r.ends_at ?? null,
    anchor_day: r.anchor_day ?? null,
    anchor_weekday: r.anchor_weekday ?? null,
    anchor_time: r.anchor_time ?? null
  } : null;
  const upcoming = [];
  for (const r of debitRules) {
    const rec = recurrenceOf(r);
    if (!rec) continue;
    try {
      const occ = occurrencesInWindow(rec, nowUtc, new Date(nowMs + 7 * DAY_MS2).toISOString(), tz, { limit: 20 });
      for (const o of occ) {
        upcoming.push({
          name: r.name?.trim() || t("ask.insight_unnamed_rule", locale),
          amount: ruleAmount(r),
          instant: o.instant,
          ruleId: String(r.id ?? r.name ?? "rule"),
          occurrenceDate: o.occurrenceDate
        });
      }
    } catch {
    }
  }
  upcoming.sort((a, b) => Date.parse(a.instant) - Date.parse(b.instant));
  let stillDue = 0;
  const monthEnd = (() => {
    const p = localParts(nowUtc, tz);
    const dim = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate();
    return Date.parse(nowUtc) + Math.max(0, dim - p.d + 1) * DAY_MS2;
  })();
  for (const r of debitRules) {
    const rec = recurrenceOf(r);
    if (!rec) continue;
    try {
      const occ = occurrencesInWindow(rec, nowUtc, new Date(monthEnd).toISOString(), tz, { limit: 40 });
      stillDue += occ.length * ruleAmount(r);
    } catch {
    }
  }
  stillDue = roundCents(stillDue);
  const monthKey2 = localDay(nowUtc, tz).slice(0, 7);
  const spentThisMonth = input.transactions.reduce((sum, tx) => {
    if (tx.direction !== "debit") return sum;
    if (localDay(tx.transacted_at, tz).slice(0, 7) !== monthKey2) return sum;
    return sum + (amountOf2(tx) ?? 0);
  }, 0);
  const incomeThisMonth = input.transactions.reduce((sum, tx) => {
    if (tx.direction !== "credit") return sum;
    if (localDay(tx.transacted_at, tz).slice(0, 7) !== monthKey2) return sum;
    return sum + (amountOf2(tx) ?? 0);
  }, 0);
  const incomeBasis = incomeThisMonth > 0 ? incomeThisMonth : input.monthlyIncome && input.monthlyIncome > 0 ? input.monthlyIncome : null;
  const leftAfterBills = incomeBasis !== null ? roundCents(incomeBasis - spentThisMonth - stillDue) : null;
  const tomorrow = upcoming.find((u) => {
    const inMs = Date.parse(u.instant) - nowMs;
    return inMs > 0 && inMs <= 36 * 3600 * 1e3;
  });
  if (tomorrow) {
    out.push({
      family: "bill",
      kind: "bill_tomorrow",
      dedupeKey: `bill_tomorrow:${tomorrow.ruleId}:${tomorrow.occurrenceDate}`,
      priority: PRIORITY.bill_tomorrow,
      title: T("notif.bill_tomorrow_title", { name: tomorrow.name, amount: m(tomorrow.amount) }),
      body: leftAfterBills !== null ? T("notif.bill_tomorrow_body_left", { left: m(leftAfterBills) }) : T("notif.bill_tomorrow_body", { due: m(stillDue) }),
      data: { screen: "recurring", rule: tomorrow.ruleId },
      // Money leaving an account within a day is the definition of the
      // level: still actionable, and useless if it arrives late.
      urgency: "time-sensitive"
    });
  } else if (upcoming.length >= 3) {
    const total = roundCents(upcoming.reduce((s, u) => s + u.amount, 0));
    out.push({
      family: "bill",
      kind: "bill_week_heavy",
      dedupeKey: `bill_week_heavy:${localDay(nowUtc, tz)}`,
      priority: PRIORITY.bill_week_heavy,
      title: T("notif.bill_week_title", { count: upcoming.length, amount: m(total) }),
      body: T("notif.bill_week_body", { name: upcoming[0].name, amount: m(upcoming[0].amount) }),
      data: { screen: "recurring" },
      urgency: "passive"
    });
  }
  for (const r of debitRules) {
    const rec = recurrenceOf(r);
    if (!rec) continue;
    let occ;
    try {
      occ = occurrencesInWindow(rec, new Date(nowMs - 9 * DAY_MS2).toISOString(), new Date(nowMs - 2 * DAY_MS2).toISOString(), tz, { limit: 5 });
    } catch {
      continue;
    }
    if (!occ.length) continue;
    const last = occ[occ.length - 1];
    const amount = ruleAmount(r);
    const matched = input.transactions.some((tx) => {
      if (tx.direction !== "debit") return false;
      const txMs = Date.parse(tx.transacted_at);
      if (!Number.isFinite(txMs)) return false;
      if (Math.abs(txMs - Date.parse(last.instant)) > 3 * DAY_MS2) return false;
      const a = amountOf2(tx);
      return a !== null && Math.abs(a - amount) <= Math.max(1, amount * 0.1);
    });
    if (matched) continue;
    out.push({
      family: "bill",
      kind: "bill_missing",
      dedupeKey: `bill_missing:${String(r.id ?? r.name)}:${last.occurrenceDate}`,
      priority: PRIORITY.bill_missing,
      title: T("notif.bill_missing_title", { name: r.name?.trim() || t("ask.insight_unnamed_rule", locale) }),
      body: T("notif.bill_missing_body", { amount: m(amount) }),
      data: { screen: "recurring", rule: String(r.id ?? "") },
      urgency: "active"
    });
    break;
  }
  const budgetRules = input.rules.filter(
    (r) => Boolean(r.id && r.starts_at && typeof r.amount === "number")
  );
  const budgetTxns = input.transactions;
  for (const b of input.budgets) {
    let status;
    try {
      status = budgetStatus(b, budgetTxns, budgetRules, tz, nowUtc);
    } catch {
      continue;
    }
    const windowKey = String(status.window.start ?? "").slice(0, 10);
    const daysLeft = Math.max(0, Math.ceil((Date.parse(String(status.window.endExclusive)) - nowMs) / DAY_MS2));
    const isCategory = b.category_id != null;
    if (status.pct >= 1) {
      out.push({
        family: "budget",
        kind: isCategory ? "budget_category_over" : "budget_over",
        dedupeKey: `${isCategory ? "budget_category_over" : "budget_over"}:${b.id}:${windowKey}`,
        priority: isCategory ? PRIORITY.budget_category_over : PRIORITY.budget_over,
        title: isCategory ? T("notif.budget_category_over_title", { category: b.category_name ?? "", over: m(Math.abs(status.remaining)) }) : T("notif.budget_over_title", { over: m(Math.abs(status.remaining)) }),
        body: T("notif.budget_over_body", { days: daysLeft }),
        data: { screen: "budgets", budget: b.id },
        urgency: "active"
      });
    } else if (status.pct >= 0.8 && daysLeft >= 2 && !isCategory) {
      const perDay = roundCents(status.remaining / Math.max(1, daysLeft));
      out.push({
        family: "budget",
        kind: "budget_80",
        dedupeKey: `budget_80:${b.id}:${windowKey}`,
        priority: PRIORITY.budget_80,
        title: T("notif.budget_80_title", { pct: Math.round(status.pct * 100), days: daysLeft }),
        body: T("notif.budget_80_body", { perDay: m(perDay), left: m(status.remaining) }),
        data: { screen: "budgets", budget: b.id },
        urgency: "active"
      });
    }
  }
  const local = localParts(nowUtc, tz);
  const isSunday = local.weekdayIndex === 6;
  let insights = [];
  try {
    insights = computeAskInsights({
      transactions: input.transactions,
      rules: input.rules,
      budget: input.budgets.find((b) => b.category_id == null) ?? null,
      monthly_income: input.monthlyIncome,
      now_utc: nowUtc,
      time_zone: tz,
      currency,
      locale
    });
  } catch {
    insights = [];
  }
  const surge = insights.find((i) => i.kind === "category_surge");
  if (surge) {
    out.push({
      family: "insight",
      kind: "category_surge",
      dedupeKey: `category_surge:${surge.id}:${monthKey2}`,
      priority: PRIORITY.category_surge,
      title: surge.title,
      body: surge.detail,
      data: { screen: "ask", insight: surge.id },
      urgency: "passive"
    });
  }
  if (local.d === 1) {
    const delta = insights.find((i) => i.kind === "month_delta");
    if (delta) {
      out.push({
        family: "insight",
        kind: "month_closed",
        dedupeKey: `month_closed:${monthKey2}`,
        priority: PRIORITY.month_closed,
        title: delta.title,
        body: delta.detail,
        data: { screen: "insights" },
        urgency: "passive"
      });
    }
  }
  if (isSunday) {
    const weekStart2 = nowMs - 7 * DAY_MS2;
    const weekTxns = input.transactions.filter(
      (tx) => tx.direction === "debit" && Date.parse(tx.transacted_at) >= weekStart2 && amountOf2(tx) !== null
    );
    if (weekTxns.length >= 5) {
      const total = roundCents(weekTxns.reduce((s, tx) => s + (amountOf2(tx) ?? 0), 0));
      const byCategory = /* @__PURE__ */ new Map();
      for (const tx of weekTxns) {
        const k = tx.category_name ?? "";
        byCategory.set(k, (byCategory.get(k) ?? 0) + (amountOf2(tx) ?? 0));
      }
      let top = null;
      for (const entry of byCategory) if (!top || entry[1] > top[1]) top = entry;
      out.push({
        family: "insight",
        kind: "weekly_recap",
        dedupeKey: `weekly_recap:${localDay(nowUtc, tz)}`,
        priority: PRIORITY.weekly_recap,
        title: T("notif.weekly_recap_title", { amount: m(total) }),
        body: top && top[0] ? T("notif.weekly_recap_body_top", { count: weekTxns.length, category: top[0], amount: m(roundCents(top[1])) }) : T("notif.weekly_recap_body", { count: weekTxns.length }),
        data: { screen: "insights" },
        urgency: "passive"
      });
    }
  }
  if (input.lastLoggedAt) {
    const idleDays = daysBetween2(Date.parse(input.lastLoggedAt), nowMs);
    const step = idleDays >= 60 ? 60 : idleDays >= 30 ? 30 : idleDays >= 14 ? 14 : null;
    if (step) {
      const kind = `winback_${step}`;
      const hasBills = upcoming.length > 0;
      out.push({
        family: "habit",
        kind,
        dedupeKey: `${kind}:${localDay(input.lastLoggedAt, tz)}`,
        priority: PRIORITY[kind],
        title: hasBills ? T("notif.winback_bills_title", { count: upcoming.length }) : T(`notif.${kind}_title`),
        body: hasBills ? T("notif.winback_bills_body", { name: upcoming[0].name, amount: m(upcoming[0].amount) }) : T(`notif.${kind}_body`),
        data: { screen: hasBills ? "recurring" : "record" },
        urgency: "passive"
      });
    }
  }
  return out;
}
var DEFAULT_NOTIFICATION_PREFS = {
  receipts: true,
  bills: true,
  budget: true,
  insights: true,
  habit: true,
  quiet_start: 22,
  quiet_end: 8,
  max_per_week: 3
};
var FAMILY_SWITCH = {
  receipt: "receipts",
  bill: "bills",
  budget: "budget",
  insight: "insights",
  habit: "habit",
  money: null
  // transactional, no switch
};
function inQuietHours(hour, start, end) {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}
function govern(candidates, state) {
  const { prefs } = state;
  const eligible = candidates.filter((c) => {
    if (state.alreadySent.has(c.dedupeKey)) return false;
    if (inQuietHours(state.localHour, prefs.quiet_start, prefs.quiet_end)) return false;
    if (c.transactional) return true;
    const key = FAMILY_SWITCH[c.family];
    if (key && prefs[key] === false) return false;
    if (state.sentToday >= 1) return false;
    if (state.sentLast7Days >= prefs.max_per_week) return false;
    return true;
  });
  if (!eligible.length) return null;
  return eligible.reduce((best, c) => c.priority > best.priority ? c : best);
}
export {
  ASK_RESUME_WINDOW_MS,
  Constants,
  DEFAULT_NOTIFICATION_PREFS,
  DEFAULT_TRANSFER_CATEGORY_NAMES,
  FREE_ASK_QUESTIONS_PER_MONTH,
  KNOWN_DOMAINS,
  LEGAL_URLS,
  LOCALE_LABELS,
  MAX_AMOUNT,
  PLUS_ENTITLEMENT_ID,
  PLUS_MANAGE_URL_APPLE,
  PLUS_OFFERING_ID,
  PLUS_PRODUCTS,
  PRODUCT_NAME,
  SHORTCUT_INSTALL_URL,
  SUPPORTED_CURRENCIES,
  SUPPORTED_LOCALES,
  SUPPORT_EMAIL,
  SUPPORT_MAILTO,
  UNCATEGORIZED_CATEGORY_KEY,
  WEEK_START,
  addDays,
  addMonthsClamped,
  aggAmount,
  amountAdjustDeltasFor,
  annualEquivalent,
  appendAssistantMessage,
  appendUserMessage,
  askActionLabel,
  askIntentChips,
  brandDomainForMerchant,
  budgetStatus,
  buildExport,
  buildRuleAnchor,
  categoryPalette,
  categoryShare,
  chargesInWindow,
  civilDateTimeToInstant,
  classifyFlow,
  classifySourceKind,
  cleanMerchantDescriptor,
  computeAskInsights,
  contrastRatio,
  createConversation,
  currencySymbolFor,
  currentMonthIso,
  daysBetween,
  deriveTitle,
  describePlus,
  detectRecurringPatterns,
  effectiveVoiceLanguage,
  en_default as en,
  es_default as es,
  exportSummaryJSON,
  fetchFxRate,
  findRuleForTransaction,
  firstOccurrenceOnOrAfter,
  forecastMonthly,
  formatCurrency,
  formatMoney,
  formatMoneyParts,
  fr_default as fr,
  govern,
  guessCategoryFromMerchant,
  guessDomain,
  heatmap,
  heaviestWeekday,
  inQuietHours,
  isFxPending,
  isPlusFromProfile,
  isSpend,
  isTrialActive,
  legacyResponseToReply,
  listConversations,
  loadConversation,
  loadMostRecentConversation,
  localDay,
  localParts,
  merchantColor,
  monthBounds,
  monthIso,
  monthlyAverage,
  monthlyEquivalent,
  nextOccurrence,
  normalizeParsedTransactedAt,
  occurrencesDue,
  occurrencesInWindow,
  patterns,
  periodBounds,
  planFromProductId,
  planNotifications,
  pt_default as pt,
  recurringInflowInWindow,
  recurringOutflowInWindow,
  replyFromStored,
  resolveBudgetAnchor,
  resolveCategoryKind,
  resolveCategorySuggestion,
  resolveCurrency,
  resolveLocale,
  resumeCandidate,
  roundCents,
  snapshotFx,
  softDeleteConversation,
  sourceLabel,
  sumInProfileCurrency,
  summarize,
  t,
  topMerchants,
  trialDaysLeft,
  validateAmount,
  voiceLanguageFor,
  weekBounds,
  weekStart,
  weekdayLabels
};
