import React from 'react';
import { Composition } from 'remotion';
import { TutorialVideo } from './Video';
import { generatedProps } from './generated-props';
import { FPS, type VideoProps } from './types';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Tutorial"
      component={TutorialVideo}
      fps={FPS}
      durationInFrames={300}
      width={1920}
      height={1080}
      defaultProps={generatedProps as VideoProps}
      calculateMetadata={({ props }) => {
        const scenes = props.scenes ?? [];
        const total = scenes.reduce(
          (sum, sc) => sum + Math.max(1, Math.round(sc.durationInSeconds * FPS)),
          0,
        );
        const mobile = props.orientation === 'mobile';
        return {
          durationInFrames: Math.max(total, 1),
          fps: FPS,
          width: mobile ? 1080 : 1920,
          height: mobile ? 1920 : 1080,
        };
      }}
    />
  );
};
