const express = require('express');
const router = express.Router();

const normalizePath = (dbPath) => {
    if (!dbPath) return null;
    const uploadsIndex = dbPath.indexOf('uploads');
    if (uploadsIndex === -1) {
        return dbPath; 
    }
    return dbPath.substring(uploadsIndex).replace(/\\/g, '/');
};

module.exports = (dbPool, checkAuth, upload) => {

    router.get('/', async (req, res) => {
        try {
            const sql = `
                SELECT ev.*, u.user_name 
                FROM events ev 
                JOIN users u ON ev.user_id = u.id 
                ORDER BY ev.created_at DESC`;
            const [events] = await dbPool.query(sql);
            const normalizedEvents = events.map(event => ({
                ...event,
                image_url: normalizePath(event.image_url),
                key_summary_path: normalizePath(event.key_summary_path),
            }));
            res.status(200).json(normalizedEvents);
        } catch (error) {
            res.status(500).json({ message: "Database error.", error: error.message });
        }
    });

    router.get('/:id', async (req, res) => {
        try {
            const sql = `
                SELECT ev.*, u.user_name 
                FROM events ev
                JOIN users u ON ev.user_id = u.id 
                WHERE ev.id = ?`;
            const [rows] = await dbPool.execute(sql, [req.params.id]);
            if (rows.length > 0) {
                const event = rows[0];
                event.image_url = normalizePath(event.image_url);
                event.key_summary_path = normalizePath(event.key_summary_path);
                res.status(200).json(event);
            } else {
                res.status(404).json({ message: "Event not found." });
            }
        } catch (error) {
            res.status(500).json({ message: "Database error.", error: error.message });
        }
    });

    router.post('/', [upload.fields([{ name: 'image', maxCount: 1 }, { name: 'keySum', maxCount: 1 }])], async (req, res) => {
        const { title, topic, description } = req.body;
        const userId = req.auth.id; // Diambil dari token

        const getRelativePath = (file) => {
            if (!file) return null;
            const uploadsIndex = file.path.indexOf('uploads');
            if (uploadsIndex === -1) return file.path;
            return file.path.substring(uploadsIndex).replace(/\\/g, '/');
        };

        const imageUrl = req.files['image'] ? getRelativePath(req.files['image'][0]) : null;
        const keySumPath = req.files['keySum'] ? getRelativePath(req.files['keySum'][0]) : null;
        
        if (!title || !topic) {
            return res.status(400).json({ message: "Title and topic are required." });
        }

        try {
            const sql = "INSERT INTO events (user_id, title, topic, description, image_url, key_summary_path) VALUES (?, ?, ?, ?, ?, ?)";
            await dbPool.execute(sql, [userId, title, topic, description, imageUrl, keySumPath]);
            res.status(201).json({ message: "Event created successfully." });
        } catch (error) {
            res.status(500).json({ message: "Database error.", error: error.message });
        }
    });

    router.post('/:id/register', async (req, res) => {
        const eventId = req.params.id;
        const userId = req.auth.id;
        try {
            const sql = "INSERT INTO event_registrations (user_id, event_id) VALUES (?, ?)";
            await dbPool.execute(sql, [userId, eventId]);
            res.status(201).json({ message: "Successfully registered for the event." });
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ message: "You are already registered for this event." });
            }
            res.status(500).json({ message: "Database error.", error: error.message });
        }
    });

    router.get('/:id/comments', async (req, res) => {
        try {
            const sql = `
                SELECT c.*, u.user_name 
                FROM comments c 
                JOIN users u ON c.user_id = u.id 
                WHERE c.event_id = ? 
                ORDER BY c.created_at ASC`;
            const [comments] = await dbPool.execute(sql, [req.params.id]);
            res.status(200).json(comments);
        } catch (error) {
            res.status(500).json({ message: "Database error.", error: error.message });
        }
    });

    router.post('/:id/reviews', async (req, res) => {
        const eventId = req.params.id;
        const userId = req.auth.id;
        const { rating, review_text } = req.body;
        
        if (!rating) {
            return res.status(400).json({ message: "Rating is required." });
        }

        try {
            const sql = "INSERT INTO event_reviews (event_id, user_id, rating, review_text) VALUES (?, ?, ?, ?)";
            await dbPool.execute(sql, [eventId, userId, rating, review_text]);
            res.status(201).json({ message: "Review added successfully." });
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ message: "You have already reviewed this event." });
            }
            res.status(500).json({ message: "Database error.", error: error.message });
        }
    });

    router.get('/:id/reviews', async (req, res) => {
        try {
            const sql = `
                SELECT er.*, u.user_name 
                FROM event_reviews er 
                JOIN users u ON er.user_id = u.id 
                WHERE er.event_id = ? 
                ORDER BY er.created_at DESC`;
            const [reviews] = await dbPool.execute(sql, [req.params.id]);
            res.status(200).json(reviews);
        } catch (error) {
            res.status(500).json({ message: "Database error.", error: error.message });
        }
    });

    router.post('/:id/comments', async (req, res) => {
        const eventId = req.params.id;
        const userId = req.auth.id;
        const { comment } = req.body;
        if (!comment || comment.trim() === '') {
            return res.status(400).json({ message: "Comment is required." });
        }
        try {
            const sql = "INSERT INTO comments (event_id, user_id, comment_text) VALUES (?, ?, ?)";
            await dbPool.execute(sql, [eventId, userId, comment]);
            res.status(201).json({ message: "Comment added successfully." });
        } catch (error) {
            res.status(500).json({ message: "Database error.", error: error.message });
        }
    });

    router.get('/:id/registrations', async (req, res) => {
        try {
            const sql = `
                SELECT er.*, u.user_name 
                FROM event_registrations er 
                JOIN users u ON er.user_id = u.id 
                WHERE er.event_id = ?`;
            const [registrations] = await dbPool.execute(sql, [req.params.id]);
            res.status(200).json(registrations);
        } catch (error) {
            res.status(500).json({ message: "Database error.", error: error.message });
        }
    });

    return router;
};