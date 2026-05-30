import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import Map, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import { motion } from 'framer-motion';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getModeById, haversineMeters, formatDistance, maneuverIcon } from '../data/mockData';
import { useNearbyPOIs } from '../hooks/useNearbyPOIs';

const STYLE_DARK    = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const STYLE_LIGHT   = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const STYLE_VOYAGER = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
export const MAP_STYLE_URLS = { dark: STYLE_DARK, light: STYLE_LIGHT, voyager: STYLE_VOYAGER };
const SEED = 3;
const AUTOMOTIVE_TYPES = new Set(['fuel', 'parking']);

// Offset a [lng,lat] point by distM meters along bearingDeg (degrees clockwise from north)
function forwardOffset([lng, lat], bearingDeg, distM) {
  const R    = 6_371_000;
  const brng = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const dLat = (distM / R) * Math.cos(brng);
  const dLng = (distM / R) * Math.sin(brng) / Math.cos(lat1);
  return [lng + (dLng * 180) / Math.PI, lat + (dLat * 180) / Math.PI];
}

// Start near the user's last known position (much better UX on re-launch)
const INITIAL_VIEW = (() => {
  try {
    const lng = parseFloat(localStorage.getItem('maps-last-lng') ?? '');
    const lat = parseFloat(localStorage.getItem('maps-last-lat') ?? '');
    if (!isNaN(lng) && !isNaN(lat)) return { longitude: lng, latitude: lat, zoom: 14, pitch: 0, bearing: 0 };
  } catch { /* private browsing */ }
  return { longitude: 12, latitude: 45, zoom: 5, pitch: 0, bearing: 0 };
})();

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

function add3DBuildings(map, isDark = true) {
  if (!isDark) return; // 3D buildings only for dark style (light/voyager use flat 2D)
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

// ─── GPS accuracy circle polygon (avoids MapLibre circle-radius pixel issues) ─
function accuracyPolygon([lng, lat], radiusM, segments = 32) {
  const pts = Array.from({ length: segments + 1 }, (_, i) => {
    const angle = (i / segments) * 2 * Math.PI;
    const dLat  = (radiusM / 6_371_000) * (180 / Math.PI);
    const dLng  = dLat / Math.cos(lat * Math.PI / 180);
    return [lng + dLng * Math.sin(angle), lat + dLat * Math.cos(angle)];
  });
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } };
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

// ─── Next-turn marker (shown during navigation at the upcoming maneuver point) ──
function TurnMarker({ type, modifier, color }) {
  const icon = maneuverIcon(type, modifier);
  return (
    <div style={{
      width: 34, height: 34, borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(10,10,20,0.93)',
      border: `2.5px solid ${color}`,
      fontSize: 17,
      boxShadow: `0 2px 14px ${color}70, 0 0 0 3px ${color}18`,
    }}>
      {icon}
    </div>
  );
}

// ─── Nearby POI chip ──────────────────────────────────────────────────────
function POIChip({ poi, onTap, staggerIdx, isLightMap }) {
  const bg     = isLightMap ? 'rgba(255,255,255,0.95)' : 'rgba(10,10,20,0.88)';
  const border = isLightMap ? '1px solid rgba(0,0,0,0.12)' : '1px solid rgba(255,255,255,0.18)';
  const textC  = isLightMap ? 'rgba(15,23,42,0.9)'        : 'rgba(255,255,255,0.85)';
  const subC   = isLightMap ? 'rgba(71,85,105,0.8)'       : 'rgba(148,163,184,0.7)';
  return (
    <motion.button
      onClick={(e) => { e.stopPropagation(); onTap(poi); }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileTap={{ scale: 0.88 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22, delay: Math.min(staggerIdx ?? 0, 8) * 0.06 }}
      className="focus:outline-none"
      style={{ cursor: 'pointer' }}
    >
      <div style={{
        background: bg,
        backdropFilter: 'blur(12px)',
        border,
        borderRadius: 12,
        padding: '5px 8px',
        display: 'flex', alignItems: 'center', gap: 5,
        boxShadow: isLightMap ? '0 2px 12px rgba(0,0,0,0.15)' : '0 2px 16px rgba(0,0,0,0.5)',
        maxWidth: 130,
      }}>
        <span style={{ fontSize: 16, lineHeight: 1 }}>{poi.emoji}</span>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, color: textC,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {poi.name}
          </span>
          {poi._d != null && (
            <span style={{ fontSize: 9, color: subC, lineHeight: 1 }}>
              {formatDistance(poi._d)}
            </span>
          )}
        </div>
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
  userAccuracy,
  userSpeed,
  destination,
  route,
  altRoute,
  selectedModeId,
  is3DMode,
  isNavigating,
  isFollowing,
  isOffRoute,
  currentStepIdx,
  mapStyleUrl,
  onPOITap,
  onLongPress,
  onUserPan,
}) {
  const mapRef  = useRef(null);
  const animRef = useRef(null);
  const [mapReady,       setMapReady]       = useState(false);
  const [visibleCount,   setVisibleCount]   = useState(SEED);
  const [hasFlownToUser, setHasFlownToUser] = useState(false);
  const [mapZoom,        setMapZoom]        = useState(INITIAL_VIEW.zoom);

  const currentMode    = useMemo(() => getModeById(selectedModeId), [selectedModeId]);
  const nearbyPOIs     = useNearbyPOIs(userLocation, { paused: isNavigating });
  const accuracyGeoJSON = useMemo(
    () => (userLocation && userAccuracy > 8 ? accuracyPolygon(userLocation, userAccuracy) : null),
    [userLocation, userAccuracy],
  );

  // Show the closest POIs within 2 km; hide automotive POIs for walk/bike modes
  const sortedPOIs = useMemo(() => {
    const filtered = (selectedModeId === 'walk' || selectedModeId === 'bike')
      ? nearbyPOIs.filter(p => !AUTOMOTIVE_TYPES.has(p.type))
      : nearbyPOIs;
    if (!userLocation || !filtered.length) return filtered.slice(0, 10);
    const cap = (selectedModeId === 'walk' || selectedModeId === 'bike') ? 6 : 10;
    return [...filtered]
      .map(p => ({ ...p, _d: haversineMeters(userLocation, p.coords) }))
      .filter(p => p._d < 2000)                     // cap to 2 km radius
      .sort((a, b) => a._d - b._d)
      .slice(0, cap);
  }, [nearbyPOIs, userLocation, selectedModeId]);

  // Interpolate OSRM geometry
  const routeCoords = useMemo(() => {
    const coords = route?.geometry?.coordinates;
    return coords?.length >= 2 ? interpolateLine(coords, 180) : [];
  }, [route]);

  // Alternative route — always-mounted source (opacity:0 when absent) to avoid
  // MapLibre source add/remove flicker during planning phase GPS updates
  const hasAltRoute = !!(altRoute?.geometry?.coordinates?.length);
  const altRouteGeoJSON = useMemo(() => ({
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: altRoute?.geometry?.coordinates ?? [[12, 45], [12.001, 45]],
    },
  }), [altRoute]);

  const hasRoute = routeCoords.length >= 2;

  // During navigation, trim route to only show the remaining portion
  const trimmedCoords = useMemo(() => {
    if (!isNavigating || !userLocation || routeCoords.length < 2) return routeCoords;
    let minDist = Infinity, closestIdx = 0;
    for (let i = 0; i < routeCoords.length; i++) {
      const d = haversineMeters(userLocation, routeCoords[i]);
      if (d < minDist) { minDist = d; closestIdx = i; }
    }
    const sliced = routeCoords.slice(Math.max(0, closestIdx - 1));
    return sliced.length >= 2 ? sliced : routeCoords;
  }, [routeCoords, userLocation, isNavigating]);

  // Slice coordinates to the animated count
  const visibleCoords = useMemo(
    () => hasRoute ? trimmedCoords.slice(0, Math.max(2, visibleCount)) : null,
    [trimmedCoords, visibleCount, hasRoute],
  );

  // Separate GeoJSONs for the two layers — avoids lineMetrics/line-gradient
  // which is unreliable in Android WebView
  const routeGeoJSON = useMemo(() => ({
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: visibleCoords ?? [[12, 45], [12.001, 45]],
    },
  }), [visibleCoords]);

  // Route color — orange tint when off-route to signal "recalculating"
  const routeColor = isOffRoute ? '#f97316' : currentMode.color;

  // Outer glow — wide, blurred, low opacity
  const glowLayer = useMemo(() => ({
    id: 'route-glow', type: 'line',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color':   routeColor,
      'line-width':   24,
      'line-blur':    18,
      'line-opacity': hasRoute ? 0.22 : 0,
    },
  }), [routeColor, hasRoute]);

  // Core solid line — reliable everywhere, no lineMetrics needed
  const lineLayer = useMemo(() => ({
    id: 'route-line', type: 'line',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color':   routeColor,
      'line-width':   currentMode.lineWidth,
      'line-opacity': hasRoute ? (isOffRoute ? 0.5 : 0.92) : 0,
    },
  }), [routeColor, currentMode.lineWidth, hasRoute, isOffRoute]);

  // Bright centre stripe for depth
  const coreLayer = useMemo(() => ({
    id: 'route-core', type: 'line',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color':   '#ffffff',
      'line-width':   Math.max(1.5, currentMode.lineWidth * 0.22),
      'line-opacity': hasRoute && !isOffRoute ? 0.35 : 0,
    },
  }), [currentMode.lineWidth, hasRoute, isOffRoute]);

  // Direction arrows along the route — small ▶ chevrons spaced every 80 px
  const arrowLayer = useMemo(() => ({
    id: 'route-arrows', type: 'symbol',
    layout: {
      'symbol-placement':           'line',
      'symbol-spacing':             80,
      'text-field':                 '▶',
      'text-size':                  10,
      'text-rotation-alignment':    'map',
      'text-pitch-alignment':       'map',
      'text-ignore-placement':      true,
      'text-allow-overlap':         true,
      'text-keep-upright':          false,
    },
    paint: {
      'text-color':       '#ffffff',
      'text-opacity':     hasRoute ? 0.55 : 0,
      'text-halo-color':  'rgba(0,0,0,0.3)',
      'text-halo-width':  0.5,
    },
  }), [hasRoute]);

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

  const mapStyleUrlRef = useRef(mapStyleUrl);
  useEffect(() => { mapStyleUrlRef.current = mapStyleUrl; }, [mapStyleUrl]);

  const handleLoad = useCallback(() => {
    const map    = mapRef.current?.getMap();
    if (!map) return;
    const isDark = !mapStyleUrlRef.current || mapStyleUrlRef.current.includes('dark-matter');
    add3DBuildings(map, isDark);
    onMapLoaded?.(mapRef.current);
    setMapReady(true);
  }, [onMapLoaded]);

  // Persist last GPS position so next launch starts near the user
  useEffect(() => {
    if (!userLocation) return;
    try {
      localStorage.setItem('maps-last-lng', userLocation[0]);
      localStorage.setItem('maps-last-lat', userLocation[1]);
    } catch { /* private browsing */ }
  }, [userLocation]);

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

  // Re-animate only when route geometry actually changes (not GPS jitter)
  const prevRouteKeyRef = useRef(null);
  useEffect(() => {
    if (!mapReady) return;
    const first = routeCoords[0];
    const last  = routeCoords[routeCoords.length - 1];
    const key   = first && last
      ? `${first[0].toFixed(3)},${first[1].toFixed(3)}-${last[0].toFixed(3)},${last[1].toFixed(3)}`
      : '';
    if (key === prevRouteKeyRef.current) return;
    prevRouteKeyRef.current = key;
    if (isNavigating) {
      // During active navigation show the updated remaining route instantly —
      // the draw animation would cause a visible flicker on every OSRM refetch (~100 m)
      setVisibleCount(routeCoords.length);
    } else {
      animateRoute(routeCoords);
    }
  }, [routeCoords, mapReady, isNavigating, animateRoute]);

  // Navigation follow mode — only when map is centered (user hasn't panned away)
  useEffect(() => {
    if (!isNavigating || !isFollowing || !userLocation || !mapReady) return;
    // Scale zoom/pitch to speed: more forward visibility at highway speeds,
    // lower pitch for walkers/cyclists so more context is visible around them
    const kmh      = (userSpeed ?? 0) * 3.6;
    const navZoom  = kmh > 100 ? 15 : kmh > 50 ? 16 : 17;
    const navPitch = kmh > 100 ? 50 : kmh > 50 ? 55 : kmh > 10 ? 60 : 45;
    // Look-ahead offset: shift center ahead in the travel direction so more road
    // is visible in front of the user rather than behind them.
    const lookAheadM  = kmh > 100 ? 350 : kmh > 50 ? 200 : kmh > 20 ? 100 : 50;
    const center = (userHeading != null)
      ? forwardOffset(userLocation, userHeading, lookAheadM)
      : userLocation;
    mapRef.current?.easeTo({
      center, bearing: userHeading ?? 0,
      zoom: navZoom, pitch: navPitch, duration: 400,
    });
  }, [isNavigating, isFollowing, userLocation, userHeading, mapReady, userSpeed]);

  // 3D pitch toggle
  useEffect(() => {
    if (!mapReady || isNavigating) return;
    mapRef.current?.easeTo({ pitch: is3DMode ? 52 : 0, duration: 850 });
  }, [is3DMode, mapReady, isNavigating]);

  // Track zoom level to hide POI chips when too far out
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const onZoom = () => setMapZoom(map.getZoom());
    map.on('zoom', onZoom);
    return () => map.off('zoom', onZoom);
  }, [mapReady]);

  // Detect user manually panning during navigation
  useEffect(() => {
    if (!mapReady || !onUserPan) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const onMoveStart = (e) => {
      if (e.originalEvent) onUserPan(); // user-initiated (not programmatic)
    };
    map.on('movestart', onMoveStart);
    return () => map.off('movestart', onMoveStart);
  }, [mapReady, onUserPan]);

  // Long-press → fire onLongPress with [lng, lat]
  useEffect(() => {
    if (!mapReady || !onLongPress) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    let timer = null;
    let startX = 0, startY = 0, moved = false;
    const onStart = (e) => {
      if (e.touches.length !== 1) return;
      moved = false;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      timer = setTimeout(() => {
        if (moved) return;
        navigator.vibrate?.([45]);  // brief haptic confirms long-press
        const canvas = map.getCanvas();
        const rect   = canvas.getBoundingClientRect();
        const ll = map.unproject([startX - rect.left, startY - rect.top]);
        onLongPress([ll.lng, ll.lat]);
      }, 600);
    };
    const onMove = (e) => {
      if (Math.abs(e.touches[0].clientX - startX) > 8 ||
          Math.abs(e.touches[0].clientY - startY) > 8) {
        moved = true;
        clearTimeout(timer);
      }
    };
    const onEnd = () => clearTimeout(timer);
    const canvas = map.getCanvas();
    canvas.addEventListener('touchstart', onStart, { passive: true });
    canvas.addEventListener('touchmove',  onMove,  { passive: true });
    canvas.addEventListener('touchend',   onEnd);
    return () => {
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchmove',  onMove);
      canvas.removeEventListener('touchend',   onEnd);
      clearTimeout(timer);
    };
  }, [mapReady, onLongPress]);

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Map
        ref={mapRef}
        initialViewState={INITIAL_VIEW}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyleUrl ?? STYLE_DARK}
        onLoad={handleLoad}
        antialias
        attributionControl
      >
        {/* GPS accuracy circle — shown when accuracy > 8 m */}
        {accuracyGeoJSON && (
          <Source id="accuracy-src" type="geojson" data={accuracyGeoJSON}>
            <Layer id="accuracy-fill" type="fill"
              paint={{ 'fill-color': '#4cc9f0', 'fill-opacity': 0.07 }} />
            <Layer id="accuracy-ring" type="line"
              paint={{ 'line-color': '#4cc9f0', 'line-opacity': 0.25, 'line-width': 1 }} />
          </Source>
        )}

        {/* Alternative route — always mounted, opacity:0 when absent */}
        <Source id="alt-route-src" type="geojson" data={altRouteGeoJSON}>
          <Layer
            id="alt-route-line"
            type="line"
            layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            paint={{
              'line-color':     currentMode.color,
              'line-width':     currentMode.lineWidth * 0.55,
              'line-opacity':   hasAltRoute ? 0.3 : 0,
              'line-dasharray': [3, 4],
            }}
          />
        </Source>

        {/* Route — always mounted, opacity:0 when no route (no lineMetrics needed) */}
        <Source id="route-src" type="geojson" data={routeGeoJSON}>
          <Layer {...glowLayer} />
          <Layer {...lineLayer} />
          <Layer {...coreLayer} />
          <Layer {...arrowLayer} />
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

        {/* Next-turn marker during navigation */}
        {isNavigating && route && currentStepIdx != null && (() => {
          const steps    = route.legs?.[0]?.steps ?? [];
          const nextStep = steps[currentStepIdx + 1];
          if (!nextStep || nextStep.maneuver?.type === 'arrive') return null;
          const loc = nextStep.maneuver?.location;
          if (!loc) return null;
          const distToTurn = userLocation ? haversineMeters(userLocation, loc) : null;
          // Fade out when very close (< 40m) to avoid overlapping with the user dot at the turn
          const opacity = distToTurn != null && distToTurn < 40 ? 0 : 1;
          return (
            <Marker longitude={loc[0]} latitude={loc[1]} anchor="bottom">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', opacity, transition: 'opacity 0.8s ease' }}>
                <TurnMarker
                  type={nextStep.maneuver?.type}
                  modifier={nextStep.maneuver?.modifier}
                  color={currentMode.color}
                />
                {distToTurn != null && distToTurn < 1500 && (
                  <div style={{
                    fontSize: 9, fontWeight: 700, color: currentMode.color,
                    marginTop: 2, textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                  }}>
                    {formatDistance(distToTurn)}
                  </div>
                )}
              </div>
            </Marker>
          );
        })()}

        {/* Nearby POIs — hidden during navigation or when zoomed out.
            Render in reverse distance order so closest POI chip is on top (DOM stacking).
            Limit chip count by zoom level to reduce overlap at low zoom. */}
        {!isNavigating && mapZoom >= 13 && (() => {
          const visibleCap = mapZoom >= 15 ? sortedPOIs.length : mapZoom >= 14 ? 5 : 3;
          const visible = sortedPOIs.slice(0, visibleCap);
          return [...visible].reverse().map((poi, revIdx) => (
            <Marker key={poi.id} longitude={poi.coords[0]} latitude={poi.coords[1]} anchor="bottom">
              <POIChip poi={poi} onTap={onPOITap} staggerIdx={visible.length - 1 - revIdx} isLightMap={!!(mapStyleUrl && !mapStyleUrl.includes('dark-matter'))} />
            </Marker>
          ));
        })()}
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
