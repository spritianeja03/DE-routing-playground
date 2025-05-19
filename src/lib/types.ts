
import type { PaymentMethod, Currency } from './constants';

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

export interface RoutingRule {
  id: string;
  condition: string; 
  action: string; 
}

export interface ControlsState {
  totalPayments: number;
  tps: number;
  selectedPaymentMethods: PaymentMethod[];
  processorMatrix: ProcessorPaymentMethodMatrix;
  routingRulesText: string; 
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
