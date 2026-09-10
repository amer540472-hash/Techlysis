/**
 * Fibonacci retracement & extension from swing high/low
 */
const Fibonacci = (() => {
  const RETRACEMENT = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const EXTENSION = [1.272, 1.414, 1.618, 2.0, 2.618];

  /**
   * Auto-detect swing range for fib:
   * Prefer major swing low→high (up move) or high→low (down move)
   * based on most recent significant leg.
   */
  function autoRange(candles, majors, swings) {
    const pts = (majors && majors.length >= 2) ? majors : swings;
    if (!pts || pts.length < 2 || !candles.length) {
      // fallback: range of last N bars
      const n = Math.min(50, candles.length);
      const slice = candles.slice(-n);
      let hiI = 0, loI = 0;
      for (let i = 0; i < slice.length; i++) {
        if (slice[i].h >= slice[hiI].h) hiI = i;
        if (slice[i].l <= slice[loI].l) loI = i;
      }
      const base = candles.length - n;
      return {
        high: slice[hiI].h,
        low: slice[loI].l,
        highI: base + hiI,
        lowI: base + loI,
        direction: hiI > loI ? 'up' : 'down',
      };
    }

    // last major high and low
    const highs = pts.filter(p => p.type === 'high');
    const lows = pts.filter(p => p.type === 'low');
    if (!highs.length || !lows.length) {
      return autoRange(candles, null, null);
    }
    const lastH = highs[highs.length - 1];
    const lastL = lows[lows.length - 1];

    // direction of most recent leg
    let direction, high, low, highI, lowI;
    if (lastH.i > lastL.i) {
      // up leg into last high — find swing low before it
      const priorLows = lows.filter(l => l.i < lastH.i);
      const anchor = priorLows.length ? priorLows[priorLows.length - 1] : lastL;
      direction = 'up';
      high = lastH.price; highI = lastH.i;
      low = anchor.price; lowI = anchor.i;
    } else {
      const priorHighs = highs.filter(h => h.i < lastL.i);
      const anchor = priorHighs.length ? priorHighs[priorHighs.length - 1] : lastH;
      direction = 'down';
      high = anchor.price; highI = anchor.i;
      low = lastL.price; lowI = lastL.i;
    }

    if (high <= low) {
      return autoRange(candles, null, null);
    }
    return { high, low, highI, lowI, direction };
  }

  function levelsFromRange(range) {
    if (!range) return [];
    const { high, low, direction } = range;
    const diff = high - low;
    const levels = [];

    // Retracements: for up move, 0 at high, 1 at low (pullback down)
    // Common drawing: fib from swing low (0) to swing high (1) for uptrend
    if (direction === 'up') {
      // 0 = low (start), 1 = high (end) — retracement measures pullback from high
      for (const r of RETRACEMENT) {
        // price at retracement r from high toward low
        const price = high - diff * r;
        levels.push({
          ratio: r,
          price,
          kind: 'retracement',
          label: (r * 100).toFixed(1).replace(/\.0$/, '') + '%',
        });
      }
      for (const r of EXTENSION) {
        // extension above high
        const price = low + diff * r;
        levels.push({
          ratio: r,
          price,
          kind: 'extension',
          label: (r * 100).toFixed(1).replace(/\.0$/, '') + '% ext',
        });
      }
    } else {
      // down move: 0 at high, retracement back up toward high
      for (const r of RETRACEMENT) {
        const price = low + diff * r;
        levels.push({
          ratio: r,
          price,
          kind: 'retracement',
          label: (r * 100).toFixed(1).replace(/\.0$/, '') + '%',
        });
      }
      for (const r of EXTENSION) {
        const price = high - diff * r;
        levels.push({
          ratio: r,
          price,
          kind: 'extension',
          label: (r * 100).toFixed(1).replace(/\.0$/, '') + '% ext',
        });
      }
    }

    return levels.sort((a, b) => b.price - a.price);
  }

  function compute(candles, majors, swings) {
    const range = autoRange(candles, majors, swings);
    const levels = levelsFromRange(range);
    return { range, levels };
  }

  return { RETRACEMENT, EXTENSION, autoRange, levelsFromRange, compute };
})();
