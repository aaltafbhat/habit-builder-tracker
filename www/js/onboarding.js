
// ==========================================
// USER ONBOARDING MODULE
// Version 0.2
// ==========================================

// Initialize onboarding
async function initializeOnboarding() {

    const profile = await getProfile();

    if (profile && profile.name) {
        showDashboard(profile);
    } else {
        showOnboarding();
    }
}


// Display first-time setup
function showOnboarding() {

    document.getElementById("onboarding").hidden = false;
    document.getElementById("dashboard").hidden = true;
}


// Display personalized dashboard
function showDashboard(profile) {

    document.getElementById("onboarding").hidden = true;
    document.getElementById("dashboard").hidden = false;

    // Personalized header
    document.getElementById("header-user-name").textContent =
        profile.name;

    document.getElementById("header-subtitle").textContent =
        "Your Personal Command Center";

    // Initialize navigation
    initializeNavigation();
}


// Register new user
async function registerUser(event) {

    event.preventDefault();

    const nameInput = document.getElementById("user-name");
    const name = nameInput.value.trim();

    if (!name) {
        showAppDialog("Please enter your name.");
        return;
    }

    const existingProfile = await getProfile() || {};
    const profile = {
        ...existingProfile,
        id: "current-user",
        name: name,
        workspaceName: existingProfile.workspaceName || name,
        createdAt: existingProfile.createdAt || new Date().toISOString()
    };

    try {

        await saveProfile(profile);

        showDashboard(profile);
        if (typeof window.refreshProfileSettings === "function") {
            await window.refreshProfileSettings();
        }

    } catch (error) {

        console.error("Profile saving failed:", error);

        showAppDialog("Unable to save your profile.");

    }
}


// Connect setup form
document.getElementById("setup-form").addEventListener(
    "submit",
    registerUser
);
