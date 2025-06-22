// Di dalam file: routes/auth.js

const express = require('express');
const router = express.Router(); // Buat instance router

// Ekspor sebuah FUNGSI yang menerima dependensi (dbPool, dll.)
module.exports = (dbPool, bcrypt, jwt, JWT_SECRET) => {

    // Rute untuk Registrasi
    router.post("/register", async (req, res) => {
        const { user_name, password, full_name, email } = req.body;
        if (!user_name || !password || !full_name || !email) {
            return res.status(400).json({ message: "All fields are required." });
        }
        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            const sql = "INSERT INTO users (user_name, password, full_name, email, role) VALUES (?, ?, ?, ?, 'user')";
            await dbPool.execute(sql, [user_name, hashedPassword, full_name, email]);
            res.status(201).json({ message: "User registered successfully." });
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ message: "Username or email already exists." });
            }
            res.status(500).json({ message: "Database error.", error: error.message });
        }
    });

    // Rute untuk Login
    router.post("/login", async (req, res) => {
        const { user_name, password } = req.body;
        if (!user_name || !password) {
            return res.status(400).json({ message: "Username and password are required." });
        }
        try {
            const sql = "SELECT * FROM users WHERE user_name = ?";
            const [rows] = await dbPool.execute(sql, [user_name]);
            if (rows.length === 0) {
                return res.status(401).json({ message: "Invalid username or password." });
            }

            const user = rows[0];
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ message: "Invalid username or password." });
            }
            // Return full user info (not password)
            const userObj = {
                id: user.id,
                user_name: user.user_name,
                role: user.role,
                full_name: user.full_name,
                email: user.email
            };
            const token = jwt.sign({ id: user.id, user_name: user.user_name, role: user.role }, JWT_SECRET, { expiresIn: '8h' });

            res.status(200).json({ message: "Login successful.", token, user: userObj });
        } catch (error) {
            res.status(500).json({ message: "Database error.", error: error.message });
        }
    });

    // Kembalikan router yang sudah dikonfigurasi di akhir fungsi
    return router;
};