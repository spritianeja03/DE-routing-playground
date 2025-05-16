
"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { BottomControlsPanel, type FormValues } from '@/components/BottomControlsPanel';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { SankeyDiagramView } from '@/components/SankeyDiagramView';
import { AnalyticsView } from '@/components/AnalyticsView';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { SankeyData, SankeyNode, SankeyLink, Processor, PaymentMethod, ProcessorMetricsHistory } from '@/lib/types';
import { PROCESSORS, PAYMENT_METHODS, RULE_STRATEGY_NODES } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';

const SIMULATION_INTERVAL_MS = 1000; // Process transactions every 1 second

export default function HomePage() {
  const [currentControls, setCurrentControls] = useState<FormValues | null>(null);
  const [sankeyData, setSankeyData] = useState<SankeyData | null>(null);
  const [simulationState, setSimulationState] = useState<'idle' | 'running' | 'paused'>('idle');
  const [processedPaymentsCount, setProcessedPaymentsCount] = useState<number>(0);
  const [simulationTimeStep, setSimulationTimeStep] = useState<number>(0);

  const [successRateHistory, setSuccessRateHistory] = useState<ProcessorMetricsHistory>([]);
  const [volumeHistory, setVolumeHistory] = useState<ProcessorMetricsHistory>([]);

  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const accumulatedLinksRef = useRef<Record<string, number>>({});
  const accumulatedProcessorStatsRef = useRef<Record<string, { successful: number; failed: number; volumeShareRaw: number }>>(
    PROCESSORS.reduce((acc, proc) => {
      acc[proc.id] = { successful: 0, failed: 0, volumeShareRaw: 0 };
      return acc;
    }, {} as Record<string, { successful: number; failed: number; volumeShareRaw: number }>)
  );
  const accumulatedGlobalStatsRef = useRef<{ totalSuccessful: number; totalFailed: number }>({ totalSuccessful: 0, totalFailed: 0 });

  const { toast } = useToast();

  const handleControlsChange = useCallback((data: FormValues) => {
    // Only update if simulation is not running to prevent mid-simulation changes affecting current run
    if (simulationState !== 'running') {
      setCurrentControls(data);
    }
  }, [simulationState]);


  const resetSimulationState = () => {
    setSankeyData(null);
    setProcessedPaymentsCount(0);
    setSimulationTimeStep(0);
    setSuccessRateHistory([]);
    setVolumeHistory([]);

    accumulatedLinksRef.current = {};
    accumulatedProcessorStatsRef.current = PROCESSORS.reduce((acc, proc) => {
      acc[proc.id] = { successful: 0, failed: 0, volumeShareRaw: 0 };
      return acc;
    }, {} as Record<string, { successful: number; failed: number; volumeShareRaw: number }>);
    accumulatedGlobalStatsRef.current = { totalSuccessful: 0, totalFailed: 0 };

    if (currentControls) {
      const initialProcessorSRs = PROCESSORS.reduce((acc, proc) => {
        const baseSRInfo = currentControls.processorWiseSuccessRates[proc.id];
        // Ensure proc.baseSR exists or use a fallback
        const defaultSR = proc.id === 'stripe' ? 90 : (proc.id === 'razorpay' ? 95 : (proc.id === 'cashfree' ? 92 : (proc.id === 'payu' ? 88 : 85)));
        const initialSR = baseSRInfo ? baseSRInfo.sr : defaultSR;
        acc[proc.id] = { sr: initialSR, volumeShare: 0, failureRate: 100 - initialSR };
        return acc;
      }, {} as FormValues['processorWiseSuccessRates']);

      setCurrentControls(prevControls => ({
        ...prevControls!,
        overallSuccessRate: 0,
        processorWiseSuccessRates: initialProcessorSRs,
      }));
    }
  };

  const processTransactionBatch = useCallback(() => {
    if (!currentControls || simulationState !== 'running') {
      if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
      setSimulationState(prev => prev === 'running' ? 'paused' : prev);
      return;
    }

    const {
      totalPayments,
      selectedPaymentMethods: activePMStrings,
      processorMatrix,
      routingRulesText,
      smartRoutingEnabled,
      eliminationRoutingEnabled,
      srFluctuation,
      processorIncidents,
      processorWiseSuccessRates: baseProcessorSRsInput,
      amount: transactionAmount,
      simulateSaleEvent,
      tps: baseTps,
    } = currentControls;

    if (processedPaymentsCount >= totalPayments) {
      if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
      setSimulationState('idle');
      const finalOverallSR = totalPayments > 0 ? (accumulatedGlobalStatsRef.current.totalSuccessful / totalPayments) * 100 : 0;
      toast({
        title: "Simulation Complete",
        description: `Processed ${totalPayments} payments. Overall SR: ${finalOverallSR.toFixed(2)}%`,
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

    const effectiveTps = simulateSaleEvent ? Math.min(5000, baseTps * 5) : baseTps;
    const transactionsThisInterval = Math.max(1, Math.floor(effectiveTps * (SIMULATION_INTERVAL_MS / 1000)));
    const remainingPayments = totalPayments - processedPaymentsCount;
    const paymentsToProcessThisBatch = Math.min(transactionsThisInterval, remainingPayments);

    const processorEffectiveSRs: Record<string, number> = {};
    PROCESSORS.forEach(proc => {
      const baseSRInfo = baseProcessorSRsInput[proc.id];
      const defaultSR = proc.id === 'stripe' ? 90 : (proc.id === 'razorpay' ? 95 : (proc.id === 'cashfree' ? 92 : (proc.id === 'payu' ? 88 : 85)));
      const baseSR = baseSRInfo ? baseSRInfo.sr : defaultSR;
      const fluctuationEffect = (srFluctuation[proc.id] - 50) / 100;
      let effectiveSR = baseSR / 100 * (1 + fluctuationEffect);
      if (processorIncidents[proc.id]) effectiveSR *= 0.1;
      processorEffectiveSRs[proc.id] = Math.max(0, Math.min(1, effectiveSR));
    });

    const upsertLink = (source: string, target: string, value: number = 1) => {
      const key = `${source}>${target}`;
      accumulatedLinksRef.current[key] = (accumulatedLinksRef.current[key] || 0) + value;
    };

    for (let i = 0; i < paymentsToProcessThisBatch; i++) {
      const txnIndex = processedPaymentsCount + i;
      const currentPaymentMethod = activePaymentMethods[txnIndex % activePaymentMethods.length];
      const currentPaymentMethodId = `pm_${currentPaymentMethod.toLowerCase()}`;

      upsertLink('source', currentPaymentMethodId);

      let candidateProcessors: Processor[] = PROCESSORS.filter(
        proc => processorMatrix[proc.id]?.[currentPaymentMethod]
      );

      let strategyNodeId: string = RULE_STRATEGY_NODES.STANDARD_ROUTING;

      if (eliminationRoutingEnabled) {
        const initialCandidateCount = candidateProcessors.length;
        candidateProcessors = candidateProcessors.filter(proc => {
          const isDown = processorIncidents[proc.id];
          const srTooLow = (processorEffectiveSRs[proc.id] * 100) < 50;
          return !isDown && !srTooLow;
        });
        if (candidateProcessors.length < initialCandidateCount && strategyNodeId === RULE_STRATEGY_NODES.STANDARD_ROUTING) {
          strategyNodeId = RULE_STRATEGY_NODES.ELIMINATION_APPLIED;
        }
      }

      let chosenProcessor: Processor | undefined = undefined;
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
          if (strategyNodeId === RULE_STRATEGY_NODES.STANDARD_ROUTING || strategyNodeId === RULE_STRATEGY_NODES.ELIMINATION_APPLIED) {
            strategyNodeId = RULE_STRATEGY_NODES.SMART_ROUTING;
          }
        } else {
          chosenProcessor = candidateProcessors[Math.floor(Math.random() * candidateProcessors.length)];
        }
      }

      if (chosenProcessor) {
        const processorId = `proc_${chosenProcessor.id}`;
        upsertLink(currentPaymentMethodId, strategyNodeId);
        upsertLink(strategyNodeId, processorId);
        accumulatedProcessorStatsRef.current[chosenProcessor.id].volumeShareRaw++;

        const success = Math.random() < processorEffectiveSRs[chosenProcessor.id];
        if (success) {
          upsertLink(processorId, 'status_success');
          accumulatedProcessorStatsRef.current[chosenProcessor.id].successful++;
          accumulatedGlobalStatsRef.current.totalSuccessful++;
        } else {
          upsertLink(processorId, 'status_failure');
          accumulatedProcessorStatsRef.current[chosenProcessor.id].failed++;
          accumulatedGlobalStatsRef.current.totalFailed++;
        }
      } else {
        strategyNodeId = RULE_STRATEGY_NODES.NO_ROUTE_FOUND;
        upsertLink(currentPaymentMethodId, strategyNodeId);
        upsertLink(strategyNodeId, 'status_failure');
        accumulatedGlobalStatsRef.current.totalFailed++;
      }
    }

    const newProcessedCount = processedPaymentsCount + paymentsToProcessThisBatch;
    setProcessedPaymentsCount(newProcessedCount);
    const newTimeStep = simulationTimeStep + 1;
    setSimulationTimeStep(newTimeStep);


    const nodes: SankeyNode[] = [{ id: 'source', name: 'Source', type: 'source' }];
    activePaymentMethods.forEach(pm => {
      nodes.push({ id: `pm_${pm.toLowerCase()}`, name: pm, type: 'paymentMethod' });
    });

    const usedStrategyNodeIds = new Set<string>();
    Object.keys(accumulatedLinksRef.current).forEach(key => {
      const [source, target] = key.split('>');
      if (Object.values(RULE_STRATEGY_NODES).includes(source as any)) usedStrategyNodeIds.add(source);
      if (Object.values(RULE_STRATEGY_NODES).includes(target as any)) usedStrategyNodeIds.add(target);
    });

    Object.entries(RULE_STRATEGY_NODES).forEach(([key, value]) => {
      if (usedStrategyNodeIds.has(value)) {
        const name = key.toLowerCase().replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        nodes.push({ id: value, name: name, type: 'ruleStrategy' });
      }
    });

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

    const successTotal = finalLinks.filter(l => l.target === 'status_success').reduce((sum, l) => sum + l.value, 0);
    const failureTotal = finalLinks.filter(l => l.target === 'status_failure').reduce((sum, l) => sum + l.value, 0);

    if (successTotal > 0 && !finalLinks.some(l => l.source === 'status_success' && l.target === 'sink')) {
      finalLinks.push({ source: 'status_success', target: 'sink', value: successTotal });
    }
    if (failureTotal > 0 && !finalLinks.some(l => l.source === 'status_failure' && l.target === 'sink')) {
      finalLinks.push({ source: 'status_failure', target: 'sink', value: failureTotal });
    }

    const participatingNodeIds = new Set<string>(['source', 'sink']);
    finalLinks.forEach(link => {
      participatingNodeIds.add(link.source);
      participatingNodeIds.add(link.target);
    });

    const finalNodes = nodes.filter(node => participatingNodeIds.has(node.id));
    setSankeyData({ nodes: finalNodes, links: finalLinks });

    const overallSR = newProcessedCount > 0 ? (accumulatedGlobalStatsRef.current.totalSuccessful / newProcessedCount) * 100 : 0;
    const updatedProcessorSRsUi = { ...currentControls.processorWiseSuccessRates };

    const currentSuccessRateDataPoint: Record<string, number> = { time: newTimeStep };
    const currentVolumeDataPoint: Record<string, number> = { time: newTimeStep };

    PROCESSORS.forEach(proc => {
      const stats = accumulatedProcessorStatsRef.current[proc.id];
      const totalRoutedToProc = stats.volumeShareRaw;
      const procSR = totalRoutedToProc > 0 ? (stats.successful / totalRoutedToProc) * 100 : 0;
      const procVolumeShare = newProcessedCount > 0 ? (totalRoutedToProc / newProcessedCount) * 100 : 0;

      updatedProcessorSRsUi[proc.id] = {
        sr: parseFloat(procSR.toFixed(2)) || 0,
        volumeShare: parseFloat(procVolumeShare.toFixed(2)) || 0,
        failureRate: parseFloat((100 - procSR).toFixed(2)) || 0,
      };
      currentSuccessRateDataPoint[proc.id] = parseFloat(procSR.toFixed(2)) || 0;
      currentVolumeDataPoint[proc.id] = totalRoutedToProc;
    });

    setSuccessRateHistory(prev => [...prev, currentSuccessRateDataPoint]);
    setVolumeHistory(prev => [...prev, currentVolumeDataPoint]);


    setCurrentControls(prevControls => ({
      ...prevControls!,
      overallSuccessRate: parseFloat(overallSR.toFixed(2)) || 0,
      processorWiseSuccessRates: updatedProcessorSRsUi,
      tps: effectiveTps,
    }));

  }, [currentControls, simulationState, processedPaymentsCount, toast, setCurrentControls, simulationTimeStep]);

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
      toast({ title: "Error", description: "Control data not available. Please configure settings.", variant: "destructive" });
      return;
    }
    if (currentControls.selectedPaymentMethods.length === 0) {
      toast({ title: "Error", description: "No payment methods selected.", variant: "destructive" });
      return;
    }
    if (simulationState === 'idle') {
      resetSimulationState();
    }
    setSimulationState('running');
    if (simulationState === 'idle') {
      toast({ title: "Simulation Started", description: `Processing ${currentControls.totalPayments} payments.`, duration: 3000 });
    } else {
      toast({ title: "Simulation Resumed", duration: 3000 });
    }
  }, [currentControls, toast, simulationState]);

  const handlePauseSimulation = useCallback(() => {
    setSimulationState('paused');
    toast({ title: "Simulation Paused", duration: 3000 });
  }, [toast]);

  const handleStopSimulation = useCallback(() => {
    setSimulationState('idle');
    resetSimulationState();
    toast({ title: "Simulation Stopped & Reset", duration: 3000 });
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
                  <AnalyticsView
                    currentControls={currentControls}
                    processedPayments={processedPaymentsCount}
                    totalSuccessful={accumulatedGlobalStatsRef.current.totalSuccessful}
                    totalFailed={accumulatedGlobalStatsRef.current.totalFailed}
                    successRateHistory={successRateHistory}
                    volumeHistory={volumeHistory}
                  />
                </ScrollArea>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </AppLayout>
      <BottomControlsPanel
        onFormChange={handleControlsChange}
        isSimulationActive={simulationState === 'running'}
      />
    </>
  );
}
