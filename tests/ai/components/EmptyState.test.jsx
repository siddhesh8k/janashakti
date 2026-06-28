import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock lucide-react to control the icon component and assert its rendering.
// This allows us to verify which icon component is used and what props are passed to it.
// vi.mock is hoisted, so the mock fn must be created via vi.hoisted to be available
// inside the (also hoisted) factory.
const { MockInboxIcon } = vi.hoisted(() => ({
  MockInboxIcon: vi.fn((props) => <svg data-testid="mock-inbox-icon" {...props} />),
}));
vi.mock('lucide-react', () => ({
  Inbox: MockInboxIcon,
}));

import EmptyState from '../../../src/components/EmptyState';

describe('EmptyState Component', () => {
  // Test Case 1: Renders with default props (title, no message, default icon)
  it('should render with default title, no message, and the default Inbox icon when no props are provided', () => {
    render(<EmptyState />);

    // Assert default title is visible
    expect(screen.getByText('No items yet')).toBeInTheDocument();

    // Assert that the message paragraph is not rendered by default (as message is empty)
    expect(screen.queryByText(/message/i)).not.toBeInTheDocument();
    // Also ensure no empty paragraph is mistakenly found as a message
    expect(screen.queryByText('', { selector: 'p' })).not.toBeInTheDocument();

    // Assert the default Inbox icon is rendered and received correct props.
    // React passes a second arg to function components, so assert the first arg only.
    expect(screen.getByTestId('mock-inbox-icon')).toBeInTheDocument();
    expect(MockInboxIcon.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        size: 48,
        color: '#1a2f4a',
        strokeWidth: 1,
        style: expect.objectContaining({ marginBottom: '12px' }),
      })
    );
  });

  // Test Case 2: Renders with custom title and message
  it('should render with custom title and message when both props are provided', () => {
    const customTitle = 'My Custom Empty State Title';
    const customMessage = 'This is a detailed custom message for the empty state.';
    render(<EmptyState title={customTitle} message={customMessage} />);

    // Assert custom title is visible
    expect(screen.getByText(customTitle)).toBeInTheDocument();

    // Assert custom message is visible
    expect(screen.getByText(customMessage)).toBeInTheDocument();

    // Ensure the default icon is still rendered when other props are custom
    expect(screen.getByTestId('mock-inbox-icon')).toBeInTheDocument();
  });

  // Test Case 3: Renders without a message when the message prop is explicitly an empty string
  it('should not render the message paragraph when the message prop is an empty string', () => {
    const customTitle = 'Items are missing';
    render(<EmptyState title={customTitle} message="" />);

    // Assert title is present
    expect(screen.getByText(customTitle)).toBeInTheDocument();

    // Assert that the message paragraph is not rendered
    expect(screen.queryByText(/message/i)).not.toBeInTheDocument();
    expect(screen.queryByText('', { selector: 'p' })).not.toBeInTheDocument(); // Ensure no empty paragraph is found as a message

    // Ensure the default icon is still rendered
    expect(screen.getByTestId('mock-inbox-icon')).toBeInTheDocument();
  });

  // Test Case 4: Renders with a custom icon component
  it('should render with a custom icon component when the icon prop is provided', () => {
    // Define a simple custom icon component for testing purposes
    const CustomTestIcon = vi.fn((props) => <svg data-testid="custom-test-icon" {...props} />);

    render(<EmptyState title="Custom Icon Display" icon={CustomTestIcon} />);

    // Assert the custom icon is rendered and received correct props.
    // React passes a second arg to function components, so assert the first arg only.
    expect(screen.getByTestId('custom-test-icon')).toBeInTheDocument();
    expect(CustomTestIcon.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        size: 48,
        color: '#1a2f4a',
        strokeWidth: 1,
        style: expect.objectContaining({ marginBottom: '12px' }),
      })
    );

    // Assert the default Inbox icon is NOT rendered when a custom one is provided
    expect(screen.queryByTestId('mock-inbox-icon')).not.toBeInTheDocument();

    // Assert the title is still present
    expect(screen.getByText('Custom Icon Display')).toBeInTheDocument();
  });

  // Test Case 5: Renders with an empty title string
  it('should render an empty title paragraph when the title prop is an empty string', () => {
    const customMessage = 'This message should still be visible even with an empty title.';
    render(<EmptyState title="" message={customMessage} />);

    // Assert message is present
    expect(screen.getByText(customMessage)).toBeInTheDocument();

    // Assert that the title paragraph exists but contains no text.
    // The component renders two paragraphs when a message is present: one for title, one for message.
    // The title paragraph is always the first <p> element.
    const paragraphs = screen.getAllByRole('paragraph');
    expect(paragraphs.length).toBe(2); // One for title, one for message
    expect(paragraphs[0]).toBeInTheDocument();
    expect(paragraphs[0]).toHaveTextContent(''); // The first paragraph (title) should be empty

    // Ensure the default icon is still rendered
    expect(screen.getByTestId('mock-inbox-icon')).toBeInTheDocument();
  });
});