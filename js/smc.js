/**
 * Smart Money Concepts — swings, S/R, supply/demand, FVG, order blocks
 */
const SMC = (() => {
  /**
   * Fractal swing highs/lows
   * @param {number} left right strength (bars each side)
   */
  function findSwings(candles, strength = 3) {
    const swings = [];
    for (let i = strength; i < candles.length - strength; i++) {
      let isHigh = true, isLow = true;
      for (let j = 1; j <= strength; j++) {
        if (candles[i].h < candles[i - j].h || candles[i].h < candles[i + j].h) isHigh = false;
        if (candles[i].l > candles[i - j].l || candles[i].l > candles[i + j].l) isLow = false;
      }
      if (isHigh) swings.push({ i, t: candles[i].t, price: candles[i].h, type: 'high', kind: 'swing' });
      if (isLow) swings.push({ i, t: candles[i].t, price: candles[i].l, type: 'low', kind: 'swing' });
    }
    return swings;
  }

  /** Major highs/lows — wider fractal */
  function findMajors(candles, strength = 8) {
    return findSwings(candles, strength).map(s => ({ ...s, kind: 'major' }));
  }

  /** Cluster swing prices into S/R levels */
  function supportResistance(candles, swings, atr) {
    if (!candles.length) return { support: [], resistance: [] };
    const last = candles[candles.length - 1].c;
    const tol = (atr || last * 0.002) * 0.6;
    const prices = swings.map(s => s.price);
    // also include recent rolling highs/lows
    const look = Math.min(50, candles.length);
    const recent = candles.slice(-look);
    prices.push(Math.max(...recent.map(c => c.h)));
    prices.push(Math.min(...recent.map(c => c.l)));

    // cluster
    const sorted = prices.slice().sort((a, b) => a - b);
    const clusters = [];
    for (const p of sorted) {
      const lastC = clusters[clusters.length - 1];
      if (!lastC || p - lastC.mean > tol) {
        clusters.push({ prices: [p], mean: p, count: 1 });
      } else {
        lastC.prices.push(p);
        lastC.count++;
        lastC.mean = lastC.prices.reduce((a, b) => a + b, 0) / lastC.prices.length;
      }
    }

    // score by touches
    const levels = clusters
      .filter(c => c.count >= 1)
      .map(c => {
        let touches = 0;
        for (const bar of candles) {
          if (Math.abs(bar.h - c.mean) <= tol || Math.abs(bar.l - c.mean) <= tol ||
              Math.abs(bar.c - c.mean) <= tol) touches++;
        }
        return {
          price: c.mean,
          touches,
          strength: c.count + touches * 0.3,
          type: c.mean >= last ? 'resistance' : 'support',
        };
      })
      .sort((a, b) => b.strength - a.strength);

    const support = levels.filter(l => l.type === 'support').slice(0, 8)
      .sort((a, b) => b.price - a.price);
    const resistance = levels.filter(l => l.type === 'resistance').slice(0, 8)
      .sort((a, b) => a.price - b.price);

    return { support, resistance, all: levels };
  }

  /**
   * Supply & Demand zones
   * Demand: base (consolidation) before strong bullish departure
   * Supply: base before strong bearish departure
   */
  function supplyDemand(candles, atr) {
    const zones = [];
    if (candles.length < 15) return zones;
    const avgAtr = atr || candles[candles.length - 1].c * 0.005;
    const impulseMult = 1.6;

    for (let i = 5; i < candles.length - 3; i++) {
      const body = Math.abs(candles[i].c - candles[i].o);
      const range = candles[i].h - candles[i].l;
      // look for impulsive move after a base
      const moveUp = candles[i].c - candles[i - 3].c;
      const moveDn = candles[i - 3].c - candles[i].c;

      // bullish impulse → demand zone from prior base candle(s)
      if (moveUp > avgAtr * impulseMult && candles[i].c > candles[i].o) {
        const base = candles[i - 1];
        const base2 = candles[i - 2];
        const top = Math.max(base.h, base2.h, base.o, base.c);
        const bot = Math.min(base.l, base2.l, base.o, base.c);
        if (top - bot < avgAtr * 2.5) {
          zones.push({
            type: 'demand',
            top, bottom: bot,
            startI: i - 2, endI: i - 1,
            t: base.t,
            broken: candles.slice(i).some(c => c.l < bot - avgAtr * 0.1),
            strength: moveUp / avgAtr,
          });
        }
      }
      // bearish impulse → supply
      if (moveDn > avgAtr * impulseMult && candles[i].c < candles[i].o) {
        const base = candles[i - 1];
        const base2 = candles[i - 2];
        const top = Math.max(base.h, base2.h, base.o, base.c);
        const bot = Math.min(base.l, base2.l, base.o, base.c);
        if (top - bot < avgAtr * 2.5) {
          zones.push({
            type: 'supply',
            top, bottom: bot,
            startI: i - 2, endI: i - 1,
            t: base.t,
            broken: candles.slice(i).some(c => c.h > top + avgAtr * 0.1),
            strength: moveDn / avgAtr,
          });
        }
      }
    }

    // keep freshest unmitigated-ish zones
    const last = candles[candles.length - 1].c;
    const demand = zones
      .filter(z => z.type === 'demand' && !z.broken)
      .sort((a, b) => b.startI - a.startI)
      .slice(0, 5);
    const supply = zones
      .filter(z => z.type === 'supply' && !z.broken)
      .sort((a, b) => b.startI - a.startI)
      .slice(0, 5);

    // also keep some broken for context
    const mitigated = zones.filter(z => z.broken).sort((a, b) => b.startI - a.startI).slice(0, 4);

    return { demand, supply, mitigated, all: zones };
  }

  /**
   * Fair Value Gaps (3-candle imbalance)
   * Bullish FVG: low[i] > high[i-2]
   * Bearish FVG: high[i] < low[i-2]
   */
  function fairValueGaps(candles, lookback = 80) {
    const start = Math.max(2, candles.length - lookback);
    const fvgs = [];
    for (let i = start; i < candles.length; i++) {
      // bullish
      if (candles[i].l > candles[i - 2].h) {
        const top = candles[i].l;
        const bottom = candles[i - 2].h;
        const filled = candles.slice(i + 1).some(c => c.l <= bottom);
        const partial = candles.slice(i + 1).some(c => c.l < top);
        fvgs.push({
          type: 'bullish',
          top, bottom,
          i, t: candles[i].t,
          filled, partial,
          size: top - bottom,
        });
      }
      // bearish
      if (candles[i].h < candles[i - 2].l) {
        const top = candles[i - 2].l;
        const bottom = candles[i].h;
        const filled = candles.slice(i + 1).some(c => c.h >= top);
        const partial = candles.slice(i + 1).some(c => c.h > bottom);
        fvgs.push({
          type: 'bearish',
          top, bottom,
          i, t: candles[i].t,
          filled, partial,
          size: top - bottom,
        });
      }
    }
    const open = fvgs.filter(f => !f.filled).slice(-12);
    return { all: fvgs, open };
  }

  /**
   * Order Blocks — last opposing candle before impulsive move
   */
  function orderBlocks(candles, atr) {
    const obs = [];
    if (candles.length < 10) return { bullish: [], bearish: [], all: [] };
    const avgAtr = atr || candles[candles.length - 1].c * 0.005;

    for (let i = 3; i < candles.length - 2; i++) {
      // bullish OB: last down candle before strong up move
      const upMove = candles[i + 1].c - candles[i].l;
      if (
        candles[i].c < candles[i].o &&
        candles[i + 1].c > candles[i + 1].o &&
        upMove > avgAtr * 1.4
      ) {
        // confirm follow-through
        const follow = candles[Math.min(i + 3, candles.length - 1)].c - candles[i].c;
        if (follow > avgAtr * 0.8) {
          const top = Math.max(candles[i].o, candles[i].c);
          const bottom = Math.min(candles[i].o, candles[i].c, candles[i].l);
          const mitigated = candles.slice(i + 2).some(c => c.l <= bottom);
          obs.push({
            type: 'bullish',
            top: Math.max(candles[i].o, candles[i].c),
            bottom: candles[i].l,
            bodyTop: top,
            bodyBottom: Math.min(candles[i].o, candles[i].c),
            i, t: candles[i].t,
            mitigated,
            strength: follow / avgAtr,
          });
        }
      }

      // bearish OB: last up candle before strong down move
      const dnMove = candles[i].h - candles[i + 1].c;
      if (
        candles[i].c > candles[i].o &&
        candles[i + 1].c < candles[i + 1].o &&
        dnMove > avgAtr * 1.4
      ) {
        const follow = candles[i].c - candles[Math.min(i + 3, candles.length - 1)].c;
        if (follow > avgAtr * 0.8) {
          const top = candles[i].h;
          const bottom = Math.min(candles[i].o, candles[i].c);
          const mitigated = candles.slice(i + 2).some(c => c.h >= top);
          obs.push({
            type: 'bearish',
            top,
            bottom,
            bodyTop: Math.max(candles[i].o, candles[i].c),
            bodyBottom: bottom,
            i, t: candles[i].t,
            mitigated,
            strength: follow / avgAtr,
          });
        }
      }
    }

    const bullish = obs.filter(o => o.type === 'bullish' && !o.mitigated).sort((a, b) => b.i - a.i).slice(0, 5);
    const bearish = obs.filter(o => o.type === 'bearish' && !o.mitigated).sort((a, b) => b.i - a.i).slice(0, 5);
    return { bullish, bearish, all: obs };
  }

  /** Recent & major H/L summary */
  function extremes(candles, swings, majors) {
    const n = candles.length;
    const last20 = candles.slice(-Math.min(20, n));
    const last50 = candles.slice(-Math.min(50, n));
    const allH = Math.max(...candles.map(c => c.h));
    const allL = Math.min(...candles.map(c => c.l));
    const recentHigh = Math.max(...last20.map(c => c.h));
    const recentLow = Math.min(...last20.map(c => c.l));
    const midHigh = Math.max(...last50.map(c => c.h));
    const midLow = Math.min(...last50.map(c => c.l));

    const swingHighs = swings.filter(s => s.type === 'high').slice(-6);
    const swingLows = swings.filter(s => s.type === 'low').slice(-6);
    const majorHighs = majors.filter(s => s.type === 'high').slice(-4);
    const majorLows = majors.filter(s => s.type === 'low').slice(-4);

    return {
      rangeHigh: allH,
      rangeLow: allL,
      recentHigh, recentLow,
      midHigh, midLow,
      swingHighs, swingLows,
      majorHighs, majorLows,
    };
  }

  /** Structure bias — HH/HL vs LH/LL */
  function marketStructure(swings) {
    const highs = swings.filter(s => s.type === 'high');
    const lows = swings.filter(s => s.type === 'low');
    if (highs.length < 2 || lows.length < 2) {
      return { bias: 'neutral', label: 'Insufficient swings', events: [] };
    }
    const h1 = highs[highs.length - 2].price;
    const h2 = highs[highs.length - 1].price;
    const l1 = lows[lows.length - 2].price;
    const l2 = lows[lows.length - 1].price;

    const hh = h2 > h1;
    const hl = l2 > l1;
    const lh = h2 < h1;
    const ll = l2 < l1;

    let bias = 'neutral';
    let label = 'Range / mixed structure';
    if (hh && hl) { bias = 'bullish'; label = 'Higher Highs + Higher Lows (bullish structure)'; }
    else if (lh && ll) { bias = 'bearish'; label = 'Lower Highs + Lower Lows (bearish structure)'; }
    else if (hh && ll) { bias = 'neutral'; label = 'Expanding range (HH + LL)'; }
    else if (lh && hl) { bias = 'neutral'; label = 'Contracting range (LH + HL)'; }

    // BOS / CHoCH approx
    const events = [];
    if (hh) events.push({ type: 'BOS', dir: 'bullish', price: h2, note: 'Break of prior swing high' });
    if (ll) events.push({ type: 'BOS', dir: 'bearish', price: l2, note: 'Break of prior swing low' });

    return { bias, label, hh, hl, lh, ll, lastSwingHigh: h2, lastSwingLow: l2, events };
  }

  function analyze(candles, atrValue) {
    const swings = findSwings(candles, 3);
    const majors = findMajors(candles, Math.max(5, Math.floor(candles.length / 25)));
    const sr = supportResistance(candles, [...swings, ...majors], atrValue);
    const sd = supplyDemand(candles, atrValue);
    const fvg = fairValueGaps(candles);
    const ob = orderBlocks(candles, atrValue);
    const ext = extremes(candles, swings, majors);
    const structure = marketStructure(swings);

    return { swings, majors, sr, sd, fvg, ob, ext, structure };
  }

  return {
    findSwings, findMajors, supportResistance, supplyDemand,
    fairValueGaps, orderBlocks, extremes, marketStructure, analyze,
  };
})();
