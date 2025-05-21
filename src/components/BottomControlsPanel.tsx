"use client";

import React, { useEffect, useState, useMemo } from 'react'; // Added useMemo
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
import { Settings2, TrendingUp, Zap, VenetianMaskIcon, AlertTriangle, Trash2 } from 'lucide-react'; // Removed Percent, BrainCircuit as they are not used here

const formSchema = z.object({
  totalPayments: z.number().min(0).max(1000000),
  // tps: z.number().min(1).max(10000), // TPS Removed
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
    volumeShare: z.number().min(0).max(100), // This is for display in table, not directly set here
    failureRate: z.number().min(0).max(100), // This is for display in table, not directly set here
  })),
  minAggregatesSize: z.number().min(1).max(100000),
  maxAggregatesSize: z.number().min(1).max(1000000),
  currentBlockThresholdMaxTotalCount: z.number().min(0).max(10000),
  volumeSplit: z.number().min(0).max(100),
}).refine(data => data.maxAggregatesSize >= data.minAggregatesSize, {
  message: "Max aggregates size must be >= min aggregates size.",
  path: ["maxAggregatesSize"],
});

// Note: overallSuccessRate is part of ControlsState but not directly part of this form's schema
// It's usually calculated and displayed, not configured here.
export type FormValues = Omit<z.infer<typeof formSchema>, 'structuredRule' | 'overallSuccessRate'> & { 
  structuredRule: StructuredRule | null;
  overallSuccessRate?: number; // Make it optional as it's not set by this form
};

interface BottomControlsPanelProps {
  onFormChange: (data: FormValues) => void;
  initialValues?: Partial<FormValues>;
  merchantConnectors: MerchantConnector[];
}

const BOTTOM_PANEL_HEIGHT = "350px";

export function BottomControlsPanel({ onFormChange, initialValues, merchantConnectors }: BottomControlsPanelProps) {
  
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
      rates[key] = { sr: 85, srDeviation: 5, volumeShare: 0, failureRate: 15 };
    });
    return { matrix, incidents, rates };
  }, [merchantConnectors]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      totalPayments: 1000,
      // tps: 100, // TPS Removed
      selectedPaymentMethods: [...PAYMENT_METHODS],
      processorMatrix: dynamicDefaults.matrix,
      processorIncidents: dynamicDefaults.incidents,
      processorWiseSuccessRates: dynamicDefaults.rates,
      minAggregatesSize: 100,
      maxAggregatesSize: 1000,
      currentBlockThresholdMaxTotalCount: 10,
      volumeSplit: 100,
      ruleConditionField: undefined,
      ruleConditionOperator: undefined,
      ruleConditionValue: undefined,
      ruleActionProcessorId: undefined,
      ...initialValues, // Apply initialValues last to override defaults
    },
  });
  
  const [selectedIncidentProcessor, setSelectedIncidentProcessor] = useState<string>('');
  const [incidentDuration, setIncidentDuration] = useState<number>(10);

  useEffect(() => {
    if (merchantConnectors && merchantConnectors.length > 0) {
      const currentFormValues = form.getValues();
      const newDefaults = {
        processorMatrix: dynamicDefaults.matrix,
        processorIncidents: dynamicDefaults.incidents,
        processorWiseSuccessRates: dynamicDefaults.rates,
      };
      
      // Merge existing form values with new defaults for processor-specific fields
      // This preserves user changes to non-processor-specific fields
      form.reset({
        ...currentFormValues,
        ...newDefaults,
        // If initialValues were provided, they should ideally be re-evaluated against new connectors
        // For simplicity, we're resetting processor parts to new dynamic defaults.
      });

      const firstConnectorId = merchantConnectors[0].merchant_connector_id || merchantConnectors[0].connector_name;
      if (firstConnectorId && (!selectedIncidentProcessor || !merchantConnectors.some(c => (c.merchant_connector_id || c.connector_name) === selectedIncidentProcessor))) {
        setSelectedIncidentProcessor(firstConnectorId);
      }
    } else {
      form.reset({
        ...form.getValues(),
        processorMatrix: {},
        processorIncidents: {},
        processorWiseSuccessRates: {},
        ruleActionProcessorId: undefined,
      });
      setSelectedIncidentProcessor('');
    }
  }, [merchantConnectors, dynamicDefaults, form, selectedIncidentProcessor]);

  useEffect(() => {
    const subscription = form.watch((values, { name, type }) => {
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
        // Pass only FormValues compatible fields, overallSuccessRate is not part of this form's direct output
        const { overallSuccessRate, ...outputValues } = formData as any; 
        onFormChange({ ...outputValues, structuredRule: rule } as FormValues);
      }
      // Not calling onFormChange on error to prevent invalid state propagation
    });

    // Initial call to onFormChange with default/initial values
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
        // Handle case where default values might not be fully valid initially (e.g. if merchantConnectors is empty)
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
                <TabsTrigger value="sr-incidents" className="text-xs md:text-sm"><TrendingUp className="mr-1 h-4 w-4 md:mr-2" />Rates & Incidents</TabsTrigger>
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
                  {/* TPS Field Removed */}
                  {/* <FormField
                    control={control}
                    name="tps"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>TPS ({field.value})</FormLabel>
                        <FormControl>
                        <Slider
                          defaultValue={[field.value]}
                          min={1} max={10000} step={50}
                          onValueChange={(value: number[]) => { field.onChange(value[0]); }}
                        />
                      </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  /> */}
                  <FormField
                    control={control}
                    name="selectedPaymentMethods"
                    render={() => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Payment Methods</FormLabel>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                          {PAYMENT_METHODS.map((method) => (
                            <FormField
                              key={method}
                              control={control}
                              name="selectedPaymentMethods"
                              render={({ field: singleMethodField }) => {
                                return (
                                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                    <FormControl>
                                      <Checkbox
                                        checked={singleMethodField.value?.includes(method)}
                                        onCheckedChange={(checked) => {
                                          const currentSelection = singleMethodField.value ?? [];
                                          return checked
                                            ? singleMethodField.onChange([...currentSelection, method])
                                            : singleMethodField.onChange(
                                                currentSelection.filter(
                                                  (value) => value !== method
                                                )
                                              );
                                        }}
                                      />
                                    </FormControl>
                                    <FormLabel className="font-normal">
                                      {method}
                                    </FormLabel>
                                  </FormItem>
                                );
                              }}
                            />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                          <div key={connectorId} className="border p-2 rounded-md">
                            <h4 className="font-medium mb-1 text-sm truncate" title={connectorDisplayName}>{connectorDisplayName}</h4>
                            {PAYMENT_METHODS.map(method => (
                              <FormField
                                key={`${connectorId}-${method}`}
                                control={control}
                                name={`processorMatrix.${connectorId}.${method}`}
                                render={({ field }) => (
                                  <FormItem className="flex items-center py-0.5">
                                    <FormLabel className="font-normal text-xs mr-auto">{method}</FormLabel>
                                  <FormControl>
                                    <Switch checked={field.value ?? false} onCheckedChange={field.onChange} size="sm" />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                      );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="routing" className="pt-2 space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-base">Custom Routing Rule (Single Rule)</CardTitle>
                       <Button variant="outline" size="sm" onClick={handleClearRule} className="text-xs">
                        <Trash2 className="mr-1 h-3 w-3" /> Clear Rule
                      </Button>
                    </div>
                    <CardDescription className="text-xs">Define one custom routing rule. E.g., IF Payment Method EQUALS Card THEN Route To Stripe.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm font-medium mb-1">IF:</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                      <FormField
                        control={control}
                        name="ruleConditionField"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Condition Field</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl><SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="paymentMethod">Payment Method</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={control}
                        name="ruleConditionOperator"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Operator</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={!form.watch("ruleConditionField")}>
                              <FormControl><SelectTrigger><SelectValue placeholder="Select operator" /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="EQUALS">Equals</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={control}
                        name="ruleConditionValue"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Value</FormLabel>
                            {form.watch("ruleConditionField") === 'paymentMethod' ? (
                              <Select onValueChange={field.onChange} value={field.value} disabled={!form.watch("ruleConditionOperator")}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Select payment method" /></SelectTrigger></FormControl>
                                <SelectContent>
                                  {PAYMENT_METHODS.map(pm => <SelectItem key={pm} value={pm}>{pm}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input type="text" placeholder="Enter value" {...field} disabled={!form.watch("ruleConditionOperator")} />
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                     <div className="text-sm font-medium mb-1 mt-2">THEN:</div>
                     <FormField
                        control={control}
                        name="ruleActionProcessorId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Route to Processor</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={!form.watch("ruleConditionValue")}>
                              <FormControl><SelectTrigger><SelectValue placeholder="Select processor" /></SelectTrigger></FormControl>
                              <SelectContent>
                                {(merchantConnectors || []).map(connector => {
                                  const connectorId = connector.merchant_connector_id || connector.connector_name;
                                  const connectorDisplayName = connector.connector_label || connector.connector_name;
                                  return <SelectItem key={connectorId} value={connectorId}>{connectorDisplayName}</SelectItem>;
                                })}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                     <div className="flex items-center">
                        {/* Using Settings2 as BrainCircuit was removed from imports to save space, can be re-added */}
                        <Settings2 className="mr-2 h-5 w-5 text-primary" /> 
                        <CardTitle className="text-base">Intelligent Routing Parameters</CardTitle>
                      </div>
                    <CardDescription className="text-xs pt-1">Configure parameters for dynamic routing decisions. Elimination routing (skipping downed or low SR processors) is always active.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      <FormField
                        control={control}
                        name="currentBlockThresholdMaxTotalCount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Max Failures to Block</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="e.g., 10" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} />
                            </FormControl>
                            <FormDescription className="text-xs">Failures in window before temp. blocking.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={control}
                        name="volumeSplit"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Volume Split for Intelligent Routing: {field.value}%</FormLabel>
                            <div className="flex items-center gap-2">
                              <Slider
                                defaultValue={[field.value]}
                                min={0} max={100} step={1}
                                onValueChange={(value: number[]) => { field.onChange(value[0]); }}
                                className="flex-grow"
                                />
                                <Input
                                    type="number"
                                    className="w-20 text-xs p-1 h-8"
                                    value={field.value}
                                    onChange={e => {
                                        const val = parseInt(e.target.value);
                                        if (!isNaN(val) && val >= 0 && val <= 100) field.onChange(val);
                                        else if (e.target.value === "") field.onChange(0);
                                    }}
                                    min="0" max="100"
                                />
                            </div>
                            <FormDescription className="text-xs">% of traffic using intelligent routing.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="sr-incidents" className="pt-2 space-y-3">
                <Card>
                  <CardHeader className="p-2">
                    <CardTitle className="text-base">Processor Base Success Rates</CardTitle>
                    <CardDescription className="text-xs">Set the target mean success rate (%) for each processor.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 p-2">
                    {(merchantConnectors || []).map(connector => {
                      const connectorId = connector.merchant_connector_id || connector.connector_name;
                      const connectorDisplayName = connector.connector_label || connector.connector_name;
                      return (
                        <FormField
                          key={connectorId}
                          control={control}
                          name={`processorWiseSuccessRates.${connectorId}.sr`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs truncate" title={connectorDisplayName}>{connectorDisplayName} Base SR: {field.value}%</FormLabel>
                            <FormControl>
                              <Slider
                                defaultValue={[field.value]}
                                min={0} max={100} step={1}
                                onValueChange={(value: number[]) => { field.onChange(value[0]); }}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    );
                    })}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="p-2">
                    <CardTitle className="text-base">Success Rate Deviation</CardTitle>
                    <CardDescription className="text-xs">Set SR deviation (+/- percentage points) for randomness.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 p-2">
                    {(merchantConnectors || []).map(connector => {
                      const connectorId = connector.merchant_connector_id || connector.connector_name;
                      const connectorDisplayName = connector.connector_label || connector.connector_name;
                      return (
                        <FormField
                          key={`${connectorId}-deviation`}
                          control={control}
                          name={`processorWiseSuccessRates.${connectorId}.srDeviation`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs truncate" title={connectorDisplayName}>{connectorDisplayName} SR Deviation: +/- {field.value}%</FormLabel>
                            <FormControl>
                              <Slider
                                defaultValue={[field.value]}
                                min={0} max={20} step={1}
                                onValueChange={(value: number[]) => { field.onChange(value[0]); }}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    );
                    })}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="p-2">
                    <CardTitle className="text-base">Processor Incidents (Timed Downtime)</CardTitle>
                    <CardDescription className="text-xs">Trigger temporary outages for a selected processor.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end p-3">
                    <FormItem>
                      <FormLabel htmlFor="incidentProcessor" className="text-xs">Processor</FormLabel>
                      <Select 
                        onValueChange={setSelectedIncidentProcessor} 
                        value={selectedIncidentProcessor} 
                        disabled={!merchantConnectors || merchantConnectors.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger id="incidentProcessor">
                            <SelectValue placeholder="Select processor" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(merchantConnectors || []).map(connector => {
                             const connectorId = connector.merchant_connector_id || connector.connector_name;
                             const connectorDisplayName = connector.connector_label || connector.connector_name;
                            return <SelectItem key={connectorId} value={connectorId}>{connectorDisplayName}</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                    </FormItem>
                    <FormItem>
                      <FormLabel htmlFor="incidentDuration" className="text-xs">Downtime (seconds)</FormLabel>
                      <Input
                        id="incidentDuration"
                        type="number"
                        value={incidentDuration}
                        onChange={(e) => setIncidentDuration(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        min="1"
                      />
                    </FormItem>
                    <Button onClick={handleTriggerIncident} variant="primary" type="button" size="sm" className="w-auto">
                      <AlertTriangle className="mr-2 h-4 w-4" /> Trigger Incident
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </form>
        </Form>
      </ScrollArea>
    </div>
  );
}
