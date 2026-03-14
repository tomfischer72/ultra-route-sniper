# Ultra Route Sniper

Minimale, mobile-first Progressive Web App (PWA) fuer Unsupported Ultra-Cycling.
Die App laedt eine GPX-Route, bestimmt die aktuelle Position auf der Strecke und
scannt relevante POIs entlang eines Korridors.

## Funktionen

- GPX-Upload + lokale Speicherung per IndexedDB (nach erstem Laden offline nutzbar)
- Live-Ortung und Routen-Matching (`km auf der Route`)
- POI-Scan via Overpass API (Unterkunft, Tankstelle, Food-Kategorien, Wasser, Camping, Shelter)
- Einstellbare Korridorbreite entlang der Route (1-10 km)
- Planungsmodus (`ab km 0`) und Unterwegs-Modus (`ab aktueller Position`)
- In-App-Kartenansicht mit Kategorien-Markern und optionalem Unpaved-Overlay
- Sprachumschaltung in der App: `DE`, `EN`, `FR`, `IT`

## Technik

- Vanilla `HTML`, `CSS`, `JavaScript`
- Leaflet fuer Kartenanzeige
- Service Worker + Manifest fuer PWA-Installation und Offline-Shell

## Lokaler Start

Ordner ueber einen statischen Webserver ausliefern.
Fuer echte Ortung auf Mobilgeraeten im Produktivbetrieb ist HTTPS erforderlich.

Beispiel:

```bash
python3 -m http.server 8080
```

Danach:

- http://localhost:8080/

## Deployment

Als statische Dateien auf beliebiges Webhosting deployen.

Wichtig:

- HTTPS aktivieren (Geolocation wird bei HTTP blockiert)

## Datenschutz

- GPX-Daten bleiben lokal im Browser (IndexedDB).
- Standort wird nur auf ausdruecklichen Nutzerklick abgefragt.
- Keine Benutzerkonten und keine serverseitige Profilverwaltung notwendig.

## Spenden

Wenn dir das Projekt hilft, kannst du die Weiterentwicklung unterstuetzen:

- GitHub Sponsors: [github.com/sponsors/tomfischer72](https://github.com/sponsors/tomfischer72)
- PayPal: finalen Link hier eintragen

## Open Source

Lizenz: Apache-2.0. Siehe [`LICENSE`](LICENSE) und [`NOTICE`](NOTICE).

## Release-Flow

- `main` bleibt die stabile Linie.
- Neue Features in eigenen Branches entwickeln.
- Releases per Semantic Versioning taggen, z. B. `v1.1.0`, `v1.1.1`.

## Mitwirken

Bitte lies [`CONTRIBUTING.md`](CONTRIBUTING.md) und [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
