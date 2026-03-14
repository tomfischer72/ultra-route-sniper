# Ultra Route Sniper

Maintainer: Tom Fischer (@bikepeopletom)
Built with AI assistance (Cursor).

Minimal, mobile-first Progressive Web App (PWA) for unsupported ultra-cycling races.
It helps you load a GPX route, determine your current route kilometer, and scan POIs
along the route corridor.

## Features

- GPX upload + local persistence with IndexedDB (offline-ready after first load)
- Live geolocation and route matching (`km on route`)
- POI scanning via Overpass API (lodging, fuel, food categories, water, camping, shelter)
- Adjustable route corridor width (1-10 km)
- Planning mode (`from km 0`) and live mode (`from current position`)
- In-app map view with category markers and optional unpaved overlay
- UI language switcher: `DE`, `EN`, `FR`, `IT`

## Purpose

Ultra Route Sniper helps riders plan food, water, fuel, and sleep options on long
self-supported routes. It focuses on what is realistically reachable in the next
route segment.

## Tech Stack

- Vanilla `HTML`, `CSS`, `JavaScript`
- Leaflet for map rendering
- Service Worker + Manifest for PWA install/offline shell

## Unpaved selection logic

Unpaved overlay detection is intentionally conservative to reduce false positives:

- Data source: OSM `way["highway"]` within the segment bounding box (Overpass API)
- Unpaved is mainly inferred from explicit `surface` tags like `gravel`, `dirt`, `ground`, `mud`, `sand`, `grass`
- Explicit paved `surface` tags (for example `asphalt`, `concrete`, `paving_stones`) are excluded
- `tracktype` is only treated as unpaved for `grade4`/`grade5`
- `highway=track` without strong roughness tags is not automatically marked unpaved
- Route proximity threshold: about 50 m
- Very short fragments (< 250 m) are dropped as noise
- In map view you can switch between `Conservative` and `Normal`:
  - `Conservative`: tighter proximity matching (about 30 m), longer minimum
    segment length, and stricter way filtering (for example no pure footways
    without bike access)
  - `Normal`: more matches, with higher false-positive risk

## Quick Start (Local)

Serve the folder through any static HTTP server (for full geolocation and install behavior, use HTTPS in production).

Example:

```bash
python3 -m http.server 8080
```

Then open:

- http://localhost:8080/

## Quick Usage

1. Load GPX (`1. Load GPX route`)
2. Get location (`2. Location`)
3. Choose mode (`From route start` or `From current position`)
4. Set search window and corridor width
5. Select POI filters and tap `Start POI scan`
6. Review results in list or map

Notes:
- Use the top settings to choose your preferred navigation app
  (`Default`, `Mapy`, `Google Maps`, `Apple Maps`).
- Mapy (mobile app + desktop) works very well together with Ultra Route Sniper
  for long-distance route planning.

## Deployment

Deploy as static files to any web hosting.

Required for location on real devices:

- HTTPS (Geolocation APIs are blocked on plain HTTP)

## Privacy

- GPX data is stored only in the local browser database (IndexedDB).
- Location is requested only when the user taps location actions.
- No user account or server-side profile is required.

## Donations

If this project helps your race planning, support ongoing maintenance:

- GitHub Sponsors: [github.com/sponsors/tomfischer72](https://github.com/sponsors/tomfischer72)
- PayPal: [paypal.com/ncp/payment/S2AXHB5B3TGC6](https://www.paypal.com/ncp/payment/S2AXHB5B3TGC6)
- Revolut: [revolut.me/thomase8r](https://revolut.me/thomase8r)
- If this app helps your races, a small donation keeps development going.

## Open Source

Licensed under Apache-2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

## Release Flow

- Keep `main` as stable line.
- Build new features on dedicated branches.
- Tag releases using semantic versioning, e.g. `v1.1.0`, `v1.1.1`.

## Contributing

Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
