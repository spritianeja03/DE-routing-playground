
"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { BottomControlsPanel, type FormValues } from '@/components/BottomControlsPanel';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { StatsView } from '@/components/StatsView';
import { AnalyticsGraphsView } from '@/components/AnalyticsGraphsView';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { Processor, PaymentMethod, ProcessorMetricsHistory, StructuredRule, ControlsState, OverallSRHistory, AISummaryInput, AISummaryProcessorMetric, AISummaryIncident } from '@/lib/types';
import { PROCESSORS, PAYMENT_METHODS, RULE_STRATEGY_NODES, DEFAULT_PROCESSOR_AVAILABILITY } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import { summarizeSimulation } from '@/ai/flows/summarize-simulation-flow';

const SIMULATION_INTERVAL_MS = 1000; 

const getDefaultProcessorWiseSuccessRates = (): ControlsState['processorWiseSuccessRates'] => {
  return PROCESSORS.reduce((acc, proc) => {
    let defaultSr = 85;
    let defaultSrDeviation = 2; // Default deviation
    if (proc.id === 'stripe') { defaultSr = 92; defaultSrDeviation = 2;}
    else if (proc.id === 'adyen') { defaultSr = 90; defaultSrDeviation = 3;}
    else if (proc.id === 'paypal') { defaultSr = 88; defaultSrDeviation = 4;}
    else if (proc.id === 'worldpay') { defaultSr = 86; defaultSrDeviation = 2;}
    else if (proc.id === 'checkoutcom') { defaultSr = 91; defaultSrDeviation = 3;}
    
    acc[proc.id] = { sr: defaultSr, srDeviation: defaultSrDeviation, volumeShare: 0, failureRate: 100 - defaultSr };
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
  const [overallSuccessRateHistory, setOverallSuccessRateHistory] = useState<OverallSRHistory>([]);
  
  const [simulationSummary, setSimulationSummary] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState<boolean>(false);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState<boolean>(false);

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
    setOverallSuccessRateHistory([]);
    setSimulationSummary(null);
    setIsGeneratingSummary(false);
    
    accumulatedProcessorStatsRef.current = PROCESSORS.reduce((acc, proc) => {
      acc[proc.id] = { successful: 0, failed: 0, volumeShareRaw: 0 };
      return acc;
    }, {} as Record<string, { successful: number; failed: number; volumeShareRaw: number }>)
    accumulatedGlobalStatsRef.current = { totalSuccessful: 0, totalFailed: 0 };

    if (currentControls) { 
      const initialProcessorSRs = getDefaultProcessorWiseSuccessRates();
      const initialProcessorIncidents = PROCESSORS.reduce((acc, proc) => {
        acc[proc.id] = null; 
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
    } else { 
        setCurrentControls(prev => ({
            ...(prev as FormValues), 
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

  const generateAndSetSummary = async () => {
    if (!currentControls || processedPaymentsCount === 0) {
      return;
    }
    setIsGeneratingSummary(true);
    setSimulationSummary(null); 
    setIsSummaryModalOpen(true); 

    const processorMetrics: AISummaryProcessorMetric[] = PROCESSORS.map(proc => {
      const stats = accumulatedProcessorStatsRef.current[proc.id];
      const totalRoutedToProc = stats.volumeShareRaw;
      const observedSr = totalRoutedToProc > 0 ? (stats.successful / totalRoutedToProc) * 100 : 0;
      return {
        name: proc.name,
        volume: totalRoutedToProc,
        observedSr: parseFloat(observedSr.toFixed(2)),
        baseSr: currentControls.processorWiseSuccessRates[proc.id]?.sr ?? 0, // This is the target mean SR
      };
    });

    const incidents: AISummaryIncident[] = PROCESSORS.map(proc => ({
      processorName: proc.name,
      isActive: currentControls.processorIncidents[proc.id] !== null && Date.now() < (currentControls.processorIncidents[proc.id] as number),
    }));
    
    const overallSR = processedPaymentsCount > 0 ? (accumulatedGlobalStatsRef.current.totalSuccessful / processedPaymentsCount) * 100 : 0;

    const summaryInput: AISummaryInput = {
      totalPaymentsProcessed: processedPaymentsCount,
      targetTotalPayments: currentControls.totalPayments,
      overallSuccessRate: parseFloat(overallSR.toFixed(2)),
      totalSuccessful: accumulatedGlobalStatsRef.current.totalSuccessful,
      totalFailed: accumulatedGlobalStatsRef.current.totalFailed,
      effectiveTps: currentControls.tps,
      processorMetrics,
      incidents,
      simulationDurationSteps: simulationTimeStep,
    };

    try {
      const result = await summarizeSimulation(summaryInput);
      setSimulationSummary(result.summaryText);
    } catch (error) {
      console.error("Error generating simulation summary:", error);
      setSimulationSummary("Failed to generate AI summary. Please check the console for errors and try again."); 
      toast({
        title: "AI Summary Error",
        description: "Could not generate the simulation summary.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingSummary(false);
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
      processorIncidents,
      processorWiseSuccessRates: inputProcessorConfigs, 
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
      generateAndSetSummary(); 
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
    
    // Calculate mean effective SR for routing decisions
    const processorMeanEffectiveSRs: Record<string, number> = {};
    PROCESSORS.forEach(proc => {
      const baseSR = inputProcessorConfigs[proc.id]?.sr ?? 85; 
      let meanEffectiveSR = baseSR / 100.0; 
      
      const incidentEndTime = processorIncidents[proc.id];
      const isIncidentActive = incidentEndTime !== null && Date.now() < incidentEndTime;

      if (isIncidentActive) {
        meanEffectiveSR *= 0.1; 
      }
      processorMeanEffectiveSRs[proc.id] = Math.max(0, Math.min(1, meanEffectiveSR));
    });
    
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
      
      if (!chosenProcessor) {
        const initialCount = candidateProcessors.length;
        candidateProcessors = candidateProcessors.filter(proc => {
          const incidentEndTime = processorIncidents[proc.id];
          const isIncidentActive = incidentEndTime !== null && Date.now() < incidentEndTime;
          const srTooLow = (processorMeanEffectiveSRs[proc.id] * 100) < 50; 
          return !isIncidentActive && !srTooLow;
        });
        if(candidateProcessors.length < initialCount && candidateProcessors.length > 0) { 
            strategyApplied = RULE_STRATEGY_NODES.ELIMINATION_APPLIED; 
        }
      }
      
      if (!chosenProcessor && candidateProcessors.length > 0) {
          candidateProcessors.sort((a, b) => processorMeanEffectiveSRs[b.id] - processorMeanEffectiveSRs[a.id]);
          chosenProcessor = candidateProcessors[0]; 
          strategyApplied = strategyApplied === RULE_STRATEGY_NODES.ELIMINATION_APPLIED ? RULE_STRATEGY_NODES.ELIMINATION_APPLIED : RULE_STRATEGY_NODES.STANDARD_ROUTING; 
      }

      if (chosenProcessor) {
        accumulatedProcessorStatsRef.current[chosenProcessor.id].volumeShareRaw++;
        attemptsThisBatch[chosenProcessor.id] = (attemptsThisBatch[chosenProcessor.id] || 0) + 1;

        // Apply SR deviation for this specific transaction
        const baseSrPercent = inputProcessorConfigs[chosenProcessor.id]?.sr ?? 85;
        const deviationPercentagePoints = inputProcessorConfigs[chosenProcessor.id]?.srDeviation ?? 0;
        const randomDeviationFactor = (Math.random() * 2 - 1); // -1 to 1
        const actualDeviation = randomDeviationFactor * deviationPercentagePoints;
        let srForThisTxn = baseSrPercent + actualDeviation;

        // Apply incident penalty
        const incidentEndTime = processorIncidents[chosenProcessor.id];
        const isIncidentActive = incidentEndTime !== null && Date.now() < incidentEndTime;
        if (isIncidentActive) {
          srForThisTxn *= 0.1; // Heavy penalty for active incident
        }
        srForThisTxn = Math.max(0, Math.min(100, srForThisTxn)); // Clamp to 0-100%
        
        const successProbability = srForThisTxn / 100.0;
        const success = Math.random() < successProbability;

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
    
    const updatedProcessorSRsUi = { ...currentControls.processorWiseSuccessRates };
    PROCESSORS.forEach(proc => {
      const stats = accumulatedProcessorStatsRef.current[proc.id];
      const totalRoutedToProc = stats.volumeShareRaw;
      
      const procSR_cumulative_observed = totalRoutedToProc > 0 ? (stats.successful / totalRoutedToProc) * 100 : 0; 
      const procVolumeShare = newProcessedCount > 0 ? (totalRoutedToProc / newProcessedCount) * 100 : 0;

      updatedProcessorSRsUi[proc.id] = {
        sr: inputProcessorConfigs[proc.id]?.sr ?? 0, // Keep base SR
        srDeviation: inputProcessorConfigs[proc.id]?.srDeviation ?? 0, // Keep deviation
        volumeShare: parseFloat(procVolumeShare.toFixed(2)) || 0,
        failureRate: parseFloat((100 - procSR_cumulative_observed).toFixed(2)) || 0, 
      };
    });
    
    const currentSuccessRateDataPoint: Record<string, number | string> = { time: newTimeStep };
    PROCESSORS.forEach(proc => {
      currentSuccessRateDataPoint[proc.id] = attemptsThisBatch[proc.id] > 0 ? parseFloat(((successesThisBatch[proc.id] / attemptsThisBatch[proc.id]) * 100).toFixed(2)) : 0;
    });
    setSuccessRateHistory(prev => [...prev, currentSuccessRateDataPoint as ProcessorMetricsHistory[number]]);
        
    const currentVolumeDataPoint: Record<string, number | string> = { time: newTimeStep };
    PROCESSORS.forEach(proc => {
      currentVolumeDataPoint[proc.id] = accumulatedProcessorStatsRef.current[proc.id].volumeShareRaw; 
    });
    setVolumeHistory(prev => [...prev, currentVolumeDataPoint as ProcessorMetricsHistory[number]]);

    setOverallSuccessRateHistory(prev => [...prev, { time: newTimeStep, overallSR: parseFloat(overallSR.toFixed(2)) || 0 }]);

    setCurrentControls(prevControls => {
       if (!prevControls) return null;
       return {
        ...prevControls, 
        overallSuccessRate: parseFloat(overallSR.toFixed(2)) || 0,
        tps: effectiveTps, 
        processorWiseSuccessRates: updatedProcessorSRsUi, 
       }
    });

  }, [currentControls, simulationState, processedPaymentsCount, toast, setCurrentControls, simulationTimeStep, generateAndSetSummary]); // Added generateAndSetSummary to deps

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
    if (processedPaymentsCount > 0) {
      generateAndSetSummary();
    }
    // Do not resetSimulationState() immediately here, allow summary to generate from existing data.
    // Resetting can happen on next "Start" if it's 'idle'
    toast({ title: "Simulation Stopped", description: "Summary generated if applicable.", duration: 3000 });
  }, [toast, processedPaymentsCount, generateAndSetSummary]); 

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
                      currentControls={currentControls} 
                      processedPayments={processedPaymentsCount}
                      totalSuccessful={accumulatedGlobalStatsRef.current.totalSuccessful}
                      totalFailed={accumulatedGlobalStatsRef.current.totalFailed}
                      overallSuccessRateHistory={overallSuccessRateHistory}
                    />
                  </div>
              </ScrollArea>
            </TabsContent>
            <TabsContent value="analytics" className="h-full mt-0 data-[state=active]:flex data-[state=active]:flex-col">
               <ScrollArea className="h-full">
                 <div className="p-2 md:p-4 lg:p-6">
                    <AnalyticsGraphsView
                      successRateHistory={successRateHistory} 
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
      <Dialog open={isSummaryModalOpen} onOpenChange={setIsSummaryModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hyperswitch AI Summary</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {isGeneratingSummary ? (
              <div className="flex flex-col items-center justify-center space-y-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Generating summary...</p>
              </div>
            ) : simulationSummary ? (
              <p className="text-sm whitespace-pre-line">{simulationSummary}</p>
            ) : (
              <p className="text-sm text-destructive">Failed to generate summary. Please try again.</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setIsSummaryModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
