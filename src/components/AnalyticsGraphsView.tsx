
"use client";

import type React from 'react';
import { SuccessRateOverTimeChart } from './analytics/SuccessRateOverTimeChart';
import { VolumeOverTimeChart } from './analytics/VolumeOverTimeChart';
import type { ProcessorMetricsHistory } from '@/lib/types';

interface AnalyticsGraphsViewProps {
  successRateHistory: ProcessorMetricsHistory;
  volumeHistory: ProcessorMetricsHistory;
}

export function AnalyticsGraphsView({
  successRateHistory,
  volumeHistory,
}: AnalyticsGraphsViewProps) {
  return (
    <div className="space-y-6 h-full flex flex-col">
      <SuccessRateOverTimeChart data={successRateHistory} />
      <VolumeOverTimeChart data={volumeHistory} />
      <div className="p-6 bg-muted/30 rounded-lg text-center mt-auto">
        <p className="text-muted-foreground">Time-series data reflecting simulation progress.</p>
      </div>
    </div>
  );
}
