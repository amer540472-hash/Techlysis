/**
 * Canvas chart engine — candles + all overlays + subcharts
 */
const ChartEngine = (() => {
  let state = {
    analysis: null,
    overlays: {},
    showCrosshair: true,
    showGrid: true,
    // view
    startI: 0,
    endI: 0,
    // interaction
    hoverI: null,
    mouse: null,
    dragging: false,
    dragStartX: 0,
    dragStartI: 0,
    priceOffset: 0, // manual pan Y unused for now
  };

  const els = {};

  function init() {
    els.wrap = document.getElementById('chartWrap');
    els.main = document.getElementById('mainChart');
    els.overlay = document.getElementById('overlayChart');
    els.vol = document.getElementById('volumeChart');
    els.ind = document.getElementById('indicatorChart');
    els.sub = document.getElementById('subchartWrap');
    els.tooltip = document.getElementById('tooltip');
    els.legend = document.getElementById('legend');
    els.ohlc = document.getElementById('ohlcReadout');

    // default overlays
    CONFIG.overlays.forEach(o => { state.overlays[o.id] = o.default; });

    window.addEventListener('resize', Utils.debounce(() => draw(), 100));
    bindInteractions();
  }

  function setOverlays(map) {
    Object.assign(state.overlays, map);
    draw();
  }

  function setFlags({ crosshair, grid } = {}) {
    if (crosshair != null) state.showCrosshair = crosshair;
    if (grid != null) state.showGrid = grid;
    draw();
  }

  function setAnalysis(analysis) {
    state.analysis = analysis;
    if (analysis?.candles?.length) {
      state.endI = analysis.candles.length - 1;
      state.startI = Math.max(0, state.endI - Math.min(120, analysis.candles.length) + 1);
    }
    draw();
    updateLegend();
  }

  function fit() {
    if (!state.analysis) return;
    state.startI = 0;
    state.endI = state.analysis.candles.length - 1;
    draw();
  }

  function resetZoom() {
    if (!state.analysis) return;
    const n = state.analysis.candles.length;
    state.endI = n - 1;
    state.startI = Math.max(0, n - 120);
    draw();
  }

  // ── geometry ────────────────────────────────────────────
  function sizeCanvas(canvas, cssW, cssH) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function layout() {
    const wr = els.wrap.getBoundingClientRect();
    const sr = els.sub.getBoundingClientRect();
    return {
      mainW: wr.width,
      mainH: wr.height,
      subW: sr.width,
      subH: sr.height,
    };
  }

  function visibleCandles() {
    const c = state.analysis.candles;
    const a = Utils.clamp(state.startI, 0, c.length - 1);
    const b = Utils.clamp(state.endI, a, c.length - 1);
    return { candles: c.slice(a, b + 1), startI: a, endI: b };
  }

  function priceRange(vis, padPct = 0.08) {
    const { analysis, overlays } = state;
    let hi = -Infinity, lo = Infinity;
    vis.candles.forEach(c => { hi = Math.max(hi, c.h); lo = Math.min(lo, c.l); });

    // include overlay extremes so lines aren't clipped
    const push = (v) => { if (v != null && Number.isFinite(v)) { hi = Math.max(hi, v); lo = Math.min(lo, v); } };

    if (overlays.bb && analysis.ind.bb) {
      for (let i = vis.startI; i <= vis.endI; i++) {
        push(analysis.ind.bb.upper[i]); push(analysis.ind.bb.lower[i]);
      }
    }
    ['ema9', 'ema21', 'ema50', 'ema200'].forEach(k => {
      if (overlays[k] && analysis.ind[k]) {
        for (let i = vis.startI; i <= vis.endI; i++) push(analysis.ind[k][i]);
      }
    });
    if (overlays.vp && analysis.vp) {
      push(analysis.vp.hi); push(analysis.vp.lo);
    }
    if (overlays.fib && analysis.fib?.levels) {
      analysis.fib.levels.forEach(l => push(l.price));
    }

    if (!Number.isFinite(hi) || !Number.isFinite(lo) || hi === lo) {
      const p = vis.candles[0]?.c || 1;
      hi = p * 1.01; lo = p * 0.99;
    }
    const pad = (hi - lo) * padPct;
    return { hi: hi + pad, lo: lo - pad };
  }

  function makeScale(lay, vis) {
    const cfg = CONFIG.chart;
    const plotW = lay.mainW - cfg.padL - cfg.padR;
    const plotH = lay.mainH - cfg.padT - cfg.padB;
    const n = vis.candles.length || 1;
    const slot = plotW / n;
    const pr = priceRange(vis);
    const yAt = (price) => cfg.padT + ((pr.hi - price) / (pr.hi - pr.lo)) * plotH;
    const xAt = (iLocal) => cfg.padL + (iLocal + 0.5) * slot;
    const priceAtY = (y) => pr.hi - ((y - cfg.padT) / plotH) * (pr.hi - pr.lo);
    const iAtX = (x) => Utils.clamp(Math.floor((x - cfg.padL) / slot), 0, n - 1);
    return { plotW, plotH, slot, pr, yAt, xAt, priceAtY, iAtX, cfg, n };
  }

  // ── drawing primitives ──────────────────────────────────
  function drawGrid(ctx, lay, scale) {
    if (!state.showGrid) return;
    const { cfg, pr, yAt, plotW, plotH } = scale;
    ctx.save();
    ctx.strokeStyle = CONFIG.colors.grid;
    ctx.lineWidth = 1;
    ctx.fillStyle = CONFIG.colors.text;
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'left';

    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const p = pr.lo + (pr.hi - pr.lo) * (i / steps);
      const y = yAt(p);
      ctx.beginPath();
      ctx.moveTo(cfg.padL, y);
      ctx.lineTo(cfg.padL + plotW, y);
      ctx.stroke();
      const asset = state.analysis.asset;
      ctx.fillText(Utils.fmtPrice(p, asset), cfg.padL + plotW + 6, y + 3);
    }

    // vertical time grid
    const vis = visibleCandles();
    const stepX = Math.max(1, Math.floor(vis.candles.length / 6));
    ctx.textAlign = 'center';
    for (let i = 0; i < vis.candles.length; i += stepX) {
      const x = scale.xAt(i);
      ctx.beginPath();
      ctx.moveTo(x, cfg.padT);
      ctx.lineTo(x, cfg.padT + plotH);
      ctx.stroke();
      const t = vis.candles[i].t;
      ctx.fillText(Utils.fmtTime(t).split(',').pop().trim(), x, lay.mainH - 8);
    }
    ctx.restore();
  }

  function drawCandles(ctx, vis, scale) {
    const { slot, yAt, xAt } = scale;
    const bodyW = Math.max(1, slot * (1 - CONFIG.chart.candleGap));
    vis.candles.forEach((c, i) => {
      const x = xAt(i);
      const bull = c.c >= c.o;
      const col = bull ? CONFIG.colors.bull : CONFIG.colors.bear;
      const yO = yAt(c.o), yC = yAt(c.c), yH = yAt(c.h), yL = yAt(c.l);
      // wick
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1, bodyW * 0.15);
      ctx.beginPath();
      ctx.moveTo(x, yH);
      ctx.lineTo(x, yL);
      ctx.stroke();
      // body
      const top = Math.min(yO, yC);
      const h = Math.max(1, Math.abs(yC - yO));
      ctx.fillStyle = col;
      ctx.fillRect(x - bodyW / 2, top, bodyW, h);
    });
  }

  function drawLineSeries(ctx, series, vis, scale, color, width = 1.5) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < vis.candles.length; i++) {
      const gi = vis.startI + i;
      const v = series[gi];
      if (v == null || Number.isNaN(v)) { started = false; continue; }
      const x = scale.xAt(i), y = scale.yAt(v);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawBB(ctx, vis, scale) {
    const bb = state.analysis.ind.bb;
    drawLineSeries(ctx, bb.upper, vis, scale, 'rgba(92,107,127,0.9)', 1);
    drawLineSeries(ctx, bb.mid, vis, scale, 'rgba(92,107,127,0.7)', 1);
    drawLineSeries(ctx, bb.lower, vis, scale, 'rgba(92,107,127,0.9)', 1);
    // fill
    ctx.save();
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < vis.candles.length; i++) {
      const gi = vis.startI + i;
      const v = bb.upper[gi];
      if (v == null) { started = false; continue; }
      const x = scale.xAt(i), y = scale.yAt(v);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    for (let i = vis.candles.length - 1; i >= 0; i--) {
      const gi = vis.startI + i;
      const v = bb.lower[gi];
      if (v == null) continue;
      ctx.lineTo(scale.xAt(i), scale.yAt(v));
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(92,107,127,0.08)';
    ctx.fill();
    ctx.restore();
  }

  function hline(ctx, price, scale, color, label, dash = []) {
    const y = scale.yAt(price);
    if (y < scale.cfg.padT || y > scale.cfg.padT + scale.plotH) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(scale.cfg.padL, y);
    ctx.lineTo(scale.cfg.padL + scale.plotW, y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (label) {
      ctx.fillStyle = color;
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      const asset = state.analysis.asset;
      ctx.fillText(`${label} ${Utils.fmtPrice(price, asset)}`, scale.cfg.padL + 4, y - 3);
    }
    ctx.restore();
  }

  function drawZone(ctx, top, bottom, startI, endI, vis, scale, fill, stroke) {
    const y1 = scale.yAt(top);
    const y2 = scale.yAt(bottom);
    const i0 = Math.max(startI, vis.startI);
    const i1 = Math.min(endI != null ? endI : vis.endI, vis.endI);
    // extend zone to right edge for active zones
    const x0 = scale.xAt(Math.max(0, i0 - vis.startI)) - scale.slot * 0.4;
    const x1 = scale.cfg.padL + scale.plotW;
    const topY = Math.min(y1, y2);
    const h = Math.abs(y2 - y1);
    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.fillRect(x0, topY, x1 - x0, Math.max(2, h));
    ctx.strokeRect(x0, topY, x1 - x0, Math.max(2, h));
    ctx.restore();
  }

  function drawSwings(ctx, swings, vis, scale, color) {
    ctx.save();
    swings.forEach(s => {
      if (s.i < vis.startI || s.i > vis.endI) return;
      const x = scale.xAt(s.i - vis.startI);
      const y = scale.yAt(s.price);
      ctx.fillStyle = color;
      ctx.beginPath();
      if (s.type === 'high') {
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x - 5, y + 2);
        ctx.lineTo(x + 5, y + 2);
      } else {
        ctx.moveTo(x, y + 6);
        ctx.lineTo(x - 5, y - 2);
        ctx.lineTo(x + 5, y - 2);
      }
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
  }

  function drawVP(ctx, vp, scale) {
    if (!vp) return;
    const maxW = scale.plotW * 0.22;
    const baseX = scale.cfg.padL + scale.plotW - maxW;
    ctx.save();
    vp.profile.forEach((bin) => {
      const y1 = scale.yAt(bin.high);
      const y2 = scale.yAt(bin.low);
      const h = Math.max(1, Math.abs(y2 - y1) - 1);
      const w = (bin.volume / vp.maxBinVol) * maxW;
      const isVA = bin.i >= vp.valIdx && bin.i <= vp.vahIdx;
      const isPOC = bin.i === vp.pocIdx;
      ctx.fillStyle = isPOC
        ? 'rgba(34,211,238,0.55)'
        : isVA
          ? 'rgba(61,156,240,0.28)'
          : 'rgba(61,156,240,0.12)';
      ctx.fillRect(baseX + (maxW - w), Math.min(y1, y2), w, h);
    });
    ctx.restore();

    if (state.overlays.poc) hline(ctx, vp.poc, scale, '#22d3ee', 'POC', [4, 3]);
    if (state.overlays.vahval) {
      hline(ctx, vp.vah, scale, '#a3e635', 'VAH', [2, 3]);
      hline(ctx, vp.val, scale, '#a3e635', 'VAL', [2, 3]);
    }
  }

  function drawFib(ctx, fib, scale) {
    if (!fib?.levels) return;
    const colors = {
      0: '#8b97a8', 0.236: '#60a5fa', 0.382: '#a78bfa', 0.5: '#f59e0b',
      0.618: '#f97316', 0.786: '#ec4899', 1: '#8b97a8',
    };
    fib.levels.filter(l => l.kind === 'retracement').forEach(l => {
      const col = colors[l.ratio] || '#f59e0b';
      hline(ctx, l.price, scale, col, `Fib ${l.label}`, [6, 4]);
    });
  }

  function drawOverlaysMain(ctx, lay, vis, scale) {
    const A = state.analysis;
    const O = state.overlays;

    // zones first (behind)
    if (O.demand && A.smc.sd.demand) {
      A.smc.sd.demand.forEach(z =>
        drawZone(ctx, z.top, z.bottom, z.startI, vis.endI, vis, scale,
          'rgba(34,197,94,0.15)', 'rgba(34,197,94,0.5)')
      );
    }
    if (O.supply && A.smc.sd.supply) {
      A.smc.sd.supply.forEach(z =>
        drawZone(ctx, z.top, z.bottom, z.startI, vis.endI, vis, scale,
          'rgba(239,68,68,0.15)', 'rgba(239,68,68,0.5)')
      );
    }
    if (O.fvg && A.smc.fvg.open) {
      A.smc.fvg.open.forEach(f => {
        const fill = f.type === 'bullish' ? 'rgba(167,139,250,0.18)' : 'rgba(236,72,153,0.15)';
        const stroke = f.type === 'bullish' ? 'rgba(167,139,250,0.6)' : 'rgba(236,72,153,0.5)';
        drawZone(ctx, f.top, f.bottom, f.i, vis.endI, vis, scale, fill, stroke);
      });
    }
    if (O.orderblock) {
      (A.smc.ob.bullish || []).forEach(o =>
        drawZone(ctx, o.top, o.bottom, o.i, vis.endI, vis, scale,
          'rgba(34,197,94,0.2)', 'rgba(251,146,60,0.7)')
      );
      (A.smc.ob.bearish || []).forEach(o =>
        drawZone(ctx, o.top, o.bottom, o.i, vis.endI, vis, scale,
          'rgba(239,68,68,0.2)', 'rgba(251,146,60,0.7)')
      );
    }

    if (O.vp) drawVP(ctx, A.vp, scale);

    if (O.bb) drawBB(ctx, vis, scale);
    if (O.ema9) drawLineSeries(ctx, A.ind.ema9, vis, scale, '#22d3ee', 1.4);
    if (O.ema21) drawLineSeries(ctx, A.ind.ema21, vis, scale, '#a78bfa', 1.4);
    if (O.ema50) drawLineSeries(ctx, A.ind.ema50, vis, scale, '#f59e0b', 1.6);
    if (O.ema200) drawLineSeries(ctx, A.ind.ema200, vis, scale, '#ec4899', 1.8);
    if (O.sma20) drawLineSeries(ctx, A.ind.sma20, vis, scale, '#86efac', 1.2);
    if (O.vwap) drawLineSeries(ctx, A.ind.vwap, vis, scale, '#fb923c', 1.4);

    if (O.candles) drawCandles(ctx, vis, scale);

    if (O.support) {
      (A.smc.sr.support || []).slice(0, 5).forEach(s =>
        hline(ctx, s.price, scale, 'rgba(34,197,94,0.75)', 'S', [4, 4])
      );
    }
    if (O.resistance) {
      (A.smc.sr.resistance || []).slice(0, 5).forEach(s =>
        hline(ctx, s.price, scale, 'rgba(239,68,68,0.75)', 'R', [4, 4])
      );
    }

    if (O.fib) drawFib(ctx, A.fib, scale);

    if (O.swings) drawSwings(ctx, A.smc.swings, vis, scale, '#ec4899');
    if (O.majors) drawSwings(ctx, A.smc.majors, vis, scale, '#f59e0b');

    // last price line
    const last = A.stats.price;
    hline(ctx, last, scale, 'rgba(230,237,247,0.55)', '', [2, 2]);
  }

  function drawVolume(ctx, lay, vis) {
    const W = lay.subW, H = lay.subH;
    ctx.clearRect(0, 0, W, H);
    if (!state.overlays.volume && !state.overlays.rsi && !state.overlays.macd) {
      // still draw empty bg
    }
    const padL = CONFIG.chart.padL, padR = CONFIG.chart.padR, padT = 8, padB = 4;
    const plotW = W - padL - padR;
    const n = vis.candles.length || 1;
    const slot = plotW / n;

    // split subchart: volume top half if volume on, indicator bottom
    const showVol = state.overlays.volume;
    const showRsi = state.overlays.rsi;
    const showMacd = state.overlays.macd && !showRsi; // prefer RSI if both

    let volH = 0, indH = 0, indTop = padT;
    if (showVol && (showRsi || showMacd)) {
      volH = (H - padT - padB) * 0.4;
      indH = (H - padT - padB) * 0.55;
      indTop = padT + volH + 4;
    } else if (showVol) {
      volH = H - padT - padB;
    } else {
      indH = H - padT - padB;
      indTop = padT;
    }

    if (showVol) {
      const maxV = Math.max(...vis.candles.map(c => c.v || 0), 1);
      vis.candles.forEach((c, i) => {
        const x = padL + (i + 0.5) * slot;
        const h = ((c.v || 0) / maxV) * volH;
        const bull = c.c >= c.o;
        ctx.fillStyle = bull ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)';
        const bw = Math.max(1, slot * 0.7);
        ctx.fillRect(x - bw / 2, padT + volH - h, bw, h);
      });
      ctx.fillStyle = CONFIG.colors.text;
      ctx.font = '10px sans-serif';
      ctx.fillText('Volume', padL, 10);
    }

    if (showRsi) {
      const rsi = state.analysis.ind.rsi14;
      const yAt = (v) => indTop + ((100 - v) / 100) * indH;
      // bands
      ctx.fillStyle = 'rgba(239,68,68,0.06)';
      ctx.fillRect(padL, yAt(100), plotW, yAt(70) - yAt(100));
      ctx.fillStyle = 'rgba(34,197,94,0.06)';
      ctx.fillRect(padL, yAt(30), plotW, yAt(0) - yAt(30));
      ctx.strokeStyle = 'rgba(92,107,127,0.5)';
      ctx.setLineDash([3, 3]);
      [70, 50, 30].forEach(lv => {
        ctx.beginPath();
        ctx.moveTo(padL, yAt(lv));
        ctx.lineTo(padL + plotW, yAt(lv));
        ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i++) {
        const v = rsi[vis.startI + i];
        if (v == null) { started = false; continue; }
        const x = padL + (i + 0.5) * slot;
        const y = yAt(v);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = '#a78bfa';
      ctx.font = '10px sans-serif';
      ctx.fillText('RSI 14', padL, indTop + 10);
      const last = state.analysis.ind.last.rsi;
      if (last != null) {
        ctx.textAlign = 'left';
        ctx.fillText(last.toFixed(1), padL + plotW + 6, yAt(last) + 3);
      }
    } else if (showMacd) {
      const m = state.analysis.ind.macd;
      let hi = 0, lo = 0;
      for (let i = vis.startI; i <= vis.endI; i++) {
        [m.macd[i], m.signal[i], m.hist[i]].forEach(v => {
          if (v != null) { hi = Math.max(hi, v); lo = Math.min(lo, v); }
        });
      }
      if (hi === lo) { hi = 1; lo = -1; }
      const pad = (hi - lo) * 0.1;
      hi += pad; lo -= pad;
      const yAt = (v) => indTop + ((hi - v) / (hi - lo)) * indH;
      // hist
      for (let i = 0; i < n; i++) {
        const v = m.hist[vis.startI + i];
        if (v == null) continue;
        const x = padL + (i + 0.5) * slot;
        const y0 = yAt(0), y1 = yAt(v);
        ctx.fillStyle = v >= 0 ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)';
        ctx.fillRect(x - slot * 0.3, Math.min(y0, y1), slot * 0.6, Math.abs(y1 - y0) || 1);
      }
      const strokeSeries = (series, col) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < n; i++) {
          const v = series[vis.startI + i];
          if (v == null) { started = false; continue; }
          const x = padL + (i + 0.5) * slot;
          const y = yAt(v);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };
      strokeSeries(m.macd, '#3d9cf0');
      strokeSeries(m.signal, '#f59e0b');
      ctx.fillStyle = '#3d9cf0';
      ctx.font = '10px sans-serif';
      ctx.fillText('MACD', padL, indTop + 10);
    }
  }

  function drawCrosshair(ctx, lay, vis, scale) {
    if (!state.showCrosshair || !state.mouse) return;
    const { x, y } = state.mouse;
    if (x < scale.cfg.padL || x > scale.cfg.padL + scale.plotW) return;
    ctx.save();
    ctx.strokeStyle = CONFIG.colors.crosshair;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, scale.cfg.padT);
    ctx.lineTo(x, scale.cfg.padT + scale.plotH);
    ctx.moveTo(scale.cfg.padL, y);
    ctx.lineTo(scale.cfg.padL + scale.plotW, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // price tag
    const price = scale.priceAtY(y);
    ctx.fillStyle = '#1a2030';
    ctx.strokeStyle = '#3d9cf0';
    const label = Utils.fmtPrice(price, state.analysis.asset);
    ctx.font = '11px JetBrains Mono, monospace';
    const tw = ctx.measureText(label).width + 10;
    ctx.fillRect(scale.cfg.padL + scale.plotW + 2, y - 9, tw, 18);
    ctx.strokeRect(scale.cfg.padL + scale.plotW + 2, y - 9, tw, 18);
    ctx.fillStyle = '#e6edf7';
    ctx.textAlign = 'left';
    ctx.fillText(label, scale.cfg.padL + scale.plotW + 6, y + 4);
    ctx.restore();
  }

  function updateTooltip(vis, scale) {
    if (!state.mouse || state.hoverI == null || !state.analysis) {
      els.tooltip.classList.add('hidden');
      return;
    }
    const i = state.hoverI;
    const c = vis.candles[i];
    if (!c) { els.tooltip.classList.add('hidden'); return; }
    const bull = c.c >= c.o;
    const chg = ((c.c - c.o) / c.o) * 100;
    const asset = state.analysis.asset;
    els.tooltip.innerHTML = `
      <div style="color:var(--accent);margin-bottom:4px">${Utils.fmtTime(c.t)}</div>
      <div class="t-row"><span class="t-label">O</span><span>${Utils.fmtPrice(c.o, asset)}</span></div>
      <div class="t-row"><span class="t-label">H</span><span>${Utils.fmtPrice(c.h, asset)}</span></div>
      <div class="t-row"><span class="t-label">L</span><span>${Utils.fmtPrice(c.l, asset)}</span></div>
      <div class="t-row"><span class="t-label">C</span><span class="${bull ? 'up' : 'dn'}">${Utils.fmtPrice(c.c, asset)}</span></div>
      <div class="t-row"><span class="t-label">Δ</span><span class="${bull ? 'up' : 'dn'}">${Utils.fmtPct(chg)}</span></div>
      <div class="t-row"><span class="t-label">V</span><span>${Utils.fmt(c.v, 0)}</span></div>
    `;
    els.tooltip.classList.remove('hidden');
    const wr = els.wrap.getBoundingClientRect();
    let left = state.mouse.x + 16;
    let top = state.mouse.y + 16;
    if (left > wr.width - 180) left = state.mouse.x - 170;
    if (top > wr.height - 120) top = state.mouse.y - 110;
    els.tooltip.style.left = left + 'px';
    els.tooltip.style.top = top + 'px';

    // ohlc strip
    els.ohlc.textContent =
      `O ${Utils.fmtPrice(c.o, asset)}  H ${Utils.fmtPrice(c.h, asset)}  L ${Utils.fmtPrice(c.l, asset)}  C ${Utils.fmtPrice(c.c, asset)}`;
  }

  function updateLegend() {
    if (!state.analysis || !els.legend) return;
    const items = [];
    const O = state.overlays;
    const add = (id, label, color) => {
      if (O[id]) items.push(`<span style="color:${color}">${label}</span>`);
    };
    add('ema9', 'EMA9', '#22d3ee');
    add('ema21', 'EMA21', '#a78bfa');
    add('ema50', 'EMA50', '#f59e0b');
    add('ema200', 'EMA200', '#ec4899');
    add('sma20', 'SMA20', '#86efac');
    add('bb', 'BB', '#5c6b7f');
    add('vwap', 'VWAP', '#fb923c');
    add('vp', 'VP', '#3d9cf0');
    add('fib', 'Fib', '#f59e0b');
    els.legend.innerHTML = items.join('');
  }

  function draw() {
    if (!els.main) return;
    const lay = layout();
    const ctx = sizeCanvas(els.main, lay.mainW, lay.mainH);
    const octx = sizeCanvas(els.overlay, lay.mainW, lay.mainH);
    const vctx = sizeCanvas(els.vol, lay.subW, lay.subH);
    sizeCanvas(els.ind, lay.subW, lay.subH); // clear

    ctx.fillStyle = CONFIG.colors.bg;
    ctx.fillRect(0, 0, lay.mainW, lay.mainH);

    if (!state.analysis) {
      ctx.fillStyle = CONFIG.colors.text;
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Load an asset to render the chart', lay.mainW / 2, lay.mainH / 2);
      return;
    }

    const vis = visibleCandles();
    const scale = makeScale(lay, vis);

    drawGrid(ctx, lay, scale);
    drawOverlaysMain(ctx, lay, vis, scale);
    drawVolume(vctx, lay, vis);

    // crosshair on overlay canvas
    octx.clearRect(0, 0, lay.mainW, lay.mainH);
    drawCrosshair(octx, lay, vis, scale);
    updateTooltip(vis, scale);
    updateLegend();
  }

  // ── interactions ────────────────────────────────────────
  function bindInteractions() {
    const wrap = els.wrap;

    wrap.addEventListener('mousemove', (e) => {
      const rect = wrap.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      state.mouse = { x, y };

      if (state.dragging && state.analysis) {
        const lay = layout();
        const visN = state.endI - state.startI + 1;
        const plotW = lay.mainW - CONFIG.chart.padL - CONFIG.chart.padR;
        const slot = plotW / visN;
        const dx = x - state.dragStartX;
        const shift = Math.round(-dx / slot);
        const n = state.analysis.candles.length;
        let s = state.dragStartI + shift;
        let en = s + visN - 1;
        if (s < 0) { en -= s; s = 0; }
        if (en > n - 1) { s -= (en - (n - 1)); en = n - 1; }
        s = Math.max(0, s);
        state.startI = s;
        state.endI = en;
        draw();
        return;
      }

      if (state.analysis) {
        const lay = layout();
        const vis = visibleCandles();
        const scale = makeScale(lay, vis);
        state.hoverI = scale.iAtX(x);
        draw();
      }
    });

    wrap.addEventListener('mouseleave', () => {
      state.mouse = null;
      state.hoverI = null;
      state.dragging = false;
      els.tooltip.classList.add('hidden');
      draw();
    });

    wrap.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      state.dragging = true;
      const rect = wrap.getBoundingClientRect();
      state.dragStartX = e.clientX - rect.left;
      state.dragStartI = state.startI;
      wrap.style.cursor = 'grabbing';
    });

    window.addEventListener('mouseup', () => {
      state.dragging = false;
      if (els.wrap) els.wrap.style.cursor = 'crosshair';
    });

    wrap.addEventListener('wheel', (e) => {
      if (!state.analysis) return;
      e.preventDefault();
      const n = state.analysis.candles.length;
      let len = state.endI - state.startI + 1;
      const rect = wrap.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const lay = layout();
      const plotW = lay.mainW - CONFIG.chart.padL - CONFIG.chart.padR;
      const frac = Utils.clamp((x - CONFIG.chart.padL) / plotW, 0, 1);
      const anchor = state.startI + frac * (len - 1);

      if (e.deltaY < 0) len = Math.max(20, Math.floor(len * 0.85));
      else len = Math.min(n, Math.ceil(len * 1.15));

      let s = Math.round(anchor - frac * (len - 1));
      let en = s + len - 1;
      if (s < 0) { en -= s; s = 0; }
      if (en > n - 1) { s -= (en - (n - 1)); en = n - 1; }
      state.startI = Math.max(0, s);
      state.endI = Math.min(n - 1, en);
      draw();
    }, { passive: false });

    // double-click fit
    wrap.addEventListener('dblclick', () => fit());
  }

  return {
    init, setAnalysis, setOverlays, setFlags, fit, resetZoom, draw,
    getOverlays: () => ({ ...state.overlays }),
  };
})();
