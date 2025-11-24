/**
 * Utility function to store user data to localStorage
 * This function mirrors the exact storage pattern used in Login.jsx
 * to ensure consistency across the application
 */
export const storeUserDataToLocalStorage = (response, oldPassword = null) => {
  if (!response || !response.UserId) {
    console.error('Invalid user data provided to storeUserDataToLocalStorage');
    return;
  }

  // Store ALL individual items in localStorage (same as Login.jsx)
  localStorage.setItem("userid", response.UserId || '');
  localStorage.setItem("ClientName", response.ClientName || '');
  if (oldPassword) {
    localStorage.setItem("oldpassword", oldPassword);
  }
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
};

