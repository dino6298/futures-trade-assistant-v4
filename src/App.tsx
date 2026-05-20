import React, { useEffect, useState } from "react";

type Side = "LONG" | "SHORT" | "NEUTRAL";
type RiskMode = "SAFE" | "NORMAL" | "AGGRESSIVE";
type DataSourceMode = "MOCK" | "BINANCE_DIRECT" | "WORKER_PROXY";
type SymbolScanMode = "CORE" | "EXTENDED" | "CUSTOM" | "AUTO_SAFE";
type ForwardStatus =
  | "NO_ENTRY"
  | "EXPIRED"
  | "ENTRY_HIT"
  | "TP1_HIT"
  | "TP2_HIT"
  | "SL_HIT"
  | "BE_HIT"
  | "WAITING_ENTRY";
type ActionLabel =
  | "ENTRY_OK"
  | "WAIT_PULLBACK"
  | "WAIT_RETEST"
  | "HIGH_RISK"
  | "BAD_RR"
  | "AVOID"
  | "NO_TRADE";
type Grade = "A+" | "A" | "B" | "C" | "NO_TRADE";
type MarketRegime =
  | "TREND_UP"
  | "TREND_DOWN"
  | "SIDEWAY"
  | "CHOPPY"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY";
type BtcBias =
  | "BTC_BULLISH"
  | "BTC_BEARISH"
  | "BTC_NEUTRAL"
  | "BTC_DUMP_RISK"
  | "BTC_PUMP_RISK";

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type Ticker24h = {
  symbol: string;
  lastPrice: number;
  quoteVolume: number;
  priceChangePercent: number;
  count: number;
};

type AppConfig = {
  capital: number;
  riskMode: RiskMode;
  maxActiveTrades: number;
  timeframe: "5m" | "15m" | "1h";
  dataSourceMode: DataSourceMode;
  workerProxyUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  symbolScanMode: SymbolScanMode;
  customSymbolsText: string;
  forwardTestLimit: number;
  autoUniverseLimit: number;
  autoMinQuoteVolume: number;
  autoMaxAbsChangePct: number;
};

type SymbolRule = {
  symbol: string;
  minNotional: number;
  minQty: number;
  stepSize: number;
};

type Signal = {
  id: string;
  symbol: string;
  side: Side;
  grade: Grade;
  score: number;
  action: ActionLabel;
  setup: string;
  currentPrice: number;
  entryLow: number;
  entryHigh: number;
  bestEntry: number;
  sl: number;
  tp1: number;
  tp2: number;
  leverage: number;
  margin: number;
  riskUsdt: number;
  rr: number;
  regime: MarketRegime;
  btcBias: BtcBias;
  signalTime: number;
  reasons: string[];
  warnings: string[];
  blocks: string[];
};

type ForwardLog = {
  signalId: string;
  status: ForwardStatus;
  resultR: number;
  replay: string[];
  failureReason?: string;
  testedAt?: number;
  forwardRunId?: string;
  signalSnapshot?: Signal;
  entryHit?: boolean;
  entryHitMinutes?: number;
  maxFavorableR?: number;
  maxAdverseR?: number;
};

type LearningBias = "GOOD" | "NEUTRAL" | "WEAK";

type LearningStat = {
  key: string;
  label: string;
  sampleSize: number;
  winrate: number;
  avgR: number;
  entryHitRate: number;
  noEntryRate: number;
  slRate: number;
  tp1Rate: number;
  tp2Rate: number;
  avgMaxFavorableR: number;
  avgMaxAdverseR: number;
  commonFailureReason?: string;
  bias: LearningBias;
};


type AuditLog = {
  id: string;
  at: number;
  message: string;
};

type PersistentState = {
  signals: Signal[];
  forwardLogs: ForwardLog[];
  auditLogs: AuditLog[];
  config: AppConfig;
  darkMode?: boolean;
  learningStats?: LearningStat[];
  updatedAt: number;
};

const CORE_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "LINKUSDT",
  "OPUSDT",
  "ARBUSDT",
  "DOGEUSDT",
];

const EXTENDED_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "DOTUSDT",
  "TRXUSDT",
  "MATICUSDT",
  "NEARUSDT",
  "ATOMUSDT",
  "APTUSDT",
  "ARBUSDT",
  "OPUSDT",
  "SUIUSDT",
  "INJUSDT",
  "TIAUSDT",
  "SEIUSDT",
  "WIFUSDT",
  "PEPEUSDT",
  "FETUSDT",
  "FILUSDT",
  "LTCUSDT",
  "BCHUSDT",
  "UNIUSDT",
  "AAVEUSDT",
  "ETCUSDT",
];

const SYMBOLS = CORE_SYMBOLS;

const LOCAL_KEY = "fta_v4_standalone_state";

const FALLBACK_SYMBOL_RULES: Record<string, SymbolRule> = {
  BTCUSDT: { symbol: "BTCUSDT", minNotional: 100, minQty: 0.001, stepSize: 0.001 },
  ETHUSDT: { symbol: "ETHUSDT", minNotional: 20, minQty: 0.001, stepSize: 0.001 },
  BNBUSDT: { symbol: "BNBUSDT", minNotional: 20, minQty: 0.01, stepSize: 0.01 },
  SOLUSDT: { symbol: "SOLUSDT", minNotional: 10, minQty: 0.1, stepSize: 0.1 },
  LINKUSDT: { symbol: "LINKUSDT", minNotional: 5, minQty: 0.1, stepSize: 0.1 },
  OPUSDT: { symbol: "OPUSDT", minNotional: 5, minQty: 0.1, stepSize: 0.1 },
  ARBUSDT: { symbol: "ARBUSDT", minNotional: 5, minQty: 0.1, stepSize: 0.1 },
  DOGEUSDT: { symbol: "DOGEUSDT", minNotional: 5, minQty: 1, stepSize: 1 },
  XRPUSDT: { symbol: "XRPUSDT", minNotional: 5, minQty: 0.1, stepSize: 0.1 },
  ADAUSDT: { symbol: "ADAUSDT", minNotional: 5, minQty: 1, stepSize: 1 },
  AVAXUSDT: { symbol: "AVAXUSDT", minNotional: 5, minQty: 0.1, stepSize: 0.1 },
  DOTUSDT: { symbol: "DOTUSDT", minNotional: 5, minQty: 0.1, stepSize: 0.1 },
  TRXUSDT: { symbol: "TRXUSDT", minNotional: 5, minQty: 1, stepSize: 1 },
  MATICUSDT: { symbol: "MATICUSDT", minNotional: 5, minQty: 1, stepSize: 1 },
  NEARUSDT: { symbol: "NEARUSDT", minNotional: 5, minQty: 0.1, stepSize: 0.1 },
  ATOMUSDT: { symbol: "ATOMUSDT", minNotional: 5, minQty: 0.01, stepSize: 0.01 },
  APTUSDT: { symbol: "APTUSDT", minNotional: 5, minQty: 0.1, stepSize: 0.1 },
  SUIUSDT: { symbol: "SUIUSDT", minNotional: 5, minQty: 0.1, stepSize: 0.1 },
  INJUSDT: { symbol: "INJUSDT", minNotional: 5, minQty: 0.1, stepSize: 0.1 },
  TIAUSDT: { symbol: "TIAUSDT", minNotional: 5, minQty: 0.1, stepSize: 0.1 },
  SEIUSDT: { symbol: "SEIUSDT", minNotional: 5, minQty: 1, stepSize: 1 },
  WIFUSDT: { symbol: "WIFUSDT", minNotional: 5, minQty: 1, stepSize: 1 },
  PEPEUSDT: { symbol: "PEPEUSDT", minNotional: 5, minQty: 1000, stepSize: 1000 },
  FETUSDT: { symbol: "FETUSDT", minNotional: 5, minQty: 1, stepSize: 1 },
  FILUSDT: { symbol: "FILUSDT", minNotional: 5, minQty: 0.1, stepSize: 0.1 },
  LTCUSDT: { symbol: "LTCUSDT", minNotional: 5, minQty: 0.001, stepSize: 0.001 },
  BCHUSDT: { symbol: "BCHUSDT", minNotional: 5, minQty: 0.001, stepSize: 0.001 },
  UNIUSDT: { symbol: "UNIUSDT", minNotional: 5, minQty: 0.1, stepSize: 0.1 },
  AAVEUSDT: { symbol: "AAVEUSDT", minNotional: 5, minQty: 0.01, stepSize: 0.01 },
  ETCUSDT: { symbol: "ETCUSDT", minNotional: 5, minQty: 0.01, stepSize: 0.01 },
};

const DEFAULT_SYMBOL_RULE: SymbolRule = {
  symbol: "DEFAULT",
  minNotional: 5,
  minQty: 0,
  stepSize: 0,
};

const DEFAULT_CONFIG: AppConfig = {
  capital: 15,
  riskMode: "NORMAL",
  maxActiveTrades: 2,
  timeframe: "15m",
  dataSourceMode: "WORKER_PROXY",
  workerProxyUrl: "https://dry-salad-e656.thong06021998.workers.dev",
  supabaseUrl: "https://nzkkfaougaqvxzfurtgv.supabase.co",
  supabaseAnonKey: "sb_publishable_RkQ8P-PF6KfPvD7SIOJ4Tw_BK3ntaQb",
  symbolScanMode: "CORE",
  customSymbolsText: CORE_SYMBOLS.join(", "),
  forwardTestLimit: 6,
  autoUniverseLimit: 30,
  autoMinQuoteVolume: 50000000,
  autoMaxAbsChangePct: 18,
};

const SCHEMA_SQL = `
drop table if exists fta_forward_logs cascade;
drop table if exists fta_signals cascade;
drop table if exists fta_settings cascade;
drop table if exists fta_audit_logs cascade;

create table fta_signals (
  signal_id text primary key,
  payload jsonb not null,
  updated_at timestamptz default now()
);

create table fta_forward_logs (
  id uuid primary key default gen_random_uuid(),
  signal_id text unique,
  status text not null,
  result_r numeric,
  payload jsonb not null,
  updated_at timestamptz default now()
);

create table fta_settings (
  id text primary key default 'default',
  payload jsonb not null,
  updated_at timestamptz default now()
);

create table fta_audit_logs (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  payload jsonb,
  created_at timestamptz default now()
);
`.trim();

const RLS_SQL = `
alter table fta_signals enable row level security;
alter table fta_forward_logs enable row level security;
alter table fta_settings enable row level security;
alter table fta_audit_logs enable row level security;

create policy "fta_signals_all_anon" on fta_signals for all using (true) with check (true);
create policy "fta_forward_logs_all_anon" on fta_forward_logs for all using (true) with check (true);
create policy "fta_settings_all_anon" on fta_settings for all using (true) with check (true);
create policy "fta_audit_logs_all_anon" on fta_audit_logs for all using (true) with check (true);
`.trim();

const WORKER_CODE = `
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    try {
      if (url.pathname === "/klines") return await handleKlines(request, url, ctx);
      if (url.pathname === "/exchangeInfo") return await handleProxy(request, "/fapi/v1/exchangeInfo", 3600, ctx);
      if (url.pathname === "/ticker24hr") return await handleProxy(request, "/fapi/v1/ticker/24hr", 30, ctx);
      if (url.pathname === "/fapi/v1/exchangeInfo") return await handleProxy(request, "/fapi/v1/exchangeInfo", 3600, ctx);
      if (url.pathname === "/fapi/v1/ticker/24hr") return await handleProxy(request, "/fapi/v1/ticker/24hr", 30, ctx);

      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: "Worker runtime error",
          detail: err instanceof Error ? err.message : String(err),
        }),
        { status: 500, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      );
    }
  },
};

async function handleKlines(request, url, ctx) {
  const symbol = (url.searchParams.get("symbol") || "BTCUSDT").toUpperCase();
  const interval = url.searchParams.get("interval") || "1m";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 240), 1), 1000);

  return handleProxy(
    request,
    "/fapi/v1/klines?symbol=" +
      encodeURIComponent(symbol) +
      "&interval=" +
      encodeURIComponent(interval) +
      "&limit=" +
      encodeURIComponent(String(limit)),
    15,
    ctx,
    (raw) =>
      raw.map((k) => ({
        time: Number(k[0]),
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        volume: Number(k[5]),
      }))
  );
}

async function handleProxy(request, path, maxAge, ctx, transform) {
  const cacheKey = new Request(new URL(request.url).toString(), request);
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;

  const raw = await fetchFromBinance(path);
  const data = transform ? transform(raw) : raw;
  const out = jsonResponse(data, maxAge);
  ctx.waitUntil(caches.default.put(cacheKey, out.clone()));
  return out;
}

async function fetchFromBinance(path) {
  const endpoints = ["https://fapi.binance.com", "https://fapi1.binance.com", "https://fapi2.binance.com", "https://fapi3.binance.com"];
  const errors = [];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint + path, {
        headers: { "User-Agent": "Mozilla/5.0 CloudflareWorker FuturesTradeAssistantV4", Accept: "application/json" },
      });

      if (!res.ok) {
        const text = await res.text();
        errors.push(endpoint + " -> " + res.status + " " + text.slice(0, 160));
        continue;
      }

      return await res.json();
    } catch (err) {
      errors.push(endpoint + " -> " + (err instanceof Error ? err.message : String(err)));
    }
  }

  throw new Error("All Binance futures endpoints failed: " + errors.join(" | "));
}

function jsonResponse(data, maxAge) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=" + maxAge,
    },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
`.trim();

function intervalMs(tf: string) {
  if (tf === "1m") return 60_000;
  if (tf === "5m") return 300_000;
  if (tf === "15m") return 900_000;
  if (tf === "1h") return 3_600_000;
  return 60_000;
}

function rnd(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}


function normalizeSymbolInput(raw: string) {
  return raw
    .split(/[\s,;]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .map((item) => (item.endsWith("USDT") ? item : `${item}USDT`));
}

function uniqueList(items: string[]) {
  return Array.from(new Set(items));
}

function getScanSymbols(config: AppConfig) {
  if (config.symbolScanMode === "EXTENDED") return EXTENDED_SYMBOLS;
  if (config.symbolScanMode === "CUSTOM") {
    const custom = normalizeSymbolInput(config.customSymbolsText || "");
    return custom.length ? uniqueList(custom) : CORE_SYMBOLS;
  }
  return CORE_SYMBOLS;
}

function uniqueSignalsById(inputSignals: Signal[]) {
  const map = new Map<string, Signal>();

  for (const signal of inputSignals) {
    if (!signal?.id) continue;
    map.set(signal.id, signal);
  }

  return Array.from(map.values()).sort((a, b) => b.signalTime - a.signalTime || b.score - a.score);
}

function getForwardTestSignals(signals: Signal[], limit: number) {
  const allSavedSignals = uniqueSignalsById(signals);

  if (limit <= 0) {
    return allSavedSignals;
  }

  return keepLatestSignalPerSymbol(signals).slice(0, limit);
}

function isUnresolvedForwardLog(log: ForwardLog) {
  return log.status === "NO_ENTRY" || log.status === "ENTRY_HIT" || log.status === "WAITING_ENTRY";
}

function getForwardTestTargets(signals: Signal[], forwardLogs: ForwardLog[], limit: number) {
  if (limit === -1) {
    const signalMap = new Map(signals.map((signal) => [signal.id, signal]));
    const targets: Signal[] = [];

    for (const log of forwardLogs) {
      if (!isUnresolvedForwardLog(log)) continue;

      const signal = signalMap.get(log.signalId) || log.signalSnapshot;
      if (!signal) continue;

      targets.push(signal);
    }

    return uniqueSignalsById(targets);
  }

  return getForwardTestSignals(signals, limit);
}

function basePrice(symbol: string) {
  const map: Record<string, number> = {
    BTCUSDT: 100000,
    ETHUSDT: 3200,
    SOLUSDT: 170,
    BNBUSDT: 620,
    LINKUSDT: 16,
    OPUSDT: 2,
    ARBUSDT: 1.1,
    DOGEUSDT: 0.17,
  };
  return map[symbol] || 100;
}

function fmt(n: number) {
  if (!Number.isFinite(n)) return "-";
  if (n >= 1000) return n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
  if (n >= 1) return n.toLocaleString("vi-VN", { maximumFractionDigits: 4 });
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 6 });
}

function time(ts: number) {
  return new Date(ts).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function viAction(a: ActionLabel) {
  const map: Record<ActionLabel, string> = {
    ENTRY_OK: "Có thể vào lệnh",
    WAIT_PULLBACK: "Chờ hồi về",
    WAIT_RETEST: "Chờ retest",
    HIGH_RISK: "Rủi ro cao",
    BAD_RR: "RR xấu",
    AVOID: "Tránh lệnh",
    NO_TRADE: "Không trade",
  };
  return map[a];
}

function viRegime(r: MarketRegime) {
  const map: Record<MarketRegime, string> = {
    TREND_UP: "Xu hướng tăng",
    TREND_DOWN: "Xu hướng giảm",
    SIDEWAY: "Đi ngang",
    CHOPPY: "Nhiễu / khó trade",
    HIGH_VOLATILITY: "Biến động mạnh",
    LOW_VOLATILITY: "Biến động thấp",
  };
  return map[r];
}

function viStatus(s: ForwardStatus) {
  const map: Record<ForwardStatus, string> = {
    NO_ENTRY: "Chưa khớp entry",
    EXPIRED: "Hết hạn",
    ENTRY_HIT: "Đã khớp entry",
    TP1_HIT: "Đã chạm TP1",
    TP2_HIT: "Đã chạm TP2",
    SL_HIT: "Đã chạm SL",
    BE_HIT: "Về hòa vốn",
    WAITING_ENTRY: "Đang chờ entry",
  };
  return map[s];
}

function isTerminalForwardStatus(status?: ForwardStatus) {
  return status === "TP1_HIT" || status === "TP2_HIT" || status === "SL_HIT" || status === "BE_HIT" || status === "EXPIRED";
}

function displayAction(signal: Signal, log?: ForwardLog) {
  if (!log) return viAction(signal.action);

  if (log.status === "SL_HIT") return "Đã chạm SL";
  if (log.status === "TP1_HIT") return "Đã chạm TP1";
  if (log.status === "TP2_HIT") return "Đã chạm TP2";
  if (log.status === "BE_HIT") return "Đã về hòa vốn";
  if (log.status === "EXPIRED") return "Tín hiệu hết hạn";
  if (log.status === "NO_ENTRY") return "Chưa khớp Entry tốt nhất";
  if (log.status === "ENTRY_HIT") return "Đã vào lệnh";

  return viAction(signal.action);
}

function displayActionTone(
  signal: Signal,
  log?: ForwardLog
): "green" | "red" | "yellow" | "blue" | "purple" | "neutral" {
  if (!log) {
    if (signal.action === "ENTRY_OK") return "green";
    if (signal.action === "HIGH_RISK" || signal.action === "BAD_RR" || signal.action === "AVOID" || signal.action === "NO_TRADE") {
      return "red";
    }
    return "yellow";
  }

  if (log.status === "TP1_HIT" || log.status === "TP2_HIT" || log.status === "BE_HIT") return "green";
  if (log.status === "SL_HIT") return "red";
  if (log.status === "ENTRY_HIT") return "blue";
  if (log.status === "NO_ENTRY" || log.status === "EXPIRED") return "neutral";

  return "yellow";
}

function orderCompatibilityWarnings(signal: Signal) {
  const warnings: string[] = [];
  const notional = signal.margin * signal.leverage;
  const fallbackRule = getFallbackRule(signal.symbol);
  const fallbackMinNotional = fallbackRule.minNotional;

  if (notional < fallbackMinNotional) {
    warnings.push(`Notional ước tính ${roundUp(notional, 2)} USDT thấp hơn rule dự phòng của ${signal.symbol}: ${fallbackMinNotional} USDT.`);
  }

  return warnings;
}

function openBinanceFutures(symbol: string) {
  window.open(`https://www.binance.com/vi/futures/${symbol}`, "_blank", "noopener,noreferrer");
}

function roundUp(value: number, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.ceil(value * factor) / factor;
}

function getFallbackRule(symbol: string): SymbolRule {
  return FALLBACK_SYMBOL_RULES[symbol] || { ...DEFAULT_SYMBOL_RULE, symbol };
}

function getRequiredMarginBySymbol(symbol: string, price: number, leverage: number, rules: Record<string, SymbolRule>) {
  const rule = rules[symbol] || getFallbackRule(symbol);
  const minQtyNotional = rule.minQty > 0 ? rule.minQty * price : 0;
  const requiredNotional = Math.max(rule.minNotional || 0, minQtyNotional || 0, DEFAULT_SYMBOL_RULE.minNotional);
  const requiredMargin = roundUp(requiredNotional / Math.max(leverage, 1) + 0.02, 2);

  return {
    rule,
    minQtyNotional,
    requiredNotional,
    requiredMargin,
  };
}

function parseSymbolRules(raw: any): Record<string, SymbolRule> {
  const out: Record<string, SymbolRule> = {};

  if (!raw || !Array.isArray(raw.symbols)) return out;

  for (const symbolInfo of raw.symbols) {
    if (!symbolInfo || typeof symbolInfo.symbol !== "string") continue;
    if (!symbolInfo.symbol.endsWith("USDT")) continue;

    const filters = Array.isArray(symbolInfo.filters) ? symbolInfo.filters : [];
    const minNotionalFilter = filters.find((f: any) => f.filterType === "MIN_NOTIONAL" || f.filterType === "NOTIONAL");
    const lotFilter =
      filters.find((f: any) => f.filterType === "MARKET_LOT_SIZE") ||
      filters.find((f: any) => f.filterType === "LOT_SIZE");

    out[symbolInfo.symbol] = {
      symbol: symbolInfo.symbol,
      minNotional: Number(minNotionalFilter?.notional ?? minNotionalFilter?.minNotional ?? DEFAULT_SYMBOL_RULE.minNotional),
      minQty: Number(lotFilter?.minQty ?? 0),
      stepSize: Number(lotFilter?.stepSize ?? 0),
    };
  }

  return out;
}


function parseTradableFuturesSymbols(raw: any) {
  if (!raw || !Array.isArray(raw.symbols)) return [];

  return raw.symbols
    .filter((item: any) => {
      return (
        item &&
        item.symbol &&
        item.contractType === "PERPETUAL" &&
        item.status === "TRADING" &&
        item.quoteAsset === "USDT" &&
        item.symbol.endsWith("USDT")
      );
    })
    .map((item: any) => String(item.symbol));
}

function normalizeTicker24h(row: any): Ticker24h {
  return {
    symbol: String(row.symbol || ""),
    lastPrice: Number(row.lastPrice || 0),
    quoteVolume: Number(row.quoteVolume || 0),
    priceChangePercent: Number(row.priceChangePercent || 0),
    count: Number(row.count || 0),
  };
}

async function fetchBinanceJson(config: AppConfig, path: string) {
  if (config.dataSourceMode === "WORKER_PROXY") {
    const res = await fetch(`${config.workerProxyUrl.replace(/\/$/, "")}${path}`);
    if (!res.ok) throw new Error(`Worker API lỗi ${res.status}`);
    return res.json();
  }

  const res = await fetch(`https://fapi.binance.com${path}`);
  if (!res.ok) throw new Error(`Binance API lỗi ${res.status}`);
  return res.json();
}

async function fetchAutoSafeUniverse(config: AppConfig) {
  if (config.dataSourceMode === "MOCK") return EXTENDED_SYMBOLS.slice(0, config.autoUniverseLimit);

  const [exchangeInfo, tickerRaw] = await Promise.all([
    fetchBinanceJson(config, "/fapi/v1/exchangeInfo"),
    fetchBinanceJson(config, "/fapi/v1/ticker/24hr"),
  ]);

  const tradable = new Set(parseTradableFuturesSymbols(exchangeInfo));
  const minVolume = Math.max(0, config.autoMinQuoteVolume || 0);
  const maxAbsChange = Math.max(1, config.autoMaxAbsChangePct || DEFAULT_CONFIG.autoMaxAbsChangePct);

  const ranked = (Array.isArray(tickerRaw) ? tickerRaw : [])
    .map(normalizeTicker24h)
    .filter((ticker) => {
      if (!ticker.symbol.endsWith("USDT")) return false;
      if (!tradable.has(ticker.symbol)) return false;
      if (!Number.isFinite(ticker.lastPrice) || ticker.lastPrice <= 0) return false;
      if (!Number.isFinite(ticker.quoteVolume) || ticker.quoteVolume < minVolume) return false;
      if (!Number.isFinite(ticker.priceChangePercent)) return false;
      if (Math.abs(ticker.priceChangePercent) > maxAbsChange) return false;
      return true;
    })
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .map((ticker) => ticker.symbol);

  const merged = uniqueList([...CORE_SYMBOLS, ...ranked]);
  return merged.slice(0, Math.max(CORE_SYMBOLS.length, config.autoUniverseLimit || DEFAULT_CONFIG.autoUniverseLimit));
}

async function resolveScanSymbols(config: AppConfig) {
  if (config.symbolScanMode === "AUTO_SAFE") return fetchAutoSafeUniverse(config);
  return uniqueList(getScanSymbols(config));
}

async function fetchSymbolRules(config: AppConfig): Promise<Record<string, SymbolRule>> {
  try {
    if (config.dataSourceMode === "MOCK") return { ...FALLBACK_SYMBOL_RULES };

    const raw = await fetchBinanceJson(config, "/fapi/v1/exchangeInfo");
    const parsed = parseSymbolRules(raw);

    return { ...FALLBACK_SYMBOL_RULES, ...parsed };
  } catch {
    return { ...FALLBACK_SYMBOL_RULES };
  }
}

function generateMockCandles(symbol: string, interval: string, limit = 240): Candle[] {
  const step = intervalMs(interval);
  const now = Date.now();
  const start = now - limit * step;
  let price = basePrice(symbol);
  const candles: Candle[] = [];

  for (let i = 0; i < limit; i += 1) {
    const t = start + i * step;
    const drift = (rnd(t / step + symbol.charCodeAt(0)) - 0.49) * 0.006;
    const wick = rnd(t / step + symbol.length) * 0.004;
    const open = price;
    const close = price * (1 + drift);
    const high = Math.max(open, close) * (1 + wick);
    const low = Math.min(open, close) * (1 - wick);
    const volume = 1000 + rnd(t / step + 99) * 9000;
    candles.push({ time: t, open, high, low, close, volume });
    price = close;
  }

  return candles;
}

function normalizeCandle(row: any): Candle {
  return {
    time: Number(row.time ?? row[0]),
    open: Number(row.open ?? row[1]),
    high: Number(row.high ?? row[2]),
    low: Number(row.low ?? row[3]),
    close: Number(row.close ?? row[4]),
    volume: Number(row.volume ?? row[5]),
  };
}

async function fetchCandles(
  config: AppConfig,
  symbol: string,
  interval: string,
  limit = 240
): Promise<Candle[]> {
  if (config.dataSourceMode === "MOCK") return generateMockCandles(symbol, interval, limit);

  const url =
    config.dataSourceMode === "WORKER_PROXY"
      ? `${config.workerProxyUrl.replace(/\/$/, "")}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
      : `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;

  const res = await fetch(url);
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      detail = "";
    }
    throw new Error(`API lỗi ${res.status} ${symbol} ${interval}${detail ? ` - ${detail.slice(0, 140)}` : ""}`);
  }

  const raw = await res.json();
  if (!Array.isArray(raw)) throw new Error("Dữ liệu API không hợp lệ");

  return raw.map(normalizeCandle);
}

function sma(values: number[], period: number) {
  if (values.length < period) return undefined;
  return values.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function ema(values: number[], period: number) {
  if (values.length < period) return undefined;
  const k = 2 / (period + 1);
  let out = values.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < values.length; i += 1) {
    out = values[i] * k + out * (1 - k);
  }

  return out;
}

function rsi(values: number[], period = 14) {
  if (values.length <= period) return undefined;
  let gain = 0;
  let loss = 0;

  for (let i = values.length - period; i < values.length; i += 1) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }

  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

function atr(candles: Candle[], period = 14) {
  if (candles.length <= period) return undefined;
  const trs: number[] = [];

  for (let i = 1; i < candles.length; i += 1) {
    const c = candles[i];
    const p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }

  return sma(trs, period);
}

function inferRegime(candles: Candle[]): MarketRegime {
  const recent = candles.slice(-60);
  const first = recent[0]?.close || 1;
  const last = recent[recent.length - 1]?.close || first;
  const move = (last - first) / first;
  const avgRange =
    recent.reduce((s, c) => s + (c.high - c.low) / Math.max(c.close, 1e-9), 0) /
    Math.max(recent.length, 1);

  if (avgRange > 0.015) return "HIGH_VOLATILITY";
  if (Math.abs(move) < 0.004) return "SIDEWAY";
  if (move > 0.012) return "TREND_UP";
  if (move < -0.012) return "TREND_DOWN";
  if (avgRange < 0.0035) return "LOW_VOLATILITY";
  return "CHOPPY";
}

function inferBtcBias(candles: Candle[]): BtcBias {
  const recent = candles.slice(-45);
  const first = recent[0]?.close || 1;
  const last = recent[recent.length - 1]?.close || first;
  const move = (last - first) / first;

  if (move < -0.018) return "BTC_DUMP_RISK";
  if (move > 0.018) return "BTC_PUMP_RISK";
  if (move > 0.006) return "BTC_BULLISH";
  if (move < -0.006) return "BTC_BEARISH";
  return "BTC_NEUTRAL";
}

function buildSignal(symbol: string, candles: Candle[], btcBias: BtcBias, config: AppConfig, symbolRules: Record<string, SymbolRule>): Signal {
  const closes = candles.map((c) => c.close);
  const last = candles[candles.length - 1];
  const price = last?.close || basePrice(symbol);
  const regime = inferRegime(candles);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const atr14 = atr(candles) || price * 0.007;
  const rsi14 = rsi(closes) || 50;

  let side: Side = "NEUTRAL";

  if (btcBias === "BTC_DUMP_RISK") side = "SHORT";
  else if (btcBias === "BTC_PUMP_RISK") side = "LONG";
  else if (ema20 && ema50 && ema20 > ema50) side = "LONG";
  else if (ema20 && ema50 && ema20 < ema50) side = "SHORT";
  else side = rnd(price) > 0.5 ? "LONG" : "SHORT";

  const dir = side === "LONG" ? 1 : -1;
  const bestEntry = price - dir * atr14 * 0.25;
  const entryLow = Math.min(bestEntry - atr14 * 0.2, bestEntry + atr14 * 0.2);
  const entryHigh = Math.max(bestEntry - atr14 * 0.2, bestEntry + atr14 * 0.2);
  const sl = bestEntry - dir * atr14 * 1.05;
  const tp1 = bestEntry + dir * atr14 * 1.4;
  const tp2 = bestEntry + dir * atr14 * 2.25;
  const rr = Math.abs(tp2 - bestEntry) / Math.max(Math.abs(bestEntry - sl), 1e-9);

  let score = 55;

  if ((side === "LONG" && regime === "TREND_UP") || (side === "SHORT" && regime === "TREND_DOWN")) {
    score += 18;
  }

  if ((side === "LONG" && btcBias === "BTC_BULLISH") || (side === "SHORT" && btcBias === "BTC_BEARISH")) {
    score += 10;
  }

  if (rsi14 > 42 && rsi14 < 68) score += 8;
  if (rr >= 1.5) score += 8;
  if (regime === "HIGH_VOLATILITY" || regime === "CHOPPY") score -= 12;

  const blocks: string[] = [];
  const warnings: string[] = [];
  const reasons: string[] = [];

  if (regime === "HIGH_VOLATILITY") warnings.push("Thị trường biến động mạnh, nên giảm đòn bẩy.");
  if (regime === "CHOPPY") warnings.push("Thị trường nhiễu, ưu tiên chờ entry đẹp.");
  const budgetPerTrade = config.capital / Math.max(config.maxActiveTrades, 1);
  if (rr < 1.2) blocks.push("RR_XAU");
  if (side === "LONG" && btcBias === "BTC_DUMP_RISK") blocks.push("BTC_DUMP_CHAN_LONG");
  if (side === "SHORT" && btcBias === "BTC_PUMP_RISK") blocks.push("BTC_PUMP_CHAN_SHORT");

  reasons.push(`Trạng thái thị trường: ${viRegime(regime)}.`);
  reasons.push(`RSI14: ${rsi14.toFixed(1)}.`);
  if (ema20 && ema50) reasons.push(`EMA20/EMA50: ${fmt(ema20)} / ${fmt(ema50)}.`);
  reasons.push(`Risk/Reward: ${rr.toFixed(2)}.`);

  if (blocks.length) score = Math.min(score, 54);

  const grade: Grade =
    score >= 85 ? "A+" : score >= 75 ? "A" : score >= 65 ? "B" : score >= 55 ? "C" : "NO_TRADE";

  let action: ActionLabel = "NO_TRADE";

  if (blocks.length) action = blocks.includes("RR_XAU") ? "BAD_RR" : "AVOID";
  else if (regime === "HIGH_VOLATILITY") action = "HIGH_RISK";
  else if (score >= 75) action = "ENTRY_OK";
  else if (score >= 65) action = "WAIT_PULLBACK";
  else action = "WAIT_RETEST";

  const maxLev = config.riskMode === "AGGRESSIVE" ? 40 : config.riskMode === "NORMAL" ? 30 : 20;
  const leverage = grade === "A+" ? maxLev : grade === "A" ? Math.min(maxLev, 25) : Math.min(maxLev, 15);
  const suggestedBudgetPerTrade = config.capital / Math.max(config.maxActiveTrades, 1);
  const marginRule = getRequiredMarginBySymbol(symbol, price, leverage, symbolRules);
  const margin = Math.max(marginRule.requiredMargin, suggestedBudgetPerTrade);

  if (marginRule.requiredMargin > suggestedBudgetPerTrade) {
    warnings.push(
      `${symbol} cần ký quỹ tối thiểu khoảng ${marginRule.requiredMargin} USDT/lệnh theo rule symbol hiện tại. Tool đã điều chỉnh ký quỹ theo symbol, không dùng mức cố định.`
    );
  }

  if (margin * config.maxActiveTrades > config.capital) {
    warnings.push(
      `Vốn ${config.capital} USDT không đủ để mở đồng thời ${config.maxActiveTrades} lệnh nếu mỗi lệnh cần khoảng ${roundUp(margin, 2)} USDT. Nên giảm Số lệnh tối đa.`
    );
  }

  const riskUsdt =
    grade === "NO_TRADE"
      ? 0
      : config.capital * (config.riskMode === "AGGRESSIVE" ? 0.08 : config.riskMode === "NORMAL" ? 0.055 : 0.035);

  const signalTime = Date.now() - (Date.now() % intervalMs(config.timeframe));

  return {
    id: `${symbol}_${side}_${signalTime}`,
    symbol,
    side,
    grade,
    score: Math.round(score),
    action,
    setup:
      regime === "SIDEWAY"
        ? "Đảo chiều trong range"
        : regime === "CHOPPY"
          ? "Quét thanh khoản"
          : "Hồi theo xu hướng",
    currentPrice: price,
    entryLow,
    entryHigh,
    bestEntry,
    sl,
    tp1,
    tp2,
    leverage,
    margin: roundUp(margin, 2),
    riskUsdt: Number(riskUsdt.toFixed(2)),
    rr: Number(rr.toFixed(2)),
    regime,
    btcBias,
    signalTime,
    reasons,
    warnings,
    blocks,
  };
}

function touchBestEntry(signal: Signal, candle: Candle) {
  return candle.low <= signal.bestEntry && candle.high >= signal.bestEntry;
}

function touchTp(signal: Signal, candle: Candle, tp: number) {
  if (signal.side === "LONG") return candle.high >= tp;
  if (signal.side === "SHORT") return candle.low <= tp;
  return false;
}

function touchSl(signal: Signal, candle: Candle, sl: number) {
  if (signal.side === "LONG") return candle.low <= sl;
  if (signal.side === "SHORT") return candle.high >= sl;
  return false;
}

function executeRealForwardTest1m(signal: Signal, candles1m: Candle[]): ForwardLog {
  const replay: string[] = [`Tạo tín hiệu lúc ${time(signal.signalTime)}.`];

  if (["AVOID", "BAD_RR", "NO_TRADE"].includes(signal.action)) {
    replay.push("Không vào lệnh vì tín hiệu bị chặn.");
    return {
      signalId: signal.id,
      status: "NO_ENTRY",
      resultR: 0,
      failureReason: signal.blocks[0] || "NO_TRADE",
      replay,
    };
  }

  const expiryAt = signal.signalTime + 180 * 60 * 1000;
  const candles = candles1m.filter((c) => c.time >= signal.signalTime);

  if (!candles.length) {
    replay.push("Không có đủ dữ liệu nến 1m sau thời điểm tín hiệu.");
    return {
      signalId: signal.id,
      status: "NO_ENTRY",
      resultR: 0,
      failureReason: "MISSING_1M_DATA",
      replay,
    };
  }

  let entered = false;
  let tp1Hit = false;
  let breakEvenActive = false;
  let entryTime = 0;
  let maxFavorableR = 0;
  let maxAdverseR = 0;
  const riskPerUnit = Math.max(Math.abs(signal.bestEntry - signal.sl), 1e-9);

  for (const candle of candles) {
    if (!entered) {
      if (candle.time > expiryAt) {
        replay.push("Tín hiệu hết hạn trước khi giá chạm vùng entry.");
        return {
          signalId: signal.id,
          status: "EXPIRED",
          resultR: 0,
          failureReason: "NO_ENTRY_EXPIRED",
          replay,
        };
      }

      if (touchBestEntry(signal, candle)) {
        entered = true;
        entryTime = candle.time;
        replay.push(`Giá đã khớp Entry tốt nhất lúc ${time(candle.time)} tại ${fmt(signal.bestEntry)}.`);
      }

      continue;
    }

    const favorableR =
      signal.side === "LONG"
        ? (candle.high - signal.bestEntry) / riskPerUnit
        : signal.side === "SHORT"
          ? (signal.bestEntry - candle.low) / riskPerUnit
          : 0;
    const adverseR =
      signal.side === "LONG"
        ? (candle.low - signal.bestEntry) / riskPerUnit
        : signal.side === "SHORT"
          ? (signal.bestEntry - candle.high) / riskPerUnit
          : 0;

    maxFavorableR = Math.max(maxFavorableR, favorableR);
    maxAdverseR = Math.min(maxAdverseR, adverseR);

    const slPrice = breakEvenActive ? signal.bestEntry : signal.sl;
    const hitSl = touchSl(signal, candle, slPrice);
    const hitTp1 = !tp1Hit && touchTp(signal, candle, signal.tp1);
    const hitTp2 = touchTp(signal, candle, signal.tp2);

    if (!tp1Hit && hitSl && (hitTp1 || hitTp2)) {
      replay.push("Trong cùng nến 1m có cả TP và SL, hệ thống tính bảo thủ là SL.");
      return {
        signalId: signal.id,
        status: "SL_HIT",
        resultR: -1,
        entryHit: true,
        entryHitMinutes: entryTime ? Math.round((entryTime - signal.signalTime) / 60000) : undefined,
        maxFavorableR: Math.round(maxFavorableR * 100) / 100,
        maxAdverseR: Math.round(maxAdverseR * 100) / 100,
        failureReason: "INTRABAR_CONSERVATIVE_SL",
        replay,
      };
    }

    if (hitSl) {
      if (breakEvenActive) {
        replay.push(`Giá quay về hòa vốn lúc ${time(candle.time)}.`);
        return {
          signalId: signal.id,
          status: "BE_HIT",
          resultR: 0.45,
          entryHit: true,
          entryHitMinutes: entryTime ? Math.round((entryTime - signal.signalTime) / 60000) : undefined,
          maxFavorableR: Math.round(maxFavorableR * 100) / 100,
          maxAdverseR: Math.round(maxAdverseR * 100) / 100,
          failureReason: "TP1_THEN_BE",
          replay,
        };
      }

      replay.push(`Giá chạm SL lúc ${time(candle.time)}.`);
      return {
        signalId: signal.id,
        status: "SL_HIT",
        resultR: -1,
        entryHit: true,
        entryHitMinutes: entryTime ? Math.round((entryTime - signal.signalTime) / 60000) : undefined,
        maxFavorableR: Math.round(maxFavorableR * 100) / 100,
        maxAdverseR: Math.round(maxAdverseR * 100) / 100,
        failureReason: "SL_HIT",
        replay,
      };
    }

    if (hitTp1 && !tp1Hit) {
      tp1Hit = true;
      breakEvenActive = true;
      replay.push(`Giá chạm TP1 lúc ${time(candle.time)}, dời SL về hòa vốn.`);
    }

    if (hitTp2) {
      replay.push(`Giá chạm TP2 lúc ${time(candle.time)}.`);
      return {
        signalId: signal.id,
        status: "TP2_HIT",
        resultR: 1.55,
        entryHit: true,
        entryHitMinutes: entryTime ? Math.round((entryTime - signal.signalTime) / 60000) : undefined,
        maxFavorableR: Math.round(maxFavorableR * 100) / 100,
        maxAdverseR: Math.round(maxAdverseR * 100) / 100,
        replay,
      };
    }
  }

  if (tp1Hit) {
    replay.push("Giá đã chạm TP1 nhưng chưa chạm TP2 hoặc BE.");
    return {
      signalId: signal.id,
      status: "TP1_HIT",
      resultR: 0.45,
      entryHit: true,
      entryHitMinutes: entryTime ? Math.round((entryTime - signal.signalTime) / 60000) : undefined,
      maxFavorableR: Math.round(maxFavorableR * 100) / 100,
      maxAdverseR: Math.round(maxAdverseR * 100) / 100,
      replay,
    };
  }

  if (entered) {
    replay.push("Đã vào lệnh nhưng chưa chạm TP/SL.");
    return {
      signalId: signal.id,
      status: "ENTRY_HIT",
      resultR: 0,
      entryHit: true,
      entryHitMinutes: entryTime ? Math.round((entryTime - signal.signalTime) / 60000) : undefined,
      maxFavorableR: Math.round(maxFavorableR * 100) / 100,
      maxAdverseR: Math.round(maxAdverseR * 100) / 100,
      replay,
    };
  }

  replay.push("Giá chưa khớp Entry tốt nhất.");
  return {
    signalId: signal.id,
    status: "NO_ENTRY",
    resultR: 0,
    failureReason: "NO_ENTRY",
    replay,
  };
}

function loadState(): PersistentState | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveState(state: PersistentState) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...state, updatedAt: Date.now() }));
}

function supabaseHeaders(config: AppConfig): Record<string, string> {
  return {
    apikey: config.supabaseAnonKey,
    Authorization: `Bearer ${config.supabaseAnonKey}`,
    "Content-Type": "application/json",
  };
}

async function pushSupabase(config: AppConfig, state: PersistentState) {
  if (!config.supabaseUrl || !config.supabaseAnonKey) return;

  const base = config.supabaseUrl.replace(/\/$/, "");
  const signalRows = state.signals.map((s) => ({
    signal_id: s.id,
    payload: s,
    updated_at: new Date().toISOString(),
  }));
  const logRows = state.forwardLogs.map((l) => ({
    signal_id: l.signalId,
    status: l.status,
    result_r: l.resultR,
    payload: l,
    updated_at: new Date().toISOString(),
  }));

  if (signalRows.length) {
    const res = await fetch(`${base}/rest/v1/fta_signals?on_conflict=signal_id`, {
      method: "POST",
      headers: { ...supabaseHeaders(config), Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(signalRows),
    });
    if (!res.ok) throw new Error(`Lỗi lưu tín hiệu Supabase: ${res.status}`);
  }

  if (logRows.length) {
    const res = await fetch(`${base}/rest/v1/fta_forward_logs?on_conflict=signal_id`, {
      method: "POST",
      headers: { ...supabaseHeaders(config), Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(logRows),
    });
    if (!res.ok) throw new Error(`Lỗi lưu forward log Supabase: ${res.status}`);
  }

  await fetch(`${base}/rest/v1/fta_settings?on_conflict=id`, {
    method: "POST",
    headers: { ...supabaseHeaders(config), Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{ id: "default", payload: config, updated_at: new Date().toISOString() }]),
  });
}

async function pullSupabase(config: AppConfig): Promise<Partial<PersistentState>> {
  if (!config.supabaseUrl || !config.supabaseAnonKey) return {};

  const base = config.supabaseUrl.replace(/\/$/, "");
  const [signalsRes, logsRes] = await Promise.all([
    fetch(`${base}/rest/v1/fta_signals?select=payload&order=updated_at.desc&limit=300`, {
      headers: supabaseHeaders(config),
    }),
    fetch(`${base}/rest/v1/fta_forward_logs?select=payload&order=updated_at.desc&limit=300`, {
      headers: supabaseHeaders(config),
    }),
  ]);

  if (!signalsRes.ok || !logsRes.ok) {
    throw new Error("Lỗi kéo dữ liệu Supabase. Kiểm tra SQL/RLS.");
  }

  const signalsRows = await signalsRes.json();
  const logRows = await logsRes.json();

  return {
    signals: signalsRows.map((r: any) => r.payload).filter(Boolean),
    forwardLogs: logRows.map((r: any) => r.payload).filter(Boolean),
  };
}

function keepLatestSignalPerSymbol(inputSignals: Signal[]) {
  const map = new Map<string, Signal>();

  for (const signal of inputSignals) {
    const existing = map.get(signal.symbol);

    if (!existing) {
      map.set(signal.symbol, signal);
      continue;
    }

    if (signal.signalTime > existing.signalTime) {
      map.set(signal.symbol, signal);
      continue;
    }

    if (signal.signalTime === existing.signalTime && signal.score > existing.score) {
      map.set(signal.symbol, signal);
    }
  }

  return Array.from(map.values()).sort((a, b) => b.score - a.score);
}



function getForwardLogTime(log: ForwardLog) {
  return log.testedAt || 0;
}

function forwardStatusRank(status: ForwardStatus) {
  const rank: Record<ForwardStatus, number> = {
    WAITING_ENTRY: 0,
    NO_ENTRY: 1,
    EXPIRED: 2,
    ENTRY_HIT: 3,
    BE_HIT: 4,
    SL_HIT: 5,
    TP1_HIT: 6,
    TP2_HIT: 7,
  };

  return rank[status] ?? 0;
}

function pickLatestForwardLog(a: ForwardLog, b: ForwardLog) {
  const aTime = getForwardLogTime(a);
  const bTime = getForwardLogTime(b);

  if (bTime > aTime) return b;
  if (aTime > bTime) return a;

  const aRank = forwardStatusRank(a.status);
  const bRank = forwardStatusRank(b.status);

  return bRank >= aRank ? b : a;
}

function mergeForwardLogsKeepLatest(localLogs: ForwardLog[], remoteLogs: ForwardLog[]) {
  const merged = new Map<string, ForwardLog>();

  for (const remote of remoteLogs) {
    if (!remote?.signalId) continue;
    merged.set(remote.signalId, remote);
  }

  for (const local of localLogs) {
    if (!local?.signalId) continue;

    const existing = merged.get(local.signalId);

    if (!existing) {
      merged.set(local.signalId, local);
      continue;
    }

    merged.set(local.signalId, pickLatestForwardLog(existing, local));
  }

  return Array.from(merged.values());
}

function ensureForwardLogMeta(log: ForwardLog, signal: Signal, forwardRunId: string, testedAt: number) {
  return {
    ...log,
    signalSnapshot: log.signalSnapshot || signal,
    forwardRunId: log.forwardRunId || forwardRunId,
    testedAt: log.testedAt || testedAt,
  };
}

function mergeSignalsLocalWins(localSignals: Signal[], remoteSignals: Signal[]) {
  const merged = new Map<string, Signal>();

  for (const remote of remoteSignals) {
    if (!remote?.id) continue;
    merged.set(remote.id, remote);
  }

  for (const local of localSignals) {
    if (!local?.id) continue;
    merged.set(local.id, local);
  }

  return keepLatestSignalPerSymbol(Array.from(merged.values()));
}

async function fetchCandlesSafe(config: AppConfig, symbol: string, interval: string, limit = 240) {
  try {
    const candles = await fetchCandles(config, symbol, interval, limit);
    return { symbol, candles, error: "" };
  } catch (err) {
    return {
      symbol,
      candles: [] as Candle[],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function isWinningLog(log: ForwardLog) {
  return log.status === "TP1_HIT" || log.status === "TP2_HIT" || log.status === "BE_HIT" || log.resultR > 0;
}

function avg(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pct(count: number, total: number) {
  if (!total) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function commonFailure(logs: ForwardLog[]) {
  const map = new Map<string, number>();

  for (const log of logs) {
    if (!log.failureReason) continue;
    map.set(log.failureReason, (map.get(log.failureReason) || 0) + 1);
  }

  return Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
}

function buildLearningStats(signals: Signal[], logs: ForwardLog[]) {
  const signalMap = new Map(signals.map((signal) => [signal.id, signal]));
  const groups = new Map<string, { label: string; logs: ForwardLog[] }>();

  function addGroup(key: string, label: string, log: ForwardLog) {
    if (!groups.has(key)) groups.set(key, { label, logs: [] });
    groups.get(key)?.logs.push(log);
  }

  for (const log of logs) {
    const signal = signalMap.get(log.signalId) || log.signalSnapshot;
    if (!signal) continue;
    if (log.status === "WAITING_ENTRY") continue;

    addGroup(`symbol:${signal.symbol}`, `Symbol · ${signal.symbol}`, log);
    addGroup(`side:${signal.side}`, `Hướng · ${signal.side}`, log);
    addGroup(`setup:${signal.setup}`, `Setup · ${signal.setup}`, log);
    addGroup(`regime:${signal.regime}`, `Thị trường · ${viRegime(signal.regime)}`, log);
    addGroup(`symbol-side:${signal.symbol}:${signal.side}`, `${signal.symbol} · ${signal.side}`, log);
    addGroup(`symbol-setup:${signal.symbol}:${signal.setup}`, `${signal.symbol} · ${signal.setup}`, log);
  }

  return Array.from(groups.entries())
    .map(([key, group]) => {
      const sampleSize = group.logs.length;
      const wins = group.logs.filter(isWinningLog).length;
      const winrate = pct(wins, sampleSize);
      const avgR = avg(group.logs.map((log) => log.resultR));
      const entryHitRate = pct(group.logs.filter((log) => log.entryHit || log.status !== "NO_ENTRY" && log.status !== "EXPIRED").length, sampleSize);
      const noEntryRate = pct(group.logs.filter((log) => log.status === "NO_ENTRY" || log.status === "EXPIRED").length, sampleSize);
      const slRate = pct(group.logs.filter((log) => log.status === "SL_HIT").length, sampleSize);
      const tp1Rate = pct(group.logs.filter((log) => log.status === "TP1_HIT" || log.status === "TP2_HIT" || log.status === "BE_HIT").length, sampleSize);
      const tp2Rate = pct(group.logs.filter((log) => log.status === "TP2_HIT").length, sampleSize);
      const avgMaxFavorableR = avg(group.logs.map((log) => log.maxFavorableR || Math.max(log.resultR, 0)));
      const avgMaxAdverseR = avg(group.logs.map((log) => log.maxAdverseR || Math.min(log.resultR, 0)));

      let bias: LearningBias = "NEUTRAL";
      if (sampleSize >= 5 && winrate >= 58 && avgR > 0.15) bias = "GOOD";
      if (sampleSize >= 5 && (winrate <= 42 || avgR < -0.1 || slRate >= 55)) bias = "WEAK";

      return {
        key,
        label: group.label,
        sampleSize,
        winrate,
        avgR: Math.round(avgR * 100) / 100,
        entryHitRate,
        noEntryRate,
        slRate,
        tp1Rate,
        tp2Rate,
        avgMaxFavorableR: Math.round(avgMaxFavorableR * 100) / 100,
        avgMaxAdverseR: Math.round(avgMaxAdverseR * 100) / 100,
        commonFailureReason: commonFailure(group.logs),
        bias,
      };
    })
    .sort((a, b) => b.sampleSize - a.sampleSize || b.avgR - a.avgR);
}

function learningAdjustmentForSignal(signal: Signal, stats: LearningStat[]) {
  const related = [
    stats.find((stat) => stat.key === `symbol:${signal.symbol}`),
    stats.find((stat) => stat.key === `side:${signal.side}`),
    stats.find((stat) => stat.key === `setup:${signal.setup}`),
    stats.find((stat) => stat.key === `regime:${signal.regime}`),
    stats.find((stat) => stat.key === `symbol-side:${signal.symbol}:${signal.side}`),
    stats.find((stat) => stat.key === `symbol-setup:${signal.symbol}:${signal.setup}`),
  ].filter((item): item is LearningStat => Boolean(item));

  let scoreAdjustment = 0;
  let entryAtrAdjustment = 0;
  let tp2MultiplierAdjustment = 0;
  let slMultiplierAdjustment = 0;
  const notes: string[] = [];

  for (const stat of related) {
    if (stat.sampleSize < 5) continue;

    const weight = stat.key.startsWith("symbol-side") || stat.key.startsWith("symbol-setup") ? 1.4 : 1;

    if (stat.bias === "GOOD") {
      scoreAdjustment += 3 * weight;
      notes.push(`Learning tốt: ${stat.label} có ${stat.sampleSize} mẫu, winrate ${stat.winrate}%, avg ${stat.avgR}R.`);
    }

    if (stat.bias === "WEAK") {
      scoreAdjustment -= 5 * weight;
      notes.push(`Learning yếu: ${stat.label} có ${stat.sampleSize} mẫu, winrate ${stat.winrate}%, avg ${stat.avgR}R.`);
    }

    if (stat.noEntryRate >= 55 && stat.avgR >= 0) {
      entryAtrAdjustment += 0.08 * weight;
      notes.push(`Learning entry: ${stat.label} thường không khớp entry, kéo Entry tốt nhất gần giá hơn.`);
    }

    if (stat.slRate >= 50 && stat.entryHitRate >= 55) {
      entryAtrAdjustment -= 0.1 * weight;
      slMultiplierAdjustment += 0.05 * weight;
      notes.push(`Learning entry/SL: ${stat.label} hay khớp rồi SL, chờ entry sâu hơn và nới SL nhẹ.`);
    }

    if (stat.tp1Rate >= 45 && stat.tp2Rate < 20) {
      tp2MultiplierAdjustment -= 0.08 * weight;
      notes.push(`Learning TP: ${stat.label} thường TP1 rồi yếu, TP2 nên thực tế hơn.`);
    }
  }

  return {
    scoreAdjustment: Math.max(-15, Math.min(8, Math.round(scoreAdjustment))),
    entryAtrAdjustment: Math.max(-0.22, Math.min(0.18, entryAtrAdjustment)),
    tp2MultiplierAdjustment: Math.max(-0.25, Math.min(0.1, tp2MultiplierAdjustment)),
    slMultiplierAdjustment: Math.max(0, Math.min(0.18, slMultiplierAdjustment)),
    notes: Array.from(new Set(notes)).slice(0, 4),
  };
}

function applyLearningToSignal(signal: Signal, stats: LearningStat[]) {
  const learning = learningAdjustmentForSignal(signal, stats);

  if (
    learning.scoreAdjustment === 0 &&
    learning.entryAtrAdjustment === 0 &&
    learning.tp2MultiplierAdjustment === 0 &&
    learning.slMultiplierAdjustment === 0 &&
    learning.notes.length === 0
  ) {
    return signal;
  }

  const direction = signal.side === "LONG" ? 1 : signal.side === "SHORT" ? -1 : 0;
  const estimatedAtr = Math.abs(signal.bestEntry - signal.sl) / 1.05 || Math.abs(signal.tp1 - signal.bestEntry) / 1.4 || signal.bestEntry * 0.007;
  const baseEntry = signal.bestEntry;
  const newBestEntry = direction === 0 ? signal.bestEntry : signal.bestEntry + direction * estimatedAtr * learning.entryAtrAdjustment;
  const entryShift = newBestEntry - baseEntry;
  const newEntryLow = signal.entryLow + entryShift;
  const newEntryHigh = signal.entryHigh + entryShift;
  const slDistance = Math.abs(baseEntry - signal.sl) * (1 + learning.slMultiplierAdjustment);
  const tp1Distance = Math.abs(signal.tp1 - baseEntry);
  const tp2Distance = Math.abs(signal.tp2 - baseEntry) * (1 + learning.tp2MultiplierAdjustment);

  const newSl = direction === 0 ? signal.sl : newBestEntry - direction * slDistance;
  const newTp1 = direction === 0 ? signal.tp1 : newBestEntry + direction * tp1Distance;
  const newTp2 = direction === 0 ? signal.tp2 : newBestEntry + direction * tp2Distance;
  const rr = Math.abs(newTp2 - newBestEntry) / Math.max(Math.abs(newBestEntry - newSl), 1e-9);
  const score = Math.max(0, Math.min(100, signal.score + learning.scoreAdjustment));
  const grade: Grade =
    score >= 85 ? "A+" : score >= 75 ? "A" : score >= 65 ? "B" : score >= 55 ? "C" : "NO_TRADE";

  let action = signal.action;
  if (grade === "NO_TRADE") action = "NO_TRADE";
  else if (learning.scoreAdjustment <= -8 && action === "ENTRY_OK") action = "WAIT_PULLBACK";
  else if (learning.scoreAdjustment >= 5 && (action === "WAIT_PULLBACK" || action === "WAIT_RETEST")) action = "ENTRY_OK";

  return {
    ...signal,
    score,
    grade,
    action,
    bestEntry: newBestEntry,
    entryLow: newEntryLow,
    entryHigh: newEntryHigh,
    sl: newSl,
    tp1: newTp1,
    tp2: newTp2,
    rr: Math.round(rr * 100) / 100,
    reasons: learning.scoreAdjustment > 0 ? [...signal.reasons, ...learning.notes] : signal.reasons,
    warnings: learning.scoreAdjustment < 0 || learning.entryAtrAdjustment || learning.tp2MultiplierAdjustment || learning.slMultiplierAdjustment ? [...signal.warnings, ...learning.notes] : signal.warnings,
  };
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "yellow" | "blue" | "purple" | "neutral";
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`panel ${className}`}>{children}</div>;
}

export default function App() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [forwardLogs, setForwardLogs] = useState<ForwardLog[]>([]);
  const [learningStats, setLearningStats] = useState<LearningStat[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [apiStatus, setApiStatus] = useState("Chưa phân tích");
  const [syncStatus, setSyncStatus] = useState("Chỉ lưu máy này");
  const [filter, setFilter] = useState<"ALL" | "ENTRY" | "WAIT" | "RISK">("ALL");
  const [showSql, setShowSql] = useState(false);
  const [showWorker, setShowWorker] = useState(false);
  const [journalNote, setJournalNote] = useState("");
  const [showGuidebook, setShowGuidebook] = useState(false);
  const [showUtilities, setShowUtilities] = useState(false);
  const [cloudWipeMode, setCloudWipeMode] = useState<"" | "forwardLogs" | "all">("");
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const saved = loadState();
    if (!saved) return;

    if (saved.config) {
      setConfig({
        ...DEFAULT_CONFIG,
        ...saved.config,
        dataSourceMode: saved.config.dataSourceMode === "MOCK" ? "WORKER_PROXY" : saved.config.dataSourceMode,
        workerProxyUrl: saved.config.workerProxyUrl || DEFAULT_CONFIG.workerProxyUrl,
        symbolScanMode: saved.config.symbolScanMode || DEFAULT_CONFIG.symbolScanMode,
        customSymbolsText: saved.config.customSymbolsText || DEFAULT_CONFIG.customSymbolsText,
        forwardTestLimit: saved.config.forwardTestLimit ?? DEFAULT_CONFIG.forwardTestLimit,
        autoUniverseLimit: saved.config.autoUniverseLimit ?? DEFAULT_CONFIG.autoUniverseLimit,
        autoMinQuoteVolume: saved.config.autoMinQuoteVolume ?? DEFAULT_CONFIG.autoMinQuoteVolume,
        autoMaxAbsChangePct: saved.config.autoMaxAbsChangePct ?? DEFAULT_CONFIG.autoMaxAbsChangePct,
      });
    }

    setSignals(keepLatestSignalPerSymbol(saved.signals || []));
    setForwardLogs(saved.forwardLogs || []);
    setLearningStats(saved.learningStats || buildLearningStats(saved.signals || [], saved.forwardLogs || []));
    setAuditLogs(saved.auditLogs || []);
    setDarkMode(Boolean(saved.darkMode));
  }, []);

  function persist(
    nextSignals = signals,
    nextLogs = forwardLogs,
    nextAudit = auditLogs,
    nextDarkMode = darkMode
  ) {
    saveState({
      signals: keepLatestSignalPerSymbol(nextSignals),
      forwardLogs: nextLogs,
      auditLogs: nextAudit,
      config,
      darkMode: nextDarkMode,
      learningStats: buildLearningStats(keepLatestSignalPerSymbol(nextSignals), nextLogs),
      updatedAt: Date.now(),
    });
  }

  function toggleDarkMode() {
    const next = !darkMode;
    setDarkMode(next);
    persist(signals, forwardLogs, auditLogs, next);
  }

  async function analyze() {
    try {
      setApiStatus("Đang lấy dữ liệu...");

      const scanSymbols = await resolveScanSymbols(config);
      const [btcCandles, symbolRules] = await Promise.all([
        fetchCandles(config, "BTCUSDT", config.timeframe, 240),
        fetchSymbolRules(config),
      ]);
      const btcBias = inferBtcBias(btcCandles);
      const out: Signal[] = [];
      const failedSymbols: string[] = [];

      for (const symbol of scanSymbols) {
        if (symbol === "BTCUSDT") {
          out.push(buildSignal(symbol, btcCandles, btcBias, config, symbolRules));
          continue;
        }

        const result = await fetchCandlesSafe(config, symbol, config.timeframe, 240);

        if (!result.candles.length) {
          failedSymbols.push(`${symbol}: ${result.error}`);
          continue;
        }

        out.push(buildSignal(symbol, result.candles, btcBias, config, symbolRules));
      }

      if (!out.length) {
        throw new Error(`Không phân tích được symbol nào. Lỗi đầu tiên: ${failedSymbols[0] || "không rõ"}`);
      }

      const learningNow = buildLearningStats(signals, forwardLogs);
      const learnedOut = out.map((signal) => applyLearningToSignal(signal, learningNow));
      const sorted = keepLatestSignalPerSymbol(learnedOut);
      setLearningStats(buildLearningStats(sorted, forwardLogs));
      const failText = failedSymbols.length ? ` Bỏ qua ${failedSymbols.length} symbol lỗi.` : "";
      const newAudit = [
        {
          id: `${Date.now()}`,
          at: Date.now(),
          message: `Đã phân tích ${sorted.length}/${scanSymbols.length} symbol qua ${config.dataSourceMode}.${failText} Ký quỹ được tính theo rule riêng từng symbol. Màn hình chính chỉ giữ 1 tín hiệu mới nhất cho mỗi symbol.`,
        },
        ...auditLogs,
      ].slice(0, 100);

      setSignals(sorted);
      setAuditLogs(newAudit);
      setApiStatus(failedSymbols.length ? `API ổn một phần · bỏ qua ${failedSymbols.length} symbol lỗi` : "API ổn");
      persist(sorted, forwardLogs, newAudit);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lỗi không xác định";
      setApiStatus(`Lỗi: ${msg}`);

      const newAudit = [{ id: `${Date.now()}`, at: Date.now(), message: msg }, ...auditLogs].slice(0, 100);
      setAuditLogs(newAudit);
      persist(signals, forwardLogs, newAudit);
    }
  }

  async function runForwardTest() {
    try {
      setApiStatus("Đang chạy Forward Test 1m...");
      const logs: ForwardLog[] = [];
      const testedAt = Date.now();
      const forwardRunId = `FT_${testedAt}`;
      const forwardFailures: string[] = [];
      const forwardTargets = getForwardTestTargets(signals, forwardLogs, config.forwardTestLimit);

      for (const signal of forwardTargets) {
        const result = await fetchCandlesSafe(config, signal.symbol, "1m", 1000);

        if (!result.candles.length) {
          forwardFailures.push(`${signal.symbol}: ${result.error}`);
          continue;
        }

        const log = executeRealForwardTest1m(signal, result.candles);
        logs.push(ensureForwardLogMeta(log, signal, forwardRunId, testedAt));
      }

      if (!logs.length) {
        throw new Error(`Không chạy được Forward Test cho symbol nào. Lỗi đầu tiên: ${forwardFailures[0] || "không rõ"}`);
      }

      const nextLogs = mergeForwardLogsKeepLatest(forwardLogs, logs);
      const newAudit = [
        {
          id: `${Date.now()}`,
          at: Date.now(),
          message: `Đã chạy Forward Test thật bằng nến 1m cho ${logs.length}/${forwardTargets.length} tín hiệu ${config.forwardTestLimit === -1 ? "từ log chưa TP/SL" : config.forwardTestLimit === 0 ? "đã lưu" : "được chọn"}${forwardFailures.length ? `. Bỏ qua ${forwardFailures.length} symbol lỗi.` : ""}`,
        },
        ...auditLogs,
      ].slice(0, 100);

      const nextLearningStats = buildLearningStats(signals, nextLogs);
      setForwardLogs(nextLogs);
      setLearningStats(nextLearningStats);
      setAuditLogs(newAudit);
      setApiStatus(forwardFailures.length ? `Forward Test hoàn tất một phần · bỏ qua ${forwardFailures.length}` : "Forward Test 1m hoàn tất");
      persist(signals, nextLogs, newAudit);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lỗi Forward Test 1m";
      const newAudit = [{ id: `${Date.now()}`, at: Date.now(), message: msg }, ...auditLogs].slice(0, 100);

      setApiStatus(`Lỗi: ${msg}`);
      setAuditLogs(newAudit);
      persist(signals, forwardLogs, newAudit);
    }
  }


  function hasCloudWipePending() {
    return cloudWipeMode !== "";
  }

  function cloudWipeMessage() {
    if (cloudWipeMode === "forwardLogs") {
      return "Bạn vừa xóa Forward Log cloud. Nếu bấm Đồng bộ ngay, tool sẽ push trạng thái Forward Log rỗng từ local lên cloud, không kéo log cũ về.";
    }

    if (cloudWipeMode === "all") {
      return "Bạn vừa xóa toàn bộ cloud. Nếu bấm Đồng bộ ngay, tool sẽ push trạng thái local hiện tại lên cloud.";
    }

    return "";
  }

  async function syncCloud() {
    try {
      const localSignalsSnapshot = [...signals];
      const localForwardLogsSnapshot = [...forwardLogs];

      let nextSignals = keepLatestSignalPerSymbol(localSignalsSnapshot);
      let nextLogs = localForwardLogsSnapshot;
      let syncMessage = "Đã kéo dữ liệu trước khi đẩy lên cloud";

      if (hasCloudWipePending()) {
        const confirmed = window.confirm(`${cloudWipeMessage()}

Tiếp tục đồng bộ?`);
        if (!confirmed) return;

        setSyncStatus("Đang ghi trạng thái local sau khi xóa cloud...");
        syncMessage = cloudWipeMode === "forwardLogs"
          ? "Đã push trạng thái Forward Log rỗng lên cloud sau khi xóa"
          : "Đã push trạng thái local lên cloud sau khi xóa toàn bộ cloud";
      } else {
        setSyncStatus("Đang kéo cloud và giữ local ưu tiên...");

        const remote = await pullSupabase(config);

        nextSignals = mergeSignalsLocalWins(localSignalsSnapshot, remote.signals || []);
        nextLogs = mergeForwardLogsKeepLatest(localForwardLogsSnapshot, remote.forwardLogs || []);
      }

      const nextAudit = [
        { id: `${Date.now()}`, at: Date.now(), message: syncMessage },
        ...auditLogs,
      ].slice(0, 100);

      setSyncStatus("Đang ghi dữ liệu đã gộp lên cloud...");

      await pushSupabase(config, {
        signals: nextSignals,
        forwardLogs: nextLogs,
        auditLogs: nextAudit,
        config,
        darkMode,
        updatedAt: Date.now(),
      });

      const nextLearningStats = buildLearningStats(nextSignals, nextLogs);
      setSignals(nextSignals);
      setForwardLogs(nextLogs);
      setLearningStats(nextLearningStats);
      setAuditLogs(nextAudit);
      persist(nextSignals, nextLogs, nextAudit);
      setCloudWipeMode("");
      setSyncStatus("Đã đồng bộ an toàn");
    } catch (err) {
      setSyncStatus(err instanceof Error ? `Lỗi đồng bộ: ${err.message}` : "Lỗi đồng bộ");
    }
  }


  async function clearForwardLogsCloud() {
    try {
      const confirmed = window.confirm(
        "Xóa toàn bộ Forward Log trên cloud và trên máy này? Tín hiệu hiện tại sẽ được giữ lại."
      );

      if (!confirmed) return;

      setSyncStatus("Đang xóa Forward Log cloud...");

      if (config.supabaseUrl && config.supabaseAnonKey) {
        const base = config.supabaseUrl.replace(/\/$/, "");
        const res = await fetch(`${base}/rest/v1/fta_forward_logs?signal_id=not.is.null`, {
          method: "DELETE",
          headers: {
            ...supabaseHeaders(config),
            Prefer: "return=minimal",
          },
        });

        if (!res.ok) {
          throw new Error(`Lỗi xóa Forward Log Supabase: ${res.status}`);
        }
      }

      const newAudit = [
        {
          id: `${Date.now()}`,
          at: Date.now(),
          message: "Đã xóa toàn bộ Forward Log trên cloud và local để tạo log mới.",
        },
        ...auditLogs,
      ].slice(0, 100);

      setForwardLogs([]);
      setAuditLogs(newAudit);
      persist(signals, [], newAudit);
      setCloudWipeMode("forwardLogs");
      setSyncStatus("Đã xóa Forward Log cloud/local. Bấm Đồng bộ Supabase để push trạng thái Forward Log rỗng lên cloud.");
    } catch (err) {
      setSyncStatus(err instanceof Error ? `Lỗi xóa log cloud: ${err.message}` : "Lỗi xóa log cloud");
    }
  }



  async function clearAllCloudData() {
    try {
      const confirmed = window.confirm(
        "Xóa toàn bộ dữ liệu cloud gồm Signals, Forward Logs, Settings và Audit Logs? Dữ liệu local trên máy này sẽ được giữ nguyên. Sau đó nếu bấm Đồng bộ, local hiện tại sẽ được push lại lên cloud."
      );

      if (!confirmed) return;

      setSyncStatus("Đang xóa toàn bộ cloud...");

      if (config.supabaseUrl && config.supabaseAnonKey) {
        const base = config.supabaseUrl.replace(/\/$/, "");
        const tables = [
          "fta_forward_logs?signal_id=not.is.null",
          "fta_signals?signal_id=not.is.null",
          "fta_settings?id=not.is.null",
          "fta_audit_logs?id=not.is.null",
        ];

        for (const table of tables) {
          const res = await fetch(`${base}/rest/v1/${table}`, {
            method: "DELETE",
            headers: {
              ...supabaseHeaders(config),
              Prefer: "return=minimal",
            },
          });

          if (!res.ok) {
            throw new Error(`Lỗi xóa ${table.split("?")[0]} Supabase: ${res.status}`);
          }
        }
      }

      const newAudit = [
        {
          id: `${Date.now()}`,
          at: Date.now(),
          message: "Đã xóa toàn bộ dữ liệu cloud. Local trên máy này được giữ nguyên.",
        },
        ...auditLogs,
      ].slice(0, 100);

      setAuditLogs(newAudit);
      persist(signals, forwardLogs, newAudit);
      setCloudWipeMode("all");
      setSyncStatus("Đã xóa toàn bộ cloud. Bấm Đồng bộ Supabase nếu muốn push local hiện tại lên cloud.");
    } catch (err) {
      setSyncStatus(err instanceof Error ? `Lỗi xóa toàn bộ cloud: ${err.message}` : "Lỗi xóa toàn bộ cloud");
    }
  }

  function rebuildLearning() {
    const stats = buildLearningStats(signals, forwardLogs);
    const newAudit = [
      {
        id: `${Date.now()}`,
        at: Date.now(),
        message: `Đã rebuild Learning Engine từ ${forwardLogs.length} Forward Log.`,
      },
      ...auditLogs,
    ].slice(0, 100);

    setLearningStats(stats);
    setAuditLogs(newAudit);
    persist(signals, forwardLogs, newAudit);
  }

  function clearLearningStats() {
    const newAudit = [
      {
        id: `${Date.now()}`,
        at: Date.now(),
        message: "Đã xóa Learning Stats. Forward Log gốc vẫn được giữ lại.",
      },
      ...auditLogs,
    ].slice(0, 100);

    setLearningStats([]);
    setAuditLogs(newAudit);
    saveState({
      signals,
      forwardLogs,
      auditLogs: newAudit,
      config,
      darkMode,
      learningStats: [],
      updatedAt: Date.now(),
    });
  }

  function addJournal() {
    if (!journalNote.trim()) return;

    const note = {
      id: `${Date.now()}`,
      at: Date.now(),
      message: `Nhật ký: ${journalNote.trim()}`,
    };

    const nextAudit = [note, ...auditLogs].slice(0, 100);

    setAuditLogs(nextAudit);
    setJournalNote("");
    persist(signals, forwardLogs, nextAudit);
  }

  function clearLogs() {
    const newAudit = [
      {
        id: `${Date.now()}`,
        at: Date.now(),
        message: "Đã xóa Forward Log và Nhật ký hệ thống để ghi dữ liệu mới.",
      },
    ];

    setForwardLogs([]);
    setLearningStats([]);
    setAuditLogs(newAudit);
    persist(signals, [], newAudit);
  }

  function clearAllLocalData() {
    localStorage.removeItem(LOCAL_KEY);
    setSignals([]);
    setForwardLogs([]);
    setLearningStats([]);
    setAuditLogs([]);
    setSyncStatus("Chỉ lưu máy này");
    setApiStatus("Chưa phân tích");
  }

  const filtered = signals.filter((s) => {
    const log = forwardLogs.find((l) => l.signalId === s.id);

    if (filter === "ENTRY") {
      return s.action === "ENTRY_OK" && (!log || !isTerminalForwardStatus(log.status));
    }

    if (filter === "WAIT") {
      return (s.action === "WAIT_PULLBACK" || s.action === "WAIT_RETEST") && (!log || !isTerminalForwardStatus(log.status));
    }

    if (filter === "RISK") {
      return ["HIGH_RISK", "BAD_RR", "AVOID", "NO_TRADE"].includes(s.action) || Boolean(log && isTerminalForwardStatus(log.status));
    }

    return true;
  });

  const tradeable = signals.filter((s) => {
    const log = forwardLogs.find((l) => l.signalId === s.id);
    return s.action === "ENTRY_OK" && (!log || !isTerminalForwardStatus(log.status));
  }).length;

  const waiting = signals.filter((s) => {
    const log = forwardLogs.find((l) => l.signalId === s.id);
    return (s.action === "WAIT_PULLBACK" || s.action === "WAIT_RETEST") && (!log || !isTerminalForwardStatus(log.status));
  }).length;

  const risky = signals.filter((s) => {
    const log = forwardLogs.find((l) => l.signalId === s.id);
    return ["HIGH_RISK", "BAD_RR", "AVOID"].includes(s.action) || Boolean(log && isTerminalForwardStatus(log.status));
  }).length;

  
  return (
    <div className={darkMode ? "app dark" : "app"}>
      <header className="top">
        <div className="heroBlock">
          <h1>Trợ lý Giao dịch Futures v4</h1>
          <p>Hỗ trợ quyết định trade futures thủ công · Không grid bot · Dữ liệu qua Worker Proxy · Đồng bộ Supabase</p>
        </div>

        <div className="topBadges">
          <button className="secondary smallBtn" onClick={toggleDarkMode}>
            {darkMode ? "Light Mode" : "Dark Mode"}
          </button>
          <Badge tone="blue">{apiStatus}</Badge>
          <Badge tone="purple">{syncStatus}</Badge>
        </div>
      </header>

      <section className="metrics">
        <Panel>
          <div className="muted">Có thể vào lệnh</div>
          <b>{tradeable}</b>
        </Panel>
        <Panel>
          <div className="muted">Đang chờ</div>
          <b>{waiting}</b>
        </Panel>
        <Panel>
          <div className="muted">Rủi ro / bị chặn</div>
          <b>{risky}</b>
        </Panel>
        <Panel>
          <div className="muted">Tín hiệu đã lưu</div>
          <b>{signals.length}</b>
        </Panel>
        <Panel>
          <div className="muted">Forward log</div>
          <b>{forwardLogs.length}</b>
        </Panel>
      </section>

      <Panel className="controlPanel">
        <div className="sectionHeader">
          <div>
            <h2>Cấu hình & thao tác</h2>
            <p className="muted">Giữ các thao tác thường dùng ở khu vực chính. Tiện ích ít dùng được gom vào phần mở rộng để giao diện gọn hơn.</p>
          </div>
          <div className="headerActions">
            <button className="secondary smallBtn" onClick={() => setShowGuidebook(!showGuidebook)}>
              {showGuidebook ? "Ẩn Guidebook" : "Mở Guidebook"}
            </button>
            <button className="secondary smallBtn" onClick={() => setShowUtilities(!showUtilities)}>
              {showUtilities ? "Ẩn tiện ích" : "Tiện ích & dữ liệu"}
            </button>
          </div>
        </div>

        <div className="configGrid">
          <label>
            Vốn USDT
            <input type="number" value={config.capital} onChange={(e) => setConfig({ ...config, capital: Number(e.target.value) })} />
          </label>
          <label>
            Chế độ rủi ro
            <select value={config.riskMode} onChange={(e) => setConfig({ ...config, riskMode: e.target.value as RiskMode })}>
              <option value="SAFE">SAFE</option>
              <option value="NORMAL">NORMAL</option>
              <option value="AGGRESSIVE">AGGRESSIVE</option>
            </select>
          </label>
          <label>
            Số lệnh tối đa
            <input
              type="number"
              value={config.maxActiveTrades}
              onChange={(e) => setConfig({ ...config, maxActiveTrades: Number(e.target.value) })}
            />
          </label>
          <label>
            Khung tín hiệu
            <select value={config.timeframe} onChange={(e) => setConfig({ ...config, timeframe: e.target.value as AppConfig["timeframe"] })}>
              <option value="5m">5m</option>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
            </select>
          </label>
          <label>
            Nguồn dữ liệu
            <select
              value={config.dataSourceMode}
              onChange={(e) => setConfig({ ...config, dataSourceMode: e.target.value as DataSourceMode })}
            >
              <option value="WORKER_PROXY">WORKER_PROXY</option>
              <option value="BINANCE_DIRECT">BINANCE_DIRECT</option>
              <option value="MOCK">MOCK</option>
            </select>
          </label>
          <label>
            Chế độ quét symbol
            <select
              value={config.symbolScanMode}
              onChange={(e) => setConfig({ ...config, symbolScanMode: e.target.value as SymbolScanMode })}
            >
              <option value="CORE">Core Scan ({CORE_SYMBOLS.length})</option>
              <option value="EXTENDED">Extended Scan ({EXTENDED_SYMBOLS.length})</option>
              <option value="AUTO_SAFE">Auto Safe Universe</option>
              <option value="CUSTOM">Custom Scan</option>
            </select>
          </label>
          <label>
            Forward Test
            <select
              value={config.forwardTestLimit}
              onChange={(e) => setConfig({ ...config, forwardTestLimit: Number(e.target.value) })}
            >
              <option value={6}>Top 6</option>
              <option value={10}>Top 10</option>
              <option value={20}>Top 20</option>
              <option value={0}>Tất cả signal history</option>
              <option value={-1}>Tất cả log chưa TP/SL</option>
            </select>
          </label>
        </div>

        <label className="fullLabel">
          URL Proxy Cloudflare Worker
          <input value={config.workerProxyUrl} onChange={(e) => setConfig({ ...config, workerProxyUrl: e.target.value })} />
        </label>

        {config.symbolScanMode === "CUSTOM" && (
          <label className="fullLabel">
            Custom Symbols
            <input
              placeholder="BTCUSDT, ETHUSDT, SOLUSDT..."
              value={config.customSymbolsText}
              onChange={(e) => setConfig({ ...config, customSymbolsText: e.target.value })}
            />
          </label>
        )}


        {config.symbolScanMode === "AUTO_SAFE" && (
          <div className="autoUniverseGrid">
            <label>
              Auto Universe Limit
              <input
                type="number"
                min={8}
                max={80}
                value={config.autoUniverseLimit}
                onChange={(e) => setConfig({ ...config, autoUniverseLimit: Number(e.target.value) })}
              />
            </label>
            <label>
              Min 24h Quote Volume
              <input
                type="number"
                min={0}
                step={1000000}
                value={config.autoMinQuoteVolume}
                onChange={(e) => setConfig({ ...config, autoMinQuoteVolume: Number(e.target.value) })}
              />
            </label>
            <label>
              Max 24h Change %
              <input
                type="number"
                min={1}
                max={50}
                value={config.autoMaxAbsChangePct}
                onChange={(e) => setConfig({ ...config, autoMaxAbsChangePct: Number(e.target.value) })}
              />
            </label>
          </div>
        )}

        <div className="scanSummary">
          {config.symbolScanMode === "AUTO_SAFE" ? (
            <>
              Auto Safe Universe: lấy trực tiếp từ Binance 24h ticker + exchangeInfo, lọc theo volume và biên độ giá.
            </>
          ) : (
            <>
              Đang quét <b>{getScanSymbols(config).length}</b> symbol · Forward Test:{" "}
              <b>{config.forwardTestLimit === -1 ? "tất cả log chưa TP/SL" : config.forwardTestLimit === 0 ? "tất cả signal history" : `top ${config.forwardTestLimit}`}</b>
            </>
          )}
        </div>

        <div className="primaryActions">
          <button onClick={analyze}>Phân tích</button>
          <button className="secondary" onClick={runForwardTest}>
            Chạy Forward Test 1m
          </button>
          <button className="secondary" onClick={syncCloud}>
            Đồng bộ Supabase
          </button>
          <button className="secondary" onClick={rebuildLearning}>
            Rebuild Learning
          </button>
        </div>

        {showUtilities && (
          <div className="utilityPanel">
            <div className="utilityGroup">
              <div className="utilityTitle">Quản lý log & dữ liệu</div>
              <div className="utilityButtons">
                <button className="dangerBtn" onClick={clearLogs}>
                  Xóa log local
                </button>
                <button className="dangerBtn cloud" onClick={clearForwardLogsCloud}>
                  Xóa Forward Log cloud
                </button>
                <button className="dangerBtn cloud" onClick={clearAllCloudData}>
                  Xóa toàn bộ cloud
                </button>
                <button className="secondary" onClick={clearLearningStats}>
                  Xóa Learning
                </button>
                <button className="dangerBtn soft" onClick={clearAllLocalData}>
                  Xóa toàn bộ local
                </button>
              </div>
            </div>

            <div className="utilityGroup">
              <div className="utilityTitle">Triển khai & cấu hình</div>
              <div className="utilityButtons">
                <button className="secondary" onClick={() => setShowSql(!showSql)}>
                  {showSql ? "Ẩn SQL" : "Hiện SQL Supabase"}
                </button>
                <button className="secondary" onClick={() => navigator.clipboard.writeText([SCHEMA_SQL, RLS_SQL].join(String.fromCharCode(10, 10)))}>
                  Copy SQL
                </button>
                <button className="secondary" onClick={() => setShowWorker(!showWorker)}>
                  {showWorker ? "Ẩn Worker" : "Hiện Worker Proxy"}
                </button>
                <button className="secondary" onClick={() => navigator.clipboard.writeText(WORKER_CODE)}>
                  Copy Worker
                </button>
              </div>
            </div>

            {(showSql || showWorker) && (
              <div className="utilityDocs">
                {showSql && <pre>{[SCHEMA_SQL, RLS_SQL].join(String.fromCharCode(10, 10))}</pre>}
                {showWorker && <pre>{WORKER_CODE}</pre>}
              </div>
            )}
          </div>
        )}
      </Panel>

      <div className="filters">
        {(["ALL", "ENTRY", "WAIT", "RISK"] as const).map((f) => (
          <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>
            {f === "ALL" ? "Tất cả" : f === "ENTRY" ? "Vào lệnh OK" : f === "WAIT" ? "Chờ" : "Rủi ro"}
          </button>
        ))}
      </div>

      <div className="mainLayout">
        <section className="mainColumn">
          <section className="signals">
            {filtered.map((s) => {
              const log = forwardLogs.find((l) => l.signalId === s.id);
              const orderWarnings = orderCompatibilityWarnings(s);

              return (
                <Panel key={s.id} className="signal">
                  <div className="signalHead">
                    <div>
                      <h2 className="symbolLink" onClick={() => openBinanceFutures(s.symbol)} title="Mở trên Binance Futures">
                        {s.symbol}
                      </h2>
                      <div className="muted">
                        {s.setup} · {viRegime(s.regime)} · Điểm {s.score}/100
                      </div>
                    </div>

                    <div className="badges">
                      <Badge tone={s.side === "LONG" ? "green" : s.side === "SHORT" ? "red" : "neutral"}>
                        {s.side === "LONG" ? "LONG / MUA" : s.side === "SHORT" ? "SHORT / BÁN" : "TRUNG LẬP"}
                      </Badge>
                      <Badge tone={s.grade === "A+" ? "purple" : s.grade === "A" ? "green" : s.grade === "B" ? "blue" : "yellow"}>
                        {s.grade}
                      </Badge>
                      <Badge tone={displayActionTone(s, log)}>{displayAction(s, log)}</Badge>
                    </div>
                  </div>

                  <div className="priceGrid">
                    <div>
                      <span>Vùng Entry</span>
                      <b>
                        {fmt(s.entryLow)} - {fmt(s.entryHigh)}
                      </b>
                    </div>
                    <div>
                      <span>Entry tốt nhất</span>
                      <b>{fmt(s.bestEntry)}</b>
                    </div>
                    <div>
                      <span>SL</span>
                      <b className="redText">{fmt(s.sl)}</b>
                    </div>
                    <div>
                      <span>TP1 / TP2</span>
                      <b className="greenText">
                        {fmt(s.tp1)} / {fmt(s.tp2)}
                      </b>
                    </div>
                  </div>

                  <div className="miniGrid">
                    <div>
                      Đòn bẩy <b>x{s.leverage}</b>
                    </div>
                    <div>
                      Ký quỹ <b>{s.margin}</b>
                    </div>
                    <div>
                      Rủi ro <b>{s.riskUsdt}</b>
                    </div>
                    <div>
                      RR <b>{s.rr}</b>
                    </div>
                  </div>

                  {orderWarnings.length > 0 && (
                    <div className="log danger">
                      {orderWarnings.map((warning, index) => (
                        <div key={index}>⚠ {warning}</div>
                      ))}
                    </div>
                  )}

                  <div className="notes">
                    {s.reasons.map((r, i) => (
                      <p key={i}>• {r}</p>
                    ))}
                    {s.warnings.map((w, i) => (
                      <p key={i} className="warn">
                        ⚠ {w}
                      </p>
                    ))}
                    {s.blocks.map((b, i) => (
                      <p key={i} className="danger">
                        ⛔ Bị chặn: {b}
                      </p>
                    ))}
                  </div>

                  {log && (
                    <div className="log">
                      <b>
                        Forward Test: {viStatus(log.status)} · {log.resultR}R · Entry tính theo Entry tốt nhất
                      </b>
                      {log.replay.map((line, i) => (
                        <div key={i}>
                          {i + 1}. {line}
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              );
            })}
          </section>
        </section>

        <aside className="sideColumn">
          <Panel>
            <div className="sectionHeader">
              <div>
                <h2>Learning Dashboard</h2>
                <p className="muted">Theo dõi các nhóm symbol/setup/regime đang mạnh hay yếu để tool học dần từ Forward Log.</p>
              </div>
            </div>
            {learningStats.length === 0 && <div className="muted">Chưa có Learning Stats. Hãy chạy Forward Test 1m cho tất cả signal history rồi bấm Rebuild Learning. Log cũ không có signalSnapshot có thể không học đủ nếu signal gốc đã bị xóa.</div>}
            {learningStats.length > 0 && (
              <div className="learningGrid compact">
                {learningStats.slice(0, 6).map((stat) => (
                  <div key={stat.key} className="learningCard">
                    <div className="learningTop">
                      <b>{stat.label}</b>
                      <Badge tone={stat.bias === "GOOD" ? "green" : stat.bias === "WEAK" ? "red" : "neutral"}>{stat.bias}</Badge>
                    </div>
                    <div className="learningStats">
                      <span>Mẫu: <b>{stat.sampleSize}</b></span>
                      <span>Win: <b>{stat.winrate}%</b></span>
                      <span>Avg R: <b>{stat.avgR}</b></span>
                      <span>Entry: <b>{stat.entryHitRate}%</b></span>
                      <span>SL: <b>{stat.slRate}%</b></span>
                      <span>TP2: <b>{stat.tp2Rate}%</b></span>
                    </div>
                    {stat.commonFailureReason && <div className="muted">Lỗi thường gặp: {stat.commonFailureReason}</div>}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {showGuidebook && (
            <Panel>
              <h2>Guidebook nhanh</h2>
              <div className="guidebook">
                <h3>Quy trình dùng chuẩn</h3>
                <ol>
                  <li>Đồng bộ Supabase khi vừa đổi thiết bị.</li>
                  <li>Kiểm tra vốn, rủi ro, số lệnh tối đa và nguồn dữ liệu.</li>
                  <li>Phân tích tín hiệu mới.</li>
                  <li>Chạy Forward Test 1m.</li>
                  <li>Rebuild Learning.</li>
                  <li>Đồng bộ lại Supabase.</li>
                </ol>
                <h3>Nguyên tắc quan trọng</h3>
                <p>Forward Test chỉ tính khớp lệnh khi giá chạm Entry tốt nhất. Learning Engine chỉ điều chỉnh rõ khi có tối thiểu 5 mẫu để tránh overfit.</p>
              </div>
            </Panel>
          )}

          <Panel>
            <h2>Nhật ký lệnh thật</h2>
            <div className="journal">
              <input
                placeholder="Ghi chú lệnh thật / tâm lý / lý do vào lệnh..."
                value={journalNote}
                onChange={(e) => setJournalNote(e.target.value)}
              />
              <button onClick={addJournal}>Thêm ghi chú</button>
            </div>
          </Panel>

          <Panel>
            <h2>Nhật ký hệ thống</h2>
            {auditLogs.slice(0, 8).map((l) => (
              <div key={l.id} className="audit">
                <span>{l.message}</span>
                <span>{time(l.at)}</span>
              </div>
            ))}
            {!auditLogs.length && <div className="muted">Chưa có sự kiện hệ thống.</div>}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

