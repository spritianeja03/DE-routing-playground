import { Zap } from 'lucide-react';

export function Header() {
  return (
    <header className="p-4 border-b border-border flex items-center gap-2 sticky top-0 bg-background/80 backdrop-blur-sm z-10">
      <Zap className="h-8 w-8 text-primary" />
      <h1 className="text-2xl font-bold text-foreground">
        Hyperswitch <span className="text-primary">Vision</span>
      </h1>
    </header>
  );
}
