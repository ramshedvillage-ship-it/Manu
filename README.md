# CrazyScope — source-connected Crazy Time dashboard

An independent responsive dashboard inspired by the two supplied references. Original UI and code; not an official CasinoScores or Evolution product.

## Run

Requires Python 3.10+ and outbound HTTPS access.

```sh
pip install -r requirements.txt
python app.py
```

Open http://localhost:3000. Set `PORT` to change the listening port. The browser uses same-origin `/api/results`; no API keys or browser-side CORS workarounds are required. Fonts are bundled locally. Do not open `static/index.html` directly: live data requires the Python service.

## Real data path (persistent Python mode; see Netlify differences below)

- Source: `https://api-cs.casino.org/svc-evolution-game-events/api/crazytime`
- Source reference: https://www.casino.org/casinoscores/crazy-time/
- Table: `CrazyTime0000001` (original Crazy Time, not Crazy Time A).
- Requests include `page=0`, `size=500` initially (`10` on regular warm updates; full refresh after a gap), `sort=data.settledAt,desc`, `duration=24`, and the table ID.
- The Python collector and browser target 3-second start-to-start intervals, without overlapping requests. Source publication time, network time and the two polling phases still add latency. This is near-live polling, not a zero-delay stream. Provider 429/503 backoff is respected.
- Only source-resolved rounds with a matching table, a known outcome, source ID and valid settlement timestamp are stored.
- Source IDs deduplicate SQLite records. Timestamps, multipliers, payouts and outcomes originate from the source. Missing fields remain missing; there are no generated replacements.
- `data/results.sqlite3` is created automatically. No seeded or demo data is shipped in the source ZIP.
- Records are retained for up to 24 hours, with a maximum of 2,500 returned per response. Initial history is a maximum of 500 rounds. The 1/6/24-hour views filter retrieved records; they do not claim complete source coverage. A lengthy outage can leave gaps.
- Freshness is based on source settlement time, not merely a successful HTTP response. Over 3 minutes is marked delayed; a failed request is unavailable. Long bonus rounds can legitimately exceed the warning threshold.
- On failure, historical results remain labelled and estimates are paused. With no history, the dashboard is empty. No mock, synthetic, fallback-random or demo results exist.

This confirms provenance to the CasinoScores endpoint, not independent verification of the physical wheel. The endpoint is third-party infrastructure; availability, latency and schema are outside this application's control. Confirm the provider's permission, licensing and terms before commercial redistribution. Do not bypass any future access restrictions.

## Video panel and source-art result cards

The video panel attempts **direct provider playback** only when the user presses **Load live stream**. It uses locally bundled hls.js 1.7.3 with native HLS fallback. Playback status changes to Playing only after the browser emits a playback event; idle, buffering, paused, stopped and unavailable states are distinct. Stalled/failed streams are not shown indefinitely as apparently live frozen frames. There is no demo video, looped recording, media proxy, spoofed header, DRM bypass or geoblock bypass.

The public HLS address advertised in the supplied reference was:

`https://live101.egprom.com/app/43/amlst:dc3_ct_auto/playlist.m3u8`

**Important: during implementation, a direct request returned HTTP 418 and the browser test could not play it. The player exists, but working playback of this reference URL is NOT verified.** A user region, domain, CORS policy, provider change or entitlement requirement may prevent playback. No attempt is made to defeat restrictions. Use the reference-site link or obtain a provider-approved stream for your deployment.

### Configure a provider-approved stream on Netlify

Set the build environment variable `CRAZY_TIME_HLS_URL` to an authorized **HTTPS HLS playback URL**, then redeploy. `scripts/build.mjs` writes that URL into the built `site/static/stream-config.js`. The URL must be intended for delivery to browsers and must permit playback from your deployment domain. Do not put server-only API keys or GitHub credentials in this setting; the generated playback URL is browser-visible. In persistent Python mode, configure `static/stream-config.js` directly instead.

The video and result feed are separate and may have different delays. The operator must confirm any replacement video is the same original Crazy Time table. Video timing is not used to infer a future outcome or determine a prediction verdict. The result feed and ledger continue operating if the video module fails to load or the provider rejects playback.

The latest-result tiles, history spin-result and top-slot cells, ledger actual-result cells, and clickable round-detail panels now use the same reference artwork as the signal cards. Result IDs, timestamps, outcomes and multipliers remain source-derived. The upcoming prediction panel shows exactly four cards. Eight-outcome calculations and counts remain in frozen ledger exports and methodology, not an extra eight-card grid.

## Forecasts and prospective HIT / MISS tracking

**No hack, guaranteed next result, calibrated next-spin model or proven edge is offered.** A fair independent wheel cannot be predicted from historical frequency. Number outcomes occupy 45/54 segments, so selecting the same four numbers can be a legitimate coverage strategy without demonstrating any skill.

All eight outcomes, including all four bonuses, remain eligible internally. Only the four selected estimates are displayed in the prediction panel; the duplicate eight-card grid and its expansion controls have been removed. The exploratory historical estimate remains:

```
estimate = (count in latest up-to-100 real rounds + segment count) / (sample size + 54)
```

The 54-segment prior uses counts 21/13/7/4/4/2/2/1 for 1/2/5/10/Coin Flip/Pachinko/Cash Hunt/Crazy Time. Under a fair independent wheel model, the wheel baseline—not recent frequency—is the next-spin probability.

### Deterministic selection from all eight outcomes

All **70** four-outcome combinations are evaluated. The selected set has the maximum sum of the source-derived historical estimates. Exact ties resolve alphabetically. This is mathematically equivalent to selecting the four highest estimates, not a new predictive advantage. There is no random sampling, fixed four-outcome list, or forced number/bonus allocation. With unavailable data the engine produces no replacement picks. The previous bonus-allocation option is removed for new forecasts; its label remains on old ledger records for auditability.

The physical segment counts remain as an explicitly disclosed wheel prior, not fictional historical results. A benchmark set is derived separately from wheel frequencies for comparison only; it is never passed to the signal selector. The same four signals can legitimately recur when the estimated ordering has not changed.

For a fair independent standard wheel, the maximum true next-spin coverage of any four outcomes is 45/54 = 83.33%, not 100%. Historical estimates may differ from this theoretical probability; this is sampling variation, not proof of an exploitable advantage.

### Original-reference signal artwork

The four prominent signal cards and result tiles use locally bundled artwork from the supplied CasinoScores reference's public Cloudinary assets. See `static/cards/ATTRIBUTION.md`. Third-party names, logos and artwork are not claimed as original work. Confirm permission/licensing before commercial redistribution.

### Public-feed comparison (not a prediction source)

The feed monitor includes **Compare public result feeds**, backed by `/api/source-check`. It queries the existing CasinoScores endpoint and the public `https://slotyi.com/api/crazytime` completed-round endpoint. Netlify caches checks for up to 60 seconds. It shows real source IDs and settlement timestamps, HTTP fetch duration and errors. It does not treat fetch duration as end-to-end delivery latency.

Matching IDs can indicate a shared upstream source, not independent verification. No access controls are bypassed, no hidden or unreleased result is requested, and alternate-feed data is not silently inserted into forecasts. This comparison does not establish which feed is consistently faster; a long-running arrival-time study would be required.

### Forward-only local validation

Press **Start live validation**. All eight estimates, four selections, model version, selected policy, sample size, training-through source ID and lock timestamp are saved before observing a new eligible round. New locks always use unrestricted all-8 optimization; pending selections never change in response to a result.

- HIT: the actual eligible result is one of the frozen four.
- MISS: the actual eligible result is not selected. An unselected bonus is a MISS, not excused.
- UNSCORED: already-started rounds, missing start/settlement evidence, additional rounds without a pre-existing forecast, cancelled tracking, source delays/failures, observation gaps over 45 seconds, missing cursor records, hidden pages or reloaded sessions.

An eligible round's **source-reported start** must be strictly more than 2 seconds after the forecast lock. The first initial history response never generates retrospective wins. Within an uninterrupted observation session, the next observed eligible round resolves the pending forecast; duplicate round IDs cannot be scored twice. Additional retrieved rounds do not receive invented backdated predictions.

The wheel-frequency reference is derived separately from segment counts and scored on exactly the same eligible rounds. Bonus-only and number-only performance are shown separately. Overall counters combine policies; inspect the policy recorded on each row before interpreting changes.

### Important limits

This is a **browser-local, editable log**, not a server-signed or independently audited record. Use one tab per browser. Each device/origin has separate history; the live preview does not seed the production site's statistics. Reloads preserve records but cancel an unverified pending forecast and require restarting validation. At most the most recent 1,000 entries are retained. Export JSON for frozen probabilities, timestamps, source IDs, actual results and reasons. If local storage is blocked, the UI warns that logging is session-only.

Keep the page visible. Source time and retrieved ordering are relied on; feed completeness and physical-wheel outcomes are not independently audited. Unscored exclusions can bias hit rates, especially if a long bonus exceeds the 3-minute stale threshold. These observations do not constitute a controlled trial. Hit rate is not profit; four-outcome coverage is not accuracy. No fabricated hit rates, future outcomes, or retroactive model changes are used.

### Accounting regression test

```
npm test
```

Requires the real source endpoint. Tests replay actual source records with an isolated test clock to exercise scoring guards, bonus misses, deduplication and cancellation. They do not populate the UI and their output is **not** prospective validation or an accuracy claim. There is no synthetic-result fallback if the source is unavailable. A separate transport-only test simulates HTTP 429 after retrieving real history to verify Retry-After behavior; no fabricated spins are produced or displayed.

## Features

- Responsive desktop/mobile layout
- Provider video player with accurate status and reference-site fallback (reference playback currently unverified)
- Timestamped latest rounds and source-linked round detail
- Connection monitor and explicit stale/offline states
- 1/6/24-hour retrieved-sample statistics
- Outcome and bonus filtering, pagination, CSV export
- Exactly four upcoming forecast cards, selected deterministically from all eight outcomes; original-reference artwork and visible methodology
- Frozen prospective forecasts with HIT / MISS / UNSCORED logging, baseline comparison and JSON export

## Netlify deployment (fixes the static-host 404)

This repository now includes a **Netlify-native Node serverless adapter**. Netlify does not run the Python server; it serves the built HTML/CSS/JS and executes the `results` function for `/api/results`.

Link the repository in Netlify and use:

- Production branch: `main`
- Base directory: leave empty (repository root)
- Build command: `npm run build`
- Publish directory: `site`
- Functions directory: `netlify/functions`
- Node: 22 (set by `netlify.toml`)

`netlify.toml` sets these options and rewrites `/api/results` to the function. Run a new production deploy after updating the repository. If an old site has a custom base/package directory, clear it first. A manual static drag-and-drop upload alone will not deploy the live-results function.

The build deliberately creates `site/index.html` and `site/static/*` to match the browser's asset URLs. Never publish the project root or just the `static` folder for this setup.

### Netlify data limits

The browser targets **3-second start-to-start** refreshes while visible, not 3 seconds of extra waiting after a fast request. It never overlaps requests. The old 15-second function cache is replaced with a **1-second** warm-instance cache for duplicate request coalescing. On a cold start or after a gap over 45 seconds the function retrieves up to 500 actual recent source rounds; on normal warm refreshes it requests only the latest 10, merges by source ID and retains at most 500. Source-reported 429/503 responses cause backoff of at least 30 seconds and honor a longer Retry-After. Hidden tabs stop polling; returning checks immediately.

Results are rendered when a response arrives, with no additional presentation hold. The request interval is **not a guarantee that source results arrive within 3 seconds**. Provider publication delays, source caching, cold starts and network time remain outside this application's control. A public WebSocket connection was attempted from the normal test browser and was unavailable; no origin spoofing or access-control bypass was attempted, and an unverified push feed is not claimed.

Serverless instances have no persistent history or background polling; the selected 24-hour view may therefore contain only the latest several hours of retrieved rounds. On a failed request, actual history already present in the browser is retained and estimates pause. A cold start with an unavailable source shows no results, never invented ones.

The public source may block cloud providers, change its schema, or become unavailable. A successful local check does not guarantee access from Netlify; check `/api/results` on your deployed site. No credentials are needed or included.

### Local preview of the Netlify adapter

```sh
npm install
npm run build
npm run preview
```

Open http://localhost:3001. This tests the static artifact and serverless handler locally; it does not deploy to Netlify.

### Alternative persistent Python hosting

The original `python app.py` mode remains available on a persistent Python service/container with writable `data/` storage and an HTTPS reverse proxy. Waitress runs one collector thread. Run one instance unless collection/storage coordination is adapted. Python mode accumulates up to 24 hours of retrieved records, unlike the non-persistent Netlify adapter. Vercel requires its own hosting adapter or a separately hosted API.

## Validation performed

- Source endpoint returned HTTP 200 with real resolved round records.
- A later check returned a newer source settlement and round ID.
- Desktop (1440px) and mobile (390px) browser checks: no horizontal page overflow.
- Filters, pagination, source-round dialog, methodology dialog and CSV download tested.
- Browser network interruption tested: history retained, feed unavailable, estimates paused; reconnection recovered.
- Estimated outcome probabilities sum to 1; stored source round IDs are unique.

- Forward-accounting tests exercised HIT, MISS, bonus MISS, immutable selections, duplicate suppression, start-time eligibility, gaps, failures and reloads using actual source records in an isolated test-clock replay.
- A newly arriving live round resolved a previously locked forecast during a separate prospective browser check. This verifies accounting, not a predictive advantage; the observation was not seeded into the production ledger.

- Actual reference video request was rejected; browser unavailability was surfaced correctly while results continued. Also tested missing-player-library isolation without substituting any media or result data.

- Simplified forecast panel verified to render exactly four cards on desktop and mobile. Normal-browser HTTP refresh cadence and upstream check timestamp progression were measured; this does not establish zero end-to-end delivery delay.

18+. Results and exploratory estimates are not betting advice.
