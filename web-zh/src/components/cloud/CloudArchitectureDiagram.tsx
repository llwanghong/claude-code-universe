import { useState } from 'react';

interface PlaneProps {
  name: string;
  color: string;
  bgColor: string;
  borderColor: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Plane({ name, color, bgColor, borderColor, children, defaultOpen = true }: PlaneProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div style={{
      border: `2px solid ${borderColor}`,
      borderRadius: '12px',
      marginBottom: '0',
      overflow: 'hidden',
      background: bgColor,
      transition: 'all 0.2s ease',
    }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '14px 20px',
          cursor: 'pointer',
          userSelect: 'none',
          background: color,
          color: '#fff',
          fontWeight: 700,
          fontSize: '15px',
          letterSpacing: '0.02em',
        }}
      >
        <span style={{ fontSize: '18px', transition: 'transform 0.2s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
        {name}
      </div>
      {isOpen && (
        <div style={{ padding: '20px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function ServiceBox({ icon, name, desc, color }: { icon: string; name: string; desc?: string; color: string }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '8px',
      padding: '12px 14px',
      border: `1px solid ${color}30`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '4px',
      textAlign: 'center',
      minWidth: '120px',
      transition: 'all 0.15s ease',
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 4px 12px ${color}20`; }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; }}
    >
      <span style={{ fontSize: '22px' }}>{icon}</span>
      <span style={{ fontWeight: 600, fontSize: '13px', color: '#1a1a2e' }}>{name}</span>
      {desc && <span style={{ fontSize: '11px', color: '#666', lineHeight: 1.3 }}>{desc}</span>}
    </div>
  );
}

function Arrow({ label }: { label?: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '4px 0',
      color: '#999',
      fontSize: '18px',
    }}>
      <span>↓</span>
      {label && <span style={{ fontSize: '10px', color: '#aaa', marginTop: '-2px' }}>{label}</span>}
    </div>
  );
}

export default function CloudArchitectureDiagram() {
  return (
    <div style={{
      fontFamily: 'system-ui, -apple-system, sans-serif',
      maxWidth: '900px',
      margin: '0 auto',
      padding: '24px',
      background: 'linear-gradient(135deg, #fafbfc 0%, #f0f2f5 100%)',
      borderRadius: '16px',
      border: '1px solid #e1e4e8',
    }}>
      <h3 style={{ textAlign: 'center', margin: '0 0 20px 0', fontSize: '20px', fontWeight: 700, color: '#1a1a2e' }}>
        ☁️ 云端 Claude Code — 五层架构
      </h3>

      {/* Access Plane */}
      <Plane name="🌐 ACCESS PLANE — 用户入口层" color="#2563eb" bgColor="#eff6ff" borderColor="#93c5fd">
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '12px',
        }}>
          <ServiceBox icon="🌍" name="Web App" desc="React + SSE streaming" color="#2563eb" />
          <ServiceBox icon="💻" name="VS Code" desc="Extension API" color="#2563eb" />
          <ServiceBox icon="🖥️" name="JetBrains" desc="Plugin SDK" color="#2563eb" />
          <ServiceBox icon="⌨️" name="CLI Client" desc="Thin WebSocket proxy" color="#2563eb" />
        </div>
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <ServiceBox icon="🔐" name="API Gateway" desc="Auth / Route / Rate Limit" color="#2563eb" />
        </div>
      </Plane>

      <Arrow label="REST + WebSocket" />

      {/* Control Plane */}
      <Plane name="🎛️ CONTROL PLANE — 管控调度层" color="#d97706" bgColor="#fffbeb" borderColor="#fcd34d">
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '10px',
        }}>
          <ServiceBox icon="🔑" name="Auth Service" desc="SSO/OIDC + JWT + RBAC" color="#d97706" />
          <ServiceBox icon="📋" name="Session Manager" desc="状态机 + 持久化" color="#d97706" />
          <ServiceBox icon="🎯" name="Agent Orchestrator" desc="Coordinator 模式" color="#d97706" />
          <ServiceBox icon="🤖" name="Model Router" desc="外部 API / 私有模型" color="#d97706" />
          <ServiceBox icon="⚙️" name="Config Service" desc="项目 & 团队设置" color="#d97706" />
          <ServiceBox icon="🛡️" name="Permission Engine" desc="7 模式 + 审批流" color="#d97706" />
        </div>
      </Plane>

      <Arrow label="gRPC + Message Queue" />

      {/* Execution Plane */}
      <Plane name="⚙️ EXECUTION PLANE — Agent 运行时" color="#059669" bgColor="#ecfdf5" borderColor="#6ee7b7">
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '20px',
          border: '2px dashed #6ee7b7',
          marginBottom: '14px',
        }}>
          <div style={{ fontWeight: 700, fontSize: '14px', color: '#059669', marginBottom: '12px', textAlign: 'center' }}>
            🐳 Agent Pod (per session) — K8s 容器
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '10px',
          }}>
            <ServiceBox icon="🔄" name="query() Loop" desc="ch05 async generator" color="#059669" />
            <ServiceBox icon="🔧" name="Tool Pipeline" desc="ch06 14-step execute" color="#059669" />
            <ServiceBox icon="📦" name="Context Manager" desc="4-layer compaction" color="#059669" />
            <ServiceBox icon="📂" name="Repo Workspace" desc="CoW overlay + temp branch" color="#059669" />
            <ServiceBox icon="🏖️" name="Shell Sandbox" desc="gVisor / Firecracker" color="#059669" />
            <ServiceBox icon="🔌" name="MCP Bridge" desc="Internal tools" color="#059669" />
          </div>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '10px',
        }}>
          <ServiceBox icon="📡" name="Repo Service" desc="GitLab / Bitbucket" color="#059669" />
          <ServiceBox icon="🚀" name="Build/CI Service" desc="Jenkins / GitLab CI" color="#059669" />
          <ServiceBox icon="🔗" name="MCP Registry" desc="Internal tool catalog" color="#059669" />
        </div>
      </Plane>

      <Arrow label="Read / Write" />

      {/* Data Plane */}
      <Plane name="💾 DATA PLANE — 数据持久层" color="#7c3aed" bgColor="#faf5ff" borderColor="#c4b5fd">
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '10px',
        }}>
          <ServiceBox icon="🗄️" name="Object Storage" desc="S3/MinIO · 对话 & 记忆" color="#7c3aed" />
          <ServiceBox icon="⚡" name="Redis Cache" desc="Session · Prompt Cache" color="#7c3aed" />
          <ServiceBox icon="🔍" name="Vector Store" desc="Milvus/Qdrant · 代码索引" color="#7c3aed" />
          <ServiceBox icon="🐘" name="PostgreSQL" desc="用户 · 权限 · 项目" color="#7c3aed" />
        </div>
      </Plane>

      {/* Legend */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '20px',
        marginTop: '20px',
        padding: '12px',
        background: '#fff',
        borderRadius: '8px',
        border: '1px solid #e1e4e8',
        fontSize: '12px',
        flexWrap: 'wrap',
      }}>
        <span>💡 点击每层标题展开/折叠</span>
        <span style={{ color: '#999' }}>|</span>
        <span>🔗 继承 <a href="/claude-code-universe/ch05-agent-loop/" style={{ color: '#2563eb' }}>ch05-ch18</a> 全部架构模式</span>
        <span style={{ color: '#999' }}>|</span>
        <span>⏱️ 3 Phase · 6-9 个月交付</span>
      </div>
    </div>
  );
}
