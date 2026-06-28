import React, { useEffect, useState } from 'react';
import { SvgXml } from 'react-native-svg';
import {
    ensureLocalLightIconLoaded,
    getLightIconRenderMultiplier,
    getLocalLightIconXml,
    preloadLocalLightIcons,
    resolveLightTypeName,
    subscribeLightIconCache,
} from '../../utils/lightTypeAssets';

export { preloadLocalLightIcons as preloadLightTypeIcons } from '../../utils/lightTypeAssets';

export default function LightTypeIcon({
    typeName,
    size = 20,
    color = '#ffffff',
}) {
    const resolvedName = resolveLightTypeName(typeName);
    const [ready, setReady] = useState(() =>
        Boolean(getLocalLightIconXml(resolvedName, color)),
    );

    useEffect(() => subscribeLightIconCache(() => {
        if (getLocalLightIconXml(resolvedName, color)) {
            setReady(true);
        }
    }), [resolvedName, color]);

    useEffect(() => {
        let cancelled = false;
        ensureLocalLightIconLoaded(resolvedName)
            .then(() => {
                if (!cancelled) setReady(true);
            })
            .catch(() => {
                if (!cancelled) setReady(false);
            });

        return () => { cancelled = true; };
    }, [resolvedName]);

    const xml = ready ? getLocalLightIconXml(resolvedName, color) : null;
    if (xml) {
        const renderSize = Math.round(size * getLightIconRenderMultiplier(resolvedName));
        return <SvgXml xml={xml} width={renderSize} height={renderSize} />;
    }

    return null;
}
