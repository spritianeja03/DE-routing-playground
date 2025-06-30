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
          <Route path="/dashboard/de-routing/*" element={<AppLayout><HomePage /></AppLayout>} />
        </Routes>
      </Router>
    </TooltipProvider>
  );
};

export default App;
