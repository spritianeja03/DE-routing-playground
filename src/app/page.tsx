"use client";

import React, { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { BottomControlsPanel, type FormValues } from '@/components/BottomControlsPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SankeyDiagramView } from '@/components/SankeyDiagramView';
import { AnalyticsView } from '@/components/AnalyticsView';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function HomePage() {
  const [currentControls, setCurrentControls] = useState<FormValues | null>(null);

  const handleControlsChange = (data: FormValues) => {
    setCurrentControls(data);
  };

  return (
    <AppLayout>
      <Header />
      <div className="flex-grow flex flex-col overflow-hidden p-0 md:p-2 lg:p-4">
        <Tabs defaultValue="sankey" className="flex-grow flex flex-col w-full overflow-hidden">
          <TabsList className="mx-auto w-fit mb-4 sticky top-0 bg-background/90 backdrop-blur-sm z-[5] p-2 rounded-lg shadow-sm">
            <TabsTrigger value="sankey" className="px-6 py-2 text-base">Sankey View</TabsTrigger>
            <TabsTrigger value="analytics" className="px-6 py-2 text-base">Analytics Dashboard</TabsTrigger>
          </TabsList>
          
          <TabsContent value="sankey" className="flex-grow overflow-hidden -m-px"> {/* Negative margin to counter parent padding */}
            <ScrollArea className="h-full">
               <SankeyDiagramView currentControls={currentControls} />
            </ScrollArea>
          </TabsContent>
          <TabsContent value="analytics" className="flex-grow overflow-hidden -m-px">
             <ScrollArea className="h-full">
              <AnalyticsView currentControls={currentControls} />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
      <BottomControlsPanel onFormChange={handleControlsChange} />
    </AppLayout>
  );
}
