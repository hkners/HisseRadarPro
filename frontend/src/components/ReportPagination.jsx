import React from 'react';

export default function ReportPagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  return (
    <div style={{ padding: '15px', display: 'flex', justifyContent: 'center', gap: '10px', alignItems: 'center', borderTop: '1px solid var(--border-color)' }}>
      <button 
        className="btn-read" 
        disabled={currentPage === 1}
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        style={{ opacity: currentPage === 1 ? 0.5 : 1, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
      >
        ◀ ÖNCEKİ
      </button>
      <span style={{ fontSize: '13px', color: 'var(--text-highlight)', fontWeight: 'bold' }}>
        Sayfa {currentPage} / {totalPages}
      </span>
      <button 
        className="btn-read"
        disabled={currentPage === totalPages}
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        style={{ opacity: currentPage === totalPages ? 0.5 : 1, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
      >
        SONRAKİ ▶
      </button>
    </div>
  );
}
