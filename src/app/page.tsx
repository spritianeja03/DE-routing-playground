
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
import type { Processor, PaymentMethod, ProcessorMetricsHistory, StructuredRule, ControlsState, OverallSRHistory, AISummaryInput, AISummaryProcessorMetric, AISummaryIncident, OverallSRHistoryDataPoint, TimeSeriesDataPoint } from '@/lib/types';
import { PROCESSORS, PAYMENT_METHODS, RULE_STRATEGY_NODES, DEFAULT_PROCESSOR_AVAILABILITY } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import { summarizeSimulation } from '@/ai/flows/summarize-simulation-flow';

const SIMULATION_INTERVAL_MS = 1000;

const getDefaultProcessorWiseSuccessRates = (): ControlsState['processorWiseSuccessRates'] => {
  return PROCESSORS.reduce((acc, proc) => {
    let defaultSr = 85;
    let defaultSrDeviation = 2;
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

  const processorTransactionHistoryRef = useRef<Record<string, Array<0 | 1>>>(
    PROCESSORS.reduce((acc, proc) => {
      acc[proc.id] = [];
      return acc;
    }, {} as Record<string, Array<0 | 1>>)
  );

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
    // isSummaryModalOpen is controlled separately
    
    accumulatedProcessorStatsRef.current = PROCESSORS.reduce((acc, proc) => {
      acc[proc.id] = { successful: 0, failed: 0, volumeShareRaw: 0 };
      return acc;
    }, {} as Record<string, { successful: number; failed: number; volumeShareRaw: number }>)
    accumulatedGlobalStatsRef.current = { totalSuccessful: 0, totalFailed: 0 };

    processorTransactionHistoryRef.current = PROCESSORS.reduce((acc, proc) => {
      acc[proc.id] = [];
      return acc;
    }, {} as Record<string, Array<0 | 1>>);

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
            // Initialize new intelligent routing params if prev is null
            minAggregatesSize: prev?.minAggregatesSize ?? 100,
            maxAggregatesSize: prev?.maxAggregatesSize ?? 1000,
            currentBlockThresholdMaxTotalCount: prev?.currentBlockThresholdMaxTotalCount ?? 10,
            volumeSplit: prev?.volumeSplit ?? 100,
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
        baseSr: currentControls.processorWiseSuccessRates[proc.id]?.sr ?? 0,
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
      minAggregatesSize,
      maxAggregatesSize,
      currentBlockThresholdMaxTotalCount,
      volumeSplit,
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
    
    const processorMeanEffectiveSRs: Record<string, number> = {}; // For standard routing fallback, reflects baseSR+incidents
    PROCESSORS.forEach(proc => {
      const baseSR = inputProcessorConfigs[proc.id]?.sr ?? 85; 
      let meanEffectiveSR = baseSR / 100.0; 
      const incidentEndTime = processorIncidents[proc.id];
      const isIncidentActive = incidentEndTime !== null && Date.now() < incidentEndTime;
      if (isIncidentActive) meanEffectiveSR *= 0.1; 
      processorMeanEffectiveSRs[proc.id] = Math.max(0, Math.min(1, meanEffectiveSR));
    });
    
    const successesThisBatch: Record<string, number> = PROCESSORS.reduce((acc,p) => ({...acc, [p.id]:0}), {});
    const attemptsThisBatch: Record<string, number> = PROCESSORS.reduce((acc,p) => ({...acc, [p.id]:0}), {});

    for (let i = 0; i < paymentsToProcessThisBatch; i++) {
      const txnIndex = processedPaymentsCount + i;
      const currentPaymentMethod = activePaymentMethods[txnIndex % activePaymentMethods.length];
      
      let chosenProcessor: Processor | undefined = undefined;
      let strategyApplied = RULE_STRATEGY_NODES.STANDARD_ROUTING; // Default

      // Initial candidates based on PM matrix
      let candidateProcessors: Processor[] = PROCESSORS.filter(
        proc => processorMatrix[proc.id]?.[currentPaymentMethod]
      );

      // 1. Custom Rule Application (Highest Priority)
      if (structuredRule) {
        let conditionMet = false;
        if (structuredRule.condition.field === 'paymentMethod' && structuredRule.condition.operator === 'EQUALS') {
          conditionMet = currentPaymentMethod === structuredRule.condition.value;
        }
        if (conditionMet && structuredRule.action.type === 'ROUTE_TO_PROCESSOR') {
          const targetProcessor = candidateProcessors.find(p => p.id === structuredRule.action.processorId);
          if (targetProcessor) {
            chosenProcessor = targetProcessor;
            strategyApplied = RULE_STRATEGY_NODES.CUSTOM_RULE_APPLIED;
          }
        }
      }

      // 2. If no custom rule applied, proceed with other routing logic
      if (!chosenProcessor) {
        // Hard Elimination: Incident-down or Base SR < 50%
        let level1EligibleProcessors = candidateProcessors.filter(proc => {
          const incidentEndTime = processorIncidents[proc.id];
          const isIncidentActive = incidentEndTime !== null && Date.now() < incidentEndTime;
          const isBaseSrTooLow = (inputProcessorConfigs[proc.id]?.sr ?? 0) < 50;
          return !isIncidentActive && !isBaseSrTooLow;
        });

        if (level1EligibleProcessors.length < candidateProcessors.length && level1EligibleProcessors.length > 0) {
            // strategyApplied = RULE_STRATEGY_NODES.ELIMINATION_APPLIED; // Note: this gets refined by smart/standard
        }
        
        const useIntelligentRouting = Math.random() * 100 < volumeSplit;

        if (useIntelligentRouting && level1EligibleProcessors.length > 0) {
          strategyApplied = RULE_STRATEGY_NODES.SMART_ROUTING;
          const processorPerformances: Array<{ processor: Processor; recentSr: number; isDynamicallyBlocked: boolean }> = [];

          for (const proc of level1EligibleProcessors) {
            const history = processorTransactionHistoryRef.current[proc.id] || [];
            let recentSr = -1; // Default: insufficient data
            let failureCountInWindow = 0;

            // Consider history only if it meets minAggregatesSize, otherwise treat as insufficient for SR calc
            if (history.length >= minAggregatesSize) {
              const relevantHistory = history.slice(-maxAggregatesSize);
              const successesInRelevantHistory = relevantHistory.filter(r => r === 1).length;
              recentSr = (successesInRelevantHistory / relevantHistory.length) * 100;
              failureCountInWindow = relevantHistory.length - successesInRelevantHistory;
            } else if (history.length > 0) { // Some history, but less than minAggregatesSize
                const successesInHistory = history.filter(r => r === 1).length;
                // Could use this partial SR, or still treat as -1. Let's use it cautiously.
                // recentSr = (successesInHistory / history.length) * 100; 
                failureCountInWindow = history.length - successesInHistory; 
            }


            const isDynamicallyBlocked = (failureCountInWindow >= currentBlockThresholdMaxTotalCount && currentBlockThresholdMaxTotalCount > 0);
            processorPerformances.push({ processor: proc, recentSr, isDynamicallyBlocked });
          }
          
          const intelligentlyRoutableProcessors = processorPerformances.filter(p => !p.isDynamicallyBlocked);

          if (intelligentlyRoutableProcessors.length > 0) {
            intelligentlyRoutableProcessors.sort((a, b) => { // Higher recentSR is better
              if (a.recentSr === -1 && b.recentSr === -1) return 0; // Keep original order if both no data
              if (a.recentSr === -1) return 1; // No data for a, b is better
              if (b.recentSr === -1) return -1; // No data for b, a is better
              return b.recentSr - a.recentSr; // Sort by SR descending
            });
            chosenProcessor = intelligentlyRoutableProcessors[0].processor;
            // If chosen processor had recentSr === -1, it means all had insufficient data.
            // The strategy is still "SMART_ROUTING" because this path was taken.
          }
        }

        // Fallback to Standard Routing (if no custom rule, and intelligent routing not used or yielded no choice)
        if (!chosenProcessor && level1EligibleProcessors.length > 0) {
          strategyApplied = RULE_STRATEGY_NODES.STANDARD_ROUTING;
          // Sort by pre-calculated mean effective SR (base SR + incident penalty)
          level1EligibleProcessors.sort((a, b) => processorMeanEffectiveSRs[b.id] - processorMeanEffectiveSRs[a.id]);
          chosenProcessor = level1EligibleProcessors[0];
        }
      }


      // Transaction Outcome
      if (chosenProcessor) {
        accumulatedProcessorStatsRef.current[chosenProcessor.id].volumeShareRaw++;
        attemptsThisBatch[chosenProcessor.id] = (attemptsThisBatch[chosenProcessor.id] || 0) + 1;

        const baseSrPercent = inputProcessorConfigs[chosenProcessor.id]?.sr ?? 85;
        const deviationPercentagePoints = inputProcessorConfigs[chosenProcessor.id]?.srDeviation ?? 0;
        const randomDeviationFactor = (Math.random() * 2 - 1); 
        let srForThisTxn = baseSrPercent + (randomDeviationFactor * deviationPercentagePoints);

        const incidentEndTime = processorIncidents[chosenProcessor.id];
        const isIncidentActive = incidentEndTime !== null && Date.now() < incidentEndTime;
        if (isIncidentActive) {
          srForThisTxn *= 0.1; 
        }
        srForThisTxn = Math.max(0, Math.min(100, srForThisTxn));
        
        const success = Math.random() < (srForThisTxn / 100.0);

        // Update transaction history for the chosen processor
        processorTransactionHistoryRef.current[chosenProcessor.id].push(success ? 1 : 0);
        if (processorTransactionHistoryRef.current[chosenProcessor.id].length > maxAggregatesSize) {
          processorTransactionHistoryRef.current[chosenProcessor.id].shift(); // Keep history capped
        }

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
        strategyApplied = RULE_STRATEGY_NODES.NO_ROUTE_FOUND;
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
        sr: inputProcessorConfigs[proc.id]?.sr ?? 0, 
        srDeviation: inputProcessorConfigs[proc.id]?.srDeviation ?? 0,
        volumeShare: parseFloat(procVolumeShare.toFixed(2)) || 0,
        failureRate: parseFloat((100 - procSR_cumulative_observed).toFixed(2)) || 0, 
      };
    });
    
    const currentSuccessRateDataPoint: TimeSeriesDataPoint = { time: newTimeStep };
    PROCESSORS.forEach(proc => {
      const successfulInBatch = successesThisBatch[proc.id] || 0;
      const attemptedInBatch = attemptsThisBatch[proc.id] || 0;
      currentSuccessRateDataPoint[proc.id] = attemptedInBatch > 0 ? parseFloat(((successfulInBatch / attemptedInBatch) * 100).toFixed(2)) : 0;
    });
    setSuccessRateHistory(prev => [...prev, currentSuccessRateDataPoint]);
        
    const currentVolumeDataPoint: TimeSeriesDataPoint = { time: newTimeStep };
    PROCESSORS.forEach(proc => {
      currentVolumeDataPoint[proc.id] = accumulatedProcessorStatsRef.current[proc.id].volumeShareRaw; 
    });
    setVolumeHistory(prev => [...prev, currentVolumeDataPoint]);

    const currentOverallSRDataPoint: OverallSRHistoryDataPoint = { time: newTimeStep, overallSR: parseFloat(overallSR.toFixed(2)) || 0 };
    setOverallSuccessRateHistory(prev => [...prev, currentOverallSRDataPoint]);

    setCurrentControls(prevControls => {
       if (!prevControls) return null;
       return {
        ...prevControls, 
        overallSuccessRate: parseFloat(overallSR.toFixed(2)) || 0,
        tps: effectiveTps, 
        processorWiseSuccessRates: updatedProcessorSRsUi, 
       }
    });

  }, [currentControls, simulationTimeStep, processedPaymentsCount, toast, generateAndSetSummary]);

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

    