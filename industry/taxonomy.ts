// Web3 试运行分类；评分门槛尚未通过人工样本校准。
export const CATEGORIES = [
  { key: "policy", tagColor: "orange", label: "宏观与政策", section: "宏观与政策", guide: "利率、通胀、就业、加密法规、监管与 ETF 审批。提案、通过、生效和执法是不同阶段；宏观发布不等于已经影响币价。" },
  { key: "protocol", tagColor: "indigo", label: "协议与技术", section: "协议与技术", guide: "公链升级、延期、客户端、基础设施和协议功能变化。明确主网、测试网与版本；已发生攻击归安全事件。" },
  { key: "industry", tagColor: "turquoise", label: "市场与机构", section: "市场与机构", guide: "BTC、ETH 等主流币的机构行为、ETF 资金流、交易所与稳定币动态、链上数据及有明确关联的突发事件。数据与推断分开，不把价格播报编成原因。" },
  { key: "security", tagColor: "red", label: "安全事件", section: "安全事件", guide: "攻击、漏洞、钓鱼、资产风险、服务故障与恢复。标明受影响链、资产与范围，区分怀疑、确认和辟谣。" },
  { key: "airdrop", tagColor: "green", label: "空投与活动", section: "空投与活动", guide: "代币领取、资格查询、积分、交互任务和交易所活动。奖励确定性、资格、成本、资金占用与截止时间必须区分；NFT 铸造和白名单归 NFT。" },
  { key: "nft", tagColor: "violet", label: "NFT", section: "NFT", guide: "NFT 铸造、白名单、领取及相关活动，明确链、阶段、标价、资格与时间。零标价不等于零成本或公开参与，平台展示不等于可以铸造。" },
  { key: "opinion", tagColor: "purple", label: "观点与教程", section: "观点与教程", guide: "以解释、预测、研究、方法或操作教程为核心的内容。新闻附有评论仍按主要事件分类；观点、相关性和交易建议不能冒充事实。", commentary: true },
] as const satisfies ReadonlyArray<{ key: string; tagColor: string; label: string; feedLabel?: string; section: string; guide: string; commentary?: true }>;

export const RELEASE: { category: string; tag: string; unit: string } | null = null;
export const PLAIN_TERMS: readonly string[] = ["btc", "eth", "web3", "nft", "defi", "etf", "cpi", "fomc", "api", "tvl", "gas", "apr", "apy", "美元", "比特币", "以太坊"];
export const ITEM_TYPES = ["protocol_update", "product_launch", "activity", "research_paper", "industry_event", "opinion_analysis", "tutorial_explainer"] as const;
export const CATEGORY_TAGS = ["宏观/政策", "协议/技术", "市场/机构", "安全事件", "空投/活动", "NFT活动", "产品更新", "论文/研究", "观点/分析", "教程/实践", "其他"] as const;
export const TOPIC_TAGS = ["BTC", "ETH", "ETF", "稳定币", "DeFi", "Layer2", "链上资金", "合约市场", "主网", "测试网", "空投", "积分", "白名单", "领取", "铸造", "NFT", "未证实"] as const;
export const ENTITY_TAGS = ["Bitcoin", "Ethereum", "Binance", "Coinbase", "美联储", "BLS", "SEC", "OpenSea", "SlowMist", "Lookonchain", "DefiLlama", "Galxe"] as const;
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  政策: "宏观/政策", 监管: "宏观/政策", 法规: "宏观/政策", 宏观: "宏观/政策",
  升级: "协议/技术", 技术: "协议/技术", 安全: "安全事件", 黑客: "安全事件",
  空投活动: "空投/活动", NFT活动: "NFT活动", 教程: "教程/实践", 研究: "论文/研究",
  观点: "观点/分析", 分析: "观点/分析", 行业动态: "市场/机构", 比特币: "BTC", 以太坊: "ETH",
  币安: "Binance", 慢雾: "SlowMist",
};

export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; orgNames?: string[]; otherNames?: string[] }> = {
  bitcoin: { name: "Bitcoin", displayTag: "Bitcoin", aliases: ["Bitcoin", "BTC", "比特币"], orgNames: ["Bitcoin Core"] },
  ethereum: { name: "Ethereum", displayTag: "Ethereum", aliases: ["Ethereum", "ETH", "以太坊", "Ethereum Foundation"], orgNames: ["Ethereum Foundation", "以太坊基金会"], otherNames: ["EF"] },
  binance: { name: "Binance", displayTag: "Binance", aliases: ["Binance", "币安"], orgNames: ["Binance", "币安"], otherNames: ["BinanceWallet", "Binance Wallet", "Binance_Announcement", "binancezh", "币安钱包"] },
  coinbase: { name: "Coinbase", displayTag: "Coinbase", aliases: ["Coinbase"], orgNames: ["Coinbase"] },
  fed: { name: "美联储", displayTag: "美联储", aliases: ["Federal Reserve", "FOMC", "美联储"], orgNames: ["Federal Reserve", "美联储"] },
  bls: { name: "BLS", displayTag: "BLS", aliases: ["Bureau of Labor Statistics", "BLS", "美国劳工统计局"] },
  sec: { name: "SEC", displayTag: "SEC", aliases: ["Securities and Exchange Commission", "SEC", "美国证券交易委员会"] },
  opensea: { name: "OpenSea", displayTag: "OpenSea", aliases: ["OpenSea"], orgNames: ["OpenSea"] },
  slowmist: { name: "SlowMist", displayTag: "SlowMist", aliases: ["SlowMist", "慢雾"], otherNames: ["SlowMist_Team"] },
  lookonchain: { name: "Lookonchain", displayTag: "Lookonchain", aliases: ["Lookonchain"] },
  defillama: { name: "DefiLlama", displayTag: "DefiLlama", aliases: ["DefiLlama"] },
  galxe: { name: "Galxe", displayTag: "Galxe", aliases: ["Galxe"] },
  coindesk: { name: "CoinDesk", displayTag: null, aliases: ["CoinDesk"] },
  panews: { name: "PANews", displayTag: null, aliases: ["PANews"] },
};

export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "bitcoin", name: "Bitcoin", patterns: [/\bbitcoin\b|\bbtc\b|比特币/i] },
  { id: "ethereum", name: "Ethereum", patterns: [/\bethereum\b|\beth\b|以太坊/i] },
  { id: "binance", name: "Binance", patterns: [/binance|币安/i] },
  { id: "coinbase", name: "Coinbase", patterns: [/coinbase/i] },
  { id: "fed", name: "美联储", patterns: [/federal reserve|\bfomc\b|美联储/i] },
  { id: "bls", name: "BLS", patterns: [/bureau of labor statistics|\bbls\b|美国劳工统计局/i] },
  { id: "sec", name: "SEC", patterns: [/securities and exchange commission|\bSEC\b|美国证券交易委员会/] },
  { id: "opensea", name: "OpenSea", patterns: [/opensea/i] },
  { id: "slowmist", name: "SlowMist", patterns: [/slowmist|慢雾/i] },
  { id: "lookonchain", name: "Lookonchain", patterns: [/lookonchain/i] },
  { id: "defillama", name: "DefiLlama", patterns: [/defillama/i] },
  { id: "galxe", name: "Galxe", patterns: [/galxe/i] },
];
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "bitcoin", domains: ["bitcoincore.org"] },
  { entityId: "ethereum", domains: ["ethereum.org"] },
  { entityId: "binance", domains: ["binance.com"] },
  { entityId: "coinbase", domains: ["coinbase.com"] },
  { entityId: "fed", domains: ["federalreserve.gov"] },
  { entityId: "bls", domains: ["bls.gov"] },
  { entityId: "sec", domains: ["sec.gov"] },
  { entityId: "opensea", domains: ["opensea.io"] },
  { entityId: "slowmist", domains: ["slowmist.com", "slowmist.io"] },
  { entityId: "lookonchain", domains: ["lookonchain.com"] },
  { entityId: "defillama", domains: ["defillama.com", "llama.fi"] },
  { entityId: "galxe", domains: ["galxe.com"] },
];
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "binance", pattern: /@BinanceWallet\b|@binancezh\b|@Binance_Announcement\b/i },
  { entityId: "slowmist", pattern: /@SlowMist_Team\b/i },
];
