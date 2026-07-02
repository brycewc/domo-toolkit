import { Alert as HeroAlert } from '@heroui/react';

/**
 * Thin wrapper around HeroUI's Alert that adds a custom `variant` prop on top of
 * HeroUI's own `status` prop. Today the only variant is `transparent`, which
 * strips the alert's `bg-surface`/`shadow-surface` down to a bare foreground
 * block so it matches a `<Surface variant="transparent">` (see the
 * `.alert--transparent` rule in global.css). `variant` and `status` are
 * orthogonal: a transparent alert can still carry any status coloring on its
 * title and indicator.
 *
 * We wrap HeroUI's AlertRoot rather than reimplementing it because the root sets
 * an internal context that Alert.Content/Title/Description/Indicator read for
 * their slot classes; that context isn't exported, so re-creating the root would
 * break the compound children. Instead we just fold the variant class into the
 * className HeroUI's root already forwards through its `base` slot.
 */
const VARIANT_CLASS = {
  transparent: 'alert--transparent'
};

function AlertRoot({ className, variant, ...rest }) {
  const variantClass = variant ? VARIANT_CLASS[variant] : undefined;
  const merged = [variantClass, className].filter(Boolean).join(' ') || undefined;
  return <HeroAlert className={merged} {...rest} />;
}

export const Alert = Object.assign(AlertRoot, {
  Content: HeroAlert.Content,
  Description: HeroAlert.Description,
  Indicator: HeroAlert.Indicator,
  Root: AlertRoot,
  Title: HeroAlert.Title
});
