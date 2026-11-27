// Product types for the store's "לפי סוג" category ("all the cucumbers
// together"): every product, in one section per type. A product's type is its
// `productType` field when the farmer chose one, otherwise detected from its
// name (utils/categoryStoreUtils.js resolveProductType).
//
// Seeded on 2026-11-26 from the names of the 674 products in Products. Order
// matters inside a category: the first type with a keyword that appears as a
// whole word in the name wins, so specific types come before general ones
// (sweet potato before potato; leafy greens before herbs).
//
// Each entry: name (stored in Products.productType), plural (shown on chips
// and headings), category (store category), keywords (whole words or phrases),
// sortOrder (order in the store).

export const PRODUCT_TYPE_NONE = 'none';

const VEGETABLES = 'ירקות';
const FRUITS = 'פירות';
const GREENS = 'ירוקים ופטריות';

export const PRODUCT_TYPES = [
  // ירקות
  { name: 'עגבנייה', plural: 'עגבניות', category: VEGETABLES, keywords: ['עגבניה', 'עגבנייה', 'עגבניות', 'עגבניית', 'שרי'] },
  { name: 'מלפפון', plural: 'מלפפונים', category: VEGETABLES, keywords: ['מלפפון', 'מלפפונים'] },
  { name: 'פלפל', plural: 'פלפלים', category: VEGETABLES, keywords: ['פלפל', 'פלפלים', 'שושקה', "צ'ילי"] },
  { name: 'חציל', plural: 'חצילים', category: VEGETABLES, keywords: ['חציל', 'חצילים'] },
  { name: 'קישוא', plural: 'קישואים', category: VEGETABLES, keywords: ['קישוא', 'קישואים', 'זוקיני'] },
  { name: 'דלעת', plural: 'דלעות', category: VEGETABLES, keywords: ['דלעת', 'דלעות', 'דלורית'] },
  { name: 'תירס', plural: 'תירס', category: VEGETABLES, keywords: ['תירס'] },
  { name: 'בטטה', plural: 'בטטות', category: VEGETABLES, keywords: ['בטטה', 'בטטות'] },
  { name: 'תפוח אדמה', plural: 'תפוחי אדמה', category: VEGETABLES, keywords: ['תפוח אדמה', 'תפוחי אדמה', 'תפוא', 'תפוח'] },
  { name: 'בצל', plural: 'בצלים', category: VEGETABLES, keywords: ['בצל', 'בצלים', 'בצלי', 'שאלוט'] },
  { name: 'שום', plural: 'שום', category: VEGETABLES, keywords: ['שום'] },
  { name: 'כרישה', plural: 'כרישה', category: VEGETABLES, keywords: ['כרישה', 'כרישות'] },
  { name: 'גזר', plural: 'גזר', category: VEGETABLES, keywords: ['גזר'] },
  { name: 'סלק', plural: 'סלק', category: VEGETABLES, keywords: ['סלק'] },
  { name: 'כרוב', plural: 'כרוב וכרובית', category: VEGETABLES, keywords: ['כרוב', 'כרובית'] },
  { name: 'ברוקולי', plural: 'ברוקולי', category: VEGETABLES, keywords: ['ברוקולי', 'ברוקלי'] },
  { name: 'קולורבי', plural: 'קולורבי', category: VEGETABLES, keywords: ['קולורבי'] },
  { name: 'סלרי', plural: 'סלרי', category: VEGETABLES, keywords: ['סלרי'] },
  { name: 'שעועית', plural: 'שעועית ואפונה', category: VEGETABLES, keywords: ['שעועית', 'אפונה', 'אפונת', 'פול'] },
  { name: 'צנון', plural: 'צנון ולפת', category: VEGETABLES, keywords: ['צנון', 'צנונית', 'צנוניות', 'לפת', 'דאיקון'] },
  { name: 'ארטישוק', plural: 'ארטישוק', category: VEGETABLES, keywords: ['ארטישוק'] },
  { name: 'שומר', plural: 'שומר', category: VEGETABLES, keywords: ['שומר'] },

  // ירוקים ופטריות
  { name: 'חסה', plural: 'חסות', category: GREENS, keywords: ['חסה', 'חסות'] },
  { name: 'פטריות', plural: 'פטריות', category: GREENS, keywords: ['פטריות', 'פטריה', 'פטרייה', 'פורטובלו', 'פורטבלה', 'פורטובלה', 'שמפיניון', 'שמפניון'] },
  { name: 'עלים ירוקים', plural: 'עלים ירוקים', category: GREENS, keywords: ['תרד', 'רוקט', 'מנגולד', 'קייל', 'עלי', 'עליי', 'אנדיב'] },
  { name: 'באק צ\'וי', plural: 'כרוב סיני ובאק צ\'וי', category: GREENS, keywords: ['באק', 'סיני'] },
  { name: 'עלי תבלין', plural: 'עלי תבלין', category: GREENS, keywords: ['פטרוזיליה', 'שמיר', 'כוסברה', 'נענע', 'בזיל', 'בזיליקום', 'רוזמרין', 'טימין', 'תימין', 'אורגנו', 'עירית', 'לואיזה', 'מליסה', 'שיבה', 'מרווה', 'זעתר'] },
  { name: 'בצל ירוק', plural: 'בצל ירוק', category: GREENS, keywords: ['בצל'] },
  { name: 'סלרי עלים', plural: 'סלרי', category: GREENS, keywords: ['סלרי'] },
  { name: 'נבטים', plural: 'נבטים', category: GREENS, keywords: ['נבטים', 'נבטי'] },

  // פירות
  { name: 'תפוח', plural: 'תפוחים', category: FRUITS, keywords: ['תפוח', 'תפוחים', 'תפוחי', 'פינק ליידי'] },
  { name: 'אגס', plural: 'אגסים', category: FRUITS, keywords: ['אגס', 'אגסים'] },
  { name: 'הדרים', plural: 'הדרים', category: FRUITS, keywords: ['תפוז', 'תפוזים', 'קלמנטינה', 'קלמנטינות', 'מנדרינה', 'לימון', 'לימונים', 'ליים', 'אשכולית', 'פומלית', 'פומלה', 'פומלות'] },
  { name: 'בננה', plural: 'בננות', category: FRUITS, keywords: ['בננה', 'בננות'] },
  { name: 'ענבים', plural: 'ענבים', category: FRUITS, keywords: ['ענבים', 'ענב'] },
  { name: 'תות שדה', plural: 'תותים', category: FRUITS, keywords: ['תות', 'תותים'] },
  { name: 'פירות יער', plural: 'פירות יער', category: FRUITS, keywords: ['פטל', 'אוכמניות', 'אוכמניו', 'פיזליס', 'גולדן ברי'] },
  { name: 'אבוקדו', plural: 'אבוקדו', category: FRUITS, keywords: ['אבוקדו'] },
  { name: 'מנגו', plural: 'מנגו', category: FRUITS, keywords: ['מנגו'] },
  { name: 'מלון', plural: 'מלונים ואבטיחים', category: FRUITS, keywords: ['מלון', 'מלונים', 'אבטיח', 'אבטיחים'] },
  { name: 'שזיף', plural: 'שזיפים', category: FRUITS, keywords: ['שזיף', 'שזיפים'] },
  { name: 'אפרסק', plural: 'אפרסקים ונקטרינות', category: FRUITS, keywords: ['אפרסק', 'אפרסקים', 'נקטרינה', 'נקטרינות', 'משמש'] },
  { name: 'דובדבן', plural: 'דובדבנים', category: FRUITS, keywords: ['דובדבן', 'דובדבנים'] },
  { name: 'רימון', plural: 'רימונים', category: FRUITS, keywords: ['רימון', 'רימונים'] },
  { name: 'תמר', plural: 'תמרים', category: FRUITS, keywords: ['תמר', 'תמרים'] },
  { name: 'קיווי', plural: 'קיווי', category: FRUITS, keywords: ['קיווי'] },
  { name: 'אפרסמון', plural: 'אפרסמון', category: FRUITS, keywords: ['אפרסמון'] },
  { name: 'תאנה', plural: 'תאנים', category: FRUITS, keywords: ['תאנים', 'תאנה'] },
  { name: 'פירות טרופיים', plural: 'פירות טרופיים', category: FRUITS, keywords: ['אננס', 'פסיפלורה', 'גויאבה', 'אנונה', "ליצ'י", 'ליצי', 'קרמבולה', 'פיטאיה', 'פגויה', 'קוקוס', 'סברס'] },
].map((type, index) => ({ ...type, sortOrder: index + 1 }));

/** Types of one store category, in store order. */
export const productTypesForCategory = (category) => PRODUCT_TYPES.filter((type) => type.category === category);

export const findProductTypeByName = (name) => PRODUCT_TYPES.find((type) => type.name === name) || null;
