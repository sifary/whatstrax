/**
 * Device Activity Tracker - Web Server
 *
 * HTTP server with Socket.IO for real-time tracking visualization.
 * Provides REST API and WebSocket interface for the React frontend.
 *
 * For educational and research purposes only.
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { pino } from 'pino';
import { Boom } from '@hapi/boom';
import { WhatsAppTracker, ProbeMethod } from './tracker.js';
import cookieSession from 'cookie-session';
import { setupAuth, isAuthenticated } from './auth.js';
import passport from 'passport';
import fs from 'fs';
import path from 'path';

// Configuration
const DATA_DIR = process.env.DATA_DIR || './data';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-do-not-use-in-prod';
const PORT = parseInt(process.env.PORT || '3001', 10);

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const app = express();

// Session Middleware
const sessionMiddleware = cookieSession({
    name: 'session',
    keys: [SESSION_SECRET],
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax'
});

app.use(sessionMiddleware);
app.use(cors({
    origin: true,
    credentials: true
}));

// Setup Authentication
setupAuth(app);

// Auth Routes
app.get('/auth/google', passport.authenticate('google', { scope: ['email', 'profile'] }));

app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login?error=auth_failed' }),
    (req, res) => {
        res.redirect('/');
    }
);

app.get('/api/auth/status', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ authenticated: true, user: req.user });
    } else {
        res.json({ authenticated: false });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.logout(() => {
        res.json({ success: true });
    });
});

// Protect all other API routes
app.use('/api', isAuthenticated);

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: true,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Socket.IO Auth Middleware
const wrap = (middleware: any) => (socket: any, next: any) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));
io.use(wrap(passport.initialize()));
io.use(wrap(passport.session()));

io.use((socket: any, next) => {
    if (socket.request.user) {
        next();
    } else {
        next(new Error('Unauthorized'));
    }
});

// App State
let sock: any;
let isWhatsAppConnected = false;
let globalProbeMethod: ProbeMethod = 'delete';
let currentWhatsAppQr: string | null = null;

// Persistence
const CONTACTS_FILE = path.join(DATA_DIR, 'contacts.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

interface TrackerEntry {
    tracker: WhatsAppTracker;
    platform: 'whatsapp';
}

const trackers: Map<string, TrackerEntry> = new Map();

// --- Persistence Helpers ---

function loadContacts(): string[] {
    try {
        if (fs.existsSync(CONTACTS_FILE)) {
            const data = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf-8'));
            return data.map((c: any) => c.id);
        }
    } catch (err) {
        console.error('Failed to load contacts:', err);
    }
    return [];
}

function saveContacts() {
    try {
        const data = Array.from(trackers.entries()).map(([id, entry]) => ({
            id,
            platform: entry.platform
        }));
        fs.writeFileSync(CONTACTS_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Failed to save contacts:', err);
    }
}

// History persistence (simple key-value store for now)
let historyCache: Record<string, any[]> = {};

function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            historyCache = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
        }
    } catch (err) {
        console.error('Failed to load history:', err);
    }
}

function saveHistory() {
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(historyCache, null, 2));
    } catch (err) {
        console.error('Failed to save history:', err);
    }
}

function appendHistory(jid: string, dataPoint: any) {
    if (!historyCache[jid]) {
        historyCache[jid] = [];
    }
    // Limit history per contact to prevent infinite growth
    if (historyCache[jid].length > 1000) {
        historyCache[jid].shift();
    }
    historyCache[jid].push(dataPoint);
    saveHistory(); // In production, debounce this or use a DB
}

// Load initial data
loadHistory();
const initialContacts = loadContacts();

// --- WhatsApp Logic ---

async function connectToWhatsApp() {
    const authPath = path.join(DATA_DIR, 'auth_info_baileys');
    const { state, saveCreds } = await useMultiFileAuthState(authPath);

    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        markOnlineOnConnect: true,
        printQRInTerminal: false,
    });

    sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('QR Code generated');
            currentWhatsAppQr = qr;
            io.emit('qr', qr);
        }

        if (connection === 'close') {
            isWhatsAppConnected = false;
            currentWhatsAppQr = null;
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('connection closed, reconnecting ', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            isWhatsAppConnected = true;
            currentWhatsAppQr = null;
            console.log('opened connection');
            io.emit('connection-open');

            // Restore trackers
            initialContacts.forEach(jid => {
                if (!trackers.has(jid)) {
                    console.log(`Restoring tracker for ${jid}`);
                    startTrackingWhatsApp(jid.split('@')[0], false);
                }
            });
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

async function startTrackingWhatsApp(number: string, emitError = true) {
    const cleanNumber = number.replace(/\D/g, '');
    const targetJid = cleanNumber + '@s.whatsapp.net';

    if (trackers.has(targetJid)) {
        if (emitError) io.emit('error', { jid: targetJid, message: 'Already tracking this contact' });
        return;
    }

    try {
        const results = await sock.onWhatsApp(targetJid);
        const result = results?.[0];

        if (result?.exists) {
            const tracker = new WhatsAppTracker(sock, result.jid);
            tracker.setProbeMethod(globalProbeMethod);
            trackers.set(result.jid, { tracker, platform: 'whatsapp' });

            // Send existing history if available
            if (historyCache[result.jid]) {
                historyCache[result.jid].forEach(data => {
                     io.emit('tracker-update', {
                        jid: result.jid,
                        platform: 'whatsapp',
                        ...data,
                        isHistory: true 
                    });
                });
            }

            tracker.onUpdate = (updateData) => {
                const dataPoint = {
                    jid: result.jid,
                    platform: 'whatsapp',
                    ...updateData,
                    timestamp: Date.now()
                };
                
                // Only save/emit if it's a valid data point (has rtt/state)
                if (updateData.devices && updateData.devices.length > 0) {
                     appendHistory(result.jid, dataPoint);
                }

                io.emit('tracker-update', dataPoint);
            };

            tracker.startTracking();

            // Fetch info
            const ppUrl = await tracker.getProfilePicture();
            let contactName = cleanNumber;
            try {
                const contactInfo = await sock.onWhatsApp(result.jid);
                if (contactInfo && contactInfo[0]?.notify) {
                    contactName = contactInfo[0].notify;
                }
            } catch (err) {
                 // ignore
            }

            io.emit('contact-added', {
                jid: result.jid,
                number: cleanNumber,
                platform: 'whatsapp'
            });

            io.emit('profile-pic', { jid: result.jid, url: ppUrl });
            io.emit('contact-name', { jid: result.jid, name: contactName });
            
            saveContacts();

        } else {
             if (emitError) io.emit('error', { jid: targetJid, message: 'Number not on WhatsApp' });
        }
    } catch (err) {
        console.error(err);
        if (emitError) io.emit('error', { jid: targetJid, message: 'Verification failed' });
    }
}

connectToWhatsApp();

// --- Socket.IO Handling ---

io.on('connection', (socket) => {
    console.log(`Client connected: ${(socket.request as any).user.displayName}`);

    if (currentWhatsAppQr) socket.emit('qr', currentWhatsAppQr);
    if (isWhatsAppConnected) socket.emit('connection-open');
    socket.emit('probe-method', globalProbeMethod);

    // Send tracked contacts
    const trackedList = Array.from(trackers.entries()).map(([id, entry]) => ({
        id,
        platform: entry.platform
    }));
    socket.emit('tracked-contacts', trackedList);
    
    // Resend history for all contacts
    trackedList.forEach(c => {
        if (historyCache[c.id]) {
            historyCache[c.id].forEach(data => {
                socket.emit('tracker-update', {
                   jid: c.id,
                   platform: 'whatsapp',
                   ...data,
                   isHistory: true 
               });
           });
        }
    });

    socket.on('get-tracked-contacts', () => {
        const trackedList = Array.from(trackers.entries()).map(([id, entry]) => ({
            id,
            platform: entry.platform
        }));
        socket.emit('tracked-contacts', trackedList);
    });

    socket.on('add-contact', async (data: string | { number: string; platform: 'whatsapp' }) => {
        const { number } = typeof data === 'string' ? { number: data } : data;
        await startTrackingWhatsApp(number);
    });

    socket.on('remove-contact', (jid: string) => {
        const entry = trackers.get(jid);
        if (entry) {
            entry.tracker.stopTracking();
            trackers.delete(jid);
            socket.emit('contact-removed', jid);
            saveContacts();
        }
    });

    socket.on('set-probe-method', (method: ProbeMethod) => {
        if (method !== 'delete' && method !== 'reaction') return;
        globalProbeMethod = method;
        for (const entry of trackers.values()) {
            entry.tracker.setProbeMethod(method);
        }
        io.emit('probe-method', method);
    });
});

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
