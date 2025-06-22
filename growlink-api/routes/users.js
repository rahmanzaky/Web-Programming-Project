const express = require('express');
const router = express.Router();

module.exports = (dbPool, checkAuth, upload, jwt, JWT_SECRET) => {
    router.get('/me/registered-events', async (req, res, next) => {
        const userId = req.auth.id;
        try {
            const sql = `
                SELECT er.event_id
                FROM event_registrations er
                WHERE er.user_id = ?
            `;
            const [rows] = await dbPool.query(sql, [userId]);
            const eventIds = rows.map(row => row.event_id);
            res.status(200).json({ success: true, data: eventIds });
        } catch (error) {
            next(error);
        }
    });

    router.get('/me/registered-events/details', async (req, res, next) => {
        const userId = req.auth.id;
        try {
            const sql = `
                SELECT ev.id, ev.title, ev.image_url, ev.topic, ev.description, u.user_name
                FROM events ev
                JOIN event_registrations er ON ev.id = er.event_id
                JOIN users u ON ev.user_id = u.id
                WHERE er.user_id = ?
            `;
            const [rows] = await dbPool.query(sql, [userId]);
            res.status(200).json({ success: true, data: rows });
        } catch (error) {
            next(error);
        }
    });

    router.get('/me/events-needing-review', async (req, res, next) => {
        const userId = req.auth.id;
        try {
            const sql = `
                SELECT ev.id, ev.title, ev.image_url
                FROM events ev
                JOIN event_registrations er ON ev.id = er.event_id
                LEFT JOIN event_reviews rev ON ev.id = rev.event_id AND rev.user_id = er.user_id
                WHERE er.user_id = ? AND rev.id IS NULL
            `;
            const [rows] = await dbPool.query(sql, [userId]);
            res.status(200).json({ success: true, data: rows });
        } catch (error) {
            next(error);
        }
    });

    router.get('/me', async (req, res, next) => {
        const userId = req.auth.id;
        try {
            const sql = "SELECT id, user_name, full_name, email, role FROM users WHERE id = ?";
            const [rows] = await dbPool.execute(sql, [userId]);
            if (rows.length > 0) {
                res.status(200).json({ success: true, data: rows[0] });
            } else {
                res.status(404).json({ success: false, message: "User not found." });
            }
        } catch (error) {
            next(error);
        }
    });

    router.put('/me', async (req, res, next) => {
        const userId = req.auth.id;
        const { full_name, email } = req.body;
        if (!full_name || !email) {
            return res.status(400).json({ success: false, message: "Full name and email are required." });
        }
        try {
            const sql = "UPDATE users SET full_name = ?, email = ? WHERE id = ?";
            await dbPool.execute(sql, [full_name, email, userId]);
            res.status(200).json({ success: true, message: "Profile updated." });
        } catch (error) {
            next(error);
        }
    });

    router.put('/me/become-speaker', upload.single('cv'), async (req, res, next) => {
        const userId = req.auth.id;
        const { 'linkedin-url': linkedin_url, category: speaker_category } = req.body;
        const cv_path = req.file ? req.file.path : null;

        if (!cv_path) {
            return res.status(400).json({ success: false, message: "CV file is required." });
        }

        try {
            const sql = `
                UPDATE users 
                SET role = 'speaker', linkedin_url = ?, cv_path = ?, speaker_category = ?
                WHERE id = ?
            `;
            await dbPool.execute(sql, [linkedin_url, cv_path, speaker_category, userId]);

            const [rows] = await dbPool.execute("SELECT id, user_name, full_name, email, role FROM users WHERE id = ?", [userId]);
            if (rows.length > 0) {
                const user = rows[0];
                const newToken = jwt.sign({ id: user.id, user_name: user.user_name, role: user.role }, JWT_SECRET, { expiresIn: '8h' });

                 res.status(200).json({ 
                    success: true, 
                    message: "Congratulations! You are now a speaker.",
                    user: user,
                    token: newToken
                });
            } else {
                 res.status(404).json({ success: false, message: "User not found after update." });
            }
        } catch (error) {
            next(error);
        }
    });

    return router;
};
