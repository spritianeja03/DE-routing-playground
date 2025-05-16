
import type { PaymentMethod, Currency, Processor } from './constants';

export interface ProcessorPaymentMethodMatrix {
  [processorId: string]: {
    [method in PaymentMethod]?: boolean;
  };
}

export interface SRFluctuation {
  [processorId: string]: number; // Percentage 0-100
}

export interface ProcessorIncidentStatus {
  [processorId: string]: boolean; // true if incident/downtime is active
}

export interface RoutingRule {
  id: string;
  condition: string; // Simplified: "PaymentMethod = Card AND Amount > 5000"
  action: string; // Simplified: "Route to Stripe"
}

export interface ControlsState {
  totalPayments: number;
  tps: number;
  selectedPaymentMethods: PaymentMethod[];
  amount: number;
  currency: Currency;
  processorMatrix: ProcessorPaymentMethodMatrix;
  routingRulesText: string; // Raw text for now
  smartRoutingEnabled: boolean;
  eliminationRoutingEnabled: boolean;
  debitRoutingEnabled: boolean;
  simulateSaleEvent: boolean;
  srFluctuation: SRFluctuation;
  processorIncidents: ProcessorIncidentStatus;
  overallSuccessRate: number; 
  processorWiseSuccessRates: Record<string, { sr: number; volumeShare: number; failureRate: number }>;
}

export interface AISankeyInputData {
  parameters: Omit<ControlsState, 'routingRulesText' | 'overallSuccessRate' | 'processorWiseSuccessRates'> & {
    routingRules: string; 
  };
  currentMetrics: {
    overallSuccessRate: number;
    processorWiseSuccessRates: Record<string, { sr: number; volumeShare: number; failureRate: number }>;
  };
}

export interface ProcessorSuccessRate {
  processor: string;
  sr: number;
  failureRate: number;
  volumeShare: number;
}

// Types for Sankey Diagram Data
export interface SankeyNode {
  id: string;
  name: string;
  type: 'source' | 'paymentMethod' | 'ruleStrategy' | 'processor' | 'status' | 'sink';
}

export interface SankeyLink {
  source: string; // Node ID
  target: string; // Node ID
  value: number;
  label?: string;
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

// Represents the state of a single transaction as it's being processed by the simulation
export interface TransactionProcessingState {
  id: string;
  method: PaymentMethod;
  amount: number; // Assuming amount is part of currentControls, not per-transaction for this simulation
  currency: Currency; // Same as amount
  appliedRuleStrategyNodeId: string | null; // ID of the rule/strategy node
  selectedProcessorId: string | null; // ID of the processor node
  isSuccess: boolean | null;
}
