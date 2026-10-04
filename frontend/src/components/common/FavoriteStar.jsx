import React, { useState } from 'react';
import { useFavorites } from '../../hooks/useFavorites';

export default function FavoriteStar({ ticker, size = 14, style = {}, className = '' }) {
    const { favorites, toggleFavorite } = useFavorites();
    const isFavorite = ticker ? favorites.includes(ticker) : false;
    const [isHovered, setIsHovered] = useState(false);

    if (!ticker) return null;

    const handleClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(ticker);
    };

    const handleMouseDown = (e) => {
        // Prevent row selection / accordion toggling on parent table row
        e.stopPropagation();
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            onMouseDown={handleMouseDown}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={`favorite-star-btn ${className}`}
            style={{
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                verticalAlign: 'middle',
                width: '22px',
                height: '22px',
                minWidth: '22px',
                minHeight: '22px',
                padding: 0,
                background: isHovered ? 'rgba(201, 136, 58, 0.16)' : 'transparent',
                border: 'none',
                outline: 'none',
                borderRadius: '4px',
                transition: 'background 0.15s ease, transform 0.1s ease',
                transform: isHovered ? 'scale(1.18)' : 'scale(1)',
                userSelect: 'none',
                flexShrink: 0,
                ...style
            }}
            title={isFavorite ? `${ticker} - Favorilerden Çıkar` : `${ticker} - Favorilere Ekle`}
            aria-label={isFavorite ? `${ticker} favorilerden çıkar` : `${ticker} favorilere ekle`}
        >
            <svg
                width={size}
                height={size}
                viewBox="0 0 24 24"
                fill={isFavorite ? 'var(--warning)' : 'none'}
                stroke={isFavorite ? 'var(--warning)' : isHovered ? 'var(--warning)' : 'rgba(255,255,255,0.35)'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                    pointerEvents: 'none',
                    display: 'block',
                    filter: isFavorite ? 'drop-shadow(0 0 3px rgba(201, 136, 58, 0.6))' : 'none'
                }}
            >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
        </button>
    );
}
