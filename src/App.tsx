import React, { useEffect, useState } from "react";

type Side = "LONG" | "SHORT" | "NEUTRAL";
type RiskMode = "SAFE" | "NORMAL" | "AGGRESSIVE";
type DataSourceMode = "MOCK" | "BINANCE_DIRECT" | "WORKER_PROXY";
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

type AppConfig = {
  capital: number;
  riskMode: RiskMode;
  maxActiveTrades: number;
  timeframe: "5m" | "15m" | "1h";
  dataSourceMode: DataSourceMode;
  workerProxyUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
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
  updatedAt: number;
};

const SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "LINKUSDT",
  "OPUSDT",
  "ARBUSDT",
  "DOGEUSDT",
];

const LOCAL_KEY = "fta_v4_standalone_state";
const MIN_MARGIN_USDT = 5.5;
const MIN_NOTIONAL_USDT = 5;

const DEFAULT_CONFIG: AppConfig = {
  capital: 15,
  riskMode: "NORMAL",
  maxActiveTrades: 2,
  timeframe: "15m",
  dataSourceMode: "WORKER_PROXY",
  workerProxyUrl: "https://dry-salad-e656.thong06021998.workers.dev",
  supabaseUrl: "https://nzkkfaougaqvxzfurtgv.supabase.co",
  supabaseAnonKey: "sb_publishable_RkQ8P-PF6KfPvD7SIOJ4Tw_BK3ntaQb",
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
    if (url.pathname !== "/klines") return new Response("Not found", { status: 404 });

    const symbol = url.searchParams.get("symbol") || "BTCUSDT";
    const interval = url.searchParams.get("interval") || "1m";
    const limit = Math.min(Number(url.searchParams.get("limit") || 240), 1000);

    const cacheKey = new Request(request.url, request);
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached;

    const binanceUrl =
      "https://fapi.binance.com/fapi/v1/klines?symbol=" +
      symbol +
      "&interval=" +
      interval +
      "&limit=" +
      limit;

    const res = await fetch(binanceUrl);

    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Binance error", status: res.status }), {
        status: 502,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const raw = await res.json();
    const data = raw.map((k) => ({
      time: Number(k[0]),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    }));

    const out = new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=15",
      },
    });

    ctx.waitUntil(caches.default.put(cacheKey, out.clone()));
    return out;
  },
};
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

  if (signal.margin < MIN_MARGIN_USDT) {
    warnings.push(`Ký quỹ thấp hơn ${MIN_MARGIN_USDT} USDT/lệnh.`);
  }

  if (notional < MIN_NOTIONAL_USDT) {
    warnings.push(`Notional thấp hơn ${MIN_NOTIONAL_USDT} USDT.`);
  }

  return warnings;
}

function openBinanceFutures(symbol: string) {
  window.open(`https://www.binance.com/vi/futures/${symbol}`, "_blank", "noopener,noreferrer");
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
  if (!res.ok) throw new Error(`API lỗi ${res.status}`);

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

function buildSignal(symbol: string, candles: Candle[], btcBias: BtcBias, config: AppConfig): Signal {
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
  if (config.capital / Math.max(config.maxActiveTrades, 1) < MIN_MARGIN_USDT) {
    warnings.push(`Vốn chia theo số lệnh hiện tại thấp hơn ${MIN_MARGIN_USDT} USDT/lệnh. Tool đã nâng ký quỹ tối thiểu lên ${MIN_MARGIN_USDT} USDT để tránh lỗi nhập lệnh.`);
  }
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
  const margin = Math.max(MIN_MARGIN_USDT, suggestedBudgetPerTrade);
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
    margin: Number(margin.toFixed(2)),
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
        replay.push(`Giá đã khớp Entry tốt nhất lúc ${time(candle.time)} tại ${fmt(signal.bestEntry)}.`);
      }

      continue;
    }

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
          failureReason: "TP1_THEN_BE",
          replay,
        };
      }

      replay.push(`Giá chạm SL lúc ${time(candle.time)}.`);
      return {
        signalId: signal.id,
        status: "SL_HIT",
        resultR: -1,
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
      replay,
    };
  }

  if (entered) {
    replay.push("Đã vào lệnh nhưng chưa chạm TP/SL.");
    return {
      signalId: signal.id,
      status: "ENTRY_HIT",
      resultR: 0,
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
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [apiStatus, setApiStatus] = useState("Chưa phân tích");
  const [syncStatus, setSyncStatus] = useState("Chỉ lưu máy này");
  const [filter, setFilter] = useState<"ALL" | "ENTRY" | "WAIT" | "RISK">("ALL");
  const [showSql, setShowSql] = useState(false);
  const [showWorker, setShowWorker] = useState(false);
  const [journalNote, setJournalNote] = useState("");
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
      });
    }

    setSignals(saved.signals || []);
    setForwardLogs(saved.forwardLogs || []);
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
      signals: nextSignals,
      forwardLogs: nextLogs,
      auditLogs: nextAudit,
      config,
      darkMode: nextDarkMode,
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

      const btcCandles = await fetchCandles(config, "BTCUSDT", config.timeframe, 240);
      const btcBias = inferBtcBias(btcCandles);
      const out: Signal[] = [];

      for (const symbol of SYMBOLS) {
        const candles = symbol === "BTCUSDT" ? btcCandles : await fetchCandles(config, symbol, config.timeframe, 240);
        out.push(buildSignal(symbol, candles, btcBias, config));
      }

      const sorted = out.sort((a, b) => b.score - a.score);
      const newAudit = [
        {
          id: `${Date.now()}`,
          at: Date.now(),
          message: `Đã phân tích ${sorted.length} symbol qua ${config.dataSourceMode}`,
        },
        ...auditLogs,
      ].slice(0, 100);

      setSignals(sorted);
      setAuditLogs(newAudit);
      setApiStatus("API ổn");
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

      for (const signal of signals.slice(0, 6)) {
        const candles1m = await fetchCandles(config, signal.symbol, "1m", 1000);
        logs.push(executeRealForwardTest1m(signal, candles1m));
      }

      const merged = new Map(forwardLogs.map((l) => [l.signalId, l]));
      logs.forEach((l) => merged.set(l.signalId, l));

      const nextLogs = Array.from(merged.values());
      const newAudit = [
        {
          id: `${Date.now()}`,
          at: Date.now(),
          message: "Đã chạy Forward Test thật bằng nến 1m cho top 6 tín hiệu",
        },
        ...auditLogs,
      ].slice(0, 100);

      setForwardLogs(nextLogs);
      setAuditLogs(newAudit);
      setApiStatus("Forward Test 1m hoàn tất");
      persist(signals, nextLogs, newAudit);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lỗi Forward Test 1m";
      const newAudit = [{ id: `${Date.now()}`, at: Date.now(), message: msg }, ...auditLogs].slice(0, 100);

      setApiStatus(`Lỗi: ${msg}`);
      setAuditLogs(newAudit);
      persist(signals, forwardLogs, newAudit);
    }
  }

  async function syncCloud() {
    try {
      setSyncStatus("Đang kéo dữ liệu cloud...");

      const remote = await pullSupabase(config);
      const byId = new Map<string, Signal>();

      [...(remote.signals || []), ...signals].forEach((s) => byId.set(s.id, s));

      const logById = new Map<string, ForwardLog>();
      [...(remote.forwardLogs || []), ...forwardLogs].forEach((l) => logById.set(l.signalId, l));

      const nextSignals = Array.from(byId.values()).sort((a, b) => b.score - a.score);
      const nextLogs = Array.from(logById.values());
      const nextAudit = [
        { id: `${Date.now()}`, at: Date.now(), message: "Đã kéo dữ liệu trước khi đẩy lên cloud" },
        ...auditLogs,
      ].slice(0, 100);

      setSyncStatus("Đang đẩy dữ liệu cloud...");

      await pushSupabase(config, {
        signals: nextSignals,
        forwardLogs: nextLogs,
        auditLogs: nextAudit,
        config,
        darkMode,
        updatedAt: Date.now(),
      });

      setSignals(nextSignals);
      setForwardLogs(nextLogs);
      setAuditLogs(nextAudit);
      persist(nextSignals, nextLogs, nextAudit);
      setSyncStatus("Đã đồng bộ");
    } catch (err) {
      setSyncStatus(err instanceof Error ? `Lỗi đồng bộ: ${err.message}` : "Lỗi đồng bộ");
    }
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
    setAuditLogs(newAudit);
    persist(signals, [], newAudit);
  }

  function clearAllLocalData() {
    localStorage.removeItem(LOCAL_KEY);
    setSignals([]);
    setForwardLogs([]);
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
        <div>
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

      <Panel>
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
        </div>

        <label className="fullLabel">
          URL Proxy Cloudflare Worker
          <input value={config.workerProxyUrl} onChange={(e) => setConfig({ ...config, workerProxyUrl: e.target.value })} />
        </label>

        <div className="actions">
          <button onClick={analyze}>Phân tích</button>
          <button className="secondary" onClick={runForwardTest}>
            Chạy Forward Test 1m
          </button>
          <button className="secondary" onClick={syncCloud}>
            Đồng bộ Supabase
          </button>
          <button className="dangerBtn" onClick={clearLogs}>
            Xóa log
          </button>
          <button className="dangerBtn soft" onClick={clearAllLocalData}>
            Xóa toàn bộ local
          </button>
        </div>
      </Panel>

      <div className="filters">
        {(["ALL", "ENTRY", "WAIT", "RISK"] as const).map((f) => (
          <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>
            {f === "ALL" ? "Tất cả" : f === "ENTRY" ? "Vào lệnh OK" : f === "WAIT" ? "Chờ" : "Rủi ro"}
          </button>
        ))}
      </div>

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

      <Panel>
        <h2>SQL và Worker triển khai</h2>
        <div className="actions">
          <button className="secondary" onClick={() => setShowSql(!showSql)}>
            {showSql ? "Ẩn SQL" : "Hiện SQL Supabase"}
          </button>
          <button className="secondary" onClick={() => navigator.clipboard.writeText(SCHEMA_SQL + "\n\n" + RLS_SQL)}>
            Copy SQL
          </button>
          <button className="secondary" onClick={() => setShowWorker(!showWorker)}>
            {showWorker ? "Ẩn Worker" : "Hiện Worker Proxy"}
          </button>
          <button className="secondary" onClick={() => navigator.clipboard.writeText(WORKER_CODE)}>
            Copy Worker
          </button>
        </div>

        {showSql && <pre>{SCHEMA_SQL + "\n\n" + RLS_SQL}</pre>}
        {showWorker && <pre>{WORKER_CODE}</pre>}
      </Panel>
    </div>
  );
}
