// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'util';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

process.env.REACT_APP_FIREBASE_API_KEY ||= 'AIzaSyTestKeyForJestOnly000000000000000';
process.env.REACT_APP_FIREBASE_AUTH_DOMAIN ||= 'test.firebaseapp.com';
process.env.REACT_APP_FIREBASE_PROJECT_ID ||= 'test-project';
process.env.REACT_APP_FIREBASE_STORAGE_BUCKET ||= 'test-project.appspot.com';
process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID ||= '123456789';
process.env.REACT_APP_FIREBASE_APP_ID ||= '1:123456789:web:test';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

HTMLCanvasElement.prototype.getContext = jest.fn(() => null);
