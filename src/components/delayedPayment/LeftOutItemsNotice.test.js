import React from 'react';
import { render, screen } from '@testing-library/react';
import LeftOutItemsNotice from './LeftOutItemsNotice';

test('lists what will not be included, why, and that pay removes it', () => {
  render(<LeftOutItemsNotice
    items={[
      { uid: 'a', name: 'ריבת תות', businessName: "מוג'ו" },
      { uid: 'b', name: 'רכיב בסל', businessName: "מוג'ו", basketInstanceId: 'b1' },
    ]}
    baskets={[{ basketInstanceId: 'b1', title: 'סל ירקות', closedBusinessNames: ["מוג'ו"] }]}
    closures={[{ orderId: 'mojo', businessName: "מוג'ו", closedAt: new Date(2026, 10, 23, 14, 59, 59, 999) }]}
    deliveryDate="2026-11-25"
  />);

  expect(screen.getByRole('status')).toHaveTextContent('2 מוצרים לא ייכללו בהזמנה');
  expect(screen.getByText(/כשתלחצו על תשלום הם יוסרו מהעגלה/)).toBeInTheDocument();
  expect(screen.getByText(/להגיע ביום רביעי/)).toBeInTheDocument();
  expect(screen.getByText("ריבת תות · מוג'ו")).toBeInTheDocument();
  expect(screen.getByText("סל ירקות (כל הסל, כי יש בו מוצרים ממוג'ו)")).toBeInTheDocument();
  expect(screen.queryByText(/רכיב בסל/)).not.toBeInTheDocument();
  expect(screen.getByText(/ההזמנות אצל מוג'ו נסגרו ביום שני ב-15:00/)).toBeInTheDocument();
});

test('one product reads in the singular', () => {
  render(<LeftOutItemsNotice items={[{ uid: 'a', name: 'ריבה', businessName: "מוג'ו" }]} deliveryDate="2026-11-25" />);
  expect(screen.getByRole('status')).toHaveTextContent('מוצר אחד לא ייכלל בהזמנה');
  expect(screen.getByText(/הוא יוסר מהעגלה/)).toBeInTheDocument();
});

test('shows nothing when everything is included', () => {
  const { container } = render(<LeftOutItemsNotice items={[]} baskets={[]} />);
  expect(container).toBeEmptyDOMElement();
});
