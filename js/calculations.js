/* Project Change & Scope Calculator — CalcMall tool #01 — calculations.js
 * Pure calculation & formatting helpers. No DOM access.
 * Exposed as window.Calc in the browser; also attachable as a module.
 *
 * A "committed" request is one with status 'pending' or 'approved'
 * (work you expect to do). Declined requests are excluded everywhere.
 */

(function (root) {
  'use strict';

  const EPS = Number.EPSILON;

  // Time units: users may enter estimates in days. Everything canonical in
  // this app is HOURS; a day is a standard 8-hour working day.
  const HOURS_PER_DAY = 8;

  // Convert an entered value in the given unit ('hours' | 'days') to hours.
  function toHours(value, unit) {
    const v = Number(value) || 0;
    return unit === 'days' ? v * HOURS_PER_DAY : v;
  }

  // Inverse of toHours — canonical hours back to the entered unit.
  function fromHours(hours, unit) {
    const h = Number(hours) || 0;
    return unit === 'days' ? h / HOURS_PER_DAY : h;
  }

  function round2(v) {
    return Math.round((Number(v) + EPS) * 100) / 100;
  }

  /* ── Numeric text handling (all money/quantity inputs) ───────────
     The single rule for "what characters can a number be made of?".
     Digits, at most one decimal point, optionally a leading minus. Spaces,
     letters, currency symbols, a second dot, 'e' notation and thousands
     separators are all stripped BEFORE the value is parsed, so a typo like
     "100 00" becomes 10000 instead of NaN leaking into an Amount cell. */
  function sanitizeNumericText(raw, allowNegative) {
    let s = String(raw === null || raw === undefined ? '' : raw).replace(/,/g, '');
    if (allowNegative) {
      const neg = s.trim().charAt(0) === '-';
      s = s.replace(/-/g, '');
      s = s.replace(/[^0-9.]/g, '');
      return (neg ? '-' : '') + s;
    }
    s = s.replace(/[^0-9.]/g, '');
    const firstDot = s.indexOf('.');
    if (firstDot !== -1) s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
    return s;
  }

  /* Anything -> a FINITE number, falling back to `fallback` (0 by default).
     This is what every calculation and every export reads through, so an
     empty or malformed field contributes 0 and never NaN. */
  function toNum(v, fallback) {
    const fb = fallback === undefined ? 0 : fallback;
    if (v === null || v === undefined || v === '') return fb;
    const cleaned = sanitizeNumericText(v, true);
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return fb;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : fb;
  }

  /* Can this text be used as a number as-is? Used to decide whether a field
     is genuinely empty (→ blank input) rather than silently zero. */
  function isNumericText(v) {
    if (v === null || v === undefined || String(v).trim() === '') return false;
    const cleaned = sanitizeNumericText(v, true);
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return false;
    return Number.isFinite(Number(cleaned));
  }

  // Guarded division — never throws on zero/NaN.
  function originalEffectiveRate(price, hours) {
    const p = Number(price) || 0;
    const h = Number(hours) || 0;
    return h > 0 ? p / h : 0;
  }

  function requestValue(hours, rate, expenses) {
    const h = Number(hours) || 0;
    const r = Number(rate) || 0;
    const e = Number(expenses) || 0;
    return h * r + e;
  }

  function requestValueForRequest(req) {
    return requestValue(req.hours, req.rate, req.expenses);
  }

  function isCommitted(status) {
    return status === 'approved' || status === 'pending';
  }

  function committedHours(requests) {
    return (requests || []).reduce(function (sum, r) {
      return sum + (isCommitted(r.status) ? (Number(r.hours) || 0) : 0);
    }, 0);
  }

  // Chargeable value locked into the project (approved + pending requests).
  function committedValue(requests) {
    return (requests || []).reduce(function (sum, r) {
      return sum + (isCommitted(r.status) ? requestValueForRequest(r) : 0);
    }, 0);
  }

  function unbilledValue(requests) {
    return (requests || []).reduce(function (sum, r) {
      return sum + (isCommitted(r.status) ? requestValueForRequest(r) : 0);
    }, 0);
  }

  // Total hours = original estimate + committed extra hours.
  function projectedEffectiveRate(price, estHours, committedExtraHours, committedExtraValue) {
    // Numerator: fixed price PLUS the chargeable value of committed extra
    // work — fairly-charged additions hold or raise the effective rate,
    // undercharged/free additions lower it. Omit the 4th arg (or pass 0)
    // for the classic "free extra hours" scenario.
    const p = (Number(price) || 0) + (Number(committedExtraValue) || 0);
    const base = Number(estHours) || 0;
    const extra = Number(committedExtraHours) || 0;
    const total = base + extra;
    return total > 0 ? p / total : 0;
  }

  // Percentage drop (0–100). Returns 0 when the rate has not fallen.
  function rateDropPct(originalRate, projectedRate) {
    const o = Number(originalRate) || 0;
    const pr = Number(projectedRate) || 0;
    if (o <= 0) return 0;
    const drop = ((o - pr) / o) * 100;
    return drop > 0 ? drop : 0;
  }

  // The charge that keeps the blended effective rate unchanged.
  function breakEvenCharge(extraHours, originalRate, expenses) {
    const h = Number(extraHours) || 0;
    const o = Number(originalRate) || 0;
    const e = Number(expenses) || 0;
    return h * o + e;
  }

  // ISO 4217 code → common symbol. Currencies without an entry here render
  // with their ISO code as the prefix (e.g. "KES 1,000.00"-style, no space
  // in this MVP: "KES1000.00"). Values that are already symbols (legacy
  // saved data like "$" or "Rs") pass through unchanged.
  const CURRENCY_SYMBOLS = {
    USD: '$', AUD: '$', CAD: '$', NZD: '$', SGD: '$', HKD: '$', MXN: '$',
    ARS: '$', CLP: '$', COP: '$', UYU: '$',
    EUR: '€', GBP: '£', EGP: '£', JPY: '¥', CNY: '¥', INR: '₹', KRW: '₩',
    RUB: '₽', BRL: 'R$', ZAR: 'R', TRY: '₺', PHP: '₱', THB: '฿', VND: '₫',
    IDR: 'Rp', MYR: 'RM', PLN: 'zł', CZK: 'Kč', HUF: 'Ft', UAH: '₴',
    SEK: 'kr', NOK: 'kr', DKK: 'kr', ISK: 'kr', BGN: 'лв', RON: 'lei',
    ILS: '₪', AED: 'د.إ', SAR: '﷼', QAR: '﷼', KWD: 'د.ك', BHD: 'د.ب',
    OMR: 'ر.ع.', JOD: 'د.ا', IRR: '﷼', IQD: 'د.ع', LKR: 'Rs', NPR: 'Rs',
    MUR: 'Rs', BDT: '৳', NGN: '₦', GEL: 'ლ', AMD: '֏', AZN: '₼', KZT: '₸'
  };

  function fmtMoney(value, currency) {
    const hasSymbol = CURRENCY_SYMBOLS[currency] !== undefined;
    const cur = hasSymbol ? CURRENCY_SYMBOLS[currency] : (currency || '$');
    const v = round2(value);
    if (!Number.isFinite(v)) return cur + '0.00';
    // Thousands grouping + always two decimals for money clarity (e.g. Rs62,500.00).
    const parts = v.toFixed(2).split('.');
    const whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return cur + whole + '.' + parts[1];
  }

  function fmtHours(v) {
    const n = Number(v) || 0;
    const f = n.toFixed(1);
    return f.replace(/\.0$/, '');
  }

  function fmtPct(p) {
    const n = Number(p) || 0;
    return (Math.round(n * 10) / 10) + '%';
  }

  function fmtRate(value, currency) {
    return fmtMoney(value, currency) + '/hr';
  }

  /* ── Tool currencies (multi-currency support) ─────────────────── */
  // The 8 currencies offered across every CalcMall tool header, with the
  // display symbol and decimal convention (major currencies 2 dp; regional
  // high-denomination currencies standard comma grouping, 0 dp).
  const TOOL_CURRENCIES = {
    USD: { symbol: '$',  decimals: 2, label: 'USD — US dollar ($)' },
    EUR: { symbol: '€',  decimals: 2, label: 'EUR — Euro (€)' },
    GBP: { symbol: '£',  decimals: 2, label: 'GBP — British pound (£)' },
    LKR: { symbol: 'Rs', decimals: 0, label: 'LKR — Sri Lankan rupee (Rs.)' },
    AED: { symbol: 'AED ', decimals: 0, label: 'AED — UAE dirham (AED)' },
    INR: { symbol: '₹',  decimals: 2, label: 'INR — Indian rupee (₹)' },
    CAD: { symbol: 'C$', decimals: 2, label: 'CAD — Canadian dollar (C$)' },
    AUD: { symbol: 'A$', decimals: 2, label: 'AUD — Australian dollar (A$)' },
    SGD: { symbol: 'S$', decimals: 2, label: 'SGD — Singapore dollar (S$)' },
    JPY: { symbol: '¥',  decimals: 0, label: 'JPY — Japanese yen (¥)' },
    CHF: { symbol: 'Fr.', decimals: 2, label: 'CHF — Swiss franc (Fr.)' },
    SAR: { symbol: 'SR', decimals: 2, label: 'SAR — Saudi riyal (SR)' },
    MYR: { symbol: 'RM', decimals: 2, label: 'MYR — Malaysian ringgit (RM)' },
    ZAR: { symbol: 'R',  decimals: 2, label: 'ZAR — South African rand (R)' },
    NZD: { symbol: 'NZ$', decimals: 2, label: 'NZD — New Zealand dollar (NZ$)' }
  };

  // Grouped money in a tool currency: $1,250.00 / Rs62,500 / AED4,200.
  function fmtToolMoney(value, code) {
    const c = TOOL_CURRENCIES[code] || TOOL_CURRENCIES.USD;
    const v = round2(value);
    if (!Number.isFinite(v)) return c.symbol + '0';
    const parts = v.toFixed(c.decimals).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return c.symbol + parts.join('.');
  }

  /* ── Margin & Markup pricing (tool #04) ───────────────────────── */
  // Total cost = direct cost + overhead allocation (cost × overhead%).
  // margin mode:    price = totalCost ÷ (1 − target%)   → price × (1−target) = cost.
  // markup mode:    price = totalCost × (1 + target%)  → profit vs cost.
  // Returns null fields when inputs are missing/invalid (never NaN).
  function pricingCalc(cost, overheadPct, targetPct, mode) {
    const c = Number(cost);
    const o = Number(overheadPct) || 0;
    const t = Number(targetPct);
    if (!Number.isFinite(c) || c <= 0 || !Number.isFinite(t)) {
      return { totalCost: null, price: null, profit: null, marginPct: null, markupPct: null };
    }
    const overhead = c * (Math.max(o, 0) / 100);
    const totalCost = c + overhead;
    let price;
    if (mode === 'markup') {
      price = totalCost * (1 + Math.max(t, 0) / 100);
    } else {
      // Margin: a 100% margin is impossible (price → ∞); clamp at 99.9%.
      const m = Math.min(Math.max(t, 0), 99.9);
      price = totalCost / (1 - m / 100);
    }
    const profit = price - totalCost;
    return {
      totalCost: totalCost,
      price: price,
      profit: profit,
      marginPct: (profit / price) * 100,
      markupPct: (profit / totalCost) * 100
    };
  }

  // Human duration in the given unit: 16 → "16h" (hours) or "2d" (days).
  function fmtDur(hours, unit) {
    const f = fromHours(hours, unit);
    return fmtHours(f) + (unit === 'days' ? 'd' : 'h');
  }

  // Thousands-grouped plain number with up to 2 decimals (trailing zeros
  // trimmed). Used by the Quantity & Rate calculator (tool #02), where
  // amounts are currency-free: 25 × 1500 → "37,500".
  /* A number for display. A value that is not a number at all returns an
     em-dash, NOT '0': printing "0" for an unreadable rate made a broken
     database entry indistinguishable from a legitimately zero-priced item.
     A genuine 0 still formats as "0". */
  function fmtNum(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '\u2014';
    const rounded = Math.round((n + EPS) * 100) / 100;
    const parts = rounded.toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const dec = parts[1].replace(/0+$/, '');
    return dec === '' ? parts[0] : parts[0] + '.' + dec;
  }

  /* ── Amount in words (formal invoice layout) ───────────────────── */
  // Converts a number to formal cheque/invoice wording: 2726000 →
  // "Two Million Seven Hundred Twenty-Six Thousand" (+ "and Cents …" only
  // when there are decimals). International thousand/million grouping so
  // the words match the comma-grouped figure printed next to them.
  var ONES_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  var TENS_WORDS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  var SCALES_WORDS = ['', ' Thousand', ' Million', ' Billion', ' Trillion'];

  function threeDigitWords(n) {
    var out = '';
    if (n >= 100) {
      out += ONES_WORDS[Math.floor(n / 100)] + ' Hundred';
      n %= 100;
      if (n > 0) out += ' ';
    }
    if (n >= 20) {
      out += TENS_WORDS[Math.floor(n / 10)];
      if (n % 10 > 0) out += '-' + ONES_WORDS[n % 10];
    } else if (n > 0) {
      out += ONES_WORDS[n];
    }
    return out;
  }

  function amountInWords(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return '';
    n = Math.round((n + EPS) * 100) / 100;
    if (n === 0) return 'Zero';
    var neg = n < 0;
    n = Math.abs(n);
    var whole = Math.floor(n);
    var cents = Math.round((n - whole) * 100);
    if (cents === 100) { whole += 1; cents = 0; }
    var parts = [];
    if (whole > 0) {
      var groups = [];
      var w = whole;
      while (w > 0) { groups.push(w % 1000); w = Math.floor(w / 1000); }
      for (var i = groups.length - 1; i >= 0; i--) {
        if (groups[i] === 0) continue;
        parts.push(threeDigitWords(groups[i]) + SCALES_WORDS[i]);
      }
    }
    if (cents > 0) parts.push('and Cents ' + threeDigitWords(cents));
    var out = parts.join(' ').replace(/\s+/g, ' ').trim();
    return (neg ? 'Minus ' : '') + out;
  }

  /* ── Bill of Quantities (BOQ) — tool #03 ───────────────────────── */
  // Amount = Qty × Rate (null when qty/rate blank or negative, so invalid
  // rows never corrupt the totals). All money renders in LKR via fmtMoney.
  function boqAmount(qty, rate) {
    if (qty === '' || rate === '') return null;
    const q = Number(qty);
    const r = Number(rate);
    if (!Number.isFinite(q) || !Number.isFinite(r) || q < 0 || r < 0) return null;
    return q * r;
  }

  function boqSubTotal(lines) {
    return (lines || []).reduce(function (sum, ln) {
      const a = boqAmount(ln.qty, ln.rate);
      return sum + (a !== null ? a : 0);
    }, 0);
  }

  // Discount amount = subtotal × (pct / 100).
  function boqDiscount(subtotal, pct) {
    const s = Number(subtotal) || 0;
    const p = Number(pct) || 0;
    return p > 0 ? s * (p / 100) : 0;
  }

  // Net (after discount) = subtotal − discount.
  function boqNet(subtotal, discountPct) {
    const s = Number(subtotal) || 0;
    return s - boqDiscount(s, discountPct);
  }

  // VAT amount = net × (pct / 100).
  function boqVatAmount(net, vatPct) {
    const n = Number(net) || 0;
    const p = Number(vatPct) || 0;
    return p > 0 ? n * (p / 100) : 0;
  }

  // Final total = net + VAT (VAT added on top of the discounted subtotal).
  function boqFinal(subtotal, discountPct, vatPct) {
    const net = boqNet(subtotal, discountPct);
    return net + boqVatAmount(net, vatPct);
  }

  /* ── Import Duty & Landed Cost — tool #06 ─────────────────────── */
  // Pure percentage-based tax breakdown. Nothing here knows about
  // currencies, countries or HS codes — the UI owns those. Returns null
  // when the CIF value is missing/invalid so bad input can't corrupt totals.
  // Each component = CIF × (rate% / 100); landed cost = CIF + total tax.
  function dutyCalc(cifValue, rates) {
    const cif = Number(cifValue);
    if (!Number.isFinite(cif) || cif <= 0) return null;
    const r = rates || {};
    const pct = function (v) {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : 0;
    };
    const duty = cif * (pct(r.duty) / 100);
    const pal = cif * (pct(r.pal) / 100);
    const cess = cif * (pct(r.cess) / 100);
    const sscl = cif * (pct(r.sscl) / 100);
    const vat = cif * (pct(r.vat) / 100);
    const totalTax = duty + pal + cess + sscl + vat;
    return {
      cif: cif,
      duty: duty,
      pal: pal,
      cess: cess,
      sscl: sscl,
      vat: vat,
      totalTax: totalTax,
      landed: cif + totalTax
    };
  }

  /* ── Contract Variation — tool #07 ────────────────────────────── */
  // Revised value = original + added; % increase = added ÷ original × 100.
  // Returns null fields when the original value is missing/invalid.
  function variationCalc(original, added) {
    const o = Number(original);
    const a = Number(added);
    if (!Number.isFinite(o) || o <= 0 || !Number.isFinite(a) || a < 0) {
      return { revised: null, increase: null };
    }
    const revised = o + a;
    return { revised: revised, increase: (a / o) * 100 };
  }

  /* ── Freelance Rate & Overhead Breakeven — tool #08 ───────────── */
  // All time is annual. billableHours/yr = (workDays − adminDays) × dayHours.
  // requiredHourly = (netIncome + overhead) ÷ billableHours (pre-tax).
  // Returns null fields when inputs are missing/invalid (never NaN).
  function breakevenCalc(netIncome, overhead, workDays, adminHoursWk, dayHours, taxPct) {
    const n = Number(netIncome);
    const o = Number(overhead) || 0;
    const d = Number(workDays);
    const a = Number(adminHoursWk) || 0;
    const h = Number(dayHours) || 8;
    const t = Number(taxPct) || 0;
    if (!Number.isFinite(n) || n < 0 || !Number.isFinite(d) || d <= 0 || a < 0) {
      return null;
    }
    const workWeeks = 52;
    const adminDays = (a * workWeeks) / h;       // unbilled admin hours → lost working days
    const billableDays = Math.max(d - adminDays, 0);
    const billableHours = billableDays * h;
    if (billableHours <= 0) {
      return { billableHours: 0, hourly: null, daily: null, adminDays: adminDays, overhead: o, gross: null };
    }
    const gross = (n + o) / (1 - Math.min(Math.max(t, 0), 99) / 100); // pre-tax revenue needed
    const hourly = gross / billableHours;
    return {
      billableHours: billableHours,
      hourly: hourly,
      daily: hourly * h,
      adminDays: adminDays,
      overhead: o,
      gross: gross
    };
  }

  /* ── Cross-Border FX & Fee Adjuster — tool #09 ────────────────── */
  // Two-layer fee model, both optional: a percentage (gateway %) plus a
  // fixed fee, and an FX markup % applied on top of the percent-fee gross-up.
  // Exact invoice amount X solves: X·(1−p) − fixed = target  (percent layer)
  // with the FX markup folded into the effective percentage. Fixed fee is
  // subtracted after the percentage layer, per gateway behavior.
  function fxFeeCalc(target, pctFee, fixedFee, fxMarkupPct) {
    const tgt = Number(target);
    const p = Math.max(Number(pctFee) || 0, 0) / 100;
    const f = Math.max(Number(fixedFee) || 0, 0);
    const fx = Math.max(Number(fxMarkupPct) || 0, 0) / 100;
    if (!Number.isFinite(tgt) || tgt <= 0) return null;
    const effPct = p + fx;                      // layers combine additively
    if (effPct >= 1) return { invoice: null, fees: null, received: tgt, pctFeeAmt: null, fxMarkupAmt: null, fixedAmt: f, effectivePct: effPct * 100 };
    const invoice = (tgt + f) / (1 - effPct);
    const fees = invoice - tgt;
    return {
      invoice: invoice,
      fees: fees,
      received: tgt,
      pctFeeAmt: invoice * p,
      fxMarkupAmt: invoice * fx,
      fixedAmt: f,
      effectivePct: effPct * 100
    };
  }

  /* ── Academic GPA & Target Grade Planner — tool #10 ───────────── */
  // Required average GPA in remaining credits to reach a target CGPA:
  // req = (target·total − current·done) ÷ remaining. Null when impossible.
  function gpaRequired(currentGpa, doneCredits, targetGpa, remainingCredits) {
    const c = Number(currentGpa);
    const done = Number(doneCredits);
    const t = Number(targetGpa);
    const rem = Number(remainingCredits);
    if (!Number.isFinite(c) || !Number.isFinite(done) || done < 0 ||
        !Number.isFinite(t) || !Number.isFinite(rem) || rem <= 0) return null;
    const total = done + rem;
    const req = (t * total - c * done) / rem;
    return {
      required: req,
      feasible: req <= 4.0,
      impossible: req > 4.0,
      targetBelowCurrent: t < c
    }
  }

  // Assignment score needed on a weighted item to keep the course grade at
  // or above target: needed = (target − earnedSoFar) ÷ weightRemaining.
  function courseNeeded(currentPct, targetPct, weightRemainingPct) {
    const cur = Number(currentPct);
    const tgt = Number(targetPct);
    const w = Number(weightRemainingPct);
    if (!Number.isFinite(cur) || !Number.isFinite(tgt) || !Number.isFinite(w) || w <= 0) return null;
    const needed = (tgt - cur) / (w / 100);
    return {
      needed: needed,
      achievable: needed <= 100,
      locked: needed > 100,
      cushion: needed <= 0
    };
  }

  /* ── Retainer & SLA Pricing Estimator — tool #11 ─────────────── */
  // Monthly retainer: cost = included hours × blended rate + monthly
  // overhead; price = cost ÷ (1 − margin%) with an SLA surcharge applied
  // on top. Returns null fields when inputs are missing/invalid.
  function retainerCalc(baseHours, hourly, overhead, marginPct, slaSurchargePct) {
    const h = Number(baseHours);
    const r = Number(hourly);
    if (!Number.isFinite(h) || h <= 0 || !Number.isFinite(r) || r < 0) {
      return null;
    }
    const oh = Math.max(Number(overhead) || 0, 0);
    const m = Math.min(Math.max(Number(marginPct) || 0, 0), 99.9);
    const sla = Math.max(Number(slaSurchargePct) || 0, 0);
    const cost = h * r + oh;
    const price = (cost / (1 - m / 100)) * (1 + sla / 100);
    const profit = price - cost;
    return {
      cost: cost,
      price: price,
      profit: profit,
      effectiveHourly: price / h,
      annual: price * 12,
      marginPct: price > 0 ? (profit / price) * 100 : 0
    };
  }

  /* ── Project Delay & Damages Impact — tool #12 ────────────────── */
  // Penalty accrues daily on the contract value and is capped at cap% of
  // the contract. Extended overhead is separate (site/team running cost).
  // Returns null when the contract value is missing/invalid.
  function delayCalc(contract, dailyPenaltyPct, capPct, days, dailyOverhead) {
    const c = Number(contract);
    if (!Number.isFinite(c) || c <= 0) return null;
    const p = Math.max(Number(dailyPenaltyPct) || 0, 0);
    const cap = Math.max(Number(capPct) || 0, 0);
    const d = Math.max(Number(days) || 0, 0);
    const oh = Math.max(Number(dailyOverhead) || 0, 0);
    const rawPenalty = c * (p / 100) * d;
    const capAmount = c * (cap / 100);
    const penalty = cap > 0 ? Math.min(rawPenalty, capAmount) : rawPenalty;
    const overhead = oh * d;
    const total = penalty + overhead;
    return {
      rawPenalty: rawPenalty,
      capAmount: capAmount,
      capped: cap > 0 && rawPenalty > capAmount,
      penalty: penalty,
      overhead: overhead,
      total: total,
      pctOfContract: (total / c) * 100
    };
  }

  const Calc = {
    HOURS_PER_DAY: HOURS_PER_DAY,
    toHours: toHours,
    fromHours: fromHours,
    round2: round2,
    sanitizeNumericText: sanitizeNumericText,
    toNum: toNum,
    isNumericText: isNumericText,
    originalEffectiveRate: originalEffectiveRate,
    requestValue: requestValue,
    requestValueForRequest: requestValueForRequest,
    isCommitted: isCommitted,
    committedHours: committedHours,
    committedValue: committedValue,
    unbilledValue: unbilledValue,
    projectedEffectiveRate: projectedEffectiveRate,
    rateDropPct: rateDropPct,
    breakEvenCharge: breakEvenCharge,
    fmtMoney: fmtMoney,
    fmtHours: fmtHours,
    fmtPct: fmtPct,
    fmtRate: fmtRate,
    fmtDur: fmtDur,
    fmtNum: fmtNum,
    amountInWords: amountInWords,
    TOOL_CURRENCIES: TOOL_CURRENCIES,
    fmtToolMoney: fmtToolMoney,
    pricingCalc: pricingCalc,
    boqAmount: boqAmount,
    boqSubTotal: boqSubTotal,
    boqDiscount: boqDiscount,
    boqNet: boqNet,
    boqVatAmount: boqVatAmount,
    boqFinal: boqFinal,
    dutyCalc: dutyCalc,
    variationCalc: variationCalc,
    breakevenCalc: breakevenCalc,
    fxFeeCalc: fxFeeCalc,
    gpaRequired: gpaRequired,
    courseNeeded: courseNeeded,
    retainerCalc: retainerCalc,
    delayCalc: delayCalc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Calc;
  }
  if (typeof window !== 'undefined') {
    root.Calc = Calc;
  }
})(typeof window !== 'undefined' ? window : this);
