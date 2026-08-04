'use strict';
// API routing: local frontend uses the local Visual Studio API; deployed frontend uses Azure API.
// API routing: local frontend local API ni vadutundi; deployed frontend Azure API ni vadutundi.
const LOCAL_API_BASE_URL = "https://localhost:7250/api";
const AZURE_API_BASE_URL = "https://vistajobs-api-aqahcnabazbzf8hz.centralindia-01.azurewebsites.net/api";
const API_BASE_URL =
    ["localhost", "127.0.0.1"].includes(window.location.hostname)
        ? LOCAL_API_BASE_URL
        : AZURE_API_BASE_URL;
// Login state is kept only for this browser session.
// This prevents stale user details from appearing after closing/reopening the browser.
const authStorage = sessionStorage;
const GOOGLE_CLIENT_ID = "280183771546-5q3kn4tsh1pt511ea9928pd01nq5ppgp.apps.googleusercontent.com";
// Google flow: initialize only on origins configured in the Google OAuth client.
// Google flow: Google OAuth client lo allow chesina origins lo matrame button start avuthundi.
const GOOGLE_AUTH_ALLOWED_ORIGINS = [
    "http://127.0.0.1:5500",
    "http://localhost:5500"
];
let registerOtpSent = false;
let loginOtpSent = false;
let employerRegisterOtpSent = false;
let resetOtpSent = false;
let resetOtpVerified = false;
let googleAuthInitialized = false;

function clearSavedLogin() {

    ["token", "role", "name", "email"].forEach(key => {
        authStorage.removeItem(key);
        localStorage.removeItem(key);
    });
}

function clearLegacyPersistentLogin() {

    ["token", "role", "name", "email"].forEach(key =>
        localStorage.removeItem(key)
    );
}

const Skills = {
    fresher: [],
    experienced: [],
    employer: []
};
let allJobs = [];

function getAuthHeaders(extraHeaders = {}) {
    const token = authStorage.getItem("token");

    return token
        ? { ...extraHeaders, Authorization: `Bearer ${token}` }
        : { ...extraHeaders };
}

function normalizeMatchTerm(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[.#]/g, "");
}

function skillTermsMatch(requiredSkill, candidateSkill) {
    const required = normalizeMatchTerm(requiredSkill);
    const candidate = normalizeMatchTerm(candidateSkill);

    if (!required || !candidate) {
        return false;
    }

    const aliases = {
        dotnet: ["net", "aspnet", "csharp"],
        net: ["dotnet", "aspnet", "csharp"],
        csharp: ["c#", "dotnet", "net"]
    };

    return candidate.includes(required) ||
        required.includes(candidate) ||
        (aliases[required] || []).some(alias =>
            candidate.includes(normalizeMatchTerm(alias)));
}
/* Page navigation flow: show one single-page section and hide every other section. */
/* Page navigation flow: oka section chupinchi migatha pages anni hide chestundi. */
function showPage(pageId) {

    // index.html is a single-page UI. This toggles the visible section.
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
    });

    const target = document.getElementById('page-' + pageId);

    if (target) {
        target.classList.add('active');
    }
    document.querySelectorAll('.nav-link[data-page]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.page === pageId);
    });

    document.getElementById('navMobile')?.classList.remove('open');

    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

/* Jobseeker registration starts here: email OTP is requested first, then the account is created with the jobseeker role. */
/* Jobseeker registration ikkada start avtundi: mundu email OTP, taruvata jobseeker account create avtundi. */
async function handleRegister() {
    try {
        const name = document.getElementById('register-name')?.value.trim();
        const email = document.getElementById('register-email')?.value.trim();
        const password = document.getElementById('register-pass')?.value.trim();
        const role = "jobseeker";
        const otp = document.getElementById('register-otp')?.value.trim();

        if (!name || !email || !password) {
            showToast('Please fill all fields', 'error');
            return;
        }

        if (!validateEmail(email)) {
            showToast('Invalid email', 'error');
            return;
        }

        if (!registerOtpSent) {
            await requestRegisterOtp();
            return;
        }

        if (!otp) {
            showToast('Please enter the OTP sent to your email', 'error');
            return;
        }

        const payload = {
            FullName: name,
            Email: email,
            Password: password,
            Otp: otp,
            Role: role
        };

        const resp = await fetch(`${API_BASE_URL}/Auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!resp.ok) {
            const t = await resp.text();
            showToast(t || 'Registration failed', 'error');
            return;
        }

        // Clear register form inputs so values are not retained
        const rn = document.getElementById('register-name'); if (rn) rn.value = '';
        const re = document.getElementById('register-email'); if (re) re.value = '';
        const rp = document.getElementById('register-pass'); if (rp) rp.value = '';
        const ro = document.getElementById('register-otp'); if (ro) ro.value = '';
        const otpBlock = document.getElementById('register-otp-block'); if (otpBlock) otpBlock.style.display = 'none';
        const submit = document.getElementById('register-submit-btn'); if (submit) submit.textContent = 'Send OTP';
        registerOtpSent = false;

        showToast('Account created successfully', 'success');
        // Registration ends by returning to login so credentials are not kept in the form.
        // Registration ayyaka login page ki pampistam, form lo password/email nilva undakudadhu.
        showPage('login');

    } catch (error) {
        console.error(error);
        showToast('Registration failed', 'error');
    }
}

async function requestRegisterOtp(isResend = false) {
    const email = document.getElementById('register-email')?.value.trim();

    if (!email || !validateEmail(email)) {
        showToast('Enter a valid email before requesting OTP', 'error');
        return;
    }

    const resp = await fetch(`${API_BASE_URL}/Auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose: 'register' })
    });

    if (!resp.ok) {
        const t = await resp.text();
        showToast(t || 'Could not send OTP', 'error');
        return;
    }

    registerOtpSent = true;
    const otpBlock = document.getElementById('register-otp-block');
    if (otpBlock) otpBlock.style.display = 'block';
    const submit = document.getElementById('register-submit-btn');
    if (submit) submit.textContent = 'Verify OTP & Create Account';
    showToast(isResend ? 'OTP resent to your email' : 'OTP sent to your email', 'success');
}

/* TOAST */
let toastTimer;

function showToast(message, type = 'info') {

    const toast = document.getElementById('toast');

    if (!toast) return;

    toast.className = `toast ${type} `;

    toast.innerHTML = message;

    toast.classList.add('show');

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {

        toast.classList.remove('show');

    }, 3000);
}

/* MODAL */
function showModal(title, message) {

    document.getElementById('modalTitle').innerHTML = title;

    document.getElementById('modalMsg').innerHTML = message;

    document.getElementById('modal').classList.add('open');
}

function closeModal() {

    document.getElementById('modal').classList.remove('open');
}

/* MOBILE NAV */
function toggleMobileNav() {

    document.getElementById('navMobile')?.classList.toggle('open');
}

function togglePassword(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'password') el.type = 'text'; else el.type = 'password';
}

/* Skill chip flow: collect typed skills for jobseeker profiles and employer candidate matching. */
/* Skill chip flow: typed skills ni jobseeker profile and employer matching kosam collect chestundi. */
function addSkill(event, type) {

    if (event.key !== 'Enter' && event.key !== ',') return;

    event.preventDefault();

    const input = event.target;

    const val = input.value.trim().replace(/[,]+$/, '');

    if (!val) return;

    if (Skills[type].includes(val)) {

        showToast("Skill already added");

        return;
    }

    Skills[type].push(val);

    renderChip(val, type, input);

    input.value = '';
}

function renderChip(val, type, inputEl) {

    const chip = document.createElement('span');

    chip.className = 'skill-chip';

    chip.innerHTML = `
        ${val}
<button type="button"
    onclick="removeSkill(this,'${val}','${type}')">
    ×
</button>
`;

    inputEl.parentElement.insertBefore(chip, inputEl);
}

function setFieldValue(id, value) {

    const field = document.getElementById(id);

    if (field && value !== null && value !== undefined) {
        field.value = value;
    }
}

function setSelectValue(id, value) {

    const field = document.getElementById(id);

    if (!field || value === null || value === undefined) {
        return;
    }

    const stringValue = String(value);

    field.value = stringValue;

    if (field.value !== stringValue) {
        field.value = "";
    }
}

function formatDateInput(value) {

    if (!value) {
        return "";
    }

    return String(value).split("T")[0];
}

function setSkills(type, skills) {

    // Rebuild skill chips from the comma-separated value saved in the database.
    const prefix =
        type === "fresher"
            ? "f"
            : "e";

    const wrap =
        document.getElementById(`${prefix}-skills-wrap`);

    const input =
        document.getElementById(`${prefix}-skill-input`);

    if (!wrap || !input) {
        return;
    }

    wrap.querySelectorAll(".skill-chip")
        .forEach(chip => chip.remove());

    Skills[type] = (skills || "")
        .split(",")
        .map(skill => skill.trim())
        .filter(Boolean);

    Skills[type].forEach(skill =>
        renderChip(skill, type, input)
    );
}

function getTokenPayload() {

    const token =
        authStorage.getItem("token");

    if (!token) {
        return {};
    }

    try {
        return JSON.parse(
            atob(token.split(".")[1])
        );
    } catch (error) {
        return {};
    }
}

function getLoggedInEmail() {

    // New login response contains email. JWT fallback keeps older sessions working.
    const payload = getTokenPayload();

    return authStorage.getItem("email") ||
        payload.email ||
        payload[
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
        ] ||
        "";
}

function clearCandidateForm(prefix) {

    // Clear all fields before a new user/profile path opens the form.
    [
        "name",
        "email",
        "phone",
        "dob",
        "pan",
        "aadhaar",
        "address",
        "pref-loc",
        "salary",
        "resume",
        "qual",
        "year",
        "percent",
        "college",
        "role",
        "uan",
        "company",
        "jobtitle",
        "exp",
        "notice",
        "curr-sal",
        "about"
    ].forEach(field => {

        const element =
            document.getElementById(`${prefix}-${field}`);

        if (!element) {
            return;
        }

        if (element.type === "file") {
            element.value = "";
            return;
        }

        element.value = "";
    });

    const type =
        prefix === "e"
            ? "experienced"
            : "fresher";

    setSkills(type, "");
    clearIdentificationFields(prefix);
}
function prefillLoggedInIdentity(prefix) 
     {

    setFieldValue(
        `${prefix}-name`,
        authStorage.getItem("name") || ""
    );

    setFieldValue(
        `${prefix}-email`,
        getLoggedInEmail()
    );
}

function resetJobseekerForms(prefillIdentity = false) {

    // Fresh profile creation must not reuse values from a previous login.
    loadedCandidateType = null;

    clearCandidateForm("f");
    clearCandidateForm("e");

    if (prefillIdentity) {
        prefillLoggedInIdentity("f");
        prefillLoggedInIdentity("e");
    }
}

let submittedCandidate = null;

function setJobseekerHeader(submitted) {

    const header =
        document.querySelector("#page-jobseeker .form-header");

    if (!header) {
        return;
    }

    const title = header.querySelector("h2");
    const copy = header.querySelector("p");

    if (title) {
        title.textContent = submitted
            ? "Your Profile"
            : "Create Your Profile";
    }

    if (copy) {
        copy.textContent = submitted
            ? "Your submitted details are saved and ready for employer matches."
            : "Choose fresher or experienced to complete your jobseeker profile.";
    }
}

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function displayValue(value) {

    if (value === null || value === undefined || value === "") {
        return "Not provided";
    }

    return escapeHtml(value);
}

function renderSubmittedBadge(label, verified) {

    return `
        <span class="submitted-badge ${verified ? "ok" : ""}">
            ${verified ? "Verified" : "Pending"} ${escapeHtml(label)}
        </span>
    `;
}

function renderSubmittedSkills(skills) {

    const list = (skills || "")
        .split(",")
        .map(skill => skill.trim())
        .filter(Boolean);

    if (!list.length) {
        return `<span class="submitted-profile-value">Not provided</span>`;
    }

    return list.map(skill => `
        <span class="submitted-skill">${escapeHtml(skill)}</span>
    `).join("");
}

function renderSubmittedProfile(candidate) {

    // Existing jobseeker profile: show a read-only summary instead of the create form.
    submittedCandidate = candidate;
    setJobseekerHeader(true);

    const profile =
        document.getElementById("jobseeker-submitted-profile");

    if (!profile) {
        return;
    }

    const type =
        candidate.candidateType === "experienced"
            ? "Experienced"
            : "Fresher";

    const resumeAction =
        candidate.resumePath
            ? `<button type="button" class="btn-secondary" onclick="viewResume('${escapeHtml(candidate.resumePath)}')">View Resume</button>`
            : "";

    profile.innerHTML = `
        <div class="submitted-profile-header">
            <div>
                <h3>Profile Already Submitted</h3>
                <p>Your jobseeker profile is ready and visible to matching employers.</p>
            </div>
            <span class="submitted-profile-type">${type}</span>
        </div>

        <div class="submitted-profile-body">
            <div class="submitted-profile-item">
                <span class="submitted-profile-label">Full Name</span>
                <span class="submitted-profile-value">${displayValue(candidate.fullName)}</span>
            </div>
            <div class="submitted-profile-item">
                <span class="submitted-profile-label">Email</span>
                <span class="submitted-profile-value">${displayValue(candidate.email)}</span>
            </div>
            <div class="submitted-profile-item">
                <span class="submitted-profile-label">Phone</span>
                <span class="submitted-profile-value">${displayValue(candidate.phone)}</span>
            </div>
            <div class="submitted-profile-item">
                <span class="submitted-profile-label">DOB</span>
                <span class="submitted-profile-value">${displayValue(formatDateInput(candidate.dob))}</span>
            </div>
            <div class="submitted-profile-item">
                <span class="submitted-profile-label">Experience</span>
                <span class="submitted-profile-value">${displayValue(candidate.experience)} year(s)</span>
            </div>
            <div class="submitted-profile-item">
                <span class="submitted-profile-label">Expected Salary</span>
                <span class="submitted-profile-value">${displayValue(candidate.salary)}</span>
            </div>
            <div class="submitted-profile-item">
                <span class="submitted-profile-label">Location</span>
                <span class="submitted-profile-value">${displayValue(candidate.location)}</span>
            </div>
            <div class="submitted-profile-item">
                <span class="submitted-profile-label">Company</span>
                <span class="submitted-profile-value">${escapeHtml(renderEmploymentHistoryText(candidate.employmentHistory))}</span>
            </div>
            <div class="submitted-profile-item full">
                <span class="submitted-profile-label">Skills</span>
                <div class="submitted-profile-skills">${renderSubmittedSkills(candidate.skills)}</div>
            </div>
            <div class="submitted-profile-item full">
                <span class="submitted-profile-label">Verification</span>
                <div class="submitted-profile-badges">
                    ${renderSubmittedBadge("Aadhaar", candidate.aadhaarVerified)}
                    ${renderSubmittedBadge("PAN", candidate.panVerified)}
                   ${candidate.candidateType === "experienced"
            ? renderSubmittedBadge("UAN", candidate.uanVerified)
            : ""}
                </div>
            </div>
        </div>

        <div class="submitted-profile-actions">
            ${resumeAction}
            <button type="button" class="btn-secondary" onclick="editSubmittedProfile()">Update Profile</button>
        </div>
    `;

    profile.classList.remove("hidden");
    document.getElementById("jobseeker-type-choice")
        ?.classList.add("hidden");
    document.getElementById("jobseeker-tab-switch")
        ?.classList.add("hidden");
    document.getElementById("jobseeker-form-card")
        ?.classList.add("hidden");
}

function fillCandidateForm(candidate) {

    // "Update Profile" reopens the matching form with saved values prefilled.
    const type =
        candidate.candidateType === "experienced"
            ? "experienced"
            : "fresher";

    const prefix =
        type === "experienced"
            ? "e"
            : "f";

    openJobseekerForm(type);

    setFieldValue(`${prefix}-name`, candidate.fullName || "");
    setFieldValue(`${prefix}-email`, candidate.email || "");
    setFieldValue(`${prefix}-phone`, candidate.phone || "");
    setFieldValue(`${prefix}-dob`, formatDateInput(candidate.dob));
    setFieldValue(
        getVerificationElementId(prefix, "pan", "input"),
        candidate.panNumber || "");
    setFieldValue(
        getVerificationElementId(prefix, "aadhaar", "input"),
        candidate.aadhaarNumber || "");
    setFieldValue(`${prefix}-pref-loc`, candidate.location || "");
    setSelectValue(`${prefix}-salary`, candidate.salary || "");
    setSkills(type, candidate.skills);

    if (type === "experienced") {
        setFieldValue(
            getVerificationElementId("e", "uan", "input"),
            candidate.uanNumber || "");
        setSelectValue("e-exp", candidate.experience);
        setFieldValue("e-company", candidate.employmentHistory || "");
    }
}

function editSubmittedProfile() {

    // Move from summary mode to edit mode for the submitted candidate.
    if (!submittedCandidate) {
        return;
    }

    document.getElementById("jobseeker-submitted-profile")
        ?.classList.add("hidden");

    fillCandidateForm(submittedCandidate);
    loadVerificationStatus();
}

function removeSkill(btn, val, type) {

    Skills[type] = Skills[type].filter(s => s !== val);

    btn.parentElement.remove();
}

/* SEARCH */
function handleSearch() {

    const keyword =
        document.getElementById(
            "searchJob"
        ).value.toLowerCase();

    const location =
        document.getElementById(
            "searchLoc"
        ).value.toLowerCase();

    const filtered =
        allJobs.filter(job => {

            const matchesKeyword =

                job.title.toLowerCase()
                    .includes(keyword)

                ||

                job.skills.toLowerCase()
                    .includes(keyword)

                ||

                job.companyName.toLowerCase()
                    .includes(keyword);

            const matchesLocation =

                job.location.toLowerCase()
                    .includes(location);

            return matchesKeyword &&
                matchesLocation;
        });

    renderJobs(filtered);

    showToast(
        `${filtered.length} jobs found`,
        "success"
    );
}

/* CATEGORY */
function filterCategory(button, category) {

    document.querySelectorAll(
        ".cat-pill"
    ).forEach(btn => {

        btn.classList.remove(
            "active"
        );
    });

    button.classList.add("active");

    if (category === "all") {

        renderJobs(allJobs);

        return;
    }

    const filtered =
        allJobs.filter(job =>

            job.skills
                .toLowerCase()
                .includes(category)

        );

    renderJobs(filtered);
}

/* TAB SWITCH */
let activeTab = 'fresher';
let loadedCandidateType = null;

function switchTab(type) {

    activeTab = type;

    document.getElementById('form-fresher')
        .classList.toggle('hidden', type !== 'fresher');

    document.getElementById('form-experienced')
        .classList.toggle('hidden', type !== 'experienced');

    document.getElementById('tab-fresher')
        .classList.toggle('active', type === 'fresher');

    document.getElementById('tab-experienced')
        .classList.toggle('active', type === 'experienced');

    clearInactiveCandidateVerification(type);
}

function showJobseekerTypeChooser() {

    resetJobseekerForms(true);
    setJobseekerHeader(false);

    document.getElementById("jobseeker-submitted-profile")
        ?.classList.add("hidden");

    document.getElementById("jobseeker-type-choice")
        ?.classList.remove("hidden");

    document.getElementById("jobseeker-tab-switch")
        ?.classList.add("hidden");

    document.getElementById("jobseeker-form-card")
        ?.classList.add("hidden");

    activeTab = "fresher";

    switchTab("fresher");
}

function openJobseekerForm(type) {

    setJobseekerHeader(false);

    document.getElementById("jobseeker-submitted-profile")
        ?.classList.add("hidden");

    if (!loadedCandidateType) {
        const prefix =
            type === "experienced"
                ? "e"
                : "f";

        clearCandidateForm(prefix);
        prefillLoggedInIdentity(prefix);
    }

    document.getElementById("jobseeker-type-choice")
        ?.classList.add("hidden");

    document.getElementById("jobseeker-tab-switch")
        ?.classList.remove("hidden");

    document.getElementById("jobseeker-form-card")
        ?.classList.remove("hidden");

    switchTab(type);

    loadVerificationStatus();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

/* VALIDATION */
function validateEmail(email) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone) {

    return /^[6-9]\d{9}$/.test(phone);
}

function validateUAN(uan) {

    return /^\d{12}$/.test(uan);
}

function validatePAN(pan) {

    return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
}

function validateAadhaar(aadhaar) {

    return /^\d{12}$/.test(aadhaar);
}

function validatePassword(password) {

    return /^(?=.*[A-Za-z])(?=.*\d).{6,}$/.test(password || "");
}

/* SUBMIT JOBSEEKER */

/* Employer matching starts here: verified employers enter role and skills, then matching candidate summaries are fetched. */
/* Employer matching ikkada start avtundi: employer role/skills isthe matching candidate summaries fetch avtayi. */
async function findCandidates() {

    try {

        const companyName =
            authStorage.getItem("name") || "Verified Employer";

        const title =
            document.getElementById('emp-jobtitle')?.value.trim();

        const location =
            document.getElementById('emp-location')?.value.trim();

        const description = "";

        const candidateType =
            document.getElementById('emp-type')?.value;

        const minExperience =
            parseInt(document.getElementById('emp-exp')?.value) || 0;

        const skills =
            Skills.employer.join(",");

        if (!title || !skills) {

            showToast(
                "Please fill role and required skills",
                "error"
            );

            return;
        }

        // The job row stores the employer search requirement for dashboard/audit history.
        // Employer search requirement dashboard/history kosam Jobs table lo save avtundi.
        const newJob = {

            companyName,

            title,

            skills,

            location,

            salary: "",

            description,

            candidateType,

            minExperience
        };

        await fetch(`${API_BASE_URL}/Jobs`, {

method: "POST",

    headers: {
    ...getAuthHeaders({ "Content-Type": "application/json" })
},

body: JSON.stringify(newJob)
        });

// Candidate fetching starts after job save; backend returns only safe employer-visible fields.
// Job save ayyaka candidates fetch avtayi; backend sensitive Aadhaar/PAN/UAN numbers pampadhu.
const response =
    await fetch(`${API_BASE_URL}/Candidates`, {
        headers: getAuthHeaders()
    });

if (!response.ok) {
    throw new Error("Unable to load candidates");
}

const candidates =
    await response.json();

// Matching ends by filtering on type, experience, and skill; location is only used to sort preferred results first.
// Matching lo type/experience/skill compulsory; location preference matrame, block cheyyadu.
const requiredSkills =
    Skills.employer
        .map(skill => skill.trim().toLowerCase())
        .filter(Boolean);

const preferredLocation = String(location || "").trim().toLowerCase();

const filtered = candidates.filter(c => {

    const candidateSkills =
        (c.skills || "")
            .split(",")
            .map(skill => skill.trim().toLowerCase())
            .filter(Boolean);

    const typeMatches =
        !candidateType ||
        candidateType === "both" ||
        c.candidateType === candidateType;

    const experienceMatches =
        !minExperience ||
        Number(c.experience || 0) >= minExperience;

    const skillsMatch = requiredSkills.some(requiredSkill =>
        candidateSkills.some(candidateSkill =>
            skillTermsMatch(requiredSkill, candidateSkill)
        )
    );

    return typeMatches &&
        experienceMatches &&
        skillsMatch;
}).sort((a, b) => {
    if (!preferredLocation) {
        return 0;
    }

    const aLocationMatch = String(a.location || "")
        .toLowerCase()
        .includes(preferredLocation);
    const bLocationMatch = String(b.location || "")
        .toLowerCase()
        .includes(preferredLocation);

    return Number(bLocationMatch) - Number(aLocationMatch);
});

// Render Candidates
renderCandidates(filtered);

showToast(
    `${filtered.length} candidates matched`,
    "success"
);


    } catch (error) {

    console.error(error);

    showToast(
        "Failed to load candidates",
        "error"
    );
}
}

function renderCandidates(list) {

    // Candidate rendering shows match-safe fields only; private document numbers stay hidden on the backend.
    // Candidate card lo safe fields matrame chupistam; private Aadhaar/PAN/UAN numbers backend lo ne untayi.
    const container =
        document.getElementById('candidatesList');

    if (!container) return;

    if (!list.length) {

        container.innerHTML = `
            <p>No matching candidates found</p>
        `;

        return;
    }

    container.innerHTML = list.map(c => `

        <div class="candidate-card">

            <div class="candidate-name">
                ${escapeHtml(c.fullName || "N/A")}
            </div>

            <div>
                ${escapeHtml(c.skills || "N/A")}
            </div>

            <div class="verification-cards">

    <span class="verification-pill">

        ${c.aadhaarVerified
            ? "✅ Aadhaar Verified"
            : "❌ Aadhaar Pending"}

    </span>

    <span class="verification-pill">

        ${c.panVerified
            ? "✅ PAN Verified"
            : "❌ PAN Pending"}

    </span>

    <span class="verification-pill">

        ${c.uanVerified
            ? "✅ UAN Verified"
            : "❌ UAN Pending"}

    </span>

   <div class="resume-actions">

    <span class="verification-pill">

        ${c.resumePath
            ? "📄 Resume Uploaded"
            : "❌ No Resume"}

    </span>

    ${c.resumePath

            ?

            `
        <button class="resume-btn"
            onclick="viewResume('${c.resumePath}')">

            View Resume

        </button>

        <button class="resume-btn"
            onclick="downloadResume('${c.resumePath}')">

            Download

        </button>
        `

            :

            ""
    }

</div>

</div>

            <button class="btn-primary"
                onclick='viewCandidateProfile(${JSON.stringify(JSON.stringify(c))})'>

                View Profile

            </button>

        </div>

    `).join('');
}
function viewCandidateProfile(candidateData) {

    const c = JSON.parse(candidateData);

    document.getElementById(
        "candidateProfileModal"
    ).style.display = "flex";

    document.getElementById(
        "candidateProfileContent"
    ).innerHTML = `

        <div class="profile-info">
            <strong>Name:</strong>
            ${escapeHtml(c.fullName || "N/A")}
        </div>

        <div class="profile-info">
            <strong>Skills:</strong>
            ${escapeHtml(c.skills || "N/A")}
        </div>

        <div class="profile-info">
            <strong>Experience:</strong>
            ${escapeHtml(String(c.experience ?? "N/A"))} years
        </div>

        <div class="profile-info">
            <strong>Location:</strong>
            ${escapeHtml(c.location || "N/A")}
        </div>

        <div class="profile-info">
            <strong>Salary:</strong>
            ${escapeHtml(c.salary || "N/A")}
        </div>

        <div class="profile-info">
            <strong>Type:</strong>
            ${escapeHtml(c.candidateType || "N/A")}
        </div>
    `;
}

function closeCandidateProfile() {

    document.getElementById(
        "candidateProfileModal"
    ).style.display = "none";
}


/* Login flow: password is checked first, OTP is verified second, then role opens the correct dashboard. */
/* Login flow: first password check, second OTP verify, taruvata role batti correct dashboard open avtundi. */
async function handleLogin() {
    try {
        const email = document.getElementById('login-email')?.value.trim();
        const password = document.getElementById('login-pass')?.value.trim();
        const otp = document.getElementById('login-otp')?.value.trim();

        if (!email || !password) {
            showToast("Please enter email and password", "error");
            return;
        }

        if (!loginOtpSent) {
            const response = await fetch(`${API_BASE_URL}/Auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email,
                    password
                })
            });

            if (!response.ok) {
                throw new Error("Invalid login");
            }

            await requestLoginOtp();
            return;
        }

        if (!otp) {
            showToast("Please enter the OTP sent to your email", "error");
            return;
        }

        const response = await fetch(`${API_BASE_URL}/Auth/verify-login-otp`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email,
                password,
                otp
            })
        });

        if (!response.ok) {
            const message = await response.text();
            throw new Error(message || "Invalid OTP");
        }

        const data = await response.json();
        completeLogin(data);
    } catch (error) {
        console.error(error);
        showToast(error.message || "Invalid email or password", "error");
    }
}

async function requestLoginOtp(isResend = false) {
    const email = document.getElementById('login-email')?.value.trim();

    if (!email || !validateEmail(email)) {
        showToast('Enter a valid email before requesting OTP', 'error');
        return;
    }

    const resp = await fetch(`${API_BASE_URL}/Auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose: 'login' })
    });

    if (!resp.ok) {
        const t = await resp.text();
        showToast(t || 'Could not send OTP', 'error');
        return;
    }

    loginOtpSent = true;
    const otpBlock = document.getElementById('login-otp-block');
    if (otpBlock) otpBlock.style.display = 'block';
    const submit = document.getElementById('login-submit-btn');
    if (submit) submit.textContent = 'Verify OTP & Login';
    showToast(isResend ? 'OTP resent to your email' : 'OTP sent to your email', 'success');
}

function setButtonLoading(buttonId, isLoading, loadingText, defaultText) {
    const button = document.getElementById(buttonId);

    if (!button) {
        return;
    }

    button.disabled = isLoading;
    button.textContent = isLoading ? loadingText : defaultText;
}

async function readAuthResponse(response) {
    const text = await response.text();

    if (!text) {
        return {};
    }

    try {
        return JSON.parse(text);
    } catch {
        return { text, message: text };
    }
}

function resetPasswordFormState(clearEmail = false) {
    if (clearEmail) {
        const email = document.getElementById('reset-email');
        if (email) email.value = '';
    }

    ['reset-otp', 'reset-new-pass', 'reset-confirm-pass'].forEach(id => {
        const field = document.getElementById(id);
        if (field) field.value = '';
    });

    const otpBlock = document.getElementById('reset-otp-block');
    if (otpBlock) otpBlock.style.display = 'none';

    const passwordFields = document.getElementById('reset-password-fields');
    if (passwordFields) passwordFields.style.display = 'none';

    resetOtpSent = false;
    resetOtpVerified = false;
    setButtonLoading('reset-send-otp-btn', false, 'Sending...', 'Send OTP');
    setButtonLoading('reset-verify-otp-btn', false, 'Verifying...', 'Verify OTP');
    setButtonLoading('reset-change-pass-btn', false, 'Changing...', 'Change Password');
}

function openResetPasswordPage() {
    const loginEmail = document.getElementById('login-email')?.value.trim();
    const resetEmail = document.getElementById('reset-email');

    resetPasswordFormState(true);

    if (loginEmail && validateEmail(loginEmail) && resetEmail) {
        resetEmail.value = loginEmail;
    }

    showPage('reset-password');
}

async function sendResetOtp(isResend = false) {
    const email = document.getElementById('reset-email')?.value.trim();

    if (!email || !validateEmail(email)) {
        showToast('Enter a valid registered email', 'error');
        return;
    }

    try {
        setButtonLoading('reset-send-otp-btn', true, 'Sending...', 'Send OTP');

        const response = await fetch(`${API_BASE_URL}/Auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const responseBody = await readAuthResponse(response);

        if (!response.ok) {
            const message = responseBody.message || responseBody.text;
            throw new Error(message || 'Could not send OTP');
        }

        resetOtpSent = true;
        resetOtpVerified = false;

        const otpBlock = document.getElementById('reset-otp-block');
        if (otpBlock) otpBlock.style.display = 'block';

        const passwordFields = document.getElementById('reset-password-fields');
        if (passwordFields) passwordFields.style.display = 'none';

        ['reset-otp', 'reset-new-pass', 'reset-confirm-pass'].forEach(id => {
            const field = document.getElementById(id);
            if (field) field.value = '';
        });

        const successMessage = responseBody.developmentOtp
            ? `OTP sent successfully. Development OTP: ${responseBody.developmentOtp}`
            : 'OTP sent successfully.';

        showToast(successMessage, 'success');
    } catch (error) {
        console.error(error);
        showToast(error.message || 'Could not send OTP', 'error');
    } finally {
        setButtonLoading('reset-send-otp-btn', false, 'Sending...', 'Send OTP');
    }
}

async function verifyResetOtp() {
    const email = document.getElementById('reset-email')?.value.trim();
    const otp = document.getElementById('reset-otp')?.value.trim();

    if (!resetOtpSent) {
        showToast('Please request an OTP first', 'error');
        return;
    }

    if (!email || !validateEmail(email) || !otp) {
        showToast('Enter your email and OTP', 'error');
        return;
    }

    try {
        setButtonLoading('reset-verify-otp-btn', true, 'Verifying...', 'Verify OTP');

        const response = await fetch(`${API_BASE_URL}/Auth/verify-reset-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp })
        });

        if (!response.ok) {
            const message = await response.text();
            throw new Error(message || 'Invalid or expired OTP');
        }

        resetOtpVerified = true;
        const passwordFields = document.getElementById('reset-password-fields');
        if (passwordFields) passwordFields.style.display = 'block';
        showToast('OTP verified successfully.', 'success');
    } catch (error) {
        console.error(error);
        showToast(error.message || 'Invalid or expired OTP', 'error');
    } finally {
        setButtonLoading('reset-verify-otp-btn', false, 'Verifying...', 'Verify OTP');
    }
}

async function changeResetPassword() {
    const email = document.getElementById('reset-email')?.value.trim();
    const otp = document.getElementById('reset-otp')?.value.trim();
    const newPassword = document.getElementById('reset-new-pass')?.value.trim();
    const confirmPassword = document.getElementById('reset-confirm-pass')?.value.trim();

    if (!resetOtpVerified) {
        showToast('Please verify the OTP before changing your password', 'error');
        return;
    }

    if (!newPassword || !confirmPassword) {
        showToast('Please enter and confirm your new password', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showToast('New Password and Confirm Password must match', 'error');
        return;
    }

    if (!validatePassword(newPassword)) {
        showToast('Password must be at least 6 characters and include at least one letter and one number', 'error');
        return;
    }

    try {
        setButtonLoading('reset-change-pass-btn', true, 'Changing...', 'Change Password');

        const response = await fetch(`${API_BASE_URL}/Auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email,
                otp,
                newPassword,
                confirmPassword
            })
        });

        if (!response.ok) {
            const message = await response.text();
            throw new Error(message || 'Password reset failed');
        }

        showToast('Password changed successfully.', 'success');
        resetPasswordFormState(true);

        setTimeout(() => {
            showPage('login');
            showToast('Your password has been reset successfully. Please login with your new password.', 'success');
        }, 900);
    } catch (error) {
        console.error(error);
        showToast(error.message || 'Password reset failed', 'error');
    } finally {
        setButtonLoading('reset-change-pass-btn', false, 'Changing...', 'Change Password');
    }
}

function completeLogin(data) {
    // Login flow ends here by storing the JWT and routing admin/employer/jobseeker users.
    // Login flow ikkada end avtundi: JWT save chesi admin/employer/jobseeker route chestundi.
    authStorage.setItem("token", data.token);
    authStorage.setItem("role", data.role);
    authStorage.setItem("name", data.name);
    authStorage.setItem("email", data.email || getLoggedInEmail());

    showToast("Login successful", "success");
    updateNavbar();

    const le = document.getElementById('login-email'); if (le) le.value = '';
    const lp = document.getElementById('login-pass'); if (lp) lp.value = '';
    const lo = document.getElementById('login-otp'); if (lo) lo.value = '';
    const otpBlock = document.getElementById('login-otp-block'); if (otpBlock) otpBlock.style.display = 'none';
    const submit = document.getElementById('login-submit-btn'); if (submit) submit.textContent = 'Send OTP';
    loginOtpSent = false;

    document.getElementById("loginBtn").style.display = "none";
    document.getElementById("registerBtn").style.display = "none";
    document.getElementById("user-area").style.display = "flex";

    if (data.role === "admin") {
        showPage("admin");
        loadAdminDashboard();
    } else if (data.role === "employer") {
        showPage("employer");
        loadEmployerDashboard();
    } else {
        showPage("jobseeker");
        showJobseekerTypeChooser();
        loadCandidateProfile();
    }
}

function getActiveAuthPage() {
    return document.getElementById('page-register')?.classList.contains('active')
        ? 'register'
        : 'login';
}

function getGoogleRole() {
    return 'jobseeker';
}

function isGoogleAuthOriginAllowed() {
    return GOOGLE_AUTH_ALLOWED_ORIGINS.includes(window.location.origin);
}

function hideGoogleAuthButtons() {
    ['google-register-btn', 'google-login-btn'].forEach(id => {
        const target = document.getElementById(id);

        if (target) {
            target.innerHTML = '';
            target.style.display = 'none';

            const divider = target.previousElementSibling;
            if (divider?.classList.contains('auth-divider')) {
                divider.style.display = 'none';
            }
        }
    });
}

async function handleGoogleCredential(response) {
    try {
        const role = getGoogleRole();

        if (getActiveAuthPage() === 'register' && !role) {
            showToast('Select a role before using Google sign in', 'error');
            return;
        }

        const resp = await fetch(`${API_BASE_URL}/Auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                credential: response.credential,
                role
            })
        });

        if (!resp.ok) {
            const t = await resp.text();
            showToast(t || 'Google sign in failed', 'error');
            return;
        }

        const data = await resp.json();
        completeLogin(data);
    } catch (error) {
        console.error(error);
        showToast('Google sign in failed', 'error');
    }
}

function initGoogleAuthButtons() {
    if (!isGoogleAuthOriginAllowed()) {
        hideGoogleAuthButtons();
        return;
    }

    if (!window.google?.accounts?.id) {
        return;
    }

    if (!googleAuthInitialized) {
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleCredential
        });

        googleAuthInitialized = true;
    }

    ['google-register-btn', 'google-login-btn'].forEach(id => {
        const target = document.getElementById(id);

        if (!target || target.dataset.rendered === 'true') {
            return;
        }

        google.accounts.id.renderButton(target, {
            theme: 'outline',
            size: 'large',
            text: id === 'google-register-btn' ? 'signup_with' : 'signin_with',
            width: 320
        });

        target.dataset.rendered = 'true';
    });
}

window.addEventListener('load', () => {
    const loginSubmit = document.getElementById('login-submit-btn');
    if (loginSubmit) loginSubmit.textContent = 'Send OTP';
    initGoogleAuthButtons();
    setTimeout(initGoogleAuthButtons, 1000);
});
/* Logout flow: clear session data and return the visitor to the public home page. */
/* Logout flow: session data clear chesi user ni public home page ki pampistundi. */
document.getElementById("logout-btn").addEventListener("click",function logout() {
    clearSavedLogin();

    document.getElementById("loginBtn").style.display = "inline-block";
    document.getElementById("registerBtn").style.display = "inline-block";

    document.getElementById("user-area").style.display = "none";


    updateNavbar();

    showToast(
        "Logged out successfully",
        "success"
    );

    showPage("home");
});
function updateNavbar() {

    const token =
        authStorage.getItem("token");

    const role =
        authStorage.getItem("role");

    const name =
        authStorage.getItem("name");

    const userArea =
        document.getElementById("user-area");

    const welcomeUser =
        document.getElementById("welcome-user");

    const loginBtn =
        document.getElementById("loginBtn");

    const registerBtn =
        document.getElementById("registerBtn");

    if (token) {

        if (loginBtn) loginBtn.style.display = "none";

        if (registerBtn) registerBtn.style.display = "none";

        if (userArea) userArea.style.display = "flex";

        if (welcomeUser) welcomeUser.innerText =
            `${name} (${role})`;

    } else {

        if (loginBtn) loginBtn.style.display = "inline-block";

        if (registerBtn) registerBtn.style.display = "inline-block";

        if (userArea) userArea.style.display = "none";

        if (welcomeUser) welcomeUser.innerText = "";
    }
}
/* Jobseeker profile load flow: after login, load saved profile or show the fresher/experienced chooser. */
/* Jobseeker profile load flow: login ayyaka saved profile load chestundi lekapothe fresher/experienced chooser chupistundi. */
async function loadCandidateProfile() {

    try {

        // On jobseeker login:
        // 200 shows submitted profile summary, 404 shows fresher/experienced chooser.
        const token =
            authStorage.getItem("token");

        if (!token) {
            showJobseekerTypeChooser();
            return;
        }

        const response =
            await fetch(

                `${API_BASE_URL}/Candidates/my-profile`,

                {
                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                });

        if (response.status === 404) {
            // No submitted profile yet.
            showJobseekerTypeChooser();
            return;
        }

        if (!response.ok) {
            throw new Error("Unable to load candidate profile");
        }

        const candidate =
            await response.json();

        if (!candidate) return;

        loadedCandidateType =
            candidate.candidateType || null;

        // Existing profile: show read-only summary instead of opening the form.
        renderSubmittedProfile(candidate);

    } catch (error) {

        console.error(error);
        showJobseekerTypeChooser();
    }
}
function getSelectedResumeFile() {

    const isFresher = activeTab === "fresher";

    return isFresher
        ? document.getElementById("f-resume")?.files[0]
        : document.getElementById("resume-file")?.files[0];
}

async function getCurrentCandidateId(token) {

    const response =
        await fetch(
            `${API_BASE_URL}/Candidates/my-profile`,
            {
                headers: {
                    Authorization:
                        `Bearer ${token}`
                }
            });

    if (!response.ok) {
        return null;
    }

    const candidate =
        await response.json();

    return candidate?.id || null;
}

async function uploadResume(candidateId = null, options = {}) {

    // Used by the upload button and silently after profile submit.
    const silentIfMissing =
        options.silentIfMissing === true;

    try {

        const token =
            authStorage.getItem("token");

        const file =
            getSelectedResumeFile();

        if (!file) {

            if (!silentIfMissing) {
                showToast(
                    "Please select resume",
                    "error"
                );
            }

            return null;
        }

        const resolvedCandidateId =
            candidateId ||
            await getCurrentCandidateId(token);

        if (!resolvedCandidateId) {

            showToast(
                "Candidate not found",
                "error"
            );

            return null;
        }

        const formData =
            new FormData();

        formData.append(
            "file",
            file
        );

        const uploadResponse =
            await fetch(
                `${API_BASE_URL}/Candidates/upload-resume/${resolvedCandidateId}`,
                {
                    method: "POST",
                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    },
                    body: formData
                });

        let data = null;

        try {
            data = await uploadResponse.json();
        } catch (error) {
            data = null;
        }

        if (!uploadResponse.ok) {
            throw new Error(
                data?.message ||
                data?.error ||
                "Upload failed"
            );
        }

        const resumeStatus =
            document.getElementById("resume-status");

        if (resumeStatus) {
            resumeStatus.innerHTML = `
                Resume Uploaded:
                <a href="${data.url || API_BASE_URL.replace('/api', '') + data.path}"
                    target="_blank">
                    View Resume
                </a>
            `;
        }

        if (!silentIfMissing) {
            showToast(
                "Resume uploaded successfully",
                "success"
            );
        }

        return data;

    } catch (error) {

        console.error(error);

        showToast(
            error.message || "Upload failed",
            "error"
        );

        return null;
    }
}
async function loadEmployerDashboard() {

    try {

        const token =
            authStorage.getItem("token");

        const response =
            await fetch(

                `${API_BASE_URL}/Jobs/dashboard`,

                {
                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                });

        const dashboard =
            await response.json();

        // JOBS
        document.getElementById(
            "employer-jobs"
        ).innerHTML = dashboard.map(job => `

    <div class="candidate-card">

                <strong>
                    ${job.title}
                </strong>

                <p>
                    ${job.companyName}
                </p>

                <p>
                    ${job.location}
                </p>

                <p>
                    Applicants:
                    ${job.applicants.length}
                </p>

            </div>

    `).join('');

        // APPLICANTS
        let applicantsHtml = "";

        dashboard.forEach(job => {

            job.applicants.forEach(a => {

                applicantsHtml += `

    <div class="candidate-card">

                        <strong>
                            ${a.candidateName}
                        </strong>

                        <p>
                            ${a.candidateEmail}
                        </p>

                        <p>
                            Applied:
                            ${new Date(a.appliedAt)
                                .toLocaleDateString()}
                        </p>

                        ${
    a.resume
    ? `
                            <a
                                href="${a.resume}"
                                target="_blank">

                                Download Resume

                            </a>
                            `
    : "No Resume"
}

                    </div>
    `;
            });
        });

        document.getElementById(
            "employer-applicants"
        ).innerHTML = applicantsHtml ||

            "No applicants yet";

    } catch (error) {

        console.error(error);

        showToast(
            "Failed to load employer dashboard",
            "error"
        );
    }
}
async function loadAdminDashboard() {

    try {

        const token =
            authStorage.getItem("token");

        // DASHBOARD
        const dashboardResponse =
            await fetch(

                `${API_BASE_URL}/Admin/dashboard`,

                {
                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                });

        const dashboard =
            await dashboardResponse.json();

        document.getElementById(
            "admin-users-count"
        ).innerText =
            dashboard.totalUsers;

        document.getElementById(
            "admin-jobs-count"
        ).innerText =
            dashboard.totalJobs;

        document.getElementById(
            "admin-applications-count"
        ).innerText =
            dashboard.totalApplications;

        document.getElementById(
            "admin-candidates-count"
        ).innerText =
            dashboard.totalCandidates;

        // USERS
        const usersResponse =
            await fetch(

                `${API_BASE_URL}/Admin/users`,

                {
                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                });

        const users =
            await usersResponse.json();

        document.getElementById(
            "admin-users-list"
        ).innerHTML = users.map(u => `

    <div class="candidate-card">

                <strong>
                    ${u.fullName}
                </strong>

                <p>
                    ${u.email}
                </p>

                <p>
                    ${u.role}
                </p>

            </div>

    `).join('');

        // JOBS
        const jobsResponse =
            await fetch(

                `${API_BASE_URL}/Admin/jobs`,

                {
                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                });

        const jobs =
            await jobsResponse.json();

        document.getElementById(
            "admin-jobs-list"
        ).innerHTML = jobs.map(j => `

    <div class="candidate-card">

                <strong>
                    ${j.title}
                </strong>

                <p>
                    ${j.companyName}
                </p>

                <p>
                    ${j.location}
                </p>

            </div>

    `).join('');

        // APPLICATIONS
        const applicationsResponse =
            await fetch(

                `${API_BASE_URL}/Admin/applications`,

                {
                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                });

        const applications =
            await applicationsResponse.json();

        document.getElementById(
            "admin-applications-list"
        ).innerHTML = applications.map(a => `

    <div class="candidate-card">

                <strong>
                    ${a.candidateName}
                </strong>

                <p>
                    ${a.candidateEmail}
                </p>

                <p>
                    ${a.jobTitle}
                </p>

            </div>

    `).join('');

    } catch (error) {

        console.error(error);

        showToast(
            "Failed to load admin dashboard",
            "error"
        );
    }
}
function renderJobs(jobs) {

    const container =
        document.getElementById(
            "jobsGrid"
        );

    if (!jobs.length) {

        container.innerHTML = `

    <div class="empty-state">

                <div class="empty-icon">
                    🔍
                </div>

                <p>
                    No matching jobs found
                </p>

            </div>
    `;

        return;
    }

    container.innerHTML = jobs.map(job => `

    <div class="job-card">

            <h3>
                ${job.title}
            </h3>

            <p>
                <strong>Company:</strong>
                ${job.companyName}
            </p>

            <p>
                <strong>Location:</strong>
                ${job.location}
            </p>

            <p>
                <strong>Salary:</strong>
                ${job.salary}
            </p>

            <p>
                <strong>Skills:</strong>
                ${job.skills}
            </p>

            <button
                class="btn-primary"
                onclick="applyJob(${job.id},
                '${job.title}')">

                Apply Now

            </button>

        </div>

    `).join('');
}
async function applyJob(jobId, jobTitle) {

    try {

        const token =
            authStorage.getItem("token");

        if (!token) {

            showToast(
                "Please login first",
                "error"
            );

            showPage("login");

            return;
        }

        const payload =
            JSON.parse(
                atob(token.split('.')[1])
            );

        const application = {

            jobId,

            jobTitle,

            candidateName:
                authStorage.getItem("name"),

            candidateEmail:
                payload.email
        };

        const response =
            await fetch(
                `${API_BASE_URL}/Applications`,
{
    method: "POST",

        headers: {

        "Content-Type":
        "application/json",

            Authorization:
        `Bearer ${token}`
    },

    body:
    JSON.stringify(application)
});

        if (!response.ok) {
            const message = await response.text();
            throw new Error(message);
        }

        showToast('Applied successfully', 'success');

    } catch (error) {

        console.error(error);

        showToast(
            error.message || 'Failed to apply',
            'error'
        );
    }
}
/* App startup flow: wire UI controls, restore session state, and open the correct first page. */
/* App startup flow: UI controls wire chesi session restore chesi correct first page open chestundi. */
document.addEventListener('DOMContentLoaded', () => {

    renderAllVerificationFields();
    wireVerificationButtons();
    clearLegacyPersistentLogin();
    document.querySelector('#navMobile button[onclick="showPage(\'home\')"]')?.remove();

    const requestedPage = window.location.hash.slice(1);
    if (requestedPage === 'register' || requestedPage === 'login') {
        showPage(requestedPage);
    }

    updateNavbar();
    const token = authStorage.getItem("token");

    const role = authStorage.getItem("role");

    if (token && role) {

        showToast(
            `Welcome back ${authStorage.getItem("name")} `,
            "success"
        );

        updateNavbar();

        if (role === "admin") {

            showPage("admin");

            loadAdminDashboard();

        } else if (role === "employer") {

            showPage("employer");

            loadEmployerDashboard();

        } else {

            showPage("jobseeker");

            const status =
                new URLSearchParams(window.location.search)
                    .get("status");

            if (status === "success") {

                handleVerificationCallback();

            } else {

                loadCandidateProfile();
            }
        }
    }
});
function normalizeEmploymentHistory(history) {

    if (!history) {
        return [];
    }

    if (Array.isArray(history)) {
        return history;
    }

    if (typeof history === "string") {
        const trimmed = history.trim();

        if (!trimmed) {
            return [];
        }

        try {
            const parsed = JSON.parse(trimmed);

            if (Array.isArray(parsed)) {
                return parsed;
            }
        } catch {
            return trimmed
                .split(",")
                .map(company => ({
                    company: company.trim(),
                    doj: "",
                    doe: ""
                }))
                .filter(job => job.company);
        }
    }

    return [];
}

function renderEmploymentHistory(history) {

    const jobs = normalizeEmploymentHistory(history);

    if (!jobs.length) {
        return `
            <div class="employment-empty">
                No employment history found
            </div>
        `;
    }

    return jobs
        .map(job => {
            const company = job.company || job.Company || "Unknown Company";
            const doj = job.doj || job.DOJ || "";
            const doe = job.doe || job.DOE || "";

            return `
                <div class="employment-card">
                    <strong>${escapeHtml(company)}</strong>
                    <span>DOJ: ${escapeHtml(doj || "N/A")}</span>
                    <span>DOE: ${escapeHtml(doe || "N/A")}</span>
                </div>
            `;
        })
        .join("");
}

function renderEmploymentHistoryText(history) {

    const jobs = normalizeEmploymentHistory(history);

    if (!jobs.length) {
        return "Not provided";
    }

    return jobs
        .map(job => job.company || job.Company || "Unknown Company")
        .join(", ");
}

function showEmploymentHistoryModal(data) {

    const modal = document.getElementById("verificationModal");
    const content = document.getElementById("verificationContent");

    if (!modal || !content) {
        return;
    }

    modal.style.display = "flex";
    content.innerHTML = `
        <div class="profile-info">
            <strong>UAN Number:</strong>
            ${escapeHtml(data.uanNumber || data.uan || "N/A")}
        </div>
        <div class="profile-info">
            <strong>Status:</strong>
            <span class="verified-badge">Verified</span>
        </div>
        <div class="profile-info">
            <strong>Employment History:</strong>
            <div class="employment-list">
                ${renderEmploymentHistory(data.employmentHistory)}
            </div>
        </div>
    `;
}


function isMaskedAadhaar(value) {

    return /^[Xx*]{2,8}\d{4}$/.test(String(value || "").replace(/\s/g, ""));
}

function validateVerifiedAadhaar(value) {

    return validateAadhaar(value) ||
        isMaskedAadhaar(value);
}

function isMaskedPan(value) {

    return /^[Xx*]{2,5}[A-Z][0-9]{4}[A-Z]$/.test(
        String(value || "").trim().toUpperCase());
}

function validateVerifiedPan(value) {

    const normalized =
        String(value || "").trim().toUpperCase();

    return validatePAN(normalized) ||
        isMaskedPan(normalized);
}

async function fetchDigiLockerVerifiedDetails(clientId) {

    const response =
        await fetch(
            `${API_BASE_URL.replace("/api", "")}/api/Digilocker/verified-details/${encodeURIComponent(clientId)}`);

    let data = null;

    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok || !data?.success) {
        throw new Error(data?.message || "Unable to read DigiLocker verified details");
    }

    return data;
}

function applyDigiLockerVerifiedDetails(prefix, details) {
    console.log("DIGILOCKER DETAILS =", details);

    const aadhaar =
        getVerificationElements(prefix, "aadhaar");

    const pan =
        getVerificationElements(prefix, "pan");

    let aadhaarApplied = false;
    let panApplied = false;

    if (aadhaar.input) {
        aadhaar.input.value = "";
    }

    if (pan.input) {
        pan.input.value = "";
    }

    if (details.aadhaarNumber && aadhaar.input) {
        aadhaar.input.value =
            String(details.aadhaarNumber).trim().toUpperCase();

        aadhaarApplied = true;
        setStoredVerification(prefix, "aadhaar", true);
    } else {
        setStoredVerification(prefix, "aadhaar", false);
    }

    if (details.panNumber && pan.input) {
        pan.input.value =
            String(details.panNumber).trim().toUpperCase();

        panApplied = true;
        setStoredVerification(prefix, "pan", true);
    } else {
        setStoredVerification(prefix, "pan", false);
    }

    if (details.fullName) {
        setFieldValue(`${prefix}-name`, details.fullName);
    }

    if (details.dob) {
        setFieldValue(`${prefix}-dob`, formatDateInput(details.dob));
    }

    if (details.address) {
        setFieldValue(`${prefix}-address`, details.address);
    }

    [
        `${prefix}-name`,
        `${prefix}-dob`,
        `${prefix}-address`
    ].forEach(id => {
        const field =
            document.getElementById(id);

        if (field) {
            field.readOnly = true;
        }
    });

    if (aadhaar.input) {
        aadhaar.input.readOnly = true;
    }

    if (pan.input) {
        pan.input.readOnly = true;
    }

    const identityBtn =
        document.getElementById(
            getVerificationElementId(
                prefix,
                "identity",
                "button"
            )
        );

    if (identityBtn) {
        identityBtn.disabled = true;
        identityBtn.innerText = "Verified";
    }

    return {
        aadhaarApplied,
        panApplied
    };
}

async function handleVerificationCallback() {

    const params =
        new URLSearchParams(window.location.search);

    const status =
        params.get("status");

    if (status !== "success") {
        updateVerificationUI();
        return;
    }

    const pendingVerification =
        localStorage.getItem("pendingVerification") || "identity";

    const prefix =
        localStorage.getItem("pendingVerificationPrefix") ||
        localStorage.getItem("verificationPrefix") ||
        "f";

    const clientId =
        params.get("client_id");

    localStorage.setItem("verificationPrefix", prefix);
    localStorage.removeItem("aadhaarVerified");
    localStorage.removeItem("panVerified");

    if (typeof showPage === "function") {
        showPage("jobseeker");
    }

    if (typeof openJobseekerForm === "function") {
        openJobseekerForm(
            prefix === "e"
                ? "experienced"
                : "fresher");
    }

    setTimeout(async () => {
        restoreDraftForm(prefix);

        try {
            if (!clientId) {
                throw new Error("DigiLocker client id missing");
            }

            const details =
                await fetchDigiLockerVerifiedDetails(clientId);

            const applied =
                applyDigiLockerVerifiedDetails(prefix, details);

            if (pendingVerification !== "identity") {
                setStoredVerification(prefix, pendingVerification, true);
            }

            localStorage.removeItem("pendingVerification");
            localStorage.removeItem("pendingVerificationPrefix");

            updateVerificationUI(prefix);

            if (applied.aadhaarApplied && applied.panApplied) {
                showToast("DigiLocker verified details loaded", "success");
            } else {
                showToast("DigiLocker returned partial details", "error");
            }
        } catch (error) {
            const aadhaar =
                getVerificationElements(prefix, "aadhaar");

            const pan =
                getVerificationElements(prefix, "pan");

            if (aadhaar.input) {
                aadhaar.input.value = "";
            }

            if (pan.input) {
                pan.input.value = "";
            }

            setStoredVerification(prefix, "aadhaar", false);
            setStoredVerification(prefix, "pan", false);
            updateVerificationUI(prefix);
            showToast(error.message, "error");
        }
    }, 300);
}

function updateVerificationUI(prefix = localStorage.getItem("verificationPrefix") || (activeTab === "experienced" ? "e" : "f")) {

    const aadhaarVerified =
        isStoredVerification(prefix, "aadhaar") ||
        localStorage.getItem("aadhaarVerified") === "true";

    const panVerified =
        isStoredVerification(prefix, "pan") ||
        localStorage.getItem("panVerified") === "true";

    if (aadhaarVerified && panVerified) {
        completeVerificationUi(
            {
                status: document.getElementById(
                    getVerificationElementId(prefix, "identity", "status")),
                button: document.getElementById(
                    getVerificationElementId(prefix, "identity", "button"))
            },
            "Aadhaar and PAN verified");
    } else if (aadhaarVerified || panVerified) {
        const status =
            document.getElementById(
                getVerificationElementId(prefix, "identity", "status"));

        if (status) {
            status.innerHTML =
                aadhaarVerified
                    ? "Aadhaar verified. PAN not returned."
                    : "PAN verified. Aadhaar not returned.";
        }
    }
}


function closeVerificationModal() {

    document.getElementById(
        "verificationModal"
    ).style.display = "none";
}
function viewResume(path) {

    window.open(getResumeUrl(path), "_blank");
}

function downloadResume(path) {

    const link =
        document.createElement("a");

    link.href = getResumeUrl(path);

    link.download = "Resume.pdf";

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);
}

function getResumeUrl(path) {

    if (!path) {
        return "";
    }

    if (path.startsWith("http")) {
        return path;
    }

    return `${API_BASE_URL.replace("/api", "")}${path}`;
}
function getVerificationElements(prefix, type) {

    return {
        input: document.getElementById(
            getVerificationElementId(prefix, type, "input")),
        status: document.getElementById(
            getVerificationElementId(prefix, type, "status")),
        button: document.getElementById(
            getVerificationElementId(prefix, type, "button"))
    };
}





async function postVerification(path, number) {

    // Shared POST helper for Aadhaar, PAN, and UAN verification calls.
    const token =
        authStorage.getItem("token");

    const response = await fetch(
        `${API_BASE_URL}/Verification/${path}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ number })
        });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "Verification failed");
    }

    return data;
}

function completeVerificationUi(elements, message) {

    if (elements.status) {
        elements.status.innerHTML = message || "Verified";
    }

    if (elements.button) {
        elements.button.disabled = true;
        elements.button.innerHTML = "Verified";
    }
}

function resetVerificationUi(prefix, type) {

    const elements =
        getVerificationElements(prefix, type);

    if (elements.input) {
        elements.input.value = "";
    }

    if (elements.status) {
        elements.status.innerHTML = "";
    }

    if (elements.button) {
        elements.button.disabled = false;
        elements.button.innerHTML =
            type === "uan"
                ? "Verify UAN"
                : type === "pan"
                    ? "Verify PAN"
                    : "Verify Aadhaar";
    }
}

function clearIdentificationFields(prefix) {

    ["pan", "aadhaar", "uan"].forEach(type =>
        resetVerificationUi(prefix, type)
    );
}

function clearInactiveCandidateVerification(selectedType) {

    if (!loadedCandidateType ||
        loadedCandidateType === selectedType) {
        return;
    }

    const prefix =
        selectedType === "experienced"
            ? "e"
            : "f";

    clearIdentificationFields(prefix);
}

function handleDigiLockerRedirect(data) {

    if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return true;
    }

    return false;
}

async function readApiJson(response, fallbackMessage) {
    const text =
        await response.text();

    if (!text) {
        return {};
    }

    try {
        return JSON.parse(text);
    } catch {
        throw new Error(
            response.ok
                ? fallbackMessage
                : `${fallbackMessage}: ${text.slice(0, 160)}`
        );
    }
}

function saveDraftForm() {

    const data = {

        fullName:
            document.getElementById("f-name")?.value || "",

        email:
            document.getElementById("f-email")?.value || "",

        phone:
            document.getElementById("f-phone")?.value || "",

        dob:
            document.getElementById("f-dob")?.value || "",

        aadhaar:
            document.getElementById("aadhaarNumber")?.value || "",

        pan:
            document.getElementById("panNumber")?.value || "",

        address:
            document.getElementById("f-address")?.value || ""
    };

    localStorage.setItem(
        "fresherFormData",
        JSON.stringify(data));
}
function restoreDraftForm() {

    const data =
        JSON.parse(
            localStorage.getItem(
                "fresherFormData"));

    if (!data) return;

    document.getElementById("f-name").value =
        data.fullName || "";

    document.getElementById("f-email").value =
        data.email || "";

    document.getElementById("f-phone").value =
        data.phone || "";

    document.getElementById("f-dob").value =
        data.dob || "";

    document.getElementById("aadhaarNumber").value =
        data.aadhaar || "";

    document.getElementById("panNumber").value =
        data.pan || "";

    document.getElementById("f-address").value =
        data.address || "";
}


async function verifyUan(prefix = "e") {
    console.log("UAN BUTTON CLICKED");

    const uan =
        document.getElementById("uanNumber")?.value.trim();

    console.log("UAN =", uan);

    return startVerification("uan", prefix);
}

async function startDigiLockerVerification(type, prefix = activeTab === "fresher" ? "f" : "e") {
    console.log(
        "INPUT ID =",
        getVerificationElementId(prefix, type, "input")
    );

    console.log(
        "BUTTON ID =",
        getVerificationElementId(prefix, type, "button")
    );

    console.log(
        "STATUS ID =",
        getVerificationElementId(prefix, type, "status")
    );

    console.log(
        "INPUT ELEMENT =",
        document.getElementById(
            getVerificationElementId(prefix, type, "input")
        )
    );
    const elements = getVerificationElements(prefix, type);
    const number = elements.input?.value.trim() || "";
    console.log("PAN:", number);
    console.log("TYPE:", type);
    console.log("PREFIX:", prefix);
    console.log("ELEMENTS:", elements);
    console.log("INPUT:", elements.input);
    console.log("NUMBER:", number);

    if (type === "aadhaar" && !validateAadhaar(number)) {
        showToast("Enter valid 12-digit Aadhaar", "error");
        return;
    }

    if (type === "pan" && !validatePAN(number.toUpperCase())) {
        showToast("Enter valid PAN", "error");
        return;
    }

    if (type === "pan" && elements.input) {
        elements.input.value = number.toUpperCase();
    }

    try {
        localStorage.setItem("pendingVerification", type);
        localStorage.setItem("pendingVerificationPrefix", prefix);
        console.log("SAVING PREFIX:", prefix);
        console.log("ACTIVE TAB:", activeTab);

        const response =
            await fetch(
                "https://localhost:7250/api/Digilocker/generate-link",
                {
                    method: "POST"
                });

        const result =
            await readApiJson(
                response,
                "Unable to start DigiLocker");

        const redirectUrl =
            result?.data?.url ||
            result?.data?.redirect_url ||
            result?.data?.authorization_url ||
            result?.redirectUrl;

        if (!response.ok || !redirectUrl) {
            throw new Error(result?.message || "Unable to start DigiLocker");
        }

        window.location.href =
            redirectUrl;
    } catch (error) {
        showToast(error.message, "error");
    }
}

function handleVerificationCallback() {
   

    const params =
        new URLSearchParams(
            window.location.search);

    const status =
        params.get("status");
    console.log("CALLBACK RUNNING");
    console.log(window.location.href);
    console.log("STATUS:", status);

    if (status === "success") {

        const pendingVerification =
            localStorage.getItem("pendingVerification");

        const pendingVerificationPrefix =
            localStorage.getItem("pendingVerificationPrefix");
        localStorage.setItem(
            "verificationPrefix",
            pendingVerificationPrefix);

        if (pendingVerification === "aadhaar") {
            localStorage.setItem(
                "aadhaarVerified",
                "true");
        } else if (pendingVerification === "pan") {
            localStorage.setItem(
                "panVerified",
                "true");
        } else {
            localStorage.setItem(
                "aadhaarVerified",
                "true");

            localStorage.setItem(
                "panVerified",
                "true");
        }

        localStorage.removeItem("pendingVerification");
        localStorage.removeItem("pendingVerificationPrefix");

        if (typeof showPage === "function") {
            showPage("jobseeker");
        }

        if (typeof openJobseekerForm === "function") {
            openJobseekerForm(
                pendingVerificationPrefix === "e"
                    ? "experienced"
                    : "fresher");
        }
        setTimeout(() => {

            restoreDraftForm();

            updateVerificationUI();

        }, 300);
    }

    updateVerificationUI();
}

window.addEventListener("load", handleVerificationCallback);

function updateVerificationUI() {
    const prefix =
        localStorage.getItem(
            "verificationPrefix") || "f";

    const aadhaarVerified =
        localStorage.getItem(
            "aadhaarVerified");

    const panVerified =
        localStorage.getItem(
            "panVerified");
    console.log("UPDATE UI RUNNING");
    console.log("PREFIX:", prefix);
    console.log("aadhaarVerified:", aadhaarVerified);
    console.log("panVerified:", panVerified);

    if (aadhaarVerified === "true") {

        const aadhaarStatus =
            document.getElementById("aadhaarStatus");

        if (aadhaarStatus) {
            aadhaarStatus.innerHTML =
                "✅ Aadhaar Verified";
        }

        const aadhaarBtn =
            document.getElementById("verifyAadhaarBtn");

        if (aadhaarBtn) {
            aadhaarBtn.disabled = true;
        }

        completeVerificationUi(
            getVerificationElements("f", "aadhaar"),
            "✅ Aadhaar Verified");
    }

    if (panVerified === "true") {

        const panStatus =
            document.getElementById("panStatus");

        if (panStatus) {
            panStatus.innerHTML =
                "✅ PAN Verified";
        }

        const panBtn =
            document.getElementById("verifyPanBtn");

        if (panBtn) {
            panBtn.disabled = true;
        }

        completeVerificationUi(
            getVerificationElements("f", "pan"),
            "✅ PAN Verified");
    }
}



function getVerificationStorageKey(prefix, type) {

    return `${prefix}-${type}-verified`;
}

function renderChip(val, type, inputEl) {

    const chip = document.createElement("span");

    chip.className = "skill-chip";

    chip.innerHTML = `
        ${escapeHtml(val)}
        <button type="button"
                aria-label="Remove ${escapeHtml(val)}"
                onclick="removeSkill(this,'${escapeHtml(val)}','${type}')">
            x
        </button>
    `;

    inputEl.parentElement.insertBefore(chip, inputEl);
}

function setStoredVerification(prefix, type, verified) {

    localStorage.setItem(
        getVerificationStorageKey(prefix, type),
        verified ? "true" : "false");
}

function isStoredVerification(prefix, type) {

    return localStorage.getItem(
        getVerificationStorageKey(prefix, type)) === "true";
}

function getCandidateDraftFieldIds(prefix) {

    return [
        "name",
        "email",
        "phone",
        "dob",
        "address",
        "pref-loc",
        "salary",
        "qual",
        "year",
        "percent",
        "college",
        "role",
        "company",
        "jobtitle",
        "exp",
        "notice",
        "curr-sal",
        "about"
    ].map(field => `${prefix}-${field}`);
}

function saveDraftForm(prefix = activeTab === "experienced" ? "e" : "f") {

    const data = {};

    getCandidateDraftFieldIds(prefix).forEach(id => {
        data[id] = document.getElementById(id)?.value || "";
    });

    ["aadhaar", "pan", "uan"].forEach(type => {
        const id = getVerificationElementId(prefix, type, "input");
        data[id] = document.getElementById(id)?.value || "";
    });

    data.skills =
        prefix === "e"
            ? Skills.experienced
            : Skills.fresher;

    localStorage.setItem(
        `${prefix}FormData`,
        JSON.stringify(data));
}

function restoreDraftForm(prefix = localStorage.getItem("verificationPrefix") || "f") {

    const raw =
        localStorage.getItem(`${prefix}FormData`);

    if (!raw) {
        return;
    }

    let data = null;

    try {
        data = JSON.parse(raw);
    } catch {
        return;
    }

    Object.entries(data).forEach(([id, value]) => {
        if (id === "skills") {
            return;
        }

        const field = document.getElementById(id);

        if (field) {
            field.value = value || "";
        }
    });

    if (Array.isArray(data.skills)) {
        setSkills(
            prefix === "e" ? "experienced" : "fresher",
            data.skills.join(","));
    }
}

function getVerificationElementId(prefix, type, part) {

    const ids = {
        f: {
            aadhaar: {
                input: "aadhaarNumber",
                button: "verifyIdentityBtn",
                status: "identityStatus"
            },
            pan: {
                input: "panNumber",
                button: "verifyIdentityBtn",
                status: "identityStatus"
            },
            identity: {
                button: "verifyIdentityBtn",
                status: "identityStatus"
            }
        },
        e: {
            aadhaar: {
                input: "e-aadhaar",
                button: "e-verify-identity-btn",
                status: "e-identity-status"
            },
            pan: {
                input: "e-pan",
                button: "e-verify-identity-btn",
                status: "e-identity-status"
            },
            identity: {
                button: "e-verify-identity-btn",
                status: "e-identity-status"
            },
            uan: {
                input: "uanNumber",
                button: "verifyUanBtn",
                status: "uanStatus"
            }
        }
    };

    return ids[prefix]?.[type]?.[part] ||
        `${prefix}-${type}${part === "input" ? "" : `-${part === "button" ? "btn" : "status"}`}`;
}

function renderVerificationFields(type) {

    const prefix =
        type === "experienced"
            ? "e"
            : "f";

    const mount =
        document.getElementById(`${prefix}-verification-fields`);

    if (!mount) {
        return;
    }

    mount.innerHTML = `
        <div class="identity-verify-panel">
            <div class="form-row">
                <div class="form-group">
                    <label for="${getVerificationElementId(prefix, "aadhaar", "input")}">
                        Aadhaar
                    </label>
                    <input type="text"
                           id="${getVerificationElementId(prefix, "aadhaar", "input")}"
                           placeholder="Not Verified"
                           readonly
                           autocomplete="off" />
                </div>
                <div class="form-group">
                    <label for="${getVerificationElementId(prefix, "pan", "input")}">
                        PAN
                    </label>
                    <input type="text"
                           id="${getVerificationElementId(prefix, "pan", "input")}"
                           placeholder="Not Verified"
                           readonly
                           autocomplete="off" />
                </div>
            </div>
            <div class="verify-actions identity-action-row">
                <button type="button"
                        id="${getVerificationElementId(prefix, "identity", "button")}"
                        class="verify-btn digilocker-btn"
                        onclick="verifyIdentityWithDigiLocker('${prefix}')">
                    <span class="verify-pulse"></span>
                    Verify with DigiLocker
                </button>
                <span class="verify-status"
                      id="${getVerificationElementId(prefix, "identity", "status")}"></span>
            </div>
        </div>
        ${type === "experienced"
            ? `
                <div class="form-row verify-row">
                    <div class="form-group">
                        <label for="${getVerificationElementId(prefix, "uan", "input")}">
                            UAN <span class="req">*</span> <span class="hint">(12-digit)</span>
                        </label>
                        <input type="text"
                               id="${getVerificationElementId(prefix, "uan", "input")}"
                               placeholder="123456789012"
                               maxlength="12"
                               autocomplete="off" />
                        <div class="verify-actions">
                            <button type="button"
                                    id="${getVerificationElementId(prefix, "uan", "button")}"
                                    class="verify-btn"
                                    onclick="verifyUan('${prefix}')">
                                Verify UAN
                            </button>
                            <span class="verify-status"
                                  id="${getVerificationElementId(prefix, "uan", "status")}"></span>
                        </div>
                    </div>
                </div>
            `
            : ""}
    `;
}

function renderAllVerificationFields() {

    renderVerificationFields("fresher");
    renderVerificationFields("experienced");
}

function resetVerificationUi(prefix, type) {

    const elements =
        getVerificationElements(prefix, type);

    if (elements.input) {
        elements.input.value = "";
    }

    if (elements.status) {
        elements.status.innerHTML = "";
    }

    if (elements.button) {
        elements.button.disabled = false;
        elements.button.innerHTML =
            type === "uan"
                ? "Verify UAN"
                : `<span class="verify-pulse"></span> Verify with DigiLocker`;
    }
}

function wireVerificationButtons() {

    // Buttons are rendered with explicit onclick handlers.
}

async function verifyIdentityWithDigiLocker(prefix = activeTab === "experienced" ? "e" : "f") {

    saveDraftForm(prefix);

    return startDigiLockerVerification("identity", prefix);
}

async function verifyAadhaar(prefix) {

    return verifyIdentityWithDigiLocker(
        typeof prefix === "string"
            ? prefix
            : activeTab === "experienced" ? "e" : "f");
}

async function verifyPan(prefix) {

    return verifyIdentityWithDigiLocker(
        typeof prefix === "string"
            ? prefix
            : activeTab === "experienced" ? "e" : "f");
}

async function startDigiLockerVerification(type, prefix = activeTab === "experienced" ? "e" : "f") {

    try {
        localStorage.setItem("pendingVerification", type);
        localStorage.setItem("pendingVerificationPrefix", prefix);
        localStorage.setItem("verificationPrefix", prefix);

        const response =
            await fetch(
                `${API_BASE_URL.replace("/api", "")}/api/Digilocker/generate-link`,
                {
                    method: "POST"
                });

        const result =
            await readApiJson(
                response,
                "Unable to start DigiLocker");

        const redirectUrl =
            result?.data?.url ||
            result?.data?.redirect_url ||
            result?.data?.authorization_url ||
            result?.redirectUrl;

        if (!response.ok || !redirectUrl) {
            throw new Error(result?.message || "Unable to start DigiLocker");
        }

        window.location.href = redirectUrl;
    } catch (error) {
        showToast(error.message, "error");
    }
}

function handleVerificationCallback() {

    const params =
        new URLSearchParams(window.location.search);

    const status =
        params.get("status");

    if (status === "success") {
        const pendingVerification =
            localStorage.getItem("pendingVerification") || "identity";

        const prefix =
            localStorage.getItem("pendingVerificationPrefix") ||
            localStorage.getItem("verificationPrefix") ||
            "f";

        localStorage.setItem("verificationPrefix", prefix);

        if (pendingVerification === "identity") {
            setStoredVerification(prefix, "aadhaar", true);
            setStoredVerification(prefix, "pan", true);
        } else {
            setStoredVerification(prefix, pendingVerification, true);
        }

        localStorage.removeItem("pendingVerification");
        localStorage.removeItem("pendingVerificationPrefix");

        if (typeof showPage === "function") {
            showPage("jobseeker");
        }

        if (typeof openJobseekerForm === "function") {
            openJobseekerForm(
                prefix === "e"
                    ? "experienced"
                    : "fresher");
        }

        setTimeout(() => {
            restoreDraftForm(prefix);
            updateVerificationUI(prefix);
        }, 300);
    } else {
        updateVerificationUI();
    }
}

function updateVerificationUI(prefix = localStorage.getItem("verificationPrefix") || (activeTab === "experienced" ? "e" : "f")) {

    const aadhaarVerified =
        isStoredVerification(prefix, "aadhaar") ||
        localStorage.getItem("aadhaarVerified") === "true";

    const panVerified =
        isStoredVerification(prefix, "pan") ||
        localStorage.getItem("panVerified") === "true";

    if (aadhaarVerified && panVerified) {
        completeVerificationUi(
            {
                status: document.getElementById(
                    getVerificationElementId(prefix, "identity", "status")),
                button: document.getElementById(
                    getVerificationElementId(prefix, "identity", "button"))
            },
            "Aadhaar and PAN verified");
    }
}

/* Verification flow starts here: Aadhaar/PAN go through DigiLocker, UAN goes through the backend EPFO provider. */
/* Verification flow ikkada start avtundi: Aadhaar/PAN DigiLocker ki, UAN backend EPFO provider ki vellutundi. */
async function startVerification(type, prefix = activeTab === "experienced" ? "e" : "f") {

    const elements = getVerificationElements(prefix, type);
    const number = elements.input?.value.trim() || "";

    if (type === "aadhaar" || type === "pan") {
        return verifyIdentityWithDigiLocker(prefix);
    }

    if (type === "uan" && !validateUAN(number)) {
        showToast("Enter valid 12-digit UAN", "error");
        return;
    }

    try {
        const data =
            await postVerification(
                `verify-${type}`,
                number);

        completeVerificationUi(elements, "UAN verified");
        setStoredVerification(prefix, type, true);

        if (type === "uan") {
            const employmentHistory =
                data.employmentHistory || [];

            localStorage.setItem(
                "verifiedEmploymentHistory",
                JSON.stringify(employmentHistory));

            const companyField =
                document.getElementById("e-company");

            if (companyField && employmentHistory.length) {
                companyField.value =
                    renderEmploymentHistoryText(employmentHistory);
            }

            // UAN verification ends by storing employment history and showing it in the verification modal.
            // UAN verification ikkada end avtundi: employment history save ayi modal lo chupistundi.
            showEmploymentHistoryModal(data);
        }

        showToast(data.message || `${type.toUpperCase()} verified`, "success");
    } catch (error) {
        showToast(error.message, "error");
    }
}

/* Verification sync flow: reload saved document status when an existing jobseeker profile opens. */
/* Verification sync flow: existing jobseeker profile open ayyaka saved document status reload avtundi. */
async function loadVerificationStatus() {

    const token = authStorage.getItem("token");

    if (!token) {
        return;
    }

    try {
        const response = await fetch(
            `${API_BASE_URL}/Verification/candidate-verification`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

        if (!response.ok) {
            return;
        }

        const data = await response.json();

        loadedCandidateType =
            data.candidateType || null;

        clearIdentificationFields("f");
        clearIdentificationFields("e");

        const prefix =
            data.candidateType === "experienced"
                ? "e"
                : "f";

        localStorage.setItem("verificationPrefix", prefix);

        const aadhaar = getVerificationElements(prefix, "aadhaar");
        const pan = getVerificationElements(prefix, "pan");
        const uan = getVerificationElements(prefix, "uan");

        if (aadhaar.input && data.aadhaarNumber) {
            aadhaar.input.value = data.aadhaarNumber;
        }

        if (pan.input && data.panNumber) {
            pan.input.value = data.panNumber;
        }

        if (uan.input && data.uanNumber) {
            uan.input.value = data.uanNumber;
        }

        setStoredVerification(prefix, "aadhaar", data.aadhaarVerified);
        setStoredVerification(prefix, "pan", data.panVerified);
        setStoredVerification(prefix, "uan", data.uanVerified);

        if (data.employmentHistory) {
            localStorage.setItem(
                "verifiedEmploymentHistory",
                typeof data.employmentHistory === "string"
                    ? data.employmentHistory
                    : JSON.stringify(data.employmentHistory));
        }

        updateVerificationUI(prefix);

        if (data.uanVerified) {
            completeVerificationUi(uan, "UAN verified");
        }
    } catch (error) {
        console.error(error);
    }
}

/* Jobseeker profile save flow: validated profile and verification state are posted to Candidates. */
/* Jobseeker profile save flow: validated profile and verification status Candidates API ki send avtayi. */
function submitJobseeker() {

    const isFresher = activeTab === 'fresher';
    const p = isFresher ? 'f' : 'e';

    const name =
        document.getElementById(`${p}-name`)?.value.trim() || "";

    const email =
        document.getElementById(`${p}-email`)?.value.trim() ||
        getLoggedInEmail();

    const phone =
        document.getElementById(`${p}-phone`)?.value.trim() || "";

    const uan =
        isFresher
            ? ""
            : document
                .getElementById(getVerificationElementId("e", "uan", "input"))
                ?.value.trim() || "";

    const salary =
        document.getElementById(`${p}-salary`)?.value;

    const skills =
        Skills[isFresher ? 'fresher' : 'experienced'];

    if (!name) {
        showToast("Enter name", "error");
        return;
    }

    if (!validateEmail(email)) {
        showToast("Invalid email", "error");
        return;
    }

    if (!validatePhone(phone)) {
        showToast("Invalid phone", "error");
        return;
    }

    if (!isFresher && !validateUAN(uan)) {
        showToast("Invalid UAN", "error");
        return;
    }

    const dob =
        document.getElementById(`${p}-dob`)?.value || "";

    const aadhaarNumber =
        document
            .getElementById(getVerificationElementId(p, "aadhaar", "input"))
            ?.value || "";

    const panNumber =
        document
            .getElementById(getVerificationElementId(p, "pan", "input"))
            ?.value || "";

    if (!validateVerifiedAadhaar(aadhaarNumber)) {
        showToast("Invalid Aadhaar", "error");
        return;
    }

    if (!validateVerifiedPan(panNumber)) {
        showToast("Invalid PAN", "error");
        return;
    }

    const aadhaarVerified =
        isStoredVerification(p, "aadhaar") ||
        localStorage.getItem("aadhaarVerified") === "true";

    const panVerified =
        isStoredVerification(p, "pan") ||
        localStorage.getItem("panVerified") === "true";

    if (!aadhaarVerified || !panVerified) {
        showToast("Please verify Aadhaar and PAN with DigiLocker", "error");
        return;
    }

    const uanVerified =
        isFresher ||
        isStoredVerification("e", "uan");

    if (!uanVerified) {
        showToast("Please verify UAN", "error");
        return;
    }

    const experience =
        isFresher
            ? 0
            : parseInt(document.getElementById("e-exp")?.value, 10) || 0;

    const location =
        document.getElementById(`${p}-pref-loc`)?.value.trim() || "Open";

    const verifiedEmploymentHistory =
        localStorage.getItem("verifiedEmploymentHistory");

    const employmentHistory =
        isFresher
            ? ""
            : verifiedEmploymentHistory ||
            JSON.stringify([{
                company: document.getElementById("e-company")?.value.trim() || "",
                doj: "",
                doe: ""
            }]);

    const newCandidate = {
        fullName: name,
        email: email,
        phone: phone,
        aadhaarVerified: true,
        panVerified: true,
        uanVerified: isFresher ? false : true,
        uanNumber: isFresher ? null : uan,
        dob: dob,
        aadhaarNumber: aadhaarNumber,
        panNumber: panNumber.toUpperCase(),
        employmentHistory: employmentHistory,
        experience: experience,
        skills: skills.join(","),
        location: location,
        salary: salary,
        candidateType: isFresher ? "fresher" : "experienced",
    };

    // Profile save ends by updating the candidate row and uploading a resume if one was selected.
    // Profile save ikkada end avtundi: candidate row update ayi resume select chesthe upload avtundi.
    fetch(`${API_BASE_URL}/Candidates`, {
        method: 'POST',
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + authStorage.getItem("token")
        },
        body: JSON.stringify(newCandidate)
    })
        .then(async response => {
            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || "API Failed");
            }

            return response.json();
        })
        .then(async data => {
            const resume =
                await uploadResume(data.id, { silentIfMissing: true });

            if (resume?.path) {
                data.resumePath = resume.path;
            }

            ["aadhaarVerified",
                "panVerified",
                "pendingVerification",
                "pendingVerificationPrefix",
                "verificationPrefix",
                "fFormData",
                "eFormData",
                "fresherFormData",
                "verifiedEmploymentHistory"
            ].forEach(key => localStorage.removeItem(key));

            ["f", "e"].forEach(prefix =>
                ["aadhaar", "pan", "uan"].forEach(type =>
                    localStorage.removeItem(getVerificationStorageKey(prefix, type))));

            showModal(
                "Success",
                "Profile submitted successfully!"
            );

            renderSubmittedProfile(data);
        })
        .catch(error => {
            console.error(error);
            showToast(error.message || "API Error", "error");
        });
}

function toggleEmploymentHistory() {

    const panel =
        document.getElementById("employmentHistoryPanel");

    const button =
        document.getElementById("employmentHistoryToggle");

    if (!panel) {
        return;
    }

    const hidden =
        panel.classList.toggle("hidden");

    if (button) {
        button.textContent = hidden
            ? "View Employment History"
            : "Hide Employment History";
    }
}

// Admin control centre: each card opens a focused, manageable directory.
let adminRecords = { users: [], candidates: [], employers: [] };
let adminDashboard = {};

function adminHeaders() {
    return { "Content-Type": "application/json", Authorization: `Bearer ${authStorage.getItem("token")}` };
}

function escapeAdminHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[character]));
}

async function loadAdminDashboard() {
    try {
        const response = await fetch(`${API_BASE_URL}/Admin/dashboard`, { headers: adminHeaders() });
        if (!response.ok) throw new Error("Dashboard request failed");
        adminDashboard = await response.json();
        document.getElementById("admin-users-count").innerText = adminDashboard.totalUsers;
        document.getElementById("admin-candidates-count").innerText = adminDashboard.totalCandidates;
        document.getElementById("admin-employers-count").innerText = adminDashboard.totalEmployers;
        showAdminView("overview");
    } catch (error) {
        console.error(error); showToast("Failed to load admin dashboard", "error");
    }
}

async function showAdminView(view) {
    const title = document.getElementById("admin-view-title");
    const kicker = document.getElementById("admin-view-kicker");
    const back = document.getElementById("admin-back-button");
    const content = document.getElementById("admin-view-content");
    if (!title || !content) return;
    back.hidden = view === "overview";
    if (view === "overview") { kicker.innerText = "DIRECTORY"; title.innerText = "Select a section"; content.innerHTML = '<div class="admin-empty">Select a dashboard card to manage records.</div>'; return; }
    if (view === "candidates") {
        kicker.innerText = "CANDIDATE REGISTRATIONS"; title.innerText = "Choose candidate type";
        content.innerHTML = `<div class="admin-category-grid"><button class="admin-category-card" onclick="showAdminView('freshers')"><strong>Freshers</strong><span>${adminDashboard.totalFreshers || 0} submitted profiles</span></button><button class="admin-category-card" onclick="showAdminView('experienced')"><strong>Experienced</strong><span>${adminDashboard.totalExperienced || 0} submitted profiles</span></button></div>`;
        return;
    }
    const configurations = { users: ["REGISTERED USERS", "All registered users", "users"], freshers: ["CANDIDATE REGISTRATIONS", "Fresher profiles", "candidates?type=fresher"], experienced: ["CANDIDATE REGISTRATIONS", "Experienced profiles", "candidates?type=experienced"], employers: ["EMPLOYER DIRECTORY", "Registered employers", "employers"] };
    const configuration = configurations[view]; if (!configuration) return;
    kicker.innerText = configuration[0]; title.innerText = configuration[1]; content.innerHTML = '<div class="admin-empty">Loading records…</div>';
    try {
        const response = await fetch(`${API_BASE_URL}/Admin/${configuration[2]}`, { headers: adminHeaders() });
        if (!response.ok) throw new Error("Directory request failed");
        const records = await response.json();
        const type = view === "freshers" || view === "experienced" ? "candidates" : view;
        adminRecords[type] = records;
        renderAdminTable(type, records);
    } catch (error) { console.error(error); content.innerHTML = '<div class="admin-empty">Unable to load records.</div>'; }
}

function renderAdminTable(type, records) {
    const content = document.getElementById("admin-view-content");
    if (!records.length) { content.innerHTML = '<div class="admin-empty">No records found in this section.</div>'; return; }
    const rows = records.map(record => {
        if (type === "users") return `<tr><td><strong>${escapeAdminHtml(record.fullName)}</strong><small>${escapeAdminHtml(record.email)}</small></td><td><span class="admin-role">${escapeAdminHtml(record.role)}</span></td>${adminActionCells(type, record.id)}</tr>`;
        if (type === "candidates") return `<tr><td><strong>${escapeAdminHtml(record.fullName)}</strong><small>${escapeAdminHtml(record.email)}</small></td><td>${escapeAdminHtml(record.phone || "—")}</td><td>${escapeAdminHtml(record.location || "—")}</td><td><span class="admin-role">${escapeAdminHtml(record.candidateType)}</span></td>${adminActionCells(type, record.id)}</tr>`;
        return `<tr><td><strong>${escapeAdminHtml(record.companyName)}</strong><small>${escapeAdminHtml(record.officialEmail)}</small></td><td>${escapeAdminHtml(record.contactName || "—")}</td><td>${escapeAdminHtml(record.website || "—")}</td>${adminActionCells(type, record.id)}</tr>`;
    }).join("");
    const heads = type === "users" ? "<th>User</th><th>Role</th>" : type === "candidates" ? "<th>Candidate</th><th>Phone</th><th>Location</th><th>Type</th>" : "<th>Company</th><th>Contact person</th><th>Website</th>";
    content.innerHTML = `<div class="admin-table-wrap"><table class="admin-table"><thead><tr>${heads}<th>Management</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function adminActionCells(type, id) { return `<td class="admin-actions"><button class="admin-edit" onclick="editAdminRecord('${type}', ${id})">Edit</button><button class="admin-delete" onclick="deleteAdminRecord('${type}', ${id})">Delete</button></td>`; }

function adminFormField(label, name, value = "", inputType = "text", options = "") {
    if (inputType === "select") return `<label class="admin-form-field"><span>${label}</span><select name="${name}">${options}</select></label>`;
    if (inputType === "checkbox") return `<label class="admin-check-field"><input type="checkbox" name="${name}" ${value ? "checked" : ""}><span>${label}</span></label>`;
    if (inputType === "textarea") return `<label class="admin-form-field admin-form-full"><span>${label}</span><textarea name="${name}" rows="4">${escapeAdminHtml(value)}</textarea></label>`;
    return `<label class="admin-form-field"><span>${label}</span><input type="${inputType}" name="${name}" value="${escapeAdminHtml(value)}"></label>`;
}

function adminSelectOptions(values, selected) { return values.map(value => `<option value="${value}" ${value === selected ? "selected" : ""}>${value.charAt(0).toUpperCase() + value.slice(1)}</option>`).join(""); }

function editAdminRecord(type, id) {
    const record = adminRecords[type].find(item => item.id === id); if (!record) return;
    const content = document.getElementById("admin-view-content");
    document.getElementById("admin-view-kicker").innerText = "RECORD MANAGEMENT";
    document.getElementById("admin-view-title").innerText = `Edit ${type === "users" ? "user" : type === "candidates" ? "candidate profile" : "employer profile"}`;
    let fields = "";
    if (type === "users") {
        fields = adminFormField("Full name", "fullName", record.fullName) + adminFormField("Email address", "email", record.email, "email") + adminFormField("Account role", "role", "", "select", adminSelectOptions(["jobseeker", "employer", "admin"], record.role));
    } else if (type === "candidates") {
        fields = adminFormField("Full name", "fullName", record.fullName) + adminFormField("Email address", "email", record.email, "email") + adminFormField("Phone number", "phone", record.phone) + adminFormField("Date of birth", "dob", record.dob ? String(record.dob).slice(0, 10) : "", "date") + adminFormField("Candidate type", "candidateType", "", "select", adminSelectOptions(["fresher", "experienced"], record.candidateType)) + adminFormField("Experience (years)", "experience", record.experience, "number") + adminFormField("Location", "location", record.location) + adminFormField("Expected salary", "salary", record.salary) + adminFormField("Skills", "skills", record.skills, "textarea") + adminFormField("Employment history", "employmentHistory", record.employmentHistory, "textarea") + adminFormField("Resume path", "resumePath", record.resumePath) + `<div class="admin-verification-group"><p>Verification status</p>${adminFormField("Aadhaar verified", "aadhaarVerified", record.aadhaarVerified, "checkbox")}${adminFormField("PAN verified", "panVerified", record.panVerified, "checkbox")}${adminFormField("UAN verified", "uanVerified", record.uanVerified, "checkbox")}</div>`;
    } else {
        fields = adminFormField("Company name", "companyName", record.companyName) + adminFormField("Official email", "officialEmail", record.officialEmail, "email") + adminFormField("GST number", "gstNumber", record.gstNumber) + adminFormField("CIN number", "cinNumber", record.cinNumber) + adminFormField("Website", "website", record.website, "url");
    }
    content.innerHTML = `<form class="admin-edit-form" onsubmit="saveAdminRecord(event, '${type}', ${id})"><div class="admin-edit-intro"><strong>Update record details</strong><span>Review the information and save your changes when ready.</span></div><div class="admin-form-grid">${fields}</div><div class="admin-form-actions"><button type="button" class="admin-cancel-button" onclick="showAdminView('${type === "candidates" ? (record.candidateType === "fresher" ? "freshers" : "experienced") : type}')">Cancel</button><button type="submit" class="admin-save-button">Save Changes</button></div></form>`;
}

async function saveAdminRecord(event, type, id) {
    event.preventDefault();
    const record = adminRecords[type].find(item => item.id === id); if (!record) return;
    const formData = new FormData(event.currentTarget); const update = { ...record };
    formData.forEach((value, key) => { update[key] = value; });
    if (type === "candidates") { update.experience = Number(update.experience) || 0; update.aadhaarVerified = formData.has("aadhaarVerified"); update.panVerified = formData.has("panVerified"); update.uanVerified = formData.has("uanVerified"); update.dob = update.dob || null; }
    const saveButton = event.currentTarget.querySelector("button[type='submit']"); saveButton.disabled = true; saveButton.innerText = "Saving…";
    try {
        const response = await fetch(`${API_BASE_URL}/Admin/${type}/${id}`, { method: "PUT", headers: adminHeaders(), body: JSON.stringify(update) });
        if (!response.ok) throw new Error("Update failed");
        showToast("Details updated successfully", "success"); await loadAdminDashboard(); showAdminView(type === "candidates" ? (update.candidateType === "fresher" ? "freshers" : "experienced") : type);
    } catch (error) { console.error(error); showToast("Unable to save changes", "error"); saveButton.disabled = false; saveButton.innerText = "Save Changes"; }
}

async function deleteAdminRecord(type, id) {
    if (!confirm("Delete this record permanently?")) return;
    const response = await fetch(`${API_BASE_URL}/Admin/${type}/${id}`, { method: "DELETE", headers: adminHeaders() });
    if (!response.ok) { showToast("Unable to delete this record", "error"); return; }
    showToast("Record deleted", "success"); await loadAdminDashboard(); showAdminView(type);
}

