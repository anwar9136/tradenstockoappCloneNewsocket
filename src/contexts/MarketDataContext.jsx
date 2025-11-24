import React, { createContext, useContext, useRef, useCallback, useState } from 'react';

const MarketDataContext = createContext();

export const useMarketData = () => useContext(MarketDataContext);

export const MarketDataProvider = ({ children }) => {
  const [marketData, setMarketData] = useState({});
  const [wsConnected, setWsConnected] = useState(false);
  const subscribers = useRef(new Map());

  // Update market data
  const updateMarketData = useCallback((data) => {
    if (!data || !data.instrument_token) return;
    
    const tokenToFind = data.instrument_token.toString();
    
    setMarketData(prev => {
      const newData = { ...prev };
      let updated = false;
      
      Object.keys(newData).forEach(key => {
        if (newData[key] && Array.isArray(newData[key])) {
          newData[key] = newData[key].map(item => {
            if (item.instrument_token?.toString() === tokenToFind || 
                item.TokenNo?.toString() === tokenToFind ||
                item.SymbolToken?.toString() === tokenToFind) {
              updated = true;
              
              const bid = data.bid === "0" || data.bid === 0 ? data.last_price : data.bid;
              const ask = data.ask === "0" || data.ask === 0 ? data.last_price : data.ask;
              
              return {
                ...item,
                // Update relevant fields
                buy: parseFloat(ask) || item.buy || 0,
                sell: parseFloat(bid) || item.sell || 0,
                ltp: parseFloat(data.last_price) || item.ltp || 0,
                chg: parseFloat(data.change) || item.chg || 0,
                high: parseFloat(data.high_) || item.high || 0,
                low: parseFloat(data.low_) || item.low || 0,
                open: parseFloat(data.open_) || item.open || 0,
                close: parseFloat(data.close_) || item.close || 0,
                currentPrice: parseFloat(bid) || item.currentPrice || 0,
                lastUpdate: Date.now()
              };
            }
            return item;
          });
        }
      });
      
      return updated ? newData : prev;
    });
  }, []);

  // Subscribe to updates
  const subscribe = useCallback((key, callback) => {
    subscribers.current.set(key, callback);
    return () => subscribers.current.delete(key);
  }, []);

  // Notify all subscribers
  const notifySubscribers = useCallback((data) => {
    subscribers.current.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error('Error in subscriber callback:', error);
      }
    });
  }, []);

  const value = {
    marketData,
    setMarketData,
    updateMarketData,
    subscribe,
    notifySubscribers,
    wsConnected,
    setWsConnected
  };

  return (
    <MarketDataContext.Provider value={value}>
      {children}
    </MarketDataContext.Provider>
  );
};

