// 数据库配置 - 使用SQLite作为替代方案
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// SQLite数据库文件路径
const dbPath = path.join(__dirname, 'ddz_game.db');

// 创建SQLite数据库连接
exports.getDB = function() {
    return new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('连接SQLite数据库失败:', err.message);
        } else {
            console.log('✅ 已连接到SQLite数据库');
        }
    });
};

// 初始化数据库表
exports.initDatabase = function() {
    const db = exports.getDB();
    
    // 创建用户表
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS t_account (
            unique_id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id VARCHAR(50) UNIQUE,
            nick_name VARCHAR(50),
            gold_count INTEGER DEFAULT 0,
            avatar_url VARCHAR(200),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS t_room (
            room_id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_name VARCHAR(50),
            player_count INTEGER DEFAULT 0,
            max_players INTEGER DEFAULT 3,
            status VARCHAR(20) DEFAULT 'waiting',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS t_game_record (
            record_id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id INTEGER,
            player1_id INTEGER,
            player2_id INTEGER,
            player3_id INTEGER,
            winner_id INTEGER,
            game_data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        
        console.log('✅ 数据库表初始化完成');
    });
    
    return db;
};

// 导出配置信息（兼容原有代码）
exports.dbconfig = {
    type: 'sqlite',
    database: dbPath
};