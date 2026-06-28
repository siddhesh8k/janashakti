import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../../src/components/ToastProvider';
import { LocationProvider } from '../../../src/components/LocationProvider';
import JournalistDashboard from '../../../src/screens/JournalistDashboard';

// SMOKE TEST: the only goal is that the screen renders without crashing.
// Heavy / network modules are mocked to safe no-ops. LocationProvider also loads
// some of these on mount, so each mock exports every function the app imports.

vi.mock('../../../src/utils/pressRelease', () => ({
  generatePressRelease: vi.fn(() => Promise.resolve({})),
}));

vi.mock('../../../src/utils/exportToExcel', () => ({
  exportToExcel: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../../../src/utils/story', () => ({
  daysOpenOf: vi.fn(() => 5),
  isStoryReady: vi.fn(() => false),
  claimStatus: vi.fn(() => ({ state: 'open', hoursRemaining: 48 })),
}));

vi.mock('../../../src/utils/organizations', () => ({
  loadOrganizations: vi.fn(() => Promise.resolve([])),
  createOrganization: vi.fn(() => Promise.resolve({ id: 'org123' })),
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

describe('JournalistDashboard Smoke Test', () => {
  const renderComponent = () => render(
    <MemoryRouter>
      <ToastProvider>
        <LocationProvider>
          <JournalistDashboard />
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
