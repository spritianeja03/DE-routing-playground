
"use client";

import React from 'react'; // Added this line
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { CURRENCIES, PAYMENT_METHODS, PROCESSORS, DEFAULT_PROCESSOR_AVAILABILITY } from '@/lib/constants';
import type { ControlsState, PaymentMethod, ProcessorPaymentMethodMatrix, SRFluctuation, ProcessorIncidentStatus } from '@/lib/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Textarea } from '@/components/ui/textarea';
import { Bot, Settings2, TrendingUp, Zap, AlertTriangle, DollarSign, VenetianMaskIcon } from 'lucide-react';

const defaultProcessorMatrix: ProcessorPaymentMethodMatrix = PROCESSORS.reduce((acc, proc) => {
  acc[proc.id] = DEFAULT_PROCESSOR_AVAILABILITY[proc.id] ||
    PAYMENT_METHODS.reduce((methodsAcc, method) => {
      methodsAcc[method] = false;
      return methodsAcc;
    }, {} as Record<PaymentMethod, boolean>);
  return acc;
}, {} as ProcessorPaymentMethodMatrix);

const defaultSRFluctuation: SRFluctuation = PROCESSORS.reduce((acc, proc) => {
  acc[proc.id] = 50; // Default to 50%
  return acc;
}, {} as SRFluctuation);

const defaultProcessorIncidents: ProcessorIncidentStatus = PROCESSORS.reduce((acc, proc) => {
  acc[proc.id] = false;
  return acc;
}, {} as ProcessorIncidentStatus);

const defaultProcessorWiseSuccessRates = PROCESSORS.reduce((acc, proc) => {
  acc[proc.id] = { sr: 90, volumeShare: Math.round(100 / PROCESSORS.length), failureRate: 10 };
  return acc;
}, {} as ControlsState['processorWiseSuccessRates']);


const formSchema = z.object({
  totalPayments: z.number().min(0).max(1000000),
  tps: z.number().min(1).max(5000),
  selectedPaymentMethods: z.array(z.enum(PAYMENT_METHODS)).min(1),
  amount: z.number().min(0),
  currency: z.enum(CURRENCIES),
  processorMatrix: z.record(z.string(), z.record(z.enum(PAYMENT_METHODS), z.boolean())),
  routingRulesText: z.string(),
  smartRoutingEnabled: z.boolean(),
  eliminationRoutingEnabled: z.boolean(),
  debitRoutingEnabled: z.boolean(),
  simulateSaleEvent: z.boolean(),
  srFluctuation: z.record(z.string(), z.number().min(0).max(100)),
  processorIncidents: z.record(z.string(), z.boolean()),
  overallSuccessRate: z.number().min(0).max(100),
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
}

const BOTTOM_PANEL_HEIGHT = "350px";

export function BottomControlsPanel({ onFormChange, initialValues }: BottomControlsPanelProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      totalPayments: initialValues?.totalPayments ?? 10000,
      tps: initialValues?.tps ?? 100,
      selectedPaymentMethods: initialValues?.selectedPaymentMethods ?? [PAYMENT_METHODS[0], PAYMENT_METHODS[1]],
      amount: initialValues?.amount ?? 100,
      currency: initialValues?.currency ?? CURRENCIES[0],
      processorMatrix: initialValues?.processorMatrix ?? defaultProcessorMatrix,
      routingRulesText: initialValues?.routingRulesText ?? "IF PaymentMethod = Card AND Amount > 5000 THEN RouteTo Stripe",
      smartRoutingEnabled: initialValues?.smartRoutingEnabled ?? false,
      eliminationRoutingEnabled: initialValues?.eliminationRoutingEnabled ?? true,
      debitRoutingEnabled: initialValues?.debitRoutingEnabled ?? false,
      simulateSaleEvent: initialValues?.simulateSaleEvent ?? false,
      srFluctuation: initialValues?.srFluctuation ?? defaultSRFluctuation,
      processorIncidents: initialValues?.processorIncidents ?? defaultProcessorIncidents,
      overallSuccessRate: initialValues?.overallSuccessRate ?? 92.3,
      processorWiseSuccessRates: initialValues?.processorWiseSuccessRates ?? defaultProcessorWiseSuccessRates,
    },
  });

  React.useEffect(() => {
    const subscription = form.watch((values) => {
      // Type assertion as watch might return incomplete data during initialization
      if (form.formState.isValid) {
         onFormChange(values as FormValues);
      } else {
        // Even if not fully valid, pass current values for real-time feedback if desired
        // This might require careful handling if partial data is problematic
        const currentValues = form.getValues();
        onFormChange(currentValues as FormValues);
      }
    });
    // Initial call with default values
    onFormChange(form.getValues() as FormValues);
    return () => subscription.unsubscribe();
  }, [form, onFormChange]);

  const { control } = form;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-lg z-20"
      style={{ height: BOTTOM_PANEL_HEIGHT }}
    >
      <ScrollArea className="h-full p-1">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(() => { /* Submission handled by watch? */ })} className="p-4 space-y-6">
            <Accordion type="multiple" className="w-full" defaultValue={['general', 'processors']}>
              <AccordionItem value="general">
                <AccordionTrigger className="text-lg font-semibold"><Settings2 className="mr-2" /> General Configuration</AccordionTrigger>
                <AccordionContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-4">
                  <FormField
                    control={control}
                    name="totalPayments"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Total Payments</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="e.g., 10000" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} />
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
                        <FormLabel>TPS (Transactions Per Second): {field.value}</FormLabel>
                        <FormControl>
                           <Slider
                            defaultValue={[field.value]}
                            min={1} max={5000} step={1}
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
                        <FormLabel>Amount</FormLabel>
                        <FormControl>
                           <Input type="number" placeholder="e.g., 100" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />
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
                    render={({ field }) => (
                      <FormItem className="col-span-full">
                        <FormLabel>Payment Methods</FormLabel>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
                                          return checked
                                            ? singleMethodField.onChange([...(singleMethodField.value ?? []), method])
                                            : singleMethodField.onChange(
                                                (singleMethodField.value ?? []).filter(
                                                  (value) => value !== method
                                                )
                                              )
                                        }}
                                      />
                                    </FormControl>
                                    <FormLabel className="font-normal">
                                      {method}
                                    </FormLabel>
                                  </FormItem>
                                )
                              }}
                            />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="processors">
                <AccordionTrigger className="text-lg font-semibold"><VenetianMaskIcon className="mr-2" /> Processor Configuration</AccordionTrigger>
                <AccordionContent className="pt-4">
                  <Card>
                    <CardHeader><CardTitle>Processor ↔ Payment Method Matrix</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {PROCESSORS.map(proc => (
                          <div key={proc.id} className="border p-3 rounded-md">
                            <h4 className="font-medium mb-2">{proc.name}</h4>
                            {PAYMENT_METHODS.map(method => (
                              <FormField
                                key={`${proc.id}-${method}`}
                                control={control}
                                name={`processorMatrix.${proc.id}.${method}`}
                                render={({ field }) => (
                                  <FormItem className="flex items-center justify-between py-1">
                                    <FormLabel className="font-normal">{method}</FormLabel>
                                    <FormControl>
                                      <Switch checked={field.value} onCheckedChange={field.onChange} />
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
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="routing">
                <AccordionTrigger className="text-lg font-semibold"><Zap className="mr-2" /> Routing & Simulation</AccordionTrigger>
                <AccordionContent className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                    <FormField
                      control={control}
                      name="routingRulesText"
                      render={({ field }) => (
                        <FormItem className="col-span-full">
                          <FormLabel>Routing Rules</FormLabel>
                          <FormControl>
                            <Textarea placeholder="e.g., IF PaymentMethod = Card AND Amount > 5000 THEN RouteTo Stripe" {...field} rows={3}/>
                          </FormControl>
                          <FormDescription>Define routing rules (simplified text format).</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  <div className="space-y-2">
                    <FormField control={control} name="smartRoutingEnabled" render={({ field }) => ( <FormItem className="flex items-center justify-between"><FormLabel>Enable Smart Routing (SR)</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem> )} />
                    <FormField control={control} name="eliminationRoutingEnabled" render={({ field }) => ( <FormItem className="flex items-center justify-between"><FormLabel>Enable Elimination Routing</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem> )} />
                    <FormField control={control} name="debitRoutingEnabled" render={({ field }) => ( <FormItem className="flex items-center justify-between"><FormLabel>Enable Debit Routing</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem> )} />
                  </div>
                  <div className="space-y-2">
                     <FormField control={control} name="simulateSaleEvent" render={({ field }) => ( <FormItem className="flex items-center justify-between"><FormLabel>Simulate Sale Event</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem> )} />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="sr-fluctuation">
                <AccordionTrigger className="text-lg font-semibold"><TrendingUp className="mr-2" /> SR Fluctuation & Incidents</AccordionTrigger>
                <AccordionContent className="pt-4 space-y-6">
                  <Card>
                    <CardHeader><CardTitle>SR Fluctuation Sliders</CardTitle><CardDescription>Simulate SR increase/decrease per processor.</CardDescription></CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                      {PROCESSORS.map(proc => (
                        <FormField
                          key={proc.id}
                          control={control}
                          name={`srFluctuation.${proc.id}`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{proc.name} SR Fluctuation: {field.value}%</FormLabel>
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
                    <CardHeader><CardTitle>Processor Incidents/Downtime</CardTitle><CardDescription>Trigger temporary outages.</CardDescription></CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                      {PROCESSORS.map(proc => (
                        <FormField
                          key={proc.id}
                          control={control}
                          name={`processorIncidents.${proc.id}`}
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between">
                              <FormLabel>{proc.name} Incident</FormLabel>
                              <FormControl>
                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      ))}
                    </CardContent>
                  </Card>
                </AccordionContent>
              </AccordionItem>

               <AccordionItem value="metrics-for-ai">
                <AccordionTrigger className="text-lg font-semibold"><Bot className="mr-2" /> Metrics for AI Input</AccordionTrigger>
                <AccordionContent className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                  <FormField
                    control={control}
                    name="overallSuccessRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Overall Success Rate (%): {field.value}</FormLabel>
                        <FormControl>
                           <Slider
                            defaultValue={[field.value]}
                            min={0} max={100} step={0.1}
                            onValueChange={(value) => field.onChange(value[0])}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="col-span-full space-y-4">
                    <Label className="text-base font-medium">Processor-wise SuccessRates (for AI)</Label>
                    {PROCESSORS.map(proc => (
                      <div key={proc.id} className="grid grid-cols-3 gap-2 items-center border p-2 rounded-md">
                        <Label className="col-span-3 sm:col-span-1">{proc.name}</Label>
                        <FormField
                          control={control}
                          name={`processorWiseSuccessRates.${proc.id}.sr`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">SR (%)</FormLabel>
                              <Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="h-8"/>
                            </FormItem>
                          )}
                        />
                         <FormField
                          control={control}
                          name={`processorWiseSuccessRates.${proc.id}.volumeShare`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Volume (%)</FormLabel>
                              <Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="h-8"/>
                            </FormItem>
                          )}
                        />
                         {/* Failure rate can be derived (100 - SR) or also made an input if needed */}
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* <Button type="submit" className="w-full">Apply Changes</Button> */}
            {/* Submit button might not be needed if changes are applied on watch */}
          </form>
        </Form>
      </ScrollArea>
    </div>
  );
}

    