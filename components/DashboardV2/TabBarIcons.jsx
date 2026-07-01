import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Svg, { Path, SvgXml } from 'react-native-svg';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

export const TAB_ICON_SIZE = 24;

const BUTLER_SVG = require('../../assets/butler-white.svg');

let cachedButlerXml = null;
let butlerXmlPromise = null;

function loadButlerSvgXml() {
    if (cachedButlerXml) return Promise.resolve(cachedButlerXml);
    if (!butlerXmlPromise) {
        butlerXmlPromise = (async () => {
            const asset = Asset.fromModule(BUTLER_SVG);
            await asset.downloadAsync();
            const uri = asset.localUri ?? asset.uri;
            cachedButlerXml = await FileSystem.readAsStringAsync(uri);
            return cachedButlerXml;
        })();
    }
    return butlerXmlPromise;
}

/** Butler text chat — speech bubble */
export function ButlerChatIcon({ color, size = TAB_ICON_SIZE }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 26.59 21.42" fill="none">
            <Path
                d="M24.68,14.75c.92-1.35,1.45-2.88,1.45-4.51C26.13,4.84,20.38.46,13.29.46S.46,4.84.46,10.25s5.75,9.79,12.84,9.79c2.4,0,4.64-.51,6.57-1.39l5.4,2.08-.57-5.97Z"
                stroke={color}
                strokeWidth={1}
                strokeMiterlimit={10}
                fill="none"
            />
        </Svg>
    );
}

/** Butler voice — white SVG asset */
export function ButlerIcon({ active = false, size = TAB_ICON_SIZE }) {
    const [xml, setXml] = useState(cachedButlerXml);

    useEffect(() => {
        if (cachedButlerXml) return;
        loadButlerSvgXml()
            .then(setXml)
            .catch((err) => console.warn('[ButlerIcon] failed to load SVG', err?.message ?? err));
    }, []);

    if (!xml) {
        return <View style={{ width: size, height: size }} accessibilityLabel="Butler" />;
    }

    return (
        <SvgXml
            xml={xml}
            width={size}
            height={size}
            opacity={active ? 1 : 0.55}
        />
    );
}

export function CameraIcon({ color, size = TAB_ICON_SIZE }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 22 16" fill="none">
            <Path
                d="M11,.5h-6.53c-.52,0-1.04.1-1.52.31-.48.2-.92.5-1.29.88-.37.38-.66.82-.86,1.31-.2.49-.3,1.02-.3,1.55v6.92c0,1.07.42,2.1,1.16,2.85.37.37.81.67,1.29.87.48.2,1,.31,1.52.31h6.53c1.05,0,2.06-.43,2.81-1.18.75-.76,1.16-1.78,1.16-2.85v-6.92c0-.53-.1-1.06-.3-1.55-.2-.49-.49-.94-.86-1.31-.37-.38-.81-.67-1.29-.88-.48-.2-1-.31-1.52-.31M21.5,5.12v5.76c0,.28-.08.56-.23.79-.15.24-.36.43-.61.55-.25.13-.53.18-.81.14-.27-.03-.53-.14-.75-.31l-3.56-2.91c-.17-.14-.31-.32-.41-.53-.1-.2-.15-.42-.15-.65,0-.22.05-.45.15-.65.1-.19.24-.35.41-.49l3.56-2.88c.22-.17.48-.28.75-.31.28-.04.56.01.81.14.25.12.46.31.6.54.15.23.23.51.24.78Z"
                stroke={color}
                strokeWidth={1}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        </Svg>
    );
}

export function RoomsIcon({ color, size = TAB_ICON_SIZE }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 21 21" fill="none">
            <Path
                d="M.5,16.5c0-1.54,0-2.31.35-2.88.19-.32.46-.58.78-.78.56-.35,1.34-.35,2.88-.35s2.31,0,2.88.35c.32.19.58.46.78.78.35.57.35,1.34.35,2.88s0,2.31-.35,2.88c-.19.32-.46.58-.78.78-.57.35-1.34.35-2.88.35s-2.31,0-2.88-.35c-.32-.19-.58-.46-.78-.78-.35-.57-.35-1.34-.35-2.88ZM12.5,16.5c0-1.54,0-2.31.35-2.88.19-.32.46-.58.78-.78.56-.35,1.34-.35,2.88-.35s2.31,0,2.88.35c.32.19.58.46.78.78.35.57.35,1.34.35,2.88s0,2.31-.35,2.88c-.19.32-.46.58-.78.78-.57.35-1.34.35-2.88.35s-2.31,0-2.88-.35c-.32-.19-.58-.46-.78-.78-.35-.57-.35-1.34-.35-2.88ZM.5,4.5c0-1.54,0-2.31.35-2.88.19-.32.46-.58.78-.78.56-.35,1.34-.35,2.88-.35s2.31,0,2.88.35c.32.19.58.46.78.78.35.56.35,1.34.35,2.88s0,2.31-.35,2.88c-.19.32-.46.58-.78.78-.57.35-1.34.35-2.88.35s-2.31,0-2.88-.35c-.32-.19-.58-.46-.78-.78-.35-.57-.35-1.34-.35-2.88ZM12.5,4.5c0-1.54,0-2.31.35-2.88.19-.32.46-.58.78-.78.56-.35,1.34-.35,2.88-.35s2.31,0,2.88.35c.32.19.58.46.78.78.35.56.35,1.34.35,2.88s0,2.31-.35,2.88c-.19.32-.46.58-.78.78-.57.35-1.34.35-2.88.35s-2.31,0-2.88-.35c-.32-.19-.58-.46-.78-.78-.35-.57-.35-1.34-.35-2.88Z"
                stroke={color}
                strokeWidth={1}
                fill="none"
            />
        </Svg>
    );
}

export function SettingsIcon({ color, size = TAB_ICON_SIZE }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 20.5 20.5" fill="none">
            <Path
                d="M18.14,10.78l1.36,1.21c.25.21.42.5.47.82.05.32,0,.65-.18.93l-1.64,2.79c-.13.21-.31.39-.52.51-.22.12-.47.19-.72.19-.16,0-.31-.02-.46-.07l-1.74-.57c-.3.19-.62.37-.95.52l-.36,1.76c-.07.32-.25.61-.51.82-.26.21-.59.32-.93.31h-3.39c-.34,0-.66-.1-.93-.31-.26-.2-.44-.49-.51-.82l-.37-1.76c-.32-.16-.64-.33-.94-.53l-1.74.57c-.15.05-.3.07-.46.07-.25,0-.5-.07-.72-.19-.22-.12-.4-.3-.52-.51l-1.69-2.79c-.18-.28-.24-.62-.19-.95.06-.33.23-.62.48-.83l1.35-1.71v-.53l-1.36-1.21c-.25-.21-.42-.5-.47-.82-.05-.32.01-.65.18-.93l1.69-2.79c.13-.21.31-.39.52-.51.22-.12.46-.19.71-.19.15,0,.31,0,.46.04l1.71.6c.3-.19.62-.37.95-.52l.37-1.76c.07-.32.25-.61.51-.82.26-.21.59-.32.93-.31h3.36c.34,0,.66.1.93.31.26.21.44.49.51.82l.37,1.76c.32.15.64.33.94.53l1.74-.57c.19-.06.4-.09.6-.06.2.02.4.08.58.18.22.12.4.3.52.51l1.69,2.79c.18.28.25.61.2.94-.05.33-.22.63-.47.84l-1.38,1.17v1.07Z"
                stroke={color}
                strokeWidth={1}
                fill="none"
            />
            <Path
                d="M14,10.25c0,.99-.4,1.95-1.1,2.65-.7.7-1.66,1.1-2.65,1.1s-1.95-.4-2.65-1.1c-.7-.7-1.1-1.66-1.1-2.65s.39-1.95,1.1-2.65c.7-.7,1.66-1.1,2.65-1.1s1.95.4,2.65,1.1,1.1,1.66,1.1,2.65Z"
                stroke={color}
                strokeWidth={1}
                fill="none"
            />
        </Svg>
    );
}
