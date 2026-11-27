import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ProductTypeSelect, { productTypeForCategory } from './ProductTypeSelect';

test('offers the types of the category, the detected one first, and "none"', () => {
  const onChange = jest.fn();
  render(<ProductTypeSelect category="ירקות" productName="מלפפון בייבי" value="" onChange={onChange} />);
  const select = screen.getByLabelText('סוג מוצר');
  expect(select).toHaveValue('');
  const options = screen.getAllByRole('option').map((option) => option.textContent);
  expect(options[0]).toBe('לפי השם: מלפפונים');
  expect(options).toContain('פלפלים');
  expect(options).not.toContain('תפוחים');
  expect(options[options.length - 1]).toBe('ללא סוג');
  fireEvent.change(select, { target: { value: 'פלפל' } });
  expect(onChange).toHaveBeenCalledWith('פלפל');
});

test('a wrong detection can be corrected; nothing is shown for categories without types', () => {
  const { unmount } = render(<ProductTypeSelect category="ירוקים" productName="סלק עלים" value="חסה" onChange={() => {}} />);
  expect(screen.getByLabelText('סוג מוצר')).toHaveValue('חסה');
  unmount();
  const { container } = render(<ProductTypeSelect category="משתלה" productName="פיקוס" value="" onChange={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});

test('a type from another category falls back to automatic', () => {
  expect(productTypeForCategory('מלפפון', 'פירות')).toBe('');
  expect(productTypeForCategory('מלפפון', 'ירקות')).toBe('מלפפון');
  expect(productTypeForCategory('none', 'פירות')).toBe('none');
  expect(productTypeForCategory('', 'ירקות')).toBe('');
});
