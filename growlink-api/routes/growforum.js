const express = require('express');
const router = express.Router();

module.exports = (dbPool, checkAuth) => {

    router.get('/', async (req, res) => {
        try {
            const sql = `
                SELECT gf.*, u.user_name AS author 
                FROM growforum gf 
                JOIN users u ON gf.user_id = u.id 
                ORDER BY gf.created_at DESC`;
            const [threads] = await dbPool.query(sql);
            res.status(200).json(threads);
        } catch (error) {
            res.status(500).json({ message: "Failed to fetch threads.", error: error.message });
        }
    });

    router.post('/', async (req, res) => {
        const { content } = req.body;
        const userId = req.auth.id;

        if (!content || content.trim() === '') {
            return res.status(400).json({ message: "Content is required." });
        }

        try {
            const sql = "INSERT INTO growforum (user_id, content) VALUES (?, ?)";
            const [result] = await dbPool.execute(sql, [userId, content]);
            // Fetch the created thread
            const [rows] = await dbPool.execute("SELECT gf.*, u.user_name AS author FROM growforum gf JOIN users u ON gf.user_id = u.id WHERE gf.id = ?", [result.insertId]);
            res.status(201).json({ message: "Thread created successfully.", thread: rows[0] });
        } catch (error) {
            res.status(500).json({ message: "Database error.", error: error.message });
        }
    });
    
    router.delete('/:id', async (req, res) => {
        const threadId = req.params.id;
        const userId = req.auth.id; // ID pengguna yang mencoba menghapus

        try {
            const sql = "DELETE FROM growforum WHERE id = ? AND user_id = ?";
            const [result] = await dbPool.execute(sql, [threadId, userId]);

            if (result.affectedRows > 0) {
                res.status(200).json({ message: "Thread deleted successfully." });
            } else {
                res.status(403).json({ message: "Forbidden: You do not own this thread or thread not found." });
            }
        } catch (error) {
            res.status(500).json({ message: "Database error.", error: error.message });
        }
    });

    router.get('/:id', async (req, res) => {
        try {
            const sql = `
                SELECT gf.*, u.user_name AS author 
                FROM growforum gf 
                JOIN users u ON gf.user_id = u.id 
                WHERE gf.id = ?`;
            const [rows] = await dbPool.execute(sql, [req.params.id]);
            if (rows.length > 0) {
                res.status(200).json(rows[0]);
            } else {
                res.status(404).json({ message: "Thread not found." });
            }
        } catch (error) {
            res.status(500).json({ message: "Database error.", error: error.message });
        }
    });

    return router;
};