"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { BottomControlsPanel, type FormValues } from '@/components/BottomControlsPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { StatsView } from '@/components/StatsView';
import { AnalyticsGraphsView } from '@/components/AnalyticsGraphsView';
// import { ProcessorsTabView } from '@/components/ProcessorsTabView'; // Tab removed
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react'; // AI Summary Re-added
// import ReactMarkdown from 'react-markdown'; // Temporarily commented out - install this package
import type { PaymentMethod, ProcessorMetricsHistory, StructuredRule, ControlsState, OverallSRHistory, OverallSRHistoryDataPoint, TimeSeriesDataPoint, MerchantConnector, TransactionLogEntry, AISummaryInput, AISummaryOutput } from '@/lib/types';
import { PAYMENT_METHODS, /*RULE_STRATEGY_NODES*/ } from '@/lib/constants'; // RULE_STRATEGY_NODES removed
import { useToast } from '@/hooks/use-toast';
import { summarizeSimulation } from '@/ai/flows/summarize-simulation-flow'; // AI Summary Re-added
import SplitPane from 'react-split-pane';
import { MiniSidebar } from '@/components/MiniSidebar';

const SIMULATION_INTERVAL_MS = 1000; // Interval between individual payment processing attempts

const LOCALSTORAGE_API_KEY = 'hyperswitch_apiKey';
const LOCALSTORAGE_PROFILE_ID = 'hyperswitch_profileId';
const LOCALSTORAGE_MERCHANT_ID = 'hyperswitch_merchantId';

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

  // State for transaction logging
  const [transactionLogs, setTransactionLogs] = useState<TransactionLogEntry[]>([]);
  const transactionCounterRef = useRef<number>(0);

  // State for AI Summary Modal
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState<boolean>(false);
  const [summaryText, setSummaryText] = useState<string>('');
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [summaryAttempted, setSummaryAttempted] = useState<boolean>(false); // New state

  const { toast } = useToast();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mainPaneSize, setMainPaneSize] = useState('50%');

  const [activeSection, setActiveSection] = useState('general');

  useEffect(() => {
    // Load credentials from localStorage on initial mount
    if (typeof window !== 'undefined') {
      const storedApiKey = localStorage.getItem(LOCALSTORAGE_API_KEY);
      const storedProfileId = localStorage.getItem(LOCALSTORAGE_PROFILE_ID);
      const storedMerchantId = localStorage.getItem(LOCALSTORAGE_MERCHANT_ID);

      let allCredentialsFound = true; // Initialize here

      if (storedApiKey) {
        setApiKey(storedApiKey);
      } else {
        allCredentialsFound = false;
      }

      if (storedProfileId) {
        setProfileId(storedProfileId);
      } else {
        allCredentialsFound = false;
      }
      
      if (storedMerchantId) {
        setMerchantId(storedMerchantId);
      } else {
        allCredentialsFound = false;
      }

      if (allCredentialsFound && storedMerchantId && storedApiKey) { 
        console.log("All credentials loaded from localStorage. Fetching connectors.");
        // Directly call fetchMerchantConnectors with the loaded values
        // as state updates might not be synchronous for the first call.
        fetchMerchantConnectors(storedMerchantId, storedApiKey); 
      } else {
        console.log("Not all credentials found in localStorage. Opening modal.");
        setIsApiCredentialsModalOpen(true);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount


  // Function to fetch success rates and select the best connector
  const fetchSuccessRateAndSelectConnector = useCallback(async (
    currentControls: FormValues,
    activeConnectorLabels: string[], // Changed to expect an array of connector_label
    currentApiKey: string, // Still needed for other API calls, but not for this one as per user
    currentProfileId: string
  ): Promise<{ selectedConnector: string | null; routingApproach: TransactionLogEntry['routingApproach'] }> => {
    if (!currentControls || activeConnectorLabels.length === 0 || !currentProfileId) { // Removed currentApiKey from check as it's not used here
      console.warn("[FetchSuccessRate] Missing required parameters (controls, labels, or profileId).");
      return { selectedConnector: null, routingApproach: 'unknown' };
    }

    const payload = {
      id: currentProfileId,
      params: "card", 
      labels: activeConnectorLabels, // Use the provided connector_labels
      config: { // Specific config for FetchSuccessRate
        min_aggregates_size: currentControls.minAggregatesSize ?? 5, // Using the new form value
        default_success_rate: 100.0, // Removed as per previous changes
        exploration_percent: currentControls.explorationPercent ?? 20.0,
        // max_aggregates_size and current_block_threshold are NOT included here
      },
    };

    console.log("[FetchSuccessRate] Payload:", JSON.stringify(payload, null, 2));

    try {
      const response = await fetch('/api/hs-proxy/dynamic-routing/success_rate.SuccessRateCalculator/FetchSuccessRate', { // Reverted to proxy path
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-feature': 'dynamo', // As per original cURL
          // api-key is intentionally omitted as per user feedback for this specific endpoint
        },
        body: JSON.stringify(payload),
      });

      let routingApproachForLog: TransactionLogEntry['routingApproach'] = 'unknown';

      // The following block was erroneously inserted here and is being removed.
      // if (profileId && connectorNameForUpdateApi && currentControls) { 
      //   await updateSuccessRateWindow(profileId, connectorNameForUpdateApi!, isSuccess, currentControls); 
      // } else {
      //   console.warn("[PTB] Skipping UpdateSuccessRateWindow call due to missing profileId, connectorName, or currentControls.");
      // }

      const data = await response.json();
      console.log("[FetchSuccessRate] Response Data:", data);

      if (typeof data.routing_approach === 'number') {
        if (data.routing_approach === 0) {
          routingApproachForLog = 'exploration';
        } else if (data.routing_approach === 1) {
          routingApproachForLog = 'exploitation';
        }
      }
      console.log(`[FetchSuccessRate] Determined routing approach: ${routingApproachForLog}`);


      if (data.labels_with_score && data.labels_with_score.length > 0) {
        const bestConnector = data.labels_with_score.reduce((prev: any, current: any) =>
          (prev.score > current.score) ? prev : current
        );
        console.log(`[FetchSuccessRate] Selected connector: ${bestConnector.label} with score ${bestConnector.score}`);
        return { selectedConnector: bestConnector.label, routingApproach: routingApproachForLog };
      } else {
        console.warn("[FetchSuccessRate] No scores returned or empty list.");
        toast({ title: "Fetch Success Rate Info", description: "No connector scores returned by the API."});
        return { selectedConnector: null, routingApproach: routingApproachForLog };
      }
    } catch (error: any) {
      console.error("[FetchSuccessRate] Fetch Error:", error);
      toast({ title: "Fetch Success Rate Network Error", description: error.message, variant: "destructive" });
      return { selectedConnector: null, routingApproach: 'unknown' };
    }
  }, [toast]);

  const updateSuccessRateWindow = useCallback(async (
    currentProfileId: string,
    connectorNameForApi: string, // This should be the connector_name
    paymentSuccessStatus: boolean,
    controls: FormValues | null // Pass currentControls to access config values
  ) => {
    if (!currentProfileId || !connectorNameForApi) {
      console.warn("[UpdateSuccessRateWindow] Missing profileId or connectorName.");
      return;
    }
    if (!controls) {
      console.warn("[UpdateSuccessRateWindow] Missing controls data, cannot construct config.");
      return;
    }

    const payload = {
      id: currentProfileId,
      params: "card", // Assuming "card" for now
      labels_with_status: [{ label: connectorNameForApi, status: paymentSuccessStatus }],
      global_labels_with_status: [{ label: connectorNameForApi, status: paymentSuccessStatus }],
      config: { // Added config for UpdateSuccessRateWindow
        max_aggregates_size: controls.maxAggregatesSize ?? 10, // Using the new form value
        current_block_threshold: { // This remains as per its original structure
          duration_in_mins: controls.currentBlockThresholdDurationInMins ?? 15, 
          max_total_count: controls.currentBlockThresholdMaxTotalCount ?? 5,    
        }
      }
    };

    console.log("[UpdateSuccessRateWindow] Payload:", JSON.stringify(payload, null, 2));

    try {
      const response = await fetch('/api/hs-proxy/dynamic-routing/success_rate.SuccessRateCalculator/UpdateSuccessRateWindow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-feature': 'dynamo',
          // 'api-key': apiKey, // Not needed for this endpoint as per user
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to update success rate window" }));
        console.error("[UpdateSuccessRateWindow] API Error:", errorData.message || `HTTP ${response.status}`);
        toast({ title: "Update SR Window Error", description: errorData.message || `HTTP ${response.status}`, variant: "destructive" });
      } else {
        const responseDataText = await response.text(); // Get text first to avoid issues with empty/non-JSON
        try {
          const updateData = responseDataText ? JSON.parse(responseDataText) : null;
          if (updateData && typeof updateData.status === 'number') {
            if (updateData.status === 0) {
              console.log(`[UpdateSuccessRateWindow] API reported success (status 0) for connector ${connectorNameForApi}. Full response:`, updateData);
            } else if (updateData.status === 1) {
              console.warn(`[UpdateSuccessRateWindow] API reported failure (status 1) for connector ${connectorNameForApi}. Full response:`, updateData);
              // Optionally, you might want a toast here if status 1 is an actionable error
              // toast({ title: "Update SR Window Issue", description: `API reported failure (status 1) for ${connectorNameForApi}.`, variant: "warning" });
            } else {
              console.log(`[UpdateSuccessRateWindow] HTTP call successful for ${connectorNameForApi}, but API status is unexpected: ${updateData.status}. Full response:`, updateData);
            }
          } else if (response.status === 204 || !responseDataText) { // Handle 204 No Content or genuinely empty responses
             console.log(`[UpdateSuccessRateWindow] Successfully called for connector ${connectorNameForApi} (HTTP ${response.status}, No Content/Empty Response).`);
          } else {
            console.log(`[UpdateSuccessRateWindow] HTTP call successful for ${connectorNameForApi}, but response was not JSON or status field missing. Response text:`, responseDataText);
          }
        } catch (jsonParseError) {
          console.error(`[UpdateSuccessRateWindow] Failed to parse JSON response for ${connectorNameForApi}. HTTP Status: ${response.status}. Response text:`, responseDataText, jsonParseError);
        }
      }
    } catch (error: any) {
      console.error("[UpdateSuccessRateWindow] Fetch Error:", error);
      toast({ title: "Update SR Window Network Error", description: error.message, variant: "destructive" });
    }
  }, [toast]); // currentControls is not a direct dependency here, it's passed as an argument


  // This useEffect is no longer needed as the initial modal opening is handled by the mount effect
  // useEffect(() => {
  //   if (!apiKey && !profileId && !merchantId) {
  //     setIsApiCredentialsModalOpen(true);
  //   }
  // }, [apiKey, profileId, merchantId]);

  // const prevCurrentControlsRef = useRef<FormValues | null>(null); // Removed as the useEffect using it is removed

  // useEffect(() => { // This useEffect has been moved to BottomControlsPanel.tsx
  //   const prevControls = prevCurrentControlsRef.current;
  //   const currentRuleEnabled = currentControls?.isSuccessBasedRoutingEnabled; 
  //   const prevRuleEnabled = prevControls?.isSuccessBasedRoutingEnabled;

  //   if (currentRuleEnabled === true && (prevRuleEnabled === false || prevRuleEnabled === undefined)) {
  //     // Rule was just toggled from false or undefined to true
  //     if (merchantId && profileId && apiKey) {
  //       const apiUrl = `https://sandbox.hyperswitch.io/account/${merchantId}/business_profile/${profileId}/dynamic_routing/set_volume_split?split=100`;
        
  //       console.log(`Success rate rule enabled. Calling: POST ${apiUrl}`);
        
  //       fetch(apiUrl, {
  //         method: 'POST',
  //         headers: {
  //           'api-key': apiKey,
  //         },
  //         // No body for this specific cURL
  //       })
  //       .then(async response => {
  //         if (!response.ok) {
  //           let errorDetail = `HTTP error! status: ${response.status}`;
  //           try {
  //             // Attempt to get more detailed error message if API returns JSON error
  //             const errorData = await response.json();
  //             errorDetail = errorData.message || JSON.stringify(errorData) || errorDetail;
  //           } catch (e) {
  //             // If parsing JSON fails, stick with the status text or get response text
  //             const textError = await response.text().catch(() => "");
  //             errorDetail = textError || errorDetail;
  //           }
  //           console.error("Failed to set volume split:", errorDetail);
  //           toast({ title: "API Error", description: `Failed to set volume split: ${errorDetail}`, variant: "destructive" });
  //           return; 
  //         }
  //         // If response.ok is true, assume success even with no body
  //         console.log("Successfully set volume split. Status:", response.status);
  //         toast({ title: "Success", description: "Dynamic routing volume split set." });
  //       })
  //       .catch(error => {
  //         console.error("Error setting volume split (fetch catch):", error);
  //         toast({ title: "Network Error", description: `Could not set volume split: ${error.message}`, variant: "destructive" });
  //       });
  //     } else {
  //       console.warn("Cannot set volume split: API credentials (merchantId, profileId, apiKey) are missing.");
  //       toast({ title: "Configuration Error", description: "API credentials missing, cannot set volume split.", variant: "destructive" });
  //     }
  //   }

  //   prevCurrentControlsRef.current = currentControls;
  // }, [currentControls, merchantId, profileId, apiKey, toast]);

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
      const response = await fetch(`https://sandbox.hyperswitch.io/account/${currentMerchantId}/profile/connectors`, {
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
            totalPayments: 100, 
            selectedPaymentMethods: [...PAYMENT_METHODS],
            structuredRule: null, 
            // defaultSuccessRate: 100, // Removed
            currentBlockThresholdDurationInMins: 15, // Old field, kept for now if UI still uses it directly
            currentBlockThresholdMaxTotalCount: 5,  // Old field, kept for now
            minAggregatesSize: 5, // New field default
            maxAggregatesSize: 10, // New field default
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
      const response = await fetch(`https://sandbox.hyperswitch.io/account/${merchantId}/connectors/${connectorId}`, {
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
    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCALSTORAGE_API_KEY, apiKey);
      localStorage.setItem(LOCALSTORAGE_PROFILE_ID, profileId);
      localStorage.setItem(LOCALSTORAGE_MERCHANT_ID, merchantId);
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
    setTransactionLogs([]); // Reset logs
    transactionCounterRef.current = 0; // Reset counter
    setSummaryAttempted(false); // Reset summary attempt flag

    setCurrentControls(prev => {
      if (!prev) { 
        return {
          totalPayments: 1000, selectedPaymentMethods: [...PAYMENT_METHODS], processorMatrix: {}, 
          processorIncidents: {}, overallSuccessRate: 0, processorWiseSuccessRates: {}, 
          structuredRule: null,
          // defaultSuccessRate: 90, // Removed
          currentBlockThresholdDurationInMins: 5, // Old field
          currentBlockThresholdMaxTotalCount: 10, // Old field
          minAggregatesSize: 5, // New field default
          maxAggregatesSize: 10, // New field default
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
          }},
          // browser_info: { // browser_info can be re-added if needed by the API
          //   user_agent: "Mozilla/5.0",
          //   accept_header: "text/html",
          //   language: "en-US",
          //   color_depth: 24,
          //   screen_height: 1080,
          //   screen_width: 1920,
          //   time_zone: 0,
          //   java_enabled: true,
          //   java_script_enabled: true,
          //   ip_address: "127.0.0.1"
          // }
          // routing object will be conditionally added below
        };

        // --- BEGIN: Fetch success rate (always) and conditionally use it ---
        let routingApproachForLogEntry: TransactionLogEntry['routingApproach'] = 'N/A';
        let returnedConnectorLabelFromApi: string | null = null;

        // Always prepare and attempt to fetch success rate if there are active connectors and necessary info
        const activeConnectorLabelsForApi = merchantConnectors
          .filter(mc => connectorToggleStates[mc.merchant_connector_id || mc.connector_name])
          .map(mc => mc.connector_label || mc.connector_name);

        if (activeConnectorLabelsForApi.length > 0 && currentControls && profileId) {
          console.log("[PTB] Attempting to fetch connector scores for labels:", activeConnectorLabelsForApi);
          const { selectedConnector, routingApproach } = await fetchSuccessRateAndSelectConnector(
            currentControls,
            activeConnectorLabelsForApi,
            apiKey, // Not used by fetchSuccessRateAndSelectConnector for this specific API, but passed
            profileId
          );
          returnedConnectorLabelFromApi = selectedConnector;
          routingApproachForLogEntry = routingApproach; // Always log the approach if API was called
        } else {
          console.log("[PTB] Not fetching success rates: No active connectors, or missing currentControls/profileId.");
          routingApproachForLogEntry = 'unknown'; // Or 'N/A' if preferred when not fetched
        }

        // Conditionally use the fetched connector label for routing if Success Based Routing is enabled
        if (currentControls.isSuccessBasedRoutingEnabled) {
          console.log("[PTB] Success Based Routing IS enabled. Evaluating fetched connector for routing.");
          if (returnedConnectorLabelFromApi) {
            const matchedConnector = merchantConnectors.find(mc =>
              mc.connector_label === returnedConnectorLabelFromApi ||
              mc.connector_name === returnedConnectorLabelFromApi
            );

            if (matchedConnector) {
              const connectorIdForMca = matchedConnector.merchant_connector_id;
              const connectorNameToUse = matchedConnector.connector_name;
              const routingObject: any = {};
              routingObject.type = "single";
              routingObject.data = {
                connector: connectorNameToUse,
                merchant_connector_id: connectorIdForMca
              };
              (paymentData as any).routing = routingObject;
              console.log(`[PTB] SBR Enabled: Routing to connector (name: ${connectorNameToUse}, mca_id: ${connectorIdForMca}, selected_label: ${returnedConnectorLabelFromApi}) chosen by success rate.`);
            } else {
              console.warn(`[PTB] SBR Enabled: Returned connector label '${returnedConnectorLabelFromApi}' not found in local list. Default routing will apply.`);
            }
          } else {
            console.log("[PTB] SBR Enabled: No connector selected by success rate API. Default routing will apply.");
          }
        } else {
          console.log("[PTB] Success Based Routing IS DISABLED. Default routing will apply (no override from success rate API).");
        }
        // --- END: Fetch success rate and select connector ---

        let isSuccess = false;
        let routedProcessorId: string | null = null;

        try {
          console.log(`PTB: Making API call #${processedPaymentsCount + paymentsProcessedThisBatch + 1} with payload:`, JSON.stringify(paymentData, null, 2));
          const response = await fetch('/api/hs-proxy/payments', { // Use the proxy
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'api-key': apiKey },
            body: JSON.stringify(paymentData), signal,
          });

          // Extract logging headers
          const paymentStatusHeader = response.headers.get('x-simulation-payment-status');
          const connectorHeader = response.headers.get('x-simulation-payment-connector');

          const responseData = await response.json();
          isSuccess = response.ok && (responseData.status === 'succeeded' || responseData.status === 'requires_capture' || responseData.status === 'processing');
          if (!isSuccess) console.warn("Payment API call failed:", responseData);
          
          // Log the transaction
          let loggedConnectorName: string | null = null;
          if (paymentStatusHeader && connectorHeader) {
            loggedConnectorName = connectorHeader; // Prefer header
            transactionCounterRef.current += 1;
            const newLogEntry: TransactionLogEntry = {
              transactionNumber: transactionCounterRef.current,
              status: paymentStatusHeader,
              connector: connectorHeader,
              timestamp: Date.now(),
              routingApproach: routingApproachForLogEntry, 
            };
            setTransactionLogs(prevLogs => [...prevLogs, newLogEntry]);
          } else {
            if (responseData.status && (responseData.connector_label || responseData.merchant_connector_id || (responseData.attempts && responseData.attempts.length > 0 && responseData.attempts[0].connector))) {
                loggedConnectorName = responseData.connector_label || responseData.merchant_connector_id || responseData.attempts[0].connector || 'unknown';
                transactionCounterRef.current += 1;
                 const newLogEntry: TransactionLogEntry = {
                    transactionNumber: transactionCounterRef.current,
                    status: responseData.status,
                    connector: loggedConnectorName || 'unknown',
                    timestamp: Date.now(),
                    routingApproach: routingApproachForLogEntry, 
                };
                setTransactionLogs(prevLogs => [...prevLogs, newLogEntry]);
                console.warn("Used fallback logging from response body for transaction: ", transactionCounterRef.current);
            } else {
                console.warn("Could not log transaction, missing status/connector in headers and body for transaction attempt after: ", transactionCounterRef.current);
            }
          }
          
          // Determine routedProcessorId for stats accumulation (this is typically merchant_connector_id or a similar unique key)
          if (responseData.connector_label) {
              const mc = merchantConnectors.find(m => m.connector_label === responseData.connector_label || m.connector_name === responseData.connector_label);
              if (mc) routedProcessorId = mc.merchant_connector_id || mc.connector_name;
          } else if (responseData.merchant_connector_id) {
               routedProcessorId = responseData.merchant_connector_id;
          } else if (responseData.attempts && responseData.attempts.length > 0 && responseData.attempts[0].connector) {
              // Assuming attempts[0].connector might be a label or name
              const attemptConnector = responseData.attempts[0].connector;
              const mc = merchantConnectors.find(m => m.connector_label === attemptConnector || m.connector_name === attemptConnector || m.merchant_connector_id === attemptConnector);
              routedProcessorId = mc ? (mc.merchant_connector_id || mc.connector_name) : attemptConnector;
          }

          if (!routedProcessorId && loggedConnectorName && loggedConnectorName !== 'unknown') {
            // If we got a loggedConnectorName (likely a label or name) but couldn't map it to a routedProcessorId for stats,
            // try to find its merchant_connector_id for stats key.
            const mc = merchantConnectors.find(m => m.connector_label === loggedConnectorName || m.connector_name === loggedConnectorName);
            if (mc) routedProcessorId = mc.merchant_connector_id || mc.connector_name;
            else routedProcessorId = loggedConnectorName; // Fallback to using the logged name if no better ID found
          } else if (!routedProcessorId) {
             const activeConnectors = merchantConnectors.filter(mc => connectorToggleStates[mc.merchant_connector_id || mc.connector_name]);
             if (activeConnectors.length === 1) routedProcessorId = activeConnectors[0].merchant_connector_id || activeConnectors[0].connector_name;
             else console.warn("Could not determine processor ID for stats accumulation from API response.");
          }

          // Call UpdateSuccessRateWindow
          // The API expects connector_name for its 'label' field.
          // 'loggedConnectorName' should be the connector_name or connector_label from the payment response.
          // We need to ensure we pass the 'connector_name' to updateSuccessRateWindow.
          let connectorNameForUpdateApi: string | null = null;
          if (loggedConnectorName && loggedConnectorName !== 'unknown') {
            const foundConnector = merchantConnectors.find(mc => 
                mc.connector_label === loggedConnectorName || 
                mc.connector_name === loggedConnectorName ||
                mc.merchant_connector_id === loggedConnectorName // If loggedConnectorName was an ID
            );
            if (foundConnector) {
                connectorNameForUpdateApi = foundConnector.connector_name;
            } else {
                // If loggedConnectorName is not a label or ID we know, it might be the name itself.
                // This case is less likely if headers/response parsing is robust.
                connectorNameForUpdateApi = loggedConnectorName; 
                console.warn(`Could not definitively map logged connector '${loggedConnectorName}' to a known connector_name for UpdateSuccessRateWindow. Using logged name directly.`);
            }
          }
          
          if (profileId && connectorNameForUpdateApi && currentControls) { 
            await updateSuccessRateWindow(profileId, connectorNameForUpdateApi, isSuccess, currentControls); 
          } else {
            console.warn("[PTB] Skipping UpdateSuccessRateWindow call due to missing profileId, connectorName, or currentControls.");
          }

        } catch (error: any) {
          isSuccess = false;
          if (error.name === 'AbortError') break;
          else console.error("Error during payment API call:", error);
        }

        if (!isStoppingRef.current && !signal.aborted) { 
          if (routedProcessorId) { // routedProcessorId is used as key for stats
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
    setOverallSuccessRateHistory, setSimulationState, setCurrentControls, toast, 
    fetchSuccessRateAndSelectConnector, updateSuccessRateWindow // Added dependencies
  ]);

  useEffect(() => {
    if (simulationState === 'running' && !isProcessingBatchRef.current && processedPaymentsCount < (currentControls?.totalPayments || 0) ) {
      simulationIntervalRef.current = setInterval(() => {
        if (!isProcessingBatchRef.current && processedPaymentsCount < (currentControls?.totalPayments || 0) && simulationState === 'running' && !isStoppingRef.current) {
             processTransactionBatch();
        } else if (simulationIntervalRef.current && (processedPaymentsCount >= (currentControls?.totalPayments || 0) || simulationState !== 'running' || isStoppingRef.current)) {
            clearInterval(simulationIntervalRef.current);
            simulationIntervalRef.current = null;
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
            processorWiseSuccessRates: initialPwsr,
            // defaultSuccessRate: 90, // Removed
            currentBlockThresholdDurationInMins: 5, // Old field
            currentBlockThresholdMaxTotalCount: 10, // Old field
            minAggregatesSize: 5, // New field default
            maxAggregatesSize: 10, // New field default
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

  const handleRequestAiSummary = useCallback(async () => {
    if (!currentControls) {
      toast({ title: "Error", description: "Cannot generate summary without simulation data.", variant: "destructive" });
      return;
    }
    if (transactionLogs.length === 0) {
      toast({ title: "No Data", description: "No transactions logged to summarize." }); // Removed variant: "info"
      return;
    }

    setIsSummaryModalOpen(true);
    setIsSummarizing(true);
    setSummaryText('');
    setSummaryAttempted(true); // Mark that summary has been attempted/shown for this run

    try {
      // Prepare the input for the Genkit flow
      // This will be refined once AISummaryInput is updated to accept raw logs
      const summaryInput: AISummaryInput = {
        totalPaymentsProcessed: processedPaymentsCount,
        targetTotalPayments: currentControls.totalPayments,
        overallSuccessRate: currentControls.overallSuccessRate || 0,
        totalSuccessful: accumulatedGlobalStatsRef.current.totalSuccessful,
        totalFailed: accumulatedGlobalStatsRef.current.totalFailed,
        effectiveTps: 0, // This would need calculation if required by the prompt
        processorMetrics: Object.entries(currentControls.processorWiseSuccessRates || {}).map(([name, metrics]) => ({
          name,
          volume: metrics.totalPaymentCount,
          observedSr: metrics.totalPaymentCount > 0 ? (metrics.successfulPaymentCount / metrics.totalPaymentCount) * 100 : 0,
          baseSr: metrics.sr, // Assuming 'sr' is the base SR from UI
        })),
        incidents: Object.entries(currentControls.processorIncidents || {}).map(([processorName, isActive]) => ({
          processorName,
          isActive: isActive !== null,
        })),
        simulationDurationSteps: overallSuccessRateHistory.length,
        transactionLogs: transactionLogs, // Added the transactionLogs
      };
      
      const result: AISummaryOutput = await summarizeSimulation(summaryInput); // Pass only summaryInput
      setSummaryText(result.summaryText);
    } catch (error: any) {
      console.error("Error generating AI summary:", error);
      setSummaryText("Failed to generate summary. Please check the console for errors.");
      toast({ title: "AI Summary Error", description: error.message || "Could not generate summary.", variant: "destructive" });
    } finally {
      setIsSummarizing(false);
    }
  }, [currentControls, processedPaymentsCount, transactionLogs, overallSuccessRateHistory, toast]);

  const handleStopSimulation = useCallback(() => {
    if (simulationState !== 'idle') {
      isStoppingRef.current = true;
      setSimulationState('idle');
      if (apiCallAbortControllerRef.current) apiCallAbortControllerRef.current.abort();
      toast({ title: "Simulation Stopped", description: `Processed ${processedPaymentsCount} payments.` });
      if (transactionLogs.length > 0) {
        handleRequestAiSummary();
      }
    }
  }, [simulationState, processedPaymentsCount, toast, transactionLogs, handleRequestAiSummary]);
  
  // Effect to trigger summary when simulation completes naturally
  useEffect(() => {
    if (
      simulationState === 'idle' &&
      processedPaymentsCount > 0 &&
      currentControls &&
      processedPaymentsCount >= currentControls.totalPayments &&
      transactionLogs.length > 0 &&
      !summaryAttempted // Only attempt if not already attempted for this run
    ) {
       handleRequestAiSummary();
    }
  }, [
      simulationState, 
      processedPaymentsCount, 
      currentControls, 
      transactionLogs, 
      handleRequestAiSummary, 
      summaryAttempted // Add new dependency
  ]);


  const [activeTab, _setActiveTab] = useState("stats");
  const setActiveTab = (newTab: string) => _setActiveTab(newTab);

  return (
    <>
      <AppLayout>
        <Header
          activeTab={activeTab} onTabChange={setActiveTab}
          onStartSimulation={handleStartSimulation} onPauseSimulation={handlePauseSimulation}
          onStopSimulation={handleStopSimulation} simulationState={simulationState}
        />
        <div className="flex flex-row flex-grow overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
          {/* Mini Sidebar */}
          <MiniSidebar
            activeSection={activeSection}
            onSectionChange={(section) => {
              setActiveSection(section);
              setSidebarCollapsed(false); // Always expand when a section is selected
            }}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
          />
          {/* Main Sidebar for selected section, only if not collapsed */}
          {!sidebarCollapsed && (
            <div className="flex flex-col h-full">
              <BottomControlsPanel
                onFormChange={handleControlsChange} merchantConnectors={merchantConnectors}
                connectorToggleStates={connectorToggleStates} onConnectorToggleChange={handleConnectorToggleChange}
                apiKey={apiKey} profileId={profileId} merchantId={merchantId}
                collapsed={sidebarCollapsed}
                onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
                activeTab={activeSection}
              />
            </div>
          )}
          {/* Main and Logs with draggable splitter */}
          {/** @ts-expect-error SplitPane children typing workaround */}
          <SplitPane
            split="vertical"
            minSize={340}
            defaultSize={340}
            primary="second"
            maxSize={typeof window !== 'undefined' ? window.innerWidth - 400 : undefined}
            onChange={size => setMainPaneSize(typeof size === 'number' ? `${size}px` : size)}
            style={{ position: 'relative', height: '100%', flex: 1 }}
          >
            <div className="flex flex-col overflow-hidden h-full">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
                <div className="flex items-center justify-start p-4 pb-0">
                  <TabsList>
                    <TabsTrigger value="stats">
                      <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
                      Stats
                    </TabsTrigger>
                    <TabsTrigger value="analytics">
                      <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>
                      Analytics
                    </TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="stats" className="flex-1 h-full">
                  <ScrollArea className="h-full">
                    <div className="p-2 md:p-4 lg:p-6">
                      <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm p-6 mb-6">
                        <StatsView
                          currentControls={currentControls} merchantConnectors={merchantConnectors} 
                          processedPayments={processedPaymentsCount}
                          totalSuccessful={accumulatedGlobalStatsRef.current.totalSuccessful}
                          totalFailed={accumulatedGlobalStatsRef.current.totalFailed}
                          overallSuccessRateHistory={overallSuccessRateHistory}
                        />
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="analytics" className="flex-1 h-full">
                  <ScrollArea className="h-full">
                    <div className="p-2 md:p-4 lg:p-6">
                      <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm p-6 mb-6">
                        <AnalyticsGraphsView
                          successRateHistory={successRateHistory} volumeHistory={volumeHistory}
                          merchantConnectors={merchantConnectors} connectorToggleStates={connectorToggleStates}
                        />
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </div>
            <div className="border-l border-gray-200 dark:border-border bg-white dark:bg-background flex flex-col overflow-hidden h-full">
              <div className="p-2 md:p-4 lg:p-6 h-full flex flex-col">
                <h2 className="text-lg font-semibold mb-2 flex-shrink-0">Transaction Logs</h2>
                <ScrollArea className="flex-grow">
                  {transactionLogs.length > 0 ? (
                    transactionLogs.map((log, index) => (
                      <div key={log.transactionNumber || index} className="text-xs p-1 border-b font-mono break-all">
                        <span className="mr-2">#{log.transactionNumber}</span>
                        <span className="mr-2 text-gray-500">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}</span>
                        <span className="mr-2 font-semibold">{log.connector}</span>
                        <span className={`mr-2 ${log.status === 'succeeded' || log.status === 'requires_capture' ? 'text-green-600' : 'text-red-600'}`}>{log.status}</span>
                        <span>({log.routingApproach})</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Log entries will appear here...</p>
                  )}
                </ScrollArea>
              </div>
            </div>
          </SplitPane>
        </div>
      </AppLayout>
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

      {/* AI Summary Modal */}
      <Dialog open={isSummaryModalOpen} onOpenChange={setIsSummaryModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Simulation Summary</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] my-4">
            {isSummarizing ? (
              <div className="flex flex-col items-center justify-center h-40">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="mt-4 text-muted-foreground">Generating summary...</p>
              </div>
            ) : (
              // Temporarily reverted to pre tag until react-markdown is installed
              <pre className="font-sans text-sm whitespace-pre-wrap p-1">{summaryText}</pre>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button type="button" onClick={() => setIsSummaryModalOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
