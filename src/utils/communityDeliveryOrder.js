export function normalizeDeliveryGroup(value) {
  return String(value || '').trim();
}

export function groupKeyForCommunity(community) {
  const group = normalizeDeliveryGroup(community?.deliveryGroup);
  return group || `__ungrouped:${community?.name || ''}`;
}

export function compareCommunitiesForDelivery(list) {
  const groupRank = new Map();
  (list || []).forEach((community) => {
    const key = groupKeyForCommunity(community);
    const sortOrder = Number(community?.sortOrder) || 0;
    if (!groupRank.has(key) || sortOrder < groupRank.get(key)) {
      groupRank.set(key, sortOrder);
    }
  });

  return (a, b) => {
    const rankA = groupRank.get(groupKeyForCommunity(a)) ?? Number.MAX_SAFE_INTEGER;
    const rankB = groupRank.get(groupKeyForCommunity(b)) ?? Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;
    const sortA = Number(a?.sortOrder) || 0;
    const sortB = Number(b?.sortOrder) || 0;
    if (sortA !== sortB) return sortA - sortB;
    return String(a?.name || '').localeCompare(String(b?.name || ''), 'he');
  };
}

export function sortCommunitiesForDelivery(list) {
  const items = Array.isArray(list) ? [...list] : [];
  items.sort(compareCommunitiesForDelivery(items));
  return items;
}

export function buildDeliveryBlocks(communities) {
  const blocks = [];
  (communities || []).forEach((community) => {
    const group = normalizeDeliveryGroup(community?.deliveryGroup);
    const last = blocks[blocks.length - 1];
    if (group && last && last.group === group) {
      last.communities.push(community);
      return;
    }
    blocks.push({ group, communities: [community] });
  });
  return blocks;
}

export function moveDeliveryBlock(communities, blockIndex, direction) {
  const blocks = buildDeliveryBlocks(communities);
  const nextIndex = blockIndex + direction;
  if (nextIndex < 0 || nextIndex >= blocks.length) return communities;
  const nextBlocks = [...blocks];
  [nextBlocks[blockIndex], nextBlocks[nextIndex]] = [nextBlocks[nextIndex], nextBlocks[blockIndex]];
  return nextBlocks.flatMap((block) => block.communities);
}

export function moveCommunityInGroup(communities, name, direction) {
  const items = Array.isArray(communities) ? communities : [];
  const index = items.findIndex((community) => community.name === name);
  if (index < 0) return items;
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const current = items[index];
  const neighbor = items[nextIndex];
  if (normalizeDeliveryGroup(current.deliveryGroup) !== normalizeDeliveryGroup(neighbor.deliveryGroup)) {
    return items;
  }
  const next = [...items];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

export function assignCommunityDeliveryGroup(communities, name, group) {
  const items = Array.isArray(communities) ? communities : [];
  const current = items.find((community) => community.name === name);
  if (!current) return items;
  const updated = { ...current, deliveryGroup: normalizeDeliveryGroup(group) };
  const without = items.filter((community) => community.name !== name);
  const target = updated.deliveryGroup;
  if (!target) {
    const originalIndex = items.findIndex((community) => community.name === name);
    without.splice(Math.min(originalIndex, without.length), 0, updated);
    return without;
  }
  const lastInGroup = without.reduce((acc, community, index) => (
    normalizeDeliveryGroup(community.deliveryGroup) === target ? index : acc
  ), -1);
  if (lastInGroup === -1) {
    without.push(updated);
    return without;
  }
  without.splice(lastInGroup + 1, 0, updated);
  return without;
}

export function renameDeliveryGroup(communities, fromGroup, toGroup) {
  const prevName = normalizeDeliveryGroup(fromGroup);
  const nextName = normalizeDeliveryGroup(toGroup);
  if (!prevName || !nextName || prevName === nextName) return communities;
  return (communities || []).map((community) => (
    normalizeDeliveryGroup(community.deliveryGroup) === prevName
      ? { ...community, deliveryGroup: nextName }
      : community
  ));
}

export function buildCommunityOrderingEntries(communities) {
  return (communities || []).map((community, index) => ({
    name: community.name,
    sortOrder: (index + 1) * 10,
    deliveryGroup: normalizeDeliveryGroup(community.deliveryGroup),
  }));
}
