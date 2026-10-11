import { render, screen } from '@testing-library/react';
import App from './App';

test('renders Hematrik brand', () => {
  render(<App />);
  // Karena brand sekarang berupa image alt, kita gunakan getByAltText atau getByRole
  expect(screen.getByAltText(/Hematrik/i)).toBeInTheDocument();
});
