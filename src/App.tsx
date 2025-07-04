import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import HomePage from './pages/HomePage';
import { TooltipProvider } from '@/components/ui/tooltip';

interface AppProps {
  basename?: string;
}

const App: React.FC<AppProps> = ({ basename = "/" }) => {
  return (
    <TooltipProvider>
      <Router basename={basename}>
        <Routes>
          <Route path="/de-routing/*" element={<AppLayout><HomePage /></AppLayout>} />
        </Routes>
      </Router>
    </TooltipProvider>
  );
};

export default App;
