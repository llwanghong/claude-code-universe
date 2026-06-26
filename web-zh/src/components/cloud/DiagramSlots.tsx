import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CloudArchitectureDiagram from './CloudArchitectureDiagram';
import ExecutionPlaneDiagram from './ExecutionPlaneDiagram';
import PermissionFlowDiagram from './PermissionFlowDiagram';
import SecurityLayersDiagram from './SecurityLayersDiagram';

const DIAGRAMS: Record<string, React.ComponentType> = {
  CloudArchitectureDiagram,
  ExecutionPlaneDiagram,
  PermissionFlowDiagram,
  SecurityLayersDiagram,
};

export default function DiagramSlots() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) return null;

  // Find all diagram slots and render the matching component into each
  const slots = document.querySelectorAll('.diagram-slot');
  const rendered = new Set<string>();

  slots.forEach((slot) => {
    const name = slot.getAttribute('data-diagram');
    const index = slot.getAttribute('data-diagram-index');
    if (!name || !index) return;

    const key = `${name}-${index}`;
    if (rendered.has(key)) return;
    rendered.add(key);

    const Diagram = DIAGRAMS[name];
    if (Diagram) {
      createRoot(slot).render(<Diagram />);
    }
  });

  return null;
}
