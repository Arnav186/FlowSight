import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CITIES, inMapArea } from './roadPlanning.js';

const INDIA_VIEW = [[6, 68], [37.5, 98]];
const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export default function IndiaRoadMap({ location, onLocation, road, onRoad, totalLanes, openLanes, onTotalLanes, onOpenLanes }) {
  const element = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const roadsLayer = useRef(null);
  const callbacks = useRef({ onLocation, onRoad });
  callbacks.current = { onLocation, onRoad };
  const [roads, setRoads] = useState([]);
  const [lookup, setLookup] = useState('idle');
  const [message, setMessage] = useState('');
  const [fetchedAt, setFetchedAt] = useState('');
  const [tileFailed, setTileFailed] = useState(false);
  const [mapError, setMapError] = useState('');
  const [coordinateError, setCoordinateError] = useState('');
  const [latText, setLatText] = useState(String(location.lat));
  const [lonText, setLonText] = useState(String(location.lon));
  const request = useRef(null);
  const requestId = useRef(0);
  const blocked = totalLanes - openLanes;

  useEffect(() => {
    let resize;
    try {
      const instance = L.map(element.current, { scrollWheelZoom: false, minZoom: 3, maxZoom: 19, maxBounds: [[3, 64], [40, 102]], maxBoundsViscosity: 0.8 });
      map.current = instance;
      instance.fitBounds(INDIA_VIEW, { padding: [15, 15] });
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19, updateWhenIdle: true, keepBuffer: 1 })
        .on('tileerror', () => setTileFailed(true)).addTo(instance);
      L.control.scale({ imperial: false }).addTo(instance);
      marker.current = L.marker([location.lat, location.lon], {
        icon: L.divIcon({ className: 'road-pin', html: '<span aria-hidden="true">●</span>', iconSize: [28, 28], iconAnchor: [14, 14] }),
        keyboard: false, interactive: false,
      }).addTo(instance);
      roadsLayer.current = L.layerGroup().addTo(instance);
      instance.on('click', (event) => {
        const { lat, lng } = event.latlng;
        if (!inMapArea(lat, lng)) { setCoordinateError('Choose a point in the India-focused viewing area.'); return; }
        setCoordinateError('');
        callbacks.current.onLocation({ lat: +lat.toFixed(5), lon: +lng.toFixed(5), name: '', label: 'Selected map point' });
      });
      resize = new ResizeObserver(() => instance.invalidateSize());
      resize.observe(element.current);
    } catch {
      setMapError('The map could not initialise. Use a city or coordinates below; lane analysis is still available.');
    }
    return () => { resize?.disconnect(); map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    request.current?.abort(); requestId.current += 1;
    setRoads([]); setLookup('idle'); setMessage(''); setFetchedAt('');
    setCoordinateError('');
    setLatText(String(location.lat)); setLonText(String(location.lon));
    marker.current?.setLatLng([location.lat, location.lon]);
    if (location.revision > 0) map.current?.setView([location.lat, location.lon], 15, { animate: false });
    return () => request.current?.abort();
  }, [location]);

  useEffect(() => {
    if (!roadsLayer.current) return;
    roadsLayer.current.clearLayers();
    for (const item of roads) {
      const selected = road?.id === item.id;
      const line = L.polyline(item.geometry, { color: selected ? (blocked > 0 ? '#cc7131' : '#126c67') : '#3579be', weight: selected ? 7 : 4, opacity: selected ? 1 : 0.6, bubblingMouseEvents: false });
      // API-supplied labels are text, never trusted HTML.
      const tip = document.createElement('span'); tip.textContent = item.name;
      line.bindTooltip(tip).on('click', () => callbacks.current.onRoad(item)).addTo(roadsLayer.current);
    }
  }, [roads, road, blocked]);

  useEffect(() => {
    if (road?.geometry?.length) map.current?.fitBounds(road.geometry, { padding: [35, 35], maxZoom: 17, animate: false });
  }, [road]);

  async function loadRoads() {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const id = ++requestId.current;
    setLookup('loading'); setMessage(''); setRoads([]); callbacks.current.onRoad(null);
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch('/api/map/roads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: location.lat, lon: location.lon }), signal: controller.signal });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.roads)) throw new Error(result.error || 'Road lookup failed.');
      if (id !== requestId.current) return;
      setRoads(result.roads); setFetchedAt(result.fetched_at); setLookup('ready');
      if (!result.roads.length) setMessage('No mapped roads were returned within 700 metres. Move the pin or continue with a manual scenario.');
      map.current?.setView([location.lat, location.lon], 15, { animate: false });
    } catch (error) {
      if (id !== requestId.current) return;
      setLookup('error'); setMessage(error.name === 'AbortError' ? 'The map service timed out. Retry later or continue with a manual scenario.' : error.message);
    } finally { clearTimeout(timeout); }
  }

  function enterCoordinates(event) {
    event.preventDefault();
    const lat = Number(latText), lon = Number(lonText);
    if (!latText.trim() || !lonText.trim() || !inMapArea(lat, lon)) { setCoordinateError('Use latitude 6–37.5 and longitude 68–98. These limits are a viewing area, not a national boundary.'); return; }
    setCoordinateError(''); callbacks.current.onLocation({ lat, lon, name: '', label: 'Entered coordinates' });
  }

  return <section className="road-workspace" aria-label="India road and lane planner">
    <div className="map-side">
      <div className="map-toolbar"><div><span className="eyebrow">01 / FIND YOUR ROAD</span><h2>A real place. Your road situation.</h2></div>
        <div className="map-actions"><button onClick={() => map.current?.fitBounds(INDIA_VIEW)}>India view</button><button onClick={() => map.current?.setView([location.lat, location.lon], 15)}>Zoom to pin</button></div>
      </div>
      <div className="map-canvas" ref={element} aria-label="Interactive OpenStreetMap of India. Click to place a pin; city and coordinate controls are available below." />
      {(tileFailed || mapError) && <p className="map-warning" role="status">{mapError || 'Some map tiles did not load. Check your internet connection; city selection and manual lane analysis still work.'}</p>}
      <div className="map-bottom"><span><i className="legend-road" /> Mapped road</span><span><i className="legend-selected" /> Selected scenario, not live traffic</span><a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">Report map issue ↗</a></div>
      <p className="map-privacy">Map tiles come from OpenStreetMap. “Find nearby roads” sends this pin to the configured Overpass provider. No device location is accessed.</p>
    </div>
    <div className="road-sidebar">
      <label htmlFor="city-select">Jump to an Indian city</label>
      <select id="city-select" value={location.name} onChange={(event) => {
        const city = CITIES.find((item) => item.name === event.target.value);
        if (city) callbacks.current.onLocation({ ...city, label: `${city.name} city centre` });
      }}><option value="" disabled>Custom map point</option>{CITIES.map((city) => <option key={city.name}>{city.name}</option>)}</select>
      <div className="pin-details"><b>{road?.name || location.label}</b><span>{location.lat.toFixed(5)}° N · {location.lon.toFixed(5)}° E</span></div>
      <details className="coordinates"><summary>Or enter coordinates</summary><form onSubmit={enterCoordinates}><label>Latitude<input inputMode="decimal" value={latText} onChange={(e) => setLatText(e.target.value)} /></label><label>Longitude<input inputMode="decimal" value={lonText} onChange={(e) => setLonText(e.target.value)} /></label><button type="submit">Place pin</button></form></details>
      {coordinateError && <p className="map-warning" role="alert">{coordinateError}</p>}
      <button className="lookup-button" onClick={loadRoads} disabled={lookup === 'loading'}>{lookup === 'loading' ? 'Finding mapped roads…' : 'Find nearby roads ↗'}</button>
      <p className="field-hint">Search within 700 m. Road and lane tags are not live conditions.</p>
      {message && <p className="map-warning" role="status">{message}</p>}
      {roads.length > 0 && <><label htmlFor="road-select">Choose a road segment ({roads.length})</label><select id="road-select" value={road?.id || ''} onChange={(e) => callbacks.current.onRoad(roads.find((r) => String(r.id) === e.target.value) || null)}><option value="">Select a road on the map or here</option>{roads.map((r) => <option value={r.id} key={r.id}>{r.name} · {r.kind.replaceAll('_', ' ')} · #{r.id}</option>)}</select></>}
      {road && <div className="mapped-road-details"><span className="source-label">OPENSTREETMAP ROAD DATA</span><p>Mapped lanes: <b>{road.lanes_raw}</b> · One-way: <b>{road.oneway}</b></p><p className="field-hint">The lanes tag can count both directions. Verify the count and select only lanes serving your observation below.</p>
        {road.lanes >= 1 && road.lanes <= 6 && <button onClick={() => onTotalLanes(road.lanes, true)}>Use {road.lanes} mapped lanes as my assumption</button>}
        {road.lanes > 6 && <p className="field-hint">This model supports up to 6 lanes. Select the observed carriageway manually; the mapped count has not been reduced.</p>}
        <a href={road.osm_url} target="_blank" rel="noreferrer">Inspect source road ↗</a>
      </div>}
      {fetchedAt && <p className="field-hint">Road data fetched {new Date(fetchedAt).toLocaleString('en-IN')}. Mapping can be incomplete.</p>}
      <div className="lane-editor"><span className="eyebrow">02 / CHECK THE BOTTLENECK</span><h3>What lanes are available?</h3><div className="lane-selectors"><label htmlFor="total-lanes">Total lanes<select id="total-lanes" value={totalLanes} onChange={(e) => onTotalLanes(Number(e.target.value))}>{[1,2,3,4,5,6].map((n) => <option key={n} value={n}>{n} lanes</option>)}</select></label><label htmlFor="blocked-lanes">Blocked lanes<select id="blocked-lanes" value={blocked} onChange={(e) => onOpenLanes(totalLanes - Number(e.target.value))}>{Array.from({ length: totalLanes + 1 }, (_, n) => <option key={n} value={n}>{n} blocked</option>)}</select></label></div>
        <div className="lane-visual" aria-label={`${openLanes} of ${totalLanes} lanes open`}>{Array.from({ length: totalLanes }, (_, n) => <span key={n} className={n >= openLanes ? 'blocked' : 'open'}><b>{n >= openLanes ? '×' : '↑'}</b><small>{n >= openLanes ? 'Blocked' : 'Open'}</small></span>)}</div>
        <p className="lane-caption"><b>{openLanes} / {totalLanes}</b> lanes open in your scenario</p><div className="lane-actions"><button onClick={() => onOpenLanes(Math.max(0, openLanes - 1))} disabled={openLanes === 0}>Block one lane</button><button onClick={() => onOpenLanes(totalLanes)} disabled={blocked === 0}>Reopen all</button></div>
        <p className="field-hint">Manual assumption. Roadworks or parked vehicles can be modelled as blocked lanes. Use the same carriageway and count period for all inputs.</p>
      </div>
      <a className="location-link" href={`https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lon}`} target="_blank" rel="noreferrer">Open this pin in Google Maps ↗</a>
    </div>
  </section>;
}

export function LaneComparison({ plan, onReopen }) {
  const max = Math.max(1, plan.current_delay, plan.all_open_delay);
  return <section className="panel lane-comparison" aria-label="Lane closure comparison">
    <div className="heading-line"><span className="step">↔</span><h2>Does the lane blockage change the pattern?</h2><span className="algorithm">KNN scenario comparison</span></div>
    <p className="hint">Same traffic inputs, two lane settings. These are averages from similar simulated records, not measurements from this road.</p>
    <div className="lane-comparison-grid"><div className="lane-bar-chart">
      {[['All lanes open', plan.total_lanes, plan.all_open_delay, 'baseline'], ['Your situation', plan.open_lanes, plan.current_delay, 'current']].map(([label, lanes, delay, kind]) => <div className="lane-result-row" key={kind}><span>{label}<small>{lanes} open lanes</small></span><div><i className={kind} style={{ width: `${delay / max * 100}%` }} /></div><b>{delay.toFixed(1)} <small>min</small></b></div>)}
      <p className="footnote">Changing lanes can select different neighbours without producing a smooth or monotonic change.</p>
    </div><div className="lane-pressure"><span>Vehicles per available lane</span><strong>{plan.vehicles_per_open_lane.toLocaleString('en-IN')} <small>vs {plan.vehicles_per_lane_all_open.toLocaleString('en-IN')}</small></strong><p>Entered vehicle count ÷ open lanes, compared with all lanes open. Not vehicles/hour or measured road capacity.</p></div></div>
    <div className="lane-takeaway"><p>{plan.blocked_lanes ? `${plan.blocked_lanes} lane${plan.blocked_lanes > 1 ? 's are' : ' is'} blocked in your scenario. Compare reopening them while keeping rain, speed and vehicle count unchanged.` : 'All lanes are open, so the two scenarios match. Block one lane above to explore a roadworks or obstruction scenario.'}</p>{plan.blocked_lanes > 0 && <button onClick={onReopen}>Try reopening all lanes</button>}</div>
  </section>;
}
