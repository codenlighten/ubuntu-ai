import dotenv from "dotenv";
import { google } from "googleapis";
dotenv.config();

const customsearch = google.customsearch("v1");

const API_KEY = process.env.GOOGLE_API_KEY;
const CSE_ID = process.env.CSE_ID;

/**
 * Performs a Google Custom Search.
 * @param {string} query - The search query.
 * @param {number} [numResults=10] - Optional number of results to request (default 10, max typically 10 for free tier CSE, but API might allow more).
 * @returns {Promise<object[]|null>} - A promise that resolves to an array of search results or null if an error occurs.
 */
async function searchGoogle(query, numResults = 10) {
  if (!API_KEY || !CSE_ID) {
    console.error("Error: GOOGLE_API_KEY or CSE_ID is missing from .env file.");
    return [];
  }

  // Validate numResults (Google only allows max 10 per request)
  const validNumResults = Math.min(10, numResults);
  if (validNumResults !== numResults) {
    console.log(`Limiting results per request to 10 (Google API limit). Will perform multiple requests if needed.`);
  }

  // Validate and clean the query
  if (!query || typeof query !== "string") {
    console.error("Error: Search query must be a non-empty string");
    return [];
  }

  // Remove any special characters that might cause API issues
  const sanitizedQuery = query.replace(/[^\w\s]/gi, ' ').trim();
  
  // Limit query length to avoid API errors
  const trimmedQuery = sanitizedQuery.substring(0, 100);
  
  if (trimmedQuery.length < query.length) {
    console.log(`Query was trimmed from ${query.length} to ${trimmedQuery.length} characters`);
  }

  try {
    console.log(`Searching for: "${trimmedQuery}"`);
    
    // Basic search with minimal parameters to reduce error chance
    const searchParams = {
      q: trimmedQuery,
      auth: API_KEY,
      cx: CSE_ID,
      num: validNumResults
    };
    
    const res = await customsearch.cse.list(searchParams);

    if (res.data.items && res.data.items.length > 0) {
      // Process and return the results
      return res.data.items.map((item) => ({
        title: item.title || "No title available",
        link: item.link || "#",
        snippet: item.snippet || "No snippet available",
      }));
    } else {
      console.log("No results found for query:", trimmedQuery);
      // Fallback to a simpler query if needed
      if (trimmedQuery.includes(' ') && trimmedQuery.length > 30) {
        const simpleQuery = trimmedQuery.split(' ').slice(0, 3).join(' ');
        console.log(`Trying a simpler query: "${simpleQuery}"`);
        
        // Recursive call with simpler query
        return searchGoogle(simpleQuery, validNumResults);
      }
      return [];
    }
  } catch (error) {
    // Handle different types of errors
    console.error("Error performing Google Custom Search:", error.message);
    
    if (error.response && error.response.data) {
      console.error(
        "Google API Error Details:",
        JSON.stringify(error.response.data, null, 2)
      );
      
      // Handle specific errors
      if (error.response.data.error && error.response.data.error.status === "INVALID_ARGUMENT") {
        console.log("Trying alternative search approach with minimal parameters...");
        
        try {
          // Try a very minimal search with just the first keyword
          const keywords = trimmedQuery.split(' ');
          const minimalQuery = keywords[0];
          
          console.log(`Searching with minimal query: "${minimalQuery}"`);
          
          const simpleRes = await customsearch.cse.list({
            auth: API_KEY,
            cx: CSE_ID,
            q: minimalQuery
          });
          
          if (simpleRes.data.items && simpleRes.data.items.length > 0) {
            return simpleRes.data.items.map((item) => ({
              title: item.title || "No title available",
              link: item.link || "#",
              snippet: item.snippet || "No snippet available",
            }));
          }
        } catch (fallbackError) {
          console.error("Fallback search also failed:", fallbackError.message);
        }
      }
    }
    
    // Return empty array instead of null for more consistent behavior
    return [];
  }
}

// Helper function to run multiple searches and combine results
async function searchGoogleWithPagination(query, totalResults = 10) {
  // Google only allows 10 results per request, so we need to make multiple requests
  // with different starting indices to get more results
  const maxResultsPerRequest = 10;
  const numRequests = Math.ceil(totalResults / maxResultsPerRequest);
  let allResults = [];
  
  // Try first with the original query
  const firstBatch = await searchGoogle(query, Math.min(totalResults, maxResultsPerRequest));
  allResults = [...firstBatch];
  
  // If we got results and need more, continue with pagination
  if (allResults.length > 0 && numRequests > 1) {
    for (let i = 1; i < numRequests; i++) {
      // Each request should get the next batch of results
      const start = i * maxResultsPerRequest + 1;
      const remaining = totalResults - allResults.length;
      
      if (remaining <= 0) break;
      
      // We need a special version of searchGoogle that supports start index
      // This is typically not implemented in the free tier of Google Custom Search API
      // So this is more of a placeholder for possible future implementation
    }
  } 
  // If first batch failed, try with a simpler query
  else if (allResults.length === 0) {
    // Try with just the main subject
    const simplifiedQuery = query.split(' ')[0];
    allResults = await searchGoogle(simplifiedQuery, Math.min(totalResults, maxResultsPerRequest));
  }
  
  return allResults;
}

export { searchGoogle, searchGoogleWithPagination };
