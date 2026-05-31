const SKIPPED_REASONS = new Set([
  'no_seller_email',
  'no_customer_email',
  'already_sent',
  'missing_seller_template_id',
]);

export const isEmailSkipped = (result) =>
  Boolean(result?.skippedReason && SKIPPED_REASONS.has(result.skippedReason));

export const isEmailFailed = (result) =>
  Boolean(result?.attempted && !result?.sent && !isEmailSkipped(result));

/** Aggregate per-order notification results for confirmation page. */
export const summarizeEmailNotifications = (
  ordersOrNotifications = [],
  { combinedCustomer = null } = {}
) => {
  const list = Array.isArray(ordersOrNotifications)
    ? ordersOrNotifications.map((item) => item?.notifications || item)
    : [];

  const acc = list.reduce(
    (summary, notifications) => {
      const { seller, customer } = notifications || {};

      if (seller?.sent) summary.sellerSent += 1;
      else if (isEmailSkipped(seller)) summary.sellerSkipped += 1;
      else if (isEmailFailed(seller)) summary.sellerFailed += 1;

      if (!combinedCustomer) {
        if (customer?.sent) summary.customerSent = true;
        else if (isEmailSkipped(customer)) summary.customerSkipped = true;
        else if (isEmailFailed(customer)) summary.customerFailed = true;
      }

      return summary;
    },
    {
      sellerSent: 0,
      sellerFailed: 0,
      sellerSkipped: 0,
      customerSent: false,
      customerFailed: false,
      customerSkipped: false,
      customerCombined: false,
    }
  );

  if (combinedCustomer) {
    if (combinedCustomer.sent) acc.customerSent = true;
    else if (isEmailSkipped(combinedCustomer)) acc.customerSkipped = true;
    else if (isEmailFailed(combinedCustomer)) acc.customerFailed = true;
    acc.customerCombined = true;
  }

  return acc;
};
