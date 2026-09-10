/**
 * Written report renderer — full / TA / SMC / VP / Fund / Levels
 */
const Report = (() => {
  let current = null;
  let activeTab = 'full';

  function init() {
    document.querySelectorAll('.report-tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.report-tabs .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeTab = tab.dataset.tab;
        if (current) render(current);
      });
    });

    document.getElementById('copyReportBtn')?.addEventListener('click', async () => {
      if (!current) return;
      const text = toPlainText(current);
      const ok = await Utils.copyText(text);
      const btn = document.getElementById('copyReportBtn');
      const prev = btn.textContent;
      btn.textContent = ok ? 'Copied!' : 'Failed';
      setTimeout(() => { btn.textContent = prev; }, 1500);
    });

    document.getElementById('printReportBtn')?.addEventListener('click', () => {
      window.print();
    });
  }

  function setLoading(msg) {
    const body = document.getElementById('reportBody');
    body.innerHTML = `
      <div class="loading-report">
        <div class="spinner"></div>
        <div>${msg || 'Analyzing…'}</div>
      </div>`;
  }

  function setError(err) {
    const body = document.getElementById('reportBody');
    body.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" style="color:var(--red)">!</div>
        <h2>Analysis failed</h2>
        <p>${escapeHtml(String(err.message || err))}</p>
      </div>`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function pill(kind, text) {
    return `<span class="pill ${kind}">${escapeHtml(text)}</span>`;
  }

  function kv(k, v, cls = '') {
    return `<div class="kv"><div class="k">${k}</div><div class="v ${cls}">${v}</div></div>`;
  }

  function section(title, html) {
    return `<div class="report-section"><h2>${title}</h2>${html}</div>`;
  }

  function biasClass(b) {
    if (b === 'bullish') return 'bull';
    if (b === 'bearish') return 'bear';
    return 'neutral';
  }

  function summaryBlock(A) {
    const s = A.score;
    const st = A.stats;
    const asset = A.asset;
    return `
      <div class="summary-card">
        <div class="bias ${biasClass(s.bias)}">
          ${s.bias === 'bullish' ? '▲' : s.bias === 'bearish' ? '▼' : '◆'}
          ${s.bias.toUpperCase()} BIAS
          <span class="muted" style="font-weight:500;font-size:12px;margin-left:6px">
            strength ${s.strength.toFixed(0)}
          </span>
        </div>
        <p style="color:var(--text-dim);font-size:13px;margin-bottom:8px">
          ${escapeHtml(asset.display)} · ${escapeHtml(A.tf)} · ${A.stats.bars} bars · source <strong style="color:var(--cyan)">${escapeHtml(A.source)}</strong>
        </p>
        <div class="signal-bar">
          <div class="bull-part" style="width:${s.bullPct}%"></div>
          <div class="bear-part" style="width:${s.bearPct}%"></div>
        </div>
        <div class="score-row">
          <span style="color:var(--bull)">Bull ${s.bullPct.toFixed(0)}%</span>
          <span style="color:var(--bear)">Bear ${s.bearPct.toFixed(0)}%</span>
        </div>
        <div class="kv-grid" style="margin-top:12px">
          ${kv('Last', Utils.fmtPrice(st.price, asset), st.chg >= 0 ? 'up' : 'dn')}
          ${kv('Change', Utils.fmtPct(st.chgPct), st.chg >= 0 ? 'up' : 'dn')}
          ${kv('Range High', Utils.fmtPrice(st.hi, asset))}
          ${kv('Range Low', Utils.fmtPrice(st.lo, asset))}
          ${kv('ATR(14)', Utils.fmtPrice(st.atr, asset))}
          ${kv('Momentum(10)', Utils.fmtPct(s.momentumPct), s.momentumPct >= 0 ? 'up' : 'dn')}
        </div>
        ${A.note ? `<div class="note">${escapeHtml(A.note)}</div>` : ''}
      </div>`;
  }

  function narrativeBlock(A) {
    return section('Executive Summary',
      `<p>${A.narrative.map(escapeHtml).join('</p><p>')}</p>`
    );
  }

  function taBlock(A) {
    const L = A.ind.last;
    const asset = A.asset;
    const rows = A.score.signals.map(s => `
      <tr>
        <td>${escapeHtml(s.name)}</td>
        <td>${pill(s.bias === 'bullish' ? 'sup' : s.bias === 'bearish' ? 'res' : 'fib', s.bias)}</td>
        <td>${escapeHtml(s.detail)}</td>
      </tr>`).join('');

    return section('Technical Indicators', `
      <div class="kv-grid">
        ${kv('EMA 9', Utils.fmtPrice(L.ema9, asset))}
        ${kv('EMA 21', Utils.fmtPrice(L.ema21, asset))}
        ${kv('EMA 50', Utils.fmtPrice(L.ema50, asset))}
        ${kv('EMA 200', Utils.fmtPrice(L.ema200, asset))}
        ${kv('SMA 20', Utils.fmtPrice(L.sma20, asset))}
        ${kv('RSI 14', L.rsi != null ? L.rsi.toFixed(2) : '—', L.rsi > 70 ? 'dn' : L.rsi < 30 ? 'up' : '')}
        ${kv('MACD', L.macd != null ? L.macd.toPrecision(4) : '—')}
        ${kv('MACD Signal', L.macdSignal != null ? L.macdSignal.toPrecision(4) : '—')}
        ${kv('MACD Hist', L.macdHist != null ? L.macdHist.toPrecision(4) : '—', L.macdHist >= 0 ? 'up' : 'dn')}
        ${kv('ATR 14', Utils.fmtPrice(L.atr, asset))}
        ${kv('Stoch K/D', L.stochK != null ? `${L.stochK.toFixed(1)} / ${L.stochD?.toFixed(1)}` : '—')}
        ${kv('ADX', L.adx != null ? L.adx.toFixed(1) : '—')}
        ${kv('+DI / -DI', L.plusDI != null ? `${L.plusDI.toFixed(1)} / ${L.minusDI?.toFixed(1)}` : '—')}
        ${kv('BB Upper', Utils.fmtPrice(L.bbUpper, asset))}
        ${kv('BB Mid', Utils.fmtPrice(L.bbMid, asset))}
        ${kv('BB Lower', Utils.fmtPrice(L.bbLower, asset))}
        ${kv('VWAP', Utils.fmtPrice(L.vwap, asset))}
      </div>
      <h3>Signal breakdown</h3>
      <table class="level-table">
        <thead><tr><th>Indicator</th><th>Bias</th><th>Detail</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${A.ind.pivots ? `
        <h3>Classic Pivot Points (prev bar)</h3>
        <div class="kv-grid">
          ${kv('Pivot', Utils.fmtPrice(A.ind.pivots.p, asset))}
          ${kv('R1', Utils.fmtPrice(A.ind.pivots.r1, asset))}
          ${kv('R2', Utils.fmtPrice(A.ind.pivots.r2, asset))}
          ${kv('R3', Utils.fmtPrice(A.ind.pivots.r3, asset))}
          ${kv('S1', Utils.fmtPrice(A.ind.pivots.s1, asset))}
          ${kv('S2', Utils.fmtPrice(A.ind.pivots.s2, asset))}
          ${kv('S3', Utils.fmtPrice(A.ind.pivots.s3, asset))}
        </div>` : ''}
    `);
  }

  function smcBlock(A) {
    const asset = A.asset;
    const smc = A.smc;
    const srRows = [
      ...smc.sr.resistance.map(l =>
        `<tr><td>${pill('res', 'Resistance')}</td><td>${Utils.fmtPrice(l.price, asset)}</td><td>${l.touches} touches · str ${l.strength.toFixed(1)}</td></tr>`),
      ...smc.sr.support.map(l =>
        `<tr><td>${pill('sup', 'Support')}</td><td>${Utils.fmtPrice(l.price, asset)}</td><td>${l.touches} touches · str ${l.strength.toFixed(1)}</td></tr>`),
    ].join('');

    const zoneRows = [
      ...smc.sd.supply.map(z =>
        `<tr><td>${pill('supply', 'Supply')}</td><td>${Utils.fmtPrice(z.bottom, asset)} – ${Utils.fmtPrice(z.top, asset)}</td><td>str ${z.strength.toFixed(1)}${z.broken ? ' · broken' : ''}</td></tr>`),
      ...smc.sd.demand.map(z =>
        `<tr><td>${pill('demand', 'Demand')}</td><td>${Utils.fmtPrice(z.bottom, asset)} – ${Utils.fmtPrice(z.top, asset)}</td><td>str ${z.strength.toFixed(1)}${z.broken ? ' · broken' : ''}</td></tr>`),
    ].join('');

    const fvgRows = smc.fvg.open.map(f =>
      `<tr><td>${pill('fvg', f.type)}</td><td>${Utils.fmtPrice(f.bottom, asset)} – ${Utils.fmtPrice(f.top, asset)}</td><td>${f.partial ? 'partially filled' : 'open'} · size ${Utils.fmtPrice(f.size, asset)}</td></tr>`
    ).join('') || '<tr><td colspan="3">No open FVGs in lookback</td></tr>';

    const obRows = [
      ...smc.ob.bullish.map(o =>
        `<tr><td>${pill('ob', 'Bullish OB')}</td><td>${Utils.fmtPrice(o.bottom, asset)} – ${Utils.fmtPrice(o.top, asset)}</td><td>str ${o.strength.toFixed(1)}</td></tr>`),
      ...smc.ob.bearish.map(o =>
        `<tr><td>${pill('ob', 'Bearish OB')}</td><td>${Utils.fmtPrice(o.bottom, asset)} – ${Utils.fmtPrice(o.top, asset)}</td><td>str ${o.strength.toFixed(1)}</td></tr>`),
    ].join('') || '<tr><td colspan="3">No active unmitigated order blocks</td></tr>';

    const swingH = smc.ext.swingHighs.map(s => Utils.fmtPrice(s.price, asset)).join(', ') || '—';
    const swingL = smc.ext.swingLows.map(s => Utils.fmtPrice(s.price, asset)).join(', ') || '—';
    const majH = smc.ext.majorHighs.map(s => Utils.fmtPrice(s.price, asset)).join(', ') || '—';
    const majL = smc.ext.majorLows.map(s => Utils.fmtPrice(s.price, asset)).join(', ') || '—';

    return section('Smart Money · Zones · Structure', `
      <h3>Market structure</h3>
      <p><strong style="color:var(--text)">${escapeHtml(smc.structure.label)}</strong></p>
      <div class="kv-grid">
        ${kv('Last swing high', Utils.fmtPrice(smc.structure.lastSwingHigh, asset))}
        ${kv('Last swing low', Utils.fmtPrice(smc.structure.lastSwingLow, asset))}
        ${kv('Recent high (20)', Utils.fmtPrice(smc.ext.recentHigh, asset))}
        ${kv('Recent low (20)', Utils.fmtPrice(smc.ext.recentLow, asset))}
        ${kv('Mid high (50)', Utils.fmtPrice(smc.ext.midHigh, asset))}
        ${kv('Mid low (50)', Utils.fmtPrice(smc.ext.midLow, asset))}
        ${kv('Range high', Utils.fmtPrice(smc.ext.rangeHigh, asset))}
        ${kv('Range low', Utils.fmtPrice(smc.ext.rangeLow, asset))}
      </div>
      <p class="muted" style="margin-top:8px">Swing highs: ${swingH}</p>
      <p class="muted">Swing lows: ${swingL}</p>
      <p class="muted">Major highs: ${majH}</p>
      <p class="muted">Major lows: ${majL}</p>

      <h3>Support &amp; Resistance</h3>
      <table class="level-table">
        <thead><tr><th>Type</th><th>Price</th><th>Meta</th></tr></thead>
        <tbody>${srRows || '<tr><td colspan="3">—</td></tr>'}</tbody>
      </table>

      <h3>Supply &amp; Demand zones</h3>
      <table class="level-table">
        <thead><tr><th>Type</th><th>Zone</th><th>Meta</th></tr></thead>
        <tbody>${zoneRows || '<tr><td colspan="3">No fresh zones detected</td></tr>'}</tbody>
      </table>

      <h3>Fair Value Gaps (open)</h3>
      <table class="level-table">
        <thead><tr><th>Type</th><th>Gap</th><th>Status</th></tr></thead>
        <tbody>${fvgRows}</tbody>
      </table>

      <h3>Order Blocks (active)</h3>
      <table class="level-table">
        <thead><tr><th>Type</th><th>Zone</th><th>Meta</th></tr></thead>
        <tbody>${obRows}</tbody>
      </table>

      ${smc.structure.events?.length ? `
        <h3>Structure events</h3>
        <ul>${smc.structure.events.map(e =>
          `<li><strong>${escapeHtml(e.type)}</strong> ${escapeHtml(e.dir)} @ ${Utils.fmtPrice(e.price, asset)} — ${escapeHtml(e.note)}</li>`
        ).join('')}</ul>` : ''}
    `);
  }

  function vpBlock(A) {
    const asset = A.asset;
    const vp = A.vp;
    if (!vp) return section('Volume Profile', '<p>Insufficient data for FRVP.</p>');

    const hvn = vp.hvn.slice(0, 6).map(h =>
      `<tr><td>${pill('poc', 'HVN')}</td><td>${Utils.fmtPrice(h.price, asset)}</td><td>${Utils.fmt(h.volume, 1)}</td></tr>`
    ).join('');
    const lvn = vp.lvn.slice(0, 6).map(h =>
      `<tr><td>${pill('fib', 'LVN')}</td><td>${Utils.fmtPrice(h.price, asset)}</td><td>${Utils.fmt(h.volume, 1)}</td></tr>`
    ).join('');

    const price = A.stats.price;
    let pos = 'inside value area';
    if (price > vp.vah) pos = 'above VAH (price discovery / breakout territory)';
    else if (price < vp.val) pos = 'below VAL (rejection / breakdown territory)';
    else if (price > vp.poc) pos = 'inside value, above POC';
    else pos = 'inside value, below POC';

    return section('Fixed Range Volume Profile', `
      <p>Profile built on bars ${vp.startI + 1}–${vp.endI + 1} (${vp.endI - vp.startI + 1} bars), ${vp.bins} bins, value area ${(vp.vaPercent * 100).toFixed(0)}%.</p>
      <div class="kv-grid">
        ${kv('POC', Utils.fmtPrice(vp.poc, asset))}
        ${kv('VAH', Utils.fmtPrice(vp.vah, asset))}
        ${kv('VAL', Utils.fmtPrice(vp.val, asset))}
        ${kv('VA width', Utils.fmtPrice(vp.vah - vp.val, asset))}
        ${kv('Profile high', Utils.fmtPrice(vp.hi, asset))}
        ${kv('Profile low', Utils.fmtPrice(vp.lo, asset))}
        ${kv('Total volume', Utils.fmt(vp.totalVol, 1))}
        ${kv('Position', pos)}
      </div>
      <div class="note">
        <strong>POC</strong> = highest volume node (fair price magnet).
        <strong>VAH/VAL</strong> = value area boundaries where ~70% of volume traded.
        Acceptance above VAH / below VAL often precedes continuation; failed auctions reverse into value.
      </div>
      <h3>High / Low Volume Nodes</h3>
      <table class="level-table">
        <thead><tr><th>Type</th><th>Price</th><th>Volume</th></tr></thead>
        <tbody>${hvn}${lvn || ''}</tbody>
      </table>
    `);
  }

  function fibBlock(A) {
    const asset = A.asset;
    const fib = A.fib;
    if (!fib?.levels?.length) return '';
    const rows = fib.levels.map(l =>
      `<tr>
        <td>${pill('fib', l.kind === 'extension' ? 'Ext' : 'Ret')}</td>
        <td>${escapeHtml(l.label)}</td>
        <td>${Utils.fmtPrice(l.price, asset)}</td>
      </tr>`
    ).join('');
    return section('Fibonacci Levels', `
      <p>Anchored on ${fib.range.direction === 'up' ? 'bullish' : 'bearish'} leg:
        ${Utils.fmtPrice(fib.range.low, asset)} ↔ ${Utils.fmtPrice(fib.range.high, asset)}
      </p>
      <table class="level-table">
        <thead><tr><th>Kind</th><th>Ratio</th><th>Price</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="note">Key reaction zones: 38.2%, 50%, 61.8% (golden pocket). Extensions 1.272 / 1.618 often used for targets.</div>
    `);
  }

  function fundBlock(A) {
    const f = CONFIG.fundamentals[A.asset.id];
    if (!f) return section('Fundamental', '<p>No fundamental profile.</p>');
    return section('Fundamental Snapshot', `
      <div class="fund-block">
        <h3>${escapeHtml(f.title)}</h3>
        <p style="margin-bottom:8px;color:var(--text-dim)">Primary drivers (contextual — not live news feed):</p>
        <ul>${f.drivers.map(d => `<li>${escapeHtml(d)}</li>`).join('')}</ul>
        <h3>Sessions &amp; liquidity</h3>
        <p>${escapeHtml(f.sessions)}</p>
        <h3>Correlations</h3>
        <p>${escapeHtml(f.correlations)}</p>
        <h3>Notes</h3>
        <p>${escapeHtml(f.notes)}</p>
      </div>
      <div class="note">
        Fundamental block is a static educational brief for the asset class.
        Pair it with live macro calendar (FOMC, CPI, NFP, OPEC, ETF flows) for event risk.
        This app does not scrape live news.
      </div>
    `);
  }

  function levelsBlock(A) {
    const asset = A.asset;
    const rows = A.levels.slice(0, 40).map(l => {
      const kindMap = {
        support: 'sup', resistance: 'res', demand: 'demand', supply: 'supply',
        fvg: 'fvg', ob: 'ob', poc: 'poc', fib: 'fib', swing: 'swing',
      };
      const side = l.price >= A.stats.price ? 'above' : 'below';
      return `<tr>
        <td>${pill(kindMap[l.kind] || 'fib', l.label)}</td>
        <td>${Utils.fmtPrice(l.price, asset)}</td>
        <td>${side} · ${l.distPct.toFixed(2)}%</td>
        <td>${escapeHtml(l.meta || '')}</td>
      </tr>`;
    }).join('');

    return section('Key Levels (nearest first)', `
      <p>All confluence levels sorted by distance to last price (${Utils.fmtPrice(A.stats.price, asset)}).</p>
      <table class="level-table">
        <thead><tr><th>Level</th><th>Price</th><th>Distance</th><th>Meta</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `);
  }

  function render(analysis) {
    current = analysis;
    const body = document.getElementById('reportBody');
    let html = summaryBlock(analysis);

    switch (activeTab) {
      case 'ta':
        html += taBlock(analysis);
        break;
      case 'smc':
        html += smcBlock(analysis);
        break;
      case 'vp':
        html += vpBlock(analysis) + fibBlock(analysis);
        break;
      case 'fund':
        html += fundBlock(analysis);
        break;
      case 'levels':
        html += levelsBlock(analysis);
        break;
      default: // full
        html += narrativeBlock(analysis);
        html += taBlock(analysis);
        html += smcBlock(analysis);
        html += vpBlock(analysis);
        html += fibBlock(analysis);
        html += levelsBlock(analysis);
        html += fundBlock(analysis);
    }

    html += `<p class="note" style="margin-top:20px">Generated ${new Date(analysis.fetchedAt).toLocaleString()} · Techlysis · Educational use only · Not financial advice.</p>`;
    body.innerHTML = html;
  }

  function toPlainText(A) {
    const lines = [];
    lines.push(`TECHLYSIS REPORT — ${A.asset.display} · ${A.tf}`);
    lines.push(`Bias: ${A.score.bias.toUpperCase()} (bull ${A.score.bullPct.toFixed(0)}% / bear ${A.score.bearPct.toFixed(0)}%)`);
    lines.push(`Last: ${Utils.fmtPrice(A.stats.price, A.asset)} (${Utils.fmtPct(A.stats.chgPct)})`);
    lines.push(`Source: ${A.source} · Bars: ${A.stats.bars}`);
    lines.push('');
    lines.push('NARRATIVE');
    A.narrative.forEach(n => lines.push('• ' + n));
    lines.push('');
    lines.push('KEY LEVELS');
    A.levels.slice(0, 25).forEach(l => {
      lines.push(`  ${l.label}: ${Utils.fmtPrice(l.price, A.asset)} (${l.distPct.toFixed(2)}% ${l.price >= A.stats.price ? 'above' : 'below'})`);
    });
    lines.push('');
    lines.push('INDICATORS');
    const L = A.ind.last;
    lines.push(`  RSI ${L.rsi?.toFixed(1)} | MACD ${L.macd?.toPrecision(4)} | ATR ${Utils.fmtPrice(L.atr, A.asset)}`);
    lines.push(`  EMA9 ${Utils.fmtPrice(L.ema9, A.asset)} | EMA21 ${Utils.fmtPrice(L.ema21, A.asset)} | EMA50 ${Utils.fmtPrice(L.ema50, A.asset)}`);
    if (A.vp) {
      lines.push('');
      lines.push(`VP: POC ${Utils.fmtPrice(A.vp.poc, A.asset)} | VAH ${Utils.fmtPrice(A.vp.vah, A.asset)} | VAL ${Utils.fmtPrice(A.vp.val, A.asset)}`);
    }
    lines.push('');
    lines.push('Not financial advice.');
    return lines.join('\n');
  }

  return { init, render, setLoading, setError, toPlainText, getCurrent: () => current };
})();
