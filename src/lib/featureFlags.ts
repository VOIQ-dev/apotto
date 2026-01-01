export const isStripeEnabled = () =>
  (process.env.ENABLE_STRIPE || "").toLowerCase() === "true";

export const isSesEnabled = () =>
  (process.env.ENABLE_SES || "").toLowerCase() === "true";
