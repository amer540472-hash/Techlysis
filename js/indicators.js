/**
 * Technical indicators — pure JS
 */
const Indicators = (() => {
  function closes(candles) { return candles.map(c => c.c); }
  function highs(candles) { return candles.map(c => c.h); }
  function lows(candles) { return candles.map(c => c.l); }
  function volumes(candles) { return candles.map(c => c.v || 0); }

  function sma(values, period) {
    const out = new Array(values.length).fill(null);
    if (period <= 0) return out;
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= period) sum -= values[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  }

  function ema(values, period) {
    const out = new Array(values.length).fill(null);
    if (!values.length || period <= 0) return out;
    const k = 2 / (period + 1);
    let prev = null;
    let seed = 0;
    for (let i = 0; i < values.length; i++) {
      if (i < period) {
        seed += values[i];
        if (i === period - 1) {
          prev = seed / period;
          out[i] = prev;
        }
      } else {
        prev = values[i] * k + prev * (1 - k);
        out[i] = prev;
      }
    }
    return out;
  }

  function rsi(values, period = 14) {
    const out = new Array(values.length).fill(null);
    if (values.length < period + 1) return out;
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= period; i++) {
      const d = values[i] - values[i - 1];
      if (d >= 0) avgGain += d; else avgLoss -= d;
    }
    avgGain /= period;
    avgLoss /= period;
    out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    for (let i = period + 1; i < values.length; i++) {
      const d = values[i] - values[i - 1];
      const g = d > 0 ? d : 0;
      const l = d < 0 ? -d : 0;
      avgGain = (avgGain * (period - 1) + g) / period;
      avgLoss = (avgLoss * (period - 1) + l) / period;
      out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
    return out;
  }

  function macd(values, fast = 12, slow = 26, signal = 9) {
    const emaFast = ema(values, fast);
    const emaSlow = ema(values, slow);
    const line = values.map((_, i) =>
      emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null
    );
    // signal EMA of macd line (skip nulls carefully)
    const compact = line.map(v => v == null ? 0 : v);
    const sigRaw = ema(compact, signal);
    const sig = line.map((v, i) => (v == null || i < slow + signal - 2) ? null : sigRaw[i]);
    const hist = line.map((v, i) => (v != null && sig[i] != null) ? v - sig[i] : null);
    return { macd: line, signal: sig, hist };
  }

  function bollinger(values, period = 20, mult = 2) {
    const mid = sma(values, period);
    const upper = new Array(values.length).fill(null);
    const lower = new Array(values.length).fill(null);
    for (let i = period - 1; i < values.length; i++) {
      const slice = values.slice(i - period + 1, i + 1);
      const m = mid[i];
      const sd = Utils.stdev(slice);
      upper[i] = m + mult * sd;
      lower[i] = m - mult * sd;
    }
    return { mid, upper, lower };
  }

  function atr(candles, period = 14) {
    const tr = new Array(candles.length).fill(0);
    for (let i = 0; i < candles.length; i++) {
      if (i === 0) {
        tr[i] = candles[i].h - candles[i].l;
      } else {
        tr[i] = Math.max(
          candles[i].h - candles[i].l,
          Math.abs(candles[i].h - candles[i - 1].c),
          Math.abs(candles[i].l - candles[i - 1].c)
        );
      }
    }
    return ema(tr, period); // Wilder-ish via EMA approximation; good enough
  }

  function trueAtr(candles, period = 14) {
    // Wilder's ATR
    const out = new Array(candles.length).fill(null);
    const tr = [];
    for (let i = 0; i < candles.length; i++) {
      if (i === 0) tr.push(candles[i].h - candles[i].l);
      else {
        tr.push(Math.max(
          candles[i].h - candles[i].l,
          Math.abs(candles[i].h - candles[i - 1].c),
          Math.abs(candles[i].l - candles[i - 1].c)
        ));
      }
    }
    if (tr.length < period) return out;
    let sum = 0;
    for (let i = 0; i < period; i++) sum += tr[i];
    out[period - 1] = sum / period;
    for (let i = period; i < tr.length; i++) {
      out[i] = (out[i - 1] * (period - 1) + tr[i]) / period;
    }
    return out;
  }

  function stochastic(candles, kPeriod = 14, dPeriod = 3) {
    const k = new Array(candles.length).fill(null);
    for (let i = kPeriod - 1; i < candles.length; i++) {
      let hi = -Infinity, lo = Infinity;
      for (let j = i - kPeriod + 1; j <= i; j++) {
        hi = Math.max(hi, candles[j].h);
        lo = Math.min(lo, candles[j].l);
      }
      k[i] = hi === lo ? 50 : ((candles[i].c - lo) / (hi - lo)) * 100;
    }
    const d = sma(k.map(v => v == null ? 0 : v), dPeriod).map((v, i) => k[i] == null ? null : v);
    return { k, d };
  }

  function vwap(candles) {
    const out = new Array(candles.length).fill(null);
    let cumPV = 0, cumV = 0;
    // Reset roughly per session day
    let lastDay = null;
    for (let i = 0; i < candles.length; i++) {
      const day = new Date(candles[i].t).toDateString();
      if (lastDay !== day) {
        cumPV = 0; cumV = 0; lastDay = day;
      }
      const tp = (candles[i].h + candles[i].l + candles[i].c) / 3;
      const vol = candles[i].v || 1;
      cumPV += tp * vol;
      cumV += vol;
      out[i] = cumV ? cumPV / cumV : tp;
    }
    return out;
  }

  function adx(candles, period = 14) {
    const n = candles.length;
    const plusDM = new Array(n).fill(0);
    const minusDM = new Array(n).fill(0);
    const tr = new Array(n).fill(0);
    for (let i = 1; i < n; i++) {
      const up = candles[i].h - candles[i - 1].h;
      const down = candles[i - 1].l - candles[i].l;
      plusDM[i] = up > down && up > 0 ? up : 0;
      minusDM[i] = down > up && down > 0 ? down : 0;
      tr[i] = Math.max(
        candles[i].h - candles[i].l,
        Math.abs(candles[i].h - candles[i - 1].c),
        Math.abs(candles[i].l - candles[i - 1].c)
      );
    }
    const smooth = (arr) => {
      const out = new Array(n).fill(null);
      let sum = 0;
      for (let i = 1; i <= period; i++) sum += arr[i];
      out[period] = sum;
      for (let i = period + 1; i < n; i++) {
        out[i] = out[i - 1] - out[i - 1] / period + arr[i];
      }
      return out;
    };
    const str = smooth(tr);
    const sPlus = smooth(plusDM);
    const sMinus = smooth(minusDM);
    const pdi = new Array(n).fill(null);
    const mdi = new Array(n).fill(null);
    const dx = new Array(n).fill(null);
    for (let i = period; i < n; i++) {
      if (!str[i]) continue;
      pdi[i] = 100 * (sPlus[i] / str[i]);
      mdi[i] = 100 * (sMinus[i] / str[i]);
      const den = pdi[i] + mdi[i];
      dx[i] = den ? 100 * Math.abs(pdi[i] - mdi[i]) / den : 0;
    }
    const adxOut = new Array(n).fill(null);
    let start = period * 2;
    if (start < n) {
      let sum = 0, cnt = 0;
      for (let i = period; i < start; i++) {
        if (dx[i] != null) { sum += dx[i]; cnt++; }
      }
      if (cnt) {
        adxOut[start - 1] = sum / cnt;
        for (let i = start; i < n; i++) {
          adxOut[i] = (adxOut[i - 1] * (period - 1) + (dx[i] || 0)) / period;
        }
      }
    }
    return { adx: adxOut, plusDI: pdi, minusDI: mdi };
  }

  function pivotPoints(candles) {
    // Classic pivots from previous candle (or previous day if daily)
    if (candles.length < 2) return null;
    const prev = candles[candles.length - 2];
    const p = (prev.h + prev.l + prev.c) / 3;
    const r1 = 2 * p - prev.l;
    const s1 = 2 * p - prev.h;
    const r2 = p + (prev.h - prev.l);
    const s2 = p - (prev.h - prev.l);
    const r3 = prev.h + 2 * (p - prev.l);
    const s3 = prev.l - 2 * (prev.h - p);
    return { p, r1, r2, r3, s1, s2, s3 };
  }

  /** Compute full indicator pack for chart + report */
  function computeAll(candles) {
    const c = closes(candles);
    const ema9 = ema(c, 9);
    const ema21 = ema(c, 21);
    const ema50 = ema(c, 50);
    const ema200 = ema(c, 200);
    const sma20 = sma(c, 20);
    const sma50 = sma(c, 50);
    const bb = bollinger(c, 20, 2);
    const rsi14 = rsi(c, 14);
    const macdData = macd(c, 12, 26, 9);
    const atr14 = trueAtr(candles, 14);
    const stoch = stochastic(candles, 14, 3);
    const vwapLine = vwap(candles);
    const adxData = adx(candles, 14);
    const pivots = pivotPoints(candles);

    const last = (arr) => {
      for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i];
      return null;
    };

    return {
      ema9, ema21, ema50, ema200, sma20, sma50,
      bb, rsi14, macd: macdData, atr14, stoch, vwap: vwapLine, adx: adxData, pivots,
      last: {
        close: c[c.length - 1],
        ema9: last(ema9),
        ema21: last(ema21),
        ema50: last(ema50),
        ema200: last(ema200),
        sma20: last(sma20),
        rsi: last(rsi14),
        macd: last(macdData.macd),
        macdSignal: last(macdData.signal),
        macdHist: last(macdData.hist),
        atr: last(atr14),
        stochK: last(stoch.k),
        stochD: last(stoch.d),
        vwap: last(vwapLine),
        adx: last(adxData.adx),
        plusDI: last(adxData.plusDI),
        minusDI: last(adxData.minusDI),
        bbUpper: last(bb.upper),
        bbMid: last(bb.mid),
        bbLower: last(bb.lower),
      },
    };
  }

  return {
    sma, ema, rsi, macd, bollinger, atr, trueAtr, stochastic, vwap, adx, pivotPoints, computeAll,
    closes, highs, lows, volumes,
  };
})();
