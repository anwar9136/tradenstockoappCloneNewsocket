import { useEffect, useRef, useState } from 'react';
import webSocketService from '../services/websocketService';

/**
 * Shared WebSocket hook that uses a single global WebSocket connection
 * @param {Array} tokens - Array of token IDs to subscribe to (for MCX/NSE)
 * @param {Function} onMessage - Callback when data is received
 * @param {Boolean} isFX - Whether to use FX WebSocket (for Crypto/Forex/Commodity)
 */
export const useWebSocket = (tokens, onMessage, isFX = false) => {
  const [isConnected, setIsConnected] = useState(false);
  const subscriberIdRef = useRef(null);
  const tokensStringRef = useRef('');

  useEffect(() => {
    // Subscribe to WebSocket updates
    subscriberIdRef.current = `subscriber_${Date.now()}_${Math.random()}`;
    
    const unsubscribe = isFX 
      ? webSocketService.subscribeFX(subscriberIdRef.current, (data) => {
          if (data.type === 'disconnected') {
            setIsConnected(false);
          } else {
            onMessage(data);
          }
        })
      : webSocketService.subscribe(subscriberIdRef.current, (data) => {
          if (data.type === 'disconnected') {
            setIsConnected(false);
          } else {
            onMessage(data);
          }
        });

    return () => {
      unsubscribe();
    };
  }, [onMessage, isFX]);

  // Subscribe to tokens when they change (only for MCX/NSE)
  useEffect(() => {
    if (isFX) return; // FX WebSocket doesn't need token subscription
    
    const tokensString = Array.isArray(tokens) ? tokens.join(',') : '';
    
    if (tokensString !== tokensStringRef.current && tokensString.trim().length > 0) {
      tokensStringRef.current = tokensString;
      webSocketService.subscribeToTokens(tokensString);
    }
  }, [tokens, isFX]);

  // Update connection status
  useEffect(() => {
    const status = webSocketService.getStatus();
    setIsConnected(isFX ? status.fxIsConnected : status.isConnected);
  }, [isFX]);

  // Poll for connection status (reduced frequency for better performance)
  useEffect(() => {
    const interval = setInterval(() => {
      const status = webSocketService.getStatus();
      setIsConnected(isFX ? status.fxIsConnected : status.isConnected);
    }, 5000); // Reduced from 1000ms to 5000ms (5 seconds)

    return () => clearInterval(interval);
  }, [isFX]);

  return { isConnected };
};
