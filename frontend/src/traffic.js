export const PRESETS = {
  'Morning rush': { hour: 9, traffic_volume: 1800, average_speed_kmph: 28, rainfall_mm: 0, incidents: 0, road_lanes: 3 },
  'Rainy evening': { hour: 18, traffic_volume: 2100, average_speed_kmph: 22, rainfall_mm: 8, incidents: 1, road_lanes: 3 },
  'Clear highway': { hour: 14, traffic_volume: 650, average_speed_kmph: 72, rainfall_mm: 0, incidents: 0, road_lanes: 4 },
};

export const FIELDS = [
  { key: 'traffic_volume', label: 'Vehicles observed', unit: 'vehicles', min: 0, max: 3200, step: 1, hint: 'Vehicle count in the observation period.' },
  { key: 'average_speed_kmph', label: 'Average speed', unit: 'km/h', min: 1, max: 100, step: 0.1, hint: 'How fast the traffic is moving.' },
  { key: 'rainfall_mm', label: 'Rainfall', unit: 'mm', min: 0, max: 30, step: 0.1, hint: '0 means there is no rain.' },
  { key: 'incidents', label: 'Road incidents', unit: 'incidents', min: 0, max: 3, step: 1, hint: 'Accidents, breakdowns or blocked sections.' },
  { key: 'road_lanes', label: 'Open lanes', unit: 'lanes', min: 1, max: 6, step: 1, hint: 'Lanes currently available for traffic.' },
  { key: 'hour', label: 'Time of day', unit: 'hour', min: 0, max: 23, step: 1, hint: '24-hour clock: 9 = 9 AM, 18 = 6 PM.' },
];

export const GROUPS = {
  'Free Flow': { label: 'Light traffic', color: '#15876c', tint: '#edf9f4', short: 'Light' },
  'Moderate Congestion': { label: 'Busy traffic', color: '#ad6810', tint: '#fff7e9', short: 'Busy' },
  'Severe Congestion': { label: 'Heavy traffic', color: '#cb4458', tint: '#fff0f2', short: 'Heavy' },
};

export const number = (value, decimals = 1) => value == null ? '—' : (Math.abs(Number(value)) < 10 ** -decimals / 2 ? 0 : Number(value)).toLocaleString('en-IN', { maximumFractionDigits: decimals });
export const time = (hour) => `${String(hour).padStart(2, '0')}:00`;
export const signed = (value) => `${value > 0 ? '+' : ''}${number(value, 2)}`;

export async function analyzeTraffic(payload, signal) {
  const response = await fetch('/api/analyze', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.segments || !Array.isArray(result.matches)) {
    throw new Error(result?.error || 'Analysis is unavailable. Check that the Python backend is running.');
  }
  return result;
}
