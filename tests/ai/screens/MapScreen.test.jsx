import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../../src/components/ToastProvider';
import { LocationProvider } from '../../../src/components/LocationProvider';
import MapScreen from '../../../src/screens/MapScreen';

// Mock heavy modules and hooks to prevent network requests and ensure stable test environment
vi.mock('../hooks/useIssues', () => ({
  useIssues: vi.fn(() => ({ issues: [] })), // Return empty issues for a smoke test
}));
vi.mock('../components/LocationProvider', () => ({
  useSharedLocation: vi.fn(() => ({ location: { lat: 12.9716, lng: 77.5946 } })), // Provide a fixed default location
}));
vi.mock('../utils/googleMaps', () => ({
  loadGoogleMaps: vi.fn(() => Promise.resolve()), // Simulate successful Google Maps script load
}));
vi.mock('../utils/organizations', () => ({
  loadOrganizations: vi.fn(() => Promise.resolve([])), // Simulate no organizations for simplicity
}));

// Mock Google Maps API objects and methods that the component interacts with.
// This prevents actual Google Maps script loading and allows the component to
// instantiate map-related objects without crashing.
const mockGoogleMaps = {
  Map: vi.fn(() => ({
    setCenter: vi.fn(),
    getBounds: vi.fn(() => ({
      contains: vi.fn(() => true), // Always contains for smoke test to simplify logic
    })),
    addListener: vi.fn((event, callback) => {
      // For 'idle' event, immediately call the callback to simulate map being ready.
      // This helps trigger effects that depend on map idle, like drawing zones.
      if (event === 'idle') {
        callback();
      }
    }),
  })),
  Marker: vi.fn(() => ({
    setMap: vi.fn(),
    setPosition: vi.fn(),
    addListener: vi.fn(),
  })),
  Circle: vi.fn(() => ({
    setMap: vi.fn(),
    addListener: vi.fn(),
  })),
  Polyline: vi.fn(() => ({
    setMap: vi.fn(),
  })),
  InfoWindow: vi.fn(() => ({
    setContent: vi.fn(),
    setPosition: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
  })),
  LatLng: vi.fn((lat, lng) => ({ lat, lng })),
  Size: vi.fn((w, h) => ({ w, h })),
  Point: vi.fn((x, y) => ({ x, y })),
  SymbolPath: {
    CIRCLE: 0, // Placeholder for SymbolPath.CIRCLE
  },
  event: {
    addListenerOnce: vi.fn(),
  },
};

// Set the mock Google Maps API on the window object.
// This must be done before the MapScreen component is rendered, as it accesses `window.google.maps`.
Object.defineProperty(window, 'google', {
  value: { maps: mockGoogleMaps },
  writable: true,
  configurable: true,
});

describe('MapScreen', () => {
  // Test 1: Ensures the component renders without throwing errors and the container is present.
  it('renders without crashing', () => {
    const { container } = render(
      <MemoryRouter>
        <ToastProvider>
          <LocationProvider>
            <MapScreen />
          </LocationProvider>
        </ToastProvider>
      </MemoryRouter>
    );
    expect(container).toBeTruthy();
  });

  // Test 2: Asserts the presence of a stable, static text element that is always visible.
  // The "All" filter button is a good candidate.
  it('renders the "All" filter button', () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <LocationProvider>
            <MapScreen />
          </LocationProvider>
        </ToastProvider>
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /All/i })).toBeInTheDocument();
  });

  // Test 3: Asserts the presence of another stable, static text element from the legend.
  // The "Critical" severity label is always displayed in the legend.
  it('renders the "Critical" severity label in the legend', () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <LocationProvider>
            <MapScreen />
          </LocationProvider>
        </ToastProvider>
      </MemoryRouter>
    );
    // "Critical" appears in both the filter row and the legend, so assert at least one match
    expect(screen.getAllByText(/Critical/i).length).toBeGreaterThan(0);
  });

  // Test 4: Asserts the presence of text from the NationTagline component, which is always rendered.
  it('renders the NationTagline text', () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <LocationProvider>
            <MapScreen />
          </LocationProvider>
        </ToastProvider>
      </MemoryRouter>
    );
    // The NationTagline component renders "A step towards a better nation, our better India"
    expect(screen.getByText(/A step towards a better nation/i)).toBeInTheDocument();
  });
});