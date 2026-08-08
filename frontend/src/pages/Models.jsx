import React, { useEffect, useState } from 'react';

export default function Models() {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState(null);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/models`)
      .then(res => res.json())
      .then(json => {
        setModels(json);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="panel flex-1">
      <div className="panel-header" style={{ color: 'var(--color-warning)' }}>
        MODEL PORTFÖYLER VE AYLIK/HAFTALIK RAPORLAR
      </div>
      <div className="panel-content">
        <p className="text-muted" style={{ marginBottom: '20px' }}>
          &gt; Tıklandığında raporun tablo veya infografik görseli açılır. (Sadece güncel 2026 raporları)
        </p>

        {loading ? (
          <div style={{ color: 'var(--text-highlight)' }}>YÜKLENİYOR...</div>
        ) : (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
            gap: '15px' 
          }}>
            {models.map(m => (
              <div 
                key={m.id} 
                className="row-hoverable" 
                style={{ 
                  border: '1px solid var(--border-color)', 
                  padding: '15px', 
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  background: 'rgba(0,0,0,0.4)'
                }}
                onClick={() => setSelectedModel(m)}
              >
                <div>
                  <div style={{ color: 'var(--color-warning)', fontSize: '0.85rem', marginBottom: '5px' }}>
                    [{m.kurum}] - {m.tarih}
                  </div>
                  <div style={{ fontWeight: 'bold', fontSize: '0.95rem', color: 'var(--text-highlight)' }}>
                    {m.title}
                  </div>
                </div>
                <div style={{ marginTop: '15px', fontSize: '0.8rem', color: 'var(--color-neutral)', textAlign: 'right' }}>
                  [+] GÖRÜNTÜLE
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedModel && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000,
          padding: '20px'
        }} onClick={() => setSelectedModel(null)}>
          <div style={{
            background: 'var(--panel-bg)',
            border: '1px solid var(--color-warning)',
            padding: '20px',
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', borderBottom: '1px dashed var(--border-color)', paddingBottom: '10px' }}>
              <strong style={{ color: 'var(--color-warning)', fontSize: '1.2rem' }}>{selectedModel.title}</strong>
              <button 
                onClick={() => setSelectedModel(null)}
                style={{ background: 'transparent', border: '1px solid var(--color-red)', color: 'var(--color-red)', cursor: 'pointer', padding: '0 10px' }}
              >
                [X]
              </button>
            </div>
            
            <div style={{ textAlign: 'center', flex: 1, minHeight: '300px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              {selectedModel.image_url ? (
                <img 
                  src={selectedModel.image_url} 
                  alt={selectedModel.title} 
                  style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} 
                />
              ) : (
                <div style={{ color: 'var(--color-neutral)' }}>
                  BU RAPOR İÇİN GÖRSEL BULUNAMADI.<br/><br/>
                  <a href={selectedModel.link} target="_blank" rel="noreferrer" style={{ color: 'var(--text-highlight)' }}>
                    ORİJİNAL KAYNAĞA GİT
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}