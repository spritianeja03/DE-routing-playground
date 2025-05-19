
export const PAYMENT_METHODS = ["Card", "UPI", "Wallet"] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "SGD"] as const;
export type Currency = typeof CURRENCIES[number];

export const PROCESSORS = [
  { id: "stripe", name: "Stripe" },
  { id: "razorpay", name: "Razorpay" },
  { id: "cashfree", name: "Cashfree" },
  { id: "payu", name: "PayU" },
  { id: "fampay", name: "Fampay" },
] as const;
export type Processor = typeof PROCESSORS[number];

export const DEFAULT_PROCESSOR_AVAILABILITY: Record<string, Partial<Record<PaymentMethod, boolean>>> = {
  stripe: { Card: true, Wallet: true },
  razorpay: { Card: true, UPI: true, Wallet: true },
  cashfree: { Card: true, UPI: true, Wallet: true },
  payu: { Card: true, UPI: true },
  fampay: { UPI: true, Wallet: true },
};

// Define IDs for rule/strategy nodes in Sankey
export const RULE_STRATEGY_NODES = {
  CUSTOM_RULE_HIGH_VALUE_CARD: "rule_custom_high_value_card", // Will be deprecated by CUSTOM_RULE_APPLIED
  CUSTOM_RULE_APPLIED: "rule_custom_rule_applied",
  SMART_ROUTING: "strategy_smart_routing",
  ELIMINATION_APPLIED: "strategy_elimination_applied", // Used when elimination actively filters
  STANDARD_ROUTING: "strategy_standard_routing", // Default/fallback if no other strategy applies
  DEBIT_FIRST_ROUTING: "strategy_debit_first_routing", // If debit routing is a distinct step
  NO_ROUTE_FOUND: "strategy_no_route_found",
} as const;

