import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import CheckoutAccountModal from './CheckoutAccountModal';

jest.mock('../firebase/auth', () => ({
  doCreateUserWithEmailAndPassword: jest.fn(),
  doSignInWithEmailAndPassword: jest.fn(),
  doSignInWithGoogle: jest.fn(),
}));

jest.mock('../firebase/firebase', () => ({
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  setDoc: jest.fn(),
}));

jest.mock('../hooks/usePickupSpots', () => () => ({
  pickupSpots: ['ניצנים', 'נגבה'],
  loaded: true,
}));

describe('CheckoutAccountModal', () => {
  const prefill = {
    email: 'buyer@example.com',
    name: 'ישראל ישראלי',
    phone: '0501234567',
    community: 'ניצנים',
  };

  test('shows signup details so create-account is distinct from sign-in', () => {
    render(
      <CheckoutAccountModal
        open
        prefill={prefill}
        onAuthenticated={jest.fn()}
        onContinueAsGuest={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByText('הרשמה לחשבון חדש')).toBeInTheDocument();
    expect(screen.getByText('יצירת חשבון חדש')).toBeInTheDocument();
    expect(screen.getByLabelText('שם מלא')).toHaveValue('ישראל ישראלי');
    expect(screen.getByLabelText('מספר טלפון')).toHaveValue('0501234567');
    expect(screen.getByLabelText('קהילה')).toHaveValue('ניצנים');
    expect(screen.getByLabelText('אימייל לחיבור לחשבון')).toHaveValue('buyer@example.com');
    expect(screen.getByLabelText(/בחירת סיסמה לחשבון החדש/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'לא עכשיו — המשך כאורח' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'המשך כאורח ללא יצירת חשבון' })).toBeInTheDocument();
  });

  test('hides profile fields when switching to an existing account', () => {
    render(
      <CheckoutAccountModal
        open
        prefill={prefill}
        onAuthenticated={jest.fn()}
        onContinueAsGuest={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'יש לי חשבון' }));

    expect(screen.getByText('התחברות לחשבון קיים')).toBeInTheDocument();
    expect(screen.queryByLabelText('שם מלא')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('קהילה')).not.toBeInTheDocument();
    expect(screen.getByLabelText('אימייל')).toBeInTheDocument();
    expect(screen.getByLabelText('סיסמה')).toBeInTheDocument();
  });

  test('close button dismisses the modal', () => {
    const onCancel = jest.fn();
    render(
      <CheckoutAccountModal
        open
        prefill={prefill}
        onAuthenticated={jest.fn()}
        onContinueAsGuest={jest.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'סגירת החלון' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
