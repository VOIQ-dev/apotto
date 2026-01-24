import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { AppMockup } from '../components/AppMockup';
import { StepBadge } from '../components/StepBadge';

export const Scene6Step3AutoFill: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Step badge animation
  const badgeOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Mockup entrance
  const mockupOpacity = interpolate(frame, [20, 35], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Generated text - SHOW GENERATION WHILE ZOOMING
  const fullText = '貴社の「持続可能な社会の実現」という理念に深く共感いたしました。特に、最近の環境配慮型素材への転換は素晴らしい取り組みだと感じております。';
  const textLength = interpolate(frame, [40, 65], [0, fullText.length], {
    extrapolateRight: 'clamp',
  });
  const generatedText = fullText.substring(0, Math.floor(textLength));

  // Form filling sequence - WHILE ZOOMING
  const showCompany = frame > 50;
  const showName = frame > 65;
  const showEmail = frame > 80;

  const formValues = {
    company: showCompany ? '株式会社エコロジー' : '',
    name: showName ? '環境 太郎' : '',
    email: showEmail ? 'kankyo@ecology.co.jp' : '',
  };

  // Camera zoom into Form Auto-Fill area (LEFT BOTTOM - FORM SECTION) - WHILE FILLING
  const zoomPhase = frame > 40;
  const cameraScale = spring({
    frame: frame - 40,
    fps,
    from: 1,
    to: zoomPhase ? 2.2 : 1,
    config: {
      damping: 20,
      stiffness: 80,
    },
  });

  const cameraX = spring({
    frame: frame - 40,
    fps,
    from: 0,
    to: zoomPhase ? 640 : 0,  // More left for form panel
    config: {
      damping: 20,
      stiffness: 80,
    },
  });

  const cameraY = spring({
    frame: frame - 40,
    fps,
    from: 0,
    to: zoomPhase ? -500 : 0,  // Much further down to focus on FORM AUTO-FILL bottom section
    config: {
      damping: 20,
      stiffness: 80,
    },
  });

  // Spotlight effect
  const spotlightOpacity = interpolate(frame, [40, 55], [0, 0.75], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: 60,
        gap: 60,
        overflow: 'hidden',
      }}
    >
      <AnimatedBackground />

      {/* Vignette overlay when zooming */}
      {zoomPhase && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at 25% 72%, transparent 12%, rgba(15, 23, 42, 0.93) 40%)',
            opacity: spotlightOpacity,
            zIndex: 5,
            pointerEvents: 'none',
          }}
        />
      )}

      <div
        style={{
          position: 'relative',
          zIndex: 10,
          opacity: badgeOpacity,
          transform: `scale(${zoomPhase ? 0.5 : 1}) translateY(${zoomPhase ? -280 : 0}px)`,
          transition: 'all 0.5s ease-out',
        }}
      >
        <StepBadge
          stepNumber={3}
          title="フォーム自動入力"
          subtitle="生成した文面を問い合わせフォームへ自動入力"
        />
      </div>

      <div
        style={{
          opacity: mockupOpacity,
          transform: `translate(${cameraX}px, ${cameraY}px) scale(${cameraScale})`,
          position: 'relative',
          zIndex: 10,
          width: '100%',
          maxWidth: 1400,
        }}
      >
        <AppMockup
          generatedText={generatedText}
          formValues={formValues}
          isRunning={true}
        />
      </div>
    </AbsoluteFill>
  );
};
