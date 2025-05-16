
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

const CustomSankeyNode = (props: any) => {
  const { x, y, width, height, payload } = props;

  if (!payload || typeof payload.name !== 'string' || typeof payload.type !== 'string') {
    // console.warn("CustomSankeyNode: Received undefined or incomplete payload, skipping render.", payload);
    return null;
  }

  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') {
    // console.warn("CustomSankeyNode: Invalid/incomplete layout props, skipping render.", { x, y, width, height, payload });
    return null;
  }

  const nodeType = payload.type as AppSankeyNode['type'];
  let nodeColor = NODE_COLORS[nodeType] || '#8884d8';

  // payload.name is the ID (e.g., "status_success")
  if (payload.name === 'status_success') {
    nodeColor = STATUS_NODE_COLORS.status_success;
  } else if (payload.name === 'status_failure') {
    nodeColor = STATUS_NODE_COLORS.status_failure;
  } else if (!NODE_COLORS[nodeType]) {
    // console.warn("CustomSankeyNode: Unknown node type for color", payload.type, "using fallback.");
  }

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

const CustomNodeLabel = (props: any) => {
  const { x, y, width, height, payload, containerWidth } = props;

  if (!payload || typeof payload.displayName !== 'string' || typeof containerWidth === 'undefined') {
    // console.warn("CustomNodeLabel: Received undefined or incomplete payload/containerWidth, skipping render.", payload);
    return null;
  }
  
  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') {
    // console.warn("CustomNodeLabel: Invalid/incomplete layout props, skipping render.", { x, y, width, height, payload });
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
  
  const initialMappedNodes = (data.nodes || [])
    .map(node => {
      if (!node || typeof node.id !== 'string' || node.id === '' || 
          typeof node.name !== 'string' || node.name === '' || 
          typeof node.type !== 'string' || node.type === '') {
        // console.warn("SankeyDiagram: Invalid node structure in input data (id, name, or type is invalid/empty), discarding node:", node);
        return null; 
      }
      return {
        name: node.id, // This is the ID Recharts uses for linking
        displayName: node.name, // This is for display purposes
        type: node.type as AppSankeyNode['type'],
      };
    })
    .filter(Boolean) as Array<{ name: string; displayName: string; type: AppSankeyNode['type'] }>;

  if (initialMappedNodes.length === 0 && data.nodes.length > 0) {
    // This means all input nodes were invalid
    return (
        <div className="h-full w-full flex flex-col items-start text-left bg-muted/20 rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-1">Live Transaction Flow</h2>
        <p className="text-sm text-muted-foreground mb-4">
            Error: No valid nodes could be processed from the input data for the Sankey Diagram. All input nodes were invalid or empty.
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
            <p className="mt-4 text-muted-foreground">Could not process node information. Check console for details.</p>
        </div>
        </div>
    );
  }

  // Create a set of valid node IDs from initialMappedNodes for link validation
  const rechartsNodeIdSet = new Set(initialMappedNodes.map(n => n.name));

  const validRechartsLinksRaw = (data.links || [])
    .filter(link => {
      const sourceExists = typeof link.source === 'string' && link.source !== '' && rechartsNodeIdSet.has(link.source);
      const targetExists = typeof link.target === 'string' && link.target !== '' && rechartsNodeIdSet.has(link.target);
      const valueValid = typeof link.value === 'number' && link.value > 0;
      
      if (!sourceExists && link.value > 0) { /* console.warn("SankeyDiagram: Link source ID not found or invalid in mapped nodes:", link.source, "Link:", link); */ }
      if (!targetExists && link.value > 0) { /* console.warn("SankeyDiagram: Link target ID not found or invalid in mapped nodes:", link.target, "Link:", link); */ }
      if (!valueValid && (link.source || link.target)) { /* console.warn("SankeyDiagram: Link value is not a positive number:", link.value, "Link:", link); */ }

      return sourceExists && targetExists && valueValid;
    })
    .map(link => ({ // Ensure we only map valid links
        source: link.source,
        target: link.target,
        value: link.value,
    }));
  
  const validRechartsLinks = validRechartsLinksRaw.filter(Boolean);


  // Determine which nodes are actually participating in the valid links
  const participatingNodeIds = new Set<string>();
  validRechartsLinks.forEach(link => {
    if(link && typeof link.source === 'string') participatingNodeIds.add(link.source);
    if(link && typeof link.target === 'string') participatingNodeIds.add(link.target);
  });

  // Always include source and sink if they exist in the initial mapping,
  // as they might be intended to be rendered even if no links connect to them yet (e.g. initial state)
  const sourceNodeExists = initialMappedNodes.find(n => n.name === 'source');
  const sinkNodeExists = initialMappedNodes.find(n => n.name === 'sink');

  if (sourceNodeExists) participatingNodeIds.add('source');
  // Only add sink if there are links or if it's one of the very few nodes (e.g. just source and sink)
  if (sinkNodeExists && (validRechartsLinks.length > 0 || (initialMappedNodes.length <=2 && sourceNodeExists) ) ) {
     participatingNodeIds.add('sink');
  }


  const finalMappedNodesRaw = initialMappedNodes.filter(node => node && typeof node.name === 'string' && participatingNodeIds.has(node.name));
  const finalMappedNodes = finalMappedNodesRaw.filter(Boolean);

  // Stricter condition for rendering: need at least 2 nodes and 1 link.
  const canRenderSankey = finalMappedNodes.length >= 2 && validRechartsLinks.length >= 1;

  if (!canRenderSankey) {
    let message = "No valid transaction flows to display yet.";
    let subMessage = "Waiting for consistent transaction data with positive flow values (at least 2 nodes and 1 link).";
    let imgText = "No Valid Flows";
    let hint = "empty chart";

    if (data.nodes.length > 0 && initialMappedNodes.length === 0) {
        message = "Error processing input node data.";
        subMessage = "Please check the console for warnings about invalid node structures.";
        imgText = "Node Data Error";
        hint = "error graph";
    } else if (finalMappedNodes.length < 2 && initialMappedNodes.length > 0) {
        message = "Not enough connected nodes to display a flow.";
        subMessage = "A Sankey diagram requires at least two nodes connected by a link.";
        imgText = "Needs More Data";
        hint = "data flow chart";
    } else if (validRechartsLinks.length === 0 && finalMappedNodes.length >= 2) {
        message = "Nodes are present but no transactions have flowed between them.";
        subMessage = "This can happen if all transaction values are zero or links are invalid.";
        imgText = "Awaiting Connections";
        hint = "data flow";
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
  // Create a key that changes when the number of nodes or links changes
  // This can help Recharts reset its internal state if the graph structure changes significantly
  const sankeyKey = `sankey-${finalMappedNodes.length}-${validRechartsLinks.length}`;

  return (
    <div className="h-full w-full flex flex-col items-start text-left bg-muted/20 rounded-lg p-1">
      <h2 className="text-lg font-semibold mb-0.5 px-3 pt-2">Live Transaction Flow</h2>
      <p className="text-xs text-muted-foreground mb-1 px-3">
        Nodes: {finalMappedNodes.length}, Links: {validRechartsLinks.length}.
      </p>

      <ResponsiveContainer width="100%" height="100%" className="flex-grow min-h-[300px]">
        <Sankey
          key={sankeyKey} 
          data={{nodes: finalMappedNodes.filter(Boolean), links: validRechartsLinks.filter(Boolean)}}
          node={<CustomSankeyNode />}
          label={<CustomNodeLabel />}
          nodePadding={25} 
          margin={{ top: 20, right: 150, left: 150, bottom: 20 }} 
          link={{ stroke: 'hsl(var(--border))', strokeOpacity: 0.5, strokeWidth: Math.max(1, 2) }}
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
                  typeof props.payload.source === 'object' && typeof props.payload.target === 'object' &&
                  typeof props.payload.source.name === 'string' && typeof props.payload.target.name === 'string' ) {
                
                const sourceNode = finalMappedNodes.find(n => n.name === props.payload.source.name);
                const targetNode = finalMappedNodes.find(n => n.name === props.payload.target.name);
                
                const sourceName = sourceNode?.displayName || props.payload.source.name || 'Unknown Source';
                const targetName = targetNode?.displayName || props.payload.target.name || 'Unknown Target';
                return [`${(typeof value === 'number' ? value.toLocaleString() : value)} transactions`, `${sourceName} → ${targetName}`];
              }
              return [(typeof value === 'number' ? value.toLocaleString() : value), name || 'Link'];
            }}
          />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}

