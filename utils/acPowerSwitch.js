/**
 * Pair a room climate (AC) with a similarly named switch used as on/off power.
 *
 * Examples that match climate "2nd AC":
 *   2nd AC switch, 2nd AC Switch, 2nd Ac Switch, 2nd AC swtich
 *   switch.2nd_ac_switch
 *
 * A switch named only "Switch" pairs when the room has a single AC.
 */

const SWITCH_WORD = '(?:switch|swtich|power|pwr)';
const SWITCH_SUFFIX_RE = new RegExp(`[\\s_]+${SWITCH_WORD}$`, 'i');
const SWITCH_ONLY_RE = new RegExp(`^${SWITCH_WORD}$`, 'i');
const ID_POWER_SUFFIX_RE = /[\s_]+(?:switch|swtich|power|pwr|state)$/i;
const CHILD_LOCK_RE = /child[_\s-]?lock/i;

export function normalizeAcLabel(raw) {
    return String(raw || '')
        .toLowerCase()
        .replace(/^switch\./, '')
        .replace(/^climate\./, '')
        .replace(/[_-]+/g, ' ')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function climateLabel(climate) {
    return (
        climate?.stateObj?.attributes?.friendly_name
        || climate?.attributes?.friendly_name
        || climate?.displayName
        || climate?.name
        || climate?.original_name
        || climate?.entity_id
        || ''
    );
}

function switchLabel(sw) {
    return (
        sw?.stateObj?.attributes?.friendly_name
        || sw?.attributes?.friendly_name
        || sw?.displayName
        || sw?.name
        || sw?.original_name
        || sw?.entity_id
        || ''
    );
}

function climateObjectId(entityId) {
    return String(entityId || '').replace(/^climate\./i, '');
}

function switchObjectId(entityId) {
    return String(entityId || '').replace(/^switch\./i, '');
}

function isChildLockSwitch(sw) {
    return CHILD_LOCK_RE.test(sw?.entity_id || '') || CHILD_LOCK_RE.test(switchLabel(sw));
}

function idsShareStem(acObj, swObj) {
    if (!acObj || !swObj) return false;
    if (swObj === acObj || swObj.startsWith(`${acObj}_`)) return true;
    const acStem = acObj.replace(/_thermostat$/i, '');
    const swStem = swObj
        .replace(/_thermostat_(state|switch)$/i, '')
        .replace(/_(state|switch)$/i, '');
    return !!(acStem && swStem && (swStem === acStem || swStem.startsWith(`${acStem}_`)));
}

function stripSwitchSuffix(normalized) {
    return String(normalized || '').replace(SWITCH_SUFFIX_RE, '').trim();
}

function hasSwitchSuffix(normalized) {
    return SWITCH_SUFFIX_RE.test(String(normalized || ''));
}

/**
 * @param {object} climate
 * @param {object} sw
 * @param {{ soleClimate?: boolean }} [opts]
 */
export function switchMatchesClimatePower(climate, sw, opts = {}) {
    if (!climate?.entity_id?.startsWith('climate.') || !sw?.entity_id?.startsWith('switch.')) {
        return false;
    }
    if (climate.damperEntityId && sw.entity_id === climate.damperEntityId) {
        return false;
    }
    if (isChildLockSwitch(sw)) return false;

    const acObj = climateObjectId(climate.entity_id);
    const swObj = switchObjectId(sw.entity_id);
    // Tuya/Zigbee thermostats: climate.foo_thermostat + switch.foo_thermostat_state
    if (acObj && (swObj === acObj || swObj === `${acObj}_state` || swObj === `${acObj}_switch`)) {
        return true;
    }
    if (
        climate.device_id
        && sw.device_id
        && String(climate.device_id) === String(sw.device_id)
        && /_(state|switch)$/i.test(swObj)
    ) {
        return true;
    }

    const acName = normalizeAcLabel(climateLabel(climate));
    const swName = normalizeAcLabel(switchLabel(sw));
    const acId = normalizeAcLabel(climate.entity_id);
    const swId = normalizeAcLabel(sw.entity_id);
    if (!acName && !acId) return false;

    if (opts.soleClimate && SWITCH_ONLY_RE.test(swName)) return true;

    const nameOk = opts.soleClimate || idsShareStem(acObj, swObj);
    if (!nameOk) return false;

    // Same label / id (climate "2nd AC" + switch "2nd AC")
    if (swName && (swName === acName || swName === acId)) return true;
    if (swId && (swId === acId || swId === acName)) return true;

    const swNameBase = stripSwitchSuffix(swName);
    const swIdBase = String(swId || '').replace(ID_POWER_SUFFIX_RE, '').trim();

    if (hasSwitchSuffix(swName) && swNameBase && (swNameBase === acName || swNameBase === acId)) {
        return true;
    }
    if (ID_POWER_SUFFIX_RE.test(swId) && swIdBase && (swIdBase === acId || swIdBase === acName)) {
        return true;
    }

    return false;
}

/**
 * Attach `powerSwitchEntityId` / `powerSwitchStateObj` to each climate.
 * Each switch is used at most once (best/longest name match first).
 *
 * @returns {{ climates: object[], leftoverSwitches: object[] }}
 */
export function attachAcPowerSwitches(climates, switches, allEntities = []) {
    const climateList = Array.isArray(climates) ? climates : [];
    const switchList = Array.isArray(switches) ? switches : [];
    const entities = Array.isArray(allEntities) ? allEntities : [];
    const soleClimate = climateList.length === 1;
    const used = new Set();

    const scored = [];
    for (const climate of climateList) {
        for (const sw of switchList) {
            if (!switchMatchesClimatePower(climate, sw, { soleClimate })) continue;
            const acName = normalizeAcLabel(climateLabel(climate));
            const swName = normalizeAcLabel(switchLabel(sw));
            scored.push({
                climateId: climate.entity_id,
                switchId: sw.entity_id,
                sw,
                score: stripSwitchSuffix(swName).length || acName.length,
            });
        }
    }
    scored.sort((a, b) => b.score - a.score);

    const pairByClimate = new Map();
    for (const row of scored) {
        if (pairByClimate.has(row.climateId) || used.has(row.switchId)) continue;
        pairByClimate.set(row.climateId, row.sw);
        used.add(row.switchId);
    }

    const nextClimates = climateList.map((climate) => {
        const sw = pairByClimate.get(climate.entity_id);
        if (!sw) {
            return { ...climate, powerSwitchEntityId: null, powerSwitchStateObj: null };
        }
        const live = entities.find((e) => e.entity_id === sw.entity_id)
            || sw.stateObj
            || sw;
        return {
            ...climate,
            powerSwitchEntityId: sw.entity_id,
            powerSwitchStateObj: live,
        };
    });

    return {
        climates: nextClimates,
        leftoverSwitches: switchList.filter((sw) => !used.has(sw.entity_id)),
    };
}

export function isClimatePoweredOn(climate) {
    const climateState = climate?.stateObj?.state ?? climate?.state;
    const climateOn = !!climateState
        && climateState !== 'off'
        && climateState !== 'unavailable'
        && climateState !== 'unknown';

    const switchId = climate?.powerSwitchEntityId;
    if (!switchId) return climateOn;

    const swState = climate.powerSwitchStateObj?.state;
    if (swState == null || swState === 'unavailable' || swState === 'unknown') {
        return climateOn;
    }
    // Paired power switch is the source of truth: ON means the AC counts as on.
    return swState === 'on';
}

/**
 * Pair raw HA climate entities in a room with AC power switches, then keep
 * those that should count as ON (switch on wins when a pair exists).
 */
export function filterPoweredOnClimates(roomEntities = [], allEntities = []) {
    const list = Array.isArray(roomEntities) ? roomEntities.filter(Boolean) : [];
    const all = Array.isArray(allEntities) && allEntities.length ? allEntities : list;
    const climates = list
        .filter((e) => e.entity_id?.startsWith('climate.'))
        .map((e) => ({
            entity_id: e.entity_id,
            device_id: e.device_id,
            displayName: e.attributes?.friendly_name || e.displayName,
            state: e.state,
            attributes: e.attributes,
            stateObj: e.stateObj || e,
        }));
    const seenSwitch = new Set();
    const switches = [];
    const addSwitch = (e) => {
        if (!e?.entity_id?.startsWith('switch.') || seenSwitch.has(e.entity_id)) return;
        seenSwitch.add(e.entity_id);
        switches.push({
            entity_id: e.entity_id,
            device_id: e.device_id,
            displayName: e.attributes?.friendly_name || e.displayName,
            stateObj: e.stateObj || e,
        });
    };
    list.forEach(addSwitch);
    const climateDeviceIds = new Set(climates.map((c) => c.device_id).filter(Boolean));
    all.forEach((e) => {
        if (e?.device_id && climateDeviceIds.has(e.device_id)) addSwitch(e);
    });
    const { climates: paired } = attachAcPowerSwitches(climates, switches, all);
    return paired.filter(isClimatePoweredOn).map((c) => ({
        ...(c.stateObj || c),
        entity_id: c.entity_id,
        state: c.stateObj?.state ?? c.state,
        attributes: c.stateObj?.attributes ?? c.attributes,
        powerSwitchEntityId: c.powerSwitchEntityId,
        powerSwitchStateObj: c.powerSwitchStateObj,
    }));
}

/**
 * Turn AC power on/off. When a paired switch exists, that switch is the on/off
 * control; HVAC mode is still updated so the climate entity stays in sync.
 *
 * `onUpdate(entityId, domain, service, data)` — same signature as ClimateCard.
 */
export function applyClimatePower(climate, wantOn, onUpdate, hvacMode = 'cool') {
    if (!onUpdate || !climate?.entity_id) return;
    const switchId = climate.powerSwitchEntityId;
    if (switchId) {
        onUpdate(switchId, 'switch', wantOn ? 'turn_on' : 'turn_off', { entity_id: switchId });
    }
    if (wantOn) {
        onUpdate(climate.entity_id, 'climate', 'set_hvac_mode', { hvac_mode: hvacMode || 'cool' });
    } else {
        onUpdate(climate.entity_id, 'climate', 'set_hvac_mode', { hvac_mode: 'off' });
    }
}

/** Same climates the room cards count — used by the home AC sheet and snowflake badge. */
export function collectRoomClimatesForModal(rooms = [], allEntities = []) {
    const byId = new Map();
    const all = Array.isArray(allEntities) ? allEntities : [];
    for (const room of Array.isArray(rooms) ? rooms : []) {
        for (const c of room?._entities?.climates || []) {
            if (!c?.entity_id || byId.has(c.entity_id)) continue;
            const stateObj = c.stateObj || all.find((e) => e.entity_id === c.entity_id);
            if (!stateObj || stateObj.state === 'unavailable') continue;
            const swId = c.powerSwitchEntityId || null;
            const swLive = (swId && all.find((e) => e.entity_id === swId))
                || c.powerSwitchStateObj
                || null;
            byId.set(c.entity_id, {
                entity_id: c.entity_id,
                state: stateObj.state,
                attributes: {
                    ...(stateObj.attributes || {}),
                    friendly_name: c.displayName
                        || stateObj.attributes?.friendly_name
                        || c.entity_id,
                },
                area_id: c.area_id || room.area_id,
                powerSwitchEntityId: swId,
                powerSwitchStateObj: swLive,
            });
        }
    }
    return [...byId.values()];
}
