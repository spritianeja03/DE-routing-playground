
import { Zap, PlayCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';

interface HeaderProps {
  onRunSimulation: () => void;
  isSimulating: boolean;
}

export function Header({ onRunSimulation, isSimulating }: HeaderProps) {
  return (
    <header className="p-4 border-b border-border flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-sm z-10">
      <div className="flex items-center gap-x-6">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <Zap className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">
            Hyperswitch <span className="text-primary">Vision</span>
          </h1>
        </div>

        {/* TabsList for navigation */}
        {/* This TabsList is part of the Tabs component instantiated in HomePage */}
        <TabsList className="h-auto p-0 bg-transparent border-none">
          <TabsTrigger
            value="sankey"
            className="px-4 py-2 text-sm data-[state=active]:shadow-none data-[state=active]:bg-primary/10 data-[state=active]:text-primary hover:bg-accent/50 data-[state=active]:hover:bg-primary/10"
          >
            Sankey View
          </TabsTrigger>
          <TabsTrigger
            value="analytics"
            className="px-4 py-2 text-sm data-[state=active]:shadow-none data-[state=active]:bg-primary/10 data-[state=active]:text-primary hover:bg-accent/50 data-[state=active]:hover:bg-primary/10"
          >
            Analytics
          </TabsTrigger>
        </TabsList>
      </div>

      <Button onClick={onRunSimulation} disabled={isSimulating} size="default">
        {isSimulating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <PlayCircle className="mr-2 h-5 w-5" />}
        Run Simulation
      </Button>
    </header>
  );
}
