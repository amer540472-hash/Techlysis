# Techlysis

**Pure HTML · CSS · JavaScript** multi-asset technical analysis workstation.  
No build step, no frameworks, no backend — open `index.html` or host on **GitHub Pages**.

![stack](https://img.shields.io/badge/stack-HTML%2FCSS%2FJS-blue) ![pages](https://img.shields.io/badge/GitHub%20Pages-ready-green)

## Features

| Module | What you get |
|--------|----------------|
| **OHLCV** | Live fetch from free sources (Binance, Yahoo Finance, Stooq, CoinGecko) with CORS proxy fallback + seeded demo data if all feeds fail |
| **Assets** | Gold (XAUUSD), EURUSD, USOIL, GBPJPY, BTCUSD, ETHUSD |
| **Timeframes** | 1m · 3m · 5m · 15m · 30m · 1h · 4h · 1D |
| **Technical** | EMA 9/21/50/200, SMA 20, Bollinger, RSI, MACD, Stoch, ADX, ATR, VWAP, classic pivots |
| **Structure** | Swing H/L, major highs/lows, market structure (HH/HL/LH/LL), BOS notes |
| **Zones** | Support & resistance clusters, supply/demand, fair value gaps (FVG), order blocks |
| **Volume profile** | Fixed-range VP, **POC**, **VAH**, **VAL**, HVN/LVN |
| **Fibonacci** | Auto-anchored retracements & extensions |
| **Fundamental** | Educational asset briefs (drivers, sessions, correlations) |
| **Chart** | Full canvas chart — every level drawn; toggle any overlay on/off |
| **Report** | Written full report + tabs; copy plain text / print to PDF |

## Quick start

### Local
```bash
# Option A — just open the file
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows

# Option B — static server (recommended; better CORS behaviour)
npx --yes serve .
# or: python -m http.server 8080
```

### GitHub Pages
1. Push this repo to GitHub.
2. **Settings → Pages → Source**: Deploy from branch `main` (root), or use Actions.
3. Visit `https://<user>.github.io/<repo>/`.

A `404` on nested paths is normal for SPA-less static sites — everything lives at `/` / `index.html`.

## Usage

1. Pick **Asset**, **Timeframe**, and bar count.
2. Click **Analyze** (or change a dropdown — it auto-runs).
3. Toggle overlays under the chart (S/R, supply/demand, FVG, OB, VP, Fib, EMAs…).
4. Scroll the **Full Report** or switch tabs: Technical · SMC/Zones · Volume Profile · Fundamental · Key Levels.
5. Chart: scroll = zoom, drag = pan, double-click = fit, crosshair readout on hover.

## Project layout

```
Techlysis/
├── index.html
├── css/style.css
├── js/
│   ├── config.js          # assets, TFs, overlay defs, fund briefs
│   ├── utils.js
│   ├── data.js            # multi-source OHLCV
│   ├── indicators.js      # TA math
│   ├── smc.js             # swings, S/R, S/D, FVG, OB
│   ├── volume-profile.js  # FRVP · POC · VAH · VAL
│   ├── fibonacci.js
│   ├── analysis.js        # scoring + narrative
│   ├── chart.js           # canvas renderer
│   ├── report.js          # written report UI
│   └── app.js             # controller
└── README.md
```

## Data sources & limitations

| Priority | Source | Best for |
|----------|--------|----------|
| 1 | **Binance** public klines | BTCUSD, ETHUSD (excellent, usually CORS-ok) |
| 2 | **Yahoo Finance** chart API | FX, gold, oil, crypto (via CORS proxies when needed) |
| 3 | **CoinGecko** | Crypto backup |
| 4 | **Stooq** CSV | FX / futures daily-ish |
| 5 | **Synthetic demo** | Always works offline / when browsers block third-party APIs |

> Browser CORS policies and free-API rate limits vary. On GitHub Pages, crypto via Binance usually works; FX/commodities may fall back to Yahoo-through-proxy or demo data. The UI always labels the active source.

**Not financial advice.** Indicators and zone detection are algorithmic heuristics for education and research.

## Keyboard

- `Ctrl/Cmd + Enter` — Analyze  
- `Ctrl/Cmd + R` — Refresh  

## License

MIT — use, fork, and host freely.
