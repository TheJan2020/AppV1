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
        climate?.displayName
        || climate?.name
        || climate?.original_name
        || climate?.stateObj?.attributes?.friendly_name
        || climate?.attributes?.friendly_name
        || climate?.entity_id
        || ''
    );
}

function switchLabel(sw) {
    return (
        sw?.displayName
        || sw?.name
        || sw?.original_name
        || sw?.stateObj?.attributes?.friendly_name
        || sw?.attributes?.friendly_name
        || sw?.entity_id
        || ''
    );
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

    const acName = normalizeAcLabel(climateLabel(climate));
    const swName = normalizeAcLabel(switchLabel(sw));
    const acId = normalizeAcLabel(climate.entity_id);
    const swId = normalizeAcLabel(sw.entity_id);
    if (!acName && !acId) return false;

    if (opts.soleClimate && SWITCH_ONLY_RE.test(swName)) return true;

    // Same label / id (climate "2nd AC" + switch "2nd AC")
    if (swName && (swName === acName || swName === acId)) return true;
    if (swId && (swId === acId || swId === acName)) return true;

    const swNameBase = stripSwitchSuffix(swName);
    const swIdBase = stripSwitchSuffix(swId);

    if (hasSwitchSuffix(swName) && swNameBase && (swNameBase === acName || swNameBase === acId)) {
        return true;
    }
    if (hasSwitchSuffix(swId) && swIdBase && (swIdBase === acId || swIdBase === acName)) {
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
        const live = entities.find((e) => e.entity_id === sw.entity_id) || sw.stateObj || null;
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
