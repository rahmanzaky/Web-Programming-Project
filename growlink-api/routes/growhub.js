const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const normalizePath = (dbPath) => {
    if (!dbPath) return null;
    const uploadsIndex = dbPath.indexOf('uploads');
    if (uploadsIndex === -1) return dbPath;
    return dbPath.substring(uploadsIndex).replace(/\\/g, '/');
};

const categoryMap = {
    '1': 'Proposal',
    '2': 'LPJ (Laporan Pertanggungjawaban)',
    '3': 'TOR (Term of Reference)',
    '4': 'Cue Card',
    '5': 'Rundown',
    '6': 'Another Document'
};

const resolveCategory = (category) => {
    return categoryMap[category] || category;
};

module.exports = (dbPool, checkAuth, upload) => {

    router.get('/', async (req, res, next) => {
        try {
            const sql = `
                SELECT gh.id, gh.user_id, gh.title, gh.category, gh.file_path, u.user_name 
                FROM growhub gh 
                JOIN users u ON gh.user_id = u.id 
                ORDER BY gh.id DESC`;
            const [templates] = await dbPool.query(sql);

            const normalizedTemplates = templates.map(t => ({
                ...t,
                file_path: normalizePath(t.file_path),
                category: resolveCategory(t.category) 
            }));

            res.status(200).json({ success: true, data: normalizedTemplates });
        } catch (error) {
            next(error);
        }
    });

    router.get('/:id', async (req, res, next) => {
        try {
            const sql = `
                SELECT gh.*, u.user_name 
                FROM growhub gh 
                JOIN users u ON gh.user_id = u.id 
                WHERE gh.id = ?`;
            const [rows] = await dbPool.execute(sql, [req.params.id]);

            if (rows.length > 0) {
                const template = rows[0];
                template.file_path = normalizePath(template.file_path);
                template.category = resolveCategory(template.category);
                res.status(200).json({ success: true, data: template });
            } else {
                res.status(404).json({ success: false, message: "Template not found." });
            }
        } catch (error) {
            next(error);
        }
    });

    router.post('/', upload.single('template_file'), async (req, res, next) => {
        const { title, category } = req.body;
        const userId = req.auth.id;

        const getRelativePath = (file) => {
            if (!file) return null;
            const uploadsIndex = file.path.indexOf('uploads');
            if (uploadsIndex === -1) return file.path; // Fallback
            return file.path.substring(uploadsIndex).replace(/\\/g, '/');
        };

        const filePath = getRelativePath(req.file);

        if (!title || !category || !filePath) {
            return res.status(400).json({ success: false, message: "Title, category, and file are required." });
        }
        
        try {
            const sql = "INSERT INTO growhub (user_id, title, category, file_path) VALUES (?, ?, ?, ?)";
            await dbPool.execute(sql, [userId, title, category, filePath]);
            res.status(201).json({ success: true, message: "Template uploaded successfully." });
        } catch (error) {
            next(error);
        }
    });

    router.delete('/:id', async (req, res, next) => {
        const templateId = req.params.id;
        const userId = req.auth.id;

        try {
            const [rows] = await dbPool.execute("SELECT file_path FROM growhub WHERE id = ? AND user_id = ?", [templateId, userId]);

            if (rows.length === 0) {
                return res.status(404).json({ success: false, message: "Template not found or you do not have permission to delete it." });
            }

            const filePath = rows[0].file_path;
            const fullPath = path.join(__dirname, '..', '..', filePath);

            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }

            await dbPool.execute("DELETE FROM growhub WHERE id = ? AND user_id = ?", [templateId, userId]);

            res.status(200).json({ success: true, message: 'Template deleted successfully' });
        } catch (error) {
            next(error);
        }
    });

    return router;
};