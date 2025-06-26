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
import ReactMarkdown from 'react-markdown';
import type { PaymentMethod, ProcessorMetricsHistory, StructuredRule, ControlsState, OverallSRHistory, OverallSRHistoryDataPoint, TimeSeriesDataPoint, MerchantConnector, TransactionLogEntry, AISummaryInput, AISummaryOutput } from '@/lib/types';
import { PAYMENT_METHODS, /*RULE_STRATEGY_NODES*/ } from '@/lib/constants'; // RULE_STRATEGY_NODES removed
import { useToast } from '@/hooks/use-toast';
import { summarizeSimulation } from '@/ai/flows/summarize-simulation-flow'; // AI Summary Re-added
import SplitPane from 'react-split-pane';
import { MiniSidebar } from '@/components/MiniSidebar';

const SIMULATION_INTERVAL_MS = 50; // Interval between individual payment processing attempts

const LOCALSTORAGE_API_KEY = 'hyperswitch_apiKey';
const LOCALSTORAGE_PROFILE_ID = 'hyperswitch_profileId';
const LOCALSTORAGE_MERCHANT_ID = 'hyperswitch_merchantId';

// Type for the outcome of a single payment processing attempt
interface SinglePaymentOutcome {
  isSuccess: boolean;
  routedProcessorId: string | null;
  logEntry: TransactionLogEntry | null;
}

// The PaymentResult interface seems unused or was intended for a different structure.
// If it's confirmed unused elsewhere, it could be removed. For now, keeping it commented.
// interface PaymentResult {
//   success: boolean;
//   connector: string | null;
//   routingApproach: TransactionLogEntry['routingApproach'];
//   srScores: Record<string, number> | undefined;
//   transactionNumber: number;
//   status: string;
//   timestamp: number;
//   routedProcessorId: string | null;
// }

export default function HomePage() {
  const [currentControls, setCurrentControls] = useState<FormValues | null>(null);
  const [simulationState, setSimulationState] = useState<'idle' | 'running' | 'paused'>('idle');
  const [processedPaymentsCount, setProcessedPaymentsCount] = useState<number>(0);
  const [currentBatchNumber, setCurrentBatchNumber] = useState<number>(0);

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

  const updateRuleConfiguration = useCallback(async (
    merchantId: string,
    explorationPercent: number,
    bucketSize: number
  ) => {
    if (!merchantId) {
      console.warn("[updateRuleConfiguration] Missing merchantId.");
      return;
    }

    const payload = {
      merchant_id: merchantId,
      config: {
        type: "successRate",
        data: {
          defaultLatencyThreshold: 90,
          defaultSuccessRate: 0.5,
          defaultBucketSize: bucketSize,
          defaultHedgingPercent: 5,
          subLevelInputConfig: [
            {
              // paymentMethodType: "card",
              paymentMethod: "card",
              bucketSize: bucketSize,
              hedgingPercent: explorationPercent // Assuming explorationPercent is 0-100, convert to 0-1
            }
          ]
        }
      }
    };

    console.log("[updateRuleConfiguration] Payload:", JSON.stringify(payload, null, 2));

    try {
      const response = await fetch('/api/hs-proxy/rule/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-feature': 'decision-engine'
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to update rule configuration." }));
        console.error("[updateRuleConfiguration] API Error:", errorData.message || `HTTP ${response.status}`);
        toast({ title: "Rule Update Error", description: errorData.message || `HTTP ${response.status}`, variant: "destructive" });
      } else {
        const responseData = await response.json();
        console.log("[updateRuleConfiguration] Response Data:", responseData);
        toast({ title: "Rule Configuration Updated", description: "Success Rate Configuration updated successfully." });
      }
    } catch (error: any) {
      console.error("[updateRuleConfiguration] Fetch Error:", error);
      toast({ title: "Rule Update Network Error", description: error.message, variant: "destructive" });
    }
  }, [toast]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mainPaneSize, setMainPaneSize] = useState('50%');

  const [activeSection, setActiveSection] = useState('general');

  const prevControlsRef = useRef<FormValues | null>(null);

  // Top-level tab: 'intelligent-routing' or 'least-cost-routing'
  const [parentTab, setParentTab] = useState<'intelligent-routing' | 'least-cost-routing'>('intelligent-routing');
  // Content tab: 'stats' or 'analytics', always reset to 'stats' when parentTab changes
  const [contentTab, setContentTab] = useState<'stats' | 'analytics'>('stats');

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

      // Always open the modal on refresh
      console.log("Opening API credentials modal on page load.");
      setIsApiCredentialsModalOpen(true);

      // If credentials were found and set, fetchMerchantConnectors will be called 
      // by handleApiCredentialsSubmit when the modal is submitted,
      // or if the user closes it and they were already valid, subsequent actions might trigger it.
      // For now, we don't auto-fetch here to ensure modal interaction.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  useEffect(() => {
    setContentTab('stats');
  }, [parentTab]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (currentControls && merchantId) {
        const prevControls = prevControlsRef.current;
        const currentExplorationPercent = currentControls.explorationPercent;
        const currentBucketSize = currentControls.bucketSize;

        const prevExplorationPercent = prevControls?.explorationPercent;
        const prevBucketSize = prevControls?.bucketSize;

        // Only call updateRuleConfiguration if explorationPercent or bucketSize have actually changed
        if (
          currentExplorationPercent !== undefined &&
          currentBucketSize !== undefined &&
          (currentExplorationPercent !== prevExplorationPercent || currentBucketSize !== prevBucketSize)
        ) {
          console.log("Exploration percentage or bucket size changed. Updating rule configuration.");
          updateRuleConfiguration(merchantId, currentExplorationPercent, currentBucketSize);
        }
      }
      prevControlsRef.current = currentControls;
    }, 900); // Debounce for 500ms

    return () => {
      clearTimeout(handler);
    };
  }, [currentControls, merchantId, updateRuleConfiguration]);

  // Function to fetch success rates and select the best connector
  const fetchSuccessRateAndSelectConnector = useCallback(async (
    currentControls: FormValues,
    activeConnectorLabels: string[], // Changed to expect an array of connector_name
    currentApiKey: string, // Still needed for other API calls, but not for this one as per user
    currentProfileId: string
  ): Promise<{ selectedConnector: string | null; routingApproach: TransactionLogEntry['routingApproach']; srScores: Record<string, number> | undefined }> => {
    if (!currentControls || activeConnectorLabels.length === 0 || !currentProfileId) { // Removed currentApiKey from check as it's not used here
      console.warn("[FetchSuccessRate] Missing required parameters (controls, labels, or profileId).");
      return { selectedConnector: null, routingApproach: 'unknown', srScores: undefined };
    }

    const payload = {
      id: currentProfileId,
      params: "card",
      labels: activeConnectorLabels, // Use the provided connector_names
      config: { // Specific config for FetchSuccessRate
        min_aggregates_size: currentControls.minAggregatesSize ?? 5, // Using the new form value
        default_success_rate: 100.0, // Removed as per previous changes
        exploration_percent: currentControls.explorationPercent ?? 20.0,
        // max_aggregates_size and current_block_threshold are NOT included here
      },
    };

    console.log("[FetchSuccessRate] Payload:", JSON.stringify(payload, null, 2));

    try {
      const response = await fetch('/api/hs-proxy/dynamic-routing/success_rate.SuccessRateCalculator/FetchSuccessRate', {
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

      let srScoresForLog: Record<string, number> | undefined = undefined;
      if (data.labels_with_score && Array.isArray(data.labels_with_score)) {
        srScoresForLog = data.labels_with_score.reduce((acc: Record<string, number>, item: any) => {
          if (item && typeof item.label === 'string' && typeof item.score === 'number') {
            acc[item.label] = parseFloat(item.score.toFixed(2)); // Keep scores with 2 decimal places
          }
          return acc;
        }, {});
      }

      if (typeof data.routing_approach === 'number') {
        if (data.routing_approach === 0) {
          routingApproachForLog = 'exploration';
        } else if (data.routing_approach === 1) {
          routingApproachForLog = 'exploitation';
        }
      }
      console.log(`[FetchSuccessRate] Determined routing approach: ${routingApproachForLog}`);


      if (data.labels_with_score && data.labels_with_score.length > 0) {
        // Sort connectors by score in descending order
        // const sortedConnectors = data.labels_with_score.sort((a: any, b: any) => b.score - a.score);
        const bestConnector = data.labels_with_score[0]; // Pick the first one (highest score)

        console.log(`[FetchSuccessRate] Selected connector: ${bestConnector.label} with score ${bestConnector.score}`);
        return { selectedConnector: bestConnector.label, routingApproach: routingApproachForLog, srScores: srScoresForLog };
      } else {
        console.warn("[FetchSuccessRate] No scores returned or empty list.");
        toast({ title: "Fetch Success Rate Info", description: "No connector scores returned by the API." });
        return { selectedConnector: null, routingApproach: routingApproachForLog, srScores: srScoresForLog };
      }
    } catch (error: any) {
      console.error("[FetchSuccessRate] Fetch Error:", error);
      toast({ title: "Fetch Success Rate Network Error", description: error.message, variant: "destructive" });
      return { selectedConnector: null, routingApproach: 'unknown', srScores: undefined };
    }
  }, [toast]);

  const decideGateway = useCallback(async (
    currentControls: FormValues,
    activeConnectorLabels: string[], // Changed to expect an array of connector_name
    currentApiKey: string, // Still needed for other API calls, but not for this one as per user
    currentMerchantId: string,
    paymentId: string // Added paymentId to the parameters
  ): Promise<{ selectedConnector: string | null; routingApproach: TransactionLogEntry['routingApproach']; srScores: Record<string, number> | undefined }> => {
    if (!currentControls || activeConnectorLabels.length === 0 || !currentMerchantId) { // Removed currentApiKey from check as it's not used here
      console.warn("[decideGateway] Missing required parameters (controls, labels, or merchantId).");
      return { selectedConnector: null, routingApproach: 'unknown', srScores: undefined };
    }


    const payload = {
      merchantId: currentMerchantId,
      eligibleGatewayList: activeConnectorLabels,
      rankingAlgorithm: "SR_BASED_ROUTING",
      eliminationEnabled: false,
      paymentInfo: {
        paymentId: paymentId,
        amount: 100.50,
        currency: "USD",
        customerId: "CUST12345",
        udfs: null,
        preferredGateway: null,
        paymentType: "ORDER_PAYMENT",
        metadata: null,
        internalMetadata: null,
        isEmi: false,
        emiBank: null,
        emiTenure: null,
        paymentMethodType: "UPI",
        paymentMethod: "UPI_PAY",
        paymentSource: null,
        authType: null,
        cardIssuerBankName: null,
        cardIsin: null,
        cardType: null,
        cardSwitchProvider: null
      }
    };

    console.log("[decideGateway] Payload:", JSON.stringify(payload, null, 2));

    try {
      const response = await fetch('/api/hs-proxy/decide-gateway', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-feature': 'decision-engine'
        },
        body: JSON.stringify(payload),
      });

      let routingApproachForLog: TransactionLogEntry['routingApproach'] = 'unknown';

      const data = await response.json();
      console.log("[decideGateway] Response Data:", data);

      console.log("gateway_priority_map for decision_engine :", data.gateway_priority_map);

      let gatewayPriorityArray: Array<{ label: string; score: number }> = [];
      if (data.gateway_priority_map && typeof data.gateway_priority_map === 'object' && !Array.isArray(data.gateway_priority_map)) {
        for (const gatewayName in data.gateway_priority_map) {
          if (Object.prototype.hasOwnProperty.call(data.gateway_priority_map, gatewayName)) {
            const score = data.gateway_priority_map[gatewayName];
            if (typeof score === 'number') {
              gatewayPriorityArray.push({ label: gatewayName, score: parseFloat(score.toFixed(2)) });
            }
          }
        }
      }
      // console.log("[decideGateway] Converted gatewayPriorityArray:", gatewayPriorityArray);

      let srScoresForLog: Record<string, number> | undefined = undefined;
      if (gatewayPriorityArray.length > 0) {
        srScoresForLog = gatewayPriorityArray.reduce((acc: Record<string, number>, item) => {
          acc[item.label] = item.score * 100;
          return acc;
        }, {});
      }

      if (data.routing_approach === 'SR_SELECTION_V3_ROUTING') {
        routingApproachForLog = 'exploitation';
      } else {
        routingApproachForLog = 'exploration'; // Or any other appropriate default/mapping
      }
      console.log(`[decideGateway] Determined routing approach: ${routingApproachForLog}`);

      if (data.decided_gateway && srScoresForLog && srScoresForLog[data.decided_gateway] !== undefined) {
        const bestConnectorName = data.decided_gateway;
        const bestConnectorScore = srScoresForLog[bestConnectorName];

        console.log(`[decideGateway] Selected connector: ${bestConnectorName} with score ${bestConnectorScore}`);
        return { selectedConnector: bestConnectorName, routingApproach: routingApproachForLog, srScores: srScoresForLog };
      } else if (data.decided_gateway) {
        console.warn(`[decideGateway] decided_gateway '${data.decided_gateway}' not found in processed scores or scores are missing.`);
        // Return the decided_gateway name; srScoresForLog might be incomplete or the specific score missing
        return { selectedConnector: data.decided_gateway, routingApproach: routingApproachForLog, srScores: srScoresForLog };
      } else {
        console.warn("[decideGateway] No decided_gateway returned or gateway_priority_map was empty/invalid.");
        toast({ title: "Decide Gateway Info", description: "No connector decided or scores missing." });
        return { selectedConnector: null, routingApproach: routingApproachForLog, srScores: srScoresForLog };
      }
    } catch (error: any) {
      console.error("[decideGateway] Fetch Error:", error);
      toast({ title: "Decide Gateway Network Error", description: error.message, variant: "destructive" });
      return { selectedConnector: null, routingApproach: 'unknown', srScores: undefined };
    }
  }, [toast]);


  const updateGatewayScore = useCallback(async (
    currentMerchantId: string,
    connectorNameForApi: string, // This should be the connector_name
    paymentSuccessStatus: boolean,
    controls: FormValues | null, // Pass currentControls to access config values
    paymentId: string
  ) => {
    if (!currentMerchantId || !connectorNameForApi) {
      console.warn("[UpdateSuccessRateWindow] Missing profileId or connectorName.");
      return;
    }
    if (!controls) {
      console.warn("[UpdateSuccessRateWindow] Missing controls data, cannot construct config.");
      return;
    }

    const apiStatus = paymentSuccessStatus ? "CHARGED" : "FAILURE";
    const payload = {
      merchantId: currentMerchantId,
      gateway: connectorNameForApi,
      gatewayReferenceId: null,
      status: apiStatus,
      paymentId: paymentId,
      enforceDynamicRoutingFailure: null
    };

    console.log("[UpdateSuccessRateWindow] Payload:", JSON.stringify(payload, null, 2));

    try {
      const response = await fetch('/api/hs-proxy/update-gateway-score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-feature': 'decision-engine'
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Failed to update success rate window" }));
        console.error("[UpdateSuccessRateWindow] API Error:", errorData.message || `HTTP ${response.status}`);
        // toast({ title: "Update SR Window Error", description: errorData.message || `HTTP ${response.status}`, variant: "destructive" });
      } else {
        const responseDataText = await response.text();
        if (responseDataText.trim() === "Success") {
          console.log(`[UpdateSuccessRateWindow] API reported success for connector ${connectorNameForApi}. Response: "Success"`);
        } else {
          try {
            const updateData = responseDataText ? JSON.parse(responseDataText) : null;
            // Assuming if it's JSON, it might have a different structure or message field
            if (updateData && updateData.message === "Success") { // Or any other field indicating success in JSON
              console.log(`[UpdateSuccessRateWindow] API reported success (JSON) for connector ${connectorNameForApi}. Full response:`, updateData);
            } else {
              console.warn(`[UpdateSuccessRateWindow] API reported non-success or unexpected JSON for connector ${connectorNameForApi}. Full response:`, updateData || responseDataText);
            }
          } catch (jsonParseError) {
            console.error(`[UpdateSuccessRateWindow] Failed to parse JSON response for ${connectorNameForApi}, and not plain "Success". HTTP Status: ${response.status}. Response text:`, responseDataText, jsonParseError);
          }
        }
      }
    } catch (error: any) {
      console.error("[UpdateSuccessRateWindow] Fetch Error:", error);
      // toast({ title: "Update SR Window Network Error", description: error.message, variant: "destructive" });
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
          duration_in_mins: controls.currentBlockThresholdDurationInMins ?? 60,
          max_total_count: controls.currentBlockThresholdMaxTotalCount ?? 20,
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
        // toast({ title: "Update SR Window Error", description: errorData.message || `HTTP ${response.status}`, variant: "destructive" });
      } else {
        const responseDataText = await response.text(); // Get text first to avoid issues with empty/non-JSON
        console.log(`[UpdateSuccessRateWindow] Response text for ${connectorNameForApi}:`, responseDataText);
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
      // toast({ title: "Update SR Window Network Error", description: error.message, variant: "destructive" });
    }
  }, [toast]);


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

  const createMerchantIdForDecisionEngine = async (currentMerchantId: string): Promise<string | void> => {
    if (!currentMerchantId) {
      console.warn("[createMerchantIdForDecisionEngine] Missing currentMerchantId. Cannot create decision engine merchant ID.");
      return; 
    }

    setIsLoadingMerchantConnectors(true); 

    try {
      const response = await fetch('/api/hs-proxy/merchant-account/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-feature': 'decision-engine'
        },
        body: JSON.stringify({
          merchant_id: currentMerchantId,
        }),
      });

      let data: any = {}; // Initialize data to an empty object
      try {
        data = await response.json(); // Attempt to parse JSON for logging
      } catch (e) {
        console.warn("[createMerchantIdForDecisionEngine] Failed to parse JSON response body, or body was empty.", e);
        // data remains {}
      }
      
      console.log("[createMerchantIdForDecisionEngine] API Response Status:", response.status, "Response Data:", data);

      if (response.ok) { // Primary check: HTTP status indicates success (e.g., 200-299)
        console.log(`[createMerchantIdForDecisionEngine] Merchant account creation API call successful (HTTP ${response.status}).`);
        
        // Optional: Further check based on expected body content like data.ok
        if (data && data.ok === true) {
             console.log("[createMerchantIdForDecisionEngine] Confirmation: data.ok is true.");
             toast({ title: "Decision Engine Setup", description: "Merchant account for decision engine confirmed.", variant: "default" }); // Changed "success" to "default"
        } else if (data && data.ok === false) {
            console.warn("[createMerchantIdForDecisionEngine] Warning: HTTP call successful, but response body indicates data.ok is false. Body:", data);
            toast({ title: "Decision Engine Setup", description: "Merchant account for decision engine initiated (API reported specific status).", variant: "default" });
        } else {
            console.log("[createMerchantIdForDecisionEngine] Info: HTTP call successful. Response body did not contain 'ok' field or it was not boolean. Body:", data);
            toast({ title: "Decision Engine Setup", description: "Merchant account for decision engine initiated.", variant: "default" });
        }
        return currentMerchantId; // Return the merchant ID as string
      } else {
        // HTTP error (e.g., 4xx, 5xx)
        const errorMessage = data?.message || data?.error?.message || `API Error HTTP ${response.status}`;
        console.error(`[createMerchantIdForDecisionEngine] API Error HTTP ${response.status}:`, errorMessage, "Full data:", data);
        toast({ title: "Decision Engine Setup Failed", description: errorMessage, variant: "destructive" });
        // Implicitly returns undefined
      }
    } catch (error: any) { // Catch network errors or other unexpected issues
      console.error("[createMerchantIdForDecisionEngine] Exception during API call:", error);
      toast({ title: "Network Error", description: `Failed to set up decision engine merchant: ${error.message}`, variant: "destructive" });
      // Implicitly returns undefined
    } finally {
      setIsLoadingMerchantConnectors(false);
    }
    // If function reaches here, it means an error occurred or response.ok was false,
    // and currentMerchantId was not returned. So, it returns undefined.
  }

  const createSrRuleForDecisonEngine = async (currentMerchantId: string): Promise<string | null> => {
    if (!currentMerchantId) {
      console.warn("[createSrRuleForDecisonEngine] Missing currentMerchantId.");
      return null;
    }
    const payload = {
      merchant_id: currentMerchantId,
      config: {
        type: "successRate",
        data: {
          defaultLatencyThreshold: 90,
          defaultSuccessRate: 0.5,
          defaultBucketSize: 200,
          defaultHedgingPercent: 5,
          subLevelInputConfig: [
            {
              paymentMethodType: "upi",
              paymentMethod: "upi_collect",
              bucketSize: 250,
              hedgingPercent: 1
            }
          ]
        }
      }
    }
    try {
      const response = await fetch('/api/hs-proxy/rule/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-feature': 'decision-engine'
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      console.log("[SR Rule for decision engine] Response Data:", data);
      if (data.ok) {
        console.log("[SR Rule create] SR rule created successfully.");
        toast({ title: "[Rule creation for Decision engine]", description: "Rule created successfully." });
      }
    } catch (error) {
      console.error("[SR Rule create] Error creating SR rule:", error);
      toast({ title: "SR Rule Creation Error", description: String(error), variant: "destructive" });
    } finally {
      setIsLoadingMerchantConnectors(false);
    }
    return null; // Ensure a return statement for all code paths
  }

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
      const connectorWiseFailurePercentage: FormValues['connectorWiseFailurePercentage'] = {};

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
        const base = prev ? { ...prev } : {
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
          isSuccessBasedRoutingEnabled: true, // Default to true
        } as FormValues;

        return {
          ...base,
          processorWiseSuccessRates: initialProcessorWiseSuccessRates,
          processorIncidents: initialProcessorIncidents,
          processorMatrix: initialProcessorMatrix,
          overallSuccessRate: base.overallSuccessRate || 0,
          // Preserve existing connectorWiseFailurePercentage if 'prev' exists, otherwise use the new empty one.
          // The local 'connectorWiseFailurePercentage' const is always {} here.
          // We want to use 'prev.connectorWiseFailurePercentage' if available.
          connectorWiseFailurePercentage: prev?.connectorWiseFailurePercentage ? prev.connectorWiseFailurePercentage : connectorWiseFailurePercentage,
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

  const handleApiCredentialsSubmit = async () => {
    if (!apiKey || !profileId || !merchantId) {
      toast({ title: "API Credentials Required", description: "Please enter all API credentials.", variant: "destructive" });
      return;
    }
    const localStoragemerchnatId = localStorage.getItem(LOCALSTORAGE_MERCHANT_ID);
    
    if(localStoragemerchnatId === merchantId){
      setIsApiCredentialsModalOpen(false);
      fetchMerchantConnectors(merchantId, apiKey);
    }
    else{
      setIsApiCredentialsModalOpen(false);
      fetchMerchantConnectors(merchantId, apiKey);
      const decisionEngineMerchantId = await createMerchantIdForDecisionEngine(merchantId);
      console.log(">>>Merchant ID for Decision Engine:", decisionEngineMerchantId);
      if (decisionEngineMerchantId) {
        createSrRuleForDecisonEngine(decisionEngineMerchantId);
      }
    }
    

      localStorage.setItem(LOCALSTORAGE_API_KEY, apiKey);
      localStorage.setItem(LOCALSTORAGE_PROFILE_ID, profileId);
      localStorage.setItem(LOCALSTORAGE_MERCHANT_ID, merchantId);
    
  };

  const resetSimulationState = () => {
    setProcessedPaymentsCount(0);
    setCurrentBatchNumber(0);
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
          numberOfBatches: 100, // New batch processing field
          batchSize: 10, // New batch processing field
          isSuccessBasedRoutingEnabled: true, // Default to true
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

  // Helper function to process a single payment
  const processSinglePayment = useCallback(async (
    paymentIndex: number,
    signal: AbortSignal
  ): Promise<SinglePaymentOutcome> => {
    if (!currentControls || !apiKey || !profileId || !merchantId) { // Added merchantId check
      throw new Error('Missing required configuration: currentControls, apiKey, profileId, or merchantId');
    }

    const paymentMethodForAPI = "card";
    // Generate paymentId early as it's needed by decideGateway and paymentData
    const paymentId = `PAY${Math.floor(Math.random() * 100000)}_${paymentIndex}`; 

    let connectorNameToUseForCardSR: string = ""; // Default to empty string (global/0% failure unless "" is configured)
    let routingApproach: TransactionLogEntry['routingApproach'] = 'N/A';
    let returnedConnectorLabel: string | null = null;
    let srScores: Record<string, number> | undefined = undefined;

    const activeConnectorLabels = merchantConnectors
      .filter(mc => connectorToggleStates[mc.merchant_connector_id || mc.connector_name])
      .map(mc => mc.connector_name);

    if (currentControls.isSuccessBasedRoutingEnabled) {
      // Ensure all prerequisites for decideGateway are met
      if (activeConnectorLabels.length > 0 && profileId && merchantId && apiKey) {
        const decisionResult = await decideGateway(
          currentControls,
          activeConnectorLabels,
          apiKey,
          merchantId,
          paymentId // Pass the generated paymentId
        );
        returnedConnectorLabel = decisionResult.selectedConnector;
        routingApproach = decisionResult.routingApproach;
        srScores = decisionResult.srScores;

        if (returnedConnectorLabel) {
          const matchedConnector = merchantConnectors.find(mc => mc.connector_name === returnedConnectorLabel);
          if (matchedConnector) {
            connectorNameToUseForCardSR = matchedConnector.connector_name;
          } else {
            // SBR returned a label, but it's not in our merchantConnectors list.
            console.warn(`[ProcessSinglePayment] SBR: Connector label '${returnedConnectorLabel}' from decideGateway not found in local merchantConnectors. Using SR of first active connector if available.`);
            if (activeConnectorLabels.length > 0) { // Fallback to first active if match fails
              connectorNameToUseForCardSR = activeConnectorLabels[0];
            }
            // If no active connectors, connectorNameToUseForCardSR remains ""
          }
        } else {
          // SBR is on, but decideGateway returned no connector.
          console.warn(`[ProcessSinglePayment] SBR: decideGateway returned no connector. Using SR of first active connector if available.`);
          if (activeConnectorLabels.length > 0) { // Fallback to first active if decideGateway returns null
            connectorNameToUseForCardSR = activeConnectorLabels[0];
          }
          // If no active connectors, connectorNameToUseForCardSR remains ""
        }
      } else {
        // SBR is on, but cannot call decideGateway due to missing prerequisites.
        console.warn(`[ProcessSinglePayment] SBR: Cannot call decideGateway (missing prerequisites: active connectors, profileId, merchantId, or apiKey). Using SR of first active connector if available.`);
        if (activeConnectorLabels.length > 0) { // Fallback if decideGateway cannot be called
            connectorNameToUseForCardSR = activeConnectorLabels[0];
        }
        // else connectorNameToUseForCardSR remains ""
      }
    }
    // If SBR is OFF, connectorNameToUseForCardSR remains "" (defaulting to 0% failure unless "" is specifically configured in connectorWiseFailurePercentage).

    // Determine card details using the resolved connector name (or "" if it remains the default)
    const cardDetailsForPayment = getCarddetailsForPayment(currentControls, connectorNameToUseForCardSR);

    const paymentData = {
      amount: 6540,
      payment_id: paymentId, // Use the generated paymentId
      currency: "USD",
      confirm: true,
      profile_id: profileId,
      capture_method: "automatic",
      authentication_type: "no_three_ds",
      customer: {
        id: `cus_sim_${Date.now()}_${paymentIndex}`,
        name: "John Doe",
        email: "customer@example.com",
        phone: "9999999999",
        phone_country_code: "+1"
      },
      payment_method: paymentMethodForAPI,
      payment_method_type: "credit",
      payment_method_data: {
        card: cardDetailsForPayment, // Use card details determined by the new logic
        billing: {
          address: {
            line1: "1467",
            line2: "Harrison Street",
            line3: "Harrison Street",
            city: "San Francisco",
            state: "California",
            zip: "94122",
            country: "US",
            first_name: "Joseph",
            last_name: "Doe"
          },
          phone: { number: "8056594427", country_code: "+91" },
          email: "guest@example.com"
        }
      },
    };


    // Apply .routing object to paymentData if SBR was enabled and resulted in a specific connector selection
    if (currentControls.isSuccessBasedRoutingEnabled && returnedConnectorLabel) {
        const matchedConnectorForRoutingObject = merchantConnectors.find(mc => mc.connector_name === returnedConnectorLabel);
        if (matchedConnectorForRoutingObject) { // Ensure connector is valid before adding routing object
             (paymentData as any).routing = {
                type: "single",
                data: {
                    connector: matchedConnectorForRoutingObject.connector_name,
                    merchant_connector_id: matchedConnectorForRoutingObject.merchant_connector_id
                }
            };
        }
    }

    // Make payment request
    let isSuccess = false;
    let routedProcessorId: string | null = null;
    let logEntry: TransactionLogEntry | null = null;

    try {
      const response = await fetch('/api/hs-proxy/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'api-key': apiKey
        },
        body: JSON.stringify(paymentData),
        signal,
      });

      const paymentStatusHeader = response.headers.get('x-simulation-payment-status');
      const connectorHeader = response.headers.get('x-simulation-payment-connector');
      const responseData = await response.json();

      isSuccess = response.ok && (
        responseData.status === 'succeeded' ||
        responseData.status === 'requires_capture' ||
        responseData.status === 'processing'
      );

      // Create log entry
      let payment_id = responseData.payment_id;
      let loggedConnectorName = connectorHeader || responseData.connector_name || responseData.merchant_connector_id || 'unknown';
      if (paymentStatusHeader || responseData.status) {
        transactionCounterRef.current += 1;
        logEntry = {
          transactionNumber: transactionCounterRef.current,
          status: paymentStatusHeader || responseData.status,
          connector: loggedConnectorName,
          timestamp: Date.now(),
          routingApproach,
          sr_scores: srScores,
        };
      }

      // Determine routedProcessorId
      if (responseData.connector_name) {
        const mc = merchantConnectors.find(m => m.connector_name === responseData.connector_name);
        if (mc) routedProcessorId = mc.merchant_connector_id || mc.connector_name;
      } else if (responseData.merchant_connector_id) {
        routedProcessorId = responseData.merchant_connector_id;
      }

      if (!routedProcessorId && loggedConnectorName !== 'unknown') {
        const mc = merchantConnectors.find(m => m.connector_name === loggedConnectorName);
        if (mc) routedProcessorId = mc.merchant_connector_id || mc.connector_name;
        else routedProcessorId = loggedConnectorName;
      }
      
      // Update success rate window
      // if (profileId && loggedConnectorName !== 'unknown') {
      //   const foundConnector = merchantConnectors.find(mc =>
      //     mc.connector_name === loggedConnectorName || mc.merchant_connector_id === loggedConnectorName
      //   );
      //   const connectorNameForUpdate = foundConnector ? foundConnector.connector_name : loggedConnectorName;
      //   await updateSuccessRateWindow(profileId, connectorNameForUpdate, isSuccess, currentControls);
      // }
      if (merchantId && loggedConnectorName !== 'unknown') {
        const foundConnector = merchantConnectors.find(mc =>
          mc.connector_name === loggedConnectorName || mc.merchant_connector_id === loggedConnectorName
        );
        const connectorNameForUpdate = foundConnector ? foundConnector.connector_name : loggedConnectorName;
        await updateGatewayScore(merchantId, connectorNameForUpdate, isSuccess, currentControls, payment_id);
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error("Error during payment API call:", error);
      }
      throw error;
    }

    return { isSuccess, routedProcessorId, logEntry };
  }, [currentControls, apiKey, profileId, merchantId, merchantConnectors, connectorToggleStates, fetchSuccessRateAndSelectConnector, updateSuccessRateWindow,updateGatewayScore,decideGateway]);

  const getCarddetailsForPayment = (currentControls: FormValues, connectorNameToUse: string): any => {
    let cardDetailsToUse;
    const randomNumber = Math.random() * 100;

    // Determine failure percentage: connector-specific first, then fallback (though -1 implies global won't be used directly here)
    // The logic is: if connectorNameToUse is provided, use its specific failure rate.
    // If connectorNameToUse is empty (e.g. SBR off, or no connector chosen by SBR), this implies a scenario
    // where a global failure rate might apply, but the current structure of connectorWiseFailurePercentage
    // means we'd need a global entry or a different mechanism for a truly global failure rate not tied to a connector.
    // For now, if connectorNameToUse is empty, it will effectively use a 0% failure rate unless a global default is explicitly set.
    // A more robust global fallback for failure percentage might be needed if that's a desired scenario.
    const failurePercentageForConnector = currentControls.connectorWiseFailurePercentage?.[connectorNameToUse];
    // If no specific connector is provided, or no specific failure rate is set for it, we might default to 0 or a global setting.
    // For this implementation, if connectorNameToUse is empty or not in the map, failurePercentageForConnector will be undefined.
    // We'll treat undefined as "use success card" unless a global failure rate is explicitly defined and used.
    // The original code used -1 which effectively meant "always success" if no connector was matched.
    // Let's make it explicit: if no connector name, or no failure % for it, assume 0% failure for card selection.
    const effectiveFailurePercentage = typeof failurePercentageForConnector === 'number' ? failurePercentageForConnector : 0;

    console.log(`[FR]: Connector: '${connectorNameToUse || 'GLOBAL/NONE'}', Random: ${randomNumber.toFixed(2)}, Effective Fail Rate: ${effectiveFailurePercentage}%`);

    const connectorCards = currentControls.connectorWiseTestCards?.[connectorNameToUse];

    if (randomNumber < effectiveFailurePercentage) {
      // Use failure card: connector-specific if available, else hardcoded fallback
      cardDetailsToUse = {
        card_number: connectorCards?.failureCard?.cardNumber || "4000000000000002",
        card_exp_month: connectorCards?.failureCard?.expMonth || "12",
        card_exp_year: connectorCards?.failureCard?.expYear || "26",
        card_holder_name: connectorCards?.failureCard?.holderName || "Jane Roe",
        card_cvc: connectorCards?.failureCard?.cvc || "999",
      };
      console.log(`[FR]: Using FAILURE card for ${connectorNameToUse || 'NONE (defaulting to hardcoded failure)'}`);
    } else {
      // Use success card: connector-specific if available, else hardcoded fallback
      cardDetailsToUse = {
        card_number: connectorCards?.successCard?.cardNumber || "4242424242424242",
        card_exp_month: connectorCards?.successCard?.expMonth || "10",
        card_exp_year: connectorCards?.successCard?.expYear || "25",
        card_holder_name: connectorCards?.successCard?.holderName || "Joseph Doe",
        card_cvc: connectorCards?.successCard?.cvc || "123",
      };
      console.log(`[FR]: Using SUCCESS card for ${connectorNameToUse || 'NONE (defaulting to hardcoded success)'}`);
    }
    return cardDetailsToUse;
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
          toast({ title: "Credentials Missing", description: "Enter API Key, Profile ID, and Merchant ID.", variant: "destructive" });
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

      // Use batch size from controls or default to 1
      const batchSize = currentControls.batchSize || 1;
      const remainingPayments = currentControls.totalPayments - processedPaymentsCount;
      const paymentsToProcessInBatch = Math.min(batchSize, remainingPayments);

      if (paymentsToProcessInBatch <= 0) return;

      // Create array of payment indices for this batch
      const batchIndices = Array.from({ length: paymentsToProcessInBatch }, (_, i) => processedPaymentsCount + i);

      let paymentsProcessedThisBatch = 0;
      let batchResults: SinglePaymentOutcome[] = []; // Use SinglePaymentOutcome[]
      const batchSpecificProcessorStats: Record<string, { successful: number; failed: number }> = {};

      try {
        // Process payments in parallel using Promise.all
        batchResults = await Promise.all(
          batchIndices.map(paymentIndex =>
            processSinglePayment(paymentIndex, signal)
              // Catch ensures Promise.all doesn't fail fast, allowing processing of other results
              .catch(error => {
                if (error.name === 'AbortError') throw error; // Re-throw AbortError to stop batch
                console.error(`Error processing payment ${paymentIndex}:`, error);
                // Return a structure consistent with SinglePaymentOutcome for failed/errored payments
                return { isSuccess: false, routedProcessorId: null, logEntry: null };
              })
          )
        );

        if (isStoppingRef.current || signal.aborted) return;

        // Update transaction logs and cumulative/batch statistics
        const newLogsForThisBatch: TransactionLogEntry[] = [];
        batchResults.forEach(result => {
          if (result.logEntry) {
            newLogsForThisBatch.push(result.logEntry);
          }

          // Populate batchSpecificProcessorStats
          if (result.routedProcessorId) {
            if (!batchSpecificProcessorStats[result.routedProcessorId]) {
              batchSpecificProcessorStats[result.routedProcessorId] = { successful: 0, failed: 0 };
            }
            if (result.isSuccess) { // Use isSuccess from SinglePaymentOutcome
              batchSpecificProcessorStats[result.routedProcessorId].successful++;
            } else {
              batchSpecificProcessorStats[result.routedProcessorId].failed++;
            }
          }

          // Update overall cumulative stats (accumulatedProcessorStatsRef and accumulatedGlobalStatsRef)
          if (result.routedProcessorId) {
            if (!accumulatedProcessorStatsRef.current[result.routedProcessorId]) {
              accumulatedProcessorStatsRef.current[result.routedProcessorId] = { successful: 0, failed: 0, volumeShareRaw: 0 };
            }
            if (result.isSuccess) {
              accumulatedProcessorStatsRef.current[result.routedProcessorId].successful++;
            } else {
              accumulatedProcessorStatsRef.current[result.routedProcessorId].failed++;
            }
          }

          if (result.isSuccess) {
            accumulatedGlobalStatsRef.current.totalSuccessful++;
          } else {
            accumulatedGlobalStatsRef.current.totalFailed++;
          }

          paymentsProcessedThisBatch++;
        });

        if (newLogsForThisBatch.length > 0) {
          setTransactionLogs(prevLogs => [...prevLogs, ...newLogsForThisBatch]);
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log("Batch processing aborted");
          return;
        }
        console.error("Error in batch processing:", error);
      }

      // The redundant loop and declaration for batchSpecificProcessorStats that was here has been removed.
      // batchSpecificProcessorStats is now declared and populated correctly within the single batchResults.forEach loop inside the try block.

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

          // Calculate discrete (per-batch) success rates and cumulative volumes
          merchantConnectors.forEach(connector => {
            const key = connector.merchant_connector_id || connector.connector_name;

            // Discrete success rate for the batch
            const batchStats = batchSpecificProcessorStats[key] || { successful: 0, failed: 0 };
            const batchTotalForProcessor = batchStats.successful + batchStats.failed;
            newSuccessRateDataPoint[key] = batchTotalForProcessor > 0 ? (batchStats.successful / batchTotalForProcessor) * 100 : 0;

            // Cumulative volume (original logic)
            const cumulativeStats = accumulatedProcessorStatsRef.current[key] || { successful: 0, failed: 0 };
            const cumulativeTotalForProcessor = cumulativeStats.successful + cumulativeStats.failed;
            newVolumeDataPoint[key] = cumulativeTotalForProcessor;
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
                ...(newPwsr[procId] || { sr: 0, srDeviation: 0, volumeShare: 0, successfulPaymentCount: 0, totalPaymentCount: 0 }),
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
    console.log("useEffect: Mounting, checking API credentials.");
    if (simulationState == 'running') {
      processTransactionBatch();
    }
  }, [simulationState, processTransactionBatch]);

  const handleStartSimulation = useCallback(async (forceStart = false) => {
    const previousSimulationState = simulationState; // Capture state before any changes
    console.log(`handleStartSimulation called. Current state: ${previousSimulationState}, forceStart: ${forceStart}`);

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
        numberOfBatches: 100, // New batch processing field
        batchSize: 10, // New batch processing field
        connectorWiseFailurePercentage: {}, // Initialize empty
        isSuccessBasedRoutingEnabled: true, // Default to true
      });
    } else if (!currentControls) {
      toast({ title: "Error", description: "Control data not available.", variant: "destructive" });
      return;
    }

    if (previousSimulationState === 'idle' || forceStart) {
      console.log("Resetting simulation state.");
      resetSimulationState();
    } else {
      console.log("Not resetting simulation state (resuming or already running).");
    }

    isStoppingRef.current = false;
    isProcessingBatchRef.current = false;
    setSimulationState('running');
    // Use previousSimulationState for the toast message to accurately reflect the action taken
    toast({ title: `Simulation ${previousSimulationState === 'idle' || forceStart ? 'Started' : 'Resumed'}`, description: `Processing ${currentControls?.totalPayments || 0} payments.` });
  }, [currentControls, apiKey, profileId, merchantId, merchantConnectors, toast, simulationState]); // simulationState is still a dependency for useCallback re-creation if needed by other parts of its logic, even if previousSimulationState is used for the toast.

  const handlePauseSimulation = useCallback(() => {
    if (simulationState === 'running') {
      isStoppingRef.current = true;
      setSimulationState('paused');
      if (apiCallAbortControllerRef.current) apiCallAbortControllerRef.current.abort();
      toast({ title: "Simulation Paused" });
    }
  }, [simulationState, toast]);

  // New function to execute the summary
  const executeAiSummary = useCallback(async () => {
    if (!currentControls || transactionLogs.length === 0) {
      // Should have been checked by handleRequestAiSummary, but good for safety
      toast({ title: "Error", description: "Missing data for summary.", variant: "destructive" });
      return;
    }

    setIsSummaryModalOpen(true);
    setIsSummarizing(true);
    setSummaryText('');
    // summaryAttempted is set by handleRequestAiSummary

    try {
      console.log("Executing AI summary.");
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
        transactionLogs: transactionLogs,
      };

      const result: AISummaryOutput = await summarizeSimulation(summaryInput);
      setSummaryText(result.summaryText);
    } catch (error: any) {
      console.error("Error generating AI summary:", error);
      setSummaryText("Failed to generate summary. Please check the console for errors.");
      toast({ title: "AI Summary Error", description: error.message || "Could not generate summary.", variant: "destructive" });
    } finally {
      setIsSummarizing(false);
    }
  }, [currentControls, processedPaymentsCount, transactionLogs, overallSuccessRateHistory, toast, accumulatedGlobalStatsRef, accumulatedProcessorStatsRef, setIsSummaryModalOpen, setIsSummarizing, setSummaryText]);


  const handleRequestAiSummary = useCallback(() => {
    if (!currentControls) {
      toast({ title: "Error", description: "Cannot generate summary without simulation data.", variant: "destructive" });
      return;
    }
    if (transactionLogs.length === 0) {
      toast({ title: "No Data", description: "No transactions logged to summarize." });
      return;
    }

    setSummaryAttempted(true); // Mark that an attempt to get summary has started
    executeAiSummary(); // Directly call summary generation
  }, [currentControls, transactionLogs, toast, setSummaryAttempted, executeAiSummary]);

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

  return (
    <>
      <AppLayout>
        <div className={parentTab === 'least-cost-routing' ? 'theme-least-cost' : 'theme-intelligent'}>
          <Header
            activeTab={parentTab}
            onTabChange={tab => setParentTab(tab as 'intelligent-routing' | 'least-cost-routing')}
            onStartSimulation={handleStartSimulation} onPauseSimulation={handlePauseSimulation}
            onStopSimulation={handleStopSimulation} simulationState={simulationState}
          />
          <div
            className={`flex flex-row flex-grow overflow-hidden`}
            style={{ height: 'calc(100vh - 64px)' }}
          >
            {/* Mini Sidebar */}
            <MiniSidebar
              activeSection={activeSection}
              onSectionChange={(section) => {
                setActiveSection(section);
                setSidebarCollapsed(false);
              }}
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed(c => !c)}
            />
            {/* Main Sidebar for selected section, only if not collapsed */}
            {!sidebarCollapsed && (
              <div className="flex flex-col min-h-screen h-auto overflow-y-auto">
                <BottomControlsPanel
                  onFormChange={handleControlsChange}
                  merchantConnectors={merchantConnectors}
                  connectorToggleStates={connectorToggleStates}
                  onConnectorToggleChange={handleConnectorToggleChange}
                  apiKey={apiKey}
                  profileId={profileId}
                  merchantId={merchantId}
                  collapsed={sidebarCollapsed}
                  onToggleCollapse={() => setSidebarCollapsed(c => !c)}
                  activeTab={activeSection}
                  parentTab={parentTab}
                />
              </div>
            )}
            {/* Main and Logs with draggable splitter */}
            {/* @ts-ignore */}
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
                <Tabs value={contentTab} onValueChange={tab => setContentTab(tab as 'stats' | 'analytics')} className="flex flex-col h-full">
                  <div className="flex items-center justify-start p-4 pb-0">
                    <TabsList>
                      <TabsTrigger value="stats">Stats</TabsTrigger>
                      <TabsTrigger value="analytics">Analytics</TabsTrigger>
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
              <div className="flex flex-col h-full min-h-0 border-l p-2 md:p-4 lg:p-6">
                <h2 className="text-lg font-semibold mb-2 flex-shrink-0">Transaction Logs</h2>
                <div className="flex-grow min-h-0">
                  <ScrollArea className="h-full">
                    {transactionLogs.length > 0 ? (
                      transactionLogs.slice().reverse().map((log, index) => (
                        <div key={log.transactionNumber || index} className="text-xs p-2 mb-2 border rounded-md font-mono break-all bg-card">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-sm">Transaction #{log.transactionNumber}</span>
                            <span className="text-gray-500 dark:text-gray-400">
                              {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                            <div><span className="font-semibold">Processor:</span> {log.connector}</div>
                            <div><span className="font-semibold">Status:</span> <span className={`${log.status === 'succeeded' || log.status === 'requires_capture' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{log.status}</span></div>
                            <div>
                              <span className="font-semibold">Routing:</span>
                              <span className={`
                                ${log.routingApproach === 'exploration' ? 'text-blue-600 dark:text-blue-400' : ''}
                                ${log.routingApproach === 'exploitation' ? 'text-purple-600 dark:text-purple-400' : ''}
                                ${log.routingApproach === 'unknown' || log.routingApproach === 'N/A' ? 'text-gray-500 dark:text-gray-400' : ''}
                              `}>
                                {log.routingApproach}
                              </span>
                            </div>
                          </div>
                          {log.sr_scores && Object.keys(log.sr_scores).length > 0 && (
                            <div className="mt-1 pt-1 border-t border-slate-200 dark:border-slate-700">
                              <span className="font-semibold">SR Scores:</span>
                              <div className="pl-2">
                                {Object.entries(log.sr_scores).map(([name, score]) => (
                                  <div key={name}>{name}: {score.toFixed(2)}</div>
                                ))}
                              </div>
                            </div>
                          )}
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
        </div>
      </AppLayout>
      <Dialog open={isApiCredentialsModalOpen} onOpenChange={setIsApiCredentialsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>API Credentials</DialogTitle></DialogHeader>
          <div className="py-4 space-y-4">
            <div><Label htmlFor="apiKey">API Key</Label><Input id="apiKey" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Enter API Key" /></div>
            <div><Label htmlFor="profileId">Profile ID</Label><Input id="profileId" type="text" value={profileId} onChange={(e) => setProfileId(e.target.value)} placeholder="Enter Profile ID" /></div>
            <div><Label htmlFor="merchantId">Merchant ID</Label><Input id="merchantId" type="text" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} placeholder="Enter Merchant ID" /></div>
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
              <ReactMarkdown
                components={{
                  p: ({ node, ...props }) => (
                    <p {...props} className="font-sans text-sm whitespace-pre-wrap p-1" />
                  ),
                }}
              >
                {summaryText}
              </ReactMarkdown>
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
