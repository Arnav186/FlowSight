# India Road Lab — verification notes

Checked locally on 24 October 2026. This update adds geographic context and a user-entered lane-closure lab; it does not add live traffic observations.

## Automated checks

- `python -m unittest discover -s backend -p "test_*.py" -v`: **16 passed**.
- `cd frontend` then `node --test src/roadPlanning.test.js`: **3 passed**.
- `npm run build`: **passed**. Vite reports a non-blocking bundle-size warning (about 765 kB minified JavaScript before gzip, including charts and Leaflet).
- Provider parsing, caching and failure responses are tested with mocked data. This is not evidence of live-provider availability.

## Browser checks

- OpenStreetMap base tiles displayed the India overview and local Nagpur streets with attribution.
- City switching moved the pin and cleared old lookup status while preserving manual inputs.
- Three open lanes vs two open lanes, with the Morning rush inputs and 30 neighbours, displayed **39.6 vs 47.9 minutes** from matching synthetic records and **600 vs 900 vehicles per available lane**. The regression lane contribution changed to **+3.26 minutes**. These are demo associations, not real Nagpur travel times or causal savings.
- Entering 8 mm rainfall changed the all-open matching set's average delay to **52.6 minutes** and its dominant group to Heavy traffic.
- Blocking all lanes displayed a closure warning, disabled export and hid previous results; reopening restored analysis.
- Latitude 100 was rejected with an inline viewing-area message. Valid coordinates restored the pin.
- At a 390-pixel mobile viewport, the map and lane controls stacked without horizontal document overflow. The lane button remained usable. Desktop layout checked at 1360 pixels.
- No browser error/warning messages were captured in the final rebuilt-page session.

## External-service limitation

The default Overpass endpoint timed out during a real Nagpur road query. A small GET check returned HTTP 502. An alternative public instance also timed out. The browser correctly displayed the manual-scenario fallback, and local analysis remained usable.

Consequently, successful live road retrieval, geometry selection and applying a real mapped lane tag were **not end-to-end verified** in this environment. The implementation and mock tests are present; internet/provider availability is required. No alternate provider was silently installed as a fallback, and no road results were fabricated.

## Preview and scope

`india-road-lab-preview.jpg` shows the final map dashboard. Setup, usage, provenance and provider configuration are in `README.md`. No GitHub push, public deployment, report rewriting or journal submission was performed for this update.
