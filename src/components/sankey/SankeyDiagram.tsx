"use client";

import Image from 'next/image';
import type { SankeyData, SankeyNode as AppSankeyNode } from '@/lib/types'; // Renamed SankeyNode to AppSankeyNode to avoid conflict
import { ResponsiveContainer, Sankey, Tooltip, Rectangle, Text } from 'recharts';

interface SankeyDiagramProps {
  data: SankeyData | null;
}

const NODE_COLORS: Record<AppSankeyNode['type'], string> = {
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
  const { x, y, width, height, payload } = props;

  // Stricter guard: ensure payload and its necessary properties are valid
  if (typeof x === 'undefined' || typeof y === 'undefined' || typeof width === 'undefined' || typeof height === 'undefined' || !payload || !payload.name || !payload.type) {
    return null;
  }

  const nodeColor = payload.name === 'status_success' ? STATUS_NODE_COLORS.status_success :
                    payload.name === 'status_failure' ? STATUS_NODE_COLORS.status_failure :
                    NODE_COLORS[payload.type as AppSankeyNode['type']] || '#8884d8';

  return (
    <Rectangle
      x={x}
      y={y}
      width={width}
      height={Math.max(height, 20)}
      fill={nodeColor}
      fillOpacity="1"
      stroke="hsl(var(--background))"
      strokeWidth={1}
    />
  );
};

// Custom label for Sankey nodes to display `displayName`
const CustomNodeLabel = (props: any) => {
  const { x, y, width, height, payload, containerWidth } = props;

  // Stricter guard: ensure payload, its displayName, and containerWidth are valid
  if (typeof x === 'undefined' || typeof y === 'undefined' || typeof width === 'undefined' || typeof height === 'undefined' || !payload || typeof payload.displayName !== 'string' || typeof containerWidth === 'undefined') {
    return null;
  }

  const isOut = x + width / 2 > containerWidth / 2;
  const labelText = payload.displayName.length > 20 ? payload.displayName.substring(0, 17) + '...' : payload.displayName;

  if (height < 10) return null;

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

    const mappedNodes = data.nodes.map(node => ({
        name: node.id, // Recharts uses 'name' for linking
        displayName: node.name, // For display
        type: node.type,
    })).filter(Boolean); // Filter out any potential undefined entries

    const rechartsNodeNames = new Set(mappedNodes.map(n => n.name));
    const validRechartsLinks = filteredLinks.map(link => ({
        ...link,
        source: link.source,
        target: link.target,
    })).filter(
        link => rechartsNodeNames.has(link.source) && rechartsNodeNames.has(link.target)
    ).filter(Boolean); // Filter out any potential undefined entries

    if (mappedNodes.length === 0 || validRechartsLinks.length === 0) {
        // If after all filtering, we have no nodes or no links, show placeholder
        return (
            <div className="h-full w-full flex flex-col items-start text-left bg-muted/20 rounded-lg p-4">
            <h2 className="text-xl font-semibold mb-1">Live Transaction Flow</h2>
            <p className="text-sm text-muted-foreground mb-4">
                Error preparing data for Sankey Diagram or no valid flow.
            </p>
            <div className="flex-grow w-full flex flex-col items-center justify-center text-center">
                <Image
                    src="https://placehold.co/800x400.png?text=Data+Error+or+No+Flow"
                    alt="Data Error Placeholder"
                    width={800}
                    height={400}
                    className="rounded-md shadow-lg object-contain opacity-70"
                    data-ai-hint="error graph"
                />
                <p className="mt-4 text-muted-foreground">Could not render flow data due to inconsistencies or no flow.</p>
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
            nodePadding={20}
            margin={{ top: 20, right: 100, left: 100, bottom: 20 }}
            link={{ stroke: 'hsl(var(--border))', strokeOpacity: 0.6, strokeWidth: 1 }}
            iterations={32}
          >
            <Tooltip
              contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' }}
              labelStyle={{ color: 'hsl(var(--popover-foreground))', fontWeight: 'bold' }}
              itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
              formatter={(value: any, name: any, props: any) => {
                if (props.payload && props.payload.source && props.payload.target) {
                  // props.payload.source.name and props.payload.target.name are the IDs
                  // We need to find the displayName from our mappedNodes
                  const sourceNode = mappedNodes.find(n => n.name === props.payload.source.name);
                  const targetNode = mappedNodes.find(n => n.name === props.payload.target.name);
                  const sourceName = sourceNode?.displayName || props.payload.source.name;
                  const targetName = targetNode?.displayName || props.payload.target.name;
                  return [`${value} transactions`, `${sourceName} → ${targetName}`];
                }
                return [value, name];
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

