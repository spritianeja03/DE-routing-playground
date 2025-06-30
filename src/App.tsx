import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import HomePage from './pages/HomePage';
import { TooltipProvider } from '@/components/ui/tooltip';
import Test from './pages/Test';

const App: React.FC = () => {
  return (
    <TooltipProvider>
      <Router>
        <Routes>
          <Route path="/" element={<AppLayout><HomePage /></AppLayout>} />
          <Route path="*" element={<AppLayout><Test /></AppLayout>} />
        </Routes>
      </Router>
    </TooltipProvider>
  );
};

export default App;
