
import { PlayCircle, Loader2, PauseCircle, StopCircle, BarChartHorizontalBig, LineChart } from 'lucide-react'; // Removed Zap
import { Button } from '@/components/ui/button';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';

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
          <img src="https://hyperswitch.io/logos/juspay-hyperswitch.svg" alt="Hyperswitch Logo" />
        </div>
        <TabsList>
          <TabsTrigger value="stats" onClick={() => onTabChange("stats")}>
            <BarChartHorizontalBig className="mr-2 h-5 w-5" />
            Stats
          </TabsTrigger>
          <TabsTrigger value="analytics" onClick={() => onTabChange("analytics")}>
            <LineChart className="mr-2 h-5 w-5" />
            Analytics
          </TabsTrigger>
        </TabsList>
      </div>

      <div className="flex items-center gap-2">
        {(isIdle || isPaused) && (
          <Button onClick={onStartSimulation} disabled={isSimulating} variant="primary" size="default">
            {isSimulating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <PlayCircle className="mr-2 h-5 w-5" />}
            {isPaused ? 'Resume Simulation' : 'Start Simulation'}
          </Button>
        )}
        {isSimulating && (
          <Button onClick={onPauseSimulation} variant="outline" size="default">
            <PauseCircle className="mr-2 h-5 w-5" />
            Pause Simulation
          </Button>
        )}
        {(isSimulating || isPaused) && (
          <Button onClick={onStopSimulation} variant="destructive" size="default">
            <StopCircle className="mr-2 h-5 w-5" />
            Stop Simulation
          </Button>
        )}
      </div>
    </header>
  );
}
