
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { SankeyData } from '@/lib/types';

interface SankeyDiagramProps {
  data: SankeyData | null;
}

export function SankeyDiagram({ data }: SankeyDiagramProps) {
  if (data && data.nodes.length > 0) {
    return (
      <Card className="h-full flex flex-col shadow-xl">
        <CardHeader>
          <CardTitle>Live Transaction Flow</CardTitle>
          <CardDescription>Displaying simulated transaction data.</CardDescription>
        </CardHeader>
        <CardContent className="flex-grow flex flex-col items-center justify-center bg-muted/20 rounded-b-lg p-4 text-center">
          <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary h-16 w-16 mb-4">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
            <path d="M7 12c0-2.76 2.24-5 5-5" />
            <path d="M12 17c2.76 0 5-2.24 5-5" />
             <path d="M12 7c-2.76 0-5 2.24-5 5" />
            <path d="M17 12c0 2.76-2.24 5-5 5" />
          </svg>
          <p className="text-lg font-semibold text-foreground">Simulation Data Active</p>
          <p className="text-sm text-muted-foreground">
            {data.nodes.length} nodes, {data.links.length} links generated.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            (Full Sankey diagram rendering is a next step)
          </p>
           {/* <pre className="mt-4 text-xs text-left overflow-auto max-h-40 w-full bg-background p-2 rounded border">
            {JSON.stringify(data, null, 2)}
          </pre> */}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col shadow-xl">
      <CardHeader>
        <CardTitle>Live Transaction Flow</CardTitle>
        <CardDescription>Visualizing transactions through processors, payment methods, and fallbacks.</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow flex items-center justify-center bg-muted/20 rounded-b-lg">
        <div className="text-center">
            <Image 
                src="https://placehold.co/800x400.png?text=Run+Simulation+to+See+Flow" 
                alt="Sankey Diagram Placeholder" 
                width={800} 
                height={400}
                className="rounded-md shadow-lg"
                data-ai-hint="flow chart"
            />
            <p className="mt-4 text-muted-foreground">Click "Run Simulation" in the controls panel to generate data.</p>
        </div>
      </CardContent>
    </Card>
  );
}
