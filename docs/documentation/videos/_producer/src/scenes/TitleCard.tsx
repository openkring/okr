import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { Brand } from '../types';
import { LogoBadge } from './LogoBadge';

export const TitleCard: React.FC<{
  title: string;
  subtitle?: string;
  brand: Brand;
  opacity: number;
}> = ({ title, subtitle, brand, opacity }) => {
  return (
    <AbsoluteFill
      style={{
        opacity,
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '0 12%',
      }}
    >
      <div style={{ marginBottom: 44 }}>
        <LogoBadge brand={brand} height={170} />
      </div>
      {subtitle && (
        <div style={{ fontSize: 34, letterSpacing: 6, color: brand.primary, marginBottom: 24, fontWeight: 700 }}>
          {subtitle.toUpperCase()}
        </div>
      )}
      <div style={{ fontSize: 76, fontWeight: 800, color: '#ffffff', lineHeight: 1.15 }}>{title}</div>
      <div
        style={{
          marginTop: 40,
          width: 140,
          height: 6,
          borderRadius: 3,
          background: `linear-gradient(90deg, ${brand.primary}, ${brand.secondary})`,
        }}
      />
    </AbsoluteFill>
  );
};
