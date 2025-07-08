import React, { createContext, useContext, useRef, useEffect, useState } from 'react';

interface PortalContextType {
  container: HTMLElement | null;
}

const PortalContext = createContext<PortalContextType>({ container: null });

export const usePortalContainer = () => {
  const context = useContext(PortalContext);
  if (!context) {
    throw new Error('usePortalContainer must be used within PortalProvider');
  }
  return context;
};

export const PortalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      setContainer(containerRef.current);
    }
  }, []);

  return (
    <>
      {/* This div is created by React, not in any HTML file */}
      <div 
        ref={containerRef}
        id="portal-root"
        data-portal-container="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          zIndex: 9999,
          pointerEvents: 'none',
        }}
      />
      <PortalContext.Provider value={{ container }}>
        {children}
      </PortalContext.Provider>
    </>
  );
};
