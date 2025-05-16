
import { Zap, PlayCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  onRunSimulation: () => void;
  isSimulating: boolean;
}

export function Header({ onRunSimulation, isSimulating }: HeaderProps) {
  return (
    <header className="p-4 border-b border-border flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-sm z-10">
      <div className="flex items-center gap-2">
        <Zap className="h-8 w-8 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">
          Hyperswitch <span className="text-primary">Vision</span>
        </h1>
      </div>
      <Button onClick={onRunSimulation} disabled={isSimulating} size="default">
        {isSimulating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <PlayCircle className="mr-2 h-5 w-5" />}
        Run Simulation
      </Button>
    </header>
  );
}
