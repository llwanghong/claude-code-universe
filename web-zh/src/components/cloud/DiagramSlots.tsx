import { useEffect } from 'react';
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
  useEffect(() => {
    const slots = document.querySelectorAll<HTMLElement>('.diagram-slot');
    const rendered = new Set<Element>();

    slots.forEach((slot) => {
      if (rendered.has(slot)) return;
      rendered.add(slot);

      const name = slot.getAttribute('data-diagram');
      if (!name) return;

      const Diagram = DIAGRAMS[name];
      if (Diagram) {
        createRoot(slot).render(<Diagram />);
      }
    });
  }, []);

  return null;
}
