// ──────────────────────────────────────────────────────────────
// 1️⃣  Load environment variables FIRST — before any other import
//     so that every module sees process.env values immediately.
// ──────────────────────────────────────────────────────────────
import dotenv from 'dotenv';
import path from 'path';
import dns from 'dns';

// In production (Docker / Dokploy) env vars come from the container
// environment, so .env files are not required. During local development
// we load backend/.env explicitly.
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ──────────────────────────────────────────────────────────────
// 2️⃣  Now import the rest of the application
// ──────────────────────────────────────────────────────────────
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import routes from './routes';
import { sendDueAssessmentReminders } from './controllers/teacher.controller';
import { startUnverifiedAccountCleanupScheduler } from './services/account-cleanup.service';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', routes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'ExamAssess API is running' });
});

// Serve frontend static files
const frontendDistPath = path.resolve(__dirname, '../frontend/dist');
const teacherImagesPath = path.resolve(__dirname, '../teacher-images');
app.use('/teacher-images', express.static(teacherImagesPath));
app.use(express.static(frontendDistPath));

// Catch-all route to serve React app for non-API requests
app.get('*', (req, res, next) => {
    // If it's an API route that wasn't found, let it pass to error handler (404)
    if (req.path.startsWith('/api/')) {
        return next();
    }
    res.sendFile(path.join(frontendDistPath, 'index.html'));
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        message: err.message || 'Internal server error',
    });
});

// ──────────────────────────────────────────────────────────────
// 3️⃣  Utility — mask credentials in a MongoDB URI for safe logging
// ──────────────────────────────────────────────────────────────
function maskUri(uri: string): string {
    try {
        return uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
    } catch {
        return '(unable to parse URI)';
    }
}

// ──────────────────────────────────────────────────────────────
// 4️⃣  DNS diagnostic — fix broken localhost DNS resolver
//     Node.js sometimes picks up 127.0.0.1 from a VPN, Docker,
//     or WSL network adapter. If no DNS server is running there,
//     all SRV lookups (required by mongodb+srv://) will fail
//     with ECONNREFUSED. We detect this and override with
//     reliable public DNS servers.
// ──────────────────────────────────────────────────────────────
function ensureDnsServers(): void {
    const PUBLIC_DNS = ['8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1'];
    const currentServers = dns.getServers();
    console.log(`  Checking DNS configuration...`);
    console.log(`  Current DNS servers: [${currentServers.join(', ')}]`);

    const hasBrokenLocalhost = currentServers.some(
        (s) => s === '127.0.0.1' || s === '::1'
    );

    if (hasBrokenLocalhost) {
        console.log(
            `  ⚠  DNS server includes 127.0.0.1 (localhost) — no local DNS server is running.`
        );
        console.log(`     Overriding with public DNS: [${PUBLIC_DNS.join(', ')}]`);
        dns.setServers(PUBLIC_DNS);
        console.log(`  ✓  DNS servers updated to [${dns.getServers().join(', ')}]`);
    } else {
        console.log(`  ✓  DNS configuration looks healthy`);
    }
}

// ──────────────────────────────────────────────────────────────
// 5️⃣  Pre-flight SRV check — verify DNS can resolve the Atlas
//     cluster before handing off to the MongoDB driver.
// ──────────────────────────────────────────────────────────────
function preflightSrvCheck(uri: string): Promise<void> {
    // Only relevant for mongodb+srv:// URIs
    if (!uri.startsWith('mongodb+srv://')) {
        console.log(`  ✓  Standard connection string (no SRV lookup needed)`);
        return Promise.resolve();
    }

    // Extract hostname from URI:  mongodb+srv://user:pass@HOSTNAME/db...
    const match = uri.match(/@([^/]+)/);
    if (!match) {
        console.log(`  ⚠  Could not extract hostname from URI — skipping SRV pre-check`);
        return Promise.resolve();
    }

    const hostname = match[1];
    const srvName = `_mongodb._tcp.${hostname}`;
    console.log(`  Resolving MongoDB Atlas SRV record (${srvName})...`);

    return new Promise((resolve) => {
        dns.resolveSrv(srvName, (err, addresses) => {
            if (err) {
                console.error(`  ✗  SRV lookup FAILED: ${err.code} — ${err.message}`);
                console.error(`     The MongoDB driver will likely fail to connect.`);
                console.error(`     Check your network, firewall, or DNS settings.`);
                // Don't reject — let the driver attempt and produce its own error
            } else {
                console.log(`  ✓  SRV resolved: ${addresses.length} host(s) found`);
                addresses.forEach((a) =>
                    console.log(`     → ${a.name}:${a.port}`)
                );
            }
            resolve();
        });
    });
}

// ──────────────────────────────────────────────────────────────
// 6️⃣  Database connection — full diagnostic startup
// ──────────────────────────────────────────────────────────────
const connectDB = async (): Promise<boolean> => {
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║          ExamAssess — MongoDB Connection              ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');

    // --- Step 1: Verify environment ---
    console.log('  Loading environment variables...');
    console.log(`  ✓  Environment loaded (NODE_ENV=${process.env.NODE_ENV || 'not set'})`);

    // --- Step 2: Verify MONGODB_URI ---
    console.log('  Reading MONGODB_URI...');
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
        console.error(
            '  ✗  MONGODB_URI is not defined!\n' +
            '     ─ For local development : create backend/.env with MONGODB_URI=<your-connection-string>\n' +
            '     ─ For production        : set the MONGODB_URI environment variable in your hosting dashboard (Dokploy, Docker, etc.)\n' +
            '     ─ See backend/.env.example for the full list of required variables.'
        );
        return false;
    }
    console.log(`  ✓  URI found: ${maskUri(mongoUri)}`);

    // --- Step 3: Fix DNS if necessary ---
    ensureDnsServers();

    // --- Step 4: Pre-flight SRV check ---
    await preflightSrvCheck(mongoUri);

    // --- Step 5: Connect ---
    console.log('  Connecting to MongoDB Atlas...');
    try {
        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 15000,   // wait up to 15s for a server
            socketTimeoutMS: 45000,            // close sockets after 45s of inactivity
            heartbeatFrequencyMS: 10000,       // heartbeat every 10s
        });
        console.log('  ✓  Connected to MongoDB Atlas\n');
        return true;
    } catch (error: any) {
        console.error('  ✗  MongoDB connection FAILED\n');
        console.error(`     Error: ${error.message || error}`);
        if (error.reason) {
            console.error(`     Reason: ${JSON.stringify(error.reason)}`);
        }
        console.error('\n     ── Troubleshooting ──');
        console.error('     1. Check your network / firewall');
        console.error('     2. Verify the MONGODB_URI in your .env file');
        console.error('     3. Confirm your IP is whitelisted in MongoDB Atlas');
        console.error('     4. Try: node -e "require(\'dns\').resolveSrv(\'_mongodb._tcp.cluster0.ir2mecc.mongodb.net\', console.log)"');
        console.error('');
        return false;
    }
};

// ──────────────────────────────────────────────────────────────
// 7️⃣  Mongoose connection lifecycle handlers
// ──────────────────────────────────────────────────────────────
mongoose.connection.on('connected', () => {
    console.log('[Mongoose] Connection established');
});
mongoose.connection.on('disconnected', () => {
    console.warn('[Mongoose] Connection lost — the driver will attempt to reconnect');
});
mongoose.connection.on('reconnected', () => {
    console.log('[Mongoose] Reconnected successfully');
});
mongoose.connection.on('error', (err) => {
    console.error('[Mongoose] Connection error:', err.message || err);
});

// ──────────────────────────────────────────────────────────────
// 8️⃣  Graceful shutdown
// ──────────────────────────────────────────────────────────────
function gracefulShutdown(signal: string) {
    console.log(`\n[Shutdown] Received ${signal} — closing MongoDB connection...`);
    mongoose.connection.close().then(() => {
        console.log('[Shutdown] MongoDB connection closed. Goodbye.');
        process.exit(0);
    }).catch(() => {
        process.exit(1);
    });
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ──────────────────────────────────────────────────────────────
// 9️⃣  Start server — fail fast if DB is unavailable
// ──────────────────────────────────────────────────────────────
const startServer = async () => {
    const connected = await connectDB();

    if (!connected) {
        console.error('\n  ════════════════════════════════════════════════');
        console.error('  Application startup ABORTED — MongoDB is unavailable.');
        console.error('  The server will NOT start without a database connection.');
        console.error('  ════════════════════════════════════════════════\n');
        process.exit(1);
    }

    // --- Start Express only after DB is confirmed ---
    app.listen(PORT as number, '0.0.0.0', () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📍 API endpoint: http://0.0.0.0:${PORT}/api`);
    });

    // --- Start background services only after DB is confirmed ---
    console.log('  Starting background services...');

    // Assessment reminder scheduler with overlap guard
    let reminderRunning = false;
    setInterval(async () => {
        if (reminderRunning) return;
        reminderRunning = true;
        try {
            await sendDueAssessmentReminders();
        } catch (error) {
            console.error('Teacher assessment scheduler error:', error);
        } finally {
            reminderRunning = false;
        }
    }, 5 * 60 * 1000);

    startUnverifiedAccountCleanupScheduler();

    console.log('  ✓  Background services started\n');
};

startServer();
