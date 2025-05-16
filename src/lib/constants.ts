export const PAYMENT_METHODS = ["Card", "UPI", "Wallet", "Netbanking"] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "SGD"] as const;
export type Currency = typeof CURRENCIES[number];

export const PROCESSORS = [
  { id: "razorpay", name: "Razorpay" },
  { id: "stripe", name: "Stripe" },
  { id: "paypal", name: "PayPal" },
  { id: "payu", name: "PayU" },
] as const;
export type Processor = typeof PROCESSORS[number];

export const DEFAULT_PROCESSOR_AVAILABILITY: Record<string, Partial<Record<PaymentMethod, boolean>>> = {
  razorpay: { Card: true, UPI: true, Wallet: true, Netbanking: true },
  stripe: { Card: true, Wallet: true },
  paypal: { Card: true, Wallet: true },
  payu: { Card: true, UPI: true, Netbanking: true },
};
