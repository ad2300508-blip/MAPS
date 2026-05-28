import { useState, useEffect, useRef } from 'react';
import { placeEmoji } from '../data/mockData';

const OVERPASS = 'https://overpass-api.de/api/interpreter';

// Round to 2 decimal places (~1.1 km grid) to avoid refetching on tiny moves
const grid = (n) => Math.round(n * 100) / 100;

export function useNearbyPOIs(location, radius = 600) {
  const [pois, setPOIs] = useState([]);
  const keyRef = useRef(null);

  useEffect(() => {
    if (!location) return;
    const key = `${grid(location[0])},${grid(location[1])}`;
    if (key === keyRef.current) return;
    keyRef.current = key;

    const [lng, lat] = location;
    const query = `
[out:json][timeout:15];
(
  node["amenity"~"^(restaurant|cafe|bar|hospital|pharmacy|fuel|bank|cinema|fast_food|pub|ice_cream)$"](around:${radius},${lat},${lng});
  node["tourism"~"^(museum|attraction|hotel|viewpoint|monument|gallery)$"](around:${radius},${lat},${lng});
  node["shop"~"^(supermarket|mall|convenience|bakery|clothes|electronics)$"](around:${radius},${lat},${lng});
);
out 30;`;

    fetch(OVERPASS, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
      .then((r) => r.json())
      .then((data) => {
        const places = (data.elements ?? [])
          .filter((el) => el.tags?.name)
          .slice(0, 25)
          .map((el) => {
            const osmClass = el.tags.amenity ? 'amenity'
              : el.tags.tourism ? 'tourism'
              : 'shop';
            const osmType  = el.tags.amenity ?? el.tags.tourism ?? el.tags.shop ?? '';
            return {
              id: el.id,
              name: el.tags.name,
              coords: [el.lon, el.lat],
              type: osmType,
              address: [el.tags['addr:street'], el.tags['addr:housenumber']].filter(Boolean).join(' '),
              emoji: placeEmoji(osmClass, osmType),
            };
          });
        setPOIs(places);
      })
      .catch(() => {});
  }, [location && grid(location[0]), location && grid(location[1])]);

  return pois;
}
