
"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChartBig } from 'lucide-react';
import type { ProcessorMetricsHistory } from '@/lib/types';
import { PROCESSORS } from '@/lib/constants';

interface VolumeOverTimeChartProps {
  data: ProcessorMetricsHistory;
}

const chartColorKeys = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'] as const;

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="p-3 bg-popover border border-border rounded-lg shadow-xl text-popover-foreground text-xs">
        <p className="mb-2 font-semibold text-sm">Step {label}</p>
        {payload.map((pld: any, index: number) => (
          <div key={index} className="mb-1.5 last:mb-0">
            <div className="flex items-center mb-0.5">
              <div style={{ width: '10px', height: '10px', backgroundColor: pld.stroke, marginRight: '6px', borderRadius: '2px' }} />
              <span className="font-medium text-popover-foreground">{pld.name}</span>
            </div>
            <p className="pl-[16px]">
              Volume: <span className="font-semibold">{parseInt(pld.value, 10).toLocaleString()}</span>
            </p>
          </div>
        ))}
      </div>
    );
  }
  return null;
};


export function VolumeOverTimeChart({ data }: VolumeOverTimeChartProps) {
  if (!data || data.length === 0) {
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
        <CardDescription>Cumulative transaction volume per processor as the simulation progresses.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => `Step ${value}`} />
            <YAxis stroke="hsl(var(--muted-foreground))" width={50} tickFormatter={(value) => value.toLocaleString()} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ color: 'hsl(var(--foreground))', paddingTop: '10px' }} />
            {PROCESSORS.map((processor, index) => (
              <Area
                key={processor.id}
                type="monotone"
                dataKey={processor.id}
                name={processor.name}
                stroke={`hsl(var(${chartColorKeys[index % chartColorKeys.length]}))`      }
                fill={`hsl(var(${chartColorKeys[index % chartColorKeys.length]}))`      }
                fillOpacity={0.2}
                strokeWidth={2}
                dot={{ r: 1, strokeWidth: 1 }}
                activeDot={{ r: 4, strokeWidth: 1 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
