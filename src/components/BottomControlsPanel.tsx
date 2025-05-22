"use client";

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PAYMENT_METHODS } from '@/lib/constants'; 
import type { ControlsState, PaymentMethod, ProcessorPaymentMethodMatrix, ProcessorIncidentStatus, StructuredRule, ConditionField, ConditionOperator, MerchantConnector } from '@/lib/types';
import { Settings2, TrendingUp, Zap, VenetianMaskIcon, AlertTriangle, Trash2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

const LOCALSTORAGE_SUCCESS_CARD_KEY = 'hyperswitch_successCardDetails';
const LOCALSTORAGE_FAILURE_CARD_KEY = 'hyperswitch_failureCardDetails';

const loadInitialCardDetails = (): Partial<FormValues> => {
  const loaded: Partial<FormValues> = {};
  if (typeof window !== 'undefined') {
    try {
      const storedSuccess = localStorage.getItem(LOCALSTORAGE_SUCCESS_CARD_KEY);
      if (storedSuccess) {
        const parsed = JSON.parse(storedSuccess);
        loaded.successCardNumber = parsed.cardNumber;
        loaded.successCardExpMonth = parsed.expMonth;
        loaded.successCardExpYear = parsed.expYear;
        loaded.successCardHolderName = parsed.holderName;
        loaded.successCardCvc = parsed.cvc;
      }
      const storedFailure = localStorage.getItem(LOCALSTORAGE_FAILURE_CARD_KEY);
      if (storedFailure) {
        const parsed = JSON.parse(storedFailure);
        loaded.failureCardNumber = parsed.cardNumber;
        loaded.failureCardExpMonth = parsed.expMonth;
        loaded.failureCardExpYear = parsed.expYear;
        loaded.failureCardHolderName = parsed.holderName;
        loaded.failureCardCvc = parsed.cvc;
      }
    } catch (e) {
      console.error("Error loading card details from localStorage", e);
    }
  }
  return loaded;
};

const formSchema = z.object({
  totalPayments: z.number().min(0).max(1000000),
  selectedPaymentMethods: z.array(z.string()).min(1, "Please select at least one payment method."),
  processorMatrix: z.record(z.string(), z.record(z.string(), z.boolean())),
  ruleConditionField: z.custom<ConditionField>().optional(),
  ruleConditionOperator: z.custom<ConditionOperator>().optional(),
  ruleConditionValue: z.custom<PaymentMethod>().optional(),
  ruleActionProcessorId: z.string().optional(),
  processorIncidents: z.record(z.string(), z.number().nullable()),
  processorWiseSuccessRates: z.record(z.string(), z.object({
    sr: z.number().min(0).max(100),
    srDeviation: z.number().min(0).max(50),
    volumeShare: z.number().min(0).max(100),
    failureRate: z.number().min(0).max(100),
  })),
  minAggregatesSize: z.number().min(1).max(100000).optional(),
  maxAggregatesSize: z.number().min(1).max(1000000).optional(),
  defaultSuccessRate: z.number().min(0).max(100).optional(),
  currentBlockThresholdDurationInMins: z.number().min(0).optional(),
  currentBlockThresholdMaxTotalCount: z.number().min(0).max(10000).optional(),
  isSuccessBasedRoutingEnabled: z.boolean().optional(),
  isEliminationRoutingEnabled: z.boolean().optional(),
  isContractBasedRoutingEnabled: z.boolean().optional(),
  // Test Payment Data Fields
  successCardNumber: z.string().optional(),
  successCardExpMonth: z.string().optional(),
  successCardExpYear: z.string().optional(),
  successCardHolderName: z.string().optional(),
  successCardCvc: z.string().optional(),
  failureCardNumber: z.string().optional(),
  failureCardExpMonth: z.string().optional(),
  failureCardExpYear: z.string().optional(),
  failureCardHolderName: z.string().optional(),
  failureCardCvc: z.string().optional(),
  failurePercentage: z.number().min(0).max(100).optional(),
}).refine(data => {
  if (data.minAggregatesSize !== undefined && data.maxAggregatesSize !== undefined) {
    return data.maxAggregatesSize >= data.minAggregatesSize;
  }
  return true;
}, {
  message: "Max aggregates size must be >= min aggregates size.",
  path: ["maxAggregatesSize"],
});

export type FormValues = Omit<z.infer<typeof formSchema>, 'structuredRule' | 'overallSuccessRate'> & { 
  structuredRule: StructuredRule | null;
  overallSuccessRate?: number;
};

interface BottomControlsPanelProps {
  onFormChange: (data: FormValues) => void;
  initialValues?: Partial<FormValues>;
  merchantConnectors: MerchantConnector[];
  connectorToggleStates: Record<string, boolean>; 
  onConnectorToggleChange: (connectorId: string, newState: boolean) => void; 
  apiKey: string; 
  profileId: string; 
  merchantId: string; 
}

const BOTTOM_PANEL_HEIGHT = "350px";

export function BottomControlsPanel({ 
  onFormChange, 
  initialValues, 
  merchantConnectors,
  connectorToggleStates, 
  onConnectorToggleChange, 
  apiKey, 
  profileId, 
  merchantId, 
}: BottomControlsPanelProps) {
  const { toast } = useToast();
  const [successBasedAlgorithmId, setSuccessBasedAlgorithmId] = useState<string | null>(null);
  
  const dynamicDefaults = useMemo(() => {
    const matrix: ProcessorPaymentMethodMatrix = {};
    const incidents: ProcessorIncidentStatus = {};
    const rates: ControlsState['processorWiseSuccessRates'] = {};

    (merchantConnectors || []).forEach(connector => {
      const key = connector.merchant_connector_id || connector.connector_name;
      matrix[key] = PAYMENT_METHODS.reduce((acc, method) => {
        acc[method] = false; 
        return acc;
      }, {} as Record<PaymentMethod, boolean>);
      incidents[key] = null;
      rates[key] = { sr: 0, srDeviation: 5, volumeShare: 0, failureRate: 100 };
    });
    return { matrix, incidents, rates };
  }, [merchantConnectors]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      totalPayments: 1000,
      selectedPaymentMethods: [...PAYMENT_METHODS],
      processorMatrix: dynamicDefaults.matrix,
      processorIncidents: dynamicDefaults.incidents,
      processorWiseSuccessRates: dynamicDefaults.rates,
      minAggregatesSize: 100,
      maxAggregatesSize: 1000,
      defaultSuccessRate: 90,
      currentBlockThresholdDurationInMins: 5,
      currentBlockThresholdMaxTotalCount: 10,
      isSuccessBasedRoutingEnabled: false, 
      isEliminationRoutingEnabled: false, 
      isContractBasedRoutingEnabled: false, 
      ruleConditionField: undefined,
      ruleConditionOperator: undefined,
      ruleConditionValue: undefined,
      ruleActionProcessorId: undefined,
      // Test Payment Data Defaults
      successCardNumber: "4242424242424242",
      successCardExpMonth: "10",
      successCardExpYear: "25",
      successCardHolderName: "Joseph Doe",
      successCardCvc: "123",
      failureCardNumber: "4000000000000000", // Example failure card
      failureCardExpMonth: "12",
      failureCardExpYear: "26",
      failureCardHolderName: "Jane Roe",
      failureCardCvc: "999",
      failurePercentage: 50,
      ...initialValues, // Props override static defaults
      ...loadInitialCardDetails(), // localStorage overrides props and static defaults for the fields it contains
    },
  });
  
  const isSuccessBasedRoutingEnabledWatched = form.watch("isSuccessBasedRoutingEnabled");
  const previousIsSuccessBasedRoutingEnabledRef = useRef<boolean | undefined>();

  useEffect(() => {
    previousIsSuccessBasedRoutingEnabledRef.current = form.getValues("isSuccessBasedRoutingEnabled");
  }, [form]);


  useEffect(() => {
    const callToggleApi = async (enable: boolean) => {
      if (!merchantId || !profileId || !apiKey) {
        toast({
          title: "API Credentials Missing",
          description: `Cannot ${enable ? "enable" : "disable"} Success Based Routing. Please check credentials.`,
          variant: "destructive",
        });
        return; 
      }

      let apiUrl = `https://integ-api.hyperswitch.io/account/${merchantId}/business_profile/${profileId}/dynamic_routing/success_based/toggle`;
      if (enable) {
        apiUrl += `?enable=dynamic_connector_selection`;
      } else {
        apiUrl += `?enable=none`; // For disabling, set enable=none
      }
      
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'api-key': apiKey, 
          },
          // No body is sent
        });

        const responseData = await response.json().catch(() => null); 

        if (!response.ok) {
          const errorMessage = responseData?.message || responseData?.error?.message || `Failed to ${enable ? "enable" : "disable"} Success Based Routing. Status: ${response.status}`;
          throw new Error(errorMessage);
        }

        if (enable) {
          if (responseData?.id) { // Changed from algorithm_id to id
            setSuccessBasedAlgorithmId(responseData.id);
            toast({
              title: "Success Based Routing Enabled",
              description: `Algorithm ID: ${responseData.id}`,
            });
          } else {
            toast({
              title: "Success Based Routing Enabled",
              description: "Operation successful (no algorithm ID 'id' returned).",
            });
          }
        } else { 
          setSuccessBasedAlgorithmId(null);
          toast({
            title: "Success Based Routing Disabled",
            description: "Successfully set to 'none'.",
          });
        }
      } catch (error: any) {
        toast({
          title: `Error ${enable ? "Enabling" : "Disabling"} Routing`,
          description: error.message || "An unknown error occurred.",
          variant: "destructive",
        });
      }
    };
    
    if (typeof isSuccessBasedRoutingEnabledWatched === 'boolean' &&
        previousIsSuccessBasedRoutingEnabledRef.current !== undefined && 
        previousIsSuccessBasedRoutingEnabledRef.current !== isSuccessBasedRoutingEnabledWatched) {
      callToggleApi(isSuccessBasedRoutingEnabledWatched);
    }
    previousIsSuccessBasedRoutingEnabledRef.current = isSuccessBasedRoutingEnabledWatched;

  }, [isSuccessBasedRoutingEnabledWatched, apiKey, profileId, merchantId, toast, setSuccessBasedAlgorithmId]);

  const [selectedIncidentProcessor, setSelectedIncidentProcessor] = useState<string>('');
  const [incidentDuration, setIncidentDuration] = useState<number>(10);

  useEffect(() => {
    if (merchantConnectors && merchantConnectors.length > 0) {
        const currentFormValues = form.getValues();
        form.reset({
            ...currentFormValues, 
            ...initialValues, 
            processorMatrix: dynamicDefaults.matrix, 
            processorIncidents: dynamicDefaults.incidents,
            processorWiseSuccessRates: dynamicDefaults.rates,
        });

        const firstConnectorId = merchantConnectors[0].merchant_connector_id || merchantConnectors[0].connector_name;
        if (firstConnectorId && (!selectedIncidentProcessor || !merchantConnectors.some(c => (c.merchant_connector_id || c.connector_name) === selectedIncidentProcessor))) {
            setSelectedIncidentProcessor(firstConnectorId);
        }
    } else {
        const currentFormValues = form.getValues();
        form.reset({
            ...currentFormValues,
            ...initialValues,
            processorMatrix: {},
            processorIncidents: {},
            processorWiseSuccessRates: {},
            ruleActionProcessorId: undefined,
        });
        setSelectedIncidentProcessor('');
    }
}, [merchantConnectors, dynamicDefaults, form, initialValues, selectedIncidentProcessor]);


  useEffect(() => {
    const subscription = form.watch((values) => {
      const parsedValues = formSchema.safeParse(values);
      if (parsedValues.success) {
        const formData = parsedValues.data;
        let rule: StructuredRule | null = null;
        if (formData.ruleConditionField && formData.ruleConditionOperator && formData.ruleConditionValue && formData.ruleActionProcessorId) {
          rule = {
            id: 'rule1',
            condition: { field: formData.ruleConditionField, operator: formData.ruleConditionOperator, value: formData.ruleConditionValue },
            action: { type: 'ROUTE_TO_PROCESSOR', processorId: formData.ruleActionProcessorId },
          };
        }
        const { overallSuccessRate, ...outputValues } = formData as any; 
        onFormChange({ ...outputValues, structuredRule: rule } as FormValues);

        // Save card details to localStorage
        if (typeof window !== 'undefined') {
          try {
            const successCardDetailsToSave = {
              cardNumber: formData.successCardNumber,
              expMonth: formData.successCardExpMonth,
              expYear: formData.successCardExpYear,
              holderName: formData.successCardHolderName,
              cvc: formData.successCardCvc,
            };
            localStorage.setItem(LOCALSTORAGE_SUCCESS_CARD_KEY, JSON.stringify(successCardDetailsToSave));

            const failureCardDetailsToSave = {
              cardNumber: formData.failureCardNumber,
              expMonth: formData.failureCardExpMonth,
              expYear: formData.failureCardExpYear,
              holderName: formData.failureCardHolderName,
              cvc: formData.failureCardCvc,
            };
            localStorage.setItem(LOCALSTORAGE_FAILURE_CARD_KEY, JSON.stringify(failureCardDetailsToSave));
          } catch (e) {
            console.error("Error saving card details to localStorage", e);
          }
        }
      }
    });

    const initialFormValues = form.getValues();
    const initialParsed = formSchema.safeParse(initialFormValues);
    if (initialParsed.success) {
        const initialFormData = initialParsed.data;
        let initialRule: StructuredRule | null = null;
        if (initialFormData.ruleConditionField && initialFormData.ruleConditionOperator && initialFormData.ruleConditionValue && initialFormData.ruleActionProcessorId) {
            initialRule = {
                id: 'rule1',
                condition: { field: initialFormData.ruleConditionField, operator: initialFormData.ruleConditionOperator, value: initialFormData.ruleConditionValue },
                action: { type: 'ROUTE_TO_PROCESSOR', processorId: initialFormData.ruleActionProcessorId }
            };
        }
        const { overallSuccessRate, ...outputValues } = initialFormData as any;
        onFormChange({ ...outputValues, structuredRule: initialRule } as FormValues);
    } else {
        const { overallSuccessRate, ...outputValues } = initialFormValues as any;
        onFormChange({ ...outputValues, structuredRule: null } as FormValues);
    }

    return () => subscription.unsubscribe();
  }, [form, onFormChange]);

  const { control, setValue } = form;

  const handleTriggerIncident = () => {
    if (selectedIncidentProcessor && incidentDuration > 0) {
      const endTime = Date.now() + incidentDuration * 1000;
      setValue(`processorIncidents.${selectedIncidentProcessor}`, endTime, { shouldValidate: true, shouldDirty: true });
    }
  };

  const handleClearRule = () => {
    setValue('ruleConditionField', undefined);
    setValue('ruleConditionOperator', undefined);
    setValue('ruleConditionValue', undefined);
    setValue('ruleActionProcessorId', undefined);
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-lg z-20"
      style={{ height: BOTTOM_PANEL_HEIGHT }}
    >
      <ScrollArea className="h-full">
        <Form {...form}>
          <form onSubmit={(e) => e.preventDefault()} className="p-4 space-y-2">
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-4 mb-2">
                <TabsTrigger value="general" className="text-xs md:text-sm"><Settings2 className="mr-1 h-4 w-4 md:mr-2" />General</TabsTrigger>
                <TabsTrigger value="processors" className="text-xs md:text-sm"><VenetianMaskIcon className="mr-1 h-4 w-4 md:mr-2" />Processors</TabsTrigger>
                <TabsTrigger value="routing" className="text-xs md:text-sm"><Zap className="mr-1 h-4 w-4 md:mr-2" />Routing</TabsTrigger>
                <TabsTrigger value="sr-incidents" className="text-xs md:text-sm"><TrendingUp className="mr-1 h-4 w-4 md:mr-2" />Test Payment Data</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="pt-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <FormField
                    control={control}
                    name="totalPayments"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Total Payments</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="e.g., 1000" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="md:col-span-2">
                    <FormLabel>Payment Methods</FormLabel>
                    <div className="flex items-center space-x-3 mt-2 p-3 border rounded-md bg-muted/50">
                      <Checkbox id="payment-method-card" checked={true} disabled={true} />
                      <Label htmlFor="payment-method-card" className="font-normal text-muted-foreground">
                        Card (Selected by default)
                      </Label>
                    </div>
                    <FormDescription className="text-xs mt-1">
                      Currently, "Card" is the only enabled payment method.
                    </FormDescription>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="processors" className="pt-2">
                <Card>
                  <CardHeader><CardTitle className="text-base">Processor ↔ PM Matrix</CardTitle></CardHeader>
                  <CardContent className="space-y-1 p-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {(merchantConnectors || []).map(connector => {
                        const connectorId = connector.merchant_connector_id || connector.connector_name;
                        const connectorDisplayName = connector.connector_label || connector.connector_name;
                        return (
                          <div key={connectorId} className="border p-2 rounded-md flex items-center justify-between">
                            <Label htmlFor={`toggle-pm-${connectorId}`} className="font-medium text-sm truncate" title={connectorDisplayName}>
                              {connectorDisplayName}
                            </Label>
                            <Switch
                              id={`toggle-pm-${connectorId}`}
                              checked={connectorToggleStates[connectorId] ?? false}
                              onCheckedChange={(newState) => onConnectorToggleChange(connectorId, newState)}
                              size="sm"
                            />
                          </div>
                        );
                      })}
                    </div>
                     <FormDescription className="text-xs mt-2">
                      Toggle connectors on/off. This status is reflected in the simulation.
                    </FormDescription>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="routing" className="pt-2 space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                     <div className="flex items-center">
                        <Settings2 className="mr-2 h-5 w-5 text-primary" /> 
                        <CardTitle className="text-base">Intelligent Routing Parameters</CardTitle>
                      </div>
                    <CardDescription className="text-xs pt-1">Select and configure intelligent routing strategies. Fields are shown if a strategy is enabled.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3 mb-4 p-3 border rounded-md">
                      <FormField
                        control={control}
                        name="isSuccessBasedRoutingEnabled"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg p-2 hover:bg-muted/50">
                            <FormLabel className="text-sm font-normal">Success Based Routing</FormLabel>
                            <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={control}
                        name="isEliminationRoutingEnabled"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg p-2 hover:bg-muted/50">
                            <FormLabel className="text-sm font-normal">Elimination Routing</FormLabel>
                            <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={control}
                        name="isContractBasedRoutingEnabled"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg p-2 hover:bg-muted/50">
                            <FormLabel className="text-sm font-normal">Contract Based Routing</FormLabel>
                            <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    {(form.watch("isSuccessBasedRoutingEnabled") || form.watch("isEliminationRoutingEnabled") || form.watch("isContractBasedRoutingEnabled")) && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t mt-2">
                        {/* minAggregatesSize, maxAggregatesSize, Current Block Threshold group, defaultSuccessRate fields remain here */}
                        <FormField
                          control={control}
                          name="minAggregatesSize"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Min Aggregates Size</FormLabel>
                              <FormControl>
                                <Input type="number" placeholder="e.g., 100" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} />
                              </FormControl>
                              <FormDescription className="text-xs">Min data points for performance eval.</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={control}
                          name="maxAggregatesSize"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Max Aggregates Size</FormLabel>
                              <FormControl>
                                <Input type="number" placeholder="e.g., 1000" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} />
                              </FormControl>
                              <FormDescription className="text-xs">Max data points for performance eval.</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        {/* Grouping for Current Block Threshold */}
                        <div className="md:col-span-2 space-y-2 p-3 border rounded-md">
                          <h4 className="text-sm font-medium mb-2">Current Block Threshold</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                              control={control}
                              name="currentBlockThresholdDurationInMins"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Duration (mins)</FormLabel>
                                  <FormControl>
                                    <Input type="number" placeholder="e.g., 5" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} min="0" />
                                  </FormControl>
                                  <FormDescription className="text-xs">Time window for failure count.</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={control}
                              name="currentBlockThresholdMaxTotalCount"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Max Failures in Window</FormLabel>
                                  <FormControl>
                                    <Input type="number" placeholder="e.g., 10" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} min="0"/>
                                  </FormControl>
                                  <FormDescription className="text-xs">Failures in window before temp. blocking.</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                        {/* End of Grouping */}
                        <FormField
                          control={control}
                          name="defaultSuccessRate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Default Success Rate (%)</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  placeholder="e.g., 90" 
                                  {...field} 
                                  onChange={e => field.onChange(parseFloat(e.target.value) || 0)} 
                                  min="0" max="100" step="0.1"
                                />
                              </FormControl>
                              <FormDescription className="text-xs">Fallback SR if not enough data.</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="flex justify-end mt-4">
                        <Button 
                          type="button" 
                          onClick={async () => {
                            if (!form.getValues("isSuccessBasedRoutingEnabled")) {
                              toast({ title: "Info", description: "Success Based Routing is not enabled.", variant: "default" });
                              return;
                            }
                            if (!successBasedAlgorithmId) {
                              toast({ title: "Error", description: "Algorithm ID not found. Please toggle Success Based Routing ON first.", variant: "destructive" });
                              return;
                            }
                            if (!apiKey || !profileId || !merchantId) {
                              toast({ title: "Error", description: "API credentials or Merchant/Profile ID missing.", variant: "destructive" });
                              return;
                            }

                            const formValues = form.getValues();
                            const configPayload = {
                              params: [ // Using static params from cURL for now
                                "Currency", "CardBin", "Country", "PaymentMethod", 
                                "PaymentMethodType", "AuthenticationType", "CardNetwork"
                              ],
                              config: {
                                min_aggregates_size: formValues.minAggregatesSize,
                                default_success_rate: formValues.defaultSuccessRate, // Assuming API expects 0-100
                                max_aggregates_size: formValues.maxAggregatesSize,
                                current_block_threshold: {
                                  duration_in_mins: formValues.currentBlockThresholdDurationInMins,
                                  max_total_count: formValues.currentBlockThresholdMaxTotalCount
                                }
                              }
                            };

                            // Remove undefined optional fields from config to match Option<T> behavior if API expects missing fields to be absent
                            if (configPayload.config.min_aggregates_size === undefined) delete configPayload.config.min_aggregates_size;
                            if (configPayload.config.default_success_rate === undefined) delete configPayload.config.default_success_rate;
                            if (configPayload.config.max_aggregates_size === undefined) delete configPayload.config.max_aggregates_size;
                            if (configPayload.config.current_block_threshold.duration_in_mins === undefined) delete configPayload.config.current_block_threshold.duration_in_mins;
                            if (configPayload.config.current_block_threshold.max_total_count === undefined) delete configPayload.config.current_block_threshold.max_total_count;
                            // If current_block_threshold itself could be optional and all its fields are undefined, it could be removed too.
                            // For now, assuming current_block_threshold object is always sent if any of its fields are set.

                            const apiUrl = `https://integ-api.hyperswitch.io/account/${merchantId}/business_profile/${profileId}/dynamic_routing/success_based/config/${successBasedAlgorithmId}`;
                            
                            // console.log("Attempting to PATCH Success Based Config:");
                            // console.log("URL:", apiUrl);
                            // console.log("Payload:", JSON.stringify(configPayload, null, 2));
                            // console.log("API Key used:", apiKey);

                            try {
                              const response = await fetch(apiUrl, {
                                method: 'PATCH',
                                headers: {
                                  'api-key': apiKey,
                                  'Content-Type': 'application/json',
                                  'Accept': 'application/json',
                                },
                                body: JSON.stringify(configPayload),
                              });

                              if (!response.ok) {
                                const errorData = await response.json().catch(() => ({ message: "Failed to update config." }));
                                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
                              }
                              
                              // const responseData = await response.json(); // Or handle success with no content if API returns 204
                              toast({ title: "Success", description: "Success Based Routing configuration updated." });
                              // console.log("Config update response:", responseData);

                            } catch (error: any) {
                              console.error("Error updating config:", error);
                              toast({ title: "Update Failed", description: error.message, variant: "destructive" });
                            }
                          }}
                        >
                          Update Config
                        </Button>
                      </div>
                    </>
                  )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="sr-incidents" className="pt-2 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Section 1: Success Test Card Details */}
                  <Card className="md:col-span-1">
                    <CardHeader>
                      <CardTitle className="text-base">Success Test Card</CardTitle>
                      <CardDescription className="text-xs">Enter details for a successful transaction.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <FormField
                        control={control}
                        name="successCardNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Card Number</FormLabel>
                            <FormControl><Input placeholder="e.g., 4242..." {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <FormField
                          control={control}
                          name="successCardExpMonth"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Exp. Month</FormLabel>
                              <FormControl><Input placeholder="MM" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={control}
                          name="successCardExpYear"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Exp. Year</FormLabel>
                              <FormControl><Input placeholder="YY" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={control}
                        name="successCardHolderName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Card Holder Name</FormLabel>
                            <FormControl><Input placeholder="e.g., Joseph Doe" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={control}
                        name="successCardCvc"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">CVC</FormLabel>
                            <FormControl><Input placeholder="e.g., 123" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  {/* Section 2: Failure Test Card Details */}
                  <Card className="md:col-span-1">
                    <CardHeader>
                      <CardTitle className="text-base">Failure Test Card</CardTitle>
                      <CardDescription className="text-xs">Enter details for a failed transaction.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <FormField
                        control={control}
                        name="failureCardNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Card Number</FormLabel>
                            <FormControl><Input placeholder="e.g., 4000..." {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <FormField
                          control={control}
                          name="failureCardExpMonth"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Exp. Month</FormLabel>
                              <FormControl><Input placeholder="MM" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={control}
                          name="failureCardExpYear"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Exp. Year</FormLabel>
                              <FormControl><Input placeholder="YY" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={control}
                        name="failureCardHolderName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Card Holder Name</FormLabel>
                            <FormControl><Input placeholder="e.g., Jane Roe" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={control}
                        name="failureCardCvc"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">CVC</FormLabel>
                            <FormControl><Input placeholder="e.g., 999" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  {/* Section 3: Failure Percentage Slider */}
                  <Card className="md:col-span-1">
                    <CardHeader>
                      <CardTitle className="text-base">Failure Percentage</CardTitle>
                      <CardDescription className="text-xs">Set the likelihood of a transaction failing.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <FormField
                        control={control}
                        name="failurePercentage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Failure Rate: {field.value}%</FormLabel>
                            <FormControl>
                              <Slider
                                defaultValue={[field.value || 50]}
                                min={0} max={100} step={1}
                                onValueChange={(value: number[]) => { field.onChange(value[0]); }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </form>
        </Form>
      </ScrollArea>
    </div>
  );
}
