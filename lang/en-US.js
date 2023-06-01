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
    default_deny_reason: "No reason provided",

    footer_request_approved: "✔️ Approved",

    // DM messages
    dm_deny_message:
`Hey - your request for elevated access in Isaac's server was denied for the following reason:

_%1$s_

If you believe this is in error, please contact Isaac. You're welcome to stay in the server as a guest!`,
    dm_approve_message: "Hey - just letting you know that your server access request on Isaac's server was approved! See you there :)",

    // Ephemeral messages
    ephemeral_approved_dm: "<:greentick:1113729496395292783> <@%1$s> was approved! They were sent a direct message.",
    ephemeral_approved_no_dm: "<:greentick:1113729496395292783> <@%1$s> was approved! A direct message could not be sent.",
    ephemeral_denied_dm: "<:greentick:1113729496395292783> <@%1$s> was denied! They were sent a direct message.",
    ephemeral_denied_no_dm: "<:greentick:1113729496395292783> <@%1$s> was denied! A direct message could not be sent.",
    ephemeral_welcome_guest: "Welcome to the server! You can now access the public channels. You can always come back and request access to private channels later."
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