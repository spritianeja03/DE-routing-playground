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
  // These might be derived or manually set for AI input
  overallSuccessRate: number; 
  processorWiseSuccessRates: Record<string, { sr: number; volumeShare: number; failureRate: number }>;
}

// This is what we'll stringify and pass as sankeyDiagramData to AI flows
export interface AISankeyInputData {
  parameters: Omit<ControlsState, 'routingRulesText' | 'overallSuccessRate' | 'processorWiseSuccessRates'> & {
    routingRules: string; // Keep routingRulesText as routingRules for AI
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
