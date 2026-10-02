import { createDemoDashboard } from "./demoData.js";

// Sin VITE_API_BASE_URL se muestran datos ilustrativos, siempre etiquetados.
// Con VITE_API_BASE_URL=https://servidor.example, la UI consulta FastAPI.
export const API_ENABLED = Boolean(import.meta.env.VITE_API_BASE_URL?.trim());
const BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

/**
 * GET /api/v1/dashboard?origin_local=...&crime_type=...&horizon_hours=24&top_k=3&district_id=...
 * origin_local es hora de pared de America/Chicago, no hora del navegador.
 * district_id acota los perfiles temporales, pero districts conserva todo el mapa.
 *
 * Respuesta:
 * {
 *   meta: { demo: false, generatedAt: ISO8601, territoryLabel: string },
 *   districts: [{ id, name, areaKm2, geometry: GeoJSON Polygon | MultiPolygon,
 *                 thp: number, nmf: number, observed: number | null }],
 *   timeline: [{ time: ISO8601, phase: "history" | "future",
 *                observed: number | null, thp: number | null, nmf: number | null,
 *                lower: number | null, upper: number | null }],
 *   hourly: [24 números], weekdays: [7 números],
 *   types: [{ key, label, count }]
 * }
 * Las cantidades thp/nmf son incidentes esperados en el horizonte, no probabilidades.
 * observed es exclusivamente para evaluación retrospectiva; puede ser null en producción.
 */
export async function getDashboard(filters, { signal } = {}) {
  if (!API_ENABLED) {
    if (signal?.aborted) throw new DOMException("Cancelado", "AbortError");
    return createDemoDashboard(filters);
  }

  const url = new URL(`${BASE_URL}/api/v1/dashboard`, window.location.origin);
  url.searchParams.set("origin_local", filters.origin);
  url.searchParams.set("crime_type", filters.crimeType);
  url.searchParams.set("horizon_hours", String(filters.horizonHours));
  url.searchParams.set("top_k", String(filters.topK));
  if (filters.districtId) url.searchParams.set("district_id", filters.districtId);

  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Error ${response.status} al consultar el backend`);
  const payload = await response.json();
  if (!Array.isArray(payload.districts) || !Array.isArray(payload.timeline)) {
    throw new Error("La respuesta no contiene districts y timeline válidos");
  }
  return payload;
}
