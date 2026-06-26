const tokens = { bg: '#faf9f7', surface: '#ffffff', border: '#e8e5e1', text: '#1a1917', muted: '#8b8680', faint: '#b8b3ad', emerald: '#10b981', amber: '#f59e0b', rose: '#f43f5e', blue: '#3b82f6' };

const podModules = [
  { name: 'query() Loop', desc: 'async generator · 10 terminal + 7 continue states · ch05 pattern', tag: 'CORE' },
  { name: 'Tool Pipeline', desc: '14-step execution · 7 permission modes · result budgeting · ch06 pattern', tag: 'CORE' },
  { name: 'Context Manager', desc: '4-layer compaction · auto-compact + circuit breaker · ch05 pattern', tag: 'CORE' },
];

const infraModules = [
  { name: 'Repo Workspace', desc: 'CoW overlay · temp branch · git clone --shared · ch08 isolation', tag: 'ISOLATION' },
  { name: 'Shell Sandbox', desc: 'gVisor/Firecracker · seccomp · network egress whitelist · 5min timeout', tag: 'SECURITY' },
  { name: 'MCP Bridge', desc: 'stdio/http/sse transport · OAuth PKCE · ch15 tool wrapping', tag: 'INTEGRATION' },
];

const externalServices = [
  { name: 'Repo Service', desc: 'GitLab · Bitbucket · GitHub Enterprise' },
  { name: 'Build/CI Service', desc: 'Jenkins · GitLab CI · webhook triggers' },
  { name: 'MCP Registry', desc: 'Internal tool catalog · health checks · rate limiting' },
];

function Section({ title, icon, color, children }: { title: string; icon: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ color, fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: tokens.text, letterSpacing: '-0.01em' }}>{title}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function Card({ name, desc, tag, color }: { name: string; desc: string; tag?: string; color: string }) {
  return (
    <div style={{
      background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 10, padding: '14px 16px',
      display: 'flex', gap: 12, transition: 'all 0.15s',
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = color + '40'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.04)'; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = tokens.border; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>⬡</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: tokens.text }}>{name}</span>
          {tag && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', color, background: color + '10', padding: '1px 6px', borderRadius: 3 }}>{tag}</span>}
        </div>
        <div style={{ fontSize: 12, color: tokens.muted, lineHeight: 1.4 }}>{desc}</div>
      </div>
    </div>
  );
}

export default function ExecutionPlaneDiagram() {
  return (
    <div style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", maxWidth: 880, margin: '0 auto', background: tokens.bg, borderRadius: 24, border: `1px solid ${tokens.border}`, padding: '40px 36px' }}>
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: tokens.muted, marginBottom: 8 }}>EXECUTION PLANE</div>
        <h3 style={{ fontSize: 22, fontWeight: 700, color: tokens.text, margin: 0, letterSpacing: '-0.02em' }}>Agent Runtime · 容器内执行环境</h3>
      </div>

      <Section title="Agent Pod — Core Loop" icon="◆" color={tokens.emerald}>
        {podModules.map(m => <Card key={m.name} {...m} color={tokens.emerald} />)}
      </Section>

      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 16px' }}>
        <span style={{ fontSize: 20, color: tokens.faint }}>↕</span>
      </div>

      <Section title="Infrastructure" icon="◈" color={tokens.amber}>
        {infraModules.map(m => <Card key={m.name} {...m} color={tokens.amber} />)}
      </Section>

      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 16px' }}>
        <span style={{ fontSize: 20, color: tokens.faint }}>↕</span>
      </div>

      <Section title="External Integration" icon="○" color={tokens.blue}>
        {externalServices.map(m => <Card key={m.name} {...m} color={tokens.blue} />)}
      </Section>
    </div>
  );
}
