import { Buffer } from 'buffer';

/**
 * RMS amplitude of 16-bit LE mono PCM (base64).
 * Range is roughly 0..32767; quiet rooms are typically < 200–400 after mic gain.
 */
export function pcm16Base64Rms(b64) {
    if (!b64) return 0;
    const buf = Buffer.from(b64, 'base64');
    const n = buf.length - (buf.length % 2);
    if (n < 2) return 0;
    const samples = n / 2;
    let sumSq = 0;
    for (let i = 0; i < samples; i++) {
        const s = buf.readInt16LE(i * 2);
        sumSq += s * s;
    }
    return Math.sqrt(sumSq / samples);
}
