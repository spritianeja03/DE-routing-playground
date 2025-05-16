"use client";

import type React from 'react';
import { OverallSuccessRateDisplay } from './analytics/OverallSuccessRateDisplay';
import { ProcessorSuccessRatesTable } from './analytics/ProcessorSuccessRatesTable';
import { TransactionDistributionChart } from './analytics/TransactionDistributionChart';
import type { FormValues } from './BottomControlsPanel';
import { PROCESSORS } from '@/lib/constants';
import { ScrollArea } from './ui/scroll-area';

interface AnalyticsViewProps {
  currentControls: FormValues | null;
}

// Helper to get HSL color from Tailwind config (conceptual)
// In a real app, you might need a more robust way to get these if they are dynamic
const CHART_COLORS_HSL = {
  '--chart-1': 'hsl(var(--chart-1))',
  '--chart-2': 'hsl(var(--chart-2))',
  '--chart-3': 'hsl(var(--chart-3))',
  '--chart-4': 'hsl(var(--chart-4))',
  '--chart-5': 'hsl(var(--chart-5))',
};

const chartColorKeys = Object.keys(CHART_COLORS_HSL) as (keyof typeof CHART_COLORS_HSL)[];


export function AnalyticsView({ currentControls }: AnalyticsViewProps) {
  const overallSR = currentControls?.overallSuccessRate ?? 0;
  
  const processorSRData = currentControls 
    ? PROCESSORS.map(proc => ({
        processor: proc.name,
        sr: currentControls.processorWiseSuccessRates[proc.id]?.sr ?? 0,
        failureRate: 100 - (currentControls.processorWiseSuccessRates[proc.id]?.sr ?? 0),
        volumeShare: currentControls.processorWiseSuccessRates[proc.id]?.volumeShare ?? 0,
      }))
    : PROCESSORS.map(proc => ({
        processor: proc.name,
        sr: 0,
        failureRate: 100,
        volumeShare: 0,
      }));

  const transactionDistributionData = currentControls
    ? PROCESSORS.map((proc, index) => ({
        name: proc.name,
        value: currentControls.processorWiseSuccessRates[proc.id]?.volumeShare ?? 0,
        fill: CHART_COLORS_HSL[chartColorKeys[index % chartColorKeys.length]],
      })).filter(item => item.value > 0) // Only show processors with volume
    : [];


  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        <OverallSuccessRateDisplay rate={overallSR} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ProcessorSuccessRatesTable data={processorSRData} />
          <TransactionDistributionChart data={transactionDistributionData} />
        </div>
        {/* Placeholder for other metrics */}
        <div className="p-6 bg-muted/30 rounded-lg text-center">
          <p className="text-muted-foreground">More detailed analytics and trends will be displayed here.</p>
        </div>
      </div>
    </ScrollArea>
  );
}
