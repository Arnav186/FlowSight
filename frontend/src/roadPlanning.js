// City centres are navigation shortcuts, not locations of measured traffic.
export const CITIES = [
  { name: 'Nagpur', lat: 21.1458, lon: 79.0882 },
  { name: 'Mumbai', lat: 19.0760, lon: 72.8777 },
  { name: 'Pune', lat: 18.5204, lon: 73.8567 },
  { name: 'New Delhi', lat: 28.6139, lon: 77.2090 },
  { name: 'Bengaluru', lat: 12.9716, lon: 77.5946 },
  { name: 'Hyderabad', lat: 17.3850, lon: 78.4867 },
  { name: 'Chennai', lat: 13.0827, lon: 80.2707 },
  { name: 'Kolkata', lat: 22.5726, lon: 88.3639 },
  { name: 'Ahmedabad', lat: 23.0225, lon: 72.5714 },
  { name: 'Jaipur', lat: 26.9124, lon: 75.7873 },
  { name: 'Lucknow', lat: 26.8467, lon: 80.9462 },
  { name: 'Guwahati', lat: 26.1445, lon: 91.7362 },
  { name: 'Kochi', lat: 9.9312, lon: 76.2673 },
  { name: 'Srinagar', lat: 34.0837, lon: 74.7973 },
  { name: 'Port Blair', lat: 11.6234, lon: 92.7265 },
];

export const INITIAL_LOCATION = { ...CITIES[0], label: 'Nagpur city centre', revision: 0 };
export const ALL_OPEN = 'Same situation · all lanes open';
export const inMapArea = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= 6 && lat <= 37.5 && lon >= 68 && lon <= 98;

export function laneCounts(total, open) {
  if (!Number.isInteger(total) || !Number.isInteger(open) || total < 1 || total > 6 || open < 0 || open > total) {
    throw new Error('Choose 1–6 total lanes and no more blocked lanes than total lanes.');
  }
  return { total, open, blocked: total - open, closed: open === 0 };
}

export function scenarioExport(location, road, inputs, totalLanes, analysis, sampleSize) {
  return {
    version: 1, created_at: new Date().toISOString(),
    purpose: 'User-entered road scenario, not live traffic or navigation advice',
    location: { label: road?.name || location.label, lat: location.lat, lon: location.lon, osm_way_id: road?.id ?? null },
    map_source: 'OpenStreetMap contributors; lane tags require local verification',
    inputs, total_lanes: totalLanes, neighbour_count: sampleSize,
    analysis_source: '2,400 simulated observations; no location-specific traffic training data',
    lane_plan: analysis?.lane_plan ?? null,
  };
}
