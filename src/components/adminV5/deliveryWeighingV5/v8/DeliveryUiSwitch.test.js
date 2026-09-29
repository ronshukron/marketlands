import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import DeliveryUiSwitch from './DeliveryUiSwitch';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="loc">{`${location.pathname}${location.search}`}</div>;
}

function renderAt(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/admin/delivery-v7" element={<><DeliveryUiSwitch current="v7" /><LocationProbe /></>} />
        <Route path="/admin/delivery-v8" element={<><DeliveryUiSwitch current="v8" /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

test('switches V8 -> V7 and keeps the query string', () => {
  renderAt('/admin/delivery-v8?autoload=today');
  expect(screen.getByRole('button', { name: /V8/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: /V7/ }));
  expect(screen.getByTestId('loc')).toHaveTextContent('/admin/delivery-v7?autoload=today');
});

test('clicking the current UI does nothing', () => {
  renderAt('/admin/delivery-v7');
  fireEvent.click(screen.getByRole('button', { name: /V7/ }));
  expect(screen.getByTestId('loc')).toHaveTextContent('/admin/delivery-v7');
});
