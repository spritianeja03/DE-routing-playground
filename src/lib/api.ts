const getBaseUrl = (): string => {
  if (typeof window === 'undefined') {
    // Return a default or handle server-side rendering
    return 'https://sandbox.hyperswitch.io';
  }

  const hostname = window.location.hostname;

  if (hostname.includes('sandbox.hyperswitch.io')) {
    return 'https://sandbox.hyperswitch.io';
  }
  if (hostname.includes('integ.hyperswitch.io')) {
    return 'https://integ.hyperswitch.io';
  }
  if (hostname.includes('live.hyperswitch.io')) {
    return 'https://live.hyperswitch.io';
  }
  // Default for local development
  return ''; 
};

export const getApiUrl = (path: string): string => {
  const baseUrl = getBaseUrl();
  
  // For local development, we use a proxy which is handled by the path itself.
  if (!baseUrl) {
    // Special case for fetching merchant connectors directly
    if (path.includes('/profile/connectors')) {
      return `https://sandbox.hyperswitch.io${path}`;
    }
    return path;
  }
  
  return `${baseUrl}${path.replace('/api/hs-proxy', '')}`;
};

export const getPaymentApiUrl = (path: string): string => {
    const baseUrl = getBaseUrl();

    if (!baseUrl) {
        // For local development, the full path for payments is used directly
        return 'https://sandbox.hyperswitch.io/payments';
    }
    
    return `${baseUrl}${path}`;
}
