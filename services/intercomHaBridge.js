let unlockService = null;

export function setIntercomUnlockService(fn) {
    unlockService = typeof fn === 'function' ? fn : null;
}

export function getIntercomUnlockService() {
    return unlockService;
}
