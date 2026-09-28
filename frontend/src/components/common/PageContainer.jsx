import React from 'react';

/**
 * Standardized Terminal PageContainer
 * Matches the Dashboard (Home.jsx) compact ribbon aesthetic:
 * - 12px font size, 800 weight, uppercase, letter-spacing -0.3px
 * - Sleek dark gradient background with 1px border
 * - Status dot, optional badge, subtitle, and right actions/status slot
 */
export default function PageContainer({ 
    children, 
    title, 
    subtitle, 
    badge,
    statusDot = 'var(--color-up)',
    headerRight, 
    scrollable = false,
    headerBorderColor,
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
                <div 
                    className="terminal-header-ribbon"
                    style={{ 
                        padding: '6px 12px', 
                        marginBottom: '8px',
                        border: `1px solid ${headerBorderColor || 'var(--border-color)'}`,
                        background: 'linear-gradient(90deg, rgba(20,24,33,0.95) 0%, rgba(13,16,23,0.95) 100%)',
                        borderRadius: '6px',
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        flexShrink: 0,
                        gap: '10px',
                        minHeight: '36px'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
                        {statusDot && (
                            <span style={{ color: statusDot, fontSize: '10px', flexShrink: 0 }}>●</span>
                        )}
                        <span style={{ 
                            fontSize: '12px', 
                            fontWeight: '800', 
                            color: 'var(--text-highlight)', 
                            letterSpacing: '-0.3px', 
                            whiteSpace: 'nowrap',
                            textTransform: 'uppercase'
                        }}>
                            {title}
                        </span>
                        {badge && (
                            <span style={{ 
                                padding: '1px 6px', 
                                borderRadius: '3px', 
                                fontSize: '9.5px', 
                                fontWeight: '900', 
                                background: badge.background || 'rgba(57, 197, 207, 0.15)',
                                color: badge.color || 'var(--color-cyan)',
                                border: `1px solid ${badge.borderColor || 'rgba(57, 197, 207, 0.35)'}`,
                                whiteSpace: 'nowrap',
                                flexShrink: 0
                            }}>
                                {typeof badge === 'string' ? badge : badge.label}
                            </span>
                        )}
                        {subtitle && (
                            <span style={{ 
                                fontSize: '10.5px', 
                                fontWeight: 'normal', 
                                color: 'var(--text-muted)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                            }} title={subtitle}>
                                {subtitle}
                            </span>
                        )}
                    </div>
                    {headerRight && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                            {headerRight}
                        </div>
                    )}
                </div>
            )}
            
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: scrollable ? 'auto' : 'hidden', minHeight: 0 }}>
                {children}
            </div>
        </div>
    );
}
