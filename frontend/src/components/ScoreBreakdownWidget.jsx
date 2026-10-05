// HisseRadar score of one stock: decision, what drives it, the evidence behind it, the trade plan and the
// analyst/valuation context that is deliberately kept out of the score.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chip, InfoTip } from './ui';
import { ScoreBar, StageChip, VerdictChip, pts } from './ta/common';
import { fmtNum, fmtPct } from '../utils/format';

const API = import.meta.env.VITE_API_URL || '/api';
const DECISION_TONE = { STRONG_BUY: 'up', BUY: 'gold', HOLD: 'default', AVOID: 'down' };

function Groups({ groups }) {
  const max = Math.max(0.002, ...groups.map(g => Math.abs(g.effect)));
  return groups.map(g => {
    const w = (Math.abs(g.effect) / max) * 50;
    return (
      <div key={g.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 130px 78px', gap: 8, alignItems: 'center', padding: '4px 0' }}>
        <span className="text-secondary" style={{ fontSize: 12 }}>{g.label}</span>
        <span className="diverge-track">
          <span className="zero" />
          <span className="fill" style={{ background: g.effect >= 0 ? 'var(--positive)' : 'var(--negative)', left: g.effect >= 0 ? '50%' : `${50 - w}%`, width: `${w}%` }} />
        </span>
        <span className={g.effect >= 0 ? 'text-up' : 'text-down'} style={{ fontSize: 11, textAlign: 'right' }}>{pts(g.effect)}</span>
      </div>
    );
  });
}

export default function ScoreBreakdownWidget({ ticker, compact = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticker) return undefined;
    let alive = true;
    setData(null); setError(null);
    fetch(`${API}/stocks/${ticker}/score-breakdown`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Skor alınamadı'))))
      .then(d => alive && setData(d))
      .catch(e => alive && setError(e.message));
    return () => { alive = false; };
  }, [ticker]);

  if (error) return <div className="text-muted" style={{ fontSize: 11, padding: 8 }}>{error}</div>;
  if (!data) return <div className="text-muted" style={{ fontSize: 11, padding: 8 }}>Skor yükleniyor…</div>;

  const head = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <ScoreBar score={data.has_model ? data.score : null} width={compact ? 60 : 110} />
      <Chip tone={DECISION_TONE[data.decision_badge] || 'default'} solid>{data.decision}</Chip>
      {data.stage && <StageChip stage={data.stage} />}
      {data.decile && <span className="text-muted" style={{ fontSize: 11 }}>{data.decile}. dilim · tarihsel 20 gün {pts(data.expected_excess_20d)}</span>}
    </div>
  );

  if (compact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 4 }}>
        {head}
        {data.groups?.length > 0 && <Groups groups={data.groups} />}
        <Link to={`/hisse/${data.ticker}?tab=skor_dokumu`} className="text-gold" style={{ fontSize: 11 }}>Skor detayı</Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card">
        <div className="card-eyebrow">HisseRadar skoru</div>
        {head}
        <p className="text-muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.55 }}>
          Skor yalnızca geçmişte işe yaradığı örneklem dışı doğrulanan teknik modelden gelir (likit hisseler arasında yüzdelik sıra).
          Karar bantları: 90+ GÜÇLÜ AL (4. evrede değilse), 70-90 KADEMELİ AL, 30-70 BEKLE / İZLE, 30 altı RİSKLİ / SAT.
          {!data.liquid && ' Bu hisse likit değil; karar en fazla KADEMELİ AL olabilir.'} <Link to="/karne" className="text-gold">Skor karnesi</Link>
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">Skoru ne belirliyor <InfoTip text="Girdi grupları nötr değere çekildiğinde 20 günlük tahminin ne kadar değiştiği (yaklaşık)." size={10} /></div>
          <div className="panel-content" style={{ flex: 'none' }}>
            {data.groups?.length ? <Groups groups={data.groups} /> : <span className="text-muted">Model hesaplanamadı.</span>}
            <ul style={{ margin: '10px 0 0', paddingLeft: 16, fontSize: 12, lineHeight: 1.6 }} className="text-secondary">
              {(data.drivers || []).map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          </div>
        </div>
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">Aktif sinyaller</div>
          <div className="panel-content" style={{ flex: 'none' }}>
            {(data.signal_details || []).length === 0 && <span className="text-muted" style={{ fontSize: 12 }}>Aktif sinyal yok.</span>}
            {(data.signal_details || []).map(s => (
              <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: 12 }}>{s.label}</span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className={s.mean20 > 0 ? 'text-up' : s.mean20 < 0 ? 'text-down' : 'text-muted'} style={{ fontSize: 11 }}>{pts(s.mean20)}</span>
                  <VerdictChip verdict={s.verdict} />
                </span>
              </div>
            ))}
            <Link to={`/hisse/${data.ticker}?tab=teknik`} className="text-gold" style={{ fontSize: 11, display: 'inline-block', marginTop: 8 }}>Teknik analizin tamamı</Link>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">İşlem planı</div>
          <div className="panel-content" style={{ flex: 'none', fontSize: 12.5, lineHeight: 1.7 }}>
            <div>Giriş bandı: <b>{fmtNum(data.entry_zone?.low, 2)} – {fmtNum(data.entry_zone?.high, 2)} TL</b></div>
            <div>Önerilen stop: <b className="text-down">{fmtNum(data.stop_loss, 2)} TL</b> ({fmtPct(-data.stop_loss_pct, 1)})</div>
            {data.risk_reward > 0 && <div>Risk / ödül (kurum hedefine göre): <b>1 : {fmtNum(data.risk_reward, 1)}</b></div>}
            <p className="text-muted" style={{ fontSize: 11.5, marginTop: 6 }}>{data.risk_statement}</p>
          </div>
        </div>
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">Bağlam (skora dahil değil) <InfoTip text="Kurum hedefleri, kapsam ve revizyonlar 2026 raporlarıyla test edildi; teknik modelin ötesinde bilgi taşımadılar ve yüksek potansiyel sonraki getiriyle ters yönlü çıktı. Değerleme için geçmişe dönük veri olmadığından doğrulanamadı. Bu yüzden bilgi olarak gösterilir, skora girmez." size={10} /></div>
          <div className="panel-content" style={{ flex: 'none', fontSize: 12.5, lineHeight: 1.7 }}>
            <div>Konsensüs hedef: <b>{data.consensus_target ? `${fmtNum(data.consensus_target, 2)} TL (${fmtPct(data.upside_pct, 1)})` : '—'}</b></div>
            <div>Kapsayan kurum: <b>{data.broker_count || 0}</b>{data.model_count ? ` · ${data.model_count} model portföyde` : ''}</div>
            <div>Hedef revizyonları (90 gün): <b>{data.revision_momentum > 0 ? 'yukarı ağırlıklı' : data.revision_momentum < 0 ? 'aşağı ağırlıklı' : 'nötr'}</b></div>
            <div>Sektöre göre değerleme: <b>{data.valuation_score != null ? `${Math.round(data.valuation_score)}/100` : '—'}</b> <span className="text-muted" style={{ fontSize: 11 }}>(yüksek = ucuz)</span></div>
            {data.is_falling_knife && <div className="text-down" style={{ fontSize: 11.5, marginTop: 4 }}>Uyarı: yüksek kurum potansiyeli düşüş evresiyle birlikte; hedef güncel olmayabilir.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
