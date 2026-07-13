/**
 * Current HD format version. Written to frontmatter as `version:` on first
 * open of a document that doesn't already declare one. Missing version is
 * always interpreted as the latest version.
 *
 * `.hd` files stay at version 1 (body-only HTML is authoritative). `.hd2`
 * files — the experimental Markdown-primary flavor — are stamped version 2 so
 * that when the two flavors are eventually consolidated, promoting an `.hd2`
 * file is a pure file rename with no frontmatter change.
 */
export const HD_FORMAT_VERSION = 1;
export const HD2_FORMAT_VERSION = 2;

import type { HdFlavor } from './flavor';

export function defaultVersionForFlavor(flavor: HdFlavor): number {
  return flavor === 'hd2' ? HD2_FORMAT_VERSION : HD_FORMAT_VERSION;
}
