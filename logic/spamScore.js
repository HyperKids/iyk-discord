/**
 * @description Pure scoring + snowflake helpers for spam detection.
 *
 * This module has NO discord.js dependency and no side effects, so it is fully
 * unit-testable under `node test/spamScore.test.js`. The orchestrator
 * (moderation/spamDetector.js) is responsible for turning live discord objects
 * and sliding-window state into the plain `ctx` object consumed here.
 *
 * Two-tier model:
 *   - identityScore  (who the account is)  -> drives WARN
 *   - behaviorScore  (what they're doing)  -> drives MUTE
 * A MUTE additionally requires a hard "gate" signal so a merely-new user who
 * drops a couple images can't be timed out. Longer-tenured members get a scaled
 * (higher) mute threshold so they effectively never trip.
 */

const DISCORD_EPOCH = 1420070400000;

const HOUR_MS = 3600000;
const DAY_MS = 86400000;

/**
 * @description Convert a Discord snowflake to its creation timestamp (ms).
 * @param {string|bigint} id
 * @returns {number} unix ms
 */
function snowflakeToTimestamp(id) {
    return Number(BigInt(id) >> 22n) + DISCORD_EPOCH;
}

/**
 * @description Threshold multiplier based on how long the member has been in the
 * server. Longer membership -> higher bar to mute (established members are
 * essentially immune). Unknown membership is treated as newest (multiplier 1),
 * because an account spraying honeypots is actionable regardless of tenure and
 * the mute gate still guards against false positives.
 * @param {number|null} membershipHours
 */
function membershipMultiplier(membershipHours) {
    if (membershipHours == null) return 1.0;
    if (membershipHours < 24) return 1.0;
    if (membershipHours < 24 * 7) return 1.3;
    if (membershipHours < 24 * 30) return 1.8;
    return 3.0;
}

/**
 * @description Score a message/member context into a warn/mute/none decision.
 *
 * ctx fields (all optional; sensible defaults applied):
 *   now                     {number} unix ms
 *   accountCreatedMs        {number} user.createdTimestamp
 *   joinedAtMs              {number|null} member.joinedTimestamp
 *   hasBothDefunctRoles     {boolean}
 *   imageChannels5m         {number} distinct channels w/ an image in last 5m
 *   distinctChannels1m      {number} distinct channels posted to in last 1m
 *   primaryHoneypotHits5m   {number} distinct primary honeypots hit in 5m
 *   bothSecondaryHoneypots  {boolean} both secondary honeypots hit in window
 *   voiceHoneypotHits5m     {number} distinct voice-text honeypots among counted hits
 *
 * opts fields (default to the documented plan values):
 *   identityWarnThreshold, muteThreshold, defunctRoleSignalEnabled
 *
 * @returns {{
 *   identityScore:number, behaviorScore:number, total:number,
 *   multiplier:number, effectiveMuteThreshold:number, gate:boolean,
 *   action:"none"|"warn"|"mute", warnSource:null|"identity"|"behavior",
 *   reasons:string[]
 * }}
 */
function scoreMessage(ctx = {}, opts = {}) {
    const {
        now = Date.now(),
        accountCreatedMs = null,
        joinedAtMs = null,
        hasBothDefunctRoles = false,
        imageChannels5m = 0,
        distinctChannels1m = 0,
        primaryHoneypotHits5m = 0,
        bothSecondaryHoneypots = false,
        voiceHoneypotHits5m = 0,
    } = ctx;

    const {
        identityWarnThreshold = 6,
        muteThreshold = 12,
        defunctRoleSignalEnabled = true,
    } = opts;

    const reasons = [];

    // ---------- identity score ----------
    let identityScore = 0;

    const accountAgeHours =
        accountCreatedMs != null ? (now - accountCreatedMs) / HOUR_MS : null;
    if (accountAgeHours != null) {
        if (accountAgeHours < 24 * 7) {
            identityScore += 4;
            reasons.push(`account < 7d old (+4)`);
        } else if (accountAgeHours < 24 * 21) {
            identityScore += 2;
            reasons.push(`account < 21d old (+2)`);
        }
    }

    const membershipHours =
        joinedAtMs != null ? (now - joinedAtMs) / HOUR_MS : null;
    if (membershipHours != null) {
        if (membershipHours < 24) {
            identityScore += 2;
            reasons.push(`joined < 24h ago (+2)`);
        } else if (membershipHours < 72) {
            identityScore += 1;
            reasons.push(`joined < 72h ago (+1)`);
        }
    }

    if (defunctRoleSignalEnabled && hasBothDefunctRoles) {
        identityScore += 4;
        reasons.push(`holds both defunct roles (+4)`);
        if (accountAgeHours != null && accountAgeHours < 24 * 21) {
            identityScore += 3;
            reasons.push(`both defunct roles + new account (+3)`);
        }
    }

    // ---------- behavior score ----------
    let behaviorScore = 0;

    if (imageChannels5m >= 2) {
        const pts = 3 * imageChannels5m;
        behaviorScore += pts;
        reasons.push(`images across ${imageChannels5m} channels (+${pts})`);
    }

    if (primaryHoneypotHits5m > 0) {
        const pts = 4 * primaryHoneypotHits5m;
        behaviorScore += pts;
        reasons.push(`${primaryHoneypotHits5m} primary honeypot(s) (+${pts})`);
    }

    if (bothSecondaryHoneypots) {
        behaviorScore += 4;
        reasons.push(`both secondary honeypots hit (+4)`);
    }

    if (voiceHoneypotHits5m > 0) {
        const pts = 2 * voiceHoneypotHits5m;
        behaviorScore += pts;
        reasons.push(`${voiceHoneypotHits5m} voice-text honeypot(s) (+${pts})`);
    }

    if (distinctChannels1m >= 4) {
        behaviorScore += 2;
        reasons.push(`burst: ${distinctChannels1m} channels in 1m (+2)`);
    }
    if (distinctChannels1m >= 6) {
        behaviorScore += 2;
        reasons.push(`burst: >= 6 channels in 1m (+2)`);
    }

    // ---------- decision ----------
    const total = identityScore + behaviorScore;
    const multiplier = membershipMultiplier(membershipHours);
    const effectiveMuteThreshold = muteThreshold * multiplier;

    const totalHoneypotHits =
        primaryHoneypotHits5m + (bothSecondaryHoneypots ? 2 : 0);

    // Hard signal required before ANY mute — protects a new user who merely
    // drops a couple of images in a couple of channels.
    const gate =
        totalHoneypotHits >= 1 ||
        imageChannels5m >= 3 ||
        (imageChannels5m >= 2 && distinctChannels1m >= 4);

    let action = "none";
    let warnSource = null;

    if (total >= effectiveMuteThreshold && gate) {
        action = "mute";
    } else if (identityScore >= identityWarnThreshold) {
        // Identity-driven warn: fires immediately (not racing a burst).
        action = "warn";
        warnSource = "identity";
    } else if (gate && total >= identityWarnThreshold) {
        // Behaviour-driven warn: requires a hard signal (honeypot / image burst)
        // so ordinary cross-posting never pings the owner. Debounced by the
        // orchestrator so a mute can supersede it.
        action = "warn";
        warnSource = "behavior";
    }

    return {
        identityScore,
        behaviorScore,
        total,
        multiplier,
        effectiveMuteThreshold,
        gate,
        action,
        warnSource,
        reasons,
    };
}

module.exports = {
    DISCORD_EPOCH,
    HOUR_MS,
    DAY_MS,
    snowflakeToTimestamp,
    membershipMultiplier,
    scoreMessage,
};
