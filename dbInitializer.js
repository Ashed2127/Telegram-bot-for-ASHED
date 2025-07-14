import mysql from 'mysql2/promise';
import pool from './database.js';

export default async function  initializeDatabase(){
    try {
        const connection = await pool.getConnection();
        
        // Create transactions table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                from_address VARCHAR(255) NOT NULL,
                to_address VARCHAR(255) NOT NULL,
                amount INT NOT NULL,
                timestamp DATETIME NOT NULL,
                chat_id BIGINT NOT NULL,
                user_id BIGINT NOT NULL,
                INDEX (from_address),
                INDEX (to_address),
                INDEX (user_id)
            )
        `);
        
        // Create accounts table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS accounts (
                address VARCHAR(255) PRIMARY KEY,
                balance INT NOT NULL DEFAULT 0,
                INDEX (address)
            )
        `);
        
        // Create command_logs table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS command_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                chat_id BIGINT NOT NULL,
                user_id BIGINT NOT NULL,
                command VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                timestamp DATETIME NOT NULL,
                bot_token VARCHAR(5) NOT NULL,
                INDEX (chat_id),
                INDEX (user_id)
            )
        `);
        
        connection.release();
        console.log("✅ Database tables initialized");
      // Add this at the top of your bot initialization
      console.log("[DEBUG] ADMIN_CHAT_ID from env:", process.env.ADMIN_CHAT_ID);
    } catch (error) {
        console.error("❌ Error initializing database:", error);
    }
}
