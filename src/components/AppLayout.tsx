import type React from 'react';

interface AppLayoutProps {
  children: React.ReactNode;
}

const BOTTOM_PANEL_HEIGHT = "350px"; // Matches BottomControlsPanel.tsx

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <main 
        className="flex-grow flex flex-col overflow-hidden"
        style={{ paddingBottom: BOTTOM_PANEL_HEIGHT }}
      >
        {children}
      </main>
    </div>
  );
}
