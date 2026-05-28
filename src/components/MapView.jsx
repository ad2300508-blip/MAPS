import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import Map, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import { motion } from 'framer-motion';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getModeById } from '../data/mockData';
import { useNearbyPOIs } from '../hooks/useNearbyPOIs';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const INITIAL_VIEW = { longitude: 12, latitude: 45, zoom: 5, pitch: 0, bearing: 0 };
const SEED = 3;

// ─── Interpolate geometry into micro-segments for smooth animation ────────
function interpolateLine(coords, targetPts) {
  if (!coords?.length || coords.length < 2) return [];
  const result = [];
  const segs = coords.length - 1;
  const pts  = Math.max(4, Math.floor(targetPts / segs));
  for (let i = 0; i < segs; i++) {
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
    const srcId = Object.entries(style.sources).find(([, s]) => s.type === 'vector')?.[0];
    if (!srcId) return;
    const firstSymbol = style.layers.find((l) => l.type === 'symbol')?.id;
    map.addLayer({
      id: '3d-buildings', type: 'fill-extrusion',
      source: srcId, 'source-layer': 'building',
      minzoom: 14, filter: ['has', 'render_height'],
      paint: {
        'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'render_height'],
          0, '#0d1117', 50, '#161b22', 150, '#1e2535', 300, '#252d45'],
        'fill-extrusion-height':  ['get', 'render_height'],
        'fill-extrusion-base':    ['get', 'render_min_height'],
        'fill-extrusion-opacity': 0.88,
      },
    }, firstSymbol);
  } catch { /* graceful */ }
}

// ─── User location marker with SVG compass arrow ──────────────────────────
function UserLocationMarker({ heading }) {
  return (
    <div style={{ position: 'relative', width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Pulse rings */}
      <span className="user-marker-ring"   style={{ position: 'absolute', width: 52, height: 52 }} />
      <span className="user-marker-ring-2" style={{ position: 'absolute', width: 52, height: 52 }} />

      {/* Direction cone (only when heading is known) */}
      {heading != null && (
        <div style={{
          position: 'absolute', width: 52, height: 52,
          transform: `rotate(${heading}deg)`,
          pointerEvents: 'none',
        }}>
          <svg width="52" height="52" viewBox="0 0 52 52" style={{ overflow: 'visible' }}>
            <polygon
              points="26,3 31,19 26,16 21,19"
              fill="rgba(76,201,240,0.85)"
              stroke="rgba(255,255,255,0.6)"
              strokeWidth="1"
            />
          </svg>
        </div>
      )}

      {/* Blue dot */}
      <span
        className="user-marker-dot"
        style={{
          position: 'relative', zIndex: 2,
          width: 16, height: 16,
          borderRadius: '50%',
          background: '#4cc9f0',
          border: '2.5px solid white',
          boxShadow: '0 0 12px 4px rgba(76,201,240,0.7)',
        }}
      />
    </div>
  );
}

// ─── Destination marker ───────────────────────────────────────────────────
function DestinationMarker({ color, emoji }) {
  return (
    <div className="dest-marker flex flex-col items-center" style={{ filter: `drop-shadow(0 4px 16px ${color}80)` }}>
      <div
        style={{
          width: 44, height: 44, borderRadius: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22,
          background: 'rgba(12,12,22,0.92)',
          border: `2px solid ${color}`,
          boxShadow: `0 0 20px ${color}60`,
        }}
      >
        {emoji ?? '📍'}
      </div>
      <div style={{
        width: 8, height: 12, marginTop: -2,
        background: `linear-gradient(180deg, ${color}, transparent)`,
        clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
      }} />
    </div>
  );
}

// ─── Nearby POI chip ──────────────────────────────────────────────────────
function POIChip({ poi, onTap }) {
  return (
    <motion.button
      onClick={(e) => { e.stopPropagation(); onTap(poi); }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileTap={{ scale: 0.88 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      className="focus:outline-none"
      style={{ cursor: 'pointer' }}
    >
      <div style={{
        background: 'rgba(10,10,20,0.88)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: 12,
        padding: '5px 8px',
        display: 'flex', alignItems: 'center', gap: 5,
        boxShadow: '0 2px 16px rgba(0,0,0,0.5)',
        maxWidth: 130,
      }}>
        <span style={{ fontSize: 16, lineHeight: 1 }}>{poi.emoji}</span>
        <span style={{
          fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.85)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {poi.name}
        </span>
      </div>
      {/* Pin tail */}
      <div style={{
        width: 6, height: 8, margin: '-2px auto 0',
        background: 'rgba(255,255,255,0.25)',
        clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
      }} />
    </motion.button>
  );
}

// ─── MapView ──────────────────────────────────────────────────────────────
export default function MapView({
  onMapLoaded,
  userLocation,
  userHeading,
  destination,
  route,
  selectedModeId,
  is3DMode,
  isNavigating,
  onPOITap,
}) {
  const mapRef  = useRef(null);
  const animRef = useRef(null);
  const [mapReady,       setMapReady]       = useState(false);
  const [visibleCount,   setVisibleCount]   = useState(SEED);
  const [hasFlownToUser, setHasFlownToUser] = useState(false);

  const currentMode = useMemo(() => getModeById(selectedModeId), [selectedModeId]);
  const nearbyPOIs  = useNearbyPOIs(userLocation);

  // Interpolate OSRM geometry
  const routeCoords = useMemo(() => {
    const coords = route?.geometry?.coordinates;
    return coords?.length >= 2 ? interpolateLine(coords, 180) : [];
  }, [route]);

  const hasRoute = routeCoords.length >= 2;

  // Always-mounted GeoJSON — controls opacity instead of conditional mount
  // (line-gradient + lineMetrics require the Source to never unmount)
  const routeGeoJSON = useMemo(() => ({
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: hasRoute
        ? routeCoords.slice(0, Math.max(2, visibleCount))
        : [[0, 0.0001], [0.0001, 0]],   // valid dummy, invisible via opacity:0
    },
  }), [routeCoords, visibleCount, hasRoute]);

  const glowLayer = useMemo(() => ({
    id: 'route-glow', type: 'line',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color':   currentMode.color,
      'line-width':   28,
      'line-opacity': hasRoute ? 0.13 : 0,
      'line-blur':    20,
    },
  }), [currentMode.color, hasRoute]);

  const lineLayer = useMemo(() => ({
    id: 'route-line', type: 'line',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-gradient': [
        'interpolate', ['linear'], ['line-progress'],
        0, currentMode.gradientStart,
        1, currentMode.gradientEnd,
      ],
      'line-width':   currentMode.lineWidth,
      'line-opacity': hasRoute ? 0.95 : 0,
    },
  }), [currentMode.gradientStart, currentMode.gradientEnd, currentMode.lineWidth, hasRoute]);

  // Animate route drawing
  const animateRoute = useCallback((pts) => {
    cancelAnimationFrame(animRef.current);
    setVisibleCount(SEED);
    if (!pts?.length) return;
    let idx = SEED;
    const tick = () => {
      idx++;
      setVisibleCount(idx);
      if (idx < pts.length) animRef.current = requestAnimationFrame(tick);
    };
    setTimeout(() => { animRef.current = requestAnimationFrame(tick); }, 150);
  }, []);

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    add3DBuildings(map);
    onMapLoaded?.(mapRef.current);
    setMapReady(true);
  }, [onMapLoaded]);

  // Fly to user once on GPS acquisition
  useEffect(() => {
    if (!mapReady || !userLocation || hasFlownToUser) return;
    mapRef.current?.flyTo({
      center: userLocation, zoom: 15.5,
      pitch: is3DMode ? 52 : 0, bearing: 0,
      duration: 1800, essential: true,
    });
    setHasFlownToUser(true);
  }, [mapReady, userLocation, hasFlownToUser, is3DMode]);

  // Re-animate when route changes
  useEffect(() => {
    if (mapReady) animateRoute(routeCoords);
  }, [routeCoords, mapReady, animateRoute]);

  // Navigation follow mode
  useEffect(() => {
    if (!isNavigating || !userLocation || !mapReady) return;
    mapRef.current?.easeTo({
      center: userLocation, bearing: userHeading ?? 0,
      zoom: 17, pitch: 60, duration: 600,
    });
  }, [isNavigating, userLocation, userHeading, mapReady]);

  // 3D pitch toggle
  useEffect(() => {
    if (!mapReady || isNavigating) return;
    mapRef.current?.easeTo({ pitch: is3DMode ? 52 : 0, duration: 850 });
  }, [is3DMode, mapReady, isNavigating]);

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Map
        ref={mapRef}
        initialViewState={INITIAL_VIEW}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAP_STYLE}
        onLoad={handleLoad}
        antialias
        attributionControl
      >
        {/* Route — always mounted, visibility via opacity */}
        <Source id="route-src" type="geojson" data={routeGeoJSON} lineMetrics={true}>
          <Layer {...glowLayer} />
          <Layer {...lineLayer} />
        </Source>

        {/* User location */}
        {userLocation && (
          <Marker longitude={userLocation[0]} latitude={userLocation[1]} anchor="center">
            <UserLocationMarker heading={userHeading} />
          </Marker>
        )}

        {/* Destination */}
        {destination && (
          <Marker longitude={destination.coords[0]} latitude={destination.coords[1]} anchor="bottom">
            <DestinationMarker color={currentMode.color} emoji={destination.emoji} />
          </Marker>
        )}

        {/* Nearby POIs — hidden during navigation */}
        {!isNavigating && nearbyPOIs.map((poi) => (
          <Marker key={poi.id} longitude={poi.coords[0]} latitude={poi.coords[1]} anchor="bottom">
            <POIChip poi={poi} onTap={onPOITap} />
          </Marker>
        ))}
      </Map>

      {/* GPS acquiring overlay */}
      {!userLocation && (
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none"
          style={{ background: 'rgba(9,9,15,0.65)', backdropFilter: 'blur(6px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div
            style={{ width: 64, height: 64, borderRadius: '50%', border: '2px solid rgba(76,201,240,0.4)' }}
            animate={{ scale: [1, 1.5, 1], opacity: [0.7, 0.15, 0.7] }}
            transition={{ repeat: Infinity, duration: 2 }}
          />
          <p style={{ color: 'rgba(148,163,184,0.9)', fontSize: 14, fontWeight: 500 }}>
            Acquisizione GPS…
          </p>
        </motion.div>
      )}
    </div>
  );
}
