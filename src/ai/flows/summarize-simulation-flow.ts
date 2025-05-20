
'use server';
/**
 * @fileOverview A Genkit flow to summarize simulation performance.
 *
 * - summarizeSimulation - A function that generates a natural language summary of a simulation run.
 */

import {ai} from '@/ai/genkit';
import {
  SummarizeSimulationInputSchema,
  type AISummaryInput,
  SummarizeSimulationOutputSchema,
  type AISummaryOutput,
} from '@/lib/types';


export async function summarizeSimulation(input: AISummaryInput): Promise<AISummaryOutput> {
  return summarizeSimulationFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeSimulationPrompt',
  input: {schema: SummarizeSimulationInputSchema},
  output: {schema: SummarizeSimulationOutputSchema},
  prompt: `You are an intelligent assistant summarizing payment routing simulations.
Based on the following data, provide a concise (2-4 sentences) natural language overview of the simulation run.
Highlight the overall success rate, total payments processed against the target, and mention any processors that significantly stood out (either positively or negatively).
Also, briefly note if any incidents were active and on which processors.

Simulation Data:
- Target Payments: {{targetTotalPayments}}
- Processed Payments: {{totalPaymentsProcessed}}
- Overall Success Rate: {{overallSuccessRate}}%
- Total Successful: {{totalSuccessful}}
- Total Failed: {{totalFailed}}
- Effective TPS: {{effectiveTps}}
- Simulation Duration: {{simulationDurationSteps}} steps

Processor Performance:
{{#each processorMetrics}}
- {{name}}: Processed {{volume}} transactions with an observed SR of {{observedSr}}% (base SR was {{baseSr}}%).
{{/each}}

Active Incidents:
{{#if incidents.length}}
{{#each incidents}}
{{#if this.isActive}}
- Incident active for {{this.processorName}}.
{{/if}}
{{/each}}
{{else}}
- No incidents were active.
{{/if}}

Generate a summary.
`,
});

const summarizeSimulationFlow = ai.defineFlow(
  {
    name: 'summarizeSimulationFlow',
    inputSchema: SummarizeSimulationInputSchema,
    outputSchema: SummarizeSimulationOutputSchema,
  },
  async (input: AISummaryInput) => {
    try {
      const {output} = await prompt(input); // Corrected from summarizePrompt to prompt
      if (!output) {
        console.error('AI prompt returned no output for summarizeSimulationFlow.');
        throw new Error('AI failed to generate a summary (no output).');
      }
      return output;
    } catch (error) {
      console.error('Error calling AI model in summarizeSimulationFlow:', error);
      // Re-throw the error so it propagates to the client-side catch block
      // and Next.js knows the server action failed.
      throw new Error(`AI summary generation encountered an error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
);

