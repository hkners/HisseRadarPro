// File downloads from POST endpoints (Excel exports).
const API = import.meta.env.VITE_API_URL || '/api';

export async function postDownload(path, body, filename) {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    let detail = `HTTP ${r.status}`;
    try { detail = (await r.json()).detail || detail; } catch { /* binary or empty body */ }
    throw new Error(detail);
  }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Generic table export. sheets: [{ name, columns: [{ key, label, format }], rows: [obj] }]
 * format: 'pct' (fraction -> %), 'pct100' (already a percent number), 'num', 'int'.
 * NaN values are sent as null.
 */
export function exportTables(filename, title, sheets) {
  const clean = sheets.map(s => ({
    ...s,
    rows: s.rows.map(r => Object.fromEntries(s.columns.map(c => {
      const v = r[c.key];
      return [c.key, typeof v === 'number' && !Number.isFinite(v) ? null : v ?? null];
    }))),
  }));
  return postDownload('/export/xlsx', { filename, title, sheets: clean }, `${filename}.xlsx`);
}
