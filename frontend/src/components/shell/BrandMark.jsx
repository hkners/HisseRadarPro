import React from 'react';
import { Link } from 'react-router-dom';

// Radar-sweep mark in the accent gold.
export function BrandMark({ size = 22 }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10.25" stroke="var(--gold)" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="5.75" stroke="var(--gold)" strokeWidth="1" opacity="0.45" />
      <path d="M12 12 L12 1.75 A10.25 10.25 0 0 1 21.6 8.4 Z" fill="var(--gold)" opacity="0.35" />
      <line x1="12" y1="12" x2="21.6" y2="8.4" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.6" fill="var(--gold)" />
      <circle cx="16.4" cy="6.6" r="1.1" fill="var(--gold-soft)" />
    </svg>
  );
}

export default function Brand() {
  return (
    <Link to="/" className="brand" aria-label="HisseRadar Pro — Dashboard">
      <BrandMark />
      <span className="brand-name">HİSSE<b>RADAR</b></span>
    </Link>
  );
}
