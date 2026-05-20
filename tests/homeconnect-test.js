#!/usr/bin/env node
/**
 * homeconnect-test.js
 *
 * Minimaal Node.js testscript voor Bosch/Siemens Home Connect appliances
 * over het lokale netwerk. Verifieert dat je auth-keys werken en dat de
 * lokale websocket-communicatie loopt. Bedoeld als basis voor een Homey app.
 *
 * Gebruik:
 *   npm install ws
 *   node homeconnect-test.js path/to/devices.json [device-index]
 *
 * devices.json wordt gegenereerd door hcpy's hc-login.py en bevat per
 * appliance ofwel:
 *   - "key" (base64url) + tls=true       => TLS-PSK op poort 443 (wss)
 *   - "key" + "iv" (beide base64url)     => AES-256-CBC + HMAC op poort 80 (ws)
 *
 * Werkt met Node 18+. Voor de TLS-PSK variant is `tls.pskCallback` nodig
 * (Node 18+) en moet OpenSSL met PSK-ciphers gebouwd zijn (default in
 * de meeste Node distributies).
 */

'use strict';

const fs = require('fs');
const tls = require('tls');
const net = require('net');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const WebSocket = require('ws');

// ---------- helpers ----------------------------------------------------------

function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

function hmacSha256(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest();
}

function now() {
  return new Date().toISOString();
}

// ---------- AES-CBC + chained HMAC framing (HTTP appliances) -----------------
//
// Elk websocket-frame is:
//   [ AES-256-CBC(plain || pad) ][ HMAC-SHA256(...)[0:16] ]
//
// Sleutels:
//   encKey = HMAC(PSK, "ENC")
//   macKey = HMAC(PSK, "MAC")
//
// CBC IV chained over messages (laatste ciphertext-block wordt nieuwe IV).
// HMAC input = iv || directionByte || vorige_hmac || ciphertext.
//   direction = 0x45 ('E') voor outbound, 0x43 ('C') voor inbound.

class AesHmacCodec {
  constructor(pskRaw, ivRaw) {
    this.iv = Buffer.from(ivRaw);
    this.encKey = hmacSha256(pskRaw, Buffer.from('ENC'));
    this.macKey = hmacSha256(pskRaw, Buffer.from('MAC'));
    this.lastRxHmac = Buffer.alloc(16);
    this.lastTxHmac = Buffer.alloc(16);
    this.encCbcIv = Buffer.from(this.iv);
    this.decCbcIv = Buffer.from(this.iv);
  }

  _frameHmac(directionByte, chained, enc) {
    return hmacSha256(
      this.macKey,
      Buffer.concat([this.iv, Buffer.from([directionByte]), chained, enc]),
    ).subarray(0, 16);
  }

  encrypt(text) {
    let buf = Buffer.from(text, 'utf8');
    // hcpy pad-schema: pad-len byte als laatste byte, eerste byte 0x00,
    // willekeurige bytes ertussen. Als pad zou worden 1, voeg een hele
    // extra block toe.
    let padLen = 16 - (buf.length % 16);
    if (padLen === 1) padLen += 16;
    const pad = Buffer.concat([
      Buffer.from([0x00]),
      crypto.randomBytes(padLen - 2),
      Buffer.from([padLen]),
    ]);
    buf = Buffer.concat([buf, pad]);

    const cipher = crypto.createCipheriv('aes-256-cbc', this.encKey, this.encCbcIv);
    cipher.setAutoPadding(false);
    const enc = Buffer.concat([cipher.update(buf), cipher.final()]);
    // chain IV
    this.encCbcIv = Buffer.from(enc.subarray(enc.length - 16));

    this.lastTxHmac = this._frameHmac(0x45, this.lastTxHmac, enc);
    return Buffer.concat([enc, this.lastTxHmac]);
  }

  decrypt(buf) {
    if (buf.length < 32 || buf.length % 16 !== 0) {
      throw new Error(`bad frame length ${buf.length}`);
    }
    const enc = buf.subarray(0, buf.length - 16);
    const theirMac = buf.subarray(buf.length - 16);
    const ourMac = this._frameHmac(0x43, this.lastRxHmac, enc);
    if (!ourMac.equals(theirMac)) {
      throw new Error(`HMAC mismatch: ${theirMac.toString('hex')} vs ${ourMac.toString('hex')}`);
    }
    this.lastRxHmac = theirMac;

    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encKey, this.decCbcIv);
    decipher.setAutoPadding(false);
    const plain = Buffer.concat([decipher.update(enc), decipher.final()]);
    this.decCbcIv = Buffer.from(enc.subarray(enc.length - 16));

    const padLen = plain[plain.length - 1];
    if (padLen < 1 || padLen > plain.length) throw new Error('bad padding');
    return plain.subarray(0, plain.length - padLen).toString('utf8');
  }
}

// ---------- Static-socket Agent ---------------------------------------------
//
// Truc: ws gebruikt http(s).Agent.createConnection() om een socket te
// krijgen. We geven onze vooraf opgezette (PSK-)socket terug. Daarna doet
// ws zelf de HTTP Upgrade handshake en de frame-parsing.

function makeStaticAgent(socket, useTls) {
  const Base = useTls ? https.Agent : http.Agent;
  return new (class extends Base {
    createConnection(_opts, cb) {
      // De socket bestaat al en is (bij TLS) al gehandshaked.
      process.nextTick(() => cb(null, socket));
    }
  })({ keepAlive: false });
}

// ---------- main -------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  // --keep houdt de verbinding open (geen auto-close na 30s) zodat je kunt
  // zien of de NOTIFY-stream stabiel blijft.
  const keepOpen = args.includes('--keep');
  const positional = args.filter(a => !a.startsWith('--'));
  const [devicesPath, idxStr] = positional;
  if (!devicesPath) {
    console.error('Usage: node homeconnect-test.js devices.json [index] [--keep]');
    process.exit(1);
  }
  const devices = JSON.parse(fs.readFileSync(devicesPath, 'utf8'));
  const dev = devices[Number(idxStr || 0)];
  if (!dev) throw new Error('device not found at index');
  console.log(`[${now()}] device: ${dev.name} @ ${dev.host}`);

  const psk = b64urlDecode(dev.key);
  const useTls = !dev.iv; // geen IV = TLS-PSK variant
  let socket;
  let codec = null;
  let url;

  if (useTls) {
    console.log(`[${now()}] opening TLS-PSK to ${dev.host}:443`);
    socket = tls.connect({
      host: dev.host,
      port: 443,
      servername: dev.host,
      rejectUnauthorized: false,
      // BSH gebruikt PSK ciphers; TLS 1.3 wordt door de devices niet ondersteund.
      ciphers: 'ECDHE-PSK-CHACHA20-POLY1305:PSK-AES128-CBC-SHA:PSK',
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.2',
      pskCallback: () => ({ identity: 'HCCOM_Local_App', psk }),
    });
    await new Promise((res, rej) => {
      socket.once('secureConnect', () => res());
      socket.once('error', rej);
    });
    console.log(`[${now()}] TLS handshake ok, cipher=${socket.getCipher && socket.getCipher().name}`);
    url = `wss://${dev.host}:443/homeconnect`;
  } else {
    console.log(`[${now()}] opening TCP to ${dev.host}:80 (AES/HMAC mode)`);
    codec = new AesHmacCodec(psk, b64urlDecode(dev.iv));
    socket = net.connect({ host: dev.host, port: 80 });
    await new Promise((res, rej) => {
      socket.once('connect', () => res());
      socket.once('error', rej);
    });
    console.log(`[${now()}] TCP connected`);
    url = `ws://${dev.host}:80/homeconnect`;
  }

  // Upgrade naar websocket. ws gebruikt onze Agent om "een nieuwe socket te
  // openen" maar krijgt onze bestaande socket terug.
  const ws = new WebSocket(url, {
    agent: makeStaticAgent(socket, useTls),
    headers: { Origin: '' },
    // PSK socket heeft al hostname checks; ws hoeft niet opnieuw te valideren
    rejectUnauthorized: false,
  });

  // Sessie-state. Wordt pas gevuld als het DEVICE ons /ei/initialValues stuurt.
  // Belangrijk: de client spreekt NIET als eerste. Zelf eerst iets sturen
  // levert "Header Error" (close 1008) op.
  let sessionId = null;
  let txMsgId = null;
  const services = {};
  let servicesKnown = false;

  // WebSocket ping-keepalive. hcpy gebruikt ping_interval=120; zonder pings
  // kan een idle verbinding na verloop van tijd stilvallen.
  let pingTimer = null;
  ws.on('open', () => {
    console.log(`[${now()}] websocket open - wachten tot device /ei/initialValues stuurt`);
    pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
        console.log(`[${now()}] -> ping`);
      }
    }, 120_000);
  });
  ws.on('pong', () => console.log(`[${now()}] <- pong`));

  function sendJson(obj) {
    const txt = JSON.stringify(obj);
    console.log(`[tx] ${txt}`);
    if (codec) {
      ws.send(codec.encrypt(txt), { binary: true });
    } else {
      ws.send(txt);
    }
  }

  // get(): stuurt een bericht met de huidige sessie + oplopend msgID.
  // Net als hcpy: zodra /ci/services bekend is, gebruik de versie van die service.
  function get(resource, { version = 1, action = 'GET', data = null } = {}) {
    if (servicesKnown) {
      const svc = resource.split('/')[1];
      if (services[svc]) version = services[svc].version;
    }
    const msg = { sID: sessionId, msgID: txMsgId, resource, version, action };
    if (data != null) msg.data = Array.isArray(data) ? data : [data];
    sendJson(msg);
    txMsgId++;
  }

  // reply(): RESPONSE op een POST/GET van het device, met HUN msgID.
  function reply(msg, replyData) {
    sendJson({
      sID: msg.sID,
      msgID: msg.msgID,
      resource: msg.resource,
      version: msg.version,
      action: 'RESPONSE',
      data: [replyData],
    });
  }

  ws.on('message', (raw) => {
    let text;
    try {
      text = codec ? codec.decrypt(raw) : raw.toString('utf8');
    } catch (e) {
      console.error(`[!] decode error: ${e.message}`);
      return;
    }
    console.log(`[rx] ${text}`);

    let m;
    try { m = JSON.parse(text); } catch { return; }

    // 1) Het device opent de sessie met POST /ei/initialValues.
    //    We nemen hun sID + data[0].edMsgID over en antwoorden met onze identiteit.
    if (m.action === 'POST' && m.resource === '/ei/initialValues') {
      sessionId = m.sID;
      txMsgId = m.data[0].edMsgID;
      reply(m, {
        deviceType: m.version === 1 ? 2 : 'Application',
        deviceName: 'homey-homeconnect',
        deviceID: '0badcafe',
      });
      // Vraag eerst welke services het device ondersteunt.
      get('/ci/services');
      return;
    }

    // 2) Reactie op /ci/services: nu weten we de resource-versies en kunnen
    //    we de identiteit + volledige state opvragen (volgorde zoals hcpy).
    if ((m.action === 'RESPONSE' || m.action === 'NOTIFY') && m.resource === '/ci/services') {
      for (const svc of m.data || []) {
        services[svc.service] = { version: svc.version };
      }
      servicesKnown = true;

      if (services.iz) {
        get('/iz/info');
      } else {
        const nonce = crypto.randomBytes(32).toString('base64url');
        get('/ci/authentication', { version: 2, data: { nonce } });
        get('/ci/info');
      }
      get('/ei/deviceReady', { version: 2, action: 'NOTIFY' });
      if (services.ni) get('/ni/info');
      get('/ro/allMandatoryValues');
      get('/ro/allDescriptionChanges');
      return;
    }

    // 3) Overige POSTs van het device netjes bevestigen zodat de stream doorloopt.
    if (m.action === 'POST') {
      reply(m, {});
    }
  });

  ws.on('close', (code, reason) => {
    if (pingTimer) clearInterval(pingTimer);
    console.log(`[${now()}] closed code=${code} reason=${reason && reason.toString()}`);
    process.exit(0);
  });
  ws.on('error', e => console.error(`[!] ws error: ${e.message}`));

  if (keepOpen) {
    console.log('[i] --keep: verbinding blijft open, Ctrl-C om te stoppen');
  } else {
    // Stop netjes na 30s zodat je het script niet hoeft te killen
    setTimeout(() => { console.log('[i] timeout, closing'); ws.close(); }, 30_000);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
