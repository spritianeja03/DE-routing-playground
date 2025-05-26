"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { BottomControlsPanel, type FormValues } from '@/components/BottomControlsPanel';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { StatsView } from '@/components/StatsView';
import { AnalyticsGraphsView } from '@/components/AnalyticsGraphsView';
// import { ProcessorsTabView } from '@/components/ProcessorsTabView'; // Tab removed
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
// import { BrainCircuit, Loader2 } from 'lucide-react'; // AI Summary Removed
import type { PaymentMethod, ProcessorMetricsHistory, StructuredRule, ControlsState, OverallSRHistory, /*AISummaryInput, AISummaryProcessorMetric, AISummaryIncident,*/ OverallSRHistoryDataPoint, TimeSeriesDataPoint, MerchantConnector } from '@/lib/types';
import { PAYMENT_METHODS, /*RULE_STRATEGY_NODES*/ } from '@/lib/constants'; // RULE_STRATEGY_NODES removed
import { useToast } from '@/hooks/use-toast';
// import { summarizeSimulation } from '@/ai/flows/summarize-simulation-flow'; // AI Summary Removed

const SIMULATION_INTERVAL_MS = 1000; // Interval between individual payment processing attempts

export default function HomePage() {
  const [currentControls, setCurrentControls] = useState<FormValues | null>(null);
  const [simulationState, setSimulationState] = useState<'idle' | 'running' | 'paused'>('idle');
  const [processedPaymentsCount, setProcessedPaymentsCount] = useState<number>(0);

  const [successRateHistory, setSuccessRateHistory] = useState<ProcessorMetricsHistory>([]);
  const [volumeHistory, setVolumeHistory] = useState<ProcessorMetricsHistory>([]);
  const [overallSuccessRateHistory, setOverallSuccessRateHistory] = useState<OverallSRHistory>([]);
  
  const [isApiCredentialsModalOpen, setIsApiCredentialsModalOpen] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>('');
  const [profileId, setProfileId] = useState<string>('');
  const [merchantId, setMerchantId] = useState<string>(''); 

  const [merchantConnectors, setMerchantConnectors] = useState<MerchantConnector[]>([]);
  const [connectorToggleStates, setConnectorToggleStates] = useState<Record<string, boolean>>({});
  const [isLoadingMerchantConnectors, setIsLoadingMerchantConnectors] = useState<boolean>(false);

  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const apiCallAbortControllerRef = useRef<AbortController | null>(null);
  const isStoppingRef = useRef(false);
  const isProcessingBatchRef = useRef(false);
  
  const accumulatedProcessorStatsRef = useRef<Record<string, { successful: number; failed: number; volumeShareRaw: number }>>({});
  const accumulatedGlobalStatsRef = useRef<{ totalSuccessful: number; totalFailed: number }>({ totalSuccessful: 0, totalFailed: 0 });

  const { toast } = useToast();

  useEffect(() => {
    if (!apiKey && !profileId && !merchantId) {
      setIsApiCredentialsModalOpen(true);
    }
  }, [apiKey, profileId, merchantId]);

  const handleControlsChange = useCallback((data: FormValues) => {
    setCurrentControls(prev => {
      const existingOverallSuccessRate = prev ? prev.overallSuccessRate : 0;
      return {
        ...(prev || {}), 
        ...data,
        overallSuccessRate: data.overallSuccessRate !== undefined ? data.overallSuccessRate : existingOverallSuccessRate,
      };
    });
  }, []);

  const fetchMerchantConnectors = async (currentMerchantId: string, currentApiKey: string): Promise<MerchantConnector[]> => {
    console.log("fetchMerchantConnectors called with Merchant ID:", currentMerchantId);
    if (!currentMerchantId || !currentApiKey) {
      toast({ title: "Error", description: "Merchant ID and API Key are required to fetch connectors.", variant: "destructive" });
      return [];
    }
    setIsLoadingMerchantConnectors(true);
    try {
      if (!profileId) {
        toast({ title: "Error", description: "Profile ID is missing. Cannot fetch connectors.", variant: "destructive" });
        setIsLoadingMerchantConnectors(false);
        return [];
      }
      const response = await fetch(`https://integ-api.hyperswitch.io/account/${currentMerchantId}/profile/connectors`, {
        method: 'GET', 
        headers: { 'api-key': currentApiKey, 'x-profile-id': profileId },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to fetch connectors, unknown error." }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const connectorsData: MerchantConnector[] = await response.json();
      
      setMerchantConnectors(connectorsData || []);
      
      const initialToggleStates: Record<string, boolean> = {};
      const initialProcessorWiseSuccessRates: ControlsState['processorWiseSuccessRates'] = {};
      const initialProcessorIncidents: ControlsState['processorIncidents'] = {};
      const initialProcessorMatrix: FormValues['processorMatrix'] = {};

      (connectorsData || []).forEach((connector) => {
        const key = connector.merchant_connector_id || connector.connector_name;
        if (key) {
          initialToggleStates[key] = !(connector.disabled === true); 
          initialProcessorWiseSuccessRates[key] = { sr: 0, srDeviation: 0, volumeShare: 0, successfulPaymentCount: 0, totalPaymentCount: 0 };
          initialProcessorIncidents[key] = null;
          initialProcessorMatrix[key] = PAYMENT_METHODS.reduce((acc, method) => {
            acc[method] = false; return acc;
          }, {} as Record<PaymentMethod, boolean>);
        }
      });
      setConnectorToggleStates(initialToggleStates);
      
      setCurrentControls(prev => {
        const base = prev ? {...prev} : {
            totalPayments: 1000, 
            selectedPaymentMethods: [...PAYMENT_METHODS],
            structuredRule: null, 
            minAggregatesSize: 100, 
            maxAggregatesSize: 1000,
            defaultSuccessRate: 90,
            currentBlockThresholdDurationInMins: 5,
            currentBlockThresholdMaxTotalCount: 10, 
            processorMatrix: {}, 
            processorIncidents: {}, 
            processorWiseSuccessRates: {},
        } as FormValues; 

        return {
            ...base,
            processorWiseSuccessRates: initialProcessorWiseSuccessRates,
            processorIncidents: initialProcessorIncidents,
            processorMatrix: initialProcessorMatrix,
            overallSuccessRate: base.overallSuccessRate || 0,
        };
      });

      toast({ title: "Success", description: "Merchant connectors fetched." });
      return connectorsData || [];
    } catch (error: any) {
      console.error("Error fetching merchant connectors:", error);
      setMerchantConnectors([]); 
      setConnectorToggleStates({});
      toast({ title: "Failed to Fetch Connectors", description: error.message || "Could not retrieve connector list.", variant: "destructive" });
      return [];
    } finally {
      setIsLoadingMerchantConnectors(false);
    }
  };
  
  const handleConnectorToggleChange = async (connectorId: string, newState: boolean) => {
    const originalState = connectorToggleStates[connectorId];
    setConnectorToggleStates(prev => ({ ...prev, [connectorId]: newState }));

    if (!merchantId || !apiKey) {
      toast({ title: "API Credentials Missing", description: "Cannot update connector status.", variant: "destructive" });
      setConnectorToggleStates(prev => ({ ...prev, [connectorId]: originalState }));
      return;
    }

    const connectorToUpdate = merchantConnectors.find(c => (c.merchant_connector_id || c.connector_name) === connectorId);
    const connectorTypeForAPI = connectorToUpdate?.connector_type || "payment_processor";

    try {
      const response = await fetch(`https://integ-api.hyperswitch.io/account/${merchantId}/connectors/${connectorId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'api-key': apiKey },
        body: JSON.stringify({ connector_type: connectorTypeForAPI, disabled: !newState }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to update." }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      toast({ title: "Connector Status Updated", description: `Connector ${connectorId} ${newState ? 'enabled' : 'disabled'}.` });
    } catch (error: any) {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
      setConnectorToggleStates(prev => ({ ...prev, [connectorId]: originalState }));
    }
  };
  
  const handleApiCredentialsSubmit = () => {
    if (!apiKey || !profileId || !merchantId) { 
      toast({ title: "API Credentials Required", description: "Please enter all API credentials.", variant: "destructive" });
      return;
    }
    setIsApiCredentialsModalOpen(false);
    fetchMerchantConnectors(merchantId, apiKey); 
  };

  const resetSimulationState = () => {
    setProcessedPaymentsCount(0);
    setSuccessRateHistory([]);
    setVolumeHistory([]);
    setOverallSuccessRateHistory([]);
    isStoppingRef.current = false;
    accumulatedProcessorStatsRef.current = {}; 
    accumulatedGlobalStatsRef.current = { totalSuccessful: 0, totalFailed: 0 };

    setCurrentControls(prev => {
      if (!prev) { 
        return {
          totalPayments: 1000, selectedPaymentMethods: [...PAYMENT_METHODS], processorMatrix: {}, 
          processorIncidents: {}, overallSuccessRate: 0, processorWiseSuccessRates: {}, 
          structuredRule: null, minAggregatesSize: 100, maxAggregatesSize: 1000,
          defaultSuccessRate: 90, currentBlockThresholdDurationInMins: 5, 
          currentBlockThresholdMaxTotalCount: 10,
        } as FormValues;
      }
      const newPwsr: ControlsState['processorWiseSuccessRates'] = {};
      Object.keys(prev.processorWiseSuccessRates).forEach(procId => {
        newPwsr[procId] = { 
          ...(prev.processorWiseSuccessRates[procId] || { sr: 0, srDeviation: 0 }), 
          volumeShare: 0, successfulPaymentCount: 0, totalPaymentCount: 0 
        };
      });
      return { ...prev, overallSuccessRate: 0, processorWiseSuccessRates: newPwsr };
    });
  };

  const processTransactionBatch = useCallback(async () => {
    console.log(
      `PTB ENTRY: processed=${processedPaymentsCount}, total=${currentControls?.totalPayments}, stop=${isStoppingRef.current}, state=${simulationState}, proc=${isProcessingBatchRef.current}`
    );

    if (isStoppingRef.current || simulationState !== 'running') return;
    if (isProcessingBatchRef.current) return;
    
    isProcessingBatchRef.current = true;

    try {
      if (!currentControls || !apiKey || !profileId || !merchantId) {
        if (simulationState === 'running') {
          isStoppingRef.current = true;
          setSimulationState('paused');
          setIsApiCredentialsModalOpen(true);
          toast({ title: "Credentials Missing", description: "Enter API Key, Profile ID, and Merchant ID.", variant: "destructive"});
        }
        return;
      }

      if (processedPaymentsCount >= currentControls.totalPayments) {
          if (!isStoppingRef.current) {
            console.log("PTB: Target reached (early check), stopping.");
            isStoppingRef.current = true;
            setSimulationState('idle');
            toast({ title: "Simulation Completed", description: `All ${currentControls.totalPayments} payments processed.`, duration: 5000 });
          }
          return;
      }

      apiCallAbortControllerRef.current = new AbortController();
      const { signal } = apiCallAbortControllerRef.current;
      const paymentsToProcessInBatch = 1;
      let paymentsProcessedThisBatch = 0;

      for (let i = 0; i < paymentsToProcessInBatch && (processedPaymentsCount + paymentsProcessedThisBatch) < currentControls.totalPayments; i++) {
        if (isStoppingRef.current || signal.aborted) break; 
        
        const paymentMethodForAPI = "card";
        let cardDetailsToUse;
        const randomNumber = Math.random() * 100;
        if (currentControls.failurePercentage !== undefined && randomNumber < currentControls.failurePercentage) {
          cardDetailsToUse = {
            card_number: currentControls.failureCardNumber || "4000000000000000", card_exp_month: currentControls.failureCardExpMonth || "12",
            card_exp_year: currentControls.failureCardExpYear || "26", card_holder_name: currentControls.failureCardHolderName || "Jane Roe",
            card_cvc: currentControls.failureCardCvc || "999",
          };
        } else {
          cardDetailsToUse = {
            card_number: currentControls.successCardNumber || "4242424242424242", card_exp_month: currentControls.successCardExpMonth || "10",
            card_exp_year: currentControls.successCardExpYear || "25", card_holder_name: currentControls.successCardHolderName || "Joseph Doe",
            card_cvc: currentControls.successCardCvc || "123",
          };
        }

        const paymentData = {
          amount: 6540, currency: "USD", confirm: true, profile_id: profileId, capture_method: "automatic",
          authentication_type: "no_three_ds",
          customer: { id: `cus_sim_${Date.now()}_${i}`, name: "John Doe", email: "customer@example.com", phone: "9999999999", phone_country_code: "+1" },
          payment_method: paymentMethodForAPI, payment_method_type: "credit",
          payment_method_data: { card: cardDetailsToUse, billing: {
              address: { line1: "1467", line2: "Harrison Street", line3: "Harrison Street", city: "San Francisco", state: "California", zip: "94122", country: "US", first_name: "Joseph", last_name: "Doe" },
              phone: { number: "8056594427", country_code: "+91" }, email: "guest@example.com"
          }}
        };

        let isSuccess = false;
        let routedProcessorId: string | null = null;

        try {
          console.log(`PTB: Making API call #${processedPaymentsCount + paymentsProcessedThisBatch + 1}`);
          const response = await fetch('https://integ-api.hyperswitch.io/payments', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'api-key': apiKey },
            body: JSON.stringify(paymentData), signal,
          });
          const responseData = await response.json();
          isSuccess = response.ok && (responseData.status === 'succeeded' || responseData.status === 'requires_capture' || responseData.status === 'processing');
          if (!isSuccess) console.warn("Payment API call failed:", responseData);
          
          if (responseData.connector_label) {
              const mc = merchantConnectors.find(m => m.connector_label === responseData.connector_label || m.connector_name === responseData.connector_label);
              if (mc) routedProcessorId = mc.merchant_connector_id || mc.connector_name;
          } else if (responseData.merchant_connector_id) {
               routedProcessorId = responseData.merchant_connector_id;
          } else if (responseData.attempts && responseData.attempts.length > 0 && responseData.attempts[0].connector) {
              const mc = merchantConnectors.find(m => m.connector_label === responseData.attempts[0].connector || m.connector_name === responseData.attempts[0].connector);
              routedProcessorId = mc ? (mc.merchant_connector_id || mc.connector_name) : responseData.attempts[0].connector;
          }

          if (!routedProcessorId) {
              const activeConnectors = merchantConnectors.filter(mc => connectorToggleStates[mc.merchant_connector_id || mc.connector_name]);
              if (activeConnectors.length === 1) routedProcessorId = activeConnectors[0].merchant_connector_id || activeConnectors[0].connector_name;
              else console.warn("Could not determine processor from API response.");
          }
        } catch (error: any) {
          isSuccess = false;
          if (error.name === 'AbortError') break;
          else console.error("Error during payment API call:", error);
        }

        if (!isStoppingRef.current && !signal.aborted) { 
          if (routedProcessorId) {
              if (!accumulatedProcessorStatsRef.current[routedProcessorId]) {
                  accumulatedProcessorStatsRef.current[routedProcessorId] = { successful: 0, failed: 0, volumeShareRaw: 0 };
              }
              if (isSuccess) accumulatedProcessorStatsRef.current[routedProcessorId].successful++;
              else accumulatedProcessorStatsRef.current[routedProcessorId].failed++;
          }
          if (isSuccess) accumulatedGlobalStatsRef.current.totalSuccessful++;
          else accumulatedGlobalStatsRef.current.totalFailed++;
          paymentsProcessedThisBatch++;
        }
      } 
      
      if (paymentsProcessedThisBatch > 0) { 
          setProcessedPaymentsCount(prev => {
              const newTotalProcessed = prev + paymentsProcessedThisBatch;
              if (currentControls && newTotalProcessed >= currentControls.totalPayments && !isStoppingRef.current) {
                  console.log("PTB: Target reached in setProcessedPaymentsCount, setting to idle.");
                  isStoppingRef.current = true; 
                  setSimulationState('idle');
                  toast({ title: "Simulation Completed", description: `All ${currentControls.totalPayments} payments processed.`, duration: 5000 });
              }
              return newTotalProcessed;
          });

          if (currentControls) { // Update stats regardless of stopping, if payments were processed
              const currentTime = Date.now();
              const newSuccessRateDataPoint: TimeSeriesDataPoint = { time: currentTime };
              const newVolumeDataPoint: TimeSeriesDataPoint = { time: currentTime };
          
              merchantConnectors.forEach(connector => {
                const key = connector.merchant_connector_id || connector.connector_name;
                const stats = accumulatedProcessorStatsRef.current[key] || { successful: 0, failed: 0 };
                const totalForProcessor = stats.successful + stats.failed;
                newSuccessRateDataPoint[key] = totalForProcessor > 0 ? (stats.successful / totalForProcessor) * 100 : 0;
                newVolumeDataPoint[key] = totalForProcessor;
              });

              setSuccessRateHistory(prev => [...prev, newSuccessRateDataPoint]);
              setVolumeHistory(prev => [...prev, newVolumeDataPoint]);

              const totalProcessedOverall = accumulatedGlobalStatsRef.current.totalSuccessful + accumulatedGlobalStatsRef.current.totalFailed;
              const currentOverallSR = totalProcessedOverall > 0 ? (accumulatedGlobalStatsRef.current.totalSuccessful / totalProcessedOverall) * 100 : 0;
              setOverallSuccessRateHistory(prev => [...prev, { time: currentTime, overallSR: currentOverallSR }]);
              
              setCurrentControls(prevControls => {
                  if (!prevControls) return prevControls;
                  const newPwsr = { ...prevControls.processorWiseSuccessRates };
                  let totalVolumeAcrossProcessors = 0;
                  
                  const allProcessorKeys = new Set([...Object.keys(newPwsr), ...merchantConnectors.map(mc => mc.merchant_connector_id || mc.connector_name), ...Object.keys(accumulatedProcessorStatsRef.current)]);

                  allProcessorKeys.forEach(procId => {
                      if (!newPwsr[procId]) { 
                          const connectorInfo = merchantConnectors.find(mc => (mc.merchant_connector_id || mc.connector_name) === procId);
                          newPwsr[procId] = { 
                              sr: connectorInfo ? (prevControls.processorWiseSuccessRates[procId]?.sr || 0) : 0, 
                              srDeviation: prevControls.processorWiseSuccessRates[procId]?.srDeviation || 0, 
                              volumeShare: 0, successfulPaymentCount: 0, totalPaymentCount: 0
                          }; 
                      }
                      const stats = accumulatedProcessorStatsRef.current[procId] || { successful: 0, failed: 0 };
                      totalVolumeAcrossProcessors += (stats.successful + stats.failed);
                  });

                  allProcessorKeys.forEach(procId => {
                      const currentProcessorStats = accumulatedProcessorStatsRef.current[procId] || { successful: 0, failed: 0 };
                      const currentTotalForProcessor = currentProcessorStats.successful + currentProcessorStats.failed;
                      newPwsr[procId] = {
                          ...(newPwsr[procId] || { sr:0, srDeviation:0, volumeShare:0, successfulPaymentCount:0, totalPaymentCount:0 }),
                          successfulPaymentCount: currentProcessorStats.successful,
                          totalPaymentCount: currentTotalForProcessor,
                          volumeShare: totalVolumeAcrossProcessors > 0 ? (currentTotalForProcessor / totalVolumeAcrossProcessors) * 100 : 0,
                      };
                  });
                  return { ...prevControls, processorWiseSuccessRates: newPwsr, overallSuccessRate: currentOverallSR };
              });
          }
      }
    } catch (error) { 
        console.error("Unexpected error in processTransactionBatch:", error);
    } finally { 
        isProcessingBatchRef.current = false;
        console.log("PTB EXIT: isProcessingBatchRef set to false.");
    }
  }, [
    currentControls, simulationState, apiKey, profileId, merchantId, merchantConnectors, connectorToggleStates,
    processedPaymentsCount, setProcessedPaymentsCount, setSuccessRateHistory, setVolumeHistory, 
    setOverallSuccessRateHistory, setSimulationState, setCurrentControls, toast
  ]);

  useEffect(() => {
    if (simulationState === 'running' && !isProcessingBatchRef.current) { 
      simulationIntervalRef.current = setInterval(() => {
        if (!isProcessingBatchRef.current) { 
             processTransactionBatch();
        }
      }, SIMULATION_INTERVAL_MS);
    } else {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
      if (apiCallAbortControllerRef.current) {
        apiCallAbortControllerRef.current.abort();
        apiCallAbortControllerRef.current = null;
      }
    }
    return () => {
      if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
      if (apiCallAbortControllerRef.current) apiCallAbortControllerRef.current.abort();
    };
  }, [simulationState, processTransactionBatch]);

  const handleStartSimulation = useCallback(async (forceStart = false) => {
    if (!apiKey || !profileId || !merchantId) { 
      setIsApiCredentialsModalOpen(true);
      return;
    }
    
    if (forceStart || merchantConnectors.length === 0) {
      const connectors = await fetchMerchantConnectors(merchantId, apiKey);
      if (connectors.length === 0 && !forceStart) {
        toast({ title: "Error", description: "Failed to fetch merchant connectors.", variant: "destructive" });
        return;
      }
    }
    
    if (!currentControls && merchantConnectors.length > 0) {
        const initialPwsr: ControlsState['processorWiseSuccessRates'] = {};
        const initialPi: ControlsState['processorIncidents'] = {};
        const initialPm: FormValues['processorMatrix'] = {};
        merchantConnectors.forEach(c => {
            const key = c.merchant_connector_id || c.connector_name;
            initialPwsr[key] = { sr: 0, srDeviation: 0, volumeShare: 0, successfulPaymentCount: 0, totalPaymentCount: 0 };
            initialPi[key] = null;
            initialPm[key] = PAYMENT_METHODS.reduce((acc, m) => { acc[m] = false; return acc; }, {} as Record<PaymentMethod, boolean>);
        });
        setCurrentControls({
            totalPayments: 1000, selectedPaymentMethods: [...PAYMENT_METHODS], processorMatrix: initialPm, 
            structuredRule: null, processorIncidents: initialPi, overallSuccessRate: 0,
            processorWiseSuccessRates: initialPwsr, minAggregatesSize: 100, maxAggregatesSize: 1000,
            defaultSuccessRate: 90, currentBlockThresholdDurationInMins: 5, currentBlockThresholdMaxTotalCount: 10,
        });
    } else if (!currentControls) {
         toast({ title: "Error", description: "Control data not available.", variant: "destructive" });
         return;
    }

    if (simulationState === 'idle' || forceStart) resetSimulationState(); 
    isStoppingRef.current = false; 
    isProcessingBatchRef.current = false; 
    setSimulationState('running');
    toast({ title: `Simulation ${simulationState === 'idle' || forceStart ? 'Started' : 'Resumed'}`, description: `Processing ${currentControls?.totalPayments || 0} payments.` });
  }, [currentControls, apiKey, profileId, merchantId, merchantConnectors, toast, simulationState]);

  const handlePauseSimulation = useCallback(() => {
    if (simulationState === 'running') {
      isStoppingRef.current = true; 
      setSimulationState('paused');
      if (apiCallAbortControllerRef.current) apiCallAbortControllerRef.current.abort();
      toast({ title: "Simulation Paused" });
    }
  }, [simulationState, toast]);

  const handleStopSimulation = useCallback(() => {
    if (simulationState !== 'idle') {
      isStoppingRef.current = true;
      setSimulationState('idle');
      if (apiCallAbortControllerRef.current) apiCallAbortControllerRef.current.abort();
      toast({ title: "Simulation Stopped", description: `Processed ${processedPaymentsCount} payments.` });
    }
  }, [simulationState, processedPaymentsCount, toast]);

  const [activeTab, _setActiveTab] = useState("stats");
  const setActiveTab = (newTab: string) => _setActiveTab(newTab);

  return (
    <>
      <AppLayout>
        <Tabs defaultValue="stats" value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-grow overflow-hidden">
          <Header
            activeTab={activeTab} onTabChange={setActiveTab}
            onStartSimulation={handleStartSimulation} onPauseSimulation={handlePauseSimulation}
            onStopSimulation={handleStopSimulation} simulationState={simulationState}
          />
          <div className="flex-grow overflow-hidden p-0">
            <TabsContent value="stats" className="h-full mt-0 data-[state=active]:flex data-[state=active]:flex-col">
              <ScrollArea className="h-full">
                 <div className="p-2 md:p-4 lg:p-6">
                    <StatsView
                      currentControls={currentControls} merchantConnectors={merchantConnectors} 
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
                      successRateHistory={successRateHistory} volumeHistory={volumeHistory}
                      merchantConnectors={merchantConnectors} connectorToggleStates={connectorToggleStates}
                    />
                  </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      </AppLayout>
      <BottomControlsPanel
        onFormChange={handleControlsChange} merchantConnectors={merchantConnectors}
        connectorToggleStates={connectorToggleStates} onConnectorToggleChange={handleConnectorToggleChange}
        apiKey={apiKey} profileId={profileId} merchantId={merchantId}
      />
      <Dialog open={isApiCredentialsModalOpen} onOpenChange={setIsApiCredentialsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>API Credentials</DialogTitle></DialogHeader>
          <div className="py-4 space-y-4">
            <div><Label htmlFor="apiKey">API Key</Label><Input id="apiKey" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Enter API Key" /></div>
            <div><Label htmlFor="profileId">Profile ID</Label><Input id="profileId" type="text" value={profileId} onChange={(e) => setProfileId(e.target.value)} placeholder="Enter Profile ID"/></div>
            <div><Label htmlFor="merchantId">Merchant ID</Label><Input id="merchantId" type="text" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} placeholder="Enter Merchant ID"/></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsApiCredentialsModalOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleApiCredentialsSubmit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
