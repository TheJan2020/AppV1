import { Buffer } from 'buffer';

/** Apply gain to 16-bit LE mono PCM (base64 in/out). Clamps to int16 range. */
export function amplifyPcm16Base64(b64, gain) {
    if (!b64 || gain === 1) return b64;
    const buf = Buffer.from(b64, 'base64');
    const out = Buffer.alloc(buf.length);
    const samples = Math.floor(buf.length / 2);
    for (let i = 0; i < samples; i++) {
        let s = buf.readInt16LE(i * 2) * gain;
        if (s > 32767) s = 32767;
        else if (s < -32768) s = -32768;
        out.writeInt16LE(s, i * 2);
    }
    return out.toString('base64');
}
