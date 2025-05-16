
"use client";

import React, { useState, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { BottomControlsPanel, type FormValues } from '@/components/BottomControlsPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SankeyDiagramView } from '@/components/SankeyDiagramView';
import { AnalyticsView } from '@/components/AnalyticsView';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { SankeyData, SankeyNode, SankeyLink } from '@/lib/types';
import { PROCESSORS } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';


export default function HomePage() {
  const [currentControls, setCurrentControls] = useState<FormValues | null>(null);
  const [sankeyData, setSankeyData] = useState<SankeyData | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const { toast } = useToast();

  const handleControlsChange = useCallback((data: FormValues) => {
    setCurrentControls(data);
  }, []);

  const handleRunSimulation = useCallback(async () => {
    if (!currentControls) {
      toast({ title: "Error", description: "Control data not available for simulation.", variant: "destructive" });
      return;
    }
    setIsSimulating(true);
    setSankeyData(null); // Clear previous data

    // Simulate API call or heavy computation
    await new Promise(resolve => setTimeout(resolve, 1500));

    const nodes: SankeyNode[] = [];
    const links: SankeyLink[] = [];

    // 1. Add Source Node
    nodes.push({ id: 'source', name: 'Source', type: 'source' });

    // 2. Add Payment Method Nodes
    currentControls.selectedPaymentMethods.forEach(pm => {
      nodes.push({ id: `pm_${pm.toLowerCase()}`, name: pm, type: 'paymentMethod' });
      links.push({ 
        source: 'source', 
        target: `pm_${pm.toLowerCase()}`, 
        value: currentControls.totalPayments / (currentControls.selectedPaymentMethods.length || 1) 
      });
    });

    // 3. Add Processor Nodes & Status Nodes
    nodes.push({ id: 'status_success', name: 'Success', type: 'status' });
    nodes.push({ id: 'status_failure', name: 'Failure', type: 'status' });

    const processorTraffic: Record<string, number> = {};

    PROCESSORS.forEach(proc => {
      nodes.push({ id: `proc_${proc.id}`, name: proc.name, type: 'processor' });
      processorTraffic[proc.id] = 0;

      // Links from Payment Methods to Processors
      currentControls.selectedPaymentMethods.forEach(pm => {
        if (currentControls.processorMatrix[proc.id]?.[pm]) {
          const pmTraffic = currentControls.totalPayments / (currentControls.selectedPaymentMethods.length || 1);
          let supportingProcessorsCount = 0;
          PROCESSORS.forEach(p => {
            if(currentControls.processorMatrix[p.id]?.[pm]) supportingProcessorsCount++;
          });
          
          const trafficToThisProcessorForPm = pmTraffic / (supportingProcessorsCount || 1);
          links.push({
            source: `pm_${pm.toLowerCase()}`,
            target: `proc_${proc.id}`,
            value: trafficToThisProcessorForPm
          });
          processorTraffic[proc.id] += trafficToThisProcessorForPm;
        }
      });
    });
    
    // 4. Links from Processors to Success/Failure
    PROCESSORS.forEach(proc => {
      if (processorTraffic[proc.id] > 0) {
        const baseSR = currentControls.processorWiseSuccessRates[proc.id]?.sr ?? 90; 
        const fluctuationEffect = (currentControls.srFluctuation[proc.id] - 50) / 200; 
        let effectiveSR = baseSR / 100 * (1 + fluctuationEffect);
        effectiveSR = Math.max(0, Math.min(1, effectiveSR)); 

        if (currentControls.processorIncidents[proc.id]) {
            effectiveSR *= 0.1; 
        }

        const successValue = processorTraffic[proc.id] * effectiveSR;
        const failureValue = processorTraffic[proc.id] - successValue;

        if (successValue > 0) {
          links.push({ source: `proc_${proc.id}`, target: 'status_success', value: successValue });
        }
        if (failureValue > 0) {
          links.push({ source: `proc_${proc.id}`, target: 'status_failure', value: failureValue });
        }
      }
    });

    // 5. Add Sink Node and links from Status to Sink
    nodes.push({ id: 'sink', name: 'Sink', type: 'sink' });
    let totalSuccess = 0;
    let totalFailure = 0;

    links.forEach(link => {
        if (link.target === 'status_success') totalSuccess += link.value;
        if (link.target === 'status_failure') totalFailure += link.value;
    });

    if (totalSuccess > 0) {
        links.push({ source: 'status_success', target: 'sink', value: totalSuccess });
    }
    if (totalFailure > 0) {
        links.push({ source: 'status_failure', target: 'sink', value: totalFailure });
    }
    
    const linkedNodeIds = new Set<string>();
    links.forEach(link => {
      linkedNodeIds.add(link.source);
      linkedNodeIds.add(link.target);
    });
    
    const finalNodes = nodes.filter(node => node.type === 'source' || node.type === 'sink' || linkedNodeIds.has(node.id));

    setSankeyData({ nodes: finalNodes, links });
    setIsSimulating(false);
    toast({ title: "Simulation Complete", description: "Sankey data has been updated based on your settings." });

  }, [currentControls, toast]);

  return (
    <AppLayout>
      <Header 
        onRunSimulation={handleRunSimulation}
        isSimulating={isSimulating}
      />
      <div className="flex-grow flex flex-row overflow-hidden p-0 md:p-2 lg:p-4">
        <Tabs defaultValue="sankey" className="flex-grow flex flex-row w-full overflow-hidden">
          <TabsList className="flex flex-col h-auto w-auto p-2 space-y-1 border-r mr-4 sticky top-0 bg-background/90 backdrop-blur-sm z-[5] rounded-lg shadow-sm">
            <TabsTrigger value="sankey" className="px-4 py-2 text-sm w-full justify-start">Sankey View</TabsTrigger>
            <TabsTrigger value="analytics" className="px-4 py-2 text-sm w-full justify-start">Analytics</TabsTrigger>
          </TabsList>
          
          <div className="flex-grow overflow-hidden">
            <TabsContent value="sankey" className="h-full mt-0 -m-px">
              <ScrollArea className="h-full">
                 <SankeyDiagramView currentControls={currentControls} sankeyData={sankeyData} />
              </ScrollArea>
            </TabsContent>
            <TabsContent value="analytics" className="h-full mt-0 -m-px">
               <ScrollArea className="h-full">
                <AnalyticsView currentControls={currentControls} />
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      </div>
      <BottomControlsPanel 
        onFormChange={handleControlsChange}
        // onRunSimulation and isSimulating are removed as button is in Header
      />
    </AppLayout>
  );
}
