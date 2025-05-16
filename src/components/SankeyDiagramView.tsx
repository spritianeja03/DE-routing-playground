
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
    // Removed p-6 and space-y-6, set to h-full and flex
    <div className="h-full flex flex-col"> 
      {/* Ensure SankeyDiagram has space and can fill height. min-h-[300px] might be redundant if h-full works */}
      <div className="flex-grow h-full"> 
        <SankeyDiagram data={sankeyData} />
      </div>
    </div>
  );
}
