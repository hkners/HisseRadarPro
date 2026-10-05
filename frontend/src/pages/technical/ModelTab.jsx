import React from 'react';
import { Link } from 'react-router-dom';
import { ModelStats, DecileChart, CurveChart, YearlyTable, ImportanceList } from '../../components/ta/ModelEvidence';

export default function ModelTab({ ov }) {
  const m = ov.model;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ModelStats m={m} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">Skor dilimlerine göre sonraki 20 gün (örneklem dışı, {m.oos_start?.slice(0, 4)}+)</div>
          <div className="panel-content" style={{ flex: 'none' }}><DecileChart deciles={m.deciles} /></div>
        </div>
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">Aylık dengelenen dilimler, maliyet sonrası</div>
          <div className="panel-content" style={{ flex: 'none' }}><CurveChart curve={m.curve} height={220} /></div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">Yıllara göre</div>
          <div className="panel-content" style={{ padding: 0, flex: 'none' }}><YearlyTable yearly={m.yearly} /></div>
        </div>
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">Modelin en çok baktığı girdiler</div>
          <div className="panel-content" style={{ flex: 'none' }}><ImportanceList importance={m.importance} /></div>
        </div>
      </div>
      <div className="card">
        <div className="card-eyebrow">Yöntem</div>
        <div className="card-body" style={{ fontSize: 12.5, lineHeight: 1.65 }}>
          <p>
            Model, 15 teknik göstergenin hisseler arasındaki sırasını ve 31 sinyalin varlığını girdi alan bir gradyan artırmalı karar ağacı topluluğudur.
            Hedef, sonraki 20 işlem gününde likit evrene göre fazla getiridir; uç değerler her gün %2–%98 aralığına kırpılır.
          </p>
          <p style={{ marginTop: 8 }}>
            Örneklem dışı test: {m.oos_start?.slice(0, 4)} yılından itibaren her yıl, o yılın başından 90 gün öncesine kadarki verilerle eğitilen bir modelle tahmin edildi.
            Sinyallerin skoru hangi yönde etkileyebileceği her eğitimde yalnızca o eğitim verisine bakılarak sabitlenir (ör. 4. evre skoru yalnızca düşürebilir).
            Bugünkü skorlar tüm yıllarla eğitilen modelden gelir. Eğitimde {m.train_rows?.toLocaleString('tr-TR')} hisse-gün gözlemi kullanıldı.
          </p>
          <p style={{ marginTop: 8 }}>
            Önce göstergeleri doğrusal ağırlıklarla birleştiren daha basit bir model denendi; sıralamayı iyi yapsa da en iyi dilimi piyasanın üzerine taşıyamadı.
            Teknik etkiler çoğunlukla eşikli: derin aşırı satım, 4. evre, dağıtım hacmi gibi durumlar doğrusal bir puanla yakalanamıyor.
          </p>
          <p style={{ marginTop: 8 }} className="text-muted">
            Sınırlar: getiriler nominal TL'dir; borsadan çıkmış hisseler veri setinde yoksa sonuçlar olduğundan iyi görünebilir; geçmiş performans gelecek için garanti değildir.
            Canlı performans <Link to="/karne" className="text-gold">Skor Karnesi</Link> sayfasında izlenir.
          </p>
        </div>
      </div>
    </div>
  );
}
