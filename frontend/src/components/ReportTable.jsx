import React from 'react';
import ReportRow from './ReportRow';
import ReportPagination from './ReportPagination';

export default function ReportTable({
  reports = [],
  paginatedReports = [],
  loading = false,
  expandedId,
  onToggleAccordion,
  currentPage,
  totalPages,
  onPageChange
}) {
  return (
    <div className="panel">
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>RAPOR LİSTESİ ({reports.length})</span>
        {loading && <span className="blink" style={{ color: 'var(--text-highlight)' }}>YÜKLENİYOR...</span>}
      </div>
      <div className="panel-content" style={{ padding: 0 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>HİSSE</th>
              <th>ARACI KURUM</th>
              <th>TAVSİYE</th>
              <th>MEVCUT (₺)</th>
              <th>HEDEF (₺)</th>
              <th>POTANSİYEL</th>
              <th>TARİH</th>
              <th style={{ textAlign: 'center' }}>AKSİYON</th>
            </tr>
          </thead>
          <tbody>
            {paginatedReports.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                  Kriterlere uygun araştırma raporu bulunamadı.
                </td>
              </tr>
            ) : (
              paginatedReports.map((r) => (
                <ReportRow
                  key={r.id}
                  r={r}
                  isExpanded={expandedId === r.id}
                  onToggle={() => onToggleAccordion(r.id)}
                />
              ))
            )}
          </tbody>
        </table>
        
        <ReportPagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      </div>
    </div>
  );
}
