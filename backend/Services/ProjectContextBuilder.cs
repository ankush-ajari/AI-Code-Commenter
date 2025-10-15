namespace AICommenter.Api.Services
{
    using System.Text;
    using System.Text.Json;
    using Microsoft.Extensions.Logging;

    public class ProjectContextBuilder
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<ProjectContextBuilder> _logger;
        private string? _cacheFilePath;
        private string? _cacheSummaryFilePath;
        private readonly TimeSpan _cacheValidity = TimeSpan.FromDays(2);

        public ProjectContextBuilder(ILogger<ProjectContextBuilder> logger)
        {
            _httpClient = new HttpClient { Timeout = TimeSpan.FromMinutes(10) };
            _logger = logger;
        }

        public async Task<string> GetProjectContextAsync(string projectPath, bool rebuildContext)
        {
            if (rebuildContext)
                ClearCache();

            if (string.IsNullOrWhiteSpace(projectPath))
                throw new ArgumentException("Project path cannot be null or empty", nameof(projectPath));

            _cacheFilePath = Path.Combine(projectPath, "project_context.json");
            _cacheSummaryFilePath = Path.Combine(projectPath, "project_context_condensed.json");
            _logger.LogInformation("Using project context cache path: {Path}", _cacheFilePath);

            if (File.Exists(_cacheFilePath))
            {
                var cacheInfo = new FileInfo(_cacheFilePath);
                if (DateTime.UtcNow - cacheInfo.LastWriteTimeUtc < _cacheValidity)
                {
                    _logger.LogInformation("Loading cached project context from {Path}", _cacheFilePath);
                    return await File.ReadAllTextAsync(_cacheFilePath);
                }
                _logger.LogInformation("Cached project context expired. Rebuilding...");
            }

            _logger.LogInformation("Building new project context for path: {Path}", projectPath);

            var files = Directory.GetFiles(projectPath, "*.*", SearchOption.AllDirectories)
                .Where(f => f.EndsWith(".cs") || f.EndsWith(".js") || f.EndsWith(".ts") || f.EndsWith(".py"))
                .ToList();

            var summaries = new List<string>();
            const int batchSize = 3; // number of files per batch to feed LLM

            for (int i = 0; i < files.Count; i += batchSize)
            {
                var batchFiles = files.Skip(i).Take(batchSize).ToList();
                var batchContent = new StringBuilder();

                foreach (var file in batchFiles)
                {
                    try
                    {
                        var content = await File.ReadAllTextAsync(file);
                        batchContent.AppendLine($"File: {Path.GetFileName(file)}");
                        batchContent.AppendLine(content);
                        batchContent.AppendLine();
                        _logger.LogInformation("Reading file: {File}", file);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Error reading file {File}", file);
                    }
                }

                var prompt = $@"
                            You are a senior software architect reviewing a project. 
                            Summarize the following code batch in plain text. Include purpose, main modules, key classes, and data models. 
                            Do NOT output code, JSON, or markdown.

                            {batchContent}
                            ";

                var payload = new
                {
                    model = "mistral:instruct",
                    prompt = prompt,
                    stream = false,
                    temperature = 0
                };

                var response = await _httpClient.PostAsync(
                    "http://localhost:11434/api/generate",
                    new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
                );

                if (!response.IsSuccessStatusCode)
                {
                    var err = await response.Content.ReadAsStringAsync();
                    throw new Exception($"Failed to generate project context: {response.StatusCode} - {err}");
                }

                var rawResult = await response.Content.ReadAsStringAsync();
                var summaryPart = ExtractResponseText(rawResult);
                _logger.LogInformation("Batch summary:\n{SummaryPart}", summaryPart);
                summaries.Add(summaryPart);
            }

            // Merge all batch summaries into final summary
            var finalSummary = string.Join("\n\n", summaries);

            var summaryText = await GetCondensedContextAsync(finalSummary);

            // Save to cache
            await File.WriteAllTextAsync(_cacheFilePath, finalSummary);
            await File.WriteAllTextAsync(_cacheSummaryFilePath, summaryText);
            _logger.LogInformation("Project context and Summary context cached at {Path} and {Path2} respectively", _cacheFilePath, _cacheSummaryFilePath);

            return finalSummary;
        }

        public void ClearCache()
        {
            if (!string.IsNullOrWhiteSpace(_cacheFilePath) && File.Exists(_cacheFilePath))
            {
                File.Delete(_cacheFilePath);
                _logger.LogInformation("Deleted cached project context at {Path}", _cacheFilePath);
            }
            if (!string.IsNullOrWhiteSpace(_cacheSummaryFilePath) && File.Exists(_cacheSummaryFilePath))
            {
                File.Delete(_cacheSummaryFilePath);
                _logger.LogInformation("Deleted cached project summary context at {Path}", _cacheSummaryFilePath);
            }
        }

        private static string ExtractResponseText(string response)
        {
            try
            {
                using var doc = JsonDocument.Parse(response);
                if (doc.RootElement.TryGetProperty("response", out var resp))
                    return resp.GetString()?.Trim() ?? "";
            }
            catch
            {
                // fallback: return raw text
            }
            return response.Trim();
        }

        public async Task<string> GetCondensedContextAsync(string fullContext)
        {
            //var fullContext = await GetProjectContextAsync(projectPath,false);

            var prompt = $@"
            Summarize the following project description into 5-10 concise bullet points.
            Each point should be under 20 words and focus on system purpose, architecture, and key modules.

            {fullContext}
            ";

            var payload = new
            {
                model = "mistral:instruct",
                prompt = prompt,
                stream = false,
                temperature = 0.1
            };

            var response = await _httpClient.PostAsync(
                "http://localhost:11434/api/generate",
                new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
            );

            var rawResult = await response.Content.ReadAsStringAsync();
            return ExtractResponseText(rawResult);
        }


    }
}
