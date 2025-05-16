
"use client";

import Image from 'next/image';
import type { SankeyData, SankeyNode } from '@/lib/types';
import { ResponsiveContainer, Sankey, Tooltip, Rectangle, Text } from 'recharts';

interface SankeyDiagramProps {
  data: SankeyData | null;
}

const NODE_COLORS: Record<SankeyNode['type'], string> = {
  source: 'hsl(var(--chart-1))', 
  paymentMethod: 'hsl(var(--chart-2))', 
  ruleStrategy: 'hsl(var(--chart-3))',
  processor: 'hsl(var(--chart-4))', 
  status: 'hsl(var(--chart-5))', 
  sink: '#BDBDBD',   
};

const STATUS_NODE_COLORS: Record<string, string> = {
  status_success: '#66BB6A', // Green
  status_failure: '#EF5350', // Red
}

// Custom Sankey Node component for styling
const CustomSankeyNode = (props: any) => {
  const { x, y, width, height, payload } = props; // payload contains the node data
  // payload will be { name: 'node_id', displayName: 'Actual Name', type: '...', ... }

  const nodeColor = payload.name === 'status_success' ? STATUS_NODE_COLORS.status_success : // payload.name is the ID here
                    payload.name === 'status_failure' ? STATUS_NODE_COLORS.status_failure :
                    NODE_COLORS[payload.type as SankeyNode['type']] || '#8884d8';
  
  return (
    <Rectangle
      x={x}
      y={y}
      width={width}
      height={Math.max(height, 20)} // Ensure minimum height for visibility
      fill={nodeColor}
      fillOpacity="1"
      stroke="hsl(var(--background))" // Use background for stroke for better contrast
      strokeWidth={1}
    />
  );
};

// Custom label for Sankey nodes to display `displayName`
const CustomNodeLabel = (props: any) => {
  const { x, y, width, height, payload, containerWidth } = props;
  // payload is { name: 'node_id', displayName: 'Actual Name', type: '...', ... }
  const isOut = x + width / 2 > containerWidth / 2;
  
  // Prevent label overflow for very wide nodes or very short heights
  const labelText = payload.displayName.length > 20 ? payload.displayName.substring(0, 17) + '...' : payload.displayName;

  if (height < 10) return null; // Don't render label if node is too small

  return (
    <g>
      <Text
        x={isOut ? x - 6 : x + width + 6}
        y={y + height / 2}
        textAnchor={isOut ? "end" : "start"}
        dominantBaseline="middle"
        fill="hsl(var(--foreground))" // Use themed foreground color
        fontSize="12px"
        fontWeight="500"
      >
        {labelText}
      </Text>
    </g>
  );
};


export function SankeyDiagram({ data }: SankeyDiagramProps) {
  if (data && data.nodes.length > 0 && data.links.length > 0) {
    const validNodeIds = new Set(data.nodes.map(n => n.id));
    const filteredLinks = data.links.filter(
      link => validNodeIds.has(link.source) && validNodeIds.has(link.target) && link.value > 0
    );

    if (filteredLinks.length === 0) {
      return (
        <div className="h-full w-full flex flex-col items-start text-left bg-muted/20 rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-1">Live Transaction Flow</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Simulation is running or has run, but no transaction flows to display yet.
          </p>
          <div className="flex-grow w-full flex flex-col items-center justify-center text-center">
              <Image 
                  src="https://placehold.co/800x400.png?text=No+Flow+Data" 
                  alt="No Flow Data Placeholder" 
                  width={800} 
                  height={400}
                  className="rounded-md shadow-lg object-contain opacity-70"
                  data-ai-hint="empty chart"
              />
              <p className="mt-4 text-muted-foreground">Waiting for transaction data with positive flow values.</p>
          </div>
        </div>
      );
    }
    
    const sankeyChartData = {
      nodes: data.nodes.map(node => ({ 
        name: node.id, // Use ID as the linking key for Recharts
        displayName: node.name, // Original name for display
        type: node.type, // For custom node coloring
        // id: node.id // Keep id if CustomSankeyNode needs it directly as `payload.id` instead of `payload.name`
      })),
      links: filteredLinks.map(link => ({
        ...link,
        // Ensure source/target match the `name` (which is now id) of nodes
        source: link.source, 
        target: link.target,
      })),
    };

    return (
      <div className="h-full w-full flex flex-col items-start text-left bg-muted/20 rounded-lg p-1">
        <h2 className="text-lg font-semibold mb-0.5 px-3 pt-2">Live Transaction Flow</h2>
        <p className="text-xs text-muted-foreground mb-1 px-3">
          Visualizing transactions. Nodes: {sankeyChartData.nodes.length}, Links: {sankeyChartData.links.length}.
        </p>
        
        <ResponsiveContainer width="100%" height="100%" className="flex-grow min-h-[300px]">
          <Sankey
            data={sankeyChartData}
            node={<CustomSankeyNode />}
            label={<CustomNodeLabel />}
            nodePadding={20} 
            margin={{ top: 20, right: 100, left: 100, bottom: 20 }} // Increased side margins for labels
            link={{ stroke: 'hsl(var(--border))', strokeOpacity: 0.6, strokeWidth: 1 }} 
            iterations={32} 
          >
            <Tooltip 
              contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' }}
              labelStyle={{ color: 'hsl(var(--popover-foreground))', fontWeight: 'bold' }}
              itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
              formatter={(value: any, name: any, props: any) => {
                // props.payload.source and props.payload.target are the node objects from sankeyChartData.nodes
                if (props.payload && props.payload.source && props.payload.target) {
                  const sourceName = props.payload.source.displayName || props.payload.source.name; // Use displayName
                  const targetName = props.payload.target.displayName || props.payload.target.name; // Use displayName
                  return [`${value} transactions`, `${sourceName} → ${targetName}`];
                }
                return [value, name]; // Fallback, 'name' here is the link's source/target ID
              }}
            />
          </Sankey>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col items-start text-left bg-muted/20 rounded-lg p-4">
      <h2 className="text-xl font-semibold mb-1">Live Transaction Flow</h2>
      <p className="text-sm text-muted-foreground mb-4">Visualizing transactions from Payment Method → Rule → Processor → Success/Failure.</p>
      <div className="flex-grow w-full flex flex-col items-center justify-center text-center">
          <Image 
              src="https://placehold.co/800x400.png?text=Run+Simulation+to+See+Flow" 
              alt="Sankey Diagram Placeholder" 
              width={800} 
              height={400}
              className="rounded-md shadow-lg object-contain"
              data-ai-hint="flow chart"
          />
          <p className="mt-4 text-muted-foreground">Click "Start Simulation" in the header to generate data.</p>
      </div>
    </div>
  );
}
