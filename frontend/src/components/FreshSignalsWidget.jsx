import React from 'react';
import { Link } from 'react-router-dom';
import { useTaData, ScoreBar, VERDICT } from './ta/common';

// Stocks with a fresh signal whose BIST record is positive (MACD/SMA crosses showed no edge and are left out),
// ranked by the technical score.
const POSITIVE = new Set(['guclu_pozitif', 'pozitif']);

export default function FreshSignalsWidget() {
  const { data, error, building } = useTaData('/ta/screener');
  let rows = [];
  if (data) {
    const fresh = Object.entries(data.signals).filter(([, s]) => s.kind === 'event' && POSITIVE.has(s.verdict)).map(([k]) => k);
    const states = Object.entries(data.signals).filter(([, s]) => s.kind === 'state' && POSITIVE.has(s.verdict)).map(([k]) => k);
    rows = data.rows
      .map(r => ({ ...r, hit: r.signals.filter(s => fresh.includes(s)), strong: r.signals.filter(s => states.includes(s)) }))
      .filter(r => r.hit.length && r.score >= 60 && r.stage !== 4)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }
  return (
    <div className="panel panel-flex" style={{ height: '100%', minHeight: '250px', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', fontSize: '11px' }}>
        <span>Taze teknik sinyaller</span>
        <Link to="/technical-screener" className="ticker-link text-neutral" style={{ fontSize: '10px' }}>Teknik Radar</Link>
      </div>
      <div className="panel-content panel-scrollable">
        {error && <div className="text-muted" style={{ padding: 16 }}>Sinyaller yüklenemedi.</div>}
        {!data && !error && <div className="text-muted" style={{ textAlign: 'center', padding: 20 }}>{building ? 'Teknik model hazırlanıyor…' : 'Yükleniyor…'}</div>}
        {data && (
          <table className="data-table compact">
            <thead><tr><th style={{ textAlign: 'left' }}>Hisse</th><th>Skor</th><th style={{ textAlign: 'left' }}>Sinyal</th></tr></thead>
            <tbody>
              {rows.map(r => {
                const s = data.signals[r.hit[0]];
                return (
                  <tr key={r.ticker} className="row-hoverable">
                    <td style={{ textAlign: 'left' }}><Link to={`/hisse/${r.ticker}?tab=teknik`} className="ticker-link">{r.ticker}</Link></td>
                    <td><ScoreBar score={r.score} width={36} /></td>
                    <td style={{ textAlign: 'left', fontSize: 11 }} title={`${s.label}: ${VERDICT[s.verdict]?.label} kanıt`}>
                      <span className="text-up">{s.label}</span>
                      {r.hit.length > 1 && <span className="text-muted"> +{r.hit.length - 1}</span>}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan="3" className="text-muted" style={{ textAlign: 'center', padding: 14 }}>Son seanslarda olumlu kanıtlı yeni sinyal yok.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
