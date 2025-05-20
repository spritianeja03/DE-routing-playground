
"use client";

import type React from 'react';
import { OverallSuccessRateDisplay } from './analytics/OverallSuccessRateDisplay';
import { ProcessorSuccessRatesTable } from './analytics/ProcessorSuccessRatesTable';
import { TransactionDistributionChart } from './analytics/TransactionDistributionChart';
import type { FormValues } from '@/components/BottomControlsPanel';
import { PROCESSORS } from '@/lib/constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ListChecks, CheckCircle2, XCircle, Gauge } from 'lucide-react';
import type { OverallSRHistory } from '@/lib/types';


interface StatsViewProps {
  currentControls: FormValues | null;
  processedPayments?: number;
  totalSuccessful?: number;
  totalFailed?: number;
  overallSuccessRateHistory: OverallSRHistory;
}

const CHART_COLORS_HSL = {
  '--chart-1': 'hsl(var(--chart-1))',
  '--chart-2': 'hsl(var(--chart-2))',
  '--chart-3': 'hsl(var(--chart-3))',
  '--chart-4': 'hsl(var(--chart-4))',
  '--chart-5': 'hsl(var(--chart-5))',
};

const chartColorKeys = Object.keys(CHART_COLORS_HSL) as (keyof typeof CHART_COLORS_HSL)[];

export function StatsView({
  currentControls,
  processedPayments = 0,
  totalSuccessful = 0,
  totalFailed = 0,
  overallSuccessRateHistory,
}: StatsViewProps) {
  const overallSR = currentControls?.overallSuccessRate ?? 0;
  const effectiveTps = currentControls?.tps ?? 0;

  // The processorWiseSuccessRates in currentControls now reflects observed data for the table
  const processorSRData = currentControls?.processorWiseSuccessRates 
    ? PROCESSORS.map(proc => {
        const uiStats = currentControls.processorWiseSuccessRates[proc.id];
        const observedSr = uiStats ? (100 - uiStats.failureRate) : 0; // Derived from observed failure rate
        return {
          processor: proc.name,
          sr: parseFloat(observedSr.toFixed(2)), 
          failureRate: uiStats ? parseFloat(uiStats.failureRate.toFixed(2)) : 0,
          volumeShare: uiStats ? parseFloat(uiStats.volumeShare.toFixed(2)) : 0,
        };
      })
    : PROCESSORS.map(proc => ({ processor: proc.name, sr: 0, failureRate: 0, volumeShare: 0 }));


  const transactionDistributionData = currentControls?.processorWiseSuccessRates
    ? PROCESSORS.map((proc, index) => {
        const volShare = currentControls.processorWiseSuccessRates[proc.id]?.volumeShare ?? 0;
        return {
          name: proc.name,
          value: volShare,
          fill: CHART_COLORS_HSL[chartColorKeys[index % chartColorKeys.length]],
        }
      }).filter(item => item.value > 0)
    : [];

  return (
    <div className="space-y-6 flex flex-col">
      {/* Stats Cards in a 2-column grid for wider screens, stack on smaller */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Processed</CardTitle>
            <ListChecks className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{processedPayments.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
                of {currentControls?.totalPayments.toLocaleString() || 'N/A'} target
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Effective TPS</CardTitle>
            <Gauge className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{effectiveTps.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">transactions per second</p>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Successful</CardTitle>
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSuccessful.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {processedPayments > 0 ? `${((totalSuccessful / processedPayments) * 100).toFixed(1)}% of processed` : '0.0%'}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Failed</CardTitle>
            <XCircle className="h-5 w-5 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalFailed.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {processedPayments > 0 ? `${((totalFailed / processedPayments) * 100).toFixed(1)}% of processed` : '0.0%'}
            </p>
          </CardContent>
        </Card>
      </div>
      
      <OverallSuccessRateDisplay rate={overallSR} history={overallSuccessRateHistory} />
      <TransactionDistributionChart data={transactionDistributionData} />
      <ProcessorSuccessRatesTable data={processorSRData} />
      
      <div className="p-6 bg-muted/30 rounded-lg text-center mt-auto">
        <p className="text-muted-foreground">Summary statistics based on current simulation run.</p>
      </div>
    </div>
  );
}
