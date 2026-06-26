import { useState } from 'react';

const PLANES = [
  {
    id: 'access',
    name: 'Access Plane',
    subtitle: '用户入口层',
    icon: '🌐',
    accent: '#d97757',
    bg: 'linear-gradient(135deg, #1a1a1a 0%, #1f1a18 100%)',
    border: 'rgba(217,119,87,0.25)',
    services: [
      [
        { icon: '🌍', name: 'Web App', desc: 'React · SSE streaming' },
        { icon: '💻', name: 'VS Code', desc: 'Extension API' },
        { icon: '⌨️', name: 'CLI', desc: 'WebSocket proxy' },
        { icon: '🖥️', name: 'JetBrains', desc: 'Plugin SDK' },
      ],
    ],
    center: { icon: '🔐', name: 'API Gateway', desc: 'Auth · Route · Rate Limit' },
  },
  {
    id: 'control',
    name: 'Control Plane',
    subtitle: '管控调度层',
    icon: '⚙️',
    accent: '#c4a35a',
    bg: 'linear-gradient(135deg, #1a1a1a 0%, #1a1917 100%)',
    border: 'rgba(196,163,90,0.25)',
    services: [
      [
        { icon: '🔑', name: 'Auth', desc: 'SSO/OIDC + RBAC' },
        { icon: '📋', name: 'Session', desc: 'State Machine' },
        { icon: '🎯', name: 'Orchestrator', desc: 'Coordinator' },
      ],
      [
        { icon: '🤖', name: 'Model Router', desc: 'Public / Private' },
        { icon: '⚡', name: 'Config', desc: 'Projects & Teams' },
        { icon: '🛡️', name: 'Permissions', desc: '7 Modes + 审批' },
      ],
    ],
  },
  {
    id: 'execution',
    name: 'Execution Plane',
    subtitle: 'Agent 运行时',
    icon: '⚡',
    accent: '#7b9c8e',
    bg: 'linear-gradient(135deg, #1a1a1a 0%, #171a18 100%)',
    border: 'rgba(123,156,142,0.25)',
    isPod: true,
    podLabel: 'Agent Pod (per session) · K8s Container',
    services: [
      [
        { icon: '🔄', name: 'query() Loop', desc: 'ch05 generator' },
        { icon: '🔧', name: 'Tool Pipeline', desc: 'ch06 14-step' },
        { icon: '📦', name: 'Context', desc: '4-layer compact' },
      ],
      [
        { icon: '📂', name: 'Repo Workspace', desc: 'CoW overlay' },
        { icon: '🏖️', name: 'Shell Sandbox', desc: 'gVisor' },
        { icon: '🔌', name: 'MCP Bridge', desc: 'Internal tools' },
      ],
    ],
    external: [
      { icon: '📡', name: 'Repo Service', desc: 'GitLab / Bitbucket' },
      { icon: '🚀', name: 'Build/CI', desc: 'Jenkins' },
      { icon: '🔗', name: 'MCP Registry', desc: 'Tool catalog' },
    ],
  },
  {
    id: 'data',
    name: 'Data Plane',
    subtitle: '数据持久层',
    icon: '💾',
    accent: '#8b7ba8',
    bg: 'linear-gradient(135deg, #1a1a1a 0%, #18171a 100%)',
    border: 'rgba(139,123,168,0.25)',
    services: [
      [
        { icon: '🗄️', name: 'Object Storage', desc: 'S3/MinIO · 对话 & 记忆' },
        { icon: '⚡', name: 'Redis', desc: 'Session · Prompt Cache' },
        { icon: '🔍', name: 'Vector Store', desc: 'Milvus · 代码索引' },
        { icon: '🐘', name: 'PostgreSQL', desc: '用户 · 权限' },
      ],
    ],
  },
];

function ServiceCard({ icon, name, desc }: { icon: string; name: string; desc: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '8px',
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '2px',
      textAlign: 'center',
      flex: '1 1 120px',
      minWidth: '110px',
      transition: 'all 0.2s ease',
      cursor: 'default',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
      e.currentTarget.style.transform = 'translateY(-1px)';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
      e.currentTarget.style.transform = 'translateY(0)';
    }}
    >
      <span style={{ fontSize: '18px', opacity: 0.9 }}>{icon}</span>
      <span style={{ fontWeight: 600, fontSize: '12px', color: '#e0dcd5' }}>{name}</span>
      <span style={{ fontSize: '10px', color: '#8b8680', lineHeight: 1.3 }}>{desc}</span>
    </div>
  );
}

function Connector({ accent }: { accent: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      padding: '6px 0',
    }}>
      <div style={{
        width: '1px',
        height: '32px',
        background: `linear-gradient(180deg, ${accent}40 0%, ${accent}20 100%)`,
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute',
          bottom: '-4px',
          left: '-3px',
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          background: accent,
          opacity: 0.6,
        }} />
      </div>
    </div>
  );
}

export default function CloudArchitectureDiagram() {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    const next = new Set(collapsed);
    next.has(id) ? next.delete(id) : next.add(id);
    setCollapsed(next);
  };

  return (
    <div style={{
      fontFamily: 'system-ui, -apple-system, sans-serif',
      maxWidth: '860px',
      margin: '0 auto',
      background: '#141413',
      borderRadius: '16px',
      border: '1px solid rgba(255,255,255,0.1)',
      overflow: 'hidden',
      boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
    }}>
      {/* Header */}
      <div style={{
        padding: '24px 28px 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#e0dcd5', letterSpacing: '0.02em' }}>
            Cloud Claude Code Architecture
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#8b8680' }}>
            五层平面 · 12 个模块 · 3 Phase 交付
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: '#8b8680' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#d97757' }} /> Access
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#c4a35a' }} /> Control
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#7b9c8e' }} /> Execution
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#8b7ba8' }} /> Data
          </span>
        </div>
      </div>

      {/* Planes */}
      <div style={{ padding: '20px 24px 28px' }}>
        {PLANES.map((plane, i) => {
          const isCollapsed = collapsed.has(plane.id);
          return (
            <div key={plane.id}>
              {i > 0 && <Connector accent={plane.accent} />}
              <div style={{
                border: `1px solid ${plane.border}`,
                borderRadius: '12px',
                overflow: 'hidden',
              }}>
                {/* Plane Header */}
                <div
                  onClick={() => toggle(plane.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 18px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    background: plane.bg,
                    borderBottom: isCollapsed ? 'none' : `1px solid ${plane.border}`,
                  }}
                >
                  <span style={{
                    fontSize: '12px',
                    transition: 'transform 0.2s',
                    transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                    color: plane.accent,
                  }}>▼</span>
                  <span style={{ fontSize: '16px' }}>{plane.icon}</span>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: '13px', color: '#e0dcd5', letterSpacing: '0.03em' }}>
                      {plane.name}
                    </span>
                    <span style={{ fontSize: '11px', color: '#8b8680', marginLeft: '8px' }}>{plane.subtitle}</span>
                  </div>
                </div>

                {/* Plane Body */}
                {!isCollapsed && (
                  <div style={{ padding: '16px', background: 'rgba(0,0,0,0.15)' }}>
                    {/* Pod wrapper for Execution Plane */}
                    {plane.isPod && (
                      <div style={{
                        border: '1px dashed rgba(123,156,142,0.3)',
                        borderRadius: '10px',
                        padding: '14px',
                        marginBottom: '12px',
                        background: 'rgba(123,156,142,0.04)',
                      }}>
                        <div style={{
                          fontSize: '10px',
                          color: '#7b9c8e',
                          fontWeight: 600,
                          letterSpacing: '0.05em',
                          marginBottom: '10px',
                          textAlign: 'center',
                        }}>
                          {plane.podLabel}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                          {plane.services.flat().map((s, j) => (
                            <ServiceCard key={j} {...s} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Standard service grids */}
                    {!plane.isPod && plane.services.map((row, ri) => (
                      <div key={ri} style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px',
                        justifyContent: 'center',
                        marginBottom: ri < plane.services.length - 1 ? '8px' : 0,
                      }}>
                        {row.map((s, j) => (
                          <ServiceCard key={j} {...s} />
                        ))}
                      </div>
                    ))}

                    {/* Center node for Access Plane */}
                    {plane.center && (
                      <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        marginTop: '12px',
                        paddingTop: '12px',
                        borderTop: `1px solid ${plane.border}`,
                      }}>
                        <ServiceCard {...plane.center} />
                      </div>
                    )}

                    {/* External services for Execution Plane */}
                    {plane.external && (
                      <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px',
                        justifyContent: 'center',
                        marginTop: '12px',
                        paddingTop: '12px',
                        borderTop: '1px dashed rgba(123,156,142,0.2)',
                      }}>
                        {plane.external.map((s, j) => (
                          <ServiceCard key={j} {...s} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.08)',
        padding: '14px 28px',
        display: 'flex',
        justifyContent: 'center',
        gap: '24px',
        fontSize: '11px',
        color: '#6b6560',
        background: 'rgba(0,0,0,0.2)',
        flexWrap: 'wrap',
      }}>
        <span>💡 点击 Plane 标题展开/折叠</span>
        <span>·</span>
        <span>Inherits all patterns from ch05–ch18</span>
        <span>·</span>
        <span>6–9 months · 3 Phase delivery</span>
      </div>
    </div>
  );
}
