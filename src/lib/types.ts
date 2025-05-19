
import type { PaymentMethod } from './constants';
import { z } from 'zod';

export interface ProcessorPaymentMethodMatrix {
  [processorId: string]: {
    [method in PaymentMethod]?: boolean;
  };
}

export interface ProcessorIncidentStatus {
  [processorId:string]: number | null; // Timestamp of when incident ends, or null if no incident
}

export type ConditionField = 'paymentMethod'; // Initially just payment method
export type ConditionOperator = 'EQUALS'; // Initially just equals

export interface Condition {
  field: ConditionField;
  operator: ConditionOperator;
  value: PaymentMethod; // Initially tied to PaymentMethod
}

export interface StructuredRule {
  id: string; // e.g., 'rule1'
  condition: Condition;
  action: {
    type: 'ROUTE_TO_PROCESSOR';
    processorId: string;
  };
}

export interface ControlsState {
  totalPayments: number;
  tps: number;
  selectedPaymentMethods: PaymentMethod[];
  processorMatrix: ProcessorPaymentMethodMatrix;
  structuredRule: StructuredRule | null;
  // processorIncidents: ProcessorIncidentStatus; // This is handled in FormValues directly
  overallSuccessRate: number; // This is the LATEST overall SR
  processorWiseSuccessRates: Record<string, { sr: number; volumeShare: number; failureRate: number }>; // sr is the input base SR
}

export interface ProcessorSuccessRate {
  processor: string;
  sr: number; // In StatsView table, this will be OBSERVED SR
  failureRate: number; // Derived from OBSERVED SR
  volumeShare: number; // Observed from simulation
}

// Types for Time Series Charts (Per Processor)
export interface TimeSeriesDataPoint {
  time: number; // Represents the simulation step or a timestamp
  [processorId: string]: number | string; // Metric value for each processor (can be number or string like 'time')
}
export type ProcessorMetricsHistory = TimeSeriesDataPoint[];


// Types for Time Series Chart (Overall Success Rate)
export interface OverallSRHistoryDataPoint {
  time: number;
  overallSR: number;
}
export type OverallSRHistory = OverallSRHistoryDataPoint[];

// Zod Schemas for AI Simulation Summary Flow
export const AISummaryProcessorMetricSchema = z.object({
  name: z.string().describe('Name of the payment processor.'),
  volume: z.number().describe('Total transactions routed to this processor.'),
  observedSr: z.number().describe('Observed success rate for this processor during the simulation (%).'),
  baseSr: z.number().describe('Configured base success rate for this processor before incidents (%).'),
});
export type AISummaryProcessorMetric = z.infer<typeof AISummaryProcessorMetricSchema>;

export const AISummaryIncidentSchema = z.object({
  processorName: z.string().describe('Name of the processor.'),
  isActive: z.boolean().describe('Whether an incident was considered active for this processor at the time of summary.'),
});
export type AISummaryIncident = z.infer<typeof AISummaryIncidentSchema>;

export const SummarizeSimulationInputSchema = z.object({
  totalPaymentsProcessed: z.number().describe('Total number of payments processed in the simulation.'),
  targetTotalPayments: z.number().describe('The target total number of payments for the simulation.'),
  overallSuccessRate: z.number().describe('The final overall success rate of the simulation (%).'),
  totalSuccessful: z.number().describe('Total number of successful transactions.'),
  totalFailed: z.number().describe('Total number of failed transactions.'),
  effectiveTps: z.number().describe('The effective transactions per second during the simulation.'),
  processorMetrics: z.array(AISummaryProcessorMetricSchema).describe('Metrics for each payment processor.'),
  incidents: z.array(AISummaryIncidentSchema).describe('Information about any active incidents for processors.'),
  simulationDurationSteps: z.number().describe('Total number of time steps the simulation ran for.'),
});
export type AISummaryInput = z.infer<typeof SummarizeSimulationInputSchema>;

export const SummarizeSimulationOutputSchema = z.object({
  summaryText: z.string().describe('A concise, human-readable summary of the simulation run, highlighting key outcomes and notable events like incidents or significant performance of certain processors.'),
});
export type AISummaryOutput = z.infer<typeof SummarizeSimulationOutputSchema>;
