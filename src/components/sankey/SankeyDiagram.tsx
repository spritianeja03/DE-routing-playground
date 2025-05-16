
import Image from 'next/image';
import type { SankeyData } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area'; // Added ScrollArea for JSON display

interface SankeyDiagramProps {
  data: SankeyData | null;
}

export function SankeyDiagram({ data }: SankeyDiagramProps) {
  if (data && data.nodes.length > 0) {
    return (
      // Using div with flex for layout, w-full and h-full to take available space
      <div className="h-full w-full flex flex-col items-start text-left bg-muted/20 rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-1">Live Transaction Flow</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Displaying simulated transaction data (raw JSON). Nodes: {data.nodes.length}, Links: {data.links.length}.
        </p>
        
        {/* Scrollable area for the JSON output */}
        <ScrollArea className="flex-grow w-full bg-background/50 p-2 rounded">
          <pre className="text-xs whitespace-pre-wrap break-all">
            {JSON.stringify(data, null, 2)}
          </pre>
        </ScrollArea>
        <p className="mt-2 text-xs text-muted-foreground">
            (Full visual Sankey diagram rendering is a next step)
        </p>
      </div>
    );
  }

  return (
    // Using div with flex for layout, w-full and h-full to take available space
    <div className="h-full w-full flex flex-col items-start text-left bg-muted/20 rounded-lg p-4">
      <h2 className="text-xl font-semibold mb-1">Live Transaction Flow</h2>
      <p className="text-sm text-muted-foreground mb-4">Visualizing transactions from Payment Method → Rule → Processor → Success/Failure.</p>
      {/* Centering placeholder image and text */}
      <div className="flex-grow w-full flex flex-col items-center justify-center text-center">
          <Image 
              src="https://placehold.co/800x400.png?text=Run+Simulation+to+See+Flow" 
              alt="Sankey Diagram Placeholder" 
              width={800} 
              height={400}
              className="rounded-md shadow-lg object-contain" // Added object-contain
              data-ai-hint="flow chart"
          />
          <p className="mt-4 text-muted-foreground">Click "Run Simulation" in the header to generate data.</p>
      </div>
    </div>
  );
}
