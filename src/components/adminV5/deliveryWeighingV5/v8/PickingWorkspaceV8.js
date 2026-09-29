import React, { useEffect, useRef, useState } from 'react';
import { PICK_STATUS } from './itemPickingV8';
import { V8_VIEWS } from './localStorageV8';

const WEIGHT_ON_THRESHOLD = 0.020;
const WEIGHT_OFF_THRESHOLD = 0.010;

function fmtKg(value) {
  return Number(value || 0).toFixed(3);
}

export function formatPickQuantity({ measurementType, quantity, averageWeightKg }, t8) {
  const q = Number(quantity || 0);
  if (measurementType === 'package') return `${Math.floor(q)} ${t8.pkgLbl}`;
  if (measurementType === 'unit') {
    return `${Math.floor(q)} ${t8.unitLbl} (~${fmtKg(q * (Number(averageWeightKg) || 1))} ${t8.kg})`;
  }
  return `${fmtKg(q)} ${t8.kg}`;
}

export function formatPickedQuantity(measurementType, actual, t8) {
  if (measurementType === 'package') return `${Math.floor(Number(actual || 0))} ${t8.pkgLbl}`;
  return `${fmtKg(actual)} ${t8.kg}`;
}

// Only trust a live stable reading; a stale "last stable" value from the
// previous box must never be saved into the next one.
function getLiveStableWeight(liveWeight, lastStableWeight) {
  if (liveWeight?.value != null) {
    return liveWeight.stable && liveWeight.value > WEIGHT_ON_THRESHOLD ? liveWeight.value : 0;
  }
  return lastStableWeight?.value > WEIGHT_ON_THRESHOLD ? lastStableWeight.value : 0;
}

function itemName(entity, lang) {
  return (lang === 'th' && entity?.thaiName) ? entity.thaiName : (entity?.productName || entity?.name || '');
}

function itemSecondaryName(entity, lang) {
  return (lang === 'th' && entity?.thaiName) ? entity.productName : entity?.thaiName;
}

export function V8ViewTabs({ view, onChange, t8, counts = {} }) {
  const tabs = [
    { id: V8_VIEWS.boxes, num: 1, label: t8.stepBoxes, hint: t8.stepBoxesHint, badge: counts.boxes },
    { id: V8_VIEWS.items, num: 2, label: t8.stepItems, hint: t8.stepItemsHint, badge: counts.items },
    { id: V8_VIEWS.orders, num: 3, label: t8.stepOrders, hint: t8.stepOrdersHint },
  ];
  return (
    <div className="bg-white border-b px-4 py-2">
      <div className="max-w-[1600px] mx-auto flex flex-wrap gap-2" role="tablist">
        {tabs.map((tab) => {
          const active = view === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.id)}
              className={`min-h-[52px] flex items-center gap-3 px-4 py-2 rounded-xl border-2 font-bold transition-colors ${
                active
                  ? 'bg-indigo-600 border-indigo-700 text-white shadow'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black ${
                active ? 'bg-white text-indigo-700' : 'bg-gray-100 text-gray-600'
              }`}
              >
                {tab.num}
              </span>
              <span className="text-start leading-tight">
                <span className="block text-sm font-black">{tab.label}</span>
                <span className={`block text-[11px] font-semibold ${active ? 'text-indigo-100' : 'text-gray-500'}`}>{tab.hint}</span>
              </span>
              {tab.badge ? (
                <span className={`text-xs font-black rounded-full px-2 py-0.5 ${active ? 'bg-white/25' : 'bg-gray-100'}`}>{tab.badge}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BoxBadge({ info, size = 'md' }) {
  const dims = size === 'xl' ? 'w-24 h-24 text-5xl' : size === 'lg' ? 'w-14 h-14 text-2xl' : 'w-11 h-11 text-lg';
  return (
    <div className="relative shrink-0">
      <div
        className={`${dims} rounded-2xl bg-yellow-500 text-white font-black flex items-center justify-center shadow border-4`}
        style={{ borderColor: info.color }}
      >
        {info.customerNumber}
      </div>
      {info.communityNumber ? (
        <span className="absolute -bottom-1.5 -left-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center border-2 border-white">
          #{info.communityNumber}
        </span>
      ) : null}
    </div>
  );
}

function sumProgress(names, communityProgress) {
  return names.reduce((acc, name) => ({
    picked: acc.picked + (communityProgress[name]?.picked || 0),
    total: acc.total + (communityProgress[name]?.total || 0),
  }), { picked: 0, total: 0 });
}

function ProgressBar({ picked, total, dark }) {
  const pct = total > 0 ? Math.round((picked / total) * 100) : 0;
  return (
    <span className={`block h-1.5 rounded-full overflow-hidden mt-1 ${dark ? 'bg-white/25' : 'bg-gray-200'}`}>
      <span className={`block h-full ${picked >= total && total > 0 ? 'bg-green-500' : dark ? 'bg-white' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

function ScopeBar({
  t8,
  scopeBlocks,
  scopeCommunities,
  allCommunities,
  onSelectCommunities,
  onToggleCommunity,
  communityProgress,
  getCommunityColor,
  getCommunityGroup,
  isAdmin,
  onSaveScopeAsGroup,
  onClearGroup,
  savingGroup,
}) {
  const selected = new Set(scopeCommunities);
  const sameSet = (names) => names.length === selected.size && names.every((name) => selected.has(name));
  const groupBlocks = scopeBlocks.filter((block) => block.group);
  const matchingGroup = groupBlocks.find((block) => sameSet(block.communities)) || null;
  const activeGroupIndex = matchingGroup ? groupBlocks.findIndex((block) => block.key === matchingGroup.key) : -1;
  const nextDeliveryNo = activeGroupIndex >= 0 && activeGroupIndex < groupBlocks.length - 1
    ? activeGroupIndex + 2
    : null;
  const deliveryNoByGroup = new Map(groupBlocks.map((block, index) => [block.group, index + 1]));
  const scopeProgress = sumProgress(scopeCommunities, communityProgress);

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="max-w-3xl">
          <div className="text-lg font-black text-gray-900">{t8.scopeTitle}</div>
          <div className="mt-1 text-sm font-semibold text-gray-700 leading-snug">{t8.scopeHint}</div>
        </div>
        <div className="text-xs font-bold text-gray-600 bg-gray-100 rounded-full px-3 py-1">
          {t8.scopeCommunitiesCount(scopeCommunities.length)} · {t8.scopeOrdersCount(scopeProgress.total)} · {t8.pickedOrders(scopeProgress.picked, scopeProgress.total)}
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-black text-gray-900">{t8.scopeGroupsLabel}</div>
        {groupBlocks.length === 0 ? (
          <div className="text-sm text-gray-600">{t8.noGroupsYet}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {groupBlocks.map((block, index) => {
              const deliveryNo = index + 1;
              const active = sameSet(block.communities);
              const progress = sumProgress(block.communities, communityProgress);
              const done = progress.total > 0 && progress.picked >= progress.total;
              return (
                <button
                  key={block.key}
                  type="button"
                  onClick={() => onSelectCommunities(block.communities)}
                  aria-pressed={active}
                  className={`min-h-[96px] px-3 py-3 rounded-2xl border-2 text-start transition-colors ${
                    active
                      ? 'bg-slate-800 border-slate-900 text-white shadow-md'
                      : done
                        ? 'bg-green-50 border-green-300 text-green-900'
                        : 'bg-white border-indigo-200 text-gray-900 hover:bg-indigo-50'
                  }`}
                >
                  <span className="flex items-start gap-3">
                    <span className={`w-16 h-16 shrink-0 rounded-2xl flex items-center justify-center text-3xl font-black ${
                      active ? 'bg-white text-slate-900' : done ? 'bg-green-600 text-white' : 'bg-indigo-600 text-white'
                    }`}
                    >
                      {deliveryNo}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-base font-black">{t8.deliveryNumber(deliveryNo)}</span>
                        <span className={`text-[11px] font-black rounded-full px-2 py-0.5 ${active ? 'bg-white/20' : 'bg-gray-100'}`}>
                          {done ? `✓ ${t8.groupDone}` : t8.pickedOrders(progress.picked, progress.total)}
                        </span>
                      </span>
                      <span className={`block text-sm font-bold mt-0.5 ${active ? 'text-slate-100' : 'text-gray-800'}`}>
                        {block.group}
                      </span>
                      <span className={`block text-xs font-semibold mt-0.5 ${active ? 'text-slate-300' : 'text-gray-500'}`}>
                        {block.communities.join(' · ')}
                      </span>
                      <span className={`block text-xs font-black mt-1 ${active ? 'text-amber-200' : 'text-indigo-700'}`}>
                        {active ? `✓ ${t8.deliveryNow}` : t8.deliveryPress(deliveryNo)}
                      </span>
                      <ProgressBar picked={progress.picked} total={progress.total} dark={active} />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {activeGroupIndex >= 0 && (
          <div className="rounded-xl border-2 border-indigo-300 bg-indigo-50 px-4 py-3 text-sm font-black text-indigo-950 leading-snug">
            <div>{t8.deliverySelected(activeGroupIndex + 1)}</div>
            {nextDeliveryNo && (
              <div className="mt-1 font-semibold">{t8.deliveryThenNext(nextDeliveryNo)}</div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2 pt-2 border-t border-dashed border-gray-200">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-xs font-black text-gray-500">{t8.scopeCommunitiesLabel}</div>
            <div className="text-xs font-semibold text-gray-400">{t8.scopeCommunitiesHint}</div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onSelectCommunities(allCommunities)}
              className="min-h-[36px] px-3 rounded-full text-xs font-bold bg-blue-100 text-blue-700 hover:bg-blue-200"
            >
              {t8.scopeAll}
            </button>
            <button
              type="button"
              onClick={() => onSelectCommunities([])}
              className="min-h-[36px] px-3 rounded-full text-xs font-bold bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              {t8.scopeClear}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {allCommunities.map((name) => {
            const active = selected.has(name);
            const progress = communityProgress[name] || { picked: 0, total: 0 };
            const done = progress.total > 0 && progress.picked >= progress.total;
            const group = getCommunityGroup(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => onToggleCommunity(name)}
                aria-pressed={active}
                className={`min-h-[48px] px-3 py-1.5 rounded-xl border-2 text-sm font-bold text-start transition-colors ${
                  active
                    ? 'bg-indigo-600 border-indigo-700 text-white shadow'
                    : done
                      ? 'bg-green-50 border-green-200 text-green-800'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-[11px] leading-none ${
                    active ? 'bg-white border-white text-indigo-700' : 'bg-white border-gray-300 text-transparent'
                  }`}
                  >
                    ✓
                  </span>
                  <span className="inline-block w-3.5 h-3.5 rounded-full" style={{ backgroundColor: getCommunityColor(name) }} />
                  <span>{name}</span>
                  <span className={`text-[11px] rounded-full px-1.5 ${active ? 'bg-white/20' : 'bg-gray-100'}`}>
                    {done ? '✓' : `${progress.picked}/${progress.total}`}
                  </span>
                </span>
                {group && (
                  <span className={`block text-[10px] font-semibold ${active ? 'text-indigo-100' : 'text-gray-400'}`}>
                    {t8.deliveryNumber(deliveryNoByGroup.get(group))} · {group}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {isAdmin && scopeCommunities.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
          {matchingGroup ? (
            <button
              type="button"
              onClick={() => onClearGroup(matchingGroup)}
              disabled={savingGroup}
              className="min-h-[40px] px-3 rounded-lg text-xs font-bold bg-white border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {t8.ungroup}: {matchingGroup.group}
            </button>
          ) : (
            <button
              type="button"
              onClick={onSaveScopeAsGroup}
              disabled={savingGroup}
              className="min-h-[44px] px-4 rounded-lg text-sm font-black bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50"
            >
              💾 {t8.saveAsGroup} ({scopeCommunities.length})
            </button>
          )}
          <a href="/admin/communities" target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-indigo-700 underline">
            {t8.manageGroups}
          </a>
        </div>
      )}
    </div>
  );
}

function BoxesStep({
  t8,
  orders,
  getBoxInfo,
  getOrderLock,
  printedCountByOrder,
  boxesReadyIds,
  onToggleBoxReady,
  onMarkAllReady,
  onClearReady,
  onPrintLabel,
  onPrintMissing,
  printAllProgress,
  isPrinting,
  hasPrinterSupport,
  printerHint,
  onStartPicking,
}) {
  const readyCount = orders.filter((order) => boxesReadyIds.has(order.id)).length;
  const missingLabels = orders.filter((order) => !(printedCountByOrder[order.id] > 0)).length;
  const printBusy = isPrinting || !!printAllProgress;
  let prevCommunity = '';

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-black text-gray-900">📦 {t8.boxesTitle}</div>
          <div className="text-xs text-gray-500">{t8.boxesHint}</div>
          <div className="mt-1 text-sm font-black text-emerald-700">{t8.boxesReadyCount(readyCount, orders.length)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasPrinterSupport ? (
            <button
              type="button"
              onClick={onPrintMissing}
              disabled={printBusy || missingLabels === 0}
              className="min-h-[48px] px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-black text-sm shadow disabled:opacity-50"
            >
              🏷️ {printAllProgress ? t8.printProgress(printAllProgress.current, printAllProgress.total) : t8.printMissing(missingLabels)}
            </button>
          ) : (
            <span className="self-center text-xs text-gray-500">{printerHint}</span>
          )}
          <button
            type="button"
            onClick={onMarkAllReady}
            className="min-h-[48px] px-4 py-2 rounded-xl bg-white border-2 border-emerald-300 text-emerald-800 font-bold text-sm hover:bg-emerald-50"
          >
            ✓ {t8.markAllReady}
          </button>
          {readyCount > 0 && (
            <button
              type="button"
              onClick={onClearReady}
              className="min-h-[48px] px-3 py-2 rounded-xl bg-white border text-gray-600 font-bold text-sm hover:bg-gray-50"
            >
              {t8.clearReady}
            </button>
          )}
          <button
            type="button"
            onClick={onStartPicking}
            className="min-h-[48px] px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-base shadow"
          >
            {t8.startPicking}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2">
        {orders.map((order) => {
          const info = getBoxInfo(order);
          const showHeader = info.community !== prevCommunity;
          prevCommunity = info.community;
          const ready = boxesReadyIds.has(order.id);
          const printed = printedCountByOrder[order.id] || 0;
          const lock = getOrderLock(order.id);
          const lines = Array.isArray(order.items) ? order.items.length : 0;
          return (
            <React.Fragment key={order.id}>
              {showHeader && (
                <div
                  className="col-span-full mt-2 px-3 py-2 rounded-lg text-white font-black shadow-sm"
                  style={{ backgroundColor: info.color }}
                >
                  {info.communityIndex >= 0 ? `${info.communityIndex + 1}. ` : ''}{info.community}
                </div>
              )}
              <div className={`rounded-xl border-2 p-3 flex items-center gap-3 ${ready ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-gray-200'}`}>
                <BoxBadge info={info} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="font-black text-gray-900 truncate">{info.name}</div>
                  <div className="text-xs text-gray-500 truncate">{info.community} · {t8.linesCount(lines)}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${printed > 0 ? 'bg-sky-100 text-sky-800' : 'bg-gray-100 text-gray-500'}`}>
                      🏷️ {printed > 0 ? t8.printedN(printed) : t8.notPrinted}
                    </span>
                    {info.wantsReusableCartons && (
                      <span className="text-[11px] font-black rounded-full px-2 py-0.5 bg-emerald-600 text-white">🌱 {t8.reusableCarton}</span>
                    )}
                    {lock && (
                      <span className="text-[11px] font-bold rounded-full px-2 py-0.5 bg-red-100 text-red-700">🔒 {lock.stationId}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  {hasPrinterSupport && (
                    <button
                      type="button"
                      onClick={() => onPrintLabel(order)}
                      disabled={printBusy}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-black disabled:opacity-50"
                    >
                      {t8.printOne}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onToggleBoxReady(order.id)}
                    aria-pressed={ready}
                    className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-black border-2 ${
                      ready ? 'bg-emerald-600 border-emerald-700 text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {ready ? `✓ ${t8.boxReady}` : t8.boxNotReady}
                  </button>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

const ORDER_CARD_CLASS = 'relative h-[320px] w-full rounded-xl border-2 overflow-hidden text-start flex flex-col';

function OrderPickCard({
  entry,
  active,
  t8,
  lang,
  group,
  info,
  lock,
  onSelectEntry,
  weighProps,
}) {
  const orderedLabel = formatPickQuantity({
    measurementType: entry.item.measurementType,
    quantity: entry.requested,
    averageWeightKg: entry.item.averageWeightKg,
  }, t8);
  const tone = entry.status === PICK_STATUS.removed
    ? 'border-red-200 bg-red-50 opacity-60'
    : active
      ? 'border-blue-500 bg-blue-50 shadow-lg ring-2 ring-blue-200'
      : entry.status === PICK_STATUS.done
        ? 'border-green-300 bg-green-50'
        : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow';

  const header = (
    <span className="flex items-center gap-3 p-3 shrink-0">
      <span className={`w-12 h-12 rounded-full font-black text-lg flex items-center justify-center shrink-0 ${
        entry.status === PICK_STATUS.done ? 'bg-green-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-yellow-500 text-white'
      }`}
      >
        {entry.status === PICK_STATUS.done ? '✓' : info.customerNumber}
      </span>
      <span className="min-w-0 flex-1">
        {active && <span className="block text-[11px] font-black text-gray-500">{t8.putInBox}</span>}
        <span className="block font-black text-gray-900 truncate">{info.name}</span>
        <span className="block text-xs font-bold truncate" style={{ color: info.color }}>{info.community}</span>
      </span>
      <span className="shrink-0 text-end">
        <span className="block text-[11px] font-bold text-amber-800">{t8.ordered}</span>
        <span className="block font-black text-gray-900">{orderedLabel}</span>
      </span>
    </span>
  );

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => onSelectEntry(entry.lineId)}
        className={`${ORDER_CARD_CLASS} ${tone}`}
      >
        {header}
        <span className="flex-1 flex items-center justify-center text-sm font-black text-gray-400">
          {entry.status === PICK_STATUS.done
            ? `✓ ${formatPickedQuantity(entry.item.measurementType, entry.actual, t8)}`
            : entry.status === PICK_STATUS.removed
              ? t8.missing
              : t8.pending}
        </span>
      </button>
    );
  }

  return (
    <div className={`${ORDER_CARD_CLASS} ${tone}`}>
      {header}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
        <WeighPanel
          {...weighProps}
          compact
          t8={t8}
          lang={lang}
          group={group}
          entry={entry}
          info={info}
          lock={lock}
        />
      </div>
    </div>
  );
}

function WeighPanel({
  t8,
  lang,
  group,
  entry,
  info,
  lock,
  savingActionKey,
  scaleConnected,
  liveWeight,
  lastStableWeight,
  onSaveWeight,
  onUseOrdered,
  onMarkMissing,
  onRestore,
  onReset,
  compact = false,
}) {
  const [manualValue, setManualValue] = useState('');
  const [scaleArmed, setScaleArmed] = useState(true);
  const inputRef = useRef(null);
  const isPackage = entry?.item?.measurementType === 'package';

  useEffect(() => {
    setManualValue('');
    if (inputRef.current) inputRef.current.focus();
  }, [entry?.lineId]);

  useEffect(() => {
    if (liveWeight?.value != null && liveWeight.value < WEIGHT_OFF_THRESHOLD) setScaleArmed(true);
  }, [liveWeight?.value]);

  if (!entry) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-400 font-bold">{t8.pickEntry}</div>
    );
  }

  const busy = savingActionKey === `pick:${entry.lineId}`;
  const disabled = busy || !!lock;
  const stableWeight = scaleConnected && !isPackage ? getLiveStableWeight(liveWeight, lastStableWeight) : 0;
  const canSaveScale = !disabled && scaleArmed && stableWeight > 0;
  const orderedLabel = formatPickQuantity({
    measurementType: entry.item.measurementType,
    quantity: entry.requested,
    averageWeightKg: entry.item.averageWeightKg,
  }, t8);

  const saveScale = async () => {
    if (!canSaveScale) return;
    setScaleArmed(false);
    const ok = await onSaveWeight(entry, stableWeight, 'scale');
    if (!ok) setScaleArmed(true);
  };

  const saveManual = (typedValue) => {
    if (disabled) return;
    const fromArg = (typeof typedValue === 'string' || typeof typedValue === 'number') ? String(typedValue) : '';
    const typed = (fromArg || manualValue || inputRef.current?.value || '').trim();
    if (typed) {
      onSaveWeight(entry, typed, 'manual');
      return;
    }
    saveScale();
  };

  return (
    <div className={compact ? 'h-full flex flex-col justify-end gap-2' : 'bg-white rounded-xl shadow-sm p-4 space-y-4 lg:sticky lg:top-4'}>
      {!compact && (
        <>
          <div className="flex items-center gap-4">
            <BoxBadge info={info} size="xl" />
            <div className="min-w-0">
              <div className="text-xs font-black text-gray-500">{t8.putInBox}</div>
              <div className="text-2xl font-black text-gray-900 truncate">{info.name}</div>
              <div className="text-sm font-bold truncate" style={{ color: info.color }}>{info.community}</div>
              {info.wantsReusableCartons && (
                <span className="inline-block mt-1 text-[11px] font-black rounded-full px-2 py-0.5 bg-emerald-600 text-white">🌱 {t8.reusableCarton}</span>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
            <div className="text-xs font-bold text-amber-700">{t8.ordered} · {itemName(group, lang)}</div>
            <div className="text-3xl font-black text-amber-950">{orderedLabel}</div>
          </div>
        </>
      )}

      {lock && (
        <div className="rounded-lg bg-red-50 text-red-700 font-bold text-sm px-3 py-2">🔒 {t8.busyElsewhere}: {lock.userName || lock.stationId}</div>
      )}

      {entry.status === PICK_STATUS.removed ? (
        <div className="space-y-2">
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xl font-black text-red-700">{t8.missing}</div>
          <button
            type="button"
            onClick={() => onRestore(entry)}
            disabled={disabled}
            className="w-full min-h-[52px] rounded-xl bg-green-600 hover:bg-green-700 text-white font-black disabled:opacity-50"
          >
            {t8.restore}
          </button>
        </div>
      ) : entry.status === PICK_STATUS.done ? (
        <div className="space-y-2">
          <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3">
            <div className="text-xs font-bold text-green-700">{t8.picked}</div>
            <div className="text-3xl font-black text-green-800">{formatPickedQuantity(entry.item.measurementType, entry.actual, t8)}</div>
          </div>
          <button
            type="button"
            onClick={() => onReset(entry)}
            disabled={disabled}
            className="w-full min-h-[48px] rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-700 font-black disabled:opacity-50"
          >
            {t8.reset}
          </button>
        </div>
      ) : (
        <div className={compact ? 'space-y-2' : 'space-y-3'}>
          {!isPackage && (
            scaleConnected ? (
              <div className="rounded-xl bg-blue-50 border border-blue-200 px-3 py-2 text-center">
                <div className="text-xs font-bold text-blue-600">{t8.liveWt}</div>
                <div className={`${compact ? 'text-2xl' : 'text-5xl'} font-black text-blue-800 tabular-nums`}>
                  {liveWeight?.value != null ? fmtKg(liveWeight.value) : '0.000'}
                  <span className="text-base font-bold ms-1">{t8.kg}</span>
                </div>
                {!scaleArmed && <div className="text-xs font-bold text-amber-700 mt-1">{t8.liftFromScale}</div>}
                {scaleArmed && !(stableWeight > 0) && <div className="text-xs text-gray-500 mt-1">{t8.placeOnScale}</div>}
              </div>
            ) : (
              <div className="rounded-lg bg-gray-100 text-gray-600 text-xs font-bold px-3 py-2">{t8.scaleOff}</div>
            )
          )}

          {!isPackage && scaleConnected && (
            <button
              type="button"
              onClick={saveScale}
              disabled={!canSaveScale}
              className={`w-full rounded-xl bg-green-600 hover:bg-green-700 text-white font-black shadow disabled:bg-gray-200 disabled:text-gray-400 ${compact ? 'min-h-[40px] text-sm' : 'min-h-[64px] text-xl'}`}
            >
              {!scaleArmed ? t8.liftFromScale : `${t8.saveFromScale}${stableWeight > 0 ? ` · ${fmtKg(stableWeight)}` : ''}`}
            </button>
          )}

          {isPackage ? (
            <button
              type="button"
              onClick={() => onUseOrdered(entry)}
              disabled={disabled}
              className={`w-full rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-black shadow disabled:opacity-50 ${compact ? 'min-h-[40px] text-sm' : 'min-h-[64px] text-xl'}`}
            >
              {t8.confirmPackage(Math.floor(entry.requested), t8.pkgLbl)}
            </button>
          ) : null}

          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveManual(e.currentTarget.value);
              }}
              inputMode={isPackage ? 'numeric' : 'decimal'}
              placeholder={isPackage ? '2' : '1.500'}
              disabled={disabled}
              className={`flex-1 border-2 border-blue-300 rounded-xl px-3 font-black focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${compact ? 'min-h-[40px] text-base' : 'min-h-[52px] text-xl'}`}
            />
            <button
              type="button"
              onClick={() => saveManual()}
              disabled={disabled || (!manualValue && !canSaveScale)}
              className="min-h-[52px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black disabled:opacity-50"
            >
              {t8.save}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {!isPackage && (
              <button
                type="button"
                onClick={() => onUseOrdered(entry)}
                disabled={disabled}
                className="min-h-[44px] px-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-sm disabled:opacity-50"
              >
                {t8.useOrdered}
              </button>
            )}
            <button
              type="button"
              onClick={() => onMarkMissing(entry)}
              disabled={disabled}
              className="min-h-[44px] px-4 rounded-xl bg-red-100 hover:bg-red-200 text-red-700 font-bold text-sm disabled:opacity-50"
            >
              {t8.markMissing}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemsStep({
  t8,
  lang,
  groups,
  summary,
  itemSortMode,
  onChangeItemSort,
  hideDoneItems,
  onToggleHideDone,
  activeGroup,
  onOpenGroup,
  onNextGroup,
  activeLineId,
  onSelectEntry,
  getBoxInfo,
  getOrderLock,
  cachedImg,
  weighProps,
}) {
  const sortModes = [
    ['business', t8.sortByBusiness],
    ['popular', t8.sortByPopular],
    ['name', t8.sortByName],
  ];
  let prevBusiness = '';

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <div className="lg:w-[340px] shrink-0">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden lg:sticky lg:top-4">
          <div className="px-4 py-3 border-b bg-gray-50 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-black text-gray-900">{t8.itemsList}</span>
              <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                {t8.itemsProgress(summary.doneItems, summary.items)}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {sortModes.map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onChangeItemSort(mode)}
                  className={`min-h-[40px] px-3 rounded-full text-xs font-black ${
                    itemSortMode === mode ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onToggleHideDone}
              className="text-xs font-bold text-gray-600 underline"
            >
              {hideDoneItems ? t8.showDone : t8.hideDone}
            </button>
          </div>
          <div className="divide-y max-h-[calc(100vh-280px)] overflow-y-auto">
            {groups.map((group) => {
              const active = activeGroup?.key === group.key;
              const showFarmer = itemSortMode === 'business' && group.businessName !== prevBusiness;
              prevBusiness = group.businessName || '';
              const secondary = itemSecondaryName(group, lang);
              return (
                <React.Fragment key={group.key}>
                  {showFarmer && (
                    <div className="sticky top-0 z-10 px-3 py-2 bg-slate-800 text-white text-sm font-black">
                      {group.businessName || t8.sortByBusiness}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenGroup(group.key)}
                    aria-pressed={active}
                    className={`w-full p-3 text-start transition-colors ${
                      group.isDone
                        ? 'bg-green-50 opacity-70'
                        : active
                          ? 'bg-blue-100 shadow-sm'
                          : 'bg-white hover:bg-gray-50'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span className={`w-10 h-10 rounded-full font-black text-sm flex items-center justify-center shrink-0 ${
                        group.isDone ? 'bg-green-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-yellow-500 text-white'
                      }`}
                      >
                        {group.isDone ? '✓' : group.activeCount}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block font-black text-sm truncate ${active ? 'text-blue-900' : 'text-gray-900'}`}>
                          {itemName(group, lang)}
                          {group.selectedOption ? ` · ${group.selectedOption}` : ''}
                        </span>
                        {secondary && <span className="block text-[11px] font-bold text-violet-700 truncate">{secondary}</span>}
                        {group.businessName && itemSortMode !== 'business' && (
                          <span className="block text-[11px] text-gray-500 truncate">{group.businessName}</span>
                        )}
                        <span className="block text-[11px] font-bold text-gray-500">
                          {group.doneCount}/{group.activeCount} · {t8.boxesCount(group.activeCount)}
                        </span>
                      </span>
                    </span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0 space-y-3">
        {!activeGroup ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-500 text-lg font-bold leading-snug">{t8.pickItem}</div>
        ) : (
          <>
            <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap items-center gap-3">
              <div className="w-14 h-14 rounded-lg bg-gray-50 border overflow-hidden shrink-0">
                {activeGroup.images?.[0] ? <img src={cachedImg(activeGroup.images[0])} alt="" className="w-full h-full object-contain" /> : null}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xl font-black text-gray-900 truncate">
                  {itemName(activeGroup, lang)}
                  {activeGroup.selectedOption ? <span className="text-amber-800"> · {activeGroup.selectedOption}</span> : null}
                </div>
                {itemSecondaryName(activeGroup, lang) && (
                  <div className="text-xs font-bold text-violet-700 truncate">{itemSecondaryName(activeGroup, lang)}</div>
                )}
                <div className="text-xs text-gray-500 truncate">{activeGroup.businessName}</div>
              </div>
              <div className="text-end">
                <div className="text-xs font-bold text-gray-500">{t8.totalToPick}</div>
                <div className="text-lg font-black text-gray-900">
                  {formatPickQuantity({ measurementType: activeGroup.measurementType, quantity: activeGroup.totalRequested, averageWeightKg: activeGroup.averageWeightKg }, t8)}
                </div>
                <div className="text-xs font-black text-indigo-700">{activeGroup.doneCount}/{activeGroup.activeCount}</div>
              </div>
              <button
                type="button"
                onClick={onNextGroup}
                className="min-h-[48px] px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black"
              >
                {t8.nextItem} →
              </button>
            </div>

            {activeGroup.isDone && (
              <div className="rounded-xl bg-green-600 text-white p-4 text-xl font-black shadow">
                ✓ {t8.itemDone}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {activeGroup.entries.map((entry) => (
                <OrderPickCard
                  key={entry.lineId}
                  entry={entry}
                  active={entry.lineId === activeLineId}
                  t8={t8}
                  lang={lang}
                  group={activeGroup}
                  info={getBoxInfo(entry.order)}
                  lock={getOrderLock(entry.orderId)}
                  onSelectEntry={onSelectEntry}
                  weighProps={weighProps}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PickingWorkspaceV8(props) {
  const {
    t8,
    view,
    hasOrdersLoaded,
    scopeBlocks,
    scopeCommunities,
    allCommunities,
    onSelectScopeCommunities,
    onToggleScopeCommunity,
    communityProgress,
    getCommunityColor,
    getCommunityGroup,
    onSaveScopeAsGroup,
    onClearGroup,
    savingGroup,
    scopeOrders,
    completedInScopeCount,
    isAdmin,
    pendingSyncCount = 0,
  } = props;

  return (
    <div className="max-w-[1600px] mx-auto p-4 space-y-3">
      {!hasOrdersLoaded ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400 text-lg">{t8.noOrdersLoaded}</div>
      ) : (
        <>
          <ScopeBar
            t8={t8}
            scopeBlocks={scopeBlocks}
            scopeCommunities={scopeCommunities}
            allCommunities={allCommunities}
            onSelectCommunities={onSelectScopeCommunities}
            onToggleCommunity={onToggleScopeCommunity}
            communityProgress={communityProgress}
            getCommunityColor={getCommunityColor}
            getCommunityGroup={getCommunityGroup}
            isAdmin={isAdmin}
            onSaveScopeAsGroup={onSaveScopeAsGroup}
            onClearGroup={onClearGroup}
            savingGroup={savingGroup}
          />
          {pendingSyncCount > 0 && (
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">
              ⏳ {t8.pendingSyncBeforeV7(pendingSyncCount)}
            </div>
          )}
          {props.summary?.items > 0 && props.summary.doneItems === props.summary.items && pendingSyncCount === 0 && (
            <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-900">
              ✓ {t8.readyForV7}
            </div>
          )}
          {completedInScopeCount > 0 && (
            <div className="text-xs text-gray-500">{t8.completedHidden(completedInScopeCount)}</div>
          )}
          {scopeCommunities.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-500 font-bold">{t8.noCommunitiesSelected}</div>
          ) : scopeOrders.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-500 font-bold">{t8.noOpenOrders}</div>
          ) : view === V8_VIEWS.boxes ? (
            <BoxesStep {...props} orders={scopeOrders} />
          ) : (
            <ItemsStep {...props} />
          )}
        </>
      )}
    </div>
  );
}
