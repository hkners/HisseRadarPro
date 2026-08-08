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

  const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    fallbackName || alt || '?'
  )}&background=random&color=fff&size=${size}`;

  return (
    <img
      src={hasError || !src ? fallbackUrl : src}
      alt={alt}
      className={className}
      style={style}
      onError={() => setHasError(true)}
      {...props}
    />
  );
}
