const LAYERS = [
  {
    name: 'Layer 1: Network',
    icon: '🌐',
    color: '#2563eb',
    items: ['K8s NetworkPolicy (Pod 间最小权限)', 'Ingress: 仅 API Gateway 暴露', 'Egress: 白名单域名 + 内网 IP', 'mTLS: 服务间双向 TLS'],
  },
  {
    name: 'Layer 2: Authentication',
    icon: '🔑',
    color: '#7c3aed',
    items: ['SSO/OIDC (Okta/Azure AD/LDAP) + MFA', 'JWT (access 15min + refresh 8h)', 'Service Account (mTLS + JWT)', 'API Key (CI/CD 集成，最小权限)'],
  },
  {
    name: 'Layer 3: Authorization',
    icon: '🛡️',
    color: '#d97706',
    items: ['RBAC: Admin / TeamLead / Developer / Viewer', 'Project ACL: 项目级读写权限', 'Tool Permission: 7 modes + tool deny/allow', 'Environment Gate: staging 直接 / production 审批'],
  },
  {
    name: 'Layer 4: Isolation',
    icon: '📦',
    color: '#059669',
    items: ['Agent Pod: 每 session 独立 K8s Pod', 'gVisor (runsc): 用户态内核', 'CoW Workspace: 修改不污染主仓库', 'Seccomp: 禁用 ptrace/mount/module'],
  },
  {
    name: 'Layer 5: Data',
    icon: '🔒',
    color: '#dc2626',
    items: ['Vault: 所有密钥/Token 集中管理', 'Encryption at rest: S3/MinIO 存储加密', 'PII Scanning: 审计日志写入前脱敏', 'Token Scope: 每 Session 独立临时 Token'],
  },
  {
    name: 'Layer 6: Audit',
    icon: '📊',
    color: '#4f46e5',
    items: ['不可变审计日志 (ClickHouse)', '告警: 3次权限拒绝/分钟 → 安全团队', '告警: 沙箱异常退出 → 即时响应', '告警: 非工作时间 restricted 项目访问'],
  },
];

export default function SecurityLayersDiagram() {
  return (
    <div style={{
      fontFamily: 'system-ui, -apple-system, sans-serif',
      maxWidth: '800px',
      margin: '0 auto',
      padding: '24px',
    }}>
      <h3 style={{ textAlign: 'center', margin: '0 0 24px 0', fontSize: '20px', fontWeight: 700, color: '#1a1a2e' }}>
        🛡️ 纵深防御 — 6 层安全架构
      </h3>
      {LAYERS.map((layer, i) => (
        <div key={i} style={{
          borderLeft: `4px solid ${layer.color}`,
          background: `linear-gradient(90deg, ${layer.color}08 0%, transparent 100%)`,
          borderRadius: '0 8px 8px 0',
          padding: '14px 18px',
          marginBottom: '12px',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(4px)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'translateX(0)'; }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span style={{ fontSize: '20px' }}>{layer.icon}</span>
            <span style={{ fontWeight: 700, fontSize: '14px', color: layer.color }}>{layer.name}</span>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '6px',
            paddingLeft: '30px',
          }}>
            {layer.items.map((item, j) => (
              <div key={j} style={{
                fontSize: '13px',
                color: '#444',
                padding: '4px 8px',
                background: 'rgba(255,255,255,0.6)',
                borderRadius: '4px',
              }}>
                • {item}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
