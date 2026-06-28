import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../../src/components/ToastProvider';
import { LocationProvider } from '../../../src/components/LocationProvider';

// Mock the useAgents hook (path relative to THIS test file -> src/hooks).
// Use vi.hoisted so the mock fn exists before the hoisted vi.mock factory runs.
const { mockUseAgents } = vi.hoisted(() => ({ mockUseAgents: vi.fn() }));
vi.mock('../../../src/hooks/useAgents', () => ({
  useAgents: mockUseAgents,
}));

import AgentsShowcase from '../../../src/screens/AgentsShowcase';

describe('AgentsShowcase Smoke Test', () => {
  const renderComponent = () =>
    render(
      <MemoryRouter>
        <ToastProvider>
          <LocationProvider>
            <AgentsShowcase />
          </LocationProvider>
        </ToastProvider>
      </MemoryRouter>
    );

  beforeEach(() => {
    mockUseAgents.mockReturnValue({
      stats: {
        analyzed: 0,
        duplicatesCaught: 0,
        authoritiesNotified: 0,
        predictionsGenerated: 0,
        resolutionsVerified: 0,
      },
      recentRuns: [],
      loading: false,
    });
  });

  it('renders without crashing and displays the main title in default loaded state', () => {
    const { container } = renderComponent();
    expect(container).toBeTruthy();
    expect(screen.getByText('AI Intelligence')).toBeInTheDocument();
  });

  it('renders without crashing when in loading state', () => {
    mockUseAgents.mockReturnValue({
      stats: {},
      recentRuns: [],
      loading: true,
    });
    const { container } = renderComponent();
    expect(container).toBeTruthy();
    expect(screen.getByText('AI Intelligence')).toBeInTheDocument();
  });

  it('displays the "No pipeline runs yet" message when there are no recent runs', () => {
    const { container } = renderComponent();
    expect(container).toBeTruthy();
    expect(
      screen.getByText('No pipeline runs yet. Report an issue to watch all 4 agents collaborate.')
    ).toBeInTheDocument();
  });

  it('renders the static agent cards with their names', () => {
    const { container } = renderComponent();
    expect(container).toBeTruthy();
    expect(screen.getByText('Issue Analyzer')).toBeInTheDocument();
  });
});
