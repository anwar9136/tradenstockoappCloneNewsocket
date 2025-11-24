/**
 * Utility functions for KYC status management
 */

/**
 * Fetch KYC status for a user and cache it in localStorage
 * @param {string} userId - User ID
 * @returns {Promise<boolean|null>} - true if KYC complete, false if incomplete, null on error
 */
export const fetchAndCacheKYCStatus = async (userId) => {
  if (!userId) {
    localStorage.removeItem('kycStatus');
    return null;
  }

  try {
    const response = await fetch(`https://tnsadmin.twmresearchalert.com/api/get_kyc.php?user_id=${userId}`);
    const data = await response.json();
    
    // KYC is considered complete if data exists and has both aadhaar and pan images
    const isComplete = data.status === 'success' && 
                       data.data && 
                       data.data.length > 0 && 
                       data.data[0].aadhaar_image && 
                       data.data[0].pan_image;
    
    // Cache the status in localStorage
    localStorage.setItem('kycStatus', JSON.stringify({
      status: isComplete,
      timestamp: Date.now(),
      userId: userId
    }));
    
    return isComplete;
  } catch (error) {
    console.error('Error fetching KYC status:', error);
    return null;
  }
};

/**
 * Get cached KYC status from localStorage
 * @param {string} userId - User ID to verify cache belongs to current user
 * @returns {boolean|null} - true if KYC complete, false if incomplete, null if not cached or different user
 */
export const getCachedKYCStatus = (userId) => {
  try {
    const cached = localStorage.getItem('kycStatus');
    if (!cached) return null;
    
    const parsed = JSON.parse(cached);
    
    // Check if cache is for current user and not older than 5 minutes
    const cacheAge = Date.now() - parsed.timestamp;
    const maxAge = 5 * 60 * 1000; // 5 minutes
    
    if (parsed.userId === userId && cacheAge < maxAge) {
      return parsed.status;
    }
    
    // Cache expired or different user, remove it
    localStorage.removeItem('kycStatus');
    return null;
  } catch (error) {
    console.error('Error reading cached KYC status:', error);
    return null;
  }
};

/**
 * Clear cached KYC status
 */
export const clearKYCStatusCache = () => {
  localStorage.removeItem('kycStatus');
};

