import React from 'react';
import { render, screen } from '@testing-library/react';
import SubscriptionBusyOverlay from './SubscriptionBusyOverlay';

describe('SubscriptionBusyOverlay', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  test('shows nothing when no action is running', () => {
    const { container } = render(<SubscriptionBusyOverlay action="" />);
    expect(container).toBeEmptyDOMElement();
  });

  test('replace_card is handled by the card screen, not this one', () => {
    const { container } = render(<SubscriptionBusyOverlay action="replace_card" />);
    expect(container).toBeEmptyDOMElement();
  });

  test('a frequency change shows its own message and locks page scroll until done', () => {
    const { unmount } = render(<SubscriptionBusyOverlay action="frequency" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('מעדכנים את תדירות המשלוחים')).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  test.each([
    ['pause', 'משהים את הסל השבועי'],
    ['resume', 'מחדשים את הסל השבועי'],
    ['skip', 'מדלגים על המשלוח'],
    ['unskip', 'מחזירים את המשלוח'],
    ['cancel', 'מבטלים את ההרשמה לסל השבועי'],
  ])('%s has a message', (action, title) => {
    render(<SubscriptionBusyOverlay action={action} />);
    expect(screen.getByText(title)).toBeInTheDocument();
  });
});
