export type ProductType = 'service' | 'product' | 'free';
export type ProductStatus = 'active' | 'draft' | 'archived';

export interface TrackingPayload {
  type: 'pageview' | 'event';
  path?: string;
  referrer?: string;
  name?: string;
  category?: string;
  payload?: Record<string, unknown>;
}
