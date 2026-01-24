import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { TrendUp, Lightning, Users } from 'phosphor-react';
import { AnimatedBackground } from '../components/AnimatedBackground';

export const Scene9ROI: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Scene entrance transition: Digital scan + particles (0-40 frames)
  const sceneEntranceOpacity = interpolate(frame, [0, 40], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Horizontal scan line entrance
  const scanLineProgress = interpolate(frame, [0, 35], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const scanLineY = scanLineProgress * 100;

  // Hexagonal grid reveal
  const gridRevealProgress = interpolate(frame, [5, 35], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Energy burst at entrance
  const entranceBurstOpacity = interpolate(frame, [15, 25, 35], [0, 1, 0], {
    extrapolateRight: 'clamp',
  });

  const entranceBurstScale = interpolate(frame, [15, 35], [0.5, 3], {
    extrapolateRight: 'clamp',
  });

  // Title animation
  const titleOpacity = interpolate(frame, [20, 40], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const titleY = interpolate(frame, [20, 40], [50, 0], {
    extrapolateRight: 'clamp',
  });

  // Metrics
  const metrics = [
    {
      icon: Lightning,
      label: '営業時間削減',
      beforeValue: '10時間/日',
      afterValue: '2時間/日',
      improvement: '80%削減',
      color: '#10b981',
      delay: 50,
    },
    {
      icon: TrendUp,
      label: 'アポ獲得率',
      beforeValue: '5件/月',
      afterValue: '15件/月',
      improvement: '3倍向上',
      color: '#14b8a6',
      delay: 80,
    },
    {
      icon: Users,
      label: '月間アプローチ数',
      beforeValue: '50社',
      afterValue: '500社',
      improvement: '10倍拡大',
      color: '#059669',
      delay: 110,
    },
  ];

  // Pulsing glow
  const glowIntensity = interpolate(
    Math.sin(frame * 0.15),
    [-1, 1],
    [0.6, 1]
  );

  // Scene exit transition: Digital dissolve (380-420 frames)
  const sceneExitOpacity = interpolate(frame, [380, 415], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const exitPixelateProgress = interpolate(frame, [380, 410], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const exitGlitchIntensity = interpolate(frame, [380, 400], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const exitFlashOpacity = interpolate(frame, [400, 405, 410], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: 60,
      }}
    >
      <AnimatedBackground />

      {/* Entrance scan line effect (0-35 frames) */}
      {frame < 35 && (
        <>
          <div
            style={{
              position: 'absolute',
              top: `${scanLineY}%`,
              left: 0,
              right: 0,
              height: 3,
              background: 'linear-gradient(90deg, transparent, #10b981, transparent)',
              boxShadow: '0 0 20px #10b981, 0 0 40px #10b981',
              zIndex: 20,
            }}
          />
          {/* Reveal mask */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(to bottom, rgba(15, 23, 42, 1) 0%, rgba(15, 23, 42, 1) ${scanLineY - 5}%, transparent ${scanLineY}%)`,
              zIndex: 15,
            }}
          />
        </>
      )}

      {/* Hexagonal grid reveal (5-35 frames) */}
      {frame >= 5 && frame < 35 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `
              linear-gradient(30deg, #10b98122 1px, transparent 1px),
              linear-gradient(90deg, #10b98122 1px, transparent 1px),
              linear-gradient(150deg, #10b98122 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
            opacity: gridRevealProgress * 0.6,
            zIndex: 5,
            maskImage: `linear-gradient(to bottom, transparent 0%, black ${scanLineY}%)`,
          }}
        />
      )}

      {/* Energy burst at entrance (15-35 frames) */}
      {frame >= 15 && frame < 35 && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'radial-gradient(circle, #10b98188 0%, #10b98144 30%, transparent 70%)',
            transform: `translate(-50%, -50%) scale(${entranceBurstScale})`,
            opacity: entranceBurstOpacity,
            zIndex: 10,
            boxShadow: '0 0 100px #10b981',
          }}
        />
      )}

      {/* Exit digital dissolve particles (380-415 frames) */}
      {frame >= 380 && frame < 415 && (
        <>
          {[...Array(30)].map((_, i) => {
            const angle = (i / 30) * Math.PI * 2;
            const distance = exitPixelateProgress * 800;
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
                  background: '#10b981',
                  boxShadow: '0 0 10px #10b981',
                  transform: `translate(${x}px, ${y}px)`,
                  opacity: 1 - exitPixelateProgress,
                  zIndex: 25,
                }}
              />
            );
          })}
        </>
      )}

      {/* Exit flash (400-410 frames) */}
      {frame >= 400 && frame < 410 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle, #10b98199 0%, #10b98144 50%, transparent 100%)',
            opacity: exitFlashOpacity,
            zIndex: 30,
          }}
        />
      )}

      <div
        style={{
          maxWidth: 1500,
          width: '100%',
          position: 'relative',
          zIndex: 10,
          opacity: sceneEntranceOpacity * sceneExitOpacity,
          filter: frame >= 380 ? `blur(${exitGlitchIntensity * 5}px)` : undefined,
        }}
      >
        {/* Title */}
        <div
          style={{
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
            marginBottom: 80,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 900,
              background: 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: 16,
              filter: `drop-shadow(0 0 20px rgba(16, 185, 129, ${glowIntensity}))`,
            }}
          >
            導入後の成果
          </div>
          <div
            style={{
              fontSize: 32,
              color: '#94a3b8',
              fontWeight: 600,
            }}
          >
            実際のデータで証明された効果
          </div>
        </div>

        {/* Page-flip Metrics Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 50,
            perspective: 2000,
          }}
        >
          {metrics.map((metric, index) => {
            const IconComponent = metric.icon;

            // Card entrance with page flip animation
            const cardEntranceProgress = spring({
              frame: frame - metric.delay,
              fps,
              from: 0,
              to: 1,
              config: {
                damping: 20,
                stiffness: 80,
              },
            });

            // Page flip from 90deg (closed) to 0deg (open)
            const entranceFlipRotation = interpolate(
              cardEntranceProgress,
              [0, 1],
              [90, 0]
            );

            const cardOpacity = interpolate(
              cardEntranceProgress,
              [0, 0.3, 1],
              [0, 1, 1]
            );

            // BEFORE → AFTER page flip (starts 60 frames after entrance)
            const flipDelay = metric.delay + 60;
            const pageFlipProgress = spring({
              frame: frame - flipDelay,
              fps,
              from: 0,
              to: 1,
              config: {
                damping: 18,
                stiffness: 70,
              },
            });

            // Flip rotation: 0deg (BEFORE) → 180deg (AFTER)
            const flipRotation = interpolate(
              pageFlipProgress,
              [0, 1],
              [0, 180]
            );

            // Determine which side to show
            const isAfterState = flipRotation > 90;

            // Subtle lift during flip
            const liftY = interpolate(
              pageFlipProgress,
              [0, 0.5, 1],
              [0, -15, 0]
            );

            // Scale effect during flip
            const flipScale = interpolate(
              pageFlipProgress,
              [0, 0.5, 1],
              [1, 1.05, 1]
            );

            // Neon glow pulsing
            const neonPulse = interpolate(
              Math.sin((frame + index * 30) * 0.1),
              [-1, 1],
              [0.7, 1.3]
            );

            // Icon orbit rotation
            const iconOrbitAngle = (frame - metric.delay) * 2;

            return (
              <div
                key={index}
                style={{
                  opacity: cardOpacity,
                  transform: `translateY(${liftY}px) scale(${flipScale})`,
                  transformStyle: 'preserve-3d',
                  perspective: 1500,
                }}
              >
                {/* Card container with 3D flip */}
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: 480,
                    transformStyle: 'preserve-3d',
                    transform: `rotateY(${entranceFlipRotation + flipRotation}deg)`,
                  }}
                >
                  {/* BEFORE side (front) */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      backfaceVisibility: 'hidden',
                      background: `linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%)`,
                      borderRadius: 30,
                      padding: 45,
                      border: `3px solid #ef4444`,
                      boxShadow: `
                        0 40px 120px rgba(0, 0, 0, 0.8),
                        0 0 ${100 * neonPulse}px #ef4444${Math.floor(neonPulse * 150).toString(16)},
                        inset 0 0 ${60 * neonPulse}px #ef444433,
                        inset -10px -10px 40px rgba(0, 0, 0, 0.5)
                      `,
                      backdropFilter: 'blur(30px)',
                      transformStyle: 'preserve-3d',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Holographic grid background */}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundImage: `
                          linear-gradient(#ef444422 2px, transparent 2px),
                          linear-gradient(90deg, #ef444422 2px, transparent 2px)
                        `,
                        backgroundSize: '30px 30px',
                        opacity: 0.4,
                        pointerEvents: 'none',
                      }}
                    />

                    {/* Animated scan line */}
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: `${((frame * 3) % 480)}px`,
                        height: 2,
                        background: 'linear-gradient(90deg, transparent, #ef444488, transparent)',
                        boxShadow: '0 0 10px #ef4444',
                        opacity: 0.5,
                      }}
                    />

                    {/* BEFORE content */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        height: '100%',
                        justifyContent: 'space-between',
                      }}
                    >
                      {/* Status badge */}
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: '#ef4444',
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em',
                          textShadow: '0 0 15px #ef4444',
                          marginBottom: 20,
                        }}
                      >
                        BEFORE
                      </div>

                      {/* Icon with 3D depth */}
                      <div
                        style={{
                          width: 90,
                          height: 90,
                          borderRadius: 22,
                          background: 'linear-gradient(135deg, #ef444444 0%, #ef444422 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginBottom: 30,
                          boxShadow: `
                            0 ${20 * neonPulse}px ${60 * neonPulse}px #ef444488,
                            inset 0 0 ${40 * neonPulse}px #ef444433,
                            inset -5px -5px 20px rgba(0, 0, 0, 0.5)
                          `,
                          border: `3px solid #ef4444${Math.floor(neonPulse * 200).toString(16)}`,
                          position: 'relative',
                          transform: `translateZ(${30 * neonPulse}px)`,
                        }}
                      >
                        <IconComponent
                          size={48}
                          color="#ef4444"
                          weight="duotone"
                          style={{
                            filter: `drop-shadow(0 0 ${20 * neonPulse}px #ef4444) brightness(${neonPulse})`,
                            transform: `scale(${neonPulse})`,
                          }}
                        />

                        {/* Orbiting particles */}
                        {[0, 1, 2].map((orbit) => {
                          const angle = iconOrbitAngle + orbit * 120;
                          const radius = 50;
                          const x = Math.cos(angle * Math.PI / 180) * radius;
                          const y = Math.sin(angle * Math.PI / 180) * radius;

                          return (
                            <div
                              key={orbit}
                              style={{
                                position: 'absolute',
                                left: `calc(50% + ${x}px)`,
                                top: `calc(50% + ${y}px)`,
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: '#ef4444',
                                boxShadow: `0 0 ${15 * neonPulse}px #ef4444`,
                                opacity: 0.8,
                              }}
                            />
                          );
                        })}
                      </div>

                      {/* Label */}
                      <div
                        style={{
                          fontSize: 28,
                          fontWeight: 700,
                          color: '#e2e8f0',
                          marginBottom: 24,
                        }}
                      >
                        {metric.label}
                      </div>

                      {/* Value with Neon effect */}
                      <div
                        style={{
                          fontSize: 56,
                          fontWeight: 900,
                          color: 'white',
                          textShadow: `
                            0 0 ${40 * neonPulse}px #ef4444,
                            0 0 ${80 * neonPulse}px #ef4444,
                            0 0 ${120 * neonPulse}px #ef444488,
                            0 5px 15px rgba(0, 0, 0, 0.8)
                          `,
                          filter: `drop-shadow(0 0 ${35 * neonPulse}px #ef4444) brightness(${1 + (neonPulse - 1) * 0.3})`,
                          textAlign: 'center',
                          marginTop: 'auto',
                          transform: `scale(${1 + (neonPulse - 1) * 0.05})`,
                          letterSpacing: '0.05em',
                        }}
                      >
                        {metric.beforeValue}
                      </div>
                    </div>
                  </div>

                  {/* AFTER side (back) */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      backfaceVisibility: 'hidden',
                      transform: 'rotateY(180deg)',
                      background: `linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%)`,
                      borderRadius: 30,
                      padding: 45,
                      border: `3px solid ${metric.color}`,
                      boxShadow: `
                        0 40px 120px rgba(0, 0, 0, 0.8),
                        0 0 ${100 * neonPulse}px ${metric.color}${Math.floor(neonPulse * 150).toString(16)},
                        inset 0 0 ${60 * neonPulse}px ${metric.color}33,
                        inset -10px -10px 40px rgba(0, 0, 0, 0.5)
                      `,
                      backdropFilter: 'blur(30px)',
                      transformStyle: 'preserve-3d',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Holographic grid background */}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundImage: `
                          linear-gradient(${metric.color}22 2px, transparent 2px),
                          linear-gradient(90deg, ${metric.color}22 2px, transparent 2px)
                        `,
                        backgroundSize: '30px 30px',
                        opacity: 0.4,
                        pointerEvents: 'none',
                      }}
                    />

                    {/* Animated scan line */}
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: `${((frame * 3) % 480)}px`,
                        height: 2,
                        background: `linear-gradient(90deg, transparent, ${metric.color}88, transparent)`,
                        boxShadow: `0 0 10px ${metric.color}`,
                        opacity: 0.5,
                      }}
                    />

                    {/* AFTER content */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        height: '100%',
                        justifyContent: 'space-between',
                      }}
                    >
                      {/* Status badge */}
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: metric.color,
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em',
                          textShadow: `0 0 15px ${metric.color}`,
                          marginBottom: 20,
                        }}
                      >
                        AFTER
                      </div>

                      {/* Icon with 3D depth */}
                      <div
                        style={{
                          width: 90,
                          height: 90,
                          borderRadius: 22,
                          background: `linear-gradient(135deg, ${metric.color}44 0%, ${metric.color}22 100%)`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginBottom: 30,
                          boxShadow: `
                            0 ${20 * neonPulse}px ${60 * neonPulse}px ${metric.color}88,
                            inset 0 0 ${40 * neonPulse}px ${metric.color}33,
                            inset -5px -5px 20px rgba(0, 0, 0, 0.5)
                          `,
                          border: `3px solid ${metric.color}${Math.floor(neonPulse * 200).toString(16)}`,
                          position: 'relative',
                          transform: `translateZ(${30 * neonPulse}px)`,
                        }}
                      >
                        <IconComponent
                          size={48}
                          color={metric.color}
                          weight="duotone"
                          style={{
                            filter: `drop-shadow(0 0 ${20 * neonPulse}px ${metric.color}) brightness(${neonPulse})`,
                            transform: `scale(${neonPulse})`,
                          }}
                        />

                        {/* Orbiting particles */}
                        {[0, 1, 2].map((orbit) => {
                          const angle = iconOrbitAngle + orbit * 120;
                          const radius = 50;
                          const x = Math.cos(angle * Math.PI / 180) * radius;
                          const y = Math.sin(angle * Math.PI / 180) * radius;

                          return (
                            <div
                              key={orbit}
                              style={{
                                position: 'absolute',
                                left: `calc(50% + ${x}px)`,
                                top: `calc(50% + ${y}px)`,
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: metric.color,
                                boxShadow: `0 0 ${15 * neonPulse}px ${metric.color}`,
                                opacity: 0.8,
                              }}
                            />
                          );
                        })}
                      </div>

                      {/* Label */}
                      <div
                        style={{
                          fontSize: 28,
                          fontWeight: 700,
                          color: '#e2e8f0',
                          marginBottom: 24,
                        }}
                      >
                        {metric.label}
                      </div>

                      {/* Value with Neon effect */}
                      <div
                        style={{
                          fontSize: 56,
                          fontWeight: 900,
                          color: 'white',
                          textShadow: `
                            0 0 ${40 * neonPulse}px ${metric.color},
                            0 0 ${80 * neonPulse}px ${metric.color},
                            0 0 ${120 * neonPulse}px ${metric.color}88,
                            0 5px 15px rgba(0, 0, 0, 0.8)
                          `,
                          filter: `drop-shadow(0 0 ${35 * neonPulse}px ${metric.color}) brightness(${1 + (neonPulse - 1) * 0.3})`,
                          textAlign: 'center',
                          marginBottom: 16,
                          transform: `scale(${1 + (neonPulse - 1) * 0.05})`,
                          letterSpacing: '0.05em',
                        }}
                      >
                        {metric.afterValue}
                      </div>

                      {/* Improvement badge */}
                      <div
                        style={{
                          display: 'inline-block',
                          alignSelf: 'center',
                          padding: '12px 28px',
                          background: `linear-gradient(135deg, ${metric.color} 0%, ${metric.color}dd 100%)`,
                          borderRadius: 16,
                          fontSize: 24,
                          fontWeight: 900,
                          color: 'white',
                          boxShadow: `
                            0 0 30px ${metric.color},
                            inset 0 0 20px rgba(255, 255, 255, 0.2)
                          `,
                          border: '2px solid rgba(255, 255, 255, 0.3)',
                        }}
                      >
                        ↑ {metric.improvement}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom stats */}
        <div
          style={{
            marginTop: 80,
            display: 'flex',
            justifyContent: 'center',
            gap: 100,
          }}
        >
          {[
            { value: '10万件+', label: '累計送信数' },
            { value: '98%', label: '顧客満足度' },
          ].map((stat, index) => {
            const statOpacity = spring({
              frame: frame - (280 + index * 15),
              fps,
              from: 0,
              to: 1,
              config: {
                damping: 20,
                stiffness: 100,
              },
            });

            const statY = spring({
              frame: frame - (280 + index * 15),
              fps,
              from: 50,
              to: 0,
              config: {
                damping: 20,
                stiffness: 100,
              },
            });

            return (
              <div
                key={index}
                style={{
                  opacity: statOpacity,
                  transform: `translateY(${statY}px)`,
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: 56,
                    fontWeight: 900,
                    background: 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    marginBottom: 8,
                    filter: `drop-shadow(0 0 20px rgba(16, 185, 129, ${glowIntensity}))`,
                  }}
                >
                  {stat.value}
                </div>
                <div
                  style={{
                    fontSize: 20,
                    color: '#94a3b8',
                    fontWeight: 600,
                  }}
                >
                  {stat.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
