
import type { PaymentMethod } from './constants';

export interface ProcessorPaymentMethodMatrix {
  [processorId: string]: {
    [method in PaymentMethod]?: boolean;
  };
}

// SRFluctuation is removed

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
  // srFluctuation: SRFluctuation; // Removed
  processorIncidents: ProcessorIncidentStatus;
  overallSuccessRate: number;
  processorWiseSuccessRates: Record<string, { sr: number; volumeShare: number; failureRate: number }>; // sr is now the input base SR
}

export interface ProcessorSuccessRate {
  processor: string;
  sr: number; // In StatsView, this will reflect the input SR from sliders
  failureRate: number; // Derived from input SR
  volumeShare: number; // Observed from simulation
}

// Types for Time Series Charts
export interface TimeSeriesDataPoint {
  time: number; // Represents the simulation step or a timestamp
  [processorId: string]: number | string; // Metric value for each processor (can be number or string like 'time')
}

export type ProcessorMetricsHistory = TimeSeriesDataPoint[];
