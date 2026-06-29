import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../../src/components/ToastProvider';
import { LocationProvider } from '../../../src/components/LocationProvider';
import AuthorityDashboard from '../../../src/screens/AuthorityDashboard';
import { AUTHORITY_THRESHOLD } from '../../../src/constants/issueTypes';

// Mock external modules and Firebase functions
vi.mock('../../../src/utils/gemini', () => ({
  compressImage: vi.fn(() => Promise.resolve('mocked-base64-image')),
}));

vi.mock('../../../src/utils/authority', () => ({
  isAuthority: vi.fn(() => Promise.resolve(false)), // Default to not authorized
  enrollAuthority: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../../../src/agents/resolutionVerifier', () => ({
  verifyResolution: vi.fn(() => Promise.resolve({ is_genuine: true, is_resolved: true, confidence: 0.9, reasoning: 'Mocked verification' })),
}));

vi.mock('../../../src/agents/esgScorer', () => ({
  scoreESGImpact: vi.fn(() => Promise.resolve({ overall_esg: 7 })),
}));

vi.mock('../../../src/utils/exportToExcel', () => ({
  exportToExcel: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../../../src/utils/publicProfile', () => ({
  bumpPublicProfile: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../../src/utils/validation', () => ({
  isValidImageFile: vi.fn(() => true),
  MESSAGES: { badImage: 'Bad image' },
}));

// Mock firebase/firestore functions that are directly imported
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    doc: vi.fn(),
    updateDoc: vi.fn(),
    setDoc: vi.fn(),
    serverTimestamp: vi.fn(() => 'mock-timestamp'),
    arrayUnion: vi.fn((...args) => args),
    increment: vi.fn((val) => val),
  };
});

// Mock auth.currentUser
vi.mock('../firebase', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    auth: {
      ...actual.auth,
      currentUser: { uid: 'test-uid' },
    },
  };
});

// Mock data hooks
const mockUseIssues = vi.hoisted(() => vi.fn(() => ({ issues: [], loading: false })));
vi.mock('../../../src/hooks/useIssues', () => ({
  useIssues: mockUseIssues,
}));

const mockUseAuth = vi.hoisted(() => vi.fn(() => ({ userProfile: { uid: 'test-uid', civicScore: 0 }, loading: false })));
vi.mock('../../../src/hooks/useAuth', () => ({
  useAuth: mockUseAuth,
}));

const mockIsAuthority = vi.hoisted(() => vi.fn(() => Promise.resolve(false)));
vi.mock('../../../src/utils/authority', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isAuthority: mockIsAuthority,
  };
});


describe('AuthorityDashboard SMOKE tests', () => {
  // Reset mocks before each test to ensure isolation
  beforeEach(() => {
    mockUseIssues.mockClear();
    mockUseAuth.mockClear();
    mockIsAuthority.mockClear();
    vi.mocked(mockUseIssues).mockReturnValue({ issues: [], loading: false });
    vi.mocked(mockUseAuth).mockReturnValue({ userProfile: { uid: 'test-uid', civicScore: 0 }, loading: false });
    vi.mocked(mockIsAuthority).mockResolvedValue(false);
  });

  it('renders without crashing in default state (not qualified, not authorized)', () => {
    const { container, getByText } = render(
      <MemoryRouter>
        <ToastProvider>
          <LocationProvider>
            <AuthorityDashboard />
          </LocationProvider>
        </ToastProvider>
      </MemoryRouter>
    );
    expect(container).toBeTruthy();
    expect(getByText('Civic Authority — locked')).toBeTruthy();
  });

  it('renders the loading state without crashing', () => {
    vi.mocked(mockUseIssues).mockReturnValue({ issues: [], loading: true });

    const { container, getByText } = render(
      <MemoryRouter>
        <ToastProvider>
          <LocationProvider>
            <AuthorityDashboard />
          </LocationProvider>
        </ToastProvider>
      </MemoryRouter>
    );
    expect(container).toBeTruthy();
    expect(getByText('Authority Dashboard')).toBeTruthy(); // TopNav title is always present
  });

  it('renders without crashing when qualified but not yet authorized', async () => {
    vi.mocked(mockUseAuth).mockReturnValue({ userProfile: { uid: 'test-uid', civicScore: AUTHORITY_THRESHOLD }, loading: false });
    vi.mocked(mockIsAuthority).mockResolvedValue(false); // Still not in the allowlist

    const { container, getByText } = render(
      <MemoryRouter>
        <ToastProvider>
          <LocationProvider>
            <AuthorityDashboard />
          </LocationProvider>
        </ToastProvider>
      </MemoryRouter>
    );
    expect(container).toBeTruthy();
    expect(getByText('Civic Authority unlocked')).toBeTruthy();
  });

  it('renders without crashing when authorized (and qualified)', async () => {
    vi.mocked(mockUseAuth).mockReturnValue({ userProfile: { uid: 'test-uid', civicScore: AUTHORITY_THRESHOLD }, loading: false });
    vi.mocked(mockIsAuthority).mockResolvedValue(true); // Now authorized

    const { container, getByText } = render(
      <MemoryRouter>
        <ToastProvider>
          <LocationProvider>
            <AuthorityDashboard />
          </LocationProvider>
        </ToastProvider>
      </MemoryRouter>
    );
    expect(container).toBeTruthy();
    expect(getByText('Export to Excel (Privacy Safe)')).toBeTruthy();
  });

  it('renders with no issues message when no issues are present', () => {
    vi.mocked(mockUseIssues).mockReturnValue({ issues: [], loading: false });
    vi.mocked(mockUseAuth).mockReturnValue({ userProfile: { uid: 'test-uid', civicScore: 0 }, loading: false });

    const { container, getByText } = render(
      <MemoryRouter>
        <ToastProvider>
          <LocationProvider>
            <AuthorityDashboard />
          </LocationProvider>
        </ToastProvider>
      </MemoryRouter>
    );
    expect(container).toBeTruthy();
    expect(getByText('No issues.')).toBeTruthy();
  });
});