import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { AnimatedBackground } from '../components/AnimatedBackground';

export const Scene1Opening: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo characters animation - each letter appears with bounce
  const logoText = 'apotto';
  const getLetterDelay = (index: number) => index * 5;

  // Main catchphrase lines
  const line1 = '24時間365日';
  const line2 = 'AIが商談を探し続ける';

  // Line 1 character animation
  const line1Delay = 30;
  const getLine1CharOpacity = (index: number) => {
    return spring({
      frame: frame - (line1Delay + index * 2),
      fps,
      config: {
        damping: 10,
        stiffness: 200,
      },
    });
  };

  const getLine1CharY = (index: number) => {
    return interpolate(
      spring({
        frame: frame - (line1Delay + index * 2),
        fps,
        config: {
          damping: 10,
          stiffness: 200,
        },
      }),
      [0, 1],
      [30, 0]
    );
  };

  // Line 2 character animation with wave effect
  const line2Delay = 45;
  const getLine2CharOpacity = (index: number) => {
    return spring({
      frame: frame - (line2Delay + index * 2),
      fps,
      config: {
        damping: 12,
        stiffness: 180,
      },
    });
  };

  const getLine2CharScale = (index: number) => {
    return spring({
      frame: frame - (line2Delay + index * 2),
      fps,
      config: {
        damping: 8,
        stiffness: 150,
      },
    });
  };

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <AnimatedBackground />

      {/* Main content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 60,
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Logo with character-by-character animation */}
        <div
          style={{
            fontSize: 160,
            fontWeight: 900,
            display: 'flex',
            letterSpacing: '0.02em',
            gap: 4,
          }}
        >
          {logoText.split('').map((char, index) => {
            const scale = spring({
              frame: frame - (10 + getLetterDelay(index)),
              fps,
              config: {
                damping: 10,
                stiffness: 200,
                mass: 0.5,
              },
            });

            const rotation = interpolate(
              spring({
                frame: frame - (10 + getLetterDelay(index)),
                fps,
                config: {
                  damping: 15,
                  stiffness: 100,
                },
              }),
              [0, 0.5, 1],
              [0, 10, 0]
            );

            return (
              <span
                key={index}
                style={{
                  display: 'inline-block',
                  background: 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  transform: `scale(${scale}) rotate(${rotation}deg)`,
                  filter: 'drop-shadow(0 0 40px rgba(16, 185, 129, 0.4))',
                }}
              >
                {char}
              </span>
            );
          })}
        </div>

        {/* Catchphrase with character animation */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {/* Line 1 */}
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: '#f1f5f9',
              textAlign: 'center',
              display: 'flex',
            }}
          >
            {line1.split('').map((char, index) => (
              <span
                key={index}
                style={{
                  display: 'inline-block',
                  opacity: getLine1CharOpacity(index),
                  transform: `translateY(${getLine1CharY(index)}px)`,
                }}
              >
                {char}
              </span>
            ))}
          </div>

          {/* Line 2 with gradient and bounce */}
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              textAlign: 'center',
              display: 'flex',
            }}
          >
            {line2.split('').map((char, index) => (
              <span
                key={index}
                style={{
                  display: 'inline-block',
                  background: 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  opacity: getLine2CharOpacity(index),
                  transform: `scale(${getLine2CharScale(index)})`,
                  filter: 'drop-shadow(0 0 20px rgba(16, 185, 129, 0.3))',
                }}
              >
                {char}
              </span>
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
