
"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'; // Removed Text, not used
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChartBig } from 'lucide-react';
import type { ProcessorMetricsHistory, MerchantConnector } from '@/lib/types'; // Added MerchantConnector

interface VolumeOverTimeChartProps {
  data: ProcessorMetricsHistory;
  merchantConnectors: MerchantConnector[];
  connectorToggleStates: Record<string, boolean>;
}

const chartColorKeys = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'] as const;

// Helper function to get all unique processor IDs from the data
const getAllProcessorIds = (history: ProcessorMetricsHistory): string[] => {
  if (!history || history.length === 0) {
    return [];
  }
  const processorIdSet = new Set<string>();
  history.forEach(dataPoint => {
    Object.keys(dataPoint).forEach(key => {
      if (key !== 'time') {
        processorIdSet.add(key);
      }
    });
  });
  return Array.from(processorIdSet);
};

// Function to process data: if volume flattens, bring line to 0
const processVolumeDataForChart = (history: ProcessorMetricsHistory): ProcessorMetricsHistory => {
  if (!history || history.length === 0) {
    return [];
  }

  const processedData = history.map(item => ({ ...item })); // Shallow copy, sufficient for this structure
  const processorIds = getAllProcessorIds(processedData);

  processorIds.forEach(processorId => {
    let lastChangeIndex = -1;
    let firstAppearanceIndex = -1;

    // Find the first point where the processor has a non-zero volume
    for (let i = 0; i < processedData.length; i++) {
      const rawCurrentVolume = processedData[i][processorId];
      const currentVolume = typeof rawCurrentVolume === 'string' ? parseFloat(rawCurrentVolume) : rawCurrentVolume;

      if (typeof currentVolume === 'number' && !isNaN(currentVolume)) {
        if (currentVolume > 0) {
          firstAppearanceIndex = i;
          lastChangeIndex = i; // Initialize lastChangeIndex to first appearance with volume
          break;
        } else if (currentVolume === 0 && firstAppearanceIndex === -1) {
          // If it's 0, mark as first appearance to track subsequent changes from 0
          firstAppearanceIndex = i;
          lastChangeIndex = i;
        }
      } else if (rawCurrentVolume === undefined || rawCurrentVolume === null) {
        // If data for this processor doesn't exist at this point, treat as 0 for initialization
        if (firstAppearanceIndex === -1) {
            firstAppearanceIndex = i;
            lastChangeIndex = i;
        }
      }
    }

    if (firstAppearanceIndex !== -1) {
      // Start checking for changes from the point after its first appearance
      for (let i = firstAppearanceIndex + 1; i < processedData.length; i++) {
        const rawCurrentVolume = processedData[i][processorId];
        const rawPreviousVolume = processedData[i-1][processorId];

        const currentVolume = typeof rawCurrentVolume === 'string' ? parseFloat(rawCurrentVolume) : rawCurrentVolume;
        const previousVolume = typeof rawPreviousVolume === 'string' ? parseFloat(rawPreviousVolume) : rawPreviousVolume;
        
        // Ensure both are numbers for comparison, or handle undefined/null as no change from a previous 0 or undefined state
        const numCurrentVolume = (typeof currentVolume === 'number' && !isNaN(currentVolume)) ? currentVolume : 0;
        const numPreviousVolume = (typeof previousVolume === 'number' && !isNaN(previousVolume)) ? previousVolume : 0;

        if (numCurrentVolume !== numPreviousVolume) {
          lastChangeIndex = i;
        }
      }
    }
    
    // If the volume became constant before the last data point
    if (lastChangeIndex !== -1 && lastChangeIndex < processedData.length - 1) {
      for (let j = lastChangeIndex + 1; j < processedData.length; j++) {
        processedData[j][processorId] = 0; // Set to 0 for points after the last change
      }
    }
  });

  return processedData;
};


// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label, merchantConnectors }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="p-3 bg-popover border border-border rounded-lg shadow-xl text-popover-foreground text-xs">
        <p className="mb-2 font-semibold text-sm">Time: {label}</p>
        {payload.map((pld: any, index: number) => {
          const connector = merchantConnectors?.find((mc: MerchantConnector) => (mc.merchant_connector_id || mc.connector_name) === pld.name);
          const displayName = connector ? connector.connector_name : pld.name;
          return (
            <div key={index} className="mb-1.5 last:mb-0">
              <div className="flex items-center mb-0.5">
                <div style={{ width: '10px', height: '10px', backgroundColor: pld.stroke, marginRight: '6px', borderRadius: '2px' }} />
                <span className="font-medium text-popover-foreground">{displayName}</span>
              </div>
              <p className="pl-[16px]">
                Volume: <span className="font-semibold">{parseInt(pld.value, 10).toLocaleString()}</span>
              </p>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
};


export function VolumeOverTimeChart({ data, merchantConnectors, connectorToggleStates }: VolumeOverTimeChartProps) {
  const processedChartData = processVolumeDataForChart(data);
  const uniqueProcessorIds = getAllProcessorIds(processedChartData);

  if (!processedChartData || processedChartData.length === 0) {
    return (
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center"><BarChartBig className="mr-2 h-5 w-5 text-primary" /> Volume Over Time</CardTitle>
          <CardDescription>Transaction volume per processor as the simulation progresses.</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <p className="text-muted-foreground">No volume data available yet. Run a simulation.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center"><BarChartBig className="mr-2 h-5 w-5 text-primary" /> Volume Over Time</CardTitle>
        <CardDescription>Cumulative transaction volume per processor. Drops to zero if payments stop.</CardDescription> 
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={processedChartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="time"
              stroke="hsl(var(--muted-foreground))" 
              tickFormatter={(timestamp) => {
                if (typeof timestamp !== 'number') return ''; // Handle cases where timestamp might not be a number
                const date = new Date(timestamp);
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                const seconds = String(date.getSeconds()).padStart(2, '0');
                return `${hours}:${minutes}:${seconds}`;
              }}
            />
            <YAxis stroke="hsl(var(--muted-foreground))" width={50} tickFormatter={(value) => value.toLocaleString()} />
            <Tooltip
              content={<CustomTooltip merchantConnectors={merchantConnectors} />} // Pass merchantConnectors to CustomTooltip
              labelFormatter={(timestamp) => { // Format time in tooltip header
                if (typeof timestamp !== 'number') return '';
                const date = new Date(timestamp);
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                const seconds = String(date.getSeconds()).padStart(2, '0');
                return `${hours}:${minutes}:${seconds}`;
              }}
            />
            <Legend wrapperStyle={{ color: 'hsl(var(--foreground))', paddingTop: '10px' }} />
            {processedChartData && processedChartData.length > 0 && uniqueProcessorIds
              .filter(processorId => connectorToggleStates[processorId] === true)
              .map((processorId, index) => {
              const connector = merchantConnectors.find(mc => (mc.merchant_connector_id || mc.connector_name) === processorId);
              const displayName = connector ? connector.connector_name : processorId;
              return (
                <Area
                  key={processorId}
                  type="monotone"
                  dataKey={processorId}
                  name={displayName} // Use resolved displayName for Legend
                  stroke={`hsl(var(${chartColorKeys[index % chartColorKeys.length]}))`}
                  fill={`hsl(var(${chartColorKeys[index % chartColorKeys.length]}))`}
                  fillOpacity={0.2}
                  strokeWidth={2}
                  dot={{ r: 1, strokeWidth: 1 }}
                  activeDot={{ r: 4, strokeWidth: 1 }}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
