import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import Toast from '../../../src/components/Toast';

describe('Toast Component', () => {
  // Test Case 1: Renders successfully with a message and default type (success)
  it('renders successfully with a message and default "success" type', () => {
    const testMessage = 'Operation completed successfully!';
    render(<Toast message={testMessage} />);

    // Assert that the message text is visible in the document
    const toastMessageElement = screen.getByText(testMessage);
    expect(toastMessageElement).toBeInTheDocument();

    // Assert that the main toast container (which holds the message and icon) is present.
    // We can find the closest div that contains the message and has common toast styles.
    const toastContainer = toastMessageElement.closest('div');
    expect(toastContainer).toBeInTheDocument();
    // A very generic style check to confirm it's the main toast div, without checking specific colors.
    expect(toastContainer).toHaveStyle('position: fixed');
  });

  // Test Case 2: Renders with 'error' type
  it('renders with the "error" type', () => {
    const testMessage = 'An error occurred!';
    render(<Toast message={testMessage} type="error" />);

    const toastMessageElement = screen.getByText(testMessage);
    expect(toastMessageElement).toBeInTheDocument();
    const toastContainer = toastMessageElement.closest('div');
    expect(toastContainer).toBeInTheDocument();
    // Per rules, we do not assert exact style values like background colors.
  });

  // Test Case 3: Renders with 'info' type
  it('renders with the "info" type', () => {
    const testMessage = 'Please note this information.';
    render(<Toast message={testMessage} type="info" />);

    const toastMessageElement = screen.getByText(testMessage);
    expect(toastMessageElement).toBeInTheDocument();
    const toastContainer = toastMessageElement.closest('div');
    expect(toastContainer).toBeInTheDocument();
  });

  // Test Case 4: Hides after the specified duration and calls onClose
  it('hides after the specified duration and calls the onClose callback', async () => {
    vi.useFakeTimers(); // Mock timers to control time
    const onCloseMock = vi.fn(); // Mock the onClose function
    const testMessage = 'This toast will disappear soon.';
    const duration = 2000; // 2 seconds

    render(<Toast message={testMessage} duration={duration} onClose={onCloseMock} />);

    // Initially, the toast message should be visible
    expect(screen.getByText(testMessage)).toBeInTheDocument();
    expect(onCloseMock).not.toHaveBeenCalled();

    // Advance timers by less than the duration. Wrap in act() because the
    // setTimeout callback triggers a React state update (setVisible).
    act(() => {
      vi.advanceTimersByTime(duration - 1);
    });
    expect(screen.getByText(testMessage)).toBeInTheDocument(); // Still visible
    expect(onCloseMock).not.toHaveBeenCalled();

    // Advance timers by the remaining time to reach the full duration
    act(() => {
      vi.advanceTimersByTime(1);
    });
    // Now, the toast should be hidden (not in the document)
    expect(screen.queryByText(testMessage)).not.toBeInTheDocument();
    // And the onClose callback should have been called
    expect(onCloseMock).toHaveBeenCalledTimes(1);

    vi.useRealTimers(); // Restore real timers after the test
  });

  // Test Case 5: Does not render if the message prop is empty or null
  it('does not render if the message prop is an empty string', () => {
    render(<Toast message="" />);
    // Query for any text content; it should not find the toast message
    expect(screen.queryByText(/./)).not.toBeInTheDocument();
  });

  it('does not render if the message prop is null', () => {
    render(<Toast message={null} />);
    expect(screen.queryByText(/./)).not.toBeInTheDocument();
  });

  // Test Case 6: Cleans up the timer on unmount to prevent memory leaks
  it('cleans up the timer on unmount, preventing onClose from being called prematurely', () => {
    vi.useFakeTimers();
    const onCloseMock = vi.fn();
    const testMessage = 'Toast to be unmounted before its time.';
    const duration = 5000; // A long duration

    const { unmount } = render(<Toast message={testMessage} duration={duration} onClose={onCloseMock} />);

    expect(screen.getByText(testMessage)).toBeInTheDocument();

    // Unmount the component before its timer expires
    unmount();

    // Advance timers past the original duration
    vi.advanceTimersByTime(duration);

    // The onClose callback should NOT have been called because the component was unmounted
    expect(onCloseMock).not.toHaveBeenCalled();
    // The message should also not be in the document as the component is unmounted
    expect(screen.queryByText(testMessage)).not.toBeInTheDocument();

    vi.useRealTimers();
  });
});