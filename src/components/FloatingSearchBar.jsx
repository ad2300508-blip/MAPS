import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Loader } from 'lucide-react';
import { placeEmoji, haversineMeters, formatDistance } from '../data/mockData';

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
  const inputRef  = useRef(null);
  const debounceRef = useRef(null);
  const abortRef  = useRef(null);

  useEffect(() => {
    if (isActive) setTimeout(() => inputRef.current?.focus(), 120);
  }, [isActive]);

  const search = useCallback(async (q) => {
    abortRef.current?.abort();
    if (!q.trim()) { setResults([]); setLoading(false); return; }
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

      // Bias results toward user's location if available
      if (userLocation) {
        const [lng, lat] = userLocation;
        params.set('viewbox', `${lng - 1},${lat - 1},${lng + 1},${lat + 1}`);
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
    debounceRef.current = setTimeout(() => search(q), 500);
  };

  const handleClose = () => {
    onActiveChange(false);
    setQuery('');
    setResults([]);
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
    const updated = [dest, ...recent.filter((r) => r.name !== dest.name)].slice(0, 5);
    setRecent(updated);
    try { localStorage.setItem('maps-recent', JSON.stringify(updated)); } catch {}

    onResultSelect(dest);
    handleClose();
  };

  const parseResult = (r) => {
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
              placeholder="Cerca luoghi, indirizzi…"
              value={query}
              onChange={handleQueryChange}
              onFocus={() => onActiveChange(true)}
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
                        Risultati
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
                  ) : query.trim() && !loading ? (
                    <p className="px-4 py-6 text-sm text-center" style={{ color: !isOnline ? '#fbbf24' : '#475569' }}>
                      {!isOnline ? '📡 Offline — ricerca non disponibile' : `Nessun risultato per "${query}"`}
                    </p>
                  ) : !query.trim() ? (
                    <>
                      {recent.length > 0 && (
                        <>
                          <p className="px-4 pt-2 pb-1 text-xs font-semibold text-slate-600 uppercase tracking-widest">
                            Recenti
                          </p>
                          {recent.map((item, i) => (
                            <ResultRow
                              key={i}
                              emoji="🕐"
                              primary={item.name}
                              secondary={item.address}
                              onClick={() => {
                                onResultSelect(item);
                                handleClose();
                              }}
                            />
                          ))}
                        </>
                      )}
                      {recent.length === 0 && (
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
