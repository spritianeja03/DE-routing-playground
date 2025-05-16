
import type React from 'react';
import { SankeyDiagram } from './sankey/SankeyDiagram';
import type { FormValues } from './BottomControlsPanel';
import type { SankeyData } from '@/lib/types';

interface SankeyDiagramViewProps {
  currentControls: FormValues | null;
  sankeyData: SankeyData | null;
}

export function SankeyDiagramView({ currentControls, sankeyData }: SankeyDiagramViewProps) {
  return (
    <div className="h-full flex flex-col p-6 space-y-6"> {/* Removed overflow-y-auto */}
      <div className="flex-grow min-h-[300px] h-full"> {/* Ensure SankeyDiagram has space and can fill height */}
        <SankeyDiagram data={sankeyData} />
      </div>
    </div>
  );
}
