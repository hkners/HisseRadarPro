import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import PageContainer from '../components/common/PageContainer';
import { PillTabs, Button, InfoTip, StatTile } from '../components/ui';
import { VerdictChip, pts } from '../components/ta/common';
import DisclosureList from '../components/kap/DisclosureList';
import { fmtNum } from '../utils/format';

const API = import.meta.env.VITE_API_URL || '/api';
const H = [1, 5, 20, 60];

function Feed({ categories }) {
  const [scope, setScope] = useState('all');
  const [cats, setCats] = useState(new Set());
  const [days, setDays] = useState(3);
  const [items, setItems] = useState(null);
  useEffect(() => {
    setItems(null);
    const c = [...cats].join(',');
    fetch(`${API}/kap/feed?scope=${scope}&days=${days}&limit=500${c ? `&categories=${c}` : ''}`)
      .then(r => r.json()).then(d => setItems(d.items || [])).catch(() => setItems([]));
  }, [scope, cats, days]);
  const toggle = (k) => setCats(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <PillTabs tabs={[{ id: 'all', label: 'Tüm şirketler' }, { id: 'portfolio', label: 'Portföyüm' }]} value={scope} onChange={setScope} />
        <select className="input" value={days} onChange={e => setDays(Number(e.target.value))} style={{ width: 120 }}>
          {[1, 3, 7, 30, 90].map(d => <option key={d} value={d}>Son {d} gün</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <span className="text-muted" style={{ fontSize: 11.5 }}>{items ? `${items.length} bildirim` : ''}</span>
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {categories.map(c => (
          <button key={c.key} type="button" className={`count-chip${cats.has(c.key) ? ' active' : ''}`} onClick={() => toggle(c.key)}>{c.label}</button>
        ))}
      </div>
      <div className="panel" style={{ marginBottom: 0 }}>
        <div className="panel-content" style={{ padding: 0, flex: 'none' }}>
          {items == null ? <p className="text-muted" style={{ padding: 10 }}>Yükleniyor…</p> : <DisclosureList items={items} />}
        </div>
      </div>
    </div>
  );
}

function Events() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(null);
  const load = () => {
    fetch(`${API}/kap/events`).then(r => r.json()).then(setData).catch(() => setData({ ready: false }));
    fetch(`${API}/kap/backfill`).then(r => r.json()).then(setStatus).catch(() => {});
  };
  useEffect(() => {
    load();
    const id = setInterval(() => fetch(`${API}/kap/backfill`).then(r => r.json()).then(setStatus).catch(() => {}), 15000);
    return () => clearInterval(id);
  }, []);
  const start = () => fetch(`${API}/kap/backfill?days=730`, { method: 'POST' }).then(r => r.json()).then(setStatus);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card">
        <div className="card-eyebrow">Nasıl okunur</div>
        <p className="card-body" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          Her bildirim türü için, bildirimi yapan likit hisselerin sonraki 1, 5, 20 ve 60 işlem gününde eşit ağırlıklı likit hisselere göre fazla getirisi.
          Seans içinde (17:45'ten önce) yayımlanan bildirimde giriş o günün kapanışından, sonrasında yayımlanan bildirimde ertesi kapanıştan yapılır.
          "İlk gün tepkisi", bir önceki kapanıştan giriş kapanışına kadar olan harekettir. Aynı hissenin 20 seans içinde tekrarlayan aynı tür bildirimleri tek olay sayılır.
        </p>
      </div>
      {status && (
        <div className="stat-grid">
          <StatTile label="Saklanan KAP geçmişi" value={`${status.days_stored} gün`} sub={status.first_day ? `${status.first_day} – ${status.last_day}` : ''} />
          <StatTile label="Bildirim" value={fmtNum(status.disclosures, 0)} />
          <StatTile label="Geçmiş indirme" value={status.running ? `${status.done}/${status.total} gün` : 'Beklemede'}
            sub={status.running ? `Yaklaşık ${status.eta_minutes} dk kaldı` : 'Günde bir istekle, yavaşça'} />
        </div>
      )}
      {status && !status.running && status.days_stored < 700 && (
        <div className="notice" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span>Olay istatistikleri için en az 2 yıllık KAP geçmişi gerekir. İndirme KAP'ın koşullarına uygun olarak günde tek istekle ve beklemelerle yapılır (yaklaşık 40 dk).</span>
          <Button size="sm" variant="primary" onClick={start}>Geçmişi indir</Button>
        </div>
      )}
      {data && !data.ready && <p className="text-muted">Henüz yeterli olay yok.</p>}
      {data?.ready && (
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">Olay karnesi · {data.period} · {fmtNum(data.events_total, 0)} olay <Button size="sm" variant="ghost" onClick={load}>Yenile</Button></div>
          <div className="panel-content" style={{ padding: 0, overflowX: 'auto', flex: 'none' }}>
            <table className="data-table compact" style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Bildirim türü</th><th>Olay</th>
                  <th>İlk gün tepkisi <InfoTip text="Bildirimi okuyup hemen işlem yapan yatırımcının kaçırabileceği hareket (önceki kapanıştan giriş kapanışına)." size={9} /></th>
                  {H.map(h => <th key={h}>{h} gün sonra</th>)}
                  <th>Ortalamayı geçen (20g)</th><th>t (20g)</th><th>Kanıt</th>
                </tr>
              </thead>
              <tbody>
                {data.categories.map(c => {
                  const h20 = c.horizons[20] || c.horizons['20'] || {};
                  return (
                    <tr key={`${c.category}-${c.sub}`}>
                      <td style={{ textAlign: 'left' }}>{c.label}<div className="text-muted" style={{ fontSize: 10 }}>{c.first} – {c.last}</div></td>
                      <td>{c.events}</td>
                      <td className={c.day0.mean > 0 ? 'text-up' : c.day0.mean < 0 ? 'text-down' : ''}>{pts(c.day0.mean)}</td>
                      {H.map(h => {
                        const v = (c.horizons[h] || c.horizons[String(h)] || {}).mean;
                        return <td key={h} className={v > 0 ? 'text-up' : v < 0 ? 'text-down' : ''}>{pts(v)}</td>;
                      })}
                      <td>{h20.hit != null ? `%${Math.round(h20.hit * 100)}` : '—'}</td>
                      <td>{h20.t != null ? fmtNum(h20.t, 1) : '—'}</td>
                      <td><VerdictChip verdict={c.verdict} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-muted" style={{ fontSize: 11 }}>Tarihsel sonuçlar geleceği garanti etmez; olay sayısı azsa istatistik güvenilmezdir. Yatırım tavsiyesi değildir.</p>
    </div>
  );
}

export default function KapFeed() {
  const [tab, setTab] = useState('akis');
  const [categories, setCategories] = useState([]);
  useEffect(() => { fetch(`${API}/kap/categories`).then(r => r.json()).then(setCategories).catch(() => {}); }, []);
  return (
    <PageContainer
      title="KAP Akışı"
      subtitle="Kamuyu Aydınlatma Platformu bildirimleri, türlerine göre ve geçmişte fiyata etkileriyle."
      headerRight={<>
        <PillTabs tabs={[{ id: 'akis', label: 'Akış' }, { id: 'olaylar', label: 'Olay karnesi' }]} value={tab} onChange={setTab} />
        <Button size="sm" to="/alarms"><Bell size={13} /> KAP alarmı</Button>
      </>}
      scrollable
    >
      <div style={{ paddingBottom: 16 }}>
        {tab === 'akis' ? <Feed categories={categories} /> : <Events />}
        <p className="text-muted" style={{ fontSize: 10.5, marginTop: 10 }}>
          Kaynak: kap.org.tr. Akış yarım saatte bir, günlük bildirim listesiyle güncellenir; bildirim metni yalnızca açtığınızda KAP'tan alınır.
        </p>
      </div>
    </PageContainer>
  );
}
