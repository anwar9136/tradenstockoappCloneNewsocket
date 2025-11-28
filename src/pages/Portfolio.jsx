import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  Filter, 
  ChevronDown, 
  Users, 
  BarChart3, 
  Bookmark, 
  FileText,
  Briefcase, 
  User,
  TrendingUp,
  TrendingDown,
  X
} from 'lucide-react';
import { tradingAPI } from '../services/api';
import toast from 'react-hot-toast';
import webSocketService from '../services/websocketService';

const getCachedExchangeRate = () => {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const cachedRate = window.localStorage.getItem('USD_TO_INR_RATE');
    if (cachedRate) {
      const parsed = parseFloat(cachedRate);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
  } catch (error) {
    console.error('Error reading cached exchange rate:', error);
  }
  return null;
};

const Portfolio = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // State management
  const [loading, setLoading] = useState(true);
  const [balanceData, setBalanceData] = useState({
    ledgerBalance: 0,
    marginAvailable: 0,
    activePL: 0,
    m2m: 0,
    netPL: 0
  });
  const [activeOrders, setActiveOrders] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState(null);
  const [showSLTPModal, setShowSLTPModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [slValue, setSLValue] = useState('');
  const [tpValue, setTPValue] = useState('');
  const [usdToInrRate, setUsdToInrRate] = useState(() => {
    const cachedRate = getCachedExchangeRate();
    return cachedRate ?? 88.65; // Default fallback rate if nothing cached
  });
  const [hasReliableFxRate, setHasReliableFxRate] = useState(() => !!getCachedExchangeRate());
  
  // WebSocket and refs
  const websocketRef = useRef(null);
  const fxWebSocketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const fxReconnectTimeoutRef = useRef(null);
  const mountedRef = useRef(true);
  const tokensRef = useRef('');
  const fxSymbolsRef = useRef([]);
  const totalMarginUsedRef = useRef(0);
  const reconnectAttemptRef = useRef(0);
  const fxReconnectAttemptRef = useRef(0);
  const exchangeRateIntervalRef = useRef(null);
  const activeOrdersStateRef = useRef([]); // Keep reference to current orders for preserving WebSocket updates
  const fxUpdateQueueRef = useRef(new Map()); // Queue for FX updates to throttle
  const fxUpdateTimeoutRef = useRef(null); // Timeout for throttling FX updates
  const initializeWebSocketRef = useRef(null); // Ref to store initializeWebSocket function
  const initializeFXWebSocketRef = useRef(null); // Ref to store initializeFXWebSocket function

  // Bottom navigation items
  const bottomNavItems = [
    { id: 'dashboard', icon: Bookmark, label: 'Home' },
    { id: 'orders', icon: FileText, label: 'Orders' },
    { id: 'portfolio', icon: Briefcase, label: 'Portfolio' },
    { id: 'profile', icon: User, label: 'Profile' }
  ];

  // Fetch USD to INR exchange rate
  const fetchExchangeRate = useCallback(async () => {
    try {
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const data = await response.json();
      if (data.rates && data.rates.INR) {
        const rate = parseFloat(data.rates.INR);
        if (!isNaN(rate) && rate > 0) {
          setUsdToInrRate(rate);
          setHasReliableFxRate(true);
          try {
            localStorage.setItem('USD_TO_INR_RATE', rate.toString());
          } catch (storageError) {
            console.error('Error caching exchange rate:', storageError);
          }
          return rate;
        }
      }
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
      // Keep using the previous rate or default
    }
    return null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    
    // Fetch exchange rate on mount and set up periodic updates (every 5 minutes)
    fetchExchangeRate();
    exchangeRateIntervalRef.current = setInterval(() => {
      if (mountedRef.current) {
        fetchExchangeRate();
      }
    }, 5 * 60 * 1000); // Update every 5 minutes
    
    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (fxReconnectTimeoutRef.current) {
        clearTimeout(fxReconnectTimeoutRef.current);
      }
      if (exchangeRateIntervalRef.current) {
        clearInterval(exchangeRateIntervalRef.current);
      }
      if (fxUpdateTimeoutRef.current) {
        clearTimeout(fxUpdateTimeoutRef.current);
        fxUpdateTimeoutRef.current = null;
      }
      if (websocketRef.current) {
        websocketRef.current.close();
        websocketRef.current = null;
      }
      if (fxWebSocketRef.current) {
        fxWebSocketRef.current.close();
        fxWebSocketRef.current = null;
      }
    };
  }, [fetchExchangeRate]);

  // Initialize data on component mount
  useEffect(() => {
    if (user?.UserId) {
      initializePortfolioData();
    }
    
    // Cleanup WebSocket on unmount
    return () => {
      if (websocketRef.current) {
        try {
          websocketRef.current.close();
          websocketRef.current = null;
        } catch (error) {
          console.log('Error closing WebSocket on unmount:', error);
        }
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [user]);

  // Get user balance and financial data
  const getUserBalance = useCallback(async () => {
    try {
      const response = await tradingAPI.getLedgerBalance(user.UserId);
      const ledgerBalance = parseInt(response) || 0;
      
      // Get net P/L for closed orders
      const netPLData = await tradingAPI.getNetPL(user.UserId);
      const netPL = parseInt(netPLData.P_L) || 0;
      
      const creditLimit = parseFloat(localStorage.getItem('CreditLimit')) || 0;
      const m2m = ledgerBalance + creditLimit;
      const marginAvailable = m2m - totalMarginUsedRef.current;
      
      setBalanceData({
        ledgerBalance,
        marginAvailable: Math.max(0, marginAvailable),
        activePL: 0, // Will be updated by WebSocket
        m2m,
        netPL
      });
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  }, [user?.UserId]);


  // Get active orders (consolidated trades)
  const getActiveOrders = useCallback(async (skipWebSocketInit = false, rateOverride = null) => {
    try {
      const response = await tradingAPI.getConsolidatedTrades(user.UserId);
      
      // Handle different response formats
      let data = response;
      
      // If response is a string, try to parse it as JSON
      if (typeof response === 'string') {
        try {
          const trimmed = response.trim();
          data = JSON.parse(trimmed);
          // If the parsed result is still a string, parse again (double-stringified case)
          if (typeof data === 'string') {
            data = JSON.parse(data);
          }
        } catch (parseError) {
          console.error('Failed to parse response as JSON:', parseError, 'Response:', response);
          setActiveOrders([]);
          activeOrdersStateRef.current = []; // Update ref
          return;
        }
      }
      
      // If response is an object but not an array, check for common array properties
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        data = data.data || data.orders || data.consolidatedTrades || data.result || [];
      }
      
      // Ensure data is an array
      if (!Array.isArray(data)) {
        console.warn('getConsolidatedTrades returned non-array data:', data, 'Type:', typeof data);
        setActiveOrders([]);
        return;
      }
      
      
      if (data.length > 0) {
        let tokens = '';
        let totalMargin = 0;
        const fxSymbols = [];
        const effectiveRate = typeof rateOverride === 'number' && rateOverride > 0
          ? rateOverride
          : (hasReliableFxRate ? usdToInrRate : null);
        const fxRateAvailable = effectiveRate !== null && effectiveRate > 0;
        
        // Preserve existing WebSocket updates from current orders state
        const existingOrdersMap = new Map();
        activeOrdersStateRef.current.forEach(order => {
          const cachedValues = {
            currentPrice: order.currentPrice,
            profitLoss: order.profitLoss,
            currentPriceUSD: order.currentPriceUSD,
            profitLossUSD: order.profitLossUSD,
            orderPriceUSD: order.orderPriceUSD
          };

          if (order.TokenNo) {
            existingOrdersMap.set(`token:${order.TokenNo.toString()}`, cachedValues);
          }

          const existingSymbol = order.scriptName || order.ScriptName?.split('_')?.[0];
          if (existingSymbol) {
            existingOrdersMap.set(`symbol:${existingSymbol}`, cachedValues);
          }
        });
        
        const orders = data.map(item => {
          // Check if this is an FX symbol (FOREX, CRYPTO, COMMODITY)
          const isFX = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(item.SymbolType);
          
          if (!isFX) {
            tokens += item.TokenNo + ',';
          } else {
            // For FX symbols, store symbol name for FX WebSocket
            const scriptParts = item.ScriptName.split('_');
            const symbolName = scriptParts[0];
            // Calculate lot size: actualLot * (Lot || selectedlotsize)
            // For MCS (MCX), CDS (OPT), and OPT: actualLot should be used if available
            // If Lot is "0", 0, or missing, use selectedlotsize instead
            const actualLotSize = parseFloat(item.actualLot || item.Lotsize || item.selectedlotsize || 1);
            const lotValue = item.Lot === "0" || item.Lot === 0 || !item.Lot ? item.selectedlotsize : item.Lot;
            const numberOfLots = parseFloat(lotValue || item.selectedlotsize || 1);
            fxSymbols.push({
              symbolName,
              tokenNo: item.TokenNo,
              orderCategory: item.OrderCategory,
              orderPrice: parseFloat(item.OrderPrice || 0),
              lotSize: actualLotSize * numberOfLots
            });
          }
          
          totalMargin += Math.round(item.MarginUsed);
          
          const scriptParts = item.ScriptName.split('_');
          const scriptName = scriptParts[0];
          const exchange = scriptParts[1];
          
          // Check if this is a stop loss order
          const isStopLossOrder = item.isstoplossorder === 'true' || item.isstoplossorder === true;
          const orderCategoryDisplay = isStopLossOrder ? `Stop ${item.OrderCategory}` : item.OrderCategory;
          
          // Calculate initial P/L - CHECK CACHE FIRST to avoid wrong calculations on component switch
          let profitLoss = 0;
          let profitLossUSD = 0;
          let orderPriceUSD = 0;
          let currentPriceUSD = 0;
          let currentPrice = 0;
          const cmp = parseFloat(item.cmp || 0);
          const orderPrice = parseFloat(item.OrderPrice || 0);
          
          // Use actualLot (symbol lot size) if available, otherwise fallback to Lotsize or selectedlotsize
          // actualLot is the symbol's lot size (e.g., 50 for MCX, 1 for OPT, etc.)
          // Lot is the number of lots (e.g., 1)
          // selectedlotsize is used when Lot is "0", 0, or missing
          // For MCS (MCX), CDS (OPT), and OPT: actualLot should be used if available
          // So total quantity = actualLot * (Lot || selectedlotsize)
          const actualLotSize = parseFloat(item.actualLot || item.Lotsize || item.selectedlotsize || 1);
          // If Lot is "0", 0, or missing, use selectedlotsize instead
          const lotValue = item.Lot === "0" || item.Lot === 0 || !item.Lot ? item.selectedlotsize : item.Lot;
          const numberOfLots = parseFloat(lotValue || item.selectedlotsize || 1);
          const lotSize = actualLotSize * numberOfLots;
          
          // PRIORITY 1: Check existing WebSocket-updated values from current state (most recent)
          const tokenKey = item.TokenNo ? `token:${item.TokenNo.toString()}` : null;
          const symbolKey = scriptName ? `symbol:${scriptName}` : null;
          let existingUpdate = null;
          if (tokenKey && existingOrdersMap.has(tokenKey)) {
            existingUpdate = existingOrdersMap.get(tokenKey);
          } else if (symbolKey && existingOrdersMap.has(symbolKey)) {
            existingUpdate = existingOrdersMap.get(symbolKey);
          }
          const hasExistingUpdate = existingUpdate && typeof existingUpdate.currentPrice === 'number' && existingUpdate.currentPrice > 0;
          
          // PRIORITY 2: Check global cache for WebSocket data (persists across component switches)
          let useCachedData = false;
          if (!hasExistingUpdate) {
            if (!isFX) {
              // Check MCX/NSE cache
              const cachedData = webSocketService.getCachedMarketData(item.TokenNo);
              if (cachedData && cachedData.currentPrice > 0) {
                useCachedData = true;
                // Determine current price based on order category
                if (item.OrderCategory === "SELL") {
                  currentPrice = cachedData.ask > 0 ? cachedData.ask : cachedData.currentPrice;
                } else {
                  currentPrice = cachedData.bid > 0 ? cachedData.bid : cachedData.currentPrice;
                }
              }
            } else if (fxRateAvailable) {
              // Check FX cache
              const cachedFXData = webSocketService.getCachedFXMarketData(scriptName);
              if (cachedFXData && (cachedFXData.bestBidPriceUSD > 0 || cachedFXData.bestAskPriceUSD > 0)) {
                useCachedData = true;
                // Convert USD prices to INR using the effective rate
                const conversionRate = effectiveRate;
                const bestBidPrice = cachedFXData.bestBidPriceUSD * conversionRate;
                const bestAskPrice = cachedFXData.bestAskPriceUSD * conversionRate;
                
                if (item.OrderCategory === "SELL") {
                  currentPrice = bestAskPrice;
                  currentPriceUSD = cachedFXData.bestAskPriceUSD;
                } else {
                  currentPrice = bestBidPrice;
                  currentPriceUSD = cachedFXData.bestBidPriceUSD;
                }
              }
            }
          }
          
          let awaitingFxRate = false;
          const canConvertFxNow = !isFX || fxRateAvailable;

          // Use existing update if available (highest priority)
          if (hasExistingUpdate) {
            // Use existing currentPrice but recalculate profitLoss to ensure brokerage is deducted
            currentPrice = existingUpdate.currentPrice || 0;
            currentPriceUSD = existingUpdate.currentPriceUSD || 0;
            orderPriceUSD = existingUpdate.orderPriceUSD || orderPriceUSD;
            
            // Recalculate profitLoss from currentPrice to ensure brokerage is always deducted
            if (currentPrice > 0) {
              if (isFX && canConvertFxNow && effectiveRate) {
                // For FX: OrderPrice is in INR, currentPriceUSD is in USD
                // Convert OrderPrice to USD, calculate P/L in USD, then convert to INR
                const conversionRate = effectiveRate;
                const orderPriceUSD = orderPrice / conversionRate;
                
                if (item.OrderCategory === "SELL") {
                  profitLossUSD = (orderPriceUSD - currentPriceUSD) * lotSize;
                } else {
                  profitLossUSD = (currentPriceUSD - orderPriceUSD) * lotSize;
                }
                
                // Convert P/L from USD to INR
                profitLoss = profitLossUSD * conversionRate;
              } else {
                // For non-FX orders
                if (item.OrderCategory === "SELL") {
                  profitLoss = (orderPrice - currentPrice) * lotSize;
                } else {
                  profitLoss = (currentPrice - orderPrice) * lotSize;
                }
              }
              // Always deduct brokerage
              const brokerage = parseFloat(item.Brokerage || 0);
              profitLoss = profitLoss - brokerage;
            } else {
              profitLoss = existingUpdate.profitLoss || 0;
            }
            
            profitLossUSD = existingUpdate.profitLossUSD || 0;
            if (isFX && !fxRateAvailable) {
              awaitingFxRate = true;
            }
          } else if (isFX && !fxRateAvailable) {
            awaitingFxRate = true;
            if (existingUpdate) {
              profitLoss = existingUpdate.profitLoss || 0;
              profitLossUSD = existingUpdate.profitLossUSD || 0;
              currentPriceUSD = existingUpdate.currentPriceUSD || 0;
              currentPrice = existingUpdate.currentPrice || orderPrice;
              orderPriceUSD = existingUpdate.orderPriceUSD || 0;
            } else {
              currentPrice = orderPrice;
            }
          } else if (useCachedData || (!isFX && cmp > 0)) {
            // For FX orders: Only use cached WebSocket data, NEVER use cmp (it's invalid for FX)
            // For non-FX orders: Use cmp from API if no cached data available
            if (!useCachedData && !isFX && cmp > 0) {
              currentPrice = cmp;
            }
            
            // Only calculate P/L if we have a valid current price
            if (currentPrice > 0) {
              // For FX orders: OrderPrice from API is in INR, WebSocket prices are in USD
              // Convert OrderPrice to USD, calculate P/L in USD, then convert to INR
              if (isFX && canConvertFxNow && effectiveRate) {
                const conversionRate = effectiveRate;
                // Convert OrderPrice from INR to USD
                orderPriceUSD = orderPrice / conversionRate;
                
                // Get currentPriceUSD from cached data or calculate from currentPrice
                if (currentPriceUSD === 0) {
                  currentPriceUSD = currentPrice / conversionRate;
                }
                
                // Calculate P/L in USD first
                if (item.OrderCategory === "SELL") {
                  profitLossUSD = (orderPriceUSD - currentPriceUSD) * lotSize;
                } else {
                  profitLossUSD = (currentPriceUSD - orderPriceUSD) * lotSize;
                }
                
                // Convert P/L from USD to INR
                profitLoss = profitLossUSD * conversionRate;
              } else {
                // For non-FX orders, calculate P/L in INR
                if (item.OrderCategory === "SELL") {
                  profitLoss = (orderPrice - currentPrice) * lotSize;
                } else {
                  profitLoss = (currentPrice - orderPrice) * lotSize;
                }
              }
              
              // Subtract Brokerage from profitLoss (Brokerage is already in rupees)
              const brokerage = parseFloat(item.Brokerage || 0);
              profitLoss = profitLoss - brokerage;
            }
          }
          
            return {
              ...item,
              scriptName,
              exchange,
              OrderStatus: item.OrderStatus || 'Active', // Ensure OrderStatus is set (default to Active for consolidated trades)
              profitLoss: parseFloat(profitLoss.toFixed(2)),
              profitLossUSD: isFX ? parseFloat(profitLossUSD.toFixed(2)) : 0,
              orderPriceUSD: isFX ? parseFloat(orderPriceUSD.toFixed(5)) : 0,
              currentPriceUSD: isFX ? parseFloat(currentPriceUSD.toFixed(5)) : 0,
              currentPrice: currentPrice > 0 ? currentPrice : (hasExistingUpdate ? existingUpdate.currentPrice : item.cmp), // Use calculated currentPrice or fallback
              isStopLossOrder,
              orderCategoryDisplay,
              stopLossPrice: item.StopLossPrice || '',
              takeProfitPrice: item.TakeProfitPrice || '',
              isFX,
              symbolType: item.SymbolType,
              actualLot: item.actualLot, // Preserve actualLot for WebSocket updates
              Lotsize: item.Lotsize, // Preserve Lotsize for WebSocket updates
              calculatedLotSize: lotSize, // Store calculated lot size for reference
              awaitingFxRate,
              Brokerage: item.Brokerage // Preserve Brokerage for WebSocket updates
            };
        });
        
        totalMarginUsedRef.current = totalMargin;
        tokensRef.current = tokens.slice(0, -1); // Remove trailing comma
        fxSymbolsRef.current = fxSymbols;
        
        
        // Sort orders by OrderDate and OrderTime descending (newest first)
        const sortedOrders = orders.sort((a, b) => {
          const dateA = a.OrderDate || '';
          const timeA = a.OrderTime || '';
          const dateB = b.OrderDate || '';
          const timeB = b.OrderTime || '';
          
          // Combine date and time for comparison
          const dateTimeA = `${dateA} ${timeA}`;
          const dateTimeB = `${dateB} ${timeB}`;
          
          // Compare dates first, then times
          if (dateTimeA > dateTimeB) return -1;
          if (dateTimeA < dateTimeB) return 1;
          return 0;
        });
        
        setActiveOrders(sortedOrders);
        activeOrdersStateRef.current = sortedOrders; // Update ref
        
        // Initialize WebSocket for MCX/NSE orders only if not skipping and not already connected
        if (!skipWebSocketInit && tokensRef.current) {
          // Only re-initialize if WebSocket is not connected or is closing/closed
          const wsState = websocketRef.current?.readyState;
          if (!websocketRef.current || wsState === WebSocket.CLOSING || wsState === WebSocket.CLOSED) {
            // Use ref to call function if available
            if (initializeWebSocketRef.current) {
              initializeWebSocketRef.current(tokensRef.current);
            }
          }
        }
        
        // Initialize FX WebSocket for FOREX/CRYPTO/COMMODITY orders only if not skipping and not already connected
        if (!skipWebSocketInit && fxSymbols.length > 0) {
          // Only re-initialize if FX WebSocket is not connected or is closing/closed
          const fxWsState = fxWebSocketRef.current?.readyState;
          if (!fxWebSocketRef.current || fxWsState === WebSocket.CLOSING || fxWsState === WebSocket.CLOSED) {
            // Use ref to call function if available
            if (initializeFXWebSocketRef.current) {
              initializeFXWebSocketRef.current();
            }
          }
        }
      } else {
        setActiveOrders([]);
        activeOrdersStateRef.current = []; // Update ref
        tokensRef.current = '';
        fxSymbolsRef.current = [];
      }
    } catch (error) {
      console.error('Error fetching active orders:', error);
      setActiveOrders([]);
      activeOrdersStateRef.current = []; // Update ref
    }
  }, [user?.UserId, usdToInrRate, hasReliableFxRate]);

  // Initialize portfolio data
  const initializePortfolioData = useCallback(async (skipWebSocketInit = false) => {
    setLoading(true);
    try {
      let rateForFetch = hasReliableFxRate ? usdToInrRate : null;

      if (!hasReliableFxRate) {
        const fetchedRate = await fetchExchangeRate();
        if (fetchedRate && fetchedRate > 0) {
          rateForFetch = fetchedRate;
        }
      } else {
        // Refresh rate in the background to keep it up to date
        fetchExchangeRate();
      }

      await Promise.all([
        getUserBalance(),
        getActiveOrders(skipWebSocketInit, rateForFetch)
      ]);
    } catch (error) {
      console.error('Error initializing portfolio data:', error);
      toast.error('Failed to load portfolio data');
    } finally {
      setLoading(false);
    }
  }, [fetchExchangeRate, getUserBalance, getActiveOrders, hasReliableFxRate, usdToInrRate]);


  // Update market data from WebSocket (MCX/NSE format)
  const updateMarketData = useCallback((data) => {
    if (!data?.instrument_token) return;
    
    const tokenToFind = data.instrument_token.toString();
    
    setActiveOrders(prevOrders => {
      let hasChanges = false;
      const updatedOrders = prevOrders.map(order => {
        // Only update non-FX orders
        if (order.TokenNo?.toString() === tokenToFind && !order.isFX) {
          const bid = data.bid === "0" || data.bid === 0 ? data.last_price : data.bid;
          const ask = data.ask === "0" || data.ask === 0 ? data.last_price : data.ask;
          
          let currentPrice = 0;
          let profitLoss = 0;
          
          // Use actualLot (symbol lot size) if available for lot size calculation
          const actualLotSize = parseFloat(order.actualLot || order.Lotsize || order.selectedlotsize || 1);
          const lotValue = order.Lot === "0" || order.Lot === 0 || !order.Lot ? order.selectedlotsize : order.Lot;
          const numberOfLots = parseFloat(lotValue || order.selectedlotsize || 1);
          const lotSize = actualLotSize * numberOfLots;
          
          if (order.OrderCategory === "SELL") {
            currentPrice = ask;
            profitLoss = (parseFloat(order.OrderPrice) - parseFloat(currentPrice)) * lotSize;
          } else {
            currentPrice = bid;
            profitLoss = (parseFloat(currentPrice) - parseFloat(order.OrderPrice)) * lotSize;
          }
          
          // Subtract Brokerage from profitLoss (Brokerage is already in rupees)
          const brokerage = parseFloat(order.Brokerage || 0);
          profitLoss = profitLoss - brokerage;
          
          const newCurrentPrice = parseFloat(currentPrice);
          const newProfitLoss = parseFloat(profitLoss.toFixed(2));
          
          // Only update if values actually changed
          if (order.currentPrice !== newCurrentPrice || order.profitLoss !== newProfitLoss) {
            hasChanges = true;
            return {
              ...order,
              currentPrice: newCurrentPrice,
              profitLoss: newProfitLoss
            };
          }
        }
        return order;
      });
      
      if (!hasChanges) return prevOrders; // Prevent unnecessary re-render
      
      activeOrdersStateRef.current = updatedOrders; // Update ref
      return updatedOrders;
    });
  }, []);

  // Process queued FX updates (throttled)
  const processFXUpdates = useCallback(() => {
    if (!hasReliableFxRate || usdToInrRate <= 0) {
      fxUpdateTimeoutRef.current = null;
      return;
    }

    if (fxUpdateQueueRef.current.size === 0) {
      fxUpdateTimeoutRef.current = null;
      return;
    }

    // Get the latest update for each symbol from the queue
    const latestUpdates = new Map();
    fxUpdateQueueRef.current.forEach((update, symbol) => {
      latestUpdates.set(symbol, update);
    });
    
    // Clear the queue
    fxUpdateQueueRef.current.clear();
    
    // Process all updates at once
    setActiveOrders(prevOrders => {
      let hasChanges = false;
      const updatedOrders = prevOrders.map(order => {
        if (!order.isFX) return order;
        
        const symbolName = order.scriptName || order.ScriptName?.split('_')[0];
        const update = latestUpdates.get(symbolName) || latestUpdates.get(order.ScriptName);
        
        if (!update) return order;
        
        const { bestBidPriceUSD, bestAskPriceUSD } = update;
        if (bestBidPriceUSD <= 0 && bestAskPriceUSD <= 0) {
          return order;
        }
        
        const conversionRate = usdToInrRate;
        let currentPrice = 0;
        let profitLoss = 0;
        let currentPriceUSD = 0;
        let profitLossUSD = 0;
        
        // Use actualLot (symbol lot size) if available for lot size calculation
        const actualLotSize = parseFloat(order.actualLot || order.Lotsize || order.selectedlotsize || 1);
        const lotValue = order.Lot === "0" || order.Lot === 0 || !order.Lot ? order.selectedlotsize : order.Lot;
        const numberOfLots = parseFloat(lotValue || order.selectedlotsize || 1);
        const lotSize = actualLotSize * numberOfLots;
        
        // For FOREX: OrderPrice from API is in INR, WebSocket prices are in USD
        // Convert OrderPrice from INR to USD, then calculate P/L in USD, then convert to INR
        const orderPriceUSD = parseFloat(order.OrderPrice) / conversionRate;
        
        if (order.OrderCategory === "SELL") {
          currentPriceUSD = bestAskPriceUSD;
          currentPrice = bestAskPriceUSD * conversionRate;
          // Calculate P/L in USD first
          profitLossUSD = (orderPriceUSD - currentPriceUSD) * lotSize;
        } else {
          currentPriceUSD = bestBidPriceUSD;
          currentPrice = bestBidPriceUSD * conversionRate;
          // Calculate P/L in USD first
          profitLossUSD = (currentPriceUSD - orderPriceUSD) * lotSize;
        }
        
        // Convert P/L from USD to INR
        profitLoss = profitLossUSD * conversionRate;
        
        // Subtract Brokerage from profitLoss (Brokerage is already in rupees)
        const brokerage = parseFloat(order.Brokerage || 0);
        profitLoss = profitLoss - brokerage;
        
        const newCurrentPrice = parseFloat(currentPrice);
        const newProfitLoss = parseFloat(profitLoss.toFixed(2));
        const newCurrentPriceUSD = parseFloat(currentPriceUSD.toFixed(5));
        const newProfitLossUSD = parseFloat(profitLossUSD.toFixed(2));
        
        // Only update if values actually changed (with small threshold to prevent micro-updates)
        const priceDiff = Math.abs(order.currentPrice - newCurrentPrice);
        const plDiff = Math.abs((order.profitLoss || 0) - newProfitLoss);
        const priceUSDDiff = Math.abs((order.currentPriceUSD || 0) - newCurrentPriceUSD);
        const plUSDDiff = Math.abs((order.profitLossUSD || 0) - newProfitLossUSD);
        
        // Only update if change is significant (prevents micro-updates that cause jitter)
        const minPriceChange = 0.0001; // Minimum change threshold for FX prices
        const minPLChange = 0.01; // Minimum change threshold for P/L
        
        if (priceDiff >= minPriceChange || plDiff >= minPLChange || 
            priceUSDDiff >= minPriceChange || plUSDDiff >= minPLChange || order.awaitingFxRate) {
          hasChanges = true;
          return {
            ...order,
            currentPrice: newCurrentPrice,
            profitLoss: newProfitLoss,
            currentPriceUSD: newCurrentPriceUSD,
            orderPriceUSD: parseFloat(orderPriceUSD.toFixed(5)),
            profitLossUSD: newProfitLossUSD,
            buyUSD: bestAskPriceUSD,
            sellUSD: bestBidPriceUSD,
            ltpUSD: (bestBidPriceUSD + bestAskPriceUSD) / 2,
            awaitingFxRate: false
          };
        }
        
        return order;
      });
      
      if (!hasChanges) return prevOrders; // Prevent unnecessary re-render
      
      activeOrdersStateRef.current = updatedOrders; // Update ref
      return updatedOrders;
    });
    
    // Schedule next update if queue has items
    fxUpdateTimeoutRef.current = null;
  }, [usdToInrRate, hasReliableFxRate]);

  useEffect(() => {
    if (hasReliableFxRate && fxUpdateQueueRef.current.size > 0 && !fxUpdateTimeoutRef.current) {
      fxUpdateTimeoutRef.current = setTimeout(() => {
        processFXUpdates();
      }, 0);
    }
  }, [hasReliableFxRate, processFXUpdates]);

  // Update market data from FX WebSocket (FOREX/CRYPTO/COMMODITY tick format)
  // Throttled to prevent rapid updates
  const updateFXMarketData = useCallback((tickData) => {
    if (!tickData || !tickData.type || tickData.type !== 'tick' || !tickData.data) {
      return;
    }

    const { Symbol, BestBid, BestAsk } = tickData.data;
    
    if (!Symbol) return;

    // Get USD prices from tick data
    const bestBidPriceUSD = BestBid?.Price || 0;
    const bestAskPriceUSD = BestAsk?.Price || 0;
    
    // Skip if prices are invalid
    if (bestBidPriceUSD <= 0 && bestAskPriceUSD <= 0) return;
    
    // Queue the update (will be processed in batches)
    fxUpdateQueueRef.current.set(Symbol, {
      bestBidPriceUSD,
      bestAskPriceUSD
    });
    
    // Throttle updates: process queue every 150ms (smooth but responsive)
    if (!fxUpdateTimeoutRef.current) {
      fxUpdateTimeoutRef.current = setTimeout(() => {
        processFXUpdates();
      }, 150); // Update every 150ms for smooth animation
    }
  }, [processFXUpdates]);
  
  // Calculate and update balance data when active orders change
  // Use useMemo to prevent unnecessary recalculations
  const totalActivePL = useMemo(() => {
    if (activeOrders.length === 0) return 0;
    return activeOrders.reduce((total, order) => total + (order.profitLoss || 0), 0);
  }, [activeOrders]);
  
  useEffect(() => {
    // Only update if totalActivePL actually changed
    setBalanceData(prev => {
      const creditLimit = parseFloat(localStorage.getItem('CreditLimit')) || 0;
      const ledgerBalance = prev.ledgerBalance;
      const m2m = ledgerBalance; // M2M = Ledger Balance only
      const marginAvailable = m2m - totalMarginUsedRef.current;
      
      // Only update if values actually changed to prevent unnecessary re-renders
      // Use Math.round for comparison to handle floating point precision
      if (Math.round(prev.activePL) === Math.round(totalActivePL) && 
          Math.round(prev.m2m) === Math.round(m2m) && 
          Math.round(prev.marginAvailable) === Math.round(marginAvailable)) {
        return prev;
      }
      
      return {
        ...prev,
        activePL: totalActivePL,
        m2m,
        marginAvailable: Math.max(0, marginAvailable)
      };
    });
  }, [totalActivePL]);

  // Initialize WebSocket connection with 0 failure rate
  const initializeWebSocket = useCallback((tokens) => {
    const uri = "wss://ws.tradewingss.com/api/webapiwebsoc";
    
    // Close existing connection gracefully if any
    if (websocketRef.current) {
      try {
        websocketRef.current.close(1000, 'Reconnecting');
      } catch (error) {
        console.log('Error closing existing WebSocket:', error);
      }
      websocketRef.current = null;
    }
    
    // Clear any existing reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Store reconnect attempt count
    const maxReconnectAttempts = 10;
    
    const connectWebSocket = () => {
      try {
        console.log(`Attempting WebSocket connection (attempt ${reconnectAttemptRef.current + 1})...`);
        
        const ws = new WebSocket(uri);
        websocketRef.current = ws;
        
        const connectTimeout = setTimeout(() => {
          if (ws.readyState === WebSocket.CONNECTING) {
            console.log('WebSocket connection timeout');
            ws.close();
          }
        }, 10000); // 10 second timeout
        
        ws.onopen = () => {
          clearTimeout(connectTimeout);
          
          if (!mountedRef.current) {
            ws.close();
            return;
          }
          
          console.log('✓ WebSocket connected successfully');
          setWsConnected(true);
          setWsError(null);
          reconnectAttemptRef.current = 0; // Reset on successful connection
          
          // Send tokens to subscribe
          if (tokens && tokens.trim().length > 0) {
            console.log('Subscribing to tokens:', tokens);
            try {
              ws.send(tokens);
            } catch (error) {
              console.error('Error sending tokens:', error);
              // Retry sending tokens after 1 second
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  try {
                    ws.send(tokens);
                  } catch (err) {
                    console.error('Retry send failed:', err);
                  }
                }
              }, 1000);
            }
          } else {
            console.log('No tokens to subscribe');
            ws.send("");
          }
        };
        
        ws.onerror = (event) => {
          clearTimeout(connectTimeout);
          if (!mountedRef.current) return;
          
          console.error('WebSocket error:', event);
          setWsError('Connection error occurred');
          setWsConnected(false);
          
          // Don't reconnect on error, let onclose handle it
        };
        
        ws.onclose = (event) => {
          clearTimeout(connectTimeout);
          if (!mountedRef.current) return;
          
          console.log('WebSocket disconnected', { 
            code: event.code, 
            reason: event.reason,
            wasClean: event.wasClean
          });
          setWsConnected(false);
          websocketRef.current = null;
          
          // Reconnect logic with exponential backoff
          if (mountedRef.current && tokensRef.current && reconnectAttemptRef.current < maxReconnectAttempts) {
            reconnectAttemptRef.current++;
            
            // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
            const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 30000);
            
            console.log(`Scheduling reconnect in ${delay}ms (attempt ${reconnectAttemptRef.current}/${maxReconnectAttempts})`);
            
            reconnectTimeoutRef.current = setTimeout(() => {
              if (mountedRef.current && tokensRef.current) {
                connectWebSocket();
              }
            }, delay);
          } else if (reconnectAttemptRef.current >= maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            setWsError('Connection failed after multiple attempts');
            // Reset after a longer delay to try again
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectAttemptRef.current = 0;
              if (mountedRef.current && tokensRef.current) {
                connectWebSocket();
              }
            }, 60000); // Try again after 60 seconds
          }
        };
        
        ws.onmessage = (event) => {
          if (!mountedRef.current) return;
          
          // Handle empty or ping messages
          if (!event.data || event.data === "" || event.data === "true") {
            return;
          }
          
          try {
            const data = JSON.parse(event.data);
            updateMarketData(data);
          } catch (error) {
            console.error('Error parsing WebSocket data:', error);
            console.log('Raw data:', event.data);
          }
        };
        
      } catch (error) {
        console.error('Error creating WebSocket:', error);
        setWsError('Failed to create WebSocket connection');
        setWsConnected(false);
        
        // Attempt to reconnect with exponential backoff
        if (mountedRef.current && tokensRef.current && reconnectAttemptRef.current < maxReconnectAttempts) {
          reconnectAttemptRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 30000);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current && tokensRef.current) {
              connectWebSocket();
            }
          }, delay);
        }
      }
    };
    
    connectWebSocket();
  }, [updateMarketData]);
  
  // Store initializeWebSocket in ref after it's defined
  useEffect(() => {
    initializeWebSocketRef.current = initializeWebSocket;
  }, [initializeWebSocket]);

  // Initialize FX WebSocket for FOREX/CRYPTO/COMMODITY
  const initializeFXWebSocket = useCallback(() => {
    const uri = "wss://www.fxsoc.tradenstocko.com:8001/ws";
    
    // Close existing FX connection if any
    if (fxWebSocketRef.current) {
      try {
        fxWebSocketRef.current.close(1000, 'Reconnecting');
      } catch (error) {
        console.log('Error closing existing FX WebSocket:', error);
      }
      fxWebSocketRef.current = null;
    }
    
    // Clear any existing reconnection timeout
    if (fxReconnectTimeoutRef.current) {
      clearTimeout(fxReconnectTimeoutRef.current);
      fxReconnectTimeoutRef.current = null;
    }
    
    const maxReconnectAttempts = 10;
    
    const connectFXWebSocket = () => {
      try {
        console.log(`Attempting FX WebSocket connection (attempt ${fxReconnectAttemptRef.current + 1})...`);
        
        const ws = new WebSocket(uri);
        fxWebSocketRef.current = ws;
        
        const connectTimeout = setTimeout(() => {
          if (ws.readyState === WebSocket.CONNECTING) {
            console.log('FX WebSocket connection timeout');
            ws.close();
          }
        }, 10000);
        
        ws.onopen = () => {
          clearTimeout(connectTimeout);
          
          if (!mountedRef.current) {
            ws.close();
            return;
          }
          
          console.log('✓ FX WebSocket connected successfully');
          fxReconnectAttemptRef.current = 0;
          
          // FX WebSocket automatically sends all data, no need to send tokens
        };
        
        ws.onerror = (event) => {
          clearTimeout(connectTimeout);
          if (!mountedRef.current) return;
          console.error('FX WebSocket error:', event);
        };
        
        ws.onclose = (event) => {
          clearTimeout(connectTimeout);
          if (!mountedRef.current) return;
          
          console.log('FX WebSocket disconnected', { 
            code: event.code, 
            reason: event.reason 
          });
          fxWebSocketRef.current = null;
          
          // Reconnect logic
          if (mountedRef.current && fxSymbolsRef.current.length > 0 && fxReconnectAttemptRef.current < maxReconnectAttempts) {
            fxReconnectAttemptRef.current++;
            const delay = Math.min(1000 * Math.pow(2, fxReconnectAttemptRef.current - 1), 30000);
            
            console.log(`Scheduling FX reconnect in ${delay}ms (attempt ${fxReconnectAttemptRef.current}/${maxReconnectAttempts})`);
            
            fxReconnectTimeoutRef.current = setTimeout(() => {
              if (mountedRef.current && fxSymbolsRef.current.length > 0) {
                connectFXWebSocket();
              }
            }, delay);
          }
        };
        
        ws.onmessage = (event) => {
          if (!mountedRef.current) return;
          
          if (!event.data || event.data === "" || event.data === "true") {
            return;
          }
          
          try {
            const data = JSON.parse(event.data);
            updateFXMarketData(data);
          } catch (error) {
            console.error('Error parsing FX WebSocket data:', error);
          }
        };
        
      } catch (error) {
        console.error('Error creating FX WebSocket:', error);
        
        if (mountedRef.current && fxSymbolsRef.current.length > 0 && fxReconnectAttemptRef.current < maxReconnectAttempts) {
          fxReconnectAttemptRef.current++;
          const delay = Math.min(1000 * Math.pow(2, fxReconnectAttemptRef.current - 1), 30000);
          
          fxReconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current && fxSymbolsRef.current.length > 0) {
              connectFXWebSocket();
            }
          }, delay);
        }
      }
    };
    
    connectFXWebSocket();
  }, [updateFXMarketData]);
  
  // Store initializeFXWebSocket in ref after it's defined
  useEffect(() => {
    initializeFXWebSocketRef.current = initializeFXWebSocket;
  }, [initializeFXWebSocket]);

  // Close trade functionality
  const closeTrade = async (order) => {
    // Get scalping protection time from localStorage
    let profittradestoptime = '';
    try {
      profittradestoptime = localStorage.getItem("profittradestoptime") || '';
    } catch (error) {
      console.error('Error reading profittradestoptime from localStorage:', error);
    }
    const minutecount = profittradestoptime && profittradestoptime !== '' ? parseInt(profittradestoptime, 10) : 0;
    
    console.log('Scalping check:', { profittradestoptime, minutecount, orderDate: order.OrderDate, orderTime: order.OrderTime });
    
    // Check if trade was opened less than the specified minutes ago - prevent scalping
    if (minutecount > 0 && !isNaN(minutecount)) {
      const orderDateStr = order.OrderDate || '';
      const orderTimeStr = order.OrderTime || '';
      
      if (orderDateStr && orderTimeStr) {
        try {
          // Parse order datetime (format: YYYY-MM-DD HH:MM:SS or HH:MM)
          let orderDateTimeStr = `${orderDateStr} ${orderTimeStr}`;
          
          // Ensure time has seconds if not present
          if (orderTimeStr.split(':').length === 2) {
            orderDateTimeStr = `${orderDateStr} ${orderTimeStr}:00`;
          }
          
          const orderDateTime = new Date(orderDateTimeStr);
          const currentDateTime = new Date();
          
          // Calculate time difference in minutes
          const timeDifferenceInMinutes = (currentDateTime - orderDateTime) / (1000 * 60);
          
          // Prevent closing if less than the specified minutes have passed
          if (timeDifferenceInMinutes >= 0 && timeDifferenceInMinutes < minutecount) {
            toast.error("Scalping not allowed");
            return;
          }
        } catch (error) {
          console.error('Error parsing order datetime for scalping check:', error);
          // If parsing fails, allow the trade to proceed (fallback)
        }
      }
    }
    
    const symbolType = order.SymbolType || order.symbolType || '';
    const isFX = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(symbolType);
    
    // Check scalping restriction - skip for FX markets (24/7) and old orders
    if (minutecount && minutecount !== "" && minutecount > 0 && !isFX) {
      // Parse order date and time to get accurate time difference
      const orderDateStr = order.OrderDate || '';
      const orderTimeStr = order.OrderTime || '';
      
      if (orderDateStr && orderTimeStr) {
        try {
          // Parse order datetime (format: YYYY-MM-DD HH:MM or similar)
          const orderDateTimeStr = `${orderDateStr} ${orderTimeStr}`;
          const orderDateTime = new Date(orderDateTimeStr);
          
          // Get current IST time
          const currentDate = new Date();
          const istOffset = 5.5 * 60 * 60 * 1000;
          const utcTime = currentDate.getTime() + (currentDate.getTimezoneOffset() * 60000);
          const currentIST = new Date(utcTime + istOffset);
          
          // Calculate time difference in minutes
          const timeDifferenceInMinutes = (currentIST - orderDateTime) / (1000 * 60);
          
          // Only check scalping if order is profitable and within the time window
          // Also skip if order is older than 24 hours (1440 minutes) - likely not scalping
          if (order.profitLoss > 0 && timeDifferenceInMinutes >= 0 && timeDifferenceInMinutes < parseInt(minutecount) && timeDifferenceInMinutes < 1440) {
            toast.error(`Scalping not allowed. You can only close profitable trades after ${minutecount} minutes from order placement.`);
            return;
          }
        } catch (error) {
          console.error('Error parsing order datetime for scalping check:', error);
          // Fallback to old method if date parsing fails
      const currentDate = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const utcTime = currentDate.getTime() + (currentDate.getTimezoneOffset() * 60000);
      const istTime = new Date(utcTime + istOffset);
      
      const currentHours = istTime.getHours();
      const currentMinutes = istTime.getMinutes();
      
          const orderTimeParts = orderTimeStr.split(':');
          const orderHours = parseInt(orderTimeParts[0]) || 0;
          const orderMinutes = parseInt(orderTimeParts[1]) || 0;
      
      const currentTotalMinutes = (currentHours * 60) + currentMinutes;
      const orderTotalMinutes = (orderHours * 60) + orderMinutes;
      const timeDifferenceInMinutes = currentTotalMinutes - orderTotalMinutes;
      
          // Only check if positive difference (same day) and within reasonable window
          if (order.profitLoss > 0 && timeDifferenceInMinutes >= 0 && timeDifferenceInMinutes < parseInt(minutecount) && timeDifferenceInMinutes < 1440) {
        toast.error(`Scalping not allowed. You can only close profitable trades after ${minutecount} minutes from order placement.`);
        return;
          }
        }
      }
    }
    
    // Show confirmation dialog
    const confirmed = window.confirm("Do you want to close this trade?");
    if (!confirmed) return;
    
    try {
      // Get refId from user object or localStorage, fallback to '4355'
      const refid = user?.Refid || localStorage.getItem("Refid") || '4355';
      
      // Check market time
      const marketTimeResponse = await tradingAPI.getMarketTime(order.SymbolType, refid);
      const marketData = marketTimeResponse.split('|');
      
      // Handle market time - if response already has seconds, use as-is, otherwise add ":00"
      let startTime = marketData[0] || '';
      let endTime = marketData[1] || '';
      
      // Check if time already includes seconds (format: HH:MM:SS)
      if (startTime && startTime.split(':').length === 2) {
        startTime = startTime + ":00";
      }
      if (endTime && endTime.split(':').length === 2) {
        endTime = endTime + ":00";
      }
      
      // Detect 24/7 markets:
      // 1. Check if SymbolType is CRYPTO/FOREX/COMMODITY (24/7 markets)
      // 2. Check if start and end time are the same (like "5:00:00|5:00:00")
      // 3. Check if start is "0:00:00" and end is "23:59:00" or "23:59:59" (24-hour market)
      // Ensure isFX is available (it's declared at function start)
      const isFXMarket = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(symbolType);
      const is24x7Market = isFXMarket || 
                           (startTime === endTime && startTime !== '') ||
                           (startTime === '0:00:00' && (endTime === '23:59:00' || endTime === '23:59:59'));
      
      // Skip weekend check for 24/7 markets (crypto, forex, commodity)
      const today = new Date();
      if (!is24x7Market && (today.getDay() === 6 || today.getDay() === 0)) {
        toast.error("Market not open.");
        return;
      }
      
      const currentTime = new Date();
      const currentTimeStr = currentTime.getHours() + ":" + currentTime.getMinutes() + ":00";
      
      // For 24/7 markets (crypto, forex, commodity), skip time validation
      if (is24x7Market) {
        // Allow closing for 24/7 markets anytime
      } else {
        const currentSeconds = getTimeInSeconds(currentTimeStr);
        const startSeconds = getTimeInSeconds(startTime);
        const endSeconds = getTimeInSeconds(endTime);
        
        // Handle edge case where end time is 23:59:00 - treat as 24:00:00 (end of day)
        const effectiveEndSeconds = (endTime === '23:59:00' || endTime === '23:59:59') ? 24 * 60 * 60 : endSeconds;
        
        if (currentSeconds < startSeconds || currentSeconds > effectiveEndSeconds) {
          toast.error("Market not open.");
          return;
        }
      }
      
      // Get order number - in the backend it's the Id field
      const orderNo = order.Id || order.OrderNo || order.OrderId || order.orderNo || order.orderId;
      
      console.log('Closing order with OrderNo:', orderNo, 'Full order:', order);
      
      if (!orderNo) {
        toast.error("Order number not found");
        return;
      }
      
      // Calculate P/L - ALWAYS use INR values for backend (even for FX orders)
      // Note: For FX orders, profitLossUSD is for display only, backend always expects INR
      const pl = order.profitLoss || 0; // This is always in INR
      
      // Validate P/L is a number
      if (isNaN(pl) || pl === null || pl === undefined) {
        console.error('Invalid P/L value:', order.profitLoss);
        toast.error('Cannot close trade: Invalid P/L calculation');
        return;
      }
      
      // Calculate brokerage based on symbol type
      const isFXForBrokerage = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(symbolType);
      let brokerage = 0;
      
      if (isFXForBrokerage) {
        // For FX symbols (CRYPTO, FOREX, COMMODITY), brokerage = brokerageValue * selectedlotsize
        let brokerageValue = 0;
        
        try {
          if (symbolType === 'CRYPTO') {
            const cryptoBrokerage = localStorage.getItem('CryptoBrokerage');
            brokerageValue = cryptoBrokerage && cryptoBrokerage !== '' ? parseFloat(cryptoBrokerage) : 0;
          } else if (symbolType === 'FOREX') {
            const forexBrokerage = localStorage.getItem('ForexBrokerage');
            brokerageValue = forexBrokerage && forexBrokerage !== '' ? parseFloat(forexBrokerage) : 0;
          } else if (symbolType === 'COMMODITY') {
            const commodityBrokerage = localStorage.getItem('CommodityBrokerage');
            brokerageValue = commodityBrokerage && commodityBrokerage !== '' ? parseFloat(commodityBrokerage) : 0;
          }
        } catch (error) {
          console.error('Error reading brokerage from localStorage:', error);
        }
        
        // Get selectedlotsize directly from order
        const selectedlotsize = parseFloat(order.selectedlotsize || 1);
        
        console.log('Brokerage calculation:', { 
          symbolType, 
          brokerageValue, 
          selectedlotsize, 
          calculatedBrokerage: brokerageValue * selectedlotsize 
        });
        
        // Brokerage = brokerageValue * selectedlotsize
        // Example: ForexBrokerage = 100, selectedlotsize = 0.1, brokerage = 100 * 0.1 = 10
        // Ensure both values are valid numbers
        if (!isNaN(brokerageValue) && !isNaN(selectedlotsize) && brokerageValue > 0 && selectedlotsize > 0) {
          brokerage = brokerageValue * selectedlotsize;
        } else {
          brokerage = 0;
          console.warn('Brokerage calculation failed - invalid values:', { brokerageValue, selectedlotsize });
        }
      } else {
        // For MCX, NSE, OPT, CDS - calculate proper brokerage
        try {
          const orderPrice = parseFloat(order.OrderPrice || 0);
          const currentPrice = parseFloat(order.currentPrice || 0);
          
          // Get lot size and quantity
          const actualLotSize = parseFloat(order.actualLot || order.Lotsize || order.selectedlotsize || 1);
          const lotValue = order.Lot === "0" || order.Lot === 0 || !order.Lot ? order.selectedlotsize : order.Lot;
          const numberOfLots = parseFloat(lotValue || order.selectedlotsize || 1);
          const lotSize = actualLotSize * numberOfLots;
          
          let brokerageType = '';
          let brokerageValue = 0;
          
          if (symbolType === 'NSE') {
            brokerageType = localStorage.getItem('NSE_Brokerage_Type') || '';
            brokerageValue = parseFloat(localStorage.getItem('Equity_brokerage_per_crore') || 0);
          } else if (symbolType === 'OPT' || symbolType === 'CDS') {
            brokerageType = localStorage.getItem('CDS_Brokerage_Type') || '';
            brokerageValue = parseFloat(localStorage.getItem('CDS_brokerage_per_crore') || 0);
          } else if (symbolType === 'MCX') {
            brokerageType = localStorage.getItem('Mcx_Brokerage_Type') || '';
            
            // For MCX per_lot: Use script-specific brokerage per lot (GOLD_brokerage, SILVER_brokerage, etc.)
            // For MCX per_crore: Use MCX_brokerage_per_crore
            if (brokerageType === 'per_lot') {
              // ScriptName might be "GOLD22AUGFUT" or "GOLD_MCX", use full name for matching
              const scriptName = (order.ScriptName || order.scriptName || '').toUpperCase();
              
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
                // Get script-specific brokerage per lot (e.g., GOLD_brokerage = 20 means 20 per lot)
                const scriptBrokerageKey = matchedSymbol + '_brokerage';
                const scriptBrokeragePerLot = parseFloat(localStorage.getItem(scriptBrokerageKey) || 0);
                if (scriptBrokeragePerLot > 0) {
                  brokerageValue = scriptBrokeragePerLot;
                  console.log('MCX per_lot: Using script-specific brokerage per lot:', scriptBrokerageKey, '=', scriptBrokeragePerLot);
                } else {
                  console.warn('Script-specific brokerage per lot not found for', matchedSymbol, ', key:', scriptBrokerageKey);
                }
              } else {
                console.warn('Could not match script name to MCX symbol:', scriptName);
              }
            } else {
              // For MCX per_crore, use MCX_brokerage_per_crore
              brokerageValue = parseFloat(localStorage.getItem('Mcx_brokerage_per_crore') || 0);
            }
          }
          
          if (brokerageType === 'per_lot') {
            // Per lot brokerage calculation: numberOfLots × brokeragePerLot
            // Brokerage is ALWAYS based on lots, regardless of profit/loss or trade value
            // Example: If GOLD_brokerage = 20 and numberOfLots = 1, then brokerage = 1 × 20 = 20
            if (numberOfLots > 0) {
              if (brokerageValue > 0) {
                // brokerageValue is already per lot (e.g., 20 per lot)
                brokerage = numberOfLots * brokerageValue;
                console.log('Per lot brokerage calculation:', numberOfLots, 'lots ×', brokerageValue, 'per lot =', brokerage);
              } else {
                // If brokerageValue is missing, use default per lot (e.g., 20 per lot)
                console.warn('Brokerage per lot value missing, using default per lot calculation');
                const defaultPerLotBrokerage = 20; // Default brokerage per lot
                brokerage = numberOfLots * defaultPerLotBrokerage;
              }
            } else {
              console.error('Cannot calculate brokerage: numberOfLots is 0 or invalid');
              brokerage = 0;
            }
          } else {
            // Per crore brokerage: ((orderprice + currentprice) * lotsize) * brokerage / 10000000
            // Brokerage is always based on trade value (lots), regardless of profit/loss
            if (orderPrice > 0 && currentPrice > 0 && lotSize > 0) {
              const tradePrice = (orderPrice + currentPrice) * lotSize;
              if (brokerageValue > 0) {
                brokerage = (tradePrice * brokerageValue) / 10000000;
              } else {
                // If brokerageValue is missing, use default per crore (e.g., 1000 per crore = 0.01%)
                console.warn('Brokerage value missing, using default per crore calculation');
                const defaultPerCroreBrokerage = 1000; // Default brokerage per crore
                brokerage = (tradePrice * defaultPerCroreBrokerage) / 10000000;
              }
            } else {
              console.error('Cannot calculate brokerage: missing required values:', {
                orderPrice,
                currentPrice,
                lotSize
              });
              brokerage = 0;
            }
          }
          
          // Ensure brokerage is never 0 - if still 0, use minimum lot-based calculation
          if (brokerage === 0 || brokerage < 0.01) {
            console.warn('Brokerage is 0 or too small, using minimum lot-based calculation');
            // Use minimum brokerage based on lots (minimum 1 lot = minimum brokerage)
            if (numberOfLots > 0) {
              brokerage = numberOfLots * 1; // Minimum 1 rupee per lot
            } else {
              brokerage = 1; // Absolute minimum
            }
          }
          
          console.log('Brokerage calculation for', symbolType, ':', {
            brokerageType,
            brokerageValue,
            numberOfLots,
            lotSize,
            orderPrice,
            currentPrice,
            calculatedBrokerage: brokerage
          });
        } catch (error) {
          console.error('Error calculating brokerage for', symbolType, ':', error);
          // Fallback: use lot-based calculation even if error occurs
          const numberOfLots = parseFloat(order.Lot || order.selectedlotsize || 1);
          if (numberOfLots > 0) {
            brokerage = numberOfLots * 20; // Default 20 per lot
          } else {
            brokerage = 20; // Absolute minimum
          }
        }
      }
      
      // Ensure brokerage is not negative and is a valid number
      brokerage = Math.abs(brokerage);
      if (isNaN(brokerage) || brokerage === null || brokerage === undefined) {
        console.error('Invalid brokerage value calculated:', brokerage);
        // Fallback: use lot-based calculation
        const numberOfLots = parseFloat(order.Lot || order.selectedlotsize || 1);
        if (numberOfLots > 0) {
          brokerage = numberOfLots * 20; // Default 20 per lot
        } else {
          brokerage = 20; // Absolute minimum
        }
      }
      
      // Final safeguard: Ensure brokerage is never 0 (always lot-based)
      if (brokerage === 0 || brokerage < 0.01) {
        console.warn('Brokerage is 0 or too small, applying lot-based fallback');
        // Always use lot-based calculation, never P/L-based
        const numberOfLots = parseFloat(order.Lot || order.selectedlotsize || 1);
        if (numberOfLots > 0) {
          brokerage = numberOfLots * 1; // Minimum 1 rupee per lot
        } else {
          brokerage = 1; // Absolute minimum
        }
      }
      
      // Validate that we have valid brokerage before sending
      if (brokerage === 0) {
        console.error('Brokerage is still 0 after all calculations. Order:', order);
        // Force minimum brokerage based on lots
        const numberOfLots = parseFloat(order.Lot || order.selectedlotsize || 1);
        brokerage = Math.max(numberOfLots * 1, 1);
      }
      
      // Validate currentPrice
      const currentPrice = parseFloat(order.currentPrice || 0);
      if (!currentPrice || currentPrice <= 0 || isNaN(currentPrice)) {
        console.error('Invalid current price:', order.currentPrice);
        toast.error('Cannot close trade: Invalid current price');
        return;
      }
      
      // Get current date for ClosedAt
      const datee = new Date();
      const finaldate = datee.getFullYear() + "-" + (datee.getMonth() + 1) + "-" + datee.getDate();
      
      console.log('Closing trade with values:', {
        orderNo,
        symbolType,
        pl: pl.toFixed(2),
        brokerage: brokerage.toFixed(2),
        currentPrice: currentPrice.toFixed(2),
        orderPrice: order.OrderPrice
      });
      
      // Always send INR values to backend (rupees)
      const result = await tradingAPI.updateOrder(
        pl.toFixed(2),              // lp (P/L in INR)
        brokerage.toFixed(2),       // brokerage (in INR)
        currentPrice.toFixed(2),     // BroughtBy (current price in INR)
        finaldate,                   // ClosedAt
        orderNo,                     // orderno
        user.UserId,                 // uid
        order.OrderCategory,         // ordertype
        order.TokenNo                // tokenno
      );
      
      if (result === 'true' || result === true) {
        toast.success("Trade Closed!");
        // Refresh data but skip WebSocket re-initialization
        await initializePortfolioData(true);
      } else {
        toast.error("Failed to close trade");
      }
    } catch (error) {
      console.error('Error closing trade:', error);
      toast.error('Failed to close trade');
    }
  };

  // Helper function to convert time to seconds
  const getTimeInSeconds = (timeStr) => {
    const parts = timeStr.split(':');
    return (+parts[0]) * 60 * 60 + (+parts[1]) * 60 + (+parts[2]);
  };

  // Handle SL/TP modal
  const handleSLTPClick = (order) => {
    setSelectedOrder(order);
    setSLValue(order.stopLossPrice || '');
    setTPValue(order.takeProfitPrice || '');
    setShowSLTPModal(true);
  };

  // Handle SL/TP submission
  const handleSLTPSubmit = async () => {
    if (!selectedOrder) return;
    
    try {
      const result = await tradingAPI.setSLTP(selectedOrder.Id, slValue, tpValue);
      toast.success('SL/TP set successfully');
      setShowSLTPModal(false);
      setSelectedOrder(null);
      setSLValue('');
      setTPValue('');
      
      // Refresh the portfolio data to show updated SL/TP values but skip WebSocket re-initialization
      await initializePortfolioData(true);
    } catch (error) {
      console.error('Error setting SL/TP:', error);
      toast.error('Failed to set SL/TP');
    }
  };

  // Close SL/TP modal
  const closeSLTPModal = () => {
    setShowSLTPModal(false);
    setSelectedOrder(null);
    setSLValue('');
    setTPValue('');
  };

  // Handle tab navigation
  const handleTabClick = (tabId) => {
    switch(tabId) {
      case 'dashboard':
        navigate('/dashboard');
        break;
      case 'orders':
        navigate('/orders');
        break;
      case 'portfolio':
        // Already on portfolio page
        break;
      case 'profile':
        navigate('/profile');
        break;
      default:
        break;
    }
  };

  // Render empty state
  const renderEmptyState = () => (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      {/* Briefcase Illustration */}
      <div className="relative mb-8">
        <div className="w-32 h-24 bg-gray-300 rounded-lg relative">
          {/* Briefcase body */}
          <div className="absolute top-2 left-2 right-2 bottom-2 bg-gray-200 rounded-md"></div>
          {/* Handle */}
          <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-8 h-2 bg-gray-400 rounded-full"></div>
          
          {/* Documents */}
          <div className="absolute top-3 left-3 right-3 bottom-3">
            {/* Main document */}
            <div className="absolute top-0 left-0 w-16 h-12 bg-gray-100 rounded-sm transform rotate-3">
              <div className="absolute top-1 left-1 right-1 h-0.5 bg-gray-300"></div>
              <div className="absolute top-2 left-1 right-1 h-0.5 bg-gray-300"></div>
              <div className="absolute top-3 left-1 right-1 h-0.5 bg-gray-300"></div>
              <div className="absolute bottom-1 right-1 w-4 h-1 bg-blue-500 rounded-sm"></div>
              <div className="absolute top-1 right-1 w-2 h-1 bg-red-500 rounded-sm"></div>
            </div>
            
            {/* Small document */}
            <div className="absolute bottom-2 right-2 w-8 h-6 bg-gray-100 rounded-sm">
              <div className="absolute top-0.5 left-0.5 right-0.5 h-0.5 bg-gray-300"></div>
              <div className="absolute top-1 left-0.5 right-0.5 h-0.5 bg-gray-300"></div>
              <div className="absolute bottom-0.5 right-0.5 w-2 h-0.5 bg-blue-500 rounded-sm"></div>
            </div>
            
            {/* Small colored shapes */}
            <div className="absolute top-1 right-1 w-1 h-1 bg-yellow-400 transform rotate-45"></div>
            <div className="absolute bottom-1 left-1 w-1 h-1 bg-red-500 transform rotate-45"></div>
            <div className="absolute top-2 right-2 w-1 h-1 bg-blue-500 transform rotate-45"></div>
          </div>
        </div>
      </div>
      
      <h3 className="text-xl font-bold text-white mb-2">No holdings</h3>
      <p className="text-gray-400 text-center">Buy equities from your watchlist</p>
    </div>
  );

  // Render active orders
  const renderActiveOrders = () => {
    if (activeOrders.length === 0) {
      return renderEmptyState();
    }
    
    return (
      <div className="space-y-3">
        {activeOrders.map((order, index) => (
          <div key={index} className="bg-app-surface rounded-xl p-4 border border-app-border shadow-app-card">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h4 className="text-app-text-primary font-semibold">{order.scriptName}</h4>
                <p className="text-app-text-secondary text-sm">{order.exchange}</p>
                {order.isStopLossOrder && (
                  <p className="text-orange-400 text-xs font-medium">Stop Loss Order</p>
                )}
              </div>
              <div className="text-right">
                <div className={`font-semibold ${order.OrderCategory === 'SELL' ? 'text-app-red' : 'text-app-green'}`}>
                  {order.orderCategoryDisplay} {(() => {
                    // If Lot is "0", 0, or missing, display selectedlotsize instead
                    const lotValue = order.Lot === "0" || order.Lot === 0 || !order.Lot ? order.selectedlotsize : order.Lot;
                    return lotValue || order.selectedlotsize || '0';
                  })()} @ {order.isFX ? '' : '₹'}{order.isFX ? (order.orderPriceUSD ? parseFloat(order.orderPriceUSD).toFixed(5) : '0.00000') : (order.OrderPrice ? parseFloat(order.OrderPrice).toFixed(2) : '0.00')}
                </div>
                <div className={`text-sm font-medium trading-price ${
                  order.awaitingFxRate ? 'text-app-text-secondary' : (order.profitLoss || 0) >= 0 ? 'text-app-green' : 'text-app-red'
                }`}>
                  {order.awaitingFxRate
                    ? 'Updating...'
                    : `${order.profitLoss >= 0 ? '+' : ''}₹${order.profitLoss?.toFixed(2) || '0.00'}`
                  }
                </div>
              </div>
            </div>
            
            {/* SL/TP Information */}
            {(order.stopLossPrice || order.takeProfitPrice) && (
              <div className="mb-2 p-2 bg-app-bg rounded text-xs">
                {order.stopLossPrice && (
                  <div className="text-app-red">
                    SL: <span className="text-app-text-primary font-medium">{order.stopLossPrice}</span>
                  </div>
                )}
                {order.takeProfitPrice && (
                  <div className="text-app-green">
                    TP: <span className="text-app-text-primary font-medium">{order.takeProfitPrice}</span>
                  </div>
                )}
              </div>
            )}
            
            <div className="flex justify-between items-center">
              <div className="text-sm text-app-text-secondary">
                CMP: <span className="text-app-text-primary font-medium trading-price">
                  {order.awaitingFxRate && order.isFX
                    ? 'Updating...'
                    : (
                      order.isFX
                        ? (order.currentPriceUSD ? parseFloat(order.currentPriceUSD).toFixed(5) : '0.00000')
                        : `₹${order.currentPrice ? parseFloat(order.currentPrice).toFixed(2) : '0.00'}`
                    )
                  }
                </span>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleSLTPClick(order)}
                  className="bg-app-blue hover:bg-app-blue-hover text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                >
                  SL/TP
                </button>
                <button
                  onClick={() => closeTrade(order)}
                  className="bg-app-red hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };


  if (loading) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-white">Loading portfolio...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-app-bg flex flex-col">
      <div className="text-center mt-3 mb-1 text-app-blue text-md font-semibold"> Active positions</div>
      {/* Top Navigation */}
      <div className="flex-shrink-0 pt-3 bg-app-bg">
      </div>

      {/* Balance Summary */}
      <div className="flex-shrink-0 bg-app-surface rounded-t-2xl border-b border-app-border px-4 py-4">
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-app-text-secondary text-md mb-1">Balance</p>
            <p className="text-app-text-primary font-bold text-xs trading-price">{balanceData.ledgerBalance.toLocaleString()}</p>
          </div>
          <div className="text-center">
            <p className="text-app-text-secondary text-md mb-1">Margin</p>
            <p className="text-app-text-primary font-bold text-xs trading-price">{Math.round(balanceData.marginAvailable).toLocaleString()}</p>
          </div>
          <div className="text-center">
            <p className="text-app-text-secondary text-md mb-1">P/L</p>
            <p className={`font-bold text-xs trading-price ${balanceData.activePL >= 0 ? 'text-app-green' : 'text-app-red'}`}>
              {balanceData.activePL >= 0 ? '+' : ''}{balanceData.activePL.toFixed(2)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-app-text-secondary text-md mb-1">M2M</p>
            <p className="text-app-text-primary font-bold text-xs trading-price">{Math.round(balanceData.m2m).toLocaleString()}</p>
          </div>
        </div>
      </div>



      {/* Content Area */}
      <div className="flex-1 bg-app-bg overflow-y-auto px-2 py-2 pb-24">
        {renderActiveOrders()}
      </div>

      {/* Bottom Navigation - Glassmorphism */}
      <div className="fixed bottom-0 left-0 right-0 z-50" style={{
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}>
        <div className="bg-app-surface/80 border-t border-app-border/50 px-2 py-3" style={{
          boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        }}>
          <div className="flex justify-around items-center">
            {bottomNavItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleTabClick(item.id)}
                className={`flex flex-col items-center py-2 px-4 rounded-xl transition-all duration-200 ${
                  item.id === 'portfolio' ? 'bg-app-blue/10' : ''
                }`}
                style={{
                  transform: item.id === 'portfolio' ? 'translateY(-2px)' : 'translateY(0)',
                }}
              >
                <item.icon 
                  className={`w-7 h-7 mb-1 transition-colors ${
                    item.id === 'portfolio' ? 'text-app-blue' : 'text-app-text-tertiary'
                  }`}
                />
                <span className={`text-xs font-medium transition-colors ${
                  item.id === 'portfolio' ? 'text-app-blue' : 'text-app-text-tertiary'
                }`}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SL/TP Modal */}
      {showSLTPModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-app-surface rounded-xl p-6 w-80 max-w-sm mx-4 border border-app-border shadow-app-card">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-app-text-primary font-bold text-lg">Set SL/TP</h3>
              <button
                onClick={closeSLTPModal}
                className="text-app-text-secondary hover:text-app-text-primary transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-app-text-primary text-sm mb-2">
                {selectedOrder.scriptName} - {selectedOrder.orderCategoryDisplay}
              </p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-app-text-primary text-sm font-medium mb-1">
                  Stop Loss (SL)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={slValue}
                  onChange={(e) => setSLValue(e.target.value)}
                  placeholder="Enter SL price"
                  className="w-full px-3 py-2 bg-app-bg border border-app-border rounded-lg text-app-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-app-blue"
                />
              </div>
              
              <div>
                <label className="block text-app-text-primary text-sm font-medium mb-1">
                  Take Profit (TP)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={tpValue}
                  onChange={(e) => setTPValue(e.target.value)}
                  placeholder="Enter TP price"
                  className="w-full px-3 py-2 bg-app-bg border border-app-border rounded-lg text-app-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-app-blue"
                />
              </div>
            </div>
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={closeSLTPModal}
                className="flex-1 bg-app-bg hover:bg-app-border text-app-text-primary py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSLTPSubmit}
                className="flex-1 bg-app-blue hover:bg-app-blue-hover text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                Set SL/TP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Portfolio;