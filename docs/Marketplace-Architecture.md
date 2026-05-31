# Community Marketplace Architecture

## Purpose

The community marketplace is a new module for local businesses. It is separate from the legacy independent-farmers flow and does not use `IndependentOrders`, `volunteers`, or `IndepentCustomerOrders`.

The first version supports:

- A public marketplace page that defaults to the user's own community and can browse other communities.
- Local business cards that link to the existing `/store/:businessId` store page.
- Highlighted weekly promotion order forms built only from approved products.
- Manual payment instructions only. Real payment capture is reserved for a later phase.
- A volunteer pickup placeholder on promotion forms. The full volunteer workflow is future work.

## Routes

| Route | Audience | Purpose |
| --- | --- | --- |
| `/community-marketplace` | Public | Marketplace landing page with business cards and weekly promotions. |
| `/community-marketplace/order/:promotionId` | Public | Manual-payment order form for one marketplace promotion. |
| `/marketplace/dashboard` | Business | Seller dashboard for store profile, promotions, and marketplace orders. |
| `/marketplace/store` | Business | Same seller dashboard focused on marketplace profile editing. |
| `/marketplace/promotions/new` | Business | Same seller dashboard focused on weekly promotion creation. |
| `/marketplace/products` | Local business | Marketplace product catalog (collection `marketplaceProducts`). |
| `/marketplace/products/new` | Local business | Add a marketplace product (pending admin approval). |
| `/marketplace/products/:productId/edit` | Local business | Edit a marketplace product. |
| `/marketplace/my-store` | Local business | Edit public store page (images, description, visibility). |
| `/community-marketplace/store/:businessId` | Public | Public בסטה page (what customers see from business cards). |
| `/store/:businessId` | Public | Legacy weekly business store (unchanged). |

## Collections

### `marketplaceStores/{businessId}`

Public marketplace card/profile for an existing business account.

```js
{
  businessId: string,
  businessName: string,
  businessKind: string,
  ownerEmail: string,
  title: string,
  shortDescription: string,
  coverImageUrl: string,
  tags: string[],
  homeCommunity: string,
  targetCommunities: string[],
  serviceRegions: string[],
  manualPaymentMethods: string[],
  visible: boolean,
  status: 'draft' | 'active' | 'paused',
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### `marketplacePromotions/{promotionId}`

Weekly highlighted manual-payment order form. Promotions reference approved `marketplaceProducts` documents.

```js
{
  businessId: string,
  businessName: string,
  title: string,
  description: string,
  productIds: string[],
  status: 'draft' | 'active' | 'paused' | 'closed',
  startsAt: Timestamp,
  endsAt: Timestamp,
  targetCommunities: string[],
  serviceRegions: string[],
  deliveryMode: 'pickup' | 'delivery' | 'both' | 'all_week',
  deliveryDate: string,
  availableWeekDays: number[],
  pickupInstructions: string,
  manualPaymentMethods: string[],
  allowVolunteerPickup: false,
  sortRank: number,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### `marketplaceOrders/{orderId}`

Customer submissions for a marketplace promotion.

```js
{
  promotionId: string,
  businessId: string,
  businessName: string,
  customerName: string,
  customerPhone: string,
  customerEmail: string,
  customerCommunity: string,
  customerNotes: string,
  selectedDeliveryOption: string,
  volunteerId: null,
  lines: [
    {
      productId: string,
      name: string,
      quantity: number,
      price: number,
      total: number
    }
  ],
  subtotal: number,
  paymentMethod: string,
  paymentStatus: 'manual_pending',
  fulfillmentStatus: 'new' | 'confirmed' | 'ready' | 'completed' | 'cancelled',
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### Future `marketplacePromotionVolunteers/{volunteerId}`

Reserved for a later volunteer pickup implementation. V1 only shows a disabled placeholder and reserves `volunteerId` on orders.

## Local business signup

New sellers register at `/local-business-register` (alias `/marketplace/register`). Auth profile documents are stored in Firestore collection `localbusiness` (not `businesses`). Role is `localBusiness`. Legacy weekly/independent business flows are unchanged.

### `marketplaceProducts/{productId}`

Separate catalog for שוק הבסטות sellers (`localbusiness`). Legacy weekly/independent sellers continue using `Products`.

```js
{
  businessId: string,
  ownerEmail: string,
  name: string,
  description: string,
  price: number,
  category: string,
  images: string[],
  options: string[],
  stockAmount: number,
  measurementType: 'unit' | 'kg',
  unitSize: number,
  verified: boolean,
  rejected: boolean,
  rejectionReason: string,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Frontend module: `src/components/marketplace/products/` and `src/services/marketplaceProductService.js`.

Storage path for images: `marketplace-products/{uid}/...` (see `docs/Marketplace-Storage-Rules.snippet.txt`).

## Product Approval

Marketplace promotion creation may only select products from `marketplaceProducts` that are approved:

- `verified === true` is approved.
- `verified === false` or `rejected === true` is not selectable.

The admin page at `/admin/products` has two tabs: **שוק הבסטות** (`marketplaceProducts`) and **מוצרים שבועיים / עצמאיים** (legacy `Products`).

## Backend Contract

The frontend service is shaped around these future Cloud Functions:

- `createMarketplaceStore`
- `updateMarketplaceStore`
- `createMarketplacePromotion`
- `updateMarketplacePromotion`
- `placeMarketplaceManualOrder`
- Future volunteer endpoints:
  - `createMarketplacePromotionVolunteer`
  - `updateMarketplacePromotionVolunteer`
  - `cancelMarketplacePromotionVolunteer`
- Future payment endpoints:
  - `createMarketplacePaymentIntent`
  - `markMarketplaceOrderPaid`

This frontend repo does not contain the functions source. The v1 scaffolding uses Firestore writes through `marketplaceService.js` so the UI can be tested, but production rules should move marketplace writes behind Cloud Functions before public launch.

### Function Payloads

`createMarketplaceStore` and `updateMarketplaceStore`:

```js
{
  businessId: string,
  storeData: Partial<marketplaceStoresDoc>
}
```

Backend checks:

- Caller is authenticated.
- Caller owns `businesses/{businessId}` or is admin.
- Only marketplace presentation fields can be changed.

`createMarketplacePromotion` and `updateMarketplacePromotion`:

```js
{
  businessId: string,
  promotionData: Partial<marketplacePromotionsDoc>
}
```

Backend checks:

- Caller owns `businesses/{businessId}` or is admin.
- Every `productId` belongs to `businessId`.
- Every selected product is approved according to `marketplaceProducts.verified` / `marketplaceProducts.rejected`.
- `allowVolunteerPickup` remains `false` until the volunteer phase is implemented.

`placeMarketplaceManualOrder`:

```js
{
  promotionId: string,
  customer: {
    name: string,
    phone: string,
    email?: string,
    community?: string,
    notes?: string
  },
  selectedDeliveryOption: string,
  paymentMethod: 'bit' | 'cash' | 'paybox' | 'bank_transfer' | 'other',
  lines: [
    {
      productId: string,
      quantity: number
    }
  ]
}
```

Backend checks:

- Promotion exists, is `active`, and is inside its start/end window.
- Product IDs belong to the promotion and are still approved.
- Prices are read from `marketplaceProducts` on the backend, not trusted from the client.
- Order is written with `paymentStatus: 'manual_pending'`.

Future `createMarketplacePaymentIntent`:

```js
{
  marketplaceOrderId: string,
  provider: string
}
```

This should only become active when real marketplace payment capture is introduced.

## Security Rules Intent

Deploy the rules in [Marketplace-Firestore-Rules.snippet.txt](Marketplace-Firestore-Rules.snippet.txt) into Firebase Console **before** the final `match /{document=**}` deny-all block. Without these rules, the app will show `permission-denied` when loading `/community-marketplace`.

- Public reads: visible/active marketplace stores and active promotions.
- Business owner reads: own stores, promotions, and marketplace orders.
- Business owner writes: through backend functions, not direct client writes in production.
- Customer order creation: through `placeMarketplaceManualOrder` in production.
- Volunteer rules: future work; do not block v1.
- Payments: reserved fields only in v1; no money capture.

## Statuses

Marketplace stores:

- `draft`: saved but not public.
- `active`: public when `visible === true`.
- `paused`: hidden temporarily.

Marketplace promotions:

- `draft`: saved by seller but not public.
- `active`: public when within date window.
- `paused`: hidden temporarily.
- `closed`: no longer accepting orders.

Marketplace orders:

- `manual_pending`: customer selected manual payment and the seller must reconcile outside the app.

