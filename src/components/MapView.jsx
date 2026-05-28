import { useRef, useCallback, useEffect, useState } from 'react';
import Map, { Marker, Source, Layer } from 'react-map-gl';
import { motion } from 'framer-motion';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  MAPBOX_TOKEN,
  INITIAL_VIEW_STATE,
  MOCK_ROUTE,
  MOCK_POIS,
  MOCK_USER_LOCATION,
} from '../data/mockData';

// ─── Route layer definitions ───────────────────────────────────────────────
// Glow halo under the main line for the neon effect
const ROUTE_GLOW_LAYER = {
  id: 'route-glow',
  type: 'line',
  layout: { 'line-join': 'round', 'line-cap': 'round' },
  paint: {
    'line-color': '#4cc9f0',
    'line-width': 26,
    'line-opacity': 0.14,
    'line-blur': 18,
  },
};

// Main route line with a purple→indigo→cyan gradient
// lineMetrics={true} on the Source enables the line-gradient expression
const ROUTE_LINE_LAYER = {
  id: 'route-line',
  type: 'line',
  layout: { 'line-join': 'round', 'line-cap': 'round' },
  paint: {
    'line-gradient': [
      'interpolate',
      ['linear'],
      ['line-progress'],
      0,   '#7209b7',
      0.4, '#4361ee',
      1,   '#4cc9f0',
    ],
    'line-width': 7,
    'line-opacity': 0.96,
  },
};

// 3D buildings extruded from the composite tileset
const BUILDINGS_LAYER = {
  id: '3d-buildings',
  source: 'composite',
  'source-layer': 'building',
  filter: ['==', 'extrude', 'true'],
  type: 'fill-extrusion',
  minzoom: 14,
  paint: {
    'fill-extrusion-color': [
      'interpolate',
      ['linear'],
      ['get', 'height'],
      0,   '#0d1117',
      60,  '#161b22',
      150, '#1e2535',
      300, '#262f42',
    ],
    'fill-extrusion-height': [
      'interpolate', ['linear'], ['zoom'],
      14, 0,
      14.5, ['get', 'height'],
    ],
    'fill-extrusion-base': [
      'interpolate', ['linear'], ['zoom'],
      14, 0,
      14.5, ['get', 'min_height'],
    ],
    'fill-extrusion-opacity': 0.88,
  },
};

// ─── User location pulse marker ────────────────────────────────────────────
function UserLocationMarker() {
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: 36, height: 36 }}
    >
      <span className="user-marker-ring" style={{ width: 36, height: 36 }} />
      <span className="user-marker-ring-2" style={{ width: 36, height: 36 }} />
      <span
        className="relative w-4 h-4 rounded-full bg-[#4cc9f0] border-2 border-white user-marker-dot"
        style={{ boxShadow: '0 0 10px 3px rgba(76,201,240,0.65)' }}
      />
    </div>
  );
}

// ─── POI custom marker ─────────────────────────────────────────────────────
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
      {/* Marker body */}
      <motion.div
        className="flex items-center justify-center w-11 h-11 rounded-2xl glass-bright"
        animate={
          isSelected
            ? {
                boxShadow: [
                  `0 0 0 0 ${poi.color}55`,
                  `0 0 0 8px ${poi.color}00`,
                ],
              }
            : { boxShadow: '0 4px 16px rgba(0,0,0,0.45)' }
        }
        transition={
          isSelected
            ? { repeat: Infinity, duration: 1.8, ease: 'easeOut' }
            : {}
        }
        style={
          isSelected
            ? { border: `1.5px solid ${poi.color}`, boxShadow: `0 0 18px ${poi.color}60` }
            : {}
        }
      >
        <span className="text-xl leading-none select-none">{poi.emoji}</span>
      </motion.div>

      {/* Bottom pin tip */}
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

// ─── Destination marker ────────────────────────────────────────────────────
function DestinationMarker() {
  return (
    <div className="dest-marker relative flex flex-col items-center">
      <div
        className="w-5 h-5 rounded-full border-2 border-white"
        style={{
          background: 'linear-gradient(135deg, #4361ee, #4cc9f0)',
          boxShadow: '0 0 14px rgba(76,201,240,0.7)',
        }}
      />
      <div
        className="w-2 h-3 -mt-1"
        style={{
          background: 'linear-gradient(180deg, #4361ee, transparent)',
          clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
        }}
      />
    </div>
  );
}

// ─── "Token required" placeholder ─────────────────────────────────────────
function TokenRequired() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-surface-900">
      <motion.div
        className="glass-bright rounded-3xl p-8 max-w-sm mx-6 text-center"
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      >
        <div className="text-5xl mb-4">🗺️</div>
        <h2 className="text-lg font-semibold text-white mb-2">
          Mapbox Token Richiesto
        </h2>
        <p className="text-slate-400 text-sm leading-relaxed mb-5">
          Apri{' '}
          <code className="text-[#4cc9f0] bg-white/5 px-1.5 py-0.5 rounded text-xs">
            src/data/mockData.js
          </code>{' '}
          e sostituisci{' '}
          <code className="text-[#4cc9f0] bg-white/5 px-1.5 py-0.5 rounded text-xs">
            YOUR_MAPBOX_ACCESS_TOKEN_HERE
          </code>{' '}
          con il tuo token gratuito.
        </p>
        <a
          href="https://account.mapbox.com/access-tokens/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-[#4cc9f0] text-[#09090b] font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-[#6dd5f5] transition-colors"
        >
          Ottieni Token Gratuito →
        </a>
      </motion.div>
    </div>
  );
}

// ─── Main MapView component ────────────────────────────────────────────────
export default function MapView({ onMapLoaded, onPOISelect, selectedPOI, is3DMode }) {
  const mapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  const animateRouteDrawing = useCallback((map) => {
    if (!map.getLayer('route-line')) return;

    // Reveal route line from start → end over 2.4 s
    map.setPaintProperty('route-line', 'line-trim-offset', [0, 1]);
    map.setPaintProperty('route-glow', 'line-trim-offset', [0, 1]);

    const DURATION = 2400;
    const startTs = performance.now();

    const tick = (now) => {
      const t = Math.min(1, (now - startTs) / DURATION);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);

      try {
        map.setPaintProperty('route-line', 'line-trim-offset', [eased, 1]);
        map.setPaintProperty('route-glow', 'line-trim-offset', [eased, 1]);
      } catch (_) {
        // Layer might have been removed; abort silently
        return;
      }

      if (t < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, []);

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();

    // Expose the MapRef to App for programmatic camera control
    if (onMapLoaded) onMapLoaded(mapRef.current);

    setMapReady(true);

    // Short delay so tiles and layers are fully settled
    setTimeout(() => animateRouteDrawing(map), 600);
  }, [onMapLoaded, animateRouteDrawing]);

  // Sync 3D pitch when the toggle changes after initial load
  useEffect(() => {
    if (!mapReady) return;
    mapRef.current?.easeTo({ pitch: is3DMode ? 52 : 0, duration: 800 });
  }, [is3DMode, mapReady]);

  if (MAPBOX_TOKEN === 'YOUR_MAPBOX_ACCESS_TOKEN_HERE') {
    return <TokenRequired />;
  }

  return (
    <div className="w-full h-full">
      <Map
        ref={mapRef}
        initialViewState={INITIAL_VIEW_STATE}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        onLoad={handleLoad}
        antialias
        attributionControl={false}
      >
        {/* ── 3D Buildings ── */}
        {mapReady && <Layer {...BUILDINGS_LAYER} />}

        {/* ── Route layers ── */}
        <Source id="route-source" type="geojson" data={MOCK_ROUTE} lineMetrics>
          <Layer {...ROUTE_GLOW_LAYER} />
          <Layer {...ROUTE_LINE_LAYER} />
        </Source>

        {/* ── User location ── */}
        <Marker
          longitude={MOCK_USER_LOCATION[0]}
          latitude={MOCK_USER_LOCATION[1]}
          anchor="center"
        >
          <UserLocationMarker />
        </Marker>

        {/* ── Route destination ── */}
        <Marker longitude={2.2945} latitude={48.8584} anchor="bottom">
          <DestinationMarker />
        </Marker>

        {/* ── POI markers ── */}
        {MOCK_POIS.map((poi) => (
          <Marker
            key={poi.id}
            longitude={poi.coords[0]}
            latitude={poi.coords[1]}
            anchor="bottom"
          >
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
