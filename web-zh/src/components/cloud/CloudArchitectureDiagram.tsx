// Premium design system — Linear/Stripe-inspired
const tokens = {
  bg: '#faf9f7',
  surface: '#ffffff',
  border: '#e8e5e1',
  text: '#1a1917',
  muted: '#8b8680',
  faint: '#b8b3ad',
  // Accents
  blue: '#3b82f6',
  amber: '#f59e0b',
  emerald: '#10b981',
  violet: '#8b5cf6',
  rose: '#f43f5e',
  slate: '#64748b',
};

const planes = [
  {
    id: 'access', label: 'ACCESS', title: '用户入口', icon: '◈',
    color: tokens.blue, items: [
      { name: 'Web App', desc: 'React · SSE' },
      { name: 'VS Code', desc: 'Extension' },
      { name: 'CLI', desc: 'WebSocket' },
      { name: 'Gateway', desc: 'Auth & Route' },
    ]
  },
  {
    id: 'control', label: 'CONTROL', title: '管控调度', icon: '◇',
    color: tokens.amber, items: [
      { name: 'Auth', desc: 'SSO/OIDC' },
      { name: 'Sessions', desc: 'State Machine' },
      { name: 'Orchestrator', desc: 'Coordinator' },
      { name: 'Model Router', desc: 'Public/Private' },
      { name: 'Permissions', desc: '7 Modes' },
      { name: 'Config', desc: 'Projects' },
    ]
  },
  {
    id: 'exec', label: 'EXECUTION', title: 'Agent 运行时', icon: '◆',
    color: tokens.emerald, items: [
      { name: 'query() Loop', desc: 'ch05 generator' },
      { name: 'Tool Pipeline', desc: 'ch06 14-step' },
      { name: 'Context Mgr', desc: '4-layer compact' },
      { name: 'Repo WS', desc: 'CoW overlay' },
      { name: 'Shell Sandbox', desc: 'gVisor' },
      { name: 'MCP Bridge', desc: 'Internal tools' },
    ]
  },
  {
    id: 'data', label: 'DATA', title: '数据持久', icon: '○',
    color: tokens.violet, items: [
      { name: 'Object Storage', desc: 'S3/MinIO' },
      { name: 'Redis', desc: 'Cache' },
      { name: 'Vector Store', desc: 'Milvus' },
      { name: 'PostgreSQL', desc: 'Users' },
    ]
  },
];

export default function CloudArchitectureDiagram() {
  return (
    <div style={{
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      maxWidth: 880, margin: '0 auto',
      background: tokens.bg, borderRadius: 24,
      border: `1px solid ${tokens.border}`,
      padding: '40px 36px',
    }}>
      {/* Title */}
      <div style={{ marginBottom: 36, textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: tokens.muted, marginBottom: 8 }}>
          ARCHITECTURE OVERVIEW
        </div>
        <h3 style={{ fontSize: 22, fontWeight: 700, color: tokens.text, margin: 0, letterSpacing: '-0.02em' }}>
          Cloud Claude Code — 五层平面架构
        </h3>
      </div>

      {/* Planes */}
      {planes.map((plane, i) => (
        <div key={plane.id} style={{ marginBottom: i < planes.length - 1 ? 0 : 0 }}>
          {/* Connector */}
          {i > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
              <svg width="24" height="28" viewBox="0 0 24 28">
                <line x1="12" y1="0" x2="12" y2="20" stroke={tokens.faint} strokeWidth="1" strokeDasharray="3 3" />
                <polygon points="6,18 12,26 18,18" fill={plane.color} opacity="0.3" />
              </svg>
            </div>
          )}

          {/* Plane card */}
          <div style={{
            background: tokens.surface,
            border: `1px solid ${tokens.border}`,
            borderRadius: 14,
            overflow: 'hidden',
            transition: 'box-shadow 0.2s',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '14px 20px',
              borderBottom: `1px solid ${tokens.border}`,
              background: '#fcfbf9',
            }}>
              <span style={{ color: plane.color, fontSize: 14 }}>{plane.icon}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                color: plane.color, background: plane.color + '12',
                padding: '2px 8px', borderRadius: 4,
              }}>{plane.label}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: tokens.text }}>{plane.title}</span>
            </div>

            {/* Items */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: '1px',
              background: tokens.border,
            }}>
              {plane.items.map((item, j) => (
                <div key={j} style={{
                  background: tokens.surface,
                  padding: '14px 16px',
                  display: 'flex', alignItems: 'center', gap: 10,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#faf9f7'}
                onMouseLeave={e => e.currentTarget.style.background = tokens.surface}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: plane.color + '10',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: plane.color,
                    flexShrink: 0,
                  }}>
                    {j + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: tokens.text, lineHeight: 1.3 }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: tokens.muted, lineHeight: 1.3 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      {/* Legend */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 28, marginTop: 28, paddingTop: 20, borderTop: `1px solid ${tokens.border}` }}>
        {planes.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: tokens.muted }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
            {p.label}
          </div>
        ))}
      </div>
    </div>
  );
}
