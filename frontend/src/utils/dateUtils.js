export function parseDateStr(dateStr) {
  if (!dateStr) return 0;
  // Handle DD.MM.YYYY
  if (dateStr.includes('.')) {
    const parts = dateStr.split('.');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      return new Date(year, month, day).getTime();
    }
  }
  // Handle YYYY-MM-DD
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return new Date(year, month, day).getTime();
    }
  }
  
  // Fallback to JS Date parse
  const parsed = Date.parse(dateStr);
  return isNaN(parsed) ? 0 : parsed;
}

export function sortReportsByDateDesc(data, dateField = 'tarih') {
  return [...data].sort((a, b) => {
    const timeA = parseDateStr(a[dateField] || a.tarih || a.report_date);
    const timeB = parseDateStr(b[dateField] || b.tarih || b.report_date);
    return timeB - timeA;
  });
}
