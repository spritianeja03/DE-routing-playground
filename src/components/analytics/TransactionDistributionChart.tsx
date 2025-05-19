
"use client"

import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PieChart as PieChartIcon } from 'lucide-react'; // Renamed to avoid conflict
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts"

interface TransactionDistributionChartProps {
  data: Array<{ name: string; value: number; fill: string }>;
}

export function TransactionDistributionChart({ data }: TransactionDistributionChartProps) {
  const hasData = data && data.length > 0 && data.some(item => item.value > 0);

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center"><PieChartIcon className="mr-2 h-6 w-6 text-primary" /> Transaction Distribution</CardTitle>
        <CardDescription>Processor-wise distribution of transactions.</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-center h-[300px]">
        {hasData ? (
           <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name]}
                wrapperStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)',
                  padding: '8px',
                  color: 'hsl(var(--popover-foreground))',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.1)'
                }}
              />
              <Legend 
                wrapperStyle={{ color: 'hsl(var(--foreground))', fontSize: '12px', paddingTop: '10px' }}
              />
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} stroke="hsl(var(--background))" strokeWidth={1}/>
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-10">
             <Image
                src="https://placehold.co/300x150.png?text=No+Distribution+Data"
                alt="Distribution Chart Placeholder"
                width={300}
                height={150}
                className="rounded-md shadow-md opacity-50"
                data-ai-hint="pie chart"
            />
            <p className="mt-2 text-sm text-muted-foreground">Chart data will appear here after simulation.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
