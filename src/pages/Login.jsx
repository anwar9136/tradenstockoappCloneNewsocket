import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Eye, EyeOff, Lock, User, Server } from 'lucide-react';
import { authAPI } from '../services/api';
import { generateDeviceId, getDeviceIP } from '../utils/deviceUtils';
import { useAuth } from '../hooks/useAuth.jsx';
import logo from '../assets/logo.svg';


const Login = () => {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    serverCode: ''
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.username || !formData.password) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);
    
    try {
      const deviceId = generateDeviceId();
      const deviceIp = await getDeviceIP();
      const masterRefId = localStorage.getItem('masteruserid') || 'null';
      
      const response = await authAPI.login(
        formData.username,
        formData.password,
        deviceId,
        formData.serverCode || 'undefined',
        masterRefId
      );

      if (response && response.UserId) {
        // Store all user data as per original logic
        const userData = {
          ...response,
          deviceId,
          deviceIp,
          oldpassword: formData.password
        };
        
        // Store ALL individual items in localStorage
        localStorage.setItem("userid", response.UserId || '');
        localStorage.setItem("ClientName", response.ClientName || '');
        localStorage.setItem("oldpassword", formData.password);
        localStorage.setItem("Refid", response.Refid || '');
        localStorage.setItem("isonlinepayment", response.isonlinepayment || '');
        localStorage.setItem("MobileNo", response.MobileNo || '');
        localStorage.setItem("EmailId", response.EmailId || '');
        localStorage.setItem("IsMCXTrade", response.IsMCXTrade || '');
        localStorage.setItem("IsNSETrade", response.IsNSETrade || '');
        localStorage.setItem("IsCDSTrade", response.IsCDSTrade || '');
        localStorage.setItem("TradeEquityUnits", response.TradeEquityUnits || '');
        localStorage.setItem("TradeMCXUnits", response.TradeMCXUnits || '');
        localStorage.setItem("TradeCDSUnits", response.TradeCDSUnits || '');
        localStorage.setItem("profittradestoptime", response.profittradestoptime || '');
        localStorage.setItem("FirstTimeLogin", response.FirstTimeLogin || '');
        localStorage.setItem("ValidTill", response["ValidTill "] || '');
        localStorage.setItem("CreditLimit", response.CreditLimit || '');
        localStorage.setItem("LedgerBalance", response.LedgerBalance || '');
        localStorage.setItem("AllowOrdersCurrentBid", response.AllowOrdersCurrentBid || '');
        localStorage.setItem("AllowFreshEntryHighAndBelow", response.AllowFreshEntryHighAndBelow || '');
        localStorage.setItem("AllowOrdersHighLow", response.AllowOrdersHighLow || '');
        localStorage.setItem("AutoCloseTradesLossesLimit", response.AutoCloseTradesLossesLimit || '');
        localStorage.setItem("auto_close_all_active_trades_when_the_losses_reach", response.auto_close_all_active_trades_when_the_losses_reach || '');
        localStorage.setItem("Maximum_lot_size_allowed_per_single_trade_of_MCX", response.Maximum_lot_size_allowed_per_single_trade_of_MCX || '');
        localStorage.setItem("Minimum_lot_size_required_per_single_trade_of_MCX", response.Minimum_lot_size_required_per_single_trade_of_MCX || '');
        localStorage.setItem("Maximum_lot_size_allowed_per_script_of_MCX_to_be", response.Maximum_lot_size_allowed_per_script_of_MCX_to_be || '');
        localStorage.setItem("Maximum_lot_size_allowed_overall_in_MCX_to_be", response.Maximum_lot_size_allowed_overall_in_MCX_to_be || '');
        localStorage.setItem("Mcx_Brokerage_Type", response.Mcx_Brokerage_Type || '');
        localStorage.setItem("MCX_brokerage_per_crore", response.MCX_brokerage_per_crore || '');
        localStorage.setItem("Mcx_Exposure_Type", response.Mcx_Exposure_Type || '');
        localStorage.setItem("BULLDEX_brokerage", response.BULLDEX_brokerage || '');
        localStorage.setItem("GOLD_brokerage", response.GOLD_brokerage || '');
        localStorage.setItem("SILVER_brokerage", response.SILVER_brokerage || '');
        localStorage.setItem("CRUDEOIL_brokerage", response.CRUDEOIL_brokerage || '');
        localStorage.setItem("COPPER_brokerage", response.COPPER_brokerage || '');
        localStorage.setItem("NICKEL_brokerage", response.NICKEL_brokerage || '');
        localStorage.setItem("ZINC_brokerage", response.ZINC_brokerage || '');
        localStorage.setItem("LEAD_brokerage", response.LEAD_brokerage || '');
        localStorage.setItem("NATURALGAS_brokerage", response.NATURALGAS_brokerage || '');
        localStorage.setItem("ALUMINIUM_brokerage", response.ALUMINIUM_brokerage || '');
        localStorage.setItem("MENTHAOIL_brokerage", response.MENTHAOIL_brokerage || '');
        localStorage.setItem("COTTON_brokerage", response.COTTON_brokerage || '');
        localStorage.setItem("CPO_brokerage", response.CPO_brokerage || '');
        localStorage.setItem("GOLDM_brokerage", response.GOLDM_brokerage || '');
        localStorage.setItem("SILVERM_brokerage", response.SILVERM_brokerage || '');
        localStorage.setItem("SILVERMIC_brokerage", response.SILVERMIC_brokerage || '');
        localStorage.setItem("ALUMINI_brokerage", response.ALUMINI_brokerage || '');
        localStorage.setItem("CRUDEOILM_brokerage", response.CRUDEOILM_brokerage || '');
        localStorage.setItem("LEADMINI_brokerage", response.LEADMINI_brokerage || '');
        localStorage.setItem("NATGASMINI_brokerage", response.NATGASMINI_brokerage || '');
        localStorage.setItem("ZINCMINI_brokerage", response.ZINCMINI_brokerage || '');
        localStorage.setItem("Intraday_Exposure_Margin_MCX", response.Intraday_Exposure_Margin_MCX || '');
        localStorage.setItem("Holding_Exposure_Margin_MCX", response.Holding_Exposure_Margin_MCX || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_BULLDEX_Intraday", response.MCX_Exposure_Lot_wise_BULLDEX_Intraday || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_BULLDEX_Holding", response.MCX_Exposure_Lot_wise_BULLDEX_Holding || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_GOLD_Intraday", response.MCX_Exposure_Lot_wise_GOLD_Intraday || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_GOLD_Holding", response.MCX_Exposure_Lot_wise_GOLD_Holding || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_SILVER_Intraday", response.MCX_Exposure_Lot_wise_SILVER_Intraday || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_SILVER_Holding", response.MCX_Exposure_Lot_wise_SILVER_Holding || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_CRUDEOIL_Intraday", response.MCX_Exposure_Lot_wise_CRUDEOIL_Intraday || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_CRUDEOIL_Holding", response.MCX_Exposure_Lot_wise_CRUDEOIL_Holding || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_ALUMINI_Intraday", response.MCX_Exposure_Lot_wise_ALUMINI_Intraday || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_ALUMINI_Holding", response.MCX_Exposure_Lot_wise_ALUMINI_Holding || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_CRUDEOILM_Intraday", response.MCX_Exposure_Lot_wise_CRUDEOILM_Intraday || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_CRUDEOILM_Holding", response.MCX_Exposure_Lot_wise_CRUDEOILM_Holding || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_LEADMINI_Intraday", response.MCX_Exposure_Lot_wise_LEADMINI_Intraday || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_LEADMINI_Holding", response.MCX_Exposure_Lot_wise_LEADMINI_Holding || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_NATGASMINI_Intraday", response.MCX_Exposure_Lot_wise_NATGASMINI_Intraday || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_NATGASMINI_Holding", response.MCX_Exposure_Lot_wise_NATGASMINI_Holding || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_ZINCMINI_Intraday", response.MCX_Exposure_Lot_wise_ZINCMINI_Intraday || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_ZINCMINI_Holding", response.MCX_Exposure_Lot_wise_ZINCMINI_Holding || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_COPPER_Intraday", response.MCX_Exposure_Lot_wise_COPPER_Intraday || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_COPPER_Holding", response.MCX_Exposure_Lot_wise_COPPER_Holding || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_NICKEL_Intraday", response.MCX_Exposure_Lot_wise_NICKEL_Intraday || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_NICKEL_Holding", response.MCX_Exposure_Lot_wise_NICKEL_Holding || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_ZINC_Intraday", response.MCX_Exposure_Lot_wise_ZINC_Intraday || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_ZINC_Holding", response.MCX_Exposure_Lot_wise_ZINC_Holding || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_LEAD_Intraday", response.MCX_Exposure_Lot_wise_LEAD_Intraday || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_LEAD_Holding", response.MCX_Exposure_Lot_wise_LEAD_Holding || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_NATURALGAS_Intraday", response.MCX_Exposure_Lot_wise_NATURALGAS_Intraday || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_NATURALGAS_Holding", response.MCX_Exposure_Lot_wise_NATURALGAS_Holding || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_ALUMINIUM_Intraday", response.MCX_Exposure_Lot_wise_ALUMINIUM_Intraday || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_ALUMINIUM_Holding", response.MCX_Exposure_Lot_wise_ALUMINIUM_Holding || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_MENTHAOIL_Intraday", response.MCX_Exposure_Lot_wise_MENTHAOIL_Intraday || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_MENTHAOIL_Holding", response.MCX_Exposure_Lot_wise_MENTHAOIL_Holding || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_COTTON_Intraday", response.MCX_Exposure_Lot_wise_COTTON_Intraday || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_COTTON_Holding", response.MCX_Exposure_Lot_wise_COTTON_Holding || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_CPO_Intraday", response.MCX_Exposure_Lot_wise_CPO_Intraday || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_CPO_Holding", response.MCX_Exposure_Lot_wise_CPO_Holding || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_GOLDM_Intraday", response.MCX_Exposure_Lot_wise_GOLDM_Intraday || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_GOLDM_Holding", response.MCX_Exposure_Lot_wise_GOLDM_Holding || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_SILVERM_Intraday", response.MCX_Exposure_Lot_wise_SILVERM_Intraday || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_SILVERM_Holding", response.MCX_Exposure_Lot_wise_SILVERM_Holding || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_SILVERMIC_Intraday", response.MCX_Exposure_Lot_wise_SILVERMIC_Intraday || '');
        localStorage.setItem("MCX_Exposure_Lot_wise_SILVERMIC_Holding", response.MCX_Exposure_Lot_wise_SILVERMIC_Holding || '');
        localStorage.setItem("NSE_Brokerage_Type", response.NSE_Brokerage_Type || '');
        localStorage.setItem("Equity_brokerage_per_crore", response.Equity_brokerage_per_crore || '');
        localStorage.setItem("NSE_Exposure_Type", response.NSE_Exposure_Type || '');
        localStorage.setItem("Intraday_Exposure_Margin_EQUITY", response.Intraday_Exposure_Margin_EQUITY || '');
        localStorage.setItem("Holding_Exposure_Margin_EQUITY", response.Holding_Exposure_Margin_EQUITY || '');
        localStorage.setItem("CDS_Brokerage_Type", response.CDS_Brokerage_Type || '');
        localStorage.setItem("CDS_brokerage_per_crore", response.CDS_brokerage_per_crore || '');
        localStorage.setItem("CDS_Exposure_Type", response.CDS_Exposure_Type || '');
        localStorage.setItem("Intraday_Exposure_Margin_CDS", response.Intraday_Exposure_Margin_CDS || '');
        localStorage.setItem("Holding_Exposure_Margin_CDS", response.Holding_Exposure_Margin_CDS || '');
        localStorage.setItem("TotalActive", response.TotalActive || '');
        localStorage.setItem("TotalPending", response.TotalPending || '');
        localStorage.setItem("TotalClosed", response.TotalClosed || '');
        
        // Crypto trading fields
        localStorage.setItem("Trade_in_crypto", response.Trade_in_crypto || '');
        localStorage.setItem("CryptoBrokerageType", response.CryptoBrokerageType || '');
        localStorage.setItem("CryptoBrokerage", response.CryptoBrokerage || '');
        localStorage.setItem("CryptoIntradayMargin", response.CryptoIntradayMargin || '');
        localStorage.setItem("MinLotSingleTradeCrypto", response.MinLotSingleTradeCrypto || '');
        localStorage.setItem("MaxLotSingleTradeCrypto", response.MaxLotSingleTradeCrypto || '');
        localStorage.setItem("MaxLotOverAllTradeCrypto", response.MaxLotOverAllTradeCrypto || '');
        localStorage.setItem("TradeCryptoIntradayClosing", response.TradeCryptoIntradayClosing || '');
        
        // Forex trading fields
        localStorage.setItem("Trade_in_forex", response.Trade_in_forex || '');
        localStorage.setItem("ForexBrokerageType", response.ForexBrokerageType || '');
        localStorage.setItem("ForexBrokerage", response.ForexBrokerage || '');
        localStorage.setItem("ForexIntradayMargin", response.ForexIntradayMargin || '');
        localStorage.setItem("MinLotSingleTradeForex", response.MinLotSingleTradeForex || '');
        localStorage.setItem("MaxLotSingleTradeForex", response.MaxLotSingleTradeForex || '');
        localStorage.setItem("MaxLotOverAllTradeForex", response.MaxLotOverAllTradeForex || '');
        localStorage.setItem("TradeForexIntradayClosing", response.TradeForexIntradayClosing || '');
        
        // Commodity trading fields
        localStorage.setItem("Trade_in_commodity", response.Trade_in_commodity || '');
        localStorage.setItem("CommodityBrokerageType", response.CommodityBrokerageType || '');
        localStorage.setItem("CommodityBrokerage", response.CommodityBrokerage || '');
        localStorage.setItem("CommodityIntradayMargin", response.CommodityIntradayMargin || '');
        localStorage.setItem("MinLotSingleTradeCommodity", response.MinLotSingleTradeCommodity || '');
        localStorage.setItem("MaxLotSingleTradeCommodity", response.MaxLotSingleTradeCommodity || '');
        localStorage.setItem("MaxLotOverAllTradeCommodity", response.MaxLotOverAllTradeCommodity || '');
        localStorage.setItem("TradeCommodityIntradayClosing", response.TradeCommodityIntradayClosing || '');
        
        // Save the complete response object as JSON for easy access
        localStorage.setItem("loginResponse", JSON.stringify(response));
        
        login(userData);
        toast.success(`Welcome back, ${response.ClientName}!`);
        navigate('/dashboard');
      } else if (response === 'false') {
        toast.error('Invalid Login Details. Please Try Again.');
      } else if (response === 'Bloked') {
        toast.error('Sorry Your Account Is Blocked');
      } else {
        toast.error('Login failed. Please check your credentials and try again.');
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Login failed. Please check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="p-6">
        <button
          onClick={() => navigate('/welcome')}
          className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col justify-center px-6">
        <div className="max-w-sm mx-auto w-full">
          {/* Logo */}
          <div className="text-center mb-8">
            <img src={logo} alt="TradeNstocko Logo" className="w-20 h-20 rounded-lg object-contain mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Login to Tradenstocko</h1>
            <p className="text-gray-600">Enter your credentials to access your account</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Username Field */}
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                className="input-trading pl-10"
                placeholder="Username"
                required
              />
            </div>

            {/* Password Field */}
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                className="input-trading pl-10 pr-10"
                placeholder="Password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            {/* Server Code Field (Optional) */}
            {/* <div className="relative">
              <Server className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                id="serverCode"
                name="serverCode"
                value={formData.serverCode}
                onChange={handleInputChange}
                className="input-trading pl-10"
                placeholder="Server Code (Optional)"
              />
            </div> */}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full btn-trading disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </div>
              ) : (
                'Login to TradeNstocko' 
              )}
            </button>
          </form>

          {/* Demo Credentials */}
          {/* <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="text-sm font-medium text-blue-900 mb-2">Demo Credentials:</h3>
            <p className="text-xs text-blue-700">
              Username: <span className="font-mono bg-blue-100 px-1 rounded">Testlogin</span>
            </p>
            <p className="text-xs text-blue-700">
              Password: <span className="font-mono bg-blue-100 px-1 rounded">54321</span>
            </p>
          </div> */}
        </div>
      </div>
    </div>
  );
};

export default Login;
