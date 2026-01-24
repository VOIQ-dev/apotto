import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Clock, ChatCircleDots, ArrowsClockwise } from 'phosphor-react';
import { AnimatedBackground } from '../components/AnimatedBackground';

export const Scene2Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title animation with bounce
  const titleScale = spring({
    frame: frame - 5,
    fps,
    config: {
      damping: 10,
      stiffness: 150,
    },
  });

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Scene transition: fade out in the last 30 frames (90-120)
  const sceneExitOpacity = interpolate(frame, [90, 120], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const sceneExitScale = interpolate(frame, [90, 120], [1, 0.85], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const sceneExitBlur = interpolate(frame, [90, 120], [0, 10], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Problems list with Phosphor icons
  const problems = [
    { text: '営業リストの作成に時間がかかる', Icon: Clock },
    { text: 'パーソナライズされた文面を考えるのが大変', Icon: ChatCircleDots },
    { text: '手動での送信作業が非効率', Icon: ArrowsClockwise },
  ];

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: 120,
      }}
    >
      <AnimatedBackground />

      {/* Light flash transition effect in last frames (110-120) */}
      {frame >= 110 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle, rgba(16, 185, 129, 0.6) 0%, transparent 70%)',
            opacity: interpolate(frame, [110, 115, 120], [0, 1, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
            zIndex: 15,
            pointerEvents: 'none',
          }}
        />
      )}

      <div
        style={{
          maxWidth: 1400,
          width: '100%',
          position: 'relative',
          zIndex: 10,
          opacity: sceneExitOpacity,
          transform: `scale(${sceneExitScale})`,
          filter: `blur(${sceneExitBlur}px)`,
        }}
      >
        {/* Title with bounce */}
        <div
          style={{
            opacity: titleOpacity,
            transform: `scale(${titleScale})`,
            marginBottom: 80,
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: '#f1f5f9',
              marginBottom: 20,
              textAlign: 'center',
            }}
          >
            営業活動のこんな課題、
            <br />
            ありませんか?
          </div>
        </div>

        {/* Problems list with staggered bounce animation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
          {problems.map((problem, index) => {
            const itemDelay = 25 + index * 8;

            // Bounce in from left
            const itemScale = spring({
              frame: frame - itemDelay,
              fps,
              config: {
                damping: 8,
                stiffness: 150,
                mass: 0.8,
              },
            });

            const itemX = spring({
              frame: frame - itemDelay,
              fps,
              config: {
                damping: 12,
                stiffness: 100,
              },
            });

            const itemOpacity = interpolate(
              frame,
              [itemDelay, itemDelay + 15],
              [0, 1],
              {
                extrapolateRight: 'clamp',
              }
            );

            // Icon rotation
            const iconRotation = spring({
              frame: frame - (itemDelay + 5),
              fps,
              config: {
                damping: 10,
                stiffness: 200,
              },
            });

            // Pulse animation for icon
            const iconScale = interpolate(
              Math.sin((frame - itemDelay) * 0.2),
              [-1, 1],
              [1, 1.2]
            );

            const IconComponent = problem.Icon;

            return (
              <div
                key={index}
                style={{
                  opacity: itemOpacity,
                  transform: `translateX(${(1 - itemX) * -100}px) scale(${itemScale})`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 30,
                  padding: 40,
                  background: 'rgba(255, 255, 255, 0.04)',
                  borderRadius: 24,
                  border: '2px solid rgba(16, 185, 129, 0.3)',
                  backdropFilter: 'blur(10px)',
                  boxShadow: '0 10px 40px rgba(16, 185, 129, 0.2)',
                }}
              >
                {/* Animated Icon */}
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 20,
                    background: 'rgba(16, 185, 129, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transform: `rotate(${iconRotation * 360}deg) scale(${iconScale})`,
                    border: '2px solid rgba(16, 185, 129, 0.3)',
                  }}
                >
                  <IconComponent size={40} color="#10b981" weight="duotone" />
                </div>

                {/* Text with wave animation */}
                <div
                  style={{
                    fontSize: 42,
                    fontWeight: 600,
                    color: '#e2e8f0',
                    flex: 1,
                  }}
                >
                  {problem.text.split('').map((char, charIndex) => {
                    const charOpacity = interpolate(
                      frame,
                      [itemDelay + 10 + charIndex * 0.5, itemDelay + 15 + charIndex * 0.5],
                      [0, 1],
                      {
                        extrapolateRight: 'clamp',
                      }
                    );

                    return (
                      <span
                        key={charIndex}
                        style={{
                          display: 'inline-block',
                          opacity: charOpacity,
                        }}
                      >
                        {char}
                      </span>
                    );
                  })}
                </div>

                {/* Pulse indicator */}
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: '#10b981',
                    boxShadow: '0 0 20px rgba(16, 185, 129, 0.8)',
                    opacity: interpolate(
                      Math.sin(frame * 0.3),
                      [-1, 1],
                      [0.3, 1]
                    ),
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Transition particles - appear in last 30 frames */}
        {frame >= 90 && [...Array(20)].map((_, i) => {
          const particleProgress = interpolate(frame, [90, 120], [0, 1], {
            extrapolateRight: 'clamp',
          });

          const angle = (i / 20) * Math.PI * 2;
          const distance = particleProgress * 800;
          const x = Math.cos(angle) * distance;
          const y = Math.sin(angle) * distance;

          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: `linear-gradient(135deg, #10b981, #14b8a6)`,
                boxShadow: `0 0 20px #10b981`,
                transform: `translate(${x}px, ${y}px)`,
                opacity: 1 - particleProgress,
              }}
            />
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
