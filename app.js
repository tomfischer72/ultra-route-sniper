// app.js - core logic for Ultra Route Sniper

const DB_NAME = "ultra-route-sniper";
const DB_VERSION = 1;
const GPX_STORE = "gpxTracks";
const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const DEFAULT_POI_FILTERS = [
  "lodging",
  "fuel",
  "grocery",
  "restaurant",
  "cafe",
  "fastfood",
  "water",
  "camping",
  "shelter",
];
const DEFAULT_RANGE_BY_MODE = {
  plan: { startKm: 50, endKm: 120 },
  live: { startKm: 80, endKm: 120 },
};

let db;
let routePoints = []; // { lat, lon, cumDistKm }
let lastGeoPosition = null; // { lat, lon }
let lastRouteMatch = null; // { kmOnRoute, distanceToRouteKm }
let activePoiFilters = new Set(DEFAULT_POI_FILTERS);
let lastScanResults = [];
let lastScanSegmentPoints = [];
let lastScanRange = null; // { startKmAhead, endKmAhead, corridorWidthKm }
let mapInstance = null;
let mapRouteLayer = null;
let mapRouteCasingLayer = null;
let mapUnpavedLayer = null;
let mapPoiLayer = null;
let mapStartEndLayer = null;
let mapPoiMarkerByKey = new Map();
let mapTileLayer = null;
let mapBaseLayers = null;
let mapLegendControl = null;
let currentTileProviderName = "OpenStreetMap";
let tileErrorCount = 0;
let hasSwitchedTileProvider = false;
let surfaceAnalysisToken = 0;
const surfaceOverlayCache = new Map();
let showUnpavedOverlay = true;
let activeRangeMode = "plan"; // plan | live

const POI_CATEGORY_COLORS = {
  lodging: "#3b82f6",
  fuel: "#f59e0b",
  grocery: "#ef4444",
  restaurant: "#dc2626",
  cafe: "#d97706",
  fastfood: "#b91c1c",
  water: "#06b6d4",
  camping: "#22c55e",
  shelter: "#a855f7",
  other: "#9ca3af",
};

const UNPAVED_SURFACE_COLOR = "#f97316";
const UNPAVED_SURFACES = new Set([
  "unpaved",
  "gravel",
  "fine_gravel",
  "compacted",
  "dirt",
  "ground",
  "earth",
  "mud",
  "sand",
  "grass",
  "grass_paver",
  "pebblestone",
  "woodchips",
]);

const TILE_PROVIDERS = {
  OpenStreetMap: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    },
  },
  CartoLight: {
    url: "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    options: {
      maxZoom: 20,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CARTO',
    },
  },
};

const SUPPORTED_LANGUAGES = ["de", "en", "fr", "it"];
const I18N = {
  de: {
    "app.title": "Ultra Route Sniper",
    "app.subtitle": "Offline PWA · GPX · Sniper-Mode",
    "app.languageLabel": "Sprache",
    "upload.title": "1. GPX-Strecke laden",
    "upload.hint":
      "Einmal deine Renn-GPX-Datei laden, dann bleibt sie lokal gespeichert (offline nutzbar).",
    "upload.chooseFile": "Datei wählen",
    "upload.useStored": "Gespeicherte Strecke nutzen",
    "location.title": "2. Ortung",
    "location.hint":
      "Großer Button = aktuelle Position bestimmen (HTML5 Geolocation).",
    "location.startButton": "Ortung starten",
    "sniper.title": "3. Sniper-Modus",
    "sniper.hint":
      "Scannt die nächsten Kilometer entlang der Route nach Unterkünften, Tankstellen & Versorgungsstellen.",
    "sniper.modePlan": "Planung (ab km 0)",
    "sniper.modeLive": "Unterwegs (ab jetzt)",
    "sniper.modePlanHint": "Planung: Suchfenster relativ zum Routenstart.",
    "sniper.modeLiveHint":
      "Unterwegs: Suchfenster relativ zur aktuellen Position auf der Route.",
    "sniper.windowLabel": "Nächste Kilometer entlang der Route:",
    "sniper.corridorLabel": "Korridorbreite seitlich der Route:",
    "sniper.corridorRange": "km (1-10)",
    "sniper.scanButton": "POI-Scan starten",
    "sniper.filterTitle": "POI-Filter (antippen zum Ein/Ausblenden):",
    "sniper.showMapButton": "In Karte zeigen",
    "map.backToList": "Zur Liste",
    "map.unpavedToggle": "Unbefestigt",
    "map.title": "Kartenansicht",
    "poi.lodging": "Unterkunft",
    "poi.fuel": "Tankstelle",
    "poi.grocery": "Shop",
    "poi.restaurant": "Restaurant",
    "poi.cafe": "Cafe/Baeckerei",
    "poi.fastfood": "Fast Food",
    "poi.water": "Wasser",
    "poi.camping": "Camping",
    "poi.shelter": "Shelter",
    "poi.other": "POI",
    "poi.call": "Anrufen",
    "poi.openMaps": "In Maps öffnen",
    "poi.onMap": "Auf Karte",
    "status.modeChanged": "Suchmodus gewechselt. Bitte POI-Scan neu starten.",
    "status.noFilterSelected":
      "Keine Filter aktiv - bitte mindestens eine Kategorie wählen.",
    "status.activeCategories": "Aktive Kategorien: {categories}",
    "status.dbInitError":
      "Fehler beim Initialisieren des lokalen Speichers.",
    "status.noStoredTrack":
      "Noch keine Strecke gespeichert. Bitte GPX laden.",
    "status.storedTrackFound":
      "Gespeicherte Strecke gefunden ({points} Punkte).",
    "status.storedTrackLoaded":
      "Gespeicherte Strecke geladen ({points} Punkte).",
    "status.storedTrackLoadError":
      "Fehler beim Laden der gespeicherten Strecke.",
    "status.readingGpx": "Lese GPX-Datei ...",
    "status.gpxNoPoints":
      "Keine gültigen Trackpunkte in der GPX-Datei gefunden.",
    "status.gpxLoaded":
      "Strecke geladen und gespeichert ({points} Punkte, Gesamtlänge ca. {km} km).",
    "status.gpxParseError": "Fehler beim Parsen der GPX-Datei.",
    "status.gpxReadError": "Fehler beim Lesen der Datei.",
    "status.geoUnsupported":
      "Geolocation wird von diesem Gerät nicht unterstützt.",
    "status.geoLocating": "Bestimme aktuelle Position ...",
    "status.geoPosition": "Lat: {lat}, Lon: {lon} (+/-{acc} m)",
    "status.geoDenied":
      "Ortungszugriff verweigert. Bitte im Browser erlauben.",
    "status.geoTimeout":
      "Ortung hat zu lange gedauert. Nochmal versuchen.",
    "status.geoGeneric": "Fehler bei der Ortung.",
    "status.routeMissing":
      "Noch keine Strecke im Speicher. Bitte zuerst GPX laden oder gespeicherte Strecke aktivieren.",
    "status.routeUnknown":
      "Konnte Position auf der Route nicht bestimmen.",
    "status.routeNear": "Du liegst sehr nah an der Strecke.",
    "status.routeAway": "Abstand zur Strecke ca. {km} km.",
    "status.routePosition":
      "Position auf der Route: km {km}. {distanceText}",
    "status.liveNeedsLocation":
      "Keine aktuelle Position auf der Route bekannt. Bitte zuerst Ortung starten.",
    "status.invalidRange": "Bitte gültige Kilometerangaben eingeben.",
    "status.invalidRangeOrder":
      "Der Endwert muss größer als der Startwert sein.",
    "status.routeLengthUnknown":
      "Streckenlänge unbekannt (GPX nicht geladen?).",
    "status.windowOutside":
      "Fenster außerhalb der Strecke ({mode}). Referenz km {ref} von {total} (Rest: {rest} km).",
    "status.scanning":
      "Scanne {mode}: km {start} bis {end} ...",
    "status.noSegmentPoints":
      "Keine Punkte im gewählten Abschnitt gefunden.",
    "status.noPois":
      "Keine passenden POIs im gewählten Korridor gefunden.",
    "status.poisFound": "{count} Orte im Korridor gefunden.",
    "status.poiLoadError":
      "Fehler beim Laden der POIs (Overpass). Später erneut versuchen.",
    "status.mapNoScan":
      "Keine Scan-Daten vorhanden. Bitte zuerst einen POI-Scan starten.",
    "status.mapUnavailable":
      "Karte konnte nicht geladen werden (Leaflet nicht verfügbar).",
    "status.mapNeedScan": "Bitte zuerst einen POI-Scan starten.",
    "status.mapTilesLoaded": "Basemap: {provider} | Tiles geladen",
    "status.mapTileErrors": "Basemap: {provider} | Tile-Fehler: {count}",
    "status.mapTileSwitched":
      "Basemap gewechselt (Tile-Fehler). Bitte Netz/CSP prüfen.",
    "status.mapTileBlocked":
      "Karten-Tiles blockiert. Externe Domains im Hosting prüfen.",
    "status.mapUnpavedAnalyzing":
      "Basemap: {provider} | analysiere Untergrund ...",
    "status.mapUnpavedKm":
      "Basemap: {provider} | Unbefestigt ~{km} km",
    "status.mapUnpavedUnavailable":
      "Basemap: {provider} | Untergrund-Analyse nicht verfügbar",
    "status.mapUnpavedOn":
      "Basemap: {provider} | Unbefestigt eingeblendet",
    "status.mapUnpavedOff":
      "Basemap: {provider} | Unbefestigt ausgeblendet",
    "status.mapScanMeta":
      "Basemap: {provider} | Routepunkte: {routePoints} | POIs: {poiCount}",
    "map.legendRoute": "Route",
    "map.legendUnpaved": "Unbefestigt",
    "map.legendLodging": "Unterkunft",
    "map.legendFuel": "Tankstelle",
    "map.legendGrocery": "Shop",
    "map.legendRestaurant": "Restaurant",
    "map.legendCafe": "Cafe/Baeckerei",
    "map.legendFastfood": "Fast Food",
    "map.legendWater": "Wasser",
    "map.legendCamping": "Camping",
    "map.legendShelter": "Shelter",
    "map.scanWindowTitle":
      "{mode} | Fenster {start}-{end} km | Breite {corridor} km",
    "map.modePlan": "Planung ab km 0",
    "map.modeLive": "Unterwegs ab km {ref}",
    "map.startTooltip": "Start Suchfenster",
    "map.endTooltip": "Ende Suchfenster",
    "poi.popupDistance": "{distance} km voraus",
    "poi.popupNoNumber": "Keine Nummer",
  },
  en: {},
  fr: {},
  it: {},
};

I18N.en = {
  ...I18N.de,
  "app.languageLabel": "Language",
  "upload.title": "1. Load GPX route",
  "upload.hint":
    "Load your race GPX once, then keep it stored locally for offline use.",
  "upload.chooseFile": "Choose file",
  "upload.useStored": "Use stored route",
  "location.title": "2. Location",
  "location.hint":
    "Big button = get current position (HTML5 Geolocation).",
  "location.startButton": "Start location",
  "sniper.title": "3. Sniper mode",
  "sniper.modePlan": "Planning (from km 0)",
  "sniper.modeLive": "On route (from now)",
  "sniper.modePlanHint": "Planning: window relative to route start.",
  "sniper.modeLiveHint":
    "On route: window relative to current position on route.",
  "sniper.windowLabel": "Next kilometers along the route:",
  "sniper.corridorLabel": "Corridor width beside route:",
  "sniper.scanButton": "Start POI scan",
  "sniper.filterTitle": "POI filters (tap to toggle):",
  "sniper.showMapButton": "Show on map",
  "map.backToList": "Back to list",
  "map.unpavedToggle": "Unpaved",
  "map.title": "Map view",
  "poi.lodging": "Lodging",
  "poi.fuel": "Fuel",
  "poi.grocery": "Shop",
  "poi.restaurant": "Restaurant",
  "poi.cafe": "Cafe/Bakery",
  "poi.fastfood": "Fast Food",
  "poi.water": "Water",
  "poi.camping": "Camping",
  "poi.shelter": "Shelter",
  "poi.call": "Call",
  "poi.openMaps": "Open in Maps",
  "poi.onMap": "On map",
  "status.mapScanMeta":
    "Basemap: {provider} | Route points: {routePoints} | POIs: {poiCount}",
};
I18N.fr = {
  ...I18N.en,
  "app.languageLabel": "Langue",
  "upload.title": "1. Charger l'itineraire GPX",
  "upload.chooseFile": "Choisir un fichier",
  "upload.useStored": "Utiliser l'itineraire enregistre",
  "location.title": "2. Position",
  "location.startButton": "Demarrer la localisation",
  "sniper.title": "3. Mode Sniper",
  "sniper.modePlan": "Planification (depuis km 0)",
  "sniper.modeLive": "En route (depuis maintenant)",
  "sniper.scanButton": "Lancer le scan POI",
  "sniper.showMapButton": "Afficher sur la carte",
  "map.backToList": "Retour a la liste",
};
I18N.it = {
  ...I18N.en,
  "app.languageLabel": "Lingua",
  "upload.title": "1. Carica traccia GPX",
  "upload.chooseFile": "Seleziona file",
  "upload.useStored": "Usa traccia salvata",
  "location.title": "2. Posizione",
  "location.startButton": "Avvia localizzazione",
  "sniper.title": "3. Modalita Sniper",
  "sniper.modePlan": "Pianificazione (da km 0)",
  "sniper.modeLive": "In corsa (da adesso)",
  "sniper.scanButton": "Avvia scansione POI",
  "sniper.showMapButton": "Mostra sulla mappa",
  "map.backToList": "Torna alla lista",
};

let currentLanguage = "de";

document.addEventListener("DOMContentLoaded", () => {
  initUI();
  initDB()
    .then(() => checkStoredGpx())
    .catch((err) => {
      console.error("DB init failed", err);
      setStatus("gpx-status", t("status.dbInitError"), "error");
    });
  registerServiceWorker();
});

function initUI() {
  const gpxInput = document.getElementById("gpx-file-input");
  const useStoredBtn = document.getElementById("use-stored-gpx-btn");
  const locateBtn = document.getElementById("locate-btn");
  const sniperBtn = document.getElementById("sniper-btn");
  const showMapBtn = document.getElementById("show-map-btn");
  const backToListBtn = document.getElementById("back-to-list-btn");
  const unpavedToggle = document.getElementById("unpaved-toggle");
  const filterContainer = document.querySelector(".poi-filters");
  const rangeModeContainer = document.querySelector(".range-mode");
  const languageSelect = document.getElementById("language-select");

  gpxInput.addEventListener("change", handleGpxFileSelect);
  useStoredBtn.addEventListener("click", async () => {
    await loadStoredGpxIntoMemory();
    updateSniperButtonState();
  });
  locateBtn.addEventListener("click", handleLocateClick);

  sniperBtn.addEventListener("click", handleSniperClick);
  showMapBtn.addEventListener("click", handleShowMapClick);
  backToListBtn.addEventListener("click", () => toggleMapView(false));
  if (unpavedToggle) {
    unpavedToggle.checked = showUnpavedOverlay;
    unpavedToggle.addEventListener("change", (event) => {
      showUnpavedOverlay = !!event.target.checked;
      if (showUnpavedOverlay && !mapUnpavedLayer && lastScanSegmentPoints.length) {
        updateUnpavedOverlay(getRenderableRouteLatLngs());
      } else {
        applyUnpavedVisibility();
      }
    });
  }

  if (filterContainer) {
    filterContainer.addEventListener("click", handleFilterClick);
  }
  if (rangeModeContainer) {
    rangeModeContainer.addEventListener("click", handleRangeModeClick);
  }
  if (languageSelect) {
    languageSelect.addEventListener("change", (event) => {
      setLanguage(event.target.value);
    });
  }
  initLanguage();
  applyRangeModeUI(false);
}

// ---------- STATUS HELPERS ----------

function initLanguage() {
  const stored = localStorage.getItem("ultraRouteSniperLang");
  const nav = (navigator.language || "de").slice(0, 2).toLowerCase();
  const selected = SUPPORTED_LANGUAGES.includes(stored)
    ? stored
    : SUPPORTED_LANGUAGES.includes(nav)
      ? nav
      : "de";
  setLanguage(selected);
}

function setLanguage(lang) {
  const normalized = SUPPORTED_LANGUAGES.includes(lang) ? lang : "de";
  currentLanguage = normalized;
  localStorage.setItem("ultraRouteSniperLang", normalized);
  document.documentElement.lang = normalized;

  const select = document.getElementById("language-select");
  if (select) select.value = normalized;

  applyStaticTranslations();
  applyRangeModeUI(false);
  if (lastScanResults.length) {
    renderPoiList(lastScanResults);
  }
  const mapView = document.getElementById("map-view");
  if (mapView && !mapView.classList.contains("hidden") && lastScanSegmentPoints.length) {
    renderMapForLastScan();
  }
}

function applyStaticTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });
}

function t(key, vars = {}) {
  const dict = I18N[currentLanguage] || I18N.de;
  const fallback = I18N.en[key] || I18N.de[key] || key;
  const raw = dict[key] || fallback;
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    raw,
  );
}

function setStatus(elementId, text, type) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = text;
  el.classList.remove("error", "info");
  if (type) {
    el.classList.add(type);
  }
}

function updateSniperButtonState() {
  const sniperBtn = document.getElementById("sniper-btn");
  if (!sniperBtn) return;
  const hasRoute = routePoints && routePoints.length > 0;
  const hasPosition = activeRangeMode === "live" ? !!lastRouteMatch : true;
  const hasFilters = activePoiFilters.size > 0;
  sniperBtn.disabled = !(hasRoute && hasPosition && hasFilters);
}

function handleFilterClick(event) {
  const target = event.target;
  if (!target.matches(".chip[data-poi-filter]")) return;

  const key = target.getAttribute("data-poi-filter");
  if (!key) return;

  if (activePoiFilters.has(key)) {
    activePoiFilters.delete(key);
    target.classList.remove("active");
  } else {
    activePoiFilters.add(key);
    target.classList.add("active");
  }

  const filterInfo =
    activePoiFilters.size === 0
      ? t("status.noFilterSelected")
      : t("status.activeCategories", {
          categories: Array.from(activePoiFilters)
            .map((c) => t(`poi.${c}`))
            .join(", "),
        });

  setStatus("sniper-status", filterInfo, "info");
  // Bereits gescannte Ergebnisse sind nach Filterwechsel ggf. veraltet.
  document.getElementById("show-map-btn").disabled = true;
  updateSniperButtonState();
}

function handleRangeModeClick(event) {
  const target = event.target;
  if (!target.matches(".chip[data-range-mode]")) return;

  const mode = target.getAttribute("data-range-mode");
  if (!mode || (mode !== "plan" && mode !== "live")) return;
  if (mode === activeRangeMode) return;

  activeRangeMode = mode;
  applyRangeModeUI(true);
  lastScanResults = [];
  lastScanSegmentPoints = [];
  lastScanRange = null;
  const showMapBtn = document.getElementById("show-map-btn");
  if (showMapBtn) showMapBtn.disabled = true;
  setStatus("sniper-status", t("status.modeChanged"), "info");
  updateSniperButtonState();
}

function applyRangeModeUI(applyDefaults) {
  const chips = document.querySelectorAll(".chip[data-range-mode]");
  chips.forEach((chip) => {
    chip.classList.toggle(
      "active",
      chip.getAttribute("data-range-mode") === activeRangeMode,
    );
  });

  const hint = document.getElementById("range-mode-hint");
  if (hint) {
    hint.textContent =
      activeRangeMode === "live"
        ? t("sniper.modeLiveHint")
        : t("sniper.modePlanHint");
  }

  if (applyDefaults) {
    const startInput = document.getElementById("range-start");
    const endInput = document.getElementById("range-end");
    const defaults = DEFAULT_RANGE_BY_MODE[activeRangeMode];
    if (startInput) startInput.value = String(defaults.startKm);
    if (endInput) endInput.value = String(defaults.endKm);
  }
}

function getCorridorWidthKm() {
  const input = document.getElementById("corridor-width");
  if (!input) return 2;
  let val = Number(input.value || 2);
  if (Number.isNaN(val)) val = 2;
  val = Math.max(1, Math.min(10, val));
  return val;
}

// ---------- INDEXEDDB ----------

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(GPX_STORE)) {
        db.createObjectStore(GPX_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve();
    };

    request.onerror = () => reject(request.error);
  });
}

function saveGpxToDB(parsed) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("DB not initialisiert"));
    const tx = db.transaction(GPX_STORE, "readwrite");
    const store = tx.objectStore(GPX_STORE);
    const record = {
      id: "main-route",
      createdAt: Date.now(),
      points: parsed,
    };
    const req = store.put(record);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function getStoredGpx() {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("DB not initialisiert"));
    const tx = db.transaction(GPX_STORE, "readonly");
    const store = tx.objectStore(GPX_STORE);
    const req = store.get("main-route");

    req.onsuccess = () => {
      resolve(req.result || null);
    };
    req.onerror = () => reject(req.error);
  });
}

async function checkStoredGpx() {
  try {
    const record = await getStoredGpx();
    const btn = document.getElementById("use-stored-gpx-btn");
    if (record && record.points && record.points.length > 0) {
      btn.disabled = false;
      setStatus(
        "gpx-status",
        t("status.storedTrackFound", { points: record.points.length }),
        "info",
      );
    } else {
      btn.disabled = true;
      setStatus(
        "gpx-status",
        t("status.noStoredTrack"),
      );
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadStoredGpxIntoMemory() {
  try {
    const record = await getStoredGpx();
    if (!record || !record.points || record.points.length === 0) {
      setStatus("gpx-status", t("status.noStoredTrack"), "error");
      return;
    }
    routePoints = record.points;
    setStatus(
      "gpx-status",
      t("status.storedTrackLoaded", { points: routePoints.length }),
      "info",
    );
  } catch (err) {
    console.error(err);
    setStatus(
      "gpx-status",
      t("status.storedTrackLoadError"),
      "error",
    );
  }
}

// ---------- GPX HANDLING ----------

function handleGpxFileSelect(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  setStatus("gpx-status", t("status.readingGpx"));

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const text = e.target.result;
      const parsed = parseGpx(text);
      if (!parsed || parsed.length === 0) {
        setStatus(
          "gpx-status",
          t("status.gpxNoPoints"),
          "error",
        );
        return;
      }
      routePoints = parsed;
      await saveGpxToDB(parsed);
      document.getElementById("use-stored-gpx-btn").disabled = false;
      setStatus(
        "gpx-status",
        t("status.gpxLoaded", {
          points: parsed.length,
          km: parsed[parsed.length - 1].cumDistKm.toFixed(1),
        }),
        "info",
      );
    } catch (err) {
      console.error(err);
      setStatus(
        "gpx-status",
        t("status.gpxParseError"),
        "error",
      );
    }
  };
  reader.onerror = () => {
    setStatus("gpx-status", t("status.gpxReadError"), "error");
  };
  reader.readAsText(file);
}

function parseGpx(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    console.error("GPX parsererror", parseError.textContent);
    throw new Error("GPX konnte nicht geparst werden");
  }

  const trkpts = Array.from(doc.getElementsByTagName("trkpt"));
  if (trkpts.length === 0) {
    // fallback: route points (rtept)
    const rtepts = Array.from(doc.getElementsByTagName("rtept"));
    return computeCumulativeDistances(rtepts);
  }

  return computeCumulativeDistances(trkpts);
}

function computeCumulativeDistances(pointElements) {
  const points = [];
  let cumDist = 0;
  let prev = null;

  for (const el of pointElements) {
    const lat = parseFloat(el.getAttribute("lat"));
    const lon = parseFloat(el.getAttribute("lon"));
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;

    if (prev) {
      const d = haversineKm(prev.lat, prev.lon, lat, lon);
      cumDist += d;
    }
    prev = { lat, lon };

    points.push({
      lat,
      lon,
      cumDistKm: cumDist,
    });
  }

  return points;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ---------- ROUTE MATCHING ----------

/**
 * Sehr einfache Nearest-Point-Logik:
 * - sucht nächsten Trackpunkt nach Luftlinie
 * - liefert Kilometerposition entlang der Route
 */
function getRoutePositionForLocation(lat, lon) {
  if (!routePoints || routePoints.length === 0) {
    return null;
  }

  let bestIndex = 0;
  let bestDist = Infinity;

  for (let i = 0; i < routePoints.length; i += 5) {
    // jeden 5. Punkt als grobes Sampling (Performance)
    const p = routePoints[i];
    const d = haversineKm(lat, lon, p.lat, p.lon);
    if (d < bestDist) {
      bestDist = d;
      bestIndex = i;
    }
  }

  const nearest = routePoints[bestIndex];
  return {
    kmOnRoute: nearest.cumDistKm,
    distanceToRouteKm: bestDist,
  };
}

function getRouteSegmentBetweenKm(startKm, endKm) {
  if (!routePoints || routePoints.length === 0) return [];
  const s = Math.max(0, Math.min(startKm, endKm));
  const e = Math.max(startKm, endKm);
  return routePoints.filter(
    (p) => p.cumDistKm >= s && p.cumDistKm <= e,
  );
}

function findNearestRouteKmForLatLon(lat, lon) {
  if (!routePoints || routePoints.length === 0) return null;
  let bestKm = 0;
  let bestDist = Infinity;

  for (let i = 0; i < routePoints.length; i += 5) {
    const p = routePoints[i];
    const d = haversineKm(lat, lon, p.lat, p.lon);
    if (d < bestDist) {
      bestDist = d;
      bestKm = p.cumDistKm;
    }
  }

  return { kmOnRoute: bestKm, distanceToRouteKm: bestDist };
}

// ---------- HTML5 GEOLOCATION ----------

function handleLocateClick() {
  if (!("geolocation" in navigator)) {
    setStatus("location-status", t("status.geoUnsupported"), "error");
    return;
  }

  setStatus("location-status", t("status.geoLocating"));

  const btn = document.getElementById("locate-btn");
  btn.disabled = true;

  const options = {
    enableHighAccuracy: true,
    maximumAge: 15000,
    timeout: 15000,
  };

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      btn.disabled = false;
      const { latitude, longitude, accuracy } = pos.coords;
      setStatus(
        "location-status",
        t("status.geoPosition", {
          lat: latitude.toFixed(5),
          lon: longitude.toFixed(5),
          acc: Math.round(accuracy),
        }),
        "info",
      );
      updateRoutePosition(latitude, longitude);
    },
    (err) => {
      btn.disabled = false;
      console.error(err);
      let msg = t("status.geoGeneric");
      if (err.code === err.PERMISSION_DENIED) {
        msg = t("status.geoDenied");
      } else if (err.code === err.TIMEOUT) {
        msg = t("status.geoTimeout");
      }
      setStatus("location-status", msg, "error");
    },
    options,
  );
}

function updateRoutePosition(lat, lon) {
  if (!routePoints || routePoints.length === 0) {
    setStatus(
      "route-position",
      t("status.routeMissing"),
      "error",
    );
    return;
  }

  const match = getRoutePositionForLocation(lat, lon);
  if (!match) {
    setStatus(
      "route-position",
      t("status.routeUnknown"),
      "error",
    );
    return;
  }

  lastGeoPosition = { lat, lon };
  lastRouteMatch = match;

  const { kmOnRoute, distanceToRouteKm } = match;
  const distanceDisplay =
    distanceToRouteKm < 0.05
      ? t("status.routeNear")
      : t("status.routeAway", { km: distanceToRouteKm.toFixed(2) });

  setStatus(
    "route-position",
    t("status.routePosition", {
      km: kmOnRoute.toFixed(1),
      distanceText: distanceDisplay,
    }),
    "info",
  );

  updateSniperButtonState();
}

// ---------- SNIPER MODE (POI SCAN) ----------

async function handleSniperClick() {
  if (activeRangeMode === "live" && (!lastRouteMatch || !lastGeoPosition)) {
    setStatus(
      "sniper-status",
      t("status.liveNeedsLocation"),
      "error",
    );
    return;
  }

  const rangeStartInput = document.getElementById("range-start");
  const rangeEndInput = document.getElementById("range-end");
  const poiList = document.getElementById("poi-list");
  const showMapBtn = document.getElementById("show-map-btn");

  const startKmAhead = Number(rangeStartInput.value || 0);
  const endKmAhead = Number(rangeEndInput.value || 0);

  if (Number.isNaN(startKmAhead) || Number.isNaN(endKmAhead)) {
    setStatus(
      "sniper-status",
      t("status.invalidRange"),
      "error",
    );
    return;
  }

  if (endKmAhead <= startKmAhead) {
    setStatus(
      "sniper-status",
      t("status.invalidRangeOrder"),
      "error",
    );
    return;
  }

  const routeTotalKm =
    routePoints && routePoints.length
      ? routePoints[routePoints.length - 1].cumDistKm
      : 0;
  const referenceKm =
    activeRangeMode === "live" ? lastRouteMatch.kmOnRoute || 0 : 0;
  const modeLabel =
    activeRangeMode === "live" ? t("map.modeLive", { ref: referenceKm.toFixed(1) }) : t("map.modePlan");

  const segmentStartKm = referenceKm + startKmAhead;
  const segmentEndKm = Math.min(referenceKm + endKmAhead, routeTotalKm);

  if (!routeTotalKm) {
    setStatus(
      "sniper-status",
      t("status.routeLengthUnknown"),
      "error",
    );
    return;
  }

  if (segmentEndKm <= segmentStartKm) {
    const remainingKm = Math.max(0, routeTotalKm - referenceKm);
    setStatus(
      "sniper-status",
      t("status.windowOutside", {
        mode: modeLabel,
        ref: referenceKm.toFixed(1),
        total: routeTotalKm.toFixed(1),
        rest: remainingKm.toFixed(1),
      }),
      "error",
    );
    return;
  }

  poiList.innerHTML = "";
  showMapBtn.disabled = true;
  setStatus(
    "sniper-status",
    t("status.scanning", {
      mode: modeLabel,
      start: segmentStartKm.toFixed(1),
      end: segmentEndKm.toFixed(1),
    }),
    "info",
  );

  const sniperBtn = document.getElementById("sniper-btn");
  sniperBtn.disabled = true;

  try {
    const segmentPoints = getRouteSegmentBetweenKm(
      segmentStartKm,
      segmentEndKm,
    );
    if (!segmentPoints.length) {
      setStatus(
        "sniper-status",
        t("status.noSegmentPoints"),
        "error",
      );
      sniperBtn.disabled = false;
      return;
    }

    const bbox = computeBoundingBox(segmentPoints);
    const overpassPois = await fetchOverpassPois(bbox);
    const corridorWidthKm = getCorridorWidthKm();

    const filtered = overpassPois
      .map((poi) => {
        const nearest = findNearestRouteKmForLatLon(poi.lat, poi.lon);
        if (!nearest) return null;
        return {
          ...poi,
          kmOnRoute: nearest.kmOnRoute,
          distanceToRouteKm: nearest.distanceToRouteKm,
          distanceAheadKm: nearest.kmOnRoute - referenceKm,
        };
      })
      .filter(
        (p) =>
          p &&
          activePoiFilters.has(p.category) &&
          p.distanceToRouteKm <= corridorWidthKm &&
          p.distanceAheadKm >= startKmAhead &&
          p.distanceAheadKm <= endKmAhead,
      )
      .sort((a, b) => a.distanceAheadKm - b.distanceAheadKm);

    lastScanResults = filtered;
    lastScanSegmentPoints = segmentPoints;
    lastScanRange = {
      startKmAhead,
      endKmAhead,
      corridorWidthKm,
      mode: activeRangeMode,
      referenceKm,
    };

    renderPoiList(filtered);

    if (!filtered.length) {
      setStatus(
        "sniper-status",
        t("status.noPois"),
        "info",
      );
      showMapBtn.disabled = true;
    } else {
      setStatus(
        "sniper-status",
        t("status.poisFound", { count: filtered.length }),
        "info",
      );
      showMapBtn.disabled = false;
    }
  } catch (err) {
    console.error(err);
    setStatus(
      "sniper-status",
      t("status.poiLoadError"),
      "error",
    );
  } finally {
    sniperBtn.disabled = false;
  }
}

function computeBoundingBox(points) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }

  return { minLat, maxLat, minLon, maxLon };
}

async function fetchOverpassPois(bbox) {
  const { minLat, maxLat, minLon, maxLon } = bbox;

  const query = `
    [out:json][timeout:25];
    (
      // Unterkünfte
      node["tourism"="hotel"](${minLat},${minLon},${maxLat},${maxLon});
      node["tourism"="motel"](${minLat},${minLon},${maxLat},${maxLon});
      node["tourism"="guest_house"](${minLat},${minLon},${maxLat},${maxLon});
      node["tourism"="hostel"](${minLat},${minLon},${maxLat},${maxLon});
      node["tourism"="apartment"](${minLat},${minLon},${maxLat},${maxLon});

      // Tankstellen
      node["amenity"="fuel"](${minLat},${minLon},${maxLat},${maxLon});

      // Versorgung: Shops, Restaurants, Cafes
      node["shop"="supermarket"](${minLat},${minLon},${maxLat},${maxLon});
      node["shop"="convenience"](${minLat},${minLon},${maxLat},${maxLon});
      node["shop"="grocery"](${minLat},${minLon},${maxLat},${maxLon});
      node["amenity"="restaurant"](${minLat},${minLon},${maxLat},${maxLon});
      node["amenity"="cafe"](${minLat},${minLon},${maxLat},${maxLon});
      node["shop"="bakery"](${minLat},${minLon},${maxLat},${maxLon});
      node["amenity"="fast_food"](${minLat},${minLon},${maxLat},${maxLon});

      // Wasser
      node["amenity"="drinking_water"](${minLat},${minLon},${maxLat},${maxLon});
      node["amenity"="fountain"](${minLat},${minLon},${maxLat},${maxLon});

      // Camping
      node["tourism"="camp_site"](${minLat},${minLon},${maxLat},${maxLon});
      node["tourism"="caravan_site"](${minLat},${minLon},${maxLat},${maxLon});

      // Shelters / Hütten
      node["amenity"="shelter"](${minLat},${minLon},${maxLat},${maxLon});
      node["tourism"="alpine_hut"](${minLat},${minLon},${maxLat},${maxLon});
      node["tourism"="wilderness_hut"](${minLat},${minLon},${maxLat},${maxLon});
      node["amenity"="hut"](${minLat},${minLon},${maxLat},${maxLon});
    );
    out body;
  `;

  const response = await fetch(OVERPASS_ENDPOINT, {
    method: "POST",
    body: query,
    headers: {
      "Content-Type": "text/plain;charset=UTF-8",
    },
  });

  if (!response.ok) {
    throw new Error(`Overpass error: ${response.status}`);
  }

  const data = await response.json();
  if (!data.elements) return [];

  return data.elements
    .filter((el) => el.type === "node" && typeof el.lat === "number" && typeof el.lon === "number")
    .map((el) => {
      const tags = el.tags || {};
      const name =
        tags.name ||
        tags.ref ||
        (tags.tourism === "hotel"
          ? "Hotel"
          : tags.tourism === "motel"
          ? "Motel"
          : tags.amenity === "fuel"
          ? t("poi.fuel")
          : tags.amenity === "shelter"
          ? t("poi.shelter")
          : tags.tourism === "alpine_hut"
          ? "Alpine Hut"
          : t("poi.other"));

      // Kategorien für Filter
      let category = "other";
      let typeKey = "poi.other";

      if (
        tags.tourism === "hotel" ||
        tags.tourism === "motel" ||
        tags.tourism === "guest_house" ||
        tags.tourism === "hostel" ||
        tags.tourism === "apartment"
      ) {
        category = "lodging";
        typeKey = "poi.lodging";
      } else if (tags.amenity === "fuel") {
        category = "fuel";
        typeKey = "poi.fuel";
      } else if (
        tags.shop === "supermarket" ||
        tags.shop === "convenience" ||
        tags.shop === "grocery"
      ) {
        category = "grocery";
        typeKey = "poi.grocery";
      } else if (tags.amenity === "restaurant") {
        category = "restaurant";
        typeKey = "poi.restaurant";
      } else if (tags.amenity === "cafe" || tags.shop === "bakery") {
        category = "cafe";
        typeKey = "poi.cafe";
      } else if (tags.amenity === "fast_food") {
        category = "fastfood";
        typeKey = "poi.fastfood";
      } else if (
        tags.amenity === "drinking_water" ||
        tags.amenity === "fountain"
      ) {
        category = "water";
        typeKey = "poi.water";
      } else if (
        tags.tourism === "camp_site" ||
        tags.tourism === "caravan_site"
      ) {
        category = "camping";
        typeKey = "poi.camping";
      } else if (
        tags.amenity === "shelter" ||
        tags.tourism === "alpine_hut" ||
        tags.tourism === "wilderness_hut" ||
        tags.amenity === "hut"
      ) {
        category = "shelter";
        typeKey = "poi.shelter";
      }

      const phone = tags.phone || tags["contact:phone"] || null;

      return {
        id: el.id,
        lat: el.lat,
        lon: el.lon,
        name,
        typeKey,
        category,
        phone,
      };
    });
}

function renderPoiList(pois) {
  const list = document.getElementById("poi-list");
  list.innerHTML = "";

  pois.forEach((poi) => {
    const li = document.createElement("li");
    li.className = "poi-item";

    const mainLine = document.createElement("div");
    mainLine.className = "poi-line-main";

    const distanceSpan = document.createElement("span");
    distanceSpan.className = "poi-distance";
    distanceSpan.textContent = `${poi.distanceAheadKm.toFixed(1)} km`;

    const nameSpan = document.createElement("span");
    nameSpan.className = "poi-name";
    nameSpan.textContent = poi.name;

    const typeSpan = document.createElement("span");
    typeSpan.className = "poi-type";
    typeSpan.textContent = t(poi.typeKey || `poi.${poi.category}` || "poi.other");

    mainLine.appendChild(distanceSpan);
    mainLine.appendChild(nameSpan);
    mainLine.appendChild(typeSpan);

    const actions = document.createElement("div");
    actions.className = "poi-actions";

    const callLink = document.createElement("a");
    const callBtn = document.createElement("button");
    callBtn.className = "btn secondary poi-action-btn";
    callBtn.textContent = t("poi.call");

    if (poi.phone) {
      callLink.href = `tel:${poi.phone.replace(/\s+/g, "")}`;
    } else {
      callLink.href = "tel:";
      callBtn.style.opacity = "0.5";
    }

    callLink.appendChild(callBtn);

    const mapsLink = document.createElement("a");
    const mapsBtn = document.createElement("button");
    mapsBtn.className = "btn primary poi-action-btn";
    mapsBtn.textContent = t("poi.openMaps");
    const label = encodeURIComponent(poi.name);
    mapsLink.href = `geo:${poi.lat},${poi.lon}?q=${poi.lat},${poi.lon}(${label})`;

    mapsLink.appendChild(mapsBtn);

    const mapViewBtn = document.createElement("button");
    mapViewBtn.className = "btn secondary poi-action-btn";
    mapViewBtn.textContent = t("poi.onMap");
    mapViewBtn.addEventListener("click", () => showPoiOnMapFromList(poi));

    actions.appendChild(callLink);
    actions.appendChild(mapsLink);
    actions.appendChild(mapViewBtn);

    li.appendChild(mainLine);
    li.appendChild(actions);

    list.appendChild(li);
  });
}

// ---------- MAP VIEW ----------

function toggleMapView(show) {
  const mapView = document.getElementById("map-view");
  if (!mapView) return;

  mapView.classList.toggle("hidden", !show);
  mapView.setAttribute("aria-hidden", show ? "false" : "true");
}

function handleShowMapClick() {
  if (!lastScanResults.length || !lastScanSegmentPoints.length) {
    setStatus(
      "sniper-status",
      t("status.mapNoScan"),
      "error",
    );
    return;
  }

  if (typeof L === "undefined") {
    setStatus(
      "sniper-status",
      t("status.mapUnavailable"),
      "error",
    );
    return;
  }

  toggleMapView(true);
  renderMapForLastScan();
}

function showPoiOnMapFromList(poi) {
  if (!lastScanResults.length || !lastScanSegmentPoints.length) {
    setStatus(
      "sniper-status",
      t("status.mapNeedScan"),
      "error",
    );
    return;
  }

  toggleMapView(true);
  renderMapForLastScan();

  const marker = mapPoiMarkerByKey.get(getPoiKey(poi));
  if (!marker || !mapInstance) return;

  mapInstance.setView(marker.getLatLng(), Math.max(mapInstance.getZoom(), 13), {
    animate: true,
  });
  marker.openPopup();
}

function renderMapForLastScan() {
  const mapContainer = document.getElementById("map-container");
  const mapTitle = document.getElementById("map-view-title");
  if (!mapContainer) return;

  if (!mapInstance) {
    mapInstance = L.map("map-container", {
      zoomControl: true,
      preferCanvas: true,
    });
    initMapBaseLayers();
  }

  if (mapRouteLayer) mapInstance.removeLayer(mapRouteLayer);
  if (mapRouteCasingLayer) mapInstance.removeLayer(mapRouteCasingLayer);
  if (mapUnpavedLayer) mapInstance.removeLayer(mapUnpavedLayer);
  if (mapPoiLayer) mapInstance.removeLayer(mapPoiLayer);
  if (mapStartEndLayer) mapInstance.removeLayer(mapStartEndLayer);
  mapPoiMarkerByKey = new Map();

  const routeLatLngs = getRenderableRouteLatLngs();
  mapRouteCasingLayer = L.polyline(routeLatLngs, {
    color: "#052e16",
    weight: 8,
    opacity: 0.95,
  }).addTo(mapInstance);

  mapRouteLayer = L.polyline(routeLatLngs, {
    color: "#22c55e",
    weight: 5,
    opacity: 1,
  }).addTo(mapInstance);

  const start = routeLatLngs[0];
  const end = routeLatLngs[routeLatLngs.length - 1];
  mapStartEndLayer = L.layerGroup([
    L.circleMarker(start, {
      radius: 7,
      color: "#22c55e",
      fillColor: "#22c55e",
      fillOpacity: 1,
      weight: 2,
    }).bindTooltip(t("map.startTooltip")),
    L.circleMarker(end, {
      radius: 7,
      color: "#ef4444",
      fillColor: "#ef4444",
      fillOpacity: 1,
      weight: 2,
    }).bindTooltip(t("map.endTooltip")),
  ]).addTo(mapInstance);

  mapPoiLayer = L.layerGroup();
  lastScanResults.forEach((poi) => {
    const poiKey = getPoiKey(poi);
    const color = POI_CATEGORY_COLORS[poi.category] || POI_CATEGORY_COLORS.other;
    const marker = L.circleMarker([poi.lat, poi.lon], {
      radius: 7,
      color,
      fillColor: color,
      fillOpacity: 0.95,
      weight: 2,
    });

    marker.bindPopup(buildPoiPopupHtml(poi), {
      autoPan: true,
      closeButton: true,
    });
    mapPoiMarkerByKey.set(poiKey, marker);
    mapPoiLayer.addLayer(marker);
  });
  mapPoiLayer.addTo(mapInstance);
  addOrUpdateMapLegend();
  updateUnpavedOverlay(routeLatLngs);

  // Robust bounds calculation (LayerGroup cannot be passed directly to FeatureGroup bounds).
  const bounds = L.latLngBounds(routeLatLngs);
  mapStartEndLayer.eachLayer((layer) => {
    if (typeof layer.getLatLng === "function") {
      bounds.extend(layer.getLatLng());
    }
  });
  mapPoiLayer.eachLayer((layer) => {
    if (typeof layer.getLatLng === "function") {
      bounds.extend(layer.getLatLng());
    }
  });

  if (bounds.isValid()) {
    mapInstance.fitBounds(bounds, { padding: [24, 24] });
  } else if (routeLatLngs.length) {
    mapInstance.setView(routeLatLngs[0], 12);
  }
  setMapStatus(
    t("status.mapScanMeta", {
      provider: currentTileProviderName,
      routePoints: routeLatLngs.length,
      poiCount: lastScanResults.length,
    }),
  );

  // Desktop-Browser reagieren teils träge nach Overlay-Wechsel.
  requestAnimationFrame(() => {
    mapInstance.invalidateSize();
    setTimeout(() => mapInstance.invalidateSize(), 180);
  });

  if (mapTitle && lastScanRange) {
    const modeText =
      lastScanRange.mode === "live"
        ? t("map.modeLive", { ref: lastScanRange.referenceKm.toFixed(1) })
        : t("map.modePlan");
    mapTitle.textContent = t("map.scanWindowTitle", {
      mode: modeText,
      start: lastScanRange.startKmAhead,
      end: lastScanRange.endKmAhead,
      corridor: lastScanRange.corridorWidthKm,
    });
  }
}

function initMapBaseLayers() {
  mapBaseLayers = {};
  Object.entries(TILE_PROVIDERS).forEach(([name, provider]) => {
    mapBaseLayers[name] = L.tileLayer(provider.url, provider.options);
  });

  mapTileLayer = mapBaseLayers[currentTileProviderName];
  mapTileLayer.addTo(mapInstance);
  attachTileErrorHandling(mapTileLayer);

  L.control.layers(mapBaseLayers, null, { collapsed: true }).addTo(mapInstance);
}

function addOrUpdateMapLegend() {
  if (!mapInstance) return;
  if (mapLegendControl) {
    mapInstance.removeControl(mapLegendControl);
  }

  mapLegendControl = L.control({ position: "bottomright" });
  mapLegendControl.onAdd = () => {
    const div = L.DomUtil.create("div", "map-legend");
    const items = [
      [t("map.legendRoute"), "#22c55e"],
      [t("map.legendUnpaved"), UNPAVED_SURFACE_COLOR],
      [t("map.legendLodging"), POI_CATEGORY_COLORS.lodging],
      [t("map.legendFuel"), POI_CATEGORY_COLORS.fuel],
      [t("map.legendGrocery"), POI_CATEGORY_COLORS.grocery],
      [t("map.legendRestaurant"), POI_CATEGORY_COLORS.restaurant],
      [t("map.legendCafe"), POI_CATEGORY_COLORS.cafe],
      [t("map.legendFastfood"), POI_CATEGORY_COLORS.fastfood],
      [t("map.legendWater"), POI_CATEGORY_COLORS.water],
      [t("map.legendCamping"), POI_CATEGORY_COLORS.camping],
      [t("map.legendShelter"), POI_CATEGORY_COLORS.shelter],
    ];

    div.innerHTML = items
      .map(
        ([label, color]) =>
          `<div class="legend-row"><span class="legend-swatch" style="background:${color}"></span>${label}</div>`,
      )
      .join("");
    return div;
  };
  mapLegendControl.addTo(mapInstance);
}

async function updateUnpavedOverlay(routeLatLngs) {
  if (!mapInstance || routeLatLngs.length < 2) return;
  if (!showUnpavedOverlay) {
    applyUnpavedVisibility();
    return;
  }

  const cacheKey = getSurfaceCacheKey(routeLatLngs);
  if (surfaceOverlayCache.has(cacheKey)) {
    const cached = surfaceOverlayCache.get(cacheKey);
    drawUnpavedOverlay(cached.polylines);
    if (cached.km > 0) {
      setMapStatus(
        t("status.mapUnpavedKm", {
          provider: currentTileProviderName,
          km: cached.km.toFixed(1),
        }),
      );
    }
    return;
  }

  const token = ++surfaceAnalysisToken;
  setMapStatus(
    t("status.mapUnpavedAnalyzing", { provider: currentTileProviderName }),
  );

  try {
    const ways = await fetchSurfaceWays(routeLatLngs);
    if (token !== surfaceAnalysisToken) return;

    const unpavedPolylines = detectUnpavedPolylines(routeLatLngs, ways);
    const unpavedKm = estimatePolylineKm(unpavedPolylines);

    surfaceOverlayCache.set(cacheKey, {
      polylines: unpavedPolylines,
      km: unpavedKm,
    });
    drawUnpavedOverlay(unpavedPolylines);

    setMapStatus(
      t("status.mapUnpavedKm", {
        provider: currentTileProviderName,
        km: unpavedKm.toFixed(1),
      }),
    );
  } catch (err) {
    if (token !== surfaceAnalysisToken) return;
    console.warn("Surface analysis failed", err);
    setMapStatus(
      t("status.mapUnpavedUnavailable", { provider: currentTileProviderName }),
    );
  }
}

function drawUnpavedOverlay(polylines) {
  if (mapUnpavedLayer) {
    mapInstance.removeLayer(mapUnpavedLayer);
  }
  mapUnpavedLayer = L.layerGroup();
  polylines.forEach((line) => {
    if (line.length < 2) return;
    L.polyline(line, {
      color: UNPAVED_SURFACE_COLOR,
      weight: 6,
      opacity: 0.95,
      lineCap: "round",
      lineJoin: "round",
      dashArray: "10 8",
    }).addTo(mapUnpavedLayer);
  });
  applyUnpavedVisibility();
}

function applyUnpavedVisibility() {
  if (!mapInstance) return;
  if (!mapUnpavedLayer) {
    if (!showUnpavedOverlay) {
      setMapStatus(
        t("status.mapUnpavedOff", { provider: currentTileProviderName }),
      );
    }
    return;
  }

  if (showUnpavedOverlay) {
    if (!mapInstance.hasLayer(mapUnpavedLayer)) {
      mapUnpavedLayer.addTo(mapInstance);
    }
    setMapStatus(
      t("status.mapUnpavedOn", { provider: currentTileProviderName }),
    );
  } else if (mapInstance.hasLayer(mapUnpavedLayer)) {
    mapInstance.removeLayer(mapUnpavedLayer);
    setMapStatus(
      t("status.mapUnpavedOff", { provider: currentTileProviderName }),
    );
  }
}

function getSurfaceCacheKey(routeLatLngs) {
  const first = routeLatLngs[0];
  const last = routeLatLngs[routeLatLngs.length - 1];
  return `${routeLatLngs.length}|${first[0].toFixed(4)},${first[1].toFixed(4)}|${last[0].toFixed(4)},${last[1].toFixed(4)}`;
}

async function fetchSurfaceWays(routeLatLngs) {
  const bbox = computeLatLngBoundingBox(routeLatLngs, 0.02);
  const query = `
    [out:json][timeout:30];
    way["highway"](${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon});
    out tags geom;
  `;

  const response = await fetch(OVERPASS_ENDPOINT, {
    method: "POST",
    body: query,
    headers: {
      "Content-Type": "text/plain;charset=UTF-8",
    },
  });

  if (!response.ok) {
    throw new Error(`Overpass surface error: ${response.status}`);
  }

  const data = await response.json();
  if (!data.elements) return [];
  return data.elements.filter(
    (el) =>
      el.type === "way" &&
      Array.isArray(el.geometry) &&
      el.geometry.length > 1,
  );
}

function detectUnpavedPolylines(routeLatLngs, ways) {
  if (!ways.length || routeLatLngs.length < 2) return [];

  const vertexIndex = buildWayVertexIndex(ways);
  if (!vertexIndex.size) return [];

  const sampleStep = Math.max(1, Math.floor(routeLatLngs.length / 900));
  const sampled = [];
  for (let i = 0; i < routeLatLngs.length; i += sampleStep) {
    sampled.push(routeLatLngs[i]);
  }
  const lastPt = routeLatLngs[routeLatLngs.length - 1];
  const lastSample = sampled[sampled.length - 1];
  if (!lastSample || lastSample[0] !== lastPt[0] || lastSample[1] !== lastPt[1]) {
    sampled.push(lastPt);
  }

  const flags = sampled.map(([lat, lon]) =>
    isNearUnpavedWay(lat, lon, vertexIndex),
  );

  const polylines = [];
  let current = [];
  for (let i = 0; i < sampled.length; i += 1) {
    if (flags[i]) {
      current.push(sampled[i]);
    } else if (current.length > 1) {
      polylines.push(current);
      current = [];
    } else {
      current = [];
    }
  }
  if (current.length > 1) {
    polylines.push(current);
  }

  return polylines;
}

function buildWayVertexIndex(ways) {
  const index = new Map();
  const cellSize = 0.02;

  ways.forEach((way) => {
    const unpaved = isUnpavedWay(way.tags || {});
    if (!unpaved) return;

    way.geometry.forEach((pt) => {
      const key = `${Math.floor(pt.lat / cellSize)}|${Math.floor(pt.lon / cellSize)}`;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push({ lat: pt.lat, lon: pt.lon });
    });
  });

  return index;
}

function isNearUnpavedWay(lat, lon, index) {
  const cellSize = 0.02;
  const cx = Math.floor(lat / cellSize);
  const cy = Math.floor(lon / cellSize);
  let candidates = [];

  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const key = `${cx + dx}|${cy + dy}`;
      if (index.has(key)) {
        candidates = candidates.concat(index.get(key));
      }
    }
  }

  if (!candidates.length) return false;

  let best = Infinity;
  for (const c of candidates) {
    const d = haversineKm(lat, lon, c.lat, c.lon);
    if (d < best) best = d;
  }

  // 120 m proximity threshold
  return best <= 0.12;
}

function isUnpavedWay(tags) {
  const surface = (tags.surface || "").toLowerCase();
  const tracktype = (tags.tracktype || "").toLowerCase();
  const highway = (tags.highway || "").toLowerCase();

  if (surface && UNPAVED_SURFACES.has(surface)) {
    return true;
  }
  if (tracktype && ["grade3", "grade4", "grade5"].includes(tracktype)) {
    return true;
  }
  if (highway === "track" && !surface) {
    return true;
  }
  return false;
}

function computeLatLngBoundingBox(latLngs, padDeg = 0) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  latLngs.forEach(([lat, lon]) => {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  });

  return {
    minLat: minLat - padDeg,
    maxLat: maxLat + padDeg,
    minLon: minLon - padDeg,
    maxLon: maxLon + padDeg,
  };
}

function estimatePolylineKm(polylines) {
  let totalKm = 0;
  polylines.forEach((line) => {
    for (let i = 1; i < line.length; i += 1) {
      totalKm += haversineKm(
        line[i - 1][0],
        line[i - 1][1],
        line[i][0],
        line[i][1],
      );
    }
  });
  return totalKm;
}

function attachTileErrorHandling(layer) {
  layer.on("tileerror", () => {
    tileErrorCount += 1;
    setMapStatus(
      t("status.mapTileErrors", {
        provider: currentTileProviderName,
        count: tileErrorCount,
      }),
    );

    if (tileErrorCount >= 8 && !hasSwitchedTileProvider) {
      hasSwitchedTileProvider = true;
      const fallbackName = currentTileProviderName === "OpenStreetMap"
        ? "CartoLight"
        : "OpenStreetMap";
      switchToTileProvider(fallbackName);
      setMapStatus(
        t("status.mapTileSwitched"),
      );
      return;
    }

    if (tileErrorCount >= 16) {
      setMapStatus(
        t("status.mapTileBlocked"),
      );
    }
  });

  layer.on("load", () => {
    setMapStatus(
      t("status.mapTilesLoaded", { provider: currentTileProviderName }),
    );
  });
}

function switchToTileProvider(providerName) {
  if (!mapInstance || !mapBaseLayers || !mapBaseLayers[providerName]) return;
  if (mapTileLayer) mapInstance.removeLayer(mapTileLayer);
  mapTileLayer = mapBaseLayers[providerName];
  currentTileProviderName = providerName;
  mapTileLayer.addTo(mapInstance);
  attachTileErrorHandling(mapTileLayer);
}

function setMapStatus(text) {
  const el = document.getElementById("map-status");
  if (!el) return;
  el.textContent = text;
}

function buildPoiPopupHtml(poi) {
  const escapedName = escapeHtml(poi.name || "POI");
  const escapedType = escapeHtml(
    t(poi.typeKey || `poi.${poi.category}` || "poi.other"),
  );
  const distanceText = t("poi.popupDistance", {
    distance: poi.distanceAheadKm.toFixed(1),
  });
  const callLink = poi.phone
    ? `<a class="popup-link" href="tel:${poi.phone.replace(/\s+/g, "")}">${t("poi.call")}</a>`
    : `<span class="popup-link" style="opacity:0.5;">${t("poi.popupNoNumber")}</span>`;

  return `
    <p class="popup-title">${escapedName}</p>
    <p class="popup-meta">${escapedType} · ${distanceText}</p>
    ${callLink}
  `;
}

function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getPoiKey(poi) {
  return `${poi.id}|${poi.lat}|${poi.lon}`;
}

function getRenderableRouteLatLngs() {
  // Prefer the selected segment, but keep route visible if segment is sparse.
  const source = lastScanSegmentPoints && lastScanSegmentPoints.length >= 2
    ? lastScanSegmentPoints
    : routePoints;

  const latLngs = (source || []).map((p) => [p.lat, p.lon]);
  if (latLngs.length >= 2) return latLngs;

  // Last-resort fallback for extremely short/invalid segments.
  if (routePoints.length >= 2) {
    return routePoints.map((p) => [p.lat, p.lon]);
  }
  return latLngs;
}

// ---------- PWA SERVICE WORKER ----------

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
  ) {
    return;
  }
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .catch((err) => console.warn("SW registration failed", err));
  });
}

