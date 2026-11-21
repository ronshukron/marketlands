import React from 'react';
import { act, render, screen } from '@testing-library/react';
import SecureCardProgress, { useResetOnPageRestore } from './SecureCardProgress';

describe('SecureCardProgress', () => {
  afterEach(() => {
    jest.useRealTimers();
    document.body.style.overflow = '';
  });

  test('renders nothing without a step', () => {
    const { container } = render(<SecureCardProgress step="" />);
    expect(container).toBeEmptyDOMElement();
  });

  test('preparing shows the first step as active and locks page scroll', () => {
    const { unmount } = render(<SecureCardProgress step="preparing" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('מכינים עמוד מאובטח לשמירת הכרטיס')).toBeInTheDocument();
    expect(screen.getByText('מכינים את המנוי שלך')).toHaveClass('font-semibold');
    expect(screen.getByText(/לא עוברים דרך בסטה בסקט/)).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  test('redirecting offers a manual link only if the redirect stalls', () => {
    jest.useFakeTimers();
    render(<SecureCardProgress step="redirecting" purpose="replace" fallbackUrl="https://sandbox.meshulam.co.il/s/abc" />);
    expect(screen.getByText('מעבירים אותך לעמוד המאובטח של Grow')).toBeInTheDocument();
    expect(screen.getByText('מכינים את החלפת הכרטיס')).not.toHaveClass('font-semibold');
    expect(screen.queryByText('המשך לעמוד המאובטח')).not.toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(8000); });
    expect(screen.getByText('המשך לעמוד המאובטח')).toHaveAttribute('href', 'https://sandbox.meshulam.co.il/s/abc');
  });

  test('confirming inline does not lock page scroll', () => {
    render(<SecureCardProgress step="confirming" variant="inline" />);
    expect(screen.getByText('מאמתים את שמירת הכרטיס')).toBeInTheDocument();
    expect(screen.getByText('מפעילים את המנוי')).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });
});

describe('useResetOnPageRestore', () => {
  const Probe = ({ onReset }) => {
    useResetOnPageRestore(onReset);
    return null;
  };

  test('resets only when the page comes back from the back-forward cache', () => {
    const onReset = jest.fn();
    render(<Probe onReset={onReset} />);
    const fire = (persisted) => {
      const event = new Event('pageshow');
      Object.defineProperty(event, 'persisted', { value: persisted });
      window.dispatchEvent(event);
    };
    fire(false);
    expect(onReset).not.toHaveBeenCalled();
    fire(true);
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
