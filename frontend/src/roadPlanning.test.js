import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES, inMapArea, laneCounts, scenarioExport } from './roadPlanning.js';

test('all city shortcuts fit the India-focused service area', () => {
  assert.ok(CITIES.length >= 10);
  assert.ok(CITIES.every(({ lat, lon }) => inMapArea(lat, lon)));
  assert.equal(inMapArea(NaN, 79), false);
  assert.equal(inMapArea(21, 120), false);
});
test('lane counts represent partial and complete closures', () => {
  assert.deepEqual(laneCounts(3, 2), { total: 3, open: 2, blocked: 1, closed: false });
  assert.equal(laneCounts(3, 0).closed, true);
  for (const values of [[2, 3], [7, 5], [2, -1], [2, 1.5]]) assert.throws(() => laneCounts(...values));
});
test('exports preserve provenance, inputs and selected road identity', () => {
  const inputs = { road_lanes: 2, traffic_volume: 1800 };
  const result = scenarioExport({ lat: 21.14, lon: 79.08, label: 'Pin' }, { id: 42, name: 'Example road' }, inputs, 3, { lane_plan: { blocked_lanes: 1 } }, 30);
  assert.equal(result.location.osm_way_id, 42);
  assert.equal(result.location.label, 'Example road');
  assert.equal(result.total_lanes, 3);
  assert.equal(result.inputs, inputs);
  assert.match(result.analysis_source, /simulated/);
  assert.match(result.purpose, /not live/);
});
