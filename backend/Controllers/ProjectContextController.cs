

using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System.IO;
using System.Threading.Tasks;
using AICommenter.Api.Services;

namespace AICommenter.Api.Controllers
{
    [ApiController]
    [Route("api/project-context")]
    public class ProjectContextController : ControllerBase
    {
        private readonly ILogger<ProjectContextController> _logger;
        private readonly ProjectContextBuilder _contextBuilder;

        public ProjectContextController(ILogger<ProjectContextController> logger, ProjectContextBuilder contextBuilder)
        {
            _logger = logger;
            _contextBuilder = contextBuilder;
        }

        /// <summary>
        /// Builds or updates the project context for the given path.
        /// </summary>
        [HttpPost("update")]
        public async Task<IActionResult> UpdateProjectContext([FromBody] UpdateProjectContextRequest request)
        {
            if (string.IsNullOrEmpty(request.ProjectPath) || !Directory.Exists(request.ProjectPath))
                return BadRequest("Invalid project path");

            try
            {
                var contextSummary = await _contextBuilder.GetProjectContextAsync(request.ProjectPath,true);
                return Ok(new { message = "Project context updated successfully", contextSummary });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to update project context");
                return StatusCode(500, new { message = "Error updating project context", details = ex.Message });
            }
        }
    }

    public class UpdateProjectContextRequest
    {
        public string ProjectPath { get; set; } = string.Empty;
    }
}
