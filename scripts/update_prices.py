#!/usr/bin/env python3
"""
update_prices.py — Fetch latest stock prices for Nifty 500 + S&P 500

Fetches current/last-close prices for ~1000 stocks covering:
  - All Nifty 500 constituents (NSE/BSE India)
  - All S&P 500 constituents (NYSE/NASDAQ US)
  - Additional user-specified tickers (via EXTRA_TICKERS env var)

Output: prices.json at the repo root, structured as:
{
  "updatedAt": "2026-06-24T16:30:00Z",
  "source": "yfinance",
  "totalTickers": 987,
  "indices": ["NIFTY500", "SP500"],
  "prices": {
    "INFY": { "price": 1485.50, "currency": "INR", "high52w": 1953.00, "asOf": "2026-06-24" },
    "AAPL": { "price": 198.50, "currency": "USD", "high52w": 260.10, "asOf": "2026-06-24" },
    ...
  }
}

Usage:
  pip install yfinance pandas
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

try:
    import pandas as pd
except ImportError:
    print("ERROR: pandas not installed. Run: pip install pandas", file=sys.stderr)
    sys.exit(1)


# ─── S&P 500 Constituents ────────────────────────────────────────────────────
# Full S&P 500 list. yfinance tickers are used directly.
SP500_TICKERS = [
    "AAPL", "ABBV", "ABT", "ACN", "ADBE", "ADI", "ADM", "ADP", "ADSK", "AEE",
    "AEP", "AES", "AFL", "AIG", "AIZ", "AJG", "AKAM", "ALB", "ALGN", "ALK",
    "ALL", "ALLE", "AMAT", "AMCR", "AMD", "AME", "AMGN", "AMP", "AMT", "AMZN",
    "ANET", "ANSS", "AON", "AOS", "APA", "APD", "APH", "APTV", "ARE", "ATO",
    "ATVI", "AVB", "AVGO", "AVY", "AWK", "AXP", "AZO", "BA", "BAC", "BAX",
    "BBWI", "BBY", "BDX", "BEN", "BF.B", "BIO", "BIIB", "BK", "BKNG", "BKR",
    "BLK", "BMY", "BR", "BRK.B", "BRO", "BSX", "BWA", "BXP", "C", "CAG",
    "CAH", "CARR", "CAT", "CB", "CBOE", "CBRE", "CCI", "CCL", "CDAY", "CDNS",
    "CDW", "CE", "CEG", "CF", "CFG", "CHD", "CHRW", "CHTR", "CI", "CINF",
    "CL", "CLX", "CMA", "CMCSA", "CME", "CMG", "CMI", "CMS", "CNC", "CNP",
    "COF", "COO", "COP", "COST", "CPB", "CPRT", "CPT", "CRL", "CRM", "CSCO",
    "CSGP", "CSX", "CTAS", "CTLT", "CTRA", "CTSH", "CTVA", "CVS", "CVX", "CZR",
    "D", "DAL", "DD", "DE", "DFS", "DG", "DGX", "DHI", "DHR", "DIS",
    "DISH", "DLR", "DLTR", "DOV", "DOW", "DPZ", "DRI", "DTE", "DUK", "DVA",
    "DVN", "DXC", "DXCM", "EA", "EBAY", "ECL", "ED", "EFX", "EL", "EMN",
    "EMR", "ENPH", "EOG", "EPAM", "EQIX", "EQR", "EQT", "ES", "ESS", "ETN",
    "ETR", "ETSY", "EVRG", "EW", "EXC", "EXPD", "EXPE", "EXR", "F", "FANG",
    "FAST", "FBHS", "FCX", "FDS", "FDX", "FE", "FFIV", "FIS", "FISV", "FITB",
    "FLT", "FMC", "FOX", "FOXA", "FRC", "FRT", "FTNT", "FTV", "GD", "GE",
    "GILD", "GIS", "GL", "GLW", "GM", "GNRC", "GOOG", "GOOGL", "GPC", "GPN",
    "GRMN", "GS", "GWW", "HAL", "HAS", "HBAN", "HCA", "HD", "HOLX", "HON",
    "HPE", "HPQ", "HRL", "HSIC", "HST", "HSY", "HUM", "HWM", "IBM", "ICE",
    "IDXX", "IEX", "IFF", "ILMN", "INCY", "INTC", "INTU", "INVH", "IP", "IPG",
    "IQV", "IR", "IRM", "ISRG", "IT", "ITW", "IVZ", "J", "JBHT", "JCI",
    "JKHY", "JNJ", "JNPR", "JPM", "K", "KDP", "KEY", "KEYS", "KHC", "KIM",
    "KLAC", "KMB", "KMI", "KMX", "KO", "KR", "L", "LDOS", "LEN", "LH",
    "LHX", "LIN", "LKQ", "LLY", "LMT", "LNC", "LNT", "LOW", "LRCX", "LUMN",
    "LUV", "LVS", "LW", "LYB", "LYV", "MA", "MAA", "MAR", "MAS", "MCD",
    "MCHP", "MCK", "MCO", "MDLZ", "MDT", "MET", "META", "MGM", "MHK", "MKC",
    "MKTX", "MLM", "MMC", "MMM", "MNST", "MO", "MOH", "MOS", "MPC", "MPWR",
    "MRK", "MRNA", "MRO", "MS", "MSCI", "MSFT", "MSI", "MTB", "MTCH", "MTD",
    "MU", "NCLH", "NDAQ", "NDSN", "NEE", "NEM", "NFLX", "NI", "NKE", "NOC",
    "NOW", "NRG", "NSC", "NTAP", "NTRS", "NUE", "NVDA", "NVR", "NWL", "NWS",
    "NWSA", "NXPI", "O", "ODFL", "OGN", "OKE", "OMC", "ON", "ORCL", "ORLY",
    "OTIS", "OXY", "PARA", "PAYC", "PAYX", "PCAR", "PCG", "PEAK", "PEG", "PEP",
    "PFE", "PFG", "PG", "PGR", "PH", "PHM", "PKG", "PKI", "PLD", "PM",
    "PNC", "PNR", "PNW", "POOL", "PPG", "PPL", "PRU", "PSA", "PSX", "PTC",
    "PVH", "PWR", "PXD", "PYPL", "QCOM", "QRVO", "RCL", "RE", "REG", "REGN",
    "RF", "RHI", "RJF", "RL", "RMD", "ROK", "ROL", "ROP", "ROST", "RSG",
    "RTX", "SBAC", "SBNY", "SBUX", "SCHW", "SEE", "SHW", "SIVB", "SJM", "SLB",
    "SNA", "SNPS", "SO", "SPG", "SPGI", "SRE", "STE", "STT", "STX", "STZ",
    "SWK", "SWKS", "SYF", "SYK", "SYY", "T", "TAP", "TDG", "TDY", "TECH",
    "TEL", "TER", "TFC", "TFX", "TGT", "TMO", "TMUS", "TPR", "TRGP", "TRMB",
    "TROW", "TRV", "TSCO", "TSLA", "TSN", "TT", "TTWO", "TXN", "TXT", "TYL",
    "UAL", "UDR", "UHS", "ULTA", "UNH", "UNP", "UPS", "URI", "USB", "V",
    "VFC", "VICI", "VLO", "VMC", "VNO", "VRSK", "VRSN", "VRTX", "VTR", "VTRS",
    "VZ", "WAB", "WAT", "WBA", "WBD", "WDC", "WEC", "WELL", "WFC", "WHR",
    "WM", "WMB", "WMT", "WRB", "WRK", "WST", "WTW", "WY", "WYNN", "XEL",
    "XOM", "XRAY", "XYL", "YUM", "ZBH", "ZBRA", "ZION", "ZTS",
]

# ─── Nifty 500 Constituents ──────────────────────────────────────────────────
# Top ~500 Indian stocks by market cap (NSE). yfinance uses .NS suffix.
NIFTY500_TICKERS = [
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "HINDUNILVR", "SBIN",
    "BHARTIARTL", "ITC", "KOTAKBANK", "LT", "HCLTECH", "AXISBANK", "ASIANPAINT",
    "MARUTI", "SUNPHARMA", "TITAN", "BAJFINANCE", "DMART", "NTPC", "TATAMOTORS",
    "NESTLEIND", "WIPRO", "ULTRACEMCO", "ONGC", "JSWSTEEL", "POWERGRID", "M&M",
    "TATASTEEL", "ADANIENT", "ADANIPORTS", "COALINDIA", "BAJAJFINSV", "GRASIM",
    "TECHM", "HDFCLIFE", "DRREDDY", "DIVISLAB", "CIPLA", "BRITANNIA",
    "EICHERMOT", "APOLLOHOSP", "HEROMOTOCO", "INDUSINDBK", "SBILIFE",
    "BAJAJ-AUTO", "TATACONSUM", "GODREJCP", "DABUR", "HINDALCO",
    "BPCL", "GAIL", "IOC", "PIDILITIND", "SIEMENS", "HAVELLS",
    "MARICO", "BERGEPAINT", "AMBUJACEM", "ACC", "SHREECEM",
    "CHOLAFIN", "BANKBARODA", "PNB", "CANBK", "IDFCFIRSTB",
    "FEDERALBNK", "BANDHANBNK", "LICHSGFIN", "MANAPPURAM", "MUTHOOTFIN",
    "BAJAJHLDNG", "MFSL", "ICICIGI", "ICICIPRULI", "HDFCAMC",
    "SBICARD", "NAUKRI", "IRCTC", "ZOMATO", "PAYTM",
    "POLICYBZR", "DELHIVERY", "TATAELXSI", "PERSISTENT", "LTTS",
    "MPHASIS", "COFORGE", "HAPPSTMNDS", "ROUTE", "TRENT",
    "PAGEIND", "VOLTAS", "WHIRLPOOL", "BATAINDIA", "RELAXO",
    "JUBLFOOD", "WESTLIFE", "DEVYANI", "SAPPHIRE", "TATACOMM",
    "BHARATFORG", "BOSCHLTD", "MOTHERSON", "EXIDEIND", "AMARAJABAT",
    "ASHOKLEY", "BALKRISIND", "CUMMINSIND", "THERMAX", "AIAENG",
    "GRINDWELL", "SCHAEFFLER", "TIMKEN", "SKFINDIA", "NIACL",
    "STARHEALTH", "MAXHEALTH", "FORTIS", "LALPATHLAB", "METROPOLIS",
    "AUROPHARMA", "BIOCON", "TORNTPHARM", "ALKEM", "IPCALAB",
    "GLENMARK", "LUPIN", "NATCOPHARMA", "LAURUSLABS", "GRANULES",
    "PIIND", "ATUL", "DEEPAKNTR", "NAVINFLUOR", "CLEAN",
    "SRF", "FLUOROCHEM", "AAVAS", "CANFINHOME", "HOMEFIRST",
    "ABSLAMC", "CAMS", "CDSL", "BSE", "MCX",
    "ANGELONE", "MOTILALOFS", "IIFL", "JIOFIN", "ABCAPITAL",
    "POONAWALLA", "SUNDARMFIN", "SHRIRAMFIN", "PEL", "RECLTD",
    "PFC", "IREDA", "HUDCO", "NHPC", "SJVN",
    "TATAPOWER", "ADANIGREEN", "ADANIENSOL", "JSL", "JINDALSTEL",
    "NATIONALUM", "VEDL", "NMDC", "SAIL", "APLAPOLLO",
    "RATNAMANI", "POLYCAB", "KAYNES", "DIXON", "AMBER",
    "SONACOMS", "HAPPSTMNDS", "ZYDUSLIFE", "MANKIND", "MEDANTA",
    "RAINBOW", "KIMS", "YATHARTH", "GLOBALHLT", "MAXFIN",
    "OBEROIRLTY", "DLF", "GODREJPROP", "PRESTIGE", "BRIGADE",
    "PHOENIXLTD", "LODHA", "SOBHA", "SUNTV", "PVRINOX",
    "ZEEL", "NETWORK18", "NAZARA", "LATENTVIEW", "INTELLECT",
    "KPITTECH", "ZENSAR", "BIRLASOFT", "MASTEK", "CYIENT",
    "RATEGAIN", "TANLA", "AFFLE", "MAPMYINDIA", "INDIAMART",
    "NYKAA", "CARTRADE", "EASEMYTRIP", "IXIGO", "YATRA",
    "HAL", "BEL", "BDL", "SOLARINDS", "COCHINSHIP",
    "GRSE", "MAZAGON", "GARDENREACH", "MIDHANI", "PARAS",
    "DATAPATTNS", "DCMSHRIRAM", "GNFC", "GSFC", "CHAMBALFERT",
    "COROMANDEL", "UPL", "SUMICHEM", "RALLIS", "DHANUKA",
    "CROMPTON", "ORIENT", "VGUARD", "BLUESTARLT", "CENTURYPLY",
    "ASTRAL", "SUPREMEIND", "PRINCEPIPE", "FINOLEX", "JKCEMENT",
    "RAMCOCEM", "DALMIACEM", "PRISMJOINS", "STARCEMENT", "HEIDELBERG",
    "INDHOTEL", "LEMONGRASS", "CHALET", "EIH", "TAJGVK",
    "TRIDENT", "RAYMOND", "ARVIND", "KPR", "GOKEX",
    "VBL", "RADICO", "UNITEDSPRT", "GLOBUSSPR", "CAMPUS",
    "METROBRAND", "MANYAVAR", "KALYANJEWE", "SENCO", "PNBHOUSING",
    "AARTI", "FINEORG", "SUDARSCHEM", "VINATI", "LXCHEM",
    "TATACHEM", "ALKYLAMINE", "GALAXYSURF", "NOCIL", "IGPL",
    "MGL", "IGL", "GUJGASLTD", "PETRONET", "GSPL",
    "CONCOR", "IRFC", "RVNL", "RAILTEL", "TIINDIA",
    "CESC", "TORNTPOWER", "JSWENERGY", "KECINTL", "THERMAX",
    "KALPATPOWR", "POWERMECH", "GPPL", "INOXWIND", "SUZLON",
    "ADANIPOWER", "TATAPOWER", "RELINFRA", "LICI", "GICRE",
    "NIACL", "STARHEALTH", "ICICIPRULI", "HDFCLIFE", "SBILIFE",
    "MAXLIFE", "ABSLAMC", "HDFC", "BAJAJHLDNG", "MFSL",
    "INDUSTOWER", "TATACOMM", "IDEA", "HFCL", "STLTECH",
    "DELTACORP", "GUJGAS", "MAHANAGAR", "ATGL", "AWL",
    "HONAUT", "3MINDIA", "ABBOTINDIA", "PFIZER", "SANOFI",
    "GLAXO", "GILLETTE", "COLPAL", "EMAMILTD", "JYOTHYLABS",
]

# Remove duplicates from Nifty list
NIFTY500_TICKERS = list(dict.fromkeys(NIFTY500_TICKERS))


def get_output_path() -> Path:
    """Determine where to write prices.json."""
    env_path = os.environ.get("OUTPUT_PATH")
    if env_path:
        return Path(env_path)
    return Path(__file__).resolve().parent.parent / "prices.json"


def build_ticker_map() -> dict:
    """Build the complete ticker map: app_ticker -> yfinance_symbol."""
    tickers = {}

    # S&P 500 (US — yfinance uses ticker as-is)
    for t in SP500_TICKERS:
        tickers[t] = t

    # Nifty 500 (India — yfinance needs .NS suffix for NSE)
    for t in NIFTY500_TICKERS:
        tickers[t] = t + ".NS"

    # Extra tickers from environment (comma-separated)
    extra = os.environ.get("EXTRA_TICKERS", "")
    if extra:
        for t in extra.split(","):
            t = t.strip().upper()
            if not t:
                continue
            if ".NS" in t or ".BO" in t:
                app_ticker = t.replace(".NS", "").replace(".BO", "")
                tickers[app_ticker] = t
            else:
                tickers[t] = t

    return tickers


def fetch_prices_batch(yf_symbols: list, batch_size: int = 200) -> dict:
    """
    Fetch prices in batches to avoid timeouts.
    yfinance handles up to ~1000 tickers in one call, but batching is safer.
    Returns: { yf_symbol: { price, high52w, asOf } }
    """
    results = {}
    total = len(yf_symbols)

    for i in range(0, total, batch_size):
        batch = yf_symbols[i:i + batch_size]
        batch_num = (i // batch_size) + 1
        total_batches = (total + batch_size - 1) // batch_size
        print(f"  Batch {batch_num}/{total_batches}: fetching {len(batch)} tickers...")

        try:
            data = yf.download(
                tickers=batch,
                period="5d",
                interval="1d",
                group_by="ticker",
                auto_adjust=True,
                progress=False,
                threads=True,
            )

            if data.empty:
                print(f"    WARNING: Empty response for batch {batch_num}")
                continue

            for sym in batch:
                try:
                    if len(batch) == 1:
                        closes = data["Close"].dropna()
                    else:
                        if sym in data.columns.get_level_values(0):
                            closes = data[sym]["Close"].dropna()
                        else:
                            # Try case-insensitive match
                            found = False
                            for col in data.columns.get_level_values(0).unique():
                                if col.upper() == sym.upper():
                                    closes = data[col]["Close"].dropna()
                                    found = True
                                    break
                            if not found:
                                continue

                    if closes is None or closes.empty:
                        continue

                    results[sym] = {
                        "price": round(float(closes.iloc[-1]), 2),
                        "asOf": closes.index[-1].strftime("%Y-%m-%d"),
                    }
                except Exception:
                    continue

        except Exception as e:
            print(f"    WARNING: Batch {batch_num} failed: {e}")
            continue

    return results


def fetch_52w_highs(yf_symbols: list, batch_size: int = 200) -> dict:
    """Fetch 52-week highs using 1-year history (more reliable than fast_info)."""
    highs = {}
    total = len(yf_symbols)

    for i in range(0, total, batch_size):
        batch = yf_symbols[i:i + batch_size]
        batch_num = (i // batch_size) + 1
        total_batches = (total + batch_size - 1) // batch_size
        print(f"  52w high batch {batch_num}/{total_batches}: {len(batch)} tickers...")

        try:
            data = yf.download(
                tickers=batch,
                period="1y",
                interval="1wk",
                group_by="ticker",
                auto_adjust=True,
                progress=False,
                threads=True,
            )

            if data.empty:
                continue

            for sym in batch:
                try:
                    if len(batch) == 1:
                        high_series = data["High"].dropna()
                    else:
                        if sym in data.columns.get_level_values(0):
                            high_series = data[sym]["High"].dropna()
                        else:
                            continue

                    if high_series is not None and not high_series.empty:
                        highs[sym] = round(float(high_series.max()), 2)
                except Exception:
                    continue

        except Exception as e:
            print(f"    WARNING: 52w batch {batch_num} failed: {e}")
            continue

    return highs


def main():
    print("=" * 60)
    print("Stock Price Updater — Nifty 500 + S&P 500")
    print("=" * 60)

    ticker_map = build_ticker_map()
    print(f"Total tickers to fetch: {len(ticker_map)}")
    print(f"  S&P 500: {len(SP500_TICKERS)}")
    print(f"  Nifty 500: {len(NIFTY500_TICKERS)}")

    # Get all yfinance symbols
    yf_symbols = list(set(ticker_map.values()))
    print(f"  Unique yfinance symbols: {len(yf_symbols)}")

    # Reverse map: yf_symbol -> app_ticker
    reverse_map = {}
    for app_ticker, yf_symbol in ticker_map.items():
        reverse_map[yf_symbol] = app_ticker

    # Fetch current prices
    print("\n--- Fetching current prices ---")
    raw_prices = fetch_prices_batch(yf_symbols, batch_size=200)
    print(f"  Got prices for {len(raw_prices)} symbols")

    # Fetch 52-week highs
    print("\n--- Fetching 52-week highs ---")
    raw_highs = fetch_52w_highs(yf_symbols, batch_size=200)
    print(f"  Got 52w highs for {len(raw_highs)} symbols")

    # Assemble final prices dict keyed by app ticker
    prices = {}
    for yf_sym, data in raw_prices.items():
        app_ticker = reverse_map.get(yf_sym, yf_sym.replace(".NS", "").replace(".BO", ""))
        currency = "INR" if yf_sym.endswith((".NS", ".BO")) else "USD"

        entry = {
            "price": data["price"],
            "currency": currency,
            "asOf": data["asOf"],
        }
        if yf_sym in raw_highs:
            entry["high52w"] = raw_highs[yf_sym]

        prices[app_ticker] = entry

    print(f"\n--- Results ---")
    print(f"  Total prices assembled: {len(prices)}")
    print(f"  Indian stocks: {sum(1 for p in prices.values() if p['currency'] == 'INR')}")
    print(f"  US stocks: {sum(1 for p in prices.values() if p['currency'] == 'USD')}")

    # Failed tickers
    fetched_yf = set(raw_prices.keys())
    failed = [s for s in yf_symbols if s not in fetched_yf]
    if failed:
        print(f"  Failed ({len(failed)}): {', '.join(failed[:30])}{'...' if len(failed) > 30 else ''}")

    output = {
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "yfinance",
        "totalTickers": len(prices),
        "indices": ["NIFTY500", "SP500"],
        "prices": prices,
    }

    output_path = get_output_path()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n")
    print(f"\nWritten to: {output_path}")
    print(f"File size: {output_path.stat().st_size / 1024:.1f} KB")
    print(f"Updated at: {output['updatedAt']}")
    print("Done!")


if __name__ == "__main__":
    main()
