import { Buffer } from 'buffer';

/** Strip a standard 44-byte PCM WAV header; returns raw PCM base64. */
export function extractPcmFromWavBase64(wavBase64) {
    if (!wavBase64) return null;
    const buf = Buffer.from(wavBase64, 'base64');
    if (buf.length < 44) return null;
    if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
        return wavBase64;
    }
    let offset = 12;
    while (offset + 8 <= buf.length) {
        const chunkId = buf.toString('ascii', offset, offset + 4);
        const chunkSize = buf.readUInt32LE(offset + 4);
        if (chunkId === 'data') {
            const pcm = buf.subarray(offset + 8, offset + 8 + chunkSize);
            return pcm.toString('base64');
        }
        offset += 8 + chunkSize;
    }
    return buf.subarray(44).toString('base64');
}

/** Wrap 16-bit LE mono PCM base64 in a WAV container (base64 out). */
export function wrapPcm16InWav(pcmBase64, sampleRate) {
    const pcm = Buffer.from(pcmBase64, 'base64');
    const dataSize = pcm.length;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);
    return Buffer.concat([header, pcm]).toString('base64');
}
