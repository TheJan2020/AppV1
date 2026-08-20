/**
 * App-wide Text wrapper — Clash Display (same font as the main dashboard).
 * Metro redirects react-native's Text module here.
 */

import React from 'react';
import RealText from './rn-text-original';
import { resolveAppFontStyle } from './appFontStyle';

const AppText = React.forwardRef(function AppText(props, ref) {
    const { style, ...rest } = props;
    return <RealText {...rest} ref={ref} style={resolveAppFontStyle(style)} />;
});

AppText.displayName = 'Text';

export default AppText;
