import { useState, useEffect, useRef } from 'react';
import { placeEmoji } from '../data/mockData';

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const grid = (n) => Math.round(n * 100) / 100; // ~1.1 km grid

function buildQuery(lat, lng, radius) {
  const amenityRx = 'restaurant|cafe|bar|hospital|pharmacy|fuel|bank|cinema|fast_food|pub|ice_cream|parking|atm|doctors|dentist|police|post_office';
  const tourismRx = 'museum|attraction|hotel|viewpoint|monument|gallery';
  const shopRx    = 'supermarket|mall|convenience|bakery|clothes|electronics';
  return `[out:json][timeout:25];
(
  node["amenity"~"^(${amenityRx})$"](around:${radius},${lat},${lng});
  node["tourism"~"^(${tourismRx})$"](around:${radius},${lat},${lng});
  node["shop"~"^(${shopRx})$"](around:${radius},${lat},${lng});
  way["amenity"~"^(${amenityRx})$"](around:${radius},${lat},${lng});
  way["tourism"~"^(${tourismRx})$"](around:${radius},${lat},${lng});
  way["shop"~"^(${shopRx})$"](around:${radius},${lat},${lng});
);
out center 35;`;
}

async function fetchOverpass(query) {
  const body = `data=${encodeURIComponent(query)}`;
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(mirror, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(28000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.elements) return data;
    } catch { /* try next mirror */ }
  }
  return null;
}

const SESSION_KEY = 'via-poi-cache';

function loadCached(key) {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const { k, pois } = JSON.parse(raw);
    return k === key ? pois : null;
  } catch { return null; }
}

function saveCache(key, pois) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ k: key, pois })); } catch {}
}

export function useNearbyPOIs(location, { radius = 800, paused = false } = {}) {
  const [pois, setPOIs] = useState([]);
  const keyRef = useRef(null);

  useEffect(() => {
    if (!location || paused) return;
    const key = `${grid(location[0])},${grid(location[1])}`;
    if (key === keyRef.current) return;
    keyRef.current = key;

    // Serve from session cache instantly (survives page reloads within the session)
    const cached = loadCached(key);
    if (cached) { setPOIs(cached); return; }

    const [lng, lat] = location;
    const query = buildQuery(lat, lng, radius);
    let cancelled = false;

    fetchOverpass(query).then((data) => {
      if (cancelled || !data) return; // ignore stale or failed results
      const places = (data.elements ?? [])
        .filter((el) => el.tags?.name)
        .slice(0, 40)
        .map((el) => {
          const osmClass = el.tags.amenity ? 'amenity'
            : el.tags.tourism ? 'tourism'
            : 'shop';
          const osmType = el.tags.amenity ?? el.tags.tourism ?? el.tags.shop ?? '';
          // ways use center.lat/lon, nodes use lat/lon directly
          const lon = el.lon ?? el.center?.lon;
          const lat = el.lat ?? el.center?.lat;
          if (lon == null || lat == null) return null;
          return {
            id:      el.id,
            name:    el.tags.name,
            coords:  [lon, lat],
            type:    osmType,
            address: [el.tags['addr:street'], el.tags['addr:housenumber']].filter(Boolean).join(' '),
            emoji:   placeEmoji(osmClass, osmType),
            phone:   el.tags.phone ?? el.tags['contact:phone'] ?? null,
            website: el.tags.website ?? el.tags['contact:website'] ?? null,
            hours:   el.tags.opening_hours ?? null,
            cuisine: el.tags.cuisine ?? null,
          };
        })
        .filter(Boolean); // remove null entries (ways without center)
      saveCache(key, places);
      setPOIs(places);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location != null ? grid(location[0]) : null, location != null ? grid(location[1]) : null, paused]);
  // ↑ recomputes only when grid cell changes (~1.1 km movement) or paused flag changes

  return pois;
}
