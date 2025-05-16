import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export function SankeyDiagram() {
  return (
    <Card className="h-full flex flex-col shadow-xl">
      <CardHeader>
        <CardTitle>Live Transaction Flow</CardTitle>
        <CardDescription>Visualizing transactions through processors, payment methods, and fallbacks.</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow flex items-center justify-center bg-muted/20 rounded-b-lg">
        <div className="text-center">
            <Image 
                src="https://placehold.co/800x400.png?text=Live+Sankey+Diagram" 
                alt="Sankey Diagram Placeholder" 
                width={800} 
                height={400}
                className="rounded-md shadow-lg"
                data-ai-hint="flow chart"
            />
            <p className="mt-4 text-muted-foreground">Sankey diagram will be rendered here.</p>
        </div>
      </CardContent>
    </Card>
  );
}
