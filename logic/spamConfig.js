/**
 * @description Central configuration for the spam-bot detection feature.
 *
 * Everything is read from process.env (dotenv is loaded in index.js before this
 * module is required). Comma-separated ID lists become Sets, numbers/booleans are
 * coerced, and the whole object is frozen. Missing REQUIRED ids are warned about
 * at boot (visible in logs) but never crash the bot.
 */

/** Parse a comma-separated list of snowflake IDs into a Set of trimmed strings. */
function parseIdSet(value) {
    if (!value) return new Set();
    return new Set(
        value
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
    );
}

/** Coerce an env string into a boolean. Defaults to `fallback` when unset. */
function parseBool(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback;
    return /^(1|true|yes|on)$/i.test(value.trim());
}

/** Coerce an env string into a number, falling back when unset / not-a-number. */
function parseNumber(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

// Discord hard cap on member timeouts is 28 days.
const DISCORD_MAX_TIMEOUT_MS = 2419200000;

const config = Object.freeze({
    // Master switches
    detectionEnabled: parseBool(process.env.SPAM_DETECTION_ENABLED, true),
    dryRun: parseBool(process.env.SPAM_DRY_RUN, true),

    // Where to log + who to ping
    logChannelId: process.env.SPAM_LOG_CHANNEL_ID || "",
    ownerUserId: process.env.OWNER_USER_ID || "",

    // Honeypot channels. "primary" are never legitimately used (each one is a
    // strong signal). "secondary" see occasional legit use, so they only count
    // when BOTH are hit in the window. "voice" is the subset that are
    // voice-channel text chats (extra weight).
    primaryHoneypots: parseIdSet(process.env.HONEYPOT_CHANNEL_IDS),
    secondaryHoneypots: parseIdSet(process.env.SECONDARY_HONEYPOT_CHANNEL_IDS),
    voiceHoneypots: parseIdSet(process.env.HONEYPOT_VOICE_CHANNEL_IDS),

    // Roles
    excludedRoleId: process.env.EXCLUDED_ROLE_ID || "",
    defunctRoleAId: process.env.DEFUNCT_ROLE_A_ID || "",
    defunctRoleBId: process.env.DEFUNCT_ROLE_B_ID || "",
    defunctRoleSignalEnabled: parseBool(
        process.env.DEFUNCT_ROLE_SIGNAL_ENABLED,
        true
    ),

    // Thresholds & tuning
    identityWarnThreshold: parseNumber(
        process.env.SPAM_IDENTITY_WARN_THRESHOLD,
        6
    ),
    muteThreshold: parseNumber(process.env.SPAM_MUTE_THRESHOLD, 12),
    maxTimeoutMs: Math.min(
        parseNumber(process.env.SPAM_MAX_TIMEOUT_MS, DISCORD_MAX_TIMEOUT_MS),
        DISCORD_MAX_TIMEOUT_MS
    ),

    // How long to hold a behaviour-driven warn before pinging the owner, so a
    // burst that escalates to a mute can cancel the (now-redundant) warn.
    warnDelayMs: parseNumber(process.env.SPAM_WARN_DELAY_MS, 15000),

    // Per-user cooldown so one burst doesn't produce duplicate actions.
    actionCooldownMs: parseNumber(process.env.SPAM_ACTION_COOLDOWN_MS, 300000),

    // Sliding window bounds (kept here so tracker + detector agree).
    windowMaxMs: parseNumber(process.env.SPAM_WINDOW_MAX_MS, 900000), // 15 min
    perUserEventCap: parseNumber(process.env.SPAM_PER_USER_EVENT_CAP, 200),

    DISCORD_MAX_TIMEOUT_MS,
});

/**
 * @description Warn (once, at boot) about any missing configuration required for
 * the detector to do anything useful. Never throws.
 */
function warnOnMissingConfig() {
    if (!config.detectionEnabled) {
        console.log("[spam] detection disabled via SPAM_DETECTION_ENABLED");
        return;
    }

    const missing = [];
    if (!config.logChannelId) missing.push("SPAM_LOG_CHANNEL_ID");
    if (!config.ownerUserId) missing.push("OWNER_USER_ID");
    if (config.primaryHoneypots.size === 0 && config.secondaryHoneypots.size === 0)
        missing.push("HONEYPOT_CHANNEL_IDS/SECONDARY_HONEYPOT_CHANNEL_IDS");

    if (missing.length > 0) {
        console.warn(
            `[spam] missing recommended config: ${missing.join(
                ", "
            )} — detection will run but may be less effective`
        );
    }

    if (config.dryRun) {
        console.log(
            "[spam] DRY RUN enabled — no real timeouts or deletes will happen; log embeds only"
        );
    }
}

module.exports = {
    config,
    warnOnMissingConfig,
    // exported for tests
    parseIdSet,
    parseBool,
    parseNumber,
};
