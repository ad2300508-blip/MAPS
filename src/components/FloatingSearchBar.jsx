import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Clock, MapPin, Navigation, ChevronRight } from 'lucide-react';
import { MOCK_SEARCH_SUGGESTIONS, RECENT_SEARCHES, MOCK_POIS } from '../data/mockData';

const TYPE_ICON = {
  landmark: MapPin,
  museum: MapPin,
  transport: Navigation,
  destination: MapPin,
};

function ResultRow({ icon: Icon, primary, secondary, time, color = '#94a3b8', onClick }) {
  return (
    <motion.button
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 rounded-xl transition-colors text-left focus:outline-none group"
      onClick={onClick}
      whileTap={{ scale: 0.99 }}
    >
      <div
        className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <Icon size={16} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate leading-tight">{primary}</p>
        <p className="text-xs text-slate-500 truncate mt-0.5">{secondary}</p>
      </div>
      {time && (
        <span className="flex-shrink-0 text-xs text-slate-600">{time}</span>
      )}
      <ChevronRight
        size={14}
        className="flex-shrink-0 text-slate-700 group-hover:text-slate-500 transition-colors"
      />
    </motion.button>
  );
}

export default function FloatingSearchBar({ isActive, onActiveChange, onResultSelect }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  const filtered = query.trim()
    ? MOCK_SEARCH_SUGGESTIONS.filter((s) =>
        s.text.toLowerCase().includes(query.toLowerCase())
      )
    : null;

  useEffect(() => {
    if (isActive) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [isActive]);

  const handleOpen = () => onActiveChange(true);
  const handleClose = () => {
    onActiveChange(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const handleSelect = (poi) => {
    if (poi) {
      onResultSelect(poi);
    }
    handleClose();
  };

  return (
    <>
      {/* Backdrop when search is active */}
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

      {/* Search bar container */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 w-full max-w-xl px-4 z-20">
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
            <motion.div
              animate={{ color: isActive ? '#4cc9f0' : '#64748b' }}
              transition={{ duration: 0.2 }}
            >
              <Search size={20} strokeWidth={2} />
            </motion.div>

            <input
              ref={inputRef}
              type="text"
              placeholder="Cerca luoghi, indirizzi, città…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={handleOpen}
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
                {/* Divider */}
                <div className="mx-4 h-px bg-white/6 mb-1" />

                <div className="px-1 pb-2 max-h-72 overflow-y-auto">
                  {filtered ? (
                    <>
                      {filtered.length > 0 ? (
                        <>
                          <p className="px-4 pt-2 pb-1 text-xs font-semibold text-slate-600 uppercase tracking-widest">
                            Risultati
                          </p>
                          {filtered.map((item) => {
                            const Icon = TYPE_ICON[item.type] ?? MapPin;
                            const matchedPoi = MOCK_POIS.find(
                              (p) => p.name === item.text
                            );
                            return (
                              <ResultRow
                                key={item.id}
                                icon={Icon}
                                primary={item.text}
                                secondary={item.secondary}
                                color="#4cc9f0"
                                onClick={() => handleSelect(matchedPoi ?? null)}
                              />
                            );
                          })}
                        </>
                      ) : (
                        <p className="px-4 py-6 text-sm text-slate-600 text-center">
                          Nessun risultato per "{query}"
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Recent searches */}
                      <p className="px-4 pt-2 pb-1 text-xs font-semibold text-slate-600 uppercase tracking-widest">
                        Recenti
                      </p>
                      {RECENT_SEARCHES.map((item) => (
                        <ResultRow
                          key={item.id}
                          icon={Clock}
                          primary={item.text}
                          secondary={item.secondary}
                          time={item.time}
                          color="#64748b"
                          onClick={() => handleSelect(null)}
                        />
                      ))}

                      {/* Quick POIs */}
                      <p className="px-4 pt-3 pb-1 text-xs font-semibold text-slate-600 uppercase tracking-widest">
                        Luoghi Vicini
                      </p>
                      {MOCK_POIS.slice(0, 3).map((poi) => (
                        <ResultRow
                          key={poi.id}
                          icon={MapPin}
                          primary={poi.name}
                          secondary={`${poi.distance} · ${poi.duration}`}
                          color={poi.color}
                          onClick={() => handleSelect(poi)}
                        />
                      ))}
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </>
  );
}
