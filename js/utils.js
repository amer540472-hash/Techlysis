/**
 * Shared utilities
 */
const Utils = {
  clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  },

  lerp(a, b, t) {
    return a + (b - a) * t;
  },

  round(v, d = 2) {
    const m = 10 ** d;
    return Math.round(v * m) / m;
  },

  fmt(v, decimals = 2) {
    if (v == null || Number.isNaN(v)) return '—';
    const abs = Math.abs(v);
    if (abs >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3 && decimals <= 2) {
      return v.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
    }
    return Number(v).toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  },

  fmtPrice(v, asset) {
    const d = (asset && asset.decimals != null) ? asset.decimals : 2;
    if (v == null || Number.isNaN(v)) return '—';
    return Number(v).toLocaleString(undefined, {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
  },

  fmtPct(v, d = 2) {
    if (v == null || Number.isNaN(v)) return '—';
    const s = (v >= 0 ? '+' : '') + v.toFixed(d) + '%';
    return s;
  },

  fmtTime(ts) {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  },

  fmtDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
    });
  },

  /** Mean */
  mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  },

  stdev(arr) {
    if (arr.length < 2) return 0;
    const m = this.mean(arr);
    const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(v);
  },

  /** Linear regression slope of y over x=0..n-1 */
  slope(ys) {
    const n = ys.length;
    if (n < 2) return 0;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += i; sumY += ys[i]; sumXY += i * ys[i]; sumXX += i * i;
    }
    const den = n * sumXX - sumX * sumX;
    if (den === 0) return 0;
    return (n * sumXY - sumX * sumY) / den;
  },

  /** Debounce */
  debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  },

  /** Deep-ish clone plain objects */
  clone(o) {
    return JSON.parse(JSON.stringify(o));
  },

  /** Aggregate candles to higher TF (e.g. 1h → 4h) */
  aggregateCandles(candles, factor) {
    if (factor <= 1 || !candles.length) return candles.slice();
    const out = [];
    for (let i = 0; i < candles.length; i += factor) {
      const chunk = candles.slice(i, i + factor);
      if (!chunk.length) break;
      out.push({
        t: chunk[0].t,
        o: chunk[0].o,
        h: Math.max(...chunk.map(c => c.h)),
        l: Math.min(...chunk.map(c => c.l)),
        c: chunk[chunk.length - 1].c,
        v: chunk.reduce((s, c) => s + (c.v || 0), 0),
      });
    }
    return out;
  },

  /** Resample / build synthetic lower TF from higher by splitting */
  expandCandles(candles, factor) {
    if (factor <= 1) return candles.slice();
    // Not truly expanding time — used only as last-resort fallback
    return candles.slice();
  },

  /** Simple seeded PRNG (mulberry32) */
  rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  },

  downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  async copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    }
  },
};
