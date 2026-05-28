// Transport mode config — routes now come from OSRM, not mock data
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
    co2PerKm: 120,  // g/km
    costPerKm: 0.20, // €/km (fuel)
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
    osrmProfile: 'driving',
    color: '#a855f7',
    gradientStart: '#7c3aed',
    gradientEnd: '#a855f7',
    lineWidth: 6,
    co2PerKm: 14,
    costPerKm: 0,   // shown as flat fare
    flatFare: 1.90,
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
  if (!seconds) return '—';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}min` : `${h}h`;
}

export function formatDistance(meters) {
  if (!meters) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatCO2(meters, mode) {
  const kg = (meters / 1000) * mode.co2PerKm / 1000;
  if (kg === 0) return '0 kg';
  return `${kg.toFixed(2)} kg`;
}

export function formatCost(meters, mode) {
  if (mode.flatFare != null) return `€${mode.flatFare.toFixed(2)}`;
  const cost = (meters / 1000) * mode.costPerKm;
  if (cost === 0) return 'Gratis';
  return `~€${cost.toFixed(2)}`;
}

// Haversine distance between two [lng, lat] points, returns meters
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
export function maneuverToItalian(type, modifier, name) {
  const street = name ? ` su ${name}` : '';
  if (type === 'depart') return `Parti${street}`;
  if (type === 'arrive') return 'Sei arrivato/a a destinazione';
  if (type === 'continue') return `Continua${street}`;
  if (type === 'merge')    return `Immettiti${street}`;
  if (type === 'on ramp')  return `Prendi la rampa${street}`;
  if (type === 'off ramp') return `Esci${street}`;
  if (type === 'fork') {
    if (modifier?.includes('left'))  return `Tieni la sinistra allo svincolo`;
    if (modifier?.includes('right')) return `Tieni la destra allo svincolo`;
    return `Prendi la biforcazione`;
  }
  if (type === 'roundabout' || type === 'rotary') return `Entra nella rotonda`;
  if (type === 'turn') {
    if (modifier === 'left')        return `Svolta a sinistra${street}`;
    if (modifier === 'right')       return `Svolta a destra${street}`;
    if (modifier === 'sharp left')  return `Svolta nettamente a sinistra`;
    if (modifier === 'sharp right') return `Svolta nettamente a destra`;
    if (modifier === 'slight left') return `Tieni la sinistra${street}`;
    if (modifier === 'slight right')return `Tieni la destra${street}`;
    if (modifier === 'straight')    return `Continua dritto${street}`;
  }
  if (type === 'new name') return `Continua${street}`;
  return `Continua${street || ' dritto'}`;
}

// Maneuver type → arrow character
export function maneuverIcon(type, modifier) {
  if (type === 'arrive')   return '🏁';
  if (type === 'depart')   return '▶';
  if (type === 'roundabout' || type === 'rotary') return '⟳';
  if (type === 'turn') {
    if (modifier === 'left')         return '↰';
    if (modifier === 'right')        return '↱';
    if (modifier === 'sharp left')   return '↺';
    if (modifier === 'sharp right')  return '↻';
    if (modifier === 'slight left')  return '↖';
    if (modifier === 'slight right') return '↗';
  }
  if (type === 'fork') {
    if (modifier?.includes('left'))  return '↙';
    if (modifier?.includes('right')) return '↘';
  }
  if (type === 'merge') return '↗';
  return '↑';
}

// Pick emoji for Nominatim OSM class/type
export function placeEmoji(osmClass, osmType) {
  if (osmClass === 'tourism')     return '🏛️';
  if (osmClass === 'amenity') {
    if (osmType === 'restaurant')  return '🍽️';
    if (osmType === 'cafe')        return '☕';
    if (osmType === 'hospital')    return '🏥';
    if (osmType === 'pharmacy')    return '💊';
    if (osmType === 'fuel')        return '⛽';
    if (osmType === 'parking')     return '🅿️';
    if (osmType === 'bank')        return '🏦';
    if (osmType === 'school' || osmType === 'university') return '🎓';
    return '📍';
  }
  if (osmClass === 'shop')        return '🛍️';
  if (osmClass === 'railway')     return '🚂';
  if (osmClass === 'aeroway')     return '✈️';
  if (osmClass === 'natural')     return '🌿';
  if (osmClass === 'leisure')     return '🏖️';
  return '📍';
}
