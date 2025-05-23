
"use client";

import type React from 'react';
import { SuccessRateOverTimeChart } from './analytics/SuccessRateOverTimeChart';
import { VolumeOverTimeChart } from './analytics/VolumeOverTimeChart';
import type { ProcessorMetricsHistory, MerchantConnector } from '@/lib/types'; // Added MerchantConnector

interface AnalyticsGraphsViewProps {
  successRateHistory: ProcessorMetricsHistory;
  volumeHistory: ProcessorMetricsHistory;
  merchantConnectors: MerchantConnector[]; 
  connectorToggleStates: Record<string, boolean>;
}

export function AnalyticsGraphsView({
  successRateHistory,
  volumeHistory,
  merchantConnectors,
  connectorToggleStates,
}: AnalyticsGraphsViewProps) {
  return (
    <div className="space-y-6 h-full flex flex-col">
      <SuccessRateOverTimeChart data={successRateHistory} merchantConnectors={merchantConnectors} connectorToggleStates={connectorToggleStates} />
      <VolumeOverTimeChart data={volumeHistory} merchantConnectors={merchantConnectors} connectorToggleStates={connectorToggleStates} />
      <div className="p-6 bg-muted/30 rounded-lg text-center mt-auto">
        <p className="text-muted-foreground">Time-series data reflecting simulation progress.</p>
      </div>
    </div>
  );
}
