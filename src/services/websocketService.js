// Global WebSocket Service - Single connection for all components
class WebSocketService {
  constructor() {
    this.ws = null; // MCX/NSE WebSocket
    this.fxWs = null; // FX WebSocket (Crypto/Forex/Commodity)
    this.subscribers = new Map(); // Map to track subscriber callbacks
    this.fxSubscribers = new Map(); // Map to track FX subscriber callbacks
    this.subscribedTokens = new Set(); // Set to track current subscriptions
    this.reconnectAttempts = 0;
    this.fxReconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.isConnecting = false;
    this.fxIsConnecting = false;
    this.reconnectTimeout = null;
    this.fxReconnectTimeout = null;
    this.connectTimeout = null;
    this.fxConnectTimeout = null;
    this.isConnected = false;
    this.fxIsConnected = false;
    // Global cache for market data to persist across component switches
    this.marketDataCache = new Map(); // tokenNo -> { currentPrice, profitLoss, ... }
    this.fxMarketDataCache = new Map(); // symbolName -> { currentPrice, profitLoss, ... }
  }

  // Subscribe to MCX/NSE WebSocket updates
  subscribe(subscriberId, callback) {
    this.subscribers.set(subscriberId, callback);
    
    // Connect if not already connected or connecting
    if (!this.isConnected && !this.isConnecting) {
      this.connect();
    }
    
    return () => {
      this.subscribers.delete(subscriberId);
      console.log(`Subscriber ${subscriberId} removed`);
    };
  }

  // Subscribe to FX WebSocket updates
  subscribeFX(subscriberId, callback) {
    this.fxSubscribers.set(subscriberId, callback);
    
    // Connect if not already connected or connecting
    if (!this.fxIsConnected && !this.fxIsConnecting) {
      this.connectFX();
    }
    
    return () => {
      this.fxSubscribers.delete(subscriberId);
      console.log(`FX Subscriber ${subscriberId} removed`);
    };
  }

  // Add tokens to subscription (only if not already subscribed)
  subscribeToTokens(tokens) {
    if (!tokens || tokens.trim().length === 0) return;
    
    const tokenArray = tokens.split(',').map(t => t.trim()).filter(t => t.length > 0);
    const newTokens = tokenArray.filter(token => !this.subscribedTokens.has(token));
    
    // Add all tokens to subscription set
    tokenArray.forEach(token => this.subscribedTokens.add(token));
    
    if (newTokens.length > 0) {
      console.log('New tokens to subscribe:', newTokens);
      
      // Ensure WebSocket is connected before subscribing
      if (!this.isConnected && !this.isConnecting) {
        this.connect();
      }
      
      // If WebSocket is connected, send updated subscription immediately
      if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        const allTokens = Array.from(this.subscribedTokens).join(',');
        try {
          this.ws.send(allTokens);
          console.log(`Resubscribed to ${this.subscribedTokens.size} tokens`);
        } catch (error) {
          console.error('Error resubscribing:', error);
        }
      } else if (this.isConnecting) {
        // If connecting, tokens will be sent when connection opens
        console.log('WebSocket connecting, tokens will be subscribed when ready');
      }
    } else {
      console.log('All tokens already subscribed');
    }
  }

  // Connect to MCX/NSE WebSocket (only connect once)
  connect() {
    // Prevent multiple connection attempts
    if (this.isConnecting || this.isConnected) {
      console.log('MCX/NSE WebSocket already connecting or connected, skipping...');
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max MCX/NSE reconnection attempts reached');
      return;
    }

    this.isConnecting = true;
    const uri = "wss://www.indsocket.tradenstocko.com:8084/ws";
    
    console.log(`Attempting MCX/NSE WebSocket connection (attempt ${this.reconnectAttempts + 1})...`);
    
    // Close existing connection if any
    if (this.ws) {
      try {
        this.ws.close();
      } catch (error) {
        console.log('Error closing existing WebSocket:', error);
      }
      this.ws = null;
    }

    try {
      this.ws = new WebSocket(uri);
      
      this.connectTimeout = setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
          console.log('WebSocket connection timeout');
          this.ws.close();
        }
      }, 10000);

      this.ws.onopen = () => {
        clearTimeout(this.connectTimeout);
        
        console.log('✓ MCX/NSE WebSocket connected successfully');
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        // Subscribe to current tokens if any
        if (this.subscribedTokens.size > 0) {
          const allTokens = Array.from(this.subscribedTokens).join(',');
          try {
            this.ws.send(allTokens);
            console.log(`Subscribed to ${this.subscribedTokens.size} tokens`);
          } catch (error) {
            console.error('Error sending initial tokens:', error);
          }
        } else {
          this.ws.send("");
        }
      };

      this.ws.onmessage = (event) => {
        // Handle empty or ping messages
        if (!event.data || event.data === "" || event.data === "true") {
          return;
        }

        try {
          let rawData = event.data;
          
          // Check if this is a non-JSON message (like comma-separated token numbers)
          // These are typically server acknowledgments and should be silently ignored
          if (typeof rawData === 'string' && !rawData.trim().startsWith('{') && !rawData.trim().startsWith('[')) {
            // Check if it looks like comma-separated numbers (token list)
            if (/^[\d,\sD]+$/.test(rawData.trim())) {
              // This is likely a token subscription acknowledgment, silently ignore
              return;
            }
          }
          
          let data = null;
          
          // Try to parse as single JSON object first
          try {
            data = JSON.parse(rawData);
          } catch (parseError) {
            // If parsing fails, try to extract first valid JSON object
            // This handles cases where multiple JSON objects are concatenated
            let depth = 0;
            let startIdx = -1;
            let jsonStr = '';
            
            for (let i = 0; i < rawData.length; i++) {
              const char = rawData[i];
              
              if (char === '{') {
                if (depth === 0) startIdx = i;
                depth++;
                if (startIdx >= 0) jsonStr += char;
              } else if (char === '}') {
                if (startIdx >= 0) jsonStr += char;
                depth--;
                
                if (depth === 0 && startIdx >= 0) {
                  // Found complete JSON object
                  try {
                    data = JSON.parse(jsonStr);
                    break;
                  } catch (e) {
                    // Reset and try again
                    jsonStr = '';
                    startIdx = -1;
                  }
                }
              } else if (startIdx >= 0) {
                jsonStr += char;
              }
            }
            
            // If still no valid JSON, silently ignore (likely non-JSON server message)
            if (!data) {
              return;
            }
          }
          
          // Cache market data for persistence across component switches
          if (data && data.instrument_token) {
            const tokenKey = data.instrument_token.toString();
            const bid = data.bid === "0" || data.bid === 0 ? data.last_price : data.bid;
            const ask = data.ask === "0" || data.ask === 0 ? data.last_price : data.ask;
            this.marketDataCache.set(tokenKey, {
              currentPrice: parseFloat(bid || ask || data.last_price || 0),
              bid: parseFloat(bid || 0),
              ask: parseFloat(ask || 0),
              lastPrice: parseFloat(data.last_price || 0),
              timestamp: Date.now()
            });
          }
          
          // Broadcast to all subscribers
          if (data) {
            this.subscribers.forEach((callback, subscriberId) => {
              try {
                callback(data);
              } catch (error) {
                console.error(`Error in subscriber ${subscriberId}:`, error);
              }
            });
          }
        } catch (error) {
          console.error('Error processing WebSocket data:', error);
          console.log('Raw data:', event.data);
        }
      };

      this.ws.onerror = (error) => {
        clearTimeout(this.connectTimeout);
        // Don't log error if connection is already closed (readyState 3)
        if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
          console.error('MCX/NSE WebSocket error:', error);
        }
        this.isConnected = false;
        this.isConnecting = false;
      };

      this.ws.onclose = (event) => {
        clearTimeout(this.connectTimeout);
        
        // Only log if it wasn't a clean close or unexpected
        if (!event.wasClean && event.code !== 1000) {
          console.log('MCX/NSE WebSocket disconnected', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean
          });
        }
        
        this.isConnected = false;
        this.isConnecting = false;
        this.ws = null;
        
        // Notify all subscribers only if we have subscribers
        if (this.subscribers.size > 0) {
          this.subscribers.forEach((callback) => {
            try {
              callback({ type: 'disconnected' });
            } catch (error) {
              console.error('Error notifying subscriber:', error);
            }
          });

          // Reconnect with exponential backoff only if we have subscribers
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
            
            console.log(`Scheduling MCX/NSE reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            
            this.reconnectTimeout = setTimeout(() => {
              if (this.subscribers.size > 0) {
                this.connect();
              }
            }, delay);
          } else {
            console.error('Max MCX/NSE reconnection attempts reached');
          }
        }
      };

    } catch (error) {
      console.error('Error creating WebSocket:', error);
      this.isConnecting = false;
      
      // Retry with exponential backoff
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
        
        this.reconnectTimeout = setTimeout(() => {
          this.connect();
        }, delay);
      }
    }
  }

  // Disconnect WebSocket
  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
    
    if (this.ws) {
      try {
        this.ws.close();
      } catch (error) {
        console.error('Error closing WebSocket:', error);
      }
      this.ws = null;
    }
    
    this.isConnected = false;
    this.isConnecting = false;
    this.subscribers.clear();
    this.subscribedTokens.clear();
  }

  // Connect to FX WebSocket (only connect once)
  connectFX() {
    // Prevent multiple connection attempts
    if (this.fxIsConnecting || this.fxIsConnected) {
      console.log('FX WebSocket already connecting or connected, skipping...');
      return;
    }

    if (this.fxReconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max FX reconnection attempts reached');
      return;
    }

    this.fxIsConnecting = true;
    const uri = "wss://www.fxsoc.tradenstocko.com:8001/ws";
    
    console.log(`Attempting FX WebSocket connection (attempt ${this.fxReconnectAttempts + 1})...`);
    
    // Close existing connection if any
    if (this.fxWs) {
      try {
        this.fxWs.close();
      } catch (error) {
        console.log('Error closing existing FX WebSocket:', error);
      }
      this.fxWs = null;
    }

    try {
      this.fxWs = new WebSocket(uri);
      
      this.fxConnectTimeout = setTimeout(() => {
        if (this.fxWs && this.fxWs.readyState === WebSocket.CONNECTING) {
          console.log('FX WebSocket connection timeout');
          this.fxWs.close();
        }
      }, 10000);

      this.fxWs.onopen = () => {
        clearTimeout(this.fxConnectTimeout);
        
        console.log('✓ FX WebSocket connected successfully');
        this.fxIsConnected = true;
        this.fxIsConnecting = false;
        this.fxReconnectAttempts = 0;
        
        // FX WebSocket automatically sends all data, no need to send tokens
      };

      this.fxWs.onmessage = (event) => {
        // Handle empty or ping messages
        if (!event.data || event.data === "" || event.data === "true") {
          return;
        }

        try {
          const data = JSON.parse(event.data);
          
          // Cache FX market data for persistence across component switches
          if (data.type === 'tick' && data.data && data.data.Symbol) {
            const symbolKey = data.data.Symbol;
            const bestBidPriceUSD = data.data.BestBid?.Price || 0;
            const bestAskPriceUSD = data.data.BestAsk?.Price || 0;
            this.fxMarketDataCache.set(symbolKey, {
              bestBidPriceUSD: parseFloat(bestBidPriceUSD),
              bestAskPriceUSD: parseFloat(bestAskPriceUSD),
              timestamp: Date.now()
            });
          }
          
          // Broadcast to all FX subscribers
          this.fxSubscribers.forEach((callback, subscriberId) => {
            try {
              callback(data);
            } catch (error) {
              console.error(`Error in FX subscriber ${subscriberId}:`, error);
            }
          });
        } catch (error) {
          console.error('Error parsing FX WebSocket data:', error);
        }
      };

      this.fxWs.onerror = (error) => {
        clearTimeout(this.fxConnectTimeout);
        // Don't log error if connection is already closed
        if (this.fxWs && this.fxWs.readyState !== WebSocket.CLOSED) {
          console.error('FX WebSocket error:', error);
        }
        this.fxIsConnected = false;
        this.fxIsConnecting = false;
      };

      this.fxWs.onclose = (event) => {
        clearTimeout(this.fxConnectTimeout);
        
        // Only log if it wasn't a clean close
        if (!event.wasClean && event.code !== 1000) {
          console.log('FX WebSocket disconnected', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean
          });
        }
        
        this.fxIsConnected = false;
        this.fxIsConnecting = false;
        this.fxWs = null;
        
        // Notify all FX subscribers only if we have subscribers
        if (this.fxSubscribers.size > 0) {
          this.fxSubscribers.forEach((callback) => {
            try {
              callback({ type: 'disconnected' });
            } catch (error) {
              console.error('Error notifying FX subscriber:', error);
            }
          });

          // Reconnect with exponential backoff only if we have subscribers
          if (this.fxReconnectAttempts < this.maxReconnectAttempts) {
            this.fxReconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.fxReconnectAttempts - 1), 30000);
            
            console.log(`Scheduling FX reconnect in ${delay}ms (attempt ${this.fxReconnectAttempts}/${this.maxReconnectAttempts})`);
            
            this.fxReconnectTimeout = setTimeout(() => {
              if (this.fxSubscribers.size > 0) {
                this.connectFX();
              }
            }, delay);
          } else {
            console.error('Max FX reconnection attempts reached');
          }
        }
      };

    } catch (error) {
      console.error('Error creating FX WebSocket:', error);
      this.fxIsConnecting = false;
      
      // Retry with exponential backoff only if we have subscribers
      if (this.fxSubscribers.size > 0 && this.fxReconnectAttempts < this.maxReconnectAttempts) {
        this.fxReconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.fxReconnectAttempts - 1), 30000);
        
        this.fxReconnectTimeout = setTimeout(() => {
          if (this.fxSubscribers.size > 0) {
            this.connectFX();
          }
        }, delay);
      }
    }
  }

  // Get current connection status
  getStatus() {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      fxIsConnected: this.fxIsConnected,
      fxIsConnecting: this.fxIsConnecting,
      subscribedTokens: Array.from(this.subscribedTokens),
      subscriberCount: this.subscribers.size,
      fxSubscriberCount: this.fxSubscribers.size
    };
  }

  // Get cached market data for a token (MCX/NSE)
  getCachedMarketData(tokenNo) {
    if (!tokenNo) return null;
    const tokenKey = tokenNo.toString();
    const cached = this.marketDataCache.get(tokenKey);
    // Return cached data if it's less than 30 seconds old (to avoid stale data but allow component switches)
    if (cached && (Date.now() - cached.timestamp) < 30000) {
      return cached;
    }
    return null;
  }

  // Get cached FX market data for a symbol
  getCachedFXMarketData(symbolName) {
    if (!symbolName) return null;
    const cached = this.fxMarketDataCache.get(symbolName);
    // Return cached data if it's less than 30 seconds old (to avoid stale data but allow component switches)
    if (cached && (Date.now() - cached.timestamp) < 30000) {
      return cached;
    }
    return null;
  }
}

// Create singleton instance
const webSocketService = new WebSocketService();

// DO NOT auto-connect - let components request connection when needed
// webSocketService.connect();

export default webSocketService;
