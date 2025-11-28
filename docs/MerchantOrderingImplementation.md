# Task: Enable Merchant Ordering from Independent Farmers

## Context: Existing System

### Existing Features

- **Merchant Support**: User documents have an `isMerchant` boolean flag
- **Merchant Pricing**: Products have both `price` (regular) and `merchantPrice` fields already implemented in the product schema
- **Independent Farmers**: All independent farmers support merchant ordering (businesses collection has flag indicating this)
- **Pickup Spot System**: Regular consumers select from specific community pickup spots
- **Place-to-Region Mapping**: File `src/utils/communityToRegion.js` exists with comprehensive mapping of Israeli cities to regions (1878 lines) - we will create a NEW file instead of using this one
- **Order Creation**: Farmers use `CreateIndependentOrderForm.js` to configure orders with pickup spots and minimum amounts, including `merchantMinOrderTotal`
- **Cart System**: Global cart context at `src/contexts/CartContext.js` handles items from multiple orders
- **Checkout Flow**: `OrderConfirmation.js` handles customer details, pickup spot selection, and payment
- **Order Detail Page**: `IndependentOrderForm.js` displays order details and allows adding items to cart

## Objective

Enable merchants to order from independent farmers using a region-based delivery system instead of community pickup spots. Merchants should see merchant prices, select delivery regions, and provide specific addresses that are validated against farmer-selected service regions.

## Requirements

### Step 1: Examine Existing Code

Before implementing, review these files to understand patterns:
1. `src/components/independent/IndependentOrderForm.js` - Order detail page pattern (this will be the template for the merchant version)
2. `src/components/IndependentFarmers.js` - How farmers are listed and how detail navigation works
3. `src/components/OrderConfirmation.js` - Current checkout flow (we will create a merchant copy)
4. `src/components/independent/CreateIndependentOrderForm.js` - Current farmer configuration options
5. `src/utils/communityToRegion.js` - Available regions and city mappings (we will create a NEW simplified file)

### Step 2: Create Regions Mapping File

**New File:** `src/utils/israelRegions.js`

**Purpose:** Create a NEW simplified mapping file (do not use communityToRegion.js)

**Structure:**
```javascript
// Map of Israeli regions
export const regions = [
  'צפון',
  'מרכז', 
  'דרום',
  'ירושלים',
  'השפלה',
  'יהודה ושומרון'
];

// Map cities to their regions
export const cityToRegion = {
  'תל אביב': 'מרכז',
  'ירושלים': 'ירושלים',
  'חיפה': 'צפון',
  // ... extract from communityToRegion.js and simplify
};

// Helper function to get region by city
export const getRegionByCity = (city) => {
  return cityToRegion[city] || null;
};

// Helper function to get all cities in a region
export const getCitiesByRegion = (region) => {
  return Object.keys(cityToRegion).filter(city => cityToRegion[city] === region);
};
```

**Implementation:**
- Extract unique regions from existing `communityToRegion.js`
- Create simplified city-to-region mapping
- Export helper functions for lookups

### Step 3: Data Model Changes

**IndependentOrders Collection Enhancement:**
- Add field: `serviceRegions` (array of strings) - General regions farmer can deliver to (e.g., ["צפון", "מרכז", "ירושלים"])
- Ensure `merchantMinOrderTotal` field is used (already exists in CreateIndependentOrderForm.js)

**Order State:**
- Preserve existing fields for regular consumer flow
- `serviceRegions` is optional - if empty, order is consumer-only (no merchant support)
- All independent farmers support merchant ordering by default (flag in businesses doc)

### Step 4: Farmer Configuration

**File:** `src/components/independent/CreateIndependentOrderForm.js`

**Changes:**
1. Add new section: "איזורי משלוח לסוחרים" (Merchant Delivery Regions)
2. Import `regions` from `src/utils/israelRegions.js`
3. Display checkboxes for available regions
   - Use the `regions` array from israelRegions.js
   - Display as checkboxes with Hebrew labels
4. Make this section optional - farmers can leave it empty if they don't serve merchants
5. Save selected regions to `serviceRegions` array field on order creation
6. Existing `merchantMinOrderTotal` field should be validated during merchant checkout

**UI Considerations:**
- Place this section after regular pickup spots selection (around line 492)
- Add helper text: "בחרו אילו אזורים אתם יכולים לספק למסעדות וסוחרים (אופציונלי)"
- Use same styling as pickup spots section
- Default: no regions selected (merchant ordering disabled)

### Step 5: Merchant User Experience

**File:** `src/components/IndependentFarmers.js`

**Changes:**
1. When a merchant (detected via `isMerchant` flag from line 15) clicks on a farmer listing:
   - Navigate to merchant-specific detail page: `/independent/order-merchant/${order.id}`
   - If order has `serviceRegions` defined and non-empty → allow navigation
   - If order has no `serviceRegions` or empty array → Navigate to regular page (consumers can still order)
2. Display merchant prices in the listing card (lines 241-245) - already implemented
3. Add visual indicator on orders with `serviceRegions`: small badge "זמין לסוחרים"

**Modify handleClickOrder function (line 147):**
```javascript
const handleClickOrder = (order) => {
  if (isMerchant && order.serviceRegions && order.serviceRegions.length > 0) {
    navigate(`/independent/order-merchant/${order.id}`, { state: { order } });
  } else {
    navigate(`/independent/order/${order.id}`, { state: { order } });
  }
};
```

**New File:** `src/components/independent/IndependentOrderFormMerchant.js`

**Structure:**
- **Copy EXACTLY from** `src/components/independent/IndependentOrderForm.js`
- Then make the following modifications:

**Modifications to the copied file:**
1. **Remove volunteer requirements** (lines 222-233, 307-314, 421-471):
   - Merchants don't need volunteers
   - Remove all volunteer checking logic
   - Remove hasVolunteer state and checks
   
2. **Replace pickup spot selection** (lines 377-392) with region selection:
   - Import `regions` from `src/utils/israelRegions.js`
   - Replace dropdown with region selector
   - Label: "בחר אזור משלוח"
   - Options: Only regions from order's `serviceRegions` array
   - Store selected region in state: `selectedRegion`
   
3. **Update product pricing display** (lines 509-514):
   - Always show merchant prices (`product.merchantPrice`)
   - Already implemented correctly with isMerchant flag
   
4. **Update addToLocalCart function** (lines 219-279):
   - Remove volunteer checks
   - Require region selection instead of pickup spot
   - Add cart items with metadata:
     - `isMerchantOrder: true` flag
     - `selectedRegion` from state
     - `price` set to `merchantPrice`
   
5. **Update goToPayment function** (lines 302-329):
   - Navigate to merchant checkout: `/order-confirmation-merchant`
   - Validate `merchantMinOrderTotal` (already implemented at line 316-320)
   - Pass `selectedRegion` in navigation state

**Validation:**
- Require region selection before adding items
- Enforce merchant minimum order total
- Show error if merchant hasn't selected region

### Step 6: Merchant Checkout Flow

**New File:** `src/components/OrderConfirmationMerchant.js`

**Structure:**
- **Copy EXACTLY from** `src/components/OrderConfirmation.js`
- Then make the following modifications:

**Modifications to the copied file:**

1. **Import region utilities:**
```javascript
import { cityToRegion, getRegionByCity } from '../utils/israelRegions';
```

2. **Add merchant-specific state** (after line 43):
```javascript
const [selectedCity, setSelectedCity] = useState('');
const [selectedRegion, setSelectedRegion] = useState(''); // From cart items
const [cityValidationError, setCityValidationError] = useState('');
```

3. **Replace pickup spot section** (lines 962-983) with merchant location:
```jsx
{/* Merchant Region Display (Read-only) */}
<div className="form-group md:col-span-2">
  <label className="block text-sm font-medium text-gray-700 mb-1">
    אזור משלוח
  </label>
  <input
    type="text"
    value={selectedRegion}
    readOnly
    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
  />
  <p className="text-xs text-gray-500 mt-1">האזור שנבחר בעת הוספת הפריטים לסל</p>
</div>

{/* City Selection with Autocomplete/Dropdown */}
<div className="form-group md:col-span-2">
  <label htmlFor="merchantCity" className="block text-sm font-medium text-gray-700 mb-1">
    עיר/יישוב <span className="text-red-500">*</span>
  </label>
  <select
    id="merchantCity"
    value={selectedCity}
    onChange={(e) => {
      setSelectedCity(e.target.value);
      validateMerchantCity(e.target.value);
    }}
    className={`w-full px-3 py-2 border ${cityValidationError ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
    required
  >
    <option value="">בחר עיר/יישוב</option>
    {Object.keys(cityToRegion).sort().map((city) => (
      <option key={city} value={city}>{city}</option>
    ))}
  </select>
  {cityValidationError && (
    <p className="text-red-500 text-sm mt-1">{cityValidationError}</p>
  )}
</div>
```

4. **Add address fields for merchants** (keep existing lines 1091-1139, but always show for merchants):
```jsx
{/* Always show address fields for merchants */}
<div className="form-group md:col-span-2">
  <label htmlFor="merchantAddress" className="block text-sm font-medium text-gray-700 mb-1">
    כתובת מלאה <span className="text-red-500">*</span>
  </label>
  <input
    id="merchantAddress"
    type="text"
    placeholder="רחוב, מספר בית"
    value={userAddress} 
    onChange={(e) => setUserAddress(e.target.value)}
    required
    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
  />
</div>

<div className="form-group md:col-span-2">
  <label htmlFor="merchantDirections" className="block text-sm font-medium text-gray-700 mb-1">
    הנחיות למשלוח (אופציונלי)
  </label>
  <textarea
    id="merchantDirections"
    placeholder="הנחיות נוספות למשלוח - קומה, דירה, שעות קבלה וכו'"
    value={userDirections}
    onChange={(e) => setUserDirections(e.target.value)}
    rows={3}
    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
  />
</div>
```

5. **Add validation function:**
```javascript
const validateMerchantCity = (city) => {
  if (!city) {
    setCityValidationError('נא לבחור עיר');
    return false;
  }
  
  // Get the region for the selected city
  const cityRegion = getRegionByCity(city);
  
  if (!cityRegion) {
    setCityValidationError('העיר לא נמצאה במערכת. אנא פנה לתמיכה.');
    return false;
  }
  
  // Check if city's region matches the selected region from cart
  if (cityRegion !== selectedRegion) {
    setCityValidationError(`העיר ${city} נמצאת באזור ${cityRegion} ולא באזור ${selectedRegion} שנבחר`);
    return false;
  }
  
  // Validate against each order's serviceRegions
  const incompatibleOrders = [];
  Object.entries(itemsByOrder).forEach(([orderId, orderData]) => {
    // Fetch order's serviceRegions (you'll need to add this to cart metadata)
    const orderServiceRegions = orderData.serviceRegions || [];
    if (!orderServiceRegions.includes(cityRegion)) {
      incompatibleOrders.push(orderData.items[0]?.businessName || 'Unknown Business');
    }
  });
  
  if (incompatibleOrders.length > 0) {
    setCityValidationError(
      `העסקים הבאים לא משלחים לאזור ${cityRegion}: ${incompatibleOrders.join(', ')}`
    );
    return false;
  }
  
  setCityValidationError('');
  return true;
};
```

6. **Update form validation** (line 240):
```javascript
useEffect(() => {
  const isValid = userName.trim() !== '' && 
                  userPhone.trim() !== '' && 
                  userEmail.trim() !== '' &&
                  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail) &&
                  selectedCity !== '' &&
                  userAddress.trim() !== '' &&
                  !cityValidationError;
  setFormIsValid(isValid);
}, [userName, userPhone, userEmail, selectedCity, userAddress, cityValidationError]);
```

7. **Update order submission** (lines 477-499):
```javascript
await setDoc(customerOrderIdOrderRef, {
  orderBreakdown,
  customerDetails: {
    name: userName,
    phone: userPhone,
    email: userEmail,
    city: selectedCity,
    address: userAddress,
    directions: userDirections,
    deliveryRegion: selectedRegion, // Add region info
    deliveryType: 'merchant'
  },
  businessIds: businessIds,
  createdAt: new Date().toISOString(),
  paymentStatus: 'pending_payment',
  grandTotal: totalWithDelivery,
  userId: currentUser?.uid || null,
  isMerchantOrder: true // Flag for merchant order
});
```

8. **Remove delivery options section** (lines 985-1089):
   - Merchants always get direct delivery
   - No pickup/boxCollection options
   - No delivery fee toggles

9. **Extract selectedRegion from cart on mount:**
```javascript
useEffect(() => {
  // Extract region from first merchant cart item
  const merchantItems = Object.values(itemsByOrder).flatMap(order => order.items);
  const firstMerchantItem = merchantItems.find(item => item.isMerchantOrder);
  if (firstMerchantItem && firstMerchantItem.selectedRegion) {
    setSelectedRegion(firstMerchantItem.selectedRegion);
  }
}, [itemsByOrder]);
```

**Routing:** Add route in App.js:
```javascript
<Route path="/order-confirmation-merchant" element={<OrderConfirmationMerchant />} />
```

### Step 7: Cart Context Enhancement

**File:** `src/contexts/CartContext.js`

**Changes:**
- Cart already supports arbitrary metadata on items
- Ensure merchant items include:
  - `isMerchantOrder: true`
  - `selectedRegion: string`
  - `serviceRegions: array` (from order)
  - `price: merchantPrice` (already handled)
- No structural changes needed - current implementation supports this

### Step 8: Validation and Error Handling

1. **City Validation (at checkout):**
   - City must exist in `cityToRegion` mapping
   - City's region must match `selectedRegion` from cart
   - City's region must be in order's `serviceRegions` array
   - Show immediate feedback on city selection with specific error messages

2. **Minimum Order Validation:**
   - Validate `merchantMinOrderTotal` before allowing payment (already implemented in IndependentOrderForm.js line 316-320)
   - Show clear error message with current total vs. minimum

3. **Region Selection Validation:**
   - Merchant must select region before adding items to cart
   - Show error: "אנא בחר אזור משלוח לפני הוספת פריטים"

4. **Edge Cases:**
   - Merchant with no city selected → Prevent checkout, highlight city field
   - City not in cityToRegion mapping → "יישוב לא נמצא במערכת, אנא פנה לתמיכה"
   - City in wrong region → "העיר [city] נמצאת באזור [actual] ולא באזור [selected]"
   - Order expires during shopping → Use existing expiration handling
   - Farmer has no serviceRegions → Show regular consumer page
   - Mixed cart (consumer + merchant items) → Not allowed, show error and clear cart

## Implementation Approach

1. **Start with data layer:**  
   - Create `israelRegions.js` utility file
   - Extract regions from `communityToRegion.js`
   - Test region lookup functions

2. **Implement in order:**
   1. Create regions utility file
   2. Add region selection to CreateIndependentOrderForm.js
   3. Modify IndependentFarmers.js for merchant detection and navigation
   4. Copy and modify IndependentOrderForm.js → IndependentOrderFormMerchant.js
   5. Copy and modify OrderConfirmation.js → OrderConfirmationMerchant.js
   6. Add routing for merchant pages
   7. Test validation flow

3. **Considerations:**
   - Maintain backward compatibility with existing consumer flow
   - Reuse existing components (LoadingSpinner, Swal, etc.)
   - Follow existing styling patterns (Tailwind classes, RTL Hebrew)
   - Mobile responsiveness
   - Don't modify original OrderConfirmation.js or IndependentOrderForm.js
   - Create separate merchant-specific files

## Files to Modify/Create

### Create:
- `src/utils/israelRegions.js` - New regions mapping and utilities
- `src/components/independent/IndependentOrderFormMerchant.js` - Copy of IndependentOrderForm.js with merchant modifications
- `src/components/OrderConfirmationMerchant.js` - Copy of OrderConfirmation.js with merchant checkout

### Modify:
- `src/components/IndependentFarmers.js` - Add merchant detection and routing
- `src/components/independent/CreateIndependentOrderForm.js` - Add region selection
- `src/App.js` - Add routes for merchant pages

### Do NOT Modify:
- `src/components/OrderConfirmation.js` - Keep original for consumers
- `src/components/independent/IndependentOrderForm.js` - Keep original for consumers
- `src/utils/communityToRegion.js` - Don't use or modify this file

## Summary of Flow

1. **Farmer Setup:** Farmer creates order in CreateIndependentOrderForm, optionally selects service regions for merchants
2. **Merchant Browsing:** Merchant sees orders in IndependentFarmers, orders with serviceRegions show "זמין לסוחרים" badge
3. **Merchant Ordering:** Merchant clicks order → navigates to IndependentOrderFormMerchant → selects region → adds items at merchant prices → items added to cart with merchant metadata
4. **Merchant Checkout:** Merchant clicks checkout → navigates to OrderConfirmationMerchant → enters city → system validates city is in selected region and farmer services that region → completes payment
5. **Order Creation:** Order saved with merchant delivery details and merchant flag

## Output Expected

1. Implementation plan confirming understanding
2. Code for israelRegions.js utility
3. Modified CreateIndependentOrderForm.js with region selection
4. Modified IndependentFarmers.js with merchant routing
5. New IndependentOrderFormMerchant.js based on original
6. New OrderConfirmationMerchant.js based on original
7. Validation logic with Hebrew error messages
8. Route additions for App.js

