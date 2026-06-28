import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../../src/components/ToastProvider';
import { LocationProvider } from '../../../src/components/LocationProvider';

// Mock hooks / utilities that do data fetching or heavy work so the smoke test is
// deterministic and never hits the network. Mock fns are created with vi.hoisted so
// they exist before the hoisted vi.mock factories execute.
const { mockUseIssues, mockUsePagination } = vi.hoisted(() => ({
  mockUseIssues: vi.fn(),
  mockUsePagination: vi.fn(),
}));

vi.mock('../../../src/hooks/useIssues', () => ({
  useIssues: mockUseIssues,
}));

vi.mock('../../../src/hooks/usePagination', () => ({
  usePagination: mockUsePagination,
}));

vi.mock('../../../src/utils/gemini', () => ({
  generateCityInsights: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../../../src/utils/trend', () => ({
  trendSeries: vi.fn(() => []),
}));

vi.mock('../../../src/utils/exportToExcel', () => ({
  exportToExcel: vi.fn(() => Promise.resolve(true)),
}));

// ChartCarousel pulls in recharts' ResponsiveContainer, which needs ResizeObserver
// (absent in jsdom). For a smoke test we replace it with a no-op.
vi.mock('../../../src/components/ChartCarousel', () => ({
  default: () => null,
}));

import AnalyticsDashboard from '../../../src/screens/AnalyticsDashboard';

describe('AnalyticsDashboard', () => {
  beforeEach(() => {
    mockUseIssues.mockReturnValue({ issues: [], loading: false, error: null });
    mockUsePagination.mockReturnValue({
      visible: [],
      hasMore: false,
      showMore: vi.fn(),
      remaining: 0,
    });
  });

  const renderComponent = () =>
    render(
      <MemoryRouter>
        <ToastProvider>
          <LocationProvider>
            <AnalyticsDashboard />
          </LocationProvider>
        </ToastProvider>
      </MemoryRouter>
    );

  it('renders without crashing in loading state', () => {
    mockUseIssues.mockReturnValue({ issues: [], loading: true, error: null });
    const { container } = renderComponent();
    expect(container).toBeTruthy();
    expect(container.textContent).toContain('City Intelligence');
  });

  it('renders without crashing with no issues data', () => {
    const { container } = renderComponent();
    expect(container).toBeTruthy();
    expect(container.textContent).toContain('City Intelligence');
    expect(container.textContent).toContain('Total');
    expect(container.textContent).toContain('Export City Data (Privacy Safe)');
  });

  it('renders without crashing with some mock issues data', () => {
    const mockIssues = [
      { id: '1', issueType: 'Pothole', status: 'Reported', severity: 'High', createdAt: new Date(), confirmations: 5 },
      { id: '2', issueType: 'Streetlight', status: 'Resolved', severity: 'Medium', createdAt: new Date(), confirmations: 2 },
    ];
    mockUseIssues.mockReturnValue({ issues: mockIssues, loading: false, error: null });

    const { container } = renderComponent();
    expect(container).toBeTruthy();
    expect(container.textContent).toContain('City Intelligence');
    expect(container.textContent).toContain('Total');
    expect(container.textContent).toContain('Generate AI Insights');
  });

  it('renders Wall of Shame section if issues qualify', () => {
    const thirtyOneDaysAgo = new Date();
    thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

    const wallOfShameIssue = {
      id: '101',
      issueType: 'Pothole',
      status: 'Reported',
      severity: 'High',
      createdAt: thirtyOneDaysAgo,
      confirmations: 10,
    };

    mockUseIssues.mockReturnValue({ issues: [wallOfShameIssue], loading: false, error: null });
    mockUsePagination.mockReturnValue({
      visible: [{ ...wallOfShameIssue, wallOfShame: true }],
      hasMore: false,
      showMore: vi.fn(),
      remaining: 0,
    });

    const { container } = renderComponent();
    expect(container).toBeTruthy();
    expect(container.textContent).toContain('Wall of Shame (1)');
    expect(container.textContent).toContain('Issues ignored for 30+ days');
    expect(container.textContent).toContain('Pothole');
  });
});
