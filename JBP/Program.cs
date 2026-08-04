using JBP.Data;
using JBP.Services;
using JBP.Models;
using JBP.Services.VerificationProviders;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using System.Text;

var builder = WebApplication.CreateBuilder(args);
const string FrontendCorsPolicy = "VistaJobsFrontend";

if (builder.Environment.IsDevelopment())
{
    // Local secrets flow: load values from %APPDATA%\Microsoft\UserSecrets\<UserSecretsId>\secrets.json.
    // Local secrets flow: secret.json lo unna local values ikkada app configuration loki load avtayi.
    builder.Configuration.AddUserSecrets<Program>(optional: true, reloadOnChange: true);
}

var jwtSigningKey = ResolveJwtSigningKey(builder.Configuration, builder.Environment);

// API controllers are used by the static frontend and Swagger UI.
builder.Services.AddControllers();
builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("otp", option =>
    {
        option.PermitLimit = 5;
        option.Window = TimeSpan.FromMinutes(1);
    });
});

// Shared services used by application and verification flows.
builder.Services.AddScoped<EmailService>();
builder.Services.Configure<DigiLockerOptions>(
    builder.Configuration.GetSection("DigiLocker"));
builder.Services.AddScoped<IDigiLockerGateway, DigiLockerGateway>();
builder.Services.Configure<EpfoOptions>(
    builder.Configuration.GetSection("EPFO"));
builder.Services.AddScoped<VerificationService>();
builder.Services.AddHttpClient();
builder.Services.AddHttpClient<IEpfoVerificationProvider, SurepassEpfoProvider>();

// JWT is the main login/session mechanism.
// Frontend sends this token as: Authorization: Bearer <token>.
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters =
            new TokenValidationParameters
            {
                ValidateIssuer = true,

                ValidateAudience = true,

                ValidateLifetime = true,

                ValidateIssuerSigningKey = true,

                ClockSkew = TimeSpan.Zero,
                

                ValidIssuer =
                    builder.Configuration["Jwt:Issuer"],

                ValidAudience =
                    builder.Configuration["Jwt:Audience"],

                IssuerSigningKey =
                    new SymmetricSecurityKey(
                        Encoding.UTF8.GetBytes(jwtSigningKey))
            };
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    // Swagger can call secured APIs when the tester pastes the login token here.
    options.AddSecurityDefinition(
        "Bearer",
        new OpenApiSecurityScheme
        {
            Name = "Authorization",

            Type = SecuritySchemeType.Http,

            Scheme = "bearer",

            BearerFormat = "JWT",

            In = ParameterLocation.Header,

            Description =
                "Enter JWT Token"
        });

options.AddSecurityRequirement(
    new OpenApiSecurityRequirement
    {
            {
                new OpenApiSecurityScheme
                {
                    Reference =
                        new OpenApiReference
                        {
                            Type =
                                ReferenceType.SecurityScheme,

                            Id = "Bearer"
                        }
                },

                Array.Empty<string>()
            }
    });
});


builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection")));

// CORS flow: allow the static frontend to call this API from local dev and Azure Static Apps.
// CORS flow: local frontend mariyu Azure Static Apps nundi API calls allow chestundi.
var configuredFrontendOrigins =
    builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? Array.Empty<string>();

var allowedFrontendOrigins =
    new[]
    {
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "https://thankful-rock-0c403ba00.7.azurestaticapps.net"
    }
    .Concat(configuredFrontendOrigins)
    .Where(origin => !string.IsNullOrWhiteSpace(origin))
    .Select(origin => origin.Trim().TrimEnd('/'))
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray();

builder.Services.AddCors(options =>
{
    options.AddPolicy(FrontendCorsPolicy, policy =>
    {
        policy
            .WithOrigins(allowedFrontendOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});
var app = builder.Build();

// Error/CORS safety net: even failed API responses must be readable by the allowed frontend.
// Error/CORS safety net: API lo error vachina frontend ki readable response ravadaniki headers add chestundi.
app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (Exception exception)
    {
        app.Logger.LogError(exception, "Unhandled API error");

        if (!context.Response.HasStarted)
        {
            ApplyFrontendCorsHeaders(context, allowedFrontendOrigins);
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsJsonAsync(new
            {
                message = "Server error occurred. Please check API logs and configuration."
            });
        }
    }
});

// Configure middleware and endpoints (outside any DI scope)
app.UseSwagger();
app.UseSwaggerUI();

app.UseCors(FrontendCorsPolicy);

app.UseHttpsRedirection();
app.Use(async (context, next) =>
{
    context.Response.Headers.Append("X-Frame-Options", "DENY");
    context.Response.Headers.Append("X-Content-Type-Options", "nosniff");
    context.Response.Headers.Append("Referrer-Policy", "strict-origin-when-cross-origin");

    await next();
});


// Resume uploads are stored outside the frontend folder and exposed as /Uploads/<file>.
var uploadsPath =
    Path.Combine(app.Environment.ContentRootPath, "Uploads");

Directory.CreateDirectory(uploadsPath);

app.UseStaticFiles();

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider =
        new PhysicalFileProvider(uploadsPath),
    RequestPath = "/Uploads"
});

app.UseAuthentication();

app.UseAuthorization();

app.MapControllers();

// Local diagnostics endpoint for checking whether EF migrations are applied.
app.MapGet("/__migrations", async (ApplicationDbContext db) =>
{
    var applied = await Task.Run(() => db.Database.GetAppliedMigrations());
    var pending = await Task.Run(() => db.Database.GetPendingMigrations());
    return Results.Ok(new { applied = applied.ToList(), pending = pending.ToList() });
});

// Admin user creation on startup - use a short-lived scope only for seeding.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

    // Admin seed flow: ensure the default administrator can always log in after startup.
    // Admin seed flow: app start ayyaka default admin login ready ga undela create/update chestundi.
    const string adminEmail = "karthikeya.k@vistawaystech.com";
    const string adminPassword = "Admin@123";

    var admin =
        db.Users.FirstOrDefault(u => u.Email == adminEmail);

    if (admin == null)
    {
        admin = new User
        {
            FullName = "Administrator",
            Email = adminEmail,
            Password = BCrypt.Net.BCrypt.HashPassword(adminPassword),
            Role = "admin",
            AuthProvider = "Email",
            EmailVerified = true
        };

        db.Users.Add(admin);
        Console.WriteLine("Default admin account created.");
    }
    else
    {
        admin.FullName = string.IsNullOrWhiteSpace(admin.FullName)
            ? "Administrator"
            : admin.FullName;
        admin.Password = BCrypt.Net.BCrypt.HashPassword(adminPassword);
        admin.Role = "admin";
        admin.AuthProvider = "Email";
        admin.EmailVerified = true;

        Console.WriteLine("Default admin account updated.");
    }

    db.SaveChanges();
}

app.Run();

static string ResolveJwtSigningKey(
    IConfiguration configuration,
    IWebHostEnvironment environment)
{
    // JWT key flow: value must come from user-secrets locally or environment/app settings in hosting.
    // JWT key flow: local lo user-secrets nundi, hosting lo environment/app settings nundi key ravali.
    var configuredKey = configuration["Jwt:Key"];

    if (!string.IsNullOrWhiteSpace(configuredKey))
    {
        return configuredKey;
    }

    throw new InvalidOperationException(
        environment.IsDevelopment()
            ? "Jwt:Key is not configured. Add it to this project's user-secrets secrets.json."
            : "Jwt:Key is not configured. Set Jwt__Key in Azure App Service configuration.");
}

static void ApplyFrontendCorsHeaders(
    HttpContext context,
    string[] allowedFrontendOrigins)
{
    var requestOrigin = context.Request.Headers.Origin.ToString();

    if (string.IsNullOrWhiteSpace(requestOrigin))
    {
        return;
    }

    var normalizedOrigin = requestOrigin.Trim().TrimEnd('/');
    var isAllowed =
        allowedFrontendOrigins.Contains(
            normalizedOrigin,
            StringComparer.OrdinalIgnoreCase);

    if (!isAllowed)
    {
        return;
    }

    context.Response.Headers["Access-Control-Allow-Origin"] = requestOrigin;
    context.Response.Headers["Vary"] = "Origin";
}
