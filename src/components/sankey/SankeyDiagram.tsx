
"use client";

import Image from 'next/image';
import type { SankeyData, SankeyNode } from '@/lib/types';
import { ResponsiveContainer, Sankey, Tooltip, Rectangle } from 'recharts';
import { RULE_STRATEGY_NODES } from '@/lib/constants';

interface SankeyDiagramProps {
  data: SankeyData | null;
}

const NODE_COLORS: Record<SankeyNode['type'], string> = {
  source: '#42A5F5', // Primary (Neon Blue)
  paymentMethod: '#BB86FC', // Accent (Electric Purple)
  ruleStrategy: '#26A69A', // Teal/Cyan (similar to chart-3)
  processor: '#FFA726', // Orange
  status: '#66BB6A', // Green for success, could be dynamic
  sink: '#BDBDBD',   // Neutral Grey
};

const STATUS_NODE_COLORS: Record<string, string> = {
  status_success: '#66BB6A', // Green
  status_failure: '#EF5350', // Red
}

// Custom Sankey Node component for better styling control if needed
const CustomSankeyNode = (props: any) => {
  const { x, y, width, height, index, payload, containerWidth } = props;
  const isOut = x + width / 2 > containerWidth / 2;
  const nodeColor = payload.id === 'status_success' ? STATUS_NODE_COLORS.status_success :
                    payload.id === 'status_failure' ? STATUS_NODE_COLORS.status_failure :
                    NODE_COLORS[payload.type as SankeyNode['type']] || '#8884d8';

  return (
    <Rectangle
      x={x}
      y={y}
      width={width}
      height={height}
      fill={nodeColor}
      fillOpacity="1"
      stroke="#333"
      strokeWidth={0.5}
    />
  );
};


export function SankeyDiagram({ data }: SankeyDiagramProps) {
  if (data && data.nodes.length > 0 && data.links.length > 0) {
    // Ensure all linked nodes exist in the nodes array
    const validNodeIds = new Set(data.nodes.map(n => n.id));
    const filteredLinks = data.links.filter(
      link => validNodeIds.has(link.source) && validNodeIds.has(link.target) && link.value > 0
    );

    // Check if there are any links left after filtering
    if (filteredLinks.length === 0) {
      return (
        <div className="h-full w-full flex flex-col items-start text-left bg-muted/20 rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-1">Live Transaction Flow</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Simulation is running or has run, but no transaction flows to display yet (e.g., all transactions failed before reaching processors or no valid routes).
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
        name: node.name, 
        id: node.id, // Keep id for custom node component
        type: node.type // Keep type for custom node component
      })),
      links: filteredLinks,
    };

    return (
      <div className="h-full w-full flex flex-col items-start text-left bg-muted/20 rounded-lg p-1">
        <h2 className="text-lg font-semibold mb-0.5 px-3 pt-2">Live Transaction Flow</h2>
        <p className="text-xs text-muted-foreground mb-1 px-3">
          Visualizing transactions: Payment Method → Rule → Processor → Status. Nodes: {sankeyChartData.nodes.length}, Links: {sankeyChartData.links.length}.
        </p>
        
        <ResponsiveContainer width="100%" height="100%" className="flex-grow">
          <Sankey
            data={sankeyChartData}
            node={<CustomSankeyNode />}
            nodePadding={50} // Increased padding
            margin={{ top: 20, right: 30, left: 30, bottom: 20 }} // Added more margin
            link={{ stroke: '#777', strokeOpacity: 0.5, strokeWidth: 1 }} // Thicker links
            iterations={32} // Default is 32, can adjust for complex diagrams
          >
            <Tooltip 
              contentStyle={{ backgroundColor: 'rgba(18, 18, 18, 0.8)', border: '1px solid #333', borderRadius: '4px' }}
              labelStyle={{ color: '#FFF', fontWeight: 'bold' }}
              itemStyle={{ color: '#DDD' }}
              formatter={(value: any, name: any, props: any) => {
                if (props.payload && props.payload.source && props.payload.target) {
                  const sourceName = props.payload.source.name || props.payload.source;
                  const targetName = props.payload.target.name || props.payload.target;
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

