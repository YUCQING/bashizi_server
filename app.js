const http = require('http');
const socketIO = require("socket.io")
const mydb = require("./db.js")
const gamectr = require("./game/game_ctr.js")

// 创建HTTP服务器
const server = http.createServer();
const app = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        allowedHeaders: ["*"],
        credentials: false,
        maxAge: 86400
    },
    pingTimeout: 60000,   // 60秒无响应后断开
    pingInterval: 50000   // 每50秒发送一次ping
});

// ==============================================
// 🔥 唯一修改点：支持 Fly.io 动态端口（必须这样写）
// ==============================================
const PORT = process.env.PORT || 3000;

// 启动服务器
server.listen(PORT, () => {
    console.log('✅ 拖拉机服务器已启动，端口: ' + PORT);
    console.log('✅ SQLite数据库已连接');
});

app.on("connection",function(socket){
   console.log("a new connectin")
   socket.emit("connection","connection  sucess")
   
   socket.on("disconnect", function(reason) {
       console.log("socket disconnect, socket.id: " + socket.id + ", reason: " + reason + ", time: " + new Date().toISOString())
   })
   
   socket.on("error", function(error) {
       console.log("socket error: " + error)
   })

   socket.on("notify",function(req){
      console.log("notify" + JSON.stringify(req))
      console.log("msg: "+req.cmd)
     
      var data = req.data
      switch(req.cmd){
         case "wxlogin":
            var uniqueId = data.uniqueID
            mydb.getPlayerInfoByUniqueID(uniqueId,function(err,result){
               if (err){
                  console.log("getPlayerInfoByUniqueID err"+err)
               }else{
                  if(result.length===0){
                    
                    var userinfo = {
                        uniqueID:data.uniqueID,
                        accountID:data.accountID,
                        nickName:data.nickName,
                        goldCount:1000,
                        avatarUrl:data.avatarUrl,
                    }
                    mydb.createPlayer(userinfo)

                    gamectr.create_player(
                       {
                        unique_id:data.uniqueID,
                        account_id:data.accountID,
                        nick_name:data.nickName,
                        gold_count:1000,
                        avatar_url:data.avatarUrl,
                       },
                       socket,
                       req.callindex
                    )
                  }else{
                     console.log('data = ' + JSON.stringify(result));
                     gamectr.create_player(result[0],socket,req.callindex)
                  }
               }
            })
            break
         default:
            console.log("default process msg: "+req.cmd)
            break;
      }
   })
})