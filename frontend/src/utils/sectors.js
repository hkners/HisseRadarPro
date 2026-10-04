// yfinance sector names → Turkish display names. Unknown names pass through unchanged.
const SECTOR_TR = {
  'Industrials': 'Sanayi',
  'Consumer Cyclical': 'Döngüsel Tüketim',
  'Financial Services': 'Finansal Hizmetler',
  'Basic Materials': 'Temel Malzeme',
  'Consumer Defensive': 'Temel Tüketim',
  'Real Estate': 'Gayrimenkul',
  'Technology': 'Teknoloji',
  'Utilities': 'Enerji Dağıtım & Kamu Hizmetleri',
  'Healthcare': 'Sağlık',
  'Communication Services': 'İletişim Hizmetleri',
  'Energy': 'Enerji',
  'Diğer': 'Diğer',
};

export const trSector = (s) => (s ? SECTOR_TR[s] || s : '—');
