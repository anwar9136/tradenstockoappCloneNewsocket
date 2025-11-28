import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { TrendingUp, TrendingDown, ArrowLeft, AlertCircle } from 'lucide-react';
import { tradingAPI } from '../services/api';

// Load Lightweight Charts from CDN once (standalone exposes window.LightweightCharts)
function useLightweightCharts() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (window.LightweightCharts) { setReady(true); return; }
    const scriptId = 'lw-charts-standalone';
    if (document.getElementById(scriptId)) return;
    const s = document.createElement('script');
    s.id = scriptId;
    s.src = 'https://unpkg.com/lightweight-charts@4.2.1/dist/lightweight-charts.standalone.production.js';
    s.async = true;
    s.onload = () => setReady(true);
    s.onerror = () => console.error('Failed to load lightweight-charts');
    document.body.appendChild(s);
  }, []);
  return ready && !!window.LightweightCharts;
}

const floorToMinute = (tsSec) => tsSec - (tsSec % 60);

export default function OrderTrade() {
  const navigate = useNavigate();
  const { token } = useParams();
  const location = useLocation();
  const initialSymbol = location.state?.symbol || null;

  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem('user');
    return storedUser ? JSON.parse(storedUser) : { UserId: 'demo123', Refid: 'ref123' };
  });

  const [symbol, setSymbol] = useState(initialSymbol);
  const [userBalance, setUserBalance] = useState({
    ledgerBalance: 0,
    marginAvailable: 0,
    activePL: 0,
    m2m: 0
  });

  const [activeTab, setActiveTab] = useState('market');
  const [orderData, setOrderData] = useState({
    lotSize: 1,
    stopLoss: '',
    takeProfit: '',
    price: '',
    orderType: 'BUY'
  });
  const [loading, setLoading] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [placingOrderType, setPlacingOrderType] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const chartsReady = useLightweightCharts();
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const wsRef = useRef(null);
  const fxWsRef = useRef(null);
  const lastBarRef = useRef(null);
  const [usdToInrRate, setUsdToInrRate] = useState(88.65);

  // Initialize symbol from location.state or localStorage
  useEffect(() => {
    // If symbol is provided via location.state, use it
    if (initialSymbol && initialSymbol.SymbolToken) {
      setSymbol(initialSymbol);
    } else if (token && (!symbol || symbol.SymbolToken !== token)) {
      // Fallback to localStorage if no symbol in state
      const storedScript = localStorage.getItem('selected_script');
      const storedLot = localStorage.getItem('selectedlotsize');
      const exchange = localStorage.getItem('selected_exchange') || 'MCX';
      setSymbol({
        SymbolToken: token,
        SymbolName: storedScript || `TOKEN_${token}`,
        Lotsize: storedLot || 1,
        ExchangeType: exchange,
        buy: 0,
        sell: 0,
        ltp: 0
      });
    }
  }, [initialSymbol, token]);

  // Update lot size based on exchange type
  useEffect(() => {
    if (symbol?.ExchangeType) {
      const isForex = symbol.ExchangeType === 'FOREX';
      const defaultLotSize = isForex ? 0.01 : 1;
      setOrderData(prev => ({
        ...prev,
        lotSize: defaultLotSize
      }));
    }
  }, [symbol?.ExchangeType]);

  // Load user balance on mount
  useEffect(() => {
    const loadBalance = async () => {
      try {
        setLoading(true);
        const balance = await tradingAPI.getLedgerBalance(user.UserId);
        setUserBalance({
          ledgerBalance: balance,
          marginAvailable: balance,
          activePL: 0,
          m2m: balance
        });
      } catch (e) {
        setError('Failed to load account balance');
      } finally {
        setLoading(false);
      }
    };
    if (user?.UserId) loadBalance();
  }, [user?.UserId]);

  // Create chart once library is ready
  useEffect(() => {
    if (!chartsReady || !containerRef.current || chartRef.current) return;
    const { createChart } = window.LightweightCharts;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 260,
      layout: { background: { color: '#0b1220' }, textColor: '#fff' },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      grid: { vertLines: { color: 'rgba(255,255,255,0.06)' }, horzLines: { color: 'rgba(255,255,255,0.06)' } }
    });
    if (!chart || typeof chart.addCandlestickSeries !== 'function') {
      console.error('Chart API not available');
      return;
    }
    const series = chart.addCandlestickSeries();
    chartRef.current = chart;
    seriesRef.current = series;

    const onResize = () => chart.applyOptions({ width: containerRef.current.clientWidth });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      try { chart.remove(); } catch {}
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [chartsReady]);

  // Fetch USD to INR exchange rate
  useEffect(() => {
    const fetchExchangeRate = async () => {
      try {
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        const data = await response.json();
        if (data.rates && data.rates.INR) {
          setUsdToInrRate(data.rates.INR);
        }
      } catch (error) {
        console.error('Error fetching exchange rate:', error);
      }
    };
    fetchExchangeRate();
    const interval = setInterval(fetchExchangeRate, 5 * 60 * 1000); // Update every 5 minutes
    return () => clearInterval(interval);
  }, []);

  // Subscribe to WS for MCX/NSE tokens and build 1m candles
  useEffect(() => {
    if (!symbol?.SymbolToken || !seriesRef.current) return;
    const isFX = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(symbol?.ExchangeType || '');
    if (isFX) return; // FX symbols use different WebSocket
    
    const uri = 'wss://ws.tradewingss.com/api/webapiwebsoc';
    const ws = new WebSocket(uri);
    wsRef.current = ws;

    ws.onopen = () => {
      try { ws.send(symbol.SymbolToken.toString()); } catch {}
    };
    ws.onmessage = (event) => {
      const raw = event.data;
      if (!raw || raw === '' || raw === 'true') return;
      let tick = null;
      try { tick = JSON.parse(raw); } catch {
        // fallback: take first JSON object
        let depth = 0, buf = '';
        for (let i = 0; i < raw.length; i++) {
          const ch = raw[i];
          if (ch === '{') depth++;
          if (depth > 0) buf += ch;
          if (ch === '}') { depth--; if (depth === 0) break; }
        }
        try { tick = buf ? JSON.parse(buf) : null; } catch {}
      }
      if (!tick || tick.instrument_token?.toString() !== symbol.SymbolToken?.toString()) return;

      const price = parseFloat(tick.last_price);
      const tsSec = Math.floor((tick.timestamp || Date.now()) / 1000);
      const bucket = floorToMinute(tsSec);
      if (!lastBarRef.current || lastBarRef.current.time !== bucket) {
        const newBar = { time: bucket, open: price, high: price, low: price, close: price };
        lastBarRef.current = newBar;
        seriesRef.current.update(newBar);
      } else {
        const bar = lastBarRef.current;
        bar.high = Math.max(bar.high, price);
        bar.low = Math.min(bar.low, price);
        bar.close = price;
        seriesRef.current.update(bar);
      }

      // Update symbol market data
      const bid = tick.bid === "0" || tick.bid === 0 ? tick.last_price : tick.bid;
      const ask = tick.ask === "0" || tick.ask === 0 ? tick.last_price : tick.ask;
      setSymbol(prev => ({
        ...prev,
        buy: parseFloat(ask) || prev?.buy || 0,
        sell: parseFloat(bid) || prev?.sell || 0,
        ltp: parseFloat(tick.last_price) || prev?.ltp || 0,
        chg: parseFloat(tick.change) || prev?.chg || 0,
        high: parseFloat(tick.high_) || prev?.high || 0,
        low: parseFloat(tick.low_) || prev?.low || 0,
        open: parseFloat(tick.open_) || prev?.open || 0,
        close: parseFloat(tick.close_) || prev?.close || 0,
        oi: tick.oi || prev?.oi || 0,
        volume: tick.volume || prev?.volume || 0
      }));
    };
    ws.onclose = () => { wsRef.current = null; };
    ws.onerror = () => {};

    return () => { try { ws.close(); } catch {} };
  }, [symbol?.SymbolToken, symbol?.ExchangeType, chartsReady]);

  // Subscribe to FX WebSocket for FOREX/CRYPTO/COMMODITY
  useEffect(() => {
    if (!symbol?.SymbolName || !seriesRef.current) return;
    const isFX = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(symbol?.ExchangeType || '');
    if (!isFX) return;

    const uri = 'wss://www.fxsoc.tradenstocko.com:8001/ws';
    const ws = new WebSocket(uri);
    fxWsRef.current = ws;

    ws.onopen = () => {
      // FX WebSocket automatically sends all data
    };
    ws.onmessage = (event) => {
      if (!event.data || event.data === '' || event.data === 'true') return;
      try {
        const tickData = JSON.parse(event.data);
        if (!tickData || tickData.type !== 'tick' || !tickData.data) return;
        
        const { Symbol, BestBid, BestAsk, Bids, Asks } = tickData.data;
        const symbolName = symbol.SymbolName?.split('_')[0] || symbol.SymbolName;
        
        if (Symbol !== symbolName && Symbol !== symbol.SymbolName) return;

        const bestBidPriceUSD = BestBid?.Price || 0;
        const bestAskPriceUSD = BestAsk?.Price || 0;
        const bestBidPrice = bestBidPriceUSD * usdToInrRate;
        const bestAskPrice = bestAskPriceUSD * usdToInrRate;
        
        const highUSD = Asks && Asks.length > 0 
          ? Math.max(...Asks.map(ask => ask.Price || 0))
          : bestAskPriceUSD;
        const lowUSD = Bids && Bids.length > 0
          ? Math.min(...Bids.map(bid => bid.Price || 0))
          : bestBidPriceUSD;
        
        const ltpUSD = bestBidPriceUSD && bestAskPriceUSD 
          ? (bestBidPriceUSD + bestAskPriceUSD) / 2 
          : (bestBidPriceUSD || bestAskPriceUSD || 0);
        const ltp = ltpUSD * usdToInrRate;
        
        const totalVolume = (Bids ? Bids.reduce((sum, bid) => sum + (bid.Volume || 0), 0) : 0) +
                           (Asks ? Asks.reduce((sum, ask) => sum + (ask.Volume || 0), 0) : 0);
        
        const prevLtp = symbol?.ltp || ltp;
        const change = ltp - prevLtp;

        // Update chart
        const price = ltpUSD;
        const tsSec = Math.floor(Date.now() / 1000);
        const bucket = floorToMinute(tsSec);
        if (!lastBarRef.current || lastBarRef.current.time !== bucket) {
          const newBar = { time: bucket, open: price, high: price, low: price, close: price };
          lastBarRef.current = newBar;
          seriesRef.current.update(newBar);
        } else {
          const bar = lastBarRef.current;
          bar.high = Math.max(bar.high, price);
          bar.low = Math.min(bar.low, price);
          bar.close = price;
          seriesRef.current.update(bar);
        }

        // Update symbol market data
        setSymbol(prev => ({
          ...prev,
          buy: bestAskPrice,
          sell: bestBidPrice,
          buyUSD: bestAskPriceUSD,
          sellUSD: bestBidPriceUSD,
          ltp: ltp,
          ltpUSD: ltpUSD,
          high: highUSD * usdToInrRate,
          highUSD: highUSD,
          low: lowUSD * usdToInrRate,
          lowUSD: lowUSD,
          chg: change,
          volume: totalVolume,
          open: prev?.open || ltp,
          openUSD: prev?.openUSD || ltpUSD,
          close: prev?.close || ltp,
          closeUSD: prev?.closeUSD || ltpUSD
        }));
      } catch (error) {
        console.error('Error parsing FX WebSocket data:', error);
      }
    };
    ws.onclose = () => { fxWsRef.current = null; };
    ws.onerror = () => {};

    return () => { try { ws.close(); } catch {} };
  }, [symbol?.SymbolName, symbol?.ExchangeType, chartsReady, usdToInrRate]);

  const handleInputChange = (field, value) => {
    setOrderData(prev => ({ ...prev, [field]: value }));
    setError('');
    setSuccess('');
  };

  const formatPrice = (p) => parseFloat(p || 0).toFixed(2);
  
  // Format FX price - show 5 decimal places without rounding (like 1.15830)
  const formatFXPrice = (price) => {
    if (!price || price === 0) return '0.00000';
    const numPrice = parseFloat(price);
    if (isNaN(numPrice)) return '0.00000';
    // Always show 5 decimal places to match FX price format
    return numPrice.toFixed(5);
  };
  
  // Check if symbol is from FX tabs (Crypto/Forex/Commodity)
  const isFXSymbol = () => {
    if (!symbol) return false;
    const exchtype = symbol.ExchangeType || '';
    return ['CRYPTO', 'FOREX', 'COMMODITY'].includes(exchtype);
  };

  // Get USD price for display (for FX symbols) - return raw value without formatting
  const getBuyPriceUSD = () => {
    if (!symbol) return 0;
    if (activeTab === 'market') {
      return symbol.buyUSD || symbol.buy || 0;
    }
    // For limit orders, show the USD price user entered
    return parseFloat(orderData.price || 0);
  };

  const getSellPriceUSD = () => {
    if (!symbol) return 0;
    if (activeTab === 'market') {
      return symbol.sellUSD || symbol.sell || 0;
    }
    // For limit orders, show the USD price user entered
    return parseFloat(orderData.price || 0);
  };

  const calculateMargin = () => {
    if (!symbol || !orderData.lotSize) return 0;
    const lotSize = parseFloat(orderData.lotSize) || 0;
    if (lotSize <= 0) return 0;
    // Use current orderType for margin calculation
    const currentOrderType = orderData.orderType;
    const exchtype = symbol?.ExchangeType || 'MCX';
    const isFX = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(exchtype);
    
    // Get price in INR for margin calculation
    let price;
    if (activeTab === 'market') {
      price = currentOrderType === 'BUY' ? symbol?.buy : symbol?.sell;
    } else {
      // Limit order
      if (isFX && orderData.price && symbol?.buy && symbol?.buyUSD) {
        // Convert USD price to INR using the exchange rate
        const usdToInrRate = symbol.buy / symbol.buyUSD;
        price = parseFloat(orderData.price) * usdToInrRate;
      } else {
        // For non-FX or if conversion data not available, use price as-is (INR)
        price = parseFloat(orderData.price) || 0;
      }
    }
    
    let marginvalue = 0;
    const Intraday_Exposure_Margin_MCX = localStorage.getItem('Intraday_Exposure_Margin_MCX');
    const Intraday_Exposure_Margin_Equity = localStorage.getItem('Intraday_Exposure_Margin_Equity');
    const Intraday_Exposure_Margin_CDS = localStorage.getItem('Intraday_Exposure_Margin_CDS');
    const MCX_Exposure_Type = localStorage.getItem('Mcx_Exposure_Type');
    const NSE_Exposure_Type = localStorage.getItem('NSE_Exposure_Type');
    const CDS_Exposure_Type = localStorage.getItem('CDS_Exposure_Type');
    if (exchtype === 'MCX') {
      if (MCX_Exposure_Type && MCX_Exposure_Type.includes('per_lot')) {
        const symarr = (symbol.SymbolName || '').split('_');
        const similersym = symarr[0]?.toString().trim();
        const Intraday_Exposure = localStorage.getItem('MCX_Exposure_Lot_wise_' + similersym + '_Intraday');
        marginvalue = parseFloat(lotSize) * parseFloat(Intraday_Exposure || 0);
      } else {
        const finallotsize = (parseFloat(lotSize) * parseFloat(symbol?.Lotsize || 1));
        marginvalue = (parseFloat(price) * finallotsize) / parseFloat(Intraday_Exposure_Margin_MCX || 10);
      }
    } else if (exchtype === 'NSE') {
      if (NSE_Exposure_Type === 'per_lot') {
        marginvalue = parseFloat(lotSize) * parseFloat(Intraday_Exposure_Margin_Equity || 0);
      } else {
        const finallotsize = (parseFloat(lotSize) * parseFloat(symbol?.Lotsize || 1));
        marginvalue = (parseFloat(price) * finallotsize) / parseFloat(Intraday_Exposure_Margin_Equity || 10);
      }
    } else {
      if (CDS_Exposure_Type === 'per_lot') {
        marginvalue = parseFloat(lotSize) * parseFloat(Intraday_Exposure_Margin_CDS || 0);
      } else {
        const finallotsize = (parseFloat(lotSize) * parseFloat(symbol?.Lotsize || 1));
        marginvalue = (parseFloat(price) * finallotsize) / parseFloat(Intraday_Exposure_Margin_CDS || 10);
      }
    }
    return marginvalue;
  };

  const placeOrder = async (orderTypeOverride = null) => {
    // Use override if provided, otherwise use current orderData.orderType
    const orderType = orderTypeOverride || orderData.orderType;
    
    // Temporarily set orderType if override is provided
    if (orderTypeOverride) {
      setOrderData(prev => ({ ...prev, orderType: orderTypeOverride }));
    }
    
    if (!symbol) { setError('No symbol selected'); return; }
    const lotSize = parseFloat(orderData.lotSize) || 0;
    const exchangeType = symbol.ExchangeType || 'MCX';
    const isForex = exchangeType === 'FOREX';
    const minLotSize = isForex ? 0.01 : 1;
    
    if (lotSize <= 0) { 
      setError(`Lot size must be greater than 0`); 
      return; 
    }
    if (lotSize < minLotSize) {
      setError(`Minimum lot size is ${minLotSize}${isForex ? '' : ' (whole numbers only)'}`);
      return;
    }
    if (!isForex && !Number.isInteger(lotSize)) {
      setError('Lot size must be a whole number for this exchange');
      return;
    }
    if (activeTab === 'limit' && !orderData.price) { setError('Price is required for limit orders'); return; }

    setOrderLoading(true);
    setPlacingOrderType(orderType);
    setError('');
    setSuccess('');
    try {
      let marginvalue = 0; let holdmarginvalue = 0; let finallotsize = 0;
      const exchtype = symbol.ExchangeType || 'MCX';
      const isFX = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(exchtype);
      
      // Get price in INR for margin calculation and order placement
      let orderprice;
      if (activeTab === 'market') {
        orderprice = orderType === 'BUY' ? symbol.buy : symbol.sell;
      } else {
        // Limit order
        if (isFX && orderData.price && symbol.buy && symbol.buyUSD) {
          // Convert USD price to INR using the exchange rate
          const usdToInrRate = symbol.buy / symbol.buyUSD;
          orderprice = parseFloat(orderData.price) * usdToInrRate;
        } else {
          // For non-FX or if conversion data not available, use price as-is (INR)
          orderprice = parseFloat(orderData.price);
        }
      }
      
      const Intraday_Exposure_Margin_MCX = localStorage.getItem('Intraday_Exposure_Margin_MCX');
      const Holding_Exposure_Margin_MCX = localStorage.getItem('Holding_Exposure_Margin_MCX');
      const Intraday_Exposure_Margin_Equity = localStorage.getItem('Intraday_Exposure_Margin_Equity');
      const Holding_Exposure_Margin_Equity = localStorage.getItem('Holding_Exposure_Margin_Equity');
      const Intraday_Exposure_Margin_CDS = localStorage.getItem('Intraday_Exposure_Margin_CDS');
      const Holding_Exposure_Margin_CDS = localStorage.getItem('Holding_Exposure_Margin_CDS');
      const MCX_Exposure_Type = localStorage.getItem('Mcx_Exposure_Type');
      const NSE_Exposure_Type = localStorage.getItem('NSE_Exposure_Type');
      const CDS_Exposure_Type = localStorage.getItem('CDS_Exposure_Type');

      if (exchtype === 'MCX') {
        if (MCX_Exposure_Type && MCX_Exposure_Type.includes('per_lot')) {
          const symarr = (symbol.SymbolName || '').split('_');
          const similersym = symarr[0]?.toString().trim();
          const Intraday_Exposure = localStorage.getItem('MCX_Exposure_Lot_wise_' + similersym + '_Intraday');
          const Intraday_hold_Exposure = localStorage.getItem('MCX_Exposure_Lot_wise_' + similersym + '_Holding');
          marginvalue = parseFloat(lotSize) * parseFloat(Intraday_Exposure || 0);
          holdmarginvalue = parseFloat(lotSize) * parseFloat(Intraday_hold_Exposure || 0);
        } else {
          finallotsize = (parseFloat(lotSize) * parseFloat(symbol.Lotsize || 1));
          marginvalue = (parseFloat(orderprice) * finallotsize) / parseFloat(Intraday_Exposure_Margin_MCX || 10);
          holdmarginvalue = (parseFloat(orderprice) * finallotsize) / parseFloat(Holding_Exposure_Margin_MCX || 10);
        }
      } else if (exchtype === 'NSE') {
        if (NSE_Exposure_Type === 'per_lot') {
          marginvalue = parseFloat(lotSize) * parseFloat(Intraday_Exposure_Margin_Equity || 0);
          holdmarginvalue = parseFloat(lotSize) * parseFloat(Holding_Exposure_Margin_Equity || 0);
        } else {
          finallotsize = (parseFloat(lotSize) * parseFloat(symbol.Lotsize || 1));
          marginvalue = (parseFloat(orderprice) * finallotsize) / parseFloat(Intraday_Exposure_Margin_Equity || 10);
          holdmarginvalue = (parseFloat(orderprice) * finallotsize) / parseFloat(Holding_Exposure_Margin_Equity || 10);
        }
      } else {
        if (CDS_Exposure_Type === 'per_lot') {
          marginvalue = parseFloat(lotSize) * parseFloat(Intraday_Exposure_Margin_CDS || 0);
          holdmarginvalue = parseFloat(lotSize) * parseFloat(Holding_Exposure_Margin_CDS || 0);
        } else {
          finallotsize = (parseFloat(lotSize) * parseFloat(symbol.Lotsize || 1));
          marginvalue = (parseFloat(orderprice) * finallotsize) / parseFloat(Intraday_Exposure_Margin_CDS || 10);
          holdmarginvalue = (parseFloat(orderprice) * finallotsize) / parseFloat(Holding_Exposure_Margin_CDS || 10);
        }
      }

      const marginAvailable = parseFloat(userBalance.marginAvailable || 0);
      if (parseFloat(marginvalue) > parseFloat(marginAvailable)) {
        setError('Insufficient margin available. Please reduce lot size.');
        setOrderLoading(false);
        return;
      }

      let isstoplossorder = '';
      if (activeTab === 'limit') {
        const bid = symbol.sell || 0; const ask = symbol.buy || 0;
        if (orderType === 'SELL') {
          isstoplossorder = parseFloat(orderprice) > parseFloat(bid) ? 'false' : 'true';
        } else {
          isstoplossorder = parseFloat(orderprice) > parseFloat(ask) ? 'true' : 'false';
        }
      }

      const actualLotSize = localStorage.getItem('SymbolLotSize') || symbol.Lotsize || 1;
      const orderPayload = {
        Id: '', OrderDate: '', OrderTime: '', actualLot: actualLotSize.toString(), selectedlotsize: (parseFloat(orderData.lotSize)||1).toString(), OrderNo: '',
        UserId: localStorage.getItem('userid') || user.UserId,
        UserName: localStorage.getItem('ClientName') || user.UserName || user.UserId,
        OrderCategory: orderType,
        OrderType: activeTab === 'market' ? 'Market' : (isstoplossorder === 'true' ? 'S/L' : 'Limit'),
        ScriptName: symbol.SymbolName,
        TokenNo: symbol.SymbolToken,
        ActionType: activeTab === 'market' ? (orderType === 'BUY' ? 'Bought By Trader' : 'Sold By Trader') : 'Order Placed @@',
        OrderPrice: orderprice.toString(),
        Lot: (parseFloat(orderData.lotSize)||1).toString(),
        MarginUsed: Math.round(parseFloat(marginvalue)).toString(),
        HoldingMarginReq: Math.round(parseFloat(holdmarginvalue)).toString(),
        OrderStatus: activeTab === 'market' ? 'Active' : 'Pending',
        SymbolType: symbol.ExchangeType === 'CDS' ? 'OPT' : (symbol.ExchangeType || 'MCX'),
        isstoplossorder: activeTab === 'limit' ? isstoplossorder : '',
        isedit: 'false'
      };

      let canTrade;
      if (activeTab === 'limit') {
        canTrade = await tradingAPI.checkBeforeTradeForPending(orderPayload);
      } else {
        canTrade = await tradingAPI.checkBeforeTrade(orderPayload);
      }
      if (canTrade !== 'true' && canTrade !== true) {
        setError(canTrade || 'Order validation failed');
        setOrderLoading(false);
        setPlacingOrderType(null);
        return;
      }

      const savePayload = {
        UserId: orderPayload.UserId,
        UserName: orderPayload.UserName,
        OrderCategory: orderPayload.OrderCategory,
        OrderType: orderPayload.OrderType,
        ScriptName: orderPayload.ScriptName,
        TokenNo: orderPayload.TokenNo,
        OrderPrice: orderPayload.OrderPrice,
        Lot: orderPayload.Lot,
        selectedlotsize: orderPayload.selectedlotsize,
        OrderStatus: orderPayload.OrderStatus,
        SymbolType: orderPayload.SymbolType,
        actualLot: orderPayload.actualLot,
        HoldingMarginReq: orderPayload.HoldingMarginReq,
        MarginUsed: orderPayload.HoldingMarginReq
      };

      const saveResponse = await tradingAPI.saveOrderByUser(savePayload);
      if (!saveResponse && saveResponse !== 'true') {
        setError('Failed to save order. Please try again.');
        setOrderLoading(false);
        return;
      }

      setSuccess('Order placed successfully!');
      setOrderLoading(false);
      setPlacingOrderType(null);
      
      // Navigate back after showing success
      setTimeout(() => {
        navigate(-1);
      }, 2000);
    } catch (e) {
      setError(e?.response?.data || e?.message || 'Failed to place order');
      setOrderLoading(false);
      setPlacingOrderType(null);
    }
  };

  return (
    <div className="min-h-screen bg-app-bg text-app-text-primary flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-app-border bg-app-surface">
        <button onClick={() => navigate(-1)} className="text-app-text-secondary hover:text-app-text-primary">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="font-semibold">
          {symbol?.SymbolName?.split('_')[0] || 'Place Order'}
        </div>
      </div>

      {/* Chart */}
      <div className="px-3 pt-3">
        <div ref={containerRef} style={{ width: '100%', height: 260 }} />
        {!chartsReady && (
          <div className="text-xs text-app-text-secondary mt-1">Loading chart...</div>
        )}
      </div>

      {/* Account summary */}
      <div className="px-3 py-2 grid grid-cols-2 gap-2 text-xs bg-app-surface border-t border-b border-app-border mt-3">
        <div className="text-center">
          <div className="text-app-text-secondary">Ledger Balance</div>
          <div className="text-app-text-primary font-semibold trading-price">₹{formatPrice(userBalance.ledgerBalance)}</div>
        </div>
        <div className="text-center">
          <div className="text-app-text-secondary">Margin Available</div>
          <div className="text-app-text-primary font-semibold trading-price">₹{formatPrice(userBalance.marginAvailable)}</div>
        </div>
      </div>

      {/* Market Data Grid */}
      <div className="px-3 py-3 bg-app-surface border-b border-app-border">
        <div className="grid grid-cols-3 gap-3 text-xs">
          {/* Column 1 */}
          <div className="space-y-2">
            <div>
              <div className="text-app-text-secondary mb-0.5">Bid</div>
              <div className="text-app-text-primary font-semibold trading-price">
                {isFXSymbol() ? formatFXPrice(symbol?.sellUSD || symbol?.sell || 0) : formatPrice(symbol?.sell || 0)}
              </div>
            </div>
            <div>
              <div className="text-app-text-secondary mb-0.5">High</div>
              <div className="text-app-text-primary font-semibold trading-price">
                {isFXSymbol() ? formatFXPrice((symbol?.highUSD || symbol?.high || 0)) : formatPrice(symbol?.high || 0)}
              </div>
            </div>
            <div>
              <div className="text-app-text-secondary mb-0.5">Close</div>
              <div className="text-app-text-primary font-semibold trading-price">
                {isFXSymbol() ? formatFXPrice((symbol?.closeUSD || symbol?.close || 0)) : formatPrice(symbol?.close || 0)}
              </div>
            </div>
            <div>
              <div className="text-app-text-secondary mb-0.5">Change</div>
              <div className={`font-semibold trading-price ${(symbol?.chg || 0) >= 0 ? 'text-app-green' : 'text-app-red'}`}>
                {(symbol?.chg || 0) >= 0 ? '+' : ''}{formatPrice(symbol?.chg || 0)}
              </div>
            </div>
          </div>

          {/* Column 2 */}
          <div className="space-y-2">
            <div>
              <div className="text-app-text-secondary mb-0.5">Ask</div>
              <div className="text-app-text-primary font-semibold trading-price">
                {isFXSymbol() ? formatFXPrice(symbol?.buyUSD || symbol?.buy || 0) : formatPrice(symbol?.buy || 0)}
              </div>
            </div>
            <div>
              <div className="text-app-text-secondary mb-0.5">Low</div>
              <div className="text-app-text-primary font-semibold trading-price">
                {isFXSymbol() ? formatFXPrice((symbol?.lowUSD || symbol?.low || 0)) : formatPrice(symbol?.low || 0)}
              </div>
            </div>
            <div>
              <div className="text-app-text-secondary mb-0.5">OL</div>
              <div className="text-app-text-primary font-semibold trading-price">{symbol?.oi || 0}</div>
            </div>
          </div>

          {/* Column 3 */}
          <div className="space-y-2">
            <div>
              <div className="text-app-text-secondary mb-0.5">Ltp</div>
              <div className="text-app-text-primary font-semibold trading-price">
                {isFXSymbol() ? formatFXPrice(symbol?.ltpUSD || symbol?.ltp || 0) : formatPrice(symbol?.ltp || 0)}
              </div>
            </div>
            <div>
              <div className="text-app-text-secondary mb-0.5">Open</div>
              <div className="text-app-text-primary font-semibold trading-price">
                {isFXSymbol() ? formatFXPrice((symbol?.openUSD || symbol?.open || 0)) : formatPrice(symbol?.open || 0)}
              </div>
            </div>
            <div>
              <div className="text-app-text-secondary mb-0.5">Vol</div>
              <div className="text-app-text-primary font-semibold trading-price">{symbol?.volume || 0}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Order form */}
      <div className="p-3 flex-1 overflow-y-auto flex flex-col">
        <div className="flex border-b border-app-border mb-3">
          <button
            onClick={() => setActiveTab('market')}
            className={`flex-1 py-2 px-2 text-xs font-medium ${activeTab === 'market' ? 'text-app-text-primary bg-app-bg border-b-2 border-app-blue' : 'text-app-text-secondary'}`}
          >
            Market
          </button>
          <button
            onClick={() => setActiveTab('limit')}
            className={`flex-1 py-2 px-2 text-xs font-medium ${activeTab === 'limit' ? 'text-app-text-primary bg-app-bg border-b-2 border-app-blue' : 'text-app-text-secondary'}`}
          >
            Limit
          </button>
        </div>

        <div className="mb-2">
          <label className="block text-app-text-primary text-xs font-medium mb-1">Lot Size</label>
          <input
            type="number"
            min={symbol?.ExchangeType === 'FOREX' ? '0.01' : '1'}
            step={symbol?.ExchangeType === 'FOREX' ? '0.01' : '1'}
            max="999"
            value={orderData.lotSize}
            onChange={(e) => {
              const value = e.target.value;
              const exchangeType = symbol?.ExchangeType || 'MCX';
              const isForex = exchangeType === 'FOREX';
              const minValue = isForex ? 0.01 : 1;
              
              // Allow empty input for clearing
              if (value === '') {
                handleInputChange('lotSize', '');
                return;
              }
              
              // For FOREX: allow decimal input (0.01, 0.05, etc.)
              if (isForex) {
                // Allow typing "0." to enter 0.01, 0.05, etc.
                if (value === '0' || value === '0.' || value.startsWith('0.')) {
                  handleInputChange('lotSize', value);
                  return;
                }
                
                const numValue = parseFloat(value);
                if (!isNaN(numValue) && numValue >= minValue) {
                  handleInputChange('lotSize', value);
                }
              } else {
                // For non-FOREX: only allow whole numbers (1, 2, 3, etc.)
                // Prevent decimal input
                if (value.includes('.')) {
                  // Don't allow decimals for non-FOREX
                  return;
                }
                
                const numValue = parseFloat(value);
                if (!isNaN(numValue) && Number.isInteger(numValue) && numValue >= minValue) {
                  handleInputChange('lotSize', value);
                } else if (value === '0' || (numValue > 0 && numValue < minValue)) {
                  // Allow typing but will be validated on submit
                  handleInputChange('lotSize', value);
                }
              }
            }}
            className="w-full px-2 py-1 bg-app-bg border border-app-border rounded-lg text-app-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-app-blue"
          />
          <div className="text-app-text-secondary text-xs mt-1 trading-price">Margin Required: ₹{formatPrice(calculateMargin())}</div>
        </div>

        {activeTab === 'limit' && (
          <div className="mb-2">
            <label className="block text-app-text-primary text-xs font-medium mb-1">Price</label>
            <input
              type="number"
              step="0.01"
              value={orderData.price}
              onChange={(e) => handleInputChange('price', e.target.value)}
              placeholder="Enter price"
              className="w-full px-2 py-1 bg-app-bg border border-app-border rounded-lg text-app-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-app-blue"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="block text-app-text-primary text-xs font-medium mb-1">Stop Loss (Optional)</label>
            <input type="number" step="0.01" value={orderData.stopLoss} onChange={(e)=>handleInputChange('stopLoss', e.target.value)} placeholder="SL" className="w-full px-2 py-1 bg-app-bg border border-app-border rounded-lg text-app-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-app-blue" />
          </div>
          <div>
            <label className="block text-app-text-primary text-xs font-medium mb-1">Take Profit (Optional)</label>
            <input type="number" step="0.01" value={orderData.takeProfit} onChange={(e)=>handleInputChange('takeProfit', e.target.value)} placeholder="TP" className="w-full px-2 py-1 bg-app-bg border border-app-border rounded-lg text-app-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-app-blue" />
          </div>
        </div>

        {error && (
          <div className="mb-2 p-2 bg-app-red/20 border border-app-red rounded-lg flex items-center">
            <AlertCircle className="w-4 h-4 text-app-red mr-1" />
            <span className="text-app-red text-xs">{error}</span>
          </div>
        )}
        {success && (
          <div className="mb-2 p-2 bg-app-green/20 border border-app-green rounded-lg flex items-center">
            <TrendingUp className="w-4 h-4 text-app-green mr-1" />
            <span className="text-app-green text-xs">{success}</span>
          </div>
        )}

        {/* Order Buttons - Direct Place Order at Bottom */}
        <div className="grid grid-cols-2 gap-2 mt-auto pt-4">
          <button
            onClick={() => placeOrder('SELL')}
            disabled={orderLoading || loading}
            className="py-3 px-3 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-app-red hover:bg-red-600 text-white shadow-app-card flex items-center justify-center gap-2"
          >
            {orderLoading && placingOrderType === 'SELL' ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span>Placing...</span>
              </>
            ) : (
              <>
                <TrendingDown className="w-4 h-4" />
                <div className="text-center">
                  <div className="text-xs opacity-90 mb-0.5">SELL</div>
                  {isFXSymbol() ? (
                    <div className="text-base font-bold trading-price">
                      {formatFXPrice(getSellPriceUSD())}
                    </div>
                  ) : (
                    <div className="text-base font-bold trading-price">
                      ₹{formatPrice(activeTab === 'market' ? symbol?.sell : orderData.price || symbol?.sell)}
                    </div>
                  )}
                </div>
              </>
            )}
          </button>
          <button
            onClick={() => placeOrder('BUY')}
            disabled={orderLoading || loading}
            className="py-3 px-3 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-app-green hover:bg-green-600 text-white shadow-app-card flex items-center justify-center gap-2"
          >
            {orderLoading && placingOrderType === 'BUY' ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span>Placing...</span>
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4" />
                <div className="text-center">
                  <div className="text-xs opacity-90 mb-0.5">BUY</div>
                  {isFXSymbol() ? (
                    <div className="text-base font-bold">
                      {formatFXPrice(getBuyPriceUSD())}
                    </div>
                  ) : (
                    <div className="text-base font-bold">
                      ₹{formatPrice(activeTab === 'market' ? symbol?.buy : orderData.price || symbol?.buy)}
                    </div>
                  )}
                </div>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}


