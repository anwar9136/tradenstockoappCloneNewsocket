import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import { useNavigate } from 'react-router-dom';
import { FileText, Clock, CheckCircle, XCircle, TrendingUp, TrendingDown, Home, Briefcase, User } from 'lucide-react';
import { tradingAPI } from '../services/api';
import toast from 'react-hot-toast';
import { useWebSocket } from '../hooks/useWebSocket';
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

const Orders = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');
  
  // WebSocket references
  const tokensRef = useRef(null);
  const fxSymbolsRef = useRef([]);
  const mountedRef = useRef(true);
  const activeTabRef = useRef(activeTab); // Keep ref for stable callbacks
  const [usdToInrRate, setUsdToInrRate] = useState(() => {
    const cachedRate = getCachedExchangeRate();
    return cachedRate ?? 88.65;
  }); // Default fallback rate
  const [hasReliableFxRate, setHasReliableFxRate] = useState(() => !!getCachedExchangeRate());
  const exchangeRateIntervalRef = useRef(null);
  const ordersStateRef = useRef([]); // Keep reference to current orders for preserving WebSocket updates
  const fxUpdateQueueRef = useRef(new Map());
  const fxUpdateTimeoutRef = useRef(null);

  const tabs = [
    { id: 'pending', label: 'Pending' },
    { id: 'active', label: 'Active' },
    { id: 'closed', label: 'Closed' },
    { id: 'sltp', label: 'SL/TP' }
  ];

  const bottomNavItems = [
    { id: 'home', icon: Home, label: 'Home' },
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
    }
    return null;
  }, []);

  // Update activeTab ref when it changes
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // Handle WebSocket messages for MCX/NSE
  const handleWebSocketMessage = useCallback((data) => {
    if (activeTabRef.current !== 'active') return;
    if (!data?.instrument_token) return;
    
    const tokenToFind = data.instrument_token.toString();
    
    setOrders(prevOrders => {
      let hasChanges = false;
      const updatedOrders = prevOrders.map(order => {
        // Only update active orders and non-FX orders
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
      
      ordersStateRef.current = updatedOrders;
      return updatedOrders;
    });
  }, []); // Remove activeTab dependency, use ref instead

  // Process queued FX updates (throttled)
  const processFXUpdates = useCallback(() => {
    if (activeTabRef.current !== 'active') {
      fxUpdateQueueRef.current.clear();
      if (fxUpdateTimeoutRef.current) {
        clearTimeout(fxUpdateTimeoutRef.current);
        fxUpdateTimeoutRef.current = null;
      }
      return;
    }

    if (!hasReliableFxRate || usdToInrRate <= 0) {
      fxUpdateTimeoutRef.current = null;
      return;
    }

    if (fxUpdateQueueRef.current.size === 0) {
      fxUpdateTimeoutRef.current = null;
      return;
    }

    const latestUpdates = new Map(fxUpdateQueueRef.current);
    fxUpdateQueueRef.current.clear();

    setOrders(prevOrders => {
      let hasChanges = false;
      const updatedOrders = prevOrders.map(order => {
        if (!order.isFX) return order;

        const symbolName = order.scriptName || order.ScriptName?.split('_')[0];
        const update = latestUpdates.get(symbolName) || latestUpdates.get(order.ScriptName);
        if (!update) return order;

        const { bestBidPriceUSD, bestAskPriceUSD } = update;
        if (bestBidPriceUSD <= 0 && bestAskPriceUSD <= 0) return order;

        const conversionRate = usdToInrRate;
        const actualLotSize = parseFloat(order.actualLot || order.Lotsize || order.selectedlotsize || 1);
        const lotValue = order.Lot === "0" || order.Lot === 0 || !order.Lot ? order.selectedlotsize : order.Lot;
        const numberOfLots = parseFloat(lotValue || order.selectedlotsize || 1);
        const lotSize = actualLotSize * numberOfLots;

        let currentPrice = 0;
        let profitLoss = 0;
        let currentPriceUSD = 0;
        let profitLossUSD = 0;

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

        const priceDiff = Math.abs((order.currentPrice || 0) - newCurrentPrice);
        const plDiff = Math.abs((order.profitLoss || 0) - newProfitLoss);
        const priceUSDDiff = Math.abs((order.currentPriceUSD || 0) - newCurrentPriceUSD);
        const plUSDDiff = Math.abs((order.profitLossUSD || 0) - newProfitLossUSD);

        const minPriceChange = 0.0001;
        const minPLChange = 0.01;

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

      if (!hasChanges) return prevOrders;

      ordersStateRef.current = updatedOrders;
      return updatedOrders;
    });

    fxUpdateTimeoutRef.current = null;
  }, [usdToInrRate, hasReliableFxRate]); // Remove activeTab dependency
  // Handle WebSocket messages for FX (FOREX/CRYPTO/COMMODITY)
  const handleFXWebSocketMessage = useCallback((tickData) => {
    if (activeTabRef.current !== 'active') return;
    if (!tickData?.type || tickData.type !== 'tick' || !tickData.data) return;

    const { Symbol, BestBid, BestAsk } = tickData.data;
    if (!Symbol) return;

    const bestBidPriceUSD = BestBid?.Price || 0;
    const bestAskPriceUSD = BestAsk?.Price || 0;
    if (bestBidPriceUSD <= 0 && bestAskPriceUSD <= 0) return;

    fxUpdateQueueRef.current.set(Symbol, {
      bestBidPriceUSD,
      bestAskPriceUSD
    });

    if (!fxUpdateTimeoutRef.current) {
      fxUpdateTimeoutRef.current = setTimeout(() => {
        processFXUpdates();
      }, 150);
    }
  }, [processFXUpdates]); // Remove activeTab dependency

  useEffect(() => {
    if (hasReliableFxRate && fxUpdateQueueRef.current.size > 0 && !fxUpdateTimeoutRef.current) {
      fxUpdateTimeoutRef.current = setTimeout(() => {
        processFXUpdates();
      }, 0);
    }
  }, [hasReliableFxRate, processFXUpdates]);

  // Get tokens from active orders for MCX/NSE WebSocket
  const getMCXTokens = useCallback(() => {
    if (activeTab !== 'active') return [];
    
    const activeOrdersList = orders.filter(order => 
      (order.OrderStatus === 'Active' || !order.OrderStatus) && !order.isFX && order.TokenNo
    );
    
    return activeOrdersList.map(order => order.TokenNo.toString());
  }, [orders, activeTab]);

  // Check if there are FX orders
  const hasFXOrders = useCallback(() => {
    if (activeTab !== 'active') return false;
    return orders.some(order => 
      (order.OrderStatus === 'Active' || !order.OrderStatus) && order.isFX
    );
  }, [orders, activeTab]);

  // Use shared WebSocket service for MCX/NSE (only when active tab)
  const mcxTokens = getMCXTokens();
  
  const { isConnected: wsConnected } = useWebSocket(
    activeTab === 'active' ? mcxTokens : [],
    handleWebSocketMessage,
    false // Not FX
  );

  // Use shared WebSocket service for FX (only when active tab and has FX orders)
  const hasFX = hasFXOrders();
  
  const { isConnected: fxWsConnected } = useWebSocket(
    [], // FX doesn't need tokens
    handleFXWebSocketMessage,
    activeTab === 'active' && hasFX // Only subscribe if active tab and has FX orders
  );

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true; // Ensure mounted is true when effect runs
    // Fetch exchange rate on mount and set up periodic updates (every 5 minutes)
    fetchExchangeRate();
    exchangeRateIntervalRef.current = setInterval(() => {
      if (mountedRef.current) {
        fetchExchangeRate();
      }
    }, 5 * 60 * 1000); // Update every 5 minutes
    
    return () => {
      mountedRef.current = false;
      if (exchangeRateIntervalRef.current) {
        clearInterval(exchangeRateIntervalRef.current);
      }
      if (fxUpdateTimeoutRef.current) {
        clearTimeout(fxUpdateTimeoutRef.current);
        fxUpdateTimeoutRef.current = null;
      }
      // WebSocket cleanup is handled by the shared service
    };
  }, [fetchExchangeRate]);

  useEffect(() => {
    if (user?.UserId) {
      fetchOrders();
    }
  }, [user]);

  useEffect(() => {
    if (user?.UserId && activeTab) {
      fetchOrdersByStatus();
    }
  }, [activeTab, user?.UserId]);

  // Ensure WebSocket connects immediately when active tab has orders
  useEffect(() => {
    if (activeTab === 'active' && orders.length > 0 && !loading) {
      const mcxTokens = getMCXTokens();
      if (mcxTokens.length > 0) {
        const tokensString = mcxTokens.join(',');
        // Ensure WebSocket is connected and subscribed
        setTimeout(() => {
          webSocketService.subscribeToTokens(tokensString);
        }, 100);
      }
    }
  }, [activeTab, orders.length, loading, getMCXTokens]);

  const fetchOrdersByStatus = async () => {
    // Don't block UI - set loading false quickly for better UX
    setLoading(true);
    try {
      let response;
      
      if (activeTab === 'sltp') {
        // Get SL/TP orders
        response = await tradingAPI.getSLTP(user.UserId);
      } else if (activeTab === 'active') {
        // Use same API as Portfolio for active orders
        response = await tradingAPI.getConsolidatedTrades(user.UserId);
      } else {
        // Get orders by status (Pending or Closed)
        response = await tradingAPI.getOrders(activeTab.charAt(0).toUpperCase() + activeTab.slice(1), user.UserId);
      }
      
      // Parse response if it's a string
      let data = typeof response === 'string' ? JSON.parse(response) : response;
      
      // For active orders, use Portfolio's exact processing logic
      if (activeTab === 'active' && data.length > 0) {
        let rateForFetch = hasReliableFxRate ? usdToInrRate : null;
        if (!hasReliableFxRate) {
          const fetchedRate = await fetchExchangeRate();
          if (fetchedRate && fetchedRate > 0) {
            rateForFetch = fetchedRate;
          }
        } else {
          fetchExchangeRate();
        }

        const effectiveRate = typeof rateForFetch === 'number' && rateForFetch > 0
          ? rateForFetch
          : (hasReliableFxRate ? usdToInrRate : null);
        const fxRateAvailable = effectiveRate !== null && effectiveRate > 0;

        let tokens = '';
        const fxSymbols = [];
        
        // Preserve existing WebSocket updates from current orders state
        const existingOrdersMap = new Map();
        ordersStateRef.current.forEach(order => {
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
          const actualLotSize = parseFloat(item.actualLot || item.Lotsize || item.selectedlotsize || 1);
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
                // Convert USD prices to INR
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
            // If no cached data, use cmp from API (but only if > 0)
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
            orderPriceUSD: isFX ? parseFloat((orderPriceUSD || 0).toFixed(5)) : 0,
            currentPriceUSD: isFX ? parseFloat((currentPriceUSD || 0).toFixed(5)) : 0,
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
        
        tokensRef.current = tokens.slice(0, -1);
        fxSymbolsRef.current = fxSymbols;
        ordersStateRef.current = orders; // Update ref
        setOrders(orders);
        
        // Immediately subscribe to tokens if WebSocket is ready (don't wait for hook)
        if (activeTab === 'active' && tokensRef.current) {
          // Force WebSocket subscription immediately
          setTimeout(() => {
            if (tokensRef.current) {
              webSocketService.subscribeToTokens(tokensRef.current);
            }
          }, 100); // Small delay to ensure WebSocket is ready
        }
      } else {
        const enhancedData = Array.isArray(data) ? data.map(item => {
          const symbolType = item.SymbolType || item.symbolType || '';
          const isFX = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(symbolType);
          let orderPriceUSD = typeof item.orderPriceUSD === 'number' ? item.orderPriceUSD : parseFloat(item.orderPriceUSD || 0);
          if (isFX && (!orderPriceUSD || orderPriceUSD === 0)) {
            const conversionRate = usdToInrRate || 1;
            orderPriceUSD = conversionRate > 0 ? parseFloat(item.OrderPrice || 0) / conversionRate : 0;
          }
          return {
            ...item,
            isFX,
            orderPriceUSD: isFX ? parseFloat((orderPriceUSD || 0).toFixed(5)) : orderPriceUSD
          };
        }) : data;

        ordersStateRef.current = enhancedData; // Update ref
        setOrders(enhancedData);
      }
      
      // Ensure WebSocket subscriptions are active after orders load
      if (activeTab === 'active') {
        // Subscribe to MCX tokens immediately
        if (tokensRef.current) {
          setTimeout(() => {
            webSocketService.subscribeToTokens(tokensRef.current);
          }, 50);
        }
        
        // FX WebSocket is handled by useWebSocket hook automatically
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to fetch orders');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    // This is called on initial load - fetch active orders by default
    setActiveTab('active');
  };

  const getStatusIcon = (status) => {
    if (!status) {
      return <CheckCircle className="w-4 h-4 text-green-500" />; // Default to active icon
    }
    switch (status.toLowerCase()) {
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'active':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'closed':
        return <XCircle className="w-4 h-4 text-gray-500" />;
      default:
        return <FileText className="w-4 h-4 text-blue-500" />;
    }
  };

  const getActionIcon = (action) => {
    if (!action) {
      return <TrendingUp className="w-4 h-4 text-green-500" />; // Default to buy icon
    }
    return action.toLowerCase() === 'buy' ? 
      <TrendingUp className="w-4 h-4 text-green-500" /> : 
      <TrendingDown className="w-4 h-4 text-red-500" />;
  };

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
  };

  const handleNavClick = (navId) => {
    switch(navId) {
      case 'home':
        navigate('/dashboard');
        break;
      case 'orders':
        // Already on orders page
        break;
      case 'portfolio':
        navigate('/portfolio');
        break;
      case 'profile':
        navigate('/profile');
        break;
      default:
        break;
    }
  };

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {/* Fixed Header */}
      <div className="flex-shrink-0 bg-gray-800 border-b border-gray-700">
        <div className="px-2 py-2">
          <h1 className="text-md font-bold text-white">Orders</h1>
        </div>
      </div>

      {/* Fixed Tabs */}
      <div className="flex-shrink-0 flex bg-gray-800 border-b border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 px-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-white bg-gray-700 border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-300 hover:bg-gray-750'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Scrollable Orders List */}
      <div className="flex-1 overflow-y-auto px-2 py-4 pb-24">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        ) : orders.length > 0 ? (
          <div className="space-y-4">
            {orders.map((order, index) => {
              // Handle SL/TP orders differently
              if (activeTab === 'sltp') {
                const scriptParts = order.ScriptName?.split('_') || [order.ScriptName, ''];
                return (
                  <div key={index} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center space-x-2">
                        <div>
                          <h3 className="font-semibold text-white">{scriptParts[0]}</h3>
                          <p className="text-sm text-gray-400">{scriptParts[1]}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium px-2 py-1 rounded-full bg-green-900 text-green-300">
                          {order.OrderCategory}
                        </span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-400">Stop Loss</p>
                        <p className="font-medium text-red-400">₹{order.SL}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Take Profit</p>
                        <p className="font-medium text-green-400">₹{order.TP}</p>
                      </div>
                    </div>
                    
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-400">{order.DateTime}</span>
                        <span className="text-green-400 px-2 py-1 rounded bg-green-900">
                          {order.Status}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }
              
              // Regular orders display
              const scriptParts = order.ScriptName?.split('_') || [order.ScriptName, ''];
              const fxSymbolTypes = ['CRYPTO', 'FOREX', 'COMMODITY'];
              const isFxOrder = order.isFX ?? fxSymbolTypes.includes(order.SymbolType);
              const orderPriceDisplay = (() => {
                if (activeTab === 'closed' && isFxOrder) {
                  const fxPrice = typeof order.orderPriceUSD === 'number' && order.orderPriceUSD !== 0
                    ? order.orderPriceUSD
                    : (usdToInrRate > 0 ? parseFloat(order.OrderPrice || 0) / usdToInrRate : 0);
                  return `$${(fxPrice || 0).toFixed(5)}`;
                }
                if (isFxOrder) {
                  return order.orderPriceUSD ? parseFloat(order.orderPriceUSD).toFixed(5) : '0.00000';
                }
                return `₹${order.OrderPrice ? parseFloat(order.OrderPrice).toFixed(2) : '0.00'}`;
              })();
              const currentPriceDisplay = (() => {
                if (activeTab === 'active' && order.awaitingFxRate && isFxOrder) {
                  return 'Updating...';
                }
                if (isFxOrder) {
                  return order.currentPriceUSD ? parseFloat(order.currentPriceUSD).toFixed(5) : '0.00000';
                }
                return `₹${order.currentPrice ? parseFloat(order.currentPrice).toFixed(2) : '0.00'}`;
              })();
              const profitLossDisplay = (() => {
                if (activeTab === 'active' && order.awaitingFxRate && isFxOrder) {
                  return 'Updating...';
                }
                return `${order.profitLoss >= 0 ? '+' : ''}₹${order.profitLoss?.toFixed(2) || '0.00'}`;
              })();
              const closedPLValue = parseFloat(order?.P_L ?? order?.profitLoss ?? 0);
              const closedPLDisplay = Number.isNaN(closedPLValue) ? '0.00' : closedPLValue.toFixed(2);
              return (
                <div key={index} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center space-x-2">
                      {getActionIcon(order.OrderCategory)}
                      <div>
                        <h3 className="font-semibold text-white flex items-center gap-2">
                          <span>{scriptParts[0]}</span>
                          {activeTab === 'closed' && (
                            <span className={`text-xs font-semibold ${closedPLValue >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {closedPLValue >= 0 ? '+' : ''}₹{closedPLDisplay}
                            </span>
                          )}
                        </h3>
                        <p className="text-sm text-gray-400">{scriptParts[1] || order.ActionType}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(order.OrderStatus || 'Active')}
                      <span className={`text-sm font-medium px-2 py-1 rounded-full ${
                        (order.OrderStatus || 'Active')?.toLowerCase() === 'pending' ? 'bg-yellow-900 text-yellow-300' :
                        (order.OrderStatus || 'Active')?.toLowerCase() === 'active' ? 'bg-green-900 text-green-300' :
                        'bg-gray-700 text-gray-300'
                      }`}>
                        {order.OrderStatus || 'Active'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-400">Order Type</p>
                      <p className="font-medium text-white">{order.OrderType}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Lot Size</p>
                      <p className="font-medium text-white">
                        {(() => {
                          // If Lot is "0", 0, or missing, display selectedlotsize instead
                          const lotValue = order.Lot === "0" || order.Lot === 0 || !order.Lot ? order.selectedlotsize : order.Lot;
                          return lotValue || order.selectedlotsize || '0';
                        })()}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">Order Price</p>
                      <p className="font-medium text-white">{orderPriceDisplay}</p>
                    </div>
                    {activeTab === 'active' && order.currentPrice !== undefined && (
                      <div>
                        <p className="text-gray-400">Current Price</p>
                        <p className={`font-medium ${order.awaitingFxRate && isFxOrder ? 'text-gray-400' : 'text-white'}`}>
                          {currentPriceDisplay}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-gray-400">Margin Used</p>
                      <p className="font-medium text-white">
                        ₹{order.MarginUsed ? parseFloat(order.MarginUsed).toFixed(2) : '0.00'}
                      </p>
                    </div>
                    {activeTab === 'active' && order.profitLoss !== undefined && (
                      <div>
                        <p className="text-gray-400">Profit/Loss</p>
                        <p className={`font-medium ${
                          order.awaitingFxRate && isFxOrder
                            ? 'text-gray-400'
                            : (order.profitLoss || 0) >= 0
                              ? 'text-green-500'
                              : 'text-red-500'
                        }`}>
                          {profitLossDisplay}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-400">
                        {order.OrderDate} at {order.OrderTime}
                      </span>
                      <span className="text-gray-400">Order ID: {order.Id}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">No orders found</p>
          </div>
        )}
      </div>

      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 px-1 py-2">
        <div className="flex justify-around items-center">
          {bottomNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className="flex flex-col items-center py-2"
            >
              <item.icon 
                className={`w-6 h-6 mb-1 ${
                  item.id === 'orders' ? 'text-blue-500' : 'text-gray-400'
                }`} 
              />
              <span className={`text-xs font-medium ${
                item.id === 'orders' ? 'text-blue-500' : 'text-gray-400'
              }`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Orders;
