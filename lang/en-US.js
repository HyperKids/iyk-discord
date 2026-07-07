const { vsprintf } = require("sprintf-js");

/**
 * This is used for debugging purposes. Set to false if you're missing a key. In production, this should always be set to true.
 */
const strict = true;

/**
 * All of the following text is what needs to be translated to other locales.  en-US is done as an example.
 */
const text = {
    // Access embeds
    error_member_left_server:
        "<:redtick:1113729536572534815> **Error:** This member left the server",
    footer_member_left_server: "Member left server",
    footer_request_denied: "❌ Denied",

    footer_request_approved: "✔️ Approved",

    ephemeral_welcome_guest:
        "Welcome to the server - excited to have you here! If you know me IRL, you can ask to access other channels with the button above.",

    // Emergency ban
    eban_error_not_authorized:
        "You don't have permission to use Emergency Ban.",
    eban_error_locked_out:
        "Too many wrong passwords - Emergency Ban is locked for you until %s.",
    eban_error_not_configured:
        "Emergency Ban isn't set up for your account - ask Isaac to add a password for you.",
    eban_error_self: "You can't ban yourself.",
    eban_error_bot: "You can't use Emergency Ban on bots.",
    eban_error_protected:
        "This user is protected and can't be banned with Emergency Ban.",
    eban_error_wrong_password:
        "Wrong password - %s attempt(s) left before a temporary lockout.",
    eban_error_hierarchy:
        "I can't ban this user - my role isn't high enough (or I'm missing the Ban Members permission).",
    eban_error_ban_failed:
        "Something went wrong and the ban was not completed.",
    eban_success:
        "Banned %s and purged their messages from the last 7 days. This has been logged.",
};

// WARNING: DO NOT EDIT ANYTHING BELOW THIS LINE

/**
 *
 * @param {string} key The key to use to find the appropriate text
 * @returns The correctly translated text for the key
 */
function language(key) {
    const args = [...arguments].slice(1);

    if (text[key]) return vsprintf(text[key], args);

    if (strict) throw `Lang text missing for en-US. Key: ${key}.`;

    return vsprintf(defaultText, args);
}

module.exports = {
    language,
    text,
};
