/**
 * App font: Clash Display (loaded in app/_layout.jsx).
 * This is the font used on the main dashboard — use CF / Heading everywhere.
 * Metro also wraps Text/TextInput so unset styles still get Clash Display.
 *
 * Do not combine Clash faces with `fontWeight` — weight comes from the face name.
 */
export const CF = {
  extralight: 'ClashDisplay-Extralight',
  light:      'ClashDisplay-Light',
  regular:    'ClashDisplay-Regular',
  medium:     'ClashDisplay-Medium',
  semibold:   'ClashDisplay-Semibold',
  bold:       'ClashDisplay-Bold',
};

/**
 * Primary app headings (Clash Display). Spread then override color / margins.
 */
export const Heading = {
  /** Room hero, Settings “Settings” */
  xl: { fontFamily: CF.bold, fontSize: 32 },
  /** Inline room / sheet title */
  lg24: { fontFamily: CF.bold, fontSize: 24 },
  /** Butler chat, prominent modal titles */
  lg: { fontFamily: CF.bold, fontSize: 22 },
  /** Section headers in room (Cameras, …), overlay titles */
  section: { fontFamily: CF.semibold, fontSize: 18 },
  /** Lights / Covers card titles, notification header */
  md: { fontFamily: CF.semibold, fontSize: 20 },
  /** Notifications title (slightly smaller) */
  md17: { fontFamily: CF.semibold, fontSize: 17 },
  /** Room list rows, small headings */
  sm: { fontFamily: CF.semibold, fontSize: 16 },
  /** Room subtitle / meta under title */
  sub: { fontFamily: CF.regular, fontSize: 14 },
};

/** Device state labels on room detail (ON, OFF, Open, Closed, …) */
export const RoomDeviceStatus = {
  fontStyle: 'italic',
};
