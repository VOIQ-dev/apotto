import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

interface AppMockupProps {
  showUpload?: boolean;
  showAnalyzing?: boolean;
  uploadProgress?: number;
  generatedText?: string;
  formValues?: {
    company: string;
    name: string;
    email: string;
  };
  showLog?: boolean;
  isRunning?: boolean;
}

export const AppMockup: React.FC<AppMockupProps> = ({
  showUpload = false,
  showAnalyzing = false,
  uploadProgress = 0,
  generatedText = '',
  formValues = { company: '', name: '', email: '' },
  showLog = false,
  isRunning = false,
}) => {
  const frame = useCurrentFrame();

  // Typing cursor animation
  const cursorOpacity = Math.sin(frame * 0.3) > 0 ? 1 : 0;

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 1400,
        margin: '0 auto',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          borderRadius: 24,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          background: 'rgba(15, 23, 42, 0.6)',
          padding: 4,
          backdropFilter: 'blur(20px)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div
          style={{
            borderRadius: 20,
            border: '1px solid rgba(255, 255, 255, 0.1)',
            background: 'rgba(15, 23, 42, 0.95)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 700,
          }}
        >
          {/* Window Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'rgba(30, 41, 59, 0.5)',
            }}
          >
            <div style={{ display: 'flex', gap: 8 }}>
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.8)',
                }}
              />
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: 'rgba(251, 191, 36, 0.8)',
                }}
              />
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.8)',
                }}
              />
            </div>
            <div
              style={{
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                padding: '6px 24px',
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.05)',
                fontSize: 13,
                color: 'rgba(148, 163, 184, 0.8)',
                fontFamily: 'monospace',
                border: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              apotto.ai/campaigns/new
            </div>
          </div>

          {/* App Content */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              background: 'rgba(15, 23, 42, 1)',
              position: 'relative',
            }}
          >
            {/* Upload Overlay */}
            {showUpload && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 30,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(15, 23, 42, 0.8)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: 60,
                    borderRadius: 24,
                    background: 'rgba(30, 41, 59, 0.8)',
                    border: '2px dashed rgba(16, 185, 129, 0.4)',
                    maxWidth: 500,
                  }}
                >
                  <div
                    style={{
                      width: 100,
                      height: 100,
                      borderRadius: '50%',
                      background: 'rgba(16, 185, 129, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 30,
                      boxShadow: '0 0 40px rgba(16, 185, 129, 0.3)',
                    }}
                  >
                    <svg
                      width="50"
                      height="50"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2"
                    >
                      <path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 700,
                      color: '#e2e8f0',
                      marginBottom: 12,
                    }}
                  >
                    企業リストを解析中
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      color: '#64748b',
                      marginBottom: 30,
                    }}
                  >
                    target_companies.csv
                  </div>
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 350,
                      height: 8,
                      background: 'rgba(30, 41, 59, 1)',
                      borderRadius: 999,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${uploadProgress}%`,
                        background: 'linear-gradient(90deg, #10b981 0%, #14b8a6 100%)',
                        transition: 'width 0.1s ease-out',
                        boxShadow: '0 0 20px rgba(16, 185, 129, 0.6)',
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Sidebar */}
            <div
              style={{
                width: 80,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '30px 0',
                borderRight: '1px solid rgba(255, 255, 255, 0.05)',
                background: 'rgba(30, 41, 59, 0.5)',
                gap: 40,
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 16,
                  background: 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  fontWeight: 900,
                  boxShadow: '0 10px 30px rgba(16, 185, 129, 0.3)',
                }}
              >
                A
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2"
                  >
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div
              style={{
                flex: 1,
                padding: 40,
                display: 'flex',
                flexDirection: 'column',
                gap: 30,
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: isRunning ? '#10b981' : '#64748b',
                        boxShadow: isRunning ? '0 0 10px rgba(16, 185, 129, 0.8)' : 'none',
                      }}
                    />
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#10b981',
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                      }}
                    >
                      {isRunning ? 'Active Campaign' : 'Ready'}
                    </span>
                  </div>
                  <h2
                    style={{
                      fontSize: 32,
                      fontWeight: 700,
                      color: '#f1f5f9',
                    }}
                  >
                    製造業向け_環境ソリューション提案
                  </h2>
                </div>
                <div
                  style={{
                    padding: '12px 28px',
                    borderRadius: 12,
                    background: isRunning
                      ? 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)'
                      : 'rgba(71, 85, 105, 1)',
                    color: 'white',
                    fontSize: 16,
                    fontWeight: 700,
                    border: isRunning ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(71, 85, 105, 1)',
                    boxShadow: isRunning ? '0 10px 30px rgba(16, 185, 129, 0.3)' : 'none',
                  }}
                >
                  {isRunning ? '実行中' : '待機中'}
                </div>
              </div>

              {/* Content Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 30, flex: 1 }}>
                {/* Left Panel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Queue */}
                  <div
                    style={{
                      padding: 24,
                      background: 'rgba(30, 41, 59, 0.5)',
                      borderRadius: 16,
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      position: 'relative',
                    }}
                  >
                    {showAnalyzing && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'rgba(30, 41, 59, 0.98)',
                          zIndex: 10,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 16,
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                        }}
                      >
                        <div
                          style={{
                            width: 50,
                            height: 50,
                            borderRadius: '50%',
                            border: '4px solid rgba(16, 185, 129, 0.2)',
                            borderTopColor: '#10b981',
                            marginBottom: 16,
                          }}
                          className="animate-spin"
                        />
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>
                          Webサイト解析中...
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>
                          企業理念・最新ニュースを抽出
                        </div>
                      </div>
                    )}

                    <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 16, textTransform: 'uppercase' }}>
                      Target Queue
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: 12,
                            borderRadius: 12,
                            background: i === 1 && isRunning ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                            border: i === 1 && isRunning ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent',
                          }}
                        >
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 10,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 12,
                              fontWeight: 700,
                              background: i === 1 && isRunning ? 'rgba(16, 185, 129, 0.2)' : 'rgba(30, 41, 59, 1)',
                              color: i === 1 && isRunning ? '#10b981' : '#64748b',
                            }}
                          >
                            {i === 1 && isRunning ? 'Now' : i}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
                              株式会社エコロジー{i > 1 ? i : ''}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              代表問い合わせフォーム
                            </div>
                          </div>
                          {i === 1 && isRunning && (
                            <div
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: '#10b981',
                                boxShadow: '0 0 10px rgba(16, 185, 129, 0.8)',
                              }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Form Preview */}
                  <div
                    style={{
                      padding: 24,
                      background: 'rgba(30, 41, 59, 0.5)',
                      borderRadius: 16,
                      border: formValues.company ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 16, textTransform: 'uppercase' }}>
                      Form Auto-Fill
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div>
                        <div style={{ height: 8, width: 48, background: '#334155', borderRadius: 4, marginBottom: 8 }} />
                        <div
                          style={{
                            height: 44,
                            borderRadius: 10,
                            background: '#0f172a',
                            border: formValues.company ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0 14px',
                            fontSize: 14,
                            color: formValues.company ? '#e2e8f0' : 'transparent',
                            boxShadow: formValues.company ? '0 0 20px rgba(16, 185, 129, 0.2)' : 'none',
                          }}
                        >
                          {formValues.company}
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                          <div style={{ height: 8, width: 32, background: '#334155', borderRadius: 4, marginBottom: 8 }} />
                          <div
                            style={{
                              height: 44,
                              borderRadius: 10,
                              background: '#0f172a',
                              border: formValues.name ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                              display: 'flex',
                              alignItems: 'center',
                              padding: '0 14px',
                              fontSize: 14,
                              color: formValues.name ? '#e2e8f0' : 'transparent',
                              boxShadow: formValues.name ? '0 0 20px rgba(16, 185, 129, 0.2)' : 'none',
                            }}
                          >
                            {formValues.name}
                          </div>
                        </div>
                        <div>
                          <div style={{ height: 8, width: 32, background: '#334155', borderRadius: 4, marginBottom: 8 }} />
                          <div
                            style={{
                              height: 44,
                              borderRadius: 10,
                              background: '#0f172a',
                              border: formValues.email ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                              display: 'flex',
                              alignItems: 'center',
                              padding: '0 14px',
                              fontSize: 13,
                              color: formValues.email ? '#e2e8f0' : 'transparent',
                              boxShadow: formValues.email ? '0 0 20px rgba(16, 185, 129, 0.2)' : 'none',
                            }}
                          >
                            {formValues.email}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Panel - AI Generation */}
                <div
                  style={{
                    padding: 30,
                    background: 'rgba(30, 41, 59, 0.5)',
                    borderRadius: 16,
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 24,
                      paddingBottom: 20,
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 20,
                          fontWeight: 700,
                          color: '#64748b',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                        }}
                      >
                        E
                      </div>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>
                          株式会社エコロジー 御中
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <div
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: '#22c55e',
                              boxShadow: '0 0 8px rgba(34, 197, 94, 0.6)',
                            }}
                          />
                          https://ecology.co.jp
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ flex: 1, position: 'relative', minHeight: 300 }}>
                    {generatedText ? (
                      <>
                        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div
                            style={{
                              padding: '4px 10px',
                              borderRadius: 6,
                              background: '#1e293b',
                              fontSize: 11,
                              fontWeight: 700,
                              color: '#64748b',
                              border: '1px solid rgba(255, 255, 255, 0.05)',
                            }}
                          >
                            AI Model v4.0
                          </div>
                        </div>
                        <div
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 16,
                            lineHeight: 1.8,
                            color: '#e2e8f0',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {generatedText}
                          <span
                            style={{
                              display: 'inline-block',
                              width: 3,
                              height: 22,
                              background: '#10b981',
                              marginLeft: 2,
                              opacity: cursorOpacity,
                              boxShadow: '0 0 10px rgba(16, 185, 129, 0.8)',
                            }}
                          />
                        </div>
                      </>
                    ) : (
                      <div
                        style={{
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#475569',
                          gap: 20,
                        }}
                      >
                        <div
                          style={{
                            width: 80,
                            height: 80,
                            borderRadius: '50%',
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.05)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <svg
                            width="40"
                            height="40"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1"
                          >
                            <path d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                          </svg>
                        </div>
                        <div style={{ fontSize: 18 }}>Waiting for company analysis...</div>
                      </div>
                    )}
                  </div>

                  {/* AI Badge */}
                  {generatedText && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 40,
                        right: 40,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        background: 'rgba(30, 41, 59, 0.95)',
                        padding: '10px 20px',
                        borderRadius: 999,
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        backdropFilter: 'blur(10px)',
                        boxShadow: '0 10px 30px rgba(16, 185, 129, 0.2)',
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 5px 15px rgba(16, 185, 129, 0.4)',
                        }}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="white"
                          strokeWidth="2.5"
                        >
                          <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', lineHeight: 1 }}>
                          POWERED BY
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            background: 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            lineHeight: 1,
                            marginTop: 3,
                          }}
                        >
                          AI Personalization
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Success Log Toast */}
          {showLog && (
            <div
              style={{
                position: 'absolute',
                bottom: 40,
                right: 40,
                background: 'rgba(30, 41, 59, 0.98)',
                padding: 24,
                borderRadius: 20,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
                minWidth: 380,
                borderTop: '3px solid #10b981',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'start', gap: 16 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    background: 'rgba(16, 185, 129, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    border: '1px solid rgba(16, 185, 129, 0.5)',
                    boxShadow: '0 0 30px rgba(16, 185, 129, 0.4)',
                  }}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.5"
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#10b981',
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                      }}
                    >
                      Sent Successfully
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontFamily: 'monospace',
                        color: '#cbd5e1',
                        background: 'rgba(30, 41, 59, 0.5)',
                        padding: '3px 8px',
                        borderRadius: 4,
                      }}
                    >
                      {new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 }}>
                    株式会社エコロジー
                  </div>
                  <div style={{ fontSize: 13, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#64748b' }} />
                    To: 環境 太郎 様
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
