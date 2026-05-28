import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
// react-map-gl/maplibre uses MapLibre GL JS (100% free, open-source)
import Map, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import { motion } from 'framer-motion';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  INITIAL_VIEW_STATE,
  MOCK_ROUTE,
  MOCK_POIS,
  MOCK_USER_LOCATION,
} from '../data/mockData';

// ─── Free map style ────────────────────────────────────────────────────────
// CARTO Dark Matter GL: completely free, attribution required, no API key.
// Alternative: 'https://tiles.openfreemap.org/styles/liberty'
// Docs: https://carto.com/basemaps/
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// ─── Route coordinate interpolation for drawing animation ─────────────────
// Expands the sparse waypoints into many micro-segments so we can reveal
// the route point-by-point for a smooth drawing effect.
function interpolateLine(coords, targetPoints) {
  if (coords.length < 2) return coords;
  const result = [];
  const segCount = coords.length - 1;
  const pts = Math.max(4, Math.floor(targetPoints / segCount));

  for (let i = 0; i < segCount; i++) {
    const [x0, y0] = coords[i];
    const [x1, y1] = coords[i + 1];
    const start = i === 0 ? 0 : 1; // avoid duplicate junction points
    for (let j = start; j <= pts; j++) {
      const t = j / pts;
      result.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
    }
  }
  return result;
}

const ROUTE_POINTS = interpolateLine(MOCK_ROUTE.geometry.coordinates, 140);
const SEED_COUNT = 4; // points visible before animation kicks in

// ─── Layer paint definitions ───────────────────────────────────────────────
// Outer glow — wide, blurred, low opacity
const GLOW_LAYER = {
  id: 'route-glow',
  type: 'line',
  layout: { 'line-join': 'round', 'line-cap': 'round' },
  paint: {
    'line-color': '#4cc9f0',
    'line-width': 28,
    'line-opacity': 0.12,
    'line-blur': 20,
  },
};

// Main route — gradient along line-progress (requires lineMetrics={true} on Source)
const LINE_LAYER = {
  id: 'route-line',
  type: 'line',
  layout: { 'line-join': 'round', 'line-cap': 'round' },
  paint: {
    'line-gradient': [
      'interpolate', ['linear'], ['line-progress'],
      0,    '#7209b7',
      0.45, '#4361ee',
      1,    '#4cc9f0',
    ],
    'line-width': 7,
    'line-opacity': 0.96,
  },
};

// ─── Markers ───────────────────────────────────────────────────────────────
function UserLocationMarker() {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 36, height: 36 }}>
      <span className="user-marker-ring"   style={{ width: 36, height: 36 }} />
      <span className="user-marker-ring-2" style={{ width: 36, height: 36 }} />
      <span
        className="relative w-4 h-4 rounded-full bg-[#4cc9f0] border-2 border-white user-marker-dot"
        style={{ boxShadow: '0 0 10px 3px rgba(76,201,240,0.65)' }}
      />
    </div>
  );
}

function DestinationMarker() {
  return (
    <div className="dest-marker flex flex-col items-center">
      <div
        className="w-5 h-5 rounded-full border-2 border-white"
        style={{
          background: 'linear-gradient(135deg,#4361ee,#4cc9f0)',
          boxShadow: '0 0 14px rgba(76,201,240,0.7)',
        }}
      />
      <div
        className="w-2 h-3 -mt-1"
        style={{
          background: 'linear-gradient(180deg,#4361ee,transparent)',
          clipPath: 'polygon(50% 100%,0 0,100% 0)',
        }}
      />
    </div>
  );
}

function POIMarker({ poi, isSelected, onClick }) {
  return (
    <motion.button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="relative flex flex-col items-center focus:outline-none cursor-pointer"
      initial={{ scale: 0, opacity: 0, y: 10 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 22, delay: 0.05 }}
      whileHover={{ scale: 1.14, y: -3 }}
      whileTap={{ scale: 0.9 }}
    >
      <motion.div
        className="flex items-center justify-center w-11 h-11 rounded-2xl glass-bright"
        animate={
          isSelected
            ? { boxShadow: [`0 0 0 0 ${poi.color}55`, `0 0 0 8px ${poi.color}00`] }
            : { boxShadow: '0 4px 16px rgba(0,0,0,0.45)' }
        }
        transition={isSelected ? { repeat: Infinity, duration: 1.8, ease: 'easeOut' } : {}}
        style={
          isSelected
            ? { border: `1.5px solid ${poi.color}`, boxShadow: `0 0 18px ${poi.color}60` }
            : {}
        }
      >
        <span className="text-xl leading-none select-none">{poi.emoji}</span>
      </motion.div>

      {/* Pin tip */}
      <div
        className="w-2 h-2 -mt-1 rotate-45"
        style={{
          background: isSelected ? poi.color : 'rgba(16,16,28,0.88)',
          border: isSelected
            ? `1px solid ${poi.color}`
            : '1px solid rgba(255,255,255,0.12)',
          transition: 'all 0.2s ease',
        }}
      />
    </motion.button>
  );
}

// ─── 3D buildings (added imperatively so we auto-detect the tile source) ──
function add3DBuildings(map) {
  try {
    const style = map.getStyle();

    // Find the first vector tile source present in the style
    const vectorSourceId = Object.entries(style.sources)
      .find(([, s]) => s.type === 'vector')?.[0];
    if (!vectorSourceId) return;

    // Insert before the first symbol layer so labels stay on top
    const firstSymbolId = style.layers.find((l) => l.type === 'symbol')?.id;

    map.addLayer(
      {
        id: '3d-buildings',
        type: 'fill-extrusion',
        source: vectorSourceId,
        'source-layer': 'building',
        minzoom: 14,
        filter: ['has', 'render_height'],
        paint: {
          'fill-extrusion-color': [
            'interpolate', ['linear'], ['get', 'render_height'],
            0,   '#0d1117',
            50,  '#161b22',
            150, '#1e2535',
            300, '#252d45',
          ],
          'fill-extrusion-height': ['get', 'render_height'],
          'fill-extrusion-base': ['get', 'render_min_height'],
          'fill-extrusion-opacity': 0.88,
        },
      },
      firstSymbolId,
    );
  } catch {
    // Style doesn't expose extrudable buildings — continue gracefully
  }
}

// ─── MapView ───────────────────────────────────────────────────────────────
export default function MapView({ onMapLoaded, onPOISelect, selectedPOI, is3DMode }) {
  const mapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  // Route GeoJSON starts with just a seed slice; animation grows it to full.
  const [visibleCount, setVisibleCount] = useState(SEED_COUNT);

  const routeGeoJSON = useMemo(
    () => ({
      ...MOCK_ROUTE,
      geometry: {
        ...MOCK_ROUTE.geometry,
        coordinates: ROUTE_POINTS.slice(0, visibleCount),
      },
    }),
    [visibleCount],
  );

  // Reveal the route one point per rAF tick (≈ 2 s at 60 fps for 140 pts)
  const animateRoute = useCallback(() => {
    let idx = SEED_COUNT;
    const total = ROUTE_POINTS.length;

    const tick = () => {
      idx++;
      setVisibleCount(idx);
      if (idx < total) requestAnimationFrame(tick);
    };

    setTimeout(() => requestAnimationFrame(tick), 700);
  }, []);

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    add3DBuildings(map);

    if (onMapLoaded) onMapLoaded(mapRef.current);
    setMapReady(true);
    animateRoute();
  }, [onMapLoaded, animateRoute]);

  // Sync 3D pitch toggle after load
  useEffect(() => {
    if (!mapReady) return;
    mapRef.current?.easeTo({ pitch: is3DMode ? 52 : 0, duration: 850 });
  }, [is3DMode, mapReady]);

  return (
    <div className="w-full h-full">
      <Map
        ref={mapRef}
        initialViewState={INITIAL_VIEW_STATE}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAP_STYLE}
        onLoad={handleLoad}
        antialias
        attributionControl
      >
        {/* ── Animated route ── */}
        <Source id="route-src" type="geojson" data={routeGeoJSON} lineMetrics>
          <Layer {...GLOW_LAYER} />
          <Layer {...LINE_LAYER} />
        </Source>

        {/* ── User location ── */}
        <Marker longitude={MOCK_USER_LOCATION[0]} latitude={MOCK_USER_LOCATION[1]} anchor="center">
          <UserLocationMarker />
        </Marker>

        {/* ── Route end marker ── */}
        <Marker longitude={2.2945} latitude={48.8584} anchor="bottom">
          <DestinationMarker />
        </Marker>

        {/* ── POI markers ── */}
        {MOCK_POIS.map((poi) => (
          <Marker key={poi.id} longitude={poi.coords[0]} latitude={poi.coords[1]} anchor="bottom">
            <POIMarker
              poi={poi}
              isSelected={selectedPOI?.id === poi.id}
              onClick={() => onPOISelect(poi)}
            />
          </Marker>
        ))}
      </Map>
    </div>
  );
}
