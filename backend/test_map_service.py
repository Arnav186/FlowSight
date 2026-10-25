"""No-network tests for road parsing, privacy-conscious lookup and lane scenarios."""
import json
import unittest
from unittest.mock import patch, MagicMock
from urllib.error import URLError

from app import app, bundle
from analytics import find_neighbors
import map_service as maps

TRAFFIC = dict(hour=9, traffic_volume=1800, average_speed_kmph=28, rainfall_mm=0, incidents=0, road_lanes=2)
FIXTURE = {'elements': [
    {'type': 'way', 'id': 42, 'tags': {'name': 'Example road', 'highway': 'primary', 'lanes': '4'}, 'geometry': [{'lat': 21.14, 'lon': 79.08}, {'lat': 21.15, 'lon': 79.09}]},
    {'type': 'way', 'id': 43, 'tags': {'highway': 'residential', 'lanes': '2;3'}, 'geometry': [{'lat': 21.14, 'lon': 79.08}, {'lat': 21.141, 'lon': 79.081}]},
]}


class MapServiceTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        maps._cache.clear()
        maps._last_request = -float('inf')

    def test_coordinates_reject_invalid_values(self):
        for value in [None, [], {}, {'lat': True, 'lon': 79}, {'lat': '21', 'lon': 79}, {'lat': float('nan'), 'lon': 79}, {'lat': 21, 'lon': 120}]:
            with self.subTest(value=value):
                self.assertEqual(self.client.post('/api/map/roads', json=value).status_code, 400 if value is not None else 415)

    def test_lane_tags_are_not_guessed(self):
        roads = maps.parse_roads(FIXTURE)
        self.assertEqual(roads[0]['lanes'], 4)
        self.assertIsNone(roads[1]['lanes'])
        self.assertEqual(roads[1]['lanes_raw'], '2;3')
        for value in [None, '0', '-1', '2.5', '2 @ (Mo-Fr)', '2;3']:
            self.assertIsNone(maps.lane_number(value))

    def test_unknown_lanes_are_explicit(self):
        fixture = json.loads(json.dumps(FIXTURE))
        fixture['elements'][0]['tags'].pop('lanes')
        self.assertIsNone(maps.parse_roads(fixture)[0]['lanes'])
        self.assertEqual(maps.parse_roads(fixture)[0]['lanes_raw'], 'Not mapped')

    def test_partial_or_error_results_are_rejected(self):
        for value in [{}, {'elements': [], 'remark': 'runtime error'}, None]:
            with self.assertRaises(maps.MapUnavailable):maps.parse_roads(value)

    def test_malformed_road_elements_are_skipped(self):
        fixture = {'elements': [None, {'type': 'way', 'tags': {}, 'geometry': None},
                                {**FIXTURE['elements'][0], 'id': True}, FIXTURE['elements'][0]]}
        self.assertEqual([road['id'] for road in maps.parse_roads(fixture)], [42])

    @patch('map_service.urlopen')
    def test_lookup_cached_and_request_identified(self, fetch):
        response = MagicMock();response.read.return_value = json.dumps(FIXTURE).encode()
        fetch.return_value.__enter__.return_value = response
        point = {'lat': 21.1458, 'lon': 79.0882}
        first = self.client.post('/api/map/roads', json=point)
        second = self.client.post('/api/map/roads', json=point)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(len(first.json['roads']), 2)
        self.assertFalse(first.json['cached']);self.assertTrue(second.json['cached'])
        fetch.assert_called_once()
        req = fetch.call_args.args[0]
        self.assertIn('FlowSight/', req.get_header('User-agent'))
        self.assertIn('timeout', req.data.decode())

    @patch('map_service.urlopen', side_effect=URLError('offline'))
    def test_provider_failure_has_manual_fallback(self, fetch):
        response = self.client.post('/api/map/roads', json={'lat': 21.1458, 'lon': 79.0882})
        self.assertEqual(response.status_code, 503)
        self.assertIn('manual', response.json['error'])

    def test_rate_limit_does_not_contact_provider(self):
        maps._last_request = maps.time.monotonic()
        with patch('map_service.urlopen') as fetch:
            response = self.client.post('/api/map/roads', json={'lat': 21.14, 'lon': 79.08})
            self.assertEqual(response.status_code, 429);fetch.assert_not_called()

    def test_all_open_comparison_uses_retrieved_records(self):
        response = self.client.post('/api/analyze', json={'traffic': TRAFFIC, 'reference': TRAFFIC, 'total_lanes': 3, 'sample_size': 30})
        self.assertEqual(response.status_code, 200)
        plan = response.json['lane_plan']
        expected = find_neighbors(bundle(), {**TRAFFIC, 'road_lanes': 3}, 30)
        self.assertEqual(plan['blocked_lanes'], 1)
        self.assertEqual(plan['vehicles_per_open_lane'], 900)
        self.assertEqual(plan['vehicles_per_lane_all_open'], 600)
        self.assertAlmostEqual(plan['all_open_delay'], float(expected.delay_minutes.mean()), places=2)
        self.assertEqual(plan['current_delay'], response.json['summary']['avg_delay'])

    def test_no_blockage_means_identical_comparison(self):
        result = self.client.post('/api/analyze', json={'traffic': TRAFFIC, 'reference': TRAFFIC, 'total_lanes': 2}).json
        self.assertEqual(result['lane_plan']['delay_difference'], 0)

    def test_invalid_lane_capacity_and_closed_road(self):
        for count in [True, 1, 7, 2.5, '3']:
            self.assertEqual(self.client.post('/api/analyze', json={'traffic': TRAFFIC, 'reference': TRAFFIC, 'total_lanes': count}).status_code, 400)
        self.assertEqual(self.client.post('/api/analyze', json={'traffic': {**TRAFFIC, 'road_lanes': 0}, 'reference': TRAFFIC, 'total_lanes': 3}).status_code, 400)


if __name__ == '__main__':unittest.main()
