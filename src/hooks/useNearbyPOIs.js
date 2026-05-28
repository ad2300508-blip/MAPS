import { useState, useEffect, useRef } from 'react';
import { placeEmoji } from '../data/mockData';

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const grid = (n) => Math.round(n * 100) / 100; // ~1.1 km grid

function buildQuery(lat, lng, radius) {
  return `[out:json][timeout:25];
(
  node["amenity"~"^(restaurant|cafe|bar|hospital|pharmacy|fuel|bank|cinema|fast_food|pub|ice_cream)$"](around:${radius},${lat},${lng});
  node["tourism"~"^(museum|attraction|hotel|viewpoint|monument|gallery)$"](around:${radius},${lat},${lng});
  node["shop"~"^(supermarket|mall|convenience|bakery|clothes|electronics)$"](around:${radius},${lat},${lng});
);
out 30;`;
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

export function useNearbyPOIs(location, { radius = 600, paused = false } = {}) {
  const [pois, setPOIs] = useState([]);
  const keyRef = useRef(null);

  useEffect(() => {
    if (!location || paused) return;
    const key = `${grid(location[0])},${grid(location[1])}`;
    if (key === keyRef.current) return;
    keyRef.current = key;

    const [lng, lat] = location;
    const query = buildQuery(lat, lng, radius);

    fetchOverpass(query).then((data) => {
      if (!data) return; // all mirrors failed — keep stale POIs
      const places = (data.elements ?? [])
        .filter((el) => el.tags?.name)
        .slice(0, 25)
        .map((el) => {
          const osmClass = el.tags.amenity ? 'amenity'
            : el.tags.tourism ? 'tourism'
            : 'shop';
          const osmType = el.tags.amenity ?? el.tags.tourism ?? el.tags.shop ?? '';
          return {
            id:      el.id,
            name:    el.tags.name,
            coords:  [el.lon, el.lat],
            type:    osmType,
            address: [el.tags['addr:street'], el.tags['addr:housenumber']].filter(Boolean).join(' '),
            emoji:   placeEmoji(osmClass, osmType),
          };
        });
      setPOIs(places);
    });
  }, [location?.[0] && grid(location[0]), location?.[1] && grid(location[1])]);
  // ↑ recomputes only when grid cell changes (~1.1 km movement)

  return pois;
}
