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
    error_member_left_server: "<:redtick:1113729536572534815> **Error:** This member left the server",
    footer_member_left_server: "Member left server",
    footer_request_denied: "❌ Denied",

    footer_request_approved: "✔️ Approved",

    ephemeral_welcome_guest: "Welcome to the server! You can now access the public channels. If you know me IRL, you should request access to the private channels with the button above. You can always come back and request access later!"
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
    text
};