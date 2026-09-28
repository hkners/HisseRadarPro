import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';

export default function AiAnalysisTab({ ticker }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`${import.meta.env.VITE_API_URL}/stocks/${ticker}/ai-analysis`)
      .then(res => {
        if (!res.ok) {
          return res.json().then(errData => {
            throw new Error(errData.detail || 'Bilinmeyen bir hata oluştu');
          });
        }
        return res.json();
      })
      .then(json => {
        if (isMounted) {
          setData(json);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { isMounted = false; };
  }, [ticker]);

  return (
    <div className="panel flex-1">
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{ticker} — YAPAY ZEKA FİNANSAL ANALİZİ</span>
        {data && data.cached && (
          <span style={{ fontSize: '10px', background: 'var(--color-cyan)', color: '#000', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
            ÖNBELLEKTEN YÜKLENDİ
          </span>
        )}
      </div>
      <div className="panel-content" style={{ padding: '20px', lineHeight: '1.6', fontSize: '14px', color: 'var(--text-neutral)', overflowY: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '15px' }}>
            <div className="spinner" style={{ width: '40px', height: '40px', border: '3px solid rgba(0, 229, 255, 0.2)', borderTopColor: 'var(--color-cyan)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
            <div style={{ color: 'var(--color-cyan)', fontWeight: 'bold', letterSpacing: '1px' }}>YAPAY ZEKA VERİLERİ OKUYOR VE YORUMLUYOR...</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Bu işlem 5-10 saniye sürebilir.</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : error ? (
          <div style={{ background: 'rgba(255, 50, 50, 0.1)', border: '1px solid var(--color-down)', padding: '15px', borderRadius: '8px', color: '#ff8a8a' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>[HATA] Analiz Oluşturulamadı</div>
            <div>{error}</div>
            {error.includes('GEMINI_API_KEY') && (
              <div style={{ marginTop: '15px', padding: '10px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', fontSize: '12px', color: '#ddd' }}>
                <strong>Nasıl Çözülür?</strong><br/>
                1. Google AI Studio'dan (https://aistudio.google.com/) ücretsiz bir API Key alın.<br/>
                2. Projenin <code>backend/</code> klasörü içine <code>.env</code> adında bir dosya oluşturun.<br/>
                3. Dosyanın içine <code>GEMINI_API_KEY=sizin_api_anahtariniz</code> yazın ve backend'i yeniden başlatın.
              </div>
            )}
          </div>
        ) : data && data.summary ? (
          <div className="markdown-body" style={{ color: '#eee' }}>
            <ReactMarkdown>{data.summary}</ReactMarkdown>
            <style>{`
              .markdown-body h3 { color: var(--color-cyan); font-size: 1.1rem; margin-top: 25px; margin-bottom: 10px; border-bottom: 1px solid rgba(0,229,255,0.2); padding-bottom: 5px; }
              .markdown-body p { margin-bottom: 15px; }
              .markdown-body ul { margin-left: 20px; margin-bottom: 15px; }
              .markdown-body li { margin-bottom: 5px; }
              .markdown-body strong { color: #fff; }
            `}</style>
          </div>
        ) : (
          <div className="text-muted">Analiz sonucu boş döndü.</div>
        )}
      </div>
    </div>
  );
}
