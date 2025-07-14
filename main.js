import  axios from 'axios'
import  mysql from 'mysql2/promise' 
import 'dotenv/config'
import pool from './dbconfig/database.js'; 
import initializeDatabase from './dbconfig/dbInitializer.js';
import { 
  TokenManager,
  createAddress,
  addTokens,
  transferTokens,
  checkTokenAmount,
  listAddresses 
} from './TokenModel/TokenManagerModel.js';

  const user =	process.env.userAPI_KEY;
  const admin =	process.env.adminAPI_KEY; 
  
// Configuration
const BOT_TOKENS = [ 
 	user, admin
];   
   
const ADMIN_CHAT_ID = parseInt(process.env.ADMIN_CHAT_ID);
  
   
const LAST_UPDATE_IDS = {};

// Initialize LAST_UPDATE_IDS
BOT_TOKENS.forEach(token => {
    LAST_UPDATE_IDS[token] = 0;
});


// MarkdownV2 escaper
function escapeMarkdown(text) {
    const markdownSpecialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
    return String(text).split('').map(char => 
        markdownSpecialChars.includes(char) ? `\\${char}` : char
    ).join('');
}
 

async function sendMessage(token, chatId, text, parseMode = 'MarkdownV2') {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const payload = {
        chat_id: chatId,
        text: text,
        parse_mode: parseMode,
        disable_web_page_preview: true
    };
    
    try {
        const response = await axios.post(url, payload, { timeout: 10000 });
        if (response.status === 200) {
            return response.data;
        }
        console.log(`⚠️ API Error with token ${token.slice(-5)}: ${response.status} - ${response.statusText}`);
    } catch (error) {
        console.log(`❌ Error sending message with token ${token.slice(-5)}: ${error.message}`);
        // Try without Markdown if Markdown fails
        if (parseMode === 'MarkdownV2') {
            return sendMessage(token, chatId, text.replace(/\\/g, ''), null);
        }
    }
    return null;
}

function formatBalance(balance) {
    const balanceStr = new Intl.NumberFormat().format(balance);
    return `*${escapeMarkdown(balanceStr)}* ASHED`;
}

function isAdminBot(token) {
    return token === BOT_TOKENS[1];
}

function isAdminChat(chatId) {
    return chatId === ADMIN_CHAT_ID; 
    	// return chatId ===process.env.ADMIN_CHAT_ID; 
}

async function processCommand(tokenManager, message, chatId, userId, token) {
    try {
        // For admin bot, restrict to only ADMIN_CHAT_ID
        if (isAdminBot(token) && !isAdminChat(chatId)) {
            console.log(`🚨 Unauthorized admin access attempt from chat ID: ${chatId}`);
            return;
        }
        
        const messageText = message.text ? message.text.trim() : '';
        if (!messageText) return;
        
        const commandParts = messageText.split(/\s+/);
        const command = commandParts[0].toLowerCase();
        const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

        // Log the command
        try {
            await pool.query(
                'INSERT INTO command_logs (chat_id, user_id, command, message, timestamp, bot_token) VALUES (?, ?, ?, ?, ?, ?)',
                [chatId, userId, command, messageText, timestamp, token.slice(-5)]
            );
        } catch (error) {
            console.error('Error logging command:', error);
        }
        
        // Admin-only commands
        if (command === "/list_accounts" || command === "/add_ashed") {
            if (!(isAdminBot(token) && isAdminChat(chatId))) {
                await sendMessage(token, chatId, 
                    "❌ *Admin Command*\n\n" +
                    "This command is only available to administrators.");
                return;
            }
        }

        if (command === "/start") {
            const response = 
                "✨ *Welcome to ASHED Bot* ✨\n\n" +
                "🌐 *What is ASHED?*\n" +
                "ASHED represents ownership rights to realistic artworks\\.\n\n" +
                "📋 *Available Commands:*\n" +
                "`/your_account` \\- Create/get your ASHED account\n" +
                "`/transfer_ashed <user_id> <amount>` \\- Transfer ASHED\n" +
                "`/transaction_history` \\- View your transaction history\n" +
                "`/help` \\- Show this message\n\n" +
                "💡 *Tip:* Use `/help` anytime to see commands";
            await sendMessage(token, chatId, response);
        }
        else if (command === "/your_account") {
            const address = await tokenManager.createAddress(userId);
            const balance = await tokenManager.checkTokenAmount(address);
            const response = 
                "🔐 *Your ASHED Account* 🔐\n\n" +
                `🏦 *Account ID:* \`${escapeMarkdown(address)}\`\n` +
                `💼 *Balance:* ${formatBalance(balance || 0)}\n\n` +
                "💳 Use this ID to receive ASHED tokens from others\\.";
            await sendMessage(token, chatId, response);
        }
        else if (command === "/add_ashed") {
            if (commandParts.length < 2) {
                await sendMessage(token, chatId, "❌ *Oops\\!*\n\n" +
                    "You need to specify an amount to add\\.\n" +
                    "✨ *Usage:* `/add_ashed <amount>`\n" +
                    "Example: `/add_ashed 100`");
                return;
            }
            
            try {
                const amount = parseInt(commandParts[1]);
                if (isNaN(amount) || amount <= 0) {
                    await sendMessage(token, chatId, "⚠️ *Invalid Amount*\n\n" +
                        "Amount must be a positive number\\!\n" +
                        "Example: `/add_ashed 500`");
                    return;
                }
                
                const address = userId.toString();
                const balance = await tokenManager.checkTokenAmount(address);
                
                if (balance === null) {
                    await sendMessage(token, chatId, "❌ *Account Not Found*\n\n" +
                        "You need to create an account first\\!\n" +
                        "Use `/your_account` to create one\\.");
                    return;
                }
                
                const { success, balance: newBalance } = await tokenManager.addTokens(address, amount);
                
                if (success) {
                    const response = 
                        "✅ *Tokens Added Successfully* ✅\n\n" +
                        `💰 *Amount Added:* ${formatBalance(amount)}\n` +
                        `🏦 *New Balance:* ${formatBalance(newBalance)}\n\n` +
                        "🔄 Use `/check_ashed` to verify your balance";
                    await sendMessage(token, chatId, response);
                } else {
                    throw new Error("Failed to add tokens");
                }
            } catch (error) {
                await sendMessage(token, chatId, "⚠️ *Invalid Input*\n\n" +
                    "Please enter a valid number for the amount\\.\n" +
                    "Example: `/add_ashed 250`");
            }
        }
        else if (command === "/transfer_ashed") {
            if (commandParts.length < 3) {
                await sendMessage(token, chatId, "❌ *Missing Parameters*\n\n" +
                    "You need to specify recipient and amount\\.\n" +
                    "✨ *Usage:* `/transfer_ashed <user_id> <amount>`\n" +
                    "Example: `/transfer_ashed 12345 100`");
                return;
            }
            
            try {
                const toUser = commandParts[1];
                const amount = parseInt(commandParts[2]);
                
                if (isNaN(amount) || amount <= 0) {
                    await sendMessage(token, chatId, "⚠️ *Invalid Amount*\n\n" +
                        "Transfer amount must be positive\\!\n" +
                        "Example: `/transfer_ashed 12345 50`");
                    return;
                }
                
                const fromAddress = userId.toString();
                const toAddress = toUser.toString();
                
                const fromBalance = await tokenManager.checkTokenAmount(fromAddress);
                if (fromBalance === null) {
                    await sendMessage(token, chatId, "❌ *Account Not Found*\n\n" +
                        "You don't have an ASHED account yet\\!\n" +
                        "Create one with `/your_account`");
                    return;
                }
                
                const toBalance = await tokenManager.checkTokenAmount(toAddress);
                if (toBalance === null) {
                    await sendMessage(token, chatId, "❌ *Recipient Not Found*\n\n" +
                        `The account \`${escapeMarkdown(toAddress)}\` doesn't exist\\.\n` +
                        "Ask the recipient to create an account first\\.");
                    return;
                }
                
                if (fromBalance < amount) {
                    await sendMessage(token, chatId, "❌ *Insufficient Balance*\n\n" +
                        `You only have ${formatBalance(fromBalance)}\n` +
                        `Can't transfer ${formatBalance(amount)}\\.`);
                    return;
                }
                
                const transferSuccess = await tokenManager.transferTokens(
                    fromAddress, toAddress, amount, chatId, userId
                );
                
                if (transferSuccess) {
                    const newBalance = await tokenManager.checkTokenAmount(fromAddress);
                    const response = 
                        "✅ *Transfer Successful* ✅\n\n" +
                        `📤 *From:* \`${escapeMarkdown(fromAddress)}\`\n` +
                        `📥 *To:* \`${escapeMarkdown(toAddress)}\`\n` +
                        `💰 *Amount:* ${formatBalance(amount)}\n\n` +
                        `🏦 *Your New Balance:* ${formatBalance(newBalance)}\n\n` +
                        "📜 View your transaction history with `/transaction_history`";
                    await sendMessage(token, chatId, response);
                } else {
                    await sendMessage(token, chatId, "❌ *Transfer Failed*\n\n" +
                        "Something went wrong with the transfer\\.\n" +
                        "Please try again or contact support\\.");
                }
            } catch (error) {
                console.error("Transfer error:", error);
                await sendMessage(token, chatId, "⚠️ *Invalid Input*\n\n" +
                    "Please enter valid parameters\\.\n" +
                    "✨ *Usage:* `/transfer_ashed <user_id> <amount>`\n" +
                    "Example: `/transfer_ashed 12345 100`");
            }
        }
        else if (command === "/check_ashed") {
            const address = userId.toString();
            const balance = await tokenManager.checkTokenAmount(address);
            
            if (balance !== null) {
                const response = 
                    "💰 *Your ASHED Balance* 💰\n\n" +
                    `🏦 *Account ID:* \`${escapeMarkdown(address)}\`\n` +
                    `💵 *Balance:* ${formatBalance(balance)}\n\n` +
                    "🔄 Use `/transfer_ashed` to send tokens to others\n" +
                    "📜 View your transaction history with `/transaction_history`";
                await sendMessage(token, chatId, response);
            } else {
                await sendMessage(token, chatId, "❌ *Account Not Found*\n\n" +
                    "You don't have an ASHED account yet\\!\n" +
                    "Create one with `/your_account`");
            }
        }
        else if (command === "/transaction_history") {
            try {
                const [transactions] = await pool.query(
                    'SELECT * FROM transactions WHERE from_address = ? OR to_address = ? ORDER BY timestamp DESC LIMIT 10',
                    [userId.toString(), userId.toString()]
                );
                
                if (transactions.length > 0) {
                    let response = "📜 *Your Transaction History* 📜\n\n";
                    
                    transactions.forEach(tx => {
                        const direction = tx.from_address === userId.toString() ? "📤 Sent" : "📥 Received";
                        const otherParty = direction === "📤 Sent" ? tx.to_address : tx.from_address;
                        const timestamp = new Date(tx.timestamp).toISOString().slice(0, 19).replace('T', ' ');
                        
                        response +=
                            `⏰ *${escapeMarkdown(timestamp)}*\n` +
                            `${direction} ${formatBalance(tx.amount)} ` +
                            `to \`${escapeMarkdown(otherParty)}\`\n\n`;
                    });
                    
                    await sendMessage(token, chatId, response);
                } else {
                    await sendMessage(token, chatId, "ℹ️ *No Transactions Found*\n\n" +
                        "You haven't made or received any transfers yet\\.");
                }
            } catch (error) {
                console.error("Error fetching transactions:", error);
                await sendMessage(token, chatId, "⚠️ *System Error*\n\n" +
                    "Failed to fetch transaction history\\. Please try again later\\.");
            }
        }
        else if (command === "/list_accounts") {
            try {
                const addresses = await tokenManager.listAddresses();
                const addressList = Object.entries(addresses);
                
                if (addressList.length > 0) {
                    let response = "📋 *All ASHED Accounts* 📋\n\n";
                    addressList.forEach(([addr, bal]) => {
                        response += `• \`${escapeMarkdown(addr)}\`: ${formatBalance(bal)}\n`;
                    });
                    await sendMessage(token, chatId, response);
                } else {
                    await sendMessage(token, chatId, "ℹ️ *No Accounts Found*\n\n" +
                        "There are no ASHED accounts yet\\.\n" +
                        "Create one with `/your_account`");
                }
            } catch (error) {
                console.error("Error listing accounts:", error);
                await sendMessage(token, chatId, "⚠️ *System Error*\n\n" +
                    "Failed to list accounts\\. Please try again later\\.");
            }
        }
        else if (command === "/help" || command === "/commands") {
            await sendMessage(token, chatId, 
                "📜 *ASHED Bot Help* 📜\n\n" +
                "✨ *Available Commands:*\n\n" +
                "`/start` \\- Welcome message and bot info\n" +
                "`/your_account` \\- Create/get your ASHED account\n" +
                "`/transfer_ashed <user_id> <amount>` \\- Send ASHED to another account\n" +
                "`/transaction_history` \\- View your transaction history\n" +
                "`/help` \\- Show this message\n\n" +
                "💡 *Tip:* Always verify account IDs before transferring\\!"
            );
        }
        else {
            await sendMessage(token, chatId, "⚠️ *Unknown Command*\n\n" +
                "I don't recognize that command\\.\n" +
                "Type `/help` to see available commands\\.");
        }
    } catch (error) {
        console.error(`❌ Error processing command: ${error}`);
        console.error(error.stack);
        await sendMessage(token, chatId, "⚠️ *System Error*\n\n" +
            "Something went wrong processing your request\\.\n" +
            "Please try again or contact support\\.");
    }
}

async function botWorker(token, tokenManager) {
    let lastUpdateId = LAST_UPDATE_IDS[token];
    console.log(`🤖 Bot worker started for token ending with ${token.slice(-5)}`);
    
    while (true) {
        try {
            const params = {
                offset: lastUpdateId + 1,
                timeout: 30,
                allowed_updates: ['message']
            };
            
            const response = await axios.get(
                `https://api.telegram.org/bot${token}/getUpdates`,
                { params, timeout: 35000 }
            );
            
            const updates = response.data;
            
            if (!updates.ok) {
                console.log(`⚠️ API Error with token ${token.slice(-5)}:`, updates);
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            }
            
            if (updates.result && updates.result.length > 0) {
                for (const update of updates.result) {
                    const currentUpdateId = update.update_id;
                    if (currentUpdateId > lastUpdateId) {
                        lastUpdateId = currentUpdateId;
                        LAST_UPDATE_IDS[token] = lastUpdateId;
                        
                        if (update.message) {
                            const message = update.message;
                            const chatId = message.chat.id;
                            const userId = message.from.id;
                            
                            // For admin bot, only process if from ADMIN_CHAT_ID
                            if (isAdminBot(token) && !isAdminChat(chatId)) {
                                        // console.log("CHAT_ID ",chatId);
 
                                console.log(`🚨 Blocked admin command from unauthorized chat: ${chatId}`);
								// console.log(`Type of Id: ${typeof(chatId)}`);
                                continue;   
                            }
                            
                            await processCommand(tokenManager, message, chatId, userId, token);
                        }
                    }
                }
            } else {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                console.log(`⚠️ Timeout with token ${token.slice(-5)}`);
            } else {
                console.log(`⚠️ Error with token ${token.slice(-5)}: ${error.message}`);
                console.error(error.stack);
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

async function verifyTokens() {
    console.log("🔍 Verifying bot tokens...");
    for (const token of BOT_TOKENS) {
        try {
            const response = await axios.get(
                `https://api.telegram.org/bot${token}/getMe`,
                { timeout: 5000 }
            );
            
            if (response.status === 200) {
                console.log(`✅ Token ${token.slice(-5)} verified: ${response.data.result.first_name}`);
            } else {
                console.log(`❌ Token ${token.slice(-5)} failed: ${response.status} - ${response.statusText}`);
            }
        } catch (error) {
            console.log(`❌ Token ${token.slice(-5)} test failed: ${error.message}`);
        }
    }
}

async function main() {
    console.log("🚀 Starting ASHED Bot Cluster...");
    console.log(`🔒 Admin bot restricted to chat ID: ${ADMIN_CHAT_ID}`);
    console.log("🔓 Main bot open to all users");
    
    // Initialize database
    await initializeDatabase();
    
    // Verify tokens
    await verifyTokens();
    
    const tokenManager = new TokenManager();
    
    // Start a worker for each bot token
    BOT_TOKENS.forEach(token => {
        botWorker(token, tokenManager).catch(error => {
            console.error(`❌ Worker error for token ${token.slice(-5)}:`, error);
        });
    });
    
    // Keep the process running
    setInterval(() => {}, 1000);
}

main().catch(error => {
    console.error("❌ Fatal error in main:", error);
    process.exit(1);
});
