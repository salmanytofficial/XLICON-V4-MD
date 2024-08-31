require('./settings'); 
const fs = require('fs');
const pino = require('pino');
const path = require('path');
const axios = require('axios');
const chalk = require('chalk');
const readline = require('readline');
const FileType = require('file-type');
const { exec } = require('child_process');           
const { Boom } = require('@hapi/boom');
const NodeCache = require('node-cache');
const PhoneNumber = require('awesome-phonenumber');
const { default: makeWASocket, useMultiFileAuthState, Browsers, DisconnectReason, makeInMemoryStore, makeCacheableSignalKeyStore, proto, PHONENUMBER_MCC, getAggregateVotesInPollMessage } = require('@whiskeysockets/baileys');

const pairingCode = process.argv.includes('--pairing-code');
const useMobile = process.argv.includes("--mobile");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

global.api = (name, path = '/', query = {}, apikeyqueryname) => (name in global.APIs ? global.APIs[name] : name) + path + (query || apikeyqueryname ? '?' + new URLSearchParams(Object.entries({ ...query, ...(apikeyqueryname ? { [apikeyqueryname]: global.APIKeys[name in global.APIs ? global.APIs[name] : name] } : {}) })) : '');

const DataBase = require('./src/database');
const database = new DataBase();
(async () => {
    const loadData = await database.read();
    if (loadData && Object.keys(loadData).length === 0) {
        global.db = {
            sticker: {},
            users: {},
            groups: {},
            database: {},
            settings: {},
            others: {},
            ...(loadData || {}),
        };
        await database.write(global.db);
    } else {
        global.db = loadData;
    }

    setInterval(async () => {
        if (global.db) await database.write(global.db);
    }, 30000);
})();

const { GroupUpdate, GroupParticipantsUpdate, MessagesUpsert, Solving } = require('./src/message');
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif');
const { isUrl, generateMessageTag, getBuffer, getSizeMedia, fetchJson, await, sleep } = require('./lib/function');

async function startXliconBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session');
    const msgRetryCounterCache = new NodeCache();
    const logger = pino({ level: 'silent' });

    const getMessage = async (key) => {
        if (store) {
            const msg = await store.loadMessage(key.remoteJid, key.id);
            return msg?.message;
        }
        return {
            conversation: 'Cheems Bot Here!',
        };
    };

    const XliconBotInc = makeWASocket({
        version: [2, 3000, 1015901307],
        logger: logger,
        printQRInTerminal: !pairingCode,
        browser: [process.env.NAME_BOT_BROWSER || "Whatsapp Web", "Chrome", "3.0"],
        patchMessageBeforeSending: (message) => {
            const requiresPatch = !!(
                message.buttonsMessage ||
                message.templateMessage ||
                message.listMessage
            );
            if (requiresPatch) {
                message = {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: {
                                deviceListMetadataVersion: 2,
                                deviceListMetadata: {},
                            },
                            ...message,
                        },
                    },
                };
            }
            return message;
        },
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        transactionOpts: {
            maxCommitRetries: 10,
            delayBetweenTriesMs: 10,
        },
        getMessage,
        syncFullHistory: true,
        maxMsgRetryCount: 15,
        msgRetryCounterCache,
        retryRequestDelayMs: 10,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        defaultQueryTimeoutMs: undefined,
        generateHighQualityLinkPreview: true,
    });

    if (pairingCode && !XliconBotInc.authState.creds.registered) {
        let phoneNumber;
        async function getPhoneNumber() {
            phoneNumber = await question(chalk.bgBlack(chalk.greenBright('Please type your WhatsApp number : ')));
            phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

            if (!Object.keys(PHONENUMBER_MCC).some(v => phoneNumber.startsWith(v)) && !phoneNumber.length < 6) {
                console.log(chalk.bgBlack(chalk.redBright('Start with your Country WhatsApp code') + chalk.whiteBright(',') + chalk.greenBright(' Example : 62xxx')));
                await getPhoneNumber();
            }
        }

        setTimeout(async () => {
            await getPhoneNumber();
            let code = await XliconBotInc.requestPairingCode(phoneNumber);
            console.log(chalk.black(chalk.bgGreen(`Your Pairing Code : `)), chalk.black(chalk.white(code)));
        }, 3000);
    }

    store.bind(XliconBotInc.ev);

    await Solving(XliconBotInc, store);

    XliconBotInc.ev.on('creds.update', saveCreds);

    XliconBotInc.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, receivedPendingNotifications } = update;
        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            if (reason === DisconnectReason.connectionLost) {
                console.log('Connection to Server Lost, Attempting to Reconnect...');
                startXliconBot();
            } else if (reason === DisconnectReason.connectionClosed) {
                console.log('Connection closed, Attempting to Reconnect...');
                startXliconBot();
            } else if (reason === DisconnectReason.restartRequired) {
                console.log('Restart Required...');
                startXliconBot();
            } else if (reason === DisconnectReason.timedOut) {
                console.log('Connection Timed Out, Attempting to Reconnect...');
                startXliconBot();
            } else if (reason === DisconnectReason.badSession) {
                console.log('Delete Session and Scan again...');
                process.exit(1);
            } else if (reason === DisconnectReason.connectionReplaced) {
                console.log('Close current Session first...');
                XliconBotInc.logout();
            } else if (reason === DisconnectReason.loggedOut) {
                console.log('Scan again and Run...');
            } else if (reason === DisconnectReason.Multidevicemismatch) {
                console.log('Scan again...');
            } else {
                XliconBotInc.end(`Unknown DisconnectReason : ${reason}|${connection}`);
            }
        }
        if (connection == 'open') {
            console.log('Connected to : ' + JSON.stringify(XliconBotInc.user, null, 2));
        } else if (receivedPendingNotifications == 'true') {
            console.log('Please wait About 1 Minute...');
        }
    });

    XliconBotInc.ev.on('contacts.update', (update) => {
        for (let contact of update) {
            let id = XliconBotInc.decodeJid(contact.id);
            if (store && store.contacts) store.contacts[id] = { id, name: contact.notify };
        }
    });

    XliconBotInc.ev.on('call', async (call) => {
        let botNumber = await XliconBotInc.decodeJid(XliconBotInc.user.id);
        let anticall = global.db.settings[botNumber].anticall;
        if (anticall) {
            for (let id of call) {
                if (id.status === 'offer') {
                    let msg = await XliconBotInc.sendMessage(id.from, { text: `Currently, We Cannot Receive Calls ${id.isVideo ? 'Video' : 'Suara'}.\nIf @${id.from.split('@')[0]} Need Help, Please Contact Owner :)`, mentions: [id.from] });
                    await XliconBotInc.sendContact(id.from, global.owner, msg);
                    await XliconBotInc.rejectCall(id.id, id.from);
                }
            }
        }
    });

    XliconBotInc.ev.on('groups.update', async (update) => {
        await GroupUpdate(XliconBotInc, update, store);
    });

    XliconBotInc.ev.on('group-participants.update', async (update) => {
        await GroupParticipantsUpdate(XliconBotInc, update);
    });

    XliconBotInc.ev.on('messages.upsert', async (message) => {
        await MessagesUpsert(XliconBotInc, message, store);
    });

    return XliconBotInc;
}

startXliconBot();

let file = require.resolve(__filename);
fs.watchFile(file, () => {
    fs.unwatchFile(file);
    console.log(chalk.redBright(`Update ${__filename}`));
    delete require.cache[file];
    require(file);
});
