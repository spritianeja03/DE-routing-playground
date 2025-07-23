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
    if (path.startsWith('/api/hs-proxy')) {
      return path;
    }
    return `https://sandbox.hyperswitch.io${path}`;
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

export const toggleSR = async (merchantId: string, profileId: string) => {
  console.log("Toggling SR");
  const apiKey = localStorage.getItem("hyperswitch_apiKey");
  if (!apiKey) {
    console.error("API key not found");
    return;
  }
  const response = await fetch(getApiUrl(`/account/${merchantId}/business_profile/${profileId}/dynamic_routing/success_based/toggle?enable=dynamic_connector_selection`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'api-key': apiKey,
      'x-merchant-id': merchantId,
      'x-profile-id': profileId,
    },
  });
  const data = await response.json();
  console.log("Toggle SR response:", data);
  return data.id;
}

export const setVolumeSplit = async (merchantId: string, profileId: string) => {
  console.log("Setting volume split");
  const apiKey = localStorage.getItem("hyperswitch_apiKey");
  if (!apiKey) {
    console.error("API key not found");
    return;
  }
  await fetch(getApiUrl(`/account/${merchantId}/business_profile/${profileId}/dynamic_routing/set_volume_split?split=100`), {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'x-merchant-id': merchantId,
    },
  });
  console.log("Volume split set");
}
