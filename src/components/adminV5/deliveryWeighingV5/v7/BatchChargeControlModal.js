import React from 'react';
import { formatBatchChargeIls, getOrderDisplayName } from './batchCommunityChargeV7';

export default function BatchChargeControlModal({
  open,
  t,
  isRTL,
  communities = [],
  selectedCommunityNames = [],
  onToggleCommunity,
  onSelectAllCommunities,
  onClearCommunities,
  plans = [],
  excludedOrderIds,
  onToggleOrderIncluded,
  onIncludeAllReady,
  onExcludeAllReady,
  onIncludeCommunityReady,
  onExcludeCommunityReady,
  discountByCommunity = {},
  discountLoading = false,
  orderPreviews = {},
  skipReasonLabel,
  getCommunityColor,
  readyCount = 0,
  excludedReadyCount = 0,
  skippedCount = 0,
  completedCount = 0,
  previewTotal = 0,
  previewDiscount = 0,
  confirmDisabled = false,
  onConfirm,
  onClose,
  getOpenRefundsForOrder,
}) {
  const [confirmCountdown, setConfirmCountdown] = React.useState(0);
  const selectedKey = selectedCommunityNames.slice().sort().join('|');

  React.useEffect(() => {
    if (!open) {
      setConfirmCountdown(0);
      return undefined;
    }
    setConfirmCountdown(2000);
    const interval = setInterval(() => {
      setConfirmCountdown((prev) => {
        if (prev <= 1000) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [open, selectedKey, readyCount]);

  if (!open) return null;

  const excludedSet = excludedOrderIds instanceof Set
    ? excludedOrderIds
    : new Set([...(excludedOrderIds || [])].map(String));
  const confirmLocked = confirmCountdown > 0 || confirmDisabled || readyCount <= 0;
  const refundOrderCount = plans.reduce((count, plan) => (
    count + (plan.ready || []).filter((entry) => (getOpenRefundsForOrder?.(entry.order) || []).length > 0).length
  ), 0);
  const confirmSeconds = Math.ceil(confirmCountdown / 1000);

  return (
    <div className="fixed inset-0 z-[180] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-charge-title"
        className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:w-11/12 max-w-3xl max-h-[90vh] flex flex-col"
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-200">
          <h3 id="batch-charge-title" className="text-xl font-bold text-gray-800">
            {t.batchChargeModalTitle}
            <span className="block text-sm font-normal text-gray-500 mt-0.5">
              {t.batchChargeModalHint}
            </span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] text-2xl text-gray-400 hover:text-gray-700 leading-none"
            aria-label={t.cancel}
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold text-gray-700">{t.batchChargePickCommunities}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onSelectAllCommunities}
                className="min-h-[36px] px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200"
              >
                {t.selectAll}
              </button>
              <button
                type="button"
                onClick={onClearCommunities}
                className="min-h-[36px] px-3 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700 hover:bg-gray-300"
              >
                {t.clearSel}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {communities.map((community) => {
              const selected = selectedCommunityNames.includes(community);
              const discountInfo = discountByCommunity[community];
              const percent = Number(discountInfo?.discountPercent) || 0;
              return (
                <label
                  key={community}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-colors ${
                    selected
                      ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleCommunity(community)}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span
                    className="inline-block w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: getCommunityColor?.(community) || '#94a3b8' }}
                  />
                  <span className="font-bold">{community}</span>
                  <span className="text-[11px] opacity-80">
                    {discountLoading && !discountInfo
                      ? '…'
                      : percent > 0
                        ? t.batchChargeDiscountPct(percent)
                        : t.batchChargeDiscountNone}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {refundOrderCount > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
              ⚠ {t.refundChargeWarning} ({refundOrderCount}) — {t.refundChargeCheckAdmin}
            </div>
          )}
          {plans.length === 0 && (
            <div className="text-sm text-gray-500 text-center py-8">{t.batchChargePickCommunities}</div>
          )}
          {plans.map((plan) => {
            const percent = Number(discountByCommunity[plan.communityName]?.discountPercent) || 0;
            const communityReady = plan.ready || [];
            const communitySkipped = plan.skipped || [];
            return (
              <section key={plan.communityName} className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-gray-900">
                    {plan.communityName}
                    <span className="block text-xs font-semibold text-gray-500">
                      {percent > 0 ? t.batchChargeDiscountPct(percent) : t.batchChargeDiscountNone}
                      {' · '}
                      {t.batchChargeCompletedCount(plan.alreadyCompleted?.length || 0)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onIncludeCommunityReady(plan.communityName)}
                      className="min-h-[36px] px-3 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                    >
                      {t.batchChargeSelectAllOrders}
                    </button>
                    <button
                      type="button"
                      onClick={() => onExcludeCommunityReady(plan.communityName)}
                      className="min-h-[36px] px-3 py-1 rounded-lg text-xs font-bold bg-gray-200 text-gray-700 hover:bg-gray-300"
                    >
                      {t.batchChargeClearOrders}
                    </button>
                  </div>
                </div>
                <div className="divide-y">
                  {communityReady.map((entry) => {
                    const orderId = entry.order.id;
                    const included = !excludedSet.has(orderId);
                    const preview = orderPreviews[orderId];
                    const refunds = getOpenRefundsForOrder?.(entry.order) || [];
                    return (
                      <label
                        key={orderId}
                        className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer ${
                          included ? 'bg-white' : 'bg-amber-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={included}
                          onChange={() => onToggleOrderIncluded(orderId)}
                          className="mt-1 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-gray-900">{getOrderDisplayName(entry.order)}</div>
                          <div className="text-xs text-gray-500">
                            {included
                              ? (preview
                                ? `₪${formatBatchChargeIls(preview.finalSum)}`
                                : t.stWeighed)
                              : t.batchChargeExcludedBadge}
                          </div>
                          {refunds.length > 0 && (
                            <div className="mt-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 inline-block">
                              ⚠ {t.refundChargeWarning} ({refunds.length})
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                  {communitySkipped.map((entry) => (
                    <div key={entry.order.id} className="flex items-start gap-3 px-3 py-2.5 bg-gray-50 text-gray-500">
                      <div className="mt-1 w-4" />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{getOrderDisplayName(entry.order)}</div>
                        <div className="text-xs">{skipReasonLabel(entry.reason)}</div>
                      </div>
                    </div>
                  ))}
                  {communityReady.length === 0 && communitySkipped.length === 0 && (
                    <div className="px-3 py-3 text-sm text-gray-400">{t.batchChargeNoReadySelected}</div>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <div className="px-5 py-4 border-t bg-white space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="font-bold text-gray-800">
              {t.batchChargePreviewCharge}: ₪{formatBatchChargeIls(previewTotal)}
              {previewDiscount > 0 && (
                <span className="inline-block px-2 font-semibold text-emerald-700">
                  {t.batchChargePreviewDiscount}: ₪{formatBatchChargeIls(previewDiscount)}
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500">
              {t.stWeighed}: {readyCount}
              {' · '}
              {t.batchChargeExcludedBadge}: {excludedReadyCount}
              {' · '}
              {t.batchChargeSkippedSection}: {skippedCount}
              {' · '}
              {t.batchChargeCompletedCount(completedCount)}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onIncludeAllReady}
              className="min-h-[44px] px-4 py-2 rounded-lg text-sm font-bold bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            >
              {t.batchChargeSelectAllOrders}
            </button>
            <button
              type="button"
              onClick={onExcludeAllReady}
              className="min-h-[44px] px-4 py-2 rounded-lg text-sm font-bold bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              {t.batchChargeClearOrders}
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-lg text-sm font-bold bg-gray-200 text-gray-700 hover:bg-gray-300"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirmLocked}
              className="min-h-[44px] px-5 py-2 rounded-lg text-sm font-bold bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {confirmCountdown > 0
                ? t.confirmWait(confirmSeconds)
                : t.batchChargeRun(readyCount)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
