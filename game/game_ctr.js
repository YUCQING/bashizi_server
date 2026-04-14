const Player = require("./player.js")
const Room = require("./room.js")
const config = require("../defines.js")
const RoomState = require("../defines.js").RoomState

var _player_list = []
var _room_info = []

exports.create_player = function(playInfo,socket,callindex){
    // 检查是否有相同accountID的玩家已经存在
    var existingPlayer = null;
    var existingRoom = null;
    for(var i=0; i<_player_list.length; i++){
        if(_player_list[i]._accountID === playInfo.account_id){
            existingPlayer = _player_list[i];
            // 找到玩家所在的房间
            for(var j=0; j<_room_info.length; j++){
                var room = _room_info[j];
                for(var k=0; k<room._player_list.length; k++){
                    if(room._player_list[k]._accountID === playInfo.account_id){
                        existingRoom = room;
                        break;
                    }
                }
                if(existingRoom){
                    break;
                }
            }
            break;
        }
    }
    var player = Player(playInfo,socket,callindex,this)
    if(existingPlayer){
        // 替换原来的玩家对象
        var index = _player_list.indexOf(existingPlayer);
        if(index !== -1){
            _player_list[index] = player;
        }
        // 将新的玩家对象添加回原来的房间
        if(existingRoom){
            var roomIndex = existingRoom._player_list.indexOf(existingPlayer);
            if(roomIndex !== -1){
                existingRoom._player_list[roomIndex] = player;
            }
            // 通知玩家房间信息
            player.sendRoomInfo({
                roomid: existingRoom.room_id,
                bottom: existingRoom.bottom,
                rate: existingRoom.rate,
                totalGames: existingRoom.totalGames,
                currentGame: existingRoom.currentGame
            });
            // 如果房间已经开始游戏，通知玩家游戏状态
            if(existingRoom.state !== RoomState.ROOM_WAITREADY){
                player.gameStart({
                    currentGame: existingRoom.currentGame,
                    totalGames: existingRoom.totalGames
                });
                player.sendRoomState(existingRoom.state);
                // 如果房间已经发牌，重新发送牌给玩家
                if(existingRoom.three_cards){
                    var seatIndex = existingRoom._player_list.indexOf(player);
                    if(seatIndex !== -1 && existingRoom.three_cards[seatIndex]){
                        player.sendCard(existingRoom.three_cards[seatIndex]);
                    }
                }
            }
        }
    } else {
        _player_list.push(player)
    }
}

exports.create_room = function(roomInfo,own_player,callback){
    var room = Room(roomInfo,own_player)
    _room_info.push(room)
    //检测用户是否能创建房间
    //检查金币数量是否足够
    var needglobal = config.createRoomConfig[roomInfo.rate].needCostGold
    console.log("create room needglobal:"+needglobal)
    
    if(own_player._gold < needglobal){
        callback(-1,{}) 
        return 
    }
    room.jion_player(own_player)
    if (callback){
        callback(0,{
                    room:room,
                    data:{
                           roomid:room.room_id,
                           bottom:room.bottom,
                           rate:roomInfo.rate,
                           totalGames:room.totalGames,  // 添加总局数
                           currentGame:room.currentGame  // 添加当前局数
                         }
                   })
        }

}
//notify{"type":"joinroom_resp","result":null,"data":{"data":{"roomid":"714950","gold":100}},"callBackIndex":3}
exports.jion_room = function(data,player,callback){
    //console.log("jion_room AA"+data.roomid)
    for(var i=0;i<_room_info.length;++i){
        //console.log("_room_info[i] BB:"+_room_info[i].room_id)
        if(_room_info[i].room_id === data.roomid){
            //console.log("----jion_room sucess roomid:"+data.roomid)
            _room_info[i].jion_player(player) 
            if(callback){
                resp = {
                    room:_room_info[i],
                    data:{
                          roomid:_room_info[i].room_id,
                          bottom:_room_info[i].bottom,
                          rate:_room_info[i].rate,
                          gold:_room_info[i].gold,
                          totalGames:_room_info[i].totalGames,  // 添加总局数
                          currentGame:_room_info[i].currentGame  // 添加当前局数
                        }
                }
                callback(0,resp)
                return
            } 
        }
    }

    if(callback){
        callback("no found room:"+data.roomid)
    }
}