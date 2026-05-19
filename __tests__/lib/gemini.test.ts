// Declare mocks first so they are hoisted
const mockGenerateContent = jest.fn();

jest.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => {
      return {
        getGenerativeModel: () => ({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          generateContent: (...args: any[]) => {
            // we will hook into this using a global mock var or override it in tests
            return mockGenerateContent(...args);
          }
        }),
      };
    }),
  };
});

import { parseIntent } from '@/lib/gemini';

describe('gemini.ts parseIntent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return default fallback intent if JSON is malformed', async () => {
    // Mock the generateContent implementation to return invalid JSON
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => 'Invalid JSON string here',
      },
    });

    const query = 'find parking near times square';
    const result = await parseIntent(query);

    expect(result).toEqual({
      location: query.slice(0, 100),
      radius_m: 500,
      filters: [],
      parking_type: null,
      van_mode: false,
      ambiguous: true,
    });

    // Ensure generateContent was actually called
    expect(mockGenerateContent).toHaveBeenCalled();
  });

  it('should parse valid JSON successfully', async () => {
    // Mock the generateContent implementation to return valid JSON
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          location: "times square",
          radius_m: 1000,
          filters: ["free"],
          parking_type: "surface",
          van_mode: true,
          ambiguous: false
        }),
      },
    });

    const query = 'find free surface parking for a van near times square';
    const result = await parseIntent(query);

    expect(result).toEqual({
      location: "times square",
      radius_m: 1000,
      filters: ["free"],
      parking_type: "surface",
      van_mode: true,
      ambiguous: false,
    });
  });
});
