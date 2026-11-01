import React from 'react';
import { Img, staticFile } from 'remotion';
import type { Brand } from '../types';

/**
 * The tenant logo on a light rounded badge, so it stays visible regardless of
 * the logo's own colours against the dark brand background. The badge hugs the
 * logo's aspect ratio (works for wide or square logos). Renders nothing if no
 * logo was available.
 */
export const LogoBadge: React.FC<{ brand: Brand; height: number }> = ({ brand, height }) => {
  if (!brand.logo) return null;
  const padding = Math.round(height * 0.2);
  return (
    <div
      style={{
        height,
        borderRadius: Math.round(height * 0.22),
        background: '#ffffff',
        boxShadow: '0 8px 26px rgba(0,0,0,0.35)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${padding}px ${Math.round(padding * 1.3)}px`,
        boxSizing: 'border-box',
      }}
    >
      <Img src={staticFile(brand.logo)} style={{ height: '100%', width: 'auto', objectFit: 'contain' }} />
    </div>
  );
};
