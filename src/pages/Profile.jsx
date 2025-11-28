import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import { useNavigate } from 'react-router-dom';
import { 
  Home, FileText, Briefcase, Settings, User, Eye, EyeOff, X, 
  Bell, Mail, Phone, MapPin, CreditCard, FileSearch, DollarSign,
  Activity, TrendingUp, TrendingDown
} from 'lucide-react';
import { tradingAPI, authAPI } from '../services/api';
import toast from 'react-hot-toast';
import upiIcon from '../assets/upi.svg';
import { fetchAndCacheKYCStatus } from '../utils/kycUtils';

const Profile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  
  // Modal states
  const [showUserProfileModal, setShowUserProfileModal] = useState(false);
  const [showPersonalDetailsModal, setShowPersonalDetailsModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showPayOnlineModal, setShowPayOnlineModal] = useState(false);
  const [showFundDetailsModal, setShowFundDetailsModal] = useState(false);
  const [showInvoiceBillModal, setShowInvoiceBillModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showKYCModal, setShowKYCModal] = useState(false);
  
  // Form states
  const [passwords, setPasswords] = useState({ old: '', new: '', confirm: '' });
  const [showPasswords, setShowPasswords] = useState({ old: false, new: false, confirm: false });
  const [withdrawData, setWithdrawData] = useState({ amount: '', remark: '' });
  const [complaintData, setComplaintData] = useState({ name: '', callno: '', whatsappno: '', message: '' });
  
  // Data states
  const [balanceData, setBalanceData] = useState({
    ledgerBalance: 0,
    marginAvailable: 0,
    activePL: 0,
    m2m: 0
  });
  const [activeOrders, setActiveOrders] = useState([]);
  const [transactionHistory, setTransactionHistory] = useState([]);
  const [billInfo, setBillInfo] = useState([]);
  const [billSummary, setBillSummary] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [profileData, setProfileData] = useState(null);
  const [personalDetails, setPersonalDetails] = useState(null);
  const [kycData, setKycData] = useState(null);
  const [kycImages, setKycImages] = useState({ aadhaar: null, pan: null });
  const [uploadMessage, setUploadMessage] = useState('');
  const [kycLoading, setKycLoading] = useState(false);
  const [showKycIncompleteAlert, setShowKycIncompleteAlert] = useState(false);
  const [usdToInrRate, setUsdToInrRate] = useState(88.65); // Default fallback rate
  const [bankDetails, setBankDetails] = useState({
    accountHolderName: '',
    bankName: '',
    accountNo: '',
    ifscCode: ''
  });
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositData, setDepositData] = useState({
    upiId: '',
    qrCodeUrl: '',
    accountName: '',
    accountNo: '',
    ifscCode: ''
  });
  const [paymentData, setPaymentData] = useState({
    transactionId: '',
    amount: '',
    remark: ''
  });
  const [useGateway, setUseGateway] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadTxnMessage, setUploadTxnMessage] = useState('');
  const [uploadTxnLoading, setUploadTxnLoading] = useState(false);
  const fileInputRef = useRef(null);

  const bottomNavItems = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'orders', icon: FileText, label: 'Orders' },
    { id: 'portfolio', icon: Briefcase, label: 'Portfolio' },
    { id: 'profile', icon: User, label: 'Profile' }
  ];

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
        // Keep using the previous rate or default
      }
    };
    
    fetchExchangeRate();
    // Update every 5 minutes
    const interval = setInterval(fetchExchangeRate, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (user?.UserId) {
      loadProfileData();
      fetchKYCStatus();
    }
  }, [user]);

  // Calculate balance data (activePL, m2m, marginAvailable) when activeOrders change
  useEffect(() => {
    // Calculate total active P/L from all orders
    const totalActivePL = activeOrders.reduce((total, order) => total + (order.profitLoss || 0), 0);
    
    // Calculate total margin used from all orders
    const totalMarginUsed = activeOrders.reduce((total, order) => total + (parseFloat(order.MarginUsed || 0)), 0);
    
    // Update balance data
    setBalanceData(prev => {
      const creditLimit = parseFloat(localStorage.getItem('CreditLimit')) || 0;
      const ledgerBalance = prev.ledgerBalance || 0;
      const m2m = ledgerBalance; // M2M = Ledger Balance only
      const marginAvailable = m2m - totalMarginUsed;
      
      return {
        ...prev,
        activePL: totalActivePL,
        m2m: m2m,
        marginAvailable: Math.max(0, marginAvailable)
      };
    });
  }, [activeOrders]);

  const loadProfileData = async () => {
    try {
      // Use Promise.allSettled to prevent one failure from breaking all
      await Promise.allSettled([
        getUserBalance(),
        getActiveOrders(),
        getTransactionHistory(),
        getBillInfo(),
        getNotifications(),
        getProfileData(),
        getPersonalDetails()
      ]);
    } catch (error) {
      // Don't show error toast - let individual functions handle their own errors
    }
  };

  const getUserBalance = async () => {
    try {
      if (!user?.UserId) return;
      const balance = await tradingAPI.getLedgerBalance(user.UserId);
      const ledgerBalance = parseFloat(balance || 0);
      
      setBalanceData(prev => {
        // M2M = Ledger Balance only
        const m2m = ledgerBalance;
        
        return {
          ...prev,
          ledgerBalance,
          m2m: m2m
        };
      });
    } catch (error) {
      setBalanceData(prev => ({ ...prev, ledgerBalance: 0 }));
    }
  };

  const getActiveOrders = async () => {
    try {
      if (!user?.UserId) return;
      let orders = await tradingAPI.getConsolidatedTrades(user.UserId);
      
      // Handle JSON-encoded response (backend may return JSON as string)
      if (typeof orders === 'string') {
        try {
          orders = JSON.parse(orders);
        } catch (e) {
          console.error('Error parsing orders JSON:', e);
          setActiveOrders([]);
          return;
        }
      }
      
      const processedOrders = Array.isArray(orders) ? orders.map(item => {
        // Check if this is an FX symbol (FOREX, CRYPTO, COMMODITY)
        const isFX = ['CRYPTO', 'FOREX', 'COMMODITY'].includes(item.SymbolType);
        
        const scriptParts = item.ScriptName.split('_');
        const scriptName = scriptParts[0];
        const exchange = scriptParts[1];
        
        // Check if this is a stop loss order
        const isStopLossOrder = item.isstoplossorder === 'true' || item.isstoplossorder === true;
        const orderCategoryDisplay = isStopLossOrder ? `Stop ${item.OrderCategory}` : item.OrderCategory;
        
        // Calculate initial P/L using bid/ask prices (exactly like original CSHTML)
        // For SELL: use Ask price (price you can sell at)
        // For BUY: use Bid price (price you can buy at)
        let profitLoss = 0;
        let profitLossUSD = 0;
        let orderPriceUSD = 0;
        let currentPriceUSD = 0;
        
        // Get bid/ask from API response, fallback to cmp if not available
        const bid = parseFloat(item.bid || item.cmp || 0);
        const ask = parseFloat(item.ask || item.cmp || 0);
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
        
        // Determine current price based on order category (like original CSHTML)
        // For SELL: use Ask (price you can sell at)
        // For BUY: use Bid (price you can buy at)
        let currentPrice = 0;
        if (item.OrderCategory === "SELL") {
          currentPrice = ask > 0 ? ask : cmp; // Use Ask for SELL, fallback to cmp
        } else {
          currentPrice = bid > 0 ? bid : cmp; // Use Bid for BUY, fallback to cmp
        }
        
        // Only calculate P/L if we have a valid current price
        if (currentPrice > 0) {
          // For FX orders, calculate USD prices and P/L
          if (isFX && usdToInrRate > 0) {
            // Convert OrderPrice from INR to USD
            orderPriceUSD = orderPrice / usdToInrRate;
            // Convert currentPrice from INR to USD
            currentPriceUSD = currentPrice / usdToInrRate;
            
            // Calculate P/L in USD
            if (item.OrderCategory === "SELL") {
              profitLossUSD = (orderPriceUSD - currentPriceUSD) * lotSize;
            } else {
              profitLossUSD = (currentPriceUSD - orderPriceUSD) * lotSize;
            }
          }
          
          // Calculate P/L in INR (for non-FX or as fallback)
          // Exactly like original CSHTML: SELL uses (orderPrice - ask), BUY uses (bid - orderPrice)
          if (item.OrderCategory === "SELL") {
            profitLoss = (orderPrice - currentPrice) * lotSize;
          } else {
            profitLoss = (currentPrice - orderPrice) * lotSize;
          }
        }
        
        return {
          ...item,
          scriptName,
          exchange,
          profitLoss: parseFloat(profitLoss.toFixed(2)),
          profitLossUSD: isFX ? parseFloat(profitLossUSD.toFixed(2)) : 0,
          orderPriceUSD: isFX ? parseFloat(orderPriceUSD.toFixed(5)) : 0,
          currentPriceUSD: isFX ? parseFloat(currentPriceUSD.toFixed(5)) : 0,
          currentPrice: currentPrice > 0 ? currentPrice : item.cmp,
          isStopLossOrder,
          orderCategoryDisplay,
          stopLossPrice: item.StopLossPrice || '',
          takeProfitPrice: item.TakeProfitPrice || '',
          isFX,
          symbolType: item.SymbolType,
          actualLot: item.actualLot, // Preserve actualLot for WebSocket updates
          Lotsize: item.Lotsize, // Preserve Lotsize for WebSocket updates
          calculatedLotSize: lotSize // Store calculated lot size for reference
        };
      }) : [];
      
      setActiveOrders(processedOrders);
    } catch (error) {
      console.error('Error fetching active orders:', error);
      setActiveOrders([]);
    }
  };

  const getTransactionHistory = async () => {
    try {
      if (!user?.UserId) return;
      let transactions = await tradingAPI.getUserBalanceLedger(user.UserId);
      
      // Handle JSON-encoded response (backend returns JSON as string)
      if (typeof transactions === 'string') {
        try {
          transactions = JSON.parse(transactions);
        } catch (e) {
          setTransactionHistory([]);
          return;
        }
      }
      
      // Process transactions to map TransactionType
      const processed = (Array.isArray(transactions) ? transactions : []).map(t => ({
        ...t,
        TransactionType: t.TransactionType === '1' ? 'Deposit' : 
                        t.TransactionType === '2' ? 'Withdrawal' :
                        t.TransactionType === '3' ? 'Profit' :
                        t.TransactionType === '4' ? 'Loss' : t.TransactionType
      }));
      
      setTransactionHistory(processed);
    } catch (error) {
      setTransactionHistory([]);
    }
  };

  const getBillInfo = async () => {
    try {
      if (!user?.UserId) return;
      const bills = await tradingAPI.getUserBill(user.UserId);
      
      // Handle different response structures
      let trades = [];
      if (bills && typeof bills === 'object') {
        // If response has trades property (structured response)
        if (Array.isArray(bills.trades)) {
          trades = bills.trades;
          // Store summary if available
          if (bills.summary) {
            setBillSummary(bills.summary);
          } else {
            // Calculate summary from trades if not provided
            const summary = calculateBillSummary(trades);
            setBillSummary(summary);
          }
        } 
        // If response is directly an array of trades
        else if (Array.isArray(bills)) {
          trades = bills;
          // Calculate summary from trades
          const summary = calculateBillSummary(trades);
          setBillSummary(summary);
        }
      } 
      // Handle plain array response
      else if (Array.isArray(bills)) {
        trades = bills;
        const summary = calculateBillSummary(trades);
        setBillSummary(summary);
      }
      
      setBillInfo(trades);
    } catch (error) {
      setBillInfo([]);
      setBillSummary(null);
    }
  };

  const calculateBillSummary = (trades) => {
    if (!Array.isArray(trades) || trades.length === 0) {
      return null;
    }
    
    // Sort by date to get period range
    const sortedTrades = [...trades].sort((a, b) => {
      const dateA = new Date(a.OrderDate || a.ClosedAt || '');
      const dateB = new Date(b.OrderDate || b.ClosedAt || '');
      return dateA - dateB;
    });
    
    const firstTrade = sortedTrades[0];
    const lastTrade = sortedTrades[sortedTrades.length - 1];
    
    const totalTrades = trades.length;
    const totalBrokerage = trades.reduce((sum, t) => sum + parseFloat(t.Brokerage || 0), 0);
    const grossPL = trades.reduce((sum, t) => sum + parseFloat(t.P_L || 0), 0);
    const netPL = grossPL - totalBrokerage;
    
    return {
      TotalTrades: totalTrades,
      TotalBrokerage: totalBrokerage.toFixed(2),
      GrossPL: grossPL.toFixed(2),
      NetPL: netPL.toFixed(2),
      PeriodStart: firstTrade?.OrderDate || firstTrade?.ClosedAt || '',
      PeriodEnd: lastTrade?.OrderDate || lastTrade?.ClosedAt || ''
    };
  };

  // Helper function to determine if a trade should show USD or INR
  const shouldShowUSD = (trade) => {
    // Use SymbolType from API (MCX, NSE, CDS, CRYPTO, FOREX, COMMODITY, OPT, etc.)
    const symbolType = (trade.SymbolType || '').toUpperCase();
    
    // FOREX, CRYPTO, and COMMODITY should show in USD
    if (['FOREX', 'CRYPTO', 'COMMODITY'].includes(symbolType)) {
      return true;
    }
    
    // MCX, NSE, CDS, OPT, and others should show in INR
    return false;
  };

  // Helper function to format price based on market type
  const formatBillPrice = (price, trade) => {
    if (!price || price === '-') return '-';
    const numPrice = parseFloat(price);
    if (isNaN(numPrice)) return price;
    
    if (shouldShowUSD(trade)) {
      // For FOREX/CRYPTO/COMMODITY: show in USD
      // If price is very small (< 1), assume it's already in USD, otherwise convert from INR
      if (numPrice < 1) {
        return `$${numPrice.toFixed(5)}`;
      } else {
        // Convert from INR to USD
        const priceUSD = numPrice / usdToInrRate;
        return `$${priceUSD.toFixed(5)}`;
      }
    } else {
      // For MCX/NSE/OPT: show in INR
      return `₹${numPrice.toFixed(2)}`;
    }
  };

  const getNotifications = async () => {
    try {
      if (!user?.UserId || !user?.Refid) return;
      const notifs = await tradingAPI.getNotification(user.UserId, user.Refid);
      setNotifications(Array.isArray(notifs) ? notifs : []);
    } catch (error) {
      setNotifications([]);
    }
  };

  const getProfileData = async () => {
    try {
      if (!user?.UserId) return;
      const profile = await tradingAPI.getProfileData(user.UserId);
      setProfileData(profile);
    } catch (error) {
      setProfileData(null);
    }
  };

  const getPersonalDetails = async () => {
    try {
      if (!user?.UserId) return;
      const details = await authAPI.getUserProfile(user.UserId);
      if (Array.isArray(details) && details.length > 0) {
        setPersonalDetails(details[0]);
        // Set bank details
        setBankDetails({
          accountHolderName: details[0].AccountHolderName || '',
          bankName: details[0].BankName || '',
          accountNo: details[0].AccountNo || '',
          ifscCode: details[0].IFSCCode || ''
        });
      }
    } catch (error) {
      setPersonalDetails(null);
    }
  };

  const handleTabClick = (tabId) => {
    switch(tabId) {
      case 'home': navigate('/dashboard'); break;
      case 'orders': navigate('/orders'); break;
      case 'portfolio': navigate('/portfolio'); break;
      default: break;
    }
  };

  const handleChangePassword = async () => {
    if (!passwords.old || !passwords.new || !passwords.confirm) {
      toast.error('Please fill all fields');
      return;
    }
    if (passwords.new !== passwords.confirm) {
      toast.error('New passwords do not match');
      return;
    }
    
    try {
      // Note: We need to add changePassword to authAPI
      const response = await fetch(
        `/api/changepassword/?userid=${user.UserId}&oldpass=${encodeURIComponent(passwords.old)}&newpass=${encodeURIComponent(passwords.new)}`
      ).then(r => r.text());
      
      if (response === 'true') {
        toast.success('Password changed successfully');
        setShowChangePasswordModal(false);
        setPasswords({ old: '', new: '', confirm: '' });
      } else {
        toast.error('Incorrect current password');
      }
    } catch (error) {
      toast.error('Failed to change password');
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawData.amount || !withdrawData.remark) {
      toast.error('Please fill all fields');
      return;
    }
    
    try {
      await tradingAPI.saveTransaction({
        userid: user.UserId,
        txttransid: 'Withdraw',
        txttransamount: withdrawData.amount,
        txttransremark: withdrawData.remark,
        refid: user.Refid
      });
      
      toast.success('Withdrawal request submitted');
      setShowWithdrawModal(false);
      setWithdrawData({ amount: '', remark: '' });
      getUserBalance();
    } catch (error) {
      toast.error('Failed to submit withdrawal');
    }
  };

  const fetchKYCStatus = async () => {
    try {
      if (!user?.UserId) return;
      
      setKycLoading(true);
      const response = await fetch(`https://tnsadmin.twmresearchalert.com/api/get_kyc.php?user_id=${user.UserId}`);
      const data = await response.json();
      
      // Check for KYC incomplete condition
      if (data.status === 'success' && 
          Array.isArray(data.data) && 
          data.data.length === 0 && 
          data.pagination && 
          data.pagination.total_records === '0') {
        setShowKycIncompleteAlert(true);
        setKycData(null);
        // Update cache
        await fetchAndCacheKYCStatus(user.UserId);
      } else {
        setShowKycIncompleteAlert(false);
        if (data.status === 'success' && data.data && data.data.length > 0 && data.data[0].aadhaar_image && data.data[0].pan_image) {
          setKycData(data.data[0]);
          // Update cache
          await fetchAndCacheKYCStatus(user.UserId);
        } else {
          setKycData(null);
          // Update cache
          await fetchAndCacheKYCStatus(user.UserId);
        }
      }
    } catch (error) {
      setKycData(null);
      setShowKycIncompleteAlert(false);
    } finally {
      setKycLoading(false);
    }
  };

  const handleKYCUpload = async (aadhaarFile, panFile) => {
    try {
      if (!aadhaarFile || !panFile) {
        setUploadMessage('Both files are required');
        return;
      }
      
      if (aadhaarFile.size > 2 * 1024 * 1024 || panFile.size > 2 * 1024 * 1024) {
        setUploadMessage('Each file must be less than 2MB');
        return;
      }
      
      if (!aadhaarFile.type.startsWith('image/') || !panFile.type.startsWith('image/')) {
        setUploadMessage('Only image files are allowed');
        return;
      }
      
      const formData = new FormData();
      formData.append('aadhaar_image', aadhaarFile);
      formData.append('pan_image', panFile);
      formData.append('user_id', user.UserId);
      
      setUploadMessage('Uploading...');
      
      const response = await fetch('https://tnsadmin.twmresearchalert.com/api/submit_kyc.php', {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.status === 'success') {
        setUploadMessage('KYC images submitted successfully!');
        toast.success('KYC submitted successfully!');
        setTimeout(async () => {
          await fetchKYCStatus();
          setUploadMessage('');
        }, 1500);
      } else {
        setUploadMessage(result.message || 'Submission failed. Please try again.');
      }
    } catch (error) {
      setUploadMessage('Submission failed. Please try again.');
    }
  };

  const validateAccountNo = (accountNo) => {
    const accountRegex = /^\d{9,18}$/;
    return accountRegex.test(accountNo);
  };

  const handleSaveBankDetails = async () => {
    if (!validateAccountNo(bankDetails.accountNo)) {
      toast.error('Invalid Account Number');
      return;
    }
    
    try {
      await tradingAPI.updateUserBankDetails({
        userid: user.UserId,
        bankname: bankDetails.bankName,
        accno: bankDetails.accountNo,
        ifsccode: bankDetails.ifscCode,
        accountholder: bankDetails.accountHolderName,
        mob: personalDetails?.MobileNo || '',
        email: personalDetails?.EmailId || '',
        address: personalDetails?.Address || ''
      });
      
      toast.success('Bank details updated successfully');
      setIsEditingBank(false);
    } catch (error) {
      toast.error('Failed to update bank details');
    }
  };

  const fetchDepositDetails = async () => {
    try {
      // Fetch UPI details from gateway
      const upiResponse = await fetch('https://tnsadmin.twmresearchalert.com/api/upigateway.php/upi_details/2');
      const upiData = await upiResponse.json();
      
      setDepositData({
        upiId: upiData.vpa || '',
        qrCodeUrl: upiData.upi_url || ''
      });
    } catch (error) {
      // Error handling
    }
  };

  const handleOpenDepositModal = () => {
    setShowDepositModal(true);
    fetchDepositDetails();
    // Generate transaction ID
    setPaymentData(prev => ({ ...prev, transactionId: `txn_${Date.now()}_${Math.floor(Math.random() * 1000000)}` }));
    // Reset upload state
    setUploadFile(null);
    setUploadTxnMessage('');
    setUploadTxnLoading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmitPayment = async () => {
    if (!paymentData.transactionId || !paymentData.amount || !paymentData.remark) {
      toast.error('Please fill all fields');
      return;
    }
    
    try {
      await tradingAPI.saveTransaction({
        userid: user.UserId,
        txttransid: paymentData.transactionId,
        txttransamount: paymentData.amount,
        txttransremark: paymentData.remark,
        refid: user.Refid
      });
      
      toast.success('Transaction details saved successfully');
      setShowDepositModal(false);
      setPaymentData({ transactionId: '', amount: '', remark: '' });
      getUserBalance();
    } catch (error) {
      toast.error('Failed to submit payment');
    }
  };

  const handleUploadTransactionRecord = async () => {
    // Clear previous message
    setUploadTxnMessage('');
    
    // Get userId from localStorage
    const userId = localStorage.getItem('userid');
    
    // Get txnId from paymentData.transactionId (or from input if needed)
    const txnId = paymentData.transactionId || '';
    
    // Hardcoded status
    const status = 'SUCCESS';
    
    // Validation
    if (!userId) {
      setUploadTxnMessage('User not identified.');
      return;
    }
    
    if (!txnId) {
      setUploadTxnMessage('Transaction ID is empty.');
      return;
    }
    
    if (!uploadFile) {
      setUploadTxnMessage('Please choose a file (JPG/PNG/PDF).');
      return;
    }
    
    // Create FormData
    const formData = new FormData();
    formData.append('userId', userId);
    formData.append('txnId', txnId);
    formData.append('status', status);
    formData.append('image', uploadFile);
    
    // Set loading state
    setUploadTxnLoading(true);
    setUploadTxnMessage('Uploading...');
    
    try {
      const response = await fetch('https://tnsadmin.twmresearchalert.com/api/uploadTransaction.php', {
        method: 'POST',
        body: formData
      });
      
      // Handle JSON parsing errors gracefully
      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        data = { status: 'error', message: 'Invalid JSON response' };
      }
      
      if (data && data.status === 'success') {
        setUploadTxnMessage('Uploaded successfully.');
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        setUploadFile(null);
        // Close modal after successful upload
        setTimeout(() => {
          setShowDepositModal(false);
        }, 1500);
      } else {
        setUploadTxnMessage(data && data.message ? data.message : 'Upload failed.');
      }
    } catch (error) {
      setUploadTxnMessage('Network error while uploading.');
    } finally {
      setUploadTxnLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
  };

  return (
    <div className="h-screen bg-app-bg text-app-text-primary flex flex-col">
      <div className="flex-1 overflow-y-auto pb-20">
        {/* Top Header - Sticky */}
        <div className="sticky top-0 z-40 bg-app-surface border-b border-app-border px-4 py-3">
          <div className="flex justify-between items-center">
            <h1 className="text-lg font-semibold text-app-text-primary">{user?.ClientName || 'User'}</h1>
            <Bell className="w-5 h-5 text-app-text-secondary" />
          </div>
        </div>

        {/* KYC Incomplete Alert */}
        {showKycIncompleteAlert && (
          <div className="bg-app-red text-white px-2 py-1 text-center font-medium text-xs sticky top-[52px] z-40">
            Please complete your kyc
          </div>
        )}

        <div className="max-w-lg mx-auto px-4 py-3">
        {/* User Info Card */}
        <div className="bg-app-surface rounded-xl border border-app-border p-4 mb-3 shadow-app-card">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-app-text-primary font-bold text-base mb-1">{user?.UserId || user?.Refid || 'User ID'}</div>
              <div className="text-app-text-secondary text-xs">{user?.EmailId || 'Email'}</div>
            </div>
            <div className="w-10 h-10 bg-app-blue rounded-full flex items-center justify-center">
              <span className="text-white font-semibold text-sm">
                {user?.ClientName ? user.ClientName.substring(0, 2).toUpperCase() : 'U'}
              </span>
            </div>
          </div>
        </div>

        {/* Balance Cards */}
        <div className="grid grid-cols-3 gap-1.5 mb-4">
          <div className="bg-app-surface rounded-lg border border-app-border p-2">
            <div className="text-app-text-secondary text-[10px] mb-0.5">Ledger</div>
            <div className="text-xs font-medium text-app-text-primary trading-price">₹{(balanceData.ledgerBalance || 0).toFixed(0)}</div>
          </div>
          <div className="bg-app-surface rounded-lg border border-app-border p-2">
            <div className="text-app-text-secondary text-[10px] mb-0.5">Margin</div>
            <div className="text-xs font-medium text-app-text-primary trading-price">₹{(balanceData.marginAvailable || 0).toFixed(0)}</div>
          </div>
          <div className="bg-app-surface rounded-lg border border-app-border p-2">
            <div className="text-app-text-secondary text-[10px] mb-0.5">M2M</div>
            <div className="text-xs font-medium text-app-text-primary trading-price">₹{(balanceData.m2m || 0).toFixed(0)}</div>
          </div>
        </div>

        {/* Account Menu */}
        <div className="bg-app-surface rounded-xl border border-app-border mb-4 shadow-app-card">
          <div className="px-4 py-3 border-b border-app-border">
            <h2 className="text-app-text-primary text-base font-semibold">Account</h2>
          </div>
          <div className="divide-y divide-app-border">
            <MenuItem icon={<User className="w-5 h-5" />} label="KYC" onClick={() => { setShowKYCModal(true); fetchKYCStatus(); }} />
            <MenuItem icon={<DollarSign className="w-5 h-5" />} label="Funds" onClick={() => setShowFundDetailsModal(true)} />
            <MenuItem icon={<FileText className="w-5 h-5" />} label="Bill & Invoice" onClick={() => setShowInvoiceBillModal(true)} />
            <MenuItem icon={<User className="w-5 h-5" />} label="User Trade Profile" onClick={() => setShowUserProfileModal(true)} />
            <MenuItem icon={<CreditCard className="w-5 h-5" />} label="Bank Details" onClick={() => setShowPersonalDetailsModal(true)} />
            <MenuItem icon={<Bell className="w-5 h-5" />} label="Notifications" onClick={() => setShowNotificationModal(true)} />
            <MenuItem icon={<Settings className="w-5 h-5" />} label="Change Password" onClick={() => setShowChangePasswordModal(true)} />
            <MenuItem icon={<CreditCard className="w-5 h-5" />} label="Deposit Online" onClick={handleOpenDepositModal} />
            <MenuItem icon={<CreditCard className="w-5 h-5" />} label="Withdraw Online" onClick={() => setShowWithdrawModal(true)} />
            <MenuItem icon={<Settings className="w-5 h-5" />} label="Logout" onClick={handleLogout} />
          </div>
        </div>
        </div>
      </div>

      {/* Bottom Navigation - Glassmorphism */}
      <div className="fixed bottom-0 left-0 right-0 z-50" style={{
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}>
        <div className="bg-app-surface/80 border-t border-app-border/50 px-1 sm:px-2 py-2 sm:py-3" style={{
          boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        }}>
          <div className="flex justify-around items-center">
            {bottomNavItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleTabClick(item.id)}
                className={`flex flex-col items-center py-1.5 px-2 sm:py-2 sm:px-4 rounded-xl transition-all duration-200 ${
                  item.id === 'profile' ? 'bg-app-blue/10' : ''
                }`}
                style={{
                  transform: item.id === 'profile' ? 'translateY(-2px)' : 'translateY(0)',
                }}
              >
                <item.icon 
                  className={`w-5 h-5 sm:w-7 sm:h-7 mb-0.5 sm:mb-1 transition-colors ${
                    item.id === 'profile' ? 'text-app-blue' : 'text-app-text-tertiary'
                  }`}
                />
                <span className={`text-[10px] sm:text-xs font-medium transition-colors ${
                  item.id === 'profile' ? 'text-app-blue' : 'text-app-text-tertiary'
                }`}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal show={showChangePasswordModal} onClose={() => setShowChangePasswordModal(false)} title="Change Password">
        <div className="space-y-4">
          <PasswordInput label="Current Password" value={passwords.old} onChange={(v) => setPasswords({...passwords, old: v})} show={showPasswords.old} toggleShow={() => setShowPasswords({...showPasswords, old: !showPasswords.old})} />
          <PasswordInput label="New Password" value={passwords.new} onChange={(v) => setPasswords({...passwords, new: v})} show={showPasswords.new} toggleShow={() => setShowPasswords({...showPasswords, new: !showPasswords.new})} />
          <PasswordInput label="Confirm New Password" value={passwords.confirm} onChange={(v) => setPasswords({...passwords, confirm: v})} show={showPasswords.confirm} toggleShow={() => setShowPasswords({...showPasswords, confirm: !showPasswords.confirm})} />
          <div className="flex gap-2 mt-4">
            <button onClick={handleChangePassword} className="flex-1 bg-app-blue hover:bg-app-blue-hover text-white py-2 px-3 rounded-lg text-sm font-medium transition-colors">Change Password</button>
            <button onClick={() => setShowChangePasswordModal(false)} className="flex-1 bg-app-bg hover:bg-app-border text-app-text-primary py-2 px-3 rounded-lg text-sm font-medium transition-colors">Cancel</button>
          </div>
        </div>
      </Modal>

      <Modal show={showWithdrawModal} onClose={() => setShowWithdrawModal(false)} title="Withdraw Online">
          <div className="space-y-4">
          <Input label="Enter Amount" type="number" value={withdrawData.amount} onChange={(v) => setWithdrawData({...withdrawData, amount: v})} />
          <Textarea label="Enter Remarks" value={withdrawData.remark} onChange={(v) => setWithdrawData({...withdrawData, remark: v})} />
          <div className="flex gap-2 mt-4">
            <button onClick={handleWithdraw} className="flex-1 bg-app-blue hover:bg-app-blue-hover text-white py-2 px-3 rounded-lg text-sm font-medium transition-colors">Submit</button>
            <button onClick={() => setWithdrawModal(false)} className="flex-1 bg-app-bg hover:bg-app-border text-app-text-primary py-2 px-3 rounded-lg text-sm font-medium transition-colors">Close</button>
          </div>
        </div>
      </Modal>

      <Modal show={showFundDetailsModal} onClose={() => setShowFundDetailsModal(false)} title="Transaction History" size="lg">
        <div className="max-h-[70vh] overflow-y-auto scrollbar-hide">
          <div className="flex justify-between items-center p-4 bg-app-blue/10 rounded-lg mb-4 border border-app-blue/30">
            <span className="text-sm font-normal text-app-text-secondary">User Current Balance</span>
            <span className="text-xs font-semibold text-app-green trading-price">₹{(balanceData.ledgerBalance || 0).toLocaleString('en-IN')}</span>
          </div>
          {transactionHistory && transactionHistory.length > 0 ? (
            <div className="space-y-3">
              {transactionHistory.map((t, idx) => {
                const amount = parseFloat(t.Amount || 0);
                const isNegative = amount < 0 || t.TransactionType === 'Withdrawal' || t.TransactionType === 'Loss';
                const displayAmount = Math.abs(amount);
                
                return (
                  <div key={idx} className="bg-app-bg rounded-lg p-4 border border-app-border hover:border-app-blue/30 transition-colors">
                    <div className="grid grid-cols-3 gap-4 items-center">
                      <div className="text-left">
                        <div className="text-xs font-normal text-app-text-secondary mb-1">{t.CreatedDate || '-'}</div>
                        {t.Notes && t.Notes !== 'None' && (
                          <div className="text-xs font-normal text-app-text-tertiary mt-1">{t.Notes}</div>
                        )}
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-normal text-app-text-primary">{t.TransactionType || '-'}</div>
                        {t.ScriptName && (
                          <div className="text-xs font-normal text-app-text-tertiary mt-1">{t.ScriptName}</div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className={`text-xs font-semibold trading-price ${isNegative ? 'text-app-red' : 'text-app-green'}`}>
                          {isNegative ? '-' : '+'}₹{displayAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-app-text-secondary p-12 text-sm font-normal">No transactions found</div>
          )}
        </div>
      </Modal>

      <Modal show={showNotificationModal} onClose={() => setShowNotificationModal(false)} title="Notifications">
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {notifications && notifications.length > 0 ? (
            notifications.map((n, idx) => (
              <div key={idx} className="bg-app-bg rounded-lg p-2.5 border border-app-border">
                <div className="text-sm font-medium text-app-text-primary mb-0.5">{n.Title || 'No title'} ({n.CreatedDate || '-'})</div>
                <div className="text-app-text-secondary text-xs">{n.Message || 'No message'}</div>
              </div>
            ))
          ) : (
            <div className="text-center text-app-text-secondary p-3 text-sm">No notifications found</div>
          )}
        </div>
      </Modal>

      <Modal show={showPersonalDetailsModal} onClose={() => setShowPersonalDetailsModal(false)} title="Bank Details" size="md">
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-semibold text-app-text-primary">Bank Information</h4>
            {!isEditingBank && (
              <button 
                onClick={() => setIsEditingBank(true)}
                className="text-xs text-app-blue hover:text-app-blue-hover"
              >
                Edit
              </button>
            )}
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center py-2 border-b border-app-border">
              <span className="text-xs text-app-text-secondary">Account Holder:</span>
              {isEditingBank ? (
                <input 
                  type="text"
                  value={bankDetails.accountHolderName}
                  onChange={(e) => setBankDetails({...bankDetails, accountHolderName: e.target.value})}
                  className="flex-1 ml-4 px-2 py-1 text-xs bg-app-bg border border-app-border rounded text-app-text-primary focus:outline-none focus:border-app-blue"
                />
              ) : (
                <span className="text-xs text-app-text-primary">{bankDetails.accountHolderName || '-'}</span>
              )}
            </div>

            <div className="flex justify-between items-center py-2 border-b border-app-border">
              <span className="text-xs text-app-text-secondary">Bank Name:</span>
              {isEditingBank ? (
                <input 
                  type="text"
                  value={bankDetails.bankName}
                  onChange={(e) => setBankDetails({...bankDetails, bankName: e.target.value})}
                  className="flex-1 ml-4 px-2 py-1 text-xs bg-app-bg border border-app-border rounded text-app-text-primary focus:outline-none focus:border-app-blue"
                />
              ) : (
                <span className="text-xs text-app-text-primary">{bankDetails.bankName || '-'}</span>
              )}
            </div>

            <div className="flex justify-between items-center py-2 border-b border-app-border">
              <span className="text-xs text-app-text-secondary">Account No:</span>
              {isEditingBank ? (
                <input 
                  type="text"
                  value={bankDetails.accountNo}
                  onChange={(e) => setBankDetails({...bankDetails, accountNo: e.target.value})}
                  className="flex-1 ml-4 px-2 py-1 text-xs bg-app-bg border border-app-border rounded text-app-text-primary focus:outline-none focus:border-app-blue"
                />
              ) : (
                <span className="text-xs text-app-text-primary">{bankDetails.accountNo || '-'}</span>
              )}
            </div>
            
            <div className="flex justify-between items-center py-2">
              <span className="text-xs text-app-text-secondary">IFSC:</span>
              {isEditingBank ? (
                <input 
                  type="text"
                  value={bankDetails.ifscCode}
                  onChange={(e) => setBankDetails({...bankDetails, ifscCode: e.target.value.toUpperCase()})}
                  className="flex-1 ml-4 px-2 py-1 text-xs bg-app-bg border border-app-border rounded text-app-text-primary focus:outline-none focus:border-app-blue"
                  maxLength={11}
                />
              ) : (
                <span className="text-xs text-app-text-primary">{bankDetails.ifscCode || '-'}</span>
              )}
            </div>
          </div>

          {isEditingBank && (
            <div className="flex gap-2 mt-4">
              <button 
                onClick={handleSaveBankDetails}
                className="flex-1 bg-app-blue hover:bg-app-blue-hover text-white py-2 px-3 rounded-lg text-sm font-medium transition-colors"
              >
                Save
              </button>
              <button 
                onClick={() => {
                  setIsEditingBank(false);
                  // Revert bank details
                  if (personalDetails) {
                    setBankDetails({
                      accountHolderName: personalDetails.AccountHolderName || '',
                      bankName: personalDetails.BankName || '',
                      accountNo: personalDetails.AccountNo || '',
                      ifscCode: personalDetails.IFSCCode || ''
                    });
                  }
                }}
                className="flex-1 bg-app-bg hover:bg-app-border text-app-text-primary py-2 px-3 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </Modal>

      <Modal show={showNotificationModal} onClose={() => setShowNotificationModal(false)} title="Notifications">
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {notifications && notifications.length > 0 ? (
            notifications.map((n, idx) => (
              <div key={idx} className="bg-gray-900 rounded p-2.5 border border-gray-700">
                <div className="text-sm font-medium text-gray-200 mb-0.5">{n.Title || 'No title'} ({n.CreatedDate || '-'})</div>
                <div className="text-gray-400 text-xs">{n.Message || 'No message'}</div>
              </div>
            ))
          ) : (
            <div className="text-center text-gray-400 p-3 text-sm">No notifications found</div>
          )}
        </div>
      </Modal>

      <Modal show={showPersonalDetailsModal} onClose={() => setShowPersonalDetailsModal(false)} title="Bank Details" size="md">
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-semibold text-gray-300">Bank Information</h4>
            {!isEditingBank && (
              <button 
                onClick={() => setIsEditingBank(true)}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Edit
              </button>
            )}
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center py-2 border-b border-gray-700">
              <span className="text-xs text-gray-400">Account Holder:</span>
              {isEditingBank ? (
                <input 
                  type="text"
                  value={bankDetails.accountHolderName}
                  onChange={(e) => setBankDetails({...bankDetails, accountHolderName: e.target.value})}
                  className="flex-1 ml-4 px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                />
              ) : (
                <span className="text-xs text-white">{bankDetails.accountHolderName || '-'}</span>
              )}
            </div>

            <div className="flex justify-between items-center py-2 border-b border-gray-700">
              <span className="text-xs text-gray-400">Bank Name:</span>
              {isEditingBank ? (
                <input 
                  type="text"
                  value={bankDetails.bankName}
                  onChange={(e) => setBankDetails({...bankDetails, bankName: e.target.value})}
                  className="flex-1 ml-4 px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                />
              ) : (
                <span className="text-xs text-white">{bankDetails.bankName || '-'}</span>
              )}
            </div>

            <div className="flex justify-between items-center py-2 border-b border-gray-700">
              <span className="text-xs text-gray-400">Account No:</span>
              {isEditingBank ? (
                <input 
                  type="text"
                  value={bankDetails.accountNo}
                  onChange={(e) => setBankDetails({...bankDetails, accountNo: e.target.value})}
                  className="flex-1 ml-4 px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                />
              ) : (
                <span className="text-xs text-white">{bankDetails.accountNo || '-'}</span>
              )}
            </div>
            
            <div className="flex justify-between items-center py-2">
              <span className="text-xs text-gray-400">IFSC:</span>
              {isEditingBank ? (
                <input 
                  type="text"
                  value={bankDetails.ifscCode}
                  onChange={(e) => setBankDetails({...bankDetails, ifscCode: e.target.value.toUpperCase()})}
                  className="flex-1 ml-4 px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                  maxLength={11}
                />
              ) : (
                <span className="text-xs text-white">{bankDetails.ifscCode || '-'}</span>
              )}
            </div>
          </div>

          {isEditingBank && (
            <div className="flex gap-2 mt-4">
              <button 
                onClick={handleSaveBankDetails}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-3 rounded text-sm font-medium"
              >
                Save
              </button>
              <button 
                onClick={() => {
                  setIsEditingBank(false);
                  // Revert bank details
                  if (personalDetails) {
                    setBankDetails({
                      accountHolderName: personalDetails.AccountHolderName || '',
                      bankName: personalDetails.BankName || '',
                      accountNo: personalDetails.AccountNo || '',
                      ifscCode: personalDetails.IFSCCode || ''
                    });
                  }
                }}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 px-3 rounded text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </Modal>

      <Modal show={showInvoiceBillModal} onClose={() => setShowInvoiceBillModal(false)} title="Bill & Invoice" size="lg">
        {/* Summary Section */}
        {billSummary && (
          <div className="mb-4 p-4 bg-app-bg rounded-lg border border-app-border">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-semibold text-app-text-primary">Period Summary</h3>
              <span className="text-xs text-app-text-secondary">
                {billSummary.PeriodStart || '-'} to {billSummary.PeriodEnd || '-'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex justify-between border-b border-app-border pb-2">
                <span className="text-app-text-secondary">Total Trades:</span>
                <span className="text-app-text-primary font-medium">{billSummary.TotalTrades || 0}</span>
              </div>
              <div className="flex justify-between border-b border-app-border pb-2">
                <span className="text-app-text-secondary">Total Brokerage:</span>
                <span className="text-app-text-primary font-medium trading-price">₹{parseFloat(billSummary.TotalBrokerage || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-app-border pb-2">
                <span className="text-app-text-secondary">Gross P/L:</span>
                <span className={`font-medium trading-price ${parseFloat(billSummary.GrossPL || 0) >= 0 ? 'text-app-green' : 'text-app-red'}`}>
                  ₹{parseFloat(billSummary.GrossPL || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between border-b border-app-border pb-2">
                <span className="text-app-text-secondary">Net P/L:</span>
                <span className={`font-bold text-base trading-price ${parseFloat(billSummary.NetPL || 0) >= 0 ? 'text-app-green' : 'text-app-red'}`}>
                  ₹{parseFloat(billSummary.NetPL || 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}
        
        {/* Trades Table */}
        {billInfo && billInfo.length > 0 ? (
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-app-surface">
                <tr className="border-b border-app-border">
                  <th className="text-left py-2 px-2 text-app-text-primary">S.No</th>
                  <th className="text-left py-2 px-2 text-app-text-primary">Script Name<br /><span className="text-[10px] text-app-text-secondary">Category, Lot</span></th>
                  <th className="text-center py-2 px-2 text-app-text-primary">Order Price<br /><span className="text-[10px] text-app-text-secondary">Date & Time</span></th>
                  <th className="text-center py-2 px-2 text-app-text-primary">Close Price<br /><span className="text-[10px] text-app-text-secondary">Date & Time</span></th>
                  <th className="text-right py-2 px-2 text-app-text-primary">Profit/Loss</th>
                  <th className="text-right py-2 px-2 text-app-text-primary">Brokerage</th>
                </tr>
              </thead>
              <tbody className="text-app-text-primary">
              {billInfo.map((b, idx) => {
                const pl = parseFloat(b.P_L || 0);
                const brokerage = parseFloat(b.Brokerage || 0);
                
                return (
                  <tr key={idx} className="border-b border-app-border hover:bg-app-bg">
                    <td className="py-2 px-2">{idx + 1}</td>
                    <td className="py-2 px-2">
                      <div className="font-medium text-app-text-primary">{b.ScriptName || '-'}</div>
                      <div className="text-[10px] text-app-text-secondary">{b.OrderCategory || '-'} ({b.Lot || 0})</div>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <div className="font-medium trading-price">{formatBillPrice(b.OrderPrice, b)}</div>
                      <div className="text-[10px] text-app-text-secondary">{b.OrderDate || ''}<br />{b.OrderTime || ''}</div>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <div className="font-medium trading-price">{formatBillPrice(b.BroughtBy, b)}</div>
                      <div className="text-[10px] text-app-text-secondary">{b.ClosedAt || ''}<br />{b.ClosedTime || ''}</div>
                    </td>
                    <td className={`py-2 px-2 text-right font-medium trading-price ${pl >= 0 ? 'text-app-green' : 'text-app-red'}`}>
                      ₹{pl.toFixed(2)}
                    </td>
                    <td className="py-2 px-2 text-right text-app-text-primary trading-price">₹{brokerage.toFixed(2)}</td>
                  </tr>
                );
              })}
              {/* Total Row */}
              {(() => {
                const totalPL = billInfo.reduce((sum, b) => sum + parseFloat(b.P_L || 0), 0);
                const totalBrokerage = billInfo.reduce((sum, b) => sum + parseFloat(b.Brokerage || 0), 0);
                const netPL = totalPL - totalBrokerage;
                
                return (
                  <>
                    <tr className="border-t-2 border-app-border bg-app-surface">
                      <td colSpan="4" className="py-2 px-2 text-center font-semibold text-app-text-primary">
                        Total of Profit & Loss and Brokerage
                      </td>
                      <td className="py-2 px-2 text-right font-bold text-app-text-primary trading-price">₹{totalPL.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-bold text-app-text-primary trading-price">₹{totalBrokerage.toFixed(2)}</td>
                    </tr>
                    <tr className="bg-app-bg">
                      <td colSpan="4" className="py-2 px-2 text-center font-semibold text-app-text-primary">
                        Net Profit & Loss
                      </td>
                      <td colSpan="2" className={`py-2 px-2 text-right font-bold text-lg trading-price ${netPL >= 0 ? 'text-app-green' : 'text-app-red'}`}>
                        ₹{netPL.toFixed(2)}
                      </td>
                    </tr>
                  </>
                );
              })()}
            </tbody>
          </table>
          </div>
        ) : (
          <div className="text-center text-app-text-secondary py-8 text-sm">
            No trades found for the selected period.
          </div>
        )}
      </Modal>

      <Modal show={showUserProfileModal} onClose={() => setShowUserProfileModal(false)} title="User Trade Profile" size="lg">
        <UserTradeProfileContent profileData={profileData} />
      </Modal>

            <Modal show={showDepositModal} onClose={() => setShowDepositModal(false)} title="Deposit Online" size="lg">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Left Side - QR Code */}
          <div className="flex flex-col items-center justify-center">
            {depositData.qrCodeUrl ? (
              <>
                <div className="bg-white p-3 rounded-lg shadow-lg mb-4">
                  <a href={depositData.qrCodeUrl} className="block">
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(depositData.qrCodeUrl)}`} 
                      alt="QR Code" 
                      className="w-40 h-40 rounded"
                    />
                  </a>
                </div>
                <div className="text-center mb-3">
                  <div className="text-app-text-secondary text-xs mb-1 font-normal">UPI ID</div>
                  <div className="text-app-text-primary text-sm font-normal break-all px-2">
                    <span className="text-app-blue">{depositData.upiId || '-'}</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (depositData.qrCodeUrl) {
                      window.location.href = depositData.qrCodeUrl;
                    }
                  }}
                  className="w-full bg-app-blue hover:bg-app-blue-hover text-white py-2.5 px-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1"
                >
                  <img src={upiIcon} alt="UPI" className="w-[200px] h-6" />
                  Pay via UPI
                </button>
              </>
            ) : (
              <div className="text-app-text-secondary py-20 text-sm font-normal">Loading QR Code...</div>
            )}
          </div>

          {/* Right Side - Form */}
          <div className="space-y-4">
            <p className="text-app-text-secondary text-xs mb-4 font-normal leading-relaxed">
              Please fill the details after payment for payment approval.
            </p>
            
            <div>
              <label className="block text-app-text-secondary text-xs mb-1.5 font-normal">Transaction ID</label>
              <input 
                type="text" 
                value={paymentData.transactionId}
                readOnly
                className="w-full px-3 py-2 text-sm bg-app-bg border border-app-border rounded-lg text-app-text-secondary font-normal focus:outline-none"
              />
            </div>
              
            <div>
              <label className="block text-app-text-secondary text-xs mb-1.5 font-normal">Enter Amount</label>
              <input 
                type="number" 
                value={paymentData.amount}
                onChange={(e) => setPaymentData({...paymentData, amount: e.target.value})}
                required
                className="w-full px-3 py-2 text-sm bg-app-bg border border-app-border rounded-lg text-app-text-primary font-normal focus:outline-none focus:border-app-blue"
                placeholder="0.00"
              />
            </div>
              
            <div>
              <label className="block text-app-text-secondary text-xs mb-1.5 font-normal">Enter Remarks</label>
              <textarea 
                rows={4}
                value={paymentData.remark}
                onChange={(e) => setPaymentData({...paymentData, remark: e.target.value})}
                required
                className="w-full px-3 py-2 text-sm bg-app-bg border border-app-border rounded-lg text-app-text-primary font-normal focus:outline-none focus:border-app-blue resize-none"
                placeholder="Enter payment remarks..."
              />
            </div>
              
            {/* Transaction Record Upload */}
            <div>
              <label className="block text-app-text-secondary text-xs mb-1.5 font-normal">Upload Transaction Record</label>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <label className="flex-1 cursor-pointer">
                    <input
                      ref={fileInputRef}
                      type="file"
                      id="txnUploadFile"
                      accept="image/*,application/pdf"
                      onChange={(e) => setUploadFile(e.target.files[0] || null)}
                      className="hidden"
                    />
                    <div className="w-full px-3 py-2 text-sm bg-app-bg border border-app-border rounded-lg text-app-text-secondary font-normal hover:border-app-blue/50 transition-colors flex items-center justify-between">
                      <span className="text-xs truncate">
                        {uploadFile ? uploadFile.name : 'Choose file (JPG/PNG/PDF)'}
                      </span>
                      <span className="text-xs text-app-blue ml-2">Browse</span>
                    </div>
                  </label>
                  <button
                    type="button"
                    onClick={handleUploadTransactionRecord}
                    disabled={uploadTxnLoading || !uploadFile}
                    className="px-4 py-2 bg-app-blue hover:bg-app-blue-hover disabled:bg-app-border disabled:cursor-not-allowed text-white text-xs font-normal rounded-lg transition-colors whitespace-nowrap"
                  >
                    {uploadTxnLoading ? 'Uploading...' : 'Upload'}
                  </button>
                </div>
                {uploadTxnMessage && (
                  <div
                    id="uploadTxnMsg"
                    className={`text-xs font-normal ${
                      uploadTxnMessage === 'Uploading...' || uploadTxnMessage.includes('Uploading')
                        ? 'text-app-text-secondary'
                        : uploadTxnMessage.includes('successfully') || uploadTxnMessage.includes('success')
                        ? 'text-app-green'
                        : 'text-app-red'
                    }`}
                  >
                    {uploadTxnMessage}
                  </div>
                )}
                <p className="text-app-text-tertiary text-xs font-normal">Upload a transaction record / payment screenshot</p>
              </div>
            </div>
              
            <button 
              onClick={handleSubmitPayment}
              className="w-full bg-app-blue hover:bg-app-blue-hover text-white py-2.5 px-4 rounded-lg text-sm font-normal transition-colors mt-2"
            >
              Submit Payment
            </button>
          </div>
        </div>
      </Modal>

      <Modal show={showKYCModal} onClose={() => setShowKYCModal(false)} title="KYC Details" size="lg">
        <KYCContent 
          user={user} 
          kycData={kycData} 
          onUpload={handleKYCUpload}
          uploadMessage={uploadMessage}
          loading={kycLoading}
        />
      </Modal>
    </div>
  );
};

const Modal = ({ show, onClose, title, children, size = 'md' }) => {
  if (!show) return null;
  const sizeClass = size === 'lg' ? 'max-w-4xl' : 'max-w-md';
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className={`bg-app-surface rounded-xl shadow-app-card border border-app-border ${sizeClass} max-h-[90vh] overflow-y-auto w-full`}>
        <div className="sticky top-0 bg-app-surface border-b border-app-border px-4 py-2.5 flex justify-between items-center">
          <h3 className="text-base font-semibold text-app-text-primary">{title}</h3>
          <button onClick={onClose} className="text-app-text-secondary hover:text-app-text-primary"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};

const MenuItem = ({ icon, label, badge, onClick }) => (
  <button onClick={onClick} className="w-full px-4 py-3 flex items-center justify-between hover:bg-app-bg transition-colors">
            <div className="flex items-center">
      <div className="text-app-text-secondary mr-3">{icon}</div>
      <span className="text-app-text-primary text-sm">{label}</span>
    </div>
    {badge && <span className="text-xs px-2 py-0.5 bg-orange-600 text-white rounded">{badge}</span>}
  </button>
);

const Input = ({ label, type = 'text', value, onChange, readOnly = false }) => (
  <div className="mb-3"><label className="block text-xs text-app-text-secondary mb-1">{label}</label><input type={type} value={value} onChange={(e) => onChange(e.target.value)} readOnly={readOnly} className={`w-full px-3 py-2 text-sm bg-app-bg border border-app-border rounded-lg text-app-text-primary focus:outline-none focus:border-app-blue ${readOnly ? 'cursor-not-allowed opacity-70' : ''}`} /></div>
);

const Textarea = ({ label, value, onChange }) => (
  <div className="mb-3"><label className="block text-xs text-app-text-secondary mb-1">{label}</label><textarea value={value} onChange={(e) => onChange(e.target.value)} rows="3" className="w-full px-3 py-2 text-sm bg-app-bg border border-app-border rounded-lg text-app-text-primary focus:outline-none focus:border-app-blue" /></div>
);

const PasswordInput = ({ label, value, onChange, show, toggleShow }) => (
  <div className="mb-3"><label className="block text-xs text-app-text-secondary mb-1">{label}</label><div className="relative"><input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 text-sm bg-app-bg border border-app-border rounded-lg text-app-text-primary focus:outline-none focus:border-app-blue" /><button type="button" onClick={toggleShow} className="absolute right-2 top-2 text-app-text-secondary">{show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div></div>
);

const DetailRow = ({ label, value }) => (
  <div className="mb-2"><div className="text-app-text-secondary text-xs mb-0.5">{label}</div><div className="text-app-text-primary text-sm">{value || '-'}</div></div>
);

const UserTradeProfileContent = ({ profileData }) => {
  if (!profileData) {
    return <div className="text-center text-gray-400 p-8 text-sm">Loading profile data...</div>;
  }

  const formatBrokerageValue = (profileData) => {
    const commodities = [
      'GOLD', 'BULLDEX', 'SILVER', 'CRUDEOIL', 'COPPER', 'NICKEL', 'ZINC', 'LEAD', 
      'NATURALGAS', 'ALUMINIUM', 'MENTHAOIL', 'COTTON', 'CPO', 'GOLDMINI', 'SILVERMINI', 
      'SILVERMIC', 'ALUMINI', 'CRUDEOILM', 'LEADMINI', 'NATGASMINI', 'ZINCMINI'
    ];
    
    let result = '{';
    commodities.forEach((commodity, index) => {
      const brokerage = profileData[`${commodity}_brokerage`] || '0';
      result += `"${commodity}": "${brokerage}"`;
      if (index < commodities.length - 1) {
        result += ', ';
      }
    });
    result += '}';
    return result;
  };

  const InfoRow = ({ label, value, highlight = false }) => (
    <div className="flex justify-between items-center py-2 border-b border-gray-700/50 last:border-b-0">
      <span className="text-gray-400 text-xs">{label}</span>
      <span className={`text-white text-xs font-medium ${highlight ? 'text-blue-400' : ''}`}>
        {value || '-'}
      </span>
    </div>
  );

  const SectionCard = ({ title, icon, children, gradient = false }) => (
    <div className={`${gradient ? 'bg-gradient-to-br from-gray-900 to-gray-800' : 'bg-gray-900'} p-4 rounded-lg border border-gray-700 shadow-sm`}>
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-700/50">
        {icon && <div className="text-blue-400">{icon}</div>}
        <h4 className="text-sm font-bold text-white">{title}</h4>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* MCX Section */}
      {profileData.IsMCXTrade === 'true' && (
        <SectionCard title="MCX" icon={<Activity className="w-4 h-4" />}>
          <InfoRow label="Brokerage Type" value={profileData.Mcx_Brokerage_Type} />
          {profileData.Mcx_Brokerage_Type === 'per_lot' && (
            <div className="py-2 border-b border-gray-700/50 last:border-b-0">
              <div className="text-gray-400 text-xs mb-1">Brokerage Value</div>
              <div className="text-white font-mono text-[10px] break-all bg-gray-800/50 p-2 rounded">
                {formatBrokerageValue(profileData)}
              </div>
            </div>
          )}
          {profileData.Mcx_Brokerage_Type === 'per_crore' && (
            <InfoRow label="Brokerage Value" value={profileData.MCX_brokerage_per_crore} />
          )}
          <InfoRow label="Exposure Type" value={profileData.Mcx_Exposure_Type} />
          <InfoRow label="Margin Intraday" value={profileData.Intraday_Exposure_Margin_MCX} />
          <InfoRow label="Margin Holding" value={profileData.Holding_Exposure_Margin_MCX} />
        </SectionCard>
      )}

      {/* NSE Section */}
      {profileData.IsNSETrade === 'true' && (
        <SectionCard title="NSE" icon={<TrendingUp className="w-4 h-4" />}>
          <InfoRow 
            label="Brokerage" 
            value={
              profileData.NSE_Brokerage_Type === 'per_lot' 
                ? `${profileData.Equity_brokerage_per_crore || '0'} / per_lot`
                : profileData.Equity_brokerage_per_crore || '-'
            } 
          />
          <InfoRow 
            label="Margin Intraday" 
            value={
              profileData.NSE_Exposure_Type === 'per_turnover'
                ? `${profileData.Intraday_Exposure_Margin_Equity || '0'} / per_turnover`
                : profileData.Intraday_Exposure_Margin_Equity || '-'
            } 
          />
          <InfoRow 
            label="Margin Holding" 
            value={
              profileData.NSE_Exposure_Type === 'per_turnover'
                ? `${profileData.Holding_Exposure_Margin_Equity || '0'} / per_turnover`
                : profileData.Holding_Exposure_Margin_Equity || '-'
            } 
          />
        </SectionCard>
      )}

      {/* NFO-OPT Section */}
      {profileData.IsCDSTrade === 'true' && (
        <SectionCard title="NFO-OPT" icon={<FileText className="w-4 h-4" />}>
          <InfoRow 
            label="Brokerage" 
            value={
              profileData.CDS_Brokerage_Type === 'per_lot'
                ? `${profileData.CDS_brokerage_per_crore || '0'} / per_lot`
                : profileData.CDS_brokerage_per_crore || '-'
            } 
          />
          <InfoRow 
            label="Margin Intraday" 
            value={
              profileData.CDS_Exposure_Type === 'per_turnover'
                ? `${profileData.Intraday_Exposure_Margin_CDS || '0'} / per_turnover`
                : profileData.Intraday_Exposure_Margin_CDS || '-'
            } 
          />
          <InfoRow 
            label="Margin Holding" 
            value={
              profileData.CDS_Exposure_Type === 'per_turnover'
                ? `${profileData.Holding_Exposure_Margin_CDS || '0'} / per_turnover`
                : profileData.Holding_Exposure_Margin_CDS || '-'
            } 
          />
        </SectionCard>
      )}

      {/* Crypto Section */}
      {profileData.Trade_in_crypto === 'true' && (
        <SectionCard title="Crypto"  gradient>
          <InfoRow label="Brokerage Type" value={profileData.CryptoBrokerageType} />
          <InfoRow 
            label="Brokerage" 
            value={
              profileData.CryptoBrokerageType === 'per_lot'
                ? `${profileData.CryptoBrokerage || '0'} / per_lot`
                : `${profileData.CryptoBrokerage || '-'}`
            } 
            highlight
          />
          <InfoRow label="Margin Intraday" value={profileData.CryptoIntradayMargin || '-'} />
          <InfoRow label="Min Lot (Single Trade)" value={profileData.MinLotSingleTradeCrypto || '-'} />
          <InfoRow label="Max Lot (Single Trade)" value={profileData.MaxLotSingleTradeCrypto || '-'} />
          <InfoRow label="Max Lot (Overall)" value={profileData.MaxLotOverAllTradeCrypto || '-'} />
          <InfoRow 
            label="Intraday Closing" 
            value={profileData.TradeCryptoIntradayClosing === 'true' ? 'Enabled' : 'Disabled'} 
          />
        </SectionCard>
      )}

      {/* Forex Section */}
      {profileData.Trade_in_forex === 'true' && (
        <SectionCard title="Forex" icon={<TrendingDown className="w-4 h-4" />} gradient>
          <InfoRow label="Brokerage Type" value={profileData.ForexBrokerageType} />
          <InfoRow 
            label="Brokerage" 
            value={
              profileData.ForexBrokerageType === 'per_lot'
                ? `${profileData.ForexBrokerage || '0'} / per_lot`
                : `${profileData.ForexBrokerage || '-'}`
            } 
            highlight
          />
          <InfoRow label="Margin Intraday" value={profileData.ForexIntradayMargin || '-'} />
          <InfoRow label="Min Lot (Single Trade)" value={profileData.MinLotSingleTradeForex || '-'} />
          <InfoRow label="Max Lot (Single Trade)" value={profileData.MaxLotSingleTradeForex || '-'} />
          <InfoRow label="Max Lot (Overall)" value={profileData.MaxLotOverAllTradeForex || '-'} />
          <InfoRow 
            label="Intraday Closing" 
            value={profileData.TradeForexIntradayClosing === 'true' ? 'Enabled' : 'Disabled'} 
          />
        </SectionCard>
      )}

      {/* Commodity Section */}
      {profileData.Trade_in_commodity === 'true' && (
        <SectionCard title="Commodity" icon={<Activity className="w-4 h-4" />} gradient>
          <InfoRow label="Brokerage Type" value={profileData.CommodityBrokerageType} />
          <InfoRow 
            label="Brokerage" 
            value={
              profileData.CommodityBrokerageType === 'per_lot'
                ? `${profileData.CommodityBrokerage || '0'} / per_lot`
                : `${profileData.CommodityBrokerage || '-'}`
            } 
            highlight
          />
          <InfoRow label="Margin Intraday" value={profileData.CommodityIntradayMargin || '-'} />
          <InfoRow label="Min Lot (Single Trade)" value={profileData.MinLotSingleTradeCommodity || '-'} />
          <InfoRow label="Max Lot (Single Trade)" value={profileData.MaxLotSingleTradeCommodity || '-'} />
          <InfoRow label="Max Lot (Overall)" value={profileData.MaxLotOverAllTradeCommodity || '-'} />
          <InfoRow 
            label="Intraday Closing" 
            value={profileData.TradeCommodityIntradayClosing === 'true' ? 'Enabled' : 'Disabled'} 
          />
        </SectionCard>
      )}

      {/* Empty State */}
      {!profileData.IsMCXTrade && 
       !profileData.IsNSETrade && 
       !profileData.IsCDSTrade && 
       profileData.Trade_in_crypto !== 'true' && 
       profileData.Trade_in_forex !== 'true' && 
       profileData.Trade_in_commodity !== 'true' && (
        <div className="text-center text-gray-400 p-8 text-sm">
          No trading profiles configured
        </div>
      )}
    </div>
  );
};

const KYCContent = ({ user, kycData, onUpload, uploadMessage, loading }) => {
  const [aadhaarFile, setAadhaarFile] = useState(null);
  const [panFile, setPanFile] = useState(null);

  const handleFileChange = (type, file) => {
    if (file) {
      const maxSize = 2 * 1024 * 1024; // 2MB
      if (file.size > maxSize) {
        toast.error('File size must be less than 2MB');
        return;
      }
      if (!file.type.startsWith('image/')) {
        toast.error('Only image files are allowed');
        return;
      }
    }
    
    if (type === 'aadhaar') {
      setAadhaarFile(file);
    } else {
      setPanFile(file);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (aadhaarFile && panFile) {
      onUpload(aadhaarFile, panFile);
      setAadhaarFile(null);
      setPanFile(null);
    } else {
      toast.error('Both files are required');
    }
  };

  // Show loading state
  if (loading) {
    return (
      <div className="text-center p-8 text-app-text-secondary">Loading KYC status...</div>
    );
  }

  // If KYC is already submitted, show the images and status
  if (kycData && kycData.aadhaar_image && kycData.pan_image) {
    return (
        <div className="space-y-4">
        <div className="text-center">
          <div className="mb-4">
            <div className="text-xs text-app-text-secondary mb-2">Aadhaar Image</div>
            <img 
              src={`data:image/png;base64,${kycData.aadhaar_image}`} 
              alt="Aadhaar" 
              className="max-w-full max-h-48 mx-auto rounded border border-app-border"
            />
          </div>
          <div className="mb-4">
            <div className="text-xs text-app-text-secondary mb-2">PAN Image</div>
            <img 
              src={`data:image/png;base64,${kycData.pan_image}`} 
              alt="PAN" 
              className="max-w-full max-h-48 mx-auto rounded border border-app-border"
            />
          </div>
          <div className="mt-6">
            <div className="text-sm text-app-text-secondary mb-1">Approval Status</div>
            <div className={`text-base font-semibold ${
              kycData.approval_status === 'approved' ? 'text-app-green' : 
              kycData.approval_status === 'pending' ? 'text-orange-400' : 'text-app-red'
            }`}>
              {kycData.approval_status.charAt(0).toUpperCase() + kycData.approval_status.slice(1)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If KYC not submitted, show upload form
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs text-app-text-secondary mb-2">Aadhaar Image (max 2MB, images only)</label>
        <input 
          type="file" 
          accept="image/*"
          onChange={(e) => handleFileChange('aadhaar', e.target.files[0])}
          className="w-full px-3 py-2 text-sm bg-app-bg border border-app-border rounded-lg text-app-text-secondary focus:outline-none focus:border-app-blue"
        />
        </div>
      <div>
        <label className="block text-xs text-app-text-secondary mb-2">PAN Image (max 2MB, images only)</label>
        <input 
          type="file" 
          accept="image/*"
          onChange={(e) => handleFileChange('pan', e.target.files[0])}
          className="w-full px-3 py-2 text-sm bg-app-bg border border-app-border rounded-lg text-app-text-secondary focus:outline-none focus:border-app-blue"
        />
      </div>
      {uploadMessage && (
        <div className={`text-sm p-2 rounded ${
          uploadMessage.includes('success') ? 'bg-app-green/20 text-app-green' : 'bg-app-red/20 text-app-red'
        }`}>
          {uploadMessage}
    </div>
      )}
      <button 
        type="submit" 
        className="w-full bg-app-blue hover:bg-app-blue-hover text-white py-2 px-3 rounded-lg text-sm font-medium transition-colors"
      >
        Submit KYC
      </button>
    </form>
  );
};

export default Profile;
