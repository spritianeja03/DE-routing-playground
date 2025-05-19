
import type { PaymentMethod } from './constants';

export interface ProcessorPaymentMethodMatrix {
  [processorId: string]: {
    [method in PaymentMethod]?: boolean;
  };
}

export interface SRFluctuation {
  [processorId: string]: number; // Percentage 0-100
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
  structuredRule: StructuredRule | null; // Replaces routingRulesText
  smartRoutingEnabled: boolean;
  eliminationRoutingEnabled: boolean;
  debitRoutingEnabled: boolean;
  simulateSaleEvent: boolean;
  srFluctuation: SRFluctuation;
  processorIncidents: ProcessorIncidentStatus;
  overallSuccessRate: number;
  processorWiseSuccessRates: Record<string, { sr: number; volumeShare: number; failureRate: number }>;
}

export interface ProcessorSuccessRate {
  processor: string;
  sr: number;
  failureRate: number;
  volumeShare: number;
}

// Types for Time Series Charts
export interface TimeSeriesDataPoint {
  time: number; // Represents the simulation step or a timestamp
  [processorId: string]: number | string; // Metric value for each processor (can be number or string like 'time')
}

export type ProcessorMetricsHistory = TimeSeriesDataPoint[];
