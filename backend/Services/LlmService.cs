using System.Net.Http;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;

public class LlmService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<LlmService>? _logger;

    public LlmService(ILogger<LlmService>? logger = null)
    {
        _httpClient = new HttpClient
        {
            Timeout = TimeSpan.FromMinutes(5)
        };
        _logger = logger;
    }

    public async Task<string> AddCommentsAsync(string code, string language)
    {
        _logger?.LogInformation("AddCommentsAsync called for language: {Language}", language);
        Console.WriteLine($"[LlmService] AddCommentsAsync called for language: {language}");

        var modelEndpoint = "http://localhost:11434/api/generate";
        // var prompt = $"Add concise, relevant comments to the following {language} code:\n\n{code}";

        /*var prompt = $@"
        You are a professional software developer.
        For the following code, add **in-line comments** only.
        Do NOT change the code logic, structure, or variable names. DO NOT add additional code outside the original snippet.
        Return ONLY the code with comments and do not return any extra text.
        Insert comments using ""//"" at the correct locations in the code.
        Do NOT include any explanations, text, or Markdown code blocks before or after the code.
        

        Example input code:
        int sum(int a, int b) {{
            return a + b;
        }}

        Expected output with comments:
        int sum(int a, int b) {{
        // Take two integers as input
        // Return their sum
        return a + b;
        }}

        Code:
        {code}
        ";*/
        
        var prompt = $@"
                    You are a professional software developer.
                    For the following code, add **in-line comments** only.
                    Do NOT change the code logic, structure, or variable names. DO NOT add additional code outside the original snippet.

                    Return the comments as a **JSON array** where each object has:
                    - ""line"": the zero-based line number of the code where the comment should be inserted
                    - ""comment"": the comment text to insert

                    Do NOT include any explanations, text, or Markdown code blocks outside the JSON.
                    Return ONLY valid JSON.

                    Example input code:
                    int sum(int a, int b) {{
                        return a + b;
                    }}

                    Expected JSON output:
                    [
                    {{ ""line"": 0, ""comment"": ""// Take two integers as input"" }},
                    {{ ""line"": 1, ""comment"": ""// Return their sum"" }}
                    ]

                    Code:
                    {code}
                    ";


        _logger?.LogInformation("Prompt prepared");
        Console.WriteLine("[LlmService] Prompt prepared");

        var payload = new { model = "codellama", prompt = prompt, stream = false };
        var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
        _logger?.LogInformation("Sending request to LLM endpoint");
        Console.WriteLine("[LlmService] Sending request to LLM endpoint");

        var response = await _httpClient.PostAsync(modelEndpoint, content);
        _logger?.LogInformation("Received response from LLM endpoint");
        Console.WriteLine("[LlmService] Received response from LLM endpoint");
        Console.WriteLine("AI Response: " + response);

        var result = await response.Content.ReadAsStringAsync();
        _logger?.LogInformation("Parsing response JSON");
        Console.WriteLine("[LlmService] Parsing response JSON");

        using var doc = JsonDocument.Parse(result);
        var hasResponse = doc.RootElement.TryGetProperty("response", out var val);
        _logger?.LogInformation("Response property found: {HasResponse}", hasResponse);
        Console.WriteLine($"[LlmService] Response property found: {hasResponse}");

        var finalResult = hasResponse ? val.GetString() ?? code : code;
        _logger?.LogInformation("Returning result");
        Console.WriteLine("[LlmService] Returning result");
return finalResult;
    }
}

