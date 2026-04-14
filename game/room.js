const config = require("../defines.js")
const Carder = require("./carder.js")
const busizCardRules = require("./busizCardRules.js") // 巴士子扑克规则
const RoomState = {
    ROOM_INVALID: -1,
    ROOM_WAITREADY: 1,  //等待游戏
    ROOM_GAMESTART: 2,  //开始游戏
    ROOM_PUSHCARD: 3,   //发牌
    ROOM_ROBSTATE:4,    //叫主
    ROOM_SHOWBOTTOMCARD:5, //显示底牌
    ROOM_MINGBAOFANZHU:6, //明包反主阶段
    ROOM_BOTTOMCARD_PROCESS:7, //底牌处理阶段
    ROOM_TEAM_ASSIGNMENT:8, //庄家队分配阶段
    ROOM_SURRENDER:9,   //投降阶段
    ROOM_PLAYING:10,     //calculateGoldSettlement
    ROOM_SETTLEMENT:11,  //结算阶段
    ROOM_END:12         //房间结束
}
const getRandomStr = function (count) {
    var str = '';
    for (var i = 0 ; i < count ; i ++){
        str += Math.floor(Math.random() * 10);
    }
    return str;
}

const getSeatIndex = function(playerlist){
    var seatindex = 1
    if(playerlist.length==0){
        return seatindex
    }

    var index = 1
    for(var i=0;i<playerlist.length;i++){
        if(index!=playerlist[i].seatindex){
            return index
        }
        index++
    }

    return index
}

module.exports = function(roominfo,player){
    var that = {}
    that.room_id = getRandomStr(6)
    that._player_list = []
    console.log("creat room id:"+that.room_id)

    console.log("roominfo.rate:"+roominfo.rate)
    var tconfig = config.createRoomConfig[roominfo.rate]
    //console.log("config"+JSON.stringify(tconfig))

    that.own_player = player              //创建房间的玩家
    that.bottom = tconfig.bottom
    that.rate = tconfig.rate              //倍数
    that.roomType = tconfig.roomType || '' // 房间类型（初级房、中级房等）
    that.totalGames = tconfig.totalGames || 24  // 总局数
    that.currentGame = 0  // 当前局数（从0开始）
    that.gold =  that.rate * that.bottom //基数
    that.house_manage = player          //房主(不是地主)
    that.state = RoomState.ROOM_WAITREADY //房间状态，等待玩家准备
    console.log("room that.state："+ that.state)
    console.log("房间类型: " + that.roomType + ", 总局数: " + that.totalGames + ", 当前局数: " + that.currentGame)
    //初始化发牌器对象
    //实例化牌和洗牌在构造函数完成
    that.carder = Carder()  //发牌对象
    that.lostplayer = undefined //下一次叫主玩家
    that.robplayer = [] //复制一份房间内player,做叫主操作
    that.room_master = undefined //房间地主引用
    that.master_shape = undefined // 主花色
    that.bankerTeam = [] // 庄家队
    that.idleTeam = [] // 闲家队
    that.three_cards = []  //三张底牌
    that.playing_cards = [] //存储出牌的用户(一轮)
    that.cur_push_card_list = [] //当前玩家出牌列表
    that.last_push_card_list = [] //玩家上一次出的牌
    that.last_push_card_accountid = 0  //最后一个出牌的accountid
    that.playersCalledMaster = {}; // 跟踪每个玩家是否已叫主
    that.playersPassedRobbing = {}; // 跟踪每个玩家是否已选择不叫主
    that.playersWithTenCards = []; // 跟踪哪些玩家持有10牌
    that.allPlayersDecided = false; // 是否所有有10牌的玩家都已做出决定
    that.playersDealtCards = {}; // 跟踪每个玩家是否已完成发牌
    that.allPlayersDealt = false; // 是否所有玩家都已完成发牌

    // 反主相关变量
    that.playersEligibleForFanZhu = []; // 有资格反主的玩家列表
    that.playersFanZhuDecision = {}; // 跟踪每个有反主资格玩家的决定（fan:反主, bufan:不反）
    
    // 明包相关变量
    that.mingBaoDecisionMade = false; // 跟踪叫主玩家是否已做出明包/暗包的选择
    
    // 底牌合并标志
    that.bottomCardMerged = false; // 标记底牌是否已经合并，避免重复合并
    that.bottomCardProcessSent = false; // 标记是否已经发送底牌处理消息，避免重复发送

    // 轮次管理变量
    that.currentRoundCards = []; // 当前轮次玩家出牌记录 [{playerId, cards, score}]
    that.currentRoundFirstPlayerId = null; // 当前轮次首出玩家ID
    that.currentRoundFirstCards = []; // 当前轮次首出牌
    that.currentRoundScore = 0; // 当前轮次牌分

    // 下一局管理变量
    that.playersReadyForNextGame = {}; // 跟踪哪些玩家已经点击下一局
    that.allPlayersReadyForNextGame = false; // 是否所有玩家都已点击下一局

    const changeState = function(state){
        console.log("changeState: 当前状态=" + that.state + ", 新状态=" + state);
        if(that.state==state){
            return   
        }
        that.state = state
        switch(state){
            case RoomState.ROOM_WAITREADY:
                break
            case RoomState.ROOM_GAMESTART:
                console.log("进入ROOM_GAMESTART状态，调用gameStart()")
                gameStart()
                console.log("切换到发牌状态ROOM_PUSHCARD")
                //切换到发牌状态
                changeState(RoomState.ROOM_PUSHCARD)
                break
            case RoomState.ROOM_PUSHCARD:
                console.log("push card state")
                //这个函数把54张牌分成4份[玩家1，玩家2，玩家3,底牌]
                that.three_cards = that.carder.splitThreeCards()
                console.log("发牌给" + that._player_list.length + "个玩家，底牌数量:", that.three_cards[4] ? that.three_cards[4].length : 0)
                for(var i=0;i<that._player_list.length;i++){
                    console.log("发牌给玩家" + i + " accountID:" + that._player_list[i]._accountID + " 牌数量:" + (that.three_cards[i] ? that.three_cards[i].length : 0))
                    that._player_list[i].sendCard(that.three_cards[i])
                }
                // 等待一段时间再切换到叫主状态，以便客户端有足够的时间处理发牌动画
                setTimeout(function(){
                    //切换到叫主状态
                    changeState(RoomState.ROOM_ROBSTATE)
                }, 2000); // 等待2秒
                break
             case RoomState.ROOM_ROBSTATE:
                 console.log("change ROOM_ROBSTATE state")
                 // 实现平等叫主机制，所有有10牌的玩家同时可以叫主
                 // 不再按顺序轮流，而是同时通知所有玩家可以叫主
                 for(var i=0;i<that._player_list.length;i++){
                     // 通知所有玩家进入叫主状态
                     that._player_list[i].SendCanRob(-1) // -1表示所有玩家都可以叫主
                 }
                 
                 // 重置叫主相关变量
                 that.playersCalledMaster = {};
                 that.playersPassedRobbing = {};
                 that.playersWithTenCards = [];
                 that.allPlayersDecided = false;
                 console.log("重置叫主相关变量，开始等待玩家叫主");
                 break   
             case RoomState.ROOM_SHOWBOTTOMCARD:
                 console.log("change ROOM_SHOWBOTTOMCARD state")
                 //暂停1秒，让玩家看底牌
                 setTimeout(function(){
                    // 检查是否有人满足明包或反主条件
                    var hasMingBaoCondition = checkMingBaoCondition();
                    var hasFanZhuCondition = checkFanZhuCondition();
                                
                    if (hasMingBaoCondition || hasFanZhuCondition) {
                        // 如果有玩家满足明包或反主条件，进入明包反主阶段
                        console.log("检测到明包或反主条件，进入明包反主阶段");
                        changeState(RoomState.ROOM_MINGBAOFANZHU);
                    } else {
                        // 如果没有玩家满足条件，显示底牌后进入底牌处理阶段
                        console.log("无明包或反主条件，显示底牌后进入底牌处理阶段");
                                    
                        // 只向庄家显示底牌
                        if (that.room_master) {
                            that.room_master.SendShowBottomCard(that.three_cards[4]);
                            console.log("向庄家显示底牌");
                        }
                                    
                        changeState(RoomState.ROOM_BOTTOMCARD_PROCESS);
                    }
                 },1000)
                 break  
             case RoomState.ROOM_MINGBAOFANZHU:
                 console.log("change ROOM_MINGBAOFANZHU state");
                 // 进入明包反主阶段

                 // 初始化反主和明包相关变量
                 that.playersEligibleForFanZhu = [];
                 that.playersFanZhuDecision = {};
                 that.mingBaoDecisionMade = false; // 重置明包决定标志

                 // 检查是否有人满足明包或反主条件
                 var hasMingBaoCondition = checkMingBaoCondition();
                 var hasFanZhuCondition = checkFanZhuCondition();

                 if (hasMingBaoCondition || hasFanZhuCondition) {
                     // 记录有反主资格的玩家
                     that.recordPlayersEligibleForFanZhu();
                     
                     // 通知所有玩家进入明包反主阶段，等待玩家做出选择
                     console.log("有人满足明包反主条件，等待玩家选择");
                     for(var i=0;i<that._player_list.length;i++){
                         console.log("向玩家发送ROOM_MINGBAOFANZHU状态，玩家ID:" + that._player_list[i]._accountID);
                         that._player_list[i].sendRoomState(RoomState.ROOM_MINGBAOFANZHU);
                     }
                     
                     // 定期检查是否所有玩家都已做出决定
                     var checkInterval = setInterval(function() {
                         that.checkAllFanZhuDecisions();
                         
                         // 如果已经进入了其他状态，清除定时器
                         if (that.state !== RoomState.ROOM_MINGBAOFANZHU) {
                             clearInterval(checkInterval);
                             console.log("已离开明包反主阶段，清除检查定时器");
                         }
                     }, 1000);
                 } else {
                     // 如果没有人满足条件，直接进入底牌处理阶段
                     console.log("无人满足明包反主条件，直接进入底牌处理阶段");

                     // 只向庄家显示底牌
                     if (that.room_master) {
                         that.room_master.SendShowBottomCard(that.three_cards[4]);
                         console.log("向庄家显示底牌");
                     }

                     changeState(RoomState.ROOM_BOTTOMCARD_PROCESS);
                 }
                 break;
             case RoomState.ROOM_BOTTOMCARD_PROCESS:
                 console.log("change ROOM_BOTTOMCARD_PROCESS state");
                 // 进入底牌处理阶段
                // 将底牌合并到庄家手牌，并按大小排序插入
                if (that.room_master && that.three_cards && that.three_cards[4] && !that.bottomCardMerged && !that.bottomCardProcessSent) { // 底牌是数组的第5个元素（索引为4），且未合并过，且未发送过底牌处理消息
                   console.log("将底牌合并到庄家手牌");
                   console.log("底牌数量:", that.three_cards[4].length);
                   console.log("合并前庄家手牌数量:", that.room_master._cards.length);
                                              
                   try {
                       // 将底牌添加到庄家手牌
                       for (var i = 0; i < that.three_cards[4].length; i++) {
                           if (that.three_cards[4][i]) {
                               that.room_master._cards.push(that.three_cards[4][i]);
                           }
                       }
                                                   
                       console.log("合并后庄家手牌数量:", that.room_master._cards.length);
                       
                       // 标记底牌已合并，避免重复合并
                       that.bottomCardMerged = true;
                       console.log("标记底牌已合并，避免重复合并");
                                                   
                        // 按牌的大小对庄家手牌进行排序
                        // 首先按主牌/副牌分类，然后在同类中按颜色交替排序
                        that.room_master._cards.sort(function(a, b) {
                            // 王牌最大
                            if (a.king && b.king) {
                                return b.king - a.king; // 大王(13) > 小王(12)
                            }
                            if (a.king && !b.king) {
                                return -1; // a是王牌，排在前面
                            }
                            if (!a.king && b.king) {
                                return 1; // b是王牌，排在前面
                            }
                                                       
                            // 如果都不是王牌，先比较是否是主牌
                            // 使用Number转换避免字符串与数字的类型不匹配问题
                            var isMainCardA = (Number(a.value) === 11 || Number(a.value) === 10 || a.shape === that.master_shape); // 10牌、2牌或主花色牌
                            var isMainCardB = (Number(b.value) === 11 || Number(b.value) === 10 || b.shape === that.master_shape); // 10牌、2牌或主花色牌
                                                       
                            if (isMainCardA && !isMainCardB) {
                                return -1; // a是主牌，排在前面
                            }
                            if (!isMainCardA && isMainCardB) {
                                return 1; // b是主牌，排在前面
                            }
                                                       
                            // 如果都是主牌或都是副牌，按value排序
                            if (isMainCardA && isMainCardB) {
                                // 主牌内部按：10牌 > 2牌 > 其他主花色牌
                                if (a.value === 11 && b.value === 11) { // 都是10牌
                                    return b.shape - a.shape; // 按花色排序
                                }
                                if (a.value === 11) { // a是10牌
                                    return -1;
                                }
                                if (b.value === 11) { // b是10牌
                                    return 1;
                                }
                                if (a.value === 10 && b.value === 10) { // 都是2牌
                                    return b.shape - a.shape; // 按花色排序
                                }
                                if (a.value === 10) { // a是2牌
                                    return -1;
                                }
                                if (b.value === 10) { // b是2牌
                                    return 1;
                                }
                                // 其他主花色牌按值排序
                                return b.value - a.value;
                            } else {
                                // 都是副牌，按value排序
                                if (a.value !== b.value) {
                                    return b.value - a.value; // 按值排序
                                } else {
                                    // 值相同，按花色排序
                                    return a.shape - b.shape;
                                }
                            }
                        });
                                                   
                        // 通知所有玩家进入底牌处理阶段（包括状态变更）
                        // 向所有玩家发送状态变更通知
                        for(var i=0; i<that._player_list.length; i++) {
                            that._player_list[i].sendRoomState(RoomState.ROOM_BOTTOMCARD_PROCESS);
                        }
                                      
                        // 通知庄家进入底牌处理阶段，并发送合并后的手牌
                        console.log("排序后庄家手牌数量:", that.room_master._cards.length);
                        that.room_master.SendBottomCardProcess(that.room_master._cards);
                        
                        // 标记已发送底牌处理消息，避免重复发送
                        that.bottomCardProcessSent = true;
                        that.bottomCardMerged = true;
                        console.log("标记已发送底牌处理消息，避免重复发送");
                    } catch (error) {
                        console.error("合并底牌时发生错误:", error);
                        // 发送错误信息给玩家并返回基本手牌
                        if (that.room_master) {
                            that.room_master.SendBottomCardProcess(that.room_master._cards || []);
                        }
                    }
                 } else {
                    // 即使没有庄家或底牌数据，也要通知所有玩家状态变更
                    for(var i=0; i<that._player_list.length; i++) {
                        that._player_list[i].sendRoomState(RoomState.ROOM_BOTTOMCARD_PROCESS);
                    }
                 }
                 break;
             case RoomState.ROOM_TEAM_ASSIGNMENT:
                 console.log("change ROOM_TEAM_ASSIGNMENT state");
                 // 计算庄家队和闲家队
                 var teams = calculateTeams();
                 that.bankerTeam = teams.bankerTeam;
                 that.idleTeam = teams.idleTeam;
                 console.log("庄家队人数:", that.bankerTeam.length, "闲家队人数:", that.idleTeam.length);
                 // 进入投降阶段
                 changeState(RoomState.ROOM_SURRENDER);
                 break;
             case RoomState.ROOM_SURRENDER:
                 console.log("change ROOM_SURRENDER state");
                 // 检查庄家队是否只有一人
                 if (that.bankerTeam.length === 1) {
                     console.log("庄家队只有一人，进入投降阶段");
                     // 通知所有玩家进入投降阶段
                     for(var i=0;i<that._player_list.length;i++){
                         that._player_list[i].sendRoomState(RoomState.ROOM_SURRENDER);
                     }
                 } else {
                     console.log("庄家队人数大于1，直接进入出牌阶段");
                     // 庄家队人数大于1，直接进入出牌阶段
                     changeState(RoomState.ROOM_PLAYING);
                 }
                 break;
             case RoomState.ROOM_PLAYING:
                 console.log("change ROOM_PLAYING state");
                 // 通知所有玩家进入出牌阶段
                 for(var i=0; i<that._player_list.length; i++) {
                     that._player_list[i].sendRoomState(RoomState.ROOM_PLAYING);
                 }
                 resetChuCardPlayer()
                 //下发出牌消息  
                 turnchuCard()
                 break      
            default:
                break    
        }
    }

    that.jion_player = function(player){
        if(player){
            // 检查房间玩家数量是否已达上限（4个）
            if(that._player_list.length > 4) {
                console.log("房间玩家数量已达上限（4个），拒绝新玩家加入:", player._accountID);
                return;
            }
            
            player.seatindex = getSeatIndex(that._player_list)
            // 玩家加入房间时，初始化金币为0（临时积分）和抓牌分为0
            player._gold = 0
            player._captureScore = 0
            playerInfo={
                accountid:player._accountID,
                nick_name:player._nickName,
                avatarUrl:player._avatarUrl,
                goldcount:player._gold,  // 初始化为0
                seatindex:player.seatindex,
            }
            //把用户信息广播个给房间其他用户
            for(var i=0;i<that._player_list.length;i++){
           
                that._player_list[i].sendPlayerJoinRoom(playerInfo)
            }
            // 按座位号顺序插入玩家，确保列表顺序与座位号一致
            var inserted = false;
            for(var i=0; i<that._player_list.length; i++) {
                if(that._player_list[i].seatindex > player.seatindex) {
                    that._player_list.splice(i, 0, player);
                    inserted = true;
                    break;
                }
            }
            if(!inserted) {
                that._player_list.push(player);
            }
          
        }
    }
    
    that.enter_room = function(player,callback){
        // 检查房间玩家数量是否已达上限（4个）
        if(that._player_list.length > 4) {
            console.log("房间玩家数量已达上限（4个），拒绝新玩家进入:", player._accountID);
            if(callback) {
                callback(-1, {message: "房间玩家数量已达上限（4个）"});
            }
            return;
        }
        
        //获取房间内其他玩家数据
        var player_data = []
        console.log("enter_room _player_list.length:"+that._player_list.length)
        for(var i=0;i<that._player_list.length;i++){
            var data = {
                accountid:that._player_list[i]._accountID,
                nick_name:that._player_list[i]._nickName,
                avatarUrl:that._player_list[i]._avatarUrl,
                goldcount:that._player_list[i]._gold,
                seatindex:that._player_list[i].seatindex,
                isready:that._player_list[i]._isready,
            }
            player_data.push(data)
            console.log("enter_room userdata:"+JSON.stringify(data))
        }

        
        //var seatid = getSeatIndex(this._player_list) //分配一个座位号
        if(callback){
            var enterroom_para = {
                seatindex: player.seatindex, //自己在房间内的位置
                roomid:that.room_id,      //房间roomid
                playerdata: player_data,  //房间内玩家用户列表
                housemanageid:that.house_manage._accountID, 
            }
            callback(0,enterroom_para)
            //https://timgsa.baidu.com/timg?image&quality=80&size=b9999_10000&sec=1564763901986&di=82c257959de2c29ea027a4c2a00952e0&imgtype=0&src=http%3A%2F%2Fimages.liqucn.com%2Fimg%2Fh1%2Fh988%2Fimg201711250941030_info400X400.jpg
       }
    }
    //重新设置房主
    const changeHouseManage = function(player){
        if(player){
            that.house_manage = player
            //这里需要加上，掉线用户accountid过去
            for(var i=0;i<that._player_list.length;i++){
                that._player_list[i].sendPlayerChangeManage(that.house_manage._accountID)
            }
        }
    }
    //玩家掉线接口
    that.playerOffLine = function(player){
        // 标记玩家为离线状态，不移除玩家列表
        console.log("玩家" + player._accountID + "掉线，标记为离线")
        player._isOnline = false
        
        // 打印当前所有玩家的在线状态，用于调试
        console.log("房间玩家总数：" + that._player_list.length + "，当前各玩家状态：");
        for (var i = 0; i < that._player_list.length; i++) {
            var p = that._player_list[i];
            var onlineStatus = p._isOnline;
            if (onlineStatus === undefined) onlineStatus = "undefined";
            console.log("  玩家" + i + ": accountID=" + p._accountID + " 在线状态: " + onlineStatus);
        }
        
        // 如果房主掉线，需要更换房主给在线的玩家
        if(that.house_manage && that.house_manage._accountID == player._accountID){
            console.log("房主" + player._accountID + "掉线，尝试寻找在线玩家作为新房主")
            var newHouseManager = null
            for(var i=0;i<that._player_list.length;i++){
                // 严格检查玩家是否在线：_isOnline必须为true（不能是false或undefined）
                var isOnline = that._player_list[i]._isOnline;
                if (isOnline === true && that._player_list[i]._accountID !== player._accountID){
                    newHouseManager = that._player_list[i]
                    break
                }
            }
            if(newHouseManager){
                console.log("找到在线玩家" + newHouseManager._accountID + "作为新房主")
                changeHouseManage(newHouseManager)
            } else {
                console.log("没有找到其他在线玩家，保留原房主")
            }
        }
    }

    that.playerReady = function(player){
        //告诉房间里所有用户，有玩家ready
        for(var i=0;i<that._player_list.length;i++){
            that._player_list[i].sendplayerReady(player._accountID)
        }
    }

    //下发开始游戏消息
    const gameStart = function(){
        console.log("新游戏开始，当前局数:", that.currentGame, "/", that.totalGames);
        
        var gameStartData = {
            currentGame: that.currentGame,
            totalGames: that.totalGames
        };
        
        for(var i=0;i<that._player_list.length;i++){
            that._player_list[i].gameStart(gameStartData)
        }
    }
    
  
    //检查是否所有玩家都已做出叫主决定
    const checkAllPlayersCalled = function(){
        console.log("检查所有玩家的叫主状态，当前房间状态:" + that.state);
        
        // 确保只在叫主状态下处理
        if(that.state !== RoomState.ROOM_ROBSTATE) {
            console.log("当前不在叫主状态，跳过叫主检查");
            return;
        }
        
        // 在平等叫主机制下，一旦有人叫主，立即结束叫主阶段
        if(that.room_master) {
            console.log("有人叫主，结束叫主阶段");
            changeMaster();
            //改变房间状态，显示底牌
            changeState(RoomState.ROOM_SHOWBOTTOMCARD);
            return;
        }
        
        // 统计持有10牌的玩家数量
        var playersWithTenCount = 0;
        var playersDecidedCount = 0;
        
        // 重置持有10牌的玩家列表
        that.playersWithTenCards = [];
        
        for(var i=0; i<that._player_list.length; i++){
            var player = that._player_list[i];
            var playerHasTen = false;
            
            if(player._cards && player._cards.length > 0) {
                for(var j = 0; j < player._cards.length; j++) {
                    if(player._cards[j].value === 11) { // 10牌的值是11
                        playerHasTen = true;
                        break;
                    }
                }
            }
            
            if(playerHasTen) {
                playersWithTenCount++;
                that.playersWithTenCards.push(player._accountID);
                
                // 检查该玩家是否已做出决定（叫主或不叫）
                if(that.playersCalledMaster[player._accountID] || that.playersPassedRobbing[player._accountID]) {
                    playersDecidedCount++;
                }
            }
        }
        
        console.log("持有10牌的玩家数:" + playersWithTenCount + ", 已决定的玩家数:" + playersDecidedCount);
        console.log("持有10牌的玩家列表:" + JSON.stringify(that.playersWithTenCards));
        console.log("已叫主的玩家:" + JSON.stringify(Object.keys(that.playersCalledMaster)));
        console.log("已不叫的玩家:" + JSON.stringify(Object.keys(that.playersPassedRobbing)));
        
        // 如果有玩家持有10牌
        if(playersWithTenCount > 0) {
            // 如果所有持有10牌的玩家都已做出决定
            if(playersWithTenCount === playersDecidedCount) {
                console.log("所有持有10牌的玩家都已决定，结束叫主阶段");
                that.allPlayersDecided = true;
                
                if(!that.room_master) {
                    // 如果没有人叫主，重新发牌
                    console.log("无人叫主，重新发牌");
                    redealCards();
                    return;
                }
                
                changeMaster();
                //改变房间状态，显示底牌
                changeState(RoomState.ROOM_SHOWBOTTOMCARD);
            } else {
                // 继续等待持有10牌的玩家做出决定
                console.log("继续等待持有10牌的玩家做出决定，还需" + (playersWithTenCount - playersDecidedCount) + "人决定");
            }
        } else {
            // 如果没有任何玩家持有10牌，重新发牌
            console.log("无人持有10牌，重新发牌");
            // 延迟调用重新发牌函数，避免无限循环
            setTimeout(function() {
                redealCards();
            }, 100);
        }
    }
    
    // 重新发牌函数
    const redealCards = function() {
        console.log("开始重新发牌");
        // 重新初始化牌堆并洗牌
        that.carder = Carder();  // 重新实例化发牌器并洗牌
        that.three_cards = [];  // 清空底牌
        
        // 重置叫主相关状态
        that.playersCalledMaster = {};
        that.playersPassedRobbing = {};
        that.playersWithTenCards = [];
        that.allPlayersDecided = false;
        that.room_master = undefined;
        that.master_shape = undefined;
        
        // 重新发牌给所有玩家
        that.three_cards = that.carder.splitThreeCards();
        for(var i=0;i<that._player_list.length;i++){
            // 清空玩家当前手牌
            that._player_list[i]._cards = [];
            // 发新牌给玩家
            that._player_list[i].sendCard(that.three_cards[i]);
        }
        
        // 重置房间状态为叫主状态
        that.state = RoomState.ROOM_ROBSTATE;
        console.log("房间状态重置为叫主状态");
        
        // 通知所有玩家进入叫主状态
        for(var i=0;i<that._player_list.length;i++){
            that._player_list[i].SendCanRob(-1); // -1表示所有玩家都可以叫主
        }
        console.log("通知所有玩家进入叫主状态");
    }

    //客户端到服务器: 发送庄家改变的消息
    const changeMaster = function(){
        // 创建包含地主和主花色信息的对象
        var masterData = {
            accountid: that.room_master._accountID,
            shape: that.master_shape  // 主花色
        };
        
        for(var i=0;i<that._player_list.length;i++){
            that._player_list[i].SendChangeMaster(masterData)
        }

        // 不再在叫主后立即显示底牌，而是在明包反主阶段结束后显示
        // 底牌显示逻辑移到明包反主阶段处理
    }
    
    // 检查明包条件：叫主玩家拥有两个与叫主花色相同的10牌
    const checkMingBaoCondition = function(){
        if (!that.room_master || !that.master_shape) {
            return false;
        }
        
        // 检查叫主玩家是否拥有至少两个与叫主花色相同的10牌
        var masterPlayer = that.room_master;
        var masterShapeCount = 0; // 叫主花色的10牌数量
        
        if(masterPlayer._cards && masterPlayer._cards.length > 0) {
            for(var i = 0; i < masterPlayer._cards.length; i++) {
                var card = masterPlayer._cards[i];
                if(card && card.value === 11 && card.shape === that.master_shape) { // 10牌的值是11，且花色与叫主花色相同
                    masterShapeCount++;
                    
                    // 一旦叫主花色的10牌数量达到2张就可以提前返回
                    if (masterShapeCount >= 2) {
                        console.log("检查明包条件 - 叫主玩家ID:" + masterPlayer._accountID + ", 叫主花色:" + that.master_shape + ", 10牌数量:" + masterShapeCount);
                        return true;
                    }
                }
            }
        }
        
        // 记录详细的统计信息
        console.log("检查明包条件 - 叫主玩家ID:" + masterPlayer._accountID + ", 叫主花色:" + that.master_shape + ", 10牌数量:" + masterShapeCount);
        
        // 检查叫主花色的10牌数量是否>=2
        return masterShapeCount >= 2;
    };
    
    // 检查反主条件：非叫主玩家拥有两个同花色10牌，且没有明包
    const checkFanZhuCondition = function(){
        console.log("开始检查反主条件");
        if (!that.master_shape) {
            return false;
        }
        
        // 检查是否有非叫主玩家拥有至少两个同花色10牌
        for(var i = 0; i < that._player_list.length; i++) {
            var player = that._player_list[i];
            
            // 跳过叫主玩家
            if (player._accountID === that.room_master._accountID) {
                continue;
            }
            
            // 统计该玩家每种花色的10牌数量
            var shapeCounts = {};
            if(player._cards && player._cards.length > 0) {
                for(var j = 0; j < player._cards.length; j++) {
                    if(player._cards[j].value === 11) { // 10牌的值是11
                        var shape = player._cards[j].shape;
                        if (!shapeCounts[shape]) {
                            shapeCounts[shape] = 0;
                        }
                        shapeCounts[shape]++;
                    }
                }
            }
            
            // 检查是否有任何花色有至少2张10牌（且不与当前主花色相同）
            for (var shape in shapeCounts) {
                if (shapeCounts[shape] >= 2 && parseInt(shape) !== that.master_shape) {
                    console.log("检查反主条件 - 玩家ID:" + player._accountID + ", 花色:" + shape + ", 该花色10牌数量:" + shapeCounts[shape]);
                    return true;
                }
            }
        }
        
        return false;
    };
    
    //房主点击开始游戏按钮
    that.playerStart = function(player,cb){
        // 检查是否为房主
        if (!player || player._accountID !== that.house_manage._accountID) {
            console.log("playerStart: 非房主尝试开始游戏，玩家ID:", player ? player._accountID : "null");
            if(cb){
                cb(-4, null);
            }
            return;
        }
        
        // 检查房间状态是否为等待准备状态
        if (that.state !== RoomState.ROOM_WAITREADY) {
            console.log("playerStart: 房间状态不是ROOM_WAITREADY，当前状态:", that.state);
            if(cb){
                cb(-1, null);
            }
            return;
        }
        
        // 检查玩家数量是否为4
        if(that._player_list.length != 4){
            console.log("playerStart: 玩家数量不足4人，当前数量:", that._player_list.length);
            if(cb){
                cb(-2,null)
            }
            return
        }

        // 判断是否所有玩家都准备成功（除了房主）
        for(var i=0;i<that._player_list.length;i++){
            if(that._player_list[i]._accountID!=that.house_manage._accountID){
                if(that._player_list[i]._isready==false){
                    console.log("playerStart: 玩家", that._player_list[i]._accountID, "未准备");
                    cb(-3,null)
                    return 
                }
            }
        }

        console.log("playerStart: 房主开始游戏，所有玩家已准备");
        
        // 开始游戏
        changeState(RoomState.ROOM_GAMESTART);
        
        if(cb){
            cb(0,{data: {}})
        }

    }

    /**
     * 计算一组牌的分数（5、10、K）
     * @param {Array} cards - 牌数组
     * @returns {number} 总分数
     */
    const calculateCardsScore = function(cards) {
        if (!Array.isArray(cards) || cards.length === 0) {
            return 0;
        }

        let totalScore = 0;
        for (var i = 0; i < cards.length; i++) {
            var card = cards[i].card_data;
            if (!card) continue;

            // 王牌无分数
            if (card.king) continue;

            // 根据服务器端value判断：1=5分，8=K(10分)，11=10分
            // 转换为字符串进行比较，兼容数字和字符串类型
            var valueStr = String(card.value);
            if (valueStr === "1") { // 牌面5
                totalScore += 5;
            } else if (valueStr === "8" || valueStr === "11") { // 牌面K或10
                totalScore += 10;
            }
        }
        return totalScore;
    }

    /**
     * 比较两组牌的大小
     * @param {Array} cards1 - 第一组牌
     * @param {Array} cards2 - 第二组牌
     * @returns {number} 1表示cards1大，-1表示cards2大，0表示相等
     */
    const compareCardGroups = function(cards1, cards2) {
        if (!Array.isArray(cards1) || !Array.isArray(cards2)) return 0;
        if (cards1.length === 0 || cards2.length === 0) return 0;

        // 提取牌数据
        var data1 = cards1.map(item => item.card_data);
        var data2 = cards2.map(item => item.card_data);

        // 获取牌型
        const type1 = busizCardRules.getCardType(data1, that.master_shape);
        const type2 = busizCardRules.getCardType(data2, that.master_shape);

        // 牌型必须相同才能比较
        if (type1.type !== type2.type) {
            return 0;
        }

        // 牌型数量必须相同
        if (cards1.length !== cards2.length) {
            return 0;
        }

        // 比较主副牌
        const hasMain1 = data1.some(card => busizCardRules.isMainCard(card, that.master_shape));
        const hasMain2 = data2.some(card => busizCardRules.isMainCard(card, that.master_shape));

        if (hasMain1 && !hasMain2) {
            return 1; // 主牌大于副牌
        }
        if (!hasMain1 && hasMain2) {
            return -1; // 副牌小于主牌
        }

        // 如果都是主牌，使用巴士子扑克规则比较
        if (hasMain1 && hasMain2) {
            
            return busizCardRules.compareCardGroups(data1, data2, that.master_shape);
        }

        // 如果都是副牌
        if (!hasMain1 && !hasMain2) {
            // 获取首出花色
            var firstShape = null;
            if (that.currentRoundFirstCards && that.currentRoundFirstCards.length > 0) {
                firstShape = that.currentRoundFirstCards[0].card_data.shape;
            }

            // 检查花色
            const shape1 = data1[0].shape;
            const shape2 = data2[0].shape;

            // 如果花色相同，比较大小
            if (shape1 === shape2) {
                for (let i = 0; i < data1.length; i++) {
                    const result = busizCardRules.compareCards(data1[i], data2[i], that.master_shape);
                    if (result !== 0) {
                        return result;
                    }
                }
                return 0; // 相等
            } else {
                // 花色不同，先出花色大于后跟花色
                if (firstShape !== null) {
                    if (shape1 === firstShape) {
                        return 1; // cards1是先出花色，获胜
                    } else if (shape2 === firstShape) {
                        return -1; // cards2是先出花色，获胜
                    }
                }

                // 如果都没有首出花色（不应该发生），按花色优先级比较
                // 花色优先级：黑桃(1)>红桃(2)>梅花(3)>方片(4)
                const shapePriority = {1: 4, 2: 3, 3: 2, 4: 1};
                const priority1 = shapePriority[shape1] || 0;
                const priority2 = shapePriority[shape2] || 0;
                return priority1 > priority2 ? 1 : (priority1 < priority2 ? -1 : 0);
            }
        }

        return 0;
    }

    /**
     * 处理一轮结束
     * 找出赢家，计算牌分，通知客户端
     */
    const handleRoundEnd = function() {
        console.log("=== 一轮结束，开始判断赢家 ===");
        console.log("当前轮次出牌记录:", JSON.stringify(that.currentRoundCards));

        if (that.currentRoundCards.length === 0) {
            console.log("当前轮次没有出牌记录");
            return;
        }

        // 比较所有玩家的牌，找出最大的
        var winner = that.currentRoundCards[0];
        for (var i = 1; i < that.currentRoundCards.length; i++) {
            var current = that.currentRoundCards[i];
            var result = compareCardGroups(current.cards, winner.cards);

            if (result === 1) {
                winner = current;
                console.log("玩家" + current.playerId + "的牌更大");
            }
        }

        console.log("=== 第" + (that.currentRoundFirstPlayerId === winner.playerId ? "首出玩家" : "跟牌玩家") + "获胜 ===");
        console.log("赢家ID:", winner.playerId, "牌分:", that.currentRoundScore);
        
        // 将本轮分数加到赢家的抓牌分中
        for (var p = 0; p < that._player_list.length; p++) {
            if (that._player_list[p]._accountID === winner.playerId) {
                that._player_list[p]._captureScore += that.currentRoundScore;
                console.log("玩家" + winner.playerId + "获得牌分" + that.currentRoundScore + "，当前抓牌分:" + that._player_list[p]._captureScore);
                break;
            }
        }
        // 检查所有玩家手牌是否都已出完
        var allCardsEmpty = true;
        var totalCardsCount = 0;
        for (var n = 0; n < that._player_list.length; n++) {
            totalCardsCount += that._player_list[n]._cards.length;
            if (that._player_list[n]._cards.length > 0) {
                allCardsEmpty = false;
            }
        }

        console.log("检查所有玩家手牌：总牌数=" + totalCardsCount + "，所有手牌为空=" + allCardsEmpty);

        var playerScores = {};
        for (var p = 0; p < that._player_list.length; p++) {
            playerScores[that._player_list[p]._accountID] = that._player_list[p]._captureScore;
        }

        var roundEndData = {
            winnerId: winner.playerId,
            score: that.currentRoundScore,
            cards: that.currentRoundCards,
            playerScores: playerScores
        };

        for (var j = 0; j < that._player_list.length; j++) {
            that._player_list[j].SendRoundEnd(roundEndData);
        }

        // 重新计算出牌顺序，赢家先出牌
        var winnerIndex = 0;
        for (var k = 0; k < that._player_list.length; k++) {
            if (that._player_list[k]._accountID === winner.playerId) {
                winnerIndex = k;
                break;
            }
        }

        // 设置playing_cards，从赢家开始
        that.playing_cards = [];
        for (var m = 0; m < that._player_list.length; m++) {
            var realIndex = (winnerIndex + m) % that._player_list.length;
            that.playing_cards.push(that._player_list[realIndex]);
        }

        console.log("新出牌顺序:", that.playing_cards.map(p => p._accountID));

        // 如果所有玩家手牌都已出完，进入结算阶段
        if (allCardsEmpty) {
            console.log("=== 所有玩家手牌已出完，进入结算阶段 ===");
            handleGameSettlement();
            // 结算后再清空数据
            that.currentRoundCards = [];
            that.currentRoundFirstPlayerId = null;
            that.currentRoundFirstCards = [];
            that.currentRoundScore = 0;
        } else {
            // 清空当前轮次数据
            that.currentRoundCards = [];
            that.currentRoundFirstPlayerId = null;
            that.currentRoundFirstCards = [];
            that.currentRoundScore = 0;

            // 重置last_push_card_list，让赢家先出牌
            that.last_push_card_list = [];
            that.last_push_card_accountid = 0;

            // 重置cur_push_card_list，确保第二轮开始时是全新的状态
            that.cur_push_card_list = [];

            // 重置巴士子扑克相关状态，确保第二轮不受第一轮影响
            console.log("重置所有出牌相关状态，准备第二轮开始");

            // 通知赢家出牌
            turnchuCard();
        }
    }

    //一轮出牌完毕，调用这个函数重置出牌数组
    const resetChuCardPlayer = function(){
        var master_index = 0 //地主在列表中的位置 
        for(var i=that._player_list.length-1;i>=0;i--){  
           if(that._player_list[i]._accountID==that.room_master._accountID){
               master_index = i
           }
        }
        //重新计算出牌的顺序
        that.playing_cards = [] // 清空数组
        var index = master_index
        for(var i=0;i<that._player_list.length;i++){
           var real_index = (master_index + i) % that._player_list.length
           console.log("real_index:"+real_index)
           that.playing_cards.push(that._player_list[real_index])
        }

        //如果上一个出牌的人是自己，在一轮完毕后要从新设置为空
        //如果上一个出牌的人不是自己，就不用处理
        if(that.playing_cards.length > 0) {
            var next_push_player_account = that.playing_cards[0]._accountID
            if(that.last_push_card_accountid == next_push_player_account){
               that.last_push_card_list = []
               that.last_push_card_accountid = 0
            }
        }
        
    }
    
    // 初始化该局相关参数
    const resetGameParams = function(){
        console.log("初始化该局相关参数");
        // 重置游戏相关参数
        that.three_cards = []; // 清空底牌
        that.room_master = undefined; // 清理庄家标签
        that.master_shape = undefined; // 清理主花色标签
        that.current_master = null;
        that.current_shape = null;
        that.hasMingBao = false;
        that.mingBaoPlayerId = null;
        that.hasFanZhu = false; // 清理反包标签
        that.fanZhuPlayerId = null;
        that.mingBaoDecisionMade = false;
        that.playersEligibleForFanZhu = [];
        that.playersFanZhuDecision = {};
        that.bottomCardMerged = false; // 重置底牌合并标志，确保每局游戏都能正确合并底牌
        that.bottomCardProcessSent = false; // 重置底牌处理消息发送标志，确保每局游戏都能正确发送底牌处理消息
        that.bankerTeam = [];
        that.idleTeam = [];
        that.playing_cards = [];
        that.last_push_card_list = [];
        that.last_push_card_accountid = 0;
        // 重置所有玩家的抓牌分和手牌
        if(Array.isArray(that._player_list) && that._player_list.length > 0) {
            for(var i=0; i<that._player_list.length; i++) {
                that._player_list[i]._captureScore = 0;
                that._player_list[i]._cards = []; // 清空玩家手牌
            }
        }
        console.log("该局相关参数初始化完成");
    }

      //下发:谁出牌的消息
      const turnchuCard = function(){
      
        var cur_chu_card_player = that.playing_cards.shift() // 从数组开头取出玩家，确保按正确顺序出牌
        for(var i=0;i<that._player_list.length;i++){
              //通知下一个出牌的玩家
              that._player_list[i].SendChuCard(cur_chu_card_player._accountID)
        }
      }

    //客户端发送到服务器:出牌消息
    that.playerBuChuCard = function(player,data){
       
        //如果出牌数组为空，说明一轮结束，需要重置出牌顺序
        if(that.playing_cards.length==0){
            // 只有在当前轮次已经结束的情况下才重置出牌顺序
            // 否则，保持当前的出牌顺序
            if(that.currentRoundCards.length === that._player_list.length){
                resetChuCardPlayer()
            } else {
                // 如果当前轮次还没有结束，但是playing_cards数组为空，
                // 说明是因为玩家断线或其他原因导致的，这时候需要重新初始化出牌顺序
                // 从当前轮次的首出玩家开始
                if(that.currentRoundFirstPlayerId){
                    var firstPlayerIndex = 0;
                    for(var i=0; i<that._player_list.length; i++){
                        if(that._player_list[i]._accountID === that.currentRoundFirstPlayerId){
                            firstPlayerIndex = i;
                            break;
                        }
                    }
                    // 重新计算出牌顺序，从首出玩家开始
                    that.playing_cards = [];
                    for(var i=0; i<that._player_list.length; i++){
                        var realIndex = (firstPlayerIndex + i) % that._player_list.length;
                        that.playing_cards.push(that._player_list[realIndex]);
                    }
                    // 移除已经出完牌的玩家
                    for(var i=that.playing_cards.length-1; i>=0; i--){
                        var playerId = that.playing_cards[i]._accountID;
                        var hasPlayed = false;
                        for(var j=0; j<that.currentRoundCards.length; j++){
                            if(that.currentRoundCards[j].playerId === playerId){
                                hasPlayed = true;
                                break;
                            }
                        }
                        if(hasPlayed){
                            that.playing_cards.splice(i, 1);
                        }
                    }
                }
            }
        }
        turnchuCard()
    }

    //广播玩家出牌的消息
    //player出牌的玩家
    const sendPlayerPushCard = function(player,cards){
        if(player==null || cards.length==0){
            return
        }

        for(var i=0;i<that._player_list.length;i++){
            //不转发给自己
            if(that._player_list[i]==player){
                continue
            }
            var data = {  // 添加var声明，避免成为全局变量
                accountid:player._accountID,
                cards:cards,
            }
            that._player_list[i].SendOtherChuCard(data)
      }

      player.removePushCards(cards)

    }
    //玩家出牌
    that.playerChuCard = function(player,data,cb){
        console.log("playerChuCard"+JSON.stringify(data))
         //当前没有出牌,不用走下面判断
         if(data==0){
            resp = {
                data:{
                      account:player._accountID,
                      msg:"choose card sucess",
                    }
            }
            cb(0,resp)
            //让下一个玩家出牌,并发送消息
            that.playerBuChuCard(null,null)
            return
        }

        // 巴士子扑克规则：如果是跟牌玩家，先验证跟牌规则
        // 添加额外的判断：如果当前轮次是新的开始（currentRoundCards为空），则视为首出牌，跳过巴士子扑克验证
        var isFirstPlayerOfNewRound = that.currentRoundCards.length === 0;
        console.log("判断是否为新轮次首出牌：currentRoundCards长度=", that.currentRoundCards.length, "last_push_card_list长度=", that.last_push_card_list.length, "isFirstPlayerOfNewRound=", isFirstPlayerOfNewRound);
        
        // 如果是新轮次的首出牌者，跳过巴士子扑克验证，直接进入首出牌逻辑
        if (isFirstPlayerOfNewRound) {
            console.log("当前玩家是新轮次的首出牌者，跳过巴士子扑克验证");
        } else if (that.last_push_card_list.length > 0) {
            // 提取牌数据
            const selectedCards = data.map(item => item.card_data);
            const firstCards = that.last_push_card_list.map(item => item.card_data);
            
            // 巴士子扑克特殊规则：埋牌后，底牌不能再作为手牌条件判断
            // 如果当前玩家是庄家且已经完成埋牌，应该使用实际的手牌（排除底牌）
            let handCards = player._cards.map(card => ({value: card.value, shape: card.shape, king: card.king}));
            
            // 检查是否是庄家且已完成埋牌（房间状态为ROOM_PLAYING表示埋牌已完成）
            if (that.room_state === RoomState.ROOM_PLAYING && player._accountID === (that.room_master ? that.room_master._accountID : null)) {
                console.log("庄家已完成埋牌，使用实际手牌进行验证（排除底牌）");
                // 这里已经正确，因为埋牌后player._cards已经是实际的手牌（不包含底牌）
            }

            // 使用巴士子扑克规则验证
            const validationResult = busizCardRules.validatePlayCards(
                selectedCards,
                firstCards,
                handCards,
                that.master_shape
            );

            if (!validationResult.isValid) {
                resp = {
                    data:{
                          account:player._accountID,
                          msg: validationResult.reason,
                    }
                }
                cb(-1,resp)
                return
            }

            // 巴士子扑克：跟牌玩家只需符合跟牌规则，不需要检查牌型
            // 设置cardvalue为null，因为跟牌玩家不需要牌型值
            var cardvalue = null;

            // 巴士子扑克：不比大小，只要符合跟牌规则即可
            // 不需要比牌的大小，只要跟牌规则满足就可以出
        } else {
            // 首出玩家：先判断牌型是否满足规则
            var cardvalue = that.carder.IsCanPushs(data)
            if(cardvalue==undefined){
                resp = {
                    data:{
                          account:player._accountID,
                          msg:"不可用牌型",
                        }
                }
                cb(-1,resp)
                return
            }
        }

        if(that.last_push_card_list.length==0){
            //首出牌，记录轮次信息
            that.currentRoundFirstPlayerId = player._accountID;
            that.currentRoundFirstCards = data;
            that.currentRoundCards = []; // 清空上一轮数据

            // 计算这组牌的分数
            var cardsScore = calculateCardsScore(data);
            that.currentRoundScore += cardsScore;

            // 记录出牌
            that.currentRoundCards.push({
                playerId: player._accountID,
                cards: data,
                score: cardsScore
            });

            console.log("玩家" + player._accountID + "首出牌，牌数:", data.length, "牌分:", cardsScore);

            //出牌成功
            that.last_push_card_list = data
            that.last_push_card_accountid = player._accountID
            resp = {
                data:{
                      account:player._accountID,
                      msg:"sucess",
                      cardvalue:cardvalue,
                    }
            }
            //回调函数会给出牌玩家发送出牌成功消息
            cb(0,resp)
            //把该玩家出的牌广播给其他玩家
            sendPlayerPushCard(player,data)
            //通知下一个玩家出牌
            that.playerBuChuCard(null,null)
            return
        }

        //跟牌，计算这组牌的分数
        var followCardsScore = calculateCardsScore(data);
        that.currentRoundScore += followCardsScore;

        // 记录出牌
        that.currentRoundCards.push({
            playerId: player._accountID,
            cards: data,
            score: followCardsScore
        });

        console.log("玩家" + player._accountID + "跟牌，牌数:", data.length, "牌分:", followCardsScore, "轮总分:", that.currentRoundScore);

        //跟牌出牌成功，但不要覆盖首出牌信息，保持第一位玩家的牌作为firstCards
        // that.last_push_card_list = data  // 注释掉这行，不要覆盖首出牌
        // that.last_push_card_accountid = player._accountID  // 注释掉这行
        resp = {
            data:{
                  account:player._accountID,
                  msg:"choose card sucess",
                  cardvalue:cardvalue,
                }
        }
        //回调函数会给出牌玩家发送出牌成功消息
        cb(0,resp)
        //把该玩家出的牌广播给其他玩家
        sendPlayerPushCard(player,data)

        // 检查是否所有玩家都出完牌（一轮结束）
        if (that.currentRoundCards.length === that._player_list.length) {
            // 延迟一下，让客户端先显示完所有出的牌
            setTimeout(function() {
                handleRoundEnd();
            }, 1000);
        } else {
            //通知下一个玩家出牌
            that.playerBuChuCard(null,null);
        }
    }
    //客户端到服务器: 处理玩家叫主消息
    that.playerRobmaster = function(player,data){
        console.log("playerCallMaster value:"+JSON.stringify(data))
        
        // 检查玩家是否有效
        if(!player){
            console.log("playerRobmaster: 玩家无效");
            return;
        }
        
        // 检查当前房间状态是否为叫主状态
        if(that.state !== RoomState.ROOM_ROBSTATE){
            console.log("当前不在叫主状态，无法处理叫主请求");
            return;
        }
        
        var state = data.state || data; // 兼容旧数据格式
        var shape = data.shape || 0; // 花色信息
        
        // 检查玩家是否持有10牌才能叫主
        var hasTenCard = false;
        if(player._cards && player._cards.length > 0) {
            for(var i = 0; i < player._cards.length; i++) {
                // 检查是否有10牌 (value为10)
                if(player._cards[i].value === 11) { // 10牌的值是11
                    hasTenCard = true;
                    break;
                }
            }
        }
        
        console.log("playerRobmaster: 玩家ID=" + player._accountID + ", 状态=" + state + ", 花色=" + shape + ", 有10牌=" + hasTenCard);
        
        if(config.qian_state.buqiang==state){
            // 不叫主
            that.playersPassedRobbing[player._accountID] = true;
            console.log("玩家" + player._accountID + "选择不叫主");
                
        }else if(config.qian_state.qian==state && hasTenCard){
            // 玩家有10牌且选择叫主
            that.room_master = player
            that.master_shape = shape  // 记录主花色
            that.playersCalledMaster[player._accountID] = true; // 记录该玩家已叫主
            console.log("玩家" + player._accountID + "成功叫主，花色:" + shape);
                    
            // 立即结束叫主阶段，因为一旦有人叫主，其他人就不能再叫
            that.robplayer = []; // 清空剩余的叫主玩家列表
        }else if(config.qian_state.qian==state && !hasTenCard){
            console.log("玩家没有10牌，不能叫主");
            return; // 不允许没有10牌的玩家叫主
        }else{
            console.log("playerCallMaster state error:"+state);
            return; // 无效状态，不处理
        }
        //广播这个用户叫主状态(叫了或者不叫)
        var broadcastData = {
            accountid:player._accountID,
            state:state,
            shape:shape  // 添加花色信息
        };
        for(var i=0;i<that._player_list.length;i++){
            that._player_list[i].sendRobState(broadcastData)
    }
    
    // 检查所有玩家的叫主状态
    checkAllPlayersCalled()
    }

    // 处理玩家明包请求
    that.playerMingBao = function(player, data) {
        console.log("玩家请求明包:" + player._accountID + ", 数据:" + JSON.stringify(data));
        
        // 验证是否是叫主玩家（庄家）才能进行明包
        if (!that.room_master || player._accountID !== that.room_master._accountID) {
            console.log("非叫主玩家不能进行明包操作:" + player._accountID);
            return;
        }
        
        // 检查是否已经进行过明包操作，防止重复处理
        if (that.hasMingBao) {
            console.log("已经进行过明包操作，忽略重复请求:" + player._accountID);
            return;
        }
        
        // 设置明包标志
        that.hasMingBao = true;
        that.mingBaoPlayerId = player._accountID;
        that.mingBaoDecisionMade = true; // 标记叫主玩家已做出明包选择
        console.log("设置明包标志: hasMingBao = true, mingBaoPlayerId = " + player._accountID + ", mingBaoDecisionMade = " + that.mingBaoDecisionMade);
        
        // 广播明包消息给所有玩家
        var broadcastData = {
            accountid: player._accountID,
            state: data.state
        };
        
        for(var i=0; i<that._player_list.length; i++){
            that._player_list[i].sendMingBao(broadcastData);
        }
        
        // 明包后直接进入底牌处理阶段，与暗包操作保持一致
        // 这样可以避免在发牌完成前进行明包操作时重复合并底牌
        console.log("明包完成，进入底牌处理阶段");
        
        changeState(RoomState.ROOM_BOTTOMCARD_PROCESS);
    }

    // 处理玩家暗包请求
    that.playerAnBao = function(player, data) {
        console.log("玩家请求暗包:" + player._accountID + ", 数据:" + JSON.stringify(data));
        
        // 验证是否是叫主玩家（庄家）才能进行暗包
        if (!that.room_master || player._accountID !== that.room_master._accountID) {
            console.log("非叫主玩家不能进行暗包操作:" + player._accountID);
            return;
        }
        
        // 检查是否已经进行过暗包操作，防止重复处理
        if (that.mingBaoDecisionMade) {
            console.log("已经进行过暗包操作，忽略重复请求:" + player._accountID);
            return;
        }
        
        // 记录玩家的决定为"暗包"
        that.playersFanZhuDecision[player._accountID] = 'anbao';
        that.mingBaoDecisionMade = true; // 标记叫主玩家已做出暗包选择
        console.log("玩家" + player._accountID + "选择暗包");
        
        // 从反主资格玩家列表中移除该玩家（如果存在）
        var playerIndex = that.playersEligibleForFanZhu.indexOf(player._accountID);
        if (playerIndex > -1) {
            that.playersEligibleForFanZhu.splice(playerIndex, 1);
            console.log("从反主资格玩家列表中移除玩家:" + player._accountID);
        }
        
        console.log("当前玩家决定记录:", that.playersFanZhuDecision);
        console.log("当前有反主资格的玩家列表:", that.playersEligibleForFanZhu);
        
        // 广播暗包消息给所有玩家
        var broadcastData = {
            accountid: player._accountID,
            state: data.state
        };
        
        for(var i=0; i<that._player_list.length; i++){
            that._player_list[i].sendAnBao(broadcastData);
        }
        
        // 暗包后直接进入底牌处理阶段（底牌将在底牌处理阶段显示给庄家）
        console.log("暗包完成，进入底牌处理阶段");
        changeState(RoomState.ROOM_BOTTOMCARD_PROCESS);
    }

    // 处理玩家投降请求
    that.playerSurrender = function(player, data) {
        console.log("玩家请求投降:" + player._accountID + ", 数据:" + JSON.stringify(data));
        
        // 验证是否是庄家队的玩家才能进行投降
        if (!that.bankerTeam) {
            console.log("庄家队未定义，不能进行投降操作:" + player._accountID);
            return;
        }
        
        // 检查玩家是否在庄家队中（遍历检查每个玩家对象的_accountID）
        var isInBankerTeam = false;
        for (var i = 0; i < that.bankerTeam.length; i++) {
            if (that.bankerTeam[i]._accountID === player._accountID) {
                isInBankerTeam = true;
                break;
            }
        }
        
        if (!isInBankerTeam) {
            console.log("非庄家队玩家不能进行投降操作:" + player._accountID);
            return;
        }
        
        // 验证庄家队是否只有一人
        if (that.bankerTeam.length !== 1) {
            console.log("庄家队人数不为1，不能进行投降操作:" + player._accountID);
            return;
        }
        
        console.log("玩家选择投降，直接进入结算阶段");
        
        // 构建结算数据
        var settlementData = {
            bottomCards: that.three_cards ? (that.three_cards[4] || []) : [],
            goldChanges: {},
            winnerTeam: "idleTeam", // 投降后闲家队获胜
            bankerTeam: that.bankerTeam ? that.bankerTeam.map(p => p._accountID) : [],
            idleTeam: that.idleTeam ? that.idleTeam.map(p => p._accountID) : [],
            idleTeamTotalScore: 0, // 投降时闲家队总抓牌分设为0
            bottomCardScore: 0, // 投降时底牌牌分设为0
            hasMingBaoOrFanZhu: false // 投降时默认无明暗包反主
        };
        
        // 填充金币变动数据并计算投降后的分数
        // 庄家队-300，闲家队各+100
        for(var i=0; i<that._player_list.length; i++) {
            var teamPlayer = that._player_list[i];
            
            // 检查玩家是否在庄家队中（遍历检查每个玩家对象的_accountID）
            var isInBankerTeam = false;
            for (var j = 0; j < that.bankerTeam.length; j++) {
                if (that.bankerTeam[j]._accountID === teamPlayer._accountID) {
                    isInBankerTeam = true;
                    break;
                }
            }
            
            if (isInBankerTeam) {
                // 庄家队玩家
                teamPlayer._gold -= 300;
                settlementData.goldChanges[teamPlayer._accountID] = -300;
                console.log("庄家队玩家" + teamPlayer._accountID + "扣分300，当前分数:" + teamPlayer._gold);
            } else {
                // 闲家队玩家
                teamPlayer._gold += 100;
                settlementData.goldChanges[teamPlayer._accountID] = 100;
                console.log("闲家队玩家" + teamPlayer._accountID + "加分100，当前分数:" + teamPlayer._gold);
            }
        }
        
        // 发送结算消息给所有玩家
        console.log("发送投降结算消息给所有玩家:", JSON.stringify(settlementData));
        for(var i=0; i<that._player_list.length; i++) {
            that._player_list[i].sendGameSettlement(settlementData);
        }
        
        // 初始化该局相关参数
        resetGameParams();
        
        // 进入结算阶段
        changeState(RoomState.ROOM_SETTLEMENT);
    }
    
    // 处理玩家不投降请求
    that.playerNotSurrender = function(player, data) {
        console.log("玩家选择不投降:" + player._accountID + ", 数据:" + JSON.stringify(data));
        
        // 验证是否是庄家队的玩家才能进行不投降操作
        if (!that.bankerTeam) {
            console.log("庄家队未定义，不能进行不投降操作:" + player._accountID);
            return;
        }
        
        // 检查玩家是否在庄家队中（遍历检查每个玩家对象的_accountID）
        var isInBankerTeam = false;
        for (var i = 0; i < that.bankerTeam.length; i++) {
            if (that.bankerTeam[i]._accountID === player._accountID) {
                isInBankerTeam = true;
                break;
            }
        }
        
        if (!isInBankerTeam) {
            console.log("非庄家队玩家不能进行不投降操作:" + player._accountID);
            return;
        }
        
        // 验证庄家队是否只有一人
        if (that.bankerTeam.length !== 1) {
            console.log("庄家队人数不为1，不能进行不投降操作:" + player._accountID);
            return;
        }
        
        console.log("玩家选择不投降，进入出牌阶段");
        
        // 进入出牌阶段
        changeState(RoomState.ROOM_PLAYING);
    }
    
    // 处理玩家反主请求
    that.playerFanZhu = function(player, data) {
        console.log("玩家请求反主:" + player._accountID + ", 数据:" + JSON.stringify(data));
        
        // 验证是否不是叫主玩家才能进行反主
        if (that.room_master && player._accountID === that.room_master._accountID) {
            console.log("叫主玩家不能进行反主操作:" + player._accountID);
            return;
        }
        
        // 检查玩家是否有对应的10牌
        var hasRequiredCards = false;
        if(player._cards && player._cards.length > 0 && data.shape) {
            var cardCount = 0;
            for(var i = 0; i < player._cards.length; i++) {
                if(player._cards[i].value === 11 && player._cards[i].shape === data.shape) { // 10牌的值是11
                    cardCount++;
                }
            }
            // 至少需要2张同花色10牌才能反主
            if(cardCount >= 2) {
                hasRequiredCards = true;
            }
        }
        
        if(!hasRequiredCards) {
            console.log("玩家没有足够的牌进行反主:" + player._accountID);
            return;
        }
        
        // 记录玩家的决定为"反主"
        that.playersFanZhuDecision[player._accountID] = 'fan';
        console.log("玩家" + player._accountID + "选择反主，花色:" + data.shape);
        
        // 设置反主标志
        that.hasFanZhu = true;
        that.fanZhuPlayerId = player._accountID;
        console.log("设置反主标志: hasFanZhu = true, fanZhuPlayerId = " + player._accountID);
        
        // 从反主资格玩家列表中移除该玩家
        var playerIndex = that.playersEligibleForFanZhu.indexOf(player._accountID);
        if (playerIndex > -1) {
            that.playersEligibleForFanZhu.splice(playerIndex, 1);
            console.log("从反主资格玩家列表中移除玩家:" + player._accountID);
        }
        
        console.log("当前玩家决定记录:", that.playersFanZhuDecision);
        console.log("当前有反主资格的玩家列表:", that.playersEligibleForFanZhu);

        // 保存原地主
        var oldMaster = that.room_master;
        
        // 设置该玩家为新的地主
        that.room_master = player;
        that.master_shape = data.shape;  // 更新主花色

        // 处理底牌：如果原地主已经合并了底牌，需要从原地主手牌中移除，并合并到新庄家手牌
        if (oldMaster && oldMaster._cards && oldMaster._cards.length > 21) {
            console.log("原地主手牌数量异常（可能已合并底牌）:", oldMaster._cards.length);
            console.log("从原地主手牌中移除底牌并合并到新庄家手牌");
            
            // 从原地主手牌中移除最后8张牌（假设是底牌）
            var bottomCardsFromOldMaster = oldMaster._cards.splice(oldMaster._cards.length - 8, 8);
            console.log("从原地主移除的底牌数量:", bottomCardsFromOldMaster.length);
            console.log("移除后原地主手牌数量:", oldMaster._cards.length);
            
            // 将底牌合并到新庄家手牌
            for (var i = 0; i < bottomCardsFromOldMaster.length; i++) {
                if (bottomCardsFromOldMaster[i]) {
                    player._cards.push(bottomCardsFromOldMaster[i]);
                }
            }
            console.log("新庄家合并底牌后手牌数量:", player._cards.length);
        } else if (that.three_cards && that.three_cards[4]) {
            // 如果原地主还没合并底牌，确保底牌数据正确
            console.log("原地主手牌数量正常:", oldMaster ? oldMaster._cards.length : "无");
            console.log("底牌数量:", that.three_cards[4].length);
        }

        // 广播反主消息给所有玩家
        var broadcastData = {
            accountid: player._accountID,
            state: data.state,
            shape: data.shape  // 包含反主花色
        };

        for(var i=0; i<that._player_list.length; i++){
            that._player_list[i].sendFanZhu(broadcastData);
        }

        // 反主后进入底牌处理阶段（底牌将在底牌处理阶段显示给庄家）
        console.log("反主完成，进入底牌处理阶段");
        changeState(RoomState.ROOM_BOTTOMCARD_PROCESS);
    }

    // 处理玩家不反请求
    that.playerBuFan = function(player, data) {
        console.log("玩家请求不反:" + player._accountID + ", 数据:" + JSON.stringify(data));

        // 验证是否不是叫主玩家
        if (that.room_master && player._accountID === that.room_master._accountID) {
            console.log("叫主玩家不能进行不反操作:" + player._accountID);
            return;
        }

        // 记录玩家的决定为"不反"
        that.playersFanZhuDecision[player._accountID] = 'bufan';
        console.log("玩家" + player._accountID + "选择不反");
        
        // 从反主资格玩家列表中移除该玩家
        var playerIndex = that.playersEligibleForFanZhu.indexOf(player._accountID);
        if (playerIndex > -1) {
            that.playersEligibleForFanZhu.splice(playerIndex, 1);
            console.log("从反主资格玩家列表中移除玩家:" + player._accountID);
        }
        
        console.log("当前玩家决定记录:", that.playersFanZhuDecision);
        console.log("当前有反主资格的玩家列表:", that.playersEligibleForFanZhu);

        // 广播不反消息给所有玩家
        var broadcastData = {
            accountid: player._accountID,
            state: data.state || 0  // 0表示不反
        };

        for(var i=0; i<that._player_list.length; i++){
            that._player_list[i].sendBuFan(broadcastData);
        }

        // 检查反主资格玩家列表是否为空
        if (that.playersEligibleForFanZhu.length === 0) {
            // 如果没有反主资格玩家，直接进入底牌处理阶段
            console.log("反主资格玩家列表为空，进入底牌处理阶段");
            if (that.room_master) {
                that.room_master.SendShowBottomCard(that.three_cards[4]);
                console.log("向庄家显示底牌");
            }
            changeState(RoomState.ROOM_BOTTOMCARD_PROCESS);
        } else {
            // 如果还有反主资格玩家，继续等待
            console.log("还有反主资格玩家，继续等待");
        }
    }

    // 记录有反主资格的玩家
    that.recordPlayersEligibleForFanZhu = function() {
        console.log("开始记录有反主资格的玩家");

        if (!that.master_shape) {
            console.log("没有主花色，无法记录反主资格玩家");
            return;
        }

        that.playersEligibleForFanZhu = [];
        that.playersFanZhuDecision = {};

        for(var i = 0; i < that._player_list.length; i++) {
            var player = that._player_list[i];

            // 跳过叫主玩家
            if (that.room_master && player._accountID === that.room_master._accountID) {
                console.log("玩家ID:" + player._accountID + " 是叫主玩家，跳过反主资格检查");
                continue;
            }

            // 统计该玩家每种花色的10牌数量
            var shapeCounts = {};
            if(player._cards && player._cards.length > 0) {
                for(var j = 0; j < player._cards.length; j++) {
                    if(player._cards[j].value === 11) { // 10牌的值是11
                        var shape = player._cards[j].shape;
                        if (!shapeCounts[shape]) {
                            shapeCounts[shape] = 0;
                        }
                        shapeCounts[shape]++;
                    }
                }
            }

            // 打印该玩家的10牌统计
            console.log("玩家ID:" + player._accountID + " 的10牌统计: " + JSON.stringify(shapeCounts));

            // 检查是否有任何花色有至少2张10牌（且不与当前主花色相同）
            // 重要：叫主玩家不应该有反主资格！
            // 叫主玩家即使有其他花色10牌，也不能反主
            var isMasterPlayer = (that.room_master && player._accountID === that.room_master._accountID);
            
            if (isMasterPlayer) {
                // 已经跳过，不会执行到这里
            } else {
                // 只有非叫主玩家才能被加入反主资格列表
                var hasEligibility = false;
                var masterShapeNum = parseInt(that.master_shape);
                for (var shape in shapeCounts) {
                    var shapeNum = parseInt(shape);
                    if (shapeCounts[shape] >= 2 && shapeNum !== masterShapeNum) {
                        console.log("玩家ID:" + player._accountID + " 有反主资格，花色:" + shape);
                        // 避免重复添加
                        if (that.playersEligibleForFanZhu.indexOf(player._accountID) === -1) {
                            that.playersEligibleForFanZhu.push(player._accountID);
                        } else {
                            console.log("玩家ID:" + player._accountID + " 已存在于反主资格列表中");
                        }
                        hasEligibility = true;
                        break;
                    }
                }
                if (!hasEligibility) {
                    console.log("玩家ID:" + player._accountID + " 没有反主资格");
                }
            }
        }

        console.log("共有 " + that.playersEligibleForFanZhu.length + " 名玩家有反主资格");
        console.log("反主资格玩家列表: " + JSON.stringify(that.playersEligibleForFanZhu));
    }

    // 检查所有有反主资格的玩家是否都做出了决定
    that.checkAllFanZhuDecisions = function() {
        //如果已有明包玩家，直接进入底牌处理阶段
        if(that.mingBaoDecisionMade ){
            console.log("已有明包玩家，直接进入底牌处理阶段");
            if(!that.bottomCardMerged && !that.bottomCardProcessSent){
                if (that.room_master) {
                    that.room_master.SendShowBottomCard(that.three_cards[4]);
                    console.log("向庄家显示底牌");
                }
                console.log("调用 changeState(RoomState.ROOM_BOTTOMCARD_PROCESS)");
                changeState(RoomState.ROOM_BOTTOMCARD_PROCESS);
                console.log("checkAllFanZhuDecisions 函数执行完毕");
        ````}
            return;
        }
        
        console.log("检查所有有反主资格玩家的决定");
        console.log("当前房间状态:", that.state);
        console.log("当前有反主资格的玩家列表:", that.playersEligibleForFanZhu);
        console.log("玩家决定记录:", that.playersFanZhuDecision);
        console.log("叫主玩家明包决定状态:", that.mingBaoDecisionMade);
        

        
        // 详细打印每个有资格玩家的决定状态
        for (var i = 0; i < that.playersEligibleForFanZhu.length; i++) {
            var accountId = that.playersEligibleForFanZhu[i];
            var decision = that.playersFanZhuDecision[accountId];
            console.log("玩家 " + accountId + " 决定状态: " + (decision ? decision : "未决定"));
        }

        var allDecided = true;

        // 检查每个有反主资格的玩家是否都做出了决定
        for (var i = 0; i < that.playersEligibleForFanZhu.length; i++) {
            var accountId = that.playersEligibleForFanZhu[i];
            if (!that.playersFanZhuDecision[accountId]) {
                console.log("玩家" + accountId + "还未做出决定");
                allDecided = false;
                break;
            }
        }
        
        // 检查叫主玩家是否已做出明包/暗包决定
        var mingBaoCondition = checkMingBaoCondition();
        if (mingBaoCondition && !that.mingBaoDecisionMade) {
            console.log("叫主玩家还未做出明包/暗包决定");
            allDecided = false;
        }

        // 检查是否所有有反主资格的玩家都已做出决定，或者没有反主资格的玩家，且叫主玩家已做出决定
        if (allDecided) {
            console.log("所有有反主资格的玩家都已做出决定，或没有反主资格玩家，且叫主玩家已做出决定");
            
            if (that.playersEligibleForFanZhu.length > 0) {
                // 有反主资格的玩家，检查是否有人反主
                console.log("检查反主资格玩家决定，玩家数量:", that.playersEligibleForFanZhu.length);
                
                // 检查是否有玩家选择了反主
                var hasFanZhu = false;
                for (var i = 0; i < that.playersEligibleForFanZhu.length; i++) {
                    var accountId = that.playersEligibleForFanZhu[i];
                    if (that.playersFanZhuDecision[accountId] === 'fan') {
                        hasFanZhu = true;
                        console.log("玩家" + accountId + "选择反主");
                        break;
                    }
                }
                
                if (!hasFanZhu) {
                    console.log("没有玩家选择反主，进入底牌处理阶段");
                    // 没有玩家选择反主，进入底牌处理阶段
                    if (that.room_master) {
                        that.room_master.SendShowBottomCard(that.three_cards[4]);
                        console.log("向庄家显示底牌");
                    }
                    console.log("即将调用 changeState(RoomState.ROOM_BOTTOMCARD_PROCESS)");
                    changeState(RoomState.ROOM_BOTTOMCARD_PROCESS);
                } else {
                    console.log("有玩家选择反主");
                    // 有玩家选择反主，也需要进入底牌处理阶段
                    // 避免游戏卡住的问题
                    console.log("等待反主完成或超时，准备进入底牌处理阶段");
                    
                    // 延迟进入底牌处理阶段，给客户端时间处理
                    setTimeout(() => {
                        console.log("延迟执行：进入底牌处理阶段");
                        if (that.room_master) {
                            that.room_master.SendShowBottomCard(that.three_cards[4]);
                            console.log("向庄家显示底牌");
                        }
                        console.log("延迟调用 changeState(RoomState.ROOM_BOTTOMCARD_PROCESS)");
                        changeState(RoomState.ROOM_BOTTOMCARD_PROCESS);
                    }, 500);
                }
            } else {
                // 没有反主资格的玩家，直接进入底牌处理阶段
                console.log("没有反主资格的玩家，直接进入底牌处理阶段");
                if (that.room_master) {
                    that.room_master.SendShowBottomCard(that.three_cards[4]);
                    console.log("向庄家显示底牌");
                }
                console.log("即将调用 changeState(RoomState.ROOM_BOTTOMCARD_PROCESS)");
                changeState(RoomState.ROOM_BOTTOMCARD_PROCESS);
            }
        } else {
            console.log("还有玩家未做出决定，等待中...");
        }
        
        console.log("checkAllFanZhuDecisions 函数执行完毕");
    }
    
    // 处理玩家埋牌请求
    that.playerMaiPai = function(player, data) {
        console.log("玩家请求埋牌:" + player._accountID + ", 数据:" + JSON.stringify(data));
        
        // 验证玩家是否是庄家
        if (player._accountID !== that.room_master._accountID) {
            console.log("非庄家玩家不能进行埋牌操作:" + player._accountID);
            return;
        }
        
        // 验证数据
        if (!data || !data.selectedCards || data.selectedCards.length !== 8) {
            console.log("埋牌数据错误，必须选择8张牌");
            return;
        }
        
        try {
            console.log("开始处理埋牌，庄家当前手牌数:" + player._cards.length);
            
            // 从庄家手牌中移除选中的8张牌作为新的底牌
            let newBottomCards = [];
            let remainingCards = [];
            
            // 创建一个索引映射以提高查找效率
            let cardIndexMap = {};
            for (let i = 0; i < player._cards.length; i++) {
                if (player._cards[i] && player._cards[i].index !== undefined) {
                    cardIndexMap[player._cards[i].index] = i;
                }
            }
            
            // 标记要移除的牌
            let cardsToRemove = new Set();
            for (let i = 0; i < data.selectedCards.length; i++) {
                let selectedCard = data.selectedCards[i];
                if (selectedCard && selectedCard.card_data && selectedCard.card_data.index !== undefined) {
                    let index = cardIndexMap[selectedCard.card_data.index];
                    if (index !== undefined && player._cards[index]) {
                        newBottomCards.push(player._cards[index]);
                        cardsToRemove.add(player._cards[index].index);
                    }
                }
            }
            
            // 验证是否成功找到所有选中的牌
            if (newBottomCards.length !== 8) {
                console.log("错误：未能找到所有选中的牌，期望8张，实际找到" + newBottomCards.length + "张");
                return;
            }
            
            // 构建剩余手牌
            for (let i = 0; i < player._cards.length; i++) {
                if (player._cards[i] && !cardsToRemove.has(player._cards[i].index)) {
                    remainingCards.push(player._cards[i]);
                }
            }
            
            // 验证剩余牌数
            if (remainingCards.length !== player._cards.length - 8) {
                console.log("错误：剩余牌数计算不正确，预期" + (player._cards.length - 8) + "张，实际" + remainingCards.length + "张");
            }
            
            // 更新庄家手牌
            player._cards = remainingCards;
            
            // 更新底牌 - 底牌是数组的第5个元素（索引为4）
            // 确保数组存在且长度足够
            if (!that.three_cards || that.three_cards.length < 5) {
                console.error("three_cards 数组未正确初始化，长度:" + (that.three_cards ? that.three_cards.length : "undefined"));
                // 初始化数组
                that.three_cards = that.three_cards || [];
                while (that.three_cards.length < 5) {
                    that.three_cards.push([]);
                }
            }
            that.three_cards[4] = newBottomCards;
            
            console.log("埋牌完成，庄家剩余牌数:" + player._cards.length + ", 新底牌:" + newBottomCards.length + "张");
            
            // 更新房间状态为庄家队分配阶段，这将计算庄家队和闲家队
            changeState(RoomState.ROOM_TEAM_ASSIGNMENT);
        } catch (error) {
            console.error("处理埋牌请求时发生错误:", error);
            // 出错时发送错误信息给客户端
            if (player) {
                // 可以考虑向玩家发送错误信息
            }
        }
    }
    
    // 处理玩家发牌完成通知
    that.playerCardDealt = function(player, data) {
        console.log("玩家发牌完成通知:" + player._accountID);
        
        // 记录该玩家发牌已完成
        that.playersDealtCards[player._accountID] = true;
        
        // 检查是否所有玩家都已完成发牌
        var allDealt = true;
        for (var i = 0; i < that._player_list.length; i++) {
            if (!that.playersDealtCards[that._player_list[i]._accountID]) {
                allDealt = false;
                break;
            }
        }
        
        // 如果所有玩家都已完成发牌，则设置全局标志
        if (allDealt) {
            that.allPlayersDealt = true;
            console.log("所有玩家发牌完成");
            
            // 重置叫主相关变量，开始叫主阶段
            that.playersCalledMaster = {};
            that.playersPassedRobbing = {};
            that.playersWithTenCards = [];
            that.allPlayersDecided = false;
            console.log("重置叫主相关变量，开始等待玩家叫主");
        }
    };
    
    // 检查是否有玩家满足明包或反主条件
    that.hasPlayersForMingBaoOrFanZhu = function() {
        // 遍历所有玩家，检查是否有人满足明包或反主条件
        for (var i = 0; i < that._player_list.length; i++) {
            var player = that._player_list[i];
            if (player._cards && player._cards.length > 0) {
                // 检查是否有两个同花色10牌
                var shapeCounts = {};
                for (var j = 0; j < player._cards.length; j++) {
                    var card = player._cards[j];
                    if (card && card.value === 11) { // 10牌的值是11
                        if (!shapeCounts[card.shape]) {
                            shapeCounts[card.shape] = 0;
                        }
                        shapeCounts[card.shape]++;
                        
                        // 如果某个花色已经有2张10牌，直接返回true
                        if (shapeCounts[card.shape] >= 2) {
                            // 如果是地主，可以明包；如果不是地主，可以反主
                            if ((player._accountID === (that.room_master ? that.room_master._accountID : null)) || 
                                (that.room_master && player._accountID !== that.room_master._accountID)) {
                                return true; // 有玩家满足条件
                            }
                        }
                    }
                }
            }
        }
        return false; // 没有玩家满足条件
    };
    
    // 处理玩家埋牌请求
    that.playerMaiPai = function(player, data) {
        console.log("处理玩家埋牌请求, 玩家ID:" + player._accountID);
        
        try {
            // 确保玩家是庄家且当前处于底牌处理阶段
            if (!that.room_master || player._accountID !== that.room_master._accountID) {
                console.log("错误：非庄家尝试埋牌");
                return;
            }
            
            if (that.state !== RoomState.ROOM_BOTTOMCARD_PROCESS) {
                console.log("错误：当前不在底牌处理阶段，当前状态:" + that.state);
                return;
            }
            
            // 获取玩家选择的8张牌
            var selectedCards = data.selectedCards;
            if (!selectedCards || selectedCards.length !== 8) {
                console.log("错误：埋牌数量不正确，期望8张，实际:" + (selectedCards ? selectedCards.length : 0));
                return;
            }
            
            console.log("收到玩家埋牌，选择的牌:" + JSON.stringify(selectedCards));
            
            // 从玩家手牌中移除选中的8张牌
            var cardsToRemove = [];
            for (var i = 0; i < selectedCards.length; i++) {
                var cardId = selectedCards[i].cardid;
                for (var j = 0; j < player._cards.length; j++) {
                    if (player._cards[j].index === cardId) {
                        cardsToRemove.push(j);
                        break;
                    }
                }
            }
            
            // 按降序排列要移除的索引，避免移除时影响后续索引
            cardsToRemove.sort(function(a, b) { return b - a; });
            
            for (var k = 0; k < cardsToRemove.length; k++) {
                player._cards.splice(cardsToRemove[k], 1);
            }
            
            // 将选中的8张牌作为新的底牌
            var newBottomCards = [];
            for (var i = 0; i < selectedCards.length; i++) {
                newBottomCards.push(selectedCards[i].card_data);
            }
            
            // 重新构建底牌数组，确保结构正确
            if (!that.three_cards || that.three_cards.length < 5) {
                that.three_cards = [[], [], [], [], []];
            }
            
            // 将选中的牌作为新底牌
            that.three_cards[4] = newBottomCards;
            
            console.log("埋牌处理完成，庄家剩余牌数:" + player._cards.length + ", 新底牌:" + that.three_cards[4].length + "张");
            
            // 通知所有玩家底牌已更新，包括底牌信息
            for (var i = 0; i < that._player_list.length; i++) {
                var p = that._player_list[i];
                
                // 发送底牌更新通知，庄家看到底牌，其他玩家看到底牌背面
                p._socket.emit('notify', {
                    type: 'bottom_card_update_notify',
                    result: 0,
                    data: {
                        // 庄家看到底牌，其他人看到底牌信息（可选择性隐藏）
                        master_accountid: that.room_master._accountID,
                        bottom_cards: p._accountID === that.room_master._accountID ? newBottomCards : null, // 庄家看到底牌，其他人不显示具体牌面
                        bottom_cards_count: newBottomCards.length,
                        remaining_hand_cards: player._cards.length
                    },
                    callBackIndex: 0
                });
            }

            // 通知所有玩家房间状态变更
            for(var i = 0; i < that._player_list.length; i++) {
                that._player_list[i].sendRoomState(RoomState.ROOM_TEAM_ASSIGNMENT);
            }
            console.log("已通知所有玩家进入庄家队分配阶段");

            // 设置房间状态为庄家队分配阶段
            changeState(RoomState.ROOM_TEAM_ASSIGNMENT);

        } catch (error) {
            console.error("处理玩家埋牌请求时发生错误:", error);
        }
    };

    /**
     * 计算庄家队和闲家队
     * 主花色10有两张：在一个玩家手中就是庄家队（1人），其他三位玩家为闲家队
     * 如果在两位玩家手中，那么这两个玩家就是庄家队（2人），其他两位玩家为闲家队
     */
    const calculateTeams = function() {
        console.log("=== 开始计算庄家队和闲家队 ===");
        console.log("主花色:", that.master_shape);

        // 统计每个玩家手中的主花色10牌数量
        var playersWithTenCards = [];
        var tenCardShape = that.master_shape; // 主花色

        for (var i = 0; i < that._player_list.length; i++) {
            var player = that._player_list[i];
            var tenCount = 0;

            if (player._cards && player._cards.length > 0) {
                console.log("检查玩家" + player._accountID + "的手牌:", JSON.stringify(player._cards.map(card => ({value: card.value, shape: card.shape}))));
                for (var j = 0; j < player._cards.length; j++) {
                    // 10牌的value是11（数字）
                    if (player._cards[j].value === 11 && player._cards[j].shape === tenCardShape) {
                        tenCount++;
                        console.log("发现主花色10牌:", player._cards[j]);
                    }
                }
            }

            if (tenCount > 0) {
                playersWithTenCards.push({
                    player: player,
                    tenCount: tenCount,
                    accountId: player._accountID
                });
                console.log("玩家" + player._accountID + "持有主花色10牌: " + tenCount + "张");
            }
        }

        // 计算庄家队和闲家队
        var bankerTeam = []; // 庄家队
        var idleTeam = []; // 闲家队

        if (playersWithTenCards.length === 1) {
            // 一个玩家持有两张10牌，该玩家为庄家队（1人）
            bankerTeam.push(playersWithTenCards[0].player);
            console.log("庄家队：玩家" + playersWithTenCards[0].accountId + "（1人）");

            // 其他三人为闲家队
            for (var i = 0; i < that._player_list.length; i++) {
                if (that._player_list[i]._accountID !== playersWithTenCards[0].accountId) {
                    idleTeam.push(that._player_list[i]);
                }
            }
            console.log("闲家队：3人");
        } else if (playersWithTenCards.length === 2) {
            // 两个玩家各持有一张10牌，这两个玩家为庄家队（2人）
            bankerTeam.push(playersWithTenCards[0].player);
            bankerTeam.push(playersWithTenCards[1].player);
            console.log("庄家队：玩家" + playersWithTenCards[0].accountId + "和玩家" + playersWithTenCards[1].accountId + "（2人）");

            // 其他两人为闲家队
            for (var i = 0; i < that._player_list.length; i++) {
                if (that._player_list[i]._accountID !== playersWithTenCards[0].accountId &&
                    that._player_list[i]._accountID !== playersWithTenCards[1].accountId) {
                    idleTeam.push(that._player_list[i]);
                }
            }
            console.log("闲家队：2人");
        } else {
            console.log("错误：主花色10牌分布异常，无法确定庄家队和闲家队");
        }

        return {
            bankerTeam: bankerTeam,
            idleTeam: idleTeam,
            bankerTeamCount: bankerTeam.length,
            idleTeamCount: idleTeam.length
        };
    };

    /**
     * 计算最后一轮的底牌牌分并计入赢家抓牌分
     * @param {Object} lastRoundWinner - 最后一轮赢家
     * @param {Array} lastRoundCards - 最后一轮出的牌
     * @returns {number} 应该计入赢家抓牌分的底牌分
     */
    const calculateBottomCardScore = function(lastRoundWinner, lastRoundCards) {
        console.log("=== 计算底牌牌分 ===");
        console.log("最后一轮赢家:", lastRoundWinner._accountID);
        console.log("最后一轮出牌:", JSON.stringify(lastRoundCards));

        // 计算底牌中的牌分
        var bottomCardScore = 0;
        if (that.three_cards && that.three_cards[4]) {
            var bottomCards = that.three_cards[4];
            console.log("底牌详情:", JSON.stringify(bottomCards.map(card => ({value: card.value, shape: card.shape, king: card.king}))));
            for (var i = 0; i < bottomCards.length; i++) {
                var card = bottomCards[i];
                if (card.value === 1) { // 5分牌（牌面5，value=1）
                    console.log("发现5分牌:", card);
                    bottomCardScore += 5;
                } else if (card.value === 11) { // 10分牌（牌面10，value=11）
                    console.log("发现10分牌(10):", card);
                    bottomCardScore += 10;
                } else if (card.value === 8) { // 10分牌（牌面K，value=8）
                    console.log("发现10分牌(K):", card);
                    bottomCardScore += 10;
                }
            }
        }
        console.log("底牌牌分:", bottomCardScore);

        // 分析最后一轮牌型
        // 处理lastRoundCards的数据结构，提取card_data
        var processedLastRoundCards = [];
        if (lastRoundCards && Array.isArray(lastRoundCards)) {
            for (var i = 0; i < lastRoundCards.length; i++) {
                if (lastRoundCards[i].card_data) {
                    processedLastRoundCards.push(lastRoundCards[i].card_data);
                } else {
                    processedLastRoundCards.push(lastRoundCards[i]);
                }
            }
            console.log("处理后的最后一轮出牌:", JSON.stringify(processedLastRoundCards));
        }
        var lastRoundType = busizCardRules.getCardType(processedLastRoundCards, that.master_shape);
        console.log("最后一轮牌型:", lastRoundType.type, ", 是否主牌:", lastRoundType.isMain);

        // 根据规则计算应该计入的分数
        var addScore = 0;

        if (lastRoundType.isMain) {
            // 主牌牌型
            if (lastRoundType.type === busizCardRules.CardType.SINGLE) {
                // 主牌单张
                addScore = bottomCardScore;
                console.log("主牌单张，底牌牌分直接计入: " + addScore);
            } else if (lastRoundType.type === busizCardRules.CardType.PAIR) {
                // 主牌对子
                addScore = bottomCardScore * 2;
                console.log("主牌对子，底牌牌分*2计入: " + addScore);
            } else if (lastRoundType.type === busizCardRules.CardType.DOUBLE_PAIR) {
                // 主牌连对
                var pairCount = processedLastRoundCards.length / 2; // 对数
                addScore = bottomCardScore * (pairCount * 2);
                console.log("主牌连对（" + pairCount + "对），底牌牌分*（对数*2）计入: " + addScore);
            } else {
                // 其他主牌牌型，按单张处理
                addScore = bottomCardScore;
                console.log("其他主牌牌型，按单张处理: " + addScore);
            }
        } else {
            // 副牌牌型，加0分
            addScore = 0;
            console.log("副牌牌型，加0分");
        }

        return addScore;
    };

    /**
     * 计算金币结算（18种情况）
     * @param {Object} teams - 庄家队和闲家队信息
     * @param {number} idleTeamTotalScore - 闲家队总抓牌分
     * @param {boolean} hasMingBaoOrFanZhu - 是否有明包或反主标签
     * @returns {Object} 每个玩家的金币变动 {accountId: goldChange}
     */
    const calculateGoldSettlement = function(teams, idleTeamTotalScore, hasMingBaoOrFanZhu) {
        console.log("=== 计算金币结算 ===");
        console.log("庄家队人数:", teams.bankerTeamCount);
        console.log("闲家队总抓牌分:", idleTeamTotalScore);
        console.log("是否有明包或反主标签:", hasMingBaoOrFanZhu);

        var goldChanges = {}; // 存储每个玩家的金币变动

        // 初始化所有玩家的金币变动为0
        for (var i = 0; i < that._player_list.length; i++) {
            goldChanges[that._player_list[i]._accountID] = 0;
        }

        // 计算规则
        if (teams.bankerTeamCount === 2) {
            // 庄家队是2人
            if (idleTeamTotalScore === 0) {
                // 3.1 闲家队0分，庄家队赢
                console.log("情况3.1：闲家队0分，庄家队赢，庄家队+300，闲家队-300");
                for (var i = 0; i < teams.bankerTeam.length; i++) {
                    goldChanges[teams.bankerTeam[i]._accountID] = 300;
                }
                for (var i = 0; i < teams.idleTeam.length; i++) {
                    goldChanges[teams.idleTeam[i]._accountID] = -300;
                }
            } else if (idleTeamTotalScore < 30) {
                // 3.4 闲家队<30分，庄家队赢
                console.log("情况3.4：闲家队<30分，庄家队赢，庄家队+200，闲家队-200");
                for (var i = 0; i < teams.bankerTeam.length; i++) {
                    goldChanges[teams.bankerTeam[i]._accountID] = 200;
                }
                for (var i = 0; i < teams.idleTeam.length; i++) {
                    goldChanges[teams.idleTeam[i]._accountID] = -200;
                }
            } else if (idleTeamTotalScore >= 30 && idleTeamTotalScore < 80) {
                // 3.7 闲家队>=30且<80分，庄家队赢
                console.log("情况3.7：闲家队>=30且<80分，庄家队赢，庄家队+100，闲家队-100");
                for (var i = 0; i < teams.bankerTeam.length; i++) {
                    goldChanges[teams.bankerTeam[i]._accountID] = 100;
                }
                for (var i = 0; i < teams.idleTeam.length; i++) {
                    goldChanges[teams.idleTeam[i]._accountID] = -100;
                }
            } else if (idleTeamTotalScore >= 80 && idleTeamTotalScore < 130) {
                // 3.10 闲家队>=80且<130分，闲家队赢
                console.log("情况3.10：闲家队>=80且<130分，闲家队赢，闲家队+100，庄家队-100");
                for (var i = 0; i < teams.bankerTeam.length; i++) {
                    goldChanges[teams.bankerTeam[i]._accountID] = -100;
                }
                for (var i = 0; i < teams.idleTeam.length; i++) {
                    goldChanges[teams.idleTeam[i]._accountID] = 100;
                }
            } else if (idleTeamTotalScore >= 130 && idleTeamTotalScore < 160) {
                // 3.13 闲家队>=130且<160分，闲家队赢
                console.log("情况3.13：闲家队>=130且<160分，闲家队赢，闲家队+200，庄家队-200");
                for (var i = 0; i < teams.bankerTeam.length; i++) {
                    goldChanges[teams.bankerTeam[i]._accountID] = -200;
                }
                for (var i = 0; i < teams.idleTeam.length; i++) {
                    goldChanges[teams.idleTeam[i]._accountID] = 200;
                }
            } else if (idleTeamTotalScore >= 160) {
                // 3.16 闲家队>=160分，闲家队赢
                console.log("情况3.16：闲家队>=160分，闲家队赢，闲家队+300，庄家队-300");
                for (var i = 0; i < teams.bankerTeam.length; i++) {
                    goldChanges[teams.bankerTeam[i]._accountID] = -300;
                }
                for (var i = 0; i < teams.idleTeam.length; i++) {
                    goldChanges[teams.idleTeam[i]._accountID] = 300;
                }
            }
        } else if (teams.bankerTeamCount === 1) {
            // 庄家队是1人
            if (hasMingBaoOrFanZhu) {
                // 有明包或反主标签
                if (idleTeamTotalScore === 0) {
                    // 3.2 闲家队0分，庄家队赢
                    console.log("情况3.2：闲家队0分，庄家队赢（有明包/反主），庄家队+1800，闲家队各-600");
                    goldChanges[teams.bankerTeam[0]._accountID] = 1800;
                    for (var i = 0; i < teams.idleTeam.length; i++) {
                        goldChanges[teams.idleTeam[i]._accountID] = -600;
                    }
                } else if (idleTeamTotalScore < 30) {
                    // 3.5 闲家队<30分，庄家队赢
                    console.log("情况3.5：闲家队<30分，庄家队赢（有明包/反主），庄家队+1200，闲家队各-400");
                    goldChanges[teams.bankerTeam[0]._accountID] = 1200;
                    for (var i = 0; i < teams.idleTeam.length; i++) {
                        goldChanges[teams.idleTeam[i]._accountID] = -400;
                    }
                } else if (idleTeamTotalScore >= 30 && idleTeamTotalScore < 80) {
                    // 3.8 闲家队>=30且<80分，庄家队赢
                    console.log("情况3.8：闲家队>=30且<80分，庄家队赢（有明包/反主），庄家队+600，闲家队各-200");
                    goldChanges[teams.bankerTeam[0]._accountID] = 600;
                    for (var i = 0; i < teams.idleTeam.length; i++) {
                        goldChanges[teams.idleTeam[i]._accountID] = -200;
                    }
                } else if (idleTeamTotalScore >= 80 && idleTeamTotalScore < 130) {
                    // 3.11 闲家队>=80且<130分，闲家队赢
                    console.log("情况3.11：闲家队>=80且<130分，闲家队赢（有明包/反主），闲家队各+100，庄家队-300");
                    goldChanges[teams.bankerTeam[0]._accountID] = -300;
                    for (var i = 0; i < teams.idleTeam.length; i++) {
                        goldChanges[teams.idleTeam[i]._accountID] = 100;
                    }
                } else if (idleTeamTotalScore >= 130 && idleTeamTotalScore < 160) {
                    // 3.14 闲家队>=130且<160分，闲家队赢
                    console.log("情况3.14：闲家队>=130且<160分，闲家队赢（有明包/反主），闲家队各+200，庄家队-600");
                    goldChanges[teams.bankerTeam[0]._accountID] = -600;
                    for (var i = 0; i < teams.idleTeam.length; i++) {
                        goldChanges[teams.idleTeam[i]._accountID] = 200;
                    }
                } else if (idleTeamTotalScore >= 160) {
                    // 3.17 闲家队>=160分，闲家队赢
                    console.log("情况3.17：闲家队>=160分，闲家队赢（有明包/反主），闲家队各+300，庄家队-900");
                    goldChanges[teams.bankerTeam[0]._accountID] = -900;
                    for (var i = 0; i < teams.idleTeam.length; i++) {
                        goldChanges[teams.idleTeam[i]._accountID] = 300;
                    }
                }
            } else {
                // 没有明包或反主标签
                if (idleTeamTotalScore === 0) {
                    // 3.3 闲家队0分，庄家队赢
                    console.log("情况3.3：闲家队0分，庄家队赢（无明包/反主），庄家队+900，闲家队各-300");
                    goldChanges[teams.bankerTeam[0]._accountID] = 900;
                    for (var i = 0; i < teams.idleTeam.length; i++) {
                        goldChanges[teams.idleTeam[i]._accountID] = -300;
                    }
                } else if (idleTeamTotalScore < 30) {
                    // 3.6 闲家队<30分，庄家队赢
                    console.log("情况3.6：闲家队<30分，庄家队赢（无明包/反主），庄家队+600，闲家队各-200");
                    goldChanges[teams.bankerTeam[0]._accountID] = 600;
                    for (var i = 0; i < teams.idleTeam.length; i++) {
                        goldChanges[teams.idleTeam[i]._accountID] = -200;
                    }
                } else if (idleTeamTotalScore >= 30 && idleTeamTotalScore < 80) {
                    // 3.9 闲家队>=30且<80分，庄家队赢
                    console.log("情况3.9：闲家队>=30且<80分，庄家队赢（无明包/反主），庄家队+300，闲家队各-100");
                    goldChanges[teams.bankerTeam[0]._accountID] = 300;
                    for (var i = 0; i < teams.idleTeam.length; i++) {
                        goldChanges[teams.idleTeam[i]._accountID] = -100;
                    }
                } else if (idleTeamTotalScore >= 80 && idleTeamTotalScore < 130) {
                    // 3.12 闲家队>=80且<130分，闲家队赢
                    console.log("情况3.12：闲家队>=80且<130分，闲家队赢（无明包/反主），闲家队各+100，庄家队-300");
                    goldChanges[teams.bankerTeam[0]._accountID] = -300;
                    for (var i = 0; i < teams.idleTeam.length; i++) {
                        goldChanges[teams.idleTeam[i]._accountID] = 100;
                    }
                } else if (idleTeamTotalScore >= 130 && idleTeamTotalScore < 160) {
                    // 3.15 闲家队>=130且<160分，闲家队赢
                    console.log("情况3.15：闲家队>=130且<160分，闲家队赢（无明包/反主），闲家队各+200，庄家队-600");
                    goldChanges[teams.bankerTeam[0]._accountID] = -600;
                    for (var i = 0; i < teams.idleTeam.length; i++) {
                        goldChanges[teams.idleTeam[i]._accountID] = 200;
                    }
                } else if (idleTeamTotalScore >= 160) {
                    // 3.18 闲家队>=160分，闲家队赢
                    console.log("情况3.18：闲家队>=160分，闲家队赢（无明包/反主），闲家队各+300，庄家队-900");
                    goldChanges[teams.bankerTeam[0]._accountID] = -900;
                    for (var i = 0; i < teams.idleTeam.length; i++) {
                        goldChanges[teams.idleTeam[i]._accountID] = 300;
                    }
                }
            }
        }

        console.log("金币结算结果:", JSON.stringify(goldChanges));
        return goldChanges;
    };

    /**
     * 处理游戏结算
     * 当所有玩家手牌为空时调用
     */
    const handleGameSettlement = function() {
        console.log("=== 开始游戏结算 ===");

        // 1. 改变房间状态为结算阶段
        changeState(RoomState.ROOM_SETTLEMENT);

        // 2. 获取最后一轮出牌信息
        var lastRoundData = that.currentRoundCards;
        var lastRoundWinnerId = null;
        var lastRoundCards = null;
        var lastRoundWinner = null;
        
        // 防御性检查：确保 lastRoundData 不为空
        if (lastRoundData && lastRoundData.length > 0) {
            // 找出最后一轮的赢家（比较所有玩家的牌，找出最大的）
            var winnerData = lastRoundData[0];
            for (var i = 1; i < lastRoundData.length; i++) {
                var currentData = lastRoundData[i];
                var result = compareCardGroups(currentData.cards, winnerData.cards);
                if (result === 1) {
                    winnerData = currentData;
                }
            }
            lastRoundWinnerId = winnerData.playerId;
            lastRoundCards = winnerData.cards;
            console.log("最后一轮赢家ID:", lastRoundWinnerId);
            console.log("最后一轮赢家出牌:", JSON.stringify(lastRoundCards));

            // 找出最后一轮的赢家玩家对象
            for (var i = 0; i < that._player_list.length; i++) {
                if (that._player_list[i]._accountID === lastRoundWinnerId) {
                    lastRoundWinner = that._player_list[i];
                    break;
                }
            }
        } else {
            // 如果没有最后一轮数据（例如游戏异常结束），默认选择第一个玩家作为赢家
            console.warn("最后一轮数据为空，默认选择第一个玩家作为赢家");
            if (that._player_list.length > 0) {
                lastRoundWinner = that._player_list[0];
                lastRoundWinnerId = lastRoundWinner._accountID;
            }
        }

        // 3. 计算底牌牌分并计入赢家抓牌分
        var bottomCardScore = calculateBottomCardScore(lastRoundWinner, lastRoundCards);
        console.log("底牌牌分:", bottomCardScore);

        // 将底牌牌分实际计入到赢家的抓牌分中
        if (bottomCardScore > 0 && lastRoundWinner) {
            lastRoundWinner._captureScore += bottomCardScore;
            console.log("底牌牌分已计入赢家" + lastRoundWinner._accountID + "抓牌分，当前抓牌分:", lastRoundWinner._captureScore);
        }

        // 4. 获取庄家队和闲家队（使用之前计算好的数据）
        var teams = {
            bankerTeam: that.bankerTeam || [],
            idleTeam: that.idleTeam || [],
            bankerTeamCount: (that.bankerTeam ? that.bankerTeam.length : 0),
            idleTeamCount: (that.idleTeam ? that.idleTeam.length : 0)
        };
        console.log("使用已计算的队伍数据 - 庄家队人数:", teams.bankerTeamCount, "闲家队人数:", teams.idleTeamCount);

        // 如果没有队伍数据，尝试重新计算
        if (teams.bankerTeam.length === 0 && teams.idleTeam.length === 0) {
            console.log("没有队伍数据，尝试重新计算...");
            teams = calculateTeams();
        }

        // 5. 计算闲家队总抓牌分
        var idleTeamTotalScore = 0;
        for (var i = 0; i < teams.idleTeam.length; i++) {
            idleTeamTotalScore += teams.idleTeam[i]._captureScore; // _captureScore存储的是抓牌分
        }
        console.log("闲家队总抓牌分:", idleTeamTotalScore);

        // 6. 检查是否有明包或反主标签
        // 根据已有的标记判断
        var hasMingBaoOrFanZhu = (that.hasMingBao || that.hasFanZhu);
        console.log("是否有明包或反主标签:", hasMingBaoOrFanZhu,
                  "明包:", that.hasMingBao, "反主:", that.hasFanZhu);

        // 7. 计算金币结算
        var goldChanges = calculateGoldSettlement(teams, idleTeamTotalScore, hasMingBaoOrFanZhu);

        // 8. 应用金币变动到玩家的临时积分
        for (var accountId in goldChanges) {
            for (var i = 0; i < that._player_list.length; i++) {
                if (that._player_list[i]._accountID === accountId) {
                    that._player_list[i]._gold += goldChanges[accountId];
                    console.log("玩家" + accountId + "金币变动: " + goldChanges[accountId] + "，当前金币: " + that._player_list[i]._gold);
                    break;
                }
            }
        }

        // 9. 准备结算数据并发送给客户端
        var settlementData = {
            bankerTeam: teams.bankerTeam.map(p => p._accountID),
            idleTeam: teams.idleTeam.map(p => p._accountID),
            idleTeamTotalScore: idleTeamTotalScore,
            bottomCardScore: bottomCardScore,
            lastRoundWinnerId: lastRoundWinnerId,
            bottomCards: that.three_cards[4] || [], // 底牌
            goldChanges: goldChanges,
            hasMingBaoOrFanZhu: hasMingBaoOrFanZhu
        };

        // 10. 发送结算事件给所有玩家
        for (var i = 0; i < that._player_list.length; i++) {
            that._player_list[i].sendGameSettlement(settlementData);
        }

        console.log("=== 游戏结算完成 ===");
    };

    /**
     * 玩家点击下一局
     */
    that.playerNextGame = function(player, callback) {
        console.log("玩家" + player._accountID + "点击下一局");
        console.log("当前房间玩家列表:");
        for (var i = 0; i < that._player_list.length; i++) {
            console.log("  玩家" + i + ": accountID=" + that._player_list[i]._accountID);
        }
        console.log("当前已点击下一局的玩家:", Object.keys(that.playersReadyForNextGame));

        // 记录玩家已点击下一局
        that.playersReadyForNextGame[player._accountID] = true;

        // 广播玩家准备状态给所有玩家
        var broadcastData = player._accountID;
        for (var i = 0; i < that._player_list.length; i++) {
            console.log("广播玩家准备状态给玩家" + that._player_list[i]._accountID);
            that._player_list[i].sendplayerReady(broadcastData);
        }

        // 检查是否所有玩家都已点击下一局（只检查在线玩家）
        var allPlayersReady = true;
        var readyCount = 0;
        var onlinePlayersCount = 0;
        // 首先打印所有玩家状态，用于调试
        console.log("playerNextGame - 房间玩家总数：" + that._player_list.length);
        for (var i = 0; i < that._player_list.length; i++) {
            var p = that._player_list[i];
            var onlineStatus = p._isOnline;
            if (onlineStatus === undefined) onlineStatus = "undefined";
            console.log("  玩家" + i + ": accountID=" + p._accountID + " 在线状态: " + onlineStatus);
        }
        
        for (var i = 0; i < that._player_list.length; i++) {
            var player = that._player_list[i];
            var accountID = player._accountID;
            
            // 规范化在线状态：如果未定义，设为true（兼容旧玩家对象）
            if (player._isOnline === undefined) {
                player._isOnline = true;
                console.log("玩家" + accountID + "的_isOnline属性未定义，已设置为true");
            }
            
            console.log("玩家" + accountID + " 在线状态: " + player._isOnline);
            
            // 只检查在线玩家（严格检查false）
            if (player._isOnline === false) {
                console.log("玩家" + accountID + "处于离线状态，跳过检查");
                continue;
            }
            onlinePlayersCount++;
            if (that.playersReadyForNextGame[accountID]) {
                readyCount++;
                console.log("玩家" + accountID + "已点击下一局");
            } else {
                allPlayersReady = false;
                console.log("玩家" + accountID + "未点击下一局");
            }
        }
        console.log("在线玩家数量: " + onlinePlayersCount + "，已点击下一局数量: " + readyCount);

        if (allPlayersReady) {
            console.log("所有玩家都已点击下一局，开始初始化下一局，readyCount=" + readyCount + ", 在线玩家数=" + onlinePlayersCount);
            that.allPlayersReadyForNextGame = true;

            // 初始化下一局
            initializeNextGame(callback);
        } else {
            console.log("等待其他玩家点击下一局，已点击: " + readyCount + "/" + onlinePlayersCount);
            if (callback) {
                callback(0, {message: "等待其他玩家"});
            }
        }
    };

    /**
     * 初始化下一局
     * 只保留金币，重置其他参数
     */
    const initializeNextGame = function(callback) {
        console.log("=== 开始初始化下一局 ===");
        console.log("当前房间玩家数量:", that._player_list.length);
        for (var i = 0; i < that._player_list.length; i++) {
            console.log("玩家" + i + ": accountID=" + that._player_list[i]._accountID);
        }

        try {
            if (that.currentGame >= that.totalGames) {
                console.log("=== 已达到总局数 " + that.totalGames + "，房间结束 ===");
                changeState(RoomState.ROOM_END);
                if (callback) {
                    callback(0, {message: "房间已结束"});
                }
                return;
            }

            // 1. 保存玩家当前金币
            var playerGoldList = {};
            for (var i = 0; i < that._player_list.length; i++) {
                playerGoldList[that._player_list[i]._accountID] = that._player_list[i]._gold;
                console.log("保存玩家" + that._player_list[i]._accountID + "金币: " + that._player_list[i]._gold);
            }

            // 2. 重置房间变量
            that.room_master = undefined;
            that.master_shape = undefined;
            that.three_cards = [];
            that.playing_cards = [];
            that.cur_push_card_list = [];
            that.last_push_card_list = [];
            that.last_push_card_accountid = 0;

            // 3. 重新初始化发牌器（重新洗牌）
            that.carder = Carder();
            console.log("重新初始化发牌器，完成洗牌");
            
            // 4. 重置底牌相关变量
            that.bottomCardMerged = false;
            that.bottomCardProcessSent = false;
            console.log("重置底牌合并相关标志，确保每局游戏只合并一次底牌");

            // 4. 重置叫主相关变量
            that.lostplayer = undefined;
            that.robplayer = [];
            that.playersCalledMaster = {};
            that.playersPassedRobbing = {};
            that.playersWithTenCards = [];
            that.allPlayersDecided = false;

            // 5. 重置明包反主相关变量
            that.playersEligibleForFanZhu = [];
            that.playersFanZhuDecision = {};
            that.hasMingBao = false;
            that.hasFanZhu = false;
            that.mingBaoPlayerId = null;
            that.fanZhuPlayerId = null;

            // 6. 重置发牌相关变量
            that.playersDealtCards = {};
            that.allPlayersDealt = false;

            // 7. 重置轮次管理变量
            that.currentRoundCards = [];
            that.currentRoundFirstPlayerId = null;
            that.currentRoundFirstCards = [];
            that.currentRoundScore = 0;

            // 8. 重置下一局管理变量
            that.playersReadyForNextGame = {};
            that.allPlayersReadyForNextGame = false;
            
            // 9. 重置底牌合并相关标志
            that.bottomCardMerged = false;
            that.bottomCardProcessSent = false;
            console.log("重置底牌合并相关标志，确保每局游戏只合并一次底牌");

            // 9. 重置玩家状态（保留金币，重置其他）
            for (var i = 0; i < that._player_list.length; i++) {
                var player = that._player_list[i];

                // 重置玩家变量（保留金币）
                player._isready = false;
                player._cards = [];
                player._captureScore = 0; // 重置抓牌分

                // 恢复金币
                player._gold = playerGoldList[player._accountID];

                console.log("重置玩家" + player._accountID + "，金币: " + player._gold + "，抓牌分: 0");
            }

            // 10. 增加当前局数
            that.currentGame += 1;
            console.log("当前局数: " + that.currentGame + "/" + that.totalGames);

            // 11. 通知所有玩家游戏开始
            for (var i = 0; i < that._player_list.length; i++) {
                that._player_list[i].gameStart({currentGame: that.currentGame, totalGames: that.totalGames});
                that._player_list[i].sendRoomState(RoomState.ROOM_GAMESTART);
            }

            // 12. 改变房间状态为游戏开始（这会触发发牌逻辑）
            console.log("初始化下一局完成，改变房间状态为ROOM_GAMESTART，触发发牌")
            changeState(RoomState.ROOM_GAMESTART);

            console.log("=== 下一局初始化完成 ===");
            console.log("下一局将按照完整流程进行：发牌 → 叫主 → 明包/反主 → 决定庄家 → 出牌（庄家先出）");

            if (callback) {
                callback(0, {message: "下一局初始化完成"});
            }
        } catch (error) {
            console.error("初始化下一局时发生错误:", error);
            if (callback) {
                callback(-1, {message: "初始化下一局失败"});
            }
        }
    };
    
    return that
}