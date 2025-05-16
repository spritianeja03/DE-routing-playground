
import { Zap, PlayCircle, Loader2, PauseCircle, StopCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  onStartSimulation: () => void;
  onPauseSimulation: () => void;
  onStopSimulation: () => void;
  simulationState: 'idle' | 'running' | 'paused';
}

export function Header({ onStartSimulation, onPauseSimulation, onStopSimulation, simulationState }: HeaderProps) {
  const isSimulating = simulationState === 'running';
  const isPaused = simulationState === 'paused';
  const isIdle = simulationState === 'idle';

  return (
    <header className="p-4 border-b border-border flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur-sm z-10">
      <div className="flex items-center gap-x-6">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <Zap className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">
            Hyperswitch <span className="text-primary">Intelligent Routing</span>
          </h1>
        </div>
        {/* TabsList removed as there's only one view now */}
      </div>

      <div className="flex items-center gap-2">
        {(isIdle || isPaused) && (
          <Button onClick={onStartSimulation} disabled={isSimulating} size="default">
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
