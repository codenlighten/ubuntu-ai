import { generateStructuredResponse } from "./StructuredResponse.js";

const RELEVANT_RESULTS_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      description: "Array of the most relevant search results",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Title of the result" },
          link: { type: "string", description: "URL of the result" },
          snippet: { type: "string", description: "Snippet of the result" },
          relevanceScore: { type: "number", description: "Score indicating how relevant this result is (1-10)" }
        },
        required: ["title", "link", "snippet", "relevanceScore"]
      }
    }
  },
  required: ["results"]
};

export default class RelevantResults {
  constructor(apiKey) {
    // The apiKey is passed to the constructor but is no longer needed here,
    // as generateStructuredResponse will use the one from the environment.
  }

  /**
   * Filter a list of search results based on relevance
   * @param {string} topic - The main topic being researched
   * @param {string} subTopic - The specific sub-topic being researched
   * @param {Array} searchResults - Array of search results (objects with title, link, snippet)
   * @param {number} maxResults - Maximum number of results to return
   * @returns {Promise<Array>} - Array of the most relevant search results
   */
  async filterByRelevance(topic, subTopic, searchResults, maxResults = 10) {
    if (!searchResults || !Array.isArray(searchResults) || searchResults.length === 0) {
      return [];
    }

    // Convert search results to a simpler format to avoid token waste
    const simplifiedResults = searchResults.map(result => ({
      title: result.title || "",
      link: result.link || "",
      snippet: result.snippet || ""
    }));

    // Create a context for the AI to understand what we're looking for
    const relevanceContext = `We need highly relevant information about "${topic}" specifically focusing on "${subTopic}".
    The information should be credible, informative, and suitable for inclusion in a comprehensive book.
    Prefer sources that provide factual information, detailed explanations, or expert opinions.
    Avoid social media discussions, advertisements, and overly simplistic content.
    
    Please score and return only the most relevant results (maximum ${maxResults}) from the following list:
    
    ${JSON.stringify(simplifiedResults)}`;

    // Generate a structured response with relevance scores
    try {
      const prompt = `Analyze these search results for relevance to the topic "${topic}" with focus on "${subTopic}". 
      Score each result on a scale of 1-10 and return only the most relevant ones (max ${maxResults}).`;

      const response = await generateStructuredResponse({
        query: prompt,
        schema: RELEVANT_RESULTS_SCHEMA,
        context: relevanceContext
      });

      // Sort results by relevance score (highest first) and return them
      if (response && response.results && Array.isArray(response.results)) {
        return response.results
          .sort((a, b) => b.relevanceScore - a.relevanceScore)
          .slice(0, maxResults);
      }
      
      return [];
    } catch (error) {
      console.warn(`Error filtering results for relevance: ${error.message}`);
      return simplifiedResults.slice(0, maxResults); // Return original results if filtering fails
    }
  }

  async generateRelevantResults(query, context = "") {
    return generateStructuredResponse({
      query,
      schema: RELEVANT_RESULTS_SCHEMA,
      context
    });
  }
}
