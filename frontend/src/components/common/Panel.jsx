import React from 'react';

export default function Panel({ children, title, headerRight, className = '', style = {}, scrollable = false, neon = null }) {
    const isNeon = !!neon;
    const neonClass = isNeon ? `panel-neon neon-${neon}` : '';
    const flexClass = scrollable ? 'panel-flex' : '';
    const panelClasses = `panel ${neonClass} ${flexClass} ${className}`.trim();

    return (
        <div className={panelClasses} style={style}>
            {title && (
                <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={isNeon ? { color: `var(--color-${neon === 'up' ? 'up' : neon === 'down' ? 'down' : neon === 'warning' ? 'warning' : 'neutral'})` } : {}}>
                        {title}
                    </span>
                    {headerRight && <div>{headerRight}</div>}
                </div>
            )}
            <div className={`panel-content ${scrollable ? 'panel-scrollable' : ''}`}>
                {children}
            </div>
        </div>
    );
}
