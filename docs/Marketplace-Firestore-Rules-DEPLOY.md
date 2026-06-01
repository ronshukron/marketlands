# Marketplace Firestore rules — deploy fix

Common causes of `Missing or insufficient permissions` on **ההזמנות שלי בשוק**:

1. Missing `marketplaceUsers` rules (checkout / role).
2. `marketplaceOrders` read uses **`request.auth.email`** — invalid. Use **`request.auth.token.email`**.
3. Missing `customerUserId == request.auth.uid` in read rules.

## Replace your marketplace block in Firebase Console

Add the helper functions and matches below (before the final `match /{document=**}` deny).

```javascript
    function isMarketplaceOrderCustomer() {
      return isAuthenticated() && (
        resource.data.customerUserId == request.auth.uid
        || resource.data.customerEmail == request.auth.token.email
      );
    }

    function isMarketplaceOrderSeller() {
      return isAuthenticated() && resource.data.businessId == request.auth.uid;
    }

    match /marketplaceUsers/{userId} {
      allow read, create, update: if isAuthenticated() && request.auth.uid == userId;
      allow delete: if false;
    }

    function isMarketplaceOrderSellerUpdate() {
      return (isMarketplaceOrderSeller() || isAdmin())
        && request.resource.data.businessId == resource.data.businessId
        && request.resource.data.customerUserId == resource.data.customerUserId
        && request.resource.data.customerEmail == resource.data.customerEmail;
    }

    match /marketplaceOrders/{orderId} {
      allow create: if true;
      allow read: if isAdmin()
        || isMarketplaceOrderSeller()
        || isMarketplaceOrderCustomer();
      allow update: if isMarketplaceOrderSellerUpdate();
      allow delete: if false;
    }
```

Publish rules, wait ~1 minute, refresh `/community-marketplace/my-orders`.

See full block in `Marketplace-Firestore-Rules.snippet.txt`.

## Cloud Functions CORS / 404

`placeMarketplaceStoreCartOrder` and `notifyMarketplaceNewOrder` are **not called** unless you set:

```bash
# Marketplace order emails use notifyMarketplaceNewOrder by default (no frontend EmailJS env).
```

Until functions are deployed with CORS, orders use the Firestore client fallback (no console CORS errors).
