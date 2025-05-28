
"use client"

import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PieChart as PieChartIcon } from 'lucide-react'; // Renamed to avoid conflict
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface TransactionDistributionChartProps {
  data: Array<{ name: string; value: number; fill?: string }>; // Made fill optional
}

// Predefined direct HSL color strings for the pie chart
// These correspond to --chart-1 to --chart-5 from globals.css's dark theme
const PIE_CHART_COLORS = [
  'hsl(25, 95%, 53%)',    // Vibrant Orange (matches --chart-1 dark)
  'hsl(0, 90%, 60%)',      // Bright Red (matches --chart-2 dark)
  'hsl(35, 90%, 58%)',    // Another Orange shade (matches --chart-3 dark)
  'hsl(180, 70%, 50%)',   // Muted Cyan/Teal (matches --chart-4 dark)
  'hsl(5, 85%, 65%)',     // Softer Red/Coral (matches --chart-5 dark)
];

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
              <Legend 
                wrapperStyle={{ color: 'hsl(var(--foreground))', fontSize: '12px', paddingTop: '10px' }}
                formatter={(value, entry) => (
                  <span style={{ color: 'hsl(var(--foreground))' }}>{value}</span>
                )}
              />
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                labelLine={false}
                label={({ name, percent }) => {
                  if (typeof percent !== 'number' || isNaN(percent)) return null;
                  const percentage = (percent * 100).toFixed(0);
                  if (parseFloat(percentage) < 5) return null; // Hide label if too small
                  return `${name}: ${percentage}%`;
                }}
                fontSize={12}
                stroke="hsl(var(--background))" // Use direct background for stroke between cells
                strokeWidth={2}
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={PIE_CHART_COLORS[index % PIE_CHART_COLORS.length]} // Use direct colors
                  />
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
