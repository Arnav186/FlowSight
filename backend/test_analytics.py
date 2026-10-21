"""Regression checks for synchronized results and honest nearest-record retrieval."""
import unittest

from app import app, bundle
from analytics import FEATURES

MORNING = dict(hour=9, traffic_volume=1800, average_speed_kmph=28, rainfall_mm=0, incidents=0, road_lanes=3)
RAIN = dict(hour=18, traffic_volume=2100, average_speed_kmph=22, rainfall_mm=8, incidents=1, road_lanes=3)
HIGHWAY = dict(hour=14, traffic_volume=650, average_speed_kmph=72, rainfall_mm=0, incidents=0, road_lanes=4)


class AnalyticsTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def analyze(self, traffic, reference=HIGHWAY, size=30):
        response = self.client.post('/api/analyze', json=dict(traffic=traffic, reference=reference, sample_size=size))
        self.assertEqual(response.status_code, 200, response.json)
        return response.json

    def test_scenarios_change_every_analysis_view(self):
        first, second = self.analyze(HIGHWAY), self.analyze(RAIN)
        self.assertNotEqual(first['summary'], second['summary'])
        self.assertNotEqual(first['segments'], second['segments'])
        self.assertNotEqual(first['contributions'], second['contributions'])
        self.assertNotEqual(first['tree'], second['tree'])
        self.assertNotEqual(first['matches'][0]['record_id'], second['matches'][0]['record_id'])

    def test_aggregates_are_from_the_actual_returned_records(self):
        result = self.analyze(MORNING, size=60)
        self.assertEqual(len(result['matches']), 60)
        self.assertEqual(sum(group['count'] for group in result['segments']), 60)
        self.assertAlmostEqual(sum(row['delay_minutes'] for row in result['matches']) / 60, result['summary']['avg_delay'], places=2)
        for group in result['segments']:
            rows = [row for row in result['matches'] if row['segment_name'] == group['segment_name']]
            self.assertEqual(len(rows), group['count'])
            if rows:
                self.assertAlmostEqual(sum(row['delay_minutes'] for row in rows) / len(rows), group['avg_delay'], places=2)
            else:
                self.assertIsNone(group['avg_delay'])

    def test_exact_record_is_kept_as_first_match(self):
        record = bundle()['records'].iloc[0]
        values = {field: float(record[field]) for field in FEATURES}
        result = self.analyze(values)
        self.assertEqual(result['matches'][0]['record_id'], int(record.record_id))
        self.assertEqual(result['matches'][0]['similarity_distance'], 0)

    def test_regression_compares_to_a_reference_without_changing_data(self):
        same = self.analyze(MORNING, reference=MORNING)
        other = self.analyze(MORNING, reference=HIGHWAY)
        self.assertTrue(all(row['minutes'] == 0 for row in same['contributions']))
        self.assertEqual(same['matches'], other['matches'])
        for row in other['contributions']:
            self.assertAlmostEqual(row['minutes'], row['change'] * row['coefficient'], places=3)

    def test_invalid_values_return_useful_errors(self):
        for invalid in [None, {}, {**MORNING, 'incidents': -1}, {**MORNING, 'hour': 24},
                        {**MORNING, 'rainfall_mm': 'rain'}, {**MORNING, 'road_lanes': 1.5},
                        {**MORNING, 'traffic_volume': True}, {**MORNING, 'rainfall_mm': float('nan')}]:
            response = self.client.post('/api/analyze', json=dict(traffic=invalid, reference=HIGHWAY))
            self.assertEqual(response.status_code, 400)
            self.assertIn('error', response.json)


if __name__ == '__main__':
    unittest.main()
