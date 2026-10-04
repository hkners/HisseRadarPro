import React, { useEffect, useState } from 'react';
import { Upload, FileDown, X } from 'lucide-react';
import { Button, PillTabs, Chip } from './ui';
import { fmtNum } from '../utils/format';

const API = import.meta.env.VITE_API_URL || '/api';
const ACCOUNT_TABS = [{ id: 'real', label: 'Gerçek hesap' }, { id: 'paper', label: 'Kâğıt hesap' }];
const TEMPLATE = 'Hisse;İşlem;Adet;Fiyat;Tarih\nTHYAO;AL;100;292,75;15.09.2026\nASELS;AL;50;362,75;20.09.2026\nTHYAO;SAT;40;301,00;01.10.2026\n';

/** Reads a file as UTF-8, falling back to Windows-1254 (Excel's Turkish CSV encoding) on decode errors. */
function readText(file) {
  const read = (enc) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsText(file, enc);
  });
  return read('utf-8').then(t => (t.includes('�') ? read('windows-1254') : t));
}

function downloadTemplate() {
  const blob = new Blob(['﻿' + TEMPLATE], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'hisseradar-portfoy-ornek.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportCsvModal({ isOpen, onClose, defaultAccount = 'real', onImported }) {
  const [account, setAccount] = useState(defaultAccount);
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setAccount(defaultAccount);
      setContent('');
      setFileName('');
      setPreview(null);
      setError('');
    }
  }, [isOpen, defaultAccount]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setPreview(null);
    setContent(await readText(f));
  };

  const runPreview = () => {
    setBusy(true);
    setError('');
    fetch(`${API}/portfolio/import/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
      .then(r => r.json())
      .then(d => { setPreview(d); if (d.errors?.length) setError(d.errors.join(' ')); })
      .catch(() => setError('Önizleme alınamadı. Backend çalışıyor mu?'))
      .finally(() => setBusy(false));
  };

  const valid = (preview?.rows || []).filter(r => r.ok);
  const invalid = (preview?.rows || []).filter(r => !r.ok);

  const commit = () => {
    setBusy(true);
    fetch(`${API}/portfolio/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account, rows: valid.map(({ ticker, tx_type, quantity, price, tx_date }) => ({ ticker, tx_type, quantity, price, tx_date })) }),
    })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { onImported?.(d.count, account); onClose(); })
      .catch(() => setError('İçe aktarma başarısız oldu.'))
      .finally(() => setBusy(false));
  };

  return (
    <div className="sync-overlay" onMouseDown={onClose}>
      <div className="card" role="dialog" aria-label="CSV içe aktar" onMouseDown={e => e.stopPropagation()}
        style={{ width: 'min(860px, calc(100vw - 32px))', maxHeight: '86vh', display: 'flex', flexDirection: 'column', gap: 12, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="card-eyebrow">Portföy</div>
            <div className="display-title" style={{ fontSize: 19 }}>CSV'den içe aktar</div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Kapat"><X size={14} /></Button>
        </div>

        <p className="text-secondary" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          Aracı kurum ekstresini ya da kendi tablonu CSV olarak yükle. Hisse, adet ve fiyat sütunları zorunlu; işlem yönü (AL/SAT) ve tarih isteğe bağlı.
          Noktalı virgül veya virgül ayraçlı dosyalar ve "1.234,56" biçimindeki sayılar okunur. Önizlemeden sonra yalnızca geçerli satırlar aktarılır.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <PillTabs tabs={ACCOUNT_TABS} value={account} onChange={setAccount} />
          <label className="btn btn-outline-gold" style={{ cursor: 'pointer' }}>
            <Upload size={13} /> Dosya seç
            <input type="file" accept=".csv,.txt,text/csv" onChange={onFile} style={{ display: 'none' }} />
          </label>
          {fileName && <span className="text-muted" style={{ fontSize: 12 }}>{fileName}</span>}
          <Button variant="ghost" size="sm" onClick={downloadTemplate}><FileDown size={13} /> Örnek dosya</Button>
        </div>

        <textarea
          className="input"
          value={content}
          onChange={e => { setContent(e.target.value); setPreview(null); }}
          placeholder={'veya CSV içeriğini buraya yapıştır\n\n' + TEMPLATE}
          spellCheck={false}
          style={{ width: '100%', minHeight: 110, fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical' }}
        />

        {error && <div className="notice" style={{ borderColor: 'rgba(192, 82, 78, 0.5)', background: 'var(--negative-tint)' }}>{error}</div>}

        {preview?.rows?.length > 0 && (
          <div style={{ overflow: 'auto', border: '1px solid var(--border-default)', borderRadius: 'var(--radius)', minHeight: 0 }}>
            <table className="data-table compact">
              <thead>
                <tr><th>Satır</th><th>Hisse</th><th>İşlem</th><th>Adet</th><th>Fiyat</th><th>Tarih</th><th style={{ textAlign: 'left' }}>Durum</th></tr>
              </thead>
              <tbody>
                {preview.rows.map(r => (
                  <tr key={r.line} style={r.ok ? undefined : { background: 'var(--negative-tint)' }}>
                    <td>{r.line}</td>
                    <td className="font-mono" style={{ color: 'var(--gold)' }}>{r.ticker || '—'}</td>
                    <td>{r.tx_type === 'SELL' ? 'SAT' : 'AL'}</td>
                    <td>{r.quantity != null ? fmtNum(r.quantity, 0) : '—'}</td>
                    <td>{r.price != null ? fmtNum(r.price) : '—'}</td>
                    <td>{r.tx_date || '—'}</td>
                    <td style={{ textAlign: 'left' }}>{r.ok ? <Chip tone="up">Geçerli</Chip> : <span className="text-down" style={{ fontFamily: 'var(--font-body)' }}>{r.message}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="text-muted" style={{ fontSize: 12 }}>
            {preview?.rows?.length > 0 && `${valid.length} geçerli, ${invalid.length} hatalı satır · sütunlar: ${Object.values(preview.columns || {}).join(', ')} · ayraç: ${preview.delimiter}`}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={runPreview} disabled={!content.trim() || busy}>Önizle</Button>
            <Button variant="primary" onClick={commit} disabled={!valid.length || busy}>
              {valid.length ? `${valid.length} işlemi ${account === 'paper' ? 'kâğıt' : 'gerçek'} hesaba aktar` : 'Aktar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
