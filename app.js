// app.js - core logic for Ultra Route Sniper

const DB_NAME = "ultra-route-sniper";
const DB_VERSION = 1;
const GPX_STORE = "gpxTracks";
const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const DEFAULT_POI_FILTERS = [
  "lodging",
  "fuel",
  "food",
  "water",
  "camping",
  "shelter",
];

let db;
let routePoints = []; // { lat, lon, cumDistKm }
let lastGeoPosition = null; // { lat, lon }
let lastRouteMatch = null; // { kmOnRoute, distanceToRouteKm }
let activePoiFilters = new Set(DEFAULT_POI_FILTERS);

document.addEventListener("DOMContentLoaded", () => {
  initUI();
  initDB()
    .then(() => checkStoredGpx())
    .catch((err) => {
      console.error("DB init failed", err);
      setStatus(
        "gpx-status",
        "Fehler beim Initialisieren des lokalen Speichers.",
        "error",
      );
    });
  registerServiceWorker();
});

function initUI() {
  const gpxInput = document.getElementById("gpx-file-input");
  const useStoredBtn = document.getElementById("use-stored-gpx-btn");
  const locateBtn = document.getElementById("locate-btn");
  const sniperBtn = document.getElementById("sniper-btn");
  const filterContainer = document.querySelector(".poi-filters");

  gpxInput.addEventListener("change", handleGpxFileSelect);
  useStoredBtn.addEventListener("click", async () => {
    await loadStoredGpxIntoMemory();
    updateSniperButtonState();
  });
  locateBtn.addEventListener("click", handleLocateClick);

  sniperBtn.addEventListener("click", handleSniperClick);

  if (filterContainer) {
    filterContainer.addEventListener("click", handleFilterClick);
  }
}

// ---------- STATUS HELPERS ----------

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
  const hasPosition = !!lastRouteMatch;
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
      ? "Keine Filter aktiv – bitte mindestens eine Kategorie wählen."
      : `Aktive Kategorien: ${Array.from(activePoiFilters).join(", ")}`;

  setStatus("sniper-status", filterInfo, "info");
  updateSniperButtonState();
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
        `Gespeicherte Strecke gefunden (${record.points.length} Punkte).`,
        "info",
      );
    } else {
      btn.disabled = true;
      setStatus(
        "gpx-status",
        "Noch keine Strecke gespeichert. Bitte GPX laden.",
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
      setStatus("gpx-status", "Keine gespeicherte Strecke gefunden.", "error");
      return;
    }
    routePoints = record.points;
    setStatus(
      "gpx-status",
      `Gespeicherte Strecke geladen (${routePoints.length} Punkte).`,
      "info",
    );
  } catch (err) {
    console.error(err);
    setStatus(
      "gpx-status",
      "Fehler beim Laden der gespeicherten Strecke.",
      "error",
    );
  }
}

// ---------- GPX HANDLING ----------

function handleGpxFileSelect(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  setStatus("gpx-status", "Lese GPX-Datei …");

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const text = e.target.result;
      const parsed = parseGpx(text);
      if (!parsed || parsed.length === 0) {
        setStatus(
          "gpx-status",
          "Keine gültigen Trackpunkte in der GPX-Datei gefunden.",
          "error",
        );
        return;
      }
      routePoints = parsed;
      await saveGpxToDB(parsed);
      document.getElementById("use-stored-gpx-btn").disabled = false;
      setStatus(
        "gpx-status",
        `Strecke geladen und gespeichert (${parsed.length} Punkte, Gesamtlänge ca. ${parsed[parsed.length - 1].cumDistKm.toFixed(1)} km).`,
        "info",
      );
    } catch (err) {
      console.error(err);
      setStatus(
        "gpx-status",
        "Fehler beim Parsen der GPX-Datei.",
        "error",
      );
    }
  };
  reader.onerror = () => {
    setStatus("gpx-status", "Fehler beim Lesen der Datei.", "error");
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
    setStatus("location-status", "Geolocation wird von diesem Gerät nicht unterstützt.", "error");
    return;
  }

  setStatus("location-status", "Bestimme aktuelle Position …");

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
        `Lat: ${latitude.toFixed(5)}, Lon: ${longitude.toFixed(5)} (±${Math.round(accuracy)} m)`,
        "info",
      );
      updateRoutePosition(latitude, longitude);
    },
    (err) => {
      btn.disabled = false;
      console.error(err);
      let msg = "Fehler bei der Ortung.";
      if (err.code === err.PERMISSION_DENIED) {
        msg = "Ortungszugriff verweigert. Bitte im Browser erlauben.";
      } else if (err.code === err.TIMEOUT) {
        msg = "Ortung hat zu lange gedauert. Nochmal versuchen.";
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
      "Noch keine Strecke im Speicher. Bitte zuerst GPX laden oder gespeicherte Strecke aktivieren.",
      "error",
    );
    return;
  }

  const match = getRoutePositionForLocation(lat, lon);
  if (!match) {
    setStatus(
      "route-position",
      "Konnte Position auf der Route nicht bestimmen.",
      "error",
    );
    return;
  }

  lastGeoPosition = { lat, lon };
  lastRouteMatch = match;

  const { kmOnRoute, distanceToRouteKm } = match;
  const distanceDisplay =
    distanceToRouteKm < 0.05
      ? "Du liegst sehr nah an der Strecke."
      : `Abstand zur Strecke ca. ${distanceToRouteKm.toFixed(2)} km.`;

  setStatus(
    "route-position",
    `Position auf der Route: km ${kmOnRoute.toFixed(1)}. ${distanceDisplay}`,
    "info",
  );

  updateSniperButtonState();
}

// ---------- SNIPER MODE (POI SCAN) ----------

async function handleSniperClick() {
  if (!lastRouteMatch || !lastGeoPosition) {
    setStatus(
      "sniper-status",
      "Keine aktuelle Position auf der Route bekannt. Bitte zuerst Ortung starten.",
      "error",
    );
    return;
  }

  const rangeStartInput = document.getElementById("range-start");
  const rangeEndInput = document.getElementById("range-end");
  const poiList = document.getElementById("poi-list");

  const startKmAhead = Number(rangeStartInput.value || 0);
  const endKmAhead = Number(rangeEndInput.value || 0);

  if (Number.isNaN(startKmAhead) || Number.isNaN(endKmAhead)) {
    setStatus(
      "sniper-status",
      "Bitte gültige Kilometerangaben eingeben.",
      "error",
    );
    return;
  }

  if (endKmAhead <= startKmAhead) {
    setStatus(
      "sniper-status",
      "Der Endwert muss größer als der Startwert sein.",
      "error",
    );
    return;
  }

  const currentKm = lastRouteMatch.kmOnRoute || 0;
  const routeTotalKm =
    routePoints && routePoints.length
      ? routePoints[routePoints.length - 1].cumDistKm
      : 0;

  const segmentStartKm = currentKm + startKmAhead;
  const segmentEndKm = Math.min(currentKm + endKmAhead, routeTotalKm);

  if (!routeTotalKm) {
    setStatus(
      "sniper-status",
      "Streckenlänge unbekannt (GPX nicht geladen?).",
      "error",
    );
    return;
  }

  if (segmentEndKm <= segmentStartKm) {
    const remainingKm = Math.max(0, routeTotalKm - currentKm);
    setStatus(
      "sniper-status",
      `Das gewählte Kilometerfenster liegt außerhalb der Strecke. Aktuell km ${currentKm.toFixed(1)} von ${routeTotalKm.toFixed(1)} (Rest: ${remainingKm.toFixed(1)} km).`,
      "error",
    );
    return;
  }

  poiList.innerHTML = "";
  setStatus(
    "sniper-status",
    `Scanne Strecke von km ${segmentStartKm.toFixed(1)} bis ${segmentEndKm.toFixed(1)} …`,
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
        "Keine Punkte im gewählten Abschnitt gefunden.",
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
          distanceAheadKm: nearest.kmOnRoute - currentKm,
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

    renderPoiList(filtered);

    if (!filtered.length) {
      setStatus(
        "sniper-status",
        "Keine passenden POIs im gewählten Korridor gefunden.",
        "info",
      );
    } else {
      setStatus(
        "sniper-status",
        `${filtered.length} Orte im Korridor gefunden.`,
        "info",
      );
    }
  } catch (err) {
    console.error(err);
    setStatus(
      "sniper-status",
      "Fehler beim Laden der POIs (Overpass). Später erneut versuchen.",
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

      // Lebensmittel / Shops
      node["shop"="supermarket"](${minLat},${minLon},${maxLat},${maxLon});
      node["shop"="convenience"](${minLat},${minLon},${maxLat},${maxLon});
      node["shop"="grocery"](${minLat},${minLon},${maxLat},${maxLon});
      node["shop"="bakery"](${minLat},${minLon},${maxLat},${maxLon});
      node["amenity"="fast_food"](${minLat},${minLon},${maxLat},${maxLon});
      node["amenity"="restaurant"](${minLat},${minLon},${maxLat},${maxLon});

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
          ? "Tankstelle"
          : tags.amenity === "shelter"
          ? "Shelter"
          : tags.tourism === "alpine_hut"
          ? "Alpine Hut"
          : "POI");

      // Kategorien für Filter
      let category = "other";
      let typeLabel = "POI";

      if (
        tags.tourism === "hotel" ||
        tags.tourism === "motel" ||
        tags.tourism === "guest_house" ||
        tags.tourism === "hostel" ||
        tags.tourism === "apartment"
      ) {
        category = "lodging";
        typeLabel = "Unterkunft";
      } else if (tags.amenity === "fuel") {
        category = "fuel";
        typeLabel = "Tankstelle";
      } else if (
        tags.shop === "supermarket" ||
        tags.shop === "convenience" ||
        tags.shop === "grocery" ||
        tags.shop === "bakery" ||
        tags.amenity === "fast_food" ||
        tags.amenity === "restaurant"
      ) {
        category = "food";
        typeLabel = "Lebensmittel";
      } else if (
        tags.amenity === "drinking_water" ||
        tags.amenity === "fountain"
      ) {
        category = "water";
        typeLabel = "Trinkwasser";
      } else if (
        tags.tourism === "camp_site" ||
        tags.tourism === "caravan_site"
      ) {
        category = "camping";
        typeLabel = "Camping";
      } else if (
        tags.amenity === "shelter" ||
        tags.tourism === "alpine_hut" ||
        tags.tourism === "wilderness_hut" ||
        tags.amenity === "hut"
      ) {
        category = "shelter";
        typeLabel = "Shelter";
      }

      const phone = tags.phone || tags["contact:phone"] || null;

      return {
        id: el.id,
        lat: el.lat,
        lon: el.lon,
        name,
        type: typeLabel,
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
    typeSpan.textContent = poi.type;

    mainLine.appendChild(distanceSpan);
    mainLine.appendChild(nameSpan);
    mainLine.appendChild(typeSpan);

    const actions = document.createElement("div");
    actions.className = "poi-actions";

    const callLink = document.createElement("a");
    const callBtn = document.createElement("button");
    callBtn.className = "btn secondary poi-action-btn";
    callBtn.textContent = "Anrufen";

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
    mapsBtn.textContent = "In Maps öffnen";
    const label = encodeURIComponent(poi.name);
    mapsLink.href = `geo:${poi.lat},${poi.lon}?q=${poi.lat},${poi.lon}(${label})`;

    mapsLink.appendChild(mapsBtn);

    actions.appendChild(callLink);
    actions.appendChild(mapsLink);

    li.appendChild(mainLine);
    li.appendChild(actions);

    list.appendChild(li);
  });
}

// ---------- PWA SERVICE WORKER ----------

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .catch((err) => console.warn("SW registration failed", err));
  });
}

