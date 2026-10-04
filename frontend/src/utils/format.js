// Shared number formatting (tr-TR) for tables and cards.

export const fmtNum = (v, digits = 2) =>
  v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Turkish convention: sign, then %, then the number with a decimal comma — "+%12,5", "-%3,0". */
export const fmtPct = (v, digits = 1, { sign = true } = {}) => {
  if (v == null || !Number.isFinite(v)) return '—';
  const body = Math.abs(v).toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const s = v < 0 ? '-' : sign && v > 0 ? '+' : '';
  return `${s}%${body}`;
};

/** 374_399_991_808 → "374,4 Mr" ; 13_224_752 → "13,2 Mn" */
export function fmtTL(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} Tn`;
  if (abs >= 1e9) return `${(v / 1e9).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mr`;
  if (abs >= 1e6) return `${(v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn`;
  return v.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
}

export const signClass = (v) => (v == null ? '' : v > 0 ? 'text-up' : v < 0 ? 'text-down' : '');

/** Outlined, tinted chip colors derived from one accent (hex or CSS var) — replaces solid badges. */
export const tintStyle = (c) => ({
  background: `color-mix(in srgb, ${c} 16%, transparent)`,
  color: c,
  border: `1px solid color-mix(in srgb, ${c} 50%, transparent)`,
});
