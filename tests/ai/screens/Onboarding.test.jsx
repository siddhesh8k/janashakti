import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../../src/components/ToastProvider';
import { LocationProvider } from '../../../src/components/LocationProvider';
import Onboarding from '../../../src/screens/Onboarding';

// SMOKE TEST: goal is that the screen renders without crashing.
// utils/organizations must export EVERY function the app imports — Onboarding uses
// createOrganization, and LocationProvider warms loadOrganizations on mount, so both
// are required or React's effect throws "loadOrganizations is not a function".

vi.mock('../../../src/utils/organizations', () => ({
  loadOrganizations: vi.fn(() => Promise.resolve([])),
  createOrganization: vi.fn(() => Promise.resolve({ id: 'org123', name: 'Mock Org', type: 'mock' })),
}));

vi.mock('../../../src/utils/publicProfile', () => ({
  mirrorPublicIdentity: vi.fn(() => Promise.resolve()),
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

describe('Onboarding Screen - Smoke Test', () => {
  const renderComponent = () => render(
    <MemoryRouter>
      <ToastProvider>
        <LocationProvider>
          <Onboarding />
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
