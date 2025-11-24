import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, TrendingUp, ArrowLeft, X, Check, TrendingDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { tradingAPI } from '../services/api';
import OrderModal from '../components/OrderModal';
import { useAuth } from '../hooks/useAuth.jsx';
import { useWebSocket } from '../hooks/useWebSocket';

const MarketWatch = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Build tabs dynamically based on localStorage values
  // Define this function BEFORE useState hooks that use it
  const buildTabs = () => {
    const tabs = [];
    
    // Check localStorage for trading permissions
    const isMCXTrade = localStorage.getItem('IsMCXTrade') === 'true';
    const isNSETrade = localStorage.getItem('IsNSETrade') === 'true';
    const isCDSTrade = localStorage.getItem('IsCDSTrade') === 'true';
    const tradeInCrypto = localStorage.getItem('Trade_in_crypto') === 'true';
    const tradeInForex = localStorage.getItem('Trade_in_forex') === 'true';
    const tradeInCommodity = localStorage.getItem('Trade_in_commodity') === 'true';
    
    // Add MCX tab if enabled
    if (isMCXTrade) {
      tabs.push({ id: 'MCX', label: 'MCX Futures' });
    }
    
    // Add NSE tab if enabled
    if (isNSETrade) {
      tabs.push({ id: 'NSE', label: 'NSE Futures' });
    }
    
    // Add OPT (CDS) tab if enabled
    if (isCDSTrade) {
      tabs.push({ id: 'OPT', label: 'OPTION' });
    }
    
    // Add Crypto tab if enabled
    if (tradeInCrypto) {
      tabs.push({ id: 'CRYPTO', label: 'Crypto' });
    }
    
    // Add Forex tab if enabled
    if (tradeInForex) {
      tabs.push({ id: 'FOREX', label: 'Forex' });
    }
    
    // Add Commodity tab if enabled
    if (tradeInCommodity) {
      tabs.push({ id: 'COMMODITY', label: 'Commodity' });
    }
    
    return tabs;
  };
  
  // Initialize activeTab based on available tabs
  const [activeTab, setActiveTab] = useState(() => {
    const tabs = buildTabs();
    return tabs.length > 0 ? tabs[0].id : 'MCX';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const [marketData, setMarketData] = useState({});
  const [loading, setLoading] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [selectedTokens, setSelectedTokens] = useState(new Set());
  const [usdToInrRate, setUsdToInrRate] = useState(88.65); // Default fallback rate
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  
  const mountedRef = useRef(true);
  const updateCountRef = useRef(0);
  const searchTimeoutRef = useRef(null);
  const exchangeRateIntervalRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const tabsContainerRef = useRef(null);
  const tabRefs = useRef({});
  
  const [tabs, setTabs] = useState(() => buildTabs());
  
  // Function to update tabs based on current localStorage values
  const updateTabs = useCallback(() => {
    const newTabs = buildTabs();
    setTabs(newTabs);
    
    // If current activeTab is not in the new tabs, switch to first available tab
    if (newTabs.length > 0 && !newTabs.find(tab => tab.id === activeTab)) {
      setActiveTab(newTabs[0].id);
    }
  }, [activeTab]);
  
  // Update tabs when user object changes (happens after refresh)
  useEffect(() => {
    updateTabs();
  }, [user, updateTabs]);
  
  // Listen for custom event when user data is refreshed
  useEffect(() => {
    const handleUserDataRefreshed = () => {
      // Rebuild tabs when user data is refreshed
      updateTabs();
    };
    
    window.addEventListener('userDataRefreshed', handleUserDataRefreshed);
    
    // Also check periodically (every 10 seconds) to catch localStorage changes
    const intervalId = setInterval(() => {
      const newTabs = buildTabs();
      const currentTabsString = JSON.stringify(tabs.map(t => t.id).sort());
      const newTabsString = JSON.stringify(newTabs.map(t => t.id).sort());
      
      if (currentTabsString !== newTabsString) {
        updateTabs();
      }
    }, 10000); // Reduced from 2000ms to 10000ms (10 seconds)
    
    return () => {
      window.removeEventListener('userDataRefreshed', handleUserDataRefreshed);
      clearInterval(intervalId);
    };
  }, [tabs, updateTabs]);
  
  // Fetch USD to INR exchange rate
  const fetchExchangeRate = useCallback(async () => {
    try {
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const data = await response.json();
      if (data.rates && data.rates.INR) {
        setUsdToInrRate(data.rates.INR);
        console.log('USD to INR rate updated:', data.rates.INR);
      }
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
      // Keep using the previous rate or default
    }
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
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (exchangeRateIntervalRef.current) {
        clearInterval(exchangeRateIntervalRef.current);
      }
      // WebSocket cleanup is handled by the shared service
    };
  }, [fetchExchangeRate]);

  // Update market data with live prices for MCX/NSE (original format)
  const updateMarketData = useCallback((result) => {
    if (!result || !result.instrument_token) {
      return;
    }

    const tokenToFind = result.instrument_token.toString();
    
    setMarketData(prev => {
      const newData = { ...prev };
      let updated = false;
      
      // Handle zero values like the original code
      const bid = result.bid === "0" || result.bid === 0 ? result.last_price : result.bid;
      const ask = result.ask === "0" || result.ask === 0 ? result.last_price : result.ask;
      const newBuy = parseFloat(ask) || 0;
      const newSell = parseFloat(bid) || 0;
      const newLtp = parseFloat(result.last_price) || 0;
      
      // Search through all tabs to find matching token
      Object.keys(newData).forEach(tabKey => {
        if (newData[tabKey] && Array.isArray(newData[tabKey])) {
          newData[tabKey] = newData[tabKey].map(token => {
            // Match by SymbolToken (convert both to string for comparison)
            if (token.SymbolToken?.toString() === tokenToFind) {
              // Only update if values actually changed
              if (token.buy !== newBuy || token.sell !== newSell || token.ltp !== newLtp) {
                updated = true;
                updateCountRef.current++;
                
                return {
                  ...token,
                  buy: newBuy,
                  sell: newSell,
                  ltp: newLtp,
                  chg: parseFloat(result.change) || 0,
                  high: parseFloat(result.high_) || 0,
                  low: parseFloat(result.low_) || 0,
                  open: parseFloat(result.open_) || token.open || 0,
                  close: parseFloat(result.close_) || token.close || 0, // Preserve close price
                  oi: result.oi || 0,
                  volume: result.volume || 0,
                  prevBuy: token.buy || newBuy,
                  prevSell: token.sell || newSell,
                  prevLtp: token.ltp || newLtp,
                  lastUpdate: Date.now()
                };
              }
            }
            return token;
          });
        }
      });
      
      if (updated) {
        setLastUpdate(Date.now());
        return newData;
      }
      
      return prev; // Prevent unnecessary re-render
    });
  }, []);

  // Update market data for FX WebSocket (Crypto/Forex/Commodity tick format)
  const updateFXMarketData = useCallback((tickData) => {
    if (!tickData || !tickData.type || tickData.type !== 'tick' || !tickData.data) {
      return;
    }

    const { Symbol, BestBid, BestAsk, Bids, Asks } = tickData.data;
    
    if (!Symbol) return;

    // Get USD prices from tick data
    const bestBidPriceUSD = BestBid?.Price || 0;
    const bestAskPriceUSD = BestAsk?.Price || 0;
    
    // Convert USD prices to INR using real-time exchange rate
    const bestBidPrice = bestBidPriceUSD * usdToInrRate;
    const bestAskPrice = bestAskPriceUSD * usdToInrRate;
    
    // Calculate High (max ask price) and Low (min bid price) in USD, then convert to INR
    const highUSD = Asks && Asks.length > 0 
      ? Math.max(...Asks.map(ask => ask.Price || 0))
      : bestAskPriceUSD;
    
    const lowUSD = Bids && Bids.length > 0
      ? Math.min(...Bids.map(bid => bid.Price || 0))
      : bestBidPriceUSD;

    // Convert High and Low to INR
    const high = highUSD * usdToInrRate;
    const low = lowUSD * usdToInrRate;

    // Calculate total volumes (volumes don't need conversion)
    const totalBidVolume = Bids ? Bids.reduce((sum, bid) => sum + (bid.Volume || 0), 0) : 0;
    const totalAskVolume = Asks ? Asks.reduce((sum, ask) => sum + (ask.Volume || 0), 0) : 0;

    // Calculate LTP (Last Traded Price) in INR - midpoint of best bid/ask
    const ltp = bestBidPrice && bestAskPrice ? (bestBidPrice + bestAskPrice) / 2 : (bestBidPrice || bestAskPrice || 0);
    
    setMarketData(prev => {
      const newData = { ...prev };
      let updated = false;
      
      // Search through current tab's tokens to find matching symbol
      if (newData[activeTab] && Array.isArray(newData[activeTab])) {
        newData[activeTab] = newData[activeTab].map(token => {
          // Match by SymbolName (the Symbol from tick data should match SymbolName)
          const symbolName = token.SymbolName?.split('_')[0] || token.SymbolName;
          if (symbolName === Symbol || token.SymbolName === Symbol) {
            // Calculate LTP in USD (midpoint of best bid/ask)
            const ltpUSD = bestBidPriceUSD && bestAskPriceUSD ? (bestBidPriceUSD + bestAskPriceUSD) / 2 : (bestBidPriceUSD || bestAskPriceUSD || 0);
            
            // Calculate change (difference from previous LTP in INR and USD)
            // Use the stored previous LTP, not the current one
            const prevLtp = token.ltp || 0;
            const prevLtpUSD = token.ltpUSD || 0;
            const change = prevLtp > 0 ? ltp - prevLtp : 0;
            const changeUSD = prevLtpUSD > 0 ? ltpUSD - prevLtpUSD : 0;
            
            // Only update if values actually changed
            if (token.buy !== bestAskPrice || token.sell !== bestBidPrice || token.ltp !== ltp ||
                token.buyUSD !== bestAskPriceUSD || token.sellUSD !== bestBidPriceUSD) {
              updated = true;
              updateCountRef.current++;
              
              return {
                ...token,
                buy: bestAskPrice,
                sell: bestBidPrice,
                ltp: ltp,
                buyUSD: bestAskPriceUSD,
                sellUSD: bestBidPriceUSD,
                ltpUSD: ltpUSD,
                chg: change,
                chgUSD: changeUSD,
                high: high,
                low: low,
                open: token.open || 0, // Preserve open price
                close: token.close || 0, // Preserve close price
                closeUSD: token.closeUSD || (token.close > 0 && usdToInrRate > 0 ? token.close / usdToInrRate : 0), // Preserve closeUSD
                volume: totalBidVolume + totalAskVolume,
                prevBuy: token.buy || bestAskPrice,
                prevSell: token.sell || bestBidPrice,
                prevLtp: prevLtp,
                prevLtpUSD: prevLtpUSD,
                lastUpdate: Date.now()
              };
            }
          }
          return token;
        });
      }
      
      if (updated) {
        setLastUpdate(Date.now());
        return newData;
      }
      
      return prev; // Prevent unnecessary re-render
    });
  }, [activeTab, usdToInrRate]);

  // Check if current tab uses FX WebSocket (Crypto, Forex, Commodity)
  const isFXWebSocketTab = useCallback(() => {
    return ['CRYPTO', 'FOREX', 'COMMODITY'].includes(activeTab);
  }, [activeTab]);

  // Use shared WebSocket service
  const isFX = isFXWebSocketTab();
  const tokensArray = Array.from(selectedTokens);
  
  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((data) => {
    if (!mountedRef.current) return;
    
    // Handle different message formats based on WebSocket type
    if (isFX) {
      // FX WebSocket sends tick data
      updateFXMarketData(data);
    } else {
      // MCX/NSE WebSocket sends market data
      updateMarketData(data);
    }
  }, [isFX, updateMarketData, updateFXMarketData]);

  // Subscribe to shared WebSocket service
  const { isConnected: wsConnected } = useWebSocket(
    isFX ? [] : tokensArray, // Only pass tokens for MCX/NSE
    handleWebSocketMessage,
    isFX // Use FX WebSocket for Crypto/Forex/Commodity
  );

  // Initial load
  useEffect(() => {
    if (user?.UserId) {
      loadSelectedTokens();
    }
  }, [user?.UserId, activeTab]);

  // Load selected tokens from backend
  const loadSelectedTokens = async () => {
    setLoading(true);
    try {
      const exchangeMap = {
        'MCX': 'mcx',
        'NSE': 'nse', 
        'OPT': 'cds',
        'CRYPTO': 'crypto',
        'FOREX': 'forex',
        'COMMODITY': 'commodity'
      };
      
      const exchangeKey = exchangeMap[activeTab];
      const response = await tradingAPI.getSelectedTokens(user.UserId, exchangeKey);
      
      // Parse the response (assuming it's a JSON string)
      const tokens = typeof response === 'string' ? JSON.parse(response) : response;
      
      console.log(`Loaded ${tokens.length} selected tokens for ${activeTab}:`, tokens);
      
      // Convert to the format expected by the component
      const formattedTokens = tokens.map(token => {
        const ltp = parseFloat(token.ltp || 0);
        const ltpUSD = parseFloat(token.ltpUSD || 0);
        const close = parseFloat(token.cls || token.close || 0);
        // For FX symbols, calculate closeUSD from close INR if needed
        // For non-FX, closeUSD might not be needed, but calculate it anyway for consistency
        const isFXSymbol = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(token.ExchangeType || activeTab);
        let closeUSD = parseFloat(token.closeUSD || 0);
        if (closeUSD === 0 && close > 0 && isFXSymbol && usdToInrRate > 0) {
          // Convert close price from INR to USD for FX symbols
          closeUSD = close / usdToInrRate;
        }
        
        return {
          SymbolToken: token.SymbolToken?.toString(),
          SymbolName: token.SymbolName,
          ExchangeType: token.ExchangeType || activeTab,
          Lotsize: token.Lotsize || token.Lotsize,
          buy: parseFloat(token.buy || 0),
          sell: parseFloat(token.sell || 0),
          ltp: ltp,
          ltpUSD: ltpUSD,
          chg: parseFloat(token.chg || 0),
          chgUSD: parseFloat(token.chgUSD || 0),
          high: parseFloat(token.high || 0),
          low: parseFloat(token.low || 0),
          open: parseFloat(token.opn || token.open || 0),
          close: close,
          closeUSD: closeUSD,
          oi: parseFloat(token.ol || 0),
          volume: parseFloat(token.vol || 0),
          prevLtp: ltp, // Initialize with current LTP (will be updated by WebSocket)
          prevLtpUSD: ltpUSD, // Initialize with current LTP USD (will be updated by WebSocket)
          lastUpdate: Date.now()
        };
      });
      
      setMarketData(prev => ({
        ...prev,
        [activeTab]: formattedTokens
      }));
      
      // Update selected tokens set
      const tokenSet = new Set(formattedTokens.map(t => t.SymbolToken));
      setSelectedTokens(tokenSet);
      
      // WebSocket will automatically connect via useWebSocket hook
      
    } catch (error) {
      console.error('Error loading selected tokens:', error);
      // Fallback to empty data
      setMarketData(prev => ({
        ...prev,
        [activeTab]: []
      }));
    } finally {
      setLoading(false);
    }
  };

  // Search symbols
  const searchSymbols = async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }
    
    // Get refId from user object or localStorage
    const refId = user.Refid || localStorage.getItem('Refid');
    
    if (!refId) {
      console.error('No Refid found for user');
      setSearchResults([]);
      return;
    }
    
    setSearchLoading(true);
    try {
      // Map tab IDs to API extype values
      const extypeMap = {
        'MCX': 'MCX',
        'NSE': 'NSE',
        'OPT': 'OPT',
        'CRYPTO': 'CRYPTO',
        'FOREX': 'FOREX',
        'COMMODITY': 'COMMODITY'
      };
      
      const extype = extypeMap[activeTab] || activeTab;
      const response = await tradingAPI.getSymbols(extype, query, refId);
      const symbols = typeof response === 'string' ? JSON.parse(response) : response;
      
      console.log(`Found ${symbols.length} symbols for query "${query}":`, symbols);
      
      setSearchResults(symbols);
    } catch (error) {
      console.error('Error searching symbols:', error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  // Add token to watchlist
  const addTokenToWatchlist = async (token, symbolName, lotSize) => {
    try {
      // Map tab IDs to exchange types for saveToken API
      const exchangeTypeMap = {
        'MCX': 'MCX',
        'NSE': 'NSE',
        'OPT': 'OPT',
        'CRYPTO': 'CRYPTO',
        'FOREX': 'FOREX',
        'COMMODITY': 'COMMODITY'
      };
      
      const exchangeType = exchangeTypeMap[activeTab] || activeTab;
      await tradingAPI.saveToken(symbolName, token, user.UserId, exchangeType, lotSize);
      
      console.log(`Added token ${token} (${symbolName}) to watchlist`);
      
      // Reload the selected tokens
      await loadSelectedTokens();
      
    } catch (error) {
      console.error('Error adding token to watchlist:', error);
    }
  };

  // Remove token from watchlist
  const removeTokenFromWatchlist = async (token) => {
    try {
      await tradingAPI.deleteToken(token, user.UserId);
      
      //console.log(`Removed token ${token} from watchlist`);
      
      // Update local state immediately
      setMarketData(prev => ({
        ...prev,
        [activeTab]: prev[activeTab].filter(t => t.SymbolToken !== token)
      }));
      
      // Update selected tokens set
      setSelectedTokens(prev => {
        const newSet = new Set(prev);
        newSet.delete(token);
        return newSet;
      });
      
    } catch (error) {
      console.error('Error removing token from watchlist:', error);
    }
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setSearchQuery('');
    setSearchResults([]);
    setFilterQuery('');
    
    // Scroll to top of market data list when tab changes
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
    
    // Scroll the selected tab into view in the tabs container
    setTimeout(() => {
      const tabElement = tabRefs.current[tabId];
      if (tabElement && tabsContainerRef.current) {
        tabElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }
    }, 100);
  };
  
  // Also scroll to top when activeTab changes (handles programmatic changes)
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
    
    // Scroll active tab into view when activeTab changes
    setTimeout(() => {
      const tabElement = tabRefs.current[activeTab];
      if (tabElement && tabsContainerRef.current) {
        tabElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }
    }, 100);
  }, [activeTab]);


  // Handle search modal open
  const handleSearchModalOpen = async () => {
    setShowSearchModal(true);
    setSearchQuery('');
    setSearchResults([]);
    setModalLoading(true);
    
    // Get refId from user object or localStorage
    const refId = user.Refid || localStorage.getItem('Refid');
    
    // Load initial suggestions when modal opens
    try {
      // Map tab IDs to API extype values
      const extypeMap = {
        'MCX': 'MCX',
        'NSE': 'NSE',
        'OPT': 'OPT',
        'CRYPTO': 'CRYPTO',
        'FOREX': 'FOREX',
        'COMMODITY': 'COMMODITY'
      };
      
      const extype = extypeMap[activeTab] || activeTab;
      const response = await tradingAPI.getSymbols(extype, 'null', refId);
      const symbols = typeof response === 'string' ? JSON.parse(response) : response;
      setSearchResults(symbols); // Show all symbols as suggestions
    } catch (error) {
      console.error('Error loading initial suggestions:', error);
    } finally {
      setModalLoading(false);
    }
  };

  // Handle search input change
  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    // Debounce search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      if (query.length >= 2) {
        searchSymbols(query);
      } else {
        setSearchResults([]);
      }
    }, 300);
  };

  // Handle symbol selection in search modal
  const handleSymbolSelect = async (symbol) => {
    const isSelected = selectedTokens.has(symbol.instrument_token.toString());
    
    if (isSelected) {
      await removeTokenFromWatchlist(symbol.instrument_token.toString());
    } else {
      await addTokenToWatchlist(
        symbol.instrument_token.toString(),
        symbol.tradingsymbol,
        symbol.lot_size
      );
    }
  };

  // Manual reconnect is handled by the shared WebSocket service
  const handleManualReconnect = () => {
    // The shared service handles reconnection automatically
    console.log('Reconnection is handled automatically by the shared WebSocket service');
  };

  // Open order modal when symbol is clicked
  const handleSymbolClick = (symbol) => {
    // Store symbol data in localStorage
    if (symbol && symbol.SymbolToken) {
      localStorage.setItem("SymbolLotSize", symbol.Lotsize || 1);
      localStorage.setItem("selected_token", symbol.SymbolToken);
      localStorage.setItem("selected_script", symbol.SymbolName);
      localStorage.setItem("selectedlotsize", symbol.Lotsize || 1);
      localStorage.setItem("selected_exchange", symbol.ExchangeType || 'MCX');
    }
    // Open modal with symbol data
    setSelectedSymbol(symbol);
    setShowOrderModal(true);
  };

  const formatPrice = (price) => {
    const numPrice = parseFloat(price || 0);
    if (isNaN(numPrice)) return '0';
    return Math.round(numPrice).toString();
  };

  // Parse and format date from symbol name (e.g., "31DEC" -> "31 DEC")
  const parseAndFormatDate = (dateString) => {
    if (!dateString) return null;
    
    // Match pattern like "31DEC", "15JAN", etc. (1-2 digits followed by 3 letters)
    const match = dateString.match(/^(\d{1,2})([A-Z]{3})$/i);
    if (match) {
      const day = match[1];
      const month = match[2].toUpperCase();
      return `${day} ${month}`;
    }
    
    return null;
  };

  // Format FX price - MT5 style formatting with fixed decimal places per exchange type
  const formatFXPrice = (price, exchangeType = null, symbolName = null) => {
    if (!price || price === 0) return '-';
    const numPrice = parseFloat(price);
    if (isNaN(numPrice)) return '-';
    
    const exchange = exchangeType || activeTab;
    const absPrice = Math.abs(numPrice);
    const symbol = symbolName || '';
    
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

  const getExchangeName = (symbolName) => {
    if (activeTab === 'MCX') return 'MCX';
    if (activeTab === 'NSE') return 'NSE';
    if (activeTab === 'OPT') return 'NSE';
    if (activeTab === 'CRYPTO') return 'CRYPTO';
    if (activeTab === 'FOREX') return 'FOREX';
    if (activeTab === 'COMMODITY') return 'COMMODITY';
    return activeTab;
  };

  // Get price color based on movement
  const getPriceColor = (current, previous) => {
    const curr = parseFloat(current || 0);
    const prev = parseFloat(previous || curr);
    
    if (curr > prev) return 'text-green-400';
    if (curr < prev) return 'text-red-400';
    return 'text-white';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-white">Loading market data...</p>
        </div>
      </div>
    );
  }

  const currentSymbols = marketData[activeTab] || [];
  
  // Filter symbols by SymbolName based on filterQuery
  const filteredSymbols = filterQuery.trim() === '' 
    ? currentSymbols 
    : currentSymbols.filter(symbol => {
        const symbolName = symbol.SymbolName || '';
        return symbolName.toLowerCase().includes(filterQuery.toLowerCase());
      });

  return (
    <div className="h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 flex flex-col">
      {/* Fixed Header with Search Icon */}
      <div className="flex-shrink-0 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800/50 shadow-sm">
        <div className="px-3 sm:px-4 py-2">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-3">
            <div className="flex items-center justify-between sm:justify-start gap-2">
              <div className="flex-1 sm:flex-initial">
                <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">MarketWatch</h1>
                <p className="text-xs text-gray-500 hidden sm:block">Real-time market data</p>
              </div>
            </div>
            <div className="w-full sm:flex-1 sm:max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by symbol..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className="w-full pl-10 pr-10 py-2 bg-gray-800/60 border border-gray-700/50 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all backdrop-blur-sm"
                />
                <button
                  onClick={handleSearchModalOpen}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 bg-blue-600 hover:bg-blue-700 rounded transition-all duration-200 flex-shrink-0"
                >
                  <Plus className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed Tabs */}
      <div 
        ref={tabsContainerRef}
        className="flex-shrink-0 bg-gray-900/50 border-b border-gray-800/50 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        <div className="flex">
          {(() => {
            // Reorder tabs: active tab first, then others
            const activeTabData = tabs.find(tab => tab.id === activeTab);
            const otherTabs = tabs.filter(tab => tab.id !== activeTab);
            const reorderedTabs = activeTabData ? [activeTabData, ...otherTabs] : tabs;
            
            return reorderedTabs.map((tab) => (
              <button
                key={tab.id}
                ref={(el) => {
                  if (el) {
                    tabRefs.current[tab.id] = el;
                  }
                }}
                onClick={() => handleTabChange(tab.id)}
                className={`relative flex-1 min-w-[100px] sm:min-w-[110px] py-2 px-3 text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-cyan-500"></div>
                )}
              </button>
            ));
          })()}
        </div>
      </div>

      {/* Scrollable Market Data List */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto relative">
        {filteredSymbols.length > 0 ? (
          <>
            {/* MT5-style Table Header for All Exchanges - Fixed at top */}
            <div className="sticky top-0 z-20 bg-gray-800 border-b border-gray-700 px-3 sm:px-2 py-2 shadow-lg">
              <div className="grid grid-cols-[2.5fr_1fr_1fr] gap-3 sm:gap-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                <div className="text-left">SYMBOLS</div>
                <div className="text-center">BID</div>
                <div className="text-center">ASK</div>
                {/* <div className="text-center">CHANGE</div> */}
              </div>
            </div>
            
            <div className="bg-gray-900">
            {filteredSymbols.map((symbol) => {
              // Check if this is a Crypto/Forex/Commodity tab (FX tabs)
              const isFXTab = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(activeTab);
              
              let changeValue, ltpValue, prevLtpValue, changePercent;
              
              if (isFXTab) {
                // For FX symbols, use USD prices for percentage calculation
                const ltpUSD = parseFloat(symbol.ltpUSD || 0);
                // Get close price in USD (convert from INR close if needed, or use stored closeUSD)
                const closeINR = parseFloat(symbol.close || 0);
                const storedCloseUSD = parseFloat(symbol.closeUSD || 0);
                const closeUSD = storedCloseUSD > 0 ? storedCloseUSD : (closeINR > 0 && usdToInrRate > 0 ? closeINR / usdToInrRate : 0);
                
                // For display: show intraday change (from previous tick) - this is what chgUSD represents
                const prevLtpUSD = parseFloat(symbol.prevLtpUSD || 0);
                // Use chgUSD if available (intraday change), otherwise calculate from prevLtp
                const chgUSDValue = parseFloat(symbol.chgUSD !== undefined ? symbol.chgUSD : 0);
                changeValue = chgUSDValue !== 0 ? chgUSDValue : (prevLtpUSD > 0 ? (ltpUSD - prevLtpUSD) : 0);
                
                ltpValue = ltpUSD;
                prevLtpValue = prevLtpUSD || ltpUSD;
                
                // For percentage: ALWAYS use close price as base (standard trading calculation)
                // Percentage = ((Current Price - Close Price) / Close Price) * 100
                if (closeUSD > 0 && ltpUSD > 0) {
                  // Calculate change from close for percentage calculation
                  const changeFromCloseUSD = ltpUSD - closeUSD;
                  changePercent = ((changeFromCloseUSD / closeUSD) * 100).toFixed(2);
                } else {
                  // If close price not available, cannot calculate accurate percentage
                  changePercent = '0.00';
                }
              } else {
                // For MCX/NSE/OPT, use INR prices
                ltpValue = parseFloat(symbol.ltp || 0);
                const closePrice = parseFloat(symbol.close || 0);
                const prevLtp = parseFloat(symbol.prevLtp || 0);
                
                // For display: use chg from WebSocket (this is change from close for MCX/NSE)
                // If chg is 0 or not available, calculate from prevLtp for intraday change display
                const chgFromWS = parseFloat(symbol.chg || 0);
                changeValue = chgFromWS !== 0 ? chgFromWS : (prevLtp > 0 ? (ltpValue - prevLtp) : 0);
                
                prevLtpValue = prevLtp || ltpValue;
                
                // For percentage: ALWAYS use close price as base (standard trading calculation)
                // Percentage = ((Current Price - Close Price) / Close Price) * 100
                if (closePrice > 0 && ltpValue > 0) {
                  // Calculate change from close for percentage calculation
                  const changeFromClose = ltpValue - closePrice;
                  changePercent = ((changeFromClose / closePrice) * 100).toFixed(2);
                } else if (chgFromWS !== 0 && closePrice === 0) {
                  // Fallback: if WebSocket provides chg (which is change from close) but close is 0,
                  // derive close price: close = ltp - chg, then calculate percentage
                  const derivedClose = chgFromWS;
                  if (derivedClose > 0) {
                    changePercent = chgFromWS
                  } else {
                    changePercent = '0.00';
                  }
                } else {
                  // If close price not available and can't derive it, cannot calculate accurate percentage
                  changePercent = '0.00';
                }
              }
              
              const isPositive = changeValue >= 0;
              const changeColor = isPositive ? 'text-emerald-400' : 'text-red-400';
              
              // Format prices based on exchange type
              let bidDisplay, askDisplay;
              const symbolNameParts = symbol.SymbolName?.split('_') || [];
              const symbolDisplay = symbolNameParts[0] || 'N/A';
              
              // Extract and format date for MCX, NSE, OPT tabs
              const showDate = ['MCX', 'NSE', 'OPT'].includes(activeTab);
              const datePart = showDate && symbolNameParts.length > 1 ? symbolNameParts[1] : null;
              const formattedDate = datePart ? parseAndFormatDate(datePart) : null;
              
              if (isFXTab) {
                const exchangeType = symbol.ExchangeType || activeTab;
                const symbolName = symbol.SymbolName || '';
                const bidPrice = parseFloat(symbol.sellUSD || symbol.sell || 0);
                const askPrice = parseFloat(symbol.buyUSD || symbol.buy || 0);
                bidDisplay = bidPrice > 0 ? formatFXPrice(bidPrice, exchangeType, symbolName) : '-';
                askDisplay = askPrice > 0 ? formatFXPrice(askPrice, exchangeType, symbolName) : '-';
              } else {
                // MCX/NSE/OPTIONS: Show raw prices without rounding
                const bidPrice = parseFloat(symbol.sell || 0);
                const askPrice = parseFloat(symbol.buy || 0);
                bidDisplay = bidPrice > 0 ? bidPrice.toString() : '-';
                askDisplay = askPrice > 0 ? askPrice.toString() : '-';
              }
              
              // MT5-style table layout for all exchanges
              return (
                <div
                  key={symbol.SymbolToken}
                  className="grid grid-cols-[2.5fr_1fr_1fr] gap-3 sm:gap-4 px-2 sm:px-2 py-2.5 border border-gray-800 hover:bg-gray-800/50 active:bg-gray-800 transition-colors cursor-pointer group touch-manipulation"
                  onClick={() => handleSymbolClick(symbol)}
                >
                  {/* SYMBOLS Column - Full name visible */}
                  <div className="flex items-center  min-w-0">
                    <div className="text-white text-sm font-medium overflow-hidden  text-ellipsis whitespace-nowrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{symbolDisplay}</span>
                        {formattedDate && (
                          <span className="text-xs text-blue-400 font-semibold bg-blue-500/10 px-2 py-0.5 rounded">
                            {formattedDate}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5">
                        <span className="text-xs text-gray-500 pr-2">{symbol.ExchangeType}</span>
                        <span className="text-xs text-gray-500">Lot : {symbol.Lotsize}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* BID Column */}
                  <div className="text-center flex items-center justify-center">
                    <div className="relative group/price">
                      <div className="px-3 py-1.5 rounded-lg bg-red-500/5 border border-red-500/20 hover:bg-red-500/10 hover:border-red-500/30 transition-all duration-200 min-w-[80px]">
                        <span className="text-red-400 text-sm font-bold whitespace-nowrap tracking-tight">
                          {bidDisplay}
                        </span>
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-r from-red-500/0 via-red-500/5 to-red-500/0 rounded-lg opacity-0 group-hover/price:opacity-100 transition-opacity duration-200 pointer-events-none"></div>
                    </div>
                  </div>
                  
                  {/* ASK Column */}
                  <div className="text-center flex items-center justify-center">
                    <div className="relative group/price">
                      <div className="px-3 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all duration-200 min-w-[80px]">
                        <span className="text-emerald-400 text-sm font-bold whitespace-nowrap tracking-tight">
                          {askDisplay}
                        </span>
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/5 to-emerald-500/0 rounded-lg opacity-0 group-hover/price:opacity-100 transition-opacity duration-200 pointer-events-none"></div>
                    </div>
                  </div>
                  
                  {/* CHANGE Column */}
                  {/* <div className="text-center flex items-center   justify-center">
                    <span className={`text-md  font-semibold  whitespace-nowrap ${changeColor}`}>
                      {isPositive ? '+' : ''}{changePercent}%
                    </span>
                  </div> */}
                </div>
              );
            })}
            </div>
          </>
        ) : currentSymbols.length > 0 ? (
          <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center px-4">
            <div className="relative mb-3 sm:mb-4">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-full blur-2xl"></div>
              <div className="relative bg-gray-800/60 backdrop-blur-sm rounded-full p-3 sm:p-4 border border-gray-700/50">
                <Search className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400" />
              </div>
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white mb-1.5">No symbols found</h3>
            <p className="text-gray-400 text-sm mb-4 sm:mb-6 max-w-sm leading-relaxed px-2">
              No symbols match your search "<span className="font-semibold text-white">{filterQuery}</span>"
            </p>
            <button
              onClick={() => setFilterQuery('')}
              className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-5 sm:px-6 py-2 rounded-xl hover:from-blue-700 hover:to-blue-800 active:from-blue-800 active:to-blue-900 transition-all duration-200 font-semibold text-sm shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 touch-manipulation"
            >
              Clear Search
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center px-4">
            <div className="relative mb-3 sm:mb-4">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-full blur-2xl"></div>
              <div className="relative bg-gray-800/60 backdrop-blur-sm rounded-full p-3 sm:p-4 border border-gray-700/50">
                <TrendingUp className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400" />
              </div>
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white mb-1.5">No symbols in watchlist</h3>
            <p className="text-gray-400 text-sm mb-4 sm:mb-6 max-w-sm leading-relaxed px-2">
              Add symbols to your <span className="font-semibold text-white">{activeTab}</span> watchlist to start tracking live market data and prices
            </p>
            <button
              onClick={handleSearchModalOpen}
              className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-5 sm:px-6 py-2 rounded-xl hover:from-blue-700 hover:to-blue-800 active:from-blue-800 active:to-blue-900 transition-all duration-200 font-semibold text-sm shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 touch-manipulation"
            >
              Add Symbols
            </button>
          </div>
        )}
      </div>

      {/* Search Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-gray-900 border border-gray-700/50 rounded-xl sm:rounded-2xl p-4 sm:p-5 w-full max-w-lg max-h-[90vh] sm:max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-3 sm:mb-4">
              <div className="flex-1 min-w-0 pr-2">
                <h3 className="text-lg sm:text-xl font-bold text-white">Search & Add Symbol</h3>
                <p className="text-xs text-gray-500 hidden sm:block">Find and add symbols to your watchlist</p>
              </div>
              <button
                onClick={() => {
                  setShowSearchModal(false);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="text-gray-400 hover:text-white hover:bg-gray-800 active:bg-gray-800 transition-all p-2 rounded-lg flex-shrink-0 touch-manipulation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="mb-3 sm:mb-4">
              <div className="relative">
                <Search className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search symbol..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  className="w-full pl-10 sm:pl-11 pr-4 py-2 bg-gray-800/60 border border-gray-700/50 rounded-lg sm:rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all backdrop-blur-sm"
                />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto -mx-2 px-2">
              {modalLoading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent mx-auto mb-4"></div>
                  <p className="text-gray-400 text-sm font-medium">Loading suggestions...</p>
                </div>
              ) : searchLoading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent mx-auto mb-4"></div>
                  <p className="text-gray-400 text-sm font-medium">Searching...</p>
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-1.5 sm:space-y-2">
                  {searchResults.map((symbol) => {
                    const isSelected = selectedTokens.has(symbol.instrument_token.toString());
                    const symbolParts = symbol.tradingsymbol?.split('_') || [symbol.name];
                    
                    return (
                      <div
                        key={symbol.instrument_token}
                        className={`flex items-center justify-between p-2.5 sm:p-3 rounded-lg border cursor-pointer transition-all duration-200 active:bg-gray-800/80 touch-manipulation ${
                          isSelected 
                            ? 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/15' 
                            : 'bg-gray-800/40 border-gray-700/50 hover:bg-gray-800/60 hover:border-gray-700'
                        }`}
                        onClick={() => handleSymbolSelect(symbol)}
                      >
                        <div className="flex-1 min-w-0 pr-2">
                          <div className="text-white font-semibold text-sm truncate">
                            {symbolParts[0] || symbol.name}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            {symbolParts[1] && (
                              <span className="text-xs text-gray-500 bg-gray-700/50 px-1.5 py-0.5 rounded">
                                {symbolParts[1]}
                              </span>
                            )}
                            <span className="text-xs text-gray-400">
                              Lot: <span className="font-semibold text-gray-300">{symbol.lot_size}</span>
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center ml-2 flex-shrink-0">
                          {isSelected ? (
                            <div className="flex items-center text-emerald-400 space-x-1 bg-emerald-500/10 px-2 py-1 rounded-lg">
                              <Check className="w-4 h-4" />
                              <span className="text-xs font-semibold hidden sm:inline">Added</span>
                            </div>
                          ) : (
                            <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-1.5 rounded-lg shadow-lg shadow-blue-500/30 active:from-blue-700 active:to-blue-800">
                              <Plus className="w-4 h-4 text-white" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : searchQuery.length >= 2 ? (
                <div className="text-center py-16">
                  <div className="text-gray-500 text-sm mb-2">No symbols found for</div>
                  <div className="text-white font-semibold text-base">"{searchQuery}"</div>
                  <div className="text-gray-500 text-xs mt-3">Try a different search term</div>
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="text-gray-500 text-sm mb-2">Popular symbols for</div>
                  <div className="text-white font-semibold text-base">{activeTab}</div>
                  <div className="text-gray-500 text-xs mt-3">Start typing to search</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Order Modal */}
      <OrderModal
        isOpen={showOrderModal}
        onClose={() => {
          setShowOrderModal(false);
          setSelectedSymbol(null);
        }}
        symbol={selectedSymbol}
        user={user}
        onOrderPlaced={() => {
          // Refresh market data or handle order placement
        }}
      />
    </div>
  );
};

export default MarketWatch;