
"use client";

import React, { useState, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { BottomControlsPanel, type FormValues } from '@/components/BottomControlsPanel';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { SankeyDiagramView } from '@/components/SankeyDiagramView';
import { AnalyticsView } from '@/components/AnalyticsView';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { SankeyData, SankeyNode, SankeyLink, Processor } from '@/lib/types';
import { PROCESSORS } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';


export default function HomePage() {
  const [currentControls, setCurrentControls] = useState<FormValues | null>(null);
  const [sankeyData, setSankeyData] = useState<SankeyData | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("sankey");
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
    setSankeyData(null); 

    // Simulate API call or heavy computation
    await new Promise(resolve => setTimeout(resolve, 500)); // Shorter delay for quicker feedback

    const {
      totalPayments,
      selectedPaymentMethods,
      processorMatrix,
      // routingRulesText, // Full parsing of this is out of scope for this iteration.
      smartRoutingEnabled,
      eliminationRoutingEnabled,
      // debitRoutingEnabled, // Effect of this will be minimal without more PM/processor attributes.
      srFluctuation,
      processorIncidents,
      processorWiseSuccessRates: baseProcessorSRs,
    } = currentControls;

    const nodes: SankeyNode[] = [];
    const links: SankeyLink[] = [];

    // Initialize stats
    const processorStats: Record<string, {
      routedTo: number;
      successful: number;
      failed: number;
      paymentMethodBreakdown: Record<string, { routedTo: number, successful: number, failed: number }>;
    }> = {};

    PROCESSORS.forEach(proc => {
      processorStats[proc.id] = { routedTo: 0, successful: 0, failed: 0, paymentMethodBreakdown: {} };
      selectedPaymentMethods.forEach(pm => {
        processorStats[proc.id].paymentMethodBreakdown[pm] = { routedTo: 0, successful: 0, failed: 0 };
      });
    });
    let totalSuccessfulTransactions = 0;
    let totalFailedTransactions = 0; // This will include unrouted as failures for SR calc
    let transactionsUnrouted = 0;

    // 1. Calculate Effective SR for each processor
    const processorEffectiveSRs: Record<string, number> = {};
    PROCESSORS.forEach(proc => {
      const baseSR = baseProcessorSRs[proc.id]?.sr ?? 90; // Default SR if not specified
      const fluctuationEffect = (srFluctuation[proc.id] - 50) / 200; // Fluctuation: 50 is neutral, slider 0-100 maps to -0.25 to +0.25
      let effectiveSR = baseSR / 100 * (1 + fluctuationEffect);
      if (processorIncidents[proc.id]) {
        effectiveSR *= 0.1; // Drastic SR reduction during an incident
      }
      processorEffectiveSRs[proc.id] = Math.max(0, Math.min(1, effectiveSR)); // Clamp between 0 and 1
    });

    // 2. Simulate each transaction
    for (let i = 0; i < totalPayments; i++) {
      // Distribute transactions somewhat evenly across selected payment methods for simulation input
      const currentPaymentMethod = selectedPaymentMethods[i % selectedPaymentMethods.length];

      // Identify applicable processors for this PM
      let candidateProcessors = PROCESSORS.filter(
        proc => processorMatrix[proc.id]?.[currentPaymentMethod]
      );

      // Apply Elimination Routing
      if (eliminationRoutingEnabled) {
        candidateProcessors = candidateProcessors.filter(
          proc => !processorIncidents[proc.id]
        );
      }

      if (candidateProcessors.length === 0) {
        transactionsUnrouted++;
        totalFailedTransactions++; // Count unrouted as a general failure for SR
        continue; // No processor to route to
      }

      let selectedProcessorData: Processor | undefined;

      // Apply Routing Strategy
      if (smartRoutingEnabled && candidateProcessors.length > 0) {
        candidateProcessors.sort((a, b) => processorEffectiveSRs[b.id] - processorEffectiveSRs[a.id]);
        selectedProcessorData = candidateProcessors[0]; 
      } else if (candidateProcessors.length > 0) {
        selectedProcessorData = candidateProcessors[Math.floor(Math.random() * candidateProcessors.length)];
      }
      // Note: debitRoutingEnabled logic would be more complex.

      if (selectedProcessorData) {
        const procId = selectedProcessorData.id;
        processorStats[procId].routedTo++;
        if (!processorStats[procId].paymentMethodBreakdown[currentPaymentMethod]) {
            processorStats[procId].paymentMethodBreakdown[currentPaymentMethod] = { routedTo: 0, successful: 0, failed: 0 };
        }
        processorStats[procId].paymentMethodBreakdown[currentPaymentMethod].routedTo++;


        const success = Math.random() < processorEffectiveSRs[procId];
        if (success) {
          processorStats[procId].successful++;
          processorStats[procId].paymentMethodBreakdown[currentPaymentMethod].successful++;
          totalSuccessfulTransactions++;
        } else {
          processorStats[procId].failed++;
          processorStats[procId].paymentMethodBreakdown[currentPaymentMethod].failed++;
          totalFailedTransactions++;
        }
      } else {
        transactionsUnrouted++;
        totalFailedTransactions++; 
      }
    }

    // 3. Prepare Sankey Data
    nodes.push({ id: 'source', name: 'Source', type: 'source' });
    selectedPaymentMethods.forEach(pm => {
      nodes.push({ id: `pm_${pm.toLowerCase()}`, name: pm, type: 'paymentMethod' });
    });
    PROCESSORS.forEach(proc => {
      nodes.push({ id: `proc_${proc.id}`, name: proc.name, type: 'processor' });
    });
    nodes.push({ id: 'status_success', name: 'Success', type: 'status' });
    nodes.push({ id: 'status_failure', name: 'Failure', type: 'status' });
    nodes.push({ id: 'sink', name: 'Sink', type: 'sink' });
    
    // Links: Source -> PMs
    // This shows initial distribution. Sum of these should be totalPayments.
    const paymentsPerSelectedPM = totalPayments / (selectedPaymentMethods.length || 1);
    selectedPaymentMethods.forEach(pm => {
      if (paymentsPerSelectedPM > 0) {
         links.push({
            source: 'source',
            target: `pm_${pm.toLowerCase()}`,
            value: Math.floor(paymentsPerSelectedPM) // Use floor, adjust last one if needed for sum
         });
      }
    });
     // Adjust last PM link value if totalPayments is not perfectly divisible
    if (selectedPaymentMethods.length > 0 && totalPayments % selectedPaymentMethods.length !== 0) {
        const remainder = totalPayments % selectedPaymentMethods.length;
        const lastPMLink = links.find(l => l.target === `pm_${selectedPaymentMethods[selectedPaymentMethods.length - 1].toLowerCase()}`);
        if (lastPMLink) {
            lastPMLink.value += remainder;
        } else if (remainder > 0 && selectedPaymentMethods.length === 1) {
            // If only one PM and it didn't get a link yet (e.g. paymentsPerSelectedPM was < 1 then floored)
             links.push({
                source: 'source',
                target: `pm_${selectedPaymentMethods[0].toLowerCase()}`,
                value: totalPayments
             });
        }
    }


    // Links: PMs -> Processors
    PROCESSORS.forEach(proc => {
      selectedPaymentMethods.forEach(pm => {
        const traffic = processorStats[proc.id].paymentMethodBreakdown[pm]?.routedTo;
        if (traffic > 0) {
          links.push({
            source: `pm_${pm.toLowerCase()}`,
            target: `proc_${proc.id}`,
            value: traffic
          });
        }
      });
    });
    
    // Links: Processors -> Success/Failure
    PROCESSORS.forEach(proc => {
      if (processorStats[proc.id].successful > 0) {
        links.push({ source: `proc_${proc.id}`, target: 'status_success', value: processorStats[proc.id].successful });
      }
      if (processorStats[proc.id].failed > 0) {
        links.push({ source: `proc_${proc.id}`, target: 'status_failure', value: processorStats[proc.id].failed });
      }
    });

    // Links: Status -> Sink
    if (totalSuccessfulTransactions > 0) {
      links.push({ source: 'status_success', target: 'sink', value: totalSuccessfulTransactions });
    }
    
    // Total failures for the sink link include processor failures and unrouted transactions
    const totalFailuresForSink = Object.values(processorStats).reduce((sum, stat) => sum + stat.failed, 0) + transactionsUnrouted;
    if (totalFailuresForSink > 0) {
       links.push({ source: 'status_failure', target: 'sink', value: totalFailuresForSink });
    }

    const linkedNodeIds = new Set<string>();
    links.forEach(link => {
      linkedNodeIds.add(link.source);
      linkedNodeIds.add(link.target);
    });
    if (links.some(l => l.source === 'source' && l.value > 0)) linkedNodeIds.add('source');
    if (links.some(l => l.target === 'sink' && l.value > 0)) linkedNodeIds.add('sink');
    if (totalSuccessfulTransactions > 0) linkedNodeIds.add('status_success');
    if (totalFailuresForSink > 0) linkedNodeIds.add('status_failure');
    
    selectedPaymentMethods.forEach(pm => {
        if (links.some(l => (l.source === `pm_${pm.toLowerCase()}` || l.target === `pm_${pm.toLowerCase()}`) && l.value > 0)) {
            linkedNodeIds.add(`pm_${pm.toLowerCase()}`);
        }
    });
    PROCESSORS.forEach(proc => {
        if (links.some(l => (l.source === `proc_${proc.id}` || l.target === `proc_${proc.id}`) && l.value > 0)) {
            linkedNodeIds.add(`proc_${proc.id}`);
        }
    });


    const finalNodes = nodes.filter(node => linkedNodeIds.has(node.id));
    
    // Ensure all links have a value > 0
    const finalLinks = links.filter(link => link.value > 0);


    setSankeyData({ nodes: finalNodes, links: finalLinks });
    setIsSimulating(false);

    const overallSR = totalPayments > 0 ? (totalSuccessfulTransactions / totalPayments) * 100 : 0;
    toast({ 
        title: "Simulation Complete", 
        description: `Overall SR: ${overallSR.toFixed(2)}%. ${transactionsUnrouted} unrouted.`,
        duration: 5000,
    });

    if (currentControls) {
        setCurrentControls(prevControls => ({
            ...prevControls!,
            overallSuccessRate: parseFloat(overallSR.toFixed(2)) // Ensure it's a number
        }));
    }

  }, [currentControls, toast, setCurrentControls]);


  return (
    <>
      <AppLayout>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-grow overflow-hidden">
          <Header
            onRunSimulation={handleRunSimulation}
            isSimulating={isSimulating}
          />
          {/* Main content area for TabsContent */}
          <div className="flex-grow overflow-hidden p-0 md:p-2 lg:p-4">
            <TabsContent value="sankey" className="h-full mt-0"> 
              <ScrollArea className="h-full">
                 <SankeyDiagramView currentControls={currentControls} sankeyData={sankeyData} />
              </ScrollArea>
            </TabsContent>
            <TabsContent value="analytics" className="h-full mt-0">  
               <ScrollArea className="h-full">
                <AnalyticsView currentControls={currentControls} />
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      </AppLayout>
      <BottomControlsPanel
        onFormChange={handleControlsChange}
      />
    </>
  );
}

