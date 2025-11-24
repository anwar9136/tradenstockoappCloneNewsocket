import React, { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';

const Charts = ({ 
  symbol = 'BTCUSD',
  data = [],
  height = 400,
  theme = 'dark',
  chartType = 'candlestick' // 'candlestick' or 'line'
}) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height });

  // Theme configuration
  const themeConfig = {
    dark: {
      layout: {
        background: { color: '#0d1117' },
        textColor: '#DDD',
      },
      grid: {
        vertLines: { color: '#222' },
        horzLines: { color: '#222' },
      },
      crosshair: {
        mode: 0,
      },
      rightPriceScale: {
        borderColor: '#333',
      },
      timeScale: {
        borderColor: '#333',
        timeVisible: true,
        secondsVisible: false,
      },
    },
    light: {
      layout: {
        background: { color: '#FFFFFF' },
        textColor: '#191919',
      },
      grid: {
        vertLines: { color: '#E0E0E0' },
        horzLines: { color: '#E0E0E0' },
      },
      crosshair: {
        mode: 0,
      },
      rightPriceScale: {
        borderColor: '#E0E0E0',
      },
      timeScale: {
        borderColor: '#E0E0E0',
        timeVisible: true,
        secondsVisible: false,
      },
    },
  };

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;
    
    // Wait for container to have dimensions
    const initChart = () => {
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const width = rect.width || container.clientWidth || 800;
      
      // Ensure we have valid dimensions before creating chart
      if (width <= 0 || height <= 0) {
        setTimeout(initChart, 50);
        return;
      }

      try {
        // Verify createChart is available
        if (typeof createChart !== 'function') {
          console.error('createChart is not a function. Check lightweight-charts import.');
          return;
        }

        // Create chart
        const chart = createChart(container, {
          width,
          height,
          layout: themeConfig[theme].layout,
          grid: themeConfig[theme].grid,
          crosshair: themeConfig[theme].crosshair,
          rightPriceScale: themeConfig[theme].rightPriceScale,
          timeScale: themeConfig[theme].timeScale,
          autoSize: false,
        });

        // Verify chart was created and has required methods
        if (!chart) {
          console.error('Chart creation returned null/undefined');
          return;
        }

        if (typeof chart.addCandlestickSeries !== 'function' && typeof chart.addLineSeries !== 'function') {
          console.error('Chart object missing addSeries methods. Chart object:', chart);
          return;
        }

        // Add series based on chart type
        let series;
        if (chartType === 'candlestick') {
          if (typeof chart.addCandlestickSeries === 'function') {
            series = chart.addCandlestickSeries({
              upColor: '#26a69a',
              downColor: '#ef5350',
              borderVisible: false,
              wickUpColor: '#26a69a',
              wickDownColor: '#ef5350',
            });
          } else {
            console.error('addCandlestickSeries is not a function');
            return;
          }
        } else {
          if (typeof chart.addLineSeries === 'function') {
            series = chart.addLineSeries({
              color: '#2196F3',
              lineWidth: 2,
            });
          } else {
            console.error('addLineSeries is not a function');
            return;
          }
        }

        if (!series) {
          console.error('Failed to create series');
          return;
        }

        chartRef.current = chart;
        seriesRef.current = series;

        // Set initial data
        if (data && data.length > 0) {
          series.setData(data);
        }
      } catch (error) {
        console.error('Error creating chart:', error);
        console.error('Error details:', {
          message: error.message,
          stack: error.stack,
          createChartType: typeof createChart,
          container: container,
          width,
          height
        });
      }
    };

    // Delay initialization to ensure DOM is ready
    const timer = setTimeout(initChart, 100);

    return () => {
      clearTimeout(timer);
      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch (error) {
          console.error('Error removing chart:', error);
        }
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, [symbol, chartType, theme, height]); // Re-initialize if these change

  // Update data when it changes
  useEffect(() => {
    if (seriesRef.current && data && data.length > 0) {
      seriesRef.current.setData(data);
    }
  }, [data]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        const container = chartContainerRef.current;
        const rect = container.getBoundingClientRect();
        const width = rect.width || container.clientWidth || 800;
        
        chartRef.current.applyOptions({ width });
        setContainerSize({ width, height });
      }
    };

    // Initial size calculation
    handleResize();

    // Add resize listener
    window.addEventListener('resize', handleResize);

    // Use ResizeObserver for more accurate container size tracking
    let resizeObserver;
    if (chartContainerRef.current && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(chartContainerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver && chartContainerRef.current) {
        resizeObserver.unobserve(chartContainerRef.current);
      }
    };
  }, []);

  return (
    <div className="w-full h-full flex flex-col">
      <div
        ref={chartContainerRef}
        className="w-full"
        style={{ height: `${height}px`, minHeight: '300px' }}
      />
    </div>
  );
};

export default Charts;

