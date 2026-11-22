import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RecaptchaVerifier, linkWithPhoneNumber } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import AccountVerificationGate from './AccountVerificationGate';
import { useAuth } from '../../contexts/authContext';

jest.mock('../../contexts/authContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../firebase/firebase', () => ({ auth: { currentUser: { uid: 'u1' } }, db: {} }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), getDoc: jest.fn(), setDoc: jest.fn() }));
jest.mock('firebase/auth', () => ({ RecaptchaVerifier: jest.fn(), linkWithPhoneNumber: jest.fn() }));

// CRA resets mock implementations before every test.
beforeEach(() => {
  doc.mockReturnValue({});
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ phone: '0501234567' }) });
  setDoc.mockResolvedValue();
  RecaptchaVerifier.mockImplementation(() => ({ clear: jest.fn() }));
});

const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <AccountVerificationGate><p>store page</p></AccountVerificationGate>
  </MemoryRouter>,
);

const signedIn = (overrides) => {
  useAuth.mockReturnValue({
    currentUser: { uid: 'u1', email: 'new@example.com', phoneNumber: null },
    verificationRequired: false,
    completePhoneVerification: jest.fn().mockResolvedValue(true),
    signOut: jest.fn(),
    ...overrides,
  });
};

describe('AccountVerificationGate', () => {
  it('never asks an existing account without a verification record', () => {
    signedIn({ verificationRequired: false });
    renderAt('/');
    expect(screen.getByText('store page')).toBeInTheDocument();
  });

  it('lets guests through', () => {
    useAuth.mockReturnValue({ currentUser: null, verificationRequired: false });
    renderAt('/');
    expect(screen.getByText('store page')).toBeInTheDocument();
  });

  it('keeps checkout open so an account created mid-checkout can finish the order', () => {
    signedIn({ verificationRequired: true });
    renderAt('/order-confirmation-delayed');
    expect(screen.getByText('store page')).toBeInTheDocument();
  });

  it('opens the site once the phone is verified', () => {
    signedIn({
      verificationRequired: true,
      currentUser: { uid: 'u1', phoneNumber: '+972501234567' },
    });
    renderAt('/');
    expect(screen.getByText('store page')).toBeInTheDocument();
  });

  it('asks a new account for its phone, sends the code and confirms it', async () => {
    const completePhoneVerification = jest.fn().mockResolvedValue(true);
    const confirm = jest.fn().mockResolvedValue({});
    linkWithPhoneNumber.mockResolvedValue({ confirm });
    signedIn({ verificationRequired: true, completePhoneVerification });
    renderAt('/');

    expect(screen.queryByText('store page')).not.toBeInTheDocument();
    const phoneInput = screen.getByRole('textbox', { name: 'מספר נייד' });
    await waitFor(() => expect(phoneInput).toHaveValue('0501234567'));
    fireEvent.click(screen.getByRole('button', { name: 'שלחו לי קוד' }));

    await waitFor(() => expect(linkWithPhoneNumber).toHaveBeenCalled());
    expect(linkWithPhoneNumber.mock.calls[0][1]).toBe('+972501234567');
    fireEvent.change(await screen.findByRole('textbox', { name: 'הקוד מה-SMS' }), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'אישור' }));

    await waitFor(() => expect(confirm).toHaveBeenCalledWith('123456'));
    await waitFor(() => expect(completePhoneVerification).toHaveBeenCalled());
  });

  it('rejects a number that is not an Israeli mobile', async () => {
    signedIn({ verificationRequired: true });
    renderAt('/');
    const phoneInput = screen.getByRole('textbox', { name: 'מספר נייד' });
    await waitFor(() => expect(phoneInput).toHaveValue('0501234567'));
    fireEvent.change(phoneInput, { target: { value: '03-1234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'שלחו לי קוד' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('מספר נייד ישראלי');
    expect(linkWithPhoneNumber).not.toHaveBeenCalled();
  });
});
