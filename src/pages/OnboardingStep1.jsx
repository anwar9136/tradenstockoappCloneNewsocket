import React from 'react';
import { useNavigate } from 'react-router-dom';

const OnboardingStep1 = () => {
  const navigate = useNavigate();

  const handleNext = () => {
    navigate('/onboarding-step-2');
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center p-6">
        <div className="w-8 h-8 bg-trading-primary-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm">T</span>
        </div>
        <div className="text-sm text-trading-neutral-500">1 of 2</div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        {/* Illustration */}
        <div className="mb-8 max-w-sm">
          <div className="bg-gradient-to-br from-trading-primary-50 to-trading-success-50 rounded-2xl p-8 mb-6 relative">
            <div className="flex items-center justify-center space-x-4">
              {/* Person at laptop */}
              <div className="w-16 h-16 bg-trading-primary-600 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </div>
              
              {/* Laptop */}
              <div className="w-20 h-12 bg-trading-dark-700 rounded-lg flex items-center justify-center">
                <div className="w-16 h-8 bg-trading-success-400 rounded"></div>
              </div>
            </div>
            
            {/* Gold coins */}
            <div className="absolute top-4 right-4 space-y-1">
              <div className="w-6 h-6 bg-trading-warning-400 rounded-full"></div>
              <div className="w-6 h-6 bg-trading-warning-400 rounded-full"></div>
              <div className="w-6 h-6 bg-trading-warning-400 rounded-full"></div>
            </div>
            
            {/* Chart */}
            <div className="absolute bottom-4 left-4 w-20 h-12 bg-white rounded-lg shadow-sm flex items-end justify-center space-x-1 p-2">
              <div className="w-2 h-4 bg-trading-success-500 rounded"></div>
              <div className="w-2 h-6 bg-trading-success-500 rounded"></div>
              <div className="w-2 h-8 bg-trading-success-500 rounded"></div>
              <div className="w-2 h-5 bg-trading-success-500 rounded"></div>
              <div className="w-2 h-7 bg-trading-success-500 rounded"></div>
            </div>
          </div>
        </div>

        {/* Text Content */}
        <div className="text-center mb-12">
          <h1 className="text-2xl font-bold text-trading-neutral-900 mb-4">
            Largest stock broker in India
          </h1>
          <p className="text-trading-neutral-600 text-lg leading-relaxed">
            Join millions of traders who trust Tradenstocko for their trading journey
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="p-6">
        {/* Progress dots */}
        <div className="flex justify-center space-x-2 mb-6">
          <div className="w-3 h-3 bg-trading-primary-600 rounded-full"></div>
          <div className="w-3 h-3 bg-trading-neutral-300 rounded-full"></div>
        </div>

        {/* Next button */}
        <button
          onClick={handleNext}
          className="w-full btn-trading"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default OnboardingStep1;
