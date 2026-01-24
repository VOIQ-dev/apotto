import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

interface StepBadgeProps {
  stepNumber: number;
  title: string;
  subtitle: string;
}

export const StepBadge: React.FC<StepBadgeProps> = ({ stepNumber, title, subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Badge entrance animation with spring
  const badgeScale = spring({
    frame: frame - 5,
    fps,
    config: {
      damping: 12,
      stiffness: 200,
      mass: 0.5,
    },
  });

  // Number rotation animation
  const numberRotation = spring({
    frame: frame - 10,
    fps,
    config: {
      damping: 15,
      stiffness: 150,
    },
  });

  // Text slide in
  const textOpacity = interpolate(frame, [10, 25], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const textX = interpolate(frame, [10, 25], [30, 0], {
    extrapolateRight: 'clamp',
  });

  // Glow pulse animation
  const glowIntensity = interpolate(
    Math.sin(frame * 0.15),
    [-1, 1],
    [0.3, 0.8]
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 30,
        transform: `scale(${badgeScale})`,
      }}
    >
      {/* Step Number Badge */}
      <div
        style={{
          position: 'relative',
        }}
      >
        {/* Glow effect */}
        <div
          style={{
            position: 'absolute',
            inset: -10,
            borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.4)',
            filter: 'blur(20px)',
            opacity: glowIntensity,
          }}
        />

        {/* Number container */}
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 64,
            fontWeight: 900,
            color: 'white',
            boxShadow: '0 20px 60px rgba(16, 185, 129, 0.5)',
            transform: `rotateY(${numberRotation * 360}deg)`,
            position: 'relative',
            zIndex: 1,
          }}
        >
          {stepNumber}
        </div>
      </div>

      {/* Text Content */}
      <div
        style={{
          opacity: textOpacity,
          transform: `translateX(${textX}px)`,
        }}
      >
        <div
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: '#10b981',
            marginBottom: 8,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          STEP {stepNumber}
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 900,
            color: '#f1f5f9',
            lineHeight: 1.2,
            marginBottom: 8,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 28,
            color: '#94a3b8',
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </div>
      </div>
    </div>
  );
};
