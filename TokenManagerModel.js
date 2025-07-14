import pool from './database.js';

export class TokenManager {
    constructor() {
        console.log("💰 TokenManager initialized");
    }

    async createAddress(userId) {
        const address = userId.toString();
        try {
            const [rows] = await pool.query(
                'INSERT IGNORE INTO accounts (address, balance) VALUES (?, 0)',
                [address]
            );
            
            if (rows.affectedRows > 0) {
                console.log(`🆕 Created new account: ${address}`);
            }
            return address;
        } catch (error) {
            console.error(`❌ Error creating address: ${error}`);
            throw error;
        }
    }

    async addTokens(address, amount) {
        try {
            const [result] = await pool.query(
                'UPDATE accounts SET balance = balance + ? WHERE address = ?',
                [amount, address]
            );
            
            if (result.affectedRows > 0) {
                console.log(`➕ Added ${amount} ASHED to ${address}`);
                const [rows] = await pool.query(
                    'SELECT balance FROM accounts WHERE address = ?',
                    [address]
                );
                return { success: true, balance: rows[0].balance };
            }
            
            console.log(`❌ Account ${address} not found`);
            return { success: false, balance: null };
        } catch (error) {
            console.error(`❌ Error adding tokens: ${error}`);
            throw error;
        }
    }

    async transferTokens(fromAddress, toAddress, amount, chatId, userId) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            
            // Check sender balance
            const [sender] = await connection.query(
                'SELECT balance FROM accounts WHERE address = ? FOR UPDATE',
                [fromAddress]
            );
            
            if (sender.length === 0 || sender[0].balance < amount) {
                await connection.rollback();
                console.log(`❌ Transfer failed - insufficient balance or account not found`);
                return false;
            }
            
            // Check recipient exists
            const [recipient] = await connection.query(
                'SELECT 1 FROM accounts WHERE address = ?',
                [toAddress]
            );
            
            if (recipient.length === 0) {
                await connection.rollback();
                console.log(`❌ Recipient account ${toAddress} not found`);
                return false;
            }
            
            // Update balances
            await connection.query(
                'UPDATE accounts SET balance = balance - ? WHERE address = ?',
                [amount, fromAddress]
            );
            
            await connection.query(
                'UPDATE accounts SET balance = balance + ? WHERE address = ?',
                [amount, toAddress]
            );
            
            // Record transaction
            await connection.query(
                'INSERT INTO transactions (from_address, to_address, amount, timestamp, chat_id, user_id) VALUES (?, ?, ?, NOW(), ?, ?)',
                [fromAddress, toAddress, amount, chatId, userId]
            );
            
            await connection.commit();
            console.log(`🔀 Transferred ${amount} ASHED from ${fromAddress} to ${toAddress}`);
            return true;
        } catch (error) {
            await connection.rollback();
            console.error(`❌ Transfer error: ${error}`);
            throw error;
        } finally {
            connection.release();
        }
    }

    async checkTokenAmount(address) {
        try {
            const [rows] = await pool.query(
                'SELECT balance FROM accounts WHERE address = ?',
                [address]
            );
            return rows.length > 0 ? rows[0].balance : null;
        } catch (error) {
            console.error(`❌ Error checking balance: ${error}`);
            throw error;
        }
    }

     async listAddresses() {
        try {
            const [rows] = await pool.query(
                'SELECT address, balance FROM accounts ORDER BY address'
            );
            
            const result = {};
            rows.forEach(row => {
                result[row.address] = row.balance;
            });
            return result;
        } catch (error) {
            console.error(`❌ Error listing addresses: ${error}`);
            throw error;
        }
    }
}


// Add these exports at the bottom of TokenManagerModel.js
export const createAddress = TokenManager.prototype.createAddress;
export const addTokens = TokenManager.prototype.addTokens;
export const transferTokens = TokenManager.prototype.transferTokens;
export const checkTokenAmount = TokenManager.prototype.checkTokenAmount;
export const listAddresses = TokenManager.prototype.listAddresses;
