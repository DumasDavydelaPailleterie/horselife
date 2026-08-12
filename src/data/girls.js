/* 女角名冊 — 共 100 位
 *
 * 命名原則(重要):
 *   全部是原創名字,沒有任何一個是直接取自現有作品的角色名或真實人物。
 *   採用的手法是「復姓 + 古典單名／雙名」以及仿古典戲劇、武俠、早期國產遊戲的命名語感,
 *   目的是讓名字有味道又不容易跟真人撞名(復姓與罕用字在現實中極少見)。
 *
 * 分級(tier)與比例(依使用者指定):
 *   fatal     直接導致男主角登出        2 位（ 2%）
 *   negative  特殊負面效果             15 位（15%）
 *   positive  特殊正面效果             20 位（20%）
 *   normal    無特殊效果               63 位（63%）
 *
 * 欄位:
 *   name   姓名
 *   title  稱號(顯示在名字後面,給玩家判斷線索)
 *   tier   分級
 *   diff   攻略難度 low / mid / high
 *   where  限定出現的活動 id 陣列;null 表示任何活動都可能遇到
 *   desc   遇到時的人物速寫(特殊角色才有)
 *   hit    攻略成功時的文案(特殊角色才有)
 *   eff    攻略成功後的額外效果(特殊角色才有)
 *
 * eff 可用的鍵(數值為直接變動量,不經應對方式縮放):
 *   sta / int / str / skl   能力值
 *   enc                     額外邂逅機會
 *   rep                     校內風評(正值為惡化)
 *   risk                    當學期意外風險
 *   slot                    社交活動場次
 *   std                     感染性病:'syphilis' 梅毒(可治) / 'hiv' 愛滋(不可治)
 *   immune                  true 表示攻略成功後永久免疫性病(只有校醫室的護理師有)
 *   fatal                   字串,直接結束遊戲(從大學生活登出),內容為結束原因的文案
 */

/* ---------- 直接登出級(2 位) ----------
 * 「登出」指的是從大學生活登出——被打到住院、被家裡強制帶回去關起來、
 * 學籍直接辦休學或退學,人生按下暫停。不是死亡。
 *
 * 設計參考原著 YaKyoLife 的「肩膀報廢」——極低機率但一旦觸發就無法挽回。
 * 出現地點刻意放在最高風險的兩個活動(夜店、交友軟體),
 * 讓風險與報酬的關係是玩家自己選的,不是憑空降臨的惡意。 */
const FATAL = [
  {
    id: 'f01', name: '滕月娆', title: '不該碰的那位', tier: 'fatal', diff: 'high',
    where: ['act_club_night'],
    desc: '包廂最裡面那一桌，只有她一個人坐著，其他人都站著。門口那兩位不是保鑣，是她家的人。',
    hit: '那一晚很順利。三天後你在宿舍樓下被四個人圍住，接下來的兩個月你都在骨科病房。',
    eff: { fatal: '出院那天你爸媽已經把宿舍的東西全部搬走了。休學申請是他們簽的，手機也是他們保管的。你在家裡的房間住了一整年，那一年你沒有再回過學校。' },
  },
  {
    id: 'f02', name: '闕微茵', title: '別人的太太', tier: 'fatal', diff: 'high',
    where: ['act_app'],
    desc: '個人檔案寫著單身，但照片背景那間房子太貴了。她說她先生長期在國外。',
    hit: '她先生沒有在國外。他在客廳等你們回來，而且他律師的電話比拳頭更快。',
    eff: { fatal: '對方提了民事，你家裡付了錢，條件是你必須離開這座城市。學校那邊辦的是自願退學，理由欄寫「個人生涯規劃」。' },
  },
];

/* ---------- 特殊負面效果級(15 位) ----------
 * 其中 5 位帶性病(4 位梅毒可治、1 位愛滋不可治),
 * 其餘是風評重創、能力損失、風險暴增等等。 */
const NEGATIVE = [
  {
    id: 'n01', name: '殷紅袖', title: '夜店常客', tier: 'negative', diff: 'mid',
    where: ['act_club_night', 'act_app'],
    desc: '她認識這裡每一個調酒師,而且每一個調酒師都認識她。',
    hit: '過程很熟練，熟練到讓你有點不安。兩週後你發現自己的不安是對的。',
    eff: { std: 'syphilis', rep: 2 },
  },
  {
    id: 'n02', name: '婁纖', title: '來者不拒', tier: 'negative', diff: 'low',
    where: ['act_app', 'act_club_night'],
    desc: '你右滑的三分鐘後她就回訊了，連你的名字都沒問。',
    hit: '太容易了。容易到你後來一直在想，在你之前有多少人也覺得很容易。',
    eff: { std: 'syphilis', rep: 1 },
  },
  {
    id: 'n03', name: '皇甫綰', title: '傳說中的學姊', tier: 'negative', diff: 'mid',
    where: ['act_mixer', 'act_club_night'],
    desc: '系上關於她的傳言有三個版本，而且沒有一個版本裡的男生是同一個人。',
    hit: '她讓你學到很多。也讓你在校醫室學到更多。',
    eff: { std: 'syphilis', skl: 3, rep: 2 },
  },
  {
    id: 'n04', name: '柴嫚', title: '打工店裡那位', tier: 'negative', diff: 'low',
    where: ['act_club_night', 'act_camp'],
    desc: '她說她只是來打工的，但你發現她跟每一組客人都很熟。',
    hit: '那天之後你們沒再聯絡。但有些東西留下來了。',
    eff: { std: 'syphilis', sta: 2 },
  },
  {
    id: 'n05', name: '禚素心', title: '不留姓名', tier: 'negative', diff: 'high',
    where: ['act_app'],
    desc: '她沒有給你真名，也沒有留照片。她說這樣對大家都好。',
    hit: '她說得對，這樣對她比較好。你花了很久才拿到那張檢驗報告。',
    eff: { std: 'hiv', rep: 2 },
  },
  {
    id: 'n06', name: '仉玉璆', title: '教官的女兒', tier: 'negative', diff: 'high',
    where: ['act_club', 'act_camp'],
    desc: '她姓仉，全校只有一個人姓仉，而那個人的辦公室在學務處二樓。',
    hit: '事情辦成了。事情也傳到二樓了。',
    eff: { rep: 8, risk: 25, int: 3 },
  },
  {
    id: 'n07', name: '慕容湄', title: '系上的公審官', tier: 'negative', diff: 'mid',
    where: ['act_club', 'act_mixer'],
    desc: '她在系上經營一個群組，成員兩百多人，全部都是女生。',
    hit: '隔天早上，那個兩百多人的群組裡有你的照片、對話截圖，還有時間軸。',
    eff: { rep: 12, enc: -3 },
  },
  {
    id: 'n08', name: '上官妘', title: '情緒風暴', tier: 'negative', diff: 'low',
    where: null,
    desc: '她第一句話就問你「你是不是也覺得我很麻煩」。',
    hit: '接下來三個月，你的手機在凌晨三點響過十七次。',
    eff: { sta: 6, int: 3, slot: -2 },
  },
  {
    id: 'n09', name: '藺媛', title: '前男友是狠人', tier: 'negative', diff: 'mid',
    where: ['act_club_night', 'act_mixer'],
    desc: '她說她剛分手。她沒說前男友是誰，也沒說前男友還沒接受這件事。',
    hit: '你贏了那一晚。代價是接下來整個學期都在避開系館後門。',
    eff: { sta: 5, str: 4, risk: 20 },
  },
  {
    id: 'n10', name: '斛蘭因', title: '要價不菲', tier: 'negative', diff: 'low',
    where: ['act_app', 'act_club_night'],
    desc: '她挑的餐廳你查過，一個人的價位是你半個月的生活費。',
    hit: '你成功了，也破產了。接下來兩個學期你哪裡都去不了。',
    eff: { slot: -4, sta: 2 },
  },
  {
    id: 'n11', name: '鍾離嬿', title: '室友的正牌', tier: 'negative', diff: 'mid',
    where: ['act_club', 'act_camp'],
    desc: '她很好聊。聊到一半你才想起在室友桌上看過她的照片。',
    hit: '你回宿舍時東西已經被丟在走廊上了，而且鎖換過了。',
    eff: { rep: 6, slot: -2, sta: 3 },
  },
  {
    id: 'n12', name: '万俟湲', title: '直播間主播', tier: 'negative', diff: 'high',
    where: ['act_app'],
    desc: '她說她在做自媒體。她沒說當天晚上是開著的。',
    hit: '那場直播有四千人在線。其中三百多個是你的同學。',
    eff: { rep: 15, risk: 15, enc: 2 },
  },
  {
    id: 'n13', name: '闞霜', title: '藥效未退', tier: 'negative', diff: 'low',
    where: ['act_club_night'],
    desc: '她的眼神對不到焦，但一直笑。她的朋友都不見了。',
    hit: '隔天你才知道她當時的狀態，也才知道這件事的嚴重程度。',
    eff: { rep: 10, risk: 30, sta: 4 },
  },
  {
    id: 'n14', name: '緱翠翹', title: '學術不端', tier: 'negative', diff: 'mid',
    where: ['act_read'],
    desc: '她說她可以幫你弄期末報告，而且她真的有辦法。',
    hit: '報告過了，你也過了。三週後系辦寄來一封學術倫理審查通知。',
    eff: { int: 8, rep: 5, risk: 10 },
  },
  {
    id: 'n15', name: '澹臺姒', title: '認真的那一位', tier: 'negative', diff: 'high',
    where: ['act_club', 'act_read'],
    desc: '她問你以後想做什麼、家裡幾個人、有沒有想過結婚。她是認真在問的。',
    hit: '她把你帶回家見了父母。你花了一年才把這件事收乾淨。',
    eff: { slot: -3, sta: 4, enc: -4 },
  },
];

/* ---------- 特殊正面效果級(20 位) ----------
 * 效果方向刻意分散:有的給能力、有的給場次、有的給邂逅機會、有的洗白風評、
 * 有的直接給技巧力(相當於小型的老學長)。 */
const POSITIVE = [
  {
    id: 'p01', name: '司馬凝', title: '學霸系花', tier: 'positive', diff: 'high',
    where: ['act_read'],
    desc: '全系排名第一，而且從來沒有人成功約過她。她今天坐在你對面。',
    hit: '她把整學期的重點筆記給了你，說反正她自己記得住。',
    eff: { int: 10, rep: -2 },
  },
  {
    id: 'p02', name: '歐陽湘', title: '健身房教練', tier: 'positive', diff: 'mid',
    where: ['act_gym'],
    desc: '她在重訓區糾正了你的姿勢，然後說你的底子其實不差。',
    hit: '她替你排了三個月的訓練菜單，還盯著你執行。',
    eff: { str: 10, sta: 4 },
  },
  {
    id: 'p03', name: '東方翎', title: '社團公關', tier: 'positive', diff: 'mid',
    where: ['act_club', 'act_mixer'],
    desc: '她認識校內每一個社團的幹部，而且每一個都欠她人情。',
    hit: '她把你拉進了三個社團的核心群組，行程從此滿檔。',
    eff: { enc: 5, slot: 2 },
  },
  {
    id: 'p04', name: '南宮薇', title: '夜店領檯', tier: 'positive', diff: 'high',
    where: ['act_club_night'],
    desc: '她掌管入場名單。門口那條隊伍裡的人，能不能進去是她說了算。',
    hit: '從此你不用排隊，也不用低消。而且她會告訴你今天誰在裡面。',
    eff: { enc: 6, skl: 4 },
  },
  {
    id: 'p05', name: '慕容沁', title: '前輩的教學', tier: 'positive', diff: 'high',
    where: ['act_club_night', 'act_app'],
    desc: '她看了你三秒，然後說：你這樣不行，但可以救。',
    hit: '她花了一整個週末把你重新組裝了一次。',
    eff: { skl: 12 },
  },
  {
    id: 'p06', name: '獨孤纖', title: '劍道社長', tier: 'positive', diff: 'mid',
    where: ['act_gym', 'act_club'],
    desc: '她是校內劍道社的社長，握手的時候你感覺得出來。',
    hit: '她開始帶你晨練，你的體格在一個學期內完全變了。',
    eff: { str: 8, sta: 6 },
  },
  {
    id: 'p07', name: '沈湲', title: '系辦的內線', tier: 'positive', diff: 'mid',
    where: ['act_read', 'act_club'],
    desc: '她在系辦工讀，看得到所有人的成績單，包括教授的評分習慣。',
    hit: '她告訴你哪幾門課的教授只看期末、哪幾門必須點名。',
    eff: { int: 8, slot: 1 },
  },
  {
    id: 'p08', name: '柳嫣', title: '家教仲介', tier: 'positive', diff: 'low',
    where: ['act_club', 'act_read'],
    desc: '她手上有一串家長的聯絡清單，時薪都在平均值以上。',
    hit: '她把三個學生轉介給你，你的生活費問題解決了。',
    eff: { slot: 3, int: 3 },
  },
  {
    id: 'p09', name: '赫連玥', title: '宿營的總召', tier: 'positive', diff: 'mid',
    where: ['act_camp'],
    desc: '她是這場宿營的總召。三天的行程、每一組的名單，都是她排的。',
    hit: '接下來每一場活動的分組，她都會把你排在正確的位置。',
    eff: { enc: 5, rep: -2 },
  },
  {
    id: 'p10', name: '宇文瓊', title: '校刊主編', tier: 'positive', diff: 'high',
    where: ['act_club', 'act_read'],
    desc: '校刊那個專欄是她寫的。她決定誰在校內是個人物。',
    hit: '下一期的封面人物是你。整個學校都知道你是誰了。',
    eff: { rep: -8, enc: 4 },
  },
  {
    /* 校醫室的護理師:全名冊唯一提供「性病免疫」的角色。
     * 取得條件是攻略成功(人斬 +1)——收手或出手失敗都不算,
     * 必須真的做過,她才會把該講的都講完、該給的都給你。
     * 這是刻意設計的安全閥:玩家要花社交場次去一個幾乎斬不到人的地方,
     * 而且還要真的攻略成功,才能換到整局的性病豁免。 */
    id: 'p11', name: '長孫翊', title: '校醫室的護理師', tier: 'positive', diff: 'mid',
    where: ['act_clinic'],
    /* 她是校醫室的員工,不是一夜的對象——失敗了下次還可以再來。 */
    repeatable: true,
    /* 固定成功率,不套用一般的攻略公式。
     * 理由:免疫是這個遊戲唯一的安全閥,不該因為玩家開局技巧力只有 1
     * 就變成幾乎拿不到的東西。她的門檻設計在「有沒有想到要來校醫室」,
     * 而不是「技巧力夠不夠」——找到路的人就該拿得到。 */
    fixedRate: 90,
    desc: '她是校醫室的護理師，抽屜裡的東西比藥局還齊。她看了你一眼，說：「你們這種的，我一個學期要遇到十幾個。」',
    hit: '她把該講的都講完了，還塞了一整包東西給你，說用完再來拿。從此你知道怎麼保護自己。',
    eff: { immune: true, sta: 5, str: 2 },
  },
  {
    id: 'p12', name: '溫嫄', title: '低調的富家女', tier: 'positive', diff: 'high',
    where: ['act_app', 'act_mixer'],
    desc: '她穿得很普通，但接送她的車每次都不一樣。',
    hit: '她開始負擔你們所有的行程開銷，你的社交預算突然無上限。',
    eff: { slot: 5 },
  },
  {
    id: 'p13', name: '卓嬋', title: '心理系的傾聽者', tier: 'positive', diff: 'low',
    where: ['act_club', 'act_read'],
    desc: '她問問題的方式讓你不知不覺講了很多，包括不打算講的。',
    hit: '她幫你把心裡的結解開了，你整個人清爽起來。',
    eff: { sta: 8, int: 3, rep: -3 },
  },
  {
    id: 'p14', name: '裴嫽', title: '系隊隊長', tier: 'positive', diff: 'mid',
    where: ['act_gym', 'act_camp'],
    desc: '她是女排隊長，全隊的體能課表都是她在盯。',
    hit: '她把你納入她的訓練組，你成了系上體能最好的那群人之一。',
    eff: { str: 7, sta: 5, enc: 2 },
  },
  {
    id: 'p15', name: '尉遲媗', title: '調酒師', tier: 'positive', diff: 'mid',
    where: ['act_club_night'],
    desc: '吧檯後面那位。她記得每一個熟客喝什麼，包括你還沒點過的。',
    hit: '她教了你幾件在那個場合裡真正有用的事。',
    eff: { skl: 8, enc: 3 },
  },
  {
    id: 'p16', name: '諸葛沅', title: '資工系大神', tier: 'positive', diff: 'high',
    where: ['act_read'],
    desc: '她在寫的那個東西你看不懂，但她的螢幕上開了十四個視窗。',
    hit: '她幫你把所有作業自動化了，你的時間突然多了出來。',
    eff: { int: 9, slot: 3 },
  },
  {
    id: 'p17', name: '商嬅', title: '交友軟體的老手', tier: 'positive', diff: 'low',
    where: ['act_app'],
    desc: '她一眼就看出你的個人檔案哪裡有問題，而且願意告訴你。',
    hit: '她把你的檔案整個重寫了一次。配對數量從此不一樣。',
    eff: { enc: 7, skl: 3 },
  },
  {
    id: 'p18', name: '芮曦', title: '學生會會長', tier: 'positive', diff: 'high',
    where: ['act_club', 'act_mixer'],
    desc: '她是學生會會長。校內所有大型活動的名單她都經手。',
    hit: '從此每一場活動你都在名單上，而且是前排。',
    eff: { enc: 5, slot: 3, rep: -3 },
  },
  {
    id: 'p19', name: '閭丘婥', title: '瑜珈教室的常客', tier: 'positive', diff: 'low',
    where: ['act_gym'],
    desc: '她的柔軟度讓旁邊的人都停下來看。她說這是練了八年的。',
    hit: '她教了你一些關於身體的事，那些事後來一直很有用。',
    eff: { skl: 6, sta: 4, str: 2 },
  },
  {
    id: 'p20', name: '樂正芊', title: '寺廟裡的籤詩', tier: 'positive', diff: 'mid',
    where: ['act_camp', 'act_club'],
    desc: '她在宿營的第二晚拉著大家去了附近的廟，說要求點什麼。',
    hit: '她替你求了一支籤，然後說你接下來會很順。你後來發現她說得對。',
    eff: { sta: 4, int: 4, str: 4, skl: 4 },
  },
];

/* ---------- 一般級(63 位) ----------
 * 格式為 [姓名, 稱號, 難度],沒有特殊效果,攻略成功只計人斬與技巧力經驗。
 * 這是名冊的主體,用來稀釋特殊角色的出現頻率,
 * 讓玩家遇到特殊角色時真的有「今天不一樣」的感覺。 */
const NORMAL_RAW = [
  ['西門瑤', '隔壁系的', 'mid'],
  ['公孫嫤', '圖書館常客', 'low'],
  ['令狐嫻', '系上的班代', 'mid'],
  ['皇甫菀', '轉學生', 'mid'],
  ['太史茜', '合唱團', 'low'],
  ['聞人妘', '攝影社', 'low'],
  ['百里瀟', '田徑隊', 'mid'],
  ['端木曦', '外系的助教', 'high'],
  ['夏侯瑛', '系學會財務', 'mid'],
  ['蘇縈', '早八同學', 'low'],
  ['阮媞', '打工同事', 'low'],
  ['冉媗', '吉他社', 'low'],
  ['荀嫀', '桌遊社', 'low'],
  ['邢婥', '排球隊', 'mid'],
  ['滑妘', '宿舍樓友', 'low'],
  ['祁湄', '同組組員', 'low'],
  ['雋嫣', '國樂社', 'mid'],
  ['苻瓊', '學餐打工', 'low'],
  ['鄢綰', '書法社', 'low'],
  ['酈芊', '熱舞社', 'mid'],
  ['麴纖', '游泳隊', 'mid'],
  ['羋湲', '登山社', 'mid'],
  ['臧媛', '志工隊', 'low'],
  ['宓嬋', '茶道社', 'low'],
  ['鬱翊', '劇團', 'mid'],
  ['湛嫚', '系刊編輯', 'mid'],
  ['蒯沅', '英文會話', 'low'],
  ['虞婳', '管樂社', 'mid'],
  ['邴姒', '單車社', 'low'],
  ['缑瑄', '設計系', 'high'],
  ['厲嬿', '網球隊', 'mid'],
  ['翟薇', '烘焙社', 'low'],
  ['隗嫄', '天文社', 'low'],
  ['羌媞', '合作社店員', 'low'],
  ['亓官婉', '醫學系', 'high'],
  ['乞伏瓔', '棋藝社', 'low'],
  ['宗政湄', '模擬聯合國', 'high'],
  ['第五嫻', '法律系', 'mid'],
  ['呼延纖', '空手道社', 'mid'],
  ['壤駟瑤', '國際生', 'high'],
  ['子車菀', '大提琴', 'high'],
  ['夾谷芊', '劍道社', 'mid'],
  ['宰父玥', '系隊經理', 'mid'],
  ['谷梁茜', '辯論社', 'high'],
  ['濮陽婥', '電研社', 'low'],
  ['淳于嬅', '舞蹈系', 'high'],
  ['單于沅', '外文系', 'mid'],
  ['赫舍嫚', '交換生', 'high'],
  ['鮮于媗', '中文系', 'low'],
  ['仲長瓊', '哲學系', 'mid'],
  ['叱羅曦', '美術系', 'high'],
  ['庾湲', '同班同學', 'low'],
  ['冀嬋', '學餐常見', 'low'],
  ['郗綰', '通識課', 'low'],
  ['逄婉', '社辦鄰居', 'low'],
  ['禤薇', '系上直屬', 'low'],
  ['爨玥', '研究所學姊', 'high'],
  ['夔瑄', '樂團主唱', 'high'],
  ['佴嫣', '校車同路', 'low'],
  ['邳姒', '重修班', 'low'],
  ['蒲媛', '系隊學妹', 'low'],
  ['勾芊', '打工店長', 'mid'],
  ['邗湄', '隔壁校', 'mid'],
];

const NORMAL = NORMAL_RAW.map(([name, title, diff], i) => ({
  id: `g${String(i + 1).padStart(2, '0')}`,
  name, title, tier: 'normal', diff, where: null,
}));

/* ---------- 匯總 ---------- */

export const GIRLS = [...FATAL, ...NEGATIVE, ...POSITIVE, ...NORMAL];

export const GIRLS_BY_TIER = {
  fatal: FATAL,
  negative: NEGATIVE,
  positive: POSITIVE,
  normal: NORMAL,
};

export const GIRL_COUNT = GIRLS.length;

/* 一般角色沒有專屬文案,遇到與成功時用這些通用句子(隨機挑一句) */
export const GENERIC_DESC = [
  '你們在同一個場合待了一整晚，中間聊了幾句。',
  '有人把你們介紹給彼此，然後就走開了。',
  '她問了你哪個系的，你也問了她。',
  '你們一起排隊等飲料，隊伍很長。',
  '她朋友先走了，剩下她一個人。',
];

export const GENERIC_HIT = [
  '那天之後你們沒有再多說什麼，但事情確實發生了。',
  '過程很順，順到你事後回想不起是誰先開口的。',
  '結束之後她說改天再約，你們都知道不會有改天。',
  '很平常的一次，平常到隔天你要想一下才記得名字。',
];

/* 某位女角能否在指定活動出現 */
export function girlAvailableAt(girl, actId) {
  if (!girl.where) return true;
  return girl.where.includes(actId);
}
