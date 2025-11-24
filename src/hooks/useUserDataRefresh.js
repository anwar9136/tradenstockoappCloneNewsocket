import { useEffect, useRef, useCallback } from 'react';
import { authAPI } from '../services/api';
import { getDeviceIP } from '../utils/deviceUtils';
import { storeUserDataToLocalStorage } from '../utils/userDataStorage';

/**
 * Hook to automatically refresh user data periodically and on app focus
 * This ensures users see admin configuration changes without needing to relogin
 * 
 * @param {Object} user - Current user object from auth context
 * @param {Function} updateUser - Function to update user in auth context
 * @param {boolean} isAuthenticated - Whether user is authenticated
 */
export const useUserDataRefresh = (user, updateUser, isAuthenticated) => {
  const intervalRef = useRef(null);
  const isRefreshingRef = useRef(false);
  const lastRefreshTimeRef = useRef(null);
  const userRef = useRef(user);
  const updateUserRef = useRef(updateUser);

  // Keep refs updated
  useEffect(() => {
    userRef.current = user;
    updateUserRef.current = updateUser;
  }, [user, updateUser]);

  // Refresh interval: 1 minute (60000 ms)
  const REFRESH_INTERVAL = 1 * 60 * 1000;

  /**
   * Refresh user data from server
   */
  const refreshUserData = useCallback(async () => {
    // Prevent multiple simultaneous refresh calls
    if (isRefreshingRef.current) {
      return;
    }

    const currentUser = userRef.current;
    if (!currentUser?.UserId) {
      return;
    }

    try {
      isRefreshingRef.current = true;
      
      // Get device IP for the refresh API call
      const deviceIp = await getDeviceIP();
      
      // Call refresh API
      const response = await authAPI.refreshData(currentUser.UserId, deviceIp);
      
      // Check if response is valid
      if (response && response.UserId) {
        // Get old password from localStorage to preserve it
        const oldPassword = localStorage.getItem('oldpassword');
        
        // Store updated data to localStorage (same pattern as login)
        storeUserDataToLocalStorage(response, oldPassword);
        
        // Update auth context with new data
        const updatedUserData = {
          ...response,
          deviceId: currentUser.deviceId || null,
          deviceIp: deviceIp,
          oldpassword: oldPassword || currentUser.oldpassword || null
        };
        
        updateUserRef.current(updatedUserData);
        
        lastRefreshTimeRef.current = Date.now();
        
        // Dispatch custom event to notify components that user data was refreshed
        // This allows components to react to localStorage changes
        window.dispatchEvent(new CustomEvent('userDataRefreshed', { 
          detail: { response } 
        }));
        
        // Silently refresh - no toast notification to avoid annoying users
        // The data will be updated in the background
      }
    } catch (error) {
      // Silently fail - don't interrupt user experience
      // Only log for debugging purposes
      console.error('Error refreshing user data:', error);
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  // Set up periodic refresh when user is authenticated
  useEffect(() => {
    if (!isAuthenticated || !user?.UserId) {
      // Clear interval if user is not authenticated
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial refresh after a short delay (30 seconds) to avoid immediate refresh on login
    const initialTimeout = setTimeout(() => {
      refreshUserData();
    }, 30000);

    // Set up periodic refresh
    intervalRef.current = setInterval(() => {
      refreshUserData();
    }, REFRESH_INTERVAL);

    // Cleanup
    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAuthenticated, user?.UserId, refreshUserData]);

  // Refresh on app visibility change (when user switches back to the tab)
  useEffect(() => {
    if (!isAuthenticated || !user?.UserId) {
      return;
    }

    const handleVisibilityChange = () => {
      // Only refresh if tab becomes visible and enough time has passed since last refresh
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        const timeSinceLastRefresh = lastRefreshTimeRef.current 
          ? now - lastRefreshTimeRef.current 
          : REFRESH_INTERVAL + 1; // Force refresh if never refreshed
        
        // Refresh if more than 1 minute has passed since last refresh
        if (timeSinceLastRefresh > 60000) {
          refreshUserData();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, user?.UserId, refreshUserData]);

  // Return refresh function for manual refresh if needed
  return { refreshUserData };
};

