import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { Brand } from '../types';
import { rgba } from '../color';

/** Small top-left chip showing the current part / chapter. */
export const ChapterChip: React.FC<{ label: string; brand: Brand; opacity: number }> = ({
  label,
  brand,
  opacity,
}) => {
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'flex-start', padding: 48, opacity }}>
      <div
        style={{
          background: rgba(brand.primary, 0.18),
          border: `1px solid ${rgba(brand.primary, 0.55)}`,
          borderRadius: 10,
          padding: '10px 20px',
          color: '#eaf6ee',
          fontSize: 24,
          fontWeight: 600,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {label}
      </div>
    </AbsoluteFill>
  );
};
