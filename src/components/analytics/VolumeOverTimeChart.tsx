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

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label, merchantConnectors }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="p-3 bg-popover border border-border rounded-lg shadow-xs text-popover-foreground text-xs">
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
  // const processedChartData = processVolumeDataForChart(data); // Removed: Use raw data for cumulative volume
  const chartData = data; // Use the original data
  const uniqueProcessorIds = getAllProcessorIds(chartData);

  if (!chartData || chartData.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardHeader className="p-6">
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
    <Card className="shadow-sm">
      <CardHeader className="p-6">
        <CardTitle className="flex items-center"><BarChartBig className="mr-2 h-5 w-5 text-primary" /> Volume Over Time</CardTitle>
        <CardDescription>Cumulative transaction volume per processor over time.</CardDescription> 
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
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
            {chartData && chartData.length > 0 && uniqueProcessorIds
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
