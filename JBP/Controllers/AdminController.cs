using JBP.Data;
using JBP.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace JBP.Controllers
{
    [Authorize(Roles = "admin")]
    [ApiController]
    [Route("api/[controller]")]
    public class AdminController : ControllerBase
    {
        private readonly ApplicationDbContext _context;

        public AdminController(ApplicationDbContext context) => _context = context;

        [HttpGet("dashboard")]
        public IActionResult Dashboard() => Ok(new
        {
            TotalUsers = _context.Users.Count(user => user.Role != "admin"),
            TotalCandidates = _context.Candidates.Count(),
            TotalFreshers = _context.Candidates.Count(candidate => candidate.CandidateType == "fresher"),
            TotalExperienced = _context.Candidates.Count(candidate => candidate.CandidateType == "experienced"),
            TotalEmployers = _context.EmployerProfiles.Count()
        });

        [HttpGet("users")]
        public IActionResult Users() => Ok(_context.Users.Where(user => user.Role != "admin").OrderBy(user => user.FullName).ToList());

        [HttpGet("candidates")]
        public IActionResult Candidates([FromQuery] string? type)
        {
            var candidates = _context.Candidates.AsQueryable();
            if (!string.IsNullOrWhiteSpace(type))
                candidates = candidates.Where(candidate => candidate.CandidateType == type.ToLower());
            return Ok(candidates.OrderBy(candidate => candidate.FullName).ToList());
        }

        [HttpGet("employers")]
        public IActionResult Employers() => Ok(_context.EmployerProfiles.Include(profile => profile.User)
            .OrderBy(profile => profile.CompanyName).Select(profile => new
            {
                profile.Id, profile.UserId, profile.CompanyName, profile.OfficialEmail, profile.GstNumber,
                profile.CinNumber, profile.Website, profile.CreatedAt, ContactName = profile.User != null ? profile.User.FullName : ""
            }).ToList());

        [HttpPut("users/{id:int}")]
        public IActionResult UpdateUser(int id, [FromBody] User update)
        {
            var user = _context.Users.Find(id);
            if (user == null) return NotFound();
            user.FullName = update.FullName.Trim(); user.Email = update.Email.Trim(); user.Role = update.Role.Trim().ToLower();
            _context.SaveChanges(); return Ok(user);
        }

        [HttpPut("candidates/{id:int}")]
        public IActionResult UpdateCandidate(int id, [FromBody] Candidate update)
        {
            var candidate = _context.Candidates.Find(id);
            if (candidate == null) return NotFound();
            candidate.FullName = update.FullName.Trim(); candidate.Email = update.Email.Trim();
            candidate.Phone = update.Phone?.Trim() ?? ""; candidate.Location = update.Location?.Trim() ?? "";
            candidate.Skills = update.Skills?.Trim() ?? ""; candidate.Experience = update.Experience;
            candidate.CandidateType = update.CandidateType.Trim().ToLower();
            candidate.Dob = update.Dob; candidate.Salary = update.Salary?.Trim() ?? "";
            candidate.EmploymentHistory = update.EmploymentHistory?.Trim(); candidate.ResumePath = update.ResumePath?.Trim() ?? "";
            candidate.AadhaarVerified = update.AadhaarVerified; candidate.PanVerified = update.PanVerified; candidate.UanVerified = update.UanVerified;
            _context.SaveChanges(); return Ok(candidate);
        }

        [HttpPut("employers/{id:int}")]
        public IActionResult UpdateEmployer(int id, [FromBody] EmployerProfile update)
        {
            var employer = _context.EmployerProfiles.Find(id);
            if (employer == null) return NotFound();
            employer.CompanyName = update.CompanyName.Trim(); employer.OfficialEmail = update.OfficialEmail.Trim();
            employer.GstNumber = update.GstNumber?.Trim() ?? ""; employer.CinNumber = update.CinNumber?.Trim() ?? "";
            employer.Website = update.Website?.Trim() ?? "";
            _context.SaveChanges(); return Ok(employer);
        }

        [HttpDelete("users/{id:int}")]
        public IActionResult DeleteUser(int id)
        {
            var user = _context.Users.Find(id);
            if (user == null) return NotFound();
            _context.Candidates.RemoveRange(_context.Candidates.Where(candidate => candidate.Email == user.Email));
            _context.Users.Remove(user); _context.SaveChanges(); return NoContent();
        }

        [HttpDelete("candidates/{id:int}")]
        public IActionResult DeleteCandidate(int id)
        {
            var candidate = _context.Candidates.Find(id);
            if (candidate == null) return NotFound();
            _context.Candidates.Remove(candidate); _context.SaveChanges(); return NoContent();
        }

        [HttpDelete("employers/{id:int}")]
        public IActionResult DeleteEmployer(int id)
        {
            var employer = _context.EmployerProfiles.Find(id);
            if (employer == null) return NotFound();
            var user = _context.Users.Find(employer.UserId);
            if (user != null) _context.Users.Remove(user);
            else _context.EmployerProfiles.Remove(employer);
            _context.SaveChanges(); return NoContent();
        }
    }
}
