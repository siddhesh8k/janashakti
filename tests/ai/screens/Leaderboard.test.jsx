import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../../src/components/ToastProvider';
import { LocationProvider } from '../../../src/components/LocationProvider';
import Leaderboard from '../../../src/screens/Leaderboard';

// SMOKE TEST: the only goal is that the screen renders without crashing.
// All heavy / network modules are mocked to safe no-ops. Note that LocationProvider
// also pulls in these modules on mount, so each mock must export every named function
// the app actually imports (otherwise React's effect throws "x is not a function").

vi.mock('../../../src/utils/csrReport', () => ({
  generateCSRReport: vi.fn(() => Promise.resolve({})),
}));

vi.mock('../../../src/utils/organizations', () => ({
  loadOrganizations: vi.fn(() => Promise.resolve([])),
  createOrganization: vi.fn(() => Promise.resolve({ id: 'org123', name: 'Mock Org', type: 'mock' })),
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

vi.mock('../../../src/utils/exportToExcel', () => ({
  exportToExcel: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../../../src/utils/publicProfile', () => ({
  syncPublicProfile: vi.fn(() => Promise.resolve()),
  mirrorPublicIdentity: vi.fn(() => Promise.resolve()),
}));

// Leaderboard imports calculateScorecard, aggregateByRole AND CIVIC_ROLES from this
// module. CIVIC_ROLES is read during render (claimRole state init + the role <select>),
// so it must be a non-empty array or the screen throws on mount.
vi.mock('../../../src/constants/representatives', () => ({
  calculateScorecard: vi.fn(() => []),
  aggregateByRole: vi.fn(() => []),
  CIVIC_ROLES: [
    'Elected Corporator',
    'Resident Welfare Assoc.',
    'Ward Volunteer',
    'Municipal Officer',
    'NGO / Civil Society',
    'Independent / Citizen Rep',
  ],
}));

describe('Leaderboard Screen (Smoke Test)', () => {
  const renderComponent = () => render(
    <MemoryRouter>
      <ToastProvider>
        <LocationProvider>
          <Leaderboard />
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

  it('renders consistently across multiple mounts', () => {
    const first = renderComponent();
    expect(first.container).toBeTruthy();
    first.unmount();
    const second = renderComponent();
    expect(second.container).toBeTruthy();
  });
});
