import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

export const AnimatedBackground: React.FC = () => {
  const frame = useCurrentFrame();

  // Smooth gradient rotation
  const gradientRotation = interpolate(frame, [0, 300], [0, 360], {
    extrapolateRight: 'extend',
  });

  // Subtle floating animation for orbs
  const orb1Y = interpolate(
    Math.sin(frame * 0.02) * 10,
    [-10, 10],
    [-20, 20]
  );

  const orb2Y = interpolate(
    Math.cos(frame * 0.015) * 10,
    [-10, 10],
    [-15, 15]
  );

  const orb3X = interpolate(
    Math.sin(frame * 0.018) * 10,
    [-10, 10],
    [-25, 25]
  );

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
      }}
    >
      {/* Animated gradient background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(${gradientRotation}deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)`,
        }}
      />

      {/* Large floating orbs with smooth animation */}
      <div
        style={{
          position: 'absolute',
          top: '15%',
          right: '10%',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.12) 0%, transparent 70%)',
          filter: 'blur(100px)',
          transform: `translateY(${orb1Y}px)`,
        }}
      />

      <div
        style={{
          position: 'absolute',
          bottom: '15%',
          left: '5%',
          width: 700,
          height: 700,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(20, 184, 166, 0.1) 0%, transparent 70%)',
          filter: 'blur(120px)',
          transform: `translateY(${orb2Y}px)`,
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(6, 182, 212, 0.08) 0%, transparent 70%)',
          filter: 'blur(90px)',
          transform: `translate(-50%, -50%) translateX(${orb3X}px)`,
        }}
      />

      {/* Subtle grid pattern overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(16, 185, 129, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(16, 185, 129, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '100px 100px',
          opacity: 0.4,
        }}
      />

      {/* Radial gradient overlay for depth */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 50% 50%, transparent 0%, rgba(15, 23, 42, 0.3) 100%)',
        }}
      />
    </div>
  );
};
