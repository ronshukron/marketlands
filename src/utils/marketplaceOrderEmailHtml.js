/** Brand name shown in marketplace order emails */
export const BASTA_BASKET_FROM_NAME = 'Basta Basket';

const RTL =
  'direction:rtl;unicode-bidi:embed;text-align:right;';
const RTL_BODY = `${RTL}font-family:'Segoe UI',Tahoma,Arial,sans-serif;`;
/** Numbers / email / phone — keep LTR inside RTL layout */
const LTR_VALUE = 'direction:ltr;unicode-bidi:embed;text-align:left;display:inline-block;';

const formatCurrency = (value) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(Number(value || 0));

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const wrapLtr = (value) =>
  `<span style="${LTR_VALUE}">${escapeHtml(value)}</span>`;

const emailShell = ({ title, preheader, bodyHtml }) => `
<!DOCTYPE html>
<html lang="he" dir="rtl" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body dir="rtl" style="margin:0;padding:0;background-color:#f4efe4;${RTL_BODY}color:#3d2f1f;">
  <span style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" style="background-color:#f4efe4;padding:24px 12px;${RTL}">
    <tr>
      <td align="center" dir="rtl" style="${RTL}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e0d4c0;box-shadow:0 4px 16px rgba(61,47,31,0.08);${RTL}">
          <tr>
            <td dir="rtl" style="background:linear-gradient(135deg,#3d2f1f 0%,#4a7c3f 55%,#8b5a2b 100%);padding:28px 24px;text-align:center;${RTL}">
              <p style="margin:0 0 6px;font-size:13px;letter-spacing:0.06em;color:#e8d5b5;text-transform:uppercase;">${BASTA_BASKET_FROM_NAME}</p>
              <h1 style="margin:0;font-size:22px;line-height:1.35;color:#faf6ee;font-weight:700;${RTL}">${escapeHtml(title)}</h1>
            </td>
          </tr>
          <tr>
            <td dir="rtl" style="padding:24px;font-size:15px;line-height:1.65;${RTL}">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td dir="rtl" style="padding:16px 24px 24px;border-top:1px solid #efe6d4;background:#faf6ee;text-align:center;${RTL}">
              <p style="margin:0;font-size:12px;color:#8b7355;${RTL}">
                הודעה מ־<strong>${BASTA_BASKET_FROM_NAME}</strong> · שוק הבסטות
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

const detailRow = (label, value, { ltrValue = false } = {}) => {
  if (value === undefined || value === null || value === '') return '';
  const valueHtml = ltrValue ? wrapLtr(value) : escapeHtml(value);
  return `
    <tr>
      <td dir="rtl" style="padding:6px 0 6px 12px;color:#6b5a45;font-size:14px;width:38%;vertical-align:top;${RTL}">${escapeHtml(label)}</td>
      <td dir="rtl" style="padding:6px 12px 6px 0;color:#3d2f1f;font-size:14px;font-weight:600;${RTL}">${valueHtml}</td>
    </tr>`;
};

/**
 * HTML table of order line items (RTL). First column = מוצר on the right.
 */
export const buildOrderLinesTableHtml = (lines = []) => {
  if (!lines.length) {
    return `<p dir="rtl" style="margin:0;color:#6b5a45;${RTL}">אין פריטים בהזמנה.</p>`;
  }

  const rows = lines
    .map((line) => {
      const qty = Number(line.quantity) || 0;
      const lineTotal = Number(line.total);
      const unitPrice =
        line.price != null
          ? Number(line.price)
          : qty > 0 && Number.isFinite(lineTotal)
            ? lineTotal / qty
            : 0;

      return `
        <tr>
          <td dir="rtl" style="padding:10px 12px;border-bottom:1px solid #efe6d4;color:#3d2f1f;font-size:14px;${RTL}">${escapeHtml(line.name || 'פריט')}</td>
          <td dir="rtl" style="padding:10px 8px;border-bottom:1px solid #efe6d4;text-align:center;color:#3d2f1f;font-size:14px;">${qty}</td>
          <td dir="ltr" style="padding:10px 8px;border-bottom:1px solid #efe6d4;text-align:left;color:#6b5a45;font-size:13px;white-space:nowrap;${LTR_VALUE}">${formatCurrency(unitPrice)}</td>
          <td dir="ltr" style="padding:10px 12px;border-bottom:1px solid #efe6d4;text-align:left;color:#4a7c3f;font-size:14px;font-weight:700;white-space:nowrap;${LTR_VALUE}">${formatCurrency(lineTotal)}</td>
        </tr>`;
    })
    .join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" style="border:1px solid #e0d4c0;border-radius:8px;overflow:hidden;margin:16px 0 8px;${RTL}">
      <thead>
        <tr style="background:#f4efe4;">
          <th dir="rtl" style="padding:10px 12px;text-align:right;font-size:12px;color:#6b5a45;font-weight:700;${RTL}">מוצר</th>
          <th dir="rtl" style="padding:10px 8px;text-align:center;font-size:12px;color:#6b5a45;font-weight:700;">כמות</th>
          <th dir="ltr" style="padding:10px 8px;text-align:left;font-size:12px;color:#6b5a45;font-weight:700;">מחיר יח׳</th>
          <th dir="ltr" style="padding:10px 12px;text-align:left;font-size:12px;color:#6b5a45;font-weight:700;">סה״כ</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`;
};

const buildTotalsBlockHtml = ({ subtotal, deliveryFee, total }) => {
  const amountCell = (amount) =>
    `<td dir="ltr" style="padding:4px 0;text-align:left;font-weight:600;white-space:nowrap;${LTR_VALUE}">${formatCurrency(amount)}</td>`;

  const rows = [
    subtotal > 0
      ? `<tr><td dir="rtl" style="padding:4px 0 4px 12px;color:#6b5a45;${RTL}">סכום ביניים</td>${amountCell(subtotal)}</tr>`
      : '',
    deliveryFee > 0
      ? `<tr><td dir="rtl" style="padding:4px 0 4px 12px;color:#6b5a45;${RTL}">דמי משלוח</td>${amountCell(deliveryFee)}</tr>`
      : '',
    `<tr>
      <td dir="rtl" style="padding:10px 0 0;color:#3d2f1f;font-size:16px;font-weight:700;${RTL}">סה״כ לתשלום</td>
      <td dir="ltr" style="padding:10px 0 0;text-align:left;font-size:18px;font-weight:800;color:#4a7c3f;white-space:nowrap;${LTR_VALUE}">${formatCurrency(total)}</td>
    </tr>`,
  ].filter(Boolean);

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" style="margin-top:8px;${RTL}">
      ${rows.join('')}
    </table>`;
};

const buildDetailsTableHtml = (rows) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" style="margin:0 0 8px;${RTL}">
    ${rows}
  </table>`;

export const buildSellerOrderEmailHtml = (payload) => {
  const bodyHtml = `
    <p dir="rtl" style="margin:0 0 16px;font-size:15px;${RTL}">התקבלה <strong>הזמנה חדשה</strong> לבסטה שלך דרך ${BASTA_BASKET_FROM_NAME}.</p>
    ${buildDetailsTableHtml([
      detailRow('מס׳ הזמנה', payload.orderId, { ltrValue: true }),
      detailRow('בסטה', payload.businessName),
      detailRow('שם הלקוח', payload.customerName),
      detailRow('טלפון', payload.customerPhone, { ltrValue: true }),
      detailRow('אימייל', payload.customerEmail, { ltrValue: true }),
      detailRow('קהילה', payload.customerCommunity),
      detailRow('אספקה', payload.fulfillmentLabel || '—'),
      detailRow('תשלום', payload.paymentLabel),
    ])}
    <h2 dir="rtl" style="margin:20px 0 8px;font-size:16px;color:#3d2f1f;${RTL}">פריטים בהזמנה</h2>
    ${payload.linesHtml || buildOrderLinesTableHtml(payload.lines)}
    ${buildTotalsBlockHtml(payload)}
    ${
      payload.customerNotes
        ? `<div dir="rtl" style="margin-top:16px;padding:12px 14px;background:#fffbeb;border:1px solid #e6c200;border-radius:8px;${RTL}">
            <p style="margin:0 0 4px;font-size:12px;color:#92400e;font-weight:700;${RTL}">הערות מהלקוח</p>
            <p style="margin:0;font-size:14px;color:#3d2f1f;${RTL}">${escapeHtml(payload.customerNotes)}</p>
          </div>`
        : ''
    }
    <p dir="rtl" style="margin:20px 0 0;font-size:13px;color:#6b5a45;${RTL}">ניתן להשיב למייל זה כדי ליצור קשר ישירות עם הלקוח.</p>
  `;

  return emailShell({
    title: `הזמנה חדשה — ${payload.businessName || 'הבסטה שלך'}`,
    preheader: `הזמנה חדשה מ־${payload.customerName || 'לקוח'} · ${formatCurrency(payload.total)}`,
    bodyHtml,
  });
};

export const buildCustomerOrderEmailHtml = (payload) => {
  const bodyHtml = `
    <p dir="rtl" style="margin:0 0 8px;font-size:16px;${RTL}">שלום ${escapeHtml(payload.customerName || '')},</p>
    <p dir="rtl" style="margin:0 0 16px;${RTL}">קיבלנו את ההזמנה שלך לבסטה <strong>${escapeHtml(payload.businessName || '')}</strong> ב־${BASTA_BASKET_FROM_NAME}.</p>
    ${buildDetailsTableHtml([
      detailRow('מס׳ הזמנה', payload.orderId, { ltrValue: true }),
      detailRow('אספקה', payload.fulfillmentLabel),
      detailRow('תשלום', payload.paymentLabel),
    ])}
    <div dir="rtl" style="margin:16px 0;padding:14px 16px;background:#f0f7ee;border:1px solid #c5dcc0;border-radius:8px;${RTL}">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#4a7c3f;${RTL}">מה עכשיו?</p>
      <ol dir="rtl" style="margin:0;padding:0 24px 0 0;list-style-position:outside;color:#3d2f1f;font-size:14px;line-height:1.7;${RTL}">
        <li style="margin-bottom:6px;">שלמו לבסטה ישירות באמצעי: <strong>${escapeHtml(payload.paymentLabel || 'לפי תיאום')}</strong>.</li>
        <li style="margin-bottom:6px;">תיאום פרטים — ישירות מול הבסטה (טלפון / וואטסאפ / אימייל).</li>
        <li>כשההזמנה מוכנה — הבסטה תעדכן אתכם לאיסוף או למשלוח.</li>
      </ol>
    </div>
    <h2 dir="rtl" style="margin:20px 0 8px;font-size:16px;color:#3d2f1f;${RTL}">סיכום ההזמנה</h2>
    ${payload.linesHtml || buildOrderLinesTableHtml(payload.lines)}
    ${buildTotalsBlockHtml(payload)}
  `;

  const ordersLink = payload.myOrdersUrl
    ? `<p dir="rtl" style="margin:20px 0 0;text-align:center;${RTL}">
        <a href="${escapeHtml(payload.myOrdersUrl)}" style="display:inline-block;padding:12px 22px;background:#4a7c3f;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">ההזמנות שלי בשוק</a>
      </p>`
    : '';

  return emailShell({
    title: `אישור הזמנה — ${payload.businessName || 'הבסטה'}`,
    preheader: `ההזמנה התקבלה · ${formatCurrency(payload.total)}`,
    bodyHtml: bodyHtml + ordersLink,
  });
};

const buildStoreOrderSectionHtml = (section) => {
  const lines = Array.isArray(section.lines) ? section.lines : [];
  const linesHtml = buildOrderLinesTableHtml(lines);
  const notesBlock = section.customerNotes
    ? `<p dir="rtl" style="margin:8px 0 0;font-size:13px;color:#6b5a45;${RTL}"><strong>הערות:</strong> ${escapeHtml(section.customerNotes)}</p>`
    : '';

  return `
    <div dir="rtl" style="margin:20px 0;padding:16px;background:#faf6ee;border:1px solid #e0d4c0;border-radius:8px;${RTL}">
      <h2 dir="rtl" style="margin:0 0 8px;font-size:16px;color:#3d2f1f;${RTL}">${escapeHtml(section.businessName || 'בסטה')}</h2>
      ${buildDetailsTableHtml([
        detailRow('מס׳ הזמנה', section.orderId, { ltrValue: true }),
        detailRow('אספקה', section.fulfillmentLabel),
      ])}
      ${linesHtml}
      ${buildTotalsBlockHtml({
        subtotal: Number(section.subtotal) || 0,
        deliveryFee: Number(section.deliveryFee) || 0,
        total: Number(section.total) || 0,
      })}
      ${notesBlock}
    </div>`;
};

/** One customer email for multi-store cart checkout */
export const buildCustomerCombinedCheckoutEmailHtml = ({
  customerName = '',
  paymentLabel = '',
  myOrdersUrl = '',
  orderSections = [],
  grandSubtotal = 0,
  grandDeliveryFee = 0,
  grandTotal = 0,
}) => {
  const sectionsHtml = orderSections.map(buildStoreOrderSectionHtml).join('');

  const bodyHtml = `
    <p dir="rtl" style="margin:0 0 8px;font-size:16px;${RTL}">שלום ${escapeHtml(customerName)},</p>
    <p dir="rtl" style="margin:0 0 16px;${RTL}">
      קיבלנו את <strong>${orderSections.length}</strong> ההזמנות שלך בשוק הבסטות (${BASTA_BASKET_FROM_NAME}).
      לכל בסטה נוצרה הזמנה נפרדת — הפרטים למטה.
    </p>
    ${buildDetailsTableHtml([detailRow('תשלום', paymentLabel)])}
    <div dir="rtl" style="margin:16px 0;padding:14px 16px;background:#f0f7ee;border:1px solid #c5dcc0;border-radius:8px;${RTL}">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#4a7c3f;${RTL}">מה עכשיו?</p>
      <ol dir="rtl" style="margin:0;padding:0 24px 0 0;list-style-position:outside;color:#3d2f1f;font-size:14px;line-height:1.7;${RTL}">
        <li style="margin-bottom:6px;">שלמו <strong>לכל בסטה בנפרד</strong> באמצעי: ${escapeHtml(paymentLabel || 'לפי תיאום')}.</li>
        <li style="margin-bottom:6px;">תיאום איסוף/משלוח — ישירות מול כל בסטה.</li>
        <li>כשההזמנה מוכנה — הבסטה תעדכן אתכם.</li>
      </ol>
    </div>
    <h2 dir="rtl" style="margin:8px 0 12px;font-size:16px;color:#3d2f1f;${RTL}">פירוט לפי בסטה</h2>
    ${sectionsHtml}
    <div dir="rtl" style="margin-top:16px;padding:12px 14px;background:#f4efe4;border-radius:8px;${RTL}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" style="${RTL}">
        <tr>
          <td style="padding:4px 0;font-weight:700;${RTL}">סה״כ כל ההזמנות</td>
          <td dir="ltr" style="padding:4px 0;text-align:left;font-size:18px;font-weight:800;color:#4a7c3f;${LTR_VALUE}">${formatCurrency(grandTotal)}</td>
        </tr>
      </table>
    </div>
  `;

  const ordersLink = myOrdersUrl
    ? `<p dir="rtl" style="margin:20px 0 0;text-align:center;${RTL}">
        <a href="${escapeHtml(myOrdersUrl)}" style="display:inline-block;padding:12px 22px;background:#4a7c3f;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">ההזמנות שלי בשוק</a>
      </p>`
    : '';

  return emailShell({
    title: `אישור ${orderSections.length} הזמנות — שוק הבסטות`,
    preheader: `${orderSections.length} הזמנות התקבלו · ${formatCurrency(grandTotal)}`,
    bodyHtml: bodyHtml + ordersLink,
  });
};

export const buildCustomerOrderCompletedEmailHtml = (payload) => {
  const bodyHtml = `
    <p dir="rtl" style="margin:0 0 8px;font-size:16px;${RTL}">שלום ${escapeHtml(payload.customerName || '')},</p>
    <p dir="rtl" style="margin:0 0 16px;${RTL}">
      ההזמנה שלך מ<strong>${escapeHtml(payload.businessName || '')}</strong> מוכנה לאיסוף / מסירה.
    </p>
    ${buildDetailsTableHtml([
      detailRow('מס׳ הזמנה', payload.orderId, { ltrValue: true }),
      detailRow('אספקה', payload.fulfillmentLabel),
      detailRow('תשלום', payload.paymentLabel),
    ])}
    <div dir="rtl" style="margin:16px 0;padding:14px 16px;background:#f0f7ee;border:1px solid #c5dcc0;border-radius:8px;${RTL}">
      <p style="margin:0;font-size:14px;line-height:1.65;${RTL}">
        הבסטה סימנה שההזמנה הושלמה. לתיאום פרטים נוספים — צרו קשר ישירות עם העסק (טלפון / וואטסאפ).
      </p>
    </div>
    <h2 dir="rtl" style="margin:20px 0 8px;font-size:16px;color:#3d2f1f;${RTL}">סיכום ההזמנה</h2>
    ${payload.linesHtml || buildOrderLinesTableHtml(payload.lines)}
    ${buildTotalsBlockHtml(payload)}
  `;

  const ordersLink = payload.myOrdersUrl
    ? `<p dir="rtl" style="margin:20px 0 0;text-align:center;${RTL}">
        <a href="${escapeHtml(payload.myOrdersUrl)}" style="display:inline-block;padding:12px 22px;background:#4a7c3f;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">ההזמנות שלי בשוק</a>
      </p>`
    : '';

  return emailShell({
    title: `ההזמנה מוכנה — ${payload.businessName || 'הבסטה'}`,
    preheader: `ההזמנה מ${payload.businessName || 'הבסטה'} מוכנה · ${formatCurrency(payload.total)}`,
    bodyHtml: bodyHtml + ordersLink,
  });
};

/** Plain-text fallback for clients that strip HTML */
export const buildOrderLinesPlainSummary = (lines = []) =>
  lines
    .map((line) => {
      const qty = Number(line.quantity) || 0;
      const total = Number(line.total) || 0;
      return `${line.name} × ${qty} — ${formatCurrency(total)}`;
    })
    .join('\n');
