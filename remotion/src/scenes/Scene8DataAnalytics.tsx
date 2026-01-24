import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { ChartBar, ChartPie, TrendUp } from 'phosphor-react';
import { AnimatedBackground } from '../components/AnimatedBackground';

export const Scene8DataAnalytics: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title animation
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const titleY = interpolate(frame, [0, 20], [30, 0], {
    extrapolateRight: 'clamp',
  });

  // 3D Camera movement - from bottom looking up
  const cameraRotateX = spring({
    frame: frame - 15,
    fps,
    from: -40,
    to: -8,
    config: {
      damping: 30,
      stiffness: 70,
    },
  });

  const cameraScale = spring({
    frame: frame - 15,
    fps,
    from: 0.8,
    to: 1,
    config: {
      damping: 30,
      stiffness: 70,
    },
  });

  // Pulsing glow effect
  const glowIntensity = interpolate(
    Math.sin(frame * 0.15),
    [-1, 1],
    [0.6, 1]
  );

  // Light wave animation
  const lightWave = interpolate(frame, [0, 60], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Scene exit transition: Digital particle burst (210-240)
  const sceneExitOpacity = interpolate(frame, [210, 238], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const sceneExitScale = interpolate(frame, [210, 235], [1, 0.9], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const exitBlurIntensity = interpolate(frame, [215, 235], [0, 8], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Particle explosion progress
  const exitParticleProgress = interpolate(frame, [215, 240], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Energy flash pulse
  const exitFlashIntensity = interpolate(frame, [225, 230, 235], [0, 1.5, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Bar chart data - representing interest levels
  const barData = [
    { label: '高関心', value: 85, color: '#10b981' },
    { label: '中関心', value: 60, color: '#14b8a6' },
    { label: '低関心', value: 30, color: '#64748b' },
  ];

  // Pie chart data
  const pieData = [
    { label: '即対応', value: 35, color: '#10b981' },
    { label: '育成', value: 45, color: '#14b8a6' },
    { label: 'アプローチ', value: 20, color: '#06b6d4' },
  ];

  // Animated bar heights with rotation
  const getBarHeight = (targetHeight: number, delay: number) => {
    return spring({
      frame: frame - delay,
      fps,
      from: 0,
      to: targetHeight,
      config: {
        damping: 20,
        stiffness: 100,
      },
    });
  };

  // Bar entrance animation
  const getBarEntrance = (delay: number) => {
    return {
      opacity: spring({
        frame: frame - delay,
        fps,
        from: 0,
        to: 1,
        config: {
          damping: 25,
          stiffness: 80,
        },
      }),
      scale: spring({
        frame: frame - delay,
        fps,
        from: 0,
        to: 1,
        config: {
          damping: 12,
          stiffness: 150,
        },
      }),
      rotateY: spring({
        frame: frame - delay,
        fps,
        from: 90,
        to: 0,
        config: {
          damping: 20,
          stiffness: 80,
        },
      }),
      translateY: spring({
        frame: frame - delay,
        fps,
        from: 100,
        to: 0,
        config: {
          damping: 20,
          stiffness: 100,
        },
      }),
    };
  };

  // Features animation
  const features = [
    { icon: ChartBar, text: '興味関心度を自動スコアリング', delay: 40 },
    { icon: ChartPie, text: 'セグメント別アプローチ提案', delay: 50 },
    { icon: TrendUp, text: 'リアルタイムで効果測定', delay: 60 },
  ];

  const getFeatureOpacity = (delay: number) => {
    return interpolate(frame, [delay, delay + 15], [0, 1], {
      extrapolateRight: 'clamp',
    });
  };

  const getFeatureX = (delay: number) => {
    return interpolate(frame, [delay, delay + 15], [50, 0], {
      extrapolateRight: 'clamp',
    });
  };

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

      {/* Digital particle burst exit (215-240 frames) */}
      {frame >= 215 && frame < 240 && (
        <>
          {/* Particle explosion */}
          {[...Array(40)].map((_, i) => {
            const angle = (i / 40) * Math.PI * 2;
            const speed = 1 + (i % 3) * 0.3;
            const distance = exitParticleProgress * 600 * speed;
            const x = Math.cos(angle) * distance;
            const y = Math.sin(angle) * distance;
            const size = 4 + (i % 3) * 2;

            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: size,
                  height: size,
                  background: '#10b981',
                  boxShadow: `0 0 ${size * 3}px #10b981`,
                  transform: `translate(${x}px, ${y}px)`,
                  opacity: 1 - exitParticleProgress,
                  zIndex: 25,
                  borderRadius: '50%',
                }}
              />
            );
          })}

          {/* Energy wave rings */}
          {[0, 1, 2].map((ring) => {
            const ringDelay = ring * 0.2;
            const ringProgress = Math.max(0, Math.min(1, (exitParticleProgress - ringDelay) / 0.6));
            const ringScale = interpolate(ringProgress, [0, 1], [0.5, 4]);
            const ringOpacity = interpolate(ringProgress, [0, 0.3, 1], [0, 0.8, 0]);

            return (
              <div
                key={ring}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: 300,
                  height: 300,
                  borderRadius: '50%',
                  border: '3px solid #10b981',
                  transform: `translate(-50%, -50%) scale(${ringScale})`,
                  opacity: ringOpacity,
                  boxShadow: '0 0 40px #10b981, inset 0 0 40px #10b981',
                  zIndex: 20,
                }}
              />
            );
          })}

          {/* Energy flash burst */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle, #10b98199 0%, #10b98144 40%, transparent 70%)',
              opacity: exitFlashIntensity,
              zIndex: 30,
            }}
          />
        </>
      )}

      <div
        style={{
          maxWidth: 1400,
          width: '100%',
          position: 'relative',
          zIndex: 10,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 80,
          alignItems: 'center',
          perspective: 2000,
          opacity: sceneExitOpacity,
          transform: `scale(${sceneExitScale})`,
          filter: frame >= 215 ? `blur(${exitBlurIntensity}px)` : undefined,
        }}
      >
        {/* Left: 3D Graphs */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 50,
            perspective: 1200,
            transformStyle: 'preserve-3d',
            transform: `rotateX(${cameraRotateX}deg) scale(${cameraScale})`,
          }}
        >
          {/* 3D Bar Chart */}
          <div
            style={{
              transformStyle: 'preserve-3d',
            }}
          >
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                padding: 35,
                borderRadius: 30,
                border: `2px solid rgba(16, 185, 129, ${0.3 * glowIntensity})`,
                backdropFilter: 'blur(30px)',
                boxShadow: `0 20px 80px rgba(16, 185, 129, ${0.3 * glowIntensity})`,
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 900,
                  background: 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  marginBottom: 30,
                  textAlign: 'center',
                  filter: `drop-shadow(0 0 10px rgba(16, 185, 129, ${glowIntensity}))`,
                }}
              >
                関心度分析
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'space-around',
                  gap: 30,
                  height: 220,
                  position: 'relative',
                }}
              >
                {barData.map((bar, index) => {
                  const entranceDelay = 10 + index * 5;
                  const entrance = getBarEntrance(entranceDelay);
                  const height = getBarHeight(bar.value * 2.2, 15 + index * 5);
                  const displayValue = Math.floor(interpolate(
                    height,
                    [0, bar.value * 2.2],
                    [0, bar.value],
                    { extrapolateRight: 'clamp' }
                  ));

                  // Light wave position
                  const wavePosition = interpolate(
                    frame,
                    [15 + index * 5, 40 + index * 5],
                    [0, 1],
                    { extrapolateRight: 'clamp' }
                  );

                  return (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 16,
                        flex: 1,
                        opacity: entrance.opacity,
                        transform: `
                          scale(${entrance.scale})
                          rotateY(${entrance.rotateY}deg)
                          translateY(${entrance.translateY}px)
                        `,
                        transformStyle: 'preserve-3d',
                      }}
                    >
                      {/* 3D Cyalume Bar */}
                      <div style={{ position: 'relative', width: '100%', transformStyle: 'preserve-3d' }}>
                        {/* Main glowing bar */}
                        <div
                          style={{
                            width: '100%',
                            height: height,
                            background: `linear-gradient(to bottom,
                              rgba(16, 185, 129, 0.2) 0%,
                              ${bar.color} 40%,
                              ${bar.color} 60%,
                              rgba(16, 185, 129, 0.3) 100%)`,
                            borderRadius: '16px',
                            position: 'relative',
                            overflow: 'hidden',
                            border: `2px solid ${bar.color}`,
                            boxShadow: `
                              0 0 40px ${bar.color}${Math.floor(glowIntensity * 255).toString(16)},
                              0 0 80px ${bar.color}${Math.floor(glowIntensity * 128).toString(16)},
                              inset 0 0 30px rgba(16, 185, 129, 0.5)
                            `,
                          }}
                        >
                          {/* Rising light wave */}
                          <div
                            style={{
                              position: 'absolute',
                              bottom: `${wavePosition * 100}%`,
                              left: 0,
                              right: 0,
                              height: '80%',
                              background: `linear-gradient(to bottom,
                                rgba(255, 255, 255, 0.8) 0%,
                                rgba(16, 185, 129, 0.6) 20%,
                                transparent 100%)`,
                              filter: 'blur(20px)',
                              opacity: wavePosition < 1 ? 1 : 0,
                            }}
                          />

                          {/* Pulsing glow layers */}
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              background: `radial-gradient(circle at 50% 50%,
                                rgba(255, 255, 255, ${0.3 * glowIntensity}) 0%,
                                transparent 60%)`,
                              animation: 'pulse 2s ease-in-out infinite',
                            }}
                          />

                          {/* Animated particles */}
                          {[...Array(5)].map((_, i) => {
                            const particleY = interpolate(
                              (frame + i * 10) % 60,
                              [0, 60],
                              [100, -20]
                            );
                            return (
                              <div
                                key={i}
                                style={{
                                  position: 'absolute',
                                  bottom: `${particleY}%`,
                                  left: `${20 + i * 15}%`,
                                  width: 6,
                                  height: 6,
                                  borderRadius: '50%',
                                  background: 'rgba(255, 255, 255, 0.9)',
                                  boxShadow: `0 0 10px ${bar.color}`,
                                  opacity: particleY > 0 && particleY < 100 ? 1 : 0,
                                }}
                              />
                            );
                          })}

                          {/* Count-up number */}
                          <div
                            style={{
                              position: 'absolute',
                              top: 14,
                              left: 0,
                              right: 0,
                              fontSize: 40,
                              fontWeight: 900,
                              color: 'white',
                              textShadow: `
                                0 0 20px ${bar.color},
                                0 0 40px ${bar.color},
                                0 2px 4px rgba(0,0,0,0.5)
                              `,
                              textAlign: 'center',
                              filter: `drop-shadow(0 0 10px ${bar.color})`,
                            }}
                          >
                            {displayValue}%
                          </div>
                        </div>

                        {/* Reflection/shadow on ground */}
                        <div
                          style={{
                            position: 'absolute',
                            bottom: -10,
                            left: '10%',
                            right: '10%',
                            height: 20,
                            background: `radial-gradient(ellipse at center,
                              ${bar.color}66 0%,
                              transparent 70%)`,
                            filter: 'blur(8px)',
                            opacity: glowIntensity,
                          }}
                        />
                      </div>

                      {/* Label with enhanced glow */}
                      <div
                        style={{
                          fontSize: 24,
                          fontWeight: 900,
                          color: 'white',
                          textAlign: 'center',
                          textShadow: `
                            0 0 20px ${bar.color},
                            0 2px 8px rgba(0,0,0,0.8),
                            0 0 40px ${bar.color}
                          `,
                          filter: `drop-shadow(0 0 12px ${bar.color})`,
                          WebkitTextStroke: `1px ${bar.color}`,
                          letterSpacing: '0.02em',
                          marginTop: 8,
                        }}
                      >
                        {bar.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Glowing Stats Cards */}
          <div
            style={{
              transformStyle: 'preserve-3d',
            }}
          >
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                padding: 35,
                borderRadius: 30,
                border: `2px solid rgba(16, 185, 129, ${0.3 * glowIntensity})`,
                backdropFilter: 'blur(30px)',
                boxShadow: `0 20px 80px rgba(16, 185, 129, ${0.3 * glowIntensity})`,
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 900,
                  background: 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  marginBottom: 30,
                  textAlign: 'center',
                  filter: `drop-shadow(0 0 10px rgba(16, 185, 129, ${glowIntensity}))`,
                }}
              >
                アプローチ戦略
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {pieData.map((segment, index) => {
                  const cardDelay = 25 + index * 5;

                  const cardOpacity = spring({
                    frame: frame - cardDelay,
                    fps,
                    from: 0,
                    to: 1,
                    config: {
                      damping: 20,
                      stiffness: 100,
                    },
                  });

                  const cardScale = spring({
                    frame: frame - cardDelay,
                    fps,
                    from: 0.5,
                    to: 1,
                    config: {
                      damping: 15,
                      stiffness: 120,
                    },
                  });

                  const cardRotate = spring({
                    frame: frame - cardDelay,
                    fps,
                    from: -15,
                    to: 0,
                    config: {
                      damping: 20,
                      stiffness: 100,
                    },
                  });

                  const progressWidth = spring({
                    frame: frame - (cardDelay + 5),
                    fps,
                    from: 0,
                    to: segment.value,
                    config: {
                      damping: 25,
                      stiffness: 80,
                    },
                  });

                  const displayNumber = Math.floor(progressWidth);

                  return (
                    <div
                      key={index}
                      style={{
                        opacity: cardOpacity,
                        transform: `
                          translateX(${(1 - cardOpacity) * 80}px)
                          scale(${cardScale})
                          rotateZ(${cardRotate}deg)
                        `,
                        transformOrigin: 'left center',
                      }}
                    >
                      <div
                        style={{
                          padding: 22,
                          background: `linear-gradient(135deg, ${segment.color}22 0%, ${segment.color}11 100%)`,
                          borderRadius: 18,
                          border: `2px solid ${segment.color}`,
                          position: 'relative',
                          overflow: 'hidden',
                          boxShadow: `
                            0 0 30px ${segment.color}${Math.floor(glowIntensity * 128).toString(16)},
                            inset 0 0 20px ${segment.color}33
                          `,
                        }}
                      >
                        {/* Progress bar background */}
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: `${progressWidth}%`,
                            background: `linear-gradient(90deg,
                              ${segment.color}44 0%,
                              ${segment.color}66 50%,
                              ${segment.color}44 100%)`,
                            boxShadow: `0 0 20px ${segment.color}`,
                          }}
                        />

                        {/* Animated shimmer */}
                        <div
                          style={{
                            position: 'absolute',
                            left: `${lightWave * 120 - 20}%`,
                            top: 0,
                            bottom: 0,
                            width: '40%',
                            background: `linear-gradient(90deg,
                              transparent 0%,
                              rgba(255, 255, 255, 0.3) 50%,
                              transparent 100%)`,
                            filter: 'blur(10px)',
                            opacity: progressWidth > 10 ? 1 : 0,
                          }}
                        />

                        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div
                            style={{
                              fontSize: 28,
                              fontWeight: 900,
                              color: 'white',
                              textShadow: `
                                0 0 20px ${segment.color},
                                0 2px 8px rgba(0,0,0,0.8),
                                0 0 40px ${segment.color}
                              `,
                              filter: `drop-shadow(0 0 12px ${segment.color})`,
                              WebkitTextStroke: `1px ${segment.color}`,
                              letterSpacing: '0.02em',
                            }}
                          >
                            {segment.label}
                          </div>
                          <div
                            style={{
                              fontSize: 42,
                              fontWeight: 900,
                              color: 'white',
                              textShadow: `
                                0 0 25px ${segment.color},
                                0 0 50px ${segment.color},
                                0 3px 6px rgba(0,0,0,0.8)
                              `,
                              filter: `drop-shadow(0 0 15px ${segment.color})`,
                            }}
                          >
                            {displayNumber}%
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Description */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 50 }}>
          {/* Title */}
          <div
            style={{
              opacity: titleOpacity,
              transform: `translateY(${titleY}px)`,
            }}
          >
            <div
              style={{
                fontSize: 64,
                fontWeight: 900,
                background: 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                marginBottom: 20,
                lineHeight: 1.2,
              }}
            >
              データ分析で
              <br />
              精度の高いアプローチ
            </div>
            <div
              style={{
                fontSize: 28,
                color: '#94a3b8',
                fontWeight: 600,
              }}
            >
              関心度を可視化し、最適な営業戦略を自動提案
            </div>
          </div>

          {/* Features */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {features.map((feature, index) => {
              const IconComponent = feature.icon;
              return (
                <div
                  key={index}
                  style={{
                    opacity: getFeatureOpacity(feature.delay),
                    transform: `translateX(${getFeatureX(feature.delay)}px)`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 20,
                    padding: 24,
                    background: 'rgba(30, 41, 59, 0.5)',
                    borderRadius: 16,
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 14,
                      background: 'rgba(16, 185, 129, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      flexShrink: 0,
                    }}
                  >
                    <IconComponent size={28} color="#10b981" weight="duotone" />
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: '#e2e8f0',
                    }}
                  >
                    {feature.text}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
