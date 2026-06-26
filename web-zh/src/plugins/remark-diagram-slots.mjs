/**
 * Remark plugin: replaces :::diagram Name::: blocks with placeholder divs.
 * A React component scans these slots and teleports the actual diagram in.
 * Same pattern as remark-mermaid-raw.mjs
 */
let slotCounter = 0;

export default function remarkDiagramSlots() {
  return (tree) => {
    slotCounter = 0;
    walkTree(tree);
  };
}

function walkTree(node) {
  if (!node.children) return;

  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i];

    // Look for :::diagram Name::: pattern
    // This appears in the AST as a paragraph containing only text matching the pattern
    if (child.type === 'paragraph' && child.children?.length === 1) {
      const textNode = child.children[0];
      if (textNode.type === 'text') {
        const match = textNode.value.match(/^:::diagram\s+(\w+)\s*:::$/);
        if (match) {
          const name = match[1];
          const newNode = {
            type: 'html',
            value: `<div class="diagram-slot" data-diagram="${name}" data-diagram-index="${slotCounter}"></div>`,
          };
          node.children.splice(i, 1, newNode);
          slotCounter++;
        }
      }
    }

    // Recurse into children
    walkTree(child);
  }
}
