/**
 * Multi-source OHLCV fetcher (browser-friendly free APIs + CORS proxies + fallback)
 * Priority: Binance (crypto) → Yahoo chart → Stooq → synthetic demo
 */
const DataService = (() => {
  const PROXIES = [
    // AllTheUrls style open CORS proxies (tried in order)
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://cors.eu.org/${url}`,
  ];

  async function fetchJSON(url, { timeout = 12000, useProxy = true } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const tryOnce = async (target) => {
      const res = await fetch(target, {
        signal: controller.signal,
        headers: { Accept: 'application/json,text/plain,*/*' },
        mode: 'cors',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json') || ct.includes('text/plain') || ct.includes('text/csv')) {
        const text = await res.text();
        try { return JSON.parse(text); } catch { return text; }
      }
      return res.json();
    };

    try {
      // Direct first
      try {
        return await tryOnce(url);
      } catch (directErr) {
        if (!useProxy) throw directErr;
        let last = directErr;
        for (const p of PROXIES) {
          try {
            clearTimeout(timer);
            const c2 = new AbortController();
            const t2 = setTimeout(() => c2.abort(), timeout);
            const res = await fetch(p(url), {
              signal: c2.signal,
              mode: 'cors',
              cache: 'no-store',
            });
            clearTimeout(t2);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            try { return JSON.parse(text); } catch { return text; }
          } catch (e) {
            last = e;
          }
        }
        throw last;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchText(url, opts = {}) {
    const data = await fetchJSON(url, opts);
    return typeof data === 'string' ? data : JSON.stringify(data);
  }

  function normalizeCandle(c) {
    return {
      t: Number(c.t),
      o: Number(c.o),
      h: Number(c.h),
      l: Number(c.l),
      c: Number(c.c),
      v: Number(c.v) || 0,
    };
  }

  function cleanCandles(arr) {
    return arr
      .map(normalizeCandle)
      .filter(c =>
        Number.isFinite(c.t) &&
        Number.isFinite(c.o) &&
        Number.isFinite(c.h) &&
        Number.isFinite(c.l) &&
        Number.isFinite(c.c) &&
        c.h >= c.l &&
        c.t > 0
      )
      .sort((a, b) => a.t - b.t)
      .filter((c, i, a) => i === 0 || c.t !== a[i - 1].t);
  }

  // ─── Binance public klines (no key) ────────────────────────────────
  async function fromBinance(symbol, interval, limit) {
    const url =
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${Math.min(limit, 1000)}`;
    // Binance usually allows browser CORS
    let raw;
    try {
      const res = await fetch(url, { mode: 'cors', cache: 'no-store' });
      if (!res.ok) throw new Error('binance ' + res.status);
      raw = await res.json();
    } catch {
      raw = await fetchJSON(url);
    }
    if (!Array.isArray(raw)) throw new Error('Binance: bad payload');
    return cleanCandles(raw.map(k => ({
      t: k[0],
      o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5],
    })));
  }

  // ─── Yahoo Finance chart API ───────────────────────────────────────
  function yahooRange(tf, limit) {
    const minutes = CONFIG.timeframes[tf].minutes * limit;
    if (minutes <= 60 * 7) return '7d';
    if (minutes <= 60 * 24 * 30) return '1mo';
    if (minutes <= 60 * 24 * 90) return '3mo';
    if (minutes <= 60 * 24 * 180) return '6mo';
    if (minutes <= 60 * 24 * 365) return '1y';
    return '2y';
  }

  function yahooInterval(tf) {
    const map = {
      '1m': '1m', '3m': '5m', '5m': '5m', '15m': '15m',
      '30m': '30m', '1h': '60m', '4h': '60m', '1d': '1d',
    };
    return map[tf] || '15m';
  }

  async function fromYahoo(symbol, tf, limit) {
    const interval = yahooInterval(tf);
    const range = yahooRange(tf, limit);
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?interval=${interval}&range=${range}&includePrePost=false`;

    const data = await fetchJSON(url);
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error('Yahoo: no result');
    const ts = result.timestamp || [];
    const q = result.indicators?.quote?.[0] || {};
    const candles = [];
    for (let i = 0; i < ts.length; i++) {
      if (q.open?.[i] == null) continue;
      candles.push({
        t: ts[i] * 1000,
        o: q.open[i],
        h: q.high[i],
        l: q.low[i],
        c: q.close[i],
        v: q.volume?.[i] || 0,
      });
    }
    let cleaned = cleanCandles(candles);

    // Aggregate 1h → 4h if needed
    if (tf === '4h' && interval === '60m') {
      cleaned = Utils.aggregateCandles(cleaned, 4);
    }
    // Build 3m from 5m approximately (take as-is; better than nothing)
    if (cleaned.length > limit) cleaned = cleaned.slice(-limit);
    if (cleaned.length < 10) throw new Error('Yahoo: insufficient bars');
    return cleaned;
  }

  // ─── Stooq CSV ─────────────────────────────────────────────────────
  async function fromStooq(symbol, tf, limit) {
    // Stooq daily/interval: i=d daily, i=60 hourly-ish
    const i = CONFIG.timeframes[tf].stooq || 'd';
    const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=${i}`;
    const text = await fetchText(url);
    if (typeof text !== 'string' || !text.includes('Date')) {
      throw new Error('Stooq: bad CSV');
    }
    const lines = text.trim().split(/\r?\n/).slice(1);
    const candles = [];
    for (const line of lines) {
      const p = line.split(',');
      if (p.length < 5) continue;
      const t = Date.parse(p[0]);
      if (!Number.isFinite(t)) continue;
      candles.push({
        t,
        o: +p[1], h: +p[2], l: +p[3], c: +p[4],
        v: p[5] ? +p[5] : 0,
      });
    }
    let cleaned = cleanCandles(candles);
    if (cleaned.length > limit) cleaned = cleaned.slice(-limit);
    if (cleaned.length < 10) throw new Error('Stooq: insufficient');
    return cleaned;
  }

  // ─── Crypto alternate: Binance dataapi / public data ───────────────
  async function fromBinanceDataApi(symbol, interval, limit) {
    const url =
      `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${Math.min(limit, 1000)}`;
    const raw = await fetchJSON(url, { useProxy: false }).catch(() => fetchJSON(url));
    if (!Array.isArray(raw)) throw new Error('Binance vision fail');
    return cleanCandles(raw.map(k => ({
      t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5],
    })));
  }

  // ─── CoinGecko market chart (daily-ish crypto backup) ──────────────
  async function fromCoinGecko(assetId, tf, limit) {
    const ids = { BTCUSD: 'bitcoin', ETHUSD: 'ethereum' };
    const id = ids[assetId];
    if (!id) throw new Error('CG: unsupported');
    const days = tf === '1d' ? Math.ceil(limit) : Math.max(1, Math.ceil(limit * CONFIG.timeframes[tf].minutes / 1440));
    const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${Math.min(days, 365)}`;
    const data = await fetchJSON(url);
    const prices = data.prices || [];
    const vols = data.total_volumes || [];
    if (prices.length < 10) throw new Error('CG short');
    // Build OHLC from price path by bucketing
    const bucketMs = CONFIG.timeframes[tf].minutes * 60 * 1000;
    const map = new Map();
    prices.forEach((p, idx) => {
      const t0 = Math.floor(p[0] / bucketMs) * bucketMs;
      const price = p[1];
      const vol = vols[idx] ? vols[idx][1] : 0;
      if (!map.has(t0)) {
        map.set(t0, { t: t0, o: price, h: price, l: price, c: price, v: vol });
      } else {
        const c = map.get(t0);
        c.h = Math.max(c.h, price);
        c.l = Math.min(c.l, price);
        c.c = price;
        c.v += vol / prices.length;
      }
    });
    let cleaned = cleanCandles([...map.values()]);
    if (cleaned.length > limit) cleaned = cleaned.slice(-limit);
    return cleaned;
  }

  // ─── Synthetic realistic demo data (always works offline / GH pages) ─
  function synthetic(assetId, tf, limit) {
    const asset = CONFIG.assets[assetId];
    const seed = Utils.hashStr(assetId + '|' + tf + '|' + Math.floor(Date.now() / (CONFIG.timeframes[tf].minutes * 60000)));
    const rnd = Utils.rng(seed);
    const bases = {
      XAUUSD: 2350, EURUSD: 1.085, USOIL: 78, GBPJPY: 191.5,
      BTCUSD: 64000, ETHUSD: 3400,
    };
    let price = bases[assetId] || 100;
    const volMap = {
      XAUUSD: 0.0012, EURUSD: 0.00035, USOIL: 0.004,
      GBPJPY: 0.001, BTCUSD: 0.0045, ETHUSD: 0.0055,
    };
    const sigma = volMap[assetId] || 0.002;
    const ms = CONFIG.timeframes[tf].minutes * 60 * 1000;
    const now = Date.now();
    const start = now - limit * ms;
    const candles = [];
    // mild trend + mean reversion + jumps
    let drift = (rnd() - 0.48) * sigma * 0.15;
    for (let i = 0; i < limit; i++) {
      if (i % 40 === 0) drift = (rnd() - 0.48) * sigma * 0.2;
      const shock = (rnd() + rnd() + rnd() + rnd() - 2) * sigma; // approx normal
      const jump = rnd() < 0.02 ? (rnd() - 0.5) * sigma * 8 : 0;
      const o = price;
      const c = Math.max(price * 0.01, price * (1 + drift + shock + jump));
      const wiggle = Math.abs(shock) + sigma * rnd();
      const h = Math.max(o, c) * (1 + wiggle * 0.6);
      const l = Math.min(o, c) * (1 - wiggle * 0.6);
      const v = Math.floor(50 + rnd() * 500 + Math.abs(shock) * 20000);
      candles.push({ t: start + i * ms, o, h, l, c, v });
      price = c;
    }
    return { candles: cleanCandles(candles), source: 'synthetic-demo', note: 'Live feeds unavailable — using realistic seeded demo OHLCV so analysis still works offline / on GitHub Pages.' };
  }

  /**
   * Main entry — tries free sources in order for the asset.
   * @returns {{ candles, source, asset, tf, fetchedAt, note? }}
   */
  async function fetchOHLCV(assetId, tf, limit = 200, onProgress) {
    const asset = CONFIG.assets[assetId];
    if (!asset) throw new Error('Unknown asset ' + assetId);
    const tfCfg = CONFIG.timeframes[tf];
    if (!tfCfg) throw new Error('Unknown TF ' + tf);
    const attempts = [];

    const progress = (msg) => { if (onProgress) onProgress(msg); };

    // 1) Binance for crypto
    if (asset.binance) {
      progress('Fetching Binance…');
      try {
        const candles = await fromBinance(asset.binance, tfCfg.binance, limit);
        if (candles.length >= 20) {
          return { candles, source: 'Binance', asset, tf, fetchedAt: Date.now() };
        }
        attempts.push('Binance short');
      } catch (e) {
        attempts.push('Binance: ' + e.message);
        try {
          progress('Fetching Binance Vision…');
          const candles = await fromBinanceDataApi(asset.binance, tfCfg.binance, limit);
          if (candles.length >= 20) {
            return { candles, source: 'Binance Vision', asset, tf, fetchedAt: Date.now() };
          }
        } catch (e2) {
          attempts.push('Binance Vision: ' + e2.message);
        }
      }
    }

    // 2) Yahoo
    if (asset.yahoo) {
      progress('Fetching Yahoo Finance…');
      try {
        const candles = await fromYahoo(asset.yahoo, tf, limit);
        return { candles, source: 'Yahoo Finance', asset, tf, fetchedAt: Date.now() };
      } catch (e) {
        attempts.push('Yahoo: ' + e.message);
      }
    }

    // 3) CoinGecko for crypto daily-ish
    if (asset.type === 'crypto') {
      progress('Fetching CoinGecko…');
      try {
        const candles = await fromCoinGecko(assetId, tf, limit);
        if (candles.length >= 15) {
          return { candles, source: 'CoinGecko', asset, tf, fetchedAt: Date.now() };
        }
      } catch (e) {
        attempts.push('CoinGecko: ' + e.message);
      }
    }

    // 4) Stooq
    if (asset.stooq) {
      progress('Fetching Stooq…');
      try {
        const candles = await fromStooq(asset.stooq, tf, limit);
        return { candles, source: 'Stooq', asset, tf, fetchedAt: Date.now() };
      } catch (e) {
        attempts.push('Stooq: ' + e.message);
      }
    }

    // 5) Synthetic always-available fallback
    progress('Using demo data fallback…');
    const syn = synthetic(assetId, tf, limit);
    return {
      candles: syn.candles,
      source: syn.source,
      asset,
      tf,
      fetchedAt: Date.now(),
      note: syn.note + ' Attempts: ' + attempts.join(' | '),
      attempts,
    };
  }

  return { fetchOHLCV, synthetic, cleanCandles };
})();
