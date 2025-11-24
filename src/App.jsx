import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useState, useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import MarketWatch from './pages/MarketWatch';
import Orders from './pages/Orders';
import Portfolio from './pages/Portfolio';
import Tools from './pages/Tools';
import Profile from './pages/Profile';
import SplashScreen from './pages/SplashScreen';
import OnboardingStep1 from './pages/OnboardingStep1';
import OnboardingStep2 from './pages/OnboardingStep2';
import Welcome from './pages/Welcome';
import Registration from './pages/Registration';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import OrderTrade from './pages/OrderTrade';

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route 
        path="/onboarding-step-1" 
        element={<OnboardingStep1 />} 
      />
      <Route 
        path="/onboarding-step-2" 
        element={<OnboardingStep2 />} 
      />
      <Route 
        path="/welcome" 
        element={<Welcome />} 
      />
      <Route 
        path="/login" 
        element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login />} 
      />
      <Route 
        path="/registration" 
        element={isAuthenticated ? <Navigate to="/dashboard" /> : <Registration />} 
      />
      <Route 
        path="/dashboard" 
        element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />} 
      />
      <Route 
        path="/marketwatch" 
        element={isAuthenticated ? <MarketWatch /> : <Navigate to="/login" />} 
      />
      <Route 
        path="/order/:token" 
        element={isAuthenticated ? <OrderTrade /> : <Navigate to="/login" />} 
      />
      <Route 
        path="/orders" 
        element={isAuthenticated ? <Orders /> : <Navigate to="/login" />} 
      />
      <Route 
        path="/portfolio" 
        element={isAuthenticated ? <Portfolio /> : <Navigate to="/login" />} 
      />
      <Route 
        path="/tools" 
        element={isAuthenticated ? <Tools /> : <Navigate to="/login" />} 
      />
      <Route 
        path="/profile" 
        element={isAuthenticated ? <Profile /> : <Navigate to="/login" />} 
      />
      <Route 
        path="/" 
        element={<Navigate to="/onboarding-step-1" />} 
      />
    </Routes>
  );
}

function AppContent() {
  const [showSplash, setShowSplash] = useState(true);
  const [hasSeenSplash, setHasSeenSplash] = useState(false);

  const handleSplashFinish = () => {
    setShowSplash(false);
    setHasSeenSplash(true);
  };

  // Show splash screen only on first visit
  if (showSplash && !hasSeenSplash) {
    return <SplashScreen onFinish={handleSplashFinish} />;
  }

  return (
    <div className="min-h-screen bg-white">
      <AppRoutes />
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
          },
        }}
      />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

export default App;
