const tokens = {
  bg: '#faf9f7',
  surface: '#ffffff',
  border: '#e8e5e1',
  text: '#1a1917',
  muted: '#8b8680',
};

const LAYERS = [
  {
    name: 'Network',
    icon: '🌐',
    accent: '#d97757',
    items: ['K8s NetworkPolicy (Pod 间最小权限)', 'Ingress: 仅 API Gateway 暴露', 'Egress: 白名单域名 + 内网 IP', 'mTLS: 服务间双向 TLS'],
  },
  {
    name: 'Authentication',
    icon: '🔑',
    accent: '#c4a35a',
    items: ['SSO/OIDC (Okta/Azure AD/LDAP) + MFA', 'JWT (access 15min + refresh 8h)', 'Service Account (mTLS + JWT)', 'API Key (CI/CD 集成，最小权限)'],
  },
  {
    name: 'Authorization',
    icon: '🛡️',
    accent: '#8b9b7c',
    items: ['RBAC: Admin / TeamLead / Developer / Viewer', 'Project ACL: 项目级读写权限', 'Tool Permission: 7 modes + deny/allow', 'Environment Gate: staging / production'],
  },
  {
    name: 'Isolation',
    icon: '📦',
    accent: '#7b9c8e',
    items: ['Agent Pod: 每 session 独立 K8s Pod', 'gVisor (runsc): 用户态内核', 'CoW Workspace: 修改不污染主仓库', 'Seccomp: 禁用 ptrace/mount/module'],
  },
  {
    name: 'Data',
    icon: '🔒',
    accent: '#7b8ba8',
    items: ['Vault: 所有密钥/Token 集中管理', 'Encryption at rest: S3/MinIO 加密', 'PII Scanning: 审计日志写入前脱敏', 'Token Scope: 每 Session 独立 Token'],
  },
  {
    name: 'Audit',
    icon: '📊',
    accent: '#9b7b8e',
    items: ['不可变审计日志 (ClickHouse)', '告警: 3次权限拒绝/分钟 → 告警', '告警: 沙箱异常退出 → 即时响应', '告警: 非工作时间访问 → 标记审查'],
  },
];

export default function SecurityLayersDiagram() {
  return (
    <div style={{
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      maxWidth: '760px',
      margin: '0 auto',
      background: tokens.bg,
      borderRadius: '16px',
      border: `1px solid ${tokens.border}`,
      overflow: 'hidden',
    }}>
      <div style={{ padding: '28px 28px 0' }}>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: tokens.text, letterSpacing: '0.02em' }}>
          Defense in Depth
        </h3>
        <p style={{ margin: '4px 0 0', fontSize: '12px', color: tokens.muted }}>
          六层纵深防御 · 从网络边界到审计追溯
        </p>
      </div>

      <div style={{ padding: '20px 24px 28px' }}>
        {LAYERS.map((layer, i) => (
          <div key={i} style={{
            display: 'flex',
            gap: '14px',
            position: 'relative',
          }}>
            {/* Number + connector */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: '32px',
              flexShrink: 0,
            }}>
              <div style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                background: layer.accent + '18',
                border: `1.5px solid ${layer.accent}50`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 700,
                color: layer.accent,
                flexShrink: 0,
              }}>
                {i + 1}
              </div>
              {i < LAYERS.length - 1 && (
                <div style={{
                  width: '1.5px',
                  flex: 1,
                  minHeight: '20px',
                  background: `linear-gradient(180deg, ${layer.accent}40 0%, ${LAYERS[i+1].accent}30 100%)`,
                  margin: '4px 0',
                }} />
              )}
            </div>

            {/* Content */}
            <div style={{
              flex: 1,
              border: `1px solid ${tokens.border}`,
              borderRadius: '10px',
              padding: '14px 16px',
              marginBottom: '10px',
              background: tokens.surface,
              transition: 'box-shadow 0.2s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = `0 2px 12px ${layer.accent}18`;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = 'none';
            }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '16px' }}>{layer.icon}</span>
                <span style={{ fontWeight: 700, fontSize: '13px', color: tokens.text, letterSpacing: '0.02em' }}>
                  Layer {i + 1}: {layer.name}
                </span>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '4px',
                paddingLeft: '6px',
              }}>
                {layer.items.map((item, j) => (
                  <div key={j} style={{
                    fontSize: '12px',
                    color: tokens.muted,
                    padding: '3px 0',
                  }}>
                    <span style={{ color: layer.accent, opacity: 0.7, marginRight: '6px' }}>—</span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
