
"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { BottomControlsPanel, type FormValues } from '@/components/BottomControlsPanel';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { StatsView } from '@/components/StatsView';
import { AnalyticsGraphsView } from '@/components/AnalyticsGraphsView';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Processor, PaymentMethod, ProcessorMetricsHistory, StructuredRule, ControlsState } from '@/lib/types';
import { PROCESSORS, PAYMENT_METHODS, RULE_STRATEGY_NODES } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';

const SIMULATION_INTERVAL_MS = 1000; // Process transactions every 1 second

const getDefaultProcessorWiseSuccessRates = (): ControlsState['processorWiseSuccessRates'] => {
  return PROCESSORS.reduce((acc, proc) => {
    let defaultSr = 85;
    if (proc.id === 'stripe') defaultSr = 90;
    else if (proc.id === 'razorpay') defaultSr = 95;
    else if (proc.id === 'cashfree') defaultSr = 92;
    else if (proc.id === 'payu') defaultSr = 88;
    else if (proc.id === 'fampay') defaultSr = 85;
    acc[proc.id] = { sr: defaultSr, volumeShare: 0, failureRate: 100 - defaultSr };
    return acc;
  }, {} as ControlsState['processorWiseSuccessRates']);
};


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

    if (currentControls) { // Use existing currentControls to reset parts of it
      const initialProcessorSRs = getDefaultProcessorWiseSuccessRates();
      const initialProcessorIncidents = PROCESSORS.reduce((acc, proc) => {
        acc[proc.id] = null; // Reset incidents
        return acc;
      }, {} as FormValues['processorIncidents']);


      setCurrentControls(prevControls => {
        if (!prevControls) return null; 
        return {
          ...prevControls, // Keep other user settings like totalPayments, tps, etc.
          overallSuccessRate: 0,
          processorWiseSuccessRates: initialProcessorSRs, // Reset to defaults
          processorIncidents: initialProcessorIncidents, // Reset incidents
        }
      });
    } else { // If no currentControls, set up fresh defaults
        setCurrentControls(prev => ({
            ...(prev as FormValues), // Keep any partial if exists
            totalPayments: prev?.totalPayments ?? 1000,
            tps: prev?.tps ?? 100,
            selectedPaymentMethods: prev?.selectedPaymentMethods ?? [PAYMENT_METHODS[0], PAYMENT_METHODS[1]],
            processorMatrix: prev?.processorMatrix ?? PROCESSORS.reduce((acc, proc) => {
                acc[proc.id] = DEFAULT_PROCESSOR_AVAILABILITY[proc.id] || PAYMENT_METHODS.reduce((mAcc, m) => {mAcc[m] = false; return mAcc;}, {} as Record<PaymentMethod,boolean>); return acc;
            }, {} as FormValues['processorMatrix']),
            structuredRule: null,
            processorIncidents: PROCESSORS.reduce((acc, proc) => { acc[proc.id] = null; return acc; }, {} as FormValues['processorIncidents']),
            overallSuccessRate: 0,
            processorWiseSuccessRates: getDefaultProcessorWiseSuccessRates(),
        }));
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
      structuredRule,
      // srFluctuation, // Removed
      processorIncidents,
      processorWiseSuccessRates: inputProcessorSRs, // These are the base SRs from sliders
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

    const effectiveTps = baseTps;
    const transactionsThisInterval = Math.max(1, Math.floor(effectiveTps * (SIMULATION_INTERVAL_MS / 1000)));
    const remainingPayments = totalPayments - processedPaymentsCount;
    const paymentsToProcessThisBatch = Math.min(transactionsThisInterval, remainingPayments);

    // Calculate effective SR for probability, considering incidents
    const processorEffectiveSRsForProbability: Record<string, number> = {};
    PROCESSORS.forEach(proc => {
      const baseSR = inputProcessorSRs[proc.id]?.sr ?? 85; // Get SR from slider input
      let effectiveSR = baseSR / 100.0; // Convert to decimal for probability
      
      const incidentEndTime = processorIncidents[proc.id];
      const isIncidentActive = incidentEndTime !== null && Date.now() < incidentEndTime;

      if (isIncidentActive) {
        effectiveSR *= 0.1; // Penalty for incident
      }
      processorEffectiveSRsForProbability[proc.id] = Math.max(0, Math.min(1, effectiveSR));
    });

    // Track successes and attempts for *this batch* for chart data
    const successesThisBatch: Record<string, number> = PROCESSORS.reduce((acc,p) => ({...acc, [p.id]:0}), {});
    const attemptsThisBatch: Record<string, number> = PROCESSORS.reduce((acc,p) => ({...acc, [p.id]:0}), {});


    for (let i = 0; i < paymentsToProcessThisBatch; i++) {
      const txnIndex = processedPaymentsCount + i;
      const currentPaymentMethod = activePaymentMethods[txnIndex % activePaymentMethods.length];

      let candidateProcessors: Processor[] = PROCESSORS.filter(
        proc => processorMatrix[proc.id]?.[currentPaymentMethod]
      );

      let strategyApplied = RULE_STRATEGY_NODES.STANDARD_ROUTING;
      let chosenProcessor: Processor | undefined = undefined;

      // Evaluate structured rule
      if (structuredRule) {
        const rule = structuredRule as StructuredRule;
        let conditionMet = false;
        if (rule.condition.field === 'paymentMethod' && rule.condition.operator === 'EQUALS') {
          conditionMet = currentPaymentMethod === rule.condition.value;
        }
        
        if (conditionMet && rule.action.type === 'ROUTE_TO_PROCESSOR') {
          const targetProcessor = candidateProcessors.find(p => p.id === rule.action.processorId);
          if (targetProcessor) {
            chosenProcessor = targetProcessor;
            strategyApplied = RULE_STRATEGY_NODES.CUSTOM_RULE_APPLIED;
          }
        }
      }
      
      // Elimination Routing (always active)
      if (!chosenProcessor) {
        const initialCount = candidateProcessors.length;
        candidateProcessors = candidateProcessors.filter(proc => {
          const incidentEndTime = processorIncidents[proc.id];
          const isIncidentActive = incidentEndTime !== null && Date.now() < incidentEndTime;
          // Use processorEffectiveSRsForProbability for elimination check
          const srTooLow = (processorEffectiveSRsForProbability[proc.id] * 100) < 50; 
          return !isIncidentActive && !srTooLow;
        });
        if(candidateProcessors.length < initialCount && candidateProcessors.length > 0) { 
            strategyApplied = RULE_STRATEGY_NODES.ELIMINATION_APPLIED; 
        }
      }

      // Standard Routing (if no custom rule applied and candidates remain)
      // Sort by effective SR (after elimination) and pick the best (acts like smart routing)
      if (!chosenProcessor && candidateProcessors.length > 0) {
          candidateProcessors.sort((a, b) => processorEffectiveSRsForProbability[b.id] - processorEffectiveSRsForProbability[a.id]);
          chosenProcessor = candidateProcessors[0]; 
          strategyApplied = strategyApplied === RULE_STRATEGY_NODES.ELIMINATION_APPLIED ? RULE_STRATEGY_NODES.ELIMINATION_APPLIED : RULE_STRATEGY_NODES.STANDARD_ROUTING; 
      }


      if (chosenProcessor) {
        accumulatedProcessorStatsRef.current[chosenProcessor.id].volumeShareRaw++;
        attemptsThisBatch[chosenProcessor.id] = (attemptsThisBatch[chosenProcessor.id] || 0) + 1;

        const success = Math.random() < processorEffectiveSRsForProbability[chosenProcessor.id];
        if (success) {
          accumulatedProcessorStatsRef.current[chosenProcessor.id].successful++;
          successesThisBatch[chosenProcessor.id] = (successesThisBatch[chosenProcessor.id] || 0) + 1;
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
    
    // For StatsView Table: based on cumulative stats
    const updatedProcessorSRsUi = { ...currentControls.processorWiseSuccessRates };
    PROCESSORS.forEach(proc => {
      const stats = accumulatedProcessorStatsRef.current[proc.id];
      const totalRoutedToProc = stats.volumeShareRaw;
      // The SR shown in the table is the CUMULATIVE OBSERVED SR
      const procSR_cumulative = totalRoutedToProc > 0 ? (stats.successful / totalRoutedToProc) * 100 : 0;
      const procVolumeShare = newProcessedCount > 0 ? (totalRoutedToProc / newProcessedCount) * 100 : 0;

      updatedProcessorSRsUi[proc.id] = {
        sr: parseFloat(procSR_cumulative.toFixed(2)) || 0, // Display observed SR in table
        volumeShare: parseFloat(procVolumeShare.toFixed(2)) || 0,
        failureRate: parseFloat((100 - procSR_cumulative).toFixed(2)) || 0,
      };
    });

    // For SuccessRateOverTimeChart: based on *this batch's* observed SR
    const currentSuccessRateDataPoint: Record<string, number | string> = { time: newTimeStep };
    PROCESSORS.forEach(proc => {
      currentSuccessRateDataPoint[proc.id] = attemptsThisBatch[proc.id] > 0 ? parseFloat(((successesThisBatch[proc.id] / attemptsThisBatch[proc.id]) * 100).toFixed(2)) : 0;
    });
    setSuccessRateHistory(prev => [...prev, currentSuccessRateDataPoint as ProcessorMetricsHistory[number]]);
    
    // For VolumeOverTimeChart: based on cumulative raw volume routed to processor
    const currentVolumeDataPoint: Record<string, number | string> = { time: newTimeStep };
    PROCESSORS.forEach(proc => {
      currentVolumeDataPoint[proc.id] = accumulatedProcessorStatsRef.current[proc.id].volumeShareRaw; 
    });
    setVolumeHistory(prev => [...prev, currentVolumeDataPoint as ProcessorMetricsHistory[number]]);


    setCurrentControls(prevControls => {
       if (!prevControls) return null;
       return {
        ...prevControls, // This preserves the slider-set SRs as the base for next calc
        overallSuccessRate: parseFloat(overallSR.toFixed(2)) || 0,
        // processorWiseSuccessRates: updatedProcessorSRsUi, // This would overwrite slider SRs with observed SRs. Let's not do this.
                                                          // Instead, StatsView will get cumulative data directly.
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
              <ScrollArea className="h-full">
                 <div className="p-2 md:p-4 lg:p-6">
                    <StatsView
                      currentControls={currentControls} // Contains INPUT SRs from sliders
                      processedPayments={processedPaymentsCount}
                      totalSuccessful={accumulatedGlobalStatsRef.current.totalSuccessful}
                      totalFailed={accumulatedGlobalStatsRef.current.totalFailed}
                      // Pass cumulative processor stats for observed metrics in the table
                      processorStats={accumulatedProcessorStatsRef.current}
                      totalProcessedForTable={processedPaymentsCount}
                    />
                  </div>
              </ScrollArea>
            </TabsContent>
            <TabsContent value="analytics" className="h-full mt-0 data-[state=active]:flex data-[state=active]:flex-col">
               <ScrollArea className="h-full">
                 <div className="p-2 md:p-4 lg:p-6">
                    <AnalyticsGraphsView
                      successRateHistory={successRateHistory} // Plots OBSERVED SR per batch
                      volumeHistory={volumeHistory}
                    />
                  </div>
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
