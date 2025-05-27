import { NextRequest, NextResponse } from 'next/server';

const HYPERSWITCH_API_BASE_URL = 'https://sandbox.hyperswitch.io';

// Define a custom RequestInit type that includes 'duplex'
interface RequestInitWithDuplex extends RequestInit {
  duplex?: 'half';
}

async function handler(req: NextRequest, { params }: { params: { slug: string[] } }) {
  const { slug } = params;
  const path = slug.join('/');
  const targetUrl = `${HYPERSWITCH_API_BASE_URL}/${path}`;

  const headers = new Headers();
  // Forward essential headers from the client
  const apiKey = req.headers.get('api-key');
  const contentType = req.headers.get('Content-Type');
  const accept = req.headers.get('Accept');
  const xProfileId = req.headers.get('x-profile-id'); // For /profile/connectors

  if (apiKey) {
    headers.set('api-key', apiKey);
  }
  if (contentType) {
    headers.set('Content-Type', contentType);
  }
  if (accept) {
    headers.set('Accept', accept);
  }
  if (xProfileId) {
    headers.set('x-profile-id', xProfileId);
  }
  
  // Add any other headers you might need to forward or set

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
      duplex: 'half' // Added for streaming request bodies in Node.js fetch
    } as RequestInitWithDuplex); // Cast to our custom type

    // Create a new NextResponse to stream the response back
    // This copies status, statusText, and headers from the origin response.
    const nextResponse = new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });

    return nextResponse;

  } catch (error) {
    console.error(`[HS_PROXY_ERROR] Failed to proxy request to ${targetUrl}:`, error);
    return NextResponse.json(
      { message: 'Error proxying request to Hyperswitch API', error: (error as Error).message },
      { status: 500 }
    );
  }
}

export { handler as GET, handler as POST, handler as PATCH, handler as PUT, handler as DELETE };
