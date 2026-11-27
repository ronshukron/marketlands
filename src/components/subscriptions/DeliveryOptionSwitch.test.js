import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DeliveryOptionSwitch from './DeliveryOptionSwitch';
import { deliveryOptionsForSpot, preferredDeliveryOption } from '../../utils/subscriptionDelivery';

let mockSpots;
jest.mock('../../hooks/usePickupSpots', () => () => ({ pickupSpotsData: mockSpots }));

const subscription = (extra = {}) => ({
  id: 's1', community: 'אור הנר', deliveryOption: 'pickup', customerDetails: { name: 'דנה', address: '' }, ...extra,
});

beforeEach(() => {
  mockSpots = { 'אור הנר': { options: ['pickup', 'homeDelivery'], deliveryFee: 40 } };
});

test('home delivery is the default when offered', () => {
  expect(preferredDeliveryOption(['pickup', 'homeDelivery'])).toBe('homeDelivery');
  expect(preferredDeliveryOption(['pickup'])).toBe('pickup');
  expect(deliveryOptionsForSpot({ placeType: 'city' })).toEqual(['homeDelivery']);
  expect(deliveryOptionsForSpot(null)).toEqual(['pickup']);
});

test('switching to home delivery needs an address, then saves the choice', () => {
  const onSave = jest.fn(() => Promise.resolve());
  render(<DeliveryOptionSwitch subscription={subscription()} onSave={onSave} />);
  fireEvent.click(screen.getByRole('button', { name: 'שינוי' }));
  fireEvent.click(screen.getByRole('radio', { name: /משלוח עד הבית/ }));
  expect(screen.getByRole('radio', { name: /משלוח עד הבית/ })).toHaveTextContent('₪40.00');
  expect(screen.getByRole('button', { name: 'שמירה' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('כתובת למשלוח'), { target: { value: ' הדקל 5 ' } });
  fireEvent.click(screen.getByRole('button', { name: 'שמירה' }));
  expect(onSave).toHaveBeenCalledWith({ deliveryOption: 'homeDelivery', address: 'הדקל 5', directions: '' });
});

test('no change button when the community offers only one way', () => {
  mockSpots = { 'אור הנר': { options: ['pickup'] } };
  render(<DeliveryOptionSwitch subscription={subscription()} onSave={() => {}} />);
  expect(screen.getByText('איסוף מנקודת החלוקה')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'שינוי' })).toBeNull();
});
