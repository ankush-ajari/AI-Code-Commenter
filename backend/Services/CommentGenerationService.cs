using System.Net.Http;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;

using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using AICommenter.Api.Services;

public class CommentGenerationService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<CommentGenerationService> _logger;
    private readonly ProjectContextBuilder _contextBuilder;

    public CommentGenerationService(ILogger<CommentGenerationService> logger, ProjectContextBuilder contextBuilder)
    {
        _httpClient = new HttpClient
        {
            Timeout = TimeSpan.FromMinutes(5)
        };
        _logger = logger;

        // 🆕 Initialize context builder with your project root path
        var projectRoot = Directory.GetCurrentDirectory();
        _contextBuilder = contextBuilder;
    }


    public async Task<List<AIComment>> GenerateCommentsAsync(string code, string language, string projectPath)
    {
        _logger?.LogInformation("AddCommentsAsync called for language: {Language}", language);
        Console.WriteLine($"[LlmService] AddCommentsAsync called for language: {language}");

        string projectContext = await LoadCondensedContextFromFileAsync(projectPath);

        Console.WriteLine("Project Context: " + projectContext);

        var modelEndpoint = "http://localhost:11434/api/generate";

        // --- JSON-enforced Prompt ---
        var prompt = $@"
        You are a senior developer reviewing code within a larger project.

        PROJECT CONTEXT:
        {projectContext}

        Your task:
        - Add meaningful inline comments explaining what each part of the given code does.
        - Return a structured JSON array only, where each element has:
        {{
            ""line"": <0-based line number relative to input>,
            ""comment"": ""// comment text""
        }}

        Rules:
        - Analyze only the code provided between [CODE] and [/CODE].
        - Do NOT output any explanations, reasoning, markdown, or extra text.
        - Do NOT repeat or restate the example.
        - Return ONLY valid JSON array.

        [CODE]
        {code}
        [/CODE]
        ";

        prompt += "\nReturn only valid JSON array. Begin your answer with '[' and end with ']'.";

        // --- Send Request ---
        var payload = new
        {
            model = "mistral:instruct", //"codellama", // Change if using another model
            prompt = prompt,
            stream = false,
            temperature = 0.2
        };

        var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        _logger?.LogInformation("Sending request to LLM endpoint");
        Console.WriteLine("[LlmService] Sending request to LLM endpoint");

        var response = await _httpClient.PostAsync(modelEndpoint, content);

        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync();
            _logger?.LogError("Error from LLM: {Code} - {Error}", response.StatusCode, err);
            throw new Exception($"LLM request failed: {response.StatusCode}");
        }

        _logger?.LogInformation("Received response from LLM endpoint");
        Console.WriteLine("[LlmService] Received response from LLM endpoint");

        var rawResult = await response.Content.ReadAsStringAsync();
        _logger?.LogInformation("Raw LLM Response: {Raw}", rawResult);
        //Console.WriteLine("AI Response: " + rawResult);

        // --- Extract JSON text ---
        string jsonText = ExtractJsonArrayFromTaggedResponse(rawResult);

        Console.WriteLine("jsonText: " + jsonText);

        // --- Parse into List<AIComment> ---
        try
        {
            var options = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true,
                ReadCommentHandling = JsonCommentHandling.Skip,
                AllowTrailingCommas = true
            };

            // Extra validation: ensure jsonText starts with '[' and ends with ']'
            if (string.IsNullOrWhiteSpace(jsonText) || !jsonText.TrimStart().StartsWith("[") || !jsonText.TrimEnd().EndsWith("]"))
            {
                _logger?.LogError("Malformed JSON array. Content: {Json}", jsonText);
                Console.WriteLine("[LlmService] Malformed JSON array: " + jsonText);
                return new List<AIComment>();
            }

            var comments = JsonSerializer.Deserialize<List<AIComment>>(jsonText, options);
            if (comments == null)
            {
                throw new Exception("Deserialized JSON is null.");
            }

            _logger?.LogInformation("Successfully parsed {Count} comments", comments.Count);
            return comments;
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "Failed to parse JSON. Content: {Json}", jsonText);
            Console.WriteLine("[LlmService] JSON parse error: " + ex.Message);
            return new List<AIComment>();
        }
    }


    /// <summary>
    /// Loads the condensed project context from project_context_condensed.json if present,
    /// otherwise falls back to project_context.json.
    /// </summary>
    private async Task<string> LoadCondensedContextFromFileAsync(string projectPath)
    {
        try
        {
            var condensedPath = Path.Combine(projectPath, "project_context_condensed.json");
            var fullPath = Path.Combine(projectPath, "project_context.json");

            if (File.Exists(condensedPath))
            {
                _logger?.LogInformation("Loading condensed project context from {Path}", condensedPath);
                return await File.ReadAllTextAsync(condensedPath);
            }
            else if (File.Exists(fullPath))
            {
                _logger?.LogInformation("Condensed project context not found. Using full context from {Path}", fullPath);
                return await File.ReadAllTextAsync(fullPath);
            }
            else
            {
                _logger?.LogWarning("No project context files found in {Path}", projectPath);
                return string.Empty;
            }
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "Error while loading project context from {Path}", projectPath);
            return string.Empty;
        }
    }



    /// <summary>
    /// Extracts only the JSON array portion from Ollama's wrapped response.
    /// </summary>
    private static string ExtractJson(string response)
    {
        try
        {
            using var doc = JsonDocument.Parse(response);
            if (doc.RootElement.TryGetProperty("response", out var resp))
            {
                var inner = resp.GetString();
                if (!string.IsNullOrEmpty(inner))
                {
                    int first = inner.IndexOf('[');
                    int last = inner.LastIndexOf(']');
                    if (first >= 0 && last > first)
                    {
                        return inner.Substring(first, last - first + 1);
                    }
                }
            }
        }
        catch
        {
            // If not valid JSON, try manual substring extraction
        }

        int s = response.IndexOf('[');
        int e = response.LastIndexOf(']');
        if (s >= 0 && e > s)
        {
            return response.Substring(s, e - s + 1);
        }

        return "[]";
    }


    /// <summary>
    /// Extracts only the JSON array portion from LLM's response, ignoring tags like [PYTHON] ... [/PYTHON].
    /// </summary>
    /*private static string ExtractJsonArrayFromTaggedResponse(string response)
    {
        if (string.IsNullOrWhiteSpace(response))
            return "[]";

        // --- 1️⃣ Try to extract from {"response": "..."} if wrapped ---
        string text = response;
        try
        {
            using var doc = JsonDocument.Parse(response);
            if (doc.RootElement.TryGetProperty("response", out var resp))
            {
                text = resp.GetString() ?? response;
            }
        }
        catch
        {
            // ignore if not JSON object, treat as raw
            text = response;
        }

        // --- 2️⃣ Clean up unwanted wrappers and tokens ---
        text = Regex.Replace(text, @"(?i)\[/?python\]|\[/?test\]|```[a-z]*|```", "", RegexOptions.Multiline);
        text = text.Replace("\\n", "\n").Replace("\\r", "").Trim();

        // --- 3️⃣ Extract the JSON array portion ---
        int start = text.IndexOf('[');
        int end = text.LastIndexOf(']');
        if (start >= 0 && end > start)
        {
            text = text.Substring(start, end - start + 1);
        }
        else
        {
            // fallback: no valid array detected
            return "[]";
        }

        // --- 4️⃣ Ensure valid JSON (remove leading return statements, etc.) ---
        text = Regex.Replace(text, @"^[^\[]*return\s+", "", RegexOptions.IgnoreCase);
        text = Regex.Replace(text, @"^\s*return\s+", "", RegexOptions.IgnoreCase);

        // --- 5️⃣ Trim and clean trailing commas or artifacts ---
        text = Regex.Replace(text, @",(\s*])", "$1");
        text = text.Trim();

        return text;

    }*/

    private static string ExtractJsonArrayFromTaggedResponse(string response)
    {

        if (string.IsNullOrWhiteSpace(response))
            return "[]";

        string text = response;

        // --- 1️⃣ Unwrap {"response": "..."} if present ---
        try
        {
            using var doc = JsonDocument.Parse(response);
            if (doc.RootElement.TryGetProperty("response", out var resp))
            {
                text = resp.GetString() ?? response;
            }
        }
        catch
        {
            text = response;
        }

        // --- 2️⃣ Remove common wrappers and tags ---
        text = Regex.Replace(text, @"(?i)\[/?python\]|\[/?test\]|\[/?code\]|```[a-z]*|```", "", RegexOptions.Multiline);
        text = text.Replace("\r", "").Replace("\n", "").Trim();

        // --- 3️⃣ Remove outer quotes if returned as "\"[...]"\" ---
        if (text.StartsWith("\"") && text.EndsWith("\""))
        {
            text = text.Substring(1, text.Length - 2);
            text = text.Replace("\\\"", "\"");
        }

        // --- 4️⃣ Extract JSON array portion ---
        int start = text.IndexOf('[');
        int end = text.LastIndexOf(']');
        if (start < 0 || end <= start)
            return "[]";
        text = text.Substring(start, end - start + 1);

        // --- 5️⃣ Preprocess text to fix common LLM formatting issues ---
        text = Regex.Replace(text, @",\s*,", ",");       // duplicate commas
        text = Regex.Replace(text, @",\s*(\])", "$1");   // trailing comma before ]
        text = Regex.Replace(text, @"\\(?![""\\/bfnrtu])", ""); // stray backslashes
        text = Regex.Replace(text, @"[\x00-\x1F]", ""); // control characters

        // --- 6️⃣ Parse array of stringified objects safely ---
        var skippedItems = new List<string>();
        try
        {
            using var parsed = JsonDocument.Parse(text);
            var arr = parsed.RootElement;

            if (arr.ValueKind == JsonValueKind.Array)
            {
                var fixedList = new List<JsonElement>();

                foreach (var elem in arr.EnumerateArray())
                {
                    if (elem.ValueKind == JsonValueKind.String)
                    {
                        var s = elem.GetString();
                        if (string.IsNullOrWhiteSpace(s))
                            continue;

                        s = s.Replace("\\\"", "\"");
                        s = Regex.Replace(s, @"[\x00-\x1F]", "");

                        try
                        {
                            using var innerDoc = JsonDocument.Parse(s);
                            var root = innerDoc.RootElement;
                            if (root.ValueKind == JsonValueKind.Object &&
                                root.TryGetProperty("line", out _) &&
                                root.TryGetProperty("comment", out _))
                            {
                                fixedList.Add(root.Clone());
                            }
                            else
                            {
                                skippedItems.Add(s);
                            }
                        }
                        catch
                        {
                            skippedItems.Add(s);
                        }
                    }
                    else if (elem.ValueKind == JsonValueKind.Object)
                    {
                        fixedList.Add(elem.Clone());
                    }
                    else
                    {
                        skippedItems.Add(elem.ToString());
                    }
                }

                if (skippedItems.Count > 0)
                {
                    Console.WriteLine($"[LLM JSON Extraction] Skipped {skippedItems.Count} invalid elements:");
                    foreach (var item in skippedItems)
                    {
                        Console.WriteLine(item);
                    }
                }

                if (fixedList.Count > 0)
                    return JsonSerializer.Serialize(fixedList, new JsonSerializerOptions { WriteIndented = true });
            }
        }
        catch
        {
            // fallback
        }

        // --- 7️⃣ Final fallback cleanup ---
        text = Regex.Replace(text, @",(\s*])", "$1").Trim();
        return text;
    }
}

    /// <summary>
    /// Represents a single in-line comment suggestion.
    /// </summary>
    public class AIComment
    {
        [JsonPropertyName("line")]
        public int Line { get; set; }

        [JsonPropertyName("comment")]
        public string Comment { get; set; } = string.Empty;
    }
