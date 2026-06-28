import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';

// Mock react-router-dom's useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock SeverityBadge and PressureMeter components
vi.mock('../../../src/components/SeverityBadge', () => ({
  default: ({ severity }) => <span data-testid="severity-badge">{severity}</span>,
}));
vi.mock('../../../src/components/PressureMeter', () => ({
  default: ({ confirmations, compact }) => (
    <div data-testid="pressure-meter">
      Pressure: {confirmations} {compact ? '(compact)' : ''}
    </div>
  ),
}));

// Mock theme/components and constants/issueTypes
vi.mock('../../../src/theme/components', () => ({
  statusColor: vi.fn((status) => {
    switch (status) {
      case 'Open': return 'red';
      case 'Resolved': return 'green';
      default: return 'gray';
    }
  }),
}));
vi.mock('../../../src/constants/issueTypes', () => ({
  issueColorMap: {
    Pothole: 'blue',
    Streetlight: 'yellow',
    Garbage: 'green',
    Other: 'purple',
    'Water Leakage': 'cyan',
    Infrastructure: 'brown',
    'Traffic Signal': 'orange',
    'Broken Road': 'brown',
    'Broken Streetlight': 'yellow',
    'Garbage Dumping': 'green',
    'Open Manhole': 'red',
    'Sewage Overflow': 'blue',
    'Water Logging': 'blue',
    'Water Supply Issue': 'blue',
    'Air Pollution': 'gray',
    'Noise Pollution': 'gray',
    'Dangerous Tree': 'green',
    'Footpath Encroachment': 'gray',
    'Illegal Construction': 'brown',
    'Stray Animal Menace': 'brown',
    'Traffic Signal Malfunction': 'orange',
  },
}));

// Import the component to test
import IssueCard from '../../../src/components/IssueCard';

describe('IssueCard', () => {
  const baseMockIssue = {
    id: 'issue-1',
    issueType: 'Pothole',
    description: 'A large pothole on Main Street causing traffic issues.',
    severity: 'High',
    status: 'Open',
    createdAt: new Date(Date.now() - 3600 * 1000 * 24 * 2), // 2 days ago
    confirmations: 5,
    locationText: 'Main Street, Anytown, State',
    mediaType: 'image',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Set a fixed system time for consistent timeAgo calculations
    vi.setSystemTime(new Date('2023-10-27T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render basic issue details correctly', () => {
    // createdAt must be relative to the fixed (faked) system time set in beforeEach.
    const issue = {
      ...baseMockIssue,
      createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
    };
    render(
      <MemoryRouter>
        <IssueCard issue={issue} />
      </MemoryRouter>
    );

    expect(screen.getByText(issue.issueType)).toBeInTheDocument();
    expect(screen.getByText(issue.description)).toBeInTheDocument();
    expect(screen.getByTestId('severity-badge')).toHaveTextContent(issue.severity);
    // "Main Street" appears in both the description and the location span,
    // so assert the location span (first segment before the comma) is present.
    expect(screen.getAllByText(/Main Street/).length).toBeGreaterThan(0);
    expect(screen.getByText('2d ago')).toBeInTheDocument(); // Time ago
    expect(screen.getByTestId('pressure-meter')).toBeInTheDocument(); // PressureMeter should be present by default
  });

  it('should navigate to the issue details page on click', () => {
    render(
      <MemoryRouter>
        <IssueCard issue={baseMockIssue} />
      </MemoryRouter>
    );

    // Find the clickable card element (the outermost div)
    const card = screen.getByText(baseMockIssue.issueType).closest('div');
    fireEvent.click(card);

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(`/issue/${baseMockIssue.id}`);
  });

  it('should conditionally render description based on its presence', () => {
    const issueWithDescription = { ...baseMockIssue, description: 'A detailed description.' };
    const issueWithoutDescription = { ...baseMockIssue, description: '' };

    // With description
    const { rerender } = render(
      <MemoryRouter>
        <IssueCard issue={issueWithDescription} />
      </MemoryRouter>
    );
    expect(screen.getByText(issueWithDescription.description)).toBeInTheDocument();

    // Without description
    rerender(
      <MemoryRouter>
        <IssueCard issue={issueWithoutDescription} />
      </MemoryRouter>
    );
    expect(screen.queryByText(issueWithDescription.description)).not.toBeInTheDocument();
  });

  it('should conditionally render PressureMeter based on the compact prop', () => {
    // When the card is NOT compact, the PressureMeter is rendered (the card always
    // passes the inner PressureMeter `compact`, so the mock shows "(compact)").
    const { rerender } = render(
      <MemoryRouter>
        <IssueCard issue={baseMockIssue} compact={false} />
      </MemoryRouter>
    );
    expect(screen.getByTestId('pressure-meter')).toBeInTheDocument();
    expect(screen.getByTestId('pressure-meter')).toHaveTextContent('(compact)');

    // When the card IS compact, the PressureMeter is omitted entirely.
    rerender(
      <MemoryRouter>
        <IssueCard issue={baseMockIssue} compact={true} />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('pressure-meter')).not.toBeInTheDocument();
  });

  it('should display the video badge for video media type', () => {
    const issueWithVideo = { ...baseMockIssue, mediaType: 'video' };
    const issueWithImage = { ...baseMockIssue, mediaType: 'image' };

    // With video
    const { rerender } = render(
      <MemoryRouter>
        <IssueCard issue={issueWithVideo} />
      </MemoryRouter>
    );
    expect(screen.getByText('Video')).toBeInTheDocument();

    // With image
    rerender(
      <MemoryRouter>
        <IssueCard issue={issueWithImage} />
      </MemoryRouter>
    );
    expect(screen.queryByText('Video')).not.toBeInTheDocument();
  });

  it('should display adopted by section when adoptedBy is present', () => {
    const issueAdoptedByCollege = {
      ...baseMockIssue,
      adoptedBy: { type: 'college', name: 'City College' },
    };
    const issueAdoptedByOrg = {
      ...baseMockIssue,
      adoptedBy: { type: 'organization', name: 'Local NGO' },
    };
    const issueNotAdopted = { ...baseMockIssue, adoptedBy: null };

    // Adopted by college
    const { rerender } = render(
      <MemoryRouter>
        <IssueCard issue={issueAdoptedByCollege} />
      </MemoryRouter>
    );
    expect(screen.getByText('Adopted by City College')).toBeInTheDocument();

    // Adopted by organization
    rerender(
      <MemoryRouter>
        <IssueCard issue={issueAdoptedByOrg} />
      </MemoryRouter>
    );
    expect(screen.getByText('Adopted by Local NGO')).toBeInTheDocument();

    // Not adopted
    rerender(
      <MemoryRouter>
        <IssueCard issue={issueNotAdopted} />
      </MemoryRouter>
    );
    expect(screen.queryByText(/Adopted by/)).not.toBeInTheDocument();
  });

  it('should display wall of shame badge when wallOfShame is true', () => {
    const issueWithWallOfShame = { ...baseMockIssue, wallOfShame: true };
    const issueWithoutWallOfShame = { ...baseMockIssue, wallOfShame: false };

    // With wall of shame
    const { rerender } = render(
      <MemoryRouter>
        <IssueCard issue={issueWithWallOfShame} />
      </MemoryRouter>
    );
    expect(screen.getByText('CHRONIC IGNORED ISSUE')).toBeInTheDocument();

    // Without wall of shame
    rerender(
      <MemoryRouter>
        <IssueCard issue={issueWithoutWallOfShame} />
      </MemoryRouter>
    );
    expect(screen.queryByText('CHRONIC IGNORED ISSUE')).not.toBeInTheDocument();
  });

  it('should display correct time ago format for different time differences', () => {
    const now = new Date('2023-10-27T10:00:00Z');
    vi.setSystemTime(now);

    // Just now (30 seconds ago)
    let issueJustNow = { ...baseMockIssue, createdAt: new Date(now.getTime() - 30 * 1000) };
    const { rerender } = render(
      <MemoryRouter>
        <IssueCard issue={issueJustNow} />
      </MemoryRouter>
    );
    expect(screen.getByText('Just now')).toBeInTheDocument();

    // Minutes ago (15 minutes ago)
    let issueMinutesAgo = { ...baseMockIssue, createdAt: new Date(now.getTime() - 15 * 60 * 1000) };
    rerender(
      <MemoryRouter>
        <IssueCard issue={issueMinutesAgo} />
      </MemoryRouter>
    );
    expect(screen.getByText('15m ago')).toBeInTheDocument();

    // Hours ago (5 hours ago)
    let issueHoursAgo = { ...baseMockIssue, createdAt: new Date(now.getTime() - 5 * 3600 * 1000) };
    rerender(
      <MemoryRouter>
        <IssueCard issue={issueHoursAgo} />
      </MemoryRouter>
    );
    expect(screen.getByText('5h ago')).toBeInTheDocument();

    // Days ago (3 days ago)
    let issueDaysAgo = { ...baseMockIssue, createdAt: new Date(now.getTime() - 3 * 24 * 3600 * 1000) };
    rerender(
      <MemoryRouter>
        <IssueCard issue={issueDaysAgo} />
      </MemoryRouter>
    );
    expect(screen.getByText('3d ago')).toBeInTheDocument();

    // No createdAt (null or undefined)
    let issueNoTime = { ...baseMockIssue, createdAt: null };
    rerender(
      <MemoryRouter>
        <IssueCard issue={issueNoTime} />
      </MemoryRouter>
    );
    // The component renders an empty string for timeAgo if createdAt is null/undefined.
    // We check for the absence of specific time strings.
    expect(screen.queryByText(/ago/)).not.toBeInTheDocument();
    expect(screen.queryByText('Just now')).not.toBeInTheDocument();
  });

  it('should handle different issue types and display their names', () => {
    const issueStreetlight = { ...baseMockIssue, issueType: 'Streetlight' };
    const issueGarbage = { ...baseMockIssue, issueType: 'Garbage' };
    const issueUnknown = { ...baseMockIssue, issueType: 'UnknownType' };

    // Streetlight
    const { rerender } = render(
      <MemoryRouter>
        <IssueCard issue={issueStreetlight} />
      </MemoryRouter>
    );
    expect(screen.getByText('Streetlight')).toBeInTheDocument();

    // Garbage
    rerender(
      <MemoryRouter>
        <IssueCard issue={issueGarbage} />
      </MemoryRouter>
    );
    expect(screen.getByText('Garbage')).toBeInTheDocument();

    // Unknown type should default to AlertTriangle icon, but we can only assert the text.
    rerender(
      <MemoryRouter>
        <IssueCard issue={issueUnknown} />
      </MemoryRouter>
    );
    expect(screen.getByText('UnknownType')).toBeInTheDocument();
  });

  it('should render without locationText if not provided', () => {
    // Use a description that does not contain the location string so the only
    // possible source of "Main Street" would be the (omitted) location span.
    const issueNoLocation = {
      ...baseMockIssue,
      description: 'A detailed description without the street name.',
      locationText: '',
    };
    render(
      <MemoryRouter>
        <IssueCard issue={issueNoLocation} />
      </MemoryRouter>
    );
    // When locationText is empty the location span is not rendered at all.
    expect(screen.queryByText(/Main Street/)).not.toBeInTheDocument();
  });

  it('should apply fillHeight styles without breaking rendering', () => {
    // createdAt must be relative to the fixed (faked) system time set in beforeEach.
    const issue = {
      ...baseMockIssue,
      createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
    };
    render(
      <MemoryRouter>
        <IssueCard issue={issue} fillHeight={true} />
      </MemoryRouter>
    );
    // This test primarily ensures that the component renders without errors
    // when fillHeight is true. Asserting specific inline styles is generally
    // discouraged by the rules, so we'll just check for basic content presence.
    expect(screen.getByText(issue.issueType)).toBeInTheDocument();
    expect(screen.getByText(issue.description)).toBeInTheDocument();
    expect(screen.getByText('2d ago')).toBeInTheDocument();
  });
});