
"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { BottomControlsPanel, type FormValues } from '@/components/BottomControlsPanel';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { StatsView } from '@/components/StatsView';
import { AnalyticsGraphsView } from '@/components/AnalyticsGraphsView';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Processor, PaymentMethod, ProcessorMetricsHistory } from '@/lib/types';
import { PROCESSORS, PAYMENT_METHODS, RULE_STRATEGY_NODES } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';

const SIMULATION_INTERVAL_MS = 1000; // Process transactions every 1 second

export default function HomePage() {
  const [currentControls, setCurrentControls] = useState<FormValues | null>(null);
  const [simulationState, setSimulationState] = useState<'idle' | 'running' | 'paused'>('idle');
  const [processedPaymentsCount, setProcessedPaymentsCount] = useState<number>(0);
  const [simulationTimeStep, setSimulationTimeStep] = useState<number>(0);

  const [successRateHistory, setSuccessRateHistory] = useState<ProcessorMetricsHistory>([]);
  const [volumeHistory, setVolumeHistory] = useState<ProcessorMetricsHistory>([]);
  
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const accumulatedProcessorStatsRef = useRef<Record<string, { successful: number; failed: number; volumeShareRaw: number }>>(
    PROCESSORS.reduce((acc, proc) => {
      acc[proc.id] = { successful: 0, failed: 0, volumeShareRaw: 0 };
      return acc;
    }, {} as Record<string, { successful: number; failed: number; volumeShareRaw: number }>)
  );
  const accumulatedGlobalStatsRef = useRef<{ totalSuccessful: number; totalFailed: number }>({ totalSuccessful: 0, totalFailed: 0 });

  const { toast } = useToast();

  const handleControlsChange = useCallback((data: FormValues) => {
    setCurrentControls(data);
  }, []);


  const resetSimulationState = () => {
    setProcessedPaymentsCount(0);
    setSimulationTimeStep(0);
    setSuccessRateHistory([]);
    setVolumeHistory([]);

    accumulatedProcessorStatsRef.current = PROCESSORS.reduce((acc, proc) => {
      acc[proc.id] = { successful: 0, failed: 0, volumeShareRaw: 0 };
      return acc;
    }, {} as Record<string, { successful: number; failed: number; volumeShareRaw: number }>)
    accumulatedGlobalStatsRef.current = { totalSuccessful: 0, totalFailed: 0 };

    if (currentControls) {
      const initialProcessorSRs = PROCESSORS.reduce((acc, proc) => {
        const baseSRInfo = currentControls.processorWiseSuccessRates[proc.id];
        let defaultSR = 85; 
        if (proc.id === 'stripe') defaultSR = 90;
        else if (proc.id === 'razorpay') defaultSR = 95;
        else if (proc.id === 'cashfree') defaultSR = 92;
        else if (proc.id === 'payu') defaultSR = 88;
        else if (proc.id === 'fampay') defaultSR = 85;
        
        const initialSR = baseSRInfo ? baseSRInfo.sr : defaultSR;
        acc[proc.id] = { sr: initialSR, volumeShare: 0, failureRate: 100 - initialSR };
        return acc;
      }, {} as FormValues['processorWiseSuccessRates']);

      const initialProcessorIncidents = PROCESSORS.reduce((acc, proc) => {
        acc[proc.id] = null; // Reset incidents
        return acc;
      }, {} as FormValues['processorIncidents']);


      setCurrentControls(prevControls => {
        if (!prevControls) return null; 
        return {
          ...prevControls,
          overallSuccessRate: 0,
          processorWiseSuccessRates: initialProcessorSRs,
          processorIncidents: initialProcessorIncidents,
        }
      });
    }
  };

  const processTransactionBatch = useCallback(() => {
    if (!currentControls) {
      if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
      setSimulationState('idle');
      toast({ title: "Error", description: "Control data not available. Please configure settings.", variant: "destructive" });
      return;
    }
    if(currentControls.selectedPaymentMethods.length === 0) {
        if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
        setSimulationState('idle');
        toast({ title: "Error", description: "No payment methods selected. Please select at least one.", variant: "destructive" });
        return;
    }


    const {
      totalPayments,
      selectedPaymentMethods: activePMStrings,
      processorMatrix,
      routingRulesText,
      smartRoutingEnabled,
      eliminationRoutingEnabled,
      debitRoutingEnabled,
      srFluctuation,
      processorIncidents, // Now contains end times or null
      processorWiseSuccessRates: baseProcessorSRsInput,
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
      let defaultSR = 85; 
        if (proc.id === 'stripe') defaultSR = 90;
        else if (proc.id === 'razorpay') defaultSR = 95;
        else if (proc.id === 'cashfree') defaultSR = 92;
        else if (proc.id === 'payu') defaultSR = 88;
        else if (proc.id === 'fampay') defaultSR = 85;
      const baseSR = baseSRInfo ? baseSRInfo.sr : defaultSR;
      const fluctuationEffect = (srFluctuation[proc.id] - 50) / 100; 
      let effectiveSR = (baseSR / 100) * (1 + fluctuationEffect); 
      
      const incidentEndTime = processorIncidents[proc.id];
      const isIncidentActive = incidentEndTime !== null && Date.now() < incidentEndTime;

      if (isIncidentActive) effectiveSR *= 0.1; 
      processorEffectiveSRs[proc.id] = Math.max(0, Math.min(1, effectiveSR));
    });


    for (let i = 0; i < paymentsToProcessThisBatch; i++) {
      const txnIndex = processedPaymentsCount + i;
      const currentPaymentMethod = activePaymentMethods[txnIndex % activePaymentMethods.length];

      let candidateProcessors: Processor[] = PROCESSORS.filter(
        proc => processorMatrix[proc.id]?.[currentPaymentMethod]
      );

      let strategyApplied = RULE_STRATEGY_NODES.STANDARD_ROUTING;

      if (eliminationRoutingEnabled) {
        const initialCount = candidateProcessors.length;
        candidateProcessors = candidateProcessors.filter(proc => {
          const incidentEndTime = processorIncidents[proc.id];
          const isIncidentActive = incidentEndTime !== null && Date.now() < incidentEndTime;
          const srTooLow = (processorEffectiveSRs[proc.id] * 100) < 50; 
          return !isIncidentActive && !srTooLow;
        });
        if(candidateProcessors.length < initialCount && candidateProcessors.length > 0) { 
            strategyApplied = RULE_STRATEGY_NODES.ELIMINATION_APPLIED;
        }
      }

      let chosenProcessor: Processor | undefined = undefined;
      // Simplified rule: IF method = <PaymentMethod> THEN RouteTo <ProcessorID>
      const ruleMatch = routingRulesText.match(/IF method = (\w+) THEN RouteTo (\w+)/i);
      if (ruleMatch && currentPaymentMethod.toLowerCase() === ruleMatch[1].toLowerCase()) {
        const targetProcessorId = ruleMatch[2].toLowerCase();
        const customRuleProcessor = candidateProcessors.find(p => p.id === targetProcessorId);
        if (customRuleProcessor) {
          chosenProcessor = customRuleProcessor;
          strategyApplied = RULE_STRATEGY_NODES.CUSTOM_RULE_APPLIED;
        }
      }


      if (!chosenProcessor && candidateProcessors.length > 0) {
        if (smartRoutingEnabled) {
          candidateProcessors.sort((a, b) => processorEffectiveSRs[b.id] - processorEffectiveSRs[a.id]);
          chosenProcessor = candidateProcessors[0];
          strategyApplied = RULE_STRATEGY_NODES.SMART_ROUTING;
        } else if (debitRoutingEnabled) { 
            chosenProcessor = candidateProcessors[Math.floor(Math.random() * candidateProcessors.length)];
            strategyApplied = RULE_STRATEGY_NODES.DEBIT_FIRST_ROUTING; 
        } else { 
          chosenProcessor = candidateProcessors[Math.floor(Math.random() * candidateProcessors.length)];
        }
      }


      if (chosenProcessor) {
        accumulatedProcessorStatsRef.current[chosenProcessor.id].volumeShareRaw++;
        const success = Math.random() < processorEffectiveSRs[chosenProcessor.id];
        if (success) {
          accumulatedProcessorStatsRef.current[chosenProcessor.id].successful++;
          accumulatedGlobalStatsRef.current.totalSuccessful++;
        } else {
          accumulatedProcessorStatsRef.current[chosenProcessor.id].failed++;
          accumulatedGlobalStatsRef.current.totalFailed++;
        }
      } else { 
        accumulatedGlobalStatsRef.current.totalFailed++;
      }
    }

    const newProcessedCount = processedPaymentsCount + paymentsToProcessThisBatch;
    setProcessedPaymentsCount(newProcessedCount);
    const newTimeStep = simulationTimeStep + 1;
    setSimulationTimeStep(newTimeStep);

    const overallSR = newProcessedCount > 0 ? (accumulatedGlobalStatsRef.current.totalSuccessful / newProcessedCount) * 100 : 0;
    const updatedProcessorSRsUi = { ...currentControls.processorWiseSuccessRates };

    const currentSuccessRateDataPoint: Record<string, number | string> = { time: newTimeStep };
    const currentVolumeDataPoint: Record<string, number | string> = { time: newTimeStep };

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

    setSuccessRateHistory(prev => [...prev, currentSuccessRateDataPoint as ProcessorMetricsHistory[number]]);
    setVolumeHistory(prev => [...prev, currentVolumeDataPoint as ProcessorMetricsHistory[number]]);


    setCurrentControls(prevControls => {
       if (!prevControls) return null;
       return {
        ...prevControls,
        overallSuccessRate: parseFloat(overallSR.toFixed(2)) || 0,
        processorWiseSuccessRates: updatedProcessorSRsUi,
        tps: effectiveTps, 
       }
    });

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

  const [activeTab, setActiveTab] = useState("analytics");


  return (
    <>
      <AppLayout>
        <Tabs defaultValue="analytics" value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-grow overflow-hidden">
          <Header
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onStartSimulation={handleStartSimulation}
            onPauseSimulation={handlePauseSimulation}
            onStopSimulation={handleStopSimulation}
            simulationState={simulationState}
          />
          <div className="flex-grow overflow-hidden p-0">
            <TabsContent value="stats" className="h-full mt-0 data-[state=active]:flex data-[state=active]:flex-col">
              <div className="p-2 md:p-4 lg:p-6 h-full flex-grow">
                <ScrollArea className="h-full">
                  <StatsView
                    currentControls={currentControls}
                    processedPayments={processedPaymentsCount}
                    totalSuccessful={accumulatedGlobalStatsRef.current.totalSuccessful}
                    totalFailed={accumulatedGlobalStatsRef.current.totalFailed}
                  />
                </ScrollArea>
              </div>
            </TabsContent>
            <TabsContent value="analytics" className="h-full mt-0 data-[state=active]:flex data-[state=active]:flex-col">
              <div className="p-2 md:p-4 lg:p-6 h-full flex-grow">
                <ScrollArea className="h-full">
                  <AnalyticsGraphsView
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
