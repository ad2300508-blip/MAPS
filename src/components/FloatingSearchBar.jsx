import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Loader } from 'lucide-react';
import { placeEmoji, haversineMeters, formatDistance } from '../data/mockData';

// Detect "lat, lng" input and return {lat, lng} or null
// Requires at least one decimal to avoid ambiguity with plain numbers
const COORD_RE = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
function parseCoords(q) {
  const m = q.match(COORD_RE);
  if (!m) return null;
  if (!m[1].includes('.') && !m[2].includes('.')) return null; // both integers — too ambiguous
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

const CATEGORIES = [
  { label: 'Ristoranti',   icon: '🍽', q: 'ristorante',           ov: { amenity: 'restaurant' } },
  { label: 'Caffè',        icon: '☕', q: 'caffè',                 ov: { amenity: 'cafe' } },
  { label: 'Farmacia',     icon: '💊', q: 'farmacia',              ov: { amenity: 'pharmacy' } },
  { label: 'Benzina',      icon: '⛽', q: 'distributore benzina',  ov: { amenity: 'fuel' } },
  { label: 'Supermercato', icon: '🛒', q: 'supermercato',          ov: { shop: 'supermarket' } },
  { label: 'Parcheggio',   icon: '🅿️', q: 'parcheggio',           ov: { amenity: 'parking' } },
  { label: 'ATM',          icon: '💳', q: 'bancomat',              ov: { amenity: 'atm' } },
  { label: 'Medico',       icon: '🩺', q: 'medico',                ov: { amenity: 'doctors' } },
  { label: 'Hotel',        icon: '🏨', q: 'hotel',                 ov: { tourism: 'hotel' } },
  { label: 'Ospedale',     icon: '🏥', q: 'ospedale',              ov: { amenity: 'hospital' } },
];

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function searchNearbyCategory(lat, lng, ov, radius = 3000) {
  const [key, val] = Object.entries(ov)[0];
  const query = `[out:json][timeout:10];(node["${key}"="${val}"](around:${radius},${lat},${lng});way["${key}"="${val}"](around:${radius},${lat},${lng}););out center 12;`;
  const body  = `data=${encodeURIComponent(query)}`;
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(mirror, {
        method: 'POST', body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.elements) return data.elements;
    } catch { /* try next mirror */ }
  }
  return null;
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

function ResultRow({ emoji, primary, secondary, dist, onClick }) {
  return (
    <motion.button
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 rounded-xl transition-colors text-left focus:outline-none"
      onClick={onClick}
      whileTap={{ scale: 0.99 }}
    >
      <div
        className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-lg"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate leading-tight">{primary}</p>
        <p className="text-xs text-slate-500 truncate mt-0.5">{secondary}</p>
      </div>
      {dist != null && (
        <span className="flex-shrink-0 text-[11px] font-semibold text-slate-500 ml-1">{dist}</span>
      )}
    </motion.button>
  );
}

export default function FloatingSearchBar({ isActive, onActiveChange, onResultSelect, userLocation, isOnline = true }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState(() => {
    try { return JSON.parse(localStorage.getItem('maps-recent') ?? '[]'); } catch { return []; }
  });
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem('via-favorites') ?? '[]'); } catch { return []; }
  });
  const inputRef    = useRef(null);
  const debounceRef = useRef(null);
  const abortRef    = useRef(null);
  const catTokenRef = useRef(null); // stale-search guard for async Overpass category search

  // Local search through saved/recent when offline
  const offlineMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || isOnline) return [];
    const match = (item) =>
      item.name?.toLowerCase().includes(q) || item.address?.toLowerCase().includes(q);
    const favMatches  = favorites.filter(match);
    const favNames    = new Set(favMatches.map((f) => f.name));
    const recMatches  = recent.filter((r) => match(r) && !favNames.has(r.name));
    return [...favMatches, ...recMatches].slice(0, 6);
  }, [query, isOnline, favorites, recent]);

  useEffect(() => {
    if (isActive) {
      setTimeout(() => inputRef.current?.focus(), 120);
      // Re-sync favorites from localStorage (may have been updated by POIDetailsPanel)
      try { setFavorites(JSON.parse(localStorage.getItem('via-favorites') ?? '[]')); } catch { }
    }
  }, [isActive]);

  const search = useCallback(async (q) => {
    abortRef.current?.abort();
    if (!q.trim()) { setResults([]); setLoading(false); return; }

    // If the query looks like "lat, lng" coordinates, bypass Nominatim
    const coords = parseCoords(q);
    if (coords) {
      setResults([{
        lat: String(coords.lat), lon: String(coords.lng),
        display_name: `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
        name: 'Coordinate',
        class: 'place', type: 'coordinates',
        _isCoord: true,
      }]);
      setLoading(false);
      return;
    }

    if (!isOnline) { setResults([]); setLoading(false); return; }

    abortRef.current = new AbortController();
    setLoading(true);

    try {
      const params = new URLSearchParams({
        q,
        format: 'json',
        limit: 8,
        addressdetails: 1,
        'accept-language': 'it,en',
      });

      // Bias results toward user's location — 0.3° ≈ 33 km, soft-bounded so
      // results outside still appear when the local area has nothing matching
      if (userLocation) {
        const [lng, lat] = userLocation;
        params.set('viewbox', `${lng - 0.3},${lat - 0.3},${lng + 0.3},${lat + 0.3}`);
        params.set('bounded', 0);
      }

      const res = await fetch(`${NOMINATIM}?${params}`, {
        signal: abortRef.current.signal,
        headers: { 'Accept-Language': 'it,en' },
      });
      const data = await res.json();
      setResults(data);
    } catch (e) {
      if (e.name !== 'AbortError') setResults([]);
    } finally {
      setLoading(false);
    }
  }, [userLocation?.[0], userLocation?.[1]]);

  const handleQueryChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounceRef.current);
    if (q.trim()) {
      setLoading(true); // immediate spinner before debounce fires
      debounceRef.current = setTimeout(() => search(q), 500);
    } else {
      setLoading(false);
      setResults([]);
      abortRef.current?.abort();
    }
  };

  const handleCategoryTap = async (cat) => {
    navigator.vibrate?.([15]);
    setQuery(cat.label);
    setLoading(true);
    setResults([]);
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    // Prefer Overpass for nearby POI search when we have GPS — much more accurate than Nominatim
    if (cat.ov && userLocation) {
      const token = {};          // unique object for this search attempt
      catTokenRef.current = token;
      const [lng, lat] = userLocation;
      try {
        const elements = await searchNearbyCategory(lat, lng, cat.ov);
        if (catTokenRef.current !== token) return; // a newer search has started
        if (elements) {
          const pois = elements
            .map((el) => {
              const lon = el.lon ?? el.center?.lon;
              const elLat = el.lat ?? el.center?.lat;
              if (lon == null || elLat == null) return null;
              const [key] = Object.keys(cat.ov);
              const osmType = el.tags?.[key] ?? '';
              return {
                lat: String(elLat), lon: String(lon),
                display_name: el.tags?.name || cat.label,
                name: el.tags?.name || cat.label,
                _addr: [el.tags?.['addr:street'], el.tags?.['addr:housenumber']].filter(Boolean).join(' '),
                class: key === 'amenity' ? 'amenity' : key === 'shop' ? 'shop' : 'tourism',
                type: osmType,
                _d: haversineMeters([lng, lat], [lon, elLat]),
              };
            })
            .filter(Boolean)
            .sort((a, b) => a._d - b._d);
          setResults(pois);
          setLoading(false);
          return;
        }
      } catch { /* fall through to Nominatim */ }
    }

    catTokenRef.current = null;
    // Fall back to Nominatim
    search(cat.q);
  };

  const handleClose = () => {
    onActiveChange(false);
    setQuery('');
    setResults([]);
    setLoading(false);
    abortRef.current?.abort();
    inputRef.current?.blur();
  };

  const handleSelect = (item) => {
    const dest = {
      name:    item.nameShort || item.display_name?.split(',')[0] || 'Luogo',
      address: item.address   || '',
      coords:  [parseFloat(item.lon), parseFloat(item.lat)],
      emoji:   item.emoji     || '📍',
      type:    item.type      || '',
    };

    // Save to recent
    const updated = [dest, ...recent.filter((r) => r.name !== dest.name)].slice(0, 8);
    setRecent(updated);
    try { localStorage.setItem('maps-recent', JSON.stringify(updated)); } catch {}

    onResultSelect(dest);
    handleClose();
  };

  const parseResult = (r) => {
    if (r._isCoord) {
      return { ...r, nameShort: r.display_name, address: 'Coordinate GPS', emoji: '📍' };
    }
    // Overpass results have _addr and _d pre-computed
    if (r._d != null) {
      const emoji = placeEmoji(r.class, r.type);
      return { ...r, nameShort: r.name || r.display_name || 'Luogo', address: r._addr || '', emoji };
    }
    const parts     = (r.display_name ?? '').split(', ').filter(Boolean);
    const nameShort = parts.length > 0 ? parts.slice(0, 2).join(', ') : (r.name ?? 'Luogo');
    const address   = parts.length > 2 ? parts.slice(2, 5).join(', ') : '';
    const emoji     = placeEmoji(r.class, r.type);
    return { ...r, nameShort, address, emoji };
  };

  return (
    <>
      <AnimatePresence>
        {isActive && (
          <motion.div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
          />
        )}
      </AnimatePresence>

      <div className="absolute top-5 left-1/2 -translate-x-1/2 w-full max-w-xl px-4 z-30">
        <motion.div
          className="relative glass-bright rounded-2xl overflow-hidden"
          animate={{
            boxShadow: isActive
              ? '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(76,201,240,0.25)'
              : '0 4px 24px rgba(0,0,0,0.45)',
          }}
          transition={{ duration: 0.25 }}
        >
          {/* Input row */}
          <div className="flex items-center gap-3 px-4 h-14">
            <motion.div animate={{ color: isActive ? '#4cc9f0' : '#64748b' }} transition={{ duration: 0.2 }}>
              {loading ? <Loader size={20} className="animate-spin" /> : <Search size={20} strokeWidth={2} />}
            </motion.div>

            <input
              ref={inputRef}
              type="text"
              enterKeyHint="search"
              placeholder="Cerca luoghi, indirizzi…"
              value={query}
              onChange={handleQueryChange}
              onFocus={() => onActiveChange(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  clearTimeout(debounceRef.current);
                  search(query);
                  inputRef.current?.blur();
                }
              }}
              className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none font-medium"
            />

            <AnimatePresence>
              {isActive && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  transition={{ duration: 0.15 }}
                  onClick={handleClose}
                  className="flex-shrink-0 w-7 h-7 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors focus:outline-none"
                >
                  <X size={14} className="text-slate-300" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Dropdown */}
          <AnimatePresence>
            {isActive && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                className="overflow-hidden"
              >
                <div className="mx-4 h-px bg-white/6 mb-1" />
                <div className="px-1 pb-2 max-h-[55dvh] overflow-y-auto">
                  {results.length > 0 ? (
                    <>
                      <p className="px-4 pt-2 pb-1 text-xs font-semibold text-slate-600 uppercase tracking-widest">
                        {results[0]?._d != null ? '📍 Vicino a te' : 'Risultati'}
                      </p>
                      {results.map((r, i) => {
                        const item = parseResult(r);
                        const coords = [parseFloat(r.lon), parseFloat(r.lat)];
                        const dist = userLocation && !isNaN(coords[0])
                          ? formatDistance(haversineMeters(userLocation, coords))
                          : null;
                        return (
                          <ResultRow
                            key={i}
                            emoji={item.emoji}
                            primary={item.nameShort}
                            secondary={item.address}
                            dist={dist}
                            onClick={() => handleSelect(item)}
                          />
                        );
                      })}
                    </>
                  ) : query.trim() && !loading && offlineMatches.length > 0 ? (
                    <>
                      <p className="px-4 pt-2 pb-1 text-xs font-semibold text-amber-600/70 uppercase tracking-widest">
                        📡 Offline — risultati salvati
                      </p>
                      {offlineMatches.map((item, i) => {
                        const dist = userLocation && item.coords
                          ? formatDistance(haversineMeters(userLocation, item.coords))
                          : null;
                        return (
                          <ResultRow
                            key={i}
                            emoji={item.emoji ?? '📍'}
                            primary={item.name}
                            secondary={item.address}
                            dist={dist}
                            onClick={() => { onResultSelect(item); handleClose(); }}
                          />
                        );
                      })}
                    </>
                  ) : query.trim() && !loading ? (
                    <p className="px-4 py-6 text-sm text-center" style={{ color: !isOnline ? '#fbbf24' : '#475569' }}>
                      {!isOnline ? '📡 Offline — nessun risultato salvato' : `Nessun risultato per "${query}"`}
                    </p>
                  ) : !query.trim() ? (
                    <>
                      {/* Category shortcuts */}
                      <div className="flex gap-2 px-3 pt-2 pb-1 overflow-x-auto no-scrollbar">
                        {CATEGORIES.map((cat) => (
                          <motion.button
                            key={cat.q}
                            onClick={() => handleCategoryTap(cat)}
                            whileTap={{ scale: 0.91 }}
                            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold focus:outline-none"
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: '#94a3b8' }}
                          >
                            <span>{cat.icon}</span>
                            <span>{cat.label}</span>
                          </motion.button>
                        ))}
                      </div>

                      {/* Saved places */}
                      {favorites.length > 0 && (
                        <>
                          <p className="px-4 pt-2 pb-1 text-xs font-semibold text-slate-600 uppercase tracking-widest">
                            Salvati
                          </p>
                          {favorites.map((item, i) => {
                            const dist = userLocation && item.coords
                              ? formatDistance(haversineMeters(userLocation, item.coords))
                              : null;
                            return (
                              <ResultRow
                                key={i}
                                emoji="⭐"
                                primary={item.name}
                                secondary={item.address}
                                dist={dist}
                                onClick={() => { onResultSelect(item); handleClose(); }}
                              />
                            );
                          })}
                        </>
                      )}

                      {/* Recent searches */}
                      {recent.length > 0 && (
                        <>
                          <div className="flex items-center justify-between px-4 pt-2 pb-1">
                            <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest">Recenti</p>
                            <button
                              onClick={() => {
                                setRecent([]);
                                try { localStorage.removeItem('maps-recent'); } catch {}
                              }}
                              className="text-[11px] text-slate-600 hover:text-slate-400 transition-colors focus:outline-none"
                            >
                              Cancella
                            </button>
                          </div>
                          {recent.map((item, i) => {
                            const dist = userLocation && item.coords
                              ? formatDistance(haversineMeters(userLocation, item.coords))
                              : null;
                            return (
                              <ResultRow
                                key={i}
                                emoji="🕐"
                                primary={item.name}
                                secondary={item.address}
                                dist={dist}
                                onClick={() => { onResultSelect(item); handleClose(); }}
                              />
                            );
                          })}
                        </>
                      )}

                      {favorites.length === 0 && recent.length === 0 && (
                        <p className="px-4 py-6 text-sm text-slate-600 text-center">
                          Digita per cercare una destinazione
                        </p>
                      )}
                    </>
                  ) : null}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </>
  );
}
