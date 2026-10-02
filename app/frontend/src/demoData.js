// Datos sintéticos deterministas para explorar la UI. No son observaciones de Chicago.
export const CRIME_TYPES = [
  { key: "ALL", label: "Todos los tipos" },
  { key: "THEFT", label: "THEFT" },
  { key: "BATTERY", label: "BATTERY" },
  { key: "CRIMINAL DAMAGE", label: "CRIMINAL DAMAGE" },
  { key: "NARCOTICS", label: "NARCOTICS" },
  { key: "ASSAULT", label: "ASSAULT" },
  { key: "OTHER OFFENSE", label: "OTHER OFFENSE" }
];

const WEEKDAYS = 7;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const round = (n, digits = 1) => Number(n.toFixed(digits));

function schematicPolygon(row, col) {
  const left = 8 + col * 46 + (row % 3) * 1.1;
  const top = 5 + row * 9;
  const width = col ? 42 : 43;
  const height = 8.6;
  const notch = (row % 4) * 0.7;
  return {
    type: "Polygon",
    coordinates: [[
      [left, top], [left + width - notch, top],
      [left + width, top + height * 0.42], [left + width - 1.3, top + height],
      [left + 0.8, top + height], [left, top]
    ]]
  };
}

export function createDemoDashboard(filters) {
  const category = CRIME_TYPES.find((type) => type.key === filters.crimeType) || CRIME_TYPES[0];
  const factor = category.key === "ALL" ? 1 : 0.26;
  const seed = Number(filters.origin.slice(8, 10)) || 1;
  const districts = Array.from({ length: 22 }, (_, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const id = `D${String(index + 1).padStart(2, "0")}`;
    const rhythm = 18 + ((index * 17 + seed * 3) % 29);
    const thp = round((rhythm + 9 * Math.sin(index * 0.8 + seed * 0.2)) * factor);
    const nmf = round((rhythm + 7 * Math.cos(index * 0.72)) * factor);
    const observed = Math.max(0, Math.round((rhythm + 12 * Math.sin(index * 0.55 + 2)) * factor));
    return {
      id, name: `Distrito ${String(index + 1).padStart(2, "0")}`,
      areaKm2: round(6 + (index * 5) % 11),
      geometry: schematicPolygon(row, col), thp, nmf, observed
    };
  });

  const scope = filters.districtId
    ? districts.find((district) => district.id === filters.districtId)
    : null;
  const scale = scope ? Math.max(0.16, scope.thp / 70) : 1;
  // El sufijo Z aquí solo construye intervalos ilustrativos sin depender del huso del navegador.
  const origin = new Date(`${filters.origin}:00Z`);
  const timeline = Array.from({ length: 19 }, (_, index) => {
    const offset = index - 12; // 48 h de historia, 24 h de horizonte: bloques de 4 h.
    const instant = new Date(origin.getTime() + offset * 4 * 60 * 60 * 1000);
    const base = Math.max(2, (24 + 6 * Math.sin(index * 0.77 + seed)) * factor * scale);
    const future = offset > 0;
    const thp = round(base + 2.5 * factor);
    return {
      time: instant.toISOString(), phase: future ? "future" : "history",
      observed: Math.max(0, Math.round(base + 3.8 * Math.cos(index * 1.31))),
      thp: future ? thp : null,
      nmf: future ? round(base + 4.2 * Math.cos(index * 0.48)) : null,
      lower: future ? round(Math.max(0, thp - 4 * factor)) : null,
      upper: future ? round(thp + 5 * factor) : null
    };
  });

  const hourly = Array.from({ length: 24 }, (_, hour) =>
    Math.max(1, Math.round((5 + 3 * Math.sin((hour - 7) * Math.PI / 12) + (hour % 5)) * factor * scale))
  );
  const weekdays = Array.from({ length: WEEKDAYS }, (_, day) =>
    Math.max(1, Math.round((32 + day * 2 + 9 * Math.sin(day * 0.9)) * factor * scale))
  );
  const types = CRIME_TYPES.slice(1).map((type, index) => ({
    ...type,
    count: Math.round((1100 - index * 126 + 36 * Math.sin(seed + index)) * (scope ? scale : 1))
  }));

  return {
    meta: {
      demo: true, generatedAt: new Date().toISOString(),
      territoryLabel: "22 zonas esquemáticas · geometría ilustrativa"
    },
    districts, timeline, hourly, weekdays, types
  };
}
