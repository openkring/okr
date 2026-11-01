import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import { FPS, type VideoProps } from './types';
import { Scene } from './scenes/Scene';

export const TutorialVideo: React.FC<VideoProps> = ({ scenes, orientation, brand }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#06101c' }}>
      <Series>
        {scenes.map((scene) => (
          <Series.Sequence
            key={scene.id}
            durationInFrames={Math.max(1, Math.round(scene.durationInSeconds * FPS))}
          >
            <Scene scene={scene} orientation={orientation} brand={brand} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
