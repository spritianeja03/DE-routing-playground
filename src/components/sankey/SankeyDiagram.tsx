
"use client";

import Image from 'next/image';
import type { SankeyData, SankeyNode as AppSankeyNode } from '@/lib/types';
import { ResponsiveContainer, Sankey, Tooltip, Rectangle, Text } from 'recharts';

const NODE_COLORS: Record<AppSankeyNode['type'], string> = {
  source: 'hsl(var(--chart-1))',
  paymentMethod: 'hsl(var(--chart-2))',
  ruleStrategy: 'hsl(var(--chart-3))',
  processor: 'hsl(var(--chart-4))',
  status: 'hsl(var(--chart-5))',
  sink: '#BDBDBD', // A neutral color for the sink
};

const STATUS_NODE_COLORS: Record<string, string> = {
  status_success: '#66BB6A', // Green
  status_failure: '#EF5350', // Red
};

// Moved outside SankeyDiagram component for stable reference
const CustomSankeyNode = (props: any) => {
  const { x, y, width, height, payload } = props;

  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number' || 
      !payload || typeof payload.name !== 'string' || typeof payload.type !== 'string') {
    return null;
  }

  const nodeColor = 
    payload.name === 'status_success' ? STATUS_NODE_COLORS.status_success :
    payload.name === 'status_failure' ? STATUS_NODE_COLORS.status_failure :
    NODE_COLORS[payload.type as AppSankeyNode['type']] || '#8884d8'; // Fallback color

  return (
    <Rectangle
      x={x}
      y={y}
      width={width}
      height={Math.max(height, 20)} // Ensure minimum height for visibility
      fill={nodeColor}
      fillOpacity="1"
      stroke="hsl(var(--background))" // Use background for stroke for better contrast in dark/light
      strokeWidth={1}
    />
  );
};

// Moved outside SankeyDiagram component for stable reference
const CustomNodeLabel = (props: any) => {
  const { x, y, width, height, payload, containerWidth } = props;

  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number' || 
      !payload || typeof payload.displayName !== 'string' || typeof containerWidth !== 'number') {
    return null;
  }
  
  const isOut = x + width / 2 > containerWidth / 2;
  const labelText = payload.displayName.length > 20 ? payload.displayName.substring(0, 17) + '...' : payload.displayName;

  if (height < 10) return null; // Don't render label if node is too small

  return (
    <g>
      <Text
        x={isOut ? x - 6 : x + width + 6}
        y={y + height / 2}
        textAnchor={isOut ? "end" : "start"}
        dominantBaseline="middle"
        fill="hsl(var(--foreground))"
        fontSize="12px"
        fontWeight="500"
      >
        {labelText}
      </Text>
    </g>
  );
};


export function SankeyDiagram({ data }: SankeyDiagramProps) {
  if (!data || !data.nodes || data.nodes.length === 0) {
    // Initial placeholder when no data or no nodes at all
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
  
  // Robust mapping for nodes
  const mappedNodes = data.nodes
    .map(node => {
      if (!node || typeof node.id !== 'string' || typeof node.name !== 'string' || typeof node.type !== 'string') {
        return null; // Explicitly return null for invalid node structures
      }
      return {
        name: node.id, // Recharts uses 'name' for linking
        displayName: node.name, // Original name for display
        type: node.type, // For custom styling
      };
    })
    .filter(Boolean) as Array<{ name: string; displayName: string; type: AppSankeyNode['type'] }>;

  if (mappedNodes.length === 0 && data.nodes.length > 0) {
     // All original nodes were invalid
    return (
        <div className="h-full w-full flex flex-col items-start text-left bg-muted/20 rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-1">Live Transaction Flow</h2>
        <p className="text-sm text-muted-foreground mb-4">
            Error preparing node data for Sankey Diagram.
        </p>
        <div className="flex-grow w-full flex flex-col items-center justify-center text-center">
            <Image
                src="https://placehold.co/800x400.png?text=Node+Data+Error"
                alt="Node Data Error Placeholder"
                width={800}
                height={400}
                className="rounded-md shadow-lg object-contain opacity-70"
                data-ai-hint="error graph"
            />
            <p className="mt-4 text-muted-foreground">Could not process node information.</p>
        </div>
        </div>
    );
  }

  const rechartsNodeNames = new Set(mappedNodes.map(n => n.name));

  const validRechartsLinks = data.links
    .filter(link => {
      return (
        link &&
        typeof link.source === 'string' &&
        rechartsNodeNames.has(link.source) &&
        typeof link.target === 'string' &&
        rechartsNodeNames.has(link.target) &&
        typeof link.value === 'number' &&
        link.value > 0
      );
    })
    .map(link => ({ // Ensure clean link objects
        source: link.source,
        target: link.target,
        value: link.value,
    }));


  if (validRechartsLinks.length === 0 && data.links && data.links.length > 0) {
    // Original links existed, but none were valid after filtering against mappedNodes
    return (
      <div className="h-full w-full flex flex-col items-start text-left bg-muted/20 rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-1">Live Transaction Flow</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Simulation is running or has run, but no valid transaction flows to display. Check node and link consistency.
        </p>
        <div className="flex-grow w-full flex flex-col items-center justify-center text-center">
            <Image
                src="https://placehold.co/800x400.png?text=No+Valid+Flows"
                alt="No Valid Flow Data Placeholder"
                width={800}
                height={400}
                className="rounded-md shadow-lg object-contain opacity-70"
                data-ai-hint="empty chart"
            />
            <p className="mt-4 text-muted-foreground">Waiting for consistent transaction data with positive flow values.</p>
        </div>
      </div>
    );
  }
  
  if (mappedNodes.length > 0 && validRechartsLinks.length === 0 && !(mappedNodes.length ===1 && mappedNodes[0].name === 'source')) {
     // We have nodes, but no links to connect them (and it's not just the initial "source" node)
     return (
      <div className="h-full w-full flex flex-col items-start text-left bg-muted/20 rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-1">Live Transaction Flow</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Nodes are present but no transactions have flowed between them yet.
        </p>
        <div className="flex-grow w-full flex flex-col items-center justify-center text-center">
            <Image
                src="https://placehold.co/800x400.png?text=Awaiting+Connections"
                alt="Awaiting Connections Placeholder"
                width={800}
                height={400}
                className="rounded-md shadow-lg object-contain opacity-70"
                data-ai-hint="data flow"
            />
            <p className="mt-4 text-muted-foreground">Waiting for link data.</p>
        </div>
      </div>
    );
  }
  
  // If, after all filtering, we have no nodes to render, show placeholder.
  // This case should ideally be caught by earlier checks.
  if (mappedNodes.length === 0) {
     return (
        <div className="h-full w-full flex flex-col items-start text-left bg-muted/20 rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-1">Live Transaction Flow</h2>
        <p className="text-sm text-muted-foreground mb-4">
            No valid nodes to display for Sankey Diagram.
        </p>
        <div className="flex-grow w-full flex flex-col items-center justify-center text-center">
            <Image
                src="https://placehold.co/800x400.png?text=No+Nodes"
                alt="No Nodes Placeholder"
                width={800}
                height={400}
                className="rounded-md shadow-lg object-contain opacity-70"
                data-ai-hint="empty state"
            />
            <p className="mt-4 text-muted-foreground">No node data available for rendering.</p>
        </div>
        </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col items-start text-left bg-muted/20 rounded-lg p-1">
      <h2 className="text-lg font-semibold mb-0.5 px-3 pt-2">Live Transaction Flow</h2>
      <p className="text-xs text-muted-foreground mb-1 px-3">
        Visualizing transactions. Nodes: {mappedNodes.length}, Links: {validRechartsLinks.length}.
      </p>

      <ResponsiveContainer width="100%" height="100%" className="flex-grow min-h-[300px]">
        <Sankey
          data={{nodes: mappedNodes, links: validRechartsLinks}}
          node={<CustomSankeyNode />}
          label={<CustomNodeLabel />}
          nodePadding={25} // Increased padding
          margin={{ top: 20, right: 150, left: 150, bottom: 20 }} // Increased side margins for labels
          link={{ stroke: 'hsl(var(--border))', strokeOpacity: 0.5, strokeWidth: 1 }}
          iterations={32} // Default Sankey calculation iterations
        >
          <Tooltip
            contentStyle={{ 
              backgroundColor: 'hsl(var(--popover))', 
              border: '1px solid hsl(var(--border))', 
              borderRadius: 'var(--radius)',
              boxShadow: '0 4px 6px hsla(0, 0%, 0%, 0.1)',
            }}
            labelStyle={{ color: 'hsl(var(--popover-foreground))', fontWeight: 'bold', marginBottom: '4px' }}
            itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
            formatter={(value: any, name: any, props: any) => {
              // props.payload contains the link object: {source, target, value, ...}
              // props.payload.source and props.payload.target are the node objects themselves
              if (props.payload && props.payload.source && props.payload.target) {
                const sourceNode = mappedNodes.find(n => n.name === props.payload.source.name);
                const targetNode = mappedNodes.find(n => n.name === props.payload.target.name);
                const sourceName = sourceNode?.displayName || props.payload.source.name;
                const targetName = targetNode?.displayName || props.payload.target.name;
                return [`${value.toLocaleString()} transactions`, `${sourceName} → ${targetName}`];
              }
              return [value.toLocaleString(), name];
            }}
          />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}
