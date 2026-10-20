import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RefundRequestForm from './RefundRequestForm';

jest.mock('../utils/refundUtils', () => ({
  getRefundableLinesFromOrder: () => [{
    lineId: 'line-1',
    productName: 'עגבניה',
    businessName: 'משק',
    lineTotal: 20,
  }],
  buildRefundItems: (lines, percentByLineId) => lines.map((line) => ({
    ...line,
    refundPercent: percentByLineId[line.lineId] ?? 100,
    refundAmount: 20,
  })),
  sumRefundAmount: () => 20,
}));

const order = { id: 'order-12345678', grandTotal: 40 };

test('lets a customer confirm a refund without an explanation', async () => {
  const onSubmit = jest.fn();
  render(
    <RefundRequestForm
      orders={[order]}
      selectedOrderId={order.id}
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  );

  expect(screen.getByText('רוצים לשתף מה קרה? (לא חובה)')).toBeInTheDocument();
  expect(screen.queryByText(/תועבר לבדיקה/)).not.toBeInTheDocument();
  expect(screen.getByLabelText(/רוצים לשתף מה קרה/)).not.toBeRequired();

  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(screen.getByRole('button', { name: 'קבל זיכוי' }));

  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
    orderId: order.id,
    reason: '',
    requestedRefundAmount: 20,
  }));
});
