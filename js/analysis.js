/**
 * Full analysis orchestrator — TA score, bias, narrative
 */
const Analysis = (() => {
  function scoreTechnical(ind, smc, vp, fib, candles) {
    const signals = [];
    let bull = 0, bear = 0;
    const L = ind.last;
    const price = L.close;

    // Trend EMAs
    if (L.ema9 != null && L.ema21 != null) {
      if (L.ema9 > L.ema21) { bull += 1.2; signals.push({ name: 'EMA 9/21', bias: 'bullish', detail: 'EMA9 above EMA21 (short-term up)' }); }
      else { bear += 1.2; signals.push({ name: 'EMA 9/21', bias: 'bearish', detail: 'EMA9 below EMA21 (short-term down)' }); }
    }
    if (L.ema21 != null && L.ema50 != null) {
      if (L.ema21 > L.ema50) { bull += 1.4; signals.push({ name: 'EMA 21/50', bias: 'bullish', detail: 'EMA21 > EMA50 (intermediate uptrend)' }); }
      else { bear += 1.4; signals.push({ name: 'EMA 21/50', bias: 'bearish', detail: 'EMA21 < EMA50 (intermediate downtrend)' }); }
    }
    if (L.ema50 != null && L.ema200 != null) {
      if (L.ema50 > L.ema200) { bull += 1.5; signals.push({ name: 'EMA 50/200', bias: 'bullish', detail: 'EMA50 > EMA200 (golden-cross regime)' }); }
      else { bear += 1.5; signals.push({ name: 'EMA 50/200', bias: 'bearish', detail: 'EMA50 < EMA200 (death-cross regime)' }); }
    } else if (L.ema50 != null) {
      if (price > L.ema50) { bull += 0.8; signals.push({ name: 'Price vs EMA50', bias: 'bullish', detail: 'Price above EMA50' }); }
      else { bear += 0.8; signals.push({ name: 'Price vs EMA50', bias: 'bearish', detail: 'Price below EMA50' }); }
    }

    // RSI
    if (L.rsi != null) {
      if (L.rsi > 70) { bear += 0.8; signals.push({ name: 'RSI', bias: 'bearish', detail: `RSI ${L.rsi.toFixed(1)} overbought` }); }
      else if (L.rsi < 30) { bull += 0.8; signals.push({ name: 'RSI', bias: 'bullish', detail: `RSI ${L.rsi.toFixed(1)} oversold` }); }
      else if (L.rsi >= 55) { bull += 0.4; signals.push({ name: 'RSI', bias: 'bullish', detail: `RSI ${L.rsi.toFixed(1)} bullish zone` }); }
      else if (L.rsi <= 45) { bear += 0.4; signals.push({ name: 'RSI', bias: 'bearish', detail: `RSI ${L.rsi.toFixed(1)} bearish zone` }); }
      else { signals.push({ name: 'RSI', bias: 'neutral', detail: `RSI ${L.rsi.toFixed(1)} neutral` }); }
    }

    // MACD
    if (L.macd != null && L.macdSignal != null) {
      if (L.macd > L.macdSignal && L.macdHist > 0) {
        bull += 1; signals.push({ name: 'MACD', bias: 'bullish', detail: 'MACD above signal, hist > 0' });
      } else if (L.macd < L.macdSignal && L.macdHist < 0) {
        bear += 1; signals.push({ name: 'MACD', bias: 'bearish', detail: 'MACD below signal, hist < 0' });
      } else {
        signals.push({ name: 'MACD', bias: 'neutral', detail: 'MACD mixed / crossing' });
      }
    }

    // Bollinger
    if (L.bbUpper != null && L.bbLower != null) {
      if (price > L.bbUpper) { bear += 0.5; signals.push({ name: 'Bollinger', bias: 'bearish', detail: 'Price above upper band (stretch)' }); }
      else if (price < L.bbLower) { bull += 0.5; signals.push({ name: 'Bollinger', bias: 'bullish', detail: 'Price below lower band (stretch)' }); }
      else if (L.bbMid != null) {
        if (price > L.bbMid) { bull += 0.3; signals.push({ name: 'Bollinger', bias: 'bullish', detail: 'Price above mid band' }); }
        else { bear += 0.3; signals.push({ name: 'Bollinger', bias: 'bearish', detail: 'Price below mid band' }); }
      }
    }

    // ADX / DI
    if (L.adx != null) {
      if (L.adx >= 25) {
        if (L.plusDI > L.minusDI) { bull += 1; signals.push({ name: 'ADX/DI', bias: 'bullish', detail: `ADX ${L.adx.toFixed(1)} trending, +DI > -DI` }); }
        else { bear += 1; signals.push({ name: 'ADX/DI', bias: 'bearish', detail: `ADX ${L.adx.toFixed(1)} trending, -DI > +DI` }); }
      } else {
        signals.push({ name: 'ADX', bias: 'neutral', detail: `ADX ${L.adx.toFixed(1)} — weak trend / range` });
      }
    }

    // Stoch
    if (L.stochK != null) {
      if (L.stochK > 80) { bear += 0.4; signals.push({ name: 'Stoch', bias: 'bearish', detail: `Stoch K ${L.stochK.toFixed(1)} overbought` }); }
      else if (L.stochK < 20) { bull += 0.4; signals.push({ name: 'Stoch', bias: 'bullish', detail: `Stoch K ${L.stochK.toFixed(1)} oversold` }); }
    }

    // Structure
    if (smc.structure.bias === 'bullish') { bull += 1.5; signals.push({ name: 'Structure', bias: 'bullish', detail: smc.structure.label }); }
    else if (smc.structure.bias === 'bearish') { bear += 1.5; signals.push({ name: 'Structure', bias: 'bearish', detail: smc.structure.label }); }
    else { signals.push({ name: 'Structure', bias: 'neutral', detail: smc.structure.label }); }

    // VP position
    if (vp) {
      if (price > vp.vah) { bull += 0.6; signals.push({ name: 'VP', bias: 'bullish', detail: 'Price above VAH (accepting higher)' }); }
      else if (price < vp.val) { bear += 0.6; signals.push({ name: 'VP', bias: 'bearish', detail: 'Price below VAL (accepting lower)' }); }
      else if (price > vp.poc) { bull += 0.3; signals.push({ name: 'VP', bias: 'bullish', detail: 'Price above POC inside value' }); }
      else { bear += 0.3; signals.push({ name: 'VP', bias: 'bearish', detail: 'Price below POC inside value' }); }
    }

    // Nearby demand/supply
    const nearDemand = smc.sd.demand.find(z => price >= z.bottom * 0.998 && price <= z.top * 1.005);
    const nearSupply = smc.sd.supply.find(z => price <= z.top * 1.002 && price >= z.bottom * 0.995);
    if (nearDemand) { bull += 0.7; signals.push({ name: 'Demand zone', bias: 'bullish', detail: 'Price interacting with demand zone' }); }
    if (nearSupply) { bear += 0.7; signals.push({ name: 'Supply zone', bias: 'bearish', detail: 'Price interacting with supply zone' }); }

    // Open FVG magnet
    const openFvg = smc.fvg.open.slice(-3);
    openFvg.forEach(f => {
      if (f.type === 'bullish' && price > f.top) {
        /* already above */
      } else if (f.type === 'bullish' && price < f.bottom) {
        signals.push({ name: 'FVG', bias: 'bullish', detail: 'Open bullish FVG below — potential support magnet' });
      } else if (f.type === 'bearish' && price > f.top) {
        signals.push({ name: 'FVG', bias: 'bearish', detail: 'Open bearish FVG above — potential resistance magnet' });
      }
    });

    const total = bull + bear || 1;
    const bullPct = (bull / total) * 100;
    const bearPct = (bear / total) * 100;
    let bias = 'neutral';
    if (bullPct >= 58) bias = 'bullish';
    else if (bearPct >= 58) bias = 'bearish';

    // Momentum of last N closes
    const n = Math.min(10, candles.length);
    const recent = candles.slice(-n).map(c => c.c);
    const mom = recent[recent.length - 1] - recent[0];
    const momPct = (mom / recent[0]) * 100;

    return {
      bull, bear, bullPct, bearPct, bias,
      signals,
      momentumPct: momPct,
      strength: Math.abs(bullPct - bearPct),
    };
  }

  function keyLevelsList(smc, vp, fib, ind, price) {
    const levels = [];

    (smc.sr.support || []).forEach(s => levels.push({
      price: s.price, label: 'Support', kind: 'support', meta: `${s.touches} touches`,
    }));
    (smc.sr.resistance || []).forEach(s => levels.push({
      price: s.price, label: 'Resistance', kind: 'resistance', meta: `${s.touches} touches`,
    }));
    (smc.sd.demand || []).forEach(z => levels.push({
      price: (z.top + z.bottom) / 2, label: 'Demand zone', kind: 'demand',
      meta: `${Utils.round(z.bottom, 6)} – ${Utils.round(z.top, 6)}`, top: z.top, bottom: z.bottom,
    }));
    (smc.sd.supply || []).forEach(z => levels.push({
      price: (z.top + z.bottom) / 2, label: 'Supply zone', kind: 'supply',
      meta: `${Utils.round(z.bottom, 6)} – ${Utils.round(z.top, 6)}`, top: z.top, bottom: z.bottom,
    }));
    (smc.ob.bullish || []).forEach(o => levels.push({
      price: (o.top + o.bottom) / 2, label: 'Bullish OB', kind: 'ob',
      meta: `${Utils.round(o.bottom, 6)} – ${Utils.round(o.top, 6)}`,
    }));
    (smc.ob.bearish || []).forEach(o => levels.push({
      price: (o.top + o.bottom) / 2, label: 'Bearish OB', kind: 'ob',
      meta: `${Utils.round(o.bottom, 6)} – ${Utils.round(o.top, 6)}`,
    }));
    (smc.fvg.open || []).forEach(f => levels.push({
      price: (f.top + f.bottom) / 2,
      label: (f.type === 'bullish' ? 'Bullish' : 'Bearish') + ' FVG',
      kind: 'fvg',
      meta: `${Utils.round(f.bottom, 6)} – ${Utils.round(f.top, 6)}`,
    }));

    if (vp) {
      levels.push({ price: vp.poc, label: 'POC', kind: 'poc', meta: 'Point of Control' });
      levels.push({ price: vp.vah, label: 'VAH', kind: 'poc', meta: 'Value Area High' });
      levels.push({ price: vp.val, label: 'VAL', kind: 'poc', meta: 'Value Area Low' });
    }

    if (fib && fib.levels) {
      fib.levels.filter(l => l.kind === 'retracement' && l.ratio !== 0 && l.ratio !== 1)
        .forEach(l => levels.push({
          price: l.price, label: `Fib ${l.label}`, kind: 'fib', meta: l.kind,
        }));
    }

    if (ind.pivots) {
      const p = ind.pivots;
      [['Pivot', p.p], ['R1', p.r1], ['R2', p.r2], ['S1', p.s1], ['S2', p.s2]].forEach(([lab, pr]) => {
        if (pr != null) levels.push({ price: pr, label: lab, kind: pr >= price ? 'resistance' : 'support', meta: 'Classic pivot' });
      });
    }

    // majors
    smc.ext.majorHighs.forEach(h => levels.push({ price: h.price, label: 'Major High', kind: 'swing', meta: Utils.fmtTime(h.t) }));
    smc.ext.majorLows.forEach(h => levels.push({ price: h.price, label: 'Major Low', kind: 'swing', meta: Utils.fmtTime(h.t) }));

    // sort by distance to price
    levels.forEach(l => { l.dist = Math.abs(l.price - price); l.distPct = (l.dist / price) * 100; });
    levels.sort((a, b) => a.dist - b.dist);
    return levels;
  }

  function buildNarrative(ctx) {
    const { asset, tf, candles, ind, smc, vp, fib, score, source } = ctx;
    const L = ind.last;
    const price = L.close;
    const first = candles[0].c;
    const chg = ((price - first) / first) * 100;
    const atr = L.atr;
    const atrPct = atr ? (atr / price) * 100 : null;

    const lines = [];
    lines.push(`${asset.display} on ${tf} closed at ${Utils.fmtPrice(price, asset)} (${Utils.fmtPct(chg)} over the loaded window).`);
    lines.push(`Market structure: ${smc.structure.label}. Composite bias: ${score.bias.toUpperCase()} (bull ${score.bullPct.toFixed(0)}% / bear ${score.bearPct.toFixed(0)}%).`);

    if (L.ema9 != null && L.ema21 != null && L.ema50 != null) {
      lines.push(`Trend stack — EMA9 ${Utils.fmtPrice(L.ema9, asset)}, EMA21 ${Utils.fmtPrice(L.ema21, asset)}, EMA50 ${Utils.fmtPrice(L.ema50, asset)}. Price is ${price >= L.ema21 ? 'above' : 'below'} EMA21.`);
    }
    if (L.rsi != null) {
      let rsiState = 'neutral';
      if (L.rsi >= 70) rsiState = 'overbought';
      else if (L.rsi <= 30) rsiState = 'oversold';
      else if (L.rsi >= 55) rsiState = 'bullish-leaning';
      else if (L.rsi <= 45) rsiState = 'bearish-leaning';
      lines.push(`RSI(14) at ${L.rsi.toFixed(1)} (${rsiState}).`);
    }
    if (L.macd != null) {
      lines.push(`MACD ${L.macd >= 0 ? 'positive' : 'negative'}; histogram ${L.macdHist >= 0 ? 'expanding bullish' : 'expanding bearish'} relative to signal.`);
    }
    if (atrPct != null) {
      lines.push(`ATR(14) ${Utils.fmtPrice(atr, asset)} (~${atrPct.toFixed(2)}% of price) — use for stop distance and zone width context.`);
    }

    // Zones
    if (smc.sd.demand.length) {
      const z = smc.sd.demand[0];
      lines.push(`Nearest demand zone ${Utils.fmtPrice(z.bottom, asset)} – ${Utils.fmtPrice(z.top, asset)}.`);
    }
    if (smc.sd.supply.length) {
      const z = smc.sd.supply[0];
      lines.push(`Nearest supply zone ${Utils.fmtPrice(z.bottom, asset)} – ${Utils.fmtPrice(z.top, asset)}.`);
    }
    if (smc.fvg.open.length) {
      lines.push(`${smc.fvg.open.length} unfilled FVG(s) on the chart — imbalances often act as magnets or reaction areas.`);
    }
    if (smc.ob.bullish.length || smc.ob.bearish.length) {
      lines.push(`Active order blocks: ${smc.ob.bullish.length} bullish, ${smc.ob.bearish.length} bearish (unmitigated).`);
    }

    // VP
    if (vp) {
      lines.push(`Fixed-range VP → POC ${Utils.fmtPrice(vp.poc, asset)}, VAH ${Utils.fmtPrice(vp.vah, asset)}, VAL ${Utils.fmtPrice(vp.val, asset)}. Price is ${price > vp.vah ? 'above value' : price < vp.val ? 'below value' : 'inside value area'}.`);
    }

    // Fib
    if (fib?.range) {
      lines.push(`Fibonacci anchored on ${fib.range.direction === 'up' ? 'bullish' : 'bearish'} leg ${Utils.fmtPrice(fib.range.low, asset)} → ${Utils.fmtPrice(fib.range.high, asset)}. Watch 38.2 / 50 / 61.8 for reactions.`);
    }

    // S/R nearest
    const nearS = smc.sr.support[0];
    const nearR = smc.sr.resistance[0];
    if (nearS) lines.push(`Closest support ~ ${Utils.fmtPrice(nearS.price, asset)} (${nearS.touches} touches).`);
    if (nearR) lines.push(`Closest resistance ~ ${Utils.fmtPrice(nearR.price, asset)} (${nearR.touches} touches).`);

    lines.push(`Data source: ${source}. Analysis is algorithmic and educational — not trade advice.`);
    return lines;
  }

  function run(payload) {
    const { candles, asset, tf, source, note } = payload;
    if (!candles || candles.length < 5) throw new Error('Not enough candles');

    const ind = Indicators.computeAll(candles);
    const atrVal = ind.last.atr || (candles[candles.length - 1].c * 0.005);
    const smc = SMC.analyze(candles, atrVal);
    const vp = VolumeProfile.fixedRange(candles);
    const fib = Fibonacci.compute(candles, smc.majors, smc.swings);
    const score = scoreTechnical(ind, smc, vp, fib, candles);
    const price = ind.last.close;
    const levels = keyLevelsList(smc, vp, fib, ind, price);
    const narrative = buildNarrative({ asset, tf, candles, ind, smc, vp, fib, score, source });

    // change stats
    const first = candles[0].c;
    const chg = price - first;
    const chgPct = (chg / first) * 100;
    const hi = Math.max(...candles.map(c => c.h));
    const lo = Math.min(...candles.map(c => c.l));

    return {
      candles, asset, tf, source, note, fetchedAt: payload.fetchedAt || Date.now(),
      ind, smc, vp, fib, score, levels, narrative,
      stats: {
        price, chg, chgPct, hi, lo,
        bars: candles.length,
        from: candles[0].t,
        to: candles[candles.length - 1].t,
        atr: ind.last.atr,
        volumeSum: candles.reduce((s, c) => s + (c.v || 0), 0),
      },
    };
  }

  return { run, scoreTechnical, keyLevelsList, buildNarrative };
})();
