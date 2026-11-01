import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { Brand, Orientation, SceneProps } from '../types';
import { rgba } from '../color';
import { ImageFrame } from './ImageFrame';
import { TitleCard } from './TitleCard';
import { LowerThird } from './LowerThird';
import { ChapterChip } from './ChapterChip';
import { LogoBadge } from './LogoBadge';

export const Scene: React.FC<{
  scene: SceneProps;
  orientation: Orientation;
  brand: Brand;
}> = ({ scene, orientation, brand }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const isTitle = scene.images.length === 0;
  const isMobile = orientation === 'mobile';

  const fade = interpolate(
    frame,
    [0, 12, durationInFrames - 12, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Brand-tinted dark background: secondary glow over near-black.
  const background = `radial-gradient(circle at 50% 26%, ${rgba(brand.secondary, 0.45)} 0%, ${rgba(
    brand.secondary,
    0.12,
  )} 42%, #06101c 78%)`;

  return (
    <AbsoluteFill style={{ background }}>
      {isTitle ? (
        <TitleCard
          title={scene.title ?? scene.part}
          subtitle={brand.name}
          brand={brand}
          opacity={fade}
        />
      ) : (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: fade }}>
          {scene.images.map((img, i) => (
            <ImageFrame
              key={`${img}-${i}`}
              img={img}
              index={i}
              count={scene.images.length}
              orientation={orientation}
            />
          ))}
        </AbsoluteFill>
      )}

      {!isTitle && <ChapterChip label={scene.part} brand={brand} opacity={fade} />}
      {scene.platformHint && <LowerThird text={scene.platformHint} brand={brand} opacity={fade} />}

      {/* logo watermark on every non-title scene (title card has its own big logo) */}
      {!isTitle && (
        <AbsoluteFill
          style={{ justifyContent: 'flex-start', alignItems: 'flex-end', padding: 48, opacity: fade * 0.95 }}
        >
          <LogoBadge brand={brand} height={isMobile ? 66 : 80} />
        </AbsoluteFill>
      )}

      {scene.audio && (
        <Sequence from={Math.round(scene.padBefore * fps)}>
          <Audio src={staticFile(scene.audio)} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};
