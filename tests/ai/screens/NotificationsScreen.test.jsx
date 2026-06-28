import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../../src/components/ToastProvider';
import { LocationProvider } from '../../../src/components/LocationProvider';
import NotificationsScreen from '../../../src/screens/NotificationsScreen';

// SMOKE TEST: goal is that the screen renders without crashing.
// Mock data hooks to safe empty/loading values, and the modules LocationProvider
// warms on mount so its effects don't throw.

vi.mock('../../../src/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: null })),
}));

vi.mock('../../../src/hooks/useNotifications', () => ({
  useNotifications: vi.fn(() => ({ items: [] })),
}));

vi.mock('../../../src/utils/organizations', () => ({
  loadOrganizations: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../../../src/utils/representatives', () => ({
  loadRepresentatives: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../../../src/utils/googleMaps', () => ({
  loadGoogleMaps: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../../src/utils/civicDataContext', () => ({
  fetchCivicContext: vi.fn(() => Promise.resolve({})),
}));

describe('NotificationsScreen (Smoke Test)', () => {
  const renderComponent = () => render(
    <MemoryRouter>
      <ToastProvider>
        <LocationProvider>
          <NotificationsScreen />
        </LocationProvider>
      </ToastProvider>
    </MemoryRouter>
  );

  it('renders without crashing', () => {
    const { container } = renderComponent();
    expect(container).toBeTruthy();
  });

  it('mounts a DOM subtree', () => {
    const { container } = renderComponent();
    expect(container.firstChild).toBeTruthy();
  });

  it('can render and unmount cleanly', () => {
    const { container, unmount } = renderComponent();
    expect(container).toBeTruthy();
    expect(() => unmount()).not.toThrow();
  });
});
