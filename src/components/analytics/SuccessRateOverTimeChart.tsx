
"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Text } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LineChart } from 'lucide-react';
import type { ProcessorMetricsHistory, MerchantConnector } from '@/lib/types';

interface SuccessRateOverTimeChartProps {
  data: ProcessorMetricsHistory;
  merchantConnectors: MerchantConnector[]; // Added merchantConnectors prop
}

const chartColorKeys = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'] as const;

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label, merchantConnectors }: any) => { 
  if (active && payload && payload.length) {
    return (
      <div className="p-3 bg-popover border border-border rounded-lg shadow-xl text-popover-foreground text-xs">
        <p className="mb-2 font-semibold text-sm">Time: {label}</p>
        {payload.map((pld: any, index: number) => {
          // pld.name is the processorId (dataKey). We need to resolve it to connector_label.
          const connector = merchantConnectors?.find((mc: MerchantConnector) => (mc.merchant_connector_id || mc.connector_name) === pld.name);
          const displayName = connector ? (connector.connector_label || connector.connector_name) : pld.name;
          return (
            <div key={index} className="mb-1.5 last:mb-0">
              <div className="flex items-center mb-0.5">
                <div style={{ width: '10px', height: '10px', backgroundColor: pld.stroke, marginRight: '6px', borderRadius: '2px' }} />
                <span className="font-medium text-popover-foreground">{displayName}</span>
              </div>
              <p className="pl-[16px]">
                Success Rate: <span className="font-semibold">{parseFloat(pld.value).toFixed(1)}%</span>
              </p>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
};


export function SuccessRateOverTimeChart({ data, merchantConnectors }: SuccessRateOverTimeChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center"><LineChart className="mr-2 h-5 w-5 text-primary" /> Success Rate Over Time</CardTitle>
          <CardDescription>Processor success rates as the simulation progresses.</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <p className="text-muted-foreground">No success rate data available yet. Run a simulation.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center"><LineChart className="mr-2 h-5 w-5 text-primary" /> Success Rate Over Time</CardTitle>
        <CardDescription>Processor success rates (%) as the simulation progresses.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
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
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              domain={[0, 100]}
              tickFormatter={(value) => String(Math.round(value))} // Display numbers for percentage
              width={45} // Slightly increased width for potential 3-digit numbers if label is very close
              label={{ value: 'Success Rate', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', fontSize: 12, dy: 40, dx: -10 }}
            />
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
            {/* Dynamically render areas based on keys in the first data point (excluding 'time') */}
            {data && data.length > 0 && Object.keys(data[0]).filter(key => key !== 'time').map((processorId, index) => {
              // The 'name' for the Area should be derived from the data passed by StatsView,
              // which already resolves it using merchantConnectors.
              // The dataKey is processorId. The 'name' prop for Legend comes from Area's name.
              // The data itself should have processorId as key, and the 'name' for legend is set on Area.
              // The 'name' in the data objects (e.g. data[0][processorId]) is the value, not the processor display name.
              // The `name` prop of `<Area>` is what matters for the legend.
              // This component doesn't need to know about merchantConnectors directly if StatsView prepares names.
              // However, the current structure of TimeSeriesDataPoint is [processorId: string]: number | string;
              // The `name` prop of `<Area>` is used for the legend.
              // The `CustomTooltip` also uses `pld.name` which is this same `name` prop from `<Area>`.
              // So, `StatsView` must ensure the `dataKey` (processorId) has a corresponding human-readable name
              // when it constructs the data for these charts, or these charts need the merchantConnectors list.
              // For now, assuming `processorId` itself is used if a friendly name isn't part of the `data` structure directly.
              // The current `Area` rendering uses `processorId` as `dataKey` and `processorName` (derived from `PROCESSORS.find`) as `name`.
              // Since `PROCESSORS` is gone, `processorName` must come from elsewhere or `processorId` is used as name.
              // The `data` prop passed to AreaChart is `ProcessorMetricsHistory` which is `TimeSeriesDataPoint[]`.
              // `TimeSeriesDataPoint` is `{ time: number; [processorId: string]: number | string; }`.
              // The `name` prop of `<Area>` is what's used in the legend.
              // The `CustomTooltip` receives `pld.name`.
              // The `StatsView` prepares `processorSRData` and `transactionDistributionData` with `processor` or `name` fields for display.
              // The line charts `SuccessRateOverTimeChart` and `VolumeOverTimeChart` receive `successRateHistory` and `volumeHistory`.
              // These history objects are `TimeSeriesDataPoint[]`.
              // The `Area` components are generated by iterating `Object.keys(data[0])`.
              // The `name` prop of `Area` should be the display name.
              // This means `StatsView` doesn't directly influence the `name` prop of these `<Area>`s.
              // The chart components themselves need to resolve `processorId` to a display name.
              // This means they DO need access to `merchantConnectors`.

              // This component will now require merchantConnectors to resolve names.
              // This change was missed in StatsView prop drilling.
              // For now, let's assume `processorId` is acceptable as the name if no mapping is available here.
              // The `name` prop of `<Area>` is what is shown in the legend.
              // The current code (after removing PROCESSORS.find) would make `processorName = processorId`.
              // This is acceptable if `StatsView` doesn't pass resolved names in the `data` structure for these charts.
              // The `data` for these charts is `ProcessorMetricsHistory`, which is `TimeSeriesDataPoint[]`.
              // `TimeSeriesDataPoint` is `{ time: number, [processorId: string]: number }`.
              // The `name` prop of the `<Area>` component is what's used for the legend.
              // The `CustomTooltip` also uses `pld.name`.
              // The most straightforward way is to pass `merchantConnectors` to these charts too.

              // Simpler: The `name` prop of Area should be set to `processorId` if we don't pass `merchantConnectors` here.
              // The `CustomTooltip` will then show `processorId`.
              // If a friendly name is desired, `merchantConnectors` must be passed down.
              const connector = merchantConnectors.find(mc => (mc.merchant_connector_id || mc.connector_name) === processorId);
              const displayName = connector ? (connector.connector_label || connector.connector_name) : processorId;
              return (
                <Area
                  key={processorId}
                  type="monotone"
                  dataKey={processorId}
                  name={displayName} // Use resolved displayName for Legend
                  stroke={`hsl(var(${chartColorKeys[index % chartColorKeys.length]}))`      }
                  fill={`hsl(var(${chartColorKeys[index % chartColorKeys.length]}))`      }
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
