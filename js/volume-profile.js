/**
 * Fixed Range Volume Profile (FRVP)
 * POC, VAH, VAL, HVN, LVN
 */
const VolumeProfile = (() => {
  /**
   * @param {Array} candles
   * @param {object} opts
   *   startI, endI — inclusive indices (default full range)
   *   bins — number of price bins
   *   vaPercent — value area percent (default 0.7)
   */
  function compute(candles, opts = {}) {
    if (!candles || candles.length < 2) {
      return null;
    }
    const startI = opts.startI != null ? opts.startI : 0;
    const endI = opts.endI != null ? opts.endI : candles.length - 1;
    const slice = candles.slice(startI, endI + 1);
    if (slice.length < 2) return null;

    let hi = -Infinity, lo = Infinity;
    for (const c of slice) {
      if (c.h > hi) hi = c.h;
      if (c.l < lo) lo = c.l;
    }
    if (hi <= lo) {
      hi = lo * 1.001;
      lo = lo * 0.999;
    }

    const bins = opts.bins || Math.min(48, Math.max(24, Math.floor(slice.length / 3)));
    const step = (hi - lo) / bins;
    const profile = new Array(bins).fill(0).map((_, i) => ({
      i,
      low: lo + i * step,
      high: lo + (i + 1) * step,
      mid: lo + (i + 0.5) * step,
      volume: 0,
      buyVol: 0,
      sellVol: 0,
    }));

    for (const c of slice) {
      const vol = c.v || 1;
      const range = Math.max(c.h - c.l, step * 0.01);
      // distribute volume across bins the candle touches (uniform by overlap)
      const i0 = Utils.clamp(Math.floor((c.l - lo) / step), 0, bins - 1);
      const i1 = Utils.clamp(Math.floor((c.h - lo) / step), 0, bins - 1);
      const bull = c.c >= c.o;
      let totalOverlap = 0;
      const overlaps = [];
      for (let i = i0; i <= i1; i++) {
        const ol = Math.min(c.h, profile[i].high) - Math.max(c.l, profile[i].low);
        const o = Math.max(ol, 0);
        overlaps.push(o);
        totalOverlap += o;
      }
      if (totalOverlap <= 0) {
        // fallback: put all at close bin
        const ci = Utils.clamp(Math.floor((c.c - lo) / step), 0, bins - 1);
        profile[ci].volume += vol;
        if (bull) profile[ci].buyVol += vol; else profile[ci].sellVol += vol;
      } else {
        for (let k = 0; k < overlaps.length; k++) {
          const share = vol * (overlaps[k] / totalOverlap);
          const i = i0 + k;
          profile[i].volume += share;
          if (bull) profile[i].buyVol += share; else profile[i].sellVol += share;
        }
      }
    }

    // POC
    let pocIdx = 0;
    let maxVol = -1;
    let totalVol = 0;
    for (let i = 0; i < bins; i++) {
      totalVol += profile[i].volume;
      if (profile[i].volume > maxVol) {
        maxVol = profile[i].volume;
        pocIdx = i;
      }
    }
    const poc = profile[pocIdx].mid;

    // Value Area — expand from POC until vaPercent of volume
    const vaPercent = opts.vaPercent || 0.7;
    const target = totalVol * vaPercent;
    let loI = pocIdx, hiI = pocIdx;
    let acc = profile[pocIdx].volume;
    while (acc < target && (loI > 0 || hiI < bins - 1)) {
      const up = hiI < bins - 1 ? profile[hiI + 1].volume : -1;
      const dn = loI > 0 ? profile[loI - 1].volume : -1;
      if (up >= dn) {
        if (hiI < bins - 1) { hiI++; acc += profile[hiI].volume; }
        else if (loI > 0) { loI--; acc += profile[loI].volume; }
        else break;
      } else {
        if (loI > 0) { loI--; acc += profile[loI].volume; }
        else if (hiI < bins - 1) { hiI++; acc += profile[hiI].volume; }
        else break;
      }
    }
    const val = profile[loI].low;
    const vah = profile[hiI].high;

    // HVN / LVN
    const vols = profile.map(p => p.volume);
    const mean = Utils.mean(vols);
    const sd = Utils.stdev(vols) || 1;
    const hvn = profile.filter(p => p.volume > mean + 0.75 * sd).map(p => ({ price: p.mid, volume: p.volume }));
    const lvn = profile.filter(p => p.volume < mean - 0.5 * sd && p.volume > 0).map(p => ({ price: p.mid, volume: p.volume }));

    // max for drawing scale
    const maxBinVol = Math.max(...vols, 1);

    return {
      profile,
      bins,
      step,
      hi, lo,
      poc, pocIdx,
      vah, val,
      vahIdx: hiI, valIdx: loI,
      totalVol,
      maxBinVol,
      hvn, lvn,
      startI, endI,
      vaPercent,
    };
  }

  /** Fixed range = visible / full series (we use full by default, or last N) */
  function fixedRange(candles, barsBack = null) {
    if (!candles.length) return null;
    const endI = candles.length - 1;
    const startI = barsBack ? Math.max(0, endI - barsBack + 1) : 0;
    return compute(candles, { startI, endI, bins: 40, vaPercent: 0.7 });
  }

  return { compute, fixedRange };
})();
