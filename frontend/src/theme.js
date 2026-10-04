// Literal palette values for places that cannot read CSS variables
// (canvas-based charts such as lightweight-charts). Keep in sync with :root in index.css.
export const palette = {
  bgDeep: '#000000',
  bgBase: '#0A0A0B',
  bgRaised: '#121214',
  bgElevated: '#18181B',
  gold: '#C8A24A',
  goldSoft: '#E8CD8F',
  goldDeep: '#8A6F2E',
  textPrimary: '#F4F2ED',
  textSecondary: '#C9C7C0',
  textTertiary: '#9A978F',
  positive: '#3F8A6B',
  negative: '#C0524E',
  warning: '#C9883A',
  grid: 'rgba(255, 255, 255, 0.05)',
  border: 'rgba(255, 255, 255, 0.11)',
};

// Categorical series colors for multi-line charts, validated (lightness band, chroma, CVD
// separation, contrast) against the #121214 chart surface. Assign in this order, never cycled;
// a series keeps its color when others are added or removed.
export const seriesPalette = ['#B08A36', '#3987E5', '#D55181', '#9085E9'];

export const fonts = {
  body: "'Jost', 'Inter', system-ui, sans-serif",
  display: "'Chakra Petch', 'Jost', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, Consolas, monospace",
};
