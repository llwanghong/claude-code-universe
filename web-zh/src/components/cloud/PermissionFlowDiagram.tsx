const tokens = { bg: '#faf9f7', surface: '#ffffff', border: '#e8e5e1', text: '#1a1917', muted: '#8b8680', faint: '#b8b3ad' };

const steps = [
  { num: 1, title: 'Hook Decision', desc: 'PreToolUse Hook 最先执行。可以 allow / deny / modify-input / inject-context。来源：平台策略 → 团队配置 → 项目配置。如果 Hook 已决定，后续步骤跳过。', color: '#3b82f6' },
  { num: 2, title: 'Rule Matching', desc: '三层规则按优先级匹配：平台级 > 团队级 > 项目级。alwaysDeny（如 Bash(rm -rf *)）直接阻止。alwaysAllow（如 Bash(git *)）直接放行。', color: '#8b5cf6' },
  { num: 3, title: 'Tool-Specific Check', desc: '工具的 checkPermissions() 方法。DBTool 检查是否 SELECT 语句。DeployTool 检查目标环境。BashTool parseForSecurity() 分类命令。', color: '#f59e0b' },
  { num: 4, title: 'Mode Default', desc: '7 种权限模式：bypassPermissions（全放行）、plan（拒绝写入）、dontAsk（自动拒绝）、default（继续下一步）等。', color: '#10b981' },
  { num: 5, title: 'Interactive Prompt', desc: 'Web/IDE/CLI 三种形态的权限对话框。用户选择 Allow Once / Always Allow / Deny。支持规则持久化。', color: '#f43f5e' },
  { num: 6, title: 'Approval Flow', desc: '高风险操作（Deploy production、DB write、K8s apply）自动创建 Jira/飞书审批。TL 审批后执行。30min 无响应自动拒绝。', color: '#64748b' },
];

export default function PermissionFlowDiagram() {
  return (
    <div style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", maxWidth: 760, margin: '0 auto', background: tokens.bg, borderRadius: 24, border: `1px solid ${tokens.border}`, padding: '40px 36px' }}>
      <div style={{ marginBottom: 36, textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: tokens.muted, marginBottom: 8 }}>PERMISSION ENGINE</div>
        <h3 style={{ fontSize: 22, fontWeight: 700, color: tokens.text, margin: 0, letterSpacing: '-0.02em' }}>权限决策链 · 6 步流程</h3>
      </div>

      {steps.map((step, i) => (
        <div key={i}>
          {i > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 32, marginBottom: 2 }}>
              <div style={{ width: 1, height: 28, background: tokens.border, marginLeft: 11 }} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 14, marginBottom: i < steps.length - 1 ? 0 : 0 }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: step.color + '14', border: `1.5px solid ${step.color}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: step.color,
              flexShrink: 0, marginTop: 14,
            }}>{step.num}</div>
            <div style={{
              flex: 1, background: tokens.surface, border: `1px solid ${tokens.border}`,
              borderRadius: 10, padding: '14px 18px', marginBottom: 10,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = step.color + '40'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = tokens.border; }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: tokens.text, marginBottom: 4 }}>{step.title}</div>
              <div style={{ fontSize: 12, color: tokens.muted, lineHeight: 1.5 }}>{step.desc}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
