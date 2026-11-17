/**
 * A view's heading and a line on what it's for, at the top of its panel
 * (Review stats, Authors). The header's h1 is the app's name, so this is
 * an h2.
 */
export function ViewHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="ui-view-heading">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
