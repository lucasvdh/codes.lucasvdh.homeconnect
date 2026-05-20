"use strict";

import crypto from "crypto";

/**
 * AES-256-CBC + chained HMAC framing used by the "HTTP" variant of Home
 * Connect appliances (plain ws:// on port 80, no TLS).
 *
 * Each websocket frame is:
 *   [ AES-256-CBC( plaintext || pad ) ][ HMAC-SHA256(...)[0:16] ]
 *
 * Keys are derived from the pre-shared key:
 *   encKey = HMAC(PSK, "ENC")
 *   macKey = HMAC(PSK, "MAC")
 *
 * The CBC IV is chained: the last ciphertext block of a frame becomes the
 * IV of the next frame in the same direction. The HMAC is also chained -
 * the previous frame's HMAC is mixed into the next - which is what prevents
 * replay and reordering by a local attacker.
 *
 * HMAC input = iv || directionByte || previousHmac || ciphertext
 *   direction = 0x45 ('E') for outbound, 0x43 ('C') for inbound.
 *
 * Note: the pad scheme is NOT PKCS#7 - do not swap in a standard CBC helper.
 */
export class AesHmacCodec {
  private readonly iv: Buffer;
  private readonly encKey: Buffer;
  private readonly macKey: Buffer;
  private lastRxHmac: Buffer;
  private lastTxHmac: Buffer;
  private encCbcIv: Buffer;
  private decCbcIv: Buffer;

  constructor(pskRaw: Buffer, ivRaw: Buffer) {
    this.iv = Buffer.from(ivRaw);
    this.encKey = AesHmacCodec.hmac(pskRaw, Buffer.from("ENC"));
    this.macKey = AesHmacCodec.hmac(pskRaw, Buffer.from("MAC"));
    this.lastRxHmac = Buffer.alloc(16);
    this.lastTxHmac = Buffer.alloc(16);
    this.encCbcIv = Buffer.from(this.iv);
    this.decCbcIv = Buffer.from(this.iv);
  }

  private static hmac(key: Buffer, msg: Buffer): Buffer {
    return crypto.createHmac("sha256", key).update(msg).digest();
  }

  private frameHmac(directionByte: number, chained: Buffer, enc: Buffer): Buffer {
    return AesHmacCodec.hmac(
      this.macKey,
      Buffer.concat([this.iv, Buffer.from([directionByte]), chained, enc]),
    ).subarray(0, 16);
  }

  encrypt(text: string): Buffer {
    let buf = Buffer.from(text, "utf8");

    // Pad scheme: last byte = pad length, first pad byte = 0x00, the rest
    // random. If the pad would be a single byte, add a whole extra block.
    let padLen = 16 - (buf.length % 16);
    if (padLen === 1) padLen += 16;
    const pad = Buffer.concat([
      Buffer.from([0x00]),
      crypto.randomBytes(padLen - 2),
      Buffer.from([padLen]),
    ]);
    buf = Buffer.concat([buf, pad]);

    const cipher = crypto.createCipheriv("aes-256-cbc", this.encKey, this.encCbcIv);
    cipher.setAutoPadding(false);
    const enc = Buffer.concat([cipher.update(buf), cipher.final()]);
    this.encCbcIv = Buffer.from(enc.subarray(enc.length - 16));

    this.lastTxHmac = this.frameHmac(0x45, this.lastTxHmac, enc);
    return Buffer.concat([enc, this.lastTxHmac]);
  }

  decrypt(buf: Buffer): string {
    if (buf.length < 32 || buf.length % 16 !== 0) {
      throw new Error(`bad frame length ${buf.length}`);
    }
    const enc = buf.subarray(0, buf.length - 16);
    const theirMac = buf.subarray(buf.length - 16);
    const ourMac = this.frameHmac(0x43, this.lastRxHmac, enc);
    if (!ourMac.equals(theirMac)) {
      throw new Error(
        `HMAC mismatch: ${theirMac.toString("hex")} vs ${ourMac.toString("hex")}`,
      );
    }
    this.lastRxHmac = Buffer.from(theirMac);

    const decipher = crypto.createDecipheriv("aes-256-cbc", this.encKey, this.decCbcIv);
    decipher.setAutoPadding(false);
    const plain = Buffer.concat([decipher.update(enc), decipher.final()]);
    this.decCbcIv = Buffer.from(enc.subarray(enc.length - 16));

    const padLen = plain[plain.length - 1];
    if (padLen < 1 || padLen > plain.length) throw new Error("bad padding");
    return plain.subarray(0, plain.length - padLen).toString("utf8");
  }
}

/** base64url -> Buffer. Home Connect keys are base64url without padding. */
export function b64urlDecode(s: string): Buffer {
  let t = s.replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  return Buffer.from(t, "base64");
}
