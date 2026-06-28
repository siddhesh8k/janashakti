import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../../src/components/ToastProvider';
import { LocationProvider } from '../../../src/components/LocationProvider';

// Mock heavy modules and data hooks so the dashboard renders deterministically
// with no issues and an unauthorized user (the simplest, stable render path).
vi.mock('../../../src/utils/gemini', () => ({
  compressImage: vi.fn(() => Promise.resolve('mocked-compressed-image-base64')),
}));

vi.mock('../../../src/hooks/useIssues', () => ({
  useIssues: vi.fn(() => ({ issues: [], loading: false })),
}));

vi.mock('../../../src/hooks/usePagination', () => ({
  usePagination: vi.fn(() => ({ visible: [], hasMore: false, remaining: 0, showMore: vi.fn() })),
}));

vi.mock('../../../src/utils/authority', () => ({
  isAuthority: vi.fn(() => Promise.resolve(false)),
  enrollAuthority: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../../../src/agents/resolutionVerifier', () => ({
  verifyResolution: vi.fn(() => Promise.resolve({
    is_genuine: true,
    is_resolved: true,
    confidence: 90,
    reasoning: 'Mocked verification',
  })),
}));

vi.mock('../../../src/utils/exportToExcel', () => ({
  exportToExcel: vi.fn(() => Promise.resolve(true)),
}));

import AuthorityDashboard from '../../../src/screens/AuthorityDashboard';

describe('AuthorityDashboard (Smoke Test)', () => {
  const renderComponent = () =>
    render(
      <MemoryRouter>
        <ToastProvider>
          <LocationProvider>
            <AuthorityDashboard />
          </LocationProvider>
        </ToastProvider>
      </MemoryRouter>
    );

  it('renders the dashboard without crashing and displays the main title', () => {
    const { container } = renderComponent();
    expect(container).toBeTruthy();
    expect(screen.getByText('Authority Dashboard')).toBeInTheDocument();
  });

  it('displays the "Authority mode required" section when not authorized', () => {
    const { container } = renderComponent();
    expect(container).toBeTruthy();
    expect(screen.getByText('Authority mode required')).toBeInTheDocument();
  });

  it('displays the department filter dropdown', () => {
    const { container } = renderComponent();
    expect(container).toBeTruthy();
    // Department label is rendered as text, and a single <select> (combobox) exists.
    expect(screen.getByText('Department')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('displays the status filter buttons', () => {
    const { container } = renderComponent();
    expect(container).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Overdue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Critical' })).toBeInTheDocument();
  });

  it('displays the "No issues" message when no issues are loaded', () => {
    const { container } = renderComponent();
    expect(container).toBeTruthy();
    expect(screen.getByText(/No issues/i)).toBeInTheDocument();
  });
});
