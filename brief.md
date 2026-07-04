# Summit — Creative Brief

## Concept
You climb a mountain where altitude follows Bitcoin's 7-day price path — each flag marks a daily close, and your climber's height is today's live price toward the weekly summit.

**Metaphor family:** journey  
**Narrative pattern:** Flow (temporal climb along price path)

## Data Source
- URL: `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=7`
- Poll interval: 60s
- Fields used: `prices[][0]` timestamp, `prices[][1]` USD price
- Fallback: 7-day synthetic BTC path anchored at $95,000

## Encoding Contract
| Data field | Visual channel | Range | "Taller/faster/brighter means…" | Legend? |
|------------|----------------|-------|----------------------------------|---------|
| price (daily close) | mountain ridge Y | 0–8 scene units | higher BTC price | yes (flags) |
| price delta vs start | flag pole color | green/red | up/down week | yes |
| current price | climber Y position | same scale | where market is now | no (hero) |
| day index | position along Z path | 0–7 | time forward | yes (#desc) |

## Creative Scene (R3F)
- Primary metaphor: repeating terrain chunks + ridge path from price series; box climber on path
- drei components: Sky, Stars, Html (flags + hero), CatmullRomLine, Tube
- Default camera: side angle showing ridge + climber (poster angle, 3s test)
- Interaction: hover flag → tooltip with date + price

## UX Chrome
- Hero metric: BTC $XX,XXX · +X.X% 7d
- #desc: "Altitude is Bitcoin's 7-day price — climb toward the summit"
- Stamp: CoinGecko · updated · live/fallback
- Reduced motion: static camera frame + DOM sparkline + stats

## Render tier
r3f — deploy Cloudflare Pages

## Deploy
- Slug: summit
- URL: https://summit.parthchandak.info

## Tier 2 Patterns
- Hero Number (C) + Mini-Render Legend (B)
