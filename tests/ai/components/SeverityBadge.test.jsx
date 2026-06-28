import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// SeverityBadge renders a <span> with the severity text and an inline style
// produced by the pure `severityStyle` helper. The helper has no external
// dependencies, so we test the real rendered output rather than mocking it.
import SeverityBadge from '../../../src/components/SeverityBadge';

describe('SeverityBadge', () => {
  it('renders "Low" severity text inside a span', () => {
    const { container } = render(<SeverityBadge severity="Low" />);

    const badgeElement = screen.getByText('Low');
    expect(badgeElement).toBeInTheDocument();
    expect(container.querySelector('span')).toBe(badgeElement);
  });

  it('renders "Medium" severity text inside a span', () => {
    render(<SeverityBadge severity="Medium" />);

    const badgeElement = screen.getByText('Medium');
    expect(badgeElement).toBeInTheDocument();
    expect(badgeElement.tagName).toBe('SPAN');
  });

  it('renders "High" severity text inside a span', () => {
    render(<SeverityBadge severity="High" />);

    const badgeElement = screen.getByText('High');
    expect(badgeElement).toBeInTheDocument();
    expect(badgeElement.tagName).toBe('SPAN');
  });

  it('renders an arbitrary/unknown severity string verbatim', () => {
    render(<SeverityBadge severity="critical-alert" />);

    const badgeElement = screen.getByText('critical-alert');
    expect(badgeElement).toBeInTheDocument();
    expect(badgeElement.tagName).toBe('SPAN');
  });

  it('renders an empty span when severity is an empty string', () => {
    const { container } = render(<SeverityBadge severity="" />);

    // For an empty string there is no visible text to query, so we assert
    // on the span element directly.
    const badgeElement = container.querySelector('span');
    expect(badgeElement).toBeInTheDocument();
    expect(badgeElement).toHaveTextContent('');
  });
});
