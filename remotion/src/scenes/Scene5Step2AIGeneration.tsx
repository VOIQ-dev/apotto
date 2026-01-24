import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { AppMockup } from '../components/AppMockup';
import { StepBadge } from '../components/StepBadge';

export const Scene5Step2AIGeneration: React.FC = () => {
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

  // AI analyzing phase starts
  const showAnalyzing = frame > 40 && frame < 55;

  // Text generation - STARTS WHILE ZOOMING
  const fullText = '貴社の「持続可能な社会の実現」という理念に深く共感いたしました。特に、最近の環境配慮型素材への転換は素晴らしい取り組みだと感じております。弊社のAIソリューションであれば、その生産効率をさらに...';
  const textLength = interpolate(frame, [55, 85], [0, fullText.length], {
    extrapolateRight: 'clamp',
  });
  const generatedText = fullText.substring(0, Math.floor(textLength));

  // Camera zoom into Target Queue area (LEFT PANEL TOP) - WHILE ANALYZING
  const zoomPhase = frame > 40;
  const cameraScale = spring({
    frame: frame - 40,
    fps,
    from: 1,
    to: zoomPhase ? 1.7 : 1,
    config: {
      damping: 20,
      stiffness: 80,
    },
  });

  const cameraX = spring({
    frame: frame - 40,
    fps,
    from: 0,
    to: zoomPhase ? -280 : 0,  // Left for Target Queue area
    config: {
      damping: 20,
      stiffness: 80,
    },
  });

  const cameraY = spring({
    frame: frame - 40,
    fps,
    from: 0,
    to: zoomPhase ? 30 : 0,  // Slightly down for Target Queue
    config: {
      damping: 20,
      stiffness: 80,
    },
  });

  // Spotlight effect
  const spotlightOpacity = interpolate(frame, [40, 55], [0, 0.7], {
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
            background: 'radial-gradient(circle at 32% 45%, transparent 18%, rgba(15, 23, 42, 0.9) 50%)',
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
          transform: `scale(${zoomPhase ? 0.6 : 1}) translateY(${zoomPhase ? -250 : 0}px)`,
          transition: 'all 0.5s ease-out',
        }}
      >
        <StepBadge
          stepNumber={2}
          title="AI文面生成"
          subtitle="企業情報を解析してパーソナライズ"
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
          showAnalyzing={showAnalyzing}
          generatedText={generatedText}
          isRunning={frame > 45}
        />
      </div>
    </AbsoluteFill>
  );
};
