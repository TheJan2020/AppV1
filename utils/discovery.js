import * as Network from 'expo-network';

export async function discoverHomeAssistant() {
    try {
        const ip = await Network.getIpAddressAsync();
        if (!ip || ip === '0.0.0.0') return null;

        const subnet = ip.substring(0, ip.lastIndexOf('.'));
        const promises = [];

        // Scan typical range 
        // Optimization: Prioritize searching, maybe split into chunks to avoid too many requests
        // But for local simple scan, 255 requests might be okay-ish if parallelized with fast timeout
        for (let i = 1; i < 255; i++) {
            const targetIp = `${subnet}.${i}`;
            promises.push(checkIp(targetIp));
        }

        // Also check local names like homeassistant.local
        promises.push(checkIp('homeassistant.local', false));

        const results = await Promise.race(promises.filter(p => p !== null));
        return results;
    } catch (e) {
        console.log('Discovery failed:', e);
        return null;
    }
}

async function checkIp(ipOrHost, isIp = true) {
    const url = `http://${ipOrHost}:8123`;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1500); // 1.5s timeout

    try {
        const response = await fetch(url + '/manifest.json', {
            method: 'GET',
            signal: controller.signal
        });
        clearTimeout(id);
        if (response.ok || response.status === 401) { // 200 or 401 means something is there
            return url;
        }
    } catch (err) {
        // Ignore errors
    }
    return new Promise(() => { }); // Never resolve if failed, to let Promise.race wait for others? 
    // Wait, Promise.race will return the *first* settled. 
    // If I want the first *success*, Promice.race is tricky if failures return fast.
    // Better: use Promise.any (ES2021) or a custom wrapper.
    // Since we want functionality, let's just return null and handle it.
}

// Better discovery approach:
export async function scanNetwork(onFound) {
    const ip = await Network.getIpAddressAsync();
    if (!ip) return;
    const subnet = ip.substring(0, ip.lastIndexOf('.'));

    // Batch requests to avoid socket overload
    const batchSize = 50;
    const hosts = [];
    for (let i = 1; i < 255; i++) hosts.push(`${subnet}.${i}`);
    hosts.push('homeassistant.local');

    for (let i = 0; i < hosts.length; i += batchSize) {
        const batch = hosts.slice(i, i + batchSize);
        await Promise.all(batch.map(async (host) => {
            const url = `http://${host}:8123`;
            const valid = await isHomeAssistant(url);
            if (valid) onFound(url);
        }));
    }
}

async function isHomeAssistant(url) {
    try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 1000);
        const res = await fetch(url + '/manifest.json', { signal: controller.signal });
        clearTimeout(id);
        return res.status === 200; // manifest.json should be public
    } catch {
        return false;
    }
}
