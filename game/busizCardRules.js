/**
 * 巴士子扑克 - 服务器端牌型规则和出牌验证逻辑
 * 与客户端 playCardRules.js 保持一致
 */

// 牌型枚举
const CardType = {
    SINGLE: "single",           // 单张
    PAIR: "pair",              // 对子
    DOUBLE_PAIR: "double_pair" // 连对（双对）- 四张牌，两个连续的对子且同花色
};

/**
 * 牌值映射表（服务器端value -> 原始牌面值）
 * 服务器端：5:1, 6:2, 7:3, 8:4, 9:5, J:6, Q:7, K:8, A:9, 2:10, 10:11
 * 小王:12, 大王:13
 */
const CardValue = {
    "1": 5,   // value 1 -> 牌面 5
    "2": 6,   // value 2 -> 牌面 6
    "3": 7,   // value 3 -> 牌面 7
    "4": 8,   // value 4 -> 牌面 8
    "5": 9,   // value 5 -> 牌面 9
    "6": 10,  // value 6 -> 牌面 J
    "7": 11,  // value 7 -> 牌面 Q
    "8": 12,  // value 8 -> 牌面 K
    "9": 13,  // value 9 -> 牌面 A
    "10": 14, // value 10 -> 牌面 2
    "11": 10  // value 11 -> 牌面 10
};

/**
 * 判断是否是主牌
 * @param {Object} card - 牌数据 {value, shape, king}
 * @param {number} masterShape - 主花色
 * @returns {boolean}
 */
/**
 * 检查两个主牌权重是否连续（包括特殊规则）
 * @param {number} weight1 - 第一个权重
 * @param {number} weight2 - 第二个权重
 * @param {Object} card1 - 第一个对子的第一张牌
 * @param {Object} card2 - 第二个对子的第一张牌
 * @param {number} masterShape - 主花色
 * @returns {boolean} 是否连续
 */
function checkConsecutiveMainWeights(weight1, weight2, card1, card2, masterShape) {
    // 主牌权重顺序列表（从大到小）
    const mainWeights = [
        1000,  // 大王
        999,   // 小王
        600,   // 主花色10
        500,   // 其他花色10
        400,   // 主花色2
        300,   // 其他花色2
        209,   // 主花色A
        208,   // 主花色K
        207,   // 主花色Q
        206,   // 主花色J
        205,   // 主花色9
        204,   // 主花色8
        203,   // 主花色7
        202,   // 主花色6
        201    // 主花色5
    ];
    
    // 移除大王和小王是连续的特殊规则
    // 大王和小王凑在一起不成对，也不能组成连对
    if((weight1 ===999 && weight2 ===600 )|| (weight1 === 600 && weight2 === 999)){
        return true;
    }
    // 在列表中找到两个权重的位置
    const index1 = mainWeights.indexOf(weight1);
    const index2 = mainWeights.indexOf(weight2);
    
    // 两个权重都必须在列表中
    if (index1 === -1 || index2 === -1) {
        return false;
    }
    
    // 特殊规则：主花色10可以连接任意数量的其他花色10，其他花色10之间也视为连续
    // 检查：card1是主花色10（权重600，value=11，shape=masterShape）
    //       card2是其他花色10（权重500，value=11，shape!=masterShape）
    const isCard1Main10 = card1.value === 11 && card1.shape === masterShape;
    const isCard2Other10 = card2.value === 11 && card2.shape !== masterShape;
    const isCard2Main10 = card2.value === 11 && card2.shape === masterShape;
    const isCard1Other10 = card1.value === 11 && card1.shape !== masterShape;
    
    // 主花色10与其他花色10连接
    if ((isCard1Main10 && isCard2Other10) || (isCard2Main10 && isCard1Other10)) {
        return true;
    }
    
    // 多个其他花色10对视为连续
    if (card1.value === 11 && card2.value === 11 && card1.shape !== masterShape && card2.shape !== masterShape) {
        return true;
    }
    
    // 特殊规则：主花色2可以连接任意数量的其他花色2
    const isCard1Main2 = card1.value === 10 && card1.shape === masterShape;
    const isCard2Other2 = card2.value === 10 && card2.shape !== masterShape;
    const isCard2Main2 = card2.value === 10 && card2.shape === masterShape;
    const isCard1Other2 = card1.value === 10 && card1.shape !== masterShape;
    if ((isCard1Main2 && isCard2Other2) || (isCard2Main2 && isCard1Other2)) {
        return true;
    }
    
    // 特殊规则：多个其他花色2对视为连续
    if (card1.value === 10 && card2.value === 10 && card1.shape !== masterShape && card2.shape !== masterShape) {
        return true;
    }
    
    // 特殊规则：小王（权重999）可以连接主花色10（权重600）
    if ((weight1 === 999 && weight2 === 600) || (weight1 === 600 && weight2 === 999)) {
        return true;
    }
    
    // 特殊规则：大王（权重1000）可以连接主花色10（权重600）
    if ((weight1 === 1000 && weight2 === 600) || (weight1 === 600 && weight2 === 1000)) {
        return true;
    }
    
    // 检查是否相邻
    return Math.abs(index1 - index2) === 1;
}

/**
 * 检查主牌连对的连续性（支持特殊规则）
 * @param {Array} pairWeights - 对子权重数组
 * @param {Array} pairFirstCards - 每对的第一张牌数组
 * @param {number} masterShape - 主花色
 * @returns {boolean} 是否连续
 */
function checkMainPairsConsecutive(pairWeights, pairFirstCards, masterShape) {
    // 检查每相邻的对子是否连续
    for (let i = 0; i < pairWeights.length - 1; i++) {
        const weight1 = pairWeights[i];
        const weight2 = pairWeights[i + 1];
        const card1 = pairFirstCards[i];
        const card2 = pairFirstCards[i + 1];
        
        // 使用特殊规则检查连续性
        const isConsecutive = checkConsecutiveMainWeights(weight1, weight2, card1, card2, masterShape);
        
        if (!isConsecutive) {
            return false;
        }
    }
    
    return true;
}

function isMainCard(card, masterShape) {
    if (!card) return false;
    
    // 王牌总是主牌
    if (card.king) return true;
    
    // 将value转换为数字进行比较（避免字符串与数字的类型不匹配问题）
    const cardValue = Number(card.value);
    if (isNaN(cardValue)) {
        console.warn("isMainCard: card.value is not a number:", card.value, card);
        return false;
    }
    
    // 10牌总是主牌（value === 11）
    if (cardValue === 11) return true;
    
    // 2牌总是主牌（value === 10）
    if (cardValue === 10) return true;
    
    // 与主花色相同的牌是主牌
    if (masterShape && card.shape === masterShape) return true;
    
    return false;
}

/**
 * 获取花色名称
 * @param {number} shape - 花色代码
 * @returns {string} 花色名称
 */
function getShapeName(shape) {
    const shapeNames = {
        1: '黑桃',
        2: '红桃',
        3: '梅花',
        4: '方块'
    };
    return shapeNames[shape] || '未知';
}

/**
 * 获取牌的大小权重（用于比较）
 * 主牌顺序：大王>小王＞主花色10>其他花色10＞主花色2＞其他花色2＞主花色A＞主花色K＞主花色Q＞主花色J＞主花色9＞主花色8＞主花色7＞主花色6＞主花色5
 * 副牌顺序：A＞K＞Q＞J＞9＞8＞7＞6＞5
 * @param {Object} card - 牌数据
 * @param {number} masterShape - 主花色
 * @returns {number} 权重值，越大表示牌越大
 */
function getCardWeight(card, masterShape) {
    if (!card) return 0;
    
    // 王牌
    if (card.king) {
        // 小王=12，大王=13
        return card.king === 13 ? 1000 : 999;
    }
    
    const isMain = isMainCard(card, masterShape);
    const cardValue = parseInt(card.value);
    
    if (isMain) {
        // 主牌权重计算
        // 10牌（value=11）
        if (cardValue === 11) {
            // 主花色10 > 其他花色10
            return card.shape === masterShape ? 600 : 500;
        }
        // 2牌（value=10）
        if (cardValue === 10) {
            // 主花色2 > 其他花色2
            return card.shape === masterShape ? 400 : 300;
        }
        
        // 其他主牌（A>K>Q>J>9>8>7>6>5）
        // 主花色牌的value：A=9, K=8, Q=7, J=6, 9=5, 8=4, 7=3, 6=2, 5=1
        // 转换为权重：200-299范围
        const baseWeight = 200 + cardValue; // value越大（A=9），权重越大
        return baseWeight;
    } else {
        // 副牌权重计算
        // 副牌顺序：A>K>Q>J>9>8>7>6>5
        // 副牌value：A=9, K=8, Q=7, J=6, 9=5, 8=4, 7=3, 6=2, 5=1
        // 转换为权重：0-99范围
        return cardValue;
    }
}

/**
 * 比较两张牌的大小
 * @param {Object} card1 - 第一张牌
 * @param {Object} card2 - 第二张牌
 * @param {number} masterShape - 主花色
 * @returns {number} 1表示card1大，-1表示card2大，0表示相等或无法比较
 */
function compareCards(card1, card2, masterShape) {
    // 都是主牌时比较大小
    const isMain1 = isMainCard(card1, masterShape);
    const isMain2 = isMainCard(card2, masterShape);
    
    if (isMain1 && !isMain2) {
        // 主牌大于副牌
        return 1;
    }
    if (!isMain1 && isMain2) {
        // 副牌小于主牌
        return -1;
    }
    
    if (isMain1 && isMain2) {
        // 都是主牌，比较权重
        const weight1 = getCardWeight(card1, masterShape);
        const weight2 = getCardWeight(card2, masterShape);
        return weight1 > weight2 ? 1 : (weight1 < weight2 ? -1 : 0);
    }
    
    if (!isMain1 && !isMain2) {
        // 都是副牌，必须同花色才能比较
        if (card1.shape !== card2.shape) {
            // 不同花色的副牌无法比较大小
            return 0;
        }
        // 同花色比较大小
        const weight1 = getCardWeight(card1, masterShape);
        const weight2 = getCardWeight(card2, masterShape);
        return weight1 > weight2 ? 1 : (weight1 < weight2 ? -1 : 0);
    }
    
    return 0;
}

/**
 * 判断牌型
 * @param {Array} cards - 牌数组
 * @param {number} masterShape - 主花色
 * @returns {Object} {type: CardType, isValid: boolean, shape: number|null}
 */
function getCardType(cards, masterShape) {
    if (!Array.isArray(cards) || cards.length === 0) {
        return { type: null, isValid: false, shape: null, isMain: false };
    }
    
    const count = cards.length;
    
    // 单张
    if (count === 1) {
        const isMain = isMainCard(cards[0], masterShape);
        return { type: CardType.SINGLE, isValid: true, shape: cards[0].shape, isMain: isMain };
    }
    
    // 对子：两张牌，要求同花色同牌值，或者大王+大王、小王+小王
    if (count === 2) {
        const card1 = cards[0];
        const card2 = cards[1];
        
        // 检查是否是王牌
        const card1IsBigKing = card1.king === 13;
        const card2IsBigKing = card2.king === 13;
        const card1IsSmallKing = card1.king === 12;
        const card2IsSmallKing = card2.king === 12;
        
        // 大王+大王 或 小王+小王
        if ((card1IsBigKing && card2IsBigKing) || (card1IsSmallKing && card2IsSmallKing)) {
            console.log("busizCardRules getCardType 王牌对子: card1=", card1, "card2=", card2);
            return { type: CardType.PAIR, isValid: true, shape: null, isKing: true, isMain: true };
        }
        
        // 普通牌：要求同花色同牌值
        const sameShape = card1.shape === card2.shape;
        const sameValue = card1.value === card2.value;
        
        console.log("busizCardRules getCardType 对子判断: card1=", card1, "card2=", card2, "sameShape=", sameShape, "sameValue=", sameValue);
        
        if (!sameShape || !sameValue) {
            console.log("busizCardRules getCardType 不是对子: 需要同花色同牌值");
            return { type: null, isValid: false, shape: null };
        }
        
        const isMain = isMainCard(card1, masterShape);
        const result = { 
            type: CardType.PAIR, 
            isValid: true, 
            shape: card1.shape,
            isMain: isMain,
            mixed: false,
            mixedValues: false
        };
        console.log("busizCardRules getCardType 返回: ", result);
        return result;
    }
    
    // 连对（双对、三连对、四连对等）- 偶数张牌，连续的对子
    if (count >= 4 && count % 2 === 0) {
        const pairCount = count / 2; // 对子数量：4张=2对，6张=3对，8张=4对
        
        // 统计每个值出现的次数（包括王牌）
        const valueCount = {};
        for (let card of cards) {
            const key = card.value || (card.king ? card.king : null);
            if (key !== null) {
                if (!valueCount[key]) {
                    valueCount[key] = 0;
                }
                valueCount[key]++;
            }
        }
        
        // 检查是否能组成pairCount个对子
        let canFormPairs = true;
        for (let key in valueCount) {
            if (valueCount[key] < 2) {
                // 有牌出现次数小于2，无法形成对子
                canFormPairs = false;
                break;
            }
        }
        
        if (!canFormPairs) {
            return { type: null, isValid: false, shape: null };
        }
        
        // 检查是否有王牌
        const hasKing = cards.some(card => card.king);
        
        // 不再对王牌连对进行特殊处理，而是将其视为普通主牌连对进行处理
        // 这样王牌就可以与其他主牌组成连对，只要它们的权重是连续的
        
        // 检查是否都是同一花色（王牌没有花色，所以如果有王牌，sameShape会是false）
        const firstShape = cards[0].shape;
        const sameShape = cards.every(card => card.shape === firstShape);
        
        // 如果有王牌，即使sameShape为true，也应该进入主牌连对处理逻辑
        // 检查是否所有牌都是主牌
        const allMain = cards.every(card => isMainCard(card, masterShape));
        
        if (allMain) {
            // 主牌连对：可以是不同花色，只要权重连续
            const weights = cards.map(card => getCardWeight(card, masterShape)).sort((a, b) => b - a);
            
            // 检查是否形成pairCount个对子
            const pairWeights = [];
            for (let i = 0; i < pairCount; i++) {
                const idx1 = i * 2;
                const idx2 = idx1 + 1;
                if (weights[idx1] !== weights[idx2]) {
                    return { type: null, isValid: false, shape: null };
                }
                pairWeights.push(weights[idx1]);
            }
            
            // 检查权重是否连续（支持特殊规则）
            // 收集每对的第一张牌，用于判断是否是主花色10/2
            const pairFirstCards = [];
            for (let i = 0; i < pairCount; i++) {
                const idx = i * 2;
                pairFirstCards.push(cards[idx]);
            }
            
            const isConsecutive = checkMainPairsConsecutive(pairWeights, pairFirstCards, masterShape);
            if (!isConsecutive) {
                return { type: null, isValid: false, shape: null };
            }
            
            return { type: CardType.DOUBLE_PAIR, isValid: true, shape: sameShape ? firstShape : null, isMain: true, pairCount };
        } else if (sameShape && !hasKing) {
            // 副牌连对：同花色，连续的对子
            // 排序牌值（从大到小）
            const values = cards.map(card => parseInt(card.value)).sort((a, b) => b - a);
            
            // 检查是否形成pairCount个对子，且连续
            for (let i = 0; i < pairCount - 1; i++) {
                const currentPairValue = values[i * 2]; // 第i个对子的值
                const nextPairValue = values[(i + 1) * 2]; // 第i+1个对子的值
                if (currentPairValue !== nextPairValue + 1) {
                    return { type: null, isValid: false, shape: null };
                }
            }
            
            // 检查每对是否都是相同值
            for (let i = 0; i < pairCount; i++) {
                const idx1 = i * 2;
                const idx2 = idx1 + 1;
                if (values[idx1] !== values[idx2]) {
                    return { type: null, isValid: false, shape: null };
                }
            }
            
            return { type: CardType.DOUBLE_PAIR, isValid: true, shape: firstShape, isMain: false, pairCount };
        } else {
            // 混合花色且不是全主牌，返回无效牌型
            return { type: null, isValid: false, shape: null };
        }
    }
    
    return { type: null, isValid: false, shape: null };
}

/**
 * 验证出牌（跟牌规则）
 * @param {Array} selectedCards - 选中的牌
 * @param {Array} firstCards - 先出牌玩家的牌
 * @param {Array} handCards - 手牌
 * @param {number} masterShape - 主花色
 * @returns {Object} {isValid: boolean, reason: string}
 */
function validatePlayCards(selectedCards, firstCards, handCards, masterShape) {
    if (!Array.isArray(selectedCards) || selectedCards.length === 0) {
        return { isValid: false, reason: "请选择要出的牌" };
    }
    
    if (!Array.isArray(firstCards) || firstCards.length === 0) {
        return { isValid: false, reason: "首出牌数据无效" };
    }
    
    // 规则6.1/7.1：满足出牌数量
    if (selectedCards.length !== firstCards.length) {
        return { isValid: false, reason: "出牌数量必须与首出牌相同" };
    }
    console.log
    // 获取首出牌的牌型
    console.log("busizCardRules validatePlayCards 首出牌牌型: ", firstCards);
    const firstType = getCardType(firstCards, masterShape);
    if (!firstType.isValid) {
        return { isValid: false, reason: "首出牌牌型无效" };
    }
    
    // 判断首出牌是否是主牌
    const firstIsMain = isMainCard(firstCards[0], masterShape);
    
    if (firstIsMain) {
        // 规则7：主牌跟牌规则
        return validateMainCardPlay(selectedCards, firstCards, firstType, handCards, masterShape);
    } else {
        // 规则6：副牌跟牌规则
        return validateSideCardPlay(selectedCards, firstCards, firstType, handCards, masterShape);
    }
}

/**
 * 验证副牌出牌（规则6）
 */
function validateSideCardPlay(selectedCards, firstCards, firstType, handCards, masterShape) {
    const firstShape = firstCards[0].shape;
    
    // 规则6.3：判断牌型
    if (firstType.type === CardType.PAIR) {
        // 先出牌玩家出的是副牌对子
        
        // 统计手牌中与先出花色相同的副牌数量（排除已选中的牌）
        let sameShapeCardsInHand = [];
        let debugMainCards = [];
        let debugSideCards = [];
        for (let card of handCards) {
            // 跳过已选中的牌 - 使用索引比较而不是对象引用比较
            let isSelected = false;
            for (let selectedCard of selectedCards) {
                if (card.index === selectedCard.index) {
                    isSelected = true;
                    break;
                }
            }
            if (isSelected) {
                continue;
            }
            
            const cardValueNum = Number(card.value);
            const isMain = card.king || cardValueNum === 11 || cardValueNum === 10 || (masterShape && card.shape === masterShape);
            if (isMain) {
                debugMainCards.push(card);
            }
            
            // 只统计与先出花色相同的副牌（非主牌）
            if (!isMain && card.shape === firstShape) {
                sameShapeCardsInHand.push(card);
                debugSideCards.push(card);
            }
        }
        console.log("巴士子扑克验证 - 副牌对子规则 - 调试信息:");
        console.log("手牌总数:", handCards.length, "主牌数量:", debugMainCards.length, "同花色副牌数量:", sameShapeCardsInHand.length);
        console.log("主牌详情:", debugMainCards.map(c => ({value: c.value, shape: c.shape, king: c.king})));
        console.log("同花色副牌详情:", debugSideCards.map(c => ({value: c.value, shape: c.shape, king: c.king})));
        
        console.log("巴士子扑克验证 - 副牌对子规则:");
        console.log("首出花色:", firstShape, "主花色:", masterShape);
        console.log("选中的牌:", selectedCards);
        console.log("手牌数量:", handCards.length);
        console.log("手牌中同花色副牌数量（排除选中牌）:", sameShapeCardsInHand.length);
        console.log("手牌中同花色副牌:", sameShapeCardsInHand);
        
        // 统计手牌中相同花色各点数的数量
        const valueCount = {};
        for (let card of sameShapeCardsInHand) {
            const key = card.value;
            if (!valueCount[key]) {
                valueCount[key] = 0;
            }
            valueCount[key]++;
        }
        
        // 检查手牌中是否有相同花色的对子
        let hasSameShapePairInHand = false;
        let pairValuesInHand = []; // 存储手牌中对子的牌值
        for (let value in valueCount) {
            if (valueCount[value] >= 2) {
                hasSameShapePairInHand = true;
                pairValuesInHand.push(parseInt(value));  // 转换为数字
            }
        }
        
        console.log("手牌中是否有同花色对子:", hasSameShapePairInHand);
        console.log("手牌中对子牌值:", pairValuesInHand);
        
        if (hasSameShapePairInHand) {
            // 规则：有相同花色对子必须先出
            // 检查选中的牌是否是相同花色的对子
            const selectedType = getCardType(selectedCards, masterShape);
            if (selectedType.type !== CardType.PAIR) {
                return { isValid: false, reason: "手中有相同花色对子，必须出同花色对子" };
            }
            
            const selectedCard = selectedCards[0];
            // 必须出同花色的对子
            if (selectedCard.shape !== firstShape) {
                return { isValid: false, reason: "手中有相同花色对子，必须出同花色对子" };
            }
            
            // 检查选中的对子牌值是否在手牌的对子牌值列表中
            const selectedValue = selectedCard.value;
            console.log("手牌对子：pairValuesInHand："+pairValuesInHand);
            console.log("选中牌"+selectedValue);
            // 将selectedValue转换为数字进行比较，因为pairValuesInHand存储的是数字
            const selectedValueNum = parseInt(selectedValue);
            if (!pairValuesInHand.includes(selectedValueNum)) {
                return { isValid: false, reason: "手中有相同花色对子，必须出手牌中存在的对子" };
            }
            
            // 选中的对子牌值在手牌中有至少两张（是对子），验证通过
        } else if (sameShapeCardsInHand.length > 0) {
            // 规则：没有相同花色对子，但有同花色副牌
            // 根据手牌中同花色副牌的数量确定出牌要求
            
            // 统计选中的牌中同花色副牌的数量
            let selectedSameShapeCount = 0;
            let selectedMainCards = [];
            let selectedSideCards = [];
            for (let card of selectedCards) {
                const cardValueNum = Number(card.value);
                const isMain = card.king || cardValueNum === 11 || cardValueNum === 10 || (masterShape && card.shape === masterShape);
                if (isMain) {
                    selectedMainCards.push(card);
                }
                if (!isMain && card.shape === firstShape) {
                    selectedSameShapeCount++;
                    selectedSideCards.push(card);
                }
            }
            console.log("选中副牌数selectedSameShapeCount：", selectedSameShapeCount);
            console.log("选中的主牌:", selectedMainCards.map(c => ({value: c.value, shape: c.shape, king: c.king})));
            console.log("选中的同花色副牌:", selectedSideCards.map(c => ({value: c.value, shape: c.shape, king: c.king})));
            
            if (sameShapeCardsInHand.length >= 2) {
                // 手中有2张或更多同花色副牌，必须出2张同花色牌
                if (selectedSameShapeCount < 2) {
                    return { isValid: false, reason: "手中有同花色副牌，必须出两张同花色牌" };
                }
            } else {
                // sameShapeCardsInHand.length === 1
                // 手中有1张同花色副牌，必须出1张同花色牌 + 1张其他牌
                if (selectedSameShapeCount < 1) {
                    return { isValid: false, reason: "手中有同花色副牌，必须至少出一张同花色牌" };
                }
            }
            
            // 选中的牌可以包含主牌或其他花色副牌来凑数
            // 不要求必须是对子，只要求凑够数量即可
            // 出牌数量已经在validatePlayCards中验证过
        } else {
            // 规则：手中没有相同花色的副牌，可以任意出两张牌
            // 允许任意两张牌（可以是对子，也可以不是）
            // 不需要考虑主牌，因为首出的是副牌对子
            // 出牌数量已经在validatePlayCards中验证过（必须与首出牌数量相同）
            console.log("手中没有同花色副牌，允许任意出牌");
        }
    } else if (firstType.type === CardType.DOUBLE_PAIR) {
        // 先出牌玩家出的是副牌连对（四张牌，两个连续的对子且同花色）
        
        // 统计手牌中首出花色的**副牌**数量（排除已选中的牌和主牌）
        let debugCardsInHand = [];
        const sameShapeSideCardsInHand = handCards.filter(card => {
            // 跳过已选中的牌 - 检查两种可能的结构：直接对象或嵌套在card_data中
            let isSelected = false;
            for (let selectedCard of selectedCards) {
                // 检查直接对象结构
                if (card.index === selectedCard.index) {
                    isSelected = true;
                    break;
                }
                // 检查嵌套在card_data中的结构
                if (selectedCard.card_data && card.index === selectedCard.card_data.index) {
                    isSelected = true;
                    break;
                }
            }
            if (isSelected) {
                return false;
            }
            
            const isMain = isMainCard(card, masterShape);
            debugCardsInHand.push({card, isMain, shape: card.shape});
            // 只统计首出花色的**副牌**（非主牌）
            return !isMain && card.shape === firstShape;
        }).length;
        
        console.log("巴士子扑克验证 - 副牌连对规则 - 手牌调试:");
        console.log("手牌总数:", handCards.length);
        console.log("每张牌详情:", debugCardsInHand.map(d => ({
            value: d.card.value, 
            shape: d.card.shape, 
            king: d.card.king,
            isMain: d.isMain
        })));
        console.log("同花色副牌数量:", sameShapeSideCardsInHand);
        
        // 统计玩家选中的首出花色副牌数量
        let debugSelectedCards = [];
        const sameShapeSideCardsSelected = selectedCards.filter(selectedItem => {
            // 处理可能的嵌套结构
            const card = selectedItem.card_data || selectedItem;
            
            const cardValueNum = Number(card.value);
            const isMain = card.king || cardValueNum === 11 || cardValueNum === 10 || (masterShape && card.shape === masterShape);
            debugSelectedCards.push({card, isMain, shape: card.shape});
            return !isMain && card.shape === firstShape;
        }).length;
        
        console.log("选中牌详情:", debugSelectedCards.map(d => ({
            value: d.card.value, 
            shape: d.card.shape, 
            king: d.card.king,
            isMain: d.isMain
        })));
        console.log("选中同花色副牌数量:", sameShapeSideCardsSelected);
        
        // 如果手中有首出花色的副牌，必须出尽可能多的该花色副牌
        if (sameShapeSideCardsInHand -sameShapeSideCardsSelected > 0) {
            // 计算应该出多少张首出花色的副牌
            // 如果该花色副牌总数 ≥ 首出牌数：必须出首出牌数张
            // 如果该花色副牌总数 < 首出牌数：必须出该花色所有的牌
            const totalSameShapeSideCards = sameShapeSideCardsInHand ;
            const requiredCount = Math.min(totalSameShapeSideCards, firstCards.length);
            
            if (sameShapeSideCardsSelected < requiredCount) {
                const shapeName = getShapeName(firstShape);
                return { isValid: false, reason: `手中还有${totalSameShapeSideCards}张${shapeName}副牌，必须出尽可能多的${shapeName}副牌` };
            }
        }
    } else {
        // 单张牌的处理
        // 规则6.2：如果手中有相同花色的副牌，必须出同花色
        // 检查手牌中（排除已选中的牌）是否有与先出花色相同的副牌
        let hasSameShapeInHand = false;
        let sameShapeCards = [];
        
        for (let card of handCards) {
            // 跳过已选中的牌 - 使用索引比较而不是对象引用比较
            let isSelected = false;
            for (let selectedCard of selectedCards) {
                if (card.index === selectedCard.index) {
                    isSelected = true;
                    break;
                }
            }
            if (isSelected) {
                continue;
            }
            
            // 检查是否有相同花色的副牌（非主牌）
            const cardValueNum = Number(card.value);
            const isMain = card.king || cardValueNum === 11 || cardValueNum === 10 || (masterShape && card.shape === masterShape);
            if (!isMain && card.shape === firstShape) {
                // 再次确认这张牌不是玩家刚刚选中的牌（双重缩进）
                let isSelectedInSecondCheck = false;
                for (let selectedCard of selectedCards) {
                    if (card.index === selectedCard.index) {
                        isSelectedInSecondCheck = true;
                        break;
                    }
                }
                
                if (!isSelectedInSecondCheck) {
                    hasSameShapeInHand = true;
                    sameShapeCards.push(card);
                    break;
                }
            }
        }
        
        console.log("巴士子扑克验证 - 单张牌:");
        console.log("首出牌花色:", firstShape, "主花色:", masterShape);
        console.log("选中的牌:", selectedCards);
        console.log("手牌数量:", handCards.length);
        console.log("手牌中同花色副牌:", sameShapeCards);
        console.log("hasSameShapeInHand:", hasSameShapeInHand);
        
        // 详细输出手牌内容，用于调试
        console.log("手牌完整内容:", handCards);
        console.log("选中牌是否是主牌:", isMainCard(selectedCards[0], masterShape));
        console.log("选中牌花色:", selectedCards[0].shape, "首出牌花色:", firstShape);
        
        if (hasSameShapeInHand) {
            // 手中有相同花色的副牌，选中的牌必须是同花色副牌
            const selectedCard = selectedCards[0];
            
            // 修复：如果选中的牌是王（king），则允许出牌
            if (selectedCard.king) {
                console.log("选中的牌是王，允许出牌");
                // 王可以任意出，不受花色限制
            } else if (isMainCard(selectedCard, masterShape) || selectedCard.shape !== firstShape) {
                console.log("验证失败: 手中有同花色副牌但出了主牌或其他花色");
                return { isValid: false, reason: "手中有相同花色的副牌，必须出同花色副牌" };
            }
        }
        // 手中没有相同花色的副牌，可以出其他花色的副牌或主牌
    }
    
    return { isValid: true, reason: "" };
}

/**
 * 验证主牌出牌（规则7）
 */
function validateMainCardPlay(selectedCards, firstCards, firstType, handCards, masterShape) {
    // 规则7.2：判断选中的牌是否全满足主牌
    let allMain = true;
    for (let card of selectedCards) {
        if (!isMainCard(card, masterShape)) {
            allMain = false;
            break;
        }
    }
    
    if (!allMain) {
        // 如果不是全主牌，先统计手中的主牌数量
        let mainCardsInHand = [];
        for (let card of handCards) {
            // 跳过已选中的牌 - 检查两种可能的结构
            let isSelected = false;
            for (let selectedCard of selectedCards) {
                // 检查直接对象结构
                if (card.index === selectedCard.index) {
                    isSelected = true;
                    break;
                }
                // 检查嵌套在card_data中的结构
                if (selectedCard.card_data && card.index === selectedCard.card_data.index) {
                    isSelected = true;
                    break;
                }
            }
            if (isSelected) {
                continue;
            }
            
            if (isMainCard(card, masterShape)) {
                mainCardsInHand.push(card);
            }
        }
        
        // 统计选中的主牌数量
        let selectedMainCount = 0;
        for (let selectedItem of selectedCards) {
            // 处理可能的嵌套结构
            const card = selectedItem.card_data || selectedItem;
            if (isMainCard(card, masterShape)) {
                selectedMainCount++;
            }
        }
        console.log("mainCardsInHand.length:"+mainCardsInHand.length);
        console.log("selectedMainCount:"+selectedMainCount);
        // 检查是否需要出主牌
        // 只有当手中主牌数量 >= 首出牌数量时，才要求必须出主牌
        if (mainCardsInHand.length  >= firstCards.length) {
            // 计算必须出多少张主牌 = min(手中主牌总数, 首出牌数量)
            const totalMainCount = mainCardsInHand.length + selectedMainCount;
            const requiredMainCount = Math.min(totalMainCount, firstCards.length);
            
            // 选中的主牌数量必须 >= 必须出的主牌数量
            if (selectedMainCount < requiredMainCount) {
                return { isValid: false, reason: `手中有主牌，必须出主牌` };
            }
        }
        // 如果手中主牌数量 < 首出牌数量，允许出主牌+副牌的组合
    }
    
    // 规则7.3：判断牌型
    if (firstType.type === CardType.PAIR) {
        // 先出牌玩家出的是主牌对子
        
        // 统计手牌中的主牌数量（排除已选中的牌）
        let mainCardsInHand = [];
        for (let card of handCards) {
            // 跳过已选中的牌 - 检查两种可能的结构
            let isSelected = false;
            for (let selectedCard of selectedCards) {
                // 检查直接对象结构
                if (card.index === selectedCard.index) {
                    isSelected = true;
                    break;
                }
                // 检查嵌套在card_data中的结构
                if (selectedCard.card_data && card.index === selectedCard.card_data.index) {
                    isSelected = true;
                    break;
                }
            }
            if (isSelected) {
                continue;
            }
            
            // 只统计主牌
            if (isMainCard(card, masterShape)) {
                mainCardsInHand.push(card);
            }
        }
        
        // 统计手牌中主牌各点数和花色的数量
        const valueShapeCount = {};
        for (let card of mainCardsInHand) {
            // 对于王牌，忽略花色，只按王牌值统计
            if (card.king) {
                const key = card.king;
                if (!valueShapeCount[key]) {
                    valueShapeCount[key] = {};
                }
                if (!valueShapeCount[key]['king']) {
                    valueShapeCount[key]['king'] = 0;
                }
                valueShapeCount[key]['king']++;
            } else {
                // 对于普通主牌，需要考虑花色，因为两副牌中同花色的牌才能组成对子
                const key = card.value;
                if (!valueShapeCount[key]) {
                    valueShapeCount[key] = {};
                }
                if (!valueShapeCount[key][card.shape]) {
                    valueShapeCount[key][card.shape] = 0;
                }
                valueShapeCount[key][card.shape]++;
            }
        }
        
        // 检查手牌中是否有主牌对子
        let hasMainPairInHand = false;
        let mainPairValues = []; // 存储手牌中所有主牌对子的牌值
        
        for (let value in valueShapeCount) {
            const shapeData = valueShapeCount[value];
            
            // 检查王牌对子
            if (shapeData['king'] && shapeData['king'] >= 2) {
                hasMainPairInHand = true;
                mainPairValues.push(value);
                continue;
            }
            
            // 检查普通主牌对子（需要同花色）
            for (let shape in shapeData) {
                if (shape === 'king') continue; // 跳过王牌数据
                
                if (shapeData[shape] >= 2) {
                    hasMainPairInHand = true;
                    mainPairValues.push(value);
                    break; // 同一个牌值只要有一个花色满足对子条件即可
                }
            }
        }
        
        // 统计手牌中的主牌总数（包括已选中的）
        let totalMainCount = 0;
        for (let card of handCards) {
            if (isMainCard(card, masterShape)) {
                totalMainCount++;
            }
        }
        
        // 统计选中的牌中主牌的数量
        let selectedMainCount = 0;
        for (let selectedItem of selectedCards) {
            // 处理可能的嵌套结构
            const card = selectedItem.card_data || selectedItem;
            if (isMainCard(card, masterShape)) {
                selectedMainCount++;
            }
        }
        
        if (hasMainPairInHand) {
            // 规则：有主牌对子必须先出
            // 检查选中的牌是否是主牌对子
            const selectedType = getCardType(selectedCards, masterShape);
            if (selectedType.type !== CardType.PAIR) {
                console.log("巴士子扑克验证 - 主牌对子规则: 玩家尝试出非对子牌型，但手中有主牌对子");
                console.log("手牌中主牌对子牌值:", mainPairValues);
                console.log("选中的牌型:", selectedType);
                return { isValid: false, reason: "手中有主牌对子，必须出主牌对子" };
            }
            
            const selectedCard = selectedCards[0];
            if (!isMainCard(selectedCard, masterShape)) {
                console.log("巴士子扑克验证 - 主牌对子规则: 玩家尝试出非主牌，但手中有主牌对子");
                console.log("选中的牌不是主牌:", selectedCard);
                return { isValid: false, reason: "手中有主牌对子，必须出主牌对子" };
            }
            
            // 检查选中的牌是否与手牌中的主牌对子匹配
            const selectedKey = selectedCard.value || (selectedCard.king ? selectedCard.king : null);
            // 将selectedKey转换为字符串，因为mainPairValues中的键是字符串
            const selectedKeyStr = String(selectedKey);
            if (!mainPairValues.includes(selectedKeyStr)) {
                return { isValid: false, reason: "手中有主牌对子，必须出主牌对子" };
            }
        } else if (totalMainCount > 0) {
            // 规则：没有主牌对子，但有主牌
            // 必须出所有手牌中的主牌，但最多为首出牌的数量
            
            // 计算必须出多少张主牌 = min(手中主牌总数, 首出牌数量)
            const requiredMainCount = Math.min(totalMainCount, firstCards.length);
            
            // 选中的主牌数量必须 >= 必须出的主牌数量
            if (selectedMainCount < requiredMainCount) {
                return { isValid: false, reason: "手中有主牌，必须出主牌" };
            }
        } else {
            // 规则：手中没有主牌，可以任意出副牌
            // 检查选中的牌是否都是副牌（不能有主牌）
            for (let card of selectedCards) {
                if (isMainCard(card, masterShape)) {
                    return { isValid: false, reason: "手中没有主牌，不能出主牌" };
                }
            }
            // 允许任意两张副牌，不要求是对子
            // 出牌数量已经在validatePlayCards中验证过（必须与首出牌数量相同）
        }
    } else if (firstType.type === CardType.DOUBLE_PAIR) {
        // 先出牌玩家出的是主牌连对（四张牌，两个连续的对子）
        
        // 计算首出牌中有多少个对子
        const firstPairCount = firstCards.length / 2; // 4张牌 = 2个对子
        
        // 统计手牌中能组成多少个对子
        const mainCardsInHand = handCards.filter(card => isMainCard(card, masterShape));
        const shapeValueCount = {}; // 按花色和牌值组合统计
        for (let card of mainCardsInHand) {
            const valueKey = card.value || (card.king ? card.king : null);
            const shapeKey = card.shape || (card.king ? 'king' : null);
            if (valueKey !== null && shapeKey !== null) {
                // 使用"花色:牌值"作为键，确保同花色同牌值才能构成对子
                const key = `${shapeKey}:${valueKey}`;
                if (!shapeValueCount[key]) {
                    shapeValueCount[key] = 0;
                }
                shapeValueCount[key]++;
                console.log(`统计主牌对子 - 花色:${shapeKey}, 牌值:${valueKey}, 当前数量:${shapeValueCount[key]}`);
            }
        }
        
        // 计算手牌中能组成多少个对子
        let availablePairCount = 0;
        for (let key in shapeValueCount) {
            availablePairCount += Math.floor(shapeValueCount[key] / 2);
        }
        console.log(`手牌中主牌对子统计 - 可组成对子数:${availablePairCount}`);
        
        // 统计选中的牌中有多少个对子
        const selectedShapeValueCount = {}; // 按花色和牌值组合统计
        let selectedMainCount = 0;
        for (let card of selectedCards) {
            if (!isMainCard(card, masterShape)) continue;
            selectedMainCount++;
            const valueKey = card.value || (card.king ? card.king : null);
            const shapeKey = card.shape || (card.king ? 'king' : null);
            if (valueKey !== null && shapeKey !== null) {
                // 使用"花色:牌值"作为键
                const key = `${shapeKey}:${valueKey}`;
                if (!selectedShapeValueCount[key]) {
                    selectedShapeValueCount[key] = 0;
                }
                selectedShapeValueCount[key]++;
            }
        }
        
        let selectedPairCount = 0;
        for (let key in selectedShapeValueCount) {
            selectedPairCount += Math.floor(selectedShapeValueCount[key] / 2);
        }
        console.log(`选中牌中主牌对子统计 - 对子数:${selectedPairCount}`);
        
        // 规则：尽量出对子，不够用主牌补数，再不够用副牌补数
        
        // 检查1：是否出了尽可能多的对子
        const maxPairCount = Math.min(availablePairCount, firstPairCount);
        if (selectedPairCount < maxPairCount) {
            return { isValid: false, reason: `手中有${availablePairCount}个对子，必须出尽可能多的对子（${maxPairCount}个）` };
        }
        
        // 检查2：是否出了尽可能多的主牌
        const maxMainCount = Math.min(mainCardsInHand.length, firstCards.length);
        if (selectedMainCount < maxMainCount) {
            return { isValid: false, reason: `手中有${mainCardsInHand.length}张主牌，必须出尽可能多的主牌（${maxMainCount}张）` };
        }
    }
    
    return { isValid: true, reason: "" };
}

/**
 * 比较两组牌的大小
 * @param {Array} cards1 - 第一组牌
 * @param {Array} cards2 - 第二组牌
 * @param {number} masterShape - 主花色
 * @returns {number} 1表示cards1大，-1表示cards2大，0表示相等或无法比较
 */
function compareCardGroups(cards1, cards2, masterShape) {
    //我们可以在这里直接加一个王的比较呀
    if (!Array.isArray(cards1) || !Array.isArray(cards2)) return 0;
    if (cards1.length === 0 || cards2.length === 0) return 0;
    
    // 获取牌型
    const type1 = getCardType(cards1, masterShape);
    const type2 = getCardType(cards2, masterShape);
    
    // 规则2：满足牌型才能进行后续比对（不满足牌型直接输）
    if (!type1.isValid || !type2.isValid) {
        // 无效牌型，无法比较
        return 0;
    }
    
    // 牌型必须相同才能比较
    if (type1.type !== type2.type) {
        // 牌型不同，无法比较
        return 0;
    }
    
    // 牌型数量必须相同
    if (cards1.length !== cards2.length) {
        return 0;
    }
    
    console.log("busizCardRules compareCardGroups: type1.type=", type1.type, "cards1.length=", cards1.length, "cards2.length=", cards2.length);
    
    // 处理不同牌型
    switch (type1.type) {
        case CardType.SINGLE:
            // 单张：使用compareCards函数，它已经实现了规则
            // 1) 主牌大于副牌
            // 2) 同主牌比对：直接按照牌值比大小
            // 3) 同副牌比对：与首出玩家同花色，才比对同大小
            // 4) 牌值一致时，先出的玩家 > 后出玩家（由调用方处理）
            return compareCards(cards1[0], cards2[0], masterShape);
            
        case CardType.PAIR:
            // 对子
            // 判断是否是主牌对子
            const isMain1 = cards1.every(card => isMainCard(card, masterShape));
            const isMain2 = cards2.every(card => isMainCard(card, masterShape));
            
            // 规则3：主牌大于副牌（不用比较牌值）
            if (isMain1 && !isMain2) {
                return 1; // cards1是主牌对子，cards2是副牌对子
            }
            if (!isMain1 && isMain2) {
                return -1; // cards2是主牌对子，cards1是副牌对子
            }
            
            // 都是主牌对子：按顺序比较每张牌的大小
            if (isMain1 && isMain2) {
                // 按顺序比较每张牌
                for (let i = 0; i < cards1.length; i++) {
                    const result = compareCards(cards1[i], cards2[i], masterShape);
                    if (result !== 0) {
                        console.log("主牌对子比较: cards1[", i, "] > cards2[", i, "]");
                        return result;
                    }
                }
                console.log("主牌对子比较: 相等");
                return 0;
            }
            
            // 都是副牌对子
            const shape1 = cards1[0].shape;
            const shape2 = cards2[0].shape;
            
            // 规则3：不是同花色副牌，直接小于首出玩家
            // 这里假设cards1是当前赢家（可能是首出牌），如果cards2花色不同，则cards2小
            if (shape1 !== shape2) {
                console.log("副牌对子花色不同: shape1=", shape1, "shape2=", shape2, "cards2小");
                return -1; // cards2花色不同，小于cards1
            }
            
            // 同花色副牌对子：比较对子牌值之和
            const sum1 = cards1.reduce((sum, card) => sum + parseInt(card.value), 0);
            const sum2 = cards2.reduce((sum, card) => sum + parseInt(card.value), 0);
            console.log("同花色副牌对子比较: sum1=", sum1, "sum2=", sum2);
            return sum1 > sum2 ? 1 : (sum1 < sum2 ? -1 : 0);
            
        case CardType.DOUBLE_PAIR:
            // 连对
            // 规则3：主牌大于副牌
            if (type1.isMain && !type2.isMain) {
                return 1; // cards1是主牌连对，cards2是副牌连对
            }
            if (!type1.isMain && type2.isMain) {
                return -1; // cards2是主牌连对，cards1是副牌连对
            }
            
            // 都是主牌连对或都是副牌连对
            // 如果是副牌连对，必须同花色才能比较
            if (!type1.isMain && !type2.isMain) {
                if (type1.shape !== type2.shape) {
                    console.log("副牌连对花色不同: shape1=", type1.shape, "shape2=", type2.shape, "cards2小");
                    return -1; // cards2花色不同，小于cards1
                }
            }
            
            // 计算所有牌值的总和
            const totalSum1 = cards1.reduce((sum, card) => sum + parseInt(card.value), 0);
            const totalSum2 = cards2.reduce((sum, card) => sum + parseInt(card.value), 0);
            console.log("连对比较: totalSum1=", totalSum1, "totalSum2=", totalSum2);
            return totalSum1 > totalSum2 ? 1 : (totalSum1 < totalSum2 ? -1 : 0);
            
        default:
            // 其他牌型，使用通用比较逻辑
            // 比较主副牌
            const hasMain1 = cards1.some(card => isMainCard(card, masterShape));
            const hasMain2 = cards2.some(card => isMainCard(card, masterShape));
            
            if (hasMain1 && !hasMain2) {
                return 1; // 主牌大于副牌
            }
            if (!hasMain1 && hasMain2) {
                return -1; // 副牌小于主牌
            }
            
            // 如果都是主牌或都是副牌，按顺序比较
            for (let i = 0; i < cards1.length; i++) {
                const result = compareCards(cards1[i], cards2[i], masterShape);
                if (result !== 0) {
                    return result;
                }
            }
            return 0; // 相等
    }
}

/**
 * 计算牌分（5、10、K对应的分数）
 * @param {Array} cards - 牌数组
 * @returns {number} 总分数
 */
function calculateCardsScore(cards) {
    if (!Array.isArray(cards)) return 0;
    
    let totalScore = 0;
    for (let card of cards) {
        if (card.king) continue; // 王牌无分数
        
        // 转换为字符串进行比较，兼容数字和字符串类型
        var valueStr = String(card.value);
        switch(valueStr) {
            case "1":  // 牌面5 -> 5分
                totalScore += 5;
                break;
            case "11": // 牌面10 -> 10分
                totalScore += 10;
                break;
            case "8":  // 牌面K -> 10分
                totalScore += 10;
                break;
        }
    }
    return totalScore;
}

// 导出函数
module.exports = {
    CardType,
    isMainCard,
    getCardWeight,
    compareCards,
    getCardType,
    compareCardGroups,
    validatePlayCards,
    calculateCardsScore
};
