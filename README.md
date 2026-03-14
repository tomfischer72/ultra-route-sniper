# Ultra Route Sniper

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

## Tech Stack

- Vanilla `HTML`, `CSS`, `JavaScript`
- Leaflet for map rendering
- Service Worker + Manifest for PWA install/offline shell

## Quick Start (Local)

Serve the folder through any static HTTP server (for full geolocation and install behavior, use HTTPS in production).

Example:

```bash
python3 -m http.server 8080
```

Then open:

- http://localhost:8080/

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
- PayPal: replace with your final link in this section

## Open Source

Licensed under Apache-2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

## Release Flow

- Keep `main` as stable line.
- Build new features on dedicated branches.
- Tag releases using semantic versioning, e.g. `v1.1.0`, `v1.1.1`.

## Contributing

Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
