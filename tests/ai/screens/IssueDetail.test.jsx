import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from '../../../src/components/ToastProvider';
import { LocationProvider } from '../../../src/components/LocationProvider';

// Hoisted mock fns (referenced inside hoisted vi.mock factories).
const { mockOnSnapshot, mockUpdateDoc, mockUnsubscribe } = vi.hoisted(() => ({
  mockOnSnapshot: vi.fn(),
  mockUpdateDoc: vi.fn(() => Promise.resolve()),
  mockUnsubscribe: vi.fn(),
}));

// Override Firestore (setup.js mocks it globally; per-file mock takes precedence).
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  onSnapshot: mockOnSnapshot,
  updateDoc: mockUpdateDoc,
  increment: vi.fn((n) => n),
}));

// Heavy / external utilities and components — no-op stubs.
vi.mock('../../../src/utils/gemini', () => ({
  generateRTI: vi.fn(() => Promise.resolve('Mock RTI Text')),
}));
vi.mock('../../../src/utils/cloudinary', () => ({
  videoPosterUrl: vi.fn((url) => `mock-poster-${url}`),
  cloudinaryThumb: vi.fn((url) => `mock-thumb-${url}`),
}));
vi.mock('../../../src/utils/social', () => ({
  getShareLinks: vi.fn(() => ({
    xShare: 'mock-x-share',
    whatsapp: 'mock-whatsapp',
    linkedin: 'mock-linkedin',
    facebook: 'mock-facebook',
    telegram: 'mock-telegram',
    retweet: 'mock-retweet',
  })),
}));
vi.mock('../../../src/utils/n8n', () => ({
  triggerN8N: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../../src/utils/escalation', () => ({
  checkAndEscalate: vi.fn(() => Promise.resolve({ escalated: false })),
  getEscalationInfo: vi.fn(() => ({
    currentLevel: 0,
    currentAuthority: 'Local Municipality',
    color: '#16a34a',
    daysOpen: 5,
    nextAuthority: 'District Collector',
    daysUntilNextEscalation: 10,
  })),
}));
vi.mock('../../../src/utils/geo', () => ({
  distanceKm: vi.fn(() => 0.1), // within verification radius
  VERIFY_RADIUS_KM: 0.5,
}));
vi.mock('../../../src/constants/representatives', () => ({
  getWardRepresentative: vi.fn(() => null),
  getRepresentativeForCity: vi.fn(() => null),
}));
vi.mock('../../../src/utils/publicProfile', () => ({
  bumpPublicProfile: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../../src/utils/confirmIssue', () => ({
  confirmIssue: vi.fn(() => Promise.resolve({ alreadyConfirmed: false, shouldPost: false, newCount: 4 })),
}));

import IssueDetail from '../../../src/screens/IssueDetail';

describe('IssueDetail (Smoke Test)', () => {
  const mockIssue = {
    id: 'test-issue-id',
    issueType: 'Pothole',
    severity: 'High',
    description: 'Large pothole causing traffic issues.',
    status: 'Reported',
    createdAt: { toDate: () => new Date() },
    locationText: 'Test Location, City',
    confirmations: 3,
    userId: 'reporter-uid', // not the current user -> verify enabled
    photoUrl: 'https://example.com/photo.jpg',
    mediaType: 'image',
    location: { lat: 1, lng: 1 },
    complaintId: 'COMPLAINT123',
    prediction: { priority_score: 80, predicted_days: 15, escalation_risk: 'High' },
    routedTo: { departmentName: 'Public Works', emailSent: true },
    confirmedBy: [],
  };

  const renderAt = (id = 'test-issue-id') =>
    render(
      <MemoryRouter initialEntries={[`/issue/${id}`]}>
        <ToastProvider>
          <LocationProvider>
            <Routes>
              <Route path="/issue/:id" element={<IssueDetail />} />
            </Routes>
          </LocationProvider>
        </ToastProvider>
      </MemoryRouter>
    );

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: snapshot resolves to a valid existing issue.
    mockOnSnapshot.mockImplementation((_docRef, cb) => {
      cb({ exists: () => true, id: mockIssue.id, data: () => mockIssue });
      return mockUnsubscribe;
    });
  });

  it('renders without crashing when an issue is available', async () => {
    const { container } = renderAt();
    await waitFor(() => {
      expect(container).toBeTruthy();
      expect(screen.getAllByText(mockIssue.issueType).length).toBeGreaterThan(0);
    });
  });

  it('displays "Issue not found" when the issue does not exist', async () => {
    mockOnSnapshot.mockImplementation((_docRef, cb) => {
      cb({ exists: () => false, id: 'non-existent-id', data: () => null });
      return mockUnsubscribe;
    });
    const { container } = renderAt('non-existent-id');
    await waitFor(() => {
      expect(container).toBeTruthy();
      expect(screen.getByText('Issue not found')).toBeInTheDocument();
    });
  });

  it('displays the issue description when loaded', async () => {
    const { container } = renderAt();
    await waitFor(() => {
      expect(container).toBeTruthy();
      expect(screen.getByText(mockIssue.description)).toBeInTheDocument();
    });
  });

  it('renders the location text and time-ago information', async () => {
    const { container } = renderAt();
    await waitFor(() => {
      expect(container).toBeTruthy();
      expect(screen.getByText(/Test Location, City/)).toBeInTheDocument();
    });
  });
});
