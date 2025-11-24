import React from 'react';
import { useNavigate } from 'react-router-dom';

const OnboardingStep2 = () => {
  const navigate = useNavigate();

  const handleGetStarted = () => {
    navigate('/welcome');
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center p-6">
        <div className="w-8 h-8 bg-trading-primary-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm">T</span>
        </div>
        <div className="text-sm text-trading-neutral-500">2 of 2</div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        {/* Illustration */}
        <div className="mb-8 max-w-sm">
          <div className="bg-gradient-to-br from-green-50 to-blue-50 rounded-2xl p-8 mb-6">
            <div className="flex flex-col items-center space-y-4">
              {/* Person on beanbag */}
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </div>
              
              {/* Beanbag chair */}
              <div className="w-20 h-12 bg-yellow-400 rounded-2xl transform rotate-12"></div>
              
              {/* Mobile phone with chart */}
              <div className="absolute top-8 right-8 w-16 h-24 bg-gray-800 rounded-lg shadow-lg flex flex-col">
                <div className="w-full h-4 bg-gray-700 rounded-t-lg"></div>
                <div className="flex-1 p-2">
                  <div className="w-full h-16 bg-green-400 rounded flex items-end justify-center space-x-1">
                    <div className="w-1 h-4 bg-white rounded"></div>
                    <div className="w-1 h-6 bg-white rounded"></div>
                    <div className="w-1 h-8 bg-white rounded"></div>
                    <div className="w-1 h-5 bg-white rounded"></div>
                  </div>
                </div>
              </div>
              
              {/* Plant */}
              <div className="absolute bottom-8 left-8 w-8 h-12 bg-green-600 rounded-t-lg">
                <div className="w-12 h-8 bg-green-500 rounded-full -ml-2"></div>
              </div>
              
              {/* Gold coins */}
              <div className="absolute bottom-4 right-4 space-y-1">
                <div className="w-4 h-4 bg-yellow-400 rounded-full"></div>
                <div className="w-4 h-4 bg-yellow-400 rounded-full"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Text Content */}
        <div className="text-center mb-12">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Start your trading journey with Tradenstocko
          </h1>
          <p className="text-gray-600 text-lg leading-relaxed">
            Trade from anywhere, anytime with our powerful and intuitive platform
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="p-6">
        {/* Progress dots */}
        <div className="flex justify-center space-x-2 mb-6">
          <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
        </div>

        {/* Get started button */}
        <button
          onClick={handleGetStarted}
          className="w-full btn-trading"
        >
          Get started!
        </button>
      </div>
    </div>
  );
};

export default OnboardingStep2;
