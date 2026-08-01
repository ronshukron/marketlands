# Roadmap verification checklist

Automated verification completed in the frontend repo:

- `npm test -- --watchAll=false` — all suites passed
- `npm run build` — production build succeeded

## Manual smoke (operator)

- [ ] Marketplace order with payment-link redirect and confirmation fallback
- [ ] Community added in `/admin/communities` appears in marketplace dropdowns
- [ ] Promotion closing date+time blocks orders at the exact minute
- [ ] Waitlist approve/reject as admin; non-admin cannot update
- [ ] Seller enables volunteer pickup; volunteer opens spot; customer can choose business pickup vs volunteer pickup vs delivery
- [ ] Classic guest checkout, email/password account modal, and Google path
- [ ] Finalized order product transfer between businesses in weekly customer order manager
- [ ] Delayed confirmation shows credit-hold as the primary amount

## V7 two-computer smoke

- [ ] Claim conflict between two stations
- [ ] Line edit attribution shows station IDs
- [ ] Settlement completes with unchanged totals/flow
- [ ] Refresh/offline recovery still works
- [ ] Persisted `weighingAudit` survives reload only after backend accepts additive fields

## Deploy prerequisites (outside CRA)

- Paste updated rules snippets for waitlist, product feedback, marketplace volunteers, and `deliveryRealtimeV7`
- Confirm settlement backend preserves optional V7 station audit fields
