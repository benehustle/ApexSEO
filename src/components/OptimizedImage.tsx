import React, { useState } from 'react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
}

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  className = '',
  width,
  height
}) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div className={`relative ${className}`} style={{ width, height }}>
      {!loaded && !error && (
        <div className="absolute inset-0 bg-gray-200 dark:bg-gray-700 animate-pulse rounded"></div>
      )}
      {error && (
        <div className="absolute inset-0 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center">
          <span className="text-gray-400 text-sm">Image unavailable</span>
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`w-full h-full object-cover rounded transition-opacity duration-300 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setError(true);
          setLoaded(true);
        }}
        loading="lazy"
      />
    </div>
  );
};
