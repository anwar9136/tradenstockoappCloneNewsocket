import axios from 'axios';

// Base API URL
// - In production (https), default to same-origin proxy "/api" to avoid mixed-content
// - Allow override via Vite env: VITE_API_BASE_URL
// - In dev (http), fall back to the direct IP endpoint
 const API_BASE_URL = 'https://www.api.tradenstocko.com/api/';
//const API_BASE_URL = 'http://localhost:5000/api/';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add any auth tokens here if needed
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

// API methods
export const authAPI = {
  // Login user
  login: async (username, password, deviceId, refIdByUser, refIdForMatch) => {
    try {
      const response = await api.get('/checklogin/', {
        params: {
          username,
          password,
          deviceid: deviceId,
          refidbyuser: refIdByUser,
          refidformatch: refIdForMatch
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get user profile
  getUserProfile: async (userId) => {
    try {
      const response = await api.get('/userprofile/', {
        params: { userid: userId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Refresh user data
  refreshData: async (userId, deviceIp) => {
    try {
      const response = await api.get('/refreshdata/', {
        params: { 
          userid: userId,
          devip: deviceIp 
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Check user count
  getUserCount: async (userId) => {
    try {
      const response = await api.get('/getusercount/', {
        params: { userid: userId }
      });
      return response.data;
    } catch (error) {
      throw error;
    } 
  },

  // Register user
  register: async (userData) => {
    try {
      const response = await api.post('/register/', userData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Change active status
  changeActiveStatus: async (userId) => {
    try {
      const response = await api.get('/changeactivestatus/', {
        params: { userid: userId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

export const tradingAPI = {
  // Get market time
  getMarketTime: async (exchange, refId) => {
    try {
      // Get refId from localStorage if not provided
      let refIdToUse = refId;
      if (!refIdToUse || refIdToUse === '') {
        refIdToUse = localStorage.getItem('Refid');
      }
      
      // If still no refId, try to get from user object
      if (!refIdToUse || refIdToUse === '') {
        const userStr = localStorage.getItem('user');
        if (userStr) {
          const user = JSON.parse(userStr);
          refIdToUse = user?.Refid;
        }
      }
      
      // Fallback to default value '4355' if still no refId
      if (!refIdToUse || refIdToUse === '') {
        refIdToUse = '4355';
      }
      
      const response = await api.get('/getmarkettime/', {
        params: {
          Exchange: exchange,
          refid: refIdToUse
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get ledger balance
  getLedgerBalance: async (userId) => {
    try {
      const response = await api.get('/getledgerbalance/', {
        params: { uid: userId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get all orders
  getAllOrders: async (userId) => {
    try {
      const response = await api.get('/getallorders/', {
        params: { uid: userId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get orders by status
  getOrders: async (orderStatus, userId) => {
    try {
      const response = await api.get('/getorders/', {
        params: {
          orderstatus: orderStatus,
          uid: userId
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get single market data
  getSingleMarketData: async (token) => {
    try {
      const response = await api.get('/getsinglemarketdata/', {
        params: { token }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get MCX symbols
  getSymbols: async (exchangeType, searchKey, refId) => {
    try {
      // Get refId from localStorage if not provided
      let refIdToUse = refId;
      if (!refIdToUse) {
        refIdToUse = localStorage.getItem('Refid');
      }
      
      // If still no refId, try to get from user object
      if (!refIdToUse) {
        const userStr = localStorage.getItem('user');
        if (userStr) {
          const user = JSON.parse(userStr);
          refIdToUse = user?.Refid;
        }
      }
      
      // Fallback to fixed value '4355' for testing
      if (!refIdToUse || refIdToUse === '' || refIdToUse === null) {
        refIdToUse = '4355';
      }
      
      console.log('getSymbols - refIdToUse:', refIdToUse);
      
      // Map CRYPTO to CRYPTOCURRENCIES for database compatibility
      const mappedExchangeType = exchangeType === 'CRYPTO' ? 'CRYPTOCURRENCIES' : exchangeType;
      
      // Only include refid param if we have a valid value
      const params = {
        extype: mappedExchangeType,
        searchkey: searchKey || 'null',
        refid: refIdToUse
      };
      
      console.log('getSymbols - params:', params);
      
      const response = await api.get('/getMCXsymbols/', { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get selected tokens for user
  getSelectedTokens: async (userId, exchange) => {
    try {
      const response = await api.get('/getselectedtoken/', {
        params: {
          cid: userId,
          exch: exchange
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Save token to user's watchlist
  saveToken: async (symbolName, token, userId, exchangeType, lotSize) => {
    try {
      const response = await api.get('/savetoken/', {
        params: {
          symbolname: symbolName,
          token: token,
          userid: userId,
          exchangetype: exchangeType,
          lotsize: lotSize
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Delete token from user's watchlist
  deleteToken: async (token, userId) => {
    try {
      const response = await api.get('/deletetoken/', {
        params: {
          token: token,
          userid: userId
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get consolidated trades
  getConsolidatedTrades: async (userId) => {
    try {
      const response = await api.get('/getconsolidatedtrade/', {
        params: { uid: userId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Place market order
  placeMarketOrder: async (orderData) => {
    try {
      const response = await api.post('/placeorder/', orderData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Place limit order
  placeLimitOrder: async (orderData) => {
    try {
      const response = await api.post('/placependingorder/', orderData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Cancel order
  cancelOrder: async (orderId, userId) => {
    try {
      const response = await api.get('/cancelorder/', {
        params: {
          orderid: orderId,
          uid: userId
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Modify order
  modifyOrder: async (orderData) => {
    try {
      const response = await api.post('/modifyorder/', orderData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get user balance and margin
  getUserBalance: async (userId) => {
    try {
      const response = await api.get('/getuserbalance/', {
        params: { uid: userId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Save SL/TP for order
  saveSLTP: async (tradeId, sl, tp) => {
    try {
      const response = await api.post('/savesltp/', {
        TradeId: tradeId,
        SL: sl || "0",
        TP: tp || "0"
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Check before trade (validation)
  checkBeforeTrade: async (orderData) => {
    try {
      const response = await api.get('/checkbeforetrade/', {
        params: orderData
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Check before trade for pending orders
  checkBeforeTradeForPending: async (orderData) => {
    try {
      const response = await api.get('/checkbeforetradeForPending/', {
        params: orderData
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Save orders
  saveOrders: async (orderData) => {
    try {
      const response = await api.get('/saveorders/', {
        params: orderData
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Save order by user (direct order placement)
  saveOrderByUser: async (orderData) => {
    try {
      const response = await api.post('/saveorderbyuser/', null, {
        params: orderData
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get user closed orders
  getUserClosedOrders: async (userId) => {
    try {
      const response = await api.post('/getuserclosedorders/', null, {
        params: { UserId: userId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get net P/L
  getNetPL: async (userId) => {
    try {
      const response = await api.post('/getnetpl/', null, {
        params: { UserId: userId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Close trade from portfolio
  closeTradeFromPortfolio: async (userId, orderCategory, tokenNo, cmpValue) => {
    try {
      const response = await api.get('/closetrade_from_account_portfolio/', {
        params: {
          userid: userId,
          ordercat: orderCategory,
          tokenno: tokenNo,
          cmpval: cmpValue
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Set Stop Loss and Take Profit
  setSLTP: async (orderId, stopLossPrice, takeProfitPrice) => {
    try {
      const response = await api.post('/setsltp/', {
        orderId: orderId,
        stopLossPrice: stopLossPrice,
        takeProfitPrice: takeProfitPrice
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Update order (close trade)
  updateOrder: async (lp, brokerage, broughtBy, closedAt, orderNo, uid, orderType, tokenNo) => {
    try {
      const response = await api.get('/updateorder/', {
        params: {
          lp,
          brokerage,
          BroughtBy: broughtBy,
          ClosedAt: closedAt,
          orderno: orderNo,
          uid,
          ordertype: orderType,
          tokenno: tokenNo
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Delete order (cancel order)
  deleteOrder: async (orderId) => {
    try {
      const response = await api.get('/deleteorder/', {
        params: { orderid: orderId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get SL/TP orders
  getSLTP: async (userId) => {
    try {
      const response = await api.get('/getsltp/', {
        params: { UserId: userId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Delete SL/TP order
  deleteSLTP: async (tradeId) => {
    try {
      const response = await api.post('/deletesltp/', {
        TradeId: tradeId
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Cancel all orders by exchange
  cancelAllOrdersByApp: async (userId, symbolType) => {
    try {
      const response = await api.get('/canceleallorderfromapp/', {
        params: { 
          UserId: userId, 
          SymbolType: symbolType 
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Close all trades by app
  closeAllTradesByApp: async (orderData) => {
    try {
      const response = await api.post('/closealltradesbyapp/', orderData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // On select token load
  onSelectForLoad: async (tokenId) => {
    try {
      const response = await api.get('/onselectforload/', {
        params: { tokenid: tokenId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get history data
  getHistoryData: async (interval, instrumentToken, fromDateTime, toDateTime) => {
    try {
      const response = await api.get('/gethistorydata', {
        params: {
          interval,
          instrumenttoken: instrumentToken,
          fromdatetime: fromDateTime,
          todatetime: toDateTime
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get script
  getScript: async (exchangeName) => {
    try {
      const response = await api.get('/getscript', {
        params: { exchangename: exchangeName }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Save transaction
  saveTransaction: async (transactionData) => {
    try {
      const response = await api.post('/savetransaction/', transactionData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get payment image
  getPaymentImage: async (refId) => {
    try {
      const response = await api.get('/getpaymentimage/', {
        params: { refid: refId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get user bill
  getUserBill: async (userId) => {
    try {
      const response = await api.get('/getuserbill/', {
        params: { UserId: userId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get user balance ledger
  getUserBalanceLedger: async (userId) => {
    try {
      const response = await api.get('/getuserbalanceledger/', {
        params: { uid: userId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get profile data
  getProfileData: async (userId) => {
    try {
      const response = await api.get('/profiledata/', {
        params: { userid: userId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get notifications
  getNotification: async (userId, refId) => {
    try {
      const response = await api.get('/getnotification/', {
        params: { userid: userId, refid: refId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get script token
  getScriptToken: async (scriptName) => {
    try {
      const response = await api.get('/getscripttoken/', {
        params: { scriptname: scriptName }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Contact us
  contactUs: async (contactData) => {
    try {
      const response = await api.post('/contactus/', contactData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Update user bank details
  updateUserBankDetails: async (bankDetails) => {
    try {
      const response = await api.get('/updateuserbankdetails/', {
        params: bankDetails
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get payment form content
  getFormContentAsync: async (paymentData) => {
    try {
      const response = await api.get('/getformconetntAsync/', {
        params: paymentData
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get user URL
  getUserUrl: async (url) => {
    try {
      const response = await api.get('/userurl', {
        params: { url }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

export default api;
