import React from 'react';

const formatDateLabel = (dateKey) => new Date(`${dateKey}T00:00:00`).toLocaleDateString('he-IL', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
});

const formatClosedAt = (cutoff) => {
    // Cutoffs end at hh:59:59.999; show the round minute (15:00, not 14:59).
    const date = new Date(Math.round(cutoff.getTime() / 60000) * 60000);
    const weekday = date.toLocaleDateString('he-IL', { weekday: 'long' });
    const time = date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    return `${weekday} ב-${time}`;
};

/**
 * Checkout notice for products that cannot arrive on the chosen delivery date:
 * they are left out of the order (the rest arrives as usual) and are removed from
 * the cart when the customer presses pay.
 *
 * items: the left-out cart lines; baskets: [{basketInstanceId, title, closedBusinessNames}];
 * closures: [{orderId, businessName, closedAt: Date}] for farmers whose cutoff passed.
 */
const LeftOutItemsNotice = ({ items = [], baskets = [], closures = [], deliveryDate = '' }) => {
    const looseItems = items.filter((item) => !item.basketInstanceId);
    const rowCount = looseItems.length + baskets.length;
    if (rowCount === 0) return null;

    return (
        <div role="status" className="mt-3 text-right rounded-lg border-2 border-amber-400 bg-amber-50 p-3">
            <p className="text-base font-bold text-amber-900">
                {rowCount === 1 ? 'מוצר אחד לא ייכלל בהזמנה' : `${rowCount} מוצרים לא ייכללו בהזמנה`}
            </p>
            <p className="mt-1 text-sm text-amber-900">
                {`${rowCount === 1 ? 'הוא כבר לא יכול' : 'הם כבר לא יכולים'} להגיע${deliveryDate ? ` ב${formatDateLabel(deliveryDate)}` : ''}. `}
                {'שאר ההזמנה תגיע כרגיל והסכום לתשלום לא כולל '}
                {rowCount === 1 ? 'אותו' : 'אותם'}
                {'. כשתלחצו על תשלום '}
                {rowCount === 1 ? 'הוא יוסר' : 'הם יוסרו'}
                {' מהעגלה.'}
            </p>
            <ul className="mt-2 list-disc list-inside space-y-0.5 text-sm text-amber-900">
                {looseItems.map((item, index) => (
                    <li key={`${item.uid || item.id}-${index}`}>
                        {item.name || item.productName}
                        {item.businessName ? ` · ${item.businessName}` : ''}
                    </li>
                ))}
                {baskets.map((basket) => (
                    <li key={basket.basketInstanceId}>
                        {`${basket.title} (כל הסל${basket.closedBusinessNames.length > 0
                            ? `, כי יש בו מוצרים מ${basket.closedBusinessNames.join(', ')}`
                            : ''})`}
                    </li>
                ))}
            </ul>
            {closures.length > 0 && (
                <p className="mt-2 text-xs text-amber-800">
                    {closures.map((closure) => `ההזמנות אצל ${closure.businessName} נסגרו ב${formatClosedAt(closure.closedAt)}`).join(' · ')}
                </p>
            )}
        </div>
    );
};

export default LeftOutItemsNotice;
