const express = require('express');
const multer = require('multer');
const WebTorrent = require('webtorrent');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const client = new WebTorrent();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Create torrents directory if it doesn't exist
const torrentsDir = path.join(__dirname, 'torrents');
if (!fs.existsSync(torrentsDir)) {
    fs.mkdirSync(torrentsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        // Accept video files only
        if (file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only video files are allowed!'), false);
        }
    },
    limits: {
        fileSize: 500 * 1024 * 1024 // 500MB limit
    }
});

// Store active torrents
const activeTorrents = new Map();

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Upload video and create torrent
app.post('/upload', upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No video file uploaded' });
    }

    const filePath = req.file.path;
    const fileName = req.file.filename;

    // Create torrent from uploaded file
    client.seed(filePath, (torrent) => {
        const magnetURI = torrent.magnetURI;
        const infoHash = torrent.infoHash;
        
        // Store torrent info
        activeTorrents.set(infoHash, {
            magnetURI,
            fileName: req.file.originalname,
            uploadedFileName: fileName,
            filePath,
            createdAt: new Date()
        });

        console.log(`Torrent created: ${magnetURI}`);
        
        res.json({
            success: true,
            magnetURI,
            infoHash,
            fileName: req.file.originalname,
            message: 'Video uploaded and torrent created successfully!'
        });
    });
});

// Get list of available torrents
app.get('/torrents', (req, res) => {
    const torrents = Array.from(activeTorrents.entries()).map(([infoHash, info]) => ({
        infoHash,
        ...info
    }));
    res.json(torrents);
});

// Stream video by info hash
app.get('/stream/:infoHash', (req, res) => {
    const { infoHash } = req.params;
    const torrentInfo = activeTorrents.get(infoHash);
    
    if (!torrentInfo) {
        return res.status(404).json({ error: 'Torrent not found' });
    }

    const torrent = client.get(infoHash);
    if (!torrent) {
        return res.status(404).json({ error: 'Torrent not active' });
    }

    // Find video file in torrent
    const videoFile = torrent.files.find(file => 
        file.name.toLowerCase().match(/\.(mp4|avi|mkv|mov|wmv|flv|webm)$/)
    );

    if (!videoFile) {
        return res.status(404).json({ error: 'No video file found in torrent' });
    }

    const range = req.headers.range;
    const fileSize = videoFile.length;

    // Handle client disconnect
    req.on('close', () => {
        console.log('Client disconnected from stream');
    });

    res.on('close', () => {
        console.log('Response stream closed');
    });

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4',
        });

        const stream = videoFile.createReadStream({ start, end });
        
        // Handle stream errors
        stream.on('error', (err) => {
            console.error('Stream error:', err.message);
            if (!res.headersSent) {
                res.status(500).end();
            }
        });

        stream.on('close', () => {
            console.log('File stream closed');
        });

        stream.pipe(res);

        // Clean up on response close
        res.on('close', () => {
            if (stream && !stream.destroyed) {
                stream.destroy();
            }
        });

    } else {
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
        });
        
        const stream = videoFile.createReadStream();
        
        // Handle stream errors
        stream.on('error', (err) => {
            console.error('Stream error:', err.message);
            if (!res.headersSent) {
                res.status(500).end();
            }
        });

        stream.on('close', () => {
            console.log('File stream closed');
        });

        stream.pipe(res);

        // Clean up on response close
        res.on('close', () => {
            if (stream && !stream.destroyed) {
                stream.destroy();
            }
        });
    }
});

// Download torrent by magnet URI
app.post('/download', (req, res) => {
    const { magnetURI } = req.body;
    
    if (!magnetURI) {
        return res.status(400).json({ error: 'Magnet URI is required' });
    }

    const existingTorrent = client.get(magnetURI);
    if (existingTorrent) {
        return res.json({
            success: true,
            infoHash: existingTorrent.infoHash,
            message: 'Torrent already exists'
        });
    }

    client.add(magnetURI, (torrent) => {
        const infoHash = torrent.infoHash;
        
        // Store torrent info if not already stored
        if (!activeTorrents.has(infoHash)) {
            activeTorrents.set(infoHash, {
                magnetURI,
                fileName: torrent.name,
                uploadedFileName: torrent.name,
                filePath: null,
                createdAt: new Date()
            });
        }

        console.log(`Torrent added: ${magnetURI}`);
        
        res.json({
            success: true,
            infoHash,
            fileName: torrent.name,
            message: 'Torrent added successfully!'
        });
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 500MB.' });
        }
    }
    res.status(500).json({ error: error.message });
});

app.listen(PORT, () => {
    console.log(`WebTorrent server running on http://localhost:${PORT}`);
    console.log(`Upload videos and create torrents at http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down gracefully...');
    client.destroy(() => {
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    client.destroy(() => {
        process.exit(0);
    });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process, just log the error
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Don't exit the process for stream errors
    if (error.message && error.message.includes('Writable stream closed prematurely')) {
        console.log('Stream closed prematurely - this is normal when clients disconnect');
        return;
    }
    // For other critical errors, you might want to exit
    // process.exit(1);
});
