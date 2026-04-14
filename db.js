const sqlite3 = require('sqlite3').verbose();
const db_config = require('./db_config.js');

var db = db_config.initDatabase();

const query = function(sql, callback) {
    console.log("query:" + sql);
    
    db.all(sql, function(err, rows) {
        if (err) {
            console.log(err + " sql:" + sql);
            if (callback) {
                callback(err);
            }
        } else {
            if (callback) {
                console.log("result:" + JSON.stringify(rows));
                callback(null, rows);
            }
        }
    });
};

exports.getPlayerInfoByAccountID = function(accountID, callback) {
    var sql = "SELECT * FROM t_account WHERE account_id = '" + accountID + "';";
    query(sql, callback);
};

exports.getPlayerInfoByUniqueID = function(uniqueID, callback) {
    var sql = "SELECT * FROM t_account WHERE unique_id = '" + uniqueID + "';";
    query(sql, callback);
};

exports.createPlayer = function(userinfo) {
    var sql = "INSERT INTO t_account(unique_id, account_id, nick_name, gold_count, avatar_url) VALUES ('" +
        userinfo.uniqueID + "', '" +
        userinfo.accountID + "', '" +
        userinfo.nickName + "', " +
        userinfo.goldCount + ", '" +
        userinfo.avatarUrl + "');";
    
    console.log("createPlayer sql:" + sql);
    query(sql, (err, data) => {
        if (err) {
            console.log('create player info = ' + err);
        } else {
            console.log('create player info success');
        }
    });
};

exports.connect = function(config) {
    console.log("✅ 数据库已连接（SQLite）");
    // SQLite连接在初始化时已经建立，这里只需要确认
};