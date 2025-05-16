
"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
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

const SIMULATION_INTERVAL_MS = 1000; // Process transactions every 1 second

export default function HomePage() {
  const [currentControls, setCurrentControls] = useState<FormValues | null>(null);
  const [sankeyData, setSankeyData] = useState<SankeyData | null>(null);
  const [simulationState, setSimulationState] = useState<'idle' | 'running' | 'paused'>('idle');
  const [processedPaymentsCount, setProcessedPaymentsCount] = useState<number>(0);
  
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentTransactionBatchRef = useRef<TransactionProcessingState[]>([]); // To accumulate states for Sankey update
  const accumulatedLinksRef = useRef<Record<string, number>>({}); // For accumulating link values: "source>target" -> value
  const accumulatedProcessorStatsRef = useRef<Record<string, { successful: number; failed: number; volumeShareRaw: number }>>(
    PROCESSORS.reduce((acc, proc) => {
      acc[proc.id] = { successful: 0, failed: 0, volumeShareRaw: 0 };
      return acc;
    }, {} as Record<string, { successful: number; failed: number; volumeShareRaw: number}>)
  );
  const accumulatedGlobalStatsRef = useRef<{ totalSuccessful: number; totalFailed: number }>({ totalSuccessful: 0, totalFailed: 0 });


  const { toast } = useToast();

  const handleControlsChange = useCallback((data: FormValues) => {
    // Only update controls if simulation is not running to avoid mid-simulation changes for now
    if (simulationState !== 'running') {
      setCurrentControls(data);
    }
  }, [simulationState]);

  const resetSimulationState = () => {
    setSankeyData(null);
    setProcessedPaymentsCount(0);
    currentTransactionBatchRef.current = [];
    accumulatedLinksRef.current = {};
    accumulatedProcessorStatsRef.current = PROCESSORS.reduce((acc, proc) => {
      acc[proc.id] = { successful: 0, failed: 0, volumeShareRaw: 0 };
      return acc;
    }, {} as Record<string, { successful: number; failed: number; volumeShareRaw: number}>);
    accumulatedGlobalStatsRef.current = { totalSuccessful: 0, totalFailed: 0 };
  };
  
  const processTransactionBatch = useCallback(() => {
    if (!currentControls || simulationState !== 'running') {
      if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
      setSimulationState(prev => prev === 'running' ? 'paused' : prev); // If it was running, pause it.
      return;
    }

    const {
      totalPayments,
      selectedPaymentMethods: activePMStrings,
      processorMatrix,
      routingRulesText,
      smartRoutingEnabled,
      eliminationRoutingEnabled,
      // debitRoutingEnabled, // Not heavily used in this simplified model yet
      srFluctuation,
      processorIncidents,
      processorWiseSuccessRates: baseProcessorSRsInput,
      amount: transactionAmount,
      currency: transactionCurrency,
      simulateSaleEvent,
      tps: baseTps,
    } = currentControls;

    if (processedPaymentsCount >= totalPayments) {
      if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
      setSimulationState('idle');
      toast({
        title: "Simulation Complete",
        description: `Processed ${totalPayments} payments. Overall SR: ${((accumulatedGlobalStatsRef.current.totalSuccessful / totalPayments) * 100).toFixed(2)}%`,
        duration: 5000,
      });
      return;
    }
    
    const activePaymentMethods = activePMStrings as PaymentMethod[];
    if (activePaymentMethods.length === 0) {
        toast({ title: "Error", description: "No payment methods selected.", variant: "destructive" });
        if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
        setSimulationState('idle');
        return;
    }
    
    const effectiveTps = simulateSaleEvent ? Math.min(5000, baseTps * 5) : baseTps; // Example traffic spike
    const transactionsThisInterval = Math.max(1, Math.floor(effectiveTps * (SIMULATION_INTERVAL_MS / 1000)));
    const remainingPayments = totalPayments - processedPaymentsCount;
    const paymentsToProcessThisBatch = Math.min(transactionsThisInterval, remainingPayments);

    // Calculate Effective SR for each processor (should ideally be done once per simulation start/resume or if controls change)
    const processorEffectiveSRs: Record<string, number> = {};
    PROCESSORS.forEach(proc => {
      const baseSRInfo = baseProcessorSRsInput[proc.id];
      const baseSR = baseSRInfo ? baseSRInfo.sr : 90; 
      const fluctuationEffect = (srFluctuation[proc.id] - 50) / 100; 
      let effectiveSR = baseSR / 100 * (1 + fluctuationEffect);
      if (processorIncidents[proc.id]) effectiveSR *= 0.1;
      processorEffectiveSRs[proc.id] = Math.max(0, Math.min(1, effectiveSR));
    });

    const newLinksForBatch: Record<string, number> = {};
    const upsertLinkInBatch = (source: string, target: string, value: number = 1) => {
        const key = `${source}>${target}`;
        newLinksForBatch[key] = (newLinksForBatch[key] || 0) + value;
        accumulatedLinksRef.current[key] = (accumulatedLinksRef.current[key] || 0) + value;
    };

    for (let i = 0; i < paymentsToProcessThisBatch; i++) {
      const txnIndex = processedPaymentsCount + i;
      const currentPaymentMethod = activePaymentMethods[txnIndex % activePaymentMethods.length];
      
      upsertLinkInBatch('source', `pm_${currentPaymentMethod.toLowerCase()}`);

      let candidateProcessors: Processor[] = PROCESSORS.filter(
        proc => processorMatrix[proc.id]?.[currentPaymentMethod] // Basic availability
      );
      
      let eliminationAppliedThisTxn = false;
      if (eliminationRoutingEnabled) {
        const initialCandidateCount = candidateProcessors.length;
        candidateProcessors = candidateProcessors.filter(proc => {
          const isDown = processorIncidents[proc.id];
          const srTooLow = (processorEffectiveSRs[proc.id] * 100) < 50;
          return !isDown && !srTooLow;
        });
        if (candidateProcessors.length < initialCandidateCount) eliminationAppliedThisTxn = true;
      }
      
      let chosenProcessor: Processor | undefined = undefined;
      let strategyNodeId: string = RULE_STRATEGY_NODES.STANDARD_ROUTING;

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
          chosenProcessor = candidateProcessors[Math.floor(Math.random() * candidateProcessors.length)];
        }
      }
      
      if (eliminationAppliedThisTxn && strategyNodeId === RULE_STRATEGY_NODES.STANDARD_ROUTING) {
         strategyNodeId = RULE_STRATEGY_NODES.ELIMINATION_APPLIED;
      }

      if (chosenProcessor) {
        upsertLinkInBatch(`pm_${currentPaymentMethod.toLowerCase()}`, strategyNodeId);
        upsertLinkInBatch(strategyNodeId, `proc_${chosenProcessor.id}`);
        accumulatedProcessorStatsRef.current[chosenProcessor.id].volumeShareRaw++;

        const success = Math.random() < processorEffectiveSRs[chosenProcessor.id];
        if (success) {
          upsertLinkInBatch(`proc_${chosenProcessor.id}`, 'status_success');
          accumulatedProcessorStatsRef.current[chosenProcessor.id].successful++;
          accumulatedGlobalStatsRef.current.totalSuccessful++;
        } else {
          upsertLinkInBatch(`proc_${chosenProcessor.id}`, 'status_failure');
          accumulatedProcessorStatsRef.current[chosenProcessor.id].failed++;
          accumulatedGlobalStatsRef.current.totalFailed++;
        }
      } else {
        strategyNodeId = RULE_STRATEGY_NODES.NO_ROUTE_FOUND;
        upsertLinkInBatch(`pm_${currentPaymentMethod.toLowerCase()}`, strategyNodeId);
        upsertLinkInBatch(strategyNodeId, 'status_failure');
        accumulatedGlobalStatsRef.current.totalFailed++;
      }
    }
    
    setProcessedPaymentsCount(prev => prev + paymentsToProcessThisBatch);

    // Update Sankey Data
    const nodes: SankeyNode[] = [{ id: 'source', name: 'Source', type: 'source' }];
    activePaymentMethods.forEach(pm => {
      nodes.push({ id: `pm_${pm.toLowerCase()}`, name: pm, type: 'paymentMethod' });
    });
    // Dynamically add used strategy nodes
    const usedStrategyNodeIds = new Set<string>();
    Object.keys(accumulatedLinksRef.current).forEach(key => {
        const [source, target] = key.split('>');
        if (Object.values(RULE_STRATEGY_NODES).includes(source as any)) usedStrategyNodeIds.add(source);
        if (Object.values(RULE_STRATEGY_NODES).includes(target as any)) usedStrategyNodeIds.add(target);
    });

    if (usedStrategyNodeIds.has(RULE_STRATEGY_NODES.CUSTOM_RULE_HIGH_VALUE_CARD)) nodes.push({ id: RULE_STRATEGY_NODES.CUSTOM_RULE_HIGH_VALUE_CARD, name: 'Custom Rule: High Value Card', type: 'ruleStrategy' });
    if (usedStrategyNodeIds.has(RULE_STRATEGY_NODES.SMART_ROUTING)) nodes.push({ id: RULE_STRATEGY_NODES.SMART_ROUTING, name: 'Smart Routing', type: 'ruleStrategy' });
    if (usedStrategyNodeIds.has(RULE_STRATEGY_NODES.ELIMINATION_APPLIED)) nodes.push({ id: RULE_STRATEGY_NODES.ELIMINATION_APPLIED, name: 'Elimination Applied', type: 'ruleStrategy' });
    if (usedStrategyNodeIds.has(RULE_STRATEGY_NODES.STANDARD_ROUTING)) nodes.push({ id: RULE_STRATEGY_NODES.STANDARD_ROUTING, name: 'Standard Routing', type: 'ruleStrategy' });
    if (usedStrategyNodeIds.has(RULE_STRATEGY_NODES.DEBIT_FIRST_ROUTING)) nodes.push({ id: RULE_STRATEGY_NODES.DEBIT_FIRST_ROUTING, name: 'Debit First Routing', type: 'ruleStrategy' });
    if (usedStrategyNodeIds.has(RULE_STRATEGY_NODES.NO_ROUTE_FOUND)) nodes.push({ id: RULE_STRATEGY_NODES.NO_ROUTE_FOUND, name: 'No Route Found', type: 'ruleStrategy' });
    
    PROCESSORS.forEach(proc => {
      if (Object.keys(accumulatedLinksRef.current).some(key => key.includes(`proc_${proc.id}`))) {
        nodes.push({ id: `proc_${proc.id}`, name: proc.name, type: 'processor' });
      }
    });
    nodes.push({ id: 'status_success', name: 'Success', type: 'status' });
    nodes.push({ id: 'status_failure', name: 'Failure', type: 'status' });
    nodes.push({ id: 'sink', name: 'Sink', type: 'sink' });

    const finalLinks: SankeyLink[] = [];
    Object.entries(accumulatedLinksRef.current).forEach(([key, value]) => {
        const [source, target] = key.split('>');
        if (value > 0) {
            finalLinks.push({ source, target, value });
        }
    });
    
    // Add links to sink if not already handled by direct links
    const successTotal = finalLinks.filter(l => l.target === 'status_success').reduce((sum, l) => sum + l.value, 0);
    const failureTotal = finalLinks.filter(l => l.target === 'status_failure').reduce((sum, l) => sum + l.value, 0);

    if (successTotal > 0 && !finalLinks.some(l => l.source === 'status_success' && l.target === 'sink')) {
        finalLinks.push({ source: 'status_success', target: 'sink', value: successTotal });
    }
    if (failureTotal > 0 && !finalLinks.some(l => l.source === 'status_failure' && l.target === 'sink')) {
        finalLinks.push({ source: 'status_failure', target: 'sink', value: failureTotal });
    }
    
    const participatingNodeIds = new Set<string>();
    finalLinks.forEach(link => {
      participatingNodeIds.add(link.source);
      participatingNodeIds.add(link.target);
    });
    if (finalLinks.some(l => l.source === 'source')) participatingNodeIds.add('source');
    if (finalLinks.some(l => l.target === 'sink')) participatingNodeIds.add('sink');
    
    const finalNodes = nodes.filter(node => participatingNodeIds.has(node.id));

    setSankeyData({ nodes: finalNodes, links: finalLinks });
    
    // Update analytics data for current controls
    const overallSR = totalPayments > 0 ? (accumulatedGlobalStatsRef.current.totalSuccessful / processedPaymentsCount) * 100 : 0; // Use processedPaymentsCount for live SR
    const updatedProcessorSRs = { ...currentControls.processorWiseSuccessRates };
    PROCESSORS.forEach(proc => {
        const stats = accumulatedProcessorStatsRef.current[proc.id];
        const totalRoutedToProc = stats.volumeShareRaw;
        const procSR = totalRoutedToProc > 0 ? (stats.successful / totalRoutedToProc) * 100 : 0;
        const procVolumeShare = processedPaymentsCount > 0 ? (totalRoutedToProc / processedPaymentsCount) * 100 : 0; // Use processedPaymentsCount
        updatedProcessorSRs[proc.id] = {
            sr: parseFloat(procSR.toFixed(2)) || 0,
            volumeShare: parseFloat(procVolumeShare.toFixed(2)) || 0,
            failureRate: parseFloat((100 - procSR).toFixed(2)) || 0
        };
    });

    // Update controls state for analytics view to reflect live data
    setCurrentControls(prevControls => ({
        ...prevControls!,
        overallSuccessRate: parseFloat(overallSR.toFixed(2)) || 0,
        processorWiseSuccessRates: updatedProcessorSRs,
        tps: effectiveTps, 
    }));

  }, [currentControls, simulationState, processedPaymentsCount, toast, setCurrentControls]);


  useEffect(() => {
    if (simulationState === 'running') {
      simulationIntervalRef.current = setInterval(processTransactionBatch, SIMULATION_INTERVAL_MS);
    } else {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
    }
    return () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
      }
    };
  }, [simulationState, processTransactionBatch]);

  const handleStartSimulation = useCallback(() => {
    if (!currentControls) {
      toast({ title: "Error", description: "Control data not available.", variant: "destructive" });
      return;
    }
    if (simulationState === 'idle') {
      resetSimulationState(); // Reset stats only if starting fresh
    }
    setSimulationState('running');
    toast({ title: "Simulation Started", description: `Processing ${currentControls.totalPayments} payments.`, duration: 3000 });
  }, [currentControls, toast, simulationState]);

  const handlePauseSimulation = useCallback(() => {
    setSimulationState('paused');
    toast({ title: "Simulation Paused", duration: 3000 });
  }, [toast]);

  const handleStopSimulation = useCallback(() => {
    setSimulationState('idle');
    resetSimulationState(); // Reset all stats and Sankey data
    toast({ title: "Simulation Stopped", duration: 3000 });
  }, [toast]);

  const [activeTab, setActiveTab] = useState<string>("sankey");

  return (
    <>
      <AppLayout>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-grow overflow-hidden">
          <Header
            onStartSimulation={handleStartSimulation}
            onPauseSimulation={handlePauseSimulation}
            onStopSimulation={handleStopSimulation}
            simulationState={simulationState}
          />
          <div className="flex-grow overflow-hidden p-0">
            <TabsContent value="sankey" className="h-full mt-0">
              <SankeyDiagramView currentControls={currentControls} sankeyData={sankeyData} />
            </TabsContent>
            <TabsContent value="analytics" className="h-full mt-0">
              <div className="p-2 md:p-4 lg:p-6 h-full"> 
                <ScrollArea className="h-full">
                  {/* Pass processedPaymentsCount to AnalyticsView if you want to show # processed */}
                  <AnalyticsView currentControls={currentControls} />
                </ScrollArea>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </AppLayout>
      <BottomControlsPanel
        onFormChange={handleControlsChange}
        isSimulationActive={simulationState === 'running'} // Pass this prop
      />
    </>
  );
}
