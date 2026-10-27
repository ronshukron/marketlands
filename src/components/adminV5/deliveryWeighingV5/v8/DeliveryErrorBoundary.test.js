import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DeliveryErrorBoundary, { isChunkLoadError } from './DeliveryErrorBoundary';

let shouldThrow = true;

function Flaky() {
  const [count] = useState(1);
  if (shouldThrow) throw new Error('render exploded');
  return <div>weighing screen {count}</div>;
}

let consoleErrorSpy;

beforeEach(() => {
  shouldThrow = true;
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

test('a crash shows a bilingual recovery screen instead of a blank page', () => {
  render(<DeliveryErrorBoundary><Flaky /></DeliveryErrorBoundary>);
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(screen.getByText('אירעה תקלה במסך השקילה')).toBeInTheDocument();
  expect(screen.getByText('หน้าจอชั่งน้ำหนักมีปัญหา')).toBeInTheDocument();
  expect(screen.getByText('render exploded')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /טען מחדש/ })).toBeInTheDocument();
});

test('"try again" remounts the screen once the problem is gone', () => {
  render(<DeliveryErrorBoundary><Flaky /></DeliveryErrorBoundary>);
  shouldThrow = false;
  fireEvent.click(screen.getByRole('button', { name: /נסה שוב/ }));
  expect(screen.getByText('weighing screen 1')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
});

test('a failed code chunk only offers a reload (retrying a failed lazy import cannot work)', () => {
  function ChunkFail() {
    const error = new Error('Loading chunk src_components_admin_CommunityAdmin_js failed.');
    error.name = 'ChunkLoadError';
    throw error;
  }
  render(<DeliveryErrorBoundary><ChunkFail /></DeliveryErrorBoundary>);
  expect(screen.queryByRole('button', { name: /נסה שוב/ })).toBeNull();
  expect(screen.getByRole('button', { name: /טען מחדש/ })).toBeInTheDocument();
});

test('isChunkLoadError recognises webpack chunk failures only', () => {
  const named = new Error('x');
  named.name = 'ChunkLoadError';
  expect(isChunkLoadError(named)).toBe(true);
  expect(isChunkLoadError(new Error('Loading chunk 123 failed.'))).toBe(true);
  expect(isChunkLoadError(new Error('Loading CSS chunk main failed.'))).toBe(true);
  expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
  expect(isChunkLoadError(null)).toBe(false);
});

test('renders children untouched when nothing crashes', () => {
  shouldThrow = false;
  render(<DeliveryErrorBoundary><Flaky /></DeliveryErrorBoundary>);
  expect(screen.getByText('weighing screen 1')).toBeInTheDocument();
});
