
import type React from 'react';
import { SankeyDiagram } from './sankey/SankeyDiagram';
// AIInsights import removed
import type { FormValues } from './BottomControlsPanel';
import type { SankeyData } from '@/lib/types';

interface SankeyDiagramViewProps {
  currentControls: FormValues | null;
  sankeyData: SankeyData | null;
}

export function SankeyDiagramView({ currentControls, sankeyData }: SankeyDiagramViewProps) {
  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto">
      <div className="flex-grow min-h-[300px]"> {/* Ensure SankeyDiagram has space */}
        <SankeyDiagram data={sankeyData} />
      </div>
      {/* AIInsights component removed */}
    </div>
  );
}
