import { doc, writeBatch } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { db } from '../../../../firebase/firebase';
import { resolveCommunityName } from '../../../../services/pickupSpotsService';

/**
 * Writes only `deliveryGroup` on communities/{name} (same field CommunityAdmin
 * edits). The syncCommunitiesCatalog function republishes the catalog, so every
 * open V7/V8 station picks the new grouping up through subscribePickupSpots.
 */
export async function saveDeliveryGroupForCommunitiesV8(communityNames = [], group = '') {
  const deliveryGroup = String(group || '').trim();
  const names = [...new Set(
    (communityNames || [])
      .map((name) => resolveCommunityName(name) || name)
      .map((name) => String(name || '').trim())
      .filter(Boolean),
  )];
  if (names.length === 0) return 0;
  const batch = writeBatch(db);
  const updatedAt = new Date().toISOString();
  names.forEach((name) => {
    batch.set(doc(db, 'communities', name), { deliveryGroup, updatedAt }, { merge: true });
  });
  await batch.commit();
  return names.length;
}

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

export async function promptSaveDeliveryGroupV8({ communities = [], existingGroups = [], t8 }) {
  if (communities.length === 0) return null;
  const suggestions = existingGroups.length > 0
    ? `<div style="font-size:12px;color:#6b7280;margin-top:6px">${escapeHtml(t8.existingGroups)}: ${existingGroups.map(escapeHtml).join(' · ')}</div>`
    : '';
  const result = await Swal.fire({
    title: t8.saveAsGroupTitle,
    html: `<div style="font-size:14px">${communities.map(escapeHtml).join(' · ')}</div>${suggestions}`,
    input: 'text',
    inputPlaceholder: t8.saveAsGroupPlaceholder,
    showCancelButton: true,
    confirmButtonText: t8.save,
    cancelButtonText: t8.cancel,
    inputValidator: (value) => (String(value || '').trim() ? undefined : t8.saveAsGroupRequired),
  });
  const group = String(result.value || '').trim();
  if (!result.isConfirmed || !group) return null;
  await saveDeliveryGroupForCommunitiesV8(communities, group);
  return group;
}

export async function confirmClearDeliveryGroupV8({ group, communities = [], t8 }) {
  const result = await Swal.fire({
    title: t8.ungroupTitle(group),
    text: communities.join(' · '),
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: t8.ungroup,
    cancelButtonText: t8.cancel,
  });
  if (!result.isConfirmed) return false;
  await saveDeliveryGroupForCommunitiesV8(communities, '');
  return true;
}
