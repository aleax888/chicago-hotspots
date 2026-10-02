import React, { useEffect, useMemo, useState } from "react";
import { API_ENABLED, getDashboard } from "./api.js";
import { CRIME_TYPES, createDemoDashboard } from "./demoData.js";

const DEFAULT_FILTERS = {
  crimeType: "THEFT",
  origin: "2026-09-01T12:00",
  horizonHours: 24,
  topK: 3,
  districtId: ""
};
const number = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 1 });
const percent = (value) => value == null ? "—" : `${number.format(value * 100)} %`;
const fmt = (value) => value == null ? "—" : number.format(value);
const safe = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function ranked(districts, field) {
  return [...districts].sort((a, b) => safe(b[field]) - safe(a[field]) || a.id.localeCompare(b.id));
}

function spatialMetrics(districts, field, k) {
  if (!districts.length || districts.some((item) => item.observed == null)) return null;
  const totalEvents = districts.reduce((sum, item) => sum + safe(item.observed), 0);
  if (totalEvents === 0) return null;
  const top = ranked(districts, field).slice(0, k);
  const observedTop = new Set(ranked(districts, "observed").slice(0, k).map((item) => item.id));
  const matches = top.filter((item) => observedTop.has(item.id)).length;
  const totalArea = districts.reduce((sum, item) => sum + safe(item.areaKm2), 0);
  const topArea = top.reduce((sum, item) => sum + safe(item.areaKm2), 0);
  const hitRate = top.reduce((sum, item) => sum + safe(item.observed), 0) / totalEvents;
  return {
    precision: matches / k,
    hitRate,
    pai: topArea > 0 && totalArea > 0 ? hitRate / (topArea / totalArea) : null
  };
}

function polygonRings(geometry) {
  if (geometry?.type === "Polygon") return geometry.coordinates?.slice(0, 1) || [];
  if (geometry?.type === "MultiPolygon") return geometry.coordinates?.map((part) => part[0]) || [];
  return [];
}

function mapShapes(districts) {
  const points = districts.flatMap((district) => polygonRings(district.geometry).flat());
  if (!points.length) return [];
  const xs = points.map(([x]) => Number(x));
  const ys = points.map(([, y]) => Number(y));
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = 520, height = 400, margin = 18;
  const scale = Math.min((width - 2 * margin) / Math.max(1, maxX - minX),
    (height - 2 * margin) / Math.max(1, maxY - minY));
  const xOffset = (width - (maxX - minX) * scale) / 2;
  const yOffset = (height - (maxY - minY) * scale) / 2;
  const project = ([x, y]) => [xOffset + (Number(x) - minX) * scale,
    height - yOffset - (Number(y) - minY) * scale];

  return districts.map((district) => {
    const rings = polygonRings(district.geometry);
    const d = rings.map((ring) => ring.map((point, index) => {
      const [x, y] = project(point);
      return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ") + " Z").join(" ");
    const vertices = rings[0] || [];
    const center = vertices.length ? project([
      vertices.reduce((sum, point) => sum + Number(point[0]), 0) / vertices.length,
      vertices.reduce((sum, point) => sum + Number(point[1]), 0) / vertices.length
    ]) : [0, 0];
    return { ...district, d, center };
  });
}

function heatColor(value, min, max) {
  const t = Math.max(0, Math.min(1, (safe(value) - min) / Math.max(1, max - min)));
  const from = [252, 242, 217], to = [174, 75, 47];
  return `rgb(${from.map((v, i) => Math.round(v + (to[i] - v) * t)).join(",")})`;
}

function SectionTitle({ code, title, tasks, suffix }) {
  return <div className="section-heading">
    <div><span className="view-code">{code}</span><h2>{title}</h2></div>
    <div className="section-meta"><span>{tasks}</span>{suffix}</div>
  </div>;
}

function MapPanel({ districts, field, onFieldChange, topK, selectedId, onSelect, demo }) {
  const shapes = useMemo(() => mapShapes(districts), [districts]);
  const ordered = ranked(districts, field);
  const topIds = new Set(ordered.slice(0, topK).map((item) => item.id));
  const values = districts.map((item) => safe(item[field]));
  const min = Math.min(...values, 0), max = Math.max(...values, 1);
  const [hoverId, setHoverId] = useState("");
  const focus = districts.find((item) => item.id === (hoverId || selectedId));

  return <section className="panel map-panel" aria-label="Mapa de hotspots">
    <SectionTitle code="01" title="Mapa de distritos" tasks="T1 · T2" />
    <div className="panel-tools">
      <div className="segmented" role="group" aria-label="Valor mostrado en el mapa">
        <button className={field === "thp" ? "active" : ""} onClick={() => onFieldChange("thp")}>THP</button>
        <button className={field === "nmf" ? "active" : ""} onClick={() => onFieldChange("nmf")}>NMF</button>
      </div>
      <span className="muted">Incidentes esperados · próximas 24 h</span>
    </div>
    <div className="map-stage">
      {shapes.length ? <svg viewBox="0 0 520 400" role="img" aria-label={demo ? "Mapa esquemático de 22 zonas ilustrativas" : "Mapa de distritos"}>
        {shapes.map((shape) => <g key={shape.id}>
          <path
            d={shape.d} fill={heatColor(shape[field], min, max)}
            className={["district-shape", topIds.has(shape.id) ? "is-hot" : "", selectedId === shape.id ? "is-selected" : ""].join(" ")}
            tabIndex="0" role="button" aria-label={`${shape.name}: ${fmt(shape[field])} incidentes esperados`}
            onMouseEnter={() => setHoverId(shape.id)} onMouseLeave={() => setHoverId("")}
            onFocus={() => setHoverId(shape.id)} onBlur={() => setHoverId("")}
            onClick={() => onSelect(shape.id)}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(shape.id); } }}
          />
          <text x={shape.center[0]} y={shape.center[1]} className="district-label" aria-hidden="true">{shape.id.replace("D", "")}</text>
        </g>)}
      </svg> : <p className="empty-map">El backend aún no ha enviado geometrías GeoJSON.</p>}
      <div className="map-overlay">
        <strong>{focus?.name || "Selecciona un distrito"}</strong>
        <span>{focus ? `${fmt(focus[field])} eventos esperados · ${field.toUpperCase()}` : "El contorno señala el top K"}</span>
      </div>
    </div>
    <div className="map-footer">
      <span>Menor intensidad</span><span className="gradient-bar" aria-hidden="true" /><span>Mayor intensidad</span>
      <span className="footer-note">{demo ? "Geometría ilustrativa" : "Polígonos del backend"}</span>
    </div>
  </section>;
}

function HotspotCard({ title, label, districts, field, topK, selectedId, onSelect, hidden }) {
  const items = ranked(districts, field).slice(0, topK);
  const max = Math.max(1, ...items.map((item) => safe(item[field])));
  return <div className={`hotspot-card ${hidden ? "is-hidden" : ""}`}>
    <div className="hotspot-card-head"><span className={`model-dot ${field}`} /><div><strong>{title}</strong><small>{label}</small></div></div>
    {hidden ? <div className="hidden-outcome">Activa “Evaluación” para revelar los eventos posteriores al origen.</div> :
      <ol className="rank-list">
        {items.map((item, index) => <li key={item.id}>
          <button onClick={() => onSelect(item.id)} className={selectedId === item.id ? "selected-rank" : ""}>
            <span className="rank-number">{String(index + 1).padStart(2, "0")}</span>
            <span className="rank-content"><span>{item.name}</span><i style={{ width: `${Math.max(4, safe(item[field]) / max * 100)}%` }} /></span>
            <b>{fmt(item[field])}</b>
          </button>
        </li>)}
      </ol>}
  </div>;
}

function HotspotsPanel({ data, topK, selectedId, onSelect, showObserved, onToggleObserved }) {
  const hasObserved = data.districts.some((item) => item.observed != null);
  const thp = spatialMetrics(data.districts, "thp", topK);
  const nmf = spatialMetrics(data.districts, "nmf", topK);
  return <section className="panel hotspots-panel">
    <SectionTitle code="02" title="Hotspots y contraste" tasks="T1 · T3" />
    <div className="compare-controls">
      <span>Top {topK} distritos · horizonte 24 h</span>
      <label className="check"><input type="checkbox" checked={showObserved} disabled={!hasObserved} onChange={(event) => onToggleObserved(event.target.checked)} /> Evaluación</label>
    </div>
    <div className="hotspot-grid">
      <HotspotCard title="THP" label="Predicción por eventos" districts={data.districts} field="thp" topK={topK} selectedId={selectedId} onSelect={onSelect} />
      <HotspotCard title="NMF" label="Referencia temporal" districts={data.districts} field="nmf" topK={topK} selectedId={selectedId} onSelect={onSelect} />
      <HotspotCard title="Observado" label="Solo prueba retrospectiva" districts={data.districts} field="observed" topK={topK} selectedId={selectedId} onSelect={onSelect} hidden={!showObserved || !hasObserved} />
    </div>
    <div className="metrics-strip" aria-label="Comparación espacial">
      <div><span>Precision@{topK}</span><b>{showObserved ? `${percent(thp?.precision)} / ${percent(nmf?.precision)}` : "—"}</b><small>THP / NMF</small></div>
      <div><span>PAI</span><b>{showObserved ? `${fmt(thp?.pai)} / ${fmt(nmf?.pai)}` : "—"}</b><small>THP / NMF · área real</small></div>
    </div>
  </section>;
}

function chartPath(points, key, predicate, x, y) {
  let path = "", drawing = false;
  points.forEach((point, index) => {
    const value = point[key];
    if (!predicate(point, index) || value == null) { drawing = false; return; }
    path += `${drawing ? " L" : "M"}${x(index).toFixed(1)},${y(safe(value)).toFixed(1)}`;
    drawing = true;
  });
  return path;
}

function TemporalChart({ points, showObserved, range, onRangeChange }) {
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const width = 800, height = 215, left = 36, right = 14, top = 16, bottom = 31;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const visible = points.flatMap((point) => [
    point.phase === "history" || showObserved ? point.observed : null,
    point.thp, point.nmf, point.upper
  ]).filter((value) => value != null).map(safe);
  const max = Math.max(5, Math.ceil(Math.max(...visible, 0) / 5) * 5);
  const x = (index) => left + index * plotWidth / Math.max(1, points.length - 1);
  const y = (value) => top + (max - value) / max * plotHeight;
  const boundary = points.findIndex((point) => point.phase === "future");
  const selection = dragStart == null ? range : [Math.min(dragStart, dragEnd ?? dragStart), Math.max(dragStart, dragEnd ?? dragStart)];
  const toIndex = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relative = (event.clientX - rect.left) / Math.max(1, rect.width);
    return Math.max(0, Math.min(points.length - 1, Math.round(relative * (points.length - 1))));
  };
  const endDrag = (event) => {
    if (dragStart == null) return;
    const end = toIndex(event);
    onRangeChange([Math.min(dragStart, end), Math.max(dragStart, end)]);
    setDragStart(null);
    setDragEnd(null);
  };
  const history = (point) => point.phase === "history";
  const future = (point, index) => point.phase === "future" || index === boundary - 1;
  const lineObserved = chartPath(points, "observed", history, x, y);
  const lineFutureObserved = chartPath(points, "observed", future, x, y);
  const lineTHP = chartPath(points, "thp", (point) => point.phase === "future", x, y);
  const lineNMF = chartPath(points, "nmf", (point) => point.phase === "future", x, y);
  const futurePoints = points.map((point, index) => ({ ...point, index })).filter((point) => point.phase === "future" && point.lower != null && point.upper != null);
  const band = futurePoints.length ? `M${futurePoints.map((point) => `${x(point.index)},${y(point.upper)}`).join(" L")} L${[...futurePoints].reverse().map((point) => `${x(point.index)},${y(point.lower)}`).join(" L")} Z` : "";

  return <div className="temporal-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Serie temporal, historial a la izquierda y pronóstico a la derecha; arrastra para seleccionar un tramo">
      {[0, 0.5, 1].map((part) => <g key={part}>
        <line x1={left} x2={width - right} y1={y(max * part)} y2={y(max * part)} className="grid-line" />
        <text x={left - 8} y={y(max * part) + 4} textAnchor="end" className="axis-label">{fmt(max * part)}</text>
      </g>)}
      {boundary > 0 && <>
        <rect x={x(boundary) - 10} y={top} width={width - right - x(boundary) + 10} height={plotHeight} className="future-backdrop" />
        <line x1={x(boundary) - 10} x2={x(boundary) - 10} y1={top} y2={height - bottom} className="boundary-line" />
        <text x={x(boundary) + 2} y={top + 12} className="boundary-label">FUTURO · 24 H</text>
      </>}
      {selection && <rect x={x(selection[0])} y={top} width={Math.max(2, x(selection[1]) - x(selection[0]))} height={plotHeight} className="brush-shade" />}
      {band && <path d={band} className="uncertainty-band" />}
      <path d={lineObserved} className="chart-line observed-line" />
      {showObserved && <path d={lineFutureObserved} className="chart-line future-observed-line" />}
      <path d={lineTHP} className="chart-line thp-line" />
      <path d={lineNMF} className="chart-line nmf-line" />
      {points.map((point, index) => index % 3 === 0 || index === points.length - 1 ? <text key={point.time + index} x={x(index)} y={height - 7} textAnchor="middle" className="axis-label">{point.time.slice(11, 16)}</text> : null)}
      <rect x={left} y={top} width={plotWidth} height={plotHeight} fill="transparent" className="brush-target"
        onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const index = toIndex(event); setDragStart(index); setDragEnd(index); }}
        onPointerMove={(event) => { if (dragStart != null) setDragEnd(toIndex(event)); }}
        onPointerUp={endDrag} onPointerCancel={() => { setDragStart(null); setDragEnd(null); }} />
    </svg>
    <div className="chart-key"><span><i className="key-observed" />Observado (historial)</span><span><i className="key-thp" />THP</span><span><i className="key-nmf" />NMF</span>{showObserved && <span><i className="key-future" />Observado (prueba)</span>}</div>
    <div className="brush-hint">Arrastra para resaltar un tramo. {range ? `Selección: ${points[range[0]]?.time.slice(5, 16).replace("T", " ")} – ${points[range[1]]?.time.slice(5, 16).replace("T", " ")}` : "La línea vertical separa entrada y pronóstico."}</div>
  </div>;
}

function TemporalPanel({ data, selectedId, showObserved }) {
  const [range, setRange] = useState(null);
  useEffect(() => setRange(null), [data.timeline]);
  const label = data.districts.find((item) => item.id === selectedId)?.name || "Toda la ciudad";
  return <section className="panel timeline-panel">
    <SectionTitle code="03" title="Evolución temporal" tasks="T2 · T3" suffix={<span>{label}</span>} />
    <p className="panel-description">Historial disponible hasta el origen y pronóstico posterior. La banda sombreada indica dispersión del THP.</p>
    <TemporalChart points={data.timeline || []} showObserved={showObserved} range={range} onRangeChange={setRange} />
  </section>;
}

function ProfilePanel({ data, selectedId }) {
  const [mode, setMode] = useState("hourly");
  const values = mode === "hourly" ? data.hourly || [] : data.weekdays || [];
  const labels = mode === "hourly" ? values.map((_, index) => `${index} h`) : ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const max = Math.max(1, ...values.map(safe));
  const district = data.districts.find((item) => item.id === selectedId);
  return <section className="panel profile-panel">
    <SectionTitle code="04" title="Perfil acumulado" tasks="T2" />
    <div className="panel-tools"><span className="muted">{district?.name || "Toda la ciudad"} · historial</span>
      <div className="segmented compact"><button className={mode === "hourly" ? "active" : ""} onClick={() => setMode("hourly")}>Hora</button><button className={mode === "weekdays" ? "active" : ""} onClick={() => setMode("weekdays")}>Día</button></div>
    </div>
    <div className={`bar-profile ${mode === "weekdays" ? "seven-bars" : ""}`} role="img" aria-label={`Conteos históricos agregados por ${mode === "hourly" ? "hora" : "día de semana"}`}>
      {values.map((value, index) => <div className="bar-column" key={`${mode}-${index}`} title={`${labels[index]}: ${fmt(value)}`}>
        <div className="bar-well"><span style={{ height: `${Math.max(4, safe(value) / max * 100)}%` }} /></div>
        {(mode === "weekdays" || index % 4 === 0) && <small>{mode === "hourly" ? index : labels[index]}</small>}
      </div>)}
    </div>
  </section>;
}

function TypesPanel({ data, selectedCrime, onSelectCrime }) {
  const sorted = [...(data.types || [])].sort((a, b) => safe(b.count) - safe(a.count));
  const max = Math.max(1, ...sorted.map((item) => safe(item.count)));
  return <section className="panel types-panel">
    <SectionTitle code="05" title="Ranking de tipos" tasks="T1 · T2" />
    <p className="panel-description">Composición histórica del dominio mostrado. Selecciona un tipo para recalcular las vistas.</p>
    <div className="type-list">{sorted.map((item) => <button key={item.key} className={`type-row ${selectedCrime === item.key ? "is-active" : ""}`} onClick={() => onSelectCrime(item.key)}>
      <span>{item.label}</span><span className="type-bar-track"><i style={{ width: `${safe(item.count) / max * 100}%` }} /></span><b>{fmt(item.count)}</b>
    </button>)}</div>
  </section>;
}

const VIEW_TABLE = [
  ["Mapa distrital", "T1 · T2", "Distrito, intensidad THP/NMF, top K", "Cambiar modelo; seleccionar distrito; foco y detalle"],
  ["Hotspots y contraste", "T1 · T3", "Ranking, conteos esperados, observado y PAI", "Variar K; abrir evaluación; comparar zonas"],
  ["Evolución temporal", "T2 · T3", "Tiempo, historia, pronóstico e intervalo", "Brushing; seleccionar distrito en el mapa"],
  ["Perfil acumulado", "T2", "Hora y día de la semana, frecuencia", "Alternar hora/día; filtrar distrito y delito"],
  ["Ranking de tipos", "T1 · T2", "Tipo de delito y frecuencia histórica", "Seleccionar delito y recalcular"],
];

function ViewTaskTable() {
  return <details className="view-guide">
    <summary>Diseño visual · relación entre vistas y tareas</summary>
    <div className="table-scroll"><table><thead><tr><th>Vista</th><th>Tareas</th><th>Variables</th><th>Interacción</th></tr></thead>
      <tbody>{VIEW_TABLE.map(([view, tasks, variables, interaction]) => <tr key={view}><th>{view}</th><td>{tasks}</td><td>{variables}</td><td>{interaction}</td></tr>)}</tbody>
    </table></div>
    <p><b>T1</b> localizar hotspots futuros · <b>T2</b> explorar contexto temporal · <b>T3</b> contrastar predicción y observación.</p>
  </details>;
}

export default function App() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [data, setData] = useState(() => API_ENABLED ? null : createDemoDashboard(DEFAULT_FILTERS));
  const [field, setField] = useState("thp");
  const [showObserved, setShowObserved] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const update = (patch) => setFilters((current) => ({ ...current, ...patch }));

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const next = await getDashboard(filters, { signal: controller.signal });
        if (!controller.signal.aborted) { setData(next); setError(""); }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause.message || "No se pudo cargar el panel");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, API_ENABLED ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [filters, refreshCount]);

  useEffect(() => {
    if (!API_ENABLED || !autoRefresh) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setRefreshCount((count) => count + 1);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh]);

  const selectDistrict = (id) => update({ districtId: filters.districtId === id ? "" : id });
  const districts = data?.districts || [];
  const topK = Math.max(1, Math.min(filters.topK, districts.length || filters.topK));
  const hasObserved = districts.some((item) => item.observed != null);
  const total = districts.reduce((sum, item) => sum + safe(item[field]), 0);
  const selectedName = districts.find((item) => item.id === filters.districtId)?.name;

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-mark">CH</div>
      <div className="brand-copy"><strong>Chicago / Hotspots</strong><small>Análisis visual · propuesta THP</small></div>
      <div className="topbar-right"><span className={`status-pill ${API_ENABLED ? "live" : "demo"}`}><span />{API_ENABLED ? loading ? "Actualizando" : error ? "Sin conexión" : "Backend conectado" : "Demostración"}</span><span className="topbar-note">Horizonte: 24 h</span></div>
    </header>

    <div className="workspace">
      <aside className="sidebar" aria-label="Menú de control y filtros">
        <div className="sidebar-title"><span>CONTROLES</span><span className="sidebar-accent">01 / 05</span></div>
        <div className="filter-group"><label htmlFor="crime-type">Tipo de delito</label><select id="crime-type" value={filters.crimeType} onChange={(event) => update({ crimeType: event.target.value })}>{CRIME_TYPES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></div>
        <div className="filter-group"><label htmlFor="origin">Origen del pronóstico</label><input id="origin" type="datetime-local" value={filters.origin} onChange={(event) => update({ origin: event.target.value })} /><small>Hora local de Chicago · historia hasta este instante</small></div>
        <div className="filter-group"><div className="filter-heading"><label htmlFor="top-k">Distritos prioritarios</label><strong>K = {topK}</strong></div><input id="top-k" type="range" min="1" max={Math.min(8, districts.length || 8)} value={topK} onChange={(event) => update({ topK: Number(event.target.value) })} /><div className="range-ends"><span>1</span><span>{Math.min(8, districts.length || 8)}</span></div></div>
        <div className="filter-group"><label>Distrito seleccionado</label><div className="selected-filter"><span>{selectedName || "Toda la ciudad"}</span>{selectedName && <button aria-label="Quitar selección de distrito" onClick={() => update({ districtId: "" })}>×</button>}</div><small>Haz clic en una zona del mapa o del ranking.</small></div>
        <div className="filter-group scope-note"><span>UNIDAD DE ANÁLISIS</span><strong>Distrito policial</strong><small>{data?.meta?.territoryLabel || "Geometría enviada por el backend"}</small></div>
        <div className="sidebar-actions"><button className="refresh-button" onClick={() => setRefreshCount((count) => count + 1)}>↻ &nbsp; Actualizar vistas</button>{API_ENABLED && <label className="check auto-check"><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} /> Actualizar cada 30 s</label>}</div>
        <div className="sidebar-bottom"><span className="warning-dot" />{API_ENABLED ? "Predicciones según respuesta del servidor." : "Datos y geometrías ilustrativos. No son resultados del modelo."}</div>
      </aside>

      <main className="dashboard">
        <div className="dashboard-intro"><div><span className="eyebrow">PANEL DE EXPLORACIÓN</span><h1>Predicción de concentración delictiva</h1><p>Incidentes esperados por distrito después de <b>{filters.origin.replace("T", " · ")}</b>, hora de Chicago.</p></div><div className="intro-stat"><strong>{fmt(total)}</strong><span>eventos esperados · {field.toUpperCase()}</span></div></div>
        {data?.meta?.demo && <div className="demo-banner" role="status"><b>Vista de demostración.</b> Los valores, distritos esquemáticos y métricas son sintéticos. Define <code>VITE_API_BASE_URL</code> para consultar FastAPI.</div>}
        {error && <div className="error-banner" role="alert">{error}. Se conserva la última vista cargada. <button onClick={() => setRefreshCount((count) => count + 1)}>Reintentar</button></div>}
        {data ? <>
          <div className="primary-grid">
            <MapPanel districts={districts} field={field} onFieldChange={setField} topK={topK} selectedId={filters.districtId} onSelect={selectDistrict} demo={Boolean(data.meta?.demo)} />
            <HotspotsPanel data={data} topK={topK} selectedId={filters.districtId} onSelect={selectDistrict} showObserved={showObserved && hasObserved} onToggleObserved={setShowObserved} />
          </div>
          <div className="secondary-grid">
            <TemporalPanel data={data} selectedId={filters.districtId} showObserved={showObserved && hasObserved} />
            <ProfilePanel data={data} selectedId={filters.districtId} />
            <TypesPanel data={data} selectedCrime={filters.crimeType} onSelectCrime={(crimeType) => update({ crimeType })} />
          </div>
          <ViewTaskTable />
        </> : <div className="loading-panel" role="status">Conectando con el backend…</div>}
        <footer className="app-footer">Bosquejo de interfaz · T1: localizar · T2: explorar · T3: contrastar <span>Última carga: {data?.meta?.generatedAt ? new Date(data.meta.generatedAt).toLocaleTimeString("es-PE") : "—"}</span></footer>
      </main>
    </div>
  </div>;
}
