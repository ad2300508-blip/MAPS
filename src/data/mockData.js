// Transport mode config — routes come from OSRM
export const TRANSPORT_MODES = [
  {
    id: 'car',
    label: 'Auto',
    shortLabel: 'Auto',
    icon: '🚗',
    osrmProfile: 'driving',
    color: '#4cc9f0',
    gradientStart: '#4361ee',
    gradientEnd: '#4cc9f0',
    lineWidth: 7,
    co2PerKm: 120,    // g/km average passenger car
    costPerKm: 0.20,  // €/km fuel+wear
  },
  {
    id: 'walk',
    label: 'A piedi',
    shortLabel: 'Piedi',
    icon: '🚶',
    osrmProfile: 'foot',
    color: '#10b981',
    gradientStart: '#059669',
    gradientEnd: '#10b981',
    lineWidth: 5,
    co2PerKm: 0,
    costPerKm: 0,
  },
  {
    id: 'bike',
    label: 'Bici',
    shortLabel: 'Bici',
    icon: '🚲',
    osrmProfile: 'bike',
    color: '#f59e0b',
    gradientStart: '#d97706',
    gradientEnd: '#fbbf24',
    lineWidth: 5,
    co2PerKm: 0,
    costPerKm: 0,
  },
  {
    id: 'transit',
    label: 'Metrò',
    shortLabel: 'Metrò',
    icon: '🚇',
    osrmProfile: 'driving',  // approximate with driving (no free transit GTFS API)
    color: '#a855f7',
    gradientStart: '#7c3aed',
    gradientEnd: '#a855f7',
    lineWidth: 6,
    co2PerKm: 14,
    costPerKm: 0,
    // No flat fare — varies by city; show "Variabile" in UI
  },
  {
    id: 'moto',
    label: 'Moto',
    shortLabel: 'Moto',
    icon: '🏍️',
    osrmProfile: 'driving',
    color: '#f97316',
    gradientStart: '#ea580c',
    gradientEnd: '#f97316',
    lineWidth: 6,
    co2PerKm: 80,
    costPerKm: 0.08,
  },
];

export const getModeById = (id) =>
  TRANSPORT_MODES.find((m) => m.id === id) ?? TRANSPORT_MODES[0];

// ─── Helpers ────────────────────────────────────────────────────────────────

export function formatDuration(seconds) {
  if (seconds == null || seconds <= 0) return '—';
  const m = Math.round(seconds / 60);
  if (m < 1)  return '< 1 min';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}min` : `${h}h`;
}

export function formatDistance(meters) {
  if (meters == null) return '—';
  if (meters < 10)   return `${Math.round(meters)} m`;
  if (meters < 1000) return `${Math.round(meters / 5) * 5} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// Voice-friendly version: "200 metri" / "1,2 chilometri" (no abbreviations)
export function formatDistanceVoice(meters) {
  if (meters == null) return '';
  if (meters < 1000) return `${Math.round(meters / 5) * 5} metri`;
  const km = meters / 1000;
  return km < 2 ? `${km.toFixed(1).replace('.', ',')} chilometri` : `${Math.round(km)} chilometri`;
}

export function formatCO2(meters, mode) {
  const kg = (meters / 1000) * (mode.co2PerKm ?? 0) / 1000;
  if (kg === 0) return '0 kg';
  return kg < 0.1 ? `${Math.round(kg * 1000)} g` : `${kg.toFixed(2)} kg`;
}

export function formatCost(meters, mode) {
  if (mode.id === 'transit') return 'Variabile';
  const cost = (meters / 1000) * (mode.costPerKm ?? 0);
  if (cost === 0) return 'Gratis';
  return `~€${cost.toFixed(2)}`;
}

// Haversine distance between two [lng, lat] points → meters
export function haversineMeters([lng1, lat1], [lng2, lat2]) {
  const R = 6_371_000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Convert OSRM maneuver to Italian instruction
export function maneuverToItalian(type, modifier, name, exit) {
  const street = name ? ` su ${name}` : '';
  switch (type) {
    case 'depart':       return `Parti${street}`;
    case 'arrive':       return 'Sei arrivato/a a destinazione';
    case 'continue':     return `Continua${street}`;
    case 'new name':     return `Continua${street}`;
    case 'merge':        return `Immettiti${street}`;
    case 'on ramp':      return `Prendi la rampa${street}`;
    case 'off ramp':     return modifier?.includes('left')
                           ? `Esci a sinistra${street}`
                           : modifier?.includes('right')
                           ? `Esci a destra${street}`
                           : `Esci${street}`;
    case 'end of road':  return modifier?.includes('left')
                           ? `Fine strada — svolta a sinistra${street}`
                           : `Fine strada — svolta a destra${street}`;
    case 'use lane':     return `Usa la corsia corretta${street}`;
    case 'fork':
      if (modifier?.includes('left'))  return 'Tieni la sinistra allo svincolo';
      if (modifier?.includes('right')) return 'Tieni la destra allo svincolo';
      return 'Vai dritto allo svincolo';
    case 'roundabout':
    case 'rotary': {
      if (exit != null && exit > 0) {
        const ordinals = ['prima', 'seconda', 'terza', 'quarta', 'quinta', 'sesta'];
        const ord = ordinals[exit - 1] ?? `${exit}°`;
        return `Alla rotonda, prendi la ${ord} uscita`;
      }
      return 'Alla rotonda, continua dritto';
    }
    case 'roundabout turn':
      return `Nella rotonda, ${modifier?.includes('left') ? 'tieni la sinistra' : 'tieni la destra'}`;
    case 'exit roundabout':
    case 'exit rotary':
      return `Esci dalla rotonda${street}`;
    case 'turn':
      if (modifier === 'left')         return `Svolta a sinistra${street}`;
      if (modifier === 'right')        return `Svolta a destra${street}`;
      if (modifier === 'sharp left')   return `Svolta nettamente a sinistra`;
      if (modifier === 'sharp right')  return `Svolta nettamente a destra`;
      if (modifier === 'slight left')  return `Tieni la sinistra${street}`;
      if (modifier === 'slight right') return `Tieni la destra${street}`;
      if (modifier === 'straight')     return `Continua dritto${street}`;
      return `Svolta${street}`;
    case 'notification':
      return `Attenzione${street}`;
    default:
      return `Continua${street || ' dritto'}`;
  }
}

// Maneuver type → direction icon
export function maneuverIcon(type, modifier) {
  if (type === 'arrive')                return '🏁';
  if (type === 'depart')                return '▶';
  if (type === 'roundabout' || type === 'rotary' ||
      type === 'exit roundabout' || type === 'exit rotary') return '↻';
  if (type === 'on ramp')               return '↗';
  if (type === 'off ramp')              return modifier?.includes('left') ? '↙' : '↘';
  if (type === 'end of road')           return modifier?.includes('left') ? '←' : '→';
  if (type === 'fork') {
    if (modifier?.includes('left'))     return '↙';
    if (modifier?.includes('right'))    return '↘';
    return '↑';
  }
  if (type === 'merge')                 return '↑';
  if (type === 'turn' || type === 'end of road') {
    if (modifier === 'left')            return '←';
    if (modifier === 'right')           return '→';
    if (modifier === 'sharp left')      return '↺';
    if (modifier === 'sharp right')     return '↻';
    if (modifier === 'slight left')     return '↖';
    if (modifier === 'slight right')    return '↗';
  }
  return '↑';
}

// Pick emoji for OSM class/type
export function placeEmoji(osmClass, osmType) {
  if (osmClass === 'amenity') {
    const map = {
      restaurant: '🍽️', cafe: '☕', bar: '🍺', pub: '🍺',
      fast_food: '🍔', ice_cream: '🍦', bakery: '🥐',
      hospital: '🏥', pharmacy: '💊', clinic: '🏥',
      fuel: '⛽', parking: '🅿️',
      bank: '🏦', atm: '💳',
      cinema: '🎬', theatre: '🎭',
      school: '🎓', university: '🎓', library: '📚',
      supermarket: '🛒', marketplace: '🛒',
      gym: '💪', swimming_pool: '🏊',
      place_of_worship: '⛪',
    };
    return map[osmType] ?? '📍';
  }
  if (osmClass === 'tourism') {
    const map = {
      museum: '🏛️', attraction: '🏛️', monument: '🗿',
      hotel: '🏨', hostel: '🏨', motel: '🏨',
      viewpoint: '🔭', gallery: '🖼️', zoo: '🦁',
      theme_park: '🎡', information: 'ℹ️',
    };
    return map[osmType] ?? '🏛️';
  }
  if (osmClass === 'shop') {
    const map = {
      supermarket: '🛒', mall: '🏬', convenience: '🏪',
      bakery: '🥐', clothes: '👗', electronics: '📱',
      books: '📚', sports: '⚽', furniture: '🪑',
      hairdresser: '💇', florist: '🌸',
    };
    return map[osmType] ?? '🛍️';
  }
  const clasMap = {
    railway: '🚂', aeroway: '✈️', natural: '🌿',
    leisure: '🏖️', historic: '🏰', sport: '⚽',
  };
  return clasMap[osmClass] ?? '📍';
}
