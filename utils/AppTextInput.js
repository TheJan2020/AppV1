/**
 * App-wide TextInput wrapper — Clash Display (same font as the main dashboard).
 * Metro redirects react-native's TextInput module here.
 */

import React from 'react';
import RealTextInput from './rn-textinput-original';
import { resolveAppFontStyle } from './appFontStyle';

const AppTextInput = React.forwardRef(function AppTextInput(props, ref) {
    const { style, ...rest } = props;
    return (
        <RealTextInput
            {...rest}
            ref={ref}
            style={resolveAppFontStyle(style)}
        />
    );
});

AppTextInput.displayName = 'TextInput';

export default AppTextInput;
