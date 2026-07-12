/* Lightweight i18n: English (default) + Chinese.
   - Static HTML: elements carry data-i18n="key"; their original innerHTML is
     captured at startup as the English text, so only Chinese lives here.
   - Dynamic JS strings: t(key, params) with {param} interpolation; English
     templates for those keys are defined below under EN.
*/
const I18N = (() => {
  let lang = localStorage.getItem('my4d-lang') || 'en';
  const captured = {}; // key -> original English innerHTML

  const EN = {
    // results
    'r.noDraw': 'No draw on {date}. Draws are Wed / Sat / Sun plus special Tuesdays — use ‹ › to jump to the nearest draw.',
    'r.pendingNo': 'No result for this date yet.',
    'r.pendingLatest': 'Latest available:',
    'r.pendingNone': 'No earlier draws in the dataset.',
    'r.specialDraw': 'SPECIAL DRAW',
    'tier.1': '1st prize', 'tier.2': '2nd prize', 'tier.3': '3rd prize',
    'tier.4': 'Special', 'tier.5': 'Consolation',
    'ticket.special': 'Special', 'ticket.consolation': 'Consolation',
    // watchlist
    'wl.h.number': 'Number', 'wl.h.on': 'On {date}', 'wl.h.total': 'Total wins', 'wl.h.last': 'Last won',
    'wl.limit': 'Watchlist is limited to 30 numbers.',
    // shared
    'op.ALL': 'All operators', 'op.M': 'Magnum', 'op.D': 'Da Ma Cai', 'op.T': 'Sports Toto',
    'wd.0': 'Sunday', 'wd.1': 'Monday', 'wd.2': 'Tuesday', 'wd.3': 'Wednesday',
    'wd.4': 'Thursday', 'wd.5': 'Friday', 'wd.6': 'Saturday',
    // stats
    's.t.draws': 'draws in scope', 's.t.numbers': 'winning numbers', 's.t.hot': 'hottest number',
    's.t.wins': '{n} wins', 's.t.distinct': 'distinct numbers seen', 's.t.of10k': 'of 10,000 possible',
    's.hotSub': 'Top 15 by wins · {tiers} · {range}. Expected wins per number under a fair lottery: {exp}.',
    's.top3': '1st–3rd prizes', 's.all23': 'all 23 prizes',
    's.lastYears': 'last {n} year(s)', 's.allHist': 'all history',
    's.h.number': 'Number', 's.h.lastSeen': 'Last seen', 's.h.daysAbsent': 'Days absent', 's.h.totalWins': 'Total wins',
    's.winsTip': '{n} wins',
    's.heatTip': 'Digit {d} at position {p}',
    // check
    'c.err': 'Enter exactly 4 digits (0000–9999).',
    'c.wonSummary': '<strong>{num}{perm}</strong> won <strong>{n}</strong> time(s) — {top3} in the top-3 prizes — between {from} and {to}.',
    'c.permSuffix': ' (+{n} permutations)',
    'c.neverWon': '<strong>{num}</strong> has never won in the loaded history{perm}. With {draws} draws that is unremarkable — most numbers appear only a handful of times.',
    'c.neverPerm': ' (including permutations)',
    'c.h.date': 'Date', 'c.h.op': 'Operator', 'c.h.num': 'Number', 'c.h.prize': 'Prize', 'c.h.drawNo': 'Draw #',
    // analyzer
    'a.t.total': 'total wins (any prize)', 'a.t.expected': 'expected ≈ {n} under fair odds',
    'a.t.top3': 'top-3 prize wins', 'a.t.sinceLast': 'since last win', 'a.t.avgGap': 'avg gap {n}d',
    'a.t.neverSeen': 'never seen', 'a.t.permWins': 'wins incl. permutations',
    'a.h.odds': 'Theoretical odds (every draw, any history)',
    'a.h.bet': 'Bet', 'a.h.chance': 'Chance per prize', 'a.h.prize': 'Typical prize (RM1 bet)', 'a.h.ev': 'Expected return per RM1',
    'a.betStraight1': 'Straight — 1st prize', 'a.betStraightTop3': 'Straight — any top-3', 'a.betAny23': 'Any of 23 prizes (Big)',
    'a.seePrize': 'see prize table', 'a.oneIn10k': '1 in 10,000', 'a.threeIn10k': '3 in 10,000', 'a.tt23': '23 in 10,000 (0.23%)',
    'a.h.weekdayWins': 'Wins by weekday',
    'a.noWeekday': 'No wins recorded, so no weekday pattern to show.',
    'a.h.perm': 'Permutation breakdown ({n} distinct arrangements)',
    'a.permSub': 'Historical record of every arrangement of these digits, ranked by past wins. The frequency leader is a description of the past — every arrangement’s true chance is the same 1 in 10,000 on the next draw.',
    'a.h.permNum': 'Number', 'a.h.permTotal': 'Total wins', 'a.h.permTop3': 'Top-3', 'a.h.permLast': 'Last seen', 'a.h.permRatio': 'vs fair expectation',
    'a.yours': 'yours', 'a.daysAgo': '({n}d ago)',
    'a.ibox': 'Want to cover all arrangements? That is exactly what an <strong>i-Box bet</strong> does: your RM1 covers all {n} permutations, so the chance of hitting 1st prize rises to {n} in 10,000 — but the prize is divided by {n}, so the expected return stays the same ≈ RM {ev} per RM1. There is no arrangement of digits, and no combination of bets, that changes that.',
    'a.h.wdModel': 'Weekday model score (naive Bayes, top-3 prizes)',
    'a.h.day': 'Draw day', 'a.h.pnd': 'P(number | day)', 'a.h.vsFair': 'vs fair 1/10,000',
    'a.reality': '<strong>Reality check:</strong> these percentages are sampling noise, not an edge. In a fair lottery the true probability is exactly 1/10,000 on every day, and this model’s "best day" changes as new draws arrive. Expected loss is ≈ RM {loss} per RM1 Big bet no matter which number or day you pick.',
    'a.exSummary': 'What do "expected ≈ {n}" and "×1.34" mean in plain English?',
    'a.exBody': '<p>The history contains {total} winning numbers in total, spread across 10,000 possible numbers. So if the lottery is fair, an <em>average</em> number should have won about {total} ÷ 10,000 ≈ <strong>{n} times</strong> by now. That’s the "expected" figure.</p><div class="ex-example">A ratio like <strong>×1.34</strong> just means "this number has won 34% more often than that average so far" — the same way one friend in a group has usually won more card games than the others. It’s a record of past luck, not a power the number carries into the next draw.</div><p>And the weekday score table: "P(number | day)" is the model’s guess of this number’s chance on each draw day, built from digit frequencies on that day. Fair value is 1.00e-4 (that’s 0.0001 = 1-in-10,000). The green/grey percentage shows how far the guess sits above or below that fair value — always within noise distance.</p>',
    // weekday
    'w.h.day': 'Draw day', 'w.h.draws': 'Draws', 'w.h.numbers': 'Numbers', 'w.h.chi': 'χ² (36 df)', 'w.h.p': 'p-value', 'w.h.verdict': 'Verdict',
    'w.deviates': '⚠ deviates from uniform', 'w.consistent': '✓ consistent with fair draw',
    'w.someSig': '<strong>Some day(s) deviate at the 5% level.</strong> With multiple tests, occasional low p-values are expected by chance (about 1 in 20). Persistent deviation across years would be needed before reading anything into it.',
    'w.noneSig': '<strong>No weekday shows evidence of bias</strong> — digit distributions on every draw day are consistent with a fair, uniform lottery. That is exactly what the χ² test should find in real 4D data.',
    'w.noData': 'No draws for this day in scope.',
    'w.pos': 'position {n}', 'w.vsUniform': '{p}% vs 10.0% uniform · next: {d}',
    'w.composite': 'Composite “model pick” for {day}: <strong style="font-size:16px">{num}</strong> — based on {draws} draws ({numbers} top-3 numbers).',
    // predict
    'p.title': 'Model picks for the next draw — {date}',
    'p.sub': 'Two models, both recency-weighted (2-year half-life) and trained on {n} past {day} draws{scope}. "Edges" are each model’s estimate vs the uniform 0.01% baseline.',
    'p.scopeAll': ' across all operators', 'p.scopeOp': ' for {op}',
    'p.notEnough': 'Not enough data for this day.',
    'p.h.nb': 'Naive Bayes picks <span class="dim">(independent digit frequencies per position)</span>',
    'p.h.mk': 'Markov chain picks <span class="dim">(digit-to-digit transition patterns)</span>',
    'p.vsUniform': '{sign}{pct}% vs uniform',
    'p.edgeNote': 'Those "edges" are what each model believes, not what is true — run the backtest below to see how belief survives contact with reality.',
    'p.testing': 'Backtesting…',
    'p.t.replayed': 'draws replayed', 'p.t.topk': 'top-{k} picks, any prize tier',
    'p.t.randExp': 'expected hits if random', 'p.t.bar': 'the bar every model must beat',
    'p.h.rank': '#', 'p.h.model': 'Model', 'p.h.hits': 'Hits', 'p.h.vsRandom': 'vs random',
    'p.m.nb': 'Naive Bayes (weekday digits)', 'p.m.mk': 'Markov chain (digit pairs)', 'p.m.hot': 'Hot numbers (frequency)',
    'p.m.rand': 'Random picks (baseline)',
    'p.h.cum': 'Cumulative hits over the replay',
    'p.cumSub': 'Each line is a model’s running total of hits; the dashed grey line is what random picks would accumulate. Fair-lottery signature: every line wanders around the dashed one and keeps crossing it.',
    'p.l.nb': 'Naive Bayes', 'p.l.mk': 'Markov chain', 'p.l.hot': 'Hot numbers', 'p.l.rand': 'Random (expected)',
    'p.verdict': 'Today’s leaderboard winner is <strong>{name}</strong> at ×{ratio} — but with {n} draws the random band is roughly ×0.4–×1.7, so every model above is statistically tied with the baseline. Re-run after more draws arrive and watch the ranking shuffle: that shuffling <em>is</em> the lesson. A fair lottery lets models compete and never lets one win.',
    // banner + share
    'banner.fresh': '🔄 Fresh results available — tap to refresh',
    'share.results': 'Share', 'share.analysis': 'Share analysis', 'share.copied': 'Copied! Paste it into WhatsApp.',
    'share.resTitle': '🎱 Malaysia 4D Results — {date}',
    'share.noResult': '(no result yet)',
    'share.via': 'Via Malaysia 4D Insights',
    'share.anaTitle': '🔎 4D number analysis: {num}',
    'share.anaWins': 'Total wins in history: {n} (expected ≈ {exp})',
    'share.anaTop3': 'Top-3 prize wins: {n}',
    'share.anaLast': 'Last won: {date}',
    'share.anaNever': 'Never won in recorded history',
    'share.anaHonest': 'Reminder: every number is 1-in-10,000 on every draw. Past wins don’t change future odds!',
  };

  const ZH = {
    // ---- static blocks (keys match data-i18n attributes) ----
    'nav.results': '成绩', 'nav.stats': '统计', 'nav.check': '查号码', 'nav.analyzer': '分析',
    'nav.weekday': '星期模型', 'nav.predict': '预测', 'nav.about': '关于',
    'r.drawDate': '开彩日期', 'r.latest': '最新', 'r.prev': '‹ 上一期', 'r.next': '下一期 ›',
    'r.aboutLiveH': '关于“实时”成绩',
    'r.aboutLiveP': '本应用读取 <code>data/draws.json</code>。数据会在每个开彩日（三、六、日晚，另有特别开彩的星期二）之后自动刷新；应用打开时若发现新数据，会弹出一键刷新提示。',
    'wl.h': '我的号码', 'wl.sub': '只保存在本机。显示每个号码在所选开彩日期的成绩。',
    'wl.add': '添加', 'wl.empty': '还没有保存号码 — 把你常买的号码加进来吧。',
    's.range.1y': '最近1年', 's.range.3y': '最近3年', 's.range.all': '全部历史',
    's.tiers.top3': '只看头三奖', 's.tiers.all': '全部23个奖项',
    's.hotH': '最常开出的号码（热门）',
    's.heatH': '各位置数字出现频率', 's.heatSub': '数字0–9在四个位置各出现多少次。颜色越深=次数越多。',
    's.coldH': '最久没开的号码（冷门）', 's.coldSub': '在所选范围内最久没出现的号码。“该开了”只是对过去的描述，不是预测 — 每期开彩都是独立的。',
    'c.h': '这个号码几时中过奖？', 'c.sub': '输入任意4位数字，列出它中奖的每一期：日期、公司和奖项。',
    'c.btn': '查询', 'c.perm': '包含全部24种排列（类似 i-Box 玩法）',
    'a.h': '号码分析器', 'a.sub': '把你的号码放进全部历史数据里检验：实际出现频率、间隔、星期规律和理论概率。',
    'a.btn': '分析',
    'w.chiH': '星期几有影响吗？（χ²检验）',
    'w.chiSub': '对每个开彩日，我们检验中奖号码的数字分布是否偏离均匀分布（即“公平彩票”假设）。p值大于0.05表示没有证据显示星期有偏差。',
    'w.heatH': '按星期分的数字频率',
    'w.heatSub': '按开彩日拆分的各位置数字实际频率。分析页的星期模型评分就是基于这份数据。',
    'w.day.wed': '星期三', 'w.day.sat': '星期六', 'w.day.sun': '星期日', 'w.day.tue': '星期二（特别开彩）',
    'w.mlH': '各位置“最可能”的数字 <span style="font-weight:400;color:var(--text-muted)">（按所选星期）</span>',
    'w.mlSub': '星期模型下的最大似然数字。仅供学习参考 — 在公平彩票中这些“优势”只是统计噪音，不会持续。',
    'w.exSummary': '用大白话解释 χ² 和 p 值',
    'w.exBody': '<p>掷骰子600次，理论上每个面约100次，但实际会得到96、104、99、107、95、99这样的结果 — 永远不会刚好平均。<strong>χ²（卡方）就是一个“意外程度分数”</strong>：把每个数字偏离应有份额的程度加总起来。χ²小=看起来公平；χ²巨大=有问题。</p><p>这里我们对数字做同样的事：每个开彩日，数字0–9在每个位置都应占约10%。χ²衡量四个位置总共偏离了多少。</p><div class="ex-example"><strong>p值</strong>回答的是：“如果彩票完全公平，纯靠运气出现至少这么大意外分数的概率是多少？”p=0.80表示80%的情况都会这样 — 完全正常。p低于0.05（不到1/20）才值得留意。</div><p>提醒：我们检验了4个开彩日，即使完全公平，也有大约1/5的概率碰巧有某一天低于0.05。只有连年持续的偏差才有意义。</p>',
    'p.warn': '<strong>请先读这段：</strong>公平彩票中没有任何模型能预测下一期 — 每个号码每期都是万分之一。本页的目的是诚实地演示这一点：用真实的机器学习模型训练历史数据、展示它的选号，并让你<em>回测</em>这些选号是否真的赢过随机乱猜。请把它当作科普，而不是投注建议。',
    'p.picksH': '模型对下一期的选号',
    'p.btH': '模型真的有用吗？（滚动回测）',
    'p.btSub': '回放最近200期：每一期模型只用更早的数据训练，选出它的前23个号码，然后数它命中了多少个真实中奖号码 — 并与随机选23个号码的期望命中数比较。',
    'p.btBtn': '运行回测',
    'p.exNbSummary': 'Naive Bayes（朴素贝叶斯）模型是怎么选号的？（大白话）',
    'p.exNbBody': '<p>想象四个记分板，对应4D号码的四个位置。每开出一个中奖号码，它的每个数字就在自己位置的记分板上加一分。几千期之后，每个记分板就显示出0–9在该位置出现的频率。</p><div class="ex-example">例子：如果数字<strong>9</strong>在过去星期三的号码里，第一位出现了10.5%（公平份额正好是10%），模型就认为“星期三第一位的9有点热”。</div><p>给<strong>9598</strong>这样的号码打分，就是把四个数字的份额相乘：（第1位是9的份额）×（第2位是5的份额）×（第3位是9的份额）×（第4位是8的份额）。乘积最高的就是选号。</p><p><strong>“近期加权、2年半衰期”</strong>意思是旧数据会淡出：上个月的开彩几乎全额计分，2年前的算一半，4年前的算四分之一，以此类推 — 记分板更偏向近期历史。</p>',
    'p.exMkSummary': 'Markov链（马尔可夫链）有什么不同？',
    'p.exMkBody': '<p>朴素贝叶斯模型对每个位置独立打分 — 它永远不知道哪些数字<em>相邻</em>出现。马尔可夫链恰恰看这个：它学习哪个数字后面容易<strong>跟着</strong>哪个数字。</p><div class="ex-example">例子：它可能学到“<strong>6</strong>后面跟<strong>8</strong>的概率略高于1/10”。像<strong>6818</strong>这样的号码得分高，是因为每一步（6→8、8→1、1→8）都是历史中常见的“跳法”。</div><p>号码的得分 =（第一个数字开头的频率）×（已知第1位时第2位的概率）×（已知第2位时第3位的概率）×（已知第3位时第4位的概率）。同样有近期加权。</p>',
    'p.exEdgeSummary': '“+20% vs uniform”到底是什么意思？',
    'p.exEdgeBody': '<p>“Uniform（均匀）”是公平彩票的基准线：10,000个号码每个都是万分之一 = <strong>0.01%</strong>。显示<strong>+20%</strong>表示模型估计是0.012%而不是0.010%。</p><div class="ex-example">换成投注语言：模型认为这个号码大约是1/8,300而不是1/10,000。就算模型是对的（回测显示它不是），这点差距也远不足以战胜赔率 — 每投RM1平均仍只拿回约RM0.64。</div><p>这些微小“优势”之所以出现，是因为历史数字分布永远不会完全平均 — 就像抛100次硬币很少正好50/50。这种不平均是运气，不是规律。</p>',
    'p.exBtSummary': '回测是怎么做的？“随机期望9.3”是哪来的？',
    'p.exBtBody': '<p>把它想成<strong>时光机测试</strong>。我们回到最近200期的每一期，让每个模型只用“那期之前”的数据选出23个号码，然后翻开真实成绩，数它抓中了几个 — 不可能偷看未来。</p><div class="ex-example">为什么是9.3？每期开出23个中奖号码（共10,000个可能）。随机选23个号码，每个中奖号码被抓中的概率是23÷10,000。200期加起来就是 200 × 23 × 23 ÷ 10,000 ≈ <strong>纯靠运气能抓中9–10个</strong>。这就是及格线：模型必须持续超过它才算“有用”，一次超过不算。</div><p>下面的图就是这场比赛的慢镜头：每个模型的累计命中数对比虚线“运气线”。不断穿越虚线的线，表现和瞎猜完全一样 — 这正是公平彩票的诚实结论。</p>',
    'ab.h': '关于本应用',
    'ab.p1': 'Malaysia 4D Insights 是一个可安装、可离线使用的PWA应用，覆盖三大4D公司：<strong>万能 Magnum 4D</strong>、<strong>大马彩 Da Ma Cai 1+3D</strong> 和 <strong>多多 Sports Toto 4D</strong>。',
    'ab.pipeH': '数据管道',
    'ab.pipeP': '<code>scrapers/</code> 内有各公司成绩页的参考爬虫，GitHub Actions 会在每个开彩日后自动刷新 <code>data/draws.json</code>。如果某个来源只提供头三奖，应用照常工作 — 所有统计都有“只看头三奖”模式。',
    'ab.honestH': '诚实声明',
    'ab.honestP': '公平的4D开彩是均匀且独立的：无论历史如何，每个号码每期中头奖的概率都是1/10,000。这里的统计描述的是过去；χ²页面检验（用真实数据通常也证实）历史频率没有预测能力。本应用中没有任何功能能提高你的中奖概率。',
    'ab.legalP': '请理性投注，并确认你已达到当地法定年龄。本项目与万能、大马彩、多多公司无任何关联。',
    'footer.disclaimer': '仅供参考与学习 — 不构成投注建议。彩票结果是随机的；历史统计不影响未来开彩。',
    'ana.explain': '', // placeholder, dynamic version used

    // ---- dynamic keys (Chinese versions of EN table above) ----
    'r.noDraw': '{date} 没有开彩。开彩日为周三/六/日，另有特别开彩的周二 — 用 ‹ › 跳到最近的开彩日。',
    'r.pendingNo': '这期成绩还没出来。',
    'r.pendingLatest': '最新可查：',
    'r.pendingNone': '数据中没有更早的开彩。',
    'r.specialDraw': '特别开彩',
    'tier.1': '头奖', 'tier.2': '二奖', 'tier.3': '三奖', 'tier.4': '特别奖', 'tier.5': '安慰奖',
    'ticket.special': '特别奖', 'ticket.consolation': '安慰奖',
    'wl.h.number': '号码', 'wl.h.on': '{date} 成绩', 'wl.h.total': '总中奖', 'wl.h.last': '上次中奖',
    'wl.limit': '最多只能保存30个号码。',
    'op.ALL': '全部公司', 'op.M': '万能', 'op.D': '大马彩', 'op.T': '多多',
    'wd.0': '星期日', 'wd.1': '星期一', 'wd.2': '星期二', 'wd.3': '星期三',
    'wd.4': '星期四', 'wd.5': '星期五', 'wd.6': '星期六',
    's.t.draws': '范围内期数', 's.t.numbers': '中奖号码总数', 's.t.hot': '最热号码',
    's.t.wins': '中了{n}次', 's.t.distinct': '出现过的不同号码', 's.t.of10k': '（共10,000个可能）',
    's.hotSub': '按中奖次数排名前15 · {tiers} · {range}。公平彩票下每个号码的期望中奖次数：{exp}。',
    's.top3': '头三奖', 's.all23': '全部23个奖项',
    's.lastYears': '最近{n}年', 's.allHist': '全部历史',
    's.h.number': '号码', 's.h.lastSeen': '上次开出', 's.h.daysAbsent': '未开天数', 's.h.totalWins': '总中奖',
    's.winsTip': '中了{n}次',
    's.heatTip': '数字{d}在第{p}位',
    'c.err': '请输入4位数字（0000–9999）。',
    'c.wonSummary': '<strong>{num}{perm}</strong> 在 {from} 至 {to} 之间共中奖 <strong>{n}</strong> 次，其中 {top3} 次是头三奖。',
    'c.permSuffix': '（另加{n}种排列）',
    'c.neverWon': '<strong>{num}</strong> 在已载入的历史中从未中奖{perm}。在{draws}期里这很正常 — 大多数号码只出现寥寥几次。',
    'c.neverPerm': '（包括排列）',
    'c.h.date': '日期', 'c.h.op': '公司', 'c.h.num': '号码', 'c.h.prize': '奖项', 'c.h.drawNo': '期号',
    'a.t.total': '总中奖（任何奖项）', 'a.t.expected': '公平概率下期望 ≈ {n} 次',
    'a.t.top3': '头三奖次数', 'a.t.sinceLast': '距上次中奖', 'a.t.avgGap': '平均间隔{n}天',
    'a.t.neverSeen': '从未出现', 'a.t.permWins': '含排列的中奖数',
    'a.h.odds': '理论概率（每一期都一样，与历史无关）',
    'a.h.bet': '玩法', 'a.h.chance': '每个奖项概率', 'a.h.prize': '典型奖金（RM1注）', 'a.h.ev': '每RM1期望回报',
    'a.betStraight1': '正字 — 头奖', 'a.betStraightTop3': '正字 — 任一头三奖', 'a.betAny23': '23个奖项任中（大万）',
    'a.seePrize': '见奖金表', 'a.oneIn10k': '万分之一', 'a.threeIn10k': '万分之三', 'a.tt23': '万分之23（0.23%）',
    'a.h.weekdayWins': '按星期分的中奖记录',
    'a.noWeekday': '没有中奖记录，所以没有星期规律可显示。',
    'a.h.perm': '排列拆解（{n}种不同排列）',
    'a.permSub': '这些数字每一种排列的历史成绩，按中奖次数排名。排第一只说明过去 — 下一期每种排列的真实概率同样都是万分之一。',
    'a.h.permNum': '号码', 'a.h.permTotal': '总中奖', 'a.h.permTop3': '头三奖', 'a.h.permLast': '上次开出', 'a.h.permRatio': '对比公平期望',
    'a.yours': '你的', 'a.daysAgo': '（{n}天前）',
    'a.ibox': '想覆盖所有排列？这正是 <strong>i-Box 玩法</strong>：RM1覆盖全部{n}种排列，中头奖概率升到万分之{n} — 但奖金也除以{n}，期望回报不变，仍约每RM1拿回RM{ev}。数字怎么排、注怎么下，都改变不了这一点。',
    'a.h.wdModel': '星期模型评分（朴素贝叶斯，头三奖）',
    'a.h.day': '开彩日', 'a.h.pnd': 'P(号码 | 星期)', 'a.h.vsFair': '对比公平的1/10,000',
    'a.reality': '<strong>现实提醒：</strong>这些百分比是抽样噪音，不是优势。公平彩票中每一天的真实概率都正好是1/10,000，而且随着新开彩加入，模型的“最佳日子”会不断变化。无论选什么号码、哪一天买，每RM1大万注的期望亏损都约RM{loss}。',
    'a.exSummary': '用大白话解释“期望 ≈ {n}”和“×1.34”',
    'a.exBody': '<p>历史数据共包含{total}个中奖号码，分布在10,000个可能号码上。如果彩票公平，一个<em>平均</em>号码到现在应该中过 {total} ÷ 10,000 ≈ <strong>{n}次</strong>。这就是“期望”值。</p><div class="ex-example">像<strong>×1.34</strong>这样的比率只是说“这个号码到目前为止比平均多中了34%” — 就像朋友圈里总有一个人打牌赢得比别人多。它记录的是过去的运气，不是号码带进下一期的能力。</div><p>至于星期评分表：“P(号码 | 星期)”是模型根据该开彩日的数字频率，猜测这个号码当天的概率。公平值是1.00e-4（即0.0001 = 万分之一）。绿色/灰色的百分比显示猜测比公平值高或低多少 — 始终在噪音范围内。</p>',
    'w.h.day': '开彩日', 'w.h.draws': '期数', 'w.h.numbers': '号码数', 'w.h.chi': 'χ²（36自由度）', 'w.h.p': 'p值', 'w.h.verdict': '结论',
    'w.deviates': '⚠ 偏离均匀分布', 'w.consistent': '✓ 符合公平开彩',
    'w.someSig': '<strong>有的日子在5%水平上偏离。</strong>做多次检验时，偶尔出现低p值本来就是正常的（约1/20的概率）。只有连年持续的偏差才值得当真。',
    'w.noneSig': '<strong>没有任何一个开彩日显示偏差的证据</strong> — 每个开彩日的数字分布都符合公平、均匀的彩票。这正是χ²检验在真实4D数据上应有的结果。',
    'w.noData': '所选范围内这一天没有开彩。',
    'w.pos': '第{n}位', 'w.vsUniform': '{p}%，均匀应为10.0% · 其次：{d}',
    'w.composite': '{day}的组合“模型选号”：<strong style="font-size:16px">{num}</strong> — 基于{draws}期（{numbers}个头三奖号码）。',
    'p.title': '模型对下一期的选号 — {date}',
    'p.sub': '两个模型都采用近期加权（2年半衰期），基于{n}期过去的{day}开彩训练{scope}。“优势”是各模型的估计值对比均匀基准0.01%。',
    'p.scopeAll': '（全部公司）', 'p.scopeOp': '（{op}）',
    'p.notEnough': '这一天的数据不足。',
    'p.h.nb': '朴素贝叶斯选号 <span class="dim">（各位置数字频率独立计算）</span>',
    'p.h.mk': '马尔可夫链选号 <span class="dim">（数字间的接续规律）</span>',
    'p.vsUniform': '{sign}{pct}% 对比均匀',
    'p.edgeNote': '这些“优势”只是模型的想法，不是事实 — 运行下面的回测，看看想法碰到现实会怎样。',
    'p.testing': '回测中…',
    'p.t.replayed': '回放期数', 'p.t.topk': '每期选前{k}个号码，任何奖项都算',
    'p.t.randExp': '随机选号的期望命中', 'p.t.bar': '每个模型都必须跨过的及格线',
    'p.h.rank': '#', 'p.h.model': '模型', 'p.h.hits': '命中', 'p.h.vsRandom': '对比随机',
    'p.m.nb': '朴素贝叶斯（星期数字频率）', 'p.m.mk': '马尔可夫链（数字对）', 'p.m.hot': '热门号码（频率）',
    'p.m.rand': '随机选号（基准线）',
    'p.h.cum': '回放期间的累计命中',
    'p.cumSub': '每条线是一个模型的累计命中数；灰色虚线是随机选号的期望累计。公平彩票的特征：每条线都绕着虚线上下游走、不断穿越它。',
    'p.l.nb': '朴素贝叶斯', 'p.l.mk': '马尔可夫链', 'p.l.hot': '热门号码', 'p.l.rand': '随机（期望）',
    'p.verdict': '本次排行榜第一是<strong>{name}</strong>，×{ratio} — 但在{n}期的样本下，随机波动范围大约是×0.4–×1.7，所以上面每个模型在统计上都和基准线打平。等新开彩进来再跑一次，看排名洗牌：这种洗牌<em>本身</em>就是结论。公平彩票让模型互相竞争，但从不让任何一个赢。',
    'banner.fresh': '🔄 有新成绩了 — 点击刷新',
    'share.results': '分享', 'share.analysis': '分享分析', 'share.copied': '已复制！贴到WhatsApp吧。',
    'share.resTitle': '🎱 大马4D成绩 — {date}',
    'share.noResult': '（成绩未出）',
    'share.via': '来自 Malaysia 4D Insights',
    'share.anaTitle': '🔎 4D号码分析：{num}',
    'share.anaWins': '历史总中奖：{n}次（期望 ≈ {exp}）',
    'share.anaTop3': '头三奖：{n}次',
    'share.anaLast': '上次中奖：{date}',
    'share.anaNever': '历史记录中从未中奖',
    'share.anaHonest': '提醒：每个号码每期都是万分之一，过去中奖不改变未来概率！',
  };

  function t(key, params = {}) {
    let s;
    if (lang === 'zh' && ZH[key] !== undefined && ZH[key] !== '') s = ZH[key];
    else s = EN[key] !== undefined ? EN[key] : (captured[key] !== undefined ? captured[key] : key);
    for (const [k, v] of Object.entries(params)) s = s.split('{' + k + '}').join(v);
    return s;
  }

  function applyStatic() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.dataset.i18n;
      if (captured[key] === undefined) captured[key] = el.innerHTML;
      el.innerHTML = (lang === 'zh' && ZH[key]) ? ZH[key] : captured[key];
    });
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
      const key = el.dataset.i18nPh;
      if (captured[key] === undefined) captured[key] = el.getAttribute('placeholder') || '';
      el.setAttribute('placeholder', (lang === 'zh' && ZH[key]) ? ZH[key] : captured[key]);
    });
    document.documentElement.lang = lang === 'zh' ? 'zh' : 'en';
  }

  function setLang(l) {
    lang = l;
    localStorage.setItem('my4d-lang', l);
    applyStatic();
  }

  return { t, applyStatic, setLang, get lang() { return lang; } };
})();
const t = I18N.t;
