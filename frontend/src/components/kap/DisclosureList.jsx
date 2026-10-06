// KAP disclosures as a compact list; a row opens the disclosure text (fetched from KAP on demand) and,
// on request, a short AI summary.
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, ExternalLink, Sparkles } from 'lucide-react';
import { Button, Chip } from '../ui';

const API = import.meta.env.VITE_API_URL || '/api';
const IMPORTANT = new Set(['buyback', 'insider', 'new_contract', 'dividend', 'capital', 'merger', 'tender', 'asset_buy', 'asset_sell', 'spk_ban', 'measure', 'index_change']);

const fmtTs = (ts) => (ts ? `${ts.slice(8, 10)}.${ts.slice(5, 7)}.${ts.slice(0, 4)} ${ts.slice(11, 16)}` : '');
const tickersOf = (d) => [...new Set(`${d.stock_codes || ''},${d.category && ['circuit_breaker', 'spk_ban', 'measure', 'index_change'].includes(d.category) ? d.related_stocks || '' : ''}`
  .split(',').map(s => s.trim().split('.')[0]).filter(Boolean))].slice(0, 6);

function Detail({ idx }) {
  const [state, setState] = useState({ loading: true });
  React.useEffect(() => {
    fetch(`${API}/kap/disclosure/${idx}`).then(r => r.json()).then(d => setState({ text: d.text, url: d.url })).catch(() => setState({ error: true }));
  }, [idx]);
  const summarize = () => {
    setState(s => ({ ...s, summarizing: true }));
    fetch(`${API}/kap/disclosure/${idx}?summarize=true`).then(r => r.json())
      .then(d => setState(s => ({ ...s, summary: d.summary || 'Özet oluşturulamadı.', summarizing: false })))
      .catch(() => setState(s => ({ ...s, summarizing: false, summary: 'Özet oluşturulamadı.' })));
  };
  if (state.loading) return <div className="text-muted" style={{ fontSize: 12 }}>Bildirim metni KAP'tan alınıyor…</div>;
  if (state.error) return <div className="text-muted" style={{ fontSize: 12 }}>Metin alınamadı.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {state.summary && <div className="notice" style={{ fontSize: 12.5 }}>{state.summary}</div>}
      <div className="text-secondary" style={{ fontSize: 12, lineHeight: 1.6, maxHeight: 220, overflowY: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-body)' }}>
        {state.text || 'Metin yok (ek dosyada olabilir).'}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {state.text && !state.summary && <Button size="sm" onClick={summarize} disabled={state.summarizing}><Sparkles size={12} /> {state.summarizing ? 'Özetleniyor…' : 'Yapay zekâ ile özetle'}</Button>}
        <a className="btn btn-sm btn-ghost" href={state.url} target="_blank" rel="noreferrer"><ExternalLink size={12} /> KAP'ta aç</a>
      </div>
    </div>
  );
}

export default function DisclosureList({ items, showTickers = true, empty = 'Bildirim yok.' }) {
  const [open, setOpen] = useState(null);
  if (!items?.length) return <p className="text-muted" style={{ fontSize: 12.5, padding: 10 }}>{empty}</p>;
  return (
    <table className="data-table compact">
      <thead>
        <tr>
          <th style={{ textAlign: 'left', width: 120 }}>Zaman</th>
          {showTickers && <th style={{ textAlign: 'left', width: 150 }}>Hisse</th>}
          <th style={{ textAlign: 'left' }}>Konu</th>
          <th style={{ textAlign: 'left' }}>Özet</th>
        </tr>
      </thead>
      <tbody>
        {items.map(d => {
          const isOpen = open === d.idx;
          return (
            <React.Fragment key={d.idx}>
              <tr className="row-hoverable" onClick={() => setOpen(isOpen ? null : d.idx)} style={{ cursor: 'pointer' }}>
                <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>{isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}{fmtTs(d.publish_ts)}</span>
                </td>
                {showTickers && (
                  <td style={{ textAlign: 'left' }} onClick={e => e.stopPropagation()}>
                    {tickersOf(d).map(t => <Link key={t} to={`/hisse/${t}?tab=kap`} className="ticker-link" style={{ marginRight: 6 }}>{t}</Link>)}
                  </td>
                )}
                <td style={{ textAlign: 'left' }}>
                  {d.category_label
                    ? <Chip tone={IMPORTANT.has(d.category) ? 'gold' : 'default'}>{d.category_label}</Chip>
                    : <span className="text-muted" style={{ fontSize: 11.5, fontFamily: 'var(--font-body)' }}>{d.subject}</span>}
                </td>
                <td style={{ textAlign: 'left', fontFamily: 'var(--font-body)', whiteSpace: 'normal', fontSize: 12 }} className="text-secondary">
                  {d.summary}{d.is_late ? <span className="text-down"> · geç bildirim</span> : ''}{d.modify_status ? <span className="text-muted"> · düzeltme</span> : ''}
                </td>
              </tr>
              {isOpen && (
                <tr className="accordion-row"><td colSpan={showTickers ? 4 : 3} style={{ textAlign: 'left', padding: '10px 16px' }}><Detail idx={d.idx} /></td></tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
