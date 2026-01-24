import React from 'react';
import { Composition } from 'remotion';
import { ApottoIntroVideo } from './ApottoIntroVideo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ApottoIntro"
        component={ApottoIntroVideo}
        durationInFrames={1800} // 60 seconds at 30fps
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
