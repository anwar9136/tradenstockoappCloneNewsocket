import { useState, useEffect, createContext, useContext } from 'react';
import { useUserDataRefresh } from './useUserDataRefresh';
import { authAPI } from '../services/api';
import { getDeviceIP } from '../utils/deviceUtils';
import { storeUserDataToLocalStorage } from '../utils/userDataStorage';

const AuthContext = createContext();

// Internal component to handle user data refresh
// This must be inside the AuthProvider to access the context
function AuthRefreshHandler({ user, updateUser, isAuthenticated }) {
  useUserDataRefresh(user, updateUser, isAuthenticated);
  return null;
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        setUser(userData);
        setIsAuthenticated(true);
      } catch (error) {
        console.error('Error parsing saved user data:', error);
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  const login = (userData) => {
    setUser(userData);
    setIsAuthenticated(true);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('user');
    localStorage.clear();
  };

  const updateUser = (updatedData) => {
    const newUserData = { ...user, ...updatedData };
    setUser(newUserData);
    localStorage.setItem('user', JSON.stringify(newUserData));
  };

  /**
   * Manually refresh user data from server
   * This can be called when needed (e.g., before critical actions)
   */
  const refreshUserData = async () => {
    if (!user?.UserId) {
      return false;
    }

    try {
      const deviceIp = await getDeviceIP();
      const response = await authAPI.refreshData(user.UserId, deviceIp);
      
      if (response && response.UserId) {
        const oldPassword = localStorage.getItem('oldpassword');
        storeUserDataToLocalStorage(response, oldPassword);
        
        const updatedUserData = {
          ...response,
          deviceId: user.deviceId || null,
          deviceIp: deviceIp,
          oldpassword: oldPassword || user.oldpassword || null
        };
        
        updateUser(updatedUserData);
        
        // Dispatch custom event to notify components that user data was refreshed
        window.dispatchEvent(new CustomEvent('userDataRefreshed', { 
          detail: { response } 
        }));
        
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error refreshing user data:', error);
      return false;
    }
  };

  const value = {
    user,
    isAuthenticated,
    loading,
    login,
    logout,
    updateUser,
    refreshUserData
  };

  return (
    <AuthContext.Provider value={value}>
      <AuthRefreshHandler 
        user={user} 
        updateUser={updateUser} 
        isAuthenticated={isAuthenticated} 
      />
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
