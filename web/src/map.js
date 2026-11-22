import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const COLORS = { match: '#0f8b83', likely: '#d49a43', probable: '#4d87b7', unknown: '#91a0b2', no: '#dbe4e8' };
export const OVERVIEW = { center: [77.065, 28.425], zoom: 12.4, pitch: 50, bearing: 0 };

const stateColor = (fallback) => ['case',
  ['boolean', ['feature-state', 'sel'], false], '#ffffff',
  ['match', ['feature-state', 'st'], 'match', COLORS.match, 'likely', COLORS.likely, 'probable', COLORS.probable, 'unknown', COLORS.unknown, 'no', COLORS.no, fallback]];

export function createMap(container, { mobile }) {
  const map = new maplibregl.Map({
    container,
    attributionControl: { compact: false },
    center: mobile ? OVERVIEW.center : [77.065, 28.425],
    zoom: mobile ? 11.6 : 12.4,
    pitch: mobile ? 38 : 0,
    bearing: 0,
    maxPitch: 62,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    style: {
      version: 8,
      glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      sources: {
        omt: {
          type: 'vector',
          url: 'https://tiles.openfreemap.org/planet',
          attribution: '© OpenStreetMap contributors · Tiles © OpenFreeMap',
        },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#f2f5fa' } },
        { id: 'water-bg', type: 'fill', source: 'omt', 'source-layer': 'water',
          paint: { 'fill-color': '#dcecf8', 'fill-opacity': 1 } },
        { id: 'city', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 13.5,
          paint: {
            'fill-extrusion-color': '#c6d1df',
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 7],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.62,
            'fill-extrusion-vertical-gradient': true,
          } },
      ],
    },
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 90 }), 'bottom-right');
  return map;
}

export function addSocietyLayers(map, shapes, points) {
  map.addSource('pts', {
    type: 'geojson',
    data: points,
    promoteId: 'sid',
    cluster: true,
    clusterMaxZoom: 12.8,
    clusterRadius: 52,
  });
  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'pts',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#0f766e',
      'circle-radius': ['step', ['get', 'point_count'], 15, 100, 20, 500, 26, 2000, 32],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
      'circle-opacity': 0.94,
    },
  });
  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'pts',
    filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 12 },
    paint: { 'text-color': '#ffffff' },
  });
  map.addLayer({ id: 'glow', type: 'circle', source: 'pts', minzoom: 12.8, maxzoom: 15.5,
    filter: ['!', ['has', 'point_count']],
    paint: { 'circle-color': stateColor(COLORS.match), 'circle-blur': 0.28,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12.8, 3, 15, 8],
      'circle-opacity': ['match', ['feature-state', 'st'], 'match', 0.22, 'likely', 0.16, 'probable', 0.14, 'unknown', 0.06, 'no', 0, 0.1] } });
  map.addLayer({ id: 'society-dot', type: 'circle', source: 'pts', minzoom: 12.8,
    filter: ['!', ['has', 'point_count']],
    paint: { 'circle-color': stateColor(COLORS.match),
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12.8, 2.6, 15, 4.6, 17, 5.5],
      'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1,
      'circle-opacity': ['match', ['feature-state', 'st'], 'match', 1, 'likely', 0.92, 'probable', 0.88, 'unknown', 0.48, 'no', 0, 0.7] } });
  map.addLayer({ id: 'labels', type: 'symbol', source: 'pts', minzoom: 14,
    filter: ['all', ['==', ['get', 'show'], 1], ['!', ['has', 'point_count']]],
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, -2.2],
      'text-letter-spacing': 0.03, 'text-optional': true },
    paint: { 'text-color': '#263a4a', 'text-halo-color': 'rgba(255,255,255,.96)', 'text-halo-width': 1.6,
      'text-opacity': ['match', ['feature-state', 'st'], 'match', 1, 'likely', 0.85, 'probable', 0.85, 'unknown', 0.35, 'no', 0, 0.7] } });
  if (shapes) addSocietyShapes(map, shapes);
}

export function addSocietyShapes(map, shapes) {
  if (map.getSource('shapes')) return;
  map.addSource('shapes', { type: 'geojson', data: shapes, promoteId: 'sid' });
  map.addLayer({ id: 'site-fill', type: 'fill', source: 'shapes', filter: ['==', ['get', 'role'], 'site'],
    paint: { 'fill-color': stateColor(COLORS.match),
      'fill-opacity': ['match', ['feature-state', 'st'], 'match', 0.11, 'likely', 0.08, 'probable', 0.08, 'unknown', 0.04, 'no', 0, 0.06] } });
  map.addLayer({ id: 'site-line', type: 'line', source: 'shapes', filter: ['==', ['get', 'role'], 'site'],
    paint: { 'line-color': stateColor(COLORS.match), 'line-blur': 0.7,
      'line-width': ['interpolate', ['linear'], ['zoom'], 13.5, 0.55, 16, 1.6],
      'line-opacity': ['match', ['feature-state', 'st'], 'match', 0.85, 'likely', 0.65, 'probable', 0.65, 'unknown', 0.4, 'no', 0.03, 0.45] } });
  map.addLayer({ id: 'bld', type: 'fill-extrusion', source: 'shapes', minzoom: 14.5, filter: ['==', ['get', 'role'], 'bld'],
    paint: { 'fill-extrusion-color': stateColor(COLORS.match), 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.9,
      'fill-extrusion-vertical-gradient': true } });
}

// Keep match markers static. A perpetual animation was repainting the map every 260 ms.
export function startPulse(map) {
  if (!map.getLayer('glow')) return;
  map.setPaintProperty('glow', 'circle-radius', ['interpolate', ['linear'], ['zoom'], 12.8, 3, 15, 8]);
}

export function setStates(map, entries) {
  for (const [sid, st] of entries) {
    if (map.getSource('shapes')) map.setFeatureState({ source: 'shapes', id: sid }, { st });
    if (map.getSource('pts')) map.setFeatureState({ source: 'pts', id: sid }, { st });
  }
}

export function setSelected(map, sid, prev) {
  for (const source of ['shapes', 'pts']) {
    if (!map.getSource(source)) continue;
    if (prev) map.setFeatureState({ source, id: prev }, { sel: false });
    if (sid) map.setFeatureState({ source, id: sid }, { sel: true });
  }
}

// ---------- Streets view: a dark street map with road and area names, from OpenFreeMap vector tiles ----------
const ROAD_W = (major, minor) => ['interpolate', ['exponential', 1.5], ['zoom'], 10, ['match', ['get', 'class'], ['motorway', 'trunk'], major * 0.4, ['primary', 'secondary'], minor * 0.5, 0.3],
  17, ['match', ['get', 'class'], ['motorway', 'trunk'], major * 5, ['primary', 'secondary'], minor * 5, ['tertiary', 'minor'], 8, 4]];
const STREET_LAYERS = [
  { id: 'st-bg', type: 'background', paint: { 'background-color': '#202124' } },
  { id: 'st-green', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['grass', 'wood', 'farmland']]], paint: { 'fill-color': '#1f2a22', 'fill-opacity': 0.8 } },
  { id: 'st-park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': '#22311f', 'fill-opacity': 0.9 } },
  { id: 'st-water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': '#15233a' } },
  { id: 'st-casing', type: 'line', source: 'omt', 'source-layer': 'transportation',
    filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']]],
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0f0f11', 'line-width': ROAD_W(5.5, 4.5), 'line-gap-width': 0 } },
  { id: 'st-road', type: 'line', source: 'omt', 'source-layer': 'transportation',
    filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service']]],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['match', ['get', 'class'], ['motorway', 'trunk'], '#a08a66', ['primary', 'secondary'], '#646a75', ['tertiary'], '#4d5159', '#3d4047'], 'line-width': ROAD_W(4.5, 3.5) } },
  { id: 'st-rail', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'rail'],
    paint: { 'line-color': '#5b5b66', 'line-width': 1.2, 'line-dasharray': [3, 2] } },
];
// Names: shown in both views so people can tell which road is which.
const LABEL_LAYERS = [
  { id: 'lbl-road', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 12.5,
    filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]],
    layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 12.5, 10, 17, 13], 'text-letter-spacing': 0.04, 'text-max-angle': 30 },
    paint: { 'text-color': '#e4dfd5', 'text-halo-color': 'rgba(0,0,0,.9)', 'text-halo-width': 1.5 } },
  { id: 'lbl-place', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 10,
    filter: ['in', ['get', 'class'], ['literal', ['suburb', 'neighbourhood', 'quarter', 'village', 'town', 'city']]],
    layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Bold'],
      'text-size': ['match', ['get', 'class'], ['city', 'town'], 15, 11.5], 'text-transform': 'uppercase', 'text-letter-spacing': 0.12 },
    paint: { 'text-color': '#9d988e', 'text-halo-color': 'rgba(0,0,0,.85)', 'text-halo-width': 1.2 } },
  { id: 'lbl-metro', type: 'symbol', source: 'omt', 'source-layer': 'poi', minzoom: 12.5,
    filter: ['in', ['get', 'class'], ['literal', ['railway']]],
    layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 0.8] },
    paint: { 'text-color': '#8fb4ff', 'text-halo-color': 'rgba(0,0,0,.85)', 'text-halo-width': 1.2 } },
];

export function addBaseLayers(map) {
  for (const l of STREET_LAYERS) {
    const before = l.id === 'st-bg' ? 'water-bg' : 'city';
    map.addLayer({ ...l, layout: { ...(l.layout || {}), visibility: 'none' } }, before);
  }
  for (const l of LABEL_LAYERS) map.addLayer(l); // above everything, including societies
}

// Building colours per base map. Light needs darker "match" colours and pale "no" colours.
const PALETTES = {
  night: { match: '#55d6c6', likely: '#efb56b', probable: '#8bb9e3', unknown: '#718198', no: '#28384e', sel: '#ffffff', city: '#2d4058', label: '#f3f7fc', halo: 'rgba(17,26,41,.95)' },
  streets: { match: '#0f8b83', likely: '#d49a43', probable: '#4d87b7', unknown: '#91a0b2', no: '#dbe4e8', sel: '#ffffff', city: '#c6d1df', label: '#27364b', halo: 'rgba(255,255,255,.96)' },
  light: { match: '#0f8b83', likely: '#d49a43', probable: '#4d87b7', unknown: '#91a0b2', no: '#dbe4e8', sel: '#ffffff', city: '#c6d1df', label: '#27364b', halo: 'rgba(255,255,255,.96)' },
};
const LIGHT = {
  'st-bg': { 'background-color': '#f2f5fa' }, 'st-green': { 'fill-color': '#e3f0e6' }, 'st-park': { 'fill-color': '#d9ecd9' },
  'st-water': { 'fill-color': '#dcecf8' }, 'st-casing': { 'line-color': '#c9d4e2' },
  'st-road': { 'line-color': ['match', ['get', 'class'], ['motorway', 'trunk'], '#edbd72', ['primary', 'secondary'], '#ffffff', ['tertiary'], '#f9fbfd', '#f3f6fa'] },
  'st-rail': { 'line-color': '#b8c3d2' },
  'lbl-road': { 'text-color': '#68778d', 'text-halo-color': '#ffffff' }, 'lbl-place': { 'text-color': '#34445d', 'text-halo-color': '#ffffff' },
  'lbl-metro': { 'text-color': '#0f8b83', 'text-halo-color': '#ffffff' },
};
const DARK = {
  'st-bg': { 'background-color': '#111a29' }, 'st-green': { 'fill-color': '#1d342f' }, 'st-park': { 'fill-color': '#24453a' },
  'st-water': { 'fill-color': '#1a3552' }, 'st-casing': { 'line-color': '#0c1421' },
  'st-road': { 'line-color': ['match', ['get', 'class'], ['motorway', 'trunk'], '#9b805b', ['primary', 'secondary'], '#53647a', ['tertiary'], '#394b62', '#2e4055'] },
  'st-rail': { 'line-color': '#55677f' },
  'lbl-road': { 'text-color': '#d3dfed', 'text-halo-color': 'rgba(17,26,41,.96)' }, 'lbl-place': { 'text-color': '#b4c3d5', 'text-halo-color': 'rgba(17,26,41,.95)' },
  'lbl-metro': { 'text-color': '#7dd3c7', 'text-halo-color': 'rgba(17,26,41,.95)' },
};

const colorBy = (c) => ['case', ['boolean', ['feature-state', 'sel'], false], c.sel,
  ['match', ['feature-state', 'st'], 'match', c.match, 'likely', c.likely, 'probable', c.probable, 'unknown', c.unknown, 'no', c.no, c.match]];

export const BASE_MODES = ['night', 'streets', 'light'];

export function setBaseMode(map, mode) {
  const palette = mode === 'night' ? DARK : LIGHT;
  for (const l of STREET_LAYERS) map.setLayoutProperty(l.id, 'visibility', 'visible');
  for (const [id, props] of Object.entries(palette)) {
    for (const [key, value] of Object.entries(props)) map.setPaintProperty(id, key, value);
  }
  const c = PALETTES[mode];
  map.setPaintProperty('bg', 'background-color', mode === 'night' ? '#111a29' : '#f2f5fa');
  map.setPaintProperty('water-bg', 'fill-color', mode === 'night' ? '#1a3552' : '#dcecf8');
  map.setPaintProperty('city', 'fill-extrusion-color', c.city);
  for (const [id, prop] of [['bld', 'fill-extrusion-color'], ['site-fill', 'fill-color'], ['site-line', 'line-color'], ['glow', 'circle-color'], ['society-dot', 'circle-color']]) {
    if (map.getLayer(id)) map.setPaintProperty(id, prop, colorBy(c));
  }
  map.setPaintProperty('labels', 'text-color', c.label);
  map.setPaintProperty('labels', 'text-halo-color', c.halo);
  if (map.getLayer('glow')) map.setPaintProperty('glow', 'circle-opacity', ['match', ['feature-state', 'st'],
    'match', mode === 'night' ? 0.28 : 0.2, 'likely', 0.14, 'probable', 0.13, 'unknown', 0.05, 'no', 0, 0.1]);
  if (map.getLayer('site-fill')) map.setPaintProperty('site-fill', 'fill-opacity', ['match', ['feature-state', 'st'],
    'match', mode === 'night' ? 0.2 : 0.16, 'likely', 0.12, 'probable', 0.11, 'unknown', 0.05, 'no', 0, 0.07]);
  map.setSky(mode === 'night'
    ? { 'sky-color': '#111a29', 'horizon-color': '#26354a', 'fog-color': '#111a29', 'sky-horizon-blend': 0.6,
        'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.2, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 0] }
    : { 'sky-color': '#dce8f4', 'horizon-color': '#f3f6fa', 'fog-color': '#f2f5fa', 'sky-horizon-blend': 0.6,
        'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.2, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 0] });
}

// Let people switch off the glow, the society boundaries or the name labels when they get too busy.
export function setHighlights(map, { glow = true, bounds = true, labels = true } = {}) {
  if (!map.getLayer('glow')) return;
  map.setLayoutProperty('glow', 'visibility', glow ? 'visible' : 'none');
  if (map.getLayer('site-fill')) map.setLayoutProperty('site-fill', 'visibility', bounds ? 'visible' : 'none');
  if (map.getLayer('site-line')) map.setLayoutProperty('site-line', 'visibility', bounds ? 'visible' : 'none');
  map.setLayoutProperty('labels', 'visibility', labels ? 'visible' : 'none');
}
