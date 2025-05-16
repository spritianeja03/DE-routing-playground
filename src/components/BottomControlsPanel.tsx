
"use client";

import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { CURRENCIES, PAYMENT_METHODS, PROCESSORS, DEFAULT_PROCESSOR_AVAILABILITY } from '@/lib/constants';
import type { ControlsState, PaymentMethod, ProcessorPaymentMethodMatrix, SRFluctuation, ProcessorIncidentStatus } from '@/lib/types';
import { Settings2, TrendingUp, Zap, VenetianMaskIcon } from 'lucide-react';

const defaultProcessorMatrix: ProcessorPaymentMethodMatrix = PROCESSORS.reduce((acc, proc) => {
  acc[proc.id] = DEFAULT_PROCESSOR_AVAILABILITY[proc.id] ||
    PAYMENT_METHODS.reduce((methodsAcc, method) => {
      methodsAcc[method] = false; 
      return methodsAcc;
    }, {} as Record<PaymentMethod, boolean>);
  return acc;
}, {} as ProcessorPaymentMethodMatrix);


const defaultSRFluctuation: SRFluctuation = PROCESSORS.reduce((acc, proc) => {
  acc[proc.id] = 50; 
  return acc;
}, {} as SRFluctuation);

const defaultProcessorIncidents: ProcessorIncidentStatus = PROCESSORS.reduce((acc, proc) => {
  acc[proc.id] = false;
  return acc;
}, {} as ProcessorIncidentStatus);

const defaultProcessorWiseSuccessRates = PROCESSORS.reduce((acc, proc) => {
  const initialVolumeShare = Math.round(100 / PROCESSORS.length);
  acc[proc.id] = { sr: proc.id === 'stripe' ? 90 : (proc.id === 'razorpay' ? 95 : (proc.id === 'cashfree' ? 92 : (proc.id === 'payu' ? 88 : 85))), volumeShare: initialVolumeShare, failureRate: 10 };
  return acc;
}, {} as ControlsState['processorWiseSuccessRates']);


const formSchema = z.object({
  totalPayments: z.number().min(0).max(1000000),
  tps: z.number().min(1).max(10000), // Increased max TPS for sale event
  selectedPaymentMethods: z.array(z.string()).min(1, "Please select at least one payment method."),
  amount: z.number().min(0),
  currency: z.enum(CURRENCIES),
  processorMatrix: z.record(z.string(), z.record(z.string(), z.boolean())),
  routingRulesText: z.string(),
  smartRoutingEnabled: z.boolean(),
  eliminationRoutingEnabled: z.boolean(),
  debitRoutingEnabled: z.boolean(),
  simulateSaleEvent: z.boolean(),
  srFluctuation: z.record(z.string(), z.number().min(0).max(100)),
  processorIncidents: z.record(z.string(), z.boolean()),
  overallSuccessRate: z.number().min(0).max(100).optional(), // Made optional as it's calculated
  processorWiseSuccessRates: z.record(z.string(), z.object({
    sr: z.number().min(0).max(100),
    volumeShare: z.number().min(0).max(100),
    failureRate: z.number().min(0).max(100),
  })),
});

export type FormValues = z.infer<typeof formSchema>;

interface BottomControlsPanelProps {
  onFormChange: (data: FormValues) => void;
  initialValues?: Partial<FormValues>;
  isSimulationActive: boolean; // New prop
}

const BOTTOM_PANEL_HEIGHT = "350px";

export function BottomControlsPanel({ onFormChange, initialValues, isSimulationActive }: BottomControlsPanelProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      totalPayments: initialValues?.totalPayments ?? 1000,
      tps: initialValues?.tps ?? 100,
      selectedPaymentMethods: initialValues?.selectedPaymentMethods ?? [PAYMENT_METHODS[0], PAYMENT_METHODS[1]],
      amount: initialValues?.amount ?? 2500,
      currency: initialValues?.currency ?? CURRENCIES[0],
      processorMatrix: initialValues?.processorMatrix ?? defaultProcessorMatrix,
      routingRulesText: initialValues?.routingRulesText ?? "IF amount > 5000 AND method = Card THEN RouteTo stripe",
      smartRoutingEnabled: initialValues?.smartRoutingEnabled ?? false,
      eliminationRoutingEnabled: initialValues?.eliminationRoutingEnabled ?? true,
      debitRoutingEnabled: initialValues?.debitRoutingEnabled ?? false,
      simulateSaleEvent: initialValues?.simulateSaleEvent ?? false,
      srFluctuation: initialValues?.srFluctuation ?? defaultSRFluctuation,
      processorIncidents: initialValues?.processorIncidents ?? defaultProcessorIncidents,
      overallSuccessRate: initialValues?.overallSuccessRate ?? 0, // Start at 0
      processorWiseSuccessRates: initialValues?.processorWiseSuccessRates ?? defaultProcessorWiseSuccessRates,
    },
  });

  React.useEffect(() => {
    const subscription = form.watch((values) => {
      const validValues = formSchema.safeParse(values);
      if (validValues.success) {
         onFormChange(validValues.data as FormValues);
      } else {
        // If not fully valid yet (e.g., during typing a number), still pass what we have
        // This helps with reactivity for sliders, etc., before full validation passes
        onFormChange(values as FormValues);
      }
    });
    // Initial form values push
    const initialFormValues = form.getValues();
    const validInitial = formSchema.safeParse(initialFormValues);
    if(validInitial.success) {
        onFormChange(validInitial.data as FormValues);
    } else {
        onFormChange(initialFormValues as FormValues);
    }
    
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.watch, onFormChange]); // form.formState.isValid removed

  const { control } = form;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-lg z-20"
      style={{ height: BOTTOM_PANEL_HEIGHT }}
    >
      <fieldset disabled={isSimulationActive} className="h-full"> {/* Disable form if simulation is active */}
        <ScrollArea className="h-full p-1">
          <Form {...form}>
            <form onSubmit={(e) => e.preventDefault()} className="p-4 space-y-2">
              <Tabs defaultValue="general" className="w-full">
                <TabsList className="grid w-full grid-cols-4 mb-2">
                  <TabsTrigger value="general" className="text-xs md:text-sm"><Settings2 className="mr-1 h-4 w-4 md:mr-2" />General</TabsTrigger>
                  <TabsTrigger value="processors" className="text-xs md:text-sm"><VenetianMaskIcon className="mr-1 h-4 w-4 md:mr-2" />Processors</TabsTrigger>
                  <TabsTrigger value="routing" className="text-xs md:text-sm"><Zap className="mr-1 h-4 w-4 md:mr-2" />Routing</TabsTrigger>
                  <TabsTrigger value="sr-fluctuation" className="text-xs md:text-sm"><TrendingUp className="mr-1 h-4 w-4 md:mr-2" />SR & Incidents</TabsTrigger>
                </TabsList>

                <TabsContent value="general" className="pt-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount (txn)</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="e.g., 2500" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={control}
                      name="currency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Currency</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select currency" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={control}
                      name="selectedPaymentMethods"
                      render={() => (
                        <FormItem className="col-span-full">
                          <FormLabel>Payment Methods</FormLabel>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
                          <FormMessage /> {/* For selectedPaymentMethods array validation */}
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={control}
                        name="routingRulesText"
                        render={({ field }) => (
                          <FormItem className="col-span-full">
                            <FormLabel>Routing Rules</FormLabel>
                            <FormControl>
                              <Textarea placeholder="e.g., IF amount > 5000 AND method = Card THEN RouteTo stripe" {...field} rows={2}/>
                            </FormControl>
                            <FormDescription className="text-xs">Define routing rules (simplified text format).</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    <div className="space-y-1">
                      <FormField control={control} name="smartRoutingEnabled" render={({ field }) => ( <FormItem className="flex items-center justify-between"><FormLabel className="text-sm">Smart Routing (SR)</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} size="sm" /></FormControl></FormItem> )} />
                      <FormField control={control} name="eliminationRoutingEnabled" render={({ field }) => ( <FormItem className="flex items-center justify-between"><FormLabel className="text-sm">Elimination Routing</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} size="sm" /></FormControl></FormItem> )} />
                      <FormField control={control} name="debitRoutingEnabled" render={({ field }) => ( <FormItem className="flex items-center justify-between"><FormLabel className="text-sm">Debit-first Routing</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} size="sm" /></FormControl></FormItem> )} />
                    </div>
                    <div className="space-y-1">
                      <FormField control={control} name="simulateSaleEvent" render={({ field }) => ( <FormItem className="flex items-center justify-between"><FormLabel className="text-sm">Simulate Sale Event (TPS Spike)</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} size="sm" /></FormControl></FormItem> )} />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="sr-fluctuation" className="pt-2 space-y-3">
                  <Card>
                    <CardHeader className="p-2"><CardTitle className="text-base">SR Fluctuation (Base SR defined per processor)</CardTitle><CardDescription className="text-xs">Adjust success rate +/-. 50 is neutral.</CardDescription></CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 p-2">
                      {PROCESSORS.map(proc => (
                        <FormField
                          key={proc.id}
                          control={control}
                          name={`srFluctuation.${proc.id}`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">{proc.name} SR Fluct: {field.value}%</FormLabel>
                              <FormControl>
                                <Slider defaultValue={[field.value]} min={0} max={100} step={1} onValueChange={(value) => field.onChange(value[0])} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      ))}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="p-2"><CardTitle className="text-base">Processor Incidents (Downtime)</CardTitle><CardDescription className="text-xs">Trigger temporary outages.</CardDescription></CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 p-2">
                      {PROCESSORS.map(proc => (
                        <FormField
                          key={proc.id}
                          control={control}
                          name={`processorIncidents.${proc.id}`}
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between py-0.5">
                              <FormLabel className="text-xs">{proc.name} Incident</FormLabel>
                              <FormControl>
                                <Switch checked={field.value} onCheckedChange={field.onChange} size="sm"/>
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </form>
          </Form>
        </ScrollArea>
      </fieldset>
    </div>
  );
}
