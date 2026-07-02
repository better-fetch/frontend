import "server-only";

import Stripe from "stripe";

let client: Stripe | null = null;

// Lazy: the production image is built without runtime secrets, and Next
// evaluates route modules during build-time page-data collection.
export function getStripe(): Stripe {
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
}
