import { PlayCircle, Loader2, PauseCircle, StopCircle, BarChartHorizontalBig, LineChart } from 'lucide-react'; // Removed Zap
import { Button } from '@/components/ui/button';
import { TabsList, TabsTrigger, Tabs } from '@/components/ui/tabs';
import { useEffect, useState } from 'react';

interface HeaderProps {
  activeTab: string;
  onTabChange: (value: string) => void;
  onStartSimulation: () => void;
  onPauseSimulation: () => void;
  onStopSimulation: () => void;
  simulationState: 'idle' | 'running' | 'paused';
}

export function Header({
  activeTab,
  onTabChange,
  onStartSimulation,
  onPauseSimulation,
  onStopSimulation,
  simulationState
}: HeaderProps) {
  const isSimulating = simulationState === 'running';
  const isPaused = simulationState === 'paused';
  const isIdle = simulationState === 'idle';

  return (
    <header className="p-4 border-b border-border flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur-sm z-10">
      <div className="flex items-center gap-x-6">
        <div className="flex items-center gap-2">
          <img
            src="/juspay-hyperswitch-1.jpg"
            alt="Hyperswitch Logo"
            style={{ height: 40 }}
          />
        </div>
      </div>

      {/* Centered Tabs */}
      <div className="flex-grow flex justify-center">
        <Tabs value={activeTab} onValueChange={onTabChange} className="">
          <TabsList>
            <TabsTrigger value="intelligent-routing">Intelligent Routing</TabsTrigger>
            {/* <TabsTrigger value="least-cost-routing">Least Cost Routing</TabsTrigger> */}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex items-center gap-2">
      </div>
    </header>
  );
}
