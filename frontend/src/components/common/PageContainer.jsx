import React from 'react';

/**
 * Standard page frame: display-font title, inline subtitle, optional count badge
 * and a right-hand actions slot, separated from the content by a hairline.
 * `statusDot` and `headerBorderColor` are accepted for backwards compatibility but no longer drawn.
 */
export default function PageContainer({
    children,
    title,
    subtitle,
    badge,
    headerRight,
    scrollable = false,
    style = {}
}) {
    const containerStyle = {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        boxSizing: 'border-box',
        ...style
    };

    return (
        <div className="page-container flex-1" style={containerStyle}>
            {(title || headerRight) && (
                <div className="page-header">
                    <div className="page-header-titles">
                        {title && <h1 className="page-title">{title}</h1>}
                        {badge && (
                            <span className="chip chip-gold">
                                {typeof badge === 'string' ? badge : badge.label}
                            </span>
                        )}
                        {subtitle && <span className="page-subtitle" title={subtitle}>{subtitle}</span>}
                    </div>
                    {headerRight && <div className="page-header-actions">{headerRight}</div>}
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: scrollable ? 'auto' : 'hidden', minHeight: 0 }}>
                {children}
            </div>
        </div>
    );
}
