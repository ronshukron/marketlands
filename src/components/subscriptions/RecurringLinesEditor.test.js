import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import RecurringLinesEditor, { resetRecurringCatalogCache } from './RecurringLinesEditor';

jest.mock('../../services/basketSubscriptionService', () => ({
  describeSubscriptionError: () => 'הפעולה נכשלה',
}));

const CATALOG = [
  { productId: 'tomato', productName: 'עגבנייה', businessName: 'חוות השדה', price: 10, measurementType: 'kg', unitSize: 0.5, category: 'ירקות' },
  { productId: 'eggs', productName: 'ביצי חופש אורגניות', businessName: 'הלול', price: 30, measurementType: 'package', options: ['L', 'M'], isOrganic: true, category: 'ביצים', description: 'ביצים מתרנגולות חופש' },
  { productId: 'bokchoy', productName: 'באק צ\'וי', businessName: 'הבסטה', price: 12.9, measurementType: 'package', options: ['ללא אופציות'], category: 'ירקות' },
];

const Harness = ({ startLines = [], startInfo = {}, loadCatalog, onLines = () => {}, ...props }) => {
  const [lines, setLinesState] = useState(startLines);
  const [productInfo, setProductInfo] = useState(startInfo);
  const setLines = (update) => setLinesState((prev) => {
    const next = typeof update === 'function' ? update(prev) : update;
    onLines(next);
    return next;
  });
  return (
    <RecurringLinesEditor
      lines={lines}
      setLines={setLines}
      productInfo={productInfo}
      setProductInfo={setProductInfo}
      loadCatalog={loadCatalog || (() => Promise.resolve(CATALOG))}
      {...props}
    />
  );
};

// For tests that never open the list: the background load never finishes.
const neverLoads = () => new Promise(() => {});

// The list item that shows this text (Testing Library queries only).
const rowWith = (scope, text) => within(scope).getAllByRole('listitem').find((item) => within(item).queryByText(text));

const openPicker = () => fireEvent.click(screen.getByRole('button', { name: /הוספת מוצרים|בחירת מוצרים לסל/ }));

beforeEach(() => {
  resetRecurringCatalogCache();
  document.body.style.overflow = '';
});

test('changes quantities and removes lines; the full name is shown', () => {
  const onLines = jest.fn();
  render(<Harness
    startLines={[{ productId: 'cucumber', productName: 'מלפפון בייבי אורגני', quantity: 1, measurementType: 'kg', unitSize: 0.5, selectedOption: 'ללא אופציות' }]}
    onLines={onLines}
    loadCatalog={neverLoads}
  />);
  expect(screen.getByText('מלפפון בייבי אורגני')).not.toHaveClass('truncate');
  expect(screen.queryByText('ללא אופציות')).not.toBeInTheDocument();
  expect(screen.getByText('1 ק"ג')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('הוספת מלפפון בייבי אורגני'));
  expect(screen.getByText('1.5 ק"ג')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('הפחתת מלפפון בייבי אורגני'));
  fireEvent.click(screen.getByLabelText('הפחתת מלפפון בייבי אורגני'));
  expect(screen.getByText('0.5 ק"ג')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('הסרת מלפפון בייבי אורגני'));
  expect(screen.getByText('הסל ריק. הוסיפו לפחות מוצר אחד.')).toBeInTheDocument();
  expect(onLines).toHaveBeenLastCalledWith([]);
});

test('the product list loads before it is opened, and is reused for the same key', async () => {
  const loadCatalog = jest.fn(() => Promise.resolve(CATALOG));
  const { unmount } = render(<Harness loadCatalog={loadCatalog} catalogKey="subscription|s1" />);
  await waitFor(() => expect(loadCatalog).toHaveBeenCalledTimes(1));
  openPicker();
  expect(screen.getByRole('dialog', { name: 'הוספת מוצרים לסל' })).toBeInTheDocument();
  expect(await screen.findByText('עגבנייה')).toBeInTheDocument();
  expect(document.body.style.overflow).toBe('hidden');
  unmount();
  expect(document.body.style.overflow).toBe('');

  render(<Harness loadCatalog={loadCatalog} catalogKey="subscription|s1" />);
  openPicker();
  expect(await screen.findByText('עגבנייה')).toBeInTheDocument();
  expect(loadCatalog).toHaveBeenCalledTimes(1);
});

test('an empty basket offers a big button; products show price, organic badge and what is already in the basket', async () => {
  const onLines = jest.fn();
  render(<Harness onLines={onLines} emphasizeAdd emptyText="עוד לא בחרתם מוצרים." />);
  expect(screen.getByText('עוד לא בחרתם מוצרים.')).toBeInTheDocument();
  openPicker();
  const dialog = screen.getByRole('dialog');
  await within(dialog).findByText('ביצי חופש אורגניות');
  const eggsRow = rowWith(dialog, 'ביצי חופש אורגניות');
  expect(within(eggsRow).getByText('אורגני')).toBeInTheDocument();
  expect(within(eggsRow).getByText('₪30.00')).toBeInTheDocument();
  expect(within(eggsRow).getByText('ביצים מתרנגולות חופש')).toBeInTheDocument();

  // "ללא אופציות" is not a choice: no dropdown for that product.
  const bokchoyRow = rowWith(dialog, 'באק צ\'וי');
  expect(within(bokchoyRow).queryByRole('combobox')).not.toBeInTheDocument();

  fireEvent.change(within(eggsRow).getByLabelText('אפשרות עבור ביצי חופש אורגניות'), { target: { value: 'M' } });
  fireEvent.click(within(eggsRow).getByRole('button', { name: 'הוספה' }));
  fireEvent.click(within(bokchoyRow).getByRole('button', { name: 'הוספה' }));
  expect(onLines).toHaveBeenLastCalledWith([
    expect.objectContaining({ productId: 'eggs', selectedOption: 'M', quantity: 1 }),
    expect.objectContaining({ productId: 'bokchoy', selectedOption: '', quantity: 1 }),
  ]);
  expect(within(eggsRow).getByText('בסל: 1 מארז')).toBeInTheDocument();
  expect(within(eggsRow).getByRole('button', { name: 'עוד' })).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'סיום · 2 מוצרים בסל' })).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('button', { name: 'ירקות' }));
  expect(within(dialog).queryByText('ביצי חופש אורגניות')).not.toBeInTheDocument();
  expect(within(dialog).getByText('עגבנייה')).toBeInTheDocument();
  fireEvent.change(within(dialog).getByPlaceholderText('חיפוש מוצר או חקלאי'), { target: { value: 'הבסטה' } });
  expect(within(dialog).queryByText('עגבנייה')).not.toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('button', { name: 'סיום · 2 מוצרים בסל' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('adding waits for a community, and the list reloads when the community or date changes', async () => {
  const loadCatalog = jest.fn(() => Promise.resolve(CATALOG));
  const { rerender } = render(<Harness loadCatalog={loadCatalog} addDisabledText="בחרו יישוב כדי להוסיף מוצרים" />);
  expect(screen.getByRole('button', { name: 'הוספת מוצרים' })).toBeDisabled();
  expect(screen.getByText('בחרו יישוב כדי להוסיף מוצרים')).toBeInTheDocument();
  expect(loadCatalog).not.toHaveBeenCalled();

  rerender(<Harness loadCatalog={loadCatalog} catalogKey="signup|בית קמה|" />);
  await waitFor(() => expect(loadCatalog).toHaveBeenCalledTimes(1));
  rerender(<Harness loadCatalog={loadCatalog} catalogKey="signup|בית קמה|2026-11-25" />);
  await waitFor(() => expect(loadCatalog).toHaveBeenCalledTimes(2));
});

test('a failed product list shows the error and can be retried', async () => {
  const loadCatalog = jest.fn()
    .mockRejectedValueOnce(new Error('x'))
    .mockResolvedValue(CATALOG);
  render(<Harness loadCatalog={loadCatalog} catalogKey="subscription|s2" />);
  openPicker();
  expect(await screen.findByText('הפעולה נכשלה')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'נסו שוב' }));
  expect(await screen.findByText('עגבנייה')).toBeInTheDocument();
  expect(loadCatalog).toHaveBeenCalledTimes(2);
});

test('shows the product discount and applies it from the threshold', () => {
  render(<Harness
    startLines={[{ productId: 'tomato', productName: 'עגבנייה', quantity: 1.5, measurementType: 'kg', unitSize: 0.5, selectedOption: '' }]}
    startInfo={{ tomato: { productName: 'עגבנייה', price: 10, measurementType: 'kg', quantityDiscountThreshold: 2, quantityDiscountPrice: 8 } }}
    loadCatalog={neverLoads}
  />);
  expect(screen.getByText('2+ ב-₪8.00 ליחידת מחיר')).toBeInTheDocument();
  expect(screen.getByText('עוד 0.5 ק"ג למחיר המבצע')).toBeInTheDocument();
  expect(screen.queryByText('₪8.00')).not.toBeInTheDocument();

  fireEvent.click(screen.getByLabelText('הוספת עגבנייה'));
  expect(screen.getByText('מחיר המבצע חל')).toBeInTheDocument();
  expect(screen.getByText('₪10.00')).toHaveClass('line-through');
  expect(screen.getByText('₪8.00')).toBeInTheDocument();
});

test('the product list shows a discount label', async () => {
  render(<Harness
    loadCatalog={() => Promise.resolve([{ ...CATALOG[0], quantityDiscountThreshold: 2, quantityDiscountPrice: 8, quantityDiscountLabel: '2 ק"ג ב-16' }])}
  />);
  openPicker();
  expect(await screen.findByText('2 ק"ג ב-16')).toBeInTheDocument();
});
