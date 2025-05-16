import type React from 'react';
import { SankeyDiagram } from './sankey/SankeyDiagram';
import { AIInsights } from './sankey/AIInsights';
import type { FormValues } from './BottomControlsPanel';

interface SankeyDiagramViewProps {
  currentControls: FormValues | null;
}

export function SankeyDiagramView({ currentControls }: SankeyDiagramViewProps) {
  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto">
      <div className="flex-grow min-h-[300px]"> {/* Ensure SankeyDiagram has space */}
        <SankeyDiagram />
      </div>
      <AIInsights currentControls={currentControls} />
    </div>
  );
}
