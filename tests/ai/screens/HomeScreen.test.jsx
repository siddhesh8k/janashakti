import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../../src/components/ToastProvider';
import { LocationProvider } from '../../../src/components/LocationProvider';
import HomeScreen from '../../../src/screens/HomeScreen';

// Mock the data hooks to control component behavior and prevent actual data fetching
vi.mock('../../../src/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../../../src/hooks/useIssues', () => ({
  useIssues: vi.fn(),
}));
vi.mock('../../../src/hooks/useUser', () => ({
  useUser: vi.fn(),
}));
vi.mock('../../../src/hooks/useAgents', () => ({
  useAgents: vi.fn(),
}));

// Import the mocked hooks for direct manipulation in tests
import { useAuth } from '../../../src/hooks/useAuth';
import { useIssues } from '../../../src/hooks/useIssues';
import { useUser } from '../../../src/hooks/useUser';
import { useAgents } from '../../../src/hooks/useAgents';

describe('HomeScreen Smoke Tests', () => {
  // Reset and set default mock values before each test
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock for a signed-in user with completed onboarding and empty data
    useAuth.mockReturnValue({ user: { uid: 'test-user-id' }, loading: false });
    useUser.mockReturnValue({ profile: { onboardingComplete: true, civicScore: 0 } });
    useIssues.mockReturnValue({ issues: [], loading: false });
    useAgents.mockReturnValue({
      stats: {
        analyzed: 0,
        duplicatesCaught: 0,
        authoritiesNotified: 0,
        predictionsGenerated: 0,
        resolutionsVerified: 0,
      },
    });
  });

  it('renders the initial loading state without crashing', () => {
    // Simulate the authentication loading state
    useAuth.mockReturnValue({ user: null, loading: true });

    const { container } = render(
      <MemoryRouter>
        <ToastProvider>
          <LocationProvider>
            <HomeScreen />
          </LocationProvider>
        </ToastProvider>
      </MemoryRouter>
    );

    // Assert that the component renders and the container is present
    expect(container).toBeTruthy();
    // In this state, LoadingSkeleton is rendered. For a smoke test,
    // simply checking container truthiness is sufficient.
  });

  it('renders the "not signed in" state without crashing', () => {
    // Simulate a user who is not signed in
    useAuth.mockReturnValue({ user: null, loading: false });

    const { container, getByText } = render(
      <MemoryRouter>
        <ToastProvider>
          <LocationProvider>
            <HomeScreen />
          </LocationProvider>
        </ToastProvider>
      </MemoryRouter>
    );

    expect(container).toBeTruthy();
    // Assert a stable, static piece of text that is always present in this state
    expect(getByText('JanaShakti')).toBeInTheDocument();
  });

  it('renders the "signed in" state with empty data without crashing', () => {
    // Default mocks already set for signed-in user with empty data
    const { container, getByText } = render(
      <MemoryRouter>
        <ToastProvider>
          <LocationProvider>
            <HomeScreen />
          </LocationProvider>
        </ToastProvider>
      </MemoryRouter>
    );

    expect(container).toBeTruthy();
    // Assert a stable, static piece of text that is always present in the signed-in state
    expect(getByText('Recent Issues')).toBeInTheDocument();
  });

  it('renders the "signed in" state with critical issues without crashing', () => {
    // Simulate a signed-in user with some critical issues
    useIssues.mockReturnValue({
      issues: [
        { id: '1', severity: 'Critical', status: 'Pending', title: 'Test Critical Issue', description: 'Desc', imageUrl: 'url' },
        { id: '2', severity: 'Low', status: 'Pending', title: 'Test Low Issue', description: 'Desc', imageUrl: 'url' },
      ],
      loading: false,
    });

    const { container, getByText } = render(
      <MemoryRouter>
        <ToastProvider>
          <LocationProvider>
            <HomeScreen />
          </LocationProvider>
        </ToastProvider>
      </MemoryRouter>
    );

    expect(container).toBeTruthy();
    // Assert that the "CRITICAL ALERTS" section is rendered
    expect(getByText('CRITICAL ALERTS')).toBeInTheDocument();
  });

  it('renders the "signed in" state with resolved issues without crashing', () => {
    // Simulate a signed-in user with some resolved issues
    useIssues.mockReturnValue({
      issues: [
        { id: '1', severity: 'Low', status: 'Resolved', title: 'Test Resolved Issue', description: 'Desc', imageUrl: 'url' },
        { id: '2', severity: 'Low', status: 'Pending', title: 'Test Pending Issue', description: 'Desc', imageUrl: 'url' },
      ],
      loading: false,
    });

    const { container, getByText } = render(
      <MemoryRouter>
        <ToastProvider>
          <LocationProvider>
            <HomeScreen />
          </LocationProvider>
        </ToastProvider>
      </MemoryRouter>
    );

    expect(container).toBeTruthy();
    // Assert that the "Resolved" stat card is rendered
    expect(getByText('Resolved')).toBeInTheDocument();
  });
});