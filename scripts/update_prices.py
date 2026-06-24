#!/usr/bin/env python3
"""
update_prices.py — Fetch latest stock prices and write prices.json

This script is designed to run via GitHub Actions (daily at market close) or
locally. It uses yfinance to pull current/last-close prices for:
  1. All 41 stocks in the bundled dataset (js/data.js)
  2. A configurable list of "common portfolio tickers" that users are likely to
     upload but aren't in the 41-stock discovery list.

Output: prices.json at the repo root, structured as:
{
  "updatedAt": "2026-06-24T16:30:00Z",
  "source": "yfinance",
  "prices": {
    "INFY": { "price": 1485.50, "currency": "INR", "high52w": 1953.00, "asOf": "2026-06-24" },
    "NKE":  { "price": 62.10,   "currency": "USD", "high52w": 123.39, "asOf": "2026-06-24" },
    ...
  }
}

Usage:
  pip install yfinance
  python3 scripts/update_prices.py

Environment variables (optional):
  EXTRA_TICKERS  — comma-separated additional tickers to fetch
  OUTPUT_PATH    — path to write prices.json (default: repo root)
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import yfinance as yf
except ImportError:
    print("ERROR: yfinance not installed. Run: pip install yfinance", file=sys.stderr)
    sys.exit(1)


# ─── Configuration ────────────────────────────────────────────────────────────

# The 41 stocks from our discovery dataset.
# Indian stocks need .NS (NSE) or .BO (BSE) suffix for yfinance.
DATASET_TICKERS = {
    # US stocks (S&P 500)
    "NKE": "NKE",
    "PFE": "PFE",
    "INTC": "INTC",
    "DIS": "DIS",
    "PYPL": "PYPL",
    "CVS": "CVS",
    "TGT": "TGT",
    "MMM": "MMM",
    "BA": "BA",
    "WBA": "WBA",
    "MRNA": "MRNA",
    "EL": "EL",
    "ADBE": "ADBE",
    "DG": "DG",
    "SBUX": "SBUX",
    "F": "F",
    "VZ": "VZ",
    "C": "C",
    "HSY": "HSY",
    "QCOM": "QCOM",
    "DOW": "DOW",
    # India stocks (Nifty) — yfinance uses .NS suffix for NSE
    "HDFCBANK": "HDFCBANK.NS",
    "ASIANPAINT": "ASIANPAINT.NS",
    "BAJFINANCE": "BAJFINANCE.NS",
    "KOTAKBANK": "KOTAKBANK.NS",
    "TATAMOTORS": "TATAMOTORS.NS",
    "HINDUNILVR": "HINDUNILVR.NS",
    "INFY": "INFY.NS",
    "WIPRO": "WIPRO.NS",
    "TECHM": "TECHM.NS",
    "MARUTI": "MARUTI.NS",
    "SBIN": "SBIN.NS",
    "LT": "LT.NS",
    "TITAN": "TITAN.NS",
    "BHARTIARTL": "BHARTIARTL.NS",
    "ULTRACEMCO": "ULTRACEMCO.NS",
    "DRREDDY": "DRREDDY.NS",
    "TATASTEEL": "TATASTEEL.NS",
    "BAJAJ-AUTO": "BAJAJ-AUTO.NS",
    "GRASIM": "GRASIM.NS",
    "ONGC": "ONGC.NS",
}

# Common portfolio tickers that users might upload but aren't in the 41-stock list.
# These get price data too so XIRR works for any uploaded portfolio.
COMMON_EXTRAS = {
    # India popular
    "RELIANCE": "RELIANCE.NS",
    "TCS": "TCS.NS",
    "ICICIBANK": "ICICIBANK.NS",
    "HCLTECH": "HCLTECH.NS",
    "ITC": "ITC.NS",
    "SUNPHARMA": "SUNPHARMA.NS",
    "AXISBANK": "AXISBANK.NS",
    "NESTLEIND": "NESTLEIND.NS",
    "POWERGRID": "POWERGRID.NS",
    "NTPC": "NTPC.NS",
    "COALINDIA": "COALINDIA.NS",
    "ADANIENT": "ADANIENT.NS",
    "ADANIPORTS": "ADANIPORTS.NS",
    "JSWSTEEL": "JSWSTEEL.NS",
    "HINDALCO": "HINDALCO.NS",
    "INDUSINDBK": "INDUSINDBK.NS",
    "CIPLA": "CIPLA.NS",
    "DIVISLAB": "DIVISLAB.NS",
    "EICHERMOT": "EICHERMOT.NS",
    "HEROMOTOCO": "HEROMOTOCO.NS",
    # US popular
    "AAPL": "AAPL",
    "MSFT": "MSFT",
    "GOOGL": "GOOGL",
    "AMZN": "AMZN",
    "TSLA": "TSLA",
    "META": "META",
    "NVDA": "NVDA",
    "JPM": "JPM",
    "V": "V",
    "JNJ": "JNJ",
    "WMT": "WMT",
    "PG": "PG",
    "MA": "MA",
    "UNH": "UNH",
    "HD": "HD",
    "KO": "KO",
    "PEP": "PEP",
    "NFLX": "NFLX",
    "CRM": "CRM",
    "AMD": "AMD",
}


def get_output_path() -> Path:
    """Determine where to write prices.json."""
    env_path = os.environ.get("OUTPUT_PATH")
    if env_path:
        return Path(env_path)
    # Default: repo root (one level up from scripts/)
    return Path(__file__).resolve().parent.parent / "prices.json"


def build_ticker_map() -> dict:
    """Merge dataset + extras + env-provided tickers."""
    tickers = {}
    tickers.update(DATASET_TICKERS)
    tickers.update(COMMON_EXTRAS)

    # Extra tickers from environment (comma-separated, can include .NS suffix)
    extra = os.environ.get("EXTRA_TICKERS", "")
    if extra:
        for t in extra.split(","):
            t = t.strip().upper()
            if not t:
                continue
            # If no suffix and looks Indian (all alpha, len > 4), add .NS
            app_ticker = t.replace(".NS", "").replace(".BO", "")
            tickers[app_ticker] = t

    return tickers


def fetch_prices(ticker_map: dict) -> dict:
    """Fetch current prices for all tickers using yfinance batch download."""
    yf_symbols = list(set(ticker_map.values()))
    print(f"Fetching prices for {len(yf_symbols)} symbols...")

    # yfinance batch download (fast — single HTTP call for all tickers)
    data = yf.download(
        tickers=yf_symbols,
        period="5d",       # last 5 trading days (ensures we get at least 1 close)
        interval="1d",
        group_by="ticker",
        auto_adjust=True,
        progress=False,
        threads=True,
    )

    # Also fetch 52-week high via Ticker.info (slower but comprehensive)
    # We'll do this in a batch-friendly way
    prices = {}
    failed = []

    # Reverse map: yf_symbol -> app_ticker
    reverse_map = {}
    for app_ticker, yf_symbol in ticker_map.items():
        reverse_map[yf_symbol] = app_ticker

    for yf_symbol in yf_symbols:
        app_ticker = reverse_map.get(yf_symbol, yf_symbol)
        try:
            # Get last close from the batch download
            if len(yf_symbols) == 1:
                # Single ticker: data is a flat DataFrame
                closes = data["Close"].dropna()
            else:
                # Multi-ticker: data is multi-level columns
                if yf_symbol in data.columns.get_level_values(0):
                    closes = data[yf_symbol]["Close"].dropna()
                else:
                    # Try case variations
                    closes = None
                    for col in data.columns.get_level_values(0).unique():
                        if col.upper() == yf_symbol.upper():
                            closes = data[col]["Close"].dropna()
                            break

            if closes is None or closes.empty:
                failed.append(yf_symbol)
                continue

            last_price = round(float(closes.iloc[-1]), 2)
            last_date = closes.index[-1].strftime("%Y-%m-%d")

            # Determine currency from suffix
            currency = "INR" if yf_symbol.endswith((".NS", ".BO")) else "USD"

            # Get 52-week high (use Ticker.fast_info for speed)
            high_52w = None
            try:
                ticker_obj = yf.Ticker(yf_symbol)
                fast = ticker_obj.fast_info
                high_52w = round(float(fast.get("year_high", 0) or 0), 2) or None
            except Exception:
                pass

            prices[app_ticker] = {
                "price": last_price,
                "currency": currency,
                "asOf": last_date,
            }
            if high_52w:
                prices[app_ticker]["high52w"] = high_52w

        except Exception as e:
            print(f"  WARNING: Failed to get price for {yf_symbol}: {e}")
            failed.append(yf_symbol)

    if failed:
        print(f"  Failed tickers ({len(failed)}): {', '.join(failed[:20])}")

    return prices


def main():
    print("=" * 60)
    print("Stock Price Updater")
    print("=" * 60)

    ticker_map = build_ticker_map()
    print(f"Total tickers to fetch: {len(ticker_map)}")

    prices = fetch_prices(ticker_map)
    print(f"Successfully fetched: {len(prices)} prices")

    output = {
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "yfinance",
        "totalTickers": len(prices),
        "prices": prices,
    }

    output_path = get_output_path()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n")
    print(f"Written to: {output_path}")
    print(f"Updated at: {output['updatedAt']}")
    print("Done!")


if __name__ == "__main__":
    main()
