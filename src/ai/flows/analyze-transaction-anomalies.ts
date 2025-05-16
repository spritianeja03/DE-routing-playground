// src/ai/flows/analyze-transaction-anomalies.ts
'use server';

/**
 * @fileOverview Analyzes the Sankey diagram data to identify transaction anomalies.
 *
 * - analyzeTransactionAnomalies - A function that analyzes transaction data and identifies anomalies.
 * - AnalyzeTransactionAnomaliesInput - The input type for the analyzeTransactionAnomalies function.
 * - AnalyzeTransactionAnomaliesOutput - The return type for the analyzeTransactionAnomalies function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnalyzeTransactionAnomaliesInputSchema = z.object({
  sankeyDiagramData: z
    .string()
    .describe('The data representing the Sankey diagram in JSON format.'),
  totalPayments: z.number().describe('The total number of payments processed.'),
  tps: z.number().describe('The transactions per second.'),
  paymentMethods: z.array(z.string()).describe('The payment methods used.'),
  amount: z.number().describe('The amount of the transaction.'),
  currency: z.string().describe('The currency of the transaction.'),
  smartRoutingEnabled: z.boolean().describe('Whether smart routing is enabled.'),
  eliminationRoutingEnabled: z
    .boolean()
    .describe('Whether elimination routing is enabled.'),
  debitRoutingEnabled: z.boolean().describe('Whether debit routing is enabled.'),
  overallSuccessRate: z.number().describe('The overall success rate of transactions.'),
  processorWiseSuccessRates: z
    .record(z.number())
    .describe('A record of processor-wise success rates.'),
});

export type AnalyzeTransactionAnomaliesInput = z.infer<typeof AnalyzeTransactionAnomaliesInputSchema>;

const AnalyzeTransactionAnomaliesOutputSchema = z.object({
  anomalies: z
    .array(z.string())
    .describe('A list of identified anomalies in the transaction flow.'),
  suggestions: z
    .array(z.string())
    .describe('Suggestions for optimizing transaction processing based on the analysis.'),
});

export type AnalyzeTransactionAnomaliesOutput = z.infer<typeof AnalyzeTransactionAnomaliesOutputSchema>;

export async function analyzeTransactionAnomalies(
  input: AnalyzeTransactionAnomaliesInput
): Promise<AnalyzeTransactionAnomaliesOutput> {
  return analyzeTransactionAnomaliesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzeTransactionAnomaliesPrompt',
  input: {schema: AnalyzeTransactionAnomaliesInputSchema},
  output: {schema: AnalyzeTransactionAnomaliesOutputSchema},
  prompt: `You are an expert in analyzing payment transaction data to identify anomalies and provide suggestions for optimization.

  Analyze the following transaction data from a Sankey diagram to identify any unusual patterns or anomalies. Provide specific, actionable suggestions to address the identified issues. Consider factors like success rates, payment method distribution, and routing rules.

  Sankey Diagram Data: {{{sankeyDiagramData}}}
  Total Payments: {{{totalPayments}}}
  TPS: {{{tps}}}
  Payment Methods: {{{paymentMethods}}}
  Amount: {{{amount}}}
  Currency: {{{currency}}}
  Smart Routing Enabled: {{{smartRoutingEnabled}}}
  Elimination Routing Enabled: {{{eliminationRoutingEnabled}}}
  Debit Routing Enabled: {{{debitRoutingEnabled}}}
  Overall Success Rate: {{{overallSuccessRate}}}
  Processor-wise Success Rates: {{{processorWiseSuccessRates}}}

  Based on this information, identify any anomalies and provide suggestions for improvement.
  `,
});

const analyzeTransactionAnomaliesFlow = ai.defineFlow(
  {
    name: 'analyzeTransactionAnomaliesFlow',
    inputSchema: AnalyzeTransactionAnomaliesInputSchema,
    outputSchema: AnalyzeTransactionAnomaliesOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
