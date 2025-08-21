import React, { useState, useCallback, useRef, useEffect } from 'react';
import { BottomControlsPanel, type FormValues } from '@/components/BottomControlsPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { StatsView } from '@/components/StatsView';
import { AnalyticsGraphsView } from '@/components/AnalyticsGraphsView';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, PlayCircle, PauseCircle, StopCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { PaymentMethod, ProcessorMetricsHistory, StructuredRule, ControlsState, OverallSRHistory, OverallSRHistoryDataPoint, TimeSeriesDataPoint, MerchantConnector, TransactionLogEntry, AISummaryInput, AISummaryOutput } from '@/lib/types';
import { PAYMENT_METHODS } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { MiniSidebar } from '@/components/MiniSidebar';
import { getApiUrl, getPaymentApiUrl, toggleSR, setVolumeSplit, updateRuleConfiguration as updateRuleConfigurationAPI } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';

const SIMULATION_INTERVAL_MS = 50;

const LOCALSTORAGE_API_KEY = 'hyperswitch_apiKey';
const LOCALSTORAGE_PROFILE_ID = 'hyperswitch_profileId';
const LOCALSTORAGE_MERCHANT_ID = 'hyperswitch_merchantId';
const LOCALSTORAGE_ROUTING_ID = 'hyperswitch_routingId';

interface SinglePaymentOutcome {
  isSuccess: boolean;
  routedProcessorId: string | null;
  logEntry: TransactionLogEntry | null;
}

export default function HomePage() {
  const [currentControls, setCurrentControls] = useState<FormValues | null>({
    totalPayments: 100,
    selectedPaymentMethods: [...PAYMENT_METHODS],
    structuredRule: null,
    processorMatrix: {},
    processorIncidents: {},
    processorWiseSuccessRates: {},
    isSuccessBasedRoutingEnabled: true,
    explorationPercent: 20,
    bucketSize: 200,
    overallSuccessRate: 0,
    connectorWiseFailurePercentage: {},
    batchSize: 1,
  });
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

  const [transactionLogs, setTransactionLogs] = useState<TransactionLogEntry[]>([]);
  const transactionCounterRef = useRef<number>(0);

  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState<boolean>(false);
  const [summaryText, setSummaryText] = useState<string>('');
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [summaryAttempted, setSummaryAttempted] = useState<boolean>(false);
  const [routingId, setRoutingId] = useState<string | null>(() => localStorage.getItem(LOCALSTORAGE_ROUTING_ID));


  const { toast } = useToast();

  const updateRuleConfiguration = useCallback(async (
    profileId: string,
    explorationPercent: number,
    bucketSize: number
  ) => {
    if (!profileId || !merchantId || !routingId) {
      console.warn("[updateRuleConfiguration] Missing required parameters:", { profileId, merchantId, routingId });
      toast({ title: "Configuration Error", description: "Missing required parameters for rule update.", variant: "destructive" });
      return;
    }

    try {
      const responseData = await updateRuleConfigurationAPI(
        merchantId,
        profileId,
        explorationPercent,
        bucketSize,
        routingId
      );

      toast({ title: "Rule Configuration Updated", description: "Success Rate Configuration updated successfully." });
      return responseData;
    } catch (error: any) {
      console.error("[updateRuleConfiguration] Error:", error);
      toast({ title: "Rule Update Error", description: error.message, variant: "destructive" });
    }
  }, [merchantId, routingId, toast]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mainPaneSize, setMainPaneSize] = useState('50%');

  const [activeSection, setActiveSection] = useState('general');

  const prevControlsRef = useRef<FormValues | null>(null);

  const [parentTab, setParentTab] = useState<'intelligent-routing' | 'least-cost-routing'>('intelligent-routing');
  const [contentTab, setContentTab] = useState<'stats' | 'analytics'>('stats');

  const fetchMerchantConnectors = useCallback(async (currentMerchantId: string, currentApiKey: string, currentProfileId: string): Promise<MerchantConnector[]> => {
    console.log("fetchMerchantConnectors called with Merchant ID:", currentMerchantId);
    if (!currentMerchantId || !currentApiKey) {
      toast({ title: "Error", description: "Merchant ID and API Key are required to fetch connectors.", variant: "destructive" });
      return [];
    }
    setIsLoadingMerchantConnectors(true);
    try {
      if (!currentProfileId) {
        toast({ title: "Error", description: "Profile ID is missing. Cannot fetch connectors.", variant: "destructive" });
        setIsLoadingMerchantConnectors(false);
        return [];
      }
      const connectorsData: MerchantConnector[] = await fetcher(getApiUrl(`/account/${currentMerchantId}/profile/connectors`), {
        method: 'GET',
        headers: { 'api-key': currentApiKey,'x-profile-id': currentProfileId },
      });

      setMerchantConnectors(connectorsData || []);

      const initialToggleStates: Record<string, boolean> = {};
      const initialProcessorWiseSuccessRates: ControlsState['processorWiseSuccessRates'] = {};
      const initialProcessorIncidents: ControlsState['processorIncidents'] = {};
      const initialProcessorMatrix: FormValues['processorMatrix'] = {};
      const connectorWiseFailurePercentage: FormValues['connectorWiseFailurePercentage'] = {};

      (connectorsData || []).forEach((connector) => {
        const key = connector.connector_name;
        if (key) {
          initialToggleStates[key] = !(connector.disabled === true);
          initialProcessorWiseSuccessRates[connector.merchant_connector_id] = { sr: 0, srDeviation: 0, volumeShare: 0, successfulPaymentCount: 0, totalPaymentCount: 0 };
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
  }, [profileId, toast]);

  const fetchCredsFromJwt = async () => {
    console.log("Fetching credentials from JWT...");
    const hardcodedJwt = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiNTRhZTU5NWItZjU4YS00OTNmLWE5ZmYtM2E5YjczYzNkMjJhIiwibWVyY2hhbnRfaWQiOiJtZXJjaGFudF8xNzUzMzQ2MjM0Iiwicm9sZV9pZCI6Im9yZ19hZG1pbiIsImV4cCI6MTc1MzUzMzg0NCwib3JnX2lkIjoib3JnXzNMZzdCU2lXajhqVzk2OGI4QWhVIiwicHJvZmlsZV9pZCI6InByb19LaEQ4N1NpNEloaXVoTUROeGM5byIsInRlbmFudF9pZCI6InB1YmxpYyJ9.TlkkJ8Jd5uW7rnUpCRvEnD3ZyNZTbBvDzzoGug7yMbA";

    try {
      const response = await fetcher('https://integ.hyperswitch.io/api/user', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${hardcodedJwt}`,
          'Content-Type': 'application/json',
          'Cookie': '_ga=GA1.1.1687557033.1727071250; mp_dd4da7f62941557e716fbc0a19f9cc7e_mixpanel=%7B%22distinct_id%22%3A%20%221921e7af9b515f-0f1cc2ee747244-17525637-1d73c0-1921e7af9b6cfb%22%2C%22%24device_id%22%3A%20%221921e7af9b515f-0f1cc2ee747244-17525637-1d73c0-1921e7af9b6cfb%22%2C%22%24initial_referrer%22%3A%20%22https%3A%2F%2Fdocs.hyperswitch.io%2Fhyperswitch-open-source%2Flocal-setup-guide%22%2C%22%24initial_referring_domain%22%3A%20%22docs.hyperswitch.io%22%7D; signals-sdk-user-id=1ae01735-fe33-43ce-81d2-4fe5dd4272f5; mf_user=e6e31998d8f9d7027861d243e8a3bc6c|; mp_dcfbbd14ec111210c440e113a23c1ae6_mixpanel=%7B%22distinct_id%22%3A%22%24device%3A74bb39db-88ba-499f-9ecf-a0024ea4e9fe%22%2C%22%24device_id%22%3A%2274bb39db-88ba-499f-9ecf-a0024ea4e9fe%22%2C%22%24initial_referrer%22%3A%22%24direct%22%2C%22%24initial_referring_domain%22%3A%22%24direct%22%2C%22__mps%22%3A%7B%7D%2C%22__mpso%22%3A%7B%22%24initial_referrer%22%3A%22%24direct%22%2C%22%24initial_referring_domain%22%3A%22%24direct%22%7D%2C%22__mpus%22%3A%7B%7D%2C%22__mpa%22%3A%7B%7D%2C%22__mpu%22%3A%7B%7D%2C%22__mpr%22%3A%5B%5D%2C%22__mpap%22%3A%5B%5D%7D; mp_773ae99db494f9e23d86ab7a160bc21b_mixpanel=%7B%22distinct_id%22%3A%22%24device%3Acae9808d-01c5-4747-9d20-3c3879a1addf%22%2C%22%24device_id%22%3A%22cae9808d-01c5-4747-9d20-3c3879a1addf%22%2C%22%24initial_referrer%22%3A%22%24direct%22%2C%22%24initial_referring_domain%22%3A%22%24direct%22%2C%22__mps%22%3A%7B%7D%2C%22__mpso%22%3A%7B%22%24initial_referrer%22%3A%22%24direct%22%2C%22%24initial_referring_domain%22%3A%22%24direct%22%7D%2C%22__mpus%22%3A%7B%7D%2C%22__mpa%22%3A%7B%7D%2C%22__mpu%22%3A%7B%7D%2C%22__mpr%22%3A%5B%5D%2C%22__mpap%22%3A%5B%5D%7D; _fbp=fb.1.1751026055997.632638634911935858; _cbp=fb.1.1751026056543.967545439; FPID=FPID2.2.RTDP4wk0aZin2dhD7%2Fg%2FIbdvJM6UcCag9031de5Yqns%3D.1727071250; didomi_token_cpra=eyJ1c2VyX2lkIjoiMTk3YjE0OTMtN2Y4Yy02OGU1LTllYTktNGE5ZmQ0ZWM2YTU5IiwiY3JlYXRlZCI6IjIwMjUtMDYtMjdUMTI6MDc6MzUuMTYwWiIsInVwZGF0ZWQiOiIyMDI1LTA2LTI3VDEyOjExOjA0LjM5MFoiLCJ2ZXJzaW9uIjoyLCJwdXJwb3Nlc19saSI6eyJlbmFibGVkIjpbImNvb2tpZXMiLCJjcmVhdGVfYWRzX3Byb2ZpbGUiLCJzZWxlY3RfcGVyc29uYWxpemVkX2FkcyIsInNlbGVjdF9iYXNpY19hZHMiLCJtZWFzdXJlX2FkX3BlcmZvcm1hbmNlIiwibWFya2V0X3Jlc2VhcmNoIiwiaW1wcm92ZV9wcm9kdWN0cyIsIm1lYXN1cmVfY29udGVudF9wZXJmb3JtYW5jZSJdfSwidmVuZG9yc19saSI6eyJlbmFibGVkIjpbImM6Z29vZ2xlIiwiYzpnb29nbGVhbmEtNFRYbkppZ1IiLCJjOmh1YnNwb3QtZm9ybXMiLCJjOmh1YnNwb3QiXX19; _ga_WBYNDZK777=GS2.1.s1751269164%24o2%24g0%24t1751269164%24j60%24l0%24h1441840699; _gcl_au=1.1.1444061989.1747736521.1930653185.1752057910.1752057922; mp_b00355f29d9548d1333608df71d5d53d_mixpanel=%7B%22distinct_id%22%3A%20%22194d59ee8c32a3d-050dad52099d7-1e525636-1d73c0-194d59ee8c43dda%22%2C%22%24device_id%22%3A%20%22194d59ee8c32a3d-050dad52099d7-1e525636-1d73c0-194d59ee8c43dda%22%2C%22%24search_engine%22%3A%20%22google%22%2C%22%24initial_referrer%22%3A%20%22https%3A%2F%2Fwww.google.com%2F%22%2C%22%24initial_referring_domain%22%3A%20%22www.google.com%22%7D; _ga_D9DGP9GJTP=GS2.1.s1752825495$o29$g1$t1752825513$j42$l0$h503525571; _ga_1X38KQVJ1S=GS2.1.s1752825495$o48$g1$t1752825513$j42$l0$h0; ph_phc_TXdpocbGVeZVm5VJmAsHTMrCofBQu3e0kN8HGMNGTVW_posthog=%7B%22distinct_id%22%3A%2201921dd2-26aa-7428-b30d-adee3b7e789d%22%2C%22%24sesid%22%3A%5B1753177153566%2C%2201983180-4423-7ec5-a136-ef7ea94fe66d%22%2C1753177146403%5D%7D; _clck=12jbwmp%7C2%7Cfxu%7C0%7C1968; login_token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiNTRhZTU5NWItZjU4YS00OTNmLWE5ZmYtM2E5YjczYzNkMjJhIiwibWVyY2hhbnRfaWQiOiJtZXJjaGFudF8xNzUzMzQ2MjM0Iiwicm9sZV9pZCI6Im9yZ19hZG1pbiIsImV4cCI6MTc1MzUzMzg0NCwib3JnX2lkIjoib3JnXzNMZzdCU2lXajhqVzk2OGI4QWhVIiwicHJvZmlsZV9pZCI6InByb19LaEQ4N1NpNEloaXVoTUROeGM5byIsInRlbmFudF9pZCI6InB1YmxpYyJ9.TlkkJ8Jd5uW7rnUpCRvEnD3ZyNZTbBvDzzoGug7yMbA',
        },
      });
      
      // Assuming the response has the structure { merchant_id: "...", profile_id: "..." }
      // You might need to adjust the keys based on the actual API response
      const { merchant_id, profile_id } = response;

      if (!merchant_id || !profile_id) {
        throw new Error("Merchant ID or Profile ID not found in response");
      }

      return { merchantId: merchant_id, profileId: profile_id };
    } catch (error) {
      console.error("Error fetching credentials from JWT:", error);
      throw error; // Re-throw the error to be caught by the caller
    }
  };

  useEffect(() => {
    const storedApiKey = localStorage.getItem(LOCALSTORAGE_API_KEY);
    const storedProfileId = localStorage.getItem(LOCALSTORAGE_PROFILE_ID);
    const storedMerchantId = localStorage.getItem(LOCALSTORAGE_MERCHANT_ID);

    if (storedApiKey) {
      setApiKey(storedApiKey);
    }
    if (storedProfileId) {
      setProfileId(storedProfileId);
    }
    if (storedMerchantId) {
      setMerchantId(storedMerchantId);
    }

    // Always open the modal on initial load.
    setIsApiCredentialsModalOpen(true);
  }, []);

  
  // Dedicated cleanup effect for dialogs
  useEffect(() => {
    // This effect only handles cleanup when component unmounts
    return () => {
  
      // Reset all dialog states
      setIsApiCredentialsModalOpen(false);
      setIsSummaryModalOpen(false);
      
      // Also reset any dialog-related state
      setSummaryText('');
      setIsSummarizing(false);
      setSummaryAttempted(false);
      
      // Explicitly remove any portal elements that might have been left behind
      setTimeout(() => {
        document.querySelectorAll('[data-radix-portal]').forEach(el => {
          el.remove();
        });
      }, 0);
    };
  }, []);

  useEffect(() => {
    setContentTab('stats');
  }, [parentTab]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (currentControls && merchantId && prevControlsRef.current) {
        const prevControls = prevControlsRef.current;
        const currentExplorationPercent = currentControls.explorationPercent;
        const currentBucketSize = currentControls.bucketSize;

        const prevExplorationPercent = prevControls?.explorationPercent;
        const prevBucketSize = prevControls?.bucketSize;

        if (
          currentExplorationPercent !== undefined &&
          currentBucketSize !== undefined &&
          (currentExplorationPercent !== prevExplorationPercent || currentBucketSize !== prevBucketSize)
        ) {
          console.log("Exploration percentage or bucket size changed. Updating rule configuration.");
          updateRuleConfiguration(profileId, currentExplorationPercent, currentBucketSize);
        }
      }
      prevControlsRef.current = currentControls;
    }, 900);

    return () => {
      clearTimeout(handler);
    };
  }, [currentControls, profileId, merchantId, routingId, updateRuleConfiguration]);

  const decideGateway = useCallback(async (
    currentControls: FormValues,
    activeConnectorLabels: string[],
    currentProfileId: string,
    paymentId: string
  ): Promise<{ selectedConnector: string | null; routingApproach: TransactionLogEntry['routingApproach']; srScores: Record<string, number> | undefined }> => {
    console.log("Deciding gateway...");
    if (!currentControls || activeConnectorLabels.length === 0 || !currentProfileId) {
      console.warn("[decideGateway] Missing required parameters (controls, labels, or profileId).");
      return { selectedConnector: null, routingApproach: 'unknown', srScores: undefined };
    }

    const payload = {
      merchantId: currentProfileId,
      eligibleGatewayList: activeConnectorLabels,
      rankingAlgorithm: "SR_BASED_ROUTING",
      eliminationEnabled: false,
      paymentInfo: {
        paymentId: paymentId,
        amount: 1000,
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
        paymentMethodType: "credit",
        paymentMethod: "card",
        paymentSource: null,
        authType: null,
        cardIssuerBankName: null,
        cardIsin: null,
        cardType: null,
        cardSwitchProvider: null
      }
    };
    console.log("routing/evaluate url: ", getApiUrl('/routing/evaluate'));
    try {
      const data = await fetcher(getApiUrl('/api/hs-proxy/routing/evaluate'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': localStorage.getItem(LOCALSTORAGE_API_KEY) || '',
          // 'x-feature': 'decision-engine'
        },
        body: JSON.stringify(payload),
      });

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

      let srScoresForLog: Record<string, number> | undefined = undefined;
      if (gatewayPriorityArray.length > 0) {
        srScoresForLog = gatewayPriorityArray.reduce((acc: Record<string, number>, item) => {
          acc[item.label] = parseFloat((item.score * 100).toFixed(2));
          return acc;
        }, {});
      }

      let routingApproachForLog: TransactionLogEntry['routingApproach'] = 'unknown';
      routingApproachForLog = data.routing_approach === 'SR_SELECTION_V3_ROUTING' ? 'exploitation' 
                   : data.routing_approach === 'SR_V3_HEDGING' ? 'exploration'
                   : 'default';

      if (data.decided_gateway) {
        return { selectedConnector: data.decided_gateway, routingApproach: routingApproachForLog, srScores: srScoresForLog };
      } else {
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
    currentProfileId: string,
    connectorNameForApi: string,
    paymentSuccessStatus: boolean,
    controls: FormValues | null,
    paymentId: string
  ) => {
    console.log("Updating gateway score...");
    if (!currentProfileId || !connectorNameForApi || !controls) {
      return;
    }

    const apiStatus = paymentSuccessStatus ? "CHARGED" : "FAILURE";
    const payload = {
      merchantId: currentProfileId,
      gateway: connectorNameForApi,
      gatewayReferenceId: null,
      status: apiStatus,
      paymentId: paymentId,
      enforceDynamicRoutingFailure: null
    };

    try {
      await fetcher(getApiUrl('/api/hs-proxy/routing/feedback'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 'x-feature': 'decision-engine'
          'api-key': localStorage.getItem(LOCALSTORAGE_API_KEY) || '',
        },
        body: JSON.stringify(payload),
      });
    } catch (error: any) {
      console.error("[UpdateSuccessRateWindow] Fetch Error:", error);
    }
  }, []);

  const handleControlsChange = useCallback((data: FormValues) => {
    setCurrentControls(prev => ({
      ...(prev || {} as FormValues),
      ...data,
    }));
  }, []);

  const processSinglePayment = useCallback(async (
    paymentIndex: number,
    signal: AbortSignal
  ): Promise<SinglePaymentOutcome> => {
    if (!currentControls || !apiKey || !profileId || !merchantId) {
      throw new Error('Missing required configuration');
    }

    const paymentId = `PAY${Math.floor(Math.random() * 100000)}_${paymentIndex}`;
    const activeConnectorLabels = merchantConnectors
      .filter(mc => connectorToggleStates[mc.connector_name])
      .map(mc => mc.connector_name);

    const decisionResult = await decideGateway(
      currentControls,
      activeConnectorLabels,
      profileId,
      paymentId
    );

    const { selectedConnector, routingApproach, srScores } = decisionResult;

    const failurePercentage = currentControls.connectorWiseFailurePercentage?.[selectedConnector || ''] ?? 0;
    const shouldFail = Math.random() * 100 < failurePercentage;

    const successCardNumber = currentControls.connectorWiseSuccessCard?.[selectedConnector || ''] || "42424242424242";
    const failureCardNumber = currentControls.connectorWiseFailureCard?.[selectedConnector || ''] || "4000000000000002";

    const cardNumber = shouldFail ? failureCardNumber : successCardNumber;

    const paymentData = {
      amount: 6540,
      payment_id: paymentId,
      currency: "USD",
      confirm: true,
      profile_id: profileId,
      capture_method: "automatic",
      authentication_type: "no_three_ds",
      customer: { id: `cus_sim_${Date.now()}_${paymentIndex}`, name: "John Doe", email: "customer@example.com", phone: "9999999999", phone_country_code: "+1" },
      payment_method: "card",
      payment_method_type: "credit",
      payment_method_data: {
        card: { card_number: cardNumber, card_exp_month: "10", card_exp_year: "25", card_holder_name: "Joseph Doe", card_cvc: "123" },
        billing: { address: { line1: "1467", line2: "Harrison Street", city: "San Francisco", state: "California", zip: "94122", country: "US", first_name: "Joseph", last_name: "Doe" }, phone: { number: "8056594427", country_code: "+91" }, email: "guest@example.com" }
      },
      routing: selectedConnector ? { type: "single", data: { connector: selectedConnector, merchant_connector_id: merchantConnectors.find(mc => mc.connector_name === selectedConnector)?.merchant_connector_id } } : undefined,
    };

    let isSuccess = false;
    let routedProcessorId: string | null = null;
    let logEntry: TransactionLogEntry | null = null;

    try {
      const responseData = await fetcher(getPaymentApiUrl('/payments'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'api-key': apiKey },
        body: JSON.stringify(paymentData),
        signal,
      });

      isSuccess = ['succeeded', 'requires_capture', 'processing'].includes(responseData.status);
      const loggedConnectorName = responseData.connector_name || responseData.merchant_connector_id || 'unknown';
      
      transactionCounterRef.current += 1;
      const mc = merchantConnectors.find(m => m.connector_name === loggedConnectorName || m.merchant_connector_id === loggedConnectorName);
      routedProcessorId = mc ? mc.connector_name : loggedConnectorName;

      logEntry = {
        transactionNumber: transactionCounterRef.current,
        status: responseData.status,
        connector: routedProcessorId || 'unknown',
        timestamp: Date.now(),
        routingApproach,
        sr_scores: srScores,
      };

      // if (merchantId && routedProcessorId && typeof routedProcessorId === 'string' && routedProcessorId !== 'unknown') {
      //   await updateGatewayScore(profileId, routedProcessorId, isSuccess, currentControls, paymentId);
      // }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error("Error during payment API call:", error);
      }
      throw error;
    }

    return { isSuccess, routedProcessorId, logEntry };
  }, [currentControls, apiKey, profileId, merchantId, merchantConnectors, connectorToggleStates, decideGateway, updateGatewayScore]);

  const processTransactionBatch = useCallback(async () => {
    if (isStoppingRef.current || simulationState !== 'running' || isProcessingBatchRef.current) return;
    isProcessingBatchRef.current = true;

    try {
      if (!currentControls || processedPaymentsCount >= currentControls.totalPayments) {
        if (!isStoppingRef.current) {
          setSimulationState('idle');
          toast({ title: "Simulation Completed", description: `All ${currentControls?.totalPayments} payments processed.`, duration: 5000 });
        }
        return;
      }

      const batchSize = currentControls.batchSize || 1;
      const paymentsToProcessInBatch = Math.min(batchSize, currentControls.totalPayments - processedPaymentsCount);
      const batchIndices = Array.from({ length: paymentsToProcessInBatch }, (_, i) => processedPaymentsCount + i);

      // Initialize abort controller if it doesn't exist
      if (!apiCallAbortControllerRef.current) {
        apiCallAbortControllerRef.current = new AbortController();
      }

      const batchResults = await Promise.all(
        batchIndices.map(paymentIndex => processSinglePayment(paymentIndex, apiCallAbortControllerRef.current!.signal).catch(error => {
          if (error.name !== 'AbortError') console.error(`Error processing payment ${paymentIndex}:`, error);
          return { isSuccess: false, routedProcessorId: null, logEntry: null };
        }))
      );

      if (isStoppingRef.current) return;

      const newLogsForThisBatch: TransactionLogEntry[] = [];
      const batchSpecificProcessorStats: Record<string, { successful: number; failed: number }> = {};

      batchResults.forEach(result => {
        if (result.logEntry) newLogsForThisBatch.push(result.logEntry);
        if (result.routedProcessorId) {
          if (!batchSpecificProcessorStats[result.routedProcessorId]) {
            batchSpecificProcessorStats[result.routedProcessorId] = { successful: 0, failed: 0 };
          }
          if (!accumulatedProcessorStatsRef.current[result.routedProcessorId]) {
            accumulatedProcessorStatsRef.current[result.routedProcessorId] = { successful: 0, failed: 0, volumeShareRaw: 0 };
          }
          if (result.isSuccess) {
            batchSpecificProcessorStats[result.routedProcessorId].successful++;
            accumulatedProcessorStatsRef.current[result.routedProcessorId].successful++;
            accumulatedGlobalStatsRef.current.totalSuccessful++;
          } else {
            batchSpecificProcessorStats[result.routedProcessorId].failed++;
            accumulatedProcessorStatsRef.current[result.routedProcessorId].failed++;
            accumulatedGlobalStatsRef.current.totalFailed++;
          }
        }
      });

      setTransactionLogs(prevLogs => [...prevLogs, ...newLogsForThisBatch]);
      setProcessedPaymentsCount(prev => prev + batchResults.length);

      const currentTime = Date.now();
      const newSuccessRateDataPoint: TimeSeriesDataPoint = { time: currentTime };
      const newVolumeDataPoint: TimeSeriesDataPoint = { time: currentTime };

      merchantConnectors.forEach(connector => {
        const key = connector.connector_name;
        const batchStats = batchSpecificProcessorStats[key] || { successful: 0, failed: 0 };
        const batchTotal = batchStats.successful + batchStats.failed;
        newSuccessRateDataPoint[key] = batchTotal > 0 ? (batchStats.successful / batchTotal) * 100 : 0;
        const cumulativeStats = accumulatedProcessorStatsRef.current[key] || { successful: 0, failed: 0 };
        newVolumeDataPoint[key] = cumulativeStats.successful + cumulativeStats.failed;
      });

      setSuccessRateHistory(prev => [...prev, newSuccessRateDataPoint]);
      setVolumeHistory(prev => [...prev, newVolumeDataPoint]);

      const totalProcessed = accumulatedGlobalStatsRef.current.totalSuccessful + accumulatedGlobalStatsRef.current.totalFailed;
      const currentOverallSR = totalProcessed > 0 ? (accumulatedGlobalStatsRef.current.totalSuccessful / totalProcessed) * 100 : 0;
      setOverallSuccessRateHistory(prev => [...prev, { time: currentTime, overallSR: currentOverallSR }]);

      setCurrentControls(prev => {
        if (!prev) return prev;
        const newPwsr = { ...prev.processorWiseSuccessRates };
        let totalVolume = 0;
        Object.values(accumulatedProcessorStatsRef.current).forEach(stats => totalVolume += (stats.successful + stats.failed));
        
        Object.keys(newPwsr).forEach(procId => {
          const connector = merchantConnectors.find(c => c.merchant_connector_id === procId || c.connector_name === procId);
          const key = connector ? connector.connector_name : procId;
          const stats = accumulatedProcessorStatsRef.current[key] || { successful: 0, failed: 0 };
          const totalForProc = stats.successful + stats.failed;
          newPwsr[procId] = {
            ...newPwsr[procId],
            sr: totalForProc > 0 ? (stats.successful / totalForProc) * 100 : 0,
            successfulPaymentCount: stats.successful,
            totalPaymentCount: totalForProc,
            volumeShare: totalVolume > 0 ? (totalForProc / totalVolume) * 100 : 0,
          };
        });
        return { ...prev, processorWiseSuccessRates: newPwsr, overallSuccessRate: currentOverallSR };
      });

    } catch (error) {
      console.error("Unexpected error in processTransactionBatch:", error);
    } finally {
      isProcessingBatchRef.current = false;
    }
  }, [simulationState, currentControls, processedPaymentsCount, apiKey, profileId, merchantId, merchantConnectors, connectorToggleStates, processSinglePayment, toast]);

  useEffect(() => {
    if (simulationState === 'running') {
      const intervalId = setInterval(() => {
        processTransactionBatch();
      }, SIMULATION_INTERVAL_MS);
      return () => clearInterval(intervalId);
    }
  }, [simulationState, processTransactionBatch]);

  const handleStartSimulation = useCallback(async (forceStart = false) => {
    if (!apiKey || !profileId || !merchantId) {
      toast({
        title: "API Credentials Required",
        description: "Please save your API credentials in the modal before starting the simulation.",
        variant: "destructive",
      });
      setIsApiCredentialsModalOpen(true); // Also re-open the modal for convenience
      return;
    }
    if (forceStart || merchantConnectors.length === 0) {
      await fetchMerchantConnectors(merchantId, apiKey, profileId);
    }
    resetSimulationState();
    setSimulationState('running');
    toast({ title: "Simulation Started" });
  }, [apiKey, profileId, merchantId, merchantConnectors.length, toast, fetchMerchantConnectors]);

  const handleResumeSimulation = useCallback(() => {
    setSimulationState('running');
    toast({ title: "Simulation Resumed" });
  }, [toast]);

  const handlePauseSimulation = useCallback(() => {
    if (simulationState === 'running') {
      setSimulationState('paused');
      toast({ title: "Simulation Paused" });
    }
  }, [simulationState, toast]);

  const handleStopSimulation = useCallback(() => {
    setSimulationState('idle');
    toast({ title: "Simulation Stopped" });
  }, [toast]);

  const handleApiCredentialsSubmit = useCallback(async () => {
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    
    if (!apiKey) {
      toast({ title: "API Key is Required", variant: "destructive" });
      return;
    }
    localStorage.setItem(LOCALSTORAGE_API_KEY, apiKey);

    let currentMerchantId = merchantId;
    let currentProfileId = profileId;

    if (isLocalhost) {
      if (!profileId || !merchantId) {
        toast({ title: "Profile ID and Merchant ID are Required", variant: "destructive" });
        return;
      }
      localStorage.setItem(LOCALSTORAGE_PROFILE_ID, profileId);
      localStorage.setItem(LOCALSTORAGE_MERCHANT_ID, merchantId);
    } else {
      try {
        const creds = await fetchCredsFromJwt();
        currentMerchantId = creds.merchantId;
        currentProfileId = creds.profileId;
        setMerchantId(currentMerchantId);
        setProfileId(currentProfileId);
        localStorage.setItem(LOCALSTORAGE_PROFILE_ID, currentProfileId);
        localStorage.setItem(LOCALSTORAGE_MERCHANT_ID, currentMerchantId);
      } catch (error) {
        console.error("Failed to fetch credentials from JWT", error);
        toast({ title: "Failed to fetch credentials", description: "Could not retrieve merchant and profile IDs.", variant: "destructive" });
        return;
      }
    }

    setIsApiCredentialsModalOpen(false);

    if (currentMerchantId && currentProfileId) {
      await fetchMerchantConnectors(currentMerchantId, apiKey, currentProfileId);
      const newRoutingId = await toggleSR(currentMerchantId, currentProfileId);
      if (newRoutingId && newRoutingId !== routingId) {
        localStorage.setItem(LOCALSTORAGE_ROUTING_ID, newRoutingId);
        setRoutingId(newRoutingId);
        await setVolumeSplit(currentMerchantId, currentProfileId);
      }
    }
  }, [apiKey, profileId, merchantId, toast, fetchMerchantConnectors, routingId]);

  const resetSimulationState = () => {
    setProcessedPaymentsCount(0);
    setCurrentBatchNumber(0);
    setSuccessRateHistory([]);
    setVolumeHistory([]);
    setOverallSuccessRateHistory([]);
    setTransactionLogs([]);
    transactionCounterRef.current = 0;
    accumulatedProcessorStatsRef.current = {};
    accumulatedGlobalStatsRef.current = { totalSuccessful: 0, totalFailed: 0 };
  };


  return (
    <>
      <div className="theme-intelligent">
        <div className="flex flex-row flex-grow overflow-hidden" style={{ height: 'calc(100vh)' }}>
          <MiniSidebar
            activeSection={activeSection}
            onSectionChange={setActiveSection}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
          />
          <Allotment>
            <Allotment.Pane minSize={400} maxSize={600}>
              <div className="flex flex-col h-full overflow-y-auto">
                <BottomControlsPanel
                  onFormChange={handleControlsChange}
                  merchantConnectors={merchantConnectors}
                  connectorToggleStates={connectorToggleStates}
                  onConnectorToggleChange={(id, state) => setConnectorToggleStates(prev => ({ ...prev, [id]: state }))}
                  apiKey={apiKey}
                  profileId={profileId}
                  merchantId={merchantId}
                  collapsed={sidebarCollapsed}
                  onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
                  activeTab={activeSection}
                  parentTab={parentTab}
                />
              </div>
            </Allotment.Pane>
            <Allotment.Pane>
              <div className="flex flex-col h-full">
                <Tabs value={contentTab} onValueChange={(value) => setContentTab(value as 'stats' | 'analytics')} className="flex flex-col h-full">
                  <div className="flex justify-between items-center p-4 pb-0">
                    <TabsList>
                      <TabsTrigger value="stats">Stats</TabsTrigger>
                      <TabsTrigger value="analytics">Analytics</TabsTrigger>
                    </TabsList>
                    <div className="flex items-center gap-2">
                      {simulationState === 'idle' && (
                        <Button onClick={() => handleStartSimulation()} variant="primary" size="default">
                          <PlayCircle className="mr-2 h-5 w-5" />
                          Start Simulation
                        </Button>
                      )}
                      {simulationState === 'paused' && (
                        <Button onClick={handleResumeSimulation} variant="primary" size="default">
                          <PlayCircle className="mr-2 h-5 w-5" />
                          Resume Simulation
                        </Button>
                      )}
                      {simulationState === 'running' && (
                        <Button onClick={handlePauseSimulation} variant="outline" size="default">
                          <PauseCircle className="mr-2 h-5 w-5" />
                          Pause Simulation
                        </Button>
                      )}
                      {(simulationState === 'running' || simulationState === 'paused') && (
                        <Button onClick={handleStopSimulation} variant="destructive" size="default">
                          <StopCircle className="mr-2 h-5 w-5" />
                          Stop Simulation
                        </Button>
                      )}
                    </div>
                  </div>
                  <TabsContent value="stats" className="flex-1 h-full">
                    <ScrollArea className="h-full">
                      <div className="p-4">
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
                  <TabsContent value="analytics" className="flex-1 h-full">
                    <ScrollArea className="h-full">
                      <div className="p-4">
                        <AnalyticsGraphsView
                          successRateHistory={successRateHistory}
                          volumeHistory={volumeHistory}
                          merchantConnectors={merchantConnectors}
                          connectorToggleStates={connectorToggleStates}
                        />
                      </div>
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              </div>
            </Allotment.Pane>
            <Allotment.Pane>
              <div className="flex flex-col h-full border-l p-4">
                <h2 className="text-lg font-semibold mb-2">Transaction Logs</h2>
                <ScrollArea className="flex-grow">
                  {transactionLogs.length > 0 ? (
                    transactionLogs.slice().reverse().map((log, index) => (
                      <div key={index} className="text-xs p-2 mb-2 border rounded-md font-mono">
                        <p><strong>Transaction #{log.transactionNumber}</strong></p>
                        <p>Status: <span className={log.status === 'succeeded' ? 'text-green-500' : 'text-red-500'}>{log.status}</span></p>
                        <p>Connector: {log.connector}</p>
                        <p>Routing: {log.routingApproach}</p>
                        {log.sr_scores && <p>Scores: {JSON.stringify(log.sr_scores)}</p>}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Log entries will appear here...</p>
                  )}
                </ScrollArea>
              </div>
            </Allotment.Pane>
          </Allotment>
        </div>
      </div>
      {isApiCredentialsModalOpen && (
        <Dialog 
          key={`api-credentials-dialog-${Date.now()}`}
          open={true} 
          onOpenChange={setIsApiCredentialsModalOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>API Credentials</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div><Label htmlFor="apiKey">API Key</Label><Input id="apiKey" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} /></div>
              {(window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") && (
                <>
                  <div><Label htmlFor="profileId">Profile ID</Label><Input id="profileId" value={profileId} onChange={(e) => setProfileId(e.target.value)} /></div>
                  <div><Label htmlFor="merchantId">Merchant ID</Label><Input id="merchantId" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} /></div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsApiCredentialsModalOpen(false)}>Cancel</Button>
              <Button onClick={handleApiCredentialsSubmit}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
