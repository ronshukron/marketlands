import App from './App';

test('exports the application root component', () => {
  expect(App).toEqual(expect.any(Function));
});
