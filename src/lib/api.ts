const getBaseUrl = (): string => {
  if (typeof window === 'undefined') {
    // Return a default or handle server-side rendering
    return 'https://integ.hyperswitch.io/api';
  }

  const hostname = window.location.hostname;

  if (hostname.includes('sandbox.hyperswitch.io')) {
    return 'https://sandbox.hyperswitch.io';
  }
  if (hostname.includes('integ.hyperswitch.io')) {
    return 'https://integ.hyperswitch.io';
  }
  if (hostname.includes('integ-api.hyperswitch.io')) {
    return 'https://integ-api.hyperswitch.io';
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
    return `https://integ.hyperswitch.io/api${path}`;
  }
  
  return `${baseUrl}${path.replace('/api/hs-proxy', '')}`;
};

export const getPaymentApiUrl = (path: string): string => {
    const baseUrl = getBaseUrl();

    if (!baseUrl) {
        // For local development, the full path for payments is used directly
        return 'https://integ.hyperswitch.io/api/payments';
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

export const activateRoutingAlgorithm = async (routingAlgoId: string) => {
  console.log("Activating routing algorithm with ID:", routingAlgoId);
  const apiKey = localStorage.getItem("hyperswitch_apiKey");
  if (!apiKey) {
    console.error("API key not found");
    return;
  }

  try {
    const response = await fetch(getApiUrl(`/api/hs-proxy/routing/${routingAlgoId}/activate`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: "Failed to activate routing algorithm." }));
      console.error("[activateRoutingAlgorithm] API Error:", errorData.message || `HTTP ${response.status}`);
      throw new Error(errorData.message || `HTTP ${response.status}`);
    } else {
      const responseData = await response.json();
      console.log("[activateRoutingAlgorithm] Response Data:", responseData);
      return responseData;
    }
  } catch (error: any) {
    console.error("[activateRoutingAlgorithm] Fetch Error:", error);
    throw error;
  }
};

export const updateRuleConfiguration = async (
  merchantId: string,
  profileId: string,
  explorationPercent: number,
  bucketSize: number,
  toggle_routing_id: string
) => {
  if (!profileId) {
    console.warn("[updateRuleConfiguration] Missing profileId.");
    return;
  }

  const apiKey = localStorage.getItem("hyperswitch_apiKey");
  if (!apiKey) {
    console.error("API key not found");
    return;
  }

  const payload = {
    decision_engine_configs: {
      defaultLatencyThreshold: 90,
      defaultSuccessRate: 100,
      defaultBucketSize: 200,
      defaultHedgingPercent: 5,
      subLevelInputConfig: [
        {
          paymentMethod: "card",
          bucketSize: bucketSize,
          hedgingPercent: explorationPercent 
        }
      ]
    }
  };

  try {
    const response = await fetch(getApiUrl(`/api/hs-proxy/account/${merchantId}/business_profile/${profileId}/dynamic_routing/success_based/config/${toggle_routing_id}`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': apiKey,
        'x-merchant-id': merchantId,
        'x-profile-id': profileId,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: "Failed to update rule configuration." }));
      console.error("[updateRuleConfiguration] API Error:", errorData.message || `HTTP ${response.status}`);
      throw new Error(errorData.message || `HTTP ${response.status}`);
    } else {
      const responseData = await response.json();
      console.log("[updateRuleConfiguration] Response Data:", responseData);
      
      // Use the ID from the update SR config response to activate the routing algorithm
      if (responseData && responseData.id) {
        console.log("[updateRuleConfiguration] Using new routing algorithm ID from response:", responseData.id);
        
        // Hit volume split API before activating the rule
        await setVolumeSplit(merchantId, profileId);
        
        // Activate the routing algorithm with the new ID
        await activateRoutingAlgorithm(responseData.id);
        
        return responseData;
      } else {
        console.warn("[updateRuleConfiguration] No ID found in update SR config response. Cannot activate routing algorithm.");
        throw new Error("No routing algorithm ID found in response. Activation skipped.");
      }
    }
  } catch (error: any) {
    console.error("[updateRuleConfiguration] Fetch Error:", error);
    throw error;
  }
};
