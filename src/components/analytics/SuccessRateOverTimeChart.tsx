
"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LineChart } from 'lucide-react';
import type { ProcessorMetricsHistory } from '@/lib/types';
import { PROCESSORS } from '@/lib/constants';

interface SuccessRateOverTimeChartProps {
  data: ProcessorMetricsHistory;
}

const chartColorKeys = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'] as const;

export function SuccessRateOverTimeChart({ data }: SuccessRateOverTimeChartProps) {
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
            <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => `Step ${value}`} />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                borderColor: 'hsl(var(--border))',
                borderRadius: 'var(--radius)',
              }}
              labelStyle={{ color: 'hsl(var(--popover-foreground))', fontWeight: 'bold' }}
              itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
              formatter={(value: number) => [`${value.toFixed(1)}%`, undefined]}
            />
            <Legend wrapperStyle={{ color: 'hsl(var(--foreground))' }} />
            {PROCESSORS.map((processor, index) => (
              <Area
                key={processor.id}
                type="monotone"
                dataKey={processor.id}
                name={processor.name}
                stroke={`hsl(var(${chartColorKeys[index % chartColorKeys.length]}))`      }
                fill={`hsl(var(${chartColorKeys[index % chartColorKeys.length]}))`      }
                fillOpacity={0.3}
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
