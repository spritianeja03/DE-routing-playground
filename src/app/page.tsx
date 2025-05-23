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
import { ProcessorsTabView } from '@/components/ProcessorsTabView';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BrainCircuit, Loader2 } from 'lucide-react';
import type { PaymentMethod, ProcessorMetricsHistory, StructuredRule, ControlsState, OverallSRHistory, AISummaryInput, AISummaryProcessorMetric, AISummaryIncident, OverallSRHistoryDataPoint, TimeSeriesDataPoint, MerchantConnector } from '@/lib/types';
import { PAYMENT_METHODS, RULE_STRATEGY_NODES } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import { summarizeSimulation } from '@/ai/flows/summarize-simulation-flow';

const SIMULATION_INTERVAL_MS = 1000;

export default function HomePage() {
  const [currentControls, setCurrentControls] = useState<FormValues | null>(null);
  const [simulationState, setSimulationState] = useState<'idle' | 'running' | 'paused'>('idle');
  const [processedPaymentsCount, setProcessedPaymentsCount] = useState<number>(0);
  // const [simulationTimeStep, setSimulationTimeStep] = useState<number>(0); // Replaced by Date.now() for history

  const [successRateHistory, setSuccessRateHistory] = useState<ProcessorMetricsHistory>([]);
  const [volumeHistory, setVolumeHistory] = useState<ProcessorMetricsHistory>([]);
  const [overallSuccessRateHistory, setOverallSuccessRateHistory] = useState<OverallSRHistory>([]);
  
  // const [simulationSummary, setSimulationSummary] = useState<string | null>(null); // AI Summary Removed
  // const [isGeneratingSummary, setIsGeneratingSummary] = useState<boolean>(false); // AI Summary Removed
  // const [isSummaryModalOpen, setIsSummaryModalOpen] = useState<boolean>(false); // AI Summary Removed
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
  
  const accumulatedProcessorStatsRef = useRef<Record<string, { successful: number; failed: number; volumeShareRaw: number }>>({});
  const accumulatedGlobalStatsRef = useRef<{ totalSuccessful: number; totalFailed: number }>({ totalSuccessful: 0, totalFailed: 0 });
  const processedAttemptNumbersRef = useRef(new Set<number>());
  const processorTransactionHistoryRef = useRef<Record<string, Array<0 | 1>>>({});

  const { toast } = useToast();

  // Effect to open modal on initial load if credentials are not set
  useEffect(() => {
    if (!apiKey && !profileId && !merchantId) {
      setIsApiCredentialsModalOpen(true);
    }
  }, []); // Empty dependency array ensures this runs only once on mount

  const handleControlsChange = useCallback((data: FormValues) => {
    setCurrentControls(prev => {
      // data from BottomControlsPanel does not include overallSuccessRate
      // Preserve existing overallSuccessRate if prev state exists
      const existingOverallSuccessRate = prev ? prev.overallSuccessRate : 0;
      return {
        ...(prev || {}), // Spread previous state to keep other potentially managed fields
        ...data,         // Apply new data from form
        overallSuccessRate: data.overallSuccessRate !== undefined ? data.overallSuccessRate : existingOverallSuccessRate, // Prioritize data's OSR if present, else keep existing
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
      // Ensure profileId from state is used, as currentProfileId is not a parameter
      if (!profileId) {
        toast({ title: "Error", description: "Profile ID is missing. Cannot fetch connectors.", variant: "destructive" });
        setIsLoadingMerchantConnectors(false);
        return [];
      }
      const response = await fetch(`https://integ-api.hyperswitch.io/account/${currentMerchantId}/profile/connectors`, {
        method: 'GET', 
        headers: {
          // 'Content-Type': 'application/json', // Not explicitly in new curl, can be omitted for GET
          'api-key': currentApiKey,
          'x-profile-id': profileId, // Use profileId from state
        },
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
          // Set toggle state based on the 'disabled' field from API
          // Connector is ON if 'disabled' is not explicitly true (i.e., false or undefined). Otherwise, OFF.
          initialToggleStates[key] = !(connector.disabled === true); 
          initialProcessorWiseSuccessRates[key] = { sr: 0, srDeviation: 0, volumeShare: 0, failureRate: 100 };
          initialProcessorIncidents[key] = null;
          initialProcessorMatrix[key] = PAYMENT_METHODS.reduce((acc, method) => {
            acc[method] = false; 
            return acc;
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
            defaultSuccessRate: 90, // Added default
            currentBlockThresholdDurationInMins: 5, // Added default
            currentBlockThresholdMaxTotalCount: 10, 
            // volumeSplit: 100, // Removed
            // Ensure all required fields for FormValues (excluding those coming from dynamic defaults) are present
            processorMatrix: {}, // Add default empty object
            processorIncidents: {}, // Add default empty object
            processorWiseSuccessRates: {}, // Add default empty object
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
      toast({
        title: "Failed to Fetch Connectors",
        description: error.message || "Could not retrieve connector list for the merchant.",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoadingMerchantConnectors(false);
    }
  };
  
  const handleConnectorToggleChange = async (connectorId: string, newState: boolean) => {
    console.log(`handleConnectorToggleChange called for connectorId: ${connectorId}, newState: ${newState}`);
    console.log(`Current merchantId: '${merchantId}', apiKey present: ${!!apiKey}`);

    const originalState = connectorToggleStates[connectorId];
    // Optimistic update
    setConnectorToggleStates(prev => ({ ...prev, [connectorId]: newState }));

    if (!merchantId || !apiKey) {
      console.error("Missing merchantId or apiKey. Aborting API call.");
      toast({
        title: "API Credentials Missing",
        description: "Cannot update connector status without Merchant ID and API Key.",
        variant: "destructive",
      });
      setConnectorToggleStates(prev => ({ ...prev, [connectorId]: originalState })); // Revert
      return;
    }

    console.log(`Proceeding with API call for connectorId: ${connectorId}`);
    // Find the specific connector to ensure we use its merchant_connector_id if available,
    // and potentially its connector_type if it's dynamic (though example hardcodes it).
    // The 'connectorId' passed should ideally be the merchant_connector_id.
    // For now, we assume 'connectorId' is the correct one for the URL.
    // The API endpoint uses the merchant_connector_id (e.g., mca_...).
    const connectorToUpdate = merchantConnectors.find(
      (c) => (c.merchant_connector_id || c.connector_name) === connectorId
    );

    const connectorTypeForAPI = connectorToUpdate?.connector_type || "payment_processor"; // Default if not found

    try {
      const response = await fetch(`https://integ-api.hyperswitch.io/account/${merchantId}/connectors/${connectorId}`, {
        method: 'POST', // As per curl --data, typically implies POST for updates to a specific resource ID in some APIs
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify({
          connector_type: connectorTypeForAPI, 
          disabled: !newState, // If toggle is ON (true), API disabled is false. If OFF (false), API disabled is true.
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to update connector status." }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      // const updatedConnectorData = await response.json(); // Contains the updated connector
      toast({
        title: "Connector Status Updated",
        description: `Connector ${connectorId} has been ${newState ? 'enabled' : 'disabled'}.`,
      });
      // Optionally, re-fetch all connectors or update the specific one in merchantConnectors state
      // For now, the optimistic update of connectorToggleStates is primary.
      // If the API returns the full updated connector, we could update it in the merchantConnectors array.
      // fetchMerchantConnectors(merchantId, apiKey); // Or re-fetch to ensure full consistency

    } catch (error: any) {
      console.error("Error updating connector status:", error);
      toast({
        title: "Update Failed",
        description: error.message || "Could not update connector status.",
        variant: "destructive",
      });
      // Revert optimistic update
      setConnectorToggleStates(prev => ({ ...prev, [connectorId]: originalState }));
    }
  };
  
  const handleApiCredentialsSubmit = () => {
    console.log("handleApiCredentialsSubmit called.");
    console.log("Inside submit - API Key:", apiKey);
    console.log("Inside submit - Profile ID:", profileId);
    console.log("Inside submit - Merchant ID:", merchantId);
    const credentialsMissing = !apiKey || !profileId || !merchantId;
    console.log("Inside submit - Are credentials missing?", credentialsMissing);

    if (credentialsMissing) { 
      toast({
        title: "API Credentials Required",
        description: "Please enter API Key, Profile ID, and Merchant ID.",
        variant: "destructive",
      });
      return;
    }
    // Validate credentials
    if (!apiKey || !profileId || !merchantId) {
      toast({
        title: "API Credentials Required",
        description: "Please enter API Key, Profile ID, and Merchant ID.",
        variant: "destructive",
      });
      // Keep modal open if validation fails
      setIsApiCredentialsModalOpen(true); 
      return;
    }
    // Credentials are valid, close modal and fetch connectors
    setIsApiCredentialsModalOpen(false);
    fetchMerchantConnectors(merchantId, apiKey); 
    // Do NOT start simulation here.
  };

  const resetSimulationState = () => {
    setProcessedPaymentsCount(0);
    // setSimulationTimeStep(0); // Removed
    setSuccessRateHistory([]);
    setVolumeHistory([]);
    setOverallSuccessRateHistory([]);
    // setSimulationSummary(null); // AI Summary Removed
    // setIsGeneratingSummary(false); // AI Summary Removed
    processedAttemptNumbersRef.current.clear();
    isStoppingRef.current = false; // Reset stopping flag
    
    accumulatedProcessorStatsRef.current = {}; 
    accumulatedGlobalStatsRef.current = { totalSuccessful: 0, totalFailed: 0 };
    processorTransactionHistoryRef.current = {}; 

    setCurrentControls(prev => {
      if (!prev) { 
        return {
          totalPayments: 1000, 
          selectedPaymentMethods: [...PAYMENT_METHODS],
          processorMatrix: {}, 
          processorIncidents: {}, 
          overallSuccessRate: 0,
          processorWiseSuccessRates: {}, 
          structuredRule: null,
          minAggregatesSize: 100, 
          maxAggregatesSize: 1000,
          defaultSuccessRate: 90, // Added default
          currentBlockThresholdDurationInMins: 5, // Added default
          currentBlockThresholdMaxTotalCount: 10, 
          // volumeSplit: 100, // Removed
        };
      }
      const newPwsr: ControlsState['processorWiseSuccessRates'] = {};
      Object.keys(prev.processorWiseSuccessRates).forEach(procId => {
        newPwsr[procId] = { ...prev.processorWiseSuccessRates[procId], volumeShare: 0, failureRate: 100 - prev.processorWiseSuccessRates[procId].sr };
      });
      return {
        ...prev, 
        overallSuccessRate: 0,
        processorWiseSuccessRates: newPwsr, 
      };
    });
  };

  // const generateAndSetSummary = useCallback(async () => { // AI Summary Removed
  //   if (!currentControls || processedPaymentsCount === 0) {
  //     toast({ title: "Summary Error", description: "Not enough data to generate summary.", variant: "destructive" });
  //     return;
  //   }
  //   setIsGeneratingSummary(true);
  //   try {
  //     const overallSRHistoryPoint = overallSuccessRateHistory.length > 0 ? overallSuccessRateHistory[overallSuccessRateHistory.length - 1].overallSR : (accumulatedGlobalStatsRef.current.totalSuccessful / (accumulatedGlobalStatsRef.current.totalSuccessful + accumulatedGlobalStatsRef.current.totalFailed) * 100) || 0;
      
  //     const processorMetrics: AISummaryProcessorMetric[] = merchantConnectors
  //       .map(connector => {
  //         const key = connector.merchant_connector_id || connector.connector_name;
  //         const stats = accumulatedProcessorStatsRef.current[key];
  //         const baseControls = currentControls.processorWiseSuccessRates[key]; // Base SR from UI
  //         if (!stats || !baseControls) return null;
  //         const volume = stats.successful + stats.failed;
  //         return {
  //           name: connector.connector_label || key,
  //           volume: volume,
  //           observedSr: volume > 0 ? (stats.successful / volume) * 100 : 0,
  //           baseSr: baseControls.sr, 
  //         };
  //       })
  //       .filter(Boolean) as AISummaryProcessorMetric[];

  //     const incidents: AISummaryIncident[] = merchantConnectors
  //       .map(connector => {
  //         const key = connector.merchant_connector_id || connector.connector_name;
  //         const incidentStatus = currentControls.processorIncidents[key];
  //         return {
  //           processorName: connector.connector_label || key,
  //           isActive: incidentStatus !== null && incidentStatus !== undefined,
  //         };
  //       })
  //       .filter(Boolean) as AISummaryIncident[];

  //     const summaryInput: AISummaryInput = {
  //       totalPaymentsProcessed: processedPaymentsCount,
  //       targetTotalPayments: currentControls.totalPayments,
  //       overallSuccessRate: parseFloat(overallSRHistoryPoint.toFixed(2)),
  //       totalSuccessful: accumulatedGlobalStatsRef.current.totalSuccessful,
  //       totalFailed: accumulatedGlobalStatsRef.current.totalFailed,
  //       effectiveTps: processedPaymentsCount > 0 && simulationTimeStep > 0 ? parseFloat((processedPaymentsCount / (simulationTimeStep * SIMULATION_INTERVAL_MS / 1000)).toFixed(2)) : 0,
  //       processorMetrics,
  //       incidents,
  //       simulationDurationSteps: simulationTimeStep,
  //     };
      
  //     const summaryResult = await summarizeSimulation(summaryInput);
  //     if (summaryResult && summaryResult.summaryText) {
  //       setSimulationSummary(summaryResult.summaryText);
  //       setIsSummaryModalOpen(true);
  //     } else {
  //        throw new Error("AI summary generation failed or returned empty.");
  //     }

  //   } catch (error: any) {
  //     console.error("Error generating simulation summary:", error);
  //     toast({ title: "Summary Generation Failed", description: error.message || "Could not generate summary.", variant: "destructive" });
  //     setSimulationSummary("Failed to generate summary.");
  //     setIsSummaryModalOpen(true);
  //   } finally {
  //     setIsGeneratingSummary(false);
  //   }
  // }, [processedPaymentsCount, currentControls, overallSuccessRateHistory, merchantConnectors, toast, simulationTimeStep]);

  const processTransactionBatch = useCallback(async () => {
    if (isStoppingRef.current || simulationState !== 'running') {
      return;
    }

    if (!currentControls || !apiKey || !profileId) {
      if (simulationState === 'running' && (!apiKey || !profileId)) { // simulationState check is fine here as it's about UI reaction
        isStoppingRef.current = true; // Also set stopping flag
        setSimulationState('paused');
        setIsApiCredentialsModalOpen(true);
        toast({ title: "API Credentials Missing", description: "Please enter API Key and Profile ID to continue simulation.", variant: "destructive"});
      }
      return;
    }

    // This initial check can stay as a quick bail-out, but the primary completion logic is now in setProcessedPaymentsCount
    if (processedPaymentsCount >= currentControls.totalPayments && !isStoppingRef.current) {
        isStoppingRef.current = true;
        setSimulationState('idle');
        // generateAndSetSummary(); // AI Summary Removed
        toast({ title: "Simulation Completed", description: `All ${currentControls.totalPayments} payments processed.`, duration: 5000 });
        return;
    }

    apiCallAbortControllerRef.current = new AbortController();
    const { signal } = apiCallAbortControllerRef.current;

    // const paymentsToProcessInBatch = Math.max(1, Math.floor((currentControls.tps * SIMULATION_INTERVAL_MS) / 1000)); // TPS Removed
    const paymentsToProcessInBatch = 1; // Process one payment per interval
    let paymentsProcessedThisBatch = 0;

    // The loop condition will now primarily be controlled by the outer logic ensuring totalPayments is not exceeded.
      // This loop will run once per processTransactionBatch call if paymentsToProcessInBatch is 1.
    for (let i = 0; i < paymentsToProcessInBatch && (processedPaymentsCount + paymentsProcessedThisBatch) < currentControls.totalPayments; i++) {
      if (isStoppingRef.current || signal.aborted) {
        console.log("Stopping batch processing due to stop signal or abort.");
        break; 
      }
      
      // const paymentMethod = currentControls.selectedPaymentMethods.length > 0 // Removed PM selection
      //   ? currentControls.selectedPaymentMethods[Math.floor(Math.random() * currentControls.selectedPaymentMethods.length)]
      //   : PAYMENT_METHODS[0];
      // Hardcode to "card" as it's the only option now
      const paymentMethodForAPI = "card";


      // Routing logic based on structuredRule needs to be re-evaluated or simplified
      // if selectedPaymentMethods is removed. For now, custom rule logic is effectively disabled
      // if it relied on specific payment method selection beyond "card".
      // If the rule condition is 'paymentMethod' and value is 'Card', it might still apply.
      // However, the UI for setting this rule might also need adjustment if PM selection is gone.
      // For now, the API call will use "card".

      // Determine whether to use success or failure card details
      let cardDetailsToUse;
      const randomNumber = Math.random() * 100; // Random number between 0 and 100
      if (currentControls.failurePercentage !== undefined && randomNumber < currentControls.failurePercentage) {
        // Use failure card details
        cardDetailsToUse = {
          card_number: currentControls.failureCardNumber || "4000000000000000", // Default if undefined
          card_exp_month: currentControls.failureCardExpMonth || "12",
          card_exp_year: currentControls.failureCardExpYear || "26",
          card_holder_name: currentControls.failureCardHolderName || "Jane Roe",
          card_cvc: currentControls.failureCardCvc || "999",
        };
      } else {
        // Use success card details
        cardDetailsToUse = {
          card_number: currentControls.successCardNumber || "4242424242424242", // Default if undefined
          card_exp_month: currentControls.successCardExpMonth || "10",
          card_exp_year: currentControls.successCardExpYear || "25",
          card_holder_name: currentControls.successCardHolderName || "Joseph Doe",
          card_cvc: currentControls.successCardCvc || "123",
        };
      }

      const paymentData = {
        amount: 6540,
        currency: "USD",
        confirm: true,
        profile_id: profileId, 
        capture_method: "automatic",
        authentication_type: "no_three_ds",
        customer: {
            id: `cus_KeACu4PaTX2V1SJU2Twg`, 
            name: "John Doe",
            email: "customer@example.com",
            phone: "9999999999",
            phone_country_code: "+1"
        },
        payment_method: paymentMethodForAPI, // Use hardcoded "card"
        payment_method_type: "credit", // Assuming credit for card
        payment_method_data: { 
            card: cardDetailsToUse,
            billing: {
                address: {
                    line1: "1467",
                    line2: "Harrison Street",
                    line3: "Harrison Street", // Added from curl example
                    city: "San Francisco",    // Corrected typo
                    state: "California",
                    zip: "94122",
                    country: "US",
                    first_name: "Joseph",   // Capitalized
                    last_name: "Doe"
                },
                phone: {
                    number: "8056594427",
                    country_code: "+91"
                },
                email: "guest@example.com"
            }
        }
      };

      let isSuccess = false;
      let routedProcessorId: string | null = null; // Will try to get this from API response

      try {
        const response = await fetch('https://integ-api.hyperswitch.io/payments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'api-key': apiKey,
          },
          body: JSON.stringify(paymentData),
          signal, // Pass the abort signal
        });

        const responseData = await response.json();

        if (response.ok && (responseData.status === 'succeeded' || responseData.status === 'requires_capture' || responseData.status === 'processing')) {
          isSuccess = true;
        } else {
          isSuccess = false;
          console.warn("Payment API call failed or status not successful:", responseData);
        }
        
        // Attempt to identify the processor
        // Hyperswitch payment response might include 'connector_label' or 'merchant_connector_id'
        // or it might be nested under a routing or attempt object.
        // This is an assumption, adjust based on actual API response structure.
        if (responseData.connector_label) {
            const matchedConnector = merchantConnectors.find(mc => mc.connector_label === responseData.connector_label || mc.connector_name === responseData.connector_label);
            if (matchedConnector) routedProcessorId = matchedConnector.merchant_connector_id || matchedConnector.connector_name;
        } else if (responseData.merchant_connector_id) {
             routedProcessorId = responseData.merchant_connector_id;
        } else if (responseData.attempts && responseData.attempts.length > 0 && responseData.attempts[0].connector) {
            // Fallback if connector info is in attempts (common pattern)
            const matchedConnector = merchantConnectors.find(mc => mc.connector_label === responseData.attempts[0].connector || mc.connector_name === responseData.attempts[0].connector);
            if (matchedConnector) routedProcessorId = matchedConnector.merchant_connector_id || matchedConnector.connector_name;
            else routedProcessorId = responseData.attempts[0].connector; // Use raw if no match
        }


        if (!routedProcessorId) {
            // If no processor could be identified from response, attribute to a generic pool or log.
            // For now, let's try to find any active connector if not specified. This is a fallback.
            const activeConnectors = merchantConnectors.filter(mc => connectorToggleStates[mc.merchant_connector_id || mc.connector_name]);
            if (activeConnectors.length > 0) {
                 // This is a guess, ideally the API response should be clear.
                 // If multiple active, this is non-deterministic for stats.
                 // For now, if only one active, attribute to it. Otherwise, log.
                if (activeConnectors.length === 1) {
                    routedProcessorId = activeConnectors[0].merchant_connector_id || activeConnectors[0].connector_name;
                } else {
                    console.warn("Could not determine processor from API response and multiple active connectors exist. Transaction not attributed to a specific processor for detailed stats.");
                }
            } else {
                 console.warn("Could not determine processor from API response and no active connectors. Transaction not attributed.");
            }
        }

      } catch (error: any) {
        isSuccess = false;
        if (error.name === 'AbortError') {
          console.log('Fetch aborted for payment.');
          // Don't count aborted requests as processed or failed in stats if simulation is stopping/pausing.
          // If it's a timeout, it might be considered a failure. For now, just log.
          break; // Exit loop if aborted
        } else {
          console.error("Error during payment API call:", error);
        }
        // A network error or other fetch issue is a failure.
      }

      // Update stats only if not aborted mid-batch due to pause/stop AND not stopping
      if (!isStoppingRef.current && !signal.aborted) {
        if (routedProcessorId) {
            if (!accumulatedProcessorStatsRef.current[routedProcessorId]) {
                accumulatedProcessorStatsRef.current[routedProcessorId] = { successful: 0, failed: 0, volumeShareRaw: 0 };
            }
            if (isSuccess) {
                accumulatedProcessorStatsRef.current[routedProcessorId].successful++;
            } else {
                accumulatedProcessorStatsRef.current[routedProcessorId].failed++;
            }
            if (!processorTransactionHistoryRef.current[routedProcessorId]) {
                processorTransactionHistoryRef.current[routedProcessorId] = [];
            }
            processorTransactionHistoryRef.current[routedProcessorId].push(isSuccess ? 1 : 0);
        } else {
            // If processor couldn't be identified, count towards global but not specific processor
            console.log("Transaction result (success:", isSuccess, ") not attributed to a specific processor.");
        }

        if (isSuccess) {
            accumulatedGlobalStatsRef.current.totalSuccessful++;
        } else {
            accumulatedGlobalStatsRef.current.totalFailed++;
        }
        paymentsProcessedThisBatch++;
      }
    } // End of for loop for batch
    
    if (apiCallAbortControllerRef.current && !apiCallAbortControllerRef.current.signal.aborted) {
       apiCallAbortControllerRef.current = null; // Clear controller if batch completed normally
    }


    // Update histories and UI state if any payments were actually processed (and not aborted)
    if (paymentsProcessedThisBatch > 0 && !isStoppingRef.current) { 
        let newGlobalCount = 0;
        setProcessedPaymentsCount(prev => {
            newGlobalCount = prev + paymentsProcessedThisBatch;
            if (currentControls && newGlobalCount >= currentControls.totalPayments && !isStoppingRef.current) {
                isStoppingRef.current = true;
                setSimulationState('idle');
                // generateAndSetSummary(); // AI Summary Removed
                toast({ title: "Simulation Completed", description: `All ${currentControls.totalPayments} payments processed.`, duration: 5000 });
            }
            return newGlobalCount;
        });

        // The rest of the updates should only happen if we are not stopping
        // and currentControls is available (it should be if simulation is running)
        if (!isStoppingRef.current && currentControls) {
            const currentTime = Date.now(); // Use current timestamp
            const newSuccessRateDataPoint: TimeSeriesDataPoint = { time: currentTime };
            const newVolumeDataPoint: TimeSeriesDataPoint = { time: currentTime };
        
            merchantConnectors.forEach(connector => {
              const key = connector.merchant_connector_id || connector.connector_name;
              if (currentControls.processorWiseSuccessRates[key]) { 
                const stats = accumulatedProcessorStatsRef.current[key] || { successful: 0, failed: 0 };
                const totalForProcessor = stats.successful + stats.failed;
                newSuccessRateDataPoint[key] = totalForProcessor > 0 ? (stats.successful / totalForProcessor) * 100 : 0;
                newVolumeDataPoint[key] = totalForProcessor;
              } else { 
                const stats = accumulatedProcessorStatsRef.current[key] || { successful: 0, failed: 0 };
                const totalForProcessor = stats.successful + stats.failed;
                newSuccessRateDataPoint[key] = totalForProcessor > 0 ? (stats.successful / totalForProcessor) * 100 : 0;
                newVolumeDataPoint[key] = totalForProcessor;
              }
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
                
                const allProcessorKeys = new Set([
                    ...Object.keys(newPwsr),
                    ...merchantConnectors.map(mc => mc.merchant_connector_id || mc.connector_name),
                    ...Object.keys(accumulatedProcessorStatsRef.current)
                ]);

                allProcessorKeys.forEach(procId => {
                    if (!newPwsr[procId]) { 
                        const connectorInfo = merchantConnectors.find(mc => (mc.merchant_connector_id || mc.connector_name) === procId);
                        newPwsr[procId] = { 
                            sr: connectorInfo ? 0 : 0, 
                            srDeviation: 0, 
                            volumeShare: 0, 
                            failureRate: 100 
                        }; 
                    }
                    const stats = accumulatedProcessorStatsRef.current[procId] || { successful: 0, failed: 0 };
                    totalVolumeAcrossProcessors += (stats.successful + stats.failed);
                });

                allProcessorKeys.forEach(procId => {
                    const stats = accumulatedProcessorStatsRef.current[procId] || { successful: 0, failed: 0 };
                    const procTotal = stats.successful + stats.failed;
                    const observedSr = procTotal > 0 ? (stats.successful / procTotal) * 100 : 0;
                    newPwsr[procId] = {
                        ...(newPwsr[procId] || { sr:0, srDeviation:0, volumeShare:0, failureRate:100 }),
                        volumeShare: totalVolumeAcrossProcessors > 0 ? (procTotal / totalVolumeAcrossProcessors) * 100 : 0,
                        failureRate: 100 - observedSr,
                    };
                });
                return {
                    ...prevControls,
                    processorWiseSuccessRates: newPwsr,
                    overallSuccessRate: currentOverallSR,
                };
            });
            // setSimulationTimeStep(prev => prev + 1); // Removed
        }
    }
  }, [
    currentControls, simulationState, apiKey, profileId, merchantConnectors, connectorToggleStates,
    processedPaymentsCount, // simulationTimeStep removed
    setProcessedPaymentsCount, /*setSimulationTimeStep removed*/ setSuccessRateHistory, setVolumeHistory, 
    setOverallSuccessRateHistory, setSimulationState, setCurrentControls, 
    toast
  ]);

  useEffect(() => {
    if (simulationState === 'running') {
      simulationIntervalRef.current = setInterval(() => {
        processTransactionBatch(); // This is async, but setInterval doesn't await. It's fine.
      }, SIMULATION_INTERVAL_MS);
    } else {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
      if (apiCallAbortControllerRef.current) { // Abort any ongoing API calls if paused or stopped
        apiCallAbortControllerRef.current.abort();
        apiCallAbortControllerRef.current = null;
      }
    }
    return () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
      }
      if (apiCallAbortControllerRef.current) {
        apiCallAbortControllerRef.current.abort();
        apiCallAbortControllerRef.current = null;
      }
    };
  }, [simulationState, processTransactionBatch]);

  const handleStartSimulation = useCallback(async (forceStart = false) => {
    console.log("handleStartSimulation called. Checking credentials...");
    console.log("API Key:", apiKey, " (empty:", !apiKey, ")");
    console.log("Profile ID:", profileId, " (empty:", !profileId, ")");
    console.log("Merchant ID:", merchantId, " (empty:", !merchantId, ")");
    const credentialsMissing = !apiKey || !profileId || !merchantId;
    console.log("Are credentials missing?", credentialsMissing);

    if (credentialsMissing) { 
      console.log("Opening API credentials modal.");
      setIsApiCredentialsModalOpen(true);
      return;
    }
    
    console.log("Credentials present. Proceeding with simulation start...");
    
    // Fetch connectors ONLY if they haven't been fetched yet or if forceStart is true
    if (forceStart || merchantConnectors.length === 0) {
      const connectors = await fetchMerchantConnectors(merchantId, apiKey);
      if (connectors.length === 0 && !forceStart) { // If fetch failed and not forcing, don't proceed
        toast({ title: "Error", description: "Failed to fetch merchant connectors. Cannot start simulation.", variant: "destructive" });
        return;
      }
    }
    
    // Check if currentControls needs initialization AFTER potentially fetching connectors
    if (!currentControls && merchantConnectors.length > 0) {
        const initialProcessorWiseSuccessRates: ControlsState['processorWiseSuccessRates'] = {};
        const initialProcessorIncidents: ControlsState['processorIncidents'] = {};
        const initialProcessorMatrix: FormValues['processorMatrix'] = {};
        merchantConnectors.forEach(connector => {
            const key = connector.merchant_connector_id || connector.connector_name;
            initialProcessorWiseSuccessRates[key] = { sr: 0, srDeviation: 0, volumeShare: 0, failureRate: 100 };
            initialProcessorIncidents[key] = null;
            initialProcessorMatrix[key] = PAYMENT_METHODS.reduce((acc, method) => {
                acc[method] = false; return acc;
            }, {} as Record<PaymentMethod, boolean>);
        });
        setCurrentControls({
            totalPayments: 1000, /* tps: 100, */ selectedPaymentMethods: [...PAYMENT_METHODS], // Re-added selectedPaymentMethods
            processorMatrix: initialProcessorMatrix, 
            structuredRule: null,
            processorIncidents: initialProcessorIncidents, 
            overallSuccessRate: 0,
            processorWiseSuccessRates: initialProcessorWiseSuccessRates,
            minAggregatesSize: 100, 
            maxAggregatesSize: 1000,
            defaultSuccessRate: 90, // Added default
            currentBlockThresholdDurationInMins: 5, // Added default
            currentBlockThresholdMaxTotalCount: 10, 
            // volumeSplit: 100, // Removed
        });
    } else if (!currentControls) {
         toast({ title: "Error", description: "Control data not available and connectors not fetched.", variant: "destructive" });
         return;
    }

    if (simulationState === 'idle' || forceStart) { 
      resetSimulationState(); 
    }
    setSimulationState('running');
    if (simulationState === 'idle' || forceStart) {
      toast({ title: "Simulation Started", description: `Processing ${currentControls?.totalPayments || 0} payments.`, duration: 3000 });
    } else { 
      toast({ title: "Simulation Resumed", duration: 3000 });
    }
  }, [currentControls, toast, simulationState, apiKey, profileId, merchantId, merchantConnectors]);

  const handlePauseSimulation = useCallback(() => {
    if (simulationState === 'running') {
      isStoppingRef.current = true;
      setSimulationState('paused');
      if (apiCallAbortControllerRef.current) {
        apiCallAbortControllerRef.current.abort(); // Abort ongoing API calls
        apiCallAbortControllerRef.current = null;
      }
      toast({ title: "Simulation Paused", duration: 3000 });
    }
  }, [simulationState, toast, setSimulationState]);

  const handleStopSimulation = useCallback(() => {
    if (simulationState !== 'idle') {
      isStoppingRef.current = true;
      setSimulationState('idle');
      if (apiCallAbortControllerRef.current) {
        apiCallAbortControllerRef.current.abort(); // Abort ongoing API calls
        apiCallAbortControllerRef.current = null;
      }
      toast({ title: "Simulation Stopped", description: `Processed ${processedPaymentsCount} payments.`, duration: 3000 });
      // if (processedPaymentsCount > 0) { // AI Summary Removed
      //  generateAndSetSummary(); 
      // }
    }
  }, [simulationState, processedPaymentsCount, toast, setSimulationState]); // generateAndSetSummary removed from dependencies

  const [activeTab, _setActiveTab] = useState("stats");

  const setActiveTab = (newTab: string) => {
    console.log("setActiveTab called with:", newTab);
    _setActiveTab(newTab);
  };

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
              {/* {console.log("Rendering Stats TabsContent, activeTab:", activeTab)} */}
              <ScrollArea className="h-full">
                 <div className="p-2 md:p-4 lg:p-6">
                    <StatsView
                      currentControls={currentControls}
                      merchantConnectors={merchantConnectors} 
                      processedPayments={processedPaymentsCount}
                      totalSuccessful={accumulatedGlobalStatsRef.current.totalSuccessful}
                      totalFailed={accumulatedGlobalStatsRef.current.totalFailed}
                      overallSuccessRateHistory={overallSuccessRateHistory}
                    />
                  </div>
              </ScrollArea>
            </TabsContent>
            <TabsContent value="analytics" className="h-full mt-0 data-[state=active]:flex data-[state=active]:flex-col">
               {/* {console.log("Rendering Analytics TabsContent, activeTab:", activeTab)} */}
               <ScrollArea className="h-full">
                 <div className="p-2 md:p-4 lg:p-6">
                    <AnalyticsGraphsView
                      successRateHistory={successRateHistory} 
                      volumeHistory={volumeHistory}
                      merchantConnectors={merchantConnectors}
                      connectorToggleStates={connectorToggleStates}
                    />
                  </div>
              </ScrollArea>
            </TabsContent>
            {/* <TabsContent value="processors" className="h-full mt-0 data-[state=active]:flex data-[state=active]:flex-col">
              {console.log("Rendering Processors TabsContent, activeTab:", activeTab)}
              <ProcessorsTabView
                merchantConnectors={merchantConnectors}
                // connectorToggleStates={connectorToggleStates} // Removed
                // onConnectorToggleChange={handleConnectorToggleChange} // Removed
                isLoadingConnectors={isLoadingMerchantConnectors}
              />
            </TabsContent> */}
          </div>
        </Tabs>
      </AppLayout>
      <BottomControlsPanel
        onFormChange={handleControlsChange}
        merchantConnectors={merchantConnectors}
        connectorToggleStates={connectorToggleStates}
        onConnectorToggleChange={handleConnectorToggleChange}
        apiKey={apiKey} // Re-add apiKey prop
        profileId={profileId} // Re-add profileId prop
        merchantId={merchantId} // Add merchantId prop
      />
      {/* <Dialog open={isSummaryModalOpen} onOpenChange={setIsSummaryModalOpen}>...</Dialog> */} {/* AI Summary Dialog potentially removed or kept non-functional */}
      
      <Dialog open={isApiCredentialsModalOpen} onOpenChange={setIsApiCredentialsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              API Credentials
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="apiKey">API Key</Label>
              <Input 
                id="apiKey" 
                type="password" 
                value={apiKey} 
                onChange={(e) => setApiKey(e.target.value)} 
                placeholder="Enter your API Key" 
              />
            </div>
            <div>
              <Label htmlFor="profileId">Profile ID</Label>
              <Input 
                id="profileId" 
                type="text" 
                value={profileId} 
                onChange={(e) => setProfileId(e.target.value)} 
                placeholder="Enter your Profile ID"
              />
            </div>
            <div>
              <Label htmlFor="merchantId">Merchant ID</Label>
              <Input 
                id="merchantId" 
                type="text" 
                value={merchantId} 
                onChange={(e) => setMerchantId(e.target.value)} 
                placeholder="Enter your Merchant ID"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsApiCredentialsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleApiCredentialsSubmit}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
