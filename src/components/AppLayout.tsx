import React, { useState, useEffect } from 'react';
import { ApiKeyModal } from './ApiKeyModal';

interface AppLayoutProps {
  children: React.ReactNode;
}

const BOTTOM_PANEL_HEIGHT = "350px"; // Matches BottomControlsPanel.tsx

export function AppLayout({ children }: AppLayoutProps) {
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  useEffect(() => {
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const useProxy = process.env.VITE_USE_PROXY === "true";
    const apiKey = localStorage.getItem("apiKey");

    if (!isLocalhost && !useProxy && !apiKey) {
      setShowApiKeyModal(true);
    }
  }, []);

  return (
    <div className="flex flex-col min-h-screen h-screen bg-gray-50 overflow-hidden">
      <main 
        className="flex-grow flex flex-col overflow-hidden h-full"
      >
        {children}
      </main>
      {showApiKeyModal && <ApiKeyModal />}
    </div>
  );
}
