import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Orientation } from '../types';

const PLACEHOLDER = '__placeholder__:';

/**
 * One screenshot inside a scene. When a scene has several images they share the
 * scene duration in equal slices and cross-fade. A slow Ken-Burns zoom keeps the
 * static screenshot feeling alive.
 */
export const ImageFrame: React.FC<{
  img: string;
  index: number;
  count: number;
  orientation: Orientation;
}> = ({ img, index, count, orientation }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const isPlaceholder = img.startsWith(PLACEHOLDER);

  const seg = durationInFrames / count;
  const start = index * seg;
  const opacity =
    count === 1
      ? 1
      : interpolate(
          frame,
          [start - 8, start + 8, start + seg - 8, start + seg + 8],
          [0, 1, 1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );

  const scale = interpolate(frame, [start, start + seg], [1.0, 1.05], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const isMobile = orientation === 'mobile';
  const frameStyle: React.CSSProperties = {
    maxWidth: isMobile ? '46%' : '78%',
    maxHeight: isMobile ? '86%' : '82%',
    borderRadius: 16,
    boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
    border: '1px solid rgba(255,255,255,0.12)',
    objectFit: 'contain',
    transform: `scale(${scale})`,
  };

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity }}>
      {isPlaceholder ? (
        <div
          style={{
            ...frameStyle,
            width: isMobile ? '46%' : '70%',
            height: isMobile ? '78%' : '70%',
            background:
              'repeating-linear-gradient(45deg, #1c2c3c, #1c2c3c 18px, #223547 18px, #223547 36px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#cdd9e5',
            fontFamily: 'system-ui, sans-serif',
            gap: 14,
          }}
        >
          <div style={{ fontSize: 42, opacity: 0.6 }}>🖼️ Platzhalter</div>
          <div style={{ fontSize: 26, opacity: 0.8 }}>{img.slice(PLACEHOLDER.length)}</div>
        </div>
      ) : (
        <Img src={staticFile(img)} style={frameStyle} />
      )}
    </AbsoluteFill>
  );
};
