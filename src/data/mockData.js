// ─────────────────────────────────────────────────────────────────────────────
// MAPBOX ACCESS TOKEN
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  Replace the value below with your own free Mapbox token.
// Get one at: https://account.mapbox.com/access-tokens/
// After creating an account, copy the "Default public token" and paste it here.
// ─────────────────────────────────────────────────────────────────────────────
export const MAPBOX_TOKEN = 'YOUR_MAPBOX_ACCESS_TOKEN_HERE';

// ─── Initial map viewport ────────────────────────────────────────────────────
// Paris, France — centred between Notre-Dame and the Eiffel Tower.
export const INITIAL_VIEW_STATE = {
  longitude: 2.3270,
  latitude: 48.8600,
  zoom: 13.2,
  pitch: 52,
  bearing: -10,
};

// ─── Mock user location ───────────────────────────────────────────────────────
// Near Notre-Dame on the Île de la Cité.
export const MOCK_USER_LOCATION = [2.3499, 48.8530];

// ─── Mock route (LineString) ──────────────────────────────────────────────────
// From Notre-Dame area → Tour Eiffel, following rough street geometry.
// Replace with a real Directions API response in production:
// https://docs.mapbox.com/api/navigation/directions/
export const MOCK_ROUTE = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'LineString',
    coordinates: [
      [2.3499, 48.8530], // Start – Notre-Dame
      [2.3420, 48.8545],
      [2.3350, 48.8555],
      [2.3240, 48.8563],
      [2.3130, 48.8571],
      [2.3040, 48.8578],
      [2.2970, 48.8581],
      [2.2945, 48.8584], // End – Tour Eiffel
    ],
  },
};

// ─── Mock points of interest ──────────────────────────────────────────────────
export const MOCK_POIS = [
  {
    id: 1,
    name: 'Tour Eiffel',
    category: 'Monumento',
    emoji: '🗼',
    address: 'Champ de Mars, 5 Av. Anatole France, 75007 Parigi',
    coords: [2.2945, 48.8584],
    rating: 4.8,
    reviews: 241800,
    duration: '35 min',
    distance: '3.1 km',
    isOpen: true,
    openHours: 'Aperto fino alle 00:45',
    description:
      'La Torre Eiffel, costruita da Gustave Eiffel per l\'Esposizione Universale del 1889, è il simbolo più riconoscibile di Parigi. Con i suoi 330 metri domina la skyline della città.',
    tags: ['Panorama', 'Romantico', 'Iconico'],
    color: '#4cc9f0',
  },
  {
    id: 2,
    name: 'Musée du Louvre',
    category: 'Museo',
    emoji: '🏛️',
    address: 'Rue de Rivoli, 75001 Parigi',
    coords: [2.3376, 48.8606],
    rating: 4.7,
    reviews: 198400,
    duration: '12 min',
    distance: '1.1 km',
    isOpen: true,
    openHours: 'Aperto fino alle 21:45',
    description:
      'Il museo più visitato al mondo ospita oltre 35.000 opere tra cui la Gioconda di Leonardo da Vinci, la Venere di Milo e la Vittoria Alata di Samotracia.',
    tags: ['Arte', 'Storia', 'Cultura'],
    color: '#f59e0b',
  },
  {
    id: 3,
    name: 'Sacré-Cœur',
    category: 'Chiesa',
    emoji: '⛪',
    address: '35 Rue du Chevalier de la Barre, 75018 Parigi',
    coords: [2.3431, 48.8867],
    rating: 4.9,
    reviews: 87300,
    duration: '28 min',
    distance: '4.2 km',
    isOpen: true,
    openHours: 'Aperto fino alle 22:30',
    description:
      'Basilica in stile romano-bizantino sulla sommità di Montmartre. La cupola bianca è visibile da quasi tutta Parigi e offre una vista panoramica straordinaria.',
    tags: ['Vista', 'Spirituale', 'Architettura'],
    color: '#a78bfa',
  },
  {
    id: 4,
    name: 'Notre-Dame',
    category: 'Cattedrale',
    emoji: '🏰',
    address: 'Parvis Notre-Dame, Île de la Cité, 75004 Parigi',
    coords: [2.3499, 48.8530],
    rating: 4.8,
    reviews: 213500,
    duration: '2 min',
    distance: '0.2 km',
    isOpen: false,
    openHours: 'In restauro — riapertura 2024',
    description:
      'Capolavoro dell\'architettura gotica medievale, Notre-Dame è in fase di restauro dopo il devastante incendio dell\'aprile 2019. La cattedrale è stata riaperta nel dicembre 2024.',
    tags: ['Gotico', 'Storico', 'UNESCO'],
    color: '#fb923c',
  },
  {
    id: 5,
    name: 'Arc de Triomphe',
    category: 'Monumento',
    emoji: '🏛',
    address: 'Place Charles de Gaulle, 75008 Parigi',
    coords: [2.2950, 48.8738],
    rating: 4.6,
    reviews: 156700,
    duration: '32 min',
    distance: '4.8 km',
    isOpen: true,
    openHours: 'Aperto fino alle 23:00',
    description:
      'Commissionato da Napoleone Bonaparte nel 1806, l\'Arco di Trionfo celebra le vittorie militari francesi. Dalla terrazza offre una vista iconica sui 12 boulevards che si irradiano verso Place Charles de Gaulle.',
    tags: ['Napoleonico', 'Panorama', 'Storico'],
    color: '#34d399',
  },
];

// ─── Mock search suggestions ──────────────────────────────────────────────────
// Replace with a real Geocoding API call in production:
// https://docs.mapbox.com/api/search/geocoding/
export const MOCK_SEARCH_SUGGESTIONS = [
  { id: 1, text: 'Tour Eiffel', secondary: 'Champ de Mars, Parigi', type: 'landmark', poi: MOCK_POIS[0] },
  { id: 2, text: 'Musée du Louvre', secondary: 'Rue de Rivoli, Parigi', type: 'museum', poi: MOCK_POIS[1] },
  { id: 3, text: 'Aéroport CDG', secondary: 'Roissy-en-France, 25 km', type: 'transport', poi: null },
  { id: 4, text: 'Gare du Nord', secondary: 'Paris 10ème', type: 'transport', poi: null },
  { id: 5, text: 'Versailles', secondary: 'Château de Versailles, 20 km', type: 'destination', poi: null },
];

export const RECENT_SEARCHES = [
  {
    id: 1,
    text: 'Restaurant Jules Verne',
    secondary: 'Tour Eiffel, Parigi',
    time: '2h fa',
  },
  {
    id: 2,
    text: 'Musée d\'Orsay',
    secondary: '1 Rue de la Légion d\'Honneur',
    time: 'Ieri',
  },
  {
    id: 3,
    text: 'Shakespeare & Company',
    secondary: '37 Rue de la Bûcherie, Parigi',
    time: '3 giorni fa',
  },
];
