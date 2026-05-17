# Always-On Grocery Delivery Plan

Use this document as the next implementation prompt. The goal is to implement the always-on grocery flow in one focused pass while keeping the existing classic order flow working.

## Goal

Add a new grocery-store side of the website where products are always visible and orderable as long as their product quantity/stock is greater than zero. Customers must select their community and then select an available delivery date for that community, this happens in the @odercomnfimation page before that a user can be at all category in home page.

Admins/business (this new addtion is all for isIndependent = false business) users must be able to keep creating the classic limited-time order forms, but also choose a new always-on grocery order form in `src/components/businesses/CreateOrderForBusiness.js`.

Admin reports equivalent to `src/components/admin/WeeklyOrderSummaryV3.js` and supplier ordering should work by delivery week/community, not by the week the order was created, for communities can have a few deliveris a week or none so we should be ablle to pick a delevry that of a week and a community and see all their orders.

## Important Existing Code

- Store product feed: `src/components/category-store/CategoryStore.js`
- Product card and stock controls: `src/components/category-store/ProductCard.js`
- Cart context: `src/contexts/CartContext.js`
- Delayed checkout: `src/components/delayedPayment/OrderConfirmationDelayed.js`
- Classic business order creation: `src/components/businesses/CreateOrderForBusiness.js` 
- Weekly admin summary: `src/components/admin/WeeklyOrderSummaryV3.js`
- Supplier ordering summary: `src/components/admin/WeeklyOrderFromSuppliersV1.js`
- Delivery/weighing APIs: `src/components/adminV5/deliveryWeighingV5/api.js` and possibly `apiV7.js`
- Communities list: `src/data/pickupSpots.js`
- Order timing helpers: `src/utils/orderUtils.js`
- Routes: `src/App.js`

## Data Model

### Always-On Grocery Order Documents

Continue using the existing `Orders` collection to minimize changes. Add a new order mode.

Example `Orders/{orderId}`:

```js
{
  orderMode: 'always_on_grocery',
  orderType: 'always_on_grocery',
  groceryStore: true,
  alwaysOn: true,
  businessEmail,
  businessId,
  businessName,
  businessKind,
  communityName,
  region,
  orderName,
  selectedProducts,
  pickupSpots,
  description,
  imageUrl,
  paymentMethod,
  paymentApps,
  payboxLink,
  phoneNumber,
  requestAddress,
  isFarmerOrder,
  areas,
  minimumOrderAmount,
  fulfillmentConfig: {
    type: 'community_delivery_schedule',
    allowCustomerDateSelection: true
  },
  Order_Time,
  createdAt
}
```

Keep classic order documents unchanged except for optionally adding:

```js
orderMode: 'classic'
```

Do not remove or rename existing fields like `orderType`, `endingTime`, `endingTimeByPickupSpot`, `schedule`, `shippingDateRange`, or `pickupSpots`.

### Delivery Schedules

Create a shared collection for community delivery rules:

`deliverySchedules/{communityName}`

Example:

```js
{
  communityName: 'ניצנים ה',
  active: true,
  weeklyDays: [1],
  defaultCutoff: {
    hoursBeforeDelivery: 10
  },
  horizonWeeks: 8,
  exceptions: {
    '2026-05-18': {
      enabled: true,
      cutoffAt: '2026-05-17T23:30:00',
      note: 'extended for late orders'
    },
    '2026-05-25': {
      enabled: false,
      reason: 'no delivery this week'
    },
    '2026-05-27': {
      enabled: true,
      cutoffAt: '2026-05-26T22:00:00',
      note: 'special Wednesday delivery'
    }
  },
  updatedAt
}
```

Rules:

- `weeklyDays` uses JavaScript day numbers: Sunday `0`, Monday `1`, Tuesday `2`, Wednesday `3`, Thursday `4`, Friday `5`, Saturday `6`.
- A weekly day repeats for every week within `horizonWeeks`.
- `exceptions[date].enabled = false` disables a specific date.
- `exceptions[date].enabled = true` adds or overrides a date.
- `exceptions[date].cutoffAt` can extend or shorten ordering for one specific community/date.
- This structure should make it easy to add more rule fields later.

## Helpers To Add

Add a new utility file, for example:

`src/utils/deliveryScheduleUtils.js`

Functions:

```js
export function getWeekKey(date) {}
export function parseDateSafe(value) {}
export function generateAvailableDeliveryDates(scheduleDoc, options = {}) {}
export function getEffectiveCutoffAt(deliveryDate, scheduleDoc) {}
export function isDeliveryDateOrderable(deliveryDate, scheduleDoc, now = new Date()) {}
export function getOrderDeliveryDate(orderData) {}
export function getOrderDeliveryWeekKey(orderData) {}
```

`getOrderDeliveryDate(orderData)` must prefer:

1. `orderData.fulfillment?.deliveryDate`
2. `orderData.deliveryDate`
3. fallback to `orderData.createdAt` for old orders

This preserves old data.

## Business Order Creation

Update `src/components/businesses/CreateOrderForBusiness.js`.

Add a top-level choice:

- Classic limited order
- Always-on grocery store (only for IsIndependent == false business)

Implementation detail:

- Keep the existing form as the classic path.
- For always-on grocery, reuse as many existing fields as possible: name, description, image, selected products, pickup spots, payment method, delivery/address flags.
- Hide or skip classic-only fields: one-time ending time, recurring schedule, shipping date range.
- Save the new `Orders` document with `orderMode: 'always_on_grocery'`, `orderType: 'always_on_grocery'`, `alwaysOn: true`, `groceryStore: true`, and `fulfillmentConfig`.
- Classic path should still save the existing shape and include `orderMode: 'classic'`.

Validation:

- Always-on grocery requires at least one pickup spot.
- Always-on grocery does not require `shippingDateStart`, `shippingDateEnd`, `endingTimeByPickupSpot`, or recurring schedule.
- Classic validation must behave like it does today.

## Store Product Feed

Update `src/components/category-store/CategoryStore.js`.

Current behavior loads active `Orders` only when one-time/recurring timing is active. Add support:

- If `orderData.orderMode === 'always_on_grocery'` or `orderData.alwaysOn === true` or `orderData.groceryStore === true`, treat the order as active.
- Keep product visibility controlled by `productData.stockAmount > 0`.
- Keep community filtering: products only show for selected community if the always-on order includes that community in `pickupSpots`.
- For always-on products, do  show an order countdown. the count down is until the cutoff so calculate it correctly.

Do not break classic one-time/recurring orders.

## Checkout Delivery Date

Update `src/components/delayedPayment/OrderConfirmationDelayed.js`.

Add state:

```js
const [deliverySchedule, setDeliverySchedule] = useState(null);
const [availableDeliveryDates, setAvailableDeliveryDates] = useState([]);
const [selectedDeliveryDate, setSelectedDeliveryDate] = useState('');
const [deliveryDateError, setDeliveryDateError] = useState('');
```

When `selectedPickupSpot` changes:

- Load `deliverySchedules/{selectedPickupSpot}`.
- Generate available dates.
- If no schedule exists, show a clear admin/config message and prevent checkout for always-on grocery items.

UI:

- Add a delivery date selector near pickup/delivery details.
- Only show dates that are available and not past cutoff.
- default to first next available date.
- Hebrew labels are fine, but keep the stored value as `yyyy-MM-dd`.
- make sure it an easy to pick date ui. the user will be able to click the correct date.


Validation:

- If cart contains an always-on grocery item/order, require `selectedDeliveryDate`.
- For classic orders, avoid requiring it unless needed.

When saving `customerOrdersDelayed`, add:

```js
fulfillment: {
  community: selectedPickupSpot,
  deliveryDate: selectedDeliveryDate,
  deliveryWeekKey: getWeekKey(selectedDeliveryDate),
  scheduleSource: 'deliverySchedules',
  selectedAt: new Date().toISOString()
},
deliveryDate: selectedDeliveryDate,
deliveryWeekKey: getWeekKey(selectedDeliveryDate),
community: selectedPickupSpot
```

Also consider adding `deliveryDate` and `deliveryWeekKey` into each `orderBreakdown[orderId]` for easier debugging, but the top-level fields are the important part.

## Admin Delivery Schedule Page

Add a new admin component:

`src/components/admin/DeliveryScheduleAdmin.js`

Route in `src/App.js`:

```jsx
<Route path="/admin/delivery-schedules" element={<DeliveryScheduleAdmin />} />
```

Features for first version:

- Choose community from `pickupSpots`.
- Set active/inactive.
- Select default weekly delivery days.
- Set default cutoff hours before delivery.
- Set horizon weeks.
- Add/edit/remove date exceptions:
  - date
  - enabled yes/no
  - optional cutoff datetime
  - note/reason
- Save to `deliverySchedules/{communityName}`.

Keep this simple. It can be a plain form/table.

## Weekly Summary Equivalent

Update `src/components/admin/WeeklyOrderSummaryV3.js` or create a new equivalent page such as:

add a new page dont update V3.

`src/components/admin/WeeklyDeliveryOrderSummary.js`

Preferred low-risk path:

- Extract shared summary logic into `src/utils/adminOrderSummaryUtils.js`.
- Reuse it in `WeeklyOrderSummaryV3.js` and `WeeklyOrderFromSuppliersV1.js`.

The key behavior change:

Today filtering uses `createdAt`. New filtering should use delivery date:

```js
const deliveryDate = getOrderDeliveryDate(orderData);
if (deliveryDate < startDate || deliveryDate > endDate) return;
```

Fallback to `createdAt` is required for old orders.

The page should still:

- Filter by week/date range.
- Filter by communities.
- Group customer orders by community.
- Build `businessSummary` from `orderBreakdown`.
- Support copy supplier order text.
- Support custom copy modal and cost calculator if using `WeeklyOrderSummaryV3.js`.

Display additions:

- Show selected delivery date on each customer order.
- Show whether an order is fallback/legacy if no delivery date exists.
- Date range label should say delivery range/week rather than order creation range/week.

## Supplier Ordering

Update `src/components/admin/WeeklyOrderFromSuppliersV1.js`.

Use the same delivery-date filtering logic as the weekly summary:

- selected week/date range means delivery week/date range
- community filter uses `customerDetails.pickupSpot` or top-level `community`
- supplier totals remain based on `orderBreakdown`

This makes supplier ordering answer:

“What do I need to order from suppliers for deliveries in this week/community?”

Not:

“What did customers create this week?”

## Delivery/Weighing Admin

Update delayed-order fetching in:

- `src/components/adminV5/deliveryWeighingV5/api.js`
- `src/components/adminV5/deliveryWeighingV5/apiV7.js` if V7 uses it

Where currently filtering uses `createdAt`, switch to `getOrderDeliveryDate(order)` with fallback.

This makes weighing/packing align with delivery date.

## Backward Compatibility

Do not delete support for:

- classic one-time orders
- recurring orders
- old `Ending_Time`
- old `endingTime`
- `endingTimeByPickupSpot`
- old customer orders without `deliveryDate`
- existing `customerOrders`
- existing `customerOrdersDelayed`

All new filtering must fallback to `createdAt` when `deliveryDate` is missing.

## Suggested Implementation Order

1. Add `src/utils/deliveryScheduleUtils.js`.
2. Add `src/components/admin/DeliveryScheduleAdmin.js` and route.
3. Update `CreateOrderForBusiness.js` to support `classic` vs `always_on_grocery`.
4. Update `CategoryStore.js` to treat always-on grocery orders as active.
5. Update `OrderConfirmationDelayed.js` to load schedules, require/select delivery date for grocery items, and save fulfillment fields.
6. Update `WeeklyOrderSummaryV3.js` and `WeeklyOrderFromSuppliersV1.js` to filter by delivery date.
7. Update delivery/weighing API filters.
8. Run lint/build if available.

## Testing Checklist

- Classic one-time order still appears/disappears by ending time.
- Classic recurring order still appears by schedule.
- Always-on grocery order appears even with no ending time.
- Always-on grocery product disappears when `stockAmount <= 0`.
- Community selector still filters products.
- Checkout blocks always-on grocery cart when no delivery date is selected.
- Checkout saves `fulfillment.deliveryDate`, `deliveryDate`, and `deliveryWeekKey`.
- Admin delivery schedule can disable one week, add two deliveries in a week, and extend cutoff for one date.
- Weekly summary shows orders by delivery week.
- Supplier order summary uses delivery week.
- Old orders without delivery date still appear using `createdAt` fallback.

## Notes

Keep the first implementation plain and conservative. The schema is intentionally nested so future rules can be added later, such as per-community capacity, delivery time windows, holiday rules, route assignment, or volunteer/packing cutoff rules.
