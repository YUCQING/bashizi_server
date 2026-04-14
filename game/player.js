module.exports = function(info,socket,callindex,gamectr){
   //console.log("playerinfo:"+ JSON.stringify(info))
   var that = {}
   that._nickName = info.nick_name;    //用户昵称
   that._accountID = info.account_id;  //用户账号
   that._avatarUrl = info.avatar_url;  //头像
   that._gold = info.gold_count;       //当前金币
   that._socket = socket
   that._gamesctr = gamectr
   that._room = undefined //所在房间的引用
   that._seatindex = 0   //在房间的位置
   that._isready = false //当前在房间的状态 是否点击了准备按钮
   that._cards = []      //当前手上的牌
   that._isOnline = true // 玩家是否在线
   //内部使用的发送数据函数
   const _notify = function (type, result ,data, callBackIndex) {
    console.log('notify =' + JSON.stringify(data));
    that._socket.emit('notify', {
        type: type,
        result:result,
        data: data,
        callBackIndex: callBackIndex
    });
};
   

   //通知客户端登录成功，返回数据
   _notify("login_resp",0,{goldcount:that._gold},callindex)

   that._socket.on("disconnect",function(reason){
        console.log("player disconnect，原因: " + reason + "，玩家: " + that._accountID)
        that._isOnline = false
        if(that._room){
            that._room.playerOffLine(that)
        }
   })
   
   that._socket.on("error", function(error) {
        console.log("player socket error，玩家: " + that._accountID + "，错误: " + error)
   })
   
   // 重连时标记为在线
   that._socket.on("connect",function(){
        console.log("player reconnect, mark online，玩家: " + that._accountID)
        that._isOnline = true
   })

   //删除玩家出过的牌
   that.removePushCards = function(remve_cards){
        if(remve_cards.length==0){
            return 
        }

        console.log("开始删除手牌，当前手牌数量:", that._cards.length, "要删除的牌数量:", remve_cards.length);
        console.log("要删除的牌:", JSON.stringify(remve_cards.map(card => ({cardid: card.cardid, index: card.index, value: card.value, shape: card.shape}))));
        console.log("当前手牌:", JSON.stringify(that._cards.map(card => ({cardid: card.cardid, index: card.index, value: card.value, shape: card.shape}))));

        for(var i=0;i<remve_cards.length;i++){
            var rcard = remve_cards[i]
            if(rcard==null){
                continue
            } 
            
            var found = false;
            // 获取要删除牌的标识符（优先使用index，其次使用cardid）
            var cardIdentifier = null;
            if (rcard.index !== undefined) {
                cardIdentifier = rcard.index;
            } else if (rcard.cardid !== undefined) {
                cardIdentifier = rcard.cardid;
            }
            
            for(var j=0;j<that._cards.length;j++){
                var handCard = that._cards[j];
                var match = false;
                
                // 优先使用index匹配（最可靠）
                if (cardIdentifier !== undefined && handCard.index !== undefined && cardIdentifier === handCard.index) {
                    match = true;
                    console.log("匹配成功（按index）: 要删除的index=", cardIdentifier, "手牌中的index=", handCard.index);
                } 
                // 其次使用cardid匹配
                else if (cardIdentifier !== undefined && handCard.cardid !== undefined && cardIdentifier == handCard.cardid) {
                    match = true;
                    console.log("匹配成功（按cardid）: 要删除的cardid=", cardIdentifier, "手牌中的cardid=", handCard.cardid);
                }
                
                if (match) {
                    that._cards.splice(j, 1);
                    found = true;
                    console.log("成功删除一张牌，剩余手牌数量:", that._cards.length);
                    break; // 找到并删除后跳出内层循环
                }
            }
            
            if (!found) {
                console.log("警告: 未找到要删除的牌 标识符:", cardIdentifier, 
                          "要删除的牌数据:", JSON.stringify(rcard));
            }
        }
        
        console.log("删除手牌完成，最终手牌数量:", that._cards.length);
   }

   //data分3个部分 cmd,{data},callindex
   that._socket.on("notify",function(req){
        var cmd = req.cmd
        var data = req.data
        var callindex = req.callindex
        console.log("_notify" + JSON.stringify(req))
        switch(cmd){
            case "createroom_req":
                that._gamesctr.create_room(data,that,function(err,result){
                    if(err!=0){
                        console.log("create_room err:"+ err)
                    }else{
                        that._room = result.room
                        console.log("create_room:"+ result)
                    }
                   
                    _notify("createroom_resp",err,result.data,callindex)
                })

                break;
                case "joinroom_req":
                   
                    that._gamesctr.jion_room(req.data,that,function(err,result){
                        if(err){
                            console.log("joinroom_req err"+ err)
                            _notify("joinroom_resp",err,null,callindex)
                        }else{
                            //加入房间成功
                            that._room = result.room
                            _notify("joinroom_resp",err,result.data,callindex)
                        }

                    })
                    break
                    case "enterroom_req":
                        if(that._room) {
                            that._room.enter_room(that,function(err,result){
                                if(err!=0){
                                    _notify("enter_room_resp",err,{},callindex)
                                }else{
                                    //enterroom成功
                                    that._seatindex =  result.seatindex
                                    _notify("enter_room_resp",err,result,callindex)
                                }
                              
                            })
                           
                        }else{
                            console.log("that._room is null")
                        }
                        
                        break
                     case "player_ready_notify":   //玩家准备消息通知
                         if(that._room){
                            that._isready = true 
                            that._room.playerReady(that)
                         }
                         break 
                     case "player_start_notify": //客户端:房主发送开始游戏消息
                           if(that._room){
                            that._room.playerStart(that,function(err,result){
                                if(err){
                                    console.log("player_start_notify err"+ err)
                                    _notify("player_start_notify",err,null,callindex)
                                }else{ 
                                    //加入房间成功
                                    
                                    _notify("player_start_notify",err,result.data,callindex)
                                }
        
                            })
                           }
                           break    
                      case "player_rob_notify":  //客户端发送抢地主消息
                           if(that._room){
                            that._room.playerRobmaster(that,data)
                           }
                           break 
                       case "chu_bu_card_req":   //客户端发送出牌消息
                            if(that._room){
                                that._room.playerBuChuCard(that,data)
                            }
                           break   
                       case "chu_card_req":
                            if(that._room){
                               
                                console.log("that._room")
                                that._room.playerChuCard(that,data,function(err,result){
                                    if(err){
                                      console.log("playerChuCard cb err:"+err+" "+result)
                                      _notify("chu_card_res",err,result.data,callindex)
                                    }
                                     _notify("chu_card_res",err,result.data,callindex)
                                })
                            }
                           break         
                        case "player_mingbao_notify":  // 客户端发送明包消息
                            if(that._room){
                                that._room.playerMingBao(that, data);
                            }
                            break;
                        case "player_anbao_notify":  // 客户端发送暗包消息
                            if(that._room){
                                that._room.playerAnBao(that, data);
                            }
                            break;
                        case "player_fanzhu_notify":  // 客户端发送反主消息
                            if(that._room){
                                that._room.playerFanZhu(that, data);
                            }
                            break;
                        case "player_bufan_notify":  // 客户端发送不反消息
                            if(that._room){
                                that._room.playerBuFan(that, data);
                            }
                            break;
                        case "player_surrender_notify":  // 客户端发送投降消息
                            if(that._room){
                                that._room.playerSurrender(that, data);
                            }
                            break;
                        case "player_not_surrender_notify":  // 客户端发送不投降消息
                            if(that._room){
                                that._room.playerNotSurrender(that, data);
                            }
                            break;
                        case "player_maipai_notify":  // 客户端发送埋牌消息
                            if(that._room){
                                that._room.playerMaiPai(that, data);
                            }
                            break;
                        case "player_card_dealt_notify":  // 客户端通知发牌已完成
                            if(that._room){ 
                                that._room.playerCardDealt(that, data);
                            }
                            break;
                        case "next_game_req":  // 客户端发送下一局请求
                            console.log("处理next_game_req，玩家" + that._accountID);
                            if(that._room){ 
                                try {
                                    that._room.playerNextGame(that, function(err, result){
                                        console.log("playerNextGame回调执行，err=" + err + "，将发送响应");
                                        try {
                                            _notify("next_game_resp", err, result || {}, callindex);
                                            console.log("next_game_resp发送完成");
                                        } catch (notifyErr) {
                                            console.error("发送next_game_resp时出错:", notifyErr);
                                        }
                                    });
                                } catch (gameErr) {
                                    console.error("执行playerNextGame时出错:", gameErr);
                                    _notify("next_game_resp", -1, {message: "服务器内部错误"}, callindex);
                                }
                            } else {
                                console.log("玩家" + that._accountID + "没有房间，无法处理下一局请求");
                                _notify("next_game_resp", -1, {message: "玩家不在房间中"}, callindex);
                            }
                            break;
                        case "start_game_req":  // 客户端发送开始游戏请求
                            if(that._room){ 
                                that._room.playerStart(that, function(err, result){
                                    _notify("start_game_resp", err, result || {}, callindex);
                                });
                            }
                            break;
            default:
                break;    
        }
   })

   that.sendPlayerJoinRoom = function(data){
    console.log("player join room notify" + JSON.stringify(data))
     _notify("player_joinroom_notify",0,data,0)
   }

   //发送有玩家准备好消息
   that.sendplayerReady = function(data){
       //console.log("sendplayerReady accountid:"+data)
       _notify("player_ready_notify",0,data,0)
   }

   that.gameStart = function(data){
       _notify("gameStart_notify",0,data || {},0)
   }

   that.sendPlayerChangeManage = function(data){
         console.log("sendPlayerChangeManage: account:"+data)
         _notify("changehousemanage_notify",0,data,0)
   }

   that.sendCard = function(data){
    that._cards = data
    _notify("pushcard_notify",0,data,0)
   }
   
   //发送谁可以抢地主
    that.SendCanRob = function(data){
        console.log("SendCanRob"+data)
        _notify("canrob_notify",0,data,0)
    }

    //通知抢地主状态
    that.sendRobState = function(data){
        _notify("canrob_state_notify",0,data,0)
    }

    //发送当前地主是谁
    that.SendChangeMaster = function(data){
        _notify("change_master_notify",0,data,0)
    }

    //发送给客户端:显示底牌
    that.SendShowBottomCard = function(data){
        _notify("change_showcard_notify",0,data,0)
    }

    //发送给客户端:一轮结束消息
    that.SendRoundEnd = function(data){        _notify("round_end_notify",0,data,0)    }

    that.sendRoomInfo = function(data){        _notify("joinroom_resp",0,data,0)    }

    that.SendChuCard = function(data){
        _notify("can_chu_card_notify",0,data,0)
    }

    that.sendRoomState = function(data){
        _notify("room_state_notify",0,data,0)
    }

    //发送明包消息
    that.sendMingBao = function(data){
        _notify("mingbao_notify",0,data,0)
    }
    
    //发送暗包消息
    that.sendAnBao = function(data){
        _notify("anbao_notify",0,data,0)
    }
    
    //发送反主消息
    that.sendFanZhu = function(data){
        _notify("fanzhu_notify",0,data,0)
    }
    
    //发送不反消息
    that.sendBuFan = function(data){
        _notify("bu_fan_notify",0,data,0)
    }
    
    //发送底牌处理消息
    that.SendBottomCardProcess = function(data){
        _notify("bottomcard_process_notify",0,data,0)
    }
    
    //通知：其他玩家出牌广播
    that.SendOtherChuCard = function(data){
        _notify("other_chucard_notify",0,data,0)
    }

    that.sendGameSettlement = function(data){
        _notify("game_settlement_notify",0,data,0)
    }
    return that
}
