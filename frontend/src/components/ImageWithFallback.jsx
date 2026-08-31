import React, { useState, useEffect } from 'react';

export default function ImageWithFallback({
  src,
  alt = '',
  fallbackName = '',
  size = 24,
  className = '',
  style = {},
  ...props
}) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (hasError || !src) {
    const initials = (fallbackName || alt || '?').substring(0, 2).toUpperCase();
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: '#1a1a2e',
          border: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.max(size * 0.35, 9),
          fontWeight: 'bold',
          color: '#888',
          fontFamily: 'var(--font-mono)',
          flexShrink: 0,
          ...style,
        }}
        {...props}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      onError={() => setHasError(true)}
      {...props}
    />
  );
}
