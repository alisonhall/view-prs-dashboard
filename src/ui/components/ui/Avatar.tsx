/**
 * A person's initials in a circle, coloured by a stable hash of their login
 * (from a palette in pr-table.css), with a ring when it's the viewer. It's
 * decorative on its own: put it inside something that names the person.
 */
export interface AvatarProps {
  initials: string;
  login: string;
  isViewer?: boolean;
  size?: 'sm' | 'md';
}

const hueFor = (login: string) => [...login.toLowerCase()].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 8;

export function Avatar({ initials, login, isViewer = false, size = 'md' }: AvatarProps) {
  return (
    <span
      className="ui-avatar"
      data-hue={hueFor(login || initials)}
      data-size={size}
      data-viewer={isViewer ? 'true' : undefined}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
