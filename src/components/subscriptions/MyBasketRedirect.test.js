import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

let mockAuth = {};
let mockSubscriber = null;
jest.mock('../../contexts/authContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../../contexts/SubscriberContext', () => ({ useSubscriber: () => mockSubscriber }));
jest.mock('../LoadingSpinner', () => () => <div>loading</div>);

// eslint-disable-next-line import/first
import MyBasketRedirect from './MyBasketRedirect';

const Where = () => {
  const location = useLocation();
  return <div>{`${location.pathname}|${JSON.stringify(location.state || null)}`}</div>;
};

const renderAt = () => render(
  <MemoryRouter initialEntries={['/my-basket']}>
    <Routes>
      <Route path="/my-basket" element={<MyBasketRedirect />} />
      <Route path="*" element={<Where />} />
    </Routes>
  </MemoryRouter>,
);

describe('/my-basket', () => {
  test('not logged in: login, then back here', () => {
    mockAuth = { currentUser: null, loading: false };
    mockSubscriber = { loading: false, active: false };
    renderAt();
    expect(screen.getByText('/login|{"from":"/my-basket"}')).toBeInTheDocument();
  });

  test('a weekly-basket customer lands in the store with the delivery cart open', () => {
    mockAuth = { currentUser: { uid: 'u1' }, loading: false };
    mockSubscriber = { loading: false, active: true };
    renderAt();
    expect(screen.getByText('/|{"openSubscriptionCart":true}')).toBeInTheDocument();
  });

  test('no weekly basket in subscriber mode: the weekly-basket page', () => {
    mockAuth = { currentUser: { uid: 'u1' }, loading: false };
    mockSubscriber = { loading: false, active: false };
    renderAt();
    expect(screen.getByText('/my-subscriptions|null')).toBeInTheDocument();
  });

  test('waits while the subscriber state loads', () => {
    mockAuth = { currentUser: { uid: 'u1' }, loading: false };
    mockSubscriber = { loading: true, active: false };
    renderAt();
    expect(screen.getByText('loading')).toBeInTheDocument();
  });
});
