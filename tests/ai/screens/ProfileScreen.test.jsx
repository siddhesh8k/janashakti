import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../../src/components/ToastProvider';
import { LocationProvider } from '../../../src/components/LocationProvider';
import ProfileScreen from '../../../src/screens/ProfileScreen';

// Hoisted mock fns so they are available inside the hoisted vi.mock factories
const { mockNavigate, mockUseAuth, mockUseUser, mockUseIssues, mockToast } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseAuth: vi.fn(() => ({ user: null, loading: false })),
  mockUseUser: vi.fn(() => ({ profile: null, loading: false })),
  mockUseIssues: vi.fn(() => ({ issues: [], loading: false })),
  mockToast: { success: vi.fn(), error: vi.fn() },
}));

// Mock react-router-dom's useNavigate hook
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock useAuth hook to control authentication state
vi.mock('../../../src/hooks/useAuth', () => ({
  useAuth: mockUseAuth,
}));

// Mock useUser hook to control user profile data
vi.mock('../../../src/hooks/useUser', () => ({
  useUser: mockUseUser,
}));

// Mock useIssues hook to control reported issues data
vi.mock('../../../src/hooks/useIssues', () => ({
  useIssues: mockUseIssues,
}));

// Mock Firebase Firestore functions to prevent actual database calls
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  updateDoc: vi.fn(() => Promise.resolve()),
  setDoc: vi.fn(() => Promise.resolve()),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getCountFromServer: vi.fn(() => Promise.resolve({ data: () => ({ count: 0 }) })),
}));

// Mock Firebase `db` object and `logOut` function
vi.mock('../../../src/firebase', () => ({
  db: {}, // Mock db object as it's used in Firestore functions, which are already mocked
  logOut: vi.fn(() => Promise.resolve()),
}));

// Mock utility functions that interact with external services.
// NOTE: must export BOTH createOrganization (used by ProfileScreen) AND
// loadOrganizations — the real LocationProvider (the render wrapper) calls
// loadOrganizations() on mount; without it the mock throws "No export defined".
vi.mock('../../../src/utils/organizations', () => ({
  createOrganization: vi.fn(() => Promise.resolve({ id: 'org1', name: 'Test Org', type: 'company' })),
  loadOrganizations: vi.fn(() => Promise.resolve([])),
}));
vi.mock('../../../src/utils/publicProfile', () => ({
  mirrorPublicIdentity: vi.fn(() => Promise.resolve()),
}));

// Mock ToastProvider's useToast hook to prevent actual toast messages
vi.mock('../../../src/components/ToastProvider', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useToast: () => mockToast,
  };
});

// Mock window.confirm for the sign-out flow to prevent browser dialogs
const originalWindowConfirm = window.confirm;
window.confirm = vi.fn(() => true); // Default to confirming actions

describe('ProfileScreen - Smoke Tests', () => {
  // Reset mocks before each test to ensure isolation
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    mockUseUser.mockReturnValue({ profile: null, loading: false });
    mockUseIssues.mockReturnValue({ issues: [], loading: false });
    mockNavigate.mockClear();
    vi.clearAllMocks(); // Clear all mock calls across modules
    window.confirm = vi.fn(() => true); // Reset window.confirm for each test
  });

  // Restore original window.confirm after all tests are done
  afterAll(() => {
    window.confirm = originalWindowConfirm;
  });

  it('renders without crashing when authentication data is loading', () => {
    // Simulate the state where authentication data is still being fetched
    mockUseAuth.mockReturnValue({ user: null, loading: true });

    const { container } = render(
      <MemoryRouter>
        <ToastProvider>
          <LocationProvider>
            <ProfileScreen />
          </LocationProvider>
        </ToastProvider>
      </MemoryRouter>
    );

    // Assert that the component renders without throwing an error
    expect(container).toBeTruthy();
    // No further content assertions for a smoke test in a loading state
  });

  it('renders without crashing and shows sign-in prompt when not authenticated', () => {
    // Simulate the state where no user is authenticated
    mockUseAuth.mockReturnValue({ user: null, loading: false });

    const { container, getByText } = render(
      <MemoryRouter>
        <ToastProvider>
          <LocationProvider>
            <ProfileScreen />
          </LocationProvider>
        </ToastProvider>
      </MemoryRouter>
    );

    // Assert that the component renders without throwing an error
    expect(container).toBeTruthy();
    // Assert minimal structure: check for a stable static text element
    expect(getByText('Sign in to see your profile')).toBeInTheDocument();
  });

  it('renders without crashing and shows profile details when authenticated with minimal data', async () => {
    // Simulate an authenticated user with minimal profile data
    mockUseAuth.mockReturnValue({
      user: {
        uid: 'test-uid',
        displayName: 'Test User',
        photoURL: 'https://example.com/avatar.jpg',
        isAnonymous: false,
      },
      loading: false,
    });
    mockUseUser.mockReturnValue({
      profile: {
        civicScore: 100,
        issuesReported: 5,
        issuesVerified: 2,
        issuesResolved: 1,
        streak: 3,
        affiliation: { role: 'civilian', orgName: null, orgType: null },
        issuesShared: 0,
      },
      loading: false,
    });
    mockUseIssues.mockReturnValue({ issues: [], loading: false }); // No issues for a minimal state

    const { container, getByText } = render(
      <MemoryRouter>
        <ToastProvider>
          <LocationProvider>
            <ProfileScreen />
          </LocationProvider>
        </ToastProvider>
      </MemoryRouter>
    );

    // Assert that the component renders without throwing an error
    expect(container).toBeTruthy();
    // Assert minimal structure: check for a stable static text element (e.g., from TopNav)
    expect(getByText('Profile')).toBeInTheDocument();
  });
});