// Generate a unique device ID
export const generateDeviceId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Get device IP (simplified version)
export const getDeviceIP = async () => {
  try {
    const response = await fetch('https://api.ipify.org');
    return await response.text();
  } catch (error) {
    console.error('Error getting device IP:', error);
    return '127.0.0.1';
  }
};

// Generate a random reference ID
export const generateRefId = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};
