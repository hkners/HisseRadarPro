// Shared design-system primitives. Styling lives in index.css; these only compose class names.
import React from 'react';
import { Link } from 'react-router-dom';
import { Info, ArrowRight } from 'lucide-react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/** variant: 'default' | 'primary' | 'outline-gold' | 'ghost'; size: 'sm' | 'md' | 'lg'. Pass `to` to render a router link. */
export function Button({ variant = 'default', size = 'md', to, className, children, ...rest }) {
  const cls = cx(
    'btn',
    variant !== 'default' && `btn-${variant}`,
    size !== 'md' && `btn-${size}`,
    className,
  );
  if (to) return <Link to={to} className={cls} {...rest}>{children}</Link>;
  return <button type="button" className={cls} {...rest}>{children}</button>;
}

/** tabs: [{ id, label }] */
export function PillTabs({ tabs, value, onChange, className }) {
  return (
    <div className={cx('pill-tabs', className)} role="tablist">
      {tabs.map(t => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          className={cx('pill-tab', value === t.id && 'active')}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** tone: 'default' | 'gold' | 'up' | 'down' | 'warn' */
export function Chip({ tone = 'default', solid = false, className, children, ...rest }) {
  return (
    <span className={cx('chip', tone !== 'default' && `chip-${tone}`, solid && 'chip-solid', className)} {...rest}>
      {children}
    </span>
  );
}

export function Card({ eyebrow, title, children, linkLabel, linkTo, onLinkClick, className, style }) {
  return (
    <div className={cx('card', className)} style={style}>
      {eyebrow && <div className="card-eyebrow">{eyebrow}</div>}
      {title && <div className="card-title">{title}</div>}
      {children && <div className="card-body">{children}</div>}
      {linkLabel && (linkTo
        ? <Link to={linkTo} className="card-link">{linkLabel} <ArrowRight size={13} /></Link>
        : <span className="card-link" onClick={onLinkClick}>{linkLabel} <ArrowRight size={13} /></span>)}
    </div>
  );
}

/** Centered gold display title + paragraph + actions; the pattern used for empty, locked and upcoming pages. */
export function EmptyState({ icon: Icon, title, children, actions }) {
  return (
    <div className="empty-state">
      {Icon && <div className="icon-ring"><Icon size={20} strokeWidth={1.6} /></div>}
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

/** Small ⓘ icon that reveals an explanation on hover — for column headers and metric labels. */
export function InfoTip({ text, size = 11 }) {
  return (
    <span className="info-tip" aria-label={text} tabIndex={0}>
      <Info size={size} />
      <span className="tip" role="tooltip">{text}</span>
    </span>
  );
}

/** Gold monospace ticker with the company name underneath. */
export function TickerCell({ ticker, name, to }) {
  return (
    <div className="ticker-cell">
      <Link to={to || `/hisse/${ticker}`} className="ticker-link">{ticker}</Link>
      {name && <span className="name" title={name}>{name}</span>}
    </div>
  );
}

/** Thin gold bar for portfolio weights; value in percent (0–100). */
export function WeightBar({ value, max = 100 }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return <span className="weight-bar"><span style={{ width: `${pct}%` }} /></span>;
}

/** Single headline number with a mono value and a muted context line. tone: 'up' | 'down' | undefined */
export function StatTile({ label, tip, value, sub, tone }) {
  return (
    <div className="stat-tile">
      <span className="eyebrow">{label}{tip && <InfoTip text={tip} size={10} />}</span>
      <span className={cx('stat-value', tone === 'up' && 'text-up', tone === 'down' && 'text-down')}>{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

export function Kbd({ children }) {
  return <kbd className="kbd">{children}</kbd>;
}
