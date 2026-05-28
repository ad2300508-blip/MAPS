import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import Map, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import { motion } from 'framer-motion';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  INITIAL_VIEW_STATE,
  MOCK_POIS,
  MOCK_USER_LOCATION,
  TRANSPORT_MODES,
  getModeById,
} from '../data/mockData';

// ── Free map style (CARTO Dark Matter — no API key) ───────────────────────
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const SEED_COUNT = 3;

// ─── Interpolate sparse waypoints into many micro-segments ───────────────
function interpolateLine(coords, targetPts) {
  if (coords.length < 2) return coords;
  const result = [];
  const segCount = coords.length - 1;
  const pts = Math.max(4, Math.floor(targetPts / segCount));

  for (let i = 0; i < segCount; i++) {
    const [x0, y0] = coords[i];
    const [x1, y1] = coords[i + 1];
    const start = i === 0 ? 0 : 1;
    for (let j = start; j <= pts; j++) {
      const t = j / pts;
      result.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
    }
  }
  return result;
}

// ─── 3D buildings (auto-detect tile source) ──────────────────────────────
function add3DBuildings(map) {
  try {
    const style = map.getStyle();
    const vectorSourceId = Object.entries(style.sources)
      .find(([, s]) => s.type === 'vector')?.[0];
    if (!vectorSourceId) return;

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
          'fill-extrusion-base':   ['get', 'render_min_height'],
          'fill-extrusion-opacity': 0.88,
        },
      },
      firstSymbolId,
    );
  } catch {
    // Graceful fallback — app works fine without 3D buildings
  }
}

// ─── User location marker ─────────────────────────────────────────────────
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

// ─── Route destination marker ─────────────────────────────────────────────
function DestinationMarker({ color }) {
  return (
    <div className="dest-marker flex flex-col items-center">
      <div
        className="w-5 h-5 rounded-full border-2 border-white"
        style={{
          background: `linear-gradient(135deg, ${color}bb, ${color})`,
          boxShadow: `0 0 14px ${color}90`,
        }}
      />
      <div
        className="w-2 h-3 -mt-1"
        style={{
          background: `linear-gradient(180deg, ${color}, transparent)`,
          clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
        }}
      />
    </div>
  );
}

// ─── POI marker ───────────────────────────────────────────────────────────
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
        style={isSelected ? { border: `1.5px solid ${poi.color}`, boxShadow: `0 0 18px ${poi.color}60` } : {}}
      >
        <span className="text-xl leading-none select-none">{poi.emoji}</span>
      </motion.div>

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

// ─── MapView ──────────────────────────────────────────────────────────────
export default function MapView({ onMapLoaded, onPOISelect, selectedPOI, selectedModeId, is3DMode }) {
  const mapRef  = useRef(null);
  const animRef = useRef(null);
  const [mapReady, setMapReady]       = useState(false);
  const [visibleCount, setVisibleCount] = useState(SEED_COUNT);

  // Compute interpolated points for the current mode
  const currentMode = useMemo(() => getModeById(selectedModeId), [selectedModeId]);

  const modePoints = useMemo(
    () => interpolateLine(currentMode.routeCoords, 140),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentMode.id],
  );

  // Dynamic route GeoJSON
  const routeGeoJSON = useMemo(
    () => ({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: modePoints.slice(0, visibleCount),
      },
    }),
    [modePoints, visibleCount],
  );

  // Dynamic layer styles — update when mode changes
  const glowLayer = useMemo(() => ({
    id: 'route-glow',
    type: 'line',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': currentMode.color,
      'line-width': 28,
      'line-opacity': 0.12,
      'line-blur': 20,
    },
  }), [currentMode.color]);

  const lineLayer = useMemo(() => ({
    id: 'route-line',
    type: 'line',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-gradient': [
        'interpolate', ['linear'], ['line-progress'],
        0, currentMode.gradientStart,
        1, currentMode.gradientEnd,
      ],
      'line-width': currentMode.lineWidth,
      'line-opacity': 0.96,
    },
  }), [currentMode.gradientStart, currentMode.gradientEnd, currentMode.lineWidth]);

  // Animate route drawing from scratch
  const animateRoute = useCallback((points) => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    setVisibleCount(SEED_COUNT);

    let idx = SEED_COUNT;
    const total = points.length;

    const tick = () => {
      idx++;
      setVisibleCount(idx);
      if (idx < total) {
        animRef.current = requestAnimationFrame(tick);
      }
    };

    setTimeout(() => {
      animRef.current = requestAnimationFrame(tick);
    }, 300);
  }, []);

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    add3DBuildings(map);
    if (onMapLoaded) onMapLoaded(mapRef.current);
    setMapReady(true);
    animateRoute(modePoints);
  }, [onMapLoaded, animateRoute, modePoints]);

  // Re-animate when the mode changes (new route geometry)
  useEffect(() => {
    if (!mapReady) return;
    animateRoute(modePoints);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMode.id, mapReady]);

  // Sync 3D pitch toggle
  useEffect(() => {
    if (!mapReady) return;
    mapRef.current?.easeTo({ pitch: is3DMode ? 52 : 0, duration: 850 });
  }, [is3DMode, mapReady]);

  // Cleanup animation on unmount
  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);

  const destCoords = currentMode.routeCoords.at(-1);

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
        {/* Animated route */}
        <Source id="route-src" type="geojson" data={routeGeoJSON} lineMetrics>
          <Layer {...glowLayer} />
          <Layer {...lineLayer} />
        </Source>

        {/* User location */}
        <Marker longitude={MOCK_USER_LOCATION[0]} latitude={MOCK_USER_LOCATION[1]} anchor="center">
          <UserLocationMarker />
        </Marker>

        {/* Route end marker (color follows mode) */}
        <Marker longitude={destCoords[0]} latitude={destCoords[1]} anchor="bottom">
          <DestinationMarker color={currentMode.color} />
        </Marker>

        {/* POI markers */}
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
