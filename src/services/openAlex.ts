// OpenAlex API client (no API key required)
const BASE_URL = 'https://api.openalex.org';

export interface OpenAlexAuthor {
  id: string;
  display_name: string;
  orcid?: string;
  works_count: number;
  cited_by_count: number;
  display_name_alternatives?: string[];
  h_index: number;
  i10_index: number;
  last_known_institution?: {
    display_name: string;
    country_code?: string;
  };
}

export interface OpenAlexWork {
  id: string;
  title: string;
  publication_year: number;
  cited_by_count: number;
  type: string;
  doi?: string;
  primary_location?: {
    source?: {
      display_name: string;
    };
  };
  authorships: Array<{
    author: {
      id: string;
      display_name: string;
    };
    institutions?: Array<{
      display_name?: string;
    }>;
  }>;
  topics?: Array<{
    display_name: string;
  }>;
  open_access?: {
    is_oa: boolean;
  };
}

export const searchAuthors = async (query: string): Promise<OpenAlexAuthor[]> => {
  const response = await fetch(
    `${BASE_URL}/authors?search=${encodeURIComponent(query)}&per-page=20&mailto=research@example.com`
  );
  
  if (!response.ok) throw new Error('Failed to search authors');
  
  const data = await response.json();
  return data.results;
};

export const getAuthorWorks = async (authorId: string): Promise<OpenAlexWork[]> => {
  const response = await fetch(
    `${BASE_URL}/works?filter=author.id:${authorId}&per-page=100&mailto=research@example.com`
  );
  
  if (!response.ok) throw new Error('Failed to fetch author works');
  
  const data = await response.json();
  return data.results;
};

export const searchWorksByTitle = async (
  authorId: string,
  query: string,
): Promise<OpenAlexWork[]> => {
  const response = await fetch(
    `${BASE_URL}/works?filter=author.id:${authorId}&search=${encodeURIComponent(query)}&per-page=40&mailto=research@example.com`,
  );

  if (!response.ok) throw new Error("Failed to search works by title");

  const data = await response.json();
  return data.results;
};

export const searchWorksGlobalByTitle = async (query: string): Promise<OpenAlexWork[]> => {
  const response = await fetch(
    `${BASE_URL}/works?search=${encodeURIComponent(query)}&per-page=40&mailto=research@example.com`,
  );

  if (!response.ok) throw new Error("Failed to search works by title");

  const data = await response.json();
  return data.results;
};

export const searchWorksByDoi = async (doi: string): Promise<OpenAlexWork[]> => {
  const response = await fetch(
    `${BASE_URL}/works?filter=doi:${encodeURIComponent(doi)}&per-page=5&mailto=research@example.com`,
  );

  if (!response.ok) throw new Error("Failed to search works by DOI");

  const data = await response.json();
  return data.results;
};

export const getAuthorDetails = async (authorId: string): Promise<OpenAlexAuthor> => {
  const response = await fetch(
    `${BASE_URL}/authors/${authorId}?mailto=research@example.com`
  );
  
  if (!response.ok) throw new Error('Failed to fetch author details');
  
  return response.json();
};
