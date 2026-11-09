import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { Group, Row, Section } from '../List';

describe('Row', () => {
  it('renders a div by default, a button with onClick, a link with to', async () => {
    const onClick = vi.fn();
    render(
      <MemoryRouter>
        <Section>Team</Section>
        <Group>
          <Row label="Plain" value="7" />
          <Row label="Tap me" detail="detail text" onClick={onClick} chevron />
          <Row label="Go" to="/team" link />
        </Group>
      </MemoryRouter>,
    );
    expect(screen.getByText('Plain').closest('.row')?.tagName).toBe('DIV');
    const btn = screen.getByRole('button', { name: /Tap me/ });
    expect(btn).toHaveTextContent('detail text');
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
    const link = screen.getByRole('link', { name: 'Go' });
    expect(link).toHaveAttribute('href', '/team');
    expect(link).toHaveClass('row', 'link');
  });

  it('renders an emoji icon as text and an svg icon in a tile', () => {
    render(
      <Group>
        <Row icon="⚽" label="Soccer" />
        <Row icon={<svg data-testid="svg" />} iconColor="rgb(1, 2, 3)" label="Export" />
      </Group>,
    );
    expect(screen.getByText('⚽')).toHaveClass('icon', 'emoji');
    expect(screen.getByTestId('svg').parentElement).toHaveStyle({ background: 'rgb(1, 2, 3)' });
  });
});
