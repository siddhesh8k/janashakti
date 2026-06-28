import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PressureMeter from '../../../src/components/PressureMeter';

describe('PressureMeter', () => {
  // Test Case 1: Renders with default props (0 confirmations) in non-compact mode
  it('renders "0 confirmations" and "0%" by default in non-compact mode', () => {
    render(<PressureMeter />);

    // Assert the presence of the default confirmation text
    expect(screen.getByText('0 confirmations')).toBeInTheDocument();
    // Assert the presence of the default percentage text
    expect(screen.getByText('0%')).toBeInTheDocument();
    // The Users icon is an SVG and not queryable by text or accessible name.
    // Its presence is implied by the "confirmations" text being rendered.
  });

  // Test Case 2: Renders with various `confirmations` values in non-compact mode
  it('displays correct confirmation count and percentage for various values in non-compact mode', () => {
    const { rerender } = render(<PressureMeter confirmations={1} />);

    // Test with 1 confirmation (singular)
    expect(screen.getByText('1 confirmation')).toBeInTheDocument();
    expect(screen.getByText('10%')).toBeInTheDocument();

    // Test with 5 confirmations
    rerender(<PressureMeter confirmations={5} />);
    expect(screen.getByText('5 confirmations')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();

    // Test with 10 confirmations (at threshold)
    rerender(<PressureMeter confirmations={10} />);
    expect(screen.getByText('10 confirmations')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();

    // Test with 15 confirmations (above threshold, percentage capped at 100%)
    rerender(<PressureMeter confirmations={15} />);
    expect(screen.getByText('15 confirmations')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  // Test Case 3: Renders correctly in compact mode
  it('renders in compact mode, showing only percentage and no confirmation text', () => {
    render(<PressureMeter compact confirmations={5} />);

    // In compact mode, only the percentage should be visible
    expect(screen.getByText('50%')).toBeInTheDocument();

    // The confirmation count text and the Users icon should NOT be present
    expect(screen.queryByText(/confirmation/i)).not.toBeInTheDocument();
  });

  // Test Case 4: Percentage rounding
  it('rounds the displayed percentage correctly', () => {
    const { rerender } = render(<PressureMeter confirmations={0} />); // 0%
    expect(screen.getByText('0%')).toBeInTheDocument();

    rerender(<PressureMeter confirmations={0.4} />); // (0.4/10)*100 = 4%
    expect(screen.getByText('4%')).toBeInTheDocument();

    rerender(<PressureMeter confirmations={0.5} />); // (0.5/10)*100 = 5%
    expect(screen.getByText('5%')).toBeInTheDocument();

    rerender(<PressureMeter confirmations={0.6} />); // (0.6/10)*100 = 6%
    expect(screen.getByText('6%')).toBeInTheDocument();

    rerender(<PressureMeter confirmations={2.5} />); // (2.5/10)*100 = 25%
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  // Test Case 5: Confirmations pluralization
  it('handles pluralization of "confirmation" text correctly', () => {
    const { rerender } = render(<PressureMeter confirmations={0} />);
    expect(screen.getByText('0 confirmations')).toBeInTheDocument();

    rerender(<PressureMeter confirmations={1} />);
    // Expect singular "confirmation" for 1
    expect(screen.getByText('1 confirmation')).toBeInTheDocument();
    expect(screen.queryByText('1 confirmations')).not.toBeInTheDocument(); // Ensure plural is not present

    rerender(<PressureMeter confirmations={2} />);
    // Expect plural "confirmations" for 2
    expect(screen.getByText('2 confirmations')).toBeInTheDocument();
  });

  // Test Case 6: Compact mode with different confirmation values
  it('displays correct percentage in compact mode for various confirmation values', () => {
    const { rerender } = render(<PressureMeter compact confirmations={1} />);
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.queryByText(/confirmation/i)).not.toBeInTheDocument();

    rerender(<PressureMeter compact confirmations={10} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.queryByText(/confirmation/i)).not.toBeInTheDocument();

    rerender(<PressureMeter compact confirmations={15} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.queryByText(/confirmation/i)).not.toBeInTheDocument();
  });
});