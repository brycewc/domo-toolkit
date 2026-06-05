/**
 * Visual overlay that marks a user avatar as inactive (deleted) in Domo.
 *
 * Mirrors the effect Domo applies on its own frontend: a dark diagonal hatch
 * plus a bottom-darkening vignette layered over the profile picture. Domo never
 * returns this baked into the avatar image (the API serves a clean photo), so we
 * reproduce it purely with the `.inactive-user-overlay` class (see global.css).
 *
 * Single-purpose and presentational: it always renders the overlay when mounted,
 * so callers gate it themselves, e.g. `{isInactive && <InactiveUserOverlay />}`.
 * Drop it as a child of any positioned, clipped container. A HeroUI Avatar root
 * already supplies `relative` + `overflow-hidden` + our forced `rounded-full`,
 * so the hatch clips to the avatar's circle with no extra wrapper.
 *
 * @param {object} [props]
 * @param {string} [props.className] Extra classes merged onto the overlay (e.g.
 *   to override the clip shape when used outside a circular avatar).
 */
export function InactiveUserOverlay({ className } = {}) {
  return <span aria-hidden='true' className={['inactive-user-overlay', className].filter(Boolean).join(' ')} />;
}
