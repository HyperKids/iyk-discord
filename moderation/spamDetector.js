/**
 * @description Spam-detection orchestrator. Turns live discord.js events into
 * scoring contexts, dispatches warn/mute actions, and manages the debounce +
 * dedupe state. All public handlers are fully wrapped in try/catch so a bug here
 * can never crash the host bot.
 *
 *   onMessage(message)              -> record + score + (warn|mute)
 *   onMemberUpdate(oldM, newM)      -> defunct-role-combo warn
 *
 * Warn vs mute timing:
 *   - identity-driven warns fire immediately (not racing a burst)
 *   - behaviour-driven warns are held for `warnDelayMs`; if the user escalates
 *     to a mute during that window the pending warn is cancelled (superseded)
 *   - a per-user "acted" tier + cooldown prevents duplicate actions from the
 *     6-messages-in-17s burst
 */

const { PermissionFlagsBits, MessageType } = require("discord.js");

const { config } = require("../logic/spamConfig");
const { scoreMessage, snowflakeToTimestamp } = require("../logic/spamScore");
const tracker = require("../logic/spamTracker");
const spamActions = require("./spamActions");

const ONE_MIN = 60000;
const FIVE_MIN = 300000;
const DELETE_WINDOW_MS = 120000; // only delete the last ~2 min of messages

// userId -> setTimeout handle for a not-yet-fired behaviour warn
const pendingWarns = new Map();
// userId -> { tier: "warn"|"mute", until: number }
const acted = new Map();

function scoreOpts() {
    return {
        identityWarnThreshold: config.identityWarnThreshold,
        muteThreshold: config.muteThreshold,
        defunctRoleSignalEnabled: config.defunctRoleSignalEnabled,
    };
}

function honeypotSets() {
    return {
        primary: config.primaryHoneypots,
        secondary: config.secondaryHoneypots,
        voice: config.voiceHoneypots,
    };
}

/** Current action tier for a user, or null if none/expired. */
function actedTier(userId, now) {
    const a = acted.get(userId);
    if (!a || a.until <= now) {
        acted.delete(userId);
        return null;
    }
    return a.tier;
}

function setActed(userId, tier, now) {
    acted.set(userId, { tier, until: now + config.actionCooldownMs });
}

function cancelPendingWarn(userId) {
    const t = pendingWarns.get(userId);
    if (t) {
        clearTimeout(t);
        pendingWarns.delete(userId);
    }
}

function isStaff(member) {
    try {
        return (
            member.permissions.has(PermissionFlagsBits.ManageMessages) ||
            member.permissions.has(PermissionFlagsBits.Administrator) ||
            member.permissions.has(PermissionFlagsBits.ModerateMembers)
        );
    } catch (err) {
        return false;
    }
}

function messageHasImage(message) {
    const atts = message.attachments;
    if (atts && typeof atts.values === "function") {
        for (const att of atts.values()) {
            const ct = att.contentType;
            if (ct && ct.startsWith("image/")) return true;
            const name = (att.name || att.url || "").toLowerCase();
            if (/\.(png|jpe?g|gif|webp|bmp|tiff?)(\?|$)/.test(name)) return true;
        }
    }
    for (const emb of message.embeds || []) {
        if (emb.image || emb.thumbnail) return true;
    }
    return false;
}

/** Build the pure scoring context from a user + (maybe null) member. */
function buildContext(user, member, now, forceBothDefunct) {
    const userId = user.id;
    const accountCreatedMs =
        user.createdTimestamp != null
            ? user.createdTimestamp
            : snowflakeToTimestamp(user.id);
    const joinedAtMs =
        member && member.joinedTimestamp != null
            ? member.joinedTimestamp
            : null;

    let hasBothDefunctRoles = false;
    if (forceBothDefunct != null) {
        hasBothDefunctRoles = forceBothDefunct;
    } else if (member && config.defunctRoleAId && config.defunctRoleBId) {
        hasBothDefunctRoles =
            member.roles.cache.has(config.defunctRoleAId) &&
            member.roles.cache.has(config.defunctRoleBId);
    }

    const hp = tracker.honeypotStats(
        userId,
        config.windowMaxMs,
        now,
        honeypotSets()
    );

    return {
        now,
        accountCreatedMs,
        joinedAtMs,
        hasBothDefunctRoles,
        imageChannels5m: tracker.imageChannels(userId, FIVE_MIN, now),
        distinctChannels1m: tracker.distinctChannels(userId, ONE_MIN, now),
        primaryHoneypotHits5m: hp.primaryHits,
        bothSecondaryHoneypots: hp.bothSecondary,
        voiceHoneypotHits5m: hp.voiceHits,
    };
}

/** Immediate warn (identity-driven or excluded-user path), deduped. */
async function doWarn(client, member, result) {
    const userId = member.id;
    const now = Date.now();
    if (actedTier(userId, now)) return; // already warned/muted recently
    setActed(userId, "warn", now);
    cancelPendingWarn(userId);
    await spamActions.warn(client, member, result);
}

/** Destructive mute, deduped; supersedes any pending behaviour warn. */
async function doMute(client, member, result) {
    const userId = member.id;
    const now = Date.now();
    if (actedTier(userId, now) === "mute") return; // already muted recently
    setActed(userId, "mute", now);
    cancelPendingWarn(userId);
    const offending = tracker.offendingEvents(userId, DELETE_WINDOW_MS, now);
    await spamActions.mute(client, member, result, offending);
}

/**
 * Hold a message-triggered warn for `warnDelayMs`; a mute during the delay
 * cancels it (so the owner never gets a warn ping seconds before a mute ping for
 * the same burst). Used for BOTH identity- and behaviour-driven warns that
 * originate from a message — only member-update warns fire immediately.
 */
function scheduleWarn(client, member, result) {
    const userId = member.id;
    if (actedTier(userId, Date.now())) return;
    if (pendingWarns.has(userId)) return; // already scheduled this burst
    const timer = setTimeout(async () => {
        pendingWarns.delete(userId);
        try {
            const now2 = Date.now();
            if (actedTier(userId, now2)) return; // muted/warned in the meantime
            setActed(userId, "warn", now2);
            await spamActions.warn(client, member, result);
        } catch (err) {
            console.error(`[spam] delayed warn failed: ${err}`);
        }
    }, config.warnDelayMs);
    if (typeof timer.unref === "function") timer.unref();
    pendingWarns.set(userId, timer);
}

/**
 * @description messageCreate handler.
 */
async function onMessage(message) {
    if (!config.detectionEnabled) return;
    try {
        // --- guards ---
        if (!message.guild) return; // DMs
        if (message.author?.bot || message.webhookId) return;
        if (message.system) return;
        if (
            message.type !== MessageType.Default &&
            message.type !== MessageType.Reply
        )
            return;

        // --- resolve member ---
        let member = message.member;
        if (!member) {
            try {
                member = await message.guild.members.fetch(message.author.id);
            } catch (err) {
                member = null;
            }
        }

        const excluded =
            member && config.excludedRoleId
                ? member.roles.cache.has(config.excludedRoleId)
                : false;

        // Staff are trusted and skipped entirely (not even tracked).
        if (member && !excluded && isStaff(member)) return;

        // --- record the event ---
        tracker.record(
            message.author.id,
            {
                channelId: message.channelId,
                messageId: message.id,
                timestamp: message.createdTimestamp,
                hasImage: messageHasImage(message),
                isVoiceText:
                    typeof message.channel?.isVoiceBased === "function"
                        ? message.channel.isVoiceBased()
                        : false,
            },
            message.createdTimestamp
        );

        // --- score ---
        const now = Date.now();
        const result = scoreMessage(
            buildContext(message.author, member, now),
            scoreOpts()
        );

        if (result.action === "none") return;

        // We need a member object to take any action (mention/timeout).
        if (!member) return;

        // Excluded (hand-verified) users: warn-only, never mute/delete.
        if (excluded) {
            await doWarn(message.client, member, result);
            return;
        }

        if (result.action === "mute") {
            await doMute(message.client, member, result);
        } else {
            // Both identity- and behaviour-driven message warns are debounced so
            // an escalation to mute within the delay supersedes them.
            scheduleWarn(message.client, member, result);
        }
    } catch (err) {
        console.error(`[spam] onMessage error: ${err}\n${err.stack || err}`);
    }
}

/**
 * @description guildMemberUpdate handler — fires a warn when a member newly
 * holds BOTH defunct roles (a strong plant signal, especially on a new account).
 * Never mutes off a role grant. Toggleable via DEFUNCT_ROLE_SIGNAL_ENABLED.
 */
async function onMemberUpdate(oldMember, newMember) {
    if (!config.detectionEnabled) return;
    if (!config.defunctRoleSignalEnabled) return;
    try {
        if (!config.defunctRoleAId || !config.defunctRoleBId) return;

        const member = newMember;
        if (
            config.excludedRoleId &&
            member.roles.cache.has(config.excludedRoleId)
        )
            return;
        if (isStaff(member)) return;

        const hasBoth =
            member.roles.cache.has(config.defunctRoleAId) &&
            member.roles.cache.has(config.defunctRoleBId);
        if (!hasBoth) return;

        // Only fire on the transition into "has both" (best-effort if oldMember
        // is partial — the acted-cooldown suppresses repeats).
        const hadBoth =
            oldMember &&
            oldMember.roles &&
            oldMember.roles.cache &&
            oldMember.roles.cache.has(config.defunctRoleAId) &&
            oldMember.roles.cache.has(config.defunctRoleBId);
        if (hadBoth) return;

        const now = Date.now();
        const result = scoreMessage(
            buildContext(member.user, member, now, true),
            scoreOpts()
        );

        // A role grant alone never mutes; always warn-level.
        if (result.action === "warn" || result.action === "mute") {
            await doWarn(member.client, member, result);
        }
    } catch (err) {
        console.error(`[spam] onMemberUpdate error: ${err}\n${err.stack || err}`);
    }
}

/** Start the periodic memory-bounding sweep. Call once at startup. */
function startSweeper() {
    const interval = setInterval(() => {
        try {
            tracker.pruneAll();
        } catch (err) {
            console.error(`[spam] prune sweep failed: ${err}`);
        }
    }, 60000);
    if (typeof interval.unref === "function") interval.unref();
    return interval;
}

module.exports = {
    onMessage,
    onMemberUpdate,
    startSweeper,
    // exported for tests
    _internals: { messageHasImage, buildContext, isStaff, acted, pendingWarns },
};
