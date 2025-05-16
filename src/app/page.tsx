
"use client";

import React, { useState, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { BottomControlsPanel, type FormValues } from '@/components/BottomControlsPanel';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { SankeyDiagramView } from '@/components/SankeyDiagramView';
import { AnalyticsView } from '@/components/AnalyticsView';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { SankeyData, SankeyNode, SankeyLink, Processor, PaymentMethod, TransactionProcessingState } from '@/lib/types';
import { PROCESSORS, PAYMENT_METHODS, RULE_STRATEGY_NODES } from '@/lib/constants';
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

    await new Promise(resolve => setTimeout(resolve, 300)); // Simulate computation

    const {
      totalPayments,
      selectedPaymentMethods: activePMStrings, // These are strings from the form
      processorMatrix,
      routingRulesText,
      smartRoutingEnabled,
      eliminationRoutingEnabled,
      debitRoutingEnabled, // Logic for this will be kept simple for now
      srFluctuation,
      processorIncidents,
      processorWiseSuccessRates: baseProcessorSRsInput, // sr, volumeShare, failureRate
      amount: transactionAmount, // Use this as the general amount for transactions
      currency: transactionCurrency,
      simulateSaleEvent, // If true, use higher TPS
      tps: baseTps,
    } = currentControls;

    const activePaymentMethods = activePMStrings as PaymentMethod[];
    const effectiveTps = simulateSaleEvent ? 5000 : baseTps; // Traffic spike

    const nodes: SankeyNode[] = [];
    const links: SankeyLink[] = [];
    
    // Helper to add/update links
    const upsertLink = (source: string, target: string, value: number = 1) => {
      const existingLink = links.find(l => l.source === source && l.target === target);
      if (existingLink) {
        existingLink.value += value;
      } else {
        links.push({ source, target, value });
      }
    };

    // Stats tracking for Sankey link values
    const transactionFlowStats: Record<string, number> = {}; // key: "sourceId>targetId", value: count

    const processorStats: Record<string, {
      successful: number;
      failed: number;
      volumeShareRaw: number; // count of transactions routed
    }> = PROCESSORS.reduce((acc, proc) => {
      acc[proc.id] = { successful: 0, failed: 0, volumeShareRaw: 0 };
      return acc;
    }, {} as Record<string, { successful: number; failed: number; volumeShareRaw: number}>);
    
    let totalSuccessfulGlobal = 0;
    let totalFailedGlobal = 0; // Includes unrouted

    // 1. Calculate Effective SR for each processor
    const processorEffectiveSRs: Record<string, number> = {};
    PROCESSORS.forEach(proc => {
      const baseSRInfo = baseProcessorSRsInput[proc.id];
      const baseSR = baseSRInfo ? baseSRInfo.sr : 90; // Default SR if not in controls
      const fluctuationEffect = (srFluctuation[proc.id] - 50) / 100; // e.g., 0-100 slider, 50 is neutral. Converts to -0.5 to +0.5.
      let effectiveSR = baseSR / 100 * (1 + fluctuationEffect); // Apply fluctuation
      
      // Reduce SR significantly during an incident
      if (processorIncidents[proc.id]) {
        effectiveSR *= 0.1; // 90% reduction
      }
      processorEffectiveSRs[proc.id] = Math.max(0, Math.min(1, effectiveSR)); // Clamp SR between 0 and 1
    });

    // 2. Simulate each transaction
    for (let i = 0; i < totalPayments; i++) {
      const txnId = `txn_${String(i + 1).padStart(3, '0')}`;
      const currentPaymentMethod = activePaymentMethods[i % activePaymentMethods.length];

      const processingState: TransactionProcessingState = {
        id: txnId,
        method: currentPaymentMethod,
        amount: transactionAmount,
        currency: transactionCurrency,
        appliedRuleStrategyNodeId: null,
        selectedProcessorId: null,
        isSuccess: null,
      };
      
      upsertLink('source', `pm_${currentPaymentMethod.toLowerCase()}`);

      let candidateProcessors: Processor[] = PROCESSORS.filter(
        proc => processorMatrix[proc.id]?.[currentPaymentMethod] && !processorIncidents[proc.id] // Basic availability and not down
      );

      // Apply Elimination Routing (SR < 50% or incident)
      let eliminationAppliedThisTxn = false;
      if (eliminationRoutingEnabled) {
        const initialCandidateCount = candidateProcessors.length;
        candidateProcessors = candidateProcessors.filter(proc => {
          const isDown = processorIncidents[proc.id];
          const srTooLow = (processorEffectiveSRs[proc.id] * 100) < 50;
          return !isDown && !srTooLow;
        });
        if (candidateProcessors.length < initialCandidateCount) {
          eliminationAppliedThisTxn = true;
        }
      }
      
      // Determine routing strategy and processor
      let chosenProcessor: Processor | undefined = undefined;
      let strategyNodeId: string = RULE_STRATEGY_NODES.STANDARD_ROUTING; // Default

      // Custom Rule Check (simplified example)
      const ruleMatch = routingRulesText.match(/IF amount > (\d+) AND method = (\w+) THEN RouteTo (\w+)/i);
      if (ruleMatch && currentPaymentMethod.toLowerCase() === ruleMatch[2].toLowerCase() && transactionAmount > parseInt(ruleMatch[1])) {
        const targetProcessorId = ruleMatch[3].toLowerCase();
        const customRuleProcessor = candidateProcessors.find(p => p.id === targetProcessorId);
        if (customRuleProcessor) {
          chosenProcessor = customRuleProcessor;
          strategyNodeId = RULE_STRATEGY_NODES.CUSTOM_RULE_HIGH_VALUE_CARD;
        }
      }

      if (!chosenProcessor && candidateProcessors.length > 0) {
        if (smartRoutingEnabled) {
          candidateProcessors.sort((a, b) => processorEffectiveSRs[b.id] - processorEffectiveSRs[a.id]);
          chosenProcessor = candidateProcessors[0];
          strategyNodeId = RULE_STRATEGY_NODES.SMART_ROUTING;
        } else {
          // Standard/Random if not smart routing and no custom rule hit
          chosenProcessor = candidateProcessors[Math.floor(Math.random() * candidateProcessors.length)];
          // strategyNodeId remains STANDARD_ROUTING or could be more specific if needed
        }
      }
      
      if (eliminationAppliedThisTxn && strategyNodeId !== RULE_STRATEGY_NODES.CUSTOM_RULE_HIGH_VALUE_CARD) {
        // If elimination happened and it wasn't overridden by a custom rule, show elimination strategy.
        // This is a simplification; a transaction might pass through multiple "strategy" nodes conceptually.
        // For Sankey, we pick one dominant strategy for the link.
        strategyNodeId = RULE_STRATEGY_NODES.ELIMINATION_APPLIED;
      }


      if (chosenProcessor) {
        processingState.selectedProcessorId = `proc_${chosenProcessor.id}`;
        processingState.appliedRuleStrategyNodeId = strategyNodeId;
        
        upsertLink(`pm_${currentPaymentMethod.toLowerCase()}`, strategyNodeId);
        upsertLink(strategyNodeId, `proc_${chosenProcessor.id}`);

        const success = Math.random() < processorEffectiveSRs[chosenProcessor.id];
        processingState.isSuccess = success;
        processorStats[chosenProcessor.id].volumeShareRaw++;

        if (success) {
          upsertLink(`proc_${chosenProcessor.id}`, 'status_success');
          processorStats[chosenProcessor.id].successful++;
          totalSuccessfulGlobal++;
        } else {
          upsertLink(`proc_${chosenProcessor.id}`, 'status_failure');
          processorStats[chosenProcessor.id].failed++;
          totalFailedGlobal++;
        }
      } else {
        // No processor found/routed
        processingState.appliedRuleStrategyNodeId = RULE_STRATEGY_NODES.NO_ROUTE_FOUND;
        upsertLink(`pm_${currentPaymentMethod.toLowerCase()}`, RULE_STRATEGY_NODES.NO_ROUTE_FOUND);
        upsertLink(RULE_STRATEGY_NODES.NO_ROUTE_FOUND, 'status_failure'); // Unrouted counts as failure
        totalFailedGlobal++;
      }
    }

    // 3. Prepare Sankey Data (Nodes)
    nodes.push({ id: 'source', name: 'Source', type: 'source' });
    activePaymentMethods.forEach(pm => {
      nodes.push({ id: `pm_${pm.toLowerCase()}`, name: pm, type: 'paymentMethod' });
    });

    // Add used strategy nodes dynamically
    const usedStrategyNodeIds = new Set<string>(links.map(l => l.source).concat(links.map(l => l.target)).filter(id => Object.values(RULE_STRATEGY_NODES).includes(id as any)));
    
    if (usedStrategyNodeIds.has(RULE_STRATEGY_NODES.CUSTOM_RULE_HIGH_VALUE_CARD)) nodes.push({ id: RULE_STRATEGY_NODES.CUSTOM_RULE_HIGH_VALUE_CARD, name: 'Custom Rule: High Value Card', type: 'ruleStrategy' });
    if (usedStrategyNodeIds.has(RULE_STRATEGY_NODES.SMART_ROUTING)) nodes.push({ id: RULE_STRATEGY_NODES.SMART_ROUTING, name: 'Smart Routing', type: 'ruleStrategy' });
    if (usedStrategyNodeIds.has(RULE_STRATEGY_NODES.ELIMINATION_APPLIED)) nodes.push({ id: RULE_STRATEGY_NODES.ELIMINATION_APPLIED, name: 'Elimination Applied', type: 'ruleStrategy' });
    if (usedStrategyNodeIds.has(RULE_STRATEGY_NODES.STANDARD_ROUTING)) nodes.push({ id: RULE_STRATEGY_NODES.STANDARD_ROUTING, name: 'Standard Routing', type: 'ruleStrategy' });
    if (usedStrategyNodeIds.has(RULE_STRATEGY_NODES.DEBIT_FIRST_ROUTING)) nodes.push({ id: RULE_STRATEGY_NODES.DEBIT_FIRST_ROUTING, name: 'Debit First Routing', type: 'ruleStrategy' });
    if (usedStrategyNodeIds.has(RULE_STRATEGY_NODES.NO_ROUTE_FOUND)) nodes.push({ id: RULE_STRATEGY_NODES.NO_ROUTE_FOUND, name: 'No Route Found', type: 'ruleStrategy' });
    
    PROCESSORS.forEach(proc => {
      // Only add processor nodes if they were involved in any link
      if (links.some(link => link.source === `proc_${proc.id}` || link.target === `proc_${proc.id}` )) {
        nodes.push({ id: `proc_${proc.id}`, name: proc.name, type: 'processor' });
      }
    });
    nodes.push({ id: 'status_success', name: 'Success', type: 'status' });
    nodes.push({ id: 'status_failure', name: 'Failure', type: 'status' });
    nodes.push({ id: 'sink', name: 'Sink', type: 'sink' }); // Added Sink

    // Final links to Sink
    const totalSuccessToSink = links.filter(l => l.target === 'status_success').reduce((sum, l) => sum + l.value, 0);
    if (totalSuccessToSink > 0) upsertLink('status_success', 'sink', totalSuccessToSink);
    
    const totalFailureToSink = links.filter(l => l.target === 'status_failure').reduce((sum, l) => sum + l.value, 0);
    if (totalFailureToSink > 0) upsertLink('status_failure', 'sink', totalFailureToSink);

    // Filter out nodes not participating in any links (except source and sink if they have links)
    const participatingNodeIds = new Set<string>();
    links.forEach(link => {
      participatingNodeIds.add(link.source);
      participatingNodeIds.add(link.target);
    });
    // Ensure source and sink are included if they have connections
    if (links.some(l => l.source === 'source')) participatingNodeIds.add('source');
    if (links.some(l => l.target === 'sink')) participatingNodeIds.add('sink');
    
    const finalNodes = nodes.filter(node => participatingNodeIds.has(node.id));
    const finalLinks = links.filter(link => link.value > 0);

    setSankeyData({ nodes: finalNodes, links: finalLinks });
    setIsSimulating(false);

    const overallSR = totalPayments > 0 ? (totalSuccessfulGlobal / totalPayments) * 100 : 0;
    
    // Update processorWiseSuccessRates in currentControls for AnalyticsView
    const updatedProcessorSRs = { ...currentControls.processorWiseSuccessRates };
    PROCESSORS.forEach(proc => {
        const stats = processorStats[proc.id];
        const totalRoutedToProc = stats.volumeShareRaw;
        const procSR = totalRoutedToProc > 0 ? (stats.successful / totalRoutedToProc) * 100 : 0;
        const procVolumeShare = totalPayments > 0 ? (totalRoutedToProc / totalPayments) * 100 : 0;
        updatedProcessorSRs[proc.id] = {
            sr: parseFloat(procSR.toFixed(2)),
            volumeShare: parseFloat(procVolumeShare.toFixed(2)),
            failureRate: parseFloat((100 - procSR).toFixed(2))
        };
    });

    if (currentControls) { // Ensure currentControls is not null
      setCurrentControls(prevControls => ({
          ...prevControls!,
          overallSuccessRate: parseFloat(overallSR.toFixed(2)),
          processorWiseSuccessRates: updatedProcessorSRs,
          // Update TPS if sale event was simulated
          tps: effectiveTps, 
      }));
    }
    
    toast({
        title: "Simulation Complete",
        description: `Overall SR: ${overallSR.toFixed(2)}%. ${totalPayments - totalSuccessfulGlobal - totalFailedGlobal} unhandled (should be 0). TPS: ${effectiveTps}`,
        duration: 5000,
    });

  // Dependency array update:
  // `currentControls` is the main dependency. Specific fields like `selectedPaymentMethods` are part of `currentControls`.
  // `toast` and `setCurrentControls` are stable.
  }, [currentControls, toast, setCurrentControls]);


  return (
    <>
      <AppLayout>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-grow overflow-hidden">
          <Header
            onRunSimulation={handleRunSimulation}
            isSimulating={isSimulating}
          />
          <div className="flex-grow overflow-hidden p-0"> {/* Removed outer padding */}
            <TabsContent value="sankey" className="h-full mt-0">
              {/* ScrollArea removed from here; SankeyDiagramView/SankeyDiagram will manage their own height/scroll if necessary or fill */}
              <SankeyDiagramView currentControls={currentControls} sankeyData={sankeyData} />
            </TabsContent>
            <TabsContent value="analytics" className="h-full mt-0">
              <div className="p-2 md:p-4 lg:p-6 h-full"> {/* Added padding inside analytics tab */}
                <ScrollArea className="h-full">
                  <AnalyticsView currentControls={currentControls} />
                </ScrollArea>
              </div>
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
