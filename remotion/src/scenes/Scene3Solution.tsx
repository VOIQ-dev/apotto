import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Clock, Target, TrendUp } from 'phosphor-react';
import { AnimatedBackground } from '../components/AnimatedBackground';

export const Scene3Solution: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Scene entrance transition: fade in and scale from particles (0-30 frames)
  const sceneEntranceOpacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const sceneEntranceScale = interpolate(frame, [0, 30], [0.9, 1], {
    extrapolateRight: 'clamp',
  });

  const sceneEntranceBlur = interpolate(frame, [0, 30], [10, 0], {
    extrapolateRight: 'clamp',
  });

  // Title animation
  const titleOpacity = interpolate(frame, [20, 40], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const titleScale = spring({
    frame: frame - 25,
    fps,
    config: {
      damping: 12,
      stiffness: 150,
    },
  });

  // 3D rotating cube entrance
  const cubeRotateY = spring({
    frame: frame - 20,
    fps,
    from: 0,
    to: 360,
    config: {
      damping: 30,
      stiffness: 50,
    },
  });

  const cubeScale = spring({
    frame: frame - 20,
    fps,
    from: 0,
    to: 1,
    config: {
      damping: 15,
      stiffness: 100,
    },
  });

  // Values with 3D cards
  const values = [
    {
      icon: Clock,
      title: '時間削減',
      description: '営業リスト作成から送信まで全自動化',
      value: '80%',
      label: '作業時間削減',
      color: '#10b981',
      delay: 50,
    },
    {
      icon: Target,
      title: '精度向上',
      description: 'AI解析で最適な文面を自動生成',
      value: '3倍',
      label: 'アポ獲得率',
      color: '#14b8a6',
      delay: 65,
    },
    {
      icon: TrendUp,
      title: 'スケール拡大',
      description: '24時間365日自動でアプローチ',
      value: '500社',
      label: '月間送信可能数',
      color: '#06b6d4',
      delay: 80,
    },
  ];

  // Pulsing glow
  const glowIntensity = interpolate(
    Math.sin(frame * 0.15),
    [-1, 1],
    [0.6, 1]
  );

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: 80,
      }}
    >
      <AnimatedBackground />

      {/* Light flash transition effect at start (0-10 frames) */}
      {frame < 10 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle, rgba(16, 185, 129, 0.6) 0%, transparent 70%)',
            opacity: interpolate(frame, [0, 5, 10], [0, 1, 0], {
              extrapolateRight: 'clamp',
            }),
            zIndex: 15,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Entrance particles - converging in first 30 frames */}
      {frame < 30 && [...Array(20)].map((_, i) => {
        const particleProgress = interpolate(frame, [0, 30], [1, 0], {
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
              opacity: particleProgress,
              zIndex: 5,
            }}
          />
        );
      })}

      <div
        style={{
          maxWidth: 1400,
          width: '100%',
          position: 'relative',
          zIndex: 10,
          opacity: sceneEntranceOpacity,
          transform: `scale(${sceneEntranceScale})`,
          filter: `blur(${sceneEntranceBlur}px)`,
        }}
      >
        {/* Title */}
        <div
          style={{
            opacity: titleOpacity,
            transform: `scale(${titleScale})`,
            marginBottom: 80,
            textAlign: 'center',
            position: 'relative',
          }}
        >
          {/* Glowing background rings */}
          {[...Array(3)].map((_, i) => {
            const ringScale = interpolate(
              frame,
              [20 + i * 5, 50 + i * 5],
              [0.5, 2 + i * 0.3],
              { extrapolateRight: 'clamp' }
            );
            const ringOpacity = interpolate(
              frame,
              [20 + i * 5, 50 + i * 5],
              [0.6, 0],
              { extrapolateRight: 'clamp' }
            );

            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: 300,
                  height: 300,
                  borderRadius: '50%',
                  border: `2px solid #10b981`,
                  transform: `translate(-50%, -50%) scale(${ringScale})`,
                  opacity: ringOpacity,
                  boxShadow: `0 0 40px #10b981`,
                  pointerEvents: 'none',
                }}
              />
            );
          })}

          <div
            style={{
              fontSize: 72,
              fontWeight: 900,
              background: 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: 20,
              filter: `drop-shadow(0 0 20px rgba(16, 185, 129, ${glowIntensity}))`,
              position: 'relative',
            }}
          >
            apottoが実現する3つの価値
          </div>
          <div
            style={{
              fontSize: 32,
              color: '#94a3b8',
              fontWeight: 600,
              position: 'relative',
            }}
          >
            営業活動を根本から変革
          </div>
        </div>

        {/* 3D Value Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 50,
            perspective: 2000,
          }}
        >
          {values.map((item, index) => {
            const IconComponent = item.icon;

            // Card entrance animation
            const cardOpacity = spring({
              frame: frame - item.delay,
              fps,
              from: 0,
              to: 1,
              config: {
                damping: 20,
                stiffness: 100,
              },
            });

            const cardY = spring({
              frame: frame - item.delay,
              fps,
              from: 150,
              to: 0,
              config: {
                damping: 25,
                stiffness: 80,
              },
            });

            const cardRotateX = spring({
              frame: frame - item.delay,
              fps,
              from: -90,
              to: 0,
              config: {
                damping: 20,
                stiffness: 100,
              },
            });

            const cardScale = spring({
              frame: frame - item.delay,
              fps,
              from: 0.5,
              to: 1,
              config: {
                damping: 12,
                stiffness: 150,
              },
            });

            // Hovering animation
            const hoverY = interpolate(
              Math.sin((frame - item.delay) * 0.08),
              [-1, 1],
              [-10, 10]
            );

            // Number count-up
            const numberProgress = spring({
              frame: frame - (item.delay + 20),
              fps,
              from: 0,
              to: 1,
              config: {
                damping: 30,
                stiffness: 60,
              },
            });

            const displayValue = item.value.includes('%')
              ? `${Math.floor(parseInt(item.value) * numberProgress)}%`
              : item.value.includes('倍')
              ? `${Math.floor(parseInt(item.value) * numberProgress)}倍`
              : item.value.includes('社')
              ? `${Math.floor(parseInt(item.value) * numberProgress)}社`
              : item.value;

            return (
              <div
                key={index}
                style={{
                  opacity: cardOpacity,
                  transform: `
                    translateY(${cardY + hoverY}px)
                    rotateX(${cardRotateX}deg)
                    scale(${cardScale})
                  `,
                  transformStyle: 'preserve-3d',
                }}
              >
                <div
                  style={{
                    background: `linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%)`,
                    borderRadius: 30,
                    padding: 50,
                    border: `2px solid ${item.color}`,
                    boxShadow: `
                      0 20px 60px rgba(0, 0, 0, 0.4),
                      0 0 60px ${item.color}${Math.floor(glowIntensity * 128).toString(16)},
                      inset 0 0 30px ${item.color}33
                    `,
                    backdropFilter: 'blur(20px)',
                    position: 'relative',
                    overflow: 'hidden',
                    transformStyle: 'preserve-3d',
                  }}
                >
                  {/* Animated background gradient */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: `radial-gradient(circle at ${50 + Math.sin(frame * 0.05) * 30}% ${50 + Math.cos(frame * 0.05) * 30}%,
                        ${item.color}22 0%,
                        transparent 60%)`,
                      opacity: glowIntensity,
                    }}
                  />

                  {/* Icon with 3D effect */}
                  <div
                    style={{
                      width: 100,
                      height: 100,
                      borderRadius: 25,
                      background: `linear-gradient(135deg, ${item.color}33 0%, ${item.color}22 100%)`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 30,
                      position: 'relative',
                      boxShadow: `
                        0 10px 30px ${item.color}66,
                        inset 0 0 20px ${item.color}33
                      `,
                      transform: `translateZ(30px)`,
                    }}
                  >
                    <IconComponent
                      size={56}
                      color={item.color}
                      weight="duotone"
                      style={{
                        filter: `drop-shadow(0 0 10px ${item.color})`,
                      }}
                    />
                  </div>

                  {/* Title */}
                  <div
                    style={{
                      fontSize: 36,
                      fontWeight: 900,
                      color: item.color,
                      marginBottom: 16,
                      textShadow: `0 0 20px ${item.color}`,
                      filter: `drop-shadow(0 0 10px ${item.color})`,
                      position: 'relative',
                    }}
                  >
                    {item.title}
                  </div>

                  {/* Description */}
                  <div
                    style={{
                      fontSize: 18,
                      color: '#94a3b8',
                      marginBottom: 30,
                      lineHeight: 1.6,
                      position: 'relative',
                    }}
                  >
                    {item.description}
                  </div>

                  {/* Big number with glow */}
                  <div
                    style={{
                      fontSize: 80,
                      fontWeight: 900,
                      color: 'white',
                      textAlign: 'center',
                      marginBottom: 12,
                      textShadow: `
                        0 0 30px ${item.color},
                        0 0 60px ${item.color},
                        0 4px 8px rgba(0,0,0,0.5)
                      `,
                      filter: `drop-shadow(0 0 20px ${item.color})`,
                      position: 'relative',
                      transform: `translateZ(20px)`,
                    }}
                  >
                    {displayValue}
                  </div>

                  {/* Label */}
                  <div
                    style={{
                      fontSize: 16,
                      color: '#64748b',
                      textAlign: 'center',
                      fontWeight: 600,
                      position: 'relative',
                    }}
                  >
                    {item.label}
                  </div>

                  {/* Particle effects */}
                  {[...Array(3)].map((_, i) => {
                    const particleY = interpolate(
                      (frame + i * 20) % 90,
                      [0, 90],
                      [100, -20]
                    );
                    return (
                      <div
                        key={i}
                        style={{
                          position: 'absolute',
                          bottom: `${particleY}%`,
                          left: `${20 + i * 30}%`,
                          width: 4,
                          height: 4,
                          borderRadius: '50%',
                          background: item.color,
                          boxShadow: `0 0 10px ${item.color}`,
                          opacity: particleY > 0 && particleY < 100 ? 0.6 : 0,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
