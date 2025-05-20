
"use client";

import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
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
import { PAYMENT_METHODS, PROCESSORS, DEFAULT_PROCESSOR_AVAILABILITY } from '@/lib/constants';
import type { ControlsState, PaymentMethod, ProcessorPaymentMethodMatrix, ProcessorIncidentStatus, StructuredRule, ConditionField, ConditionOperator } from '@/lib/types';
import { Settings2, TrendingUp, Zap, VenetianMaskIcon, AlertTriangle, Trash2, Percent } from 'lucide-react';

const defaultProcessorMatrix: ProcessorPaymentMethodMatrix = PROCESSORS.reduce((acc, proc) => {
  acc[proc.id] = DEFAULT_PROCESSOR_AVAILABILITY[proc.id] ||
    PAYMENT_METHODS.reduce((methodsAcc, method) => {
      methodsAcc[method] = false;
      return methodsAcc;
    }, {} as Record<PaymentMethod, boolean>);
  return acc;
}, {} as ProcessorPaymentMethodMatrix);


const defaultProcessorIncidents: ProcessorIncidentStatus = PROCESSORS.reduce((acc, proc) => {
  acc[proc.id] = null; 
  return acc;
}, {} as ProcessorIncidentStatus);

const defaultProcessorWiseSuccessRates = PROCESSORS.reduce((acc, proc) => {
  let defaultSr = 85;
  // Assign some default SRs for the new processors
  if (proc.id === 'stripe') defaultSr = 92;
  else if (proc.id === 'adyen') defaultSr = 90;
  else if (proc.id === 'paypal') defaultSr = 88;
  else if (proc.id === 'worldpay') defaultSr = 86;
  else if (proc.id === 'checkoutcom') defaultSr = 91;

  acc[proc.id] = { 
    sr: defaultSr, 
    srDeviation: 2, // Default deviation of +/- 2 percentage points
    volumeShare: 0, 
    failureRate: 100 - defaultSr 
  };
  return acc;
}, {} as ControlsState['processorWiseSuccessRates']);


const formSchema = z.object({
  totalPayments: z.number().min(0).max(1000000),
  tps: z.number().min(1).max(10000),
  selectedPaymentMethods: z.array(z.string()).min(1, "Please select at least one payment method."),
  processorMatrix: z.record(z.string(), z.record(z.string(), z.boolean())),
  
  ruleConditionField: z.custom<ConditionField>().optional(),
  ruleConditionOperator: z.custom<ConditionOperator>().optional(),
  ruleConditionValue: z.custom<PaymentMethod>().optional(),
  ruleActionProcessorId: z.string().optional(),

  processorIncidents: z.record(z.string(), z.number().nullable()),
  overallSuccessRate: z.number().min(0).max(100).optional(),
  processorWiseSuccessRates: z.record(z.string(), z.object({ 
    sr: z.number().min(0).max(100),
    srDeviation: z.number().min(0).max(50).describe("Success rate deviation in absolute percentage points, e.g., 5 means +/- 5%."),
    volumeShare: z.number().min(0).max(100), 
    failureRate: z.number().min(0).max(100),
  })),
});

export type FormValues = Omit<z.infer<typeof formSchema>, 'structuredRule'> & { structuredRule: StructuredRule | null };


interface BottomControlsPanelProps {
  onFormChange: (data: FormValues) => void;
  initialValues?: Partial<FormValues>;
}

const BOTTOM_PANEL_HEIGHT = "350px";

export function BottomControlsPanel({ onFormChange, initialValues }: BottomControlsPanelProps) {
  const form = useForm<z.infer<typeof formSchema>>({ 
    resolver: zodResolver(formSchema),
    defaultValues: {
      totalPayments: initialValues?.totalPayments ?? 1000,
      tps: initialValues?.tps ?? 100,
      selectedPaymentMethods: initialValues?.selectedPaymentMethods ?? [PAYMENT_METHODS[0], PAYMENT_METHODS[1]],
      processorMatrix: initialValues?.processorMatrix ?? defaultProcessorMatrix,
      
      ruleConditionField: initialValues?.structuredRule?.condition.field ?? undefined,
      ruleConditionOperator: initialValues?.structuredRule?.condition.operator ?? undefined,
      ruleConditionValue: initialValues?.structuredRule?.condition.value ?? undefined,
      ruleActionProcessorId: initialValues?.structuredRule?.action.processorId ?? undefined,

      processorIncidents: initialValues?.processorIncidents ?? defaultProcessorIncidents,
      overallSuccessRate: initialValues?.overallSuccessRate ?? 0, 
      processorWiseSuccessRates: initialValues?.processorWiseSuccessRates ?? defaultProcessorWiseSuccessRates,
    },
  });

  const [selectedIncidentProcessor, setSelectedIncidentProcessor] = useState<string>(PROCESSORS[0].id);
  const [incidentDuration, setIncidentDuration] = useState<number>(10); 

  useEffect(() => {
    const subscription = form.watch((values) => {
      const parsedValues = formSchema.safeParse(values);
      if (parsedValues.success) {
        const formData = parsedValues.data;
        let rule: StructuredRule | null = null;
        if (formData.ruleConditionField && formData.ruleConditionOperator && formData.ruleConditionValue && formData.ruleActionProcessorId) {
          rule = {
            id: 'rule1', 
            condition: {
              field: formData.ruleConditionField,
              operator: formData.ruleConditionOperator,
              value: formData.ruleConditionValue,
            },
            action: {
              type: 'ROUTE_TO_PROCESSOR',
              processorId: formData.ruleActionProcessorId,
            },
          };
        }
        onFormChange({ ...formData, structuredRule: rule });
      } else {
         onFormChange({ ...values, structuredRule: null } as FormValues);
      }
    });

    const initialFormValues = form.getValues();
     const initialParsed = formSchema.safeParse(initialFormValues);
      let initialRule: StructuredRule | null = null;
      if(initialParsed.success){
        const initialFormData = initialParsed.data;
        if (initialFormData.ruleConditionField && initialFormData.ruleConditionOperator && initialFormData.ruleConditionValue && initialFormData.ruleActionProcessorId) {
             initialRule = {
                id: 'rule1',
                condition: { field: initialFormData.ruleConditionField, operator: initialFormData.ruleConditionOperator, value: initialFormData.ruleConditionValue },
                action: { type: 'ROUTE_TO_PROCESSOR', processorId: initialFormData.ruleActionProcessorId }
            };
        }
        
        const initialSRs = { ...defaultProcessorWiseSuccessRates };
        Object.keys(initialSRs).forEach(procId => {
            initialSRs[procId].failureRate = 100 - initialSRs[procId].sr;
        });
        const formDataWithInitialSRs = {...initialFormData, processorWiseSuccessRates: initialSRs };

        onFormChange({ ...formDataWithInitialSRs, structuredRule: initialRule });
      } else {
         onFormChange({ ...initialFormValues, structuredRule: null } as FormValues);
      }

    return () => subscription.unsubscribe();
  }, [form, onFormChange]); 

  const { control } = form;

  const handleTriggerIncident = () => {
    if (selectedIncidentProcessor && incidentDuration > 0) {
      const endTime = Date.now() + incidentDuration * 1000;
      form.setValue(`processorIncidents.${selectedIncidentProcessor}` as any, endTime, { shouldValidate: true, shouldDirty: true });
    }
  };
  
  const handleClearRule = () => {
    form.setValue('ruleConditionField', undefined, { shouldDirty: true });
    form.setValue('ruleConditionOperator', undefined, { shouldDirty: true });
    form.setValue('ruleConditionValue', undefined, { shouldDirty: true });
    form.setValue('ruleActionProcessorId', undefined, { shouldDirty: true });
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
                  <FormField
                    control={control}
                    name="tps"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>TPS ({field.value})</FormLabel>
                        <FormControl>
                          <Slider
                            defaultValue={[field.value]}
                            min={1} max={10000} step={50}
                            onValueChange={(value) => field.onChange(value[0])}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                      {PROCESSORS.map(proc => (
                        <div key={proc.id} className="border p-2 rounded-md">
                          <h4 className="font-medium mb-1 text-sm">{proc.name}</h4>
                          {PAYMENT_METHODS.map(method => (
                            <FormField
                              key={`${proc.id}-${method}`}
                              control={control}
                              name={`processorMatrix.${proc.id}.${method}`}
                              render={({ field }) => (
                                <FormItem className="flex items-center justify-between py-0.5">
                                  <FormLabel className="font-normal text-xs">{method}</FormLabel>
                                  <FormControl>
                                    <Switch checked={field.value ?? false} onCheckedChange={field.onChange} size="sm" />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="routing" className="pt-2">
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
                                {PROCESSORS.map(proc => <SelectItem key={proc.id} value={proc.id}>{proc.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                  </CardContent>
                </Card>
                
                <div className="text-center mt-4">
                  <p className="text-xs text-muted-foreground">
                    Elimination routing (skipping downed processors or those with base SR &lt; 50%) is always active.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="sr-incidents" className="pt-2 space-y-3">
                <Card>
                  <CardHeader className="p-2">
                    <CardTitle className="text-base">Processor Base Success Rates</CardTitle>
                    <CardDescription className="text-xs">Set the target mean success rate (%) for each processor.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 p-2">
                    {PROCESSORS.map(proc => (
                      <FormField
                        key={proc.id}
                        control={control}
                        name={`processorWiseSuccessRates.${proc.id}.sr`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">{proc.name} Base SR: {field.value}%</FormLabel>
                            <FormControl>
                              <Slider 
                                defaultValue={[field.value]} 
                                min={0} max={100} step={1} 
                                onValueChange={(value) => field.onChange(value[0])} 
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="p-2">
                    <CardTitle className="text-base">Success Rate Deviation</CardTitle>
                    <CardDescription className="text-xs">Set SR deviation (+/- percentage points) for randomness.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 p-2">
                    {PROCESSORS.map(proc => (
                      <FormField
                        key={`${proc.id}-deviation`}
                        control={control}
                        name={`processorWiseSuccessRates.${proc.id}.srDeviation`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">{proc.name} SR Deviation: +/- {field.value}%</FormLabel>
                            <FormControl>
                              <Slider 
                                defaultValue={[field.value]} 
                                min={0} max={20} step={1} // e.g. 0-20% deviation
                                onValueChange={(value) => field.onChange(value[0])} 
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    ))}
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
                      <Select onValueChange={setSelectedIncidentProcessor} defaultValue={selectedIncidentProcessor}>
                        <FormControl>
                          <SelectTrigger id="incidentProcessor">
                            <SelectValue placeholder="Select processor" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PROCESSORS.map(proc => (
                            <SelectItem key={proc.id} value={proc.id}>{proc.name}</SelectItem>
                          ))}
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
                    <Button onClick={handleTriggerIncident} type="button" size="sm" className="w-auto">
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
