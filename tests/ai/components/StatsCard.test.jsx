import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import StatsCard from '../../../src/components/StatsCard';

// Mock icon component for testing purposes.
// This allows us to assert its presence using data-testid without violating the rule
// against querying icons by ARIA role or accessible name.
const MockIcon = (props) => <svg data-testid="mock-icon" {...props} />;

describe('StatsCard', () => {
  // Test 1: Renders with basic label and numeric value
  it('renders the label and numeric value correctly with default color', () => {
    const label = 'Total Users';
    const value = 123;
    render(<StatsCard label={label} value={value} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(value.toString())).toBeInTheDocument();
    expect(screen.queryByTestId('mock-icon')).not.toBeInTheDocument();
  });

  // Test 2: Renders with a custom color prop (asserting text content, not color itself)
  it('renders label and value when a custom color prop is provided', () => {
    const label = 'Active Sessions';
    const value = 45;
    const customColor = '#ff0000'; // Red color
    render(<StatsCard label={label} value={value} color={customColor} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(value.toString())).toBeInTheDocument();
    // As per rules, we do not assert exact style values like color.
    // This test primarily ensures the component renders correctly when a color prop is passed.
  });

  // Test 3: Renders the icon component when the icon prop is provided
  it('renders the icon component when an icon prop is passed', () => {
    const label = 'New Messages';
    const value = 7;
    render(<StatsCard label={label} value={value} icon={MockIcon} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(value.toString())).toBeInTheDocument();
    expect(screen.getByTestId('mock-icon')).toBeInTheDocument();
  });

  // Test 4: Does not render an icon when the icon prop is not provided
  it('does not render an icon component when the icon prop is omitted', () => {
    const label = 'Page Views';
    const value = 1000;
    render(<StatsCard label={label} value={value} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(value.toString())).toBeInTheDocument();
    expect(screen.queryByTestId('mock-icon')).not.toBeInTheDocument();
  });

  // Test 5: Handles null or undefined value prop, defaulting to 0
  it('defaults the value to 0 when the value prop is null or undefined', () => {
    // Each StatsCard is rendered into its own container so the duplicate "0"
    // values do not collide when both cards are present in the document.
    const labelNull = 'Null Value';
    const { container: nullContainer } = render(<StatsCard label={labelNull} value={null} />);
    expect(within(nullContainer).getByText(labelNull)).toBeInTheDocument();
    expect(within(nullContainer).getByText('0')).toBeInTheDocument();

    const labelUndefined = 'Undefined Value';
    const { container: undefinedContainer } = render(<StatsCard label={labelUndefined} value={undefined} />);
    expect(within(undefinedContainer).getByText(labelUndefined)).toBeInTheDocument();
    expect(within(undefinedContainer).getByText('0')).toBeInTheDocument();
  });

  // Test 6: Renders string value correctly
  it('renders a string value correctly', () => {
    const label = 'Status';
    const value = 'N/A';
    render(<StatsCard label={label} value={value} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(value)).toBeInTheDocument();
  });

  // Test 7: Renders with a very long label and value to check content handling
  it('renders correctly with long label and value text', () => {
    const longLabel = 'This is a very long label to test how the component handles extensive text content that might wrap or overflow';
    const longValue = '987654321098765432109876543210';
    render(<StatsCard label={longLabel} value={longValue} />);

    expect(screen.getByText(longLabel)).toBeInTheDocument();
    expect(screen.getByText(longValue)).toBeInTheDocument();
  });
});