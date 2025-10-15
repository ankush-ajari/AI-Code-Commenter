using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using static CommentGenerationService;
namespace AICommenter.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CommentsController : ControllerBase
    {
    private readonly CommentGenerationService _commentGenerationService;
    public CommentsController(CommentGenerationService commentGenerationService) => _commentGenerationService = commentGenerationService;

        [HttpPost]
        public async Task<ActionResult<List<AIComment>>> Post([FromBody] CommentRequest request)
        {
            var result = await _commentGenerationService.GenerateCommentsAsync(request.Code, request.Language, request.ProjectPath);
            //return Ok(result);
            return Ok(JsonSerializer.Serialize(result));
        }
    }

    // Updated record to include optional project path
    public record CommentRequest(string Code, string Language, string ProjectPath);

}