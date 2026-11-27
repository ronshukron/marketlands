import React from 'react';
import { PRODUCT_TYPE_NONE, productTypesForCategory } from '../../constants/productTypes';
import { resolveProductType, toStoreCategory } from '../../utils/categoryStoreUtils';

// "סוג מוצר" (Products.productType): groups the product with the same kind in
// the store's "לפי סוג" category ("all the cucumbers together"). Empty = detected from the name
// (shown as the first option), a type name = the farmer's choice, "none" = no type.
// Only the types of the product's category are offered; nothing is shown for a
// category without types.

/** A chosen type that no longer fits the category falls back to automatic. */
export const productTypeForCategory = (productType, category) => {
  if (!productType || productType === PRODUCT_TYPE_NONE) return productType || '';
  return productTypesForCategory(toStoreCategory(category)).some((type) => type.name === productType) ? productType : '';
};

export default function ProductTypeSelect({
  id = 'productType', category, productName, value, onChange, compact = false,
}) {
  const types = productTypesForCategory(toStoreCategory(category));
  if (types.length === 0) {
    return compact ? <span className="text-xs text-gray-400">—</span> : null;
  }
  const detected = resolveProductType({ name: productName, category });
  const autoLabel = detected ? `לפי השם: ${detected.plural}` : 'לפי השם: לא זוהה';
  const select = (
    <select
      id={id}
      value={productTypeForCategory(value, category)}
      onChange={(event) => onChange(event.target.value)}
      aria-label={compact ? 'סוג מוצר' : undefined}
      className={compact
        ? 'w-32 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm'
        : 'w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'}
    >
      <option value="">{autoLabel}</option>
      {types.map((type) => <option key={type.name} value={type.name}>{type.plural}</option>)}
      <option value={PRODUCT_TYPE_NONE}>ללא סוג</option>
    </select>
  );
  if (compact) return select;
  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">סוג מוצר</label>
      {select}
      <p className="mt-1 text-xs text-gray-500">
        בקטגוריה "לפי סוג" בחנות, מוצרים מאותו סוג מוצגים יחד (למשל כל המלפפונים). אם הזיהוי לפי השם שגוי, בחרו את הסוג הנכון.
      </p>
    </div>
  );
}
