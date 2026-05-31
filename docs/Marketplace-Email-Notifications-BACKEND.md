# Marketplace order emails — backend + EmailJS

Order notification emails are sent **only by the Cloud Function** in production (unless browser fallback is enabled in dev).

The React app builds **HTML** in `src/utils/marketplaceOrderEmailHtml.js` and POSTs it to `notifyMarketplaceNewOrder`.

**If emails still look like plain text**, the Cloud Function is almost certainly **rebuilding `message` from `linesSummary`** and/or EmailJS templates use `{{message}}` instead of `{{{message}}}`. Fix both (see below).

---

## 1. Production flow

```
Checkout → POST notifyMarketplaceNewOrder (JSON body)
         → Cloud Function → EmailJS API (seller + customer templates)
```

Default URL:

`POST https://us-central1-auth-development-323c3.cloudfunctions.net/notifyMarketplaceNewOrder`

No frontend EmailJS secrets in prod unless `REACT_APP_MARKETPLACE_EMAIL_BROWSER_FALLBACK=true`.

---

## 2. POST body (what the frontend sends now)

Besides order fields (`orderId`, `lines`, `customerName`, …), the enriched body includes:

| Field | Use |
|--------|-----|
| `sellerMessageHtml` | Full HTML body for seller |
| `customerMessageHtml` | Full HTML body for customer |
| `linesHtml` | Items table HTML only |
| `sellerEmailJsParams` | **Ready-to-send** EmailJS `template_params` for seller |
| `customerEmailJsParams` | **Ready-to-send** EmailJS `template_params` for customer |
| `linesSummary` | Plain-text fallback only — do **not** use as primary `message` |

### Recommended Cloud Function change (minimal)

**Do not** build `message` from `linesSummary` on the server.

Forward the prebuilt params:

```javascript
// notifyMarketplaceNewOrder — pseudocode
const body = req.body; // parsed JSON from frontend

async function sendSeller() {
  if (!body.sellerEmail) return { attempted: false, sent: false, skippedReason: 'no_seller_email' };
  const params = body.sellerEmailJsParams || {
    to_email: body.sellerEmail,
    from_name: 'Basta Basket',
    message: body.sellerMessageHtml,
    message_html: body.sellerMessageHtml,
    lines_html: body.linesHtml,
    subject: `Basta Basket — הזמנה חדשה · ${body.businessName}`,
    // ...map remaining fields from body.sellerEmailJsParams
  };
  await emailjs.send(SERVICE_ID, SELLER_TEMPLATE_ID, params, { publicKey, privateKey });
  return { attempted: true, sent: true, skippedReason: null };
}

async function sendCustomer() {
  if (!body.customerEmail) return { attempted: false, sent: false, skippedReason: 'no_customer_email' };
  const params = body.customerEmailJsParams || {
    to_email: body.customerEmail,
    from_name: 'Basta Basket',
    message: body.customerMessageHtml,
    message_html: body.customerMessageHtml,
    lines_html: body.linesHtml,
    subject: `Basta Basket — אישור הזמנה · ${body.businessName}`,
    my_orders_url: body.myOrdersUrl,
    payment_method: body.paymentLabel,
    // ...
  };
  await emailjs.send(SERVICE_ID, CUSTOMER_TEMPLATE_ID, params, { publicKey, privateKey });
  return { attempted: true, sent: true, skippedReason: null };
}
```

Deploy the function after this change.

---

## 3. EmailJS templates (required)

In **both** seller and customer templates in the EmailJS dashboard:

### Body must use triple braces (raw HTML)

```html
{{{message}}}
```

or

```html
{{{message_html}}}
```

If the template uses `{{message}}`, recipients will see raw HTML tags and no styling.

### Optional: table only

```html
{{{lines_html}}}
```

### Sender

Set template / service so **`from_name`** comes from param `from_name` → value **`Basta Basket`** (frontend sends this in `sellerEmailJsParams` / `customerEmailJsParams`).

### Seller template params

`to_email`, `to_name`, `from_name`, `from_email`, `reply_to`, `subject`, `order_id`, `business_name`, `message`, `message_html`, `lines_html`

### Customer template params

`to_email`, `to_name`, `from_name`, `subject`, `order_id`, `business_name`, `payment_method`, `my_orders_url`, `message`, `message_html`, `lines_html`

Do **not** use legacy keys: `title`, `name`, `email`, `time`.

---

## 4. Secrets / env (Cloud Function)

- `EMAILJS_PRIVATE_KEY`
- `EMAILJS_SERVICE_ID` → e.g. `service_ao0jk0r`
- `EMAILJS_MP_SELLER_TEMPLATE` → “marketplace seller new order”
- `EMAILJS_MP_CUSTOMER_TEMPLATE` → e.g. `template_0kpi8qn`
- `MARKETPLACE_CORS_ORIGINS` → production + `http://localhost:3000` for dev

---

## 5. How to verify

1. Place a test order.
2. DevTools → Network → `notifyMarketplaceNewOrder` → Request payload:
   - `sellerMessageHtml` should start with `<!DOCTYPE html>`
   - `sellerEmailJsParams.message` should be the same HTML
3. If the payload is HTML but the email is plain text → **backend or template** is wrong (not frontend).
4. If `sellerMessageHtml` is missing → redeploy **frontend**.
5. Optional local test without Cloud Function:

```bash
REACT_APP_MARKETPLACE_EMAIL_BROWSER_FALLBACK=true
REACT_APP_EMAILJS_PUBLIC_KEY=...
REACT_APP_EMAILJS_MP_SELLER_TEMPLATE=...
REACT_APP_EMAILJS_MP_CUSTOMER_TEMPLATE=template_0kpi8qn
```

Then fix EmailJS templates with `{{{message}}}` and send a test order.

---

## 6. Response → confirmation UI

```json
{
  "seller": { "attempted": true, "sent": true, "skippedReason": null },
  "customer": { "attempted": true, "sent": true, "skippedReason": null }
}
```

---

## 7. Frontend files

| File | Role |
|------|------|
| `src/utils/marketplaceOrderEmailHtml.js` | HTML + table builders |
| `src/services/marketplaceOrderNotifications.js` | Payload + POST + browser fallback |
| `src/constants/marketplaceEmailNotifications.js` | Dev fallback flags |

---

## Checklist

- [ ] Cloud Function uses `body.sellerEmailJsParams` / `body.customerEmailJsParams` (or `sellerMessageHtml` / `customerMessageHtml`) — **does not** rebuild plain `message` from `linesSummary`
- [ ] Cloud Function sets / forwards `from_name: "Basta Basket"`
- [ ] EmailJS seller + customer templates use `{{{message}}}` or `{{{message_html}}}`
- [ ] Function redeployed; templates saved in EmailJS dashboard
- [ ] Test order: email shows styled table and Basta Basket branding
