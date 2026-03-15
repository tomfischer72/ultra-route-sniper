# Ultra Route Sniper

Maintainer: Tom Fischer (@bikepeopletom)
Erstellt mit KI-Unterstuetzung (Cursor).

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

## Zweck

Ultra Route Sniper hilft bei der Verpflegungs- und Schlafplatzplanung auf langen
Strecken. Die App zeigt dir entlang deiner GPX-Route, was im naechsten Abschnitt
realistisch erreichbar ist.

## Technik

- Vanilla `HTML`, `CSS`, `JavaScript`
- Leaflet fuer Kartenanzeige
- Service Worker + Manifest fuer PWA-Installation und Offline-Shell

## Unpaved-Selektion (wie sie funktioniert)

Die Unpaved-Overlay-Erkennung ist bewusst konservativ, um Fehlmarkierungen zu reduzieren:

- Datenquelle: OSM `way["highway"]` im Segment-Bounding-Box (Overpass API)
- Als unpaved zaehlen primaer klare `surface`-Tags wie `gravel`, `dirt`, `ground`, `mud`, `sand`, `grass`
- Klar befestigte `surface`-Tags (z. B. `asphalt`, `concrete`, `paving_stones`) werden explizit ausgeschlossen
- `tracktype` wird nur fuer `grade4`/`grade5` als unpaved gewertet
- `highway=track` ohne eindeutige Tags wird nicht pauschal als unpaved behandelt
- Naehe-Matching zur Route: ca. 50 m
- Sehr kurze Fragmente (< 250 m) werden als Rauschen verworfen
- In der Kartenansicht kann zwischen `Konservativ` und `Normal` gewechselt werden:
  - `Konservativ`: engeres Naehe-Matching (ca. 30 m), laengere Mindestsegmente,
    und strengere Weg-Filter (z. B. keine reinen Fusswege ohne Bike-Freigabe)
  - `Normal`: mehr Treffer, aber auch mehr potenzielle Fehlmarkierungen

## Lokaler Start

Ordner ueber einen statischen Webserver ausliefern.
Fuer echte Ortung auf Mobilgeraeten im Produktivbetrieb ist HTTPS erforderlich.

Beispiel:

```bash
python3 -m http.server 8080
```

Danach:

- http://localhost:8080/

## Kurzanleitung (Bedienung)

1. GPX laden (`1. GPX-Strecke laden`)
2. Standort bestimmen (`2. Ortung`)
3. Modus waehlen (`Ab Routenstart` oder `Ab aktuellem Standort`)
4. Suchbereich und Korridor setzen
5. POI-Filter waehlen und `POIs suchen`
6. Ergebnisse in Liste oder Karte pruefen

Hinweis:
- In den Einstellungen oben kannst du deine bevorzugte Navigations-App waehlen
  (`Standard`, `Mapy`, `Google Maps`, `Apple Karten`).
- Mapy (App und Desktop) eignet sich sehr gut in Kombination mit Ultra Route Sniper
  fuer die Planung auf langen Routen.

## Deployment

Als statische Dateien auf beliebiges Webhosting deployen.

Wichtig:

- HTTPS aktivieren (Geolocation wird bei HTTP blockiert)

## Datenschutz

- GPX-Daten bleiben lokal im Browser (IndexedDB).
- Standort wird nur auf ausdruecklichen Nutzerklick abgefragt.
- Keine Benutzerkonten und keine serverseitige Profilverwaltung notwendig.
- Rechtliche Hinweise fuer das Live-Deployment:
  - Impressum: [routesniper.ch/impressum.html](https://routesniper.ch/impressum.html)
  - Datenschutz: [routesniper.ch/datenschutz.html](https://routesniper.ch/datenschutz.html)

## Spenden

Wenn dir das Projekt hilft, kannst du die Weiterentwicklung unterstuetzen:

- GitHub Sponsors: [github.com/sponsors/tomfischer72](https://github.com/sponsors/tomfischer72)
- PayPal: [paypal.com/ncp/payment/S2AXHB5B3TGC6](https://www.paypal.com/ncp/payment/S2AXHB5B3TGC6)
- Revolut: [revolut.me/thomase8r](https://revolut.me/thomase8r)
- Jeder Beitrag hilft, das Projekt fuer die Ultra-Cycling-Community weiterzufuehren.

## Open Source

Lizenz: Apache-2.0. Siehe [`LICENSE`](LICENSE) und [`NOTICE`](NOTICE).

## Release-Flow

- Der Default-Branch (`master`) bleibt die stabile Linie.
- Neue Features in eigenen Branches entwickeln.
- Releases per Semantic Versioning taggen, z. B. `v1.1.0`, `v1.1.1`.

## Mitwirken

Bitte lies [`CONTRIBUTING.md`](CONTRIBUTING.md) und [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
