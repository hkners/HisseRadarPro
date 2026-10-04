import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="panel" style={{ margin: '40px auto', maxWidth: '600px' }}>
          <div className="panel-header" style={{ color: 'var(--color-red)' }}>
            Sistem hatası
          </div>
          <div className="panel-content" style={{ textAlign: 'center', padding: '30px' }}>
            <h3 style={{ color: 'var(--text-highlight)', marginBottom: '15px' }}>
              BİR HATA OLUŞTU
            </h3>
            <p className="text-muted" style={{ marginBottom: '20px', lineHeight: '1.6' }}>
              Beklenmeyen bir hata meydana geldi. Sayfa yeniden yüklenerek sorunu çözebilirsiniz.
            </p>
            <div style={{ 
              background: 'rgba(192, 82, 78, 0.1)', 
              border: '1px solid var(--color-red)', 
              padding: '12px', 
              borderRadius: '4px',
              marginBottom: '20px',
              fontSize: '11px',
              color: 'var(--color-red)',
              textAlign: 'left',
              fontFamily: 'var(--font-mono)',
              maxHeight: '120px',
              overflowY: 'auto'
            }}>
              {this.state.error?.toString()}
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: 'var(--color-red)',
                color: 'var(--text-primary)',
                border: 'none',
                padding: '10px 24px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 'bold',
                cursor: 'pointer',
                borderRadius: '4px',
                fontSize: '13px',
              }}
            >
              Sayfayı yeniden yükle
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
