import { useRef, useState, useCallback } from 'react';

/**
 * Disable parent ScrollView scrolling while a child slider/drag is active.
 * Ref-counted so overlapping drags (unlikely) still unlock correctly.
 */
export function useParentScrollLock() {
    const lockCount = useRef(0);
    const [scrollEnabled, setScrollEnabled] = useState(true);

    const onSliderDragStart = useCallback(() => {
        lockCount.current += 1;
        if (lockCount.current === 1) {
            setScrollEnabled(false);
        }
    }, []);

    const onSliderDragEnd = useCallback(() => {
        lockCount.current = Math.max(0, lockCount.current - 1);
        if (lockCount.current === 0) {
            setScrollEnabled(true);
        }
    }, []);

    return { scrollEnabled, onSliderDragStart, onSliderDragEnd };
}
