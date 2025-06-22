// =================================================================
// 1. SETUP & IMPORT LIBRARY
// =================================================================
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const mysql = require("mysql2/promise");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs"); // Diimpor untuk membuat direktori
const { expressjwt } = require("express-jwt");

const app = express();
const PORT = 8080;
const JWT_SECRET = "KunciRahasiaSuperAmanTimGrowLinkAnda";

// Middleware
app.use(express.json());
app.use(cors());

// Middleware untuk menyajikan file statis dari folder 'uploads'
// path.join(__dirname, 'uploads') akan membuat path absolut ke folder uploads
// yang berada di dalam direktori 'api' Anda.
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Middleware Otentikasi (JWT)
const checkAuth = expressjwt({
    secret: JWT_SECRET,
    algorithms: ["HS256"],
});

app.use(
    checkAuth.unless({
        path: [
            /^\/auth\/.*/,
            { url: /^\/events\/?$/, methods: ['GET'] },
            { url: /^\/events\/\d+.*$/, methods: ['GET'] },
            { url: /^\/threads\/?$/, methods: ['GET'] },
            { url: /^\/threads\/\d+.*$/, methods: ['GET'] },
            { url: /^\/templates\/?$/, methods: ['GET'] },
            { url: /^\/templates\/\d+.*$/, methods: ['GET'] },
            /^\/uploads\/.*/,
        ]
    })
);

// DEBUGGING MIDDLEWARE: Log the state of authentication
app.use((req, res, next) => {
  console.log('--- JWT AUTH DEBUG ---');
  console.log('Time:', new Date().toISOString());
  console.log('Request Path:', req.path);
  console.log('Has req.auth?', !!req.auth);
  if (req.auth) {
    console.log('req.auth contents:', req.auth);
  }
  console.log('--- END DEBUG ---');
  next();
});


// =================================================================
// 2. KONFIGURASI DATABASE & FILE UPLOAD
// =================================================================

const dbPool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'growlink_db',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Konfigurasi Multer yang lebih tangguh
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let subDir = '';
        if (file.fieldname === 'cv') subDir = 'cvs';
        if (file.fieldname === 'image') subDir = 'images';
        if (file.fieldname === 'keySum') subDir = 'pdfs';
        if (file.fieldname === 'template_file') subDir = 'templates';
        
        // The path should be relative to the /usr/src/app working directory inside the container
        const fullPath = path.join(__dirname, 'uploads', subDir);

        // Buat direktori jika belum ada
        fs.mkdirSync(fullPath, { recursive: true });
        
        cb(null, fullPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });


// =================================================================
// 3. MIDDLEWARE OTENTIKASI (JWT)
// =================================================================
const checkSpeakerRole = (req, res, next) => {
    if (req.auth && req.auth.role !== 'speaker') {
        return res.status(403).json({ message: "Access forbidden. Speaker role required." });
    }
    next();
};


// =================================================================
// 4. ROUTES (ENDPOINT API)
// =================================================================

// --- AUTHENTICATION ROUTES ---
const authRouter = require('./routes/auth.js')(dbPool, bcrypt, jwt, JWT_SECRET);
app.use('/auth', authRouter);

// --- GROWTOGETHER (EVENTS) ROUTES ---
// Saya mengganti nama file rute agar lebih jelas
const eventsRouter = require('./routes/growtogether.js')(dbPool, checkAuth, upload);
app.use('/events', eventsRouter);

const userRouter = require('./routes/users.js')(dbPool, checkAuth, upload, jwt, JWT_SECRET);
app.use('/users', userRouter);

// --- GROWHUB (TEMPLATES) ROUTES ---
const hubRouter = require('./routes/growhub.js')(dbPool, checkAuth, upload);
app.use('/templates', hubRouter);

// --- GROWFORUM (THREADS) ROUTES ---
const forumRouter = require('./routes/growforum.js')(dbPool, checkAuth);
app.use('/threads', forumRouter);

app.get('/', (req, res) => {
    res.status(200).json({ 
        message: "Welcome to the GrowLink Integrated API!",
        status: "ok",
        timestamp: new Date().toISOString(),
        features: [
            "/auth",
            "/growtogether",
            "/growhub",
            "/growforum"
        ]
    });
});

// --- USER-SPECIFIC ROUTES ---
// Rute ini bisa Anda buat nanti untuk fitur seperti "My Activities", dll.
// const userRouter = require('./routes/user.js')(dbPool, checkAuth);
// app.use('/user', userRouter);

// Centralized error handler for REST API
app.use((err, req, res, next) => {
    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({ message: 'Invalid or expired token.' });
    }
    console.error(err.stack);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal Server Error'
    });
});

// =================================================================
// 5. MENJALANKAN SERVER
// =================================================================
app.listen(PORT, () => {
    console.log(`API Server is running at http://localhost:${PORT}`);
});