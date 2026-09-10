/**
 * Techlysis app controller
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const ui = {
    asset: $('assetSelect'),
    tf: $('tfSelect'),
    limit: $('limitSelect'),
    analyze: $('analyzeBtn'),
    refresh: $('refreshBtn'),
    statusDot: $('statusDot'),
    statusText: $('statusText'),
    sourceBadge: $('sourceBadge'),
    lastUpdate: $('lastUpdate'),
    symbolLabel: $('symbolLabel'),
    lastPrice: $('lastPrice'),
    priceChange: $('priceChange'),
    fitBtn: $('fitBtn'),
    resetZoomBtn: $('resetZoomBtn'),
    crosshairToggle: $('crosshairToggle'),
    gridToggle: $('gridToggle'),
    overlayToggles: $('overlayToggles'),
  };

  let lastAnalysis = null;
  let busy = false;

  function setStatus(kind, text) {
    ui.statusDot.className = 'dot ' + kind;
    ui.statusText.textContent = text;
  }

  function buildOverlayToggles() {
    const root = ui.overlayToggles;
    root.innerHTML = '';
    CONFIG.overlays.forEach(o => {
      const lab = document.createElement('label');
      lab.className = 'ov-item';
      lab.title = o.label;
      const sw = document.createElement('span');
      sw.className = 'ov-swatch';
      sw.style.background = o.color;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = o.default;
      cb.disabled = !!o.locked;
      cb.dataset.overlay = o.id;
      cb.addEventListener('change', () => {
        const map = {};
        root.querySelectorAll('input[data-overlay]').forEach(inp => {
          map[inp.dataset.overlay] = inp.checked;
        });
        ChartEngine.setOverlays(map);
      });
      const span = document.createElement('span');
      span.textContent = o.label;
      lab.appendChild(cb);
      lab.appendChild(sw);
      lab.appendChild(span);
      root.appendChild(lab);
    });
  }

  function updatePriceStrip(A) {
    const asset = A.asset;
    ui.symbolLabel.textContent = asset.id;
    ui.lastPrice.textContent = Utils.fmtPrice(A.stats.price, asset);
    const chg = A.stats.chgPct;
    ui.priceChange.textContent = Utils.fmtPct(chg);
    ui.priceChange.className = 'chg ' + (chg >= 0 ? 'up' : 'down');
  }

  async function runAnalyze() {
    if (busy) return;
    busy = true;
    ui.analyze.disabled = true;
    ui.refresh.disabled = true;

    const assetId = ui.asset.value;
    const tf = ui.tf.value;
    const limit = parseInt(ui.limit.value, 10) || 200;

    setStatus('loading', 'Fetching OHLCV…');
    ui.sourceBadge.textContent = '…';
    Report.setLoading('Fetching latest OHLCV and computing analysis…');

    try {
      const payload = await DataService.fetchOHLCV(assetId, tf, limit, (msg) => {
        setStatus('loading', msg);
      });

      setStatus('loading', 'Running analysis engines…');
      // yield to UI
      await new Promise(r => setTimeout(r, 20));

      const analysis = Analysis.run(payload);
      lastAnalysis = analysis;

      ChartEngine.setAnalysis(analysis);
      Report.render(analysis);
      updatePriceStrip(analysis);

      ui.sourceBadge.textContent = analysis.source;
      ui.lastUpdate.textContent = 'Updated ' + new Date(analysis.fetchedAt).toLocaleTimeString();
      setStatus('ok', analysis.note ? 'Demo data (live feed blocked)' : 'Live data loaded');
    } catch (err) {
      console.error(err);
      setStatus('err', 'Failed');
      ui.sourceBadge.textContent = 'error';
      Report.setError(err);
    } finally {
      busy = false;
      ui.analyze.disabled = false;
      ui.refresh.disabled = false;
    }
  }

  function bind() {
    ui.analyze.addEventListener('click', runAnalyze);
    ui.refresh.addEventListener('click', runAnalyze);
    ui.fitBtn.addEventListener('click', () => ChartEngine.fit());
    ui.resetZoomBtn.addEventListener('click', () => ChartEngine.resetZoom());
    ui.crosshairToggle.addEventListener('change', () => {
      ChartEngine.setFlags({ crosshair: ui.crosshairToggle.checked });
    });
    ui.gridToggle.addEventListener('change', () => {
      ChartEngine.setFlags({ grid: ui.gridToggle.checked });
    });

    // Enter key on selects
    [ui.asset, ui.tf, ui.limit].forEach(el => {
      el.addEventListener('change', () => {
        // auto-run on change for snappy UX
        runAnalyze();
      });
    });

    // keyboard shortcut
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runAnalyze();
      if (e.key === 'r' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); runAnalyze(); }
    });
  }

  function boot() {
    ChartEngine.init();
    Report.init();
    buildOverlayToggles();
    bind();
    setStatus('idle', 'Ready — press Analyze');
    // Auto-load default so the page isn't empty
    runAnalyze();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
