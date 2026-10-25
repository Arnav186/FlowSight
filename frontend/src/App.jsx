import React, { useEffect, useRef, useState } from 'react';
import { BarChart, Bar, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { analyzeTraffic, FIELDS, GROUPS, MODEL_COMPARISON, number, PRESETS, signed, time } from './traffic.js';
import IndiaRoadMap, { LaneComparison } from './IndiaRoadMap.jsx';
import { INITIAL_LOCATION, ALL_OPEN, scenarioExport } from './roadPlanning.js';
import './roadMap.css';

function InputControl({ field, value, onChange }) {
  return <div className="input-control">
    <div className="input-heading">
      <label htmlFor={`number-${field.key}`}>{field.label}</label>
      <div className="number-wrap">
        <input id={`number-${field.key}`} type="number" min={field.min} max={field.max} step={field.step}
          value={value} onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))} />
        <span>{field.key === 'hour' && value !== '' ? time(value) : field.unit}</span>
      </div>
    </div>
    <input type="range" aria-label={`${field.label} slider`} min={field.min} max={field.max} step={field.step}
      value={value === '' ? field.min : value} onChange={(event) => onChange(Number(event.target.value))}
      style={{ '--progress': `${Math.max(0, Math.min(100, (value - field.min) / (field.max - field.min) * 100))}%` }} />
    <p className="field-hint">{field.hint}</p>
  </div>;
}

function SectionTitle({ step, title, algorithm, children }) {
  return <div className="section-heading">
    <div className="heading-line"><span className="step">{step}</span><h2>{title}</h2><span className="algorithm">{algorithm}</span></div>
    {children && <p className="hint">{children}</p>}
  </div>;
}

function App() {
  const [inputs, setInputs] = useState({ ...PRESETS['Morning rush'] });
  const [preset, setPreset] = useState('Morning rush');
  const [reference, setReference] = useState(ALL_OPEN);
  const [location, setLocation] = useState(INITIAL_LOCATION);
  const [road, setRoad] = useState(null);
  const [totalLanes, setTotalLanes] = useState(3);
  const [sampleSize, setSampleSize] = useState(30);
  const [analysis, setAnalysis] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [group, setGroup] = useState(null);
  const [metric, setMetric] = useState('avg_delay');
  const [activeFactor, setActiveFactor] = useState('rainfall_mm');
  const [recordId, setRecordId] = useState(null);
  const [activeModel, setActiveModel] = useState('Linear Regression');
  const [comparisonMetric, setComparisonMetric] = useState('rmse');
  const sequence = useRef(0);

  const invalidField = FIELDS.find((field) => inputs[field.key] === '' || !Number.isFinite(inputs[field.key]) ||
    inputs[field.key] < field.min || inputs[field.key] > field.max || (field.step === 1 && !Number.isInteger(inputs[field.key])));

  useEffect(() => {
    const id = ++sequence.current;
    const controller = new AbortController();
    setError('');
    if (invalidField) {
      setStatus('invalid');
      return () => controller.abort();
    }
    setStatus('loading');
    const timer = setTimeout(async () => {
      try {
        const result = await analyzeTraffic({ traffic: inputs,
          reference: reference === ALL_OPEN ? { ...inputs, road_lanes: totalLanes } : PRESETS[reference],
          sample_size: sampleSize, total_lanes: totalLanes }, controller.signal);
        if (id !== sequence.current) return;
        setAnalysis(result);
        setRecordId(null);
        setStatus('ready');
      } catch (failure) {
        if (failure.name === 'AbortError' || id !== sequence.current) return;
        setError(failure.message || 'Could not connect to the backend.');
        setStatus('error');
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [inputs, reference, sampleSize, retry, invalidField, totalLanes]);

  function choosePreset(name) {
    setInputs({ ...PRESETS[name] });
    setTotalLanes(PRESETS[name].road_lanes);
    setPreset(name);
    setGroup(null);
  }

  function editInput(key, value) {
    setInputs((previous) => ({ ...previous, [key]: value }));
    setPreset('Custom situation');
    setGroup(null);
  }

  function chooseLocation(next) {
    setLocation((previous) => ({ ...next, revision: previous.revision + 1 }));
    setRoad(null);
  }

  function changeTotalLanes(next, reset = false) {
    const blocked = totalLanes - inputs.road_lanes;
    setTotalLanes(next);
    editInput('road_lanes', reset ? next : Math.max(0, next - blocked));
  }

  function downloadScenario() {
    const data = scenarioExport(location, road, inputs, totalLanes, analysis, sampleSize);
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'flowsight-road-scenario.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const groupData = analysis?.segments.map((entry) => ({ ...entry, short: GROUPS[entry.segment_name].short })) || [];
  const filteredMatches = analysis?.matches.filter((record) => group === null || record.segment_name === group) || [];
  const visibleMatches = filteredMatches.slice(0, 5);
  const selectedRecord = visibleMatches.find((record) => record.record_id === recordId);
  const selectedFactor = analysis?.contributions.find((factor) => factor.feature === activeFactor);
  const factorExtent = Math.max(1, ...(analysis?.contributions.map((factor) => Math.abs(factor.minutes)) || []));
  const activeGroup = groupData.find((entry) => entry.segment_name === group);
  const activeModelResult = MODEL_COMPARISON.find((item) => item.model === activeModel) || MODEL_COMPARISON[0];
  const modelMetricMaximum = Math.max(...MODEL_COMPARISON.filter((item) => item[comparisonMetric] != null).map((item) => item[comparisonMetric]));
  const busy = status !== 'ready';

  return <div className="app-shell">
    <header className="topbar">
      <a href="#top" className="brand"><span className="brand-mark" aria-hidden="true">≋</span><span>FlowSight<span className="brand-sub">India Road & Traffic Explorer</span></span></a>
      <span className="demo-badge">Real maps · simulated ML · no live traffic</span>
    </header>
    <main id="top">
      <div className="page-heading"><div><p className="eyebrow">INDIA ROAD LAB / FROM A PLACE TO A PRACTICAL QUESTION</p><h1>One blocked lane.<br />What changes on your road?</h1><p>Find a road, enter its conditions, and explore a lane-closure scenario.</p></div>
        <a className="text-link" href="#explain">Help me present this <span aria-hidden="true">↗</span></a>
      </div>
      <div className="workflow-strip"><span><b>1</b> Select a place in India</span><span><b>2</b> Set open and blocked lanes</span><span><b>3</b> Add traffic conditions & compare</span></div>
      <IndiaRoadMap location={location} onLocation={chooseLocation} road={road} onRoad={setRoad}
        totalLanes={totalLanes} openLanes={inputs.road_lanes} onTotalLanes={changeTotalLanes} onOpenLanes={(n) => editInput('road_lanes', n)} />
      <div className="scenario-heading" id="road-analysis"><div><span className="eyebrow">03 / YOUR SCENARIO ANALYSIS</span><h2>{road?.name || location.label}</h2><p>Map selection provides location only. Traffic values below are your assumptions, not readings from this road.</p></div><button className="export-button" onClick={downloadScenario} disabled={busy || !analysis}>Download scenario</button></div>
      {inputs.road_lanes === 0 && <div className="closure-warning" role="alert"><strong>All lanes are blocked in this scenario.</strong><p>The model requires at least one open lane, so analysis is paused and previous results are hidden. Do not use this app to decide whether a closed road is safe to enter; check official local traffic information.</p><button onClick={() => editInput('road_lanes', totalLanes)}>Reopen lanes to continue</button></div>}
      <div className="workspace">
        <aside className="controls panel" aria-label="Traffic input controls">
          <div className="controls-title"><span className="step">↳</span><div><h2>Enter road conditions</h2><p>Manual values. Presets are examples, not city data.</p></div></div>
          <div className="presets" aria-label="Example traffic situations">{Object.keys(PRESETS).map((name) =>
            <button key={name} className={preset === name ? 'chosen' : ''} aria-pressed={preset === name} onClick={() => choosePreset(name)}>{name}</button>)}</div>
          <div className="controls-caption"><strong>{preset}</strong><button className="text-button" onClick={() => choosePreset('Morning rush')}>Reset inputs</button></div>
          <div className="open-lane-summary"><b>{inputs.road_lanes} of {totalLanes} lanes open</b><span>Change lanes in the map panel above. Presets reset lane settings.</span></div>
          {FIELDS.filter((field) => field.key !== 'road_lanes').map((field) => <InputControl key={field.key} field={field} value={inputs[field.key]} onChange={(value) => editInput(field.key, value)} />)}
          <div className="sample-control"><label htmlFor="sample-size">Similar records to explore</label><select id="sample-size" value={sampleSize} onChange={(event) => setSampleSize(Number(event.target.value))}>
            {[10, 30, 60, 100].map((count) => <option key={count} value={count}>{count} closest records</option>)}</select><p className="field-hint">More records give a broader view of similar situations.</p></div>
          <p className="auto-note"><span className="status-dot" /> Results update automatically as you change inputs.</p>
        </aside>

        <div className="results-column">
          <div className={`live-status ${status}`} role="status" aria-live="polite">
            <span className="status-dot" />{status === 'ready' ? `Updated · analysing ${analysis.sample_size} similar simulated records` : inputs.road_lanes === 0 ? 'Road closed in your scenario · reopen a lane to resume analysis.' : status === 'invalid' ? `Enter a valid ${invalidField?.label.toLowerCase()} (${invalidField?.min}–${invalidField?.max}).` : status === 'error' ? 'Connection needs attention' : 'Updating all results…'}
          </div>
          {error && <div className="error-box" role="alert"><strong>We couldn’t load your analysis.</strong><p>{error}</p><p>Run <code>python backend/app.py</code> in the project folder, then retry.</p><button onClick={() => setRetry((value) => value + 1)}>Retry connection</button></div>}
          {!analysis && !error && <div className="panel loading-panel">{status === 'invalid' ? 'Complete your inputs to see the analysis.' : 'Finding comparable traffic records…'}</div>}

          {analysis && inputs.road_lanes > 0 && <div className={`analysis-content ${busy ? 'is-updating' : ''}`} aria-busy={busy} inert={busy}>
            {analysis.lane_plan && <LaneComparison plan={analysis.lane_plan} onReopen={() => editInput('road_lanes', totalLanes)} />}
            <section className="summary-strip" aria-label="Current analysis summary">
              <div><span>Closest pattern</span><strong style={{ color: GROUPS[analysis.summary.dominant_group].color }}>{GROUPS[analysis.summary.dominant_group].label}</strong><small>Most common among similar records</small></div>
              <div><span>Recorded average delay</span><strong>{number(analysis.summary.avg_delay)} <em>min</em></strong><small>From {analysis.sample_size} matching observations</small></div>
              <div><span>Recorded average speed</span><strong>{number(analysis.summary.avg_speed)} <em>km/h</em></strong><small>From the same matching observations</small></div>
            </section>

            <section className="panel" aria-label="Traffic groups">
              <SectionTitle step="02" title="Explore the traffic groups" algorithm="K-Means + KNN">These are the groups found among your {analysis.sample_size} closest records. Select a group to explore its matches.</SectionTitle>
              <div className="group-cards">{groupData.map((entry) => {
                const appearance = GROUPS[entry.segment_name];
                return <button key={entry.cluster_id} className={`group-card ${group === entry.segment_name ? 'selected' : ''}`} style={{ '--group-color': appearance.color, '--group-tint': appearance.tint }}
                  aria-pressed={group === entry.segment_name} aria-label={`Explore ${appearance.label}`} onClick={() => { setGroup(group === entry.segment_name ? null : entry.segment_name); setRecordId(null); }}>
                  <span className="group-name"><span />{appearance.label}</span><strong>{entry.count}<small> / {analysis.sample_size} records</small></strong>
                  <span className="share-track"><span style={{ width: `${entry.share}%` }} /></span>
                  <span className="group-detail">{entry.avg_delay === null ? 'No similar records in this group' : `${number(entry.avg_delay)} min avg. delay · ${number(entry.avg_speed)} km/h`}</span>
                </button>;
              })}</div>
              <div className="chart-toolbar"><h3>{metric === 'avg_delay' ? 'Average recorded delay' : 'Number of matching records'}</h3><div className="segmented" aria-label="Group chart metric">
                <button aria-pressed={metric === 'avg_delay'} onClick={() => setMetric('avg_delay')}>Delay</button><button aria-pressed={metric === 'count'} onClick={() => setMetric('count')}>Record count</button>
              </div></div>
              <div className="chart-container"><ResponsiveContainer width="100%" height={205}><BarChart data={groupData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="#e7edf5" /><XAxis dataKey="short" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} width={44} unit={metric === 'avg_delay' ? 'm' : ''} />
                <Tooltip formatter={(value) => [`${number(value)} ${metric === 'avg_delay' ? 'min' : 'records'}`, metric === 'avg_delay' ? 'Average delay' : 'Count']} contentStyle={{ borderRadius: 10 }} />
                <Bar dataKey={metric} maxBarSize={80} radius={[6, 6, 0, 0]} isAnimationActive={false} onClick={(entry) => { const name = entry.segment_name || entry.payload?.segment_name; if (name) { setGroup(group === name ? null : name); setRecordId(null); } }}>
                  {groupData.map((entry) => <Cell key={entry.cluster_id} fill={GROUPS[entry.segment_name].color} opacity={group === null || group === entry.segment_name ? 1 : 0.25} cursor="pointer" />)}
                </Bar></BarChart></ResponsiveContainer></div>
              <div className="filter-note">{group ? <><span>Showing <b>{GROUPS[group].label.toLowerCase()}</b>: {activeGroup.count} of {analysis.sample_size} records.</span><button className="text-button" onClick={() => { setGroup(null); setRecordId(null); }}>Show all groups</button></> : <span>Click a card or a bar to filter the similar records below. An empty group has no delay average.</span>}</div>
            </section>

            <section className="panel" aria-label="Delay factor comparison">
              <SectionTitle step="03" title="Understand what changed" algorithm="Linear Regression">Compare your inputs with an example. Each bar shows the delay difference associated with that one change.</SectionTitle>
              <div className="comparison-control"><label htmlFor="reference">Compare my inputs with</label><select id="reference" value={reference} onChange={(event) => setReference(event.target.value)}>{[ALL_OPEN, ...Object.keys(PRESETS)].map((name) => <option key={name}>{name}</option>)}</select></div>
              <p className="direction-legend"><span className="fewer">← Less delay</span><span>Compared with the example</span><span className="more">More delay →</span></p>
              <div className="factor-list">{analysis.contributions.map((factor) => <button key={factor.feature} className={`factor-row ${activeFactor === factor.feature ? 'selected' : ''}`} onClick={() => setActiveFactor(factor.feature)} aria-pressed={activeFactor === factor.feature}>
                <span className="factor-label">{factor.label}<small>{factor.reference} → {factor.current} {factor.unit}</small></span>
                <span className="factor-track"><span className="zero-line" /><span className={`factor-bar ${factor.minutes < 0 ? 'negative' : 'positive'}`} style={{ width: `${Math.abs(factor.minutes) / factorExtent * 48}%`, left: factor.minutes < 0 ? `${50 - Math.abs(factor.minutes) / factorExtent * 48}%` : '50%' }} /></span>
                <strong>{signed(factor.minutes)} <small>min</small></strong>
              </button>)}</div>
              {selectedFactor && <div className="factor-explanation" role="status"><b>{selectedFactor.label} explained</b><p>{selectedFactor.change === 0 ? `Your ${selectedFactor.label.toLowerCase()} matches the example, so its contribution to the difference is zero.` : `You changed ${selectedFactor.label.toLowerCase()} from ${selectedFactor.reference} to ${selectedFactor.current} ${selectedFactor.unit}. In the fitted relationship, that change is associated with ${number(Math.abs(selectedFactor.minutes), 2)} minutes ${selectedFactor.minutes < 0 ? 'less' : 'more'} delay, holding the other factors fixed.`}</p></div>}
              <p className="footnote">Associations in simulated data, not proof of cause. The bars explain changes from the example; they are not an actual or future journey time.</p>
            </section>

            <section className="panel" aria-label="Similar traffic records">
              <SectionTitle step="04" title="Look at similar recorded traffic" algorithm="KNN">{visibleMatches.length ? `The closest ${visibleMatches.length} ${group ? GROUPS[group].label.toLowerCase() + ' ' : ''}records in your selected set. Click a row to explore it.` : 'There are no records from this group in your selected set. Choose another group or show all groups.'}</SectionTitle>
              {visibleMatches.length > 0 && <div className="table-wrap"><table><thead><tr><th>Record</th><th>Traffic group</th><th>Speed</th><th>Delay</th><th>Explore</th></tr></thead><tbody>{visibleMatches.map((record, index) => <tr key={record.record_id} className={recordId === record.record_id ? 'selected' : ''} onClick={() => setRecordId(recordId === record.record_id ? null : record.record_id)}>
                <td><b>#{index + 1}</b><small>{record.road_zone} · {time(record.hour)}</small></td><td><span className="group-chip" style={{ color: GROUPS[record.segment_name].color, background: GROUPS[record.segment_name].tint }}>{GROUPS[record.segment_name].label}</span></td><td>{number(record.average_speed_kmph)} km/h</td><td>{number(record.delay_minutes)} min</td>
                <td><button className="text-button" aria-label={`Explore record ${record.record_id}`} onClick={(event) => { event.stopPropagation(); setRecordId(recordId === record.record_id ? null : record.record_id); }}>Details</button></td>
              </tr>)}</tbody></table></div>}
              {selectedRecord && <div className="record-detail"><div><h3>Record {selectedRecord.record_id} · {selectedRecord.road_zone}</h3><p>{selectedRecord.traffic_volume} vehicles · {selectedRecord.rainfall_mm} mm rain · {selectedRecord.incidents} incidents · {selectedRecord.road_lanes} open lanes</p><p className="footnote">Similarity distance: {selectedRecord.similarity_distance}. Smaller means a closer match in standardized features. This is a simulated example, not a record from the map location.</p></div><button className="primary" onClick={() => { setInputs(Object.fromEntries(FIELDS.map((field) => [field.key, selectedRecord[field.key]]))); setTotalLanes(selectedRecord.road_lanes); setPreset(`Record ${selectedRecord.record_id}`); setGroup(null); }}>Use this record as input</button></div>}
            </section>

            <section className="panel tree-panel" aria-label="Traffic grouping explanation">
              <SectionTitle step="05" title="Explain the grouping in simple steps" algorithm="Decision Tree">A small decision tree checks your inputs against rules learned from the K-Means groups.</SectionTitle>
              <div className="tree-verdict"><span className="tree-icon" aria-hidden="true">↳</span><span>Following these rules, the tree labels your situation <b style={{ color: GROUPS[analysis.tree.segment_name].color }}>{GROUPS[analysis.tree.segment_name].label.toLowerCase()}</b>.</span></div>
              <ol className="rule-path">{analysis.tree.rules.map((rule, index) => <li key={index}>{rule.text}</li>)}</ol>
              <p className="footnote">This is a simplified explanation of the groups. Its label can differ from the most common group among your similar records.</p>
            </section>

            <section className="panel model-comparison" aria-label="Model comparison">
              <SectionTitle step="06" title="Understand the four model roles" algorithm="Evaluation">Regression scores come from separate held-out regressors. K-Means uses full-dataset cluster scores. These fixed metrics do not measure this road.</SectionTitle>
              <div className="comparison-intro"><span>How to read this</span><p>Lower RMSE means a smaller delay error. Higher R² means the model explains more variation. K-Means creates groups, so it uses different quality measures.</p></div>
              <div className="chart-toolbar model-toolbar"><h3>Click a model or bar to inspect it</h3><div className="segmented" aria-label="Model metric">
                <button aria-pressed={comparisonMetric === 'rmse'} onClick={() => setComparisonMetric('rmse')}>RMSE</button><button aria-pressed={comparisonMetric === 'r2'} onClick={() => setComparisonMetric('r2')}>R²</button>
              </div></div>
              <div className="model-table-wrap"><table className="model-table"><thead><tr><th>Model</th><th>Used for</th><th>Measured result</th><th>Strength</th></tr></thead><tbody>
                {MODEL_COMPARISON.map((item) => <tr key={item.model} className={`${item.tone === 'best' ? 'winning-model' : ''} ${activeModel === item.model ? 'selected-model' : ''}`}>
                  <td><button className="model-pick" aria-pressed={activeModel === item.model} onClick={() => setActiveModel(item.model)}>{item.model}{item.tone === 'best' && <small>Best overall for delay</small>}</button></td><td>{item.role}</td><td>{item.metric}</td><td><span className={`model-status ${item.tone}`}>{item.status}</span></td>
                </tr>)}
              </tbody></table></div>
              <div className="model-bars" aria-label={`Interactive ${comparisonMetric === 'rmse' ? 'RMSE' : 'R squared'} comparison`}>
                {MODEL_COMPARISON.filter((item) => item[comparisonMetric] != null).map((item) => { const value = item[comparisonMetric]; const width = comparisonMetric === 'rmse' ? value / modelMetricMaximum * 100 : value * 100; return <button key={item.model} className={`model-bar-row ${activeModel === item.model ? 'selected' : ''}`} onClick={() => setActiveModel(item.model)} aria-pressed={activeModel === item.model}>
                  <span>{item.model}</span><span className="model-bar-track"><span className={`model-bar ${item.tone}`} style={{ width: `${width}%` }} /></span><b>{comparisonMetric === 'rmse' ? `${number(value, 3)} min` : number(value, 4)}</b>
                </button>; })}
              </div>
              <div className="model-spotlight" role="status"><span aria-hidden="true">⌁</span><div><b>{activeModelResult.model} explained</b><p>{activeModelResult.explanation}</p>{activeModelResult.rmse != null ? <p className="spotlight-metric">Held-out result: RMSE {number(activeModelResult.rmse, 3)} minutes and R² {number(activeModelResult.r2, 4)}.</p> : <p className="spotlight-metric">Clustering quality: silhouette {number(activeModelResult.silhouette, 3)} and Davies-Bouldin index {number(activeModelResult.dbIndex, 3)}.</p>}</div></div>
              <div className="model-winner"><span aria-hidden="true">★</span><div><b>Final result: Linear Regression is the best model for delay analysis in this project.</b><p>It achieved the lowest error (RMSE 3.424 minutes) and highest R² (0.9605). K-Means, KNN and the Decision Tree remain essential because they group traffic, find similar records and explain the result.</p></div></div>
              <p className="footnote">This conclusion applies to the project’s simulated dataset. It does not claim that one model is always best for every city or traffic dataset.</p>
            </section>
          </div>}
        </div>
      </div>
      <section className="presentation panel" id="explain"><p className="eyebrow">YOUR 30-SECOND DEMO</p><h2>“What happens if roadworks block one lane here?”</h2><div className="demo-steps"><p><b>1. Choose the road.</b> Jump to Nagpur, find nearby roads, and inspect the map source. Verify the lane count.</p><p><b>2. Test the situation.</b> Enter vehicles, speed and rain. Block one lane and compare with all lanes open. Reopen it to reset.</p><p><b>3. Explain the evidence.</b> The geography is real; the inputs are manual. KNN finds simulated examples, K-Means groups them, and regression and tree rules explain the pattern.</p></div></section>
      <footer>OpenStreetMap geography · 2,400 simulated traffic observations · No live congestion, route optimisation or journey-time forecast</footer>
    </main>
  </div>;
}

export default App;
