
import type { PaymentMethod } from './constants';

export interface ProcessorPaymentMethodMatrix {
  [processorId: string]: {
    [method in PaymentMethod]?: boolean;
  };
}

export interface ProcessorIncidentStatus {
  [processorId: string]: number | null; // Timestamp of when incident ends, or null if no incident
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
  processorIncidents: ProcessorIncidentStatus;
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
