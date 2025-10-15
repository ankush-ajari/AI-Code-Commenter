using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;


var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSingleton<LlmService>();
builder.Services.AddSingleton<CommentGenerationService>();
builder.Services.AddSingleton<AICommenter.Api.Services.ProjectContextBuilder>();

var app = builder.Build();
app.UseSwagger();
app.UseSwaggerUI();
app.MapControllers();

// Simple health check endpoint
app.MapGet("/api/test", () =>
{
    return Results.Ok(new { message = "Backend is running ✅" });
});

app.Run();