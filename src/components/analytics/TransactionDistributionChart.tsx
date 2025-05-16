"use client"

import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PieChart } from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart"
import { Pie, PieChart as RechartsPieChart, Cell } from "recharts"

interface TransactionDistributionChartProps {
  data: Array<{ name: string; value: number; fill: string }>;
}

const chartConfig = {
  transactions: {
    label: "Transactions",
  },
} satisfies Record<string, any>; // Use `any` for flexible fill mapping

export function TransactionDistributionChart({ data }: TransactionDistributionChartProps) {
  // Dynamically create chartConfig based on data's fill properties
  const dynamicChartConfig = data.reduce((acc, item) => {
    acc[item.name] = { label: item.name, color: item.fill };
    return acc;
  }, { ...chartConfig } as Record<string, any>);


  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center"><PieChart className="mr-2 h-6 w-6 text-primary" /> Transaction Distribution</CardTitle>
        <CardDescription>Processor-wise distribution of transactions.</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-center">
        {data && data.length > 0 ? (
           <ChartContainer config={dynamicChartConfig} className="mx-auto aspect-square max-h-[300px]">
            <RechartsPieChart>
              <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} labelLine={false} label={({payload, percent}) => `${payload.name}: ${(percent * 100).toFixed(0)}%`}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <ChartLegend content={<ChartLegendContent nameKey="name" />} />
            </RechartsPieChart>
          </ChartContainer>
        ) : (
          <div className="text-center py-10">
             <Image 
                src="https://placehold.co/400x200.png?text=Distribution+Chart" 
                alt="Distribution Chart Placeholder" 
                width={400} 
                height={200}
                className="rounded-md shadow-md opacity-50"
                data-ai-hint="pie chart"
            />
            <p className="mt-2 text-sm text-muted-foreground">Chart data will appear here.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
