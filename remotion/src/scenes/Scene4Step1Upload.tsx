import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { AppMockup } from '../components/AppMockup';
import { StepBadge } from '../components/StepBadge';

export const Scene4Step1Upload: React.FC = () => {
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

  const mockupY = interpolate(frame, [20, 35], [50, 0], {
    extrapolateRight: 'clamp',
  });

  // Upload animation starts
  const showUpload = frame > 40;
  const uploadProgress = interpolate(frame, [40, 80], [0, 100], {
    extrapolateRight: 'clamp',
  });

  // Camera zoom into upload area - WHILE UPLOADING
  const zoomPhase = frame > 40;
  const cameraScale = spring({
    frame: frame - 40,
    fps,
    from: 1,
    to: zoomPhase ? 1.5 : 1,
    config: {
      damping: 20,
      stiffness: 80,
    },
  });

  const cameraY = spring({
    frame: frame - 40,
    fps,
    from: 0,
    to: zoomPhase ? -100 : 0,
    config: {
      damping: 20,
      stiffness: 80,
    },
  });

  // Spotlight effect on upload area
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
            background: 'radial-gradient(circle at 50% 40%, transparent 30%, rgba(15, 23, 42, 0.8) 70%)',
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
          transform: `scale(${zoomPhase ? 0.7 : 1}) translateY(${zoomPhase ? -200 : 0}px)`,
          transition: 'all 0.5s ease-out',
        }}
      >
        <StepBadge
          stepNumber={1}
          title="リストアップロード"
          subtitle="企業リストをドラッグ＆ドロップ"
        />
      </div>

      <div
        style={{
          opacity: mockupOpacity,
          transform: `translateY(${mockupY + cameraY}px) scale(${cameraScale})`,
          position: 'relative',
          zIndex: 10,
          width: '100%',
          maxWidth: 1400,
        }}
      >
        <AppMockup
          showUpload={showUpload}
          uploadProgress={uploadProgress}
          isRunning={showUpload}
        />
      </div>
    </AbsoluteFill>
  );
};
