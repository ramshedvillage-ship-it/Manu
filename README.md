# CrazyScope — source-connected Crazy Time dashboard

An independent responsive dashboard inspired by the two supplied references. Original UI and code; not an official CasinoScores or Evolution product.

## Run

Requires Python 3.10+ and outbound HTTPS access.

```sh
pip install -r requirements.txt
python app.py
```

Open http://localhost:3000. Set `PORT` to change the listening port. The browser uses same-origin `/api/results`; no API keys or browser-side CORS workarounds are required. Fonts are bundled locally. Do not open `static/index.html` directly: live data requires the Python service.

## Real data path

- Source: `https://api-cs.casino.org/svc-evolution-game-events/api/crazytime`
- Source reference: https://www.casino.org/casinoscores/crazy-time/
- Table: `CrazyTime0000001` (original Crazy Time, not Crazy Time A).
- Requests include `page=0`, `size=500` initially (`100` subsequently), `sort=data.settledAt,desc`, `duration=24`, and the table ID.
- The server polls at 15-second intervals plus request time; the browser reads the server every 5 seconds while visible. This is near-live polling, not a zero-delay stream.
- Only source-resolved rounds with a matching table, a known outcome, source ID and valid settlement timestamp are stored.
- Source IDs deduplicate SQLite records. Timestamps, multipliers, payouts and outcomes originate from the source. Missing fields remain missing; there are no generated replacements.
- `data/results.sqlite3` is created automatically. No seeded or demo data is shipped in the source ZIP.
- Records are retained for up to 24 hours, with a maximum of 2,500 returned per response. Initial history is a maximum of 500 rounds. The 1/6/24-hour views filter retrieved records; they do not claim complete source coverage. A lengthy outage can leave gaps.
- Freshness is based on source settlement time, not merely a successful HTTP response. Over 3 minutes is marked delayed; a failed request is unavailable. Long bonus rounds can legitimately exceed the warning threshold.
- On failure, historical results remain labelled and estimates are paused. With no history, the dashboard is empty. No mock, synthetic, fallback-random or demo results exist.

This confirms provenance to the CasinoScores endpoint, not independent verification of the physical wheel. The endpoint is third-party infrastructure; availability, latency and schema are outside this application's control. Confirm the provider's permission, licensing and terms before commercial redistribution. Do not bypass any future access restrictions.

## Prediction limitations

The experimental box shows four highest **smoothed historical estimates**, not known future outcomes and not validated next-spin probabilities.

For each of eight outcomes:

```
estimate = (count in latest up-to-100 real rounds + segment count) / (sample size + 54)
```

The 54-segment prior uses counts 21/13/7/4/4/2/2/1 for 1/2/5/10/Coin Flip/Pachinko/Cash Hunt/Crazy Time. Under a fair, independent wheel model, the wheel baseline—not recent frequency—is the next-spin probability. Historical smoothing is exploratory, not evidence of a predictive edge. Sum of top-four estimates is coverage, not accuracy. No fabricated hit rates, accuracy claims, countdowns or synthetic backtests are shown.

## Features

- Responsive desktop/mobile layout
- Timestamped latest rounds and source-linked round detail
- Connection monitor and explicit stale/offline states
- 1/6/24-hour retrieved-sample statistics
- Outcome and bonus filtering, pagination, CSV export
- Eight-outcome estimates and visible methodology

## Deployment

The running workspace preview is not a permanent public deployment. For hosting, use a persistent Python service/container with a writable persistent `data/` directory and HTTPS reverse proxy. The entrypoint uses Waitress with one source-collector thread. Run a single instance unless you adapt storage and collection coordination. The background collector and local SQLite database are **not designed for unmodified Vercel serverless deployment**. A Vercel frontend would need a separately hosted persistent API (or a redesigned scheduled collector and managed database).

## Validation performed

- Source endpoint returned HTTP 200 with real resolved round records.
- A later check returned a newer source settlement and round ID.
- Desktop (1440px) and mobile (390px) browser checks: no horizontal page overflow.
- Filters, pagination, source-round dialog, methodology dialog and CSV download tested.
- Browser network interruption tested: history retained, feed unavailable, estimates paused; reconnection recovered.
- Estimated outcome probabilities sum to 1; stored source round IDs are unique.

18+. Results and exploratory estimates are not betting advice.
