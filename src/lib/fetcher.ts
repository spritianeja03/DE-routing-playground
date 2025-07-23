export const fetcher = async (url: string, options: RequestInit = {}) => {
  const apiKey = localStorage.getItem("apiKey");
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (apiKey) {
    headers.set("api-key", apiKey);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error("An error occurred while fetching the data.");
  }

  return response.json();
};
