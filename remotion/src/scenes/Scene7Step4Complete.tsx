import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { AppMockup } from '../components/AppMockup';
import { StepBadge } from '../components/StepBadge';

export const Scene7Step4Complete: React.FC = () => {
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

  // Camera zoom to RIGHT BOTTOM notification (Sent Successfully) - START BEFORE TOAST
  const zoomPhase = frame > 40;
  const cameraScale = spring({
    frame: frame - 40,
    fps,
    from: 1,
    to: zoomPhase ? 1.9 : 1,
    config: {
      damping: 15,
      stiffness: 100,
    },
  });

  const cameraX = spring({
    frame: frame - 40,
    fps,
    from: 0,
    to: zoomPhase ? -620 : 0,  // Right for notification
    config: {
      damping: 15,
      stiffness: 100,
    },
  });

  const cameraY = spring({
    frame: frame - 40,
    fps,
    from: 0,
    to: zoomPhase ? -440 : 0,  // Down for bottom notification
    config: {
      damping: 15,
      stiffness: 100,
    },
  });

  // Spotlight on notification
  const spotlightOpacity = interpolate(frame, [40, 55], [0, 0.6], {
    extrapolateRight: 'clamp',
  });

  // Small notification (Sent Successfully) - Show first
  const showLog = frame > 60;

  // Big center overlay (送信完了！) - Show later
  const showBigOverlay = frame > 70;

  // Toast slide in with bounce (for big overlay)
  const toastY = spring({
    frame: frame - 70,
    fps,
    config: {
      damping: 10,
      stiffness: 150,
      mass: 0.8,
    },
  });

  // Toast scale bounce (for big overlay)
  const toastScale = spring({
    frame: frame - 70,
    fps,
    config: {
      damping: 8,
      stiffness: 200,
      mass: 0.5,
    },
  });

  // Celebration particles (for big overlay)
  const particleOpacity = interpolate(frame, [70, 80, 88, 90], [0, 1, 1, 0], {
    extrapolateRight: 'clamp',
  });

  const formValues = {
    company: '株式会社エコロジー',
    name: '環境 太郎',
    email: 'kankyo@ecology.co.jp',
  };

  const fullText = '貴社の「持続可能な社会の実現」という理念に深く共感いたしました。';

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
            background: 'radial-gradient(circle at 72% 75%, transparent 15%, rgba(15, 23, 42, 0.93) 45%)',
            opacity: spotlightOpacity,
            zIndex: 5,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Celebration particles */}
      {showBigOverlay && (
        <>
          {[...Array(8)].map((_, i) => {
            const angle = (i / 8) * Math.PI * 2;
            const distance = 200 * toastScale;
            const x = Math.cos(angle) * distance;
            const y = Math.sin(angle) * distance;

            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
                  transform: `translate(${x}px, ${y}px)`,
                  opacity: particleOpacity,
                  boxShadow: '0 0 20px rgba(16, 185, 129, 0.8)',
                  zIndex: 5,
                }}
              />
            );
          })}
        </>
      )}

      <div
        style={{
          position: 'relative',
          zIndex: 10,
          opacity: badgeOpacity,
          transform: `scale(${zoomPhase ? 0.5 : 1}) translateY(${zoomPhase ? -300 : 0}px)`,
          transition: 'all 0.5s ease-out',
        }}
      >
        <StepBadge
          stepNumber={4}
          title="送信完了！"
          subtitle="自動でアプローチが完了しました"
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
          generatedText={fullText}
          formValues={formValues}
          showLog={showLog}
          isRunning={true}
        />
      </div>

      {/* Enhanced success overlay */}
      {showBigOverlay && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: `translate(-50%, -50%) translateY(${(1 - toastY) * 100}px) scale(${toastScale * cameraScale})`,
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.95) 0%, rgba(20, 184, 166, 0.95) 100%)',
            padding: '40px 80px',
            borderRadius: 30,
            boxShadow: '0 30px 80px rgba(16, 185, 129, 0.6)',
            zIndex: 100,
            border: '3px solid rgba(255, 255, 255, 0.3)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 30,
            }}
          >
            {/* Success icon */}
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
              }}
            >
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="3"
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>

            {/* Text */}
            <div>
              <div
                style={{
                  fontSize: 48,
                  fontWeight: 900,
                  color: 'white',
                  marginBottom: 8,
                  textShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
                }}
              >
                送信完了！
              </div>
              <div
                style={{
                  fontSize: 28,
                  color: 'rgba(255, 255, 255, 0.9)',
                  textShadow: '0 1px 5px rgba(0, 0, 0, 0.1)',
                }}
              >
                株式会社エコロジー へ自動送信されました
              </div>
            </div>
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
