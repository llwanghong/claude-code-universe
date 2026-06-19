// Converts ```mermaid blocks to <pre class="mermaid"> for client-side rendering
let counter = 0

export default function remarkMermaid() {
  return (tree) => {
    counter = 0
    walk(tree)
  }
}

function walk(node) {
  if (!node.children) return
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]
    if (child.type === 'code' && child.lang === 'mermaid') {
      node.children[i] = {
        type: 'html',
        value: `<pre class="mermaid" data-diagram="${counter++}">${escapeHtml(child.value)}</pre>`,
      }
    } else {
      walk(child)
    }
  }
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
