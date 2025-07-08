import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import HomePage from './pages/HomePage';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PortalProvider } from '@/providers/PortalProvider';
import "./style.css";

interface AppProps {
  basename?: string;
}

const App: React.FC<AppProps> = ({ basename = "/" }) => {
  return (
    <PortalProvider>
      <TooltipProvider>
        <Router basename={basename}>
          <Routes>
            <Route path="/de-routing/*" element={<AppLayout><HomePage /></AppLayout>} />
          </Routes>
        </Router>
      </TooltipProvider>
    </PortalProvider>
  );
};

export default App;
