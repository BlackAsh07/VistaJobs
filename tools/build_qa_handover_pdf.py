from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "output" / "qa-handoff"
PDF_PATH = OUT_DIR / "VistaJobs_QA_Handover_Document.pdf"

BLUE = colors.HexColor("#2E74B5")
DARK_BLUE = colors.HexColor("#1F4D78")
INK = colors.HexColor("#1C2434")
MUTED = colors.HexColor("#5A6474")
LIGHT_FILL = colors.HexColor("#F2F4F7")
BLUE_FILL = colors.HexColor("#E8EEF5")


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="TitleCustom",
    parent=styles["Title"],
    fontName="Helvetica-Bold",
    fontSize=24,
    leading=29,
    textColor=INK,
    alignment=TA_LEFT,
    spaceAfter=4,
))
styles.add(ParagraphStyle(
    name="SubtitleCustom",
    parent=styles["Normal"],
    fontName="Helvetica",
    fontSize=14,
    leading=18,
    textColor=MUTED,
    spaceAfter=14,
))
styles.add(ParagraphStyle(
    name="BodyCustom",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=9.7,
    leading=12.4,
    textColor=INK,
    spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="H1Custom",
    parent=styles["Heading1"],
    fontName="Helvetica-Bold",
    fontSize=14,
    leading=17,
    textColor=BLUE,
    spaceBefore=12,
    spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="H2Custom",
    parent=styles["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=11.5,
    leading=14,
    textColor=BLUE,
    spaceBefore=8,
    spaceAfter=5,
))
styles.add(ParagraphStyle(
    name="SmallCustom",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=8.6,
    leading=10.5,
    textColor=INK,
))


def p(text, style="BodyCustom"):
    safe = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return Paragraph(safe, styles[style])


def bullet(text):
    return Paragraph(f"- {text}", styles["BodyCustom"])


def numbered(items):
    return [Paragraph(f"{idx}. {item}", styles["BodyCustom"]) for idx, item in enumerate(items, 1)]


def table(headers, rows, widths, fill=LIGHT_FILL):
    data = [[p(h, "SmallCustom") for h in headers]]
    for row in rows:
        data.append([p(str(cell), "SmallCustom") for cell in row])
    tbl = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), fill),
        ("TEXTCOLOR", (0, 0), (-1, 0), INK),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#CBD3DD")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return tbl


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica-Bold", 8.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(inch, 10.45 * inch, "VistaJobs QA Handover")
    canvas.setStrokeColor(colors.HexColor("#D8DEE8"))
    canvas.line(inch, 10.32 * inch, 7.5 * inch, 10.32 * inch)
    canvas.setFont("Helvetica", 8.5)
    canvas.drawRightString(7.5 * inch, 0.55 * inch, f"Development-to-QA handover | Page {doc.page}")
    canvas.restoreState()


def add_metadata(story, rows):
    for label, value in rows:
        story.append(Paragraph(f"<b>{label}:</b> {value}", styles["BodyCustom"]))


def build_pdf():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(
        str(PDF_PATH),
        pagesize=letter,
        rightMargin=inch,
        leftMargin=inch,
        topMargin=0.9 * inch,
        bottomMargin=0.8 * inch,
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=header_footer)])

    story = []
    story.append(p("VISTAJOBS PLATFORM", "TitleCustom"))
    story.append(p("Software Development Document - Development to QA Handover", "SubtitleCustom"))
    add_metadata(story, [
        ("Project", "VistaJobs - recruitment, verification, employer matching and administration platform"),
        ("Prepared for", "QA Testing and TL Review"),
        ("Prepared by", "Development Team"),
        ("Version", "1.0"),
        ("Date", "July 2026"),
        ("Status", "Ready for QA validation after backend/frontend deployment"),
    ])
    story.append(Spacer(1, 8))

    sections = [
        ("1. Purpose", "This document gives QA engineers a concise technical and functional overview of the VistaJobs platform so they can perform functional, integration, regression, security, responsive UI and UAT testing without reading the full codebase first."),
        ("2. Application Overview", "VistaJobs is an ASP.NET Core Web API plus static frontend recruitment platform. It supports jobseeker registration, role-based login, fresher and experienced candidate profiles, Aadhaar/PAN/UAN verification, resume upload, employer registration with company validation, employer candidate matching, job postings, applications and admin dashboards."),
    ]
    for heading, body in sections:
        story.append(p(heading, "H1Custom"))
        story.append(p(body))

    story.append(p("3. Technology Stack", "H1Custom"))
    story.append(table(["Layer", "Technology / Implementation"], [
        ("Backend", "ASP.NET Core Web API (.NET 8), C#"),
        ("Frontend", "HTML, CSS, JavaScript static frontend under Frontend/"),
        ("Database", "SQL Server with Entity Framework Core migrations"),
        ("Authentication", "JWT bearer tokens, email OTP, BCrypt password hashing, optional Google sign-in"),
        ("Verification", "Local format validation plus DigiLocker/Surepass EPFO integration points"),
        ("Deployment", "Azure App Service API, Azure Static Apps or local Live Server frontend"),
    ], [1.6 * inch, 4.8 * inch]))

    story.append(p("4. Architecture", "H1Custom"))
    story.append(p("Browser frontend -> API controllers -> services/providers -> Entity Framework Core -> SQL Server. Resume files are uploaded to the API and served through the /Uploads path. The frontend stores the authenticated session in sessionStorage and routes users by the role returned from login."))
    story.append(table(["Component", "Primary Files", "QA Focus"], [
        ("API startup", "Program.cs, appsettings*.json", "CORS, JWT configuration, uploads, Swagger and seed data"),
        ("Controllers", "Auth, Candidates, Jobs, Applications, Admin, Verification", "Validation, HTTP status codes, authorization and response shape"),
        ("Models/Data", "Models/*, ApplicationDbContext.cs, Migrations/*", "Schema mapping, duplicate prevention and update behavior"),
        ("Frontend", "Frontend/index.html, js/app.js, css/*", "Role routing, forms, toasts, responsive states and API calls"),
    ], [1.2 * inch, 2.1 * inch, 3.1 * inch], BLUE_FILL))

    story.append(p("5. User Roles", "H1Custom"))
    story.append(table(["Role", "Expected Access", "Must Not Access"], [
        ("Jobseeker", "Register, login, create/update fresher or experienced profile, upload resume, verify Aadhaar/PAN/UAN, apply for jobs", "Employer matching dashboard, admin lists"),
        ("Employer", "Register through employer form, login, enter matching requirements, view matching candidates, create jobs", "Sensitive verification APIs outside allowed matching view, admin dashboards"),
        ("Admin", "Dashboard summary, raw users, jobs and applications lists", "No unauthorized access without admin role"),
    ], [1.1 * inch, 3.35 * inch, 1.95 * inch]))

    story.append(p("6. Core Modules", "H1Custom"))
    story.append(table(["Module", "Responsibility", "Key Test Areas"], [
        ("Authentication", "Register/login via email OTP, Google auth guard, JWT issuance", "Required fields, invalid credentials, OTP expiry, role routing"),
        ("Jobseeker Profiles", "Fresher/experienced candidate details and resume upload", "Create, update, validation, duplicate profile by email"),
        ("Verification", "Aadhaar, PAN, UAN and verification status", "Format validation, provider fallback, status persistence"),
        ("Employer Registration", "Company name, official email, GST, CIN, website and OTP", "Personal email blocking, domain/website match, OTP verification"),
        ("Employer Matching", "Requirement entry and skill-based candidate matching", "Skill aliases, candidate type, experience sorting, location preference"),
        ("Jobs and Applications", "Job posting and candidate application tracking", "CRUD, duplicate application blocking, confirmation email"),
        ("Administration", "User/job/application visibility for admins", "Role authorization and dashboard counts"),
    ], [1.35 * inch, 2.45 * inch, 2.6 * inch], BLUE_FILL))

    story.append(p("7. End-to-End QA Workflows", "H1Custom"))
    story.append(p("7.1 Jobseeker Workflow", "H2Custom"))
    story.extend(numbered([
        "Register as a jobseeker using name, email, password and email OTP.",
        "Login with the same email and password, complete login OTP, and confirm jobseeker dashboard routing.",
        "Submit or update fresher/experienced profile and confirm /api/Candidates/my-profile returns saved data.",
        "Upload PDF/DOC/DOCX resume and confirm the generated /Uploads path opens.",
        "Run Aadhaar, PAN and UAN verification flows and verify status indicators.",
        "Apply for a job and confirm duplicate application is blocked.",
    ]))
    story.append(p("7.2 Employer Workflow", "H2Custom"))
    story.extend(numbered([
        "Register through employer form and verify personal email domains are blocked.",
        "Complete company identity fields and OTP, then login as employer.",
        "Enter role, candidate type, skills, experience and location to find matching candidates.",
        "Create a job posting and verify admin/job APIs reflect it.",
    ]))
    story.append(p("7.3 Admin Workflow", "H2Custom"))
    story.extend(numbered([
        "Start the API and confirm the default admin account is created or updated.",
        "Login with the seeded admin account provided by the development team.",
        "Verify dashboard counts and raw lists for users, jobs and applications.",
        "Confirm non-admin roles cannot open admin APIs or admin frontend views.",
    ]))

    story.append(p("8. Critical Business Rules", "H1Custom"))
    for item in [
        "Protected APIs require JWT authentication and role checks where applicable.",
        "Registration and login flows require OTP verification before account/session completion.",
        "Employer registration must reject personal email domains and validate company identity fields.",
        "Candidate profile is keyed by login email and should update, not duplicate, for the same user.",
        "Employer matching must use only relevant candidate profile fields and must not expose unrelated sensitive data.",
        "Duplicate job applications must be blocked by job ID and candidate email.",
        "Resume upload accepts only PDF, DOC and DOCX files.",
    ]:
        story.append(bullet(item))

    story.append(p("9. QA Scope", "H1Custom"))
    story.append(table(["Area", "In Scope Checks"], [
        ("Functional", "Registration, login, OTP, role routing, profiles, verification, matching, jobs, applications and admin dashboards"),
        ("Validation", "Required fields, email format, official email policy, GST/CIN length, website matching, password rules and upload types"),
        ("Integration", "SQL Server persistence, SMTP OTP/email, verification provider configuration, static frontend/API CORS"),
        ("Security", "JWT requirement, role isolation, no sensitive data in public pages, session clearing on logout"),
        ("Responsive UI", "Chrome, Edge and Firefox on desktop plus mobile width smoke tests"),
        ("Regression", "Retest login, profile save, employer matching and admin after every deployment"),
    ], [1.25 * inch, 5.15 * inch]))

    story.append(p("10. Environment Summary", "H1Custom"))
    story.append(table(["Environment Item", "Value / QA Note"], [
        ("Local frontend", "http://127.0.0.1:5500/index.html"),
        ("Local API", "https://localhost:7250/api or http://localhost:5295/api based on launch profile"),
        ("Swagger", "https://localhost:7250/swagger"),
        ("Database", "SQL Server via ConnectionStrings:DefaultConnection"),
        ("Secrets", "Use user-secrets locally and Azure App Service configuration in hosting. Do not share secrets in QA artifacts."),
        ("Migration check", "GET /__migrations"),
    ], [1.7 * inch, 4.7 * inch], BLUE_FILL))

    story.append(p("11. Deployment and Configuration Checks", "H1Custom"))
    for item in [
        "Confirm JWT issuer, audience and key are configured before starting the API.",
        "Confirm CORS allows local frontend and Azure Static Apps origin.",
        "Confirm frontend API base URL points to local API for local testing and Azure API for deployed testing.",
        "Confirm Uploads/ is writable and uploaded resume links are reachable.",
        "Confirm SMTP credentials are valid before OTP, reset password and application email testing.",
        "Confirm Google OAuth authorized origins before enabling Google sign-in in deployed environments.",
    ]:
        story.append(bullet(item))

    story.append(p("12. High-Level Testing Checklist", "H1Custom"))
    checklist = [
        "Role-based access and logout",
        "Jobseeker registration and login OTP",
        "Employer registration and official email validation",
        "Admin seed and admin dashboard",
        "Fresher and experienced profile save/update",
        "Resume upload and public link access",
        "Aadhaar, PAN and UAN verification",
        "Employer matching candidate results",
        "Job creation and application duplicate prevention",
        "Validation messages and toast behavior",
        "CORS and API error handling",
        "Responsive UI and browser compatibility",
        "Regression testing before release",
    ]
    story.append(table(["Done", "Checklist Item", "Notes"], [("[ ]", item, "") for item in checklist], [0.55 * inch, 3.0 * inch, 2.85 * inch]))

    story.append(p("13. Risks and Assumptions", "H1Custom"))
    for item in [
        "Email OTP and notification testing depends on valid SMTP settings and mailbox access.",
        "Verification provider behavior depends on DigiLocker/Surepass settings; local fallback behavior must be documented for QA.",
        "Production-like testing should use isolated QA data and must not use real Aadhaar/PAN/UAN values unless approved.",
        "Azure deployment must update both API and frontend; deploying only the frontend can leave old CORS/API behavior active.",
        "Google sign-in requires the deployed origin to be added in Google Cloud OAuth settings.",
    ]:
        story.append(bullet(item))

    story.append(p("14. Version History and Approval", "H1Custom"))
    story.append(table(["Version", "Date", "Description"], [
        ("1.0", "July 2026", "Initial VistaJobs Development-to-QA handover"),
        ("1.1", "Future", "Update after QA feedback, deployment changes or new module additions"),
    ], [1.0 * inch, 1.2 * inch, 4.2 * inch]))
    add_metadata(story, [
        ("Prepared By", "Development Team"),
        ("Reviewed By", "____________________________"),
        ("Approved By", "____________________________"),
        ("QA Sign-off Date", "____________________________"),
    ])

    doc.build(story)
    print(PDF_PATH)


if __name__ == "__main__":
    build_pdf()
