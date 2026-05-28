import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import Map, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import { motion } from 'framer-motion';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getModeById } from '../data/mockData';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const INITIAL_VIEW = { longitude: 12, latitude: 45, zoom: 5, pitch: 0, bearing: 0 };
const SEED_COUNT = 4;

// ─── Interpolate geometry into more points for smooth animation ──────────
function interpolateLine(coords, targetPts) {
  if (!coords || coords.length < 2) return coords ?? [];
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

function add3DBuildings(map) {
  try {
    const style = map.getStyle();
    const vectorSourceId = Object.entries(style.sources).find(([, s]) => s.type === 'vector')?.[0];
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
            0, '#0d1117', 50, '#161b22', 150, '#1e2535', 300, '#252d45',
          ],
          'fill-extrusion-height': ['get', 'render_height'],
          'fill-extrusion-base':   ['get', 'render_min_height'],
          'fill-extrusion-opacity': 0.88,
        },
      },
      firstSymbolId,
    );
  } catch { /* graceful fallback */ }
}

// ─── User location marker ─────────────────────────────────────────────────
function UserLocationMarker({ heading }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 40, height: 40 }}>
      <span className="user-marker-ring"   style={{ width: 40, height: 40 }} />
      <span className="user-marker-ring-2" style={{ width: 40, height: 40 }} />
      {heading != null && (
        <div
          className="absolute"
          style={{
            width: 0, height: 0,
            borderLeft: '7px solid transparent',
            borderRight: '7px solid transparent',
            borderBottom: '18px solid rgba(76,201,240,0.8)',
            bottom: '50%',
            transformOrigin: '50% 100%',
            transform: `rotate(${heading}deg)`,
            marginBottom: '1px',
          }}
        />
      )}
      <span
        className="relative w-4 h-4 rounded-full bg-[#4cc9f0] border-2 border-white user-marker-dot"
        style={{ boxShadow: '0 0 10px 3px rgba(76,201,240,0.65)' }}
      />
    </div>
  );
}

// ─── Destination marker ───────────────────────────────────────────────────
function DestinationMarker({ color, emoji }) {
  return (
    <div className="dest-marker flex flex-col items-center">
      <div
        className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl glass-bright"
        style={{ border: `1.5px solid ${color}`, boxShadow: `0 0 18px ${color}60` }}
      >
        {emoji ?? '📍'}
      </div>
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

// ─── MapView ──────────────────────────────────────────────────────────────
export default function MapView({
  onMapLoaded,
  userLocation,
  userHeading,
  destination,
  route,            // OSRM route object (or null)
  selectedModeId,
  is3DMode,
  isNavigating,
}) {
  const mapRef  = useRef(null);
  const animRef = useRef(null);
  const [mapReady,      setMapReady]      = useState(false);
  const [visibleCount,  setVisibleCount]  = useState(SEED_COUNT);
  const [hasFlownToUser, setHasFlownToUser] = useState(false);

  const currentMode = useMemo(() => getModeById(selectedModeId), [selectedModeId]);

  // Build interpolated route coordinates from OSRM geometry
  const routeCoords = useMemo(() => {
    const coords = route?.geometry?.coordinates;
    if (!coords?.length) return [];
    return interpolateLine(coords, 160);
  }, [route]);

  // GeoJSON fed to the map layer
  const routeGeoJSON = useMemo(
    () => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: routeCoords.slice(0, visibleCount) },
    }),
    [routeCoords, visibleCount],
  );

  const glowLayer = useMemo(() => ({
    id: 'route-glow',
    type: 'line',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': currentMode.color, 'line-width': 26, 'line-opacity': 0.12, 'line-blur': 18 },
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
  const animateRoute = useCallback((pts) => {
    cancelAnimationFrame(animRef.current);
    setVisibleCount(SEED_COUNT);
    if (!pts?.length) return;

    let idx = SEED_COUNT;
    const total = pts.length;
    const tick = () => {
      idx++;
      setVisibleCount(idx);
      if (idx < total) animRef.current = requestAnimationFrame(tick);
    };
    setTimeout(() => { animRef.current = requestAnimationFrame(tick); }, 200);
  }, []);

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    add3DBuildings(map);
    if (onMapLoaded) onMapLoaded(mapRef.current);
    setMapReady(true);
  }, [onMapLoaded]);

  // Fly to user once GPS is acquired
  useEffect(() => {
    if (!mapReady || !userLocation || hasFlownToUser) return;
    mapRef.current?.flyTo({
      center: userLocation,
      zoom: 15,
      pitch: is3DMode ? 52 : 0,
      bearing: 0,
      duration: 1800,
      essential: true,
    });
    setHasFlownToUser(true);
  }, [mapReady, userLocation, hasFlownToUser, is3DMode]);

  // Re-animate when route changes (new destination or mode)
  useEffect(() => {
    if (!mapReady) return;
    animateRoute(routeCoords);
  }, [routeCoords, mapReady, animateRoute]);

  // Navigation follow mode: map tracks user position + heading
  useEffect(() => {
    if (!isNavigating || !userLocation || !mapReady) return;
    mapRef.current?.easeTo({
      center: userLocation,
      bearing: userHeading ?? 0,
      zoom: 17,
      pitch: 60,
      duration: 600,
    });
  }, [isNavigating, userLocation, userHeading, mapReady]);

  // 3D pitch toggle
  useEffect(() => {
    if (!mapReady || isNavigating) return;
    mapRef.current?.easeTo({ pitch: is3DMode ? 52 : 0, duration: 850 });
  }, [is3DMode, mapReady, isNavigating]);

  // Cleanup
  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  return (
    <div className="w-full h-full">
      <Map
        ref={mapRef}
        initialViewState={INITIAL_VIEW}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAP_STYLE}
        onLoad={handleLoad}
        antialias
        attributionControl
      >
        {/* Animated route line */}
        {routeCoords.length > 1 && (
          <Source id="route-src" type="geojson" data={routeGeoJSON} lineMetrics>
            <Layer {...glowLayer} />
            <Layer {...lineLayer} />
          </Source>
        )}

        {/* User location */}
        {userLocation && (
          <Marker longitude={userLocation[0]} latitude={userLocation[1]} anchor="center">
            <UserLocationMarker heading={userHeading} />
          </Marker>
        )}

        {/* Destination marker */}
        {destination && (
          <Marker longitude={destination.coords[0]} latitude={destination.coords[1]} anchor="bottom">
            <DestinationMarker color={currentMode.color} emoji={destination.emoji} />
          </Marker>
        )}
      </Map>

      {/* GPS acquiring overlay */}
      {!userLocation && (
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-surface-900/60 backdrop-blur-sm pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-16 h-16 rounded-full border-2 border-[#4cc9f0]/30"
            animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0.2, 0.6] }}
            transition={{ repeat: Infinity, duration: 2 }}
          />
          <p className="text-sm text-slate-400 font-medium">Acquisizione GPS…</p>
        </motion.div>
      )}
    </div>
  );
}
