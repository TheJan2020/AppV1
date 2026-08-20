/**
 * TV remote strategies for Home Assistant media players.
 *
 * Production types (same MediaCard remote UI):
 *  - default  → Apple TV–style `remote.send_command` (up/select/menu)
 *  - webos    → LG `webostv.button` (UP/ENTER/BACK)
 *  - samsung  → Samsung TV `remote.send_command` (KEY_UP/KEY_ENTER/KEY_RETURN)
 *
 * Also supported when mapped in admin:
 *  - androidtv → Android TV remote keys (DPAD_*)
 *  - roku      → Roku remote keys
 */

export const TV_REMOTE_STRATEGIES = {
    DEFAULT: 'default',
    WEBOS: 'webos',
    SAMSUNG: 'samsung',
    ANDROIDTV: 'androidtv',
    ROKU: 'roku',
};

/** UI D-pad action → HA command per strategy */
const COMMAND_MAPS = {
    [TV_REMOTE_STRATEGIES.DEFAULT]: {
        up: 'up',
        down: 'down',
        left: 'left',
        right: 'right',
        select: 'select',
        home: 'home',
        back: 'menu',
        play: 'play',
        pause: 'pause',
        volume_up: 'volume_up',
        volume_down: 'volume_down',
        channel_up: null,
        channel_down: null,
    },
    [TV_REMOTE_STRATEGIES.WEBOS]: {
        up: 'UP',
        down: 'DOWN',
        left: 'LEFT',
        right: 'RIGHT',
        select: 'ENTER',
        home: 'HOME',
        back: 'BACK',
        play: 'PLAY',
        pause: 'PAUSE',
        channel_up: 'CHANNELUP',
        channel_down: 'CHANNELDOWN',
    },
    [TV_REMOTE_STRATEGIES.SAMSUNG]: {
        up: 'KEY_UP',
        down: 'KEY_DOWN',
        left: 'KEY_LEFT',
        right: 'KEY_RIGHT',
        select: 'KEY_ENTER',
        home: 'KEY_HOME',
        back: 'KEY_RETURN',
        play: 'KEY_PLAY',
        pause: 'KEY_PAUSE',
        volume_up: 'KEY_VOLUP',
        volume_down: 'KEY_VOLDOWN',
        mute: 'KEY_MUTE',
        channel_up: 'KEY_CHUP',
        channel_down: 'KEY_CHDOWN',
    },
    [TV_REMOTE_STRATEGIES.ANDROIDTV]: {
        up: 'DPAD_UP',
        down: 'DPAD_DOWN',
        left: 'DPAD_LEFT',
        right: 'DPAD_RIGHT',
        select: 'DPAD_CENTER',
        home: 'HOME',
        back: 'BACK',
        play: 'MEDIA_PLAY',
        pause: 'MEDIA_PAUSE',
        channel_up: 'CHANNEL_UP',
        channel_down: 'CHANNEL_DOWN',
    },
    [TV_REMOTE_STRATEGIES.ROKU]: {
        up: 'up',
        down: 'down',
        left: 'left',
        right: 'right',
        select: 'select',
        home: 'home',
        back: 'back',
        play: 'play',
        pause: 'play',
        channel_up: null,
        channel_down: null,
    },
};

function collectHints(entityId, mapping, entity) {
    const attrs = entity?.stateObj?.attributes || entity?.attributes || {};
    return [
        entityId,
        entity?.platform,
        entity?.displayName,
        attrs.friendly_name,
        attrs.manufacturer,
        attrs.model_name,
        attrs.model,
        mapping?.mediaType?.name,
        mapping?.remoteStrategy,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

/**
 * Infer strategy from entity id / platform / friendly name when admin mapping
 * is missing or still on Default (Demo Area Samsung often has no "samsung" in id).
 */
export function inferRemoteStrategy(entityId, mapping = null, entity = null) {
    const hay = collectHints(entityId, mapping, entity);
    if (!hay && !entity?.platform && !entity?.linkedRemote?.platform) {
        return TV_REMOTE_STRATEGIES.DEFAULT;
    }

    const platform = entity?.platform || entity?.linkedRemote?.platform || '';
    if (
        platform === 'samsungtv' ||
        hay.includes('samsung') ||
        hay.includes('smartthings')
    ) {
        return TV_REMOTE_STRATEGIES.SAMSUNG;
    }
    if (
        platform === 'webostv' ||
        hay.includes('webos') ||
        hay.includes('lg tv') ||
        hay.includes('lg_tv') ||
        /(?:^|[\s._-])lg(?:[\s._-]|$)/.test(hay)
    ) {
        return TV_REMOTE_STRATEGIES.WEBOS;
    }
    if (
        platform === 'androidtv' ||
        hay.includes('androidtv') ||
        hay.includes('android tv') ||
        hay.includes('chromecast')
    ) {
        return TV_REMOTE_STRATEGIES.ANDROIDTV;
    }
    if (platform === 'roku' || hay.includes('roku')) {
        return TV_REMOTE_STRATEGIES.ROKU;
    }
    if (
        platform === 'apple_tv' ||
        hay.includes('apple tv') ||
        hay.includes('apple_tv') ||
        hay.includes('appletv')
    ) {
        return TV_REMOTE_STRATEGIES.DEFAULT;
    }

    return TV_REMOTE_STRATEGIES.DEFAULT;
}

export function resolveRemoteStrategy(entityId, mapping = null, entity = null) {
    const fromMap = mapping?.remoteStrategy;
    // Explicit non-default admin choice always wins.
    if (fromMap && fromMap !== TV_REMOTE_STRATEGIES.DEFAULT) return fromMap;
    // Infer Samsung / LG / etc. when unmapped or still on Default (demo TVs).
    const inferred = inferRemoteStrategy(entityId, mapping, entity);
    if (inferred !== TV_REMOTE_STRATEGIES.DEFAULT) return inferred;
    return fromMap || TV_REMOTE_STRATEGIES.DEFAULT;
}

/** Short label for UI (Apple TV / Samsung TV / LG TV). */
export function remoteStrategyLabel(strategy) {
    switch (strategy) {
        case TV_REMOTE_STRATEGIES.WEBOS:
            return 'LG TV';
        case TV_REMOTE_STRATEGIES.SAMSUNG:
            return 'Samsung TV';
        case TV_REMOTE_STRATEGIES.ANDROIDTV:
            return 'Android TV';
        case TV_REMOTE_STRATEGIES.ROKU:
            return 'Roku';
        case TV_REMOTE_STRATEGIES.DEFAULT:
        default:
            return 'Apple TV';
    }
}

function remoteIdsMatch(mediaId, remoteId) {
    const m = String(mediaId || '')
        .replace(/^media_player\./, '')
        .toLowerCase();
    const r = String(remoteId || '')
        .replace(/^remote\./, '')
        .toLowerCase();
    if (!m || !r) return false;
    return r === m || r.startsWith(`${m}_`) || m.startsWith(`${r}_`) || r.includes(m) || m.includes(r);
}

/** Prefer linked HA remote entity; fall back to media_player.X → remote.X */
export function resolveRemoteEntityId(entity) {
    if (entity?.linkedRemote?.entity_id) return entity.linkedRemote.entity_id;
    const id = entity?.entity_id || '';
    if (id.startsWith('remote.')) return id;
    if (id.startsWith('media_player.')) return id.replace('media_player.', 'remote.');
    return id;
}

/**
 * Build HA service call(s) for a MediaCard remote_* action.
 * Samsung: KEY_* via remote.send_command (official HA path).
 * @returns {Array<{ entityId: string, domain: string, service: string, data: object, strategy: string }>}
 */
export function buildRemoteServiceCalls(entity, uiCommand, mapping) {
    const strategy = resolveRemoteStrategy(entity?.entity_id, mapping, entity);
    const map = COMMAND_MAPS[strategy] || COMMAND_MAPS[TV_REMOTE_STRATEGIES.DEFAULT];
    const command = map[uiCommand];
    if (command == null) return [];

    if (strategy === TV_REMOTE_STRATEGIES.WEBOS) {
        return [
            {
                entityId: entity.entity_id,
                domain: 'webostv',
                service: 'button',
                data: { button: command },
                strategy,
            },
        ];
    }

    const commandList = [command];
    const remoteCall = {
        entityId: resolveRemoteEntityId(entity),
        domain: 'remote',
        service: 'send_command',
        data: { command: commandList },
        strategy,
    };

    if (strategy === TV_REMOTE_STRATEGIES.SAMSUNG) {
        // Official samsungtv: D-pad/home/back only work on the remote entity with KEY_*.
        // Channel up/down also work as media_player media_next/previous_track.
        // Always pass command as a list — some HA remote handlers iterate strings char-by-char.
        if (uiCommand === 'channel_up' || uiCommand === 'channel_down') {
            return [
                {
                    entityId: entity.entity_id,
                    domain: 'media_player',
                    service: uiCommand === 'channel_up' ? 'media_next_track' : 'media_previous_track',
                    data: {},
                    strategy,
                },
                remoteCall,
            ];
        }

        if (uiCommand === 'pause' || uiCommand === 'play') {
            const mediaService = uiCommand === 'pause' ? 'media_pause' : 'media_play';
            return [
                {
                    entityId: entity.entity_id,
                    domain: 'media_player',
                    service: mediaService,
                    data: {},
                    strategy,
                },
                remoteCall,
            ];
        }

        // Volume / mute: media_player is authoritative; KEY_* is a fallback when CEC/IR needs it.
        if (uiCommand === 'volume_up' || uiCommand === 'volume_down') {
            return [
                {
                    entityId: entity.entity_id,
                    domain: 'media_player',
                    service: uiCommand,
                    data: {},
                    strategy,
                },
                remoteCall,
            ];
        }

        if (uiCommand === 'mute') {
            return [remoteCall];
        }

        return [remoteCall];
    }

    // Apple TV (default): play/pause + volume must hit remote.send_command.
    // media_player alone often no-ops for CEC volume; mute is not supported by HA apple_tv.
    if (strategy === TV_REMOTE_STRATEGIES.DEFAULT) {
        if (uiCommand === 'pause' || uiCommand === 'play') {
            const mediaService = uiCommand === 'pause' ? 'media_pause' : 'media_play';
            return [
                {
                    entityId: entity.entity_id,
                    domain: 'media_player',
                    service: mediaService,
                    data: {},
                    strategy,
                },
                remoteCall,
            ];
        }
        if (uiCommand === 'volume_up' || uiCommand === 'volume_down') {
            // Prefer remote first — official Apple TV volume path (CEC / HomePod).
            return [
                remoteCall,
                {
                    entityId: entity.entity_id,
                    domain: 'media_player',
                    service: uiCommand,
                    data: {},
                    strategy,
                },
            ];
        }
    }

    return [remoteCall];
}

/** HA MediaPlayerEntityFeature.VOLUME_MUTE */
const HA_VOLUME_MUTE = 8;
/** HA MediaPlayerEntityFeature.VOLUME_SET */
const HA_VOLUME_SET = 4;

export function mediaPlayerSupportsMute(attributes = {}) {
    const features = Number(attributes.supported_features);
    if (!Number.isFinite(features)) return attributes.is_volume_muted !== undefined;
    return (features & HA_VOLUME_MUTE) !== 0;
}

/**
 * Same-room TV/speakers for Apple volume/mute when ATV has no level/mute
 * (Demo Area: Apple TV HDMI → Samsung panel speakers).
 * Prefer Samsung / mute-capable players; skip other Apple TVs.
 */
export function findRoomVolumeCompanion(player, roomPlayers = [], mediaMappings = []) {
    const selfId = player?.entity_id;
    if (!selfId || !Array.isArray(roomPlayers)) return null;

    const candidates = roomPlayers.filter(p => {
        if (!p?.entity_id || p.entity_id === selfId) return false;
        if (!String(p.entity_id).startsWith('media_player.')) return false;
        const strategy = resolveRemoteStrategy(
            p.entity_id,
            mediaMappings.find(m => m.entity_id === p.entity_id),
            p
        );
        // Never chain Apple → another Apple.
        if (strategy === TV_REMOTE_STRATEGIES.DEFAULT) {
            const hay = String(p.entity_id).toLowerCase();
            if (hay.includes('apple')) return false;
        }
        const attrs = p.stateObj?.attributes || {};
        return (
            mediaPlayerSupportsMute(attrs) ||
            mediaPlayerSupportsVolumeSet(attrs) ||
            strategy === TV_REMOTE_STRATEGIES.SAMSUNG ||
            strategy === TV_REMOTE_STRATEGIES.WEBOS
        );
    });

    return (
        candidates.find(p => {
            const strategy = resolveRemoteStrategy(
                p.entity_id,
                mediaMappings.find(m => m.entity_id === p.entity_id),
                p
            );
            return strategy === TV_REMOTE_STRATEGIES.SAMSUNG;
        }) ||
        candidates.find(p => mediaPlayerSupportsMute(p.stateObj?.attributes || {})) ||
        candidates[0] ||
        null
    );
}

/** @deprecated use findRoomVolumeCompanion */
export function findRoomMuteCompanion(player, roomPlayers = [], mediaMappings = []) {
    return findRoomVolumeCompanion(player, roomPlayers, mediaMappings);
}

/** Prefer absolute volume only when the player advertises VOLUME_SET. */
export function mediaPlayerSupportsVolumeSet(attributes = {}) {
    const features = Number(attributes.supported_features);
    if (Number.isFinite(features)) return (features & HA_VOLUME_SET) !== 0;
    return typeof attributes.volume_level === 'number';
}

/** @deprecated use buildRemoteServiceCalls */
export function buildRemoteServiceCall(entity, uiCommand, mapping) {
    const calls = buildRemoteServiceCalls(entity, uiCommand, mapping);
    return calls[0] || null;
}

/**
 * Power on/off for Apple TV must use remote wakeup/suspend — media_player
 * turn_on/off only updates HA state (see HA apple_tv FAQ).
 * Samsung uses media_player turn_on/off (WoL) + optional KEY_POWER.
 */
export function buildPowerServiceCalls(entity, turnOn, mapping) {
    const strategy = resolveRemoteStrategy(entity?.entity_id, mapping, entity);
    const calls = [];

    if (strategy === TV_REMOTE_STRATEGIES.DEFAULT) {
        calls.push({
            entityId: resolveRemoteEntityId(entity),
            domain: 'remote',
            service: 'send_command',
            data: { command: [turnOn ? 'wakeup' : 'suspend'] },
            strategy,
        });
    }

    if (strategy === TV_REMOTE_STRATEGIES.SAMSUNG && !turnOn) {
        calls.push({
            entityId: resolveRemoteEntityId(entity),
            domain: 'remote',
            service: 'send_command',
            data: { command: ['KEY_POWER'] },
            strategy,
        });
    }

    if (turnOn) {
        const btn = mapping?.turnOnButton;
        if (btn?.startsWith('button.')) {
            calls.push({
                entityId: btn,
                domain: 'button',
                service: 'press',
                data: {},
                strategy,
            });
            return calls;
        }
    }

    calls.push({
        entityId: entity.entity_id,
        domain: 'media_player',
        service: turnOn ? 'turn_on' : 'turn_off',
        data: {},
        strategy,
    });

    return calls;
}

/** Match media_player ↔ remote when device_id is missing but ids are related. */
export function findLinkedRemote(mediaEntity, remoteEntities = []) {
    if (!mediaEntity?.entity_id || !Array.isArray(remoteEntities)) return null;
    const byDevice = remoteEntities.find(
        r => r.device_id && mediaEntity.device_id && r.device_id === mediaEntity.device_id
    );
    if (byDevice) return byDevice;
    return (
        remoteEntities.find(r => remoteIdsMatch(mediaEntity.entity_id, r.entity_id)) || null
    );
}
