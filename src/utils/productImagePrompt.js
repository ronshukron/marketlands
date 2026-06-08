/**
 * Builds an AI image-generation prompt for a batch of grocery product photos.
 */
export const buildProductImagePrompt = (products = [], { includeDescription = true, includeOptions = true } = {}) => {
  const count = products.length;
  const itemLines = products.map((product, index) => {
    const name = (product.name || 'מוצר ללא שם').trim();
    const parts = [name];

    if (includeDescription) {
      const desc = (product.description || '').trim();
      if (desc) parts.push(desc);
    }

    if (includeOptions && Array.isArray(product.options) && product.options.length > 0) {
      parts.push(`אופציות: ${product.options.join(', ')}`);
    }

    const line = parts.length > 1 ? `${parts[0]} — ${parts.slice(1).join(' — ')}` : parts[0];
    return `${index + 1}. ${line}`;
  });

  return [
    `Create ${count} separate images in the same visual style.`,
    '',
    'Style: professional food photography, soft natural daylight, high detail, appetizing colors, shallow depth of field',
    'Background: clean white surface or light rustic wood cutting board',
    'Aspect ratio: square',
    'Theme: fresh farm produce product photos for an online grocery store catalog',
    '',
    ...itemLines,
  ].join('\n');
};
