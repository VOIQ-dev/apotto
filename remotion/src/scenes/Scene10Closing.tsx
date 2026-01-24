import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { AnimatedBackground } from '../components/AnimatedBackground';

export const Scene10Closing: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Scene entrance with energy burst (0-40 frames)
  const sceneEntranceOpacity = interpolate(frame, [0, 40], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Energy burst rings
  const burstProgress = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Logo parts appear (except 'o')
  const logoPartsOpacity = interpolate(frame, [10, 30], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const logoPartsScale = spring({
    frame: frame - 10,
    fps,
    from: 0.8,
    to: 1,
    config: {
      damping: 20,
      stiffness: 100,
    },
  });

  // Rolling 'o' animation from right (starts at frame 35)
  const rollTime = Math.max(0, frame - 35);

  // Physics-based rolling and collision animation (Disney-style)
  let oX = 800; // 最初は画面外右側
  let oY = 20; // 下に20px移動
  let oRotation = 0;
  let oScaleX = 1;
  let oScaleY = 1;

  if (rollTime >= 0) {
    // Rolling from right with anticipation (0-22 frames)
    if (rollTime < 22) {
      const t = rollTime / 22;
      // Roll from far right (800px) to collision point (100px from final position)
      oX = interpolate(t, [0, 1], [800, 100], {
        easing: (t) => 1 - Math.pow(1 - t, 3), // Ease-out cubic
      });
      oY = 20; // 下に20px移動
      // Rotation while rolling (counter-clockwise)
      oRotation = -(t * 360 * 2.5); // 2.5 full rotations
      // Slight squash while rolling
      oScaleX = 1 + Math.sin(t * Math.PI * 5) * 0.05;
      oScaleY = 1 - Math.sin(t * Math.PI * 5) * 0.05;
    }
    // Collision impact - squash (22-25 frames)
    else if (rollTime < 25) {
      const t = (rollTime - 22) / 3;
      oX = 100;
      oY = interpolate(t, [0, 1], [20, 25]); // 下に移動
      oRotation = -900;
      // Heavy squash on impact
      oScaleX = interpolate(t, [0, 1], [1, 1.3]);
      oScaleY = interpolate(t, [0, 1], [1, 0.7]);
    }
    // Bounce back with stretch (25-32 frames)
    else if (rollTime < 32) {
      const t = (rollTime - 25) / 7;
      // Bounce back and up
      oX = interpolate(t, [0, 0.5, 1], [100, 130, 120]);
      oY = interpolate(t, [0, 0.5, 1], [25, -20, 5], {
        easing: (t) => Math.sin(t * Math.PI),
      });
      oRotation = -900 + t * 180;
      // Stretch during bounce
      oScaleX = interpolate(t, [0, 0.3, 1], [1.3, 0.8, 1]);
      oScaleY = interpolate(t, [0, 0.3, 1], [0.7, 1.2, 1]);
    }
    // Second bounce (32-40 frames)
    else if (rollTime < 40) {
      const t = (rollTime - 32) / 8;
      oX = interpolate(t, [0, 0.5, 1], [120, 110, 105]);
      oY = interpolate(t, [0, 0.5, 1], [5, 12, 20], {
        easing: (t) => Math.sin(t * Math.PI),
      });
      oRotation = -900 + 180 + t * 120;
      oScaleX = interpolate(t, [0, 0.5, 1], [1, 0.9, 1]);
      oScaleY = interpolate(t, [0, 0.5, 1], [1, 1.1, 1]);
    }
    // Final settle and roll to position (40-50 frames)
    else if (rollTime < 50) {
      const t = (rollTime - 40) / 10;
      oX = interpolate(t, [0, 1], [105, 0], {
        easing: (t) => 1 - Math.pow(1 - t, 2),
      });
      oY = 20; // 下に20px移動
      oRotation = -900 + 180 + 120 + t * 60;
      oScaleX = 1;
      oScaleY = 1;
    }
    // Settled
    else {
      oX = 0;
      oY = 34; // 下に20px移動
      oRotation = -900 + 180 + 120 + 60;
      oScaleX = 1;
      oScaleY = 1;
    }
  }

  // Last 't' wobble animation when hit (frame 57 = 35 + 22) - Disney-style
  const tWobbleTime = Math.max(0, frame - 57);
  let tRotation = 0;
  let tX = 0;
  let tScaleX = 1;
  let tScaleY = 1;

  if (tWobbleTime >= 0 && tWobbleTime < 25) {
    if (tWobbleTime < 3) {
      // Anticipation - slight compression
      const t = tWobbleTime / 3;
      tRotation = 0;
      tX = 0;
      tScaleX = interpolate(t, [0, 1], [1, 1.1]);
      tScaleY = interpolate(t, [0, 1], [1, 0.9]);
    }
    else if (tWobbleTime < 8) {
      // Strong push with squash
      const t = (tWobbleTime - 3) / 5;
      tRotation = interpolate(t, [0, 1], [0, -15]);
      tX = interpolate(t, [0, 1], [0, -25]);
      tScaleX = interpolate(t, [0, 1], [1.1, 0.85]);
      tScaleY = interpolate(t, [0, 1], [0.9, 1.15]);
    }
    else if (tWobbleTime < 13) {
      // Overshoot bounce back with stretch
      const t = (tWobbleTime - 8) / 5;
      tRotation = interpolate(t, [0, 1], [-15, 8]);
      tX = interpolate(t, [0, 1], [-25, 10]);
      tScaleX = interpolate(t, [0, 1], [0.85, 1.1]);
      tScaleY = interpolate(t, [0, 1], [1.15, 0.9]);
    }
    else if (tWobbleTime < 18) {
      // Second smaller wobble
      const t = (tWobbleTime - 13) / 5;
      tRotation = interpolate(t, [0, 1], [8, -3]);
      tX = interpolate(t, [0, 1], [10, -5]);
      tScaleX = interpolate(t, [0, 1], [1.1, 0.95]);
      tScaleY = interpolate(t, [0, 1], [0.9, 1.05]);
    }
    else {
      // Final settle
      const t = (tWobbleTime - 18) / 7;
      tRotation = interpolate(t, [0, 1], [-3, 0]);
      tX = interpolate(t, [0, 1], [-5, 0]);
      tScaleX = interpolate(t, [0, 1], [0.95, 1]);
      tScaleY = interpolate(t, [0, 1], [1.05, 1]);
    }
  }

  // Impact effect when 'o' hits last 't' (frame 57 = 35 + 22)
  const collisionImpact = interpolate(frame, [57, 60, 64], [0, 1, 0], {
    extrapolateRight: 'clamp',
  });

  // Small bounce impact (frame 60 = 35 + 25)
  const bounceImpact = interpolate(frame, [60, 63, 66], [0, 0.5, 0], {
    extrapolateRight: 'clamp',
  });

  // Combined impact flash
  const impactFlash = Math.max(collisionImpact, bounceImpact);

  // CTA fade in (after 'o' settles at frame 80)
  const ctaOpacity = interpolate(frame, [85, 105], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const ctaY = interpolate(frame, [85, 105], [30, 0], {
    extrapolateRight: 'clamp',
  });

  // "新規開拓をラクに強く" - 文字が弾けて登場 + 光が走る
  const taglineText = '新規開拓をラクに強く';
  const taglineChars = taglineText.split('');

  // 光が走るアニメーション
  const shineProgress = interpolate(frame, [85, 110], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const shineX = interpolate(shineProgress, [0, 1], [-100, 200]);

  // ボタン - ホログラム風 + 磁力効果
  const buttonProgress = interpolate(frame, [100, 125], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const buttonScale = spring({
    frame: frame - 100,
    fps,
    from: 0.8,
    to: 1,
    config: {
      damping: 10,
      stiffness: 120,
    },
  });

  const buttonRotateX = interpolate(buttonProgress, [0, 1], [15, 0], {
    easing: (t) => 1 - Math.pow(1 - t, 2),
  });

  const buttonY = interpolate(buttonProgress, [0, 1], [50, 0], {
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });

  const buttonOpacity = interpolate(buttonProgress, [0, 0.3, 1], [0, 0.7, 1]);

  // ホログラム風のグラデーションシフト
  const hologramHue = interpolate(Math.sin(frame * 0.08), [-1, 1], [160, 180]);

  // パルスエフェクト
  const buttonPulse = Math.sin(frame * 0.15) * 0.03;

  // マグネット風の引き寄せエフェクト
  const magneticPull = interpolate(frame, [100, 115], [1, 0], {
    extrapolateRight: 'clamp',
  }) * 8;

  // apotto.ai - ストリーミング受信風（1文字ずつ）
  const urlText = 'apotto.ai';
  const urlProgress = Math.floor(interpolate(frame, [140, 170], [0, urlText.length], {
    extrapolateRight: 'clamp',
  }));
  const cursorBlink = Math.floor(frame / 20) % 2 === 0;

  // Glow pulsing
  const glowIntensity = interpolate(
    Math.sin(frame * 0.1),
    [-1, 1],
    [0.7, 1]
  );

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

      {/* Energy burst rings at entrance (0-30 frames) */}
      {frame < 30 && (
        <>
          {[0, 1, 2].map((ring) => {
            const ringDelay = ring * 0.15;
            const ringProgress = Math.max(0, Math.min(1, (burstProgress - ringDelay) / 0.6));
            const ringScale = interpolate(ringProgress, [0, 1], [0.5, 4]);
            const ringOpacity = interpolate(ringProgress, [0, 0.3, 1], [0, 0.8, 0]);

            return (
              <div
                key={ring}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: 400,
                  height: 400,
                  borderRadius: '50%',
                  border: '3px solid #10b981',
                  transform: `translate(-50%, -50%) scale(${ringScale})`,
                  opacity: ringOpacity,
                  boxShadow: '0 0 60px #10b981, inset 0 0 60px #10b981',
                  zIndex: 5,
                }}
              />
            );
          })}
        </>
      )}

      {/* Shockwave rings at collision (frame 57-64) */}
      {frame >= 57 && frame < 67 && (
        <>
          {[0, 1, 2].map((ring) => {
            const ringDelay = ring * 0.1;
            const ringProg = interpolate(frame, [57 + ringDelay * 5, 64 + ringDelay * 5], [0, 1], {
              extrapolateRight: 'clamp',
            });
            const scale = interpolate(ringProg, [0, 1], [0.3, 2.5]);
            const opacity = interpolate(ringProg, [0, 0.3, 1], [0, 1, 0]);

            return (
              <div
                key={`collision-${ring}`}
                style={{
                  position: 'absolute',
                  left: '62%',
                  top: '38%',
                  width: 500,
                  height: 500,
                  borderRadius: '50%',
                  border: '4px solid #10b981',
                  transform: `translate(-50%, -50%) scale(${scale})`,
                  opacity: opacity * collisionImpact,
                  boxShadow: '0 0 80px #10b981, inset 0 0 80px #10b981',
                  zIndex: 15,
                }}
              />
            );
          })}
        </>
      )}

      {/* Small bounce impact ring (frame 60-66) */}
      {frame >= 60 && frame < 69 && (
        <div
          style={{
            position: 'absolute',
            left: '62%',
            top: '38%',
            width: 300,
            height: 300,
            borderRadius: '50%',
            border: '2px solid #10b981',
            transform: `translate(-50%, -50%) scale(${interpolate(frame, [60, 67], [0.3, 1.8])})`,
            opacity: interpolate(frame, [60, 67], [1, 0]) * bounceImpact,
            boxShadow: '0 0 40px #10b981',
            zIndex: 15,
          }}
        />
      )}

      {/* Impact flash at collision */}
      {impactFlash > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at 62% 38%, #10b98199 0%, #10b98144 30%, transparent 60%)',
            opacity: impactFlash,
            zIndex: 20,
          }}
        />
      )}

      {/* Main content - 完全固定配置 */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 80,
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10,
          opacity: sceneEntranceOpacity,
        }}
      >
        {/* Logo with rolling 'o' - 完成形の位置を基準に */}
        <div
          style={{
            position: 'relative',
            fontSize: 160,
            fontWeight: 900,
            letterSpacing: '0.02em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 200,
          }}
        >
          {/* Logo container - 完成形（apotto）の中心を基準 */}
          <div
            style={{
              opacity: logoPartsOpacity,
              transform: `scale(${logoPartsScale})`,
              display: 'flex',
              alignItems: 'baseline',
              position: 'relative',
            }}
          >
            {/* "apot" - first 4 letters, static */}
            <span
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: `drop-shadow(0 0 ${40 * glowIntensity}px rgba(16, 185, 129, 0.6))`,
              }}
            >
              apot
            </span>

            {/* Last "t" with wobble animation */}
            <span
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: `drop-shadow(0 0 ${40 * glowIntensity}px rgba(16, 185, 129, 0.6))`,
                display: 'inline-block',
                transform: `translateX(${tX}px) rotate(${tRotation}deg) scaleX(${tScaleX}) scaleY(${tScaleY})`,
                transformOrigin: 'center center',
              }}
            >
              t
            </span>

            {/* Rolling 'o' from right - 常に表示してレイアウト固定 */}
            <span
              style={{
                display: 'inline-block',
                background: 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                transform: `translateX(${oX}px) translateY(${oY}px) rotate(${oRotation}deg) scaleX(${oScaleX}) scaleY(${oScaleY})`,
                filter: `drop-shadow(0 0 ${40 * glowIntensity}px rgba(16, 185, 129, 0.6))`,
                transformOrigin: 'center center',
                opacity: frame >= 35 ? 1 : 0, // frame 35まで透明
              }}
            >
              o
            </span>
          </div>
        </div>

        {/* CTA - 高さ固定 */}
        <div
          style={{
            opacity: ctaOpacity,
            transform: `translateY(${ctaY}px)`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 40,
            minHeight: 350,
          }}
        >
          {/* タグライン - 文字が弾けて登場 + 光のエフェクト */}
          <div
            style={{
              fontSize: 56,
              fontWeight: 700,
              textAlign: 'center',
              position: 'relative',
              height: 70,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'visible',
            }}
          >
            {/* 光が走るエフェクト */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                background: `linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.8) ${shineX}%, transparent ${shineX + 10}%)`,
                pointerEvents: 'none',
                zIndex: 2,
              }}
            />

            {/* 各文字を個別にアニメーション */}
            <div style={{ display: 'flex', gap: 2, position: 'relative' }}>
              {taglineChars.map((char, i) => {
                const charDelay = i * 2;
                const charProgress = interpolate(frame, [85 + charDelay, 95 + charDelay], [0, 1], {
                  extrapolateRight: 'clamp',
                });

                const charY = spring({
                  frame: frame - (85 + charDelay),
                  fps,
                  from: 60,
                  to: 0,
                  config: {
                    damping: 8,
                    stiffness: 150,
                    mass: 0.5,
                  },
                });

                const charRotation = interpolate(charProgress, [0, 1], [90, 0]);
                const charScale = spring({
                  frame: frame - (85 + charDelay),
                  fps,
                  from: 0,
                  to: 1,
                  config: {
                    damping: 12,
                    stiffness: 200,
                  },
                });

                const charOpacity = interpolate(charProgress, [0, 0.3, 1], [0, 0.8, 1]);

                return (
                  <span
                    key={i}
                    style={{
                      display: 'inline-block',
                      background: 'linear-gradient(135deg, #f1f5f9 0%, #10b981 50%, #14b8a6 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      transform: `translateY(${charY}px) rotate(${charRotation}deg) scale(${charScale})`,
                      opacity: charOpacity,
                      filter: `drop-shadow(0 0 20px rgba(16, 185, 129, ${charOpacity * 0.6}))`,
                      transformOrigin: 'center center',
                    }}
                  >
                    {char}
                  </span>
                );
              })}
            </div>
          </div>

          {/* CTA Button - ホログラム風 3D + マグネティック */}
          <div
            style={{
              position: 'relative',
              minHeight: 120,
              perspective: 1000,
            }}
          >
            {/* マグネット引き寄せリング */}
            {magneticPull > 0 && (
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: `${100 + magneticPull * 30}%`,
                  height: `${100 + magneticPull * 30}%`,
                  borderRadius: '50%',
                  border: `2px solid rgba(16, 185, 129, ${magneticPull * 0.3})`,
                  transform: 'translate(-50%, -50%)',
                  opacity: magneticPull,
                  boxShadow: `0 0 ${40 * magneticPull}px rgba(16, 185, 129, ${magneticPull * 0.5})`,
                }}
              />
            )}

            {/* ボタン本体 */}
            <div
              style={{
                padding: '30px 80px',
                background: `
                  linear-gradient(135deg,
                    hsl(${hologramHue}, 84%, 55%) 0%,
                    hsl(${hologramHue + 10}, 77%, 56%) 50%,
                    hsl(${hologramHue - 10}, 80%, 60%) 100%
                  )
                `,
                borderRadius: 20,
                fontSize: 44,
                fontWeight: 700,
                color: 'white',
                boxShadow: `
                  0 ${25}px ${70}px rgba(16, 185, 129, 0.4),
                  0 0 ${60}px rgba(20, 184, 166, 0.6),
                  inset 0 2px 0 rgba(255, 255, 255, 0.3),
                  inset 0 -2px 0 rgba(0, 0, 0, 0.2)
                `,
                transform: `
                  translateY(${buttonY}px)
                  scale(${buttonScale + buttonPulse})
                  rotateX(${buttonRotateX}deg)
                `,
                opacity: buttonOpacity,
                border: '2px solid rgba(255, 255, 255, 0.4)',
                position: 'relative',
                overflow: 'hidden',
                transformStyle: 'preserve-3d',
              }}
            >
              {/* ホログラム走査線 */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  background: `linear-gradient(180deg,
                    transparent 0%,
                    rgba(255, 255, 255, 0.1) ${(frame * 3) % 100}%,
                    transparent ${(frame * 3) % 100 + 5}%
                  )`,
                  pointerEvents: 'none',
                }}
              />

              {/* テキスト */}
              <span style={{ position: 'relative', zIndex: 1 }}>
                今すぐ始める
              </span>

              {/* グロー層 */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: '120%',
                  height: '120%',
                  background: 'radial-gradient(circle, rgba(255, 255, 255, 0.3) 0%, transparent 70%)',
                  transform: 'translate(-50%, -50%)',
                  opacity: buttonPulse * 5,
                  pointerEvents: 'none',
                  filter: 'blur(20px)',
                }}
              />
            </div>
          </div>

          {/* URL - ストリーミング受信風（1回のみ表示） */}
          <div
            style={{
              fontSize: 36,
              color: '#64748b',
              fontFamily: 'monospace',
              display: 'flex',
              alignItems: 'center',
              height: 50,
            }}
          >
            {frame >= 140 && (
              <>
                <span>{urlText.slice(0, urlProgress)}</span>
                {urlProgress < urlText.length && cursorBlink && (
                  <span
                    style={{
                      display: 'inline-block',
                      width: 3,
                      height: 36,
                      background: '#10b981',
                      marginLeft: 2,
                      boxShadow: '0 0 8px #10b981',
                    }}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
