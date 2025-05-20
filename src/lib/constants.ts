
export const PAYMENT_METHODS = ["Card", "UPI", "Wallet"] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "SGD"] as const;
export type Currency = typeof CURRENCIES[number];

export const PROCESSORS = [
  { id: "stripe", name: "Stripe" },
  { id: "adyen", name: "Adyen" },
  { id: "paypal", name: "Paypal" },
  { id: "worldpay", name: "Worldpay" },
  { id: "checkoutcom", name: "Checkout" },
] as const;
export type Processor = typeof PROCESSORS[number];

export const DEFAULT_PROCESSOR_AVAILABILITY: Record<string, Partial<Record<PaymentMethod, boolean>>> = {
  stripe: { Card: true, Wallet: true },
  adyen: { Card: true, Wallet: true },
  paypal: { Card: true, Wallet: true, UPI: true },
  worldpay: { Card: true },
  checkoutcom: { Card: true, UPI: true, Wallet: true },
};

// Define IDs for rule/strategy nodes
export const RULE_STRATEGY_NODES = {
  CUSTOM_RULE_APPLIED: "rule_custom_rule_applied",
  SMART_ROUTING: "strategy_smart_routing", // Kept for potential future re-introduction
  ELIMINATION_APPLIED: "strategy_elimination_applied", 
  STANDARD_ROUTING: "strategy_standard_routing",
  NO_ROUTE_FOUND: "strategy_no_route_found",
} as const;
