import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProcurementCutoffPanel from './ProcurementCutoffPanel';

const row = (id, community, day, hour, minute) => ({
  order: { id, community, customerDetails: { name: `לקוח ${id}` } },
  enteredAt: new Date(2026, 10, day, hour, minute),
});
const group = (entry = {}) => ({
  key: '2026-11-24__2026-11-25',
  procureOnDate: '2026-11-24',
  originalDeliveryDate: '2026-11-25',
  entries: [
    { community: 'נחלה', procureOnDate: '2026-11-24', originalDeliveryDate: '2026-11-25', ...entry },
    { community: 'גיאה', procureOnDate: '2026-11-24', originalDeliveryDate: '2026-11-25', ...entry },
  ],
  orders: [row('a', 'גיאה', 24, 9, 58), row('b', 'נחלה', 23, 19, 17), row('c', 'גיאה', 23, 15, 11)],
});
const renderPanel = (props = {}) => render(<ProcurementCutoffPanel
  groups={[group(props.entry)]}
  formatDayLabel={(key) => (key === '2026-11-24' ? 'יום שלישי' : 'יום רביעי')}
  ordersLoadedAt={new Date(2026, 10, 23, 15, 25)}
  selectedDeliveryDate={props.day || '2026-11-25'}
  saving={false}
  onSave={props.onSave || jest.fn()}
/>);

test('a purchase without a closing time warns, previews and saves the chosen time', async () => {
  const onSave = jest.fn().mockResolvedValue(true);
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
  renderPanel({ onSave });
  expect(screen.getByText(/לא נקבעה שעת סגירה/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'שמירת שעת הסגירה' })).toBeDisabled();

  fireEvent.change(screen.getByLabelText('שעת סגירת הרכש'), { target: { value: '2026-11-23T15:30' } });
  expect(screen.getByText('הזמנות שנכנסו אחרי הסגירה ברכש של יום רביעי', { exact: false })).toHaveTextContent('2 הזמנות');
  expect(screen.getByText(/23\/11 15:11 · גיאה .* נרכשת ביום שלישי/)).toBeInTheDocument();
  expect(screen.getByText(/23\/11 19:17 · נחלה .* נרכשת ביום רביעי/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'שמירת שעת הסגירה' }));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({ procureOnDate: '2026-11-24' }),
    new Date(2026, 10, 23, 15, 30).toISOString(),
  ));
  expect(confirm.mock.calls[0][0]).toContain('ברכש של יום רביעי: 2 הזמנות');
  confirm.mockRestore();
});

test('nothing is saved when the admin does not confirm', () => {
  const onSave = jest.fn();
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
  renderPanel({ onSave });
  fireEvent.change(screen.getByLabelText('שעת סגירת הרכש'), { target: { value: '2026-11-23T15:30' } });
  fireEvent.click(screen.getByRole('button', { name: 'שמירת שעת הסגירה' }));
  expect(onSave).not.toHaveBeenCalled();
  confirm.mockRestore();
});

test('a closed purchase shows its time, and only the purchase day offers the time on screen', () => {
  const entry = { cutoffAt: new Date(2026, 10, 23, 15, 30).toISOString() };
  const { unmount } = renderPanel({ entry });
  expect(screen.getByLabelText('שעת סגירת הרכש')).toHaveValue('2026-11-23T15:30');
  expect(screen.queryByText(/לא נקבעה שעת סגירה/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /לפי הנתונים שעל המסך/ })).not.toBeInTheDocument();
  unmount();

  renderPanel({ entry, day: '2026-11-24' });
  fireEvent.click(screen.getByRole('button', { name: 'לפי הנתונים שעל המסך (15:25)' }));
  expect(screen.getByLabelText('שעת סגירת הרכש')).toHaveValue('2026-11-23T15:25');
});
