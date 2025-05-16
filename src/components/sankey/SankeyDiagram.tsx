
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
    console.warn("CustomSankeyNode: Invalid props or payload", props);
    return null;
  }

  const nodeType = payload.type as AppSankeyNode['type'];
  let nodeColor = NODE_COLORS[nodeType] || '#8884d8'; // Fallback color

  if (payload.name === 'status_success') {
    nodeColor = STATUS_NODE_COLORS.status_success;
  } else if (payload.name === 'status_failure') {
    nodeColor = STATUS_NODE_COLORS.status_failure;
  } else if (!NODE_COLORS[nodeType]) {
    console.warn("CustomSankeyNode: Unknown node type for color", payload.type, "using fallback.");
  }


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
    console.warn("CustomNodeLabel: Invalid props or payload", props);
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

interface SankeyDiagramProps {
  data: SankeyData | null;
}

export function SankeyDiagram({ data }: SankeyDiagramProps) {
  if (!data || !data.nodes || data.nodes.length === 0) {
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
  
  const initialMappedNodes = data.nodes
    .map(node => {
      if (!node || typeof node.id !== 'string' || typeof node.name !== 'string' || typeof node.type !== 'string') {
        console.warn("SankeyDiagram: Invalid node structure in input data", node);
        return null; 
      }
      return {
        name: node.id, 
        displayName: node.name, 
        type: node.type as AppSankeyNode['type'],
      };
    })
    .filter(Boolean) as Array<{ name: string; displayName: string; type: AppSankeyNode['type'] }>;

  if (initialMappedNodes.length === 0 && data.nodes.length > 0) {
    return (
        <div className="h-full w-full flex flex-col items-start text-left bg-muted/20 rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-1">Live Transaction Flow</h2>
        <p className="text-sm text-muted-foreground mb-4">
            Error: No valid nodes could be processed from the input data for the Sankey Diagram.
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

  const rechartsNodeIdSet = new Set(initialMappedNodes.map(n => n.name));

  const validRechartsLinks = (data.links || [])
    .filter(link => {
      const isValid = link &&
        typeof link.source === 'string' &&
        rechartsNodeIdSet.has(link.source) &&
        typeof link.target === 'string' &&
        rechartsNodeIdSet.has(link.target) &&
        typeof link.value === 'number' &&
        link.value > 0;
      if (!isValid && link && link.value > 0) {
        console.warn("SankeyDiagram: Invalid or orphaned link detected", link, "Available node IDs:", Array.from(rechartsNodeIdSet));
      }
      return isValid;
    })
    .map(link => ({ 
        source: link.source,
        target: link.target,
        value: link.value,
    }))
    .filter(Boolean);


  // Filter nodes to only those participating in valid links, plus source and sink
  const participatingNodeIds = new Set<string>();
  validRechartsLinks.forEach(link => {
    participatingNodeIds.add(link.source);
    participatingNodeIds.add(link.target);
  });

  // Always try to include source and sink if they exist in initialMappedNodes
  const sourceNodeExists = initialMappedNodes.find(n => n.name === 'source');
  const sinkNodeExists = initialMappedNodes.find(n => n.name === 'sink');
  if (sourceNodeExists) participatingNodeIds.add('source');
  if (sinkNodeExists) participatingNodeIds.add('sink');

  const finalMappedNodes = initialMappedNodes.filter(node => participatingNodeIds.has(node.name));

  if (finalMappedNodes.length === 0 || (finalMappedNodes.length > 0 && validRechartsLinks.length === 0 && !(finalMappedNodes.length === 1 && finalMappedNodes[0].name === 'source'))) {
    let message = "No valid transaction flows to display yet.";
    let subMessage = "Waiting for consistent transaction data with positive flow values.";
    let imgText = "No Valid Flows";
    let hint = "empty chart";

    if (finalMappedNodes.length === 0 && data.nodes.length > 0) {
        message = "No nodes are part of an active transaction flow.";
        subMessage = "Check if simulation is generating links between nodes.";
        imgText = "No Active Nodes";
        hint = "data flow";
    } else if (finalMappedNodes.length > 0 && validRechartsLinks.length === 0 && !(finalMappedNodes.length === 1 && finalMappedNodes[0].name === 'source')) {
        message = "Nodes are present but no transactions have flowed between them.";
        subMessage = "This can happen if all transaction values are zero or links are invalid.";
        imgText = "Awaiting Connections";
        hint = "data flow";
    } else if (data.nodes.length === 0) { // Initial state check already at the top
        message = "Run simulation to see flow.";
        subMessage = "Click 'Start Simulation' in the header to generate data.";
        imgText = "Run Simulation";
        hint = "flow chart";
    }
    
    return (
      <div className="h-full w-full flex flex-col items-start text-left bg-muted/20 rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-1">Live Transaction Flow</h2>
        <p className="text-sm text-muted-foreground mb-4">{message}</p>
        <div className="flex-grow w-full flex flex-col items-center justify-center text-center">
            <Image
                src={`https://placehold.co/800x400.png?text=${encodeURIComponent(imgText)}`}
                alt={`${imgText} Placeholder`}
                width={800}
                height={400}
                className="rounded-md shadow-lg object-contain opacity-70"
                data-ai-hint={hint}
            />
            <p className="mt-4 text-muted-foreground">{subMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col items-start text-left bg-muted/20 rounded-lg p-1">
      <h2 className="text-lg font-semibold mb-0.5 px-3 pt-2">Live Transaction Flow</h2>
      <p className="text-xs text-muted-foreground mb-1 px-3">
        Nodes: {finalMappedNodes.length}, Links: {validRechartsLinks.length}.
      </p>

      <ResponsiveContainer width="100%" height="100%" className="flex-grow min-h-[300px]">
        <Sankey
          data={{nodes: finalMappedNodes, links: validRechartsLinks}}
          node={<CustomSankeyNode />}
          label={<CustomNodeLabel />}
          nodePadding={25} 
          margin={{ top: 20, right: 150, left: 150, bottom: 20 }} 
          link={{ stroke: 'hsl(var(--border))', strokeOpacity: 0.5, strokeWidth: 1 }}
          iterations={32} 
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
              if (props.payload && props.payload.source && props.payload.target && 
                  typeof props.payload.source === 'object' && typeof props.payload.target === 'object') {
                const sourceNode = finalMappedNodes.find(n => n.name === props.payload.source.name);
                const targetNode = finalMappedNodes.find(n => n.name === props.payload.target.name);
                const sourceName = sourceNode?.displayName || props.payload.source.name || 'Unknown Source';
                const targetName = targetNode?.displayName || props.payload.target.name || 'Unknown Target';
                return [`${value.toLocaleString()} transactions`, `${sourceName} → ${targetName}`];
              }
              return [value.toLocaleString(), name || 'Link'];
            }}
          />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}

