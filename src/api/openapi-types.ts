import type { components, paths, webhooks } from "../openapi/clink.openapi.js";

type JsonRequestBody<Operation> = Operation extends { requestBody?: infer RequestBody }
  ? NonNullable<RequestBody> extends { content: { "application/json": infer Body } }
    ? Body
    : never
  : never;

type JsonResponseBody<Operation> = Operation extends { responses: { 200: { content: infer Content } } }
  ? Content extends { "application/json": infer Body }
    ? Body
    : Content extends { "*/*": infer Body }
      ? Body
      : never
  : never;

type QueryParameters<Operation> = Operation extends { parameters: { query?: infer Query } } ? NonNullable<Query> : never;

export type ProductCreatePayload = JsonRequestBody<paths["/product"]["post"]>;
export type ProductCreateResponse = JsonResponseBody<paths["/product"]["post"]>;
export type ProductListQuery = QueryParameters<paths["/product"]["get"]>;
export type ProductListResponse = JsonResponseBody<paths["/product"]["get"]>;
export type ProductImageUploadResponse = components["schemas"]["ProductImageUploadResponse"];

export type PriceCreatePayload = JsonRequestBody<paths["/price"]["post"]>;
export type PriceCreateResponse = JsonResponseBody<paths["/price"]["post"]>;
export type PriceListQuery = QueryParameters<paths["/price"]["get"]>;
export type PriceListResponse = JsonResponseBody<paths["/price"]["get"]>;

export type CheckoutSessionCreatePayload = JsonRequestBody<paths["/checkout/session"]["post"]>;
export type CheckoutSessionCreateResponse = JsonResponseBody<paths["/checkout/session"]["post"]>;

export type SubscriptionCreatePayload = JsonRequestBody<paths["/subscription"]["post"]>;
export type SubscriptionCreateResponse = JsonResponseBody<paths["/subscription"]["post"]>;

export type RefundCreatePayload = JsonRequestBody<paths["/refund"]["post"]>;
export type RefundCreateResponse = JsonResponseBody<paths["/refund"]["post"]>;

export type OrderWebhookEvent = JsonRequestBody<webhooks["order"]["post"]>;
export type SessionWebhookEvent = JsonRequestBody<webhooks["session"]["post"]>;
export type RefundWebhookEvent = JsonRequestBody<webhooks["refund"]["post"]>;
export type SubscriptionWebhookEvent = JsonRequestBody<webhooks["subscription"]["post"]>;
export type InvoiceWebhookEvent = JsonRequestBody<webhooks["invoice"]["post"]>;
export type CustomerVerifyWebhookEvent = JsonRequestBody<webhooks["customer.verify"]["post"]>;
export type DisputeWebhookEvent = JsonRequestBody<webhooks["dispute"]["post"]>;
export type ChargeBackWebhook = components["schemas"]["ChargeBackWebhookVo"];

export type ClinkWebhookEvent =
  | OrderWebhookEvent
  | SessionWebhookEvent
  | RefundWebhookEvent
  | SubscriptionWebhookEvent
  | InvoiceWebhookEvent
  | CustomerVerifyWebhookEvent
  | DisputeWebhookEvent;

export type ClinkWebhookEventType = NonNullable<ClinkWebhookEvent["type"]>;
