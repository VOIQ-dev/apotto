import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Scene1Opening } from './scenes/Scene1Opening';
import { Scene2Problem } from './scenes/Scene2Problem';
import { Scene3Solution } from './scenes/Scene3Solution';
import { Scene4Step1Upload } from './scenes/Scene4Step1Upload';
import { Scene5Step2AIGeneration } from './scenes/Scene5Step2AIGeneration';
import { Scene6Step3AutoFill } from './scenes/Scene6Step3AutoFill';
import { Scene7Step4Complete } from './scenes/Scene7Step4Complete';
import { Scene8DataAnalytics } from './scenes/Scene8DataAnalytics';
import { Scene9ROI } from './scenes/Scene9ROI';
import { Scene10Closing } from './scenes/Scene10Closing';

export const ApottoIntroVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#0f172a' }}>
      {/* Scene 1: Opening - Logo & Catchphrase (0-4s = 0-120 frames) */}
      <Sequence from={0} durationInFrames={120}>
        <Scene1Opening />
      </Sequence>

      {/* Scene 2: Problem Statement (4-8s = 120-240 frames) */}
      <Sequence from={120} durationInFrames={120}>
        <Scene2Problem />
      </Sequence>

      {/* Scene 3: Solution - 3 Value Propositions (8-14s = 240-420 frames) */}
      <Sequence from={240} durationInFrames={180}>
        <Scene3Solution />
      </Sequence>

      {/* Scene 4: STEP1 - Upload (14-18s = 420-540 frames) */}
      <Sequence from={420} durationInFrames={120}>
        <Scene4Step1Upload />
      </Sequence>

      {/* Scene 5: STEP2 - AI Generation (18-22s = 540-660 frames) */}
      <Sequence from={540} durationInFrames={120}>
        <Scene5Step2AIGeneration />
      </Sequence>

      {/* Scene 6: STEP3 - Auto Fill (22-26s = 660-780 frames) */}
      <Sequence from={660} durationInFrames={120}>
        <Scene6Step3AutoFill />
      </Sequence>

      {/* Scene 7: STEP4 - Complete (26-30s = 780-900 frames) */}
      <Sequence from={780} durationInFrames={120}>
        <Scene7Step4Complete />
      </Sequence>

      {/* Scene 8: Data Analytics (30-38s = 900-1140 frames) */}
      <Sequence from={900} durationInFrames={240}>
        <Scene8DataAnalytics />
      </Sequence>

      {/* Scene 9: ROI - Before/After Comparison (38-52s = 1140-1560 frames) */}
      <Sequence from={1140} durationInFrames={420}>
        <Scene9ROI />
      </Sequence>

      {/* Scene 10: Closing CTA (52-60s = 1560-1800 frames) */}
      <Sequence from={1560} durationInFrames={240}>
        <Scene10Closing />
      </Sequence>
    </AbsoluteFill>
  );
};
