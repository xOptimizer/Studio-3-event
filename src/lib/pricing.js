export const SALES_TAX_RATE = 0.0825;
export const SERVICE_FEE_RATE = 0;

export function calculateTieredTicketSubtotal(input) {
  const {
    soldCount,
    quantity,
    earlyBirdLimit,
    earlyBirdPriceCents,
    regularPriceCents,
  } = input;

  const earlyBirdRemaining = Math.max(0, earlyBirdLimit - soldCount);
  const earlyBirdQty = Math.min(quantity, earlyBirdRemaining);
  const regularQty = quantity - earlyBirdQty;
  const ticketSubtotalCents =
    earlyBirdQty * earlyBirdPriceCents + regularQty * regularPriceCents;

  return {
    quantity,
    soldCount,
    earlyBirdLimit,
    earlyBirdRemaining,
    earlyBirdQty,
    regularQty,
    earlyBirdPriceCents,
    regularPriceCents,
    ticketSubtotalCents,
    currentTier: soldCount >= earlyBirdLimit ? 'regular' : 'early_bird',
  };
}

export function calculateOrderPricingFromSubtotal(ticketSubtotalCents, quantity) {
  const serviceFeeCents = Math.round(ticketSubtotalCents * SERVICE_FEE_RATE);
  const salesTaxCents = Math.round(ticketSubtotalCents * SALES_TAX_RATE);
  const totalCents = ticketSubtotalCents + serviceFeeCents + salesTaxCents;

  return {
    quantity,
    ticketSubtotalCents,
    serviceFeeCents,
    salesTaxCents,
    totalCents,
    rates: {
      salesTax: SALES_TAX_RATE,
      serviceFee: SERVICE_FEE_RATE,
    },
  };
}

export function calculateTieredOrderPricing(input) {
  const tier = calculateTieredTicketSubtotal(input);
  const fees = calculateOrderPricingFromSubtotal(tier.ticketSubtotalCents, tier.quantity);

  return {
    ...tier,
    ...fees,
  };
}

/** @deprecated Use calculateTieredOrderPricing for checkout */
export function calculateOrderPricing(priceCents, quantity) {
  return calculateOrderPricingFromSubtotal(priceCents * quantity, quantity);
}

export function getEventPricingTiers(event) {
  return {
    earlyBirdPriceCents: event.priceCents,
    regularPriceCents: event.regularPriceCents,
    earlyBirdLimit: event.earlyBirdLimit,
  };
}
