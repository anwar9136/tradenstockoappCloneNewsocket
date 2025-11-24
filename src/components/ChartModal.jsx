import React, { useState, useEffect, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';

const ChartModal = ({ isOpen, onClose, symbol: propSymbol }) => {
  const [selectedTimeframe, setSelectedTimeframe] = useState('60');
  const [isLoading, setIsLoading] = useState(true);
  const containerRef = useRef(null);
  const widgetRef = useRef(null);
  const scriptRef = useRef(null);
  
  // Extract pure symbol name without any prefixes
  const getTradingViewSymbol = (symbol) => {
    if (!symbol) return 'BTCUSD';
    
    // If it's already a string, extract the symbol name (before underscore if present)
    if (typeof symbol === 'string') {
      // Split by underscore and take the first part (e.g., "EURUSD_FOREX" -> "EURUSD")
      const symbolName = symbol.split('_')[0].toUpperCase();
      return symbolName || 'BTCUSD';
    }
    
    // If it's an object with SymbolName or ScriptName, extract the symbol name
    const symbolName = symbol.SymbolName || symbol.ScriptName || symbol.symbol || 'BTCUSD';
    // Extract the symbol name (before underscore if present)
    const pureSymbol = symbolName.split('_')[0].toUpperCase();
    return pureSymbol || 'BTCUSD';
  };

  const tradingViewSymbol = getTradingViewSymbol(propSymbol);
  const displayName = typeof propSymbol === 'string' ? propSymbol.split('_')[0] : propSymbol?.SymbolName?.split('_')[0] || propSymbol?.ScriptName?.split('_')[0] || 'N/A';

  // Timeframe options for TradingView
  const timeframes = [
    { label: '1m', value: '1' },
    { label: '5m', value: '5' },
    { label: '15m', value: '15' },
    { label: '30m', value: '30' },
    { label: '1h', value: '60' },
    { label: '4h', value: '240' },
    { label: '1d', value: 'D' },
    { label: '1w', value: 'W' },
  ];

  const handleTimeframeChange = (tf) => {
    if (selectedTimeframe === tf.value) return;
    setSelectedTimeframe(tf.value);
    
    // Reload widget with new timeframe
    if (widgetRef.current && containerRef.current) {
      // Remove old widget
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      widgetRef.current = null;
      
      // Create new widget
      setTimeout(() => {
        initializeTradingView();
      }, 100);
    }
  };

  const initializeTradingView = () => {
    if (!containerRef.current || !isOpen) return;
    
    // Clear container
    containerRef.current.innerHTML = '';
    
    // Check if script already exists
    if (!scriptRef.current) {
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.id = 'tradingview-widget-script';
      
      script.onload = () => {
        createWidget();
      };
      
      script.onerror = () => {
        setIsLoading(false);
        console.error('Failed to load TradingView script');
      };
      
      document.head.appendChild(script);
      scriptRef.current = script;
    } else {
      // Script already loaded, create widget directly
      if (window.TradingView) {
        createWidget();
      } else {
        // Wait for script to load
        const checkTradingView = setInterval(() => {
          if (window.TradingView) {
            clearInterval(checkTradingView);
            createWidget();
          }
        }, 100);
        
        setTimeout(() => {
          clearInterval(checkTradingView);
        }, 5000);
      }
    }
  };

  const createWidget = () => {
    if (!containerRef.current || !window.TradingView) return;
    
    setIsLoading(false);
    
    try {
      widgetRef.current = new window.TradingView.widget({
        autosize: true,
        symbol: tradingViewSymbol,
        interval: selectedTimeframe,
        theme: "dark",
        container_id: containerRef.current.id || "tradingview_widget",
        hide_side_toolbar: false, // Show drawing tools sidebar
        allow_symbol_change: true,
        save_image: false,
        hideideas: true,
        studies: [], // Start with no indicators, user can add them
        locale: "en",
        toolbar_bg: "#131722",
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_legend: false,
        withdateranges: true,
        range: "1M", // Show 1 month by default
        height: containerRef.current.clientHeight || 600,
        width: containerRef.current.clientWidth || 800,
      });
    } catch (error) {
      console.error('Error creating TradingView widget:', error);
      setIsLoading(false);
    }
  };

  // Initialize TradingView when modal opens
  useEffect(() => {
    if (!isOpen) {
      // Cleanup when modal closes
      if (widgetRef.current) {
        widgetRef.current = null;
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      return;
    }

    // Set container ID if not set
    if (containerRef.current && !containerRef.current.id) {
      containerRef.current.id = 'tradingview_widget_' + Date.now();
    }

    // Initialize TradingView
    setIsLoading(true);
    initializeTradingView();

    // Cleanup on unmount
    return () => {
      if (widgetRef.current) {
        widgetRef.current = null;
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [isOpen, tradingViewSymbol]);

  // Update widget when symbol changes
  useEffect(() => {
    if (!isOpen || !widgetRef.current) return;
    
    // Reload widget with new symbol
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }
    widgetRef.current = null;
    
    setTimeout(() => {
      initializeTradingView();
    }, 100);
  }, [tradingViewSymbol]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-2">
      <div className="bg-[#131722] rounded-lg w-full max-w-7xl h-[95vh] flex flex-col border border-[#2a2e39]">
        {/* Header with timeframe selection */}
        <div className="flex justify-between items-center p-2 border-b border-[#2a2e39]">
          <div className="flex items-center space-x-4">
            <h3 className="text-xs font-semibold text-[#d1d4dc]">{displayName}</h3>
            
          </div>
          <button onClick={onClose} className="text-[#787b86] hover:text-[#d1d4dc] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* TradingView Chart Container */}
        <div className="flex-1 overflow-hidden min-h-0 relative bg-[#131722]">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#131722] bg-opacity-90 z-10 rounded">
              <Loader2 className="w-8 h-8 animate-spin text-[#2962ff]" />
            </div>
          )}
          <div 
            ref={containerRef} 
            id="tradingview_widget"
            className="w-full h-full"
            style={{ minHeight: '600px' }}
          />
        </div>
      </div>
    </div>
  );
};

export default ChartModal;
