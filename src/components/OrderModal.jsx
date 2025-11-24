import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, TrendingUp, TrendingDown, Clock, AlertCircle } from 'lucide-react';
import { tradingAPI } from '../services/api';
import ChartModal from './ChartModal';
import { getCachedKYCStatus, fetchAndCacheKYCStatus } from '../utils/kycUtils';

const OrderModal = ({ 
  isOpen, 
  onClose, 
  symbol, 
  user, 
  onOrderPlaced 
}) => {
  const [activeTab, setActiveTab] = useState('market');
  const [orderData, setOrderData] = useState({
    lotSize: 1,
    stopLoss: '',
    takeProfit: '',
    price: '',
    orderType: 'BUY'
  });
  const [userBalance, setUserBalance] = useState({
    ledgerBalance: 0,
    marginAvailable: 0,
    activePL: 0,
    m2m: 0
  });
  const [loading, setLoading] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [placingOrderType, setPlacingOrderType] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [lotSizeError, setLotSizeError] = useState('');
  const [kycStatus, setKycStatus] = useState(null); // null = loading, true = completed, false = incomplete
  const [usdToInrRate, setUsdToInrRate] = useState(88.65);
  const [liveSymbol, setLiveSymbol] = useState(symbol); // Local state for live price updates
  const [isChartModalOpen, setIsChartModalOpen] = useState(false);
  
  // WebSocket refs for live price updates
  const wsRef = useRef(null);
  const fxWsRef = useRef(null);

  // Use liveSymbol instead of symbol for price calculations
  // Define this before useEffect hooks that use it
  const currentSymbol = liveSymbol || symbol;

  // Update liveSymbol when symbol prop changes
  useEffect(() => {
    setLiveSymbol(symbol);
    // Clear lot size error when symbol changes
    setLotSizeError('');
  }, [symbol]);

  // Get KYC status from cache when modal opens (fast, non-blocking)
  useEffect(() => {
    if (!isOpen || !user?.UserId) {
      setKycStatus(null);
      return;
    }

    // First, try to get from cache (instant)
    const cachedStatus = getCachedKYCStatus(user.UserId);
    if (cachedStatus !== null) {
      setKycStatus(cachedStatus);
    } else {
      // If not cached, fetch and cache it (non-blocking)
      fetchAndCacheKYCStatus(user.UserId).then(status => {
        if (status !== null) {
          setKycStatus(status);
        }
        // If fetch fails, allow orders to proceed (optimistic)
      }).catch(error => {
        console.log('KYC status fetch error - allowing orders to proceed');
        // Don't block orders on error
      });
    }
  }, [isOpen, user?.UserId]);

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
    if (isOpen) {
      fetchExchangeRate();
      const interval = setInterval(fetchExchangeRate, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  // Load user balance and active orders when modal opens
  useEffect(() => {
    if (isOpen && user?.UserId) {
      loadUserBalance();
    }
  }, [isOpen, user?.UserId]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setOrderData({
        lotSize: 1,
        stopLoss: '',
        takeProfit: '',
        price: '',
        orderType: 'BUY'
      });
      setError('');
      setSuccess('');
      setActiveTab('market');
      setPlacingOrderType(null);
    }
  }, [isOpen]);

  // WebSocket for MCX/NSE symbols
  useEffect(() => {
    if (!isOpen || !currentSymbol?.SymbolToken) return;
    const isFX = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(currentSymbol?.ExchangeType || '');
    if (isFX) return;

    const uri = 'wss://ws.tradewingss.com/api/webapiwebsoc';
    const ws = new WebSocket(uri);
    wsRef.current = ws;

    ws.onopen = () => {
      try { ws.send(currentSymbol.SymbolToken.toString()); } catch {}
    };

    ws.onmessage = (event) => {
      const raw = event.data;
      if (!raw || raw === '' || raw === 'true') return;
      let tick = null;
      try { tick = JSON.parse(raw); } catch {
        let depth = 0, buf = '';
        for (let i = 0; i < raw.length; i++) {
          const ch = raw[i];
          if (ch === '{') depth++;
          if (depth > 0) buf += ch;
          if (ch === '}') { depth--; if (depth === 0) break; }
        }
        try { tick = buf ? JSON.parse(buf) : null; } catch {}
      }
      if (!tick || tick.instrument_token?.toString() !== currentSymbol.SymbolToken?.toString()) return;

      const bid = tick.bid === "0" || tick.bid === 0 ? tick.last_price : tick.bid;
      const ask = tick.ask === "0" || tick.ask === 0 ? tick.last_price : tick.ask;
      
      // Update local symbol state with live prices
      setLiveSymbol(prev => ({
        ...prev,
        buy: parseFloat(ask) || prev?.buy || 0,
        sell: parseFloat(bid) || prev?.sell || 0,
        ltp: parseFloat(tick.last_price) || prev?.ltp || 0
      }));
    };

    ws.onclose = () => { wsRef.current = null; };
    ws.onerror = () => {};

    return () => { try { ws.close(); } catch {} };
  }, [isOpen, currentSymbol?.SymbolToken, currentSymbol?.ExchangeType]);

  // WebSocket for FX symbols (FOREX/CRYPTO/COMMODITY)
  useEffect(() => {
    if (!isOpen || !currentSymbol?.SymbolName) return;
    const isFX = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(currentSymbol?.ExchangeType || '');
    if (!isFX) return;

    const uri = 'wss://www.fxsoc.tradenstocko.com:8001/ws';
    const ws = new WebSocket(uri);
    fxWsRef.current = ws;

    ws.onopen = () => {};

    ws.onmessage = (event) => {
      if (!event.data || event.data === '' || event.data === 'true') return;
      try {
        const tickData = JSON.parse(event.data);
        if (!tickData || tickData.type !== 'tick' || !tickData.data) return;
        
        const { Symbol, BestBid, BestAsk } = tickData.data;
        const symbolName = currentSymbol.SymbolName?.split('_')[0] || currentSymbol.SymbolName;
        
        if (Symbol !== symbolName && Symbol !== currentSymbol.SymbolName) return;

        const bestBidPriceUSD = BestBid?.Price || 0;
        const bestAskPriceUSD = BestAsk?.Price || 0;
        const bestBidPrice = bestBidPriceUSD * usdToInrRate;
        const bestAskPrice = bestAskPriceUSD * usdToInrRate;
        
        // Update local symbol state with live FX prices
        setLiveSymbol(prev => ({
          ...prev,
          buy: bestAskPrice,
          sell: bestBidPrice,
          buyUSD: bestAskPriceUSD,
          sellUSD: bestBidPriceUSD,
          ltp: (bestBidPrice + bestAskPrice) / 2,
          ltpUSD: (bestBidPriceUSD + bestAskPriceUSD) / 2
        }));
      } catch (error) {
        console.error('Error parsing FX WebSocket data:', error);
      }
    };

    ws.onclose = () => { fxWsRef.current = null; };
    ws.onerror = () => {};

    return () => { try { ws.close(); } catch {} };
  }, [isOpen, currentSymbol?.SymbolName, currentSymbol?.ExchangeType, usdToInrRate]);

  const loadUserBalance = async () => {
    try {
      setLoading(true);
      const balance = await tradingAPI.getLedgerBalance(user.UserId);
      setUserBalance({
        ledgerBalance: balance,
        marginAvailable: balance,
        activePL: 0,
        m2m: balance
      });
    } catch (error) {
      console.error('Error loading user balance:', error);
      setError('Failed to load account balance');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setOrderData(prev => ({
      ...prev,
      [field]: value
    }));
    setError('');
    setSuccess('');
    
    // Validate lot size in real-time
    if (field === 'lotSize') {
      validateLotSize(value);
    } else {
      setLotSizeError('');
    }
  };

  const validateLotSize = (value) => {
    if (!value || value === '') {
      setLotSizeError('');
      return;
    }

    const exchtype = currentSymbol?.ExchangeType || 'MCX';
    const numValue = parseFloat(value);
    
    if (isNaN(numValue)) {
      setLotSizeError('');
      return;
    }

    if (exchtype === 'FOREX') {
      if (numValue > 0 && numValue < 0.01) {
        setLotSizeError('Min 0.01');
      } else {
        setLotSizeError('');
      }
    } else {
      // MCX, NSE, OPT, CRYPTO, COMMODITY: minimum is 1
      if (numValue > 0 && numValue < 1) {
        setLotSizeError('Min 1');
      } else {
        setLotSizeError('');
      }
    }
  };

  const validateOrder = () => {
    if (!currentSymbol) {
      setError('No symbol selected');
      return false;
    }

    // Check KYC status before validating order
    // Only block if we know for certain KYC is incomplete
    // Allow validation to proceed if KYC status is still loading (optimistic approach)
    if (kycStatus === false) {
      setError('Please complete your KYC verification before placing orders. Go to Profile > KYC to submit your documents.');
      return false;
    }
    // If KYC status is null (still loading), allow validation to proceed
    // The backend will validate KYC status anyway

    // Check if lot size has validation error
    if (lotSizeError) {
      const exchtype = currentSymbol.ExchangeType || 'MCX';
      if (lotSizeError === 'Min 0.01') {
        setError(`Minimum lot size for Forex is 0.01`);
      } else if (lotSizeError === 'Min 1') {
        const exchangeName = exchtype === 'MCX' ? 'MCX' : (exchtype === 'NSE' ? 'NSE' : (exchtype === 'OPT' ? 'Options' : (exchtype === 'CRYPTO' ? 'Crypto' : 'Commodity')));
        setError(`Minimum lot size for ${exchangeName} is 1`);
      } else {
        setError(lotSizeError);
      }
      return false;
    }

    const lotSize = parseFloat(orderData.lotSize) || 0;
    if (!orderData.lotSize || lotSize <= 0) {
      setError('Lot size must be greater than 0');
      return false;
    }

    // Validate lot size limits
    const exchtype = currentSymbol.ExchangeType || 'MCX';
    if (exchtype === 'CRYPTO') {
      // CRYPTO minimum lot size is 1
      const cryptoMinLot = 1;
      const minLot = Math.max(cryptoMinLot, parseFloat(localStorage.getItem('MinLotSingleTradeCrypto') || 0));
      const maxLot = parseFloat(localStorage.getItem('MaxLotSingleTradeCrypto') || 0);
      if (lotSize < cryptoMinLot) {
        setError(`Minimum lot size for Crypto is ${cryptoMinLot}`);
        return false;
      }
      if (minLot > cryptoMinLot && lotSize < minLot) {
        setError(`Minimum lot size for Crypto is ${minLot}`);
        return false;
      }
      if (maxLot > 0 && lotSize > maxLot) {
        setError(`Maximum lot size for Crypto is ${maxLot}`);
        return false;
      }
    } else if (exchtype === 'FOREX') {
      // FOREX minimum lot size is 0.01
      const forexMinLot = 0.01;
      const minLot = Math.max(forexMinLot, parseFloat(localStorage.getItem('MinLotSingleTradeForex') || 0));
      const maxLot = parseFloat(localStorage.getItem('MaxLotSingleTradeForex') || 0);
      if (lotSize < forexMinLot) {
        setError(`Minimum lot size for Forex is ${forexMinLot}`);
        return false;
      }
      if (minLot > forexMinLot && lotSize < minLot) {
        setError(`Minimum lot size for Forex is ${minLot}`);
        return false;
      }
      if (maxLot > 0 && lotSize > maxLot) {
        setError(`Maximum lot size for Forex is ${maxLot}`);
        return false;
      }
    } else if (exchtype === 'COMMODITY') {
      // COMMODITY minimum lot size is 1
      const commodityMinLot = 1;
      const minLot = Math.max(commodityMinLot, parseFloat(localStorage.getItem('MinLotSingleTradeCommodity') || 0));
      const maxLot = parseFloat(localStorage.getItem('MaxLotSingleTradeCommodity') || 0);
      if (lotSize < commodityMinLot) {
        setError(`Minimum lot size for Commodity is ${commodityMinLot}`);
        return false;
      }
      if (minLot > commodityMinLot && lotSize < minLot) {
        setError(`Minimum lot size for Commodity is ${minLot}`);
        return false;
      }
      if (maxLot > 0 && lotSize > maxLot) {
        setError(`Maximum lot size for Commodity is ${maxLot}`);
        return false;
      }
    } else if (exchtype === 'MCX' || exchtype === 'NSE' || exchtype === 'OPT') {
      // MCX, NSE, OPT minimum lot size is 1
      if (lotSize < 1) {
        const exchangeName = exchtype === 'MCX' ? 'MCX' : (exchtype === 'NSE' ? 'NSE' : 'Options');
        setError(`Minimum lot size for ${exchangeName} is 1`);
        return false;
      }
    }

    if (activeTab === 'limit' && !orderData.price) {
      setError('Price is required for limit orders');
      return false;
    }

    if (orderData.stopLoss && parseFloat(orderData.stopLoss) <= 0) {
      setError('Stop loss must be greater than 0');
      return false;
    }

    if (orderData.takeProfit && parseFloat(orderData.takeProfit) <= 0) {
      setError('Take profit must be greater than 0');
      return false;
    }

    return true;
  };

  const calculateMargin = useMemo(() => {
    if (!currentSymbol || !orderData.lotSize) return 0;
    
    const lotSize = parseFloat(orderData.lotSize) || 0;
    if (lotSize <= 0) return 0;
    
    const exchtype = currentSymbol.ExchangeType || 'MCX';
    const isFX = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(exchtype);
    
    // Get price in INR for margin calculation
    let price;
    if (activeTab === 'market') {
      price = orderData.orderType === 'BUY' ? (currentSymbol.buy || 0) : (currentSymbol.sell || 0);
    } else {
      // Limit order
      if (isFX && orderData.price && currentSymbol.buy && currentSymbol.buyUSD) {
        // Convert USD price to INR using the exchange rate
        const usdToInrRate = currentSymbol.buy / currentSymbol.buyUSD;
        price = parseFloat(orderData.price) * usdToInrRate;
      } else {
        // For non-FX or if conversion data not available, use price as-is (INR)
        price = parseFloat(orderData.price) || 0;
      }
    }
    
    // Use the same margin calculation logic as placeOrder
    let marginvalue = 0;
    
    // Get exposure margins from localStorage
    const Intraday_Exposure_Margin_MCX = localStorage.getItem("Intraday_Exposure_Margin_MCX");
    const Intraday_Exposure_Margin_Equity = localStorage.getItem("Intraday_Exposure_Margin_Equity");
    const Intraday_Exposure_Margin_CDS = localStorage.getItem("Intraday_Exposure_Margin_CDS");
    
    // Get FX-specific margins
    const CryptoIntradayMargin = localStorage.getItem("CryptoIntradayMargin");
    const ForexIntradayMargin = localStorage.getItem("ForexIntradayMargin");
    const CommodityIntradayMargin = localStorage.getItem("CommodityIntradayMargin");
    
    // Get exposure types
    const MCX_Exposure_Type = localStorage.getItem("Mcx_Exposure_Type");
    const NSE_Exposure_Type = localStorage.getItem("NSE_Exposure_Type");
    const CDS_Exposure_Type = localStorage.getItem("CDS_Exposure_Type");
    
    if (exchtype === 'MCX') {
        if (MCX_Exposure_Type && MCX_Exposure_Type.includes("per_lot")) {
          const symbolname = currentSymbol.SymbolName;
          const symarr = symbolname.split("_");
          const similersym = symarr[0]?.toString().trim();
          const Intraday_Exposure = localStorage.getItem("MCX_Exposure_Lot_wise_" + similersym + "_Intraday");
          marginvalue = parseFloat(lotSize) * parseFloat(Intraday_Exposure || 0);
        } else {
          marginvalue = (parseFloat(price) * parseFloat(lotSize)) / parseFloat(Intraday_Exposure_Margin_MCX || 10);
        }
      } else if (exchtype === 'NSE') {
        if (NSE_Exposure_Type === "per_lot") {
          marginvalue = parseFloat(lotSize) * parseFloat(Intraday_Exposure_Margin_Equity || 0);
        } else {
          marginvalue = (parseFloat(price) * parseFloat(lotSize)) / parseFloat(Intraday_Exposure_Margin_Equity || 10);
        }
      } else if (exchtype === 'CRYPTO') {
        // Formula: Margin = (Lot × lotsize × BaseCurrency/INR) ÷ Leverage
        const cryptoMargin = parseFloat(CryptoIntradayMargin || 0);
        const finallotsize = (parseFloat(lotSize) * parseFloat(currentSymbol.Lotsize || 1));
        // If margin value is large (> 1000), treat as per_lot, otherwise as leverage
        if (cryptoMargin > 1000) {
          marginvalue = parseFloat(lotSize) * cryptoMargin;
        } else if (cryptoMargin > 0) {
          // Get base currency to INR rate
          let baseToInrRate = 0;
          
          // Extract base currency from symbol name (e.g., "BTCUSD" -> "BTC", "ETHUSD" -> "ETH")
          const symbolName = (currentSymbol.SymbolName || '').toUpperCase().replace(/[^A-Z]/g, '');
          const baseCurrency = symbolName.substring(0, 3); // First 3 letters are base currency
          
          // For USD-based pairs (BTC/USD, ETH/USD, etc.)
          if (baseCurrency !== 'USD' && currentSymbol.buyUSD && usdToInrRate) {
            // For pairs like BTC/USD: BTC/INR = BTC/USD × USD/INR
            baseToInrRate = currentSymbol.buyUSD * usdToInrRate;
          } 
          // Fallback: use buy price if available (should already be in INR for some pairs)
          else if (currentSymbol.buy) {
            baseToInrRate = currentSymbol.buy;
          }
          
          // Calculate margin: (Lot × lotsize × BaseCurrency/INR) ÷ Leverage
          // baseToInrRate is already in INR, so margin is already in INR
          if (baseToInrRate > 0) {
            marginvalue = (finallotsize * baseToInrRate) / cryptoMargin;
          } else {
            marginvalue = 0;
          }
        } else {
          marginvalue = 0;
        }
      } else if (exchtype === 'FOREX') {
        // Formula: Margin = (Lot × lotsize × BaseCurrency/INR) ÷ Leverage
        const forexMargin = parseFloat(ForexIntradayMargin || 0);
        const symbolLotsize = parseFloat(currentSymbol.Lotsize || 1);
        const finallotsize = (parseFloat(lotSize) * symbolLotsize);
        
        
        
        // If margin value is large (> 1000), treat as per_lot, otherwise as leverage
        if (forexMargin > 1000) {
          marginvalue = parseFloat(lotSize) * forexMargin;
          console.log('Using per_lot mode. marginvalue:', marginvalue);
        } else if (forexMargin > 0) {
          // Get base currency to INR rate
          // For EUR/USD: base currency is EUR, we need EUR/INR rate
          // For GBP/JPY: base currency is GBP, we need GBP/INR rate
          // For AUD/NZD: base currency is AUD, we need AUD/INR rate
          let baseToInrRate = 0;
          
          // Extract base currency from symbol name (e.g., "EURUSD" -> "EUR", "GBPJPY" -> "GBP")
          const symbolName = (currentSymbol.SymbolName || '').toUpperCase().replace(/[^A-Z]/g, '');
          const baseCurrency = symbolName.substring(0, 3); // First 3 letters are base currency
          
          console.log('symbolName:', symbolName);
          console.log('baseCurrency:', baseCurrency);
          
          // For USD-based pairs (EUR/USD, GBP/USD, AUD/USD, etc.)
          if (baseCurrency !== 'USD' && currentSymbol.buyUSD && usdToInrRate) {
            // For pairs like EUR/USD: EUR/INR = EUR/USD × USD/INR
            baseToInrRate = currentSymbol.buyUSD * usdToInrRate;
            console.log('Using USD-based pair calculation');
            console.log('baseToInrRate = buyUSD × usdToInrRate =', currentSymbol.buyUSD, '×', usdToInrRate, '=', baseToInrRate);
          } 
          // For JPY-based pairs (GBP/JPY, EUR/JPY, etc.) - need JPY/INR then convert
          else if (symbolName.includes('JPY') && baseCurrency !== 'JPY') {
            // For GBP/JPY: GBP/INR = GBP/JPY × JPY/INR
            // JPY/INR = USD/INR / USD/JPY (approximate)
            // This is complex, so we'll use a fallback
            if (currentSymbol.buy && usdToInrRate) {
              // Approximate: if we have GBP/JPY rate, we need GBP/INR
              // For now, use buy price if it's already in INR
              baseToInrRate = currentSymbol.buy;
              console.log('Using JPY-based pair fallback. baseToInrRate:', baseToInrRate);
            }
          }
          // Fallback: use buy price if available (should already be in INR for some pairs)
          else if (currentSymbol.buy) {
            baseToInrRate = currentSymbol.buy;
            console.log('Using fallback buy price. baseToInrRate:', baseToInrRate);
          }
          
          console.log('Final baseToInrRate:', baseToInrRate);
          
          // Calculate margin: (Lot × lotsize × BaseCurrency/INR) ÷ Leverage
          if (baseToInrRate > 0) {
            marginvalue = (finallotsize * baseToInrRate) / forexMargin;
            console.log('Margin calculation: (finallotsize × baseToInrRate) / forexMargin');
            console.log('= (', finallotsize, '×', baseToInrRate, ') /', forexMargin);
            console.log('= ', (finallotsize * baseToInrRate), '/', forexMargin);
            console.log('= marginvalue (INR):', marginvalue);
          } else {
            marginvalue = 0;
            console.log('baseToInrRate is 0, setting marginvalue to 0');
          }
        } else {
          marginvalue = 0;
          console.log('forexMargin is 0 or invalid, setting marginvalue to 0');
        }
        console.log('=== END FOREX MARGIN CALCULATION ===');
      } else if (exchtype === 'COMMODITY') {
        // Formula: Margin = (Lot × lotsize × BaseCurrency/INR) ÷ Leverage
        const commodityMargin = parseFloat(CommodityIntradayMargin || 0);
        const finallotsize = (parseFloat(lotSize) * parseFloat(currentSymbol.Lotsize || 1));
        // If margin value is large (> 1000), treat as per_lot, otherwise as leverage
        if (commodityMargin > 1000) {
          marginvalue = parseFloat(lotSize) * commodityMargin;
        } else if (commodityMargin > 0) {
          // Get base currency to INR rate
          let baseToInrRate = 0;
          
          // Extract base currency from symbol name
          const symbolName = (currentSymbol.SymbolName || '').toUpperCase().replace(/[^A-Z]/g, '');
          const baseCurrency = symbolName.substring(0, 3); // First 3 letters are base currency
          
          // For USD-based pairs
          if (baseCurrency !== 'USD' && currentSymbol.buyUSD && usdToInrRate) {
            // For pairs like XAU/USD: XAU/INR = XAU/USD × USD/INR
            baseToInrRate = currentSymbol.buyUSD * usdToInrRate;
          } 
          // Fallback: use buy price if available (should already be in INR for some pairs)
          else if (currentSymbol.buy) {
            baseToInrRate = currentSymbol.buy;
          }
          
          // Calculate margin: (Lot × lotsize × BaseCurrency/INR) ÷ Leverage
          // baseToInrRate is already in INR, so margin is already in INR
          if (baseToInrRate > 0) {
            marginvalue = (finallotsize * baseToInrRate) / commodityMargin;
          } else {
            marginvalue = 0;
          }
        } else {
          marginvalue = 0;
        }
      } else {
        // CDS/OPT
        if (CDS_Exposure_Type === "per_lot") {
          marginvalue = parseFloat(lotSize) * parseFloat(Intraday_Exposure_Margin_CDS || 0);
        } else {
          marginvalue = (parseFloat(price) * parseFloat(lotSize)) / parseFloat(Intraday_Exposure_Margin_CDS || 10);
        }
      }
    
    return marginvalue;
  }, [
    currentSymbol,
    orderData.lotSize,
    orderData.orderType,
    orderData.price,
    activeTab,
    usdToInrRate
  ]);

  const createSLTPForNewOrder = async (token, scriptName, orderCategory, slValue, tpValue) => {
    try {
      // Wait 500ms for backend to save the order (exactly like original)
      setTimeout(async () => {
        try {
          // Fetch active orders to find the newly created one
          const orders = await tradingAPI.getOrders('Active', user.UserId);
          
          // Find the most recent order matching our criteria
          let newOrder = null;
          let latestTime = null;
          
          orders.forEach(order => {
            if (order.TokenNo === token && 
                order.ScriptName === scriptName && 
                order.OrderCategory === orderCategory) {
              
              // Get the order timestamp
              const orderDateTime = new Date(order.OrderDate + " " + order.OrderTimeFull);
              
              // Find the most recent one
              if (!latestTime || orderDateTime > latestTime) {
                latestTime = orderDateTime;
                newOrder = order;
              }
            }
          });
          
          // If we found the order, create SL/TP
          if (newOrder && newOrder.Id) {
            const sltpData = {
              TradeId: newOrder.Id,
              SL: slValue || "0",
              TP: tpValue || "0"
            };
            
            await tradingAPI.saveSLTP(sltpData.TradeId, sltpData.SL, sltpData.TP);
            console.log("SL/TP created successfully");
          } else {
            console.log("Could not find newly created order");
          }
        } catch (error) {
          console.error("Failed to create SL/TP:", error);
        }
      }, 500); // Wait 500ms for order to be saved
    } catch (error) {
      console.error('Error creating SL/TP:', error);
    }
  };

  const placeOrder = async (orderTypeOverride = null) => {
    // Use override if provided, otherwise use current orderData.orderType
    const orderType = orderTypeOverride || orderData.orderType;
    
    // Temporarily set orderType if override is provided
    if (orderTypeOverride) {
      setOrderData(prev => ({ ...prev, orderType: orderTypeOverride }));
    }
    
    // Validate with the orderType we're using
    if (!symbol) {
      setError('No symbol selected');
      return;
    }

    // Check KYC status before placing order
    // Only block if we know for certain KYC is incomplete
    // Allow orders to proceed if KYC status is still loading (optimistic approach)
    if (kycStatus === false) {
      setError('Please complete your KYC verification before placing orders. Go to Profile > KYC to submit your documents.');
      setOrderLoading(false);
      setPlacingOrderType(null);
      return;
    }
    // If KYC status is null (still loading), allow order to proceed
    // The backend will validate KYC status anyway

    // Check if lot size has validation error (prevent order placement)
    if (lotSizeError) {
      const exchtype = currentSymbol.ExchangeType || 'MCX';
      if (lotSizeError === 'Min 0.01') {
        const exchangeName = exchtype === 'FOREX' ? 'Forex' : (exchtype === 'CRYPTO' ? 'Crypto' : 'Commodity');
        setError(`Minimum lot size for ${exchangeName} is 0.01`);
      } else {
        setError(lotSizeError);
      }
      setOrderLoading(false);
      setPlacingOrderType(null);
      return;
    }

    const lotSize = parseFloat(orderData.lotSize) || 0;
    if (!orderData.lotSize || lotSize <= 0) {
      setError('Lot size must be greater than 0');
      setOrderLoading(false);
      setPlacingOrderType(null);
      return;
    }

    // Exchange-specific minimum lot size validation
    const exchtype = currentSymbol.ExchangeType || 'MCX';
    if (exchtype === 'FOREX' && lotSize < 0.01) {
      setError(`Minimum lot size for Forex is 0.01`);
      setOrderLoading(false);
      setPlacingOrderType(null);
      return;
    }
    if ((exchtype === 'MCX' || exchtype === 'NSE' || exchtype === 'OPT' || exchtype === 'CRYPTO' || exchtype === 'COMMODITY') && lotSize < 1) {
      const exchangeName = exchtype === 'MCX' ? 'MCX' : (exchtype === 'NSE' ? 'NSE' : (exchtype === 'OPT' ? 'Options' : (exchtype === 'CRYPTO' ? 'Crypto' : 'Commodity')));
      setError(`Minimum lot size for ${exchangeName} is 1`);
      setOrderLoading(false);
      setPlacingOrderType(null);
      return;
    }

    if (activeTab === 'limit' && !orderData.price) {
      setError('Price is required for limit orders');
      return;
    }

    if (orderData.stopLoss && parseFloat(orderData.stopLoss) <= 0) {
      setError('Stop loss must be greater than 0');
      return;
    }

    if (orderData.takeProfit && parseFloat(orderData.takeProfit) <= 0) {
      setError('Take profit must be greater than 0');
      return;
    }

    setOrderLoading(true);
    setPlacingOrderType(orderType);
    setError('');
    setSuccess('');

    try {
      const lotSize = parseFloat(orderData.lotSize) || 1;
      
      // Calculate margin exactly like original CSHTML implementation
      let marginvalue = 0;
      let holdmarginvalue = 0;
      let finallotsize = 0;
      
      const exchtype = currentSymbol.ExchangeType || 'MCX';
      const isFX = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(exchtype);
      
      // For market orders, use INR prices directly
      // For limit orders with FX symbols, convert USD input to INR
      let orderprice;
      if (activeTab === 'market') {
        orderprice = orderType === 'BUY' ? (currentSymbol.buy || 0) : (currentSymbol.sell || 0);
      } else {
        // Limit order
        if (isFX && orderData.price && currentSymbol.buy && currentSymbol.buyUSD) {
          // Convert USD price to INR using the exchange rate
          const usdToInrRate = currentSymbol.buy / currentSymbol.buyUSD;
          orderprice = parseFloat(orderData.price) * usdToInrRate;
        } else {
          // For non-FX or if conversion data not available, use price as-is (INR)
          orderprice = parseFloat(orderData.price);
        }
      }
      
      // Get exposure margins from localStorage (exactly like original)
      const Intraday_Exposure_Margin_MCX = localStorage.getItem("Intraday_Exposure_Margin_MCX");
      const Holding_Exposure_Margin_MCX = localStorage.getItem("Holding_Exposure_Margin_MCX");
      const Intraday_Exposure_Margin_Equity = localStorage.getItem("Intraday_Exposure_Margin_Equity");
      const Holding_Exposure_Margin_Equity = localStorage.getItem("Holding_Exposure_Margin_Equity");
      const Intraday_Exposure_Margin_CDS = localStorage.getItem("Intraday_Exposure_Margin_CDS");
      const Holding_Exposure_Margin_CDS = localStorage.getItem("Holding_Exposure_Margin_CDS");
      
      // Get FX-specific margins
      const CryptoIntradayMargin = localStorage.getItem("CryptoIntradayMargin");
      const ForexIntradayMargin = localStorage.getItem("ForexIntradayMargin");
      const CommodityIntradayMargin = localStorage.getItem("CommodityIntradayMargin");
      
      // Get exposure types
      const MCX_Exposure_Type = localStorage.getItem("Mcx_Exposure_Type");
      const NSE_Exposure_Type = localStorage.getItem("NSE_Exposure_Type");
      const CDS_Exposure_Type = localStorage.getItem("CDS_Exposure_Type");
      
      // Margin calculation logic exactly like original
      if (exchtype === 'MCX') {
        if (MCX_Exposure_Type && MCX_Exposure_Type.includes("per_lot")) {
          // Per lot calculation
          const symbolname = currentSymbol.SymbolName;
          const symarr = symbolname.split("_");
          const similersym = symarr[0]?.toString().trim();
          const Intraday_Exposure = localStorage.getItem("MCX_Exposure_Lot_wise_" + similersym + "_Intraday");
          const Intraday_hold_Exposure = localStorage.getItem("MCX_Exposure_Lot_wise_" + similersym + "_Holding");
          marginvalue = parseFloat(lotSize) * parseFloat(Intraday_Exposure || 0);
          holdmarginvalue = parseFloat(lotSize) * parseFloat(Intraday_hold_Exposure || 0);
        } else {
          // Percentage calculation
          marginvalue = (parseFloat(orderprice) * parseFloat(lotSize)) / parseFloat(Intraday_Exposure_Margin_MCX || 10);
          holdmarginvalue = (parseFloat(orderprice) * parseFloat(lotSize)) / parseFloat(Holding_Exposure_Margin_MCX || 10);
        }
      } else if (exchtype === 'NSE') {
        if (NSE_Exposure_Type === "per_lot") {
          marginvalue = parseFloat(lotSize) * parseFloat(Intraday_Exposure_Margin_Equity || 0);
          holdmarginvalue = parseFloat(lotSize) * parseFloat(Holding_Exposure_Margin_Equity || 0);
        } else {
          marginvalue = (parseFloat(orderprice) * parseFloat(lotSize)) / parseFloat(Intraday_Exposure_Margin_Equity || 10);
          holdmarginvalue = (parseFloat(orderprice) * parseFloat(lotSize)) / parseFloat(Holding_Exposure_Margin_Equity || 10);
        }
      } else if (exchtype === 'CRYPTO') {
        // Formula: Margin = (Lot × lotsize × BaseCurrency/INR) ÷ Leverage
        const cryptoMargin = parseFloat(CryptoIntradayMargin || 0);
        finallotsize = (parseFloat(lotSize) * parseFloat(currentSymbol.Lotsize || 1));
        // If margin value is large (> 1000), treat as per_lot, otherwise as leverage
        if (cryptoMargin > 1000) {
          marginvalue = parseFloat(lotSize) * cryptoMargin;
          holdmarginvalue = parseFloat(lotSize) * cryptoMargin; // Using same for holding
        } else if (cryptoMargin > 0) {
          // Get base currency to INR rate
          let baseToInrRate = 0;
          
          // Extract base currency from symbol name (e.g., "BTCUSD" -> "BTC", "ETHUSD" -> "ETH")
          const symbolName = (currentSymbol.SymbolName || '').toUpperCase().replace(/[^A-Z]/g, '');
          const baseCurrency = symbolName.substring(0, 3); // First 3 letters are base currency
          
          // For USD-based pairs (BTC/USD, ETH/USD, etc.)
          if (baseCurrency !== 'USD' && currentSymbol.buyUSD && usdToInrRate) {
            // For pairs like BTC/USD: BTC/INR = BTC/USD × USD/INR
            baseToInrRate = currentSymbol.buyUSD * usdToInrRate;
          } 
          // Fallback: use buy price if available (should already be in INR for some pairs)
          else if (currentSymbol.buy) {
            baseToInrRate = currentSymbol.buy;
          }
          
          // Calculate margin: (Lot × lotsize × BaseCurrency/INR) ÷ Leverage
          // baseToInrRate is already in INR, so margin is already in INR
          if (baseToInrRate > 0) {
            marginvalue = (finallotsize * baseToInrRate) / cryptoMargin;
            holdmarginvalue = (finallotsize * baseToInrRate) / cryptoMargin; // Using same for holding
          } else {
            marginvalue = 0;
            holdmarginvalue = 0;
          }
        } else {
          marginvalue = 0;
          holdmarginvalue = 0;
        }
      } else if (exchtype === 'FOREX') {
        // Formula: Margin = (Lot × lotsize × BaseCurrency/INR) ÷ Leverage
        const forexMargin = parseFloat(ForexIntradayMargin || 0);
        const symbolLotsize = parseFloat(currentSymbol.Lotsize || 1);
        finallotsize = (parseFloat(lotSize) * symbolLotsize);
        
        //console.log('=== FOREX MARGIN CALCULATION (placeOrder) ===');
        //console.log('lotSize:', lotSize);
        //console.log('currentSymbol.Lotsize:', currentSymbol.Lotsize);
        //console.log('symbolLotsize:', symbolLotsize);
        //console.log('finallotsize:', finallotsize);
        //console.log('ForexIntradayMargin (leverage):', ForexIntradayMargin);
        //console.log('forexMargin:', forexMargin);
        //console.log('usdToInrRate:', usdToInrRate);
        //console.log('currentSymbol.buyUSD:', currentSymbol.buyUSD);
        //console.log('currentSymbol.buy:', currentSymbol.buy);
        //console.log('currentSymbol.SymbolName:', currentSymbol.SymbolName);
        
        // If margin value is large (> 1000), treat as per_lot, otherwise as leverage
        if (forexMargin > 1000) {
          marginvalue = parseFloat(lotSize) * forexMargin;
          holdmarginvalue = parseFloat(lotSize) * forexMargin; // Using same for holding
          //console.log('Using per_lot mode. marginvalue:', marginvalue);
        } else if (forexMargin > 0) {
          // Get base currency to INR rate
          // For EUR/USD: base currency is EUR, we need EUR/INR rate
          // For GBP/JPY: base currency is GBP, we need GBP/INR rate
          // For AUD/NZD: base currency is AUD, we need AUD/INR rate
          let baseToInrRate = 0;
          
          // Extract base currency from symbol name (e.g., "EURUSD" -> "EUR", "GBPJPY" -> "GBP")
          const symbolName = (currentSymbol.SymbolName || '').toUpperCase().replace(/[^A-Z]/g, '');
          const baseCurrency = symbolName.substring(0, 3); // First 3 letters are base currency
          
          //console.log('symbolName:', symbolName);
          //console.log('baseCurrency:', baseCurrency);
          
          // For USD-based pairs (EUR/USD, GBP/USD, AUD/USD, etc.)
          if (baseCurrency !== 'USD' && currentSymbol.buyUSD && usdToInrRate) {
            // For pairs like EUR/USD: EUR/INR = EUR/USD × USD/INR
            baseToInrRate = currentSymbol.buyUSD * usdToInrRate;
            //console.log('Using USD-based pair calculation');
            //console.log('baseToInrRate = buyUSD × usdToInrRate =', currentSymbol.buyUSD, '×', usdToInrRate, '=', baseToInrRate);
          } 
          // For JPY-based pairs (GBP/JPY, EUR/JPY, etc.) - need JPY/INR then convert
          else if (symbolName.includes('JPY') && baseCurrency !== 'JPY') {
            // For GBP/JPY: GBP/INR = GBP/JPY × JPY/INR
            // JPY/INR = USD/INR / USD/JPY (approximate)
            // This is complex, so we'll use a fallback
            if (currentSymbol.buy && usdToInrRate) {
              // Approximate: if we have GBP/JPY rate, we need GBP/INR
              // For now, use buy price if it's already in INR
              baseToInrRate = currentSymbol.buy;
              //console.log('Using JPY-based pair fallback. baseToInrRate:', baseToInrRate);
            }
          }
          // Fallback: use buy price if available (should already be in INR for some pairs)
          else if (currentSymbol.buy) {
            baseToInrRate = currentSymbol.buy;
            //console.log('Using fallback buy price. baseToInrRate:', baseToInrRate);
          }
          
          //console.log('Final baseToInrRate:', baseToInrRate);
          
          // Calculate margin: (Lot × lotsize × BaseCurrency/INR) ÷ Leverage
          // baseToInrRate is already in INR, so margin is already in INR
          if (baseToInrRate > 0) {
            marginvalue = (finallotsize * baseToInrRate) / forexMargin;
            holdmarginvalue = (finallotsize * baseToInrRate) / forexMargin; // Using same for holding
            //console.log('Margin calculation: (finallotsize × baseToInrRate) / forexMargin');
            //console.log('= (', finallotsize, '×', baseToInrRate, ') /', forexMargin);
            //console.log('= ', (finallotsize * baseToInrRate), '/', forexMargin);
            //console.log('= marginvalue (INR):', marginvalue);
            //console.log('= holdmarginvalue (INR):', holdmarginvalue);
          } else {
            marginvalue = 0;
            holdmarginvalue = 0;
            console.log('baseToInrRate is 0, setting marginvalue to 0');
          }
        } else {
          marginvalue = 0;
          holdmarginvalue = 0;
         // console.log('forexMargin is 0 or invalid, setting marginvalue to 0');
        }
        console.log('=== END FOREX MARGIN CALCULATION ===');
      } else if (exchtype === 'COMMODITY') {
        // Formula: Margin = (Lot × lotsize × BaseCurrency/INR) ÷ Leverage
        const commodityMargin = parseFloat(CommodityIntradayMargin || 0);
        finallotsize = (parseFloat(lotSize) * parseFloat(currentSymbol.Lotsize || 1));
        // If margin value is large (> 1000), treat as per_lot, otherwise as leverage
        if (commodityMargin > 1000) {
          marginvalue = parseFloat(lotSize) * commodityMargin;
          holdmarginvalue = parseFloat(lotSize) * commodityMargin; // Using same for holding
        } else if (commodityMargin > 0) {
          // Get base currency to INR rate
          let baseToInrRate = 0;
          
          // Extract base currency from symbol name
          const symbolName = (currentSymbol.SymbolName || '').toUpperCase().replace(/[^A-Z]/g, '');
          const baseCurrency = symbolName.substring(0, 3); // First 3 letters are base currency
          
          // For USD-based pairs
          if (baseCurrency !== 'USD' && currentSymbol.buyUSD && usdToInrRate) {
            // For pairs like XAU/USD: XAU/INR = XAU/USD × USD/INR
            baseToInrRate = currentSymbol.buyUSD * usdToInrRate;
          } 
          // Fallback: use buy price if available (should already be in INR for some pairs)
          else if (currentSymbol.buy) {
            baseToInrRate = currentSymbol.buy;
          }
          
          // Calculate margin: (Lot × lotsize × BaseCurrency/INR) ÷ Leverage
          // baseToInrRate is already in INR, so margin is already in INR
          if (baseToInrRate > 0) {
            marginvalue = (finallotsize * baseToInrRate) / commodityMargin;
            holdmarginvalue = (finallotsize * baseToInrRate) / commodityMargin; // Using same for holding
          } else {
            marginvalue = 0;
            holdmarginvalue = 0;
          }
        } else {
          marginvalue = 0;
          holdmarginvalue = 0;
        }
      } else {
        // CDS/OPT
        if (CDS_Exposure_Type === "per_lot") {
          marginvalue = parseFloat(lotSize) * parseFloat(Intraday_Exposure_Margin_CDS || 0);
          holdmarginvalue = parseFloat(lotSize) * parseFloat(Holding_Exposure_Margin_CDS || 0);
        } else {
          marginvalue = (parseFloat(orderprice) * parseFloat(lotSize)) / parseFloat(Intraday_Exposure_Margin_CDS || 10);
          holdmarginvalue = (parseFloat(orderprice) * parseFloat(lotSize)) / parseFloat(Holding_Exposure_Margin_CDS || 10);
        }
      }
      
      // Get current date and time exactly like the original
      const now = new Date();
      const orderDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const orderTime = now.toTimeString().split(' ')[0].substring(0, 5); // HH:MM
      
      // Determine if it's a stop loss order (for pending orders)
      let isstoplossorder = "";
      if (activeTab === 'order') {
        const bid = currentSymbol.sell || 0;
        const ask = currentSymbol.buy || 0;
        if (orderType === "SELL") {
          if (parseFloat(orderprice) > parseFloat(bid)) {
            isstoplossorder = "false";
          } else {
            isstoplossorder = "true";
          }
        } else {
          if (parseFloat(orderprice) > parseFloat(ask)) {
            isstoplossorder = "true";
          } else {
            isstoplossorder = "false";
          }
        }
      }
      
      // Get the symbol lot size from localStorage (exactly like original)
      const actualLotSize = localStorage.getItem("SymbolLotSize") || currentSymbol.Lotsize || 1;
      
      // Prepare order payload EXACTLY like the original
      const orderPayload = {
        Id: '',
        OrderDate: '',
        OrderTime: '',
        actualLot: actualLotSize.toString(),
        selectedlotsize: lotSize.toString(),
        OrderNo: '',
        UserId: localStorage.getItem("userid") || user.UserId,
        UserName: localStorage.getItem("ClientName") || user.UserName || user.UserId,
        OrderCategory: orderType,
        OrderType: activeTab === 'market' ? 'Market' : (isstoplossorder === "true" ? 'S/L' : 'Limit'),
        ScriptName: currentSymbol.SymbolName,
        TokenNo: currentSymbol.SymbolToken,
        ActionType: activeTab === 'market' ? 
          (orderType === 'BUY' ? 'Bought By Trader' : 'Sold By Trader') : 
          'Order Placed @@',
        OrderPrice: orderprice.toString(),
        Lot: lotSize.toString(),
        MarginUsed: Math.round(parseFloat(marginvalue)).toString(),
        HoldingMarginReq: Math.round(parseFloat(holdmarginvalue)).toString(),
        OrderStatus: activeTab === 'market' ? 'Active' : 'Pending',
        SymbolType: exchtype === 'CDS' ? 'OPT' : exchtype,
        isstoplossorder: activeTab === 'order' ? isstoplossorder : "",
        isedit: 'false'
      };

      // CRITICAL CHECK 3: Check margin available (exactly like original)
      const marginAvailable = parseFloat(userBalance.marginAvailable || 0);
      if (parseFloat(marginvalue) > parseFloat(marginAvailable)) {
        setError('Insufficient margin available. Please reduce lot size.');
        setOrderLoading(false);
        setPlacingOrderType(null);
        return;
      }

      // Step 1: Check before trade (exactly like original)
      console.log('Checking before trade with payload:', orderPayload);
      let canTrade;
      if (activeTab === 'order') {
        canTrade = await tradingAPI.checkBeforeTradeForPending(orderPayload);
      } else {
        canTrade = await tradingAPI.checkBeforeTrade(orderPayload);
      }
      console.log('Check before trade response:', canTrade);
      
      if (canTrade !== 'true' && canTrade !== true) {
        setError(canTrade || 'Order validation failed');
        setOrderLoading(false);
        setPlacingOrderType(null);
        return;
      }

      // Step 2: Save the order using simplified payload
      console.log('Saving order with payload:', orderPayload);
      
      // Calculate brokerage (same logic as closing order)
      const isFXForBrokerage = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(exchtype);
      let brokerage = 0;
      
      if (isFXForBrokerage) {
        // For FX symbols (CRYPTO, FOREX, COMMODITY), brokerage = brokerageValue * selectedlotsize
        let brokerageValue = 0;
        
        try {
          if (exchtype === 'CRYPTO') {
            const cryptoBrokerage = localStorage.getItem('CryptoBrokerage');
            brokerageValue = cryptoBrokerage && cryptoBrokerage !== '' ? parseFloat(cryptoBrokerage) : 0;
          } else if (exchtype === 'FOREX') {
            const forexBrokerage = localStorage.getItem('ForexBrokerage');
            brokerageValue = forexBrokerage && forexBrokerage !== '' ? parseFloat(forexBrokerage) : 0;
          } else if (exchtype === 'COMMODITY') {
            const commodityBrokerage = localStorage.getItem('CommodityBrokerage');
            brokerageValue = commodityBrokerage && commodityBrokerage !== '' ? parseFloat(commodityBrokerage) : 0;
          }
        } catch (error) {
          console.error('Error reading brokerage from localStorage:', error);
        }
        
        const selectedlotsize = parseFloat(orderPayload.selectedlotsize || 1);
        
        // Brokerage = brokerageValue * selectedlotsize
        if (!isNaN(brokerageValue) && !isNaN(selectedlotsize) && brokerageValue > 0 && selectedlotsize > 0) {
          brokerage = brokerageValue * selectedlotsize;
        } else {
          brokerage = 0;
        }
      } else {
        // For MCX, NSE, OPT, CDS - calculate proper brokerage
        try {
          const orderPrice = parseFloat(orderprice || 0);
          const actualLotSize = parseFloat(orderPayload.actualLot || currentSymbol.Lotsize || 1);
          const lotValue = orderPayload.Lot === "0" || orderPayload.Lot === 0 || !orderPayload.Lot ? orderPayload.selectedlotsize : orderPayload.Lot;
          const numberOfLots = parseFloat(lotValue || orderPayload.selectedlotsize || 1);
          const lotSize = actualLotSize * numberOfLots;
          
          let brokerageType = '';
          let brokerageValue = 0;
          
          if (exchtype === 'NSE') {
            brokerageType = localStorage.getItem('NSE_Brokerage_Type') || '';
            brokerageValue = parseFloat(localStorage.getItem('Equity_brokerage_per_crore') || 0);
          } else if (exchtype === 'OPT' || exchtype === 'CDS') {
            brokerageType = localStorage.getItem('CDS_Brokerage_Type') || '';
            brokerageValue = parseFloat(localStorage.getItem('CDS_brokerage_per_crore') || 0);
          } else if (exchtype === 'MCX') {
            brokerageType = localStorage.getItem('Mcx_Brokerage_Type') || '';
            
            // For MCX per_lot: Use script-specific brokerage per lot
            if (brokerageType === 'per_lot') {
              const scriptName = (currentSymbol.SymbolName || '').toUpperCase();
              
              const MCX_symbols = [
                'ALUMINIUM', 'COPPER', 'COTTON', 'COTTONREF', 'CRUDEOIL', 
                'GOLDGUINEA', 'GOLDPETAL', 'KAPAS', 'LEAD', 'MCXBULLDEX', 
                'MCXENRGDEX', 'MCXMETLDEX', 'MENTHAOIL', 'NATURALGAS', 
                'NICKEL', 'RUBBER', 'SILVERM', 'SILVERMIC', 'ZINC', 
                'GOLD', 'GOLDM', 'SILVER', 'NIFTY'
              ];
              
              let matchedSymbol = '';
              for (let i = 0; i < MCX_symbols.length; i++) {
                if (scriptName.startsWith(MCX_symbols[i])) {
                  matchedSymbol = MCX_symbols[i];
                  break;
                } else if (scriptName.startsWith('ALUMINI')) {
                  matchedSymbol = 'ALUMINIUM';
                  break;
                } else if (scriptName.startsWith('NATGASMINI')) {
                  matchedSymbol = 'NATURALGAS';
                  break;
                }
              }
              
              if (matchedSymbol) {
                const scriptBrokerageKey = matchedSymbol + '_brokerage';
                const scriptBrokeragePerLot = parseFloat(localStorage.getItem(scriptBrokerageKey) || 0);
                if (scriptBrokeragePerLot > 0) {
                  brokerageValue = scriptBrokeragePerLot;
                }
              }
            } else {
              // For MCX per_crore
              brokerageValue = parseFloat(localStorage.getItem('Mcx_brokerage_per_crore') || 0);
            }
          }
          
          if (brokerageType === 'per_lot') {
            // Per lot brokerage: numberOfLots × brokeragePerLot
            if (numberOfLots > 0 && brokerageValue > 0) {
              brokerage = numberOfLots * brokerageValue;
            } else {
              brokerage = 0;
            }
          } else {
            // Per crore brokerage: (orderPrice * lotSize) * brokerageValue / 10000000
            // For new orders, we use orderPrice (since currentPrice is same as orderPrice at order time)
            if (orderPrice > 0 && lotSize > 0 && brokerageValue > 0) {
              const tradePrice = orderPrice * lotSize;
              brokerage = (tradePrice * brokerageValue) / 10000000;
            } else {
              brokerage = 0;
            }
          }
        } catch (error) {
          console.error('Error calculating brokerage:', error);
          brokerage = 0;
        }
      }
      
      // Prepare simplified payload for saveorderbyuser endpoint
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
        MarginUsed: orderPayload.HoldingMarginReq,
        brokerage: brokerage.toFixed(2)
      };
      
      // Add SL & TP if set by user
      if (orderData.stopLoss) {
        savePayload.SL = orderData.stopLoss;
      }
      if (orderData.takeProfit) {
        savePayload.TP = orderData.takeProfit;
      }
      
      console.log('Saving with simplified payload:', savePayload);
      const saveResponse = await tradingAPI.saveOrderByUser(savePayload);
      console.log('Save order response:', saveResponse);
      
      // Verify response
      if (!saveResponse && saveResponse !== 'true') {
        setError('Failed to save order. Please try again.');
        setOrderLoading(false);
        setPlacingOrderType(null);
        return;
      }

      // Step 3: Create SL/TP if provided (exactly like original)
      if ((orderData.stopLoss || orderData.takeProfit) && activeTab === 'market') {
        // For market orders, create SL/TP immediately
        try {
          await createSLTPForNewOrder(
            currentSymbol.SymbolToken,
            currentSymbol.SymbolName,
            orderType,
            orderData.stopLoss,
            orderData.takeProfit
          );
        } catch (error) {
          console.error('Error creating SL/TP:', error);
          // Don't fail the order if SL/TP fails
        }
      }

      // Format price for display in success message
      let displayPrice = '';
      const isFXSymbol = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(exchtype);
      
      if (isFXSymbol && activeTab === 'market') {
        // For FX market orders, show USD price (without $ sign, as per user preference)
        if (orderType === 'BUY') {
          displayPrice = currentSymbol.buyUSD ? formatFXPrice(currentSymbol.buyUSD, exchtype, currentSymbol.SymbolName) : formatPrice(orderprice);
        } else {
          displayPrice = currentSymbol.sellUSD ? formatFXPrice(currentSymbol.sellUSD, exchtype, currentSymbol.SymbolName) : formatPrice(orderprice);
        }
      } else if (isFXSymbol && activeTab === 'limit') {
        // For FX limit orders, show the USD price user entered
        displayPrice = formatFXPrice(parseFloat(orderData.price || 0), exchtype, currentSymbol.SymbolName);
      } else {
        // For non-FX, show INR price
        displayPrice = `₹${formatPrice(orderprice)}`;
      }
      
      // Show success message with order details
      setSuccess(`${orderType} order placed successfully! ${lotSize} lot(s) @ ${displayPrice}`);
      setOrderLoading(false);
      setPlacingOrderType(null);
      
      // Call callback to refresh data
      if (onOrderPlaced) {
        onOrderPlaced();
      }

      // Close modal after showing success
      setTimeout(() => {
        onClose();
      }, 2000);

    } catch (error) {
      console.error('Error placing order:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response,
        data: error.response?.data,
        status: error.response?.status
      });
      
      let errorMessage = 'Failed to place order';
      if (error.response?.data) {
        errorMessage = error.response.data;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
      setOrderLoading(false);
      setPlacingOrderType(null);
    }
  };

  const formatPrice = (price) => {
    return parseFloat(price || 0).toFixed(2);
  };

  // Format bid/ask prices - show raw prices for MCX/NSE/OPT (no rounding)
  const formatBidAskPrice = (price) => {
    const numPrice = parseFloat(price || 0);
    if (isNaN(numPrice)) return '0';
    return numPrice.toString();
  };

  // Check if symbol is from FX tabs (Crypto/Forex/Commodity)
  const isFXSymbol = () => {
    if (!currentSymbol) return false;
    const exchtype = currentSymbol.ExchangeType || '';
    return ['CRYPTO', 'FOREX', 'COMMODITY'].includes(exchtype);
  };

  // Format FX price - MT5 style formatting with fixed decimal places per exchange type
  const formatFXPrice = (price, exchangeType = null, symbolName = null) => {
    if (!price || price === 0) return '-';
    const numPrice = parseFloat(price);
    if (isNaN(numPrice)) return '-';
    
    const exchange = exchangeType || currentSymbol?.ExchangeType || '';
    const absPrice = Math.abs(numPrice);
    const symbol = symbolName || currentSymbol?.SymbolName || '';
    
    // Check if it's a JPY pair (ends with JPY) - MT5 shows 3 decimals for JPY pairs
    const isJPYPair = symbol.toUpperCase().includes('JPY') || symbol.toUpperCase().endsWith('JPY');
    
    // FOREX: 5 decimals for most pairs, 3 decimals for JPY pairs (MT5 standard)
    if (exchange === 'FOREX') {
      if (isJPYPair) {
        return numPrice.toFixed(3); // JPY pairs: 3 decimals (e.g., 115.567)
      }
      return numPrice.toFixed(5); // Other forex pairs: 5 decimals (e.g., 1.12345)
    }
    
    // CRYPTO: Variable precision based on price magnitude (MT5 style)
    if (exchange === 'CRYPTO') {
      if (absPrice >= 1000) {
        return numPrice.toFixed(2); // Large crypto prices: 2 decimals
      } else if (absPrice >= 1) {
        return numPrice.toFixed(5); // Medium crypto prices: 5 decimals
      } else if (absPrice >= 0.01) {
        return numPrice.toFixed(5); // Small crypto prices: 5 decimals
      } else if (absPrice >= 0.0001) {
        return numPrice.toFixed(6); // Very small: 6 decimals
      } else {
        return numPrice.toFixed(8); // Extremely small: 8 decimals
      }
    }
    
    // COMMODITY: Variable precision based on price magnitude (MT5 style)
    if (exchange === 'COMMODITY') {
      if (absPrice >= 1000) {
        return numPrice.toFixed(2); // Large commodity prices: 2 decimals
      } else if (absPrice >= 1) {
        return numPrice.toFixed(5); // Medium commodity prices: 5 decimals
      } else if (absPrice >= 0.01) {
        return numPrice.toFixed(5); // Small commodity prices: 5 decimals
      } else {
        return numPrice.toFixed(6); // Very small: 6 decimals
      }
    }
    
    // Default: 5 decimals for other FX types
    return numPrice.toFixed(5);
  };

  // Get USD price for display (for FX symbols)
  const getBuyPriceUSD = () => {
    if (!currentSymbol) return 0;
    if (activeTab === 'market') {
      return currentSymbol.buyUSD || currentSymbol.buy || 0;
    }
    // For limit orders, show the USD price user entered
    return parseFloat(orderData.price || 0);
  };

  const getSellPriceUSD = () => {
    if (!currentSymbol) return 0;
    if (activeTab === 'market') {
      return currentSymbol.sellUSD || currentSymbol.sell || 0;
    }
    // For limit orders, show the USD price user entered
    return parseFloat(orderData.price || 0);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-2">
      <div className="bg-gray-800 rounded-lg w-full max-w-sm max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-3 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">Place Order</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Account Balance */}
        <div className="p-2 bg-gray-700">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="text-center">
              <div className="text-gray-300">Ledger Balance</div>
              <div className="text-white font-semibold">₹{formatPrice(userBalance.ledgerBalance)}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-300">Margin Available</div>
              <div className="text-white font-semibold">₹{formatPrice(userBalance.marginAvailable)}</div>
            </div>
            {/* 
            <div className="text-center">
              <div className="text-gray-300">Active P/L</div>
              <div className={`font-semibold ${userBalance.activePL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ₹{formatPrice(userBalance.activePL)}
              </div>
            </div>
            */}
            <div className="text-center">
              <div className="text-gray-300">M2M (Equity)</div>
              <div className={`font-semibold ${userBalance.m2m >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ₹{formatPrice(userBalance.m2m)}
              </div>
            </div>
          </div>
        </div>

        {/* Symbol Info */}
        <div className="p-2 text-center border-b border-gray-700">
          <h4 className="text-white font-semibold text-sm">
            {currentSymbol?.SymbolName?.split('_')[0] || 'N/A'}
          </h4>
          <p className="text-gray-400 text-xs">
            Lot Size: {currentSymbol?.Lotsize || 1} • Exchange: {currentSymbol?.ExchangeType || 'MCX'}
          </p>
          {['CRYPTO', 'FOREX', 'COMMODITY'].includes(currentSymbol?.ExchangeType || '') && (
            <div className="mt-1">
              <div className="flex items-center justify-center">
                <button
                  onClick={() => setIsChartModalOpen(true)}
                  className="text-blue-400 hover:text-blue-300 text-xs"
                >
                  📈 Open Chart
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Market Data */}
        {currentSymbol && (
          <div className="p-2 bg-gray-700 border-b border-gray-700">
            <div className={`grid gap-2 text-xs ${isFXSymbol() ? 'grid-cols-3' : 'grid-cols-3'}`}>
              {/* Row 1 */}
              <div>
                <div className="text-gray-400">Bid</div>
                <div className="text-white font-medium">
                  {isFXSymbol() ? formatFXPrice(currentSymbol.sellUSD || currentSymbol.sell || 0, currentSymbol.ExchangeType, currentSymbol.SymbolName) : `₹${formatBidAskPrice(currentSymbol.sell || 0)}`}
                </div>
              </div>
              <div>
                <div className="text-gray-400">Ask</div>
                <div className="text-white font-medium">
                  {isFXSymbol() ? formatFXPrice(currentSymbol.buyUSD || currentSymbol.buy || 0, currentSymbol.ExchangeType, currentSymbol.SymbolName) : `₹${formatBidAskPrice(currentSymbol.buy || 0)}`}
                </div>
              </div>
              <div>
                <div className="text-gray-400">Ltp</div>
                <div className="text-white font-medium">
                  {isFXSymbol() ? formatFXPrice(currentSymbol.ltpUSD || currentSymbol.ltp || 0, currentSymbol.ExchangeType, currentSymbol.SymbolName) : `₹${formatPrice(currentSymbol.ltp || 0)}`}
                </div>
              </div>
              
              {/* Row 2 - High, Low, and conditional fields */}
              <div>
                <div className="text-gray-400">High</div>
                <div className="text-white font-medium">
                  {isFXSymbol() ? (() => {
                    // Convert INR to USD for FX symbols
                    const highINR = currentSymbol.high || 0;
                    const ltpINR = currentSymbol.ltp || 0;
                    const ltpUSD = currentSymbol.ltpUSD || 0;
                    const highUSD = (ltpINR > 0 && ltpUSD > 0) ? (highINR * (ltpUSD / ltpINR)) : 0;
                    return formatFXPrice(highUSD, currentSymbol.ExchangeType, currentSymbol.SymbolName);
                  })() : `₹${formatPrice(currentSymbol.high || 0)}`}
                </div>
              </div>
              <div>
                <div className="text-gray-400">Low</div>
                <div className="text-white font-medium">
                  {isFXSymbol() ? (() => {
                    // Convert INR to USD for FX symbols
                    const lowINR = currentSymbol.low || 0;
                    const ltpINR = currentSymbol.ltp || 0;
                    const ltpUSD = currentSymbol.ltpUSD || 0;
                    const lowUSD = (ltpINR > 0 && ltpUSD > 0) ? (lowINR * (ltpUSD / ltpINR)) : 0;
                    return formatFXPrice(lowUSD, currentSymbol.ExchangeType, currentSymbol.SymbolName);
                  })() : `₹${formatPrice(currentSymbol.low || 0)}`}
                </div>
              </div>
              {!isFXSymbol() && (
                <>
                  <div>
                    <div className="text-gray-400">Open</div>
                    <div className="text-white font-medium">₹{formatPrice(currentSymbol.open || 0)}</div>
                  </div>
                  
                  {/* Row 3 - Only for non-FX symbols */}
                  <div>
                    <div className="text-gray-400">Close</div>
                    <div className="text-white font-medium">₹{formatPrice(currentSymbol.close || 0)}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">OL</div>
                    <div className="text-white font-medium">{currentSymbol.oi || currentSymbol.ol || 0}</div>
                  </div>
                </>
              )}
              
              {/* Lot Size (replaces Volume) */}
              <div>
                <div className="text-gray-400">Lot Size</div>
                <div className="text-white font-medium">{currentSymbol.Lotsize || currentSymbol.lot_size || 1}</div>
              </div>
              
              {/* Row 4 - Change */}
              <div className="col-span-3">
                <div className="text-gray-400">Change</div>
                <div className={`font-medium ${(currentSymbol.chg || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {(currentSymbol.chg || 0) >= 0 ? '+' : ''}{isFXSymbol() ? formatFXPrice(currentSymbol.chg || 0, currentSymbol.ExchangeType, currentSymbol.SymbolName) : `₹${formatPrice(currentSymbol.chg || 0)}`}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Order Type Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('market')}
            className={`flex-1 py-2 px-2 text-xs font-medium transition-colors ${
              activeTab === 'market'
                ? 'text-white bg-gray-700 border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <TrendingUp className="w-3 h-3 inline mr-1" />
            Market
          </button>
          <button
            onClick={() => setActiveTab('limit')}
            className={`flex-1 py-2 px-2 text-xs font-medium transition-colors ${
              activeTab === 'limit'
                ? 'text-white bg-gray-700 border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <Clock className="w-3 h-3 inline mr-1" />
            Limit
          </button>
        </div>

        {/* Order Form */}
        <div className="flex-1 overflow-y-auto p-2">
          {/* Lot Size */}
          <div className="mb-2">
            <label className="block text-gray-300 text-xs font-medium mb-1">
              Lot Size
            </label>
            <input
              type="number"
              min={currentSymbol?.ExchangeType === 'FOREX' ? '0.01' : '1'}
              step={currentSymbol?.ExchangeType === 'FOREX' ? '0.01' : '1'}
              max="999"
              value={orderData.lotSize}
              onChange={(e) => {
                const value = e.target.value;
                const exchtype = currentSymbol?.ExchangeType || 'MCX';
                const isForex = exchtype === 'FOREX';
                
                // Allow empty string for clearing
                if (value === '') {
                  handleInputChange('lotSize', '');
                  return;
                }
                
                // For FOREX: Allow decimal values starting with 0 (e.g., 0.01, 0.05)
                // Allow partial decimal input like "0." while typing
                if (isForex && (value === '0.' || value.startsWith('0.'))) {
                  handleInputChange('lotSize', value);
                  return;
                }
                
                // For FOREX: Allow standalone "0" temporarily so user can type "0.01"
                if (isForex && value === '0') {
                  handleInputChange('lotSize', value);
                  return;
                }
                
                // For other exchanges (MCX, NSE, OPT, CRYPTO, COMMODITY): Only allow whole numbers >= 1
                // Don't allow decimal input
                if (!isForex && value.includes('.')) {
                  // Don't allow decimals for non-FOREX exchanges
                  return;
                }
                
                // Parse the value to check if it's valid
                const numValue = parseFloat(value);
                
                // For FOREX: Enforce minimum of 0.01
                if (isForex) {
                  if (!isNaN(numValue) && numValue >= 0.01) {
                    handleInputChange('lotSize', value);
                  } else if (!isNaN(numValue) && numValue > 0) {
                    // Allow typing values below 0.01 to show error
                    handleInputChange('lotSize', value);
                  }
                } 
                // For other exchanges: Allow valid positive whole numbers >= 1
                else {
                  if (!isNaN(numValue) && numValue >= 1) {
                    handleInputChange('lotSize', value);
                  } else if (!isNaN(numValue) && numValue > 0) {
                    // Allow typing values below 1 to show error
                    handleInputChange('lotSize', value);
                  } 
                  // Allow negative sign for potential negative input (though we'll validate later)
                  else if (value === '-') {
                    handleInputChange('lotSize', value);
                  }
                }
                // For any other invalid input, don't update
              }}
              className={`w-full px-2 py-1 bg-gray-700 border rounded text-white text-sm focus:outline-none focus:ring-1 ${
                lotSizeError 
                  ? 'border-red-500 focus:ring-red-500' 
                  : 'border-gray-600 focus:ring-blue-500'
              }`}
            />
            {lotSizeError && (
              <div className="text-red-500 text-[10px] mt-0.5">
                {lotSizeError}
              </div>
            )}
            <div className="text-gray-400 text-xs mt-1">
              Margin Required: ₹{formatPrice(calculateMargin)}
            </div>
          </div>

          {/* Price (for limit orders) */}
          {activeTab === 'limit' && (
            <div className="mb-2">
              <label className="block text-gray-300 text-xs font-medium mb-1">
                Price {isFXSymbol() ? '(USD)' : '(INR)'}
              </label>
              <input
                type="number"
                step="0.01"
                value={orderData.price}
                onChange={(e) => handleInputChange('price', e.target.value)}
                placeholder={isFXSymbol() ? "Enter price in USD" : "Enter price"}
                className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {isFXSymbol() && orderData.price && currentSymbol?.buy && currentSymbol?.buyUSD && (
                <div className="text-gray-400 text-xs mt-1">
                  ≈ ₹{formatPrice((parseFloat(orderData.price) * (currentSymbol.buy / currentSymbol.buyUSD)))}
                </div>
              )}
            </div>
          )}

          {/* Stop Loss & Take Profit */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="block text-gray-300 text-xs font-medium mb-1">
                Stop Loss (Optional)
              </label>
              <input
                type="number"
                step="0.01"
                value={orderData.stopLoss}
                onChange={(e) => handleInputChange('stopLoss', e.target.value)}
                placeholder="SL"
                className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-gray-300 text-xs font-medium mb-1">
                Take Profit (Optional)
              </label>
              <input
                type="number"
                step="0.01"
                value={orderData.takeProfit}
                onChange={(e) => handleInputChange('takeProfit', e.target.value)}
                placeholder="TP"
                className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="mb-2 p-2 bg-red-900 border border-red-600 rounded flex items-center">
              <AlertCircle className="w-4 h-4 text-red-400 mr-1" />
              <span className="text-red-400 text-xs">{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-2 p-2 bg-green-900 border border-green-600 rounded flex items-center">
              <TrendingUp className="w-4 h-4 text-green-400 mr-1" />
              <span className="text-green-400 text-xs">{success}</span>
            </div>
          )}

          {/* Order Buttons - Direct Place Order */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <button
              onClick={() => placeOrder('SELL')}
              disabled={orderLoading || loading}
              className="py-3 px-3 rounded-lg text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-red-600 hover:bg-red-700 text-white shadow-lg hover:shadow-red-600/50 flex items-center justify-center gap-2"
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
                      <div className="text-base font-bold">
                        {formatFXPrice(getSellPriceUSD(), currentSymbol?.ExchangeType, currentSymbol?.SymbolName)}
                      </div>
                    ) : (
                      <div className="text-base font-bold">
                        ₹{formatBidAskPrice(activeTab === 'market' ? (currentSymbol?.sell || 0) : (orderData.price || currentSymbol?.sell || 0))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </button>
            <button
              onClick={() => placeOrder('BUY')}
              disabled={orderLoading || loading}
              className="py-3 px-3 rounded-lg text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-green-600/50 flex items-center justify-center gap-2"
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
                        {formatFXPrice(getBuyPriceUSD(), currentSymbol?.ExchangeType, currentSymbol?.SymbolName)}
                      </div>
                    ) : (
                      <div className="text-base font-bold">
                        ₹{formatBidAskPrice(activeTab === 'market' ? (currentSymbol?.buy || 0) : (orderData.price || currentSymbol?.buy || 0))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Chart Modal */}
      <ChartModal
        isOpen={isChartModalOpen}
        onClose={() => setIsChartModalOpen(false)}
        symbol={currentSymbol?.SymbolName || currentSymbol}
      />
    </div>
  );
};

export default OrderModal;