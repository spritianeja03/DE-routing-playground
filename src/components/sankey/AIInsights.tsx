"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Wand2, AlertOctagon, Lightbulb } from 'lucide-react';
import { suggestOptimizedRoutingRules, SuggestOptimizedRoutingRulesInput, SuggestOptimizedRoutingRulesOutput } from '@/ai/flows/suggest-optimized-routing-rules';
import { analyzeTransactionAnomalies, AnalyzeTransactionAnomaliesInput, AnalyzeTransactionAnomaliesOutput } from '@/ai/flows/analyze-transaction-anomalies';
import type { FormValues } from '@/components/BottomControlsPanel';
import type { AISankeyInputData } from '@/lib/types';
import { ScrollArea } from '../ui/scroll-area';
import { useToast } from '@/hooks/use-toast';

interface AIInsightsProps {
  currentControls: FormValues | null;
}

export function AIInsights({ currentControls }: AIInsightsProps) {
  const [isLoadingOptimizations, setIsLoadingOptimizations] = useState(false);
  const [isLoadingAnomalies, setIsLoadingAnomalies] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState<SuggestOptimizedRoutingRulesOutput | null>(null);
  const [anomalyResult, setAnomalyResult] = useState<AnalyzeTransactionAnomaliesOutput | null>(null);
  const { toast } = useToast();

  const constructAISankeyInputData = (): string => {
    if (!currentControls) return "{}";
    const { routingRulesText, overallSuccessRate, processorWiseSuccessRates, ...parameters } = currentControls;
    const aiSankeyInput: AISankeyInputData = {
      parameters: {
        ...parameters,
        routingRules: routingRulesText, // Map routingRulesText to routingRules for AI
      },
      currentMetrics: {
        overallSuccessRate,
        processorWiseSuccessRates,
      }
    };
    return JSON.stringify(aiSankeyInput);
  };

  const handleSuggestOptimizations = async () => {
    if (!currentControls) {
      toast({ title: "Error", description: "Control data not available.", variant: "destructive" });
      return;
    }
    setIsLoadingOptimizations(true);
    setOptimizationResult(null);
    try {
      const sankeyDiagramData = constructAISankeyInputData();
      const input: SuggestOptimizedRoutingRulesInput = {
        sankeyDiagramData,
        currentRoutingRules: currentControls.routingRulesText,
        overallSuccessRate: currentControls.overallSuccessRate,
        processorWiseSuccessRates: JSON.stringify(currentControls.processorWiseSuccessRates),
      };
      const result = await suggestOptimizedRoutingRules(input);
      setOptimizationResult(result);
    } catch (error) {
      console.error("Error fetching optimizations:", error);
      toast({ title: "AI Error", description: "Failed to get optimization suggestions.", variant: "destructive" });
    } finally {
      setIsLoadingOptimizations(false);
    }
  };

  const handleAnalyzeAnomalies = async () => {
    if (!currentControls) {
      toast({ title: "Error", description: "Control data not available.", variant: "destructive" });
      return;
    }
    setIsLoadingAnomalies(true);
    setAnomalyResult(null);
    try {
      const sankeyDiagramData = constructAISankeyInputData();
      const input: AnalyzeTransactionAnomaliesInput = {
        sankeyDiagramData,
        totalPayments: currentControls.totalPayments,
        tps: currentControls.tps,
        paymentMethods: currentControls.selectedPaymentMethods,
        amount: currentControls.amount,
        currency: currentControls.currency,
        smartRoutingEnabled: currentControls.smartRoutingEnabled,
        eliminationRoutingEnabled: currentControls.eliminationRoutingEnabled,
        debitRoutingEnabled: currentControls.debitRoutingEnabled,
        overallSuccessRate: currentControls.overallSuccessRate,
        processorWiseSuccessRates: Object.entries(currentControls.processorWiseSuccessRates).reduce((acc, [key, value]) => {
          acc[key] = value.sr; // The AI flow expects Record<string, number> for processorWiseSuccessRates
          return acc;
        }, {} as Record<string, number>),
      };
      const result = await analyzeTransactionAnomalies(input);
      setAnomalyResult(result);
    } catch (error) {
      console.error("Error fetching anomalies:", error);
      toast({ title: "AI Error", description: "Failed to analyze anomalies.", variant: "destructive" });
    } finally {
      setIsLoadingAnomalies(false);
    }
  };

  return (
    <Card className="mt-6 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center"><Wand2 className="mr-2 h-6 w-6 text-primary" /> AI-Powered Insights</CardTitle>
        <CardDescription>Get suggestions and identify anomalies based on current settings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Dialog>
          <DialogTrigger asChild>
            <Button onClick={handleSuggestOptimizations} disabled={isLoadingOptimizations || !currentControls} className="w-full">
              {isLoadingOptimizations ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lightbulb className="mr-2 h-4 w-4" />}
              Suggest Optimized Routing Rules
            </Button>
          </DialogTrigger>
          {optimizationResult && (
            <DialogContent className="sm:max-w-2xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>Optimized Routing Suggestions</DialogTitle>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh] p-1">
                <div className="space-y-4 p-4 rounded-md bg-muted/50">
                  <h4 className="font-semibold">Suggested Rules:</h4>
                  <pre className="text-xs bg-background p-2 rounded whitespace-pre-wrap break-all">
                    {JSON.stringify(JSON.parse(optimizationResult.suggestedRoutingRules), null, 2)}
                  </pre>
                  <h4 className="font-semibold">Reasoning:</h4>
                  <p className="text-sm">{optimizationResult.reasoning}</p>
                  <p className="text-sm"><strong>Expected SR Improvement:</strong> {optimizationResult.expectedSuccessRateImprovement.toFixed(2)}%</p>
                  <p className="text-sm"><strong>Expected Cost Reduction:</strong> {optimizationResult.expectedCostReduction.toFixed(2)}%</p>
                </div>
              </ScrollArea>
               <DialogFooter>
                <Button variant="outline" onClick={() => setOptimizationResult(null)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          )}
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <Button onClick={handleAnalyzeAnomalies} disabled={isLoadingAnomalies || !currentControls} className="w-full">
              {isLoadingAnomalies ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertOctagon className="mr-2 h-4 w-4" />}
              Analyze Transaction Anomalies
            </Button>
          </DialogTrigger>
          {anomalyResult && (
            <DialogContent className="sm:max-w-2xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>Transaction Anomaly Analysis</DialogTitle>
              </DialogHeader>
               <ScrollArea className="max-h-[60vh] p-1">
                <div className="space-y-4 p-4 rounded-md bg-muted/50">
                  <h4 className="font-semibold">Identified Anomalies:</h4>
                  {anomalyResult.anomalies.length > 0 ? (
                    <ul className="list-disc list-inside text-sm">
                      {anomalyResult.anomalies.map((anomaly, index) => <li key={index}>{anomaly}</li>)}
                    </ul>
                  ) : <p className="text-sm">No anomalies identified.</p>}
                  
                  <h4 className="font-semibold">Suggestions:</h4>
                  {anomalyResult.suggestions.length > 0 ? (
                    <ul className="list-disc list-inside text-sm">
                      {anomalyResult.suggestions.map((suggestion, index) => <li key={index}>{suggestion}</li>)}
                    </ul>
                  ) : <p className="text-sm">No specific suggestions at this time.</p>}
                </div>
              </ScrollArea>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAnomalyResult(null)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          )}
        </Dialog>
      </CardContent>
    </Card>
  );
}
