/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { AuthorInsightsSelector } = require('./AuthorInsightsSelector');

const OPTIONS = [
  { login: 'octocat', name: 'The Octocat' },
  { login: 'hubot', name: 'Hubot' },
];

describe('AuthorInsightsSelector', () => {
  test('given options, when rendering, then the select shows each author by display name', () => {
    render(<AuthorInsightsSelector options={OPTIONS} selectedLogin="octocat" onChange={() => {}} />);

    const select = screen.getByLabelText('Author');
    expect(select).toHaveValue('octocat');
    expect(screen.getByRole('option', { name: 'The Octocat' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Hubot' })).toBeInTheDocument();
  });

  test('given no options, when rendering, then nothing is rendered', () => {
    const { container } = render(<AuthorInsightsSelector options={[]} selectedLogin="" onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('given a user selects a different author, when selecting, then onChange fires with that login', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<AuthorInsightsSelector options={OPTIONS} selectedLogin="octocat" onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText('Author'), 'hubot');

    expect(screen.getByLabelText('Author')).toHaveValue('hubot');
    expect(onChange).toHaveBeenCalledWith('hubot');
  });

  test('given a re-render with a different key (matching the discard-and-rebuild bridge), when selectedLogin changes, then it reflects the new value', () => {
    const { rerender } = render(
      <AuthorInsightsSelector key={1} options={OPTIONS} selectedLogin="octocat" onChange={() => {}} />,
    );
    expect(screen.getByLabelText('Author')).toHaveValue('octocat');

    rerender(<AuthorInsightsSelector key={2} options={OPTIONS} selectedLogin="hubot" onChange={() => {}} />);

    expect(screen.getByLabelText('Author')).toHaveValue('hubot');
  });
});
